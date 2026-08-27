/**
 * One independently-rendered terrain view for the resolution lab.
 *
 * Each view owns a canvas, renderer and scene so two resolutions can be shown
 * side by side or overlaid without fighting over a single GL context.
 * Developer tooling only.
 */
import * as THREE from 'three';
import { TerrainField, cellsPerBlock, type TerrainResolution } from './TerrainField';
import { meshTile } from './SurfaceMesher';
import type { TerrainCache } from './TerrainCache';
import { yieldToBrowser } from './scheduler';
import { PreviewSky } from './PreviewSky';
import {
  EMPTY_VEGETATION,
  buildVegetation,
  disposeVegetation,
  type VegetationMetrics,
} from './VegetationView';
import type { VegetationBands } from './previewQuality';
import type { VytheraWorldStyle } from '../style/WorldStyle';

export interface ViewMetrics {
  resolution: TerrainResolution;
  cellsPerBlockAxis: number;
  cellsPerBlockVol: number;
  terrainCells: number;
  triangles: number;
  vertices: number;
  quadsBefore: number;
  quadsAfter: number;
  genMs: number;
  meshMs: number;
  /** Time for 10k ground-height collision queries against the field. */
  collisionMs: number;
  collisionQueries: number;
  heightfieldBytes: number;
  geometryBytes: number;
  tiles: number;
  drawCalls: number;
}

const TILE_BLOCKS = 32;

export interface BuildOptions {
  /** Tiles further than this from the eye are skipped entirely. */
  radius?: number;
  /** Distance over which one LOD step of coarsening is applied. */
  lodFalloff?: number;
  /**
   * Floor on cell size. The progressive first pass sets this to roughly one
   * block so a whole landscape appears immediately, then the real pass runs
   * with no floor and replaces it.
   */
  minCell?: number;
  cache?: TerrainCache | null;
  /** Resolution-lab benchmark only; off in the editor. */
  measureCollisionCost?: boolean;
}

export class TerrainView {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly sky: PreviewSky;
  private group = new THREE.Group();
  private vegGroup: THREE.Group | null = null;
  private waterMesh: THREE.Mesh | null = null;
  // Lambert rather than unlit: the preview has a real sun, so time of day and
  // weather actually shade the land.
  // Double-sided: skirt quads are emitted from whichever cell owns the step, so
  // their winding is not consistently outward and culling would punch holes.
  private material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  metrics: ViewMetrics | null = null;
  vegetationMetrics: VegetationMetrics = EMPTY_VEGETATION;

