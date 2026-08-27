/**
 * Developer-only greedy heightfield mesher.
 *
 * Merges runs of equal-height cells into single quads so that shrinking the
 * cell size does not multiply triangle count proportionally. Emits flat-shaded
 * vertex colours; the lab compares silhouette and stepping, not texturing.
 */
import * as THREE from 'three';
import { MATERIAL_COLORS, type SurfaceMaterial, type Tile } from './TerrainField';

export interface MeshStats {
  triangles: number;
  vertices: number;
  /** Quads before greedy merging, for measuring merge effectiveness. */
  rawQuads: number;
  mergedQuads: number;
}

export interface SurfaceMesh {
  geometry: THREE.BufferGeometry;
  stats: MeshStats;
}

const SUN = new THREE.Vector3(0.42, 0.84, 0.34).normalize();

/**
 * Growable typed-array writer.
 *
 * The mesher emits a few million floats per tile at 0.25, and pushing those
 * onto plain arrays one element at a time dominated meshing cost. Writing
 * straight into a Float32Array that doubles on demand keeps the same output
 * without the per-element boxing.
 */
class FloatSink {
  data: Float32Array;
  length = 0;
  constructor(capacity: number) {
    this.data = new Float32Array(Math.max(16, capacity));
  }
  private grow(needed: number): void {
    let cap = this.data.length;
    while (cap < needed) cap *= 2;
    const next = new Float32Array(cap);
    next.set(this.data.subarray(0, this.length));
    this.data = next;
  }
  push3(a: number, b: number, c: number): void {
    if (this.length + 3 > this.data.length) this.grow(this.length + 3);
    const d = this.data;
    d[this.length++] = a;
    d[this.length++] = b;
    d[this.length++] = c;
  }
  view(): Float32Array {
    return this.data.subarray(0, this.length);
  }
}

class IndexSink {
  data: Uint32Array;
  length = 0;
  constructor(capacity: number) {
    this.data = new Uint32Array(Math.max(16, capacity));
  }
  private grow(needed: number): void {
    let cap = this.data.length;
    while (cap < needed) cap *= 2;
    const next = new Uint32Array(cap);
    next.set(this.data.subarray(0, this.length));
    this.data = next;
  }
  pushQuad(v: number): void {
    if (this.length + 6 > this.data.length) this.grow(this.length + 6);
    const d = this.data;
    d[this.length++] = v;
    d[this.length++] = v + 1;
    d[this.length++] = v + 2;
    d[this.length++] = v;
    d[this.length++] = v + 2;
    d[this.length++] = v + 3;
  }
  view(): Uint32Array {
    return this.data.subarray(0, this.length);
  }
}

