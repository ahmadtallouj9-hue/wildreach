import * as THREE from 'three';
import { Block } from '../world/blocks';
import { LOCAL_GRID_SIZE } from './constants';
import { getActiveMaterialPalette } from './editorPalette';
import type { LocalVoxelGrid } from './LocalVoxelGrid';

type V3 = [number, number, number];

/** How atlas tiles map onto voxel faces. */
export type TexUvMode = 'projection' | 'per_voxel';

const FACES: { dir: V3; shade: number }[] = [
  { dir: [0, 1, 0], shade: 1 },
  { dir: [0, -1, 0], shade: 0.72 },
  { dir: [0, 0, 1], shade: 0.92 },
  { dir: [0, 0, -1], shade: 0.9 },
  { dir: [1, 0, 0], shade: 0.94 },
  { dir: [-1, 0, 0], shade: 0.9 },
];

function showFace(neighbor: number): boolean {
  return neighbor === Block.Air;
}

function materialUv(matId: number): { u0: number; v0: number; u1: number; v1: number } {
  const palette = getActiveMaterialPalette();
  if (palette) return palette.tileUv(matId);
  const tile = Math.max(0, matId - 1);
  const col = tile % 8;
  const row = Math.floor(tile / 8);
  const s = 1 / 8;
  return { u0: col * s, v0: 1 - (row + 1) * s, u1: (col + 1) * s, v1: 1 - row * s };
}

/**
 * Project a world-space vertex into 0–1 UV across the full local grid,
 * then remap into the material's atlas tile.
 */
function projectUv(
  wx: number,
  wy: number,
  wz: number,
  faceIndex: number,
  tile: { u0: number; v0: number; u1: number; v1: number },
): [number, number] {
  const S = LOCAL_GRID_SIZE;
  let gu = 0;
  let gv = 0;
  if (faceIndex <= 1) {
    // ±Y top/bottom: U→X, V→Z
    gu = wx / S;
    gv = wz / S;
  } else if (faceIndex <= 3) {
    // ±Z front/back: U→X, V→Y
    gu = wx / S;
    gv = wy / S;
  } else {
    // ±X sides: U→Z, V→Y
    gu = wz / S;
    gv = wy / S;
  }
  gu = Math.max(0, Math.min(1, gu));
  gv = Math.max(0, Math.min(1, gv));
  return [tile.u0 + (tile.u1 - tile.u0) * gu, tile.v0 + (tile.v1 - tile.v0) * gv];
}

class GreedyBuf {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  ao: number[] = [];
  light: number[] = [];
  wind: number[] = [];
  idx: number[] = [];
  v = 0;
  uvMode: TexUvMode = 'projection';

  addQuad(
    ox: number,
    oy: number,
    oz: number,
    faceIndex: number,
    matId: number,
    spanU: number,
    spanV: number,
    glow: boolean,
  ): void {
    const face = FACES[faceIndex]!;
    const tile = materialUv(matId);
    const baseLit = Math.max(0.55, face.shade * 0.85 + 0.15);
    const lit = glow ? Math.max(0.9, baseLit) : baseLit;

    const base = UNIT_FACE_CORNERS[faceIndex]!;
    const start = this.v;
    for (let i = 0; i < 4; i++) {
      const c = stretchCorner(base[i]!, faceIndex, spanU, spanV);
      const wx = ox + c[0];
      const wy = oy + c[1];
      const wz = oz + c[2];
      this.pos.push(wx, wy, wz);
      this.nrm.push(face.dir[0], face.dir[1], face.dir[2]);

      if (this.uvMode === 'projection') {
        const [u, v] = projectUv(wx, wy, wz, faceIndex, tile);
        this.uv.push(u, v);
      } else {
        const uu = i === 0 || i === 3 ? 0 : 1;
        const vv = i <= 1 ? 0 : 1;
        this.uv.push(tile.u0 + (tile.u1 - tile.u0) * uu, tile.v0 + (tile.v1 - tile.v0) * vv);
      }

      this.ao.push(face.shade);
      this.light.push(lit);
      this.wind.push(0);
      this.v++;
    }
    this.idx.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }

  build(): THREE.BufferGeometry | null {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('ao', new THREE.Float32BufferAttribute(this.ao, 1));
    g.setAttribute('light', new THREE.Float32BufferAttribute(this.light, 1));
    g.setAttribute('wind', new THREE.Float32BufferAttribute(this.wind, 1));
    g.setIndex(this.idx);
    return g;
  }
}

/** Unit cube face corners — face offset is always 0 or 1 (never span). */
const UNIT_FACE_CORNERS: V3[][] = [
  [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], // +Y
  [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], // -Y
  [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], // +Z
  [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], // -Z
  [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], // +X
  [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], // -X
];