  constructor(className: string) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = className;
    // preserveDrawingBuffer lets the editor grab a style thumbnail from the
    // live preview instead of re-rendering the scene offscreen.
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.scene.add(this.group);
    this.sky = new PreviewSky(this.scene);
  }

  /** Apply a style's sky, lighting and weather. Never touches terrain. */
  applyAtmosphere(style: VytheraWorldStyle): void {
    this.sky.apply(style);
  }

  /** Advance sky animation. */
  tick(dt: number, eye: THREE.Vector3): void {
    this.sky.update(dt, eye);
  }

  /**
   * Rebuild only the vegetation layer, leaving terrain geometry in place.
   * This is what makes a plant-density edit cheap.
   */
  async rebuildVegetation(
    field: TerrainField,
    origin: { x: number; z: number },
    regionBlocks: number,
    anchor: THREE.Vector3,
    onProgress: (done: number, total: number) => void,
    token: { cancelled: boolean } = { cancelled: false },
    bands?: VegetationBands,
    budget = 1,
  ): Promise<VegetationMetrics | null> {
    const result = await buildVegetation(
      field,
      origin,
      regionBlocks,
      anchor,
      onProgress,
      token,
      bands,
      budget,
    );
    if (!result || token.cancelled) return null;
    this.clearVegetation();
    this.vegGroup = result.group;
    this.scene.add(result.group);
    this.vegetationMetrics = result.metrics;
    return result.metrics;
  }

  private clearVegetation(): void {
    if (!this.vegGroup) return;
    this.scene.remove(this.vegGroup);
    disposeVegetation(this.vegGroup);
    this.vegGroup = null;
    this.vegetationMetrics = EMPTY_VEGETATION;
  }

  setSize(w: number, h: number): void {
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.setSize(Math.max(1, w), Math.max(1, h), false);
  }

  render(camera: THREE.Camera): void {
    this.renderer.render(this.scene, camera);
  }

  private clear(): void {
    disposeGroup(this.group);
  }

  /**
   * Rebuild at a resolution, yielding on a time budget so the caller can paint
   * real progress instead of freezing the tab.
   */
  async build(
    field: TerrainField,
    origin: { x: number; z: number },
    regionBlocks: number,
    r: TerrainResolution,
    anchor: THREE.Vector3,
    onProgress: (done: number, total: number) => void,
    /** Set cancelled to abandon an obsolete build between tile batches. */
    token: { cancelled: boolean } = { cancelled: false },
    options: BuildOptions = {},
  ): Promise<ViewMetrics | null> {
    const radius = options.radius ?? 1000;
    const falloff = options.lodFalloff ?? 900;
    const minCell = options.minCell ?? 0;
    const cache = options.cache ?? null;

    // Assembled off to the side and swapped in at the end. Clearing first would
    // blank the preview for the whole build, which also defeats the coarse pass
    // of a progressive rebuild: its job is to stay on screen while the detailed
    // pass is still working.
    const next = new THREE.Group();

    // Selection and LOD are anchored to the view preset's eye, never the live
    // camera: the tile set for a given view is then identical across
    // resolutions and rebuilds, so only voxel size varies between runs.
    const tilesPerAxis = regionBlocks / TILE_BLOCKS;
    const queue: { x0: number; z0: number }[] = [];
    for (let tz = 0; tz < tilesPerAxis; tz++) {
      for (let tx = 0; tx < tilesPerAxis; tx++) {
        const x0 = origin.x + tx * TILE_BLOCKS;
        const z0 = origin.z + tz * TILE_BLOCKS;
        const cx = x0 + TILE_BLOCKS / 2;
        const cz = z0 + TILE_BLOCKS / 2;
        if (Math.hypot(cx - anchor.x, cz - anchor.z) > radius) continue;
        queue.push({ x0, z0 });
      }
    }
    queue.sort(
      (a, b) =>
        Math.hypot(a.x0 - anchor.x, a.z0 - anchor.z) -
        Math.hypot(b.x0 - anchor.x, b.z0 - anchor.z),
    );

    let genMs = 0;
    let meshMs = 0;
    let cells = 0;
    let triangles = 0;
    let vertices = 0;
    let quadsBefore = 0;
    let quadsAfter = 0;
    let hfBytes = 0;
    let geoBytes = 0;

    // Yield on elapsed time rather than a fixed tile count: a coarse pass gets
    // through many tiles per slice while a 0.125 pass yields after one, and
    // both keep the frame budget the interface needs to stay responsive.
    const SLICE_MS = 12;
    let sliceStart = performance.now();
    let lastPaint = performance.now();

    for (let i = 0; i < queue.length; i++) {
      const { x0, z0 } = queue[i]!;
      const step = lodFor(x0 + TILE_BLOCKS / 2, z0 + TILE_BLOCKS / 2, anchor, r, falloff, minCell);

      const t0 = performance.now();
      let tile = cache?.get(x0, z0, step) ?? null;
      if (!tile) {
        tile = field.buildTile(x0, z0, TILE_BLOCKS, r, step);
        cache?.put(x0, z0, step, tile);
      }
      const t1 = performance.now();
      // meshTile already computes normals for the geometry it returns.
      const { geometry, stats } = meshTile(tile);
      const t2 = performance.now();

      genMs += t1 - t0;
      meshMs += t2 - t1;
      cells += tile.n * tile.n;
      hfBytes += tile.heights.byteLength + tile.materials.byteLength;
      triangles += stats.triangles;
      vertices += stats.vertices;
      quadsBefore += stats.rawQuads;
      quadsAfter += stats.mergedQuads;
      for (const name of ['position', 'color']) {
        const attr = geometry.getAttribute(name) as THREE.BufferAttribute | undefined;
        if (attr) geoBytes += attr.array.byteLength;
      }
      const index = geometry.getIndex();
      if (index) geoBytes += index.array.byteLength;

      next.add(new THREE.Mesh(geometry, this.material));

      if (performance.now() - sliceStart >= SLICE_MS || i === queue.length - 1) {
        onProgress(i + 1, queue.length);
        lastPaint = await yieldToBrowser(lastPaint);
        if (token.cancelled) {
          // Only the abandoned work is thrown away; whatever is on screen
          // stays there.
          disposeGroup(next);
          return null;
        }
        sliceStart = performance.now();
      }
    }

    this.clear();
    this.scene.remove(this.group);
    this.group = next;
    this.scene.add(this.group);

    this.setSeaLevel(origin, regionBlocks, field.seaLevel);

    // The collision probe is a resolution-lab benchmark, not something the
    // editor needs. It costs 10k height queries per rebuild, so it stays off
    // unless a caller explicitly asks to measure it.
    const { collisionMs, collisionQueries } = options.measureCollisionCost
      ? measureCollision(field, origin, regionBlocks)
      : { collisionMs: 0, collisionQueries: 0 };

    this.metrics = {
      resolution: r,
      cellsPerBlockAxis: cellsPerBlock(r),
      cellsPerBlockVol: cellsPerBlock(r) ** 3,
      terrainCells: cells,
      triangles,
      vertices,
      quadsBefore,
      quadsAfter,
      genMs,
      meshMs,
      collisionMs,
      collisionQueries,
      heightfieldBytes: hfBytes,
      geometryBytes: geoBytes,
      tiles: queue.length,
      drawCalls: 0,
    };
    return this.metrics;
  }

  /**
   * Sea plane at the style's sea level. Kept outside the tile group so moving
   * sea level alone does not require remeshing terrain.
   */
  setSeaLevel(origin: { x: number; z: number }, regionBlocks: number, seaLevel: number): void {
    if (!this.waterMesh) {
      const geo = new THREE.PlaneGeometry(regionBlocks * 3, regionBlocks * 3);
      geo.rotateX(-Math.PI / 2);
      this.waterMesh = new THREE.Mesh(
        geo,
        new THREE.MeshLambertMaterial({
          color: 0x2f7f92,
          transparent: true,
          opacity: 0.82,
        }),
      );
      this.scene.add(this.waterMesh);
    }
    this.waterMesh.position.set(
      origin.x + regionBlocks / 2,
      seaLevel,
      origin.z + regionBlocks / 2,
    );
  }

  dispose(): void {
    this.clear();
    this.clearVegetation();
    this.sky.dispose();
    this.material.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }
}