export function meshTile(tile: Tile): SurfaceMesh {
  const { heights, materials, n, cell, x0, z0 } = tile;

  // A flat tile is one merged quad; a maximally stepped one approaches three
  // quads per cell. Starting near the low end and doubling costs one or two
  // copies on rough terrain and none on smooth.
  const guess = Math.max(64, n * n) * 2;
  const pos = new FloatSink(guess * 3);
  const col = new FloatSink(guess * 3);
  const idx = new IndexSink(guess);
  let vert = 0;
  let mergedQuads = 0;

  const shade = (nx: number, ny: number, nz: number): number => {
    const d = nx * SUN.x + ny * SUN.y + nz * SUN.z;
    return 0.55 + Math.max(0, d) * 0.45;
  };

  const pushQuad = (
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    dx: number, dy: number, dz: number,
    mat: SurfaceMaterial,
    nx: number,
    ny: number,
    nz: number,
  ): void => {
    const [r, g, bl] = MATERIAL_COLORS[mat];
    const s = shade(nx, ny, nz);
    const cr = r * s;
    const cg = g * s;
    const cb = bl * s;
    pos.push3(ax, ay, az);
    col.push3(cr, cg, cb);
    pos.push3(bx, by, bz);
    col.push3(cr, cg, cb);
    pos.push3(cx, cy, cz);
    col.push3(cr, cg, cb);
    pos.push3(dx, dy, dz);
    col.push3(cr, cg, cb);
    idx.pushQuad(vert);
    vert += 4;
    mergedQuads++;
  };

  // --- Top faces, greedy-merged into rectangles of equal height+material ---
  const used = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const start = j * n + i;
      if (used[start]) continue;
      const h = heights[start]!;
      const m = materials[start]! as SurfaceMaterial;

      let w = 1;
      while (i + w < n) {
        const k = j * n + i + w;
        if (used[k] || heights[k] !== h || materials[k] !== m) break;
        w++;
      }

      let d = 1;
      outer: while (j + d < n) {
        for (let k = 0; k < w; k++) {
          const t = (j + d) * n + i + k;
          if (used[t] || heights[t] !== h || materials[t] !== m) break outer;
        }
        d++;
      }

      for (let dz = 0; dz < d; dz++) {
        for (let dx = 0; dx < w; dx++) used[(j + dz) * n + i + dx] = 1;
      }

      const px = x0 + i * cell;
      const pz = z0 + j * cell;
      const pw = w * cell;
      const pd = d * cell;
      pushQuad(
        px, h, pz,
        px, h, pz + pd,
        px + pw, h, pz + pd,
        px + pw, h, pz,
        m, 0, 1, 0,
      );
    }
  }

  // --- Vertical skirts between neighbouring cells of differing height ---
  // Without these the surface would show through wherever it steps.
  let rawQuads = n * n;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const h = heights[j * n + i]!;
      const m = materials[j * n + i]! as SurfaceMaterial;
      const px = x0 + i * cell;
      const pz = z0 + j * cell;

      if (i + 1 < n) {
        const hn = heights[j * n + i + 1]!;
        if (hn < h) {
          rawQuads++;
          pushQuad(
            px + cell, h, pz,
            px + cell, hn, pz,
            px + cell, hn, pz + cell,
            px + cell, h, pz + cell,
            m, 1, 0, 0,
          );
        } else if (hn > h) {
          rawQuads++;
          const mn = materials[j * n + i + 1]! as SurfaceMaterial;
          pushQuad(
            px + cell, hn, pz,
            px + cell, h, pz,
            px + cell, h, pz + cell,
            px + cell, hn, pz + cell,
            mn, -1, 0, 0,
          );
        }
      }

      if (j + 1 < n) {
        const hn = heights[(j + 1) * n + i]!;
        if (hn < h) {
          rawQuads++;
          pushQuad(
            px, h, pz + cell,
            px, hn, pz + cell,
            px + cell, hn, pz + cell,
            px + cell, h, pz + cell,
            m, 0, 0, 1,
          );
        } else if (hn > h) {
          rawQuads++;
          const mn = materials[(j + 1) * n + i]! as SurfaceMaterial;
          pushQuad(
            px, hn, pz + cell,
            px, h, pz + cell,
            px + cell, h, pz + cell,
            px + cell, hn, pz + cell,
            mn, 0, 0, -1,
          );
        }
      }
    }
  }

  // --- Boundary apron ---
  // A tile cannot see its neighbour's heights, and neighbours at a different
  // LOD step quantize to different heights anyway, so the shared edge would
  // otherwise show a hairline crack straight through to the sky. Every tile
  // hangs a short curtain off its +x and +z edges; each boundary is always one
  // tile's +edge, so the whole seam is covered.
  const APRON = 2;
  for (let j = 0; j < n; j++) {
    const i = n - 1;
    const h = heights[j * n + i]!;
    const m = materials[j * n + i]! as SurfaceMaterial;
    const px = x0 + (i + 1) * cell;
    const pz = z0 + j * cell;
    pushQuad(
      px, h, pz,
      px, h - APRON, pz,
      px, h - APRON, pz + cell,
      px, h, pz + cell,
      m, 1, 0, 0,
    );
  }
  for (let i = 0; i < n; i++) {
    const j = n - 1;
    const h = heights[j * n + i]!;
    const m = materials[j * n + i]! as SurfaceMaterial;
    const px = x0 + i * cell;
    const pz = z0 + (j + 1) * cell;
    pushQuad(
      px, h, pz,
      px, h - APRON, pz,
      px + cell, h - APRON, pz,
      px + cell, h, pz,
      m, 0, 0, 1,
    );
  }

  const geometry = new THREE.BufferGeometry();
  // Copied out of the sinks so the geometry does not retain the oversized
  // backing buffers the doubling strategy leaves behind.
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos.view()), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col.view()), 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(idx.view()), 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  return {
    geometry,
    stats: {
      triangles: idx.length / 3,
      vertices: vert,
      rawQuads,
      mergedQuads,
    },
  };
}

