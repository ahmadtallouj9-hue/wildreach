import * as THREE from 'three';
import { Block, CHUNK_HEIGHT, CHUNK_SIZE, isOpaque } from './blocks';
import { faceTexture, tileUv } from '../render/TextureAtlas';

type V3 = [number, number, number];
export type NeighborLookup = (x: number, y: number, z: number) => number;
export type LightLookup = (x: number, y: number, z: number) => number;
export type FluidLevelLookup = (x: number, y: number, z: number) => number;

const FACES: { dir: V3; corners: V3[]; shade: number }[] = [
  { dir: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1 },
  { dir: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.72 },
  { dir: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: 0.92 },
  { dir: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], shade: 0.9 },
  { dir: [1, 0, 0], corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], shade: 0.94 },
  { dir: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], shade: 0.9 },
];

function countWaterDepth(voxels: Uint8Array, x: number, y: number, z: number): number {
  let depth = 0;
  for (let yy = y; yy >= 0; yy--) {
    if (voxels[x + z * CHUNK_SIZE + yy * CHUNK_SIZE * CHUNK_SIZE] !== Block.Water) break;
    depth++;
  }
  return depth;
}

class MeshBuf {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  ao: number[] = [];
  light: number[] = [];
  wind: number[] = [];
  idx: number[] = [];
  v = 0;

  addFace(
    ox: number,
    oy: number,
    oz: number,
    faceIndex: number,
    block: number,
    _getBlock: NeighborLookup,
    getLight: LightLookup,
    waterDepth = 0,
    spanU = 1,
    spanV = 1,
  ): void {
    const face = FACES[faceIndex]!;
    const { u0, v0, u1, v1 } = tileUv(faceTexture(block, faceIndex));
    const wind = block === Block.Leaves ? 1 : 0;
    const lit =
      block === Block.Water
        ? Math.min(1, 0.4 + waterDepth / 18)
        : block === Block.Lava
          ? 1
          : Math.max(0.28, (getLight(ox + face.dir[0], oy + face.dir[1], oz + face.dir[2]) / 15) * 0.72 + face.shade * 0.32);

    const stretch = (c: V3): V3 => {
      const out: V3 = [c[0], c[1], c[2]];
      if (face.dir[1] !== 0) {
        if (c[0] === 1) out[0] = spanU;
        if (c[2] === 1) out[2] = spanV;
      } else if (face.dir[2] !== 0) {
        if (c[0] === 1) out[0] = spanU;
        if (c[1] === 1) out[1] = spanV;
      } else {
        if (c[2] === 1) out[2] = spanU;
        if (c[1] === 1) out[1] = spanV;
      }
      return out;
    };

    const start = this.v;
    const aos: number[] = [];
    for (let i = 0; i < 4; i++) {
      const base = face.corners[i]!;
      const c = spanU === 1 && spanV === 1 ? base : stretch(base);
      let ao = face.shade;
      if (block === Block.Water) ao = Math.min(1, 0.12 + waterDepth / 16);
      aos.push(ao);
      const inset = block === Block.Water && faceIndex === 0 ? 0.12 : 0;
      this.pos.push(ox + c[0], oy + c[1] - inset, oz + c[2]);
      this.nrm.push(face.dir[0], face.dir[1], face.dir[2]);
      const uu = i === 0 || i === 3 ? 0 : 1;
      const vv = i <= 1 ? 0 : 1;
      this.uv.push(u0 + (u1 - u0) * uu, v0 + (v1 - v0) * vv);
      this.ao.push(ao);
      this.light.push(lit);
      this.wind.push(wind);
      this.v++;
    }
    if (aos[0]! + aos[2]! > aos[1]! + aos[3]!) {
      this.idx.push(start, start + 1, start + 2, start, start + 2, start + 3);
    } else {
      this.idx.push(start + 1, start + 2, start + 3, start + 1, start + 3, start);
    }
  }

