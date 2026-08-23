import * as THREE from 'three';
import { Block, CHUNK_HEIGHT, CHUNK_SIZE, isOpaque } from './blocks';
import { faceTexture, tileUv } from '../render/TextureAtlas';

type V3 = [number, number, number];

/** CCW windings when viewed from outside (Three.js FrontSide). */
const FACES: { dir: V3; corners: V3[]; shade: number }[] = [
  {
    // +Y top
    dir: [0, 1, 0],
    corners: [
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
      [0, 1, 0],
    ],
    shade: 1,
  },
  {
    // -Y bottom
    dir: [0, -1, 0],
    corners: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
    shade: 0.55,
  },
  {
    // +Z
    dir: [0, 0, 1],
    corners: [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
    shade: 0.8,
  },
  {
    // -Z
    dir: [0, 0, -1],
    corners: [
      [1, 0, 0],
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
    ],
    shade: 0.75,
  },
  {
    // +X
    dir: [1, 0, 0],
    corners: [
      [1, 0, 1],
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
    ],
    shade: 0.88,
  },
  {
    // -X
    dir: [-1, 0, 0],
    corners: [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
    ],
    shade: 0.7,
  },
];

export type NeighborLookup = (x: number, y: number, z: number) => number;

function countWaterDepth(voxels: Uint8Array, x: number, y: number, z: number): number {
  let depth = 0;
  for (let yy = y; yy >= 0; yy--) {
    const b = voxels[x + z * CHUNK_SIZE + yy * CHUNK_SIZE * CHUNK_SIZE];
    if (b !== Block.Water) break;
    depth++;
  }
  return depth;
}

function isCutout(block: number): boolean {
  return block === Block.Leaves || block === Block.Crystal;
}

class MeshBuf {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  ao: number[] = [];
  idx: number[] = [];
  v = 0;

  addFace(
    ox: number,
    oy: number,
    oz: number,
    faceIndex: number,
    block: number,
    getBlock: NeighborLookup,
    waterDepth = 0,
  ): void {
    const face = FACES[faceIndex];
    const { u0, v0, u1, v1 } = tileUv(faceTexture(block, faceIndex));
    const start = this.v;

    for (let i = 0; i < 4; i++) {
      const c = face.corners[i];
      let sideA = false;
      let sideB = false;
      let corner = false;

      if (face.dir[1] !== 0) {
        const sx = c[0] === 0 ? -1 : 1;
        const sz = c[2] === 0 ? -1 : 1;
        sideA = isOpaque(getBlock(ox + sx, oy + face.dir[1], oz));
        sideB = isOpaque(getBlock(ox, oy + face.dir[1], oz + sz));
        corner = isOpaque(getBlock(ox + sx, oy + face.dir[1], oz + sz));
      } else if (face.dir[0] !== 0) {
        const sy = c[1] === 0 ? -1 : 1;
        const sz = c[2] === 0 ? -1 : 1;
        sideA = isOpaque(getBlock(ox + face.dir[0], oy + sy, oz));
        sideB = isOpaque(getBlock(ox + face.dir[0], oy, oz + sz));
        corner = isOpaque(getBlock(ox + face.dir[0], oy + sy, oz + sz));
      } else {
        const sx = c[0] === 0 ? -1 : 1;
        const sy = c[1] === 0 ? -1 : 1;
        sideA = isOpaque(getBlock(ox + sx, oy, oz + face.dir[2]));
        sideB = isOpaque(getBlock(ox, oy + sy, oz + face.dir[2]));
        corner = isOpaque(getBlock(ox + sx, oy + sy, oz + face.dir[2]));
      }

      let ao = sideA && sideB ? 0.5 : 1 - (Number(sideA) + Number(sideB) + Number(corner)) * 0.2;
      ao *= face.shade;
      if (block === Block.Water) {
        ao = Math.min(1, 0.12 + waterDepth / 16);
      }

      // Sink water tops so they read as a surface, not solid lids
      const inset = block === Block.Water && faceIndex === 0 ? 0.12 : 0;
      this.pos.push(ox + c[0], oy + c[1] - inset, oz + c[2]);
      this.nrm.push(face.dir[0], face.dir[1], face.dir[2]);
      const uu = i === 0 || i === 3 ? 0 : 1;
      const vv = i <= 1 ? 0 : 1;
      this.uv.push(u0 + (u1 - u0) * uu, v0 + (v1 - v0) * vv);
      this.ao.push(ao);
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
    g.setIndex(this.idx);
    return g;
  }
}

export interface ChunkMeshes {
  solid: THREE.BufferGeometry | null;
  cutout: THREE.BufferGeometry | null;
  water: THREE.BufferGeometry | null;
}

export function meshChunk(
  voxels: Uint8Array,
  originX: number,
  originZ: number,
  getBlock: NeighborLookup,
): ChunkMeshes {
  const solid = new MeshBuf();
  const cutout = new MeshBuf();
  const water = new MeshBuf();

  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const block = voxels[x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE];
        if (block === Block.Air) continue;

        const wx = originX + x;
        const wz = originZ + z;
        const buf = block === Block.Water ? water : isCutout(block) ? cutout : solid;
        const transparent = block === Block.Water || isCutout(block);

        for (let fi = 0; fi < FACES.length; fi++) {
          // Water: tops only — sides were reading as solid cyan walls
          if (block === Block.Water && fi !== 0) continue;

          const face = FACES[fi];
          const nb = getBlock(wx + face.dir[0], y + face.dir[1], wz + face.dir[2]);

          // Only mesh the open water surface
          if (block === Block.Water && nb !== Block.Air) continue;

          let show = false;
          if (nb === Block.Air) show = true;
          else if (transparent && nb !== block && !isOpaque(nb)) show = true;
          else if (!transparent && !isOpaque(nb) && nb !== block) show = true;
          else if (!transparent && nb === Block.Water) show = true;

          if (!show) continue;
          const depth = block === Block.Water ? countWaterDepth(voxels, x, y, z) : 0;
          buf.addFace(wx, y, wz, fi, block, getBlock, depth);
        }
      }
    }
  }

  return { solid: solid.build(), cutout: cutout.build(), water: water.build() };
}
