/**
 * One independently-rendered terrain view for the resolution lab.
 *
 * Each view owns a canvas, renderer and scene so two resolutions can be shown
 * side by side or overlaid without fighting over a single GL context.
 * Developer tooling only.
 */
import * as THREE from 'three';
import { TerrainField, cellsPerBlock, type TerrainResolution, type Tile } from './TerrainField';
import { meshTile } from './SurfaceMesher';

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

export class TerrainView {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  private group = new THREE.Group();
  // Double-sided: skirt quads are emitted from whichever cell owns the step, so
  // their winding is not consistently outward and culling would punch holes.
  private material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  metrics: ViewMetrics | null = null;

  constructor(className: string) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = className;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.scene.add(this.group);
    this.scene.fog = new THREE.Fog(0x9fc4e0, 220, 1000);
  }

  setSize(w: number, h: number): void {
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.setSize(Math.max(1, w), Math.max(1, h), false);
  }

  render(camera: THREE.Camera): void {
    this.renderer.render(this.scene, camera);
  }

  private clear(): void {
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
    }
  }

  /**
   * Rebuild at a resolution, yielding between tile batches so the caller can
   * paint real progress instead of freezing the tab.
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
  ): Promise<ViewMetrics | null> {
    this.clear();

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
        if (Math.hypot(cx - anchor.x, cz - anchor.z) > 1000) continue;
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

    for (let i = 0; i < queue.length; i++) {
      const { x0, z0 } = queue[i]!;
      const step = lodFor(x0 + TILE_BLOCKS / 2, z0 + TILE_BLOCKS / 2, anchor, r);

      const t0 = performance.now();
      const tile: Tile = field.buildTile(x0, z0, TILE_BLOCKS, r, step);
      const t1 = performance.now();
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

      this.group.add(new THREE.Mesh(geometry, this.material));

      if (i % 8 === 7 || i === queue.length - 1) {
        onProgress(i + 1, queue.length);
        await new Promise((res) => requestAnimationFrame(() => res(null)));
        if (token.cancelled) {
          this.clear();
          return null;
        }
      }
    }

    this.addWater(origin, regionBlocks, field.seaLevel);

    const { collisionMs, collisionQueries } = measureCollision(field, origin, regionBlocks);

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

  private addWater(
    origin: { x: number; z: number },
    regionBlocks: number,
    seaLevel: number,
  ): void {
    const geo = new THREE.PlaneGeometry(regionBlocks * 2, regionBlocks * 2);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ color: 0x2f7f92, transparent: true, opacity: 0.82 }),
    );
    mesh.position.set(origin.x + regionBlocks / 2, seaLevel, origin.z + regionBlocks / 2);
    this.group.add(mesh);
  }

  dispose(): void {
    this.clear();
    this.material.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }
}

/**
 * Distance-proportional LOD. Never coarser than the selected resolution in the
 * near field, so each resolution stays visually distinct where it matters.
 */
export function lodFor(
  cx: number,
  cz: number,
  eye: THREE.Vector3,
  r: TerrainResolution,
): number {
  const d = Math.hypot(cx - eye.x, cz - eye.z);
  const targetCell = Math.max(r, d / 900);
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