  /** Minecraft-style crossed planes (not a full cube). */
  addTorch(ox: number, oy: number, oz: number, getLight: LightLookup): void {
    const { u0, v0, u1, v1 } = tileUv(faceTexture(Block.Torch, 2));
    const lit = Math.max(0.92, getLight(ox, oy, oz) / 15);
    const y0 = 0;
    const y1 = 0.7;
    const pad = 0.2;
    const mid = 0.5;

    const pushQuad = (corners: V3[], nx: number, ny: number, nz: number): void => {
      const start = this.v;
      for (let i = 0; i < 4; i++) {
        const p = corners[i]!;
        this.pos.push(ox + p[0], oy + p[1], oz + p[2]);
        this.nrm.push(nx, ny, nz);
        const uu = i === 0 || i === 3 ? 0 : 1;
        const vv = i <= 1 ? 0 : 1;
        this.uv.push(u0 + (u1 - u0) * uu, v0 + (v1 - v0) * vv);
        this.ao.push(1);
        this.light.push(lit);
        this.wind.push(0);
        this.v++;
      }
      this.idx.push(start, start + 1, start + 2, start, start + 2, start + 3);
    };

    pushQuad(
      [
        [pad, y0, mid],
        [1 - pad, y0, mid],
        [1 - pad, y1, mid],
        [pad, y1, mid],
      ],
      0,
      0,
      1,
    );
    pushQuad(
      [
        [mid, y0, pad],
        [mid, y0, 1 - pad],
        [mid, y1, 1 - pad],
        [mid, y1, pad],
      ],
      1,
      0,
      0,
    );
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

export interface ChunkMeshes {
  solid: THREE.BufferGeometry | null;
  cutout: THREE.BufferGeometry | null;
  water: THREE.BufferGeometry | null;
  lava: THREE.BufferGeometry | null;
}

function showFace(block: number, nb: number, transparent: boolean): boolean {
  if (nb === Block.Air) return true;
  if (transparent && nb !== block && !isOpaque(nb)) return true;
  if (!transparent && !isOpaque(nb) && nb !== block) return true;
  if (!transparent && (nb === Block.Water || nb === Block.Lava)) return true;
  return false;
}

function neighborAt(
  voxels: Uint8Array,
  x: number,
  y: number,
  z: number,
  dx: number,
  dy: number,
  dz: number,
  originX: number,
  originZ: number,
  getBlock: NeighborLookup,
): number {
  const nx = x + dx;
  const ny = y + dy;
  const nz = z + dz;
  if (nx >= 0 && nx < CHUNK_SIZE && nz >= 0 && nz < CHUNK_SIZE && ny >= 0 && ny < CHUNK_HEIGHT) {
    return voxels[nx + nz * CHUNK_SIZE + ny * CHUNK_SIZE * CHUNK_SIZE]!;
  }
  return getBlock(originX + nx, ny, originZ + nz);
}

/**
 * Per-block faces (no greedy merge) so atlas UVs never stretch into streaks.
 */
export function meshChunk(
  voxels: Uint8Array,
  originX: number,
  originZ: number,
  getBlock: NeighborLookup,
  getLight: LightLookup = () => 15,
  _fluidLevel: Uint8Array | null = null,
  _getFluidLevel?: FluidLevelLookup,
): ChunkMeshes {
  const solid = new MeshBuf();
  const cutout = new MeshBuf();
  const water = new MeshBuf();
  const lava = new MeshBuf();

  const nb = (x: number, y: number, z: number, dx: number, dy: number, dz: number) =>
    neighborAt(voxels, x, y, z, dx, dy, dz, originX, originZ, getBlock);

  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const block = voxels[x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE]!;
        if (!block || !isOpaque(block)) continue;
        const wx = originX + x;
        const wz = originZ + z;
        for (let fi = 0; fi < 6; fi++) {
          const face = FACES[fi]!;
          if (!showFace(block, nb(x, y, z, face.dir[0], face.dir[1], face.dir[2]), false)) continue;
          solid.addFace(wx, y, wz, fi, block, getBlock, getLight, 0, 1, 1);
        }
      }
    }
  }

  for (let z = 0; z < CHUNK_SIZE; z++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let y = 0; y < CHUNK_HEIGHT; y++) {
        const block = voxels[x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE]!;
        if (block === Block.Air || isOpaque(block)) continue;
        const wx = originX + x;
        const wz = originZ + z;

        if (block === Block.Torch) {
          cutout.addTorch(wx, y, wz, getLight);
          continue;
        }

        if (block === Block.Water || block === Block.Lava) {
          const buf = block === Block.Water ? water : lava;
          for (let fi = 0; fi < 6; fi++) {
            // Water: flat top surface only — no side walls
            if (block === Block.Water && fi !== 0) continue;
            const face = FACES[fi]!;
            const n = nb(x, y, z, face.dir[0], face.dir[1], face.dir[2]);
            if (block === Block.Water && n !== Block.Air) continue;
            if (block === Block.Lava && n === Block.Lava) continue;
            if (!showFace(block, n, true)) continue;
            const depth = block === Block.Water ? countWaterDepth(voxels, x, y, z) : 0;
            buf.addFace(wx, y, wz, fi, block, getBlock, getLight, depth);
          }
          continue;
        }

        // Other translucent (leaves, ice, crystal)
        for (let fi = 0; fi < 6; fi++) {
          const face = FACES[fi]!;
          const n = nb(x, y, z, face.dir[0], face.dir[1], face.dir[2]);
          if (!showFace(block, n, true)) continue;
          cutout.addFace(wx, y, wz, fi, block, getBlock, getLight, 0);
        }
      }
    }
  }

  return { solid: solid.build(), cutout: cutout.build(), water: water.build(), lava: lava.build() };
}