function stretchCorner(base: V3, faceIndex: number, spanU: number, spanV: number): V3 {
  const out: V3 = [base[0], base[1], base[2]];
  if (spanU === 1 && spanV === 1) return out;
  if (faceIndex <= 1) {
    if (base[0] === 1) out[0] = spanU;
    if (base[2] === 1) out[2] = spanV;
  } else if (faceIndex <= 3) {
    if (base[0] === 1) out[0] = spanU;
    if (base[1] === 1) out[1] = spanV;
  } else {
    if (base[2] === 1) out[2] = spanU;
    if (base[1] === 1) out[1] = spanV;
  }
  return out;
}

interface SliceSpec {
  faceIndex: number;
  axis: 0 | 1 | 2;
}

const SLICES: SliceSpec[] = [
  { faceIndex: 0, axis: 1 },
  { faceIndex: 1, axis: 1 },
  { faceIndex: 2, axis: 2 },
  { faceIndex: 3, axis: 2 },
  { faceIndex: 4, axis: 0 },
  { faceIndex: 5, axis: 0 },
];

function setCoord(x: number, y: number, z: number, axis: 0 | 1 | 2, v: number): V3 {
  if (axis === 0) return [v, y, z];
  if (axis === 1) return [x, v, z];
  return [x, y, v];
}

function greedyPass(grid: LocalVoxelGrid, buf: GreedyBuf): void {
  const S = LOCAL_GRID_SIZE;
  const get = (x: number, y: number, z: number) => grid.get(x, y, z);

  for (const { faceIndex, axis } of SLICES) {
    const face = FACES[faceIndex]!;
    const mask = new Int32Array(S * S);

    for (let slice = 0; slice < S; slice++) {
      mask.fill(0);

      for (let v = 0; v < S; v++) {
        for (let u = 0; u < S; u++) {
          let bx = u;
          let by = v;
          let bz = slice;
          if (axis === 0) {
            bx = slice;
            bz = u;
            by = v;
          } else if (axis === 1) {
            by = slice;
            bz = v;
          } else {
            bz = slice;
            by = v;
          }

          const block = get(bx, by, bz);
          if (block === Block.Air) continue;

          const nx = bx + face.dir[0];
          const ny = by + face.dir[1];
          const nz = bz + face.dir[2];
          const neighbor = get(nx, ny, nz);
          if (!showFace(neighbor)) continue;

          const glow = grid.getEmissive(bx, by, bz);
          mask[u + v * S] = block | (glow ? 0x10000 : 0);
        }
      }

      for (let v = 0; v < S; v++) {
        for (let u = 0; u < S; ) {
          const maskVal = mask[u + v * S];
          const block = maskVal & 0xffff;
          if (!block) {
            u++;
            continue;
          }
          const glow = (maskVal & 0x10000) !== 0;

          let width = 1;
          while (
            u + width < S &&
            (mask[u + width + v * S] & 0xffff) === block &&
            ((mask[u + width + v * S] & 0x10000) !== 0) === glow
          ) {
            width++;
          }

          let height = 1;
          outer: while (v + height < S) {
            for (let k = 0; k < width; k++) {
              const mv = mask[u + k + (v + height) * S];
              if ((mv & 0xffff) !== block || ((mv & 0x10000) !== 0) !== glow) break outer;
            }
            height++;
          }

          for (let dv = 0; dv < height; dv++) {
            for (let du = 0; du < width; du++) {
              mask[u + du + (v + dv) * S] = 0;
            }
          }

          let ox = u;
          let oy = v;
          let oz = slice;
          if (axis === 0) {
            ox = slice;
            oz = u;
            oy = v;
          } else if (axis === 1) {
            oy = slice;
            oz = v;
          } else {
            oz = slice;
            oy = v;
          }

          const anchor = setCoord(ox, oy, oz, axis, slice);
          buf.addQuad(anchor[0], anchor[1], anchor[2], faceIndex, block, width, height, glow);
          u += width;
        }
      }
    }
  }
}

export interface LocalMeshResult {
  solid: THREE.BufferGeometry | null;
  cutout: THREE.BufferGeometry | null;
}

/** Greedy-meshed geometry for a local editor grid (custom materials = solid only). */
export function meshLocalGrid(
  grid: LocalVoxelGrid,
  uvMode: TexUvMode = 'projection',
): LocalMeshResult {
  const solid = new GreedyBuf();
  solid.uvMode = uvMode;
  greedyPass(grid, solid);
  return { solid: solid.build(), cutout: null };
}