/** Release the geometry a terrain group owns. Materials are shared, so stay. */
function disposeGroup(group: THREE.Group): void {
  for (const child of [...group.children]) {
    group.remove(child);
    (child as THREE.Mesh).geometry?.dispose();
  }
}

/**
 * Distance-proportional LOD. Never coarser than the selected resolution in the
 * near field, so each resolution stays visually distinct where it matters.
 *
 * `falloff` is the distance over which one doubling of cell size is earned; a
 * smaller value sheds detail sooner and is the main terrain cost lever the
 * quality levels pull. `minCell` floors the cell size for the coarse pass of a
 * progressive build.
 */
export function lodFor(
  cx: number,
  cz: number,
  eye: THREE.Vector3,
  r: TerrainResolution,
  falloff = 900,
  minCell = 0,
): number {
  const d = Math.hypot(cx - eye.x, cz - eye.z);
  const targetCell = Math.max(r, minCell, d / Math.max(1, falloff));
  return 2 ** Math.floor(Math.log2(Math.max(1, targetCell / r)));
}

/**
 * Real collision cost proxy: ground-height queries are what a heightfield
 * collider actually does per moving body per step.
 */
function measureCollision(
  field: TerrainField,
  origin: { x: number; z: number },
  regionBlocks: number,
): { collisionMs: number; collisionQueries: number } {
  const queries = 10000;
  const t0 = performance.now();
  let acc = 0;
  for (let i = 0; i < queries; i++) {
    const x = origin.x + ((i * 37) % regionBlocks) + 0.5;
    const z = origin.z + ((i * 61) % regionBlocks) + 0.5;
    acc += field.heightAt(x, z);
  }
  const ms = performance.now() - t0;
  // Keep the accumulator observable so the loop cannot be optimised away.
  if (!Number.isFinite(acc)) throw new Error('collision probe failed');
  return { collisionMs: ms, collisionQueries: queries };
}

