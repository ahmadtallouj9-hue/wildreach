import { Block, CHUNK_HEIGHT, CHUNK_SIZE, SEA_LEVEL } from './blocks';
import { BiomeId } from './Biomes';
import type { ColumnInfo } from './ColumnInfo';
import type { WorldGen } from './WorldGen';

export function decorateSurface(
  world: WorldGen,
  cx: number,
  cz: number,
  voxels: Uint8Array,
  columns: ColumnInfo[],
): void {
  const ox = cx * CHUNK_SIZE;
  const oz = cz * CHUNK_SIZE;

  for (let lz = 2; lz < CHUNK_SIZE - 2; lz++) {
    for (let lx = 2; lx < CHUNK_SIZE - 2; lx++) {
      const col = columns[lz * CHUNK_SIZE + lx]!;
      const wx = ox + lx;
      const wz = oz + lz;
      const h = col.height;
      if (h <= SEA_LEVEL) continue;
      const top = get(voxels, lx, h, lz);
      if (top === Block.Air || top === Block.Water) continue;
      const r = world.hashAt(wx, wz);
      const r2 = world.hashAt(wx * 3, wz * 5);
      const room = Math.min(lx, lz, CHUNK_SIZE - 1 - lx, CHUNK_SIZE - 1 - lz);

      if (col.biome === BiomeId.Forest && r < 0.09 && room >= 4) {
        placeCanopyTree(voxels, lx, h + 1, lz, 5 + Math.floor(r2 * 4));
      } else if (col.biome === BiomeId.Taiga && r < 0.08 && top !== Block.Snow && room >= 3) {
        placePine(voxels, lx, h + 1, lz, 7 + Math.floor(r2 * 5));
      } else if (col.biome === BiomeId.Plains && r < 0.02 && room >= 3) {
        placeOak(voxels, lx, h + 1, lz, 4 + Math.floor(r2 * 3));
      } else if (col.biome === BiomeId.Desert && r < 0.025) {
        placeCactus(voxels, lx, h + 1, lz, 3 + Math.floor(r2 * 3));
      } else if (col.biome === BiomeId.Mountains && r < 0.05 && h > SEA_LEVEL + 16) {
        placeBoulder(voxels, lx, h + 1, lz, r2);
      } else if (col.biome === BiomeId.Wetlands && r < 0.04 && room >= 3) {
        placeWillow(voxels, lx, h + 1, lz, 5 + Math.floor(r2 * 2));
      } else if ((col.biome === BiomeId.Plains || col.biome === BiomeId.Forest) && r < 0.035) {
        set(voxels, lx, h + 1, lz, Block.Moss);
      }
    }
  }
}

function rnd(x: number, y: number, z: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function placeOak(voxels: Uint8Array, x: number, y: number, z: number, trunk: number): void {
  for (let i = 0; i < trunk; i++) set(voxels, x, y + i, z, Block.Wood);
  crown(voxels, x, y + trunk - 1, z, 2, 3);
}

function placeCanopyTree(voxels: Uint8Array, x: number, y: number, z: number, trunk: number): void {
  for (let i = 0; i < trunk; i++) set(voxels, x, y + i, z, Block.Wood);
  crown(voxels, x, y + trunk - 1, z, 3, 4);
}

function placePine(voxels: Uint8Array, x: number, y: number, z: number, trunk: number): void {
  for (let i = 0; i < trunk; i++) set(voxels, x, y + i, z, Block.Wood);
  for (let i = 2; i <= trunk + 1; i++) {
    const t = 1 - (i - 2) / Math.max(1, trunk);
    const rad = Math.max(1, Math.round(t * 2.6));
    layer(voxels, x, y + i, z, rad, i < trunk);
  }
  putLeaf(voxels, x, y + trunk + 2, z);
  putLeaf(voxels, x, y + trunk + 3, z);
}

function placeWillow(voxels: Uint8Array, x: number, y: number, z: number, trunk: number): void {
  for (let i = 0; i < trunk; i++) set(voxels, x, y + i, z, Block.Wood);
  crown(voxels, x, y + trunk - 1, z, 2, 2);
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      if (Math.abs(dx) + Math.abs(dz) < 2) continue;
      const hang = 2 + Math.floor(rnd(x + dx, y, z + dz) * 2);
      for (let i = 0; i < hang; i++) putLeaf(voxels, x + dx, y + trunk - 1 - i, z + dz);
    }
  }
}

/** Dense leaf blob around the trunk top — always reads as a tree, not stray logs. */
function crown(voxels: Uint8Array, x: number, y: number, z: number, rad: number, tall: number): void {
  for (let dy = 0; dy < tall; dy++) {
    const r = dy === 0 || dy === tall - 1 ? Math.max(1, rad - 1) : rad;
    layer(voxels, x, y + dy, z, r, dy === 0);
  }
  putLeaf(voxels, x, y + tall, z);
}

function layer(
  voxels: Uint8Array,
  x: number,
  y: number,
  z: number,
  rad: number,
  keepTrunk: boolean,
): void {
  for (let dx = -rad; dx <= rad; dx++) {
    for (let dz = -rad; dz <= rad; dz++) {
      if (dx * dx + dz * dz > rad * rad + 1) continue;
      if (keepTrunk && dx === 0 && dz === 0) continue;
      if (Math.abs(dx) === rad && Math.abs(dz) === rad) continue;
      putLeaf(voxels, x + dx, y, z + dz);
    }
  }
}

function placeCactus(voxels: Uint8Array, x: number, y: number, z: number, h: number): void {
  for (let i = 0; i < h; i++) set(voxels, x, y + i, z, Block.Wood);
  if (h > 3) set(voxels, x + 1, y + 2, z, Block.Wood);
}

function placeBoulder(voxels: Uint8Array, x: number, y: number, z: number, r: number): void {
  const block = r < 0.35 ? Block.DarkStone : Block.Stone;
  for (let dy = 0; dy <= 1; dy++) {
    for (let dx = 0; dx <= 1; dx++) {
      for (let dz = 0; dz <= 1; dz++) {
        if (dx + dz + dy === 3 && r > 0.6) continue;
        set(voxels, x + dx, y + dy, z + dz, block);
      }
    }
  }
}

function putLeaf(voxels: Uint8Array, x: number, y: number, z: number): void {
  const cur = get(voxels, x, y, z);
  if (cur === Block.Air || cur === Block.Leaves) set(voxels, x, y, z, Block.Leaves);
}

function get(voxels: Uint8Array, x: number, y: number, z: number): number {
  if (x < 0 || z < 0 || y < 0 || x >= CHUNK_SIZE || z >= CHUNK_SIZE || y >= CHUNK_HEIGHT) {
    return Block.Air;
  }
  return voxels[x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE];
}

function set(voxels: Uint8Array, x: number, y: number, z: number, b: number): void {
  if (x < 0 || z < 0 || y < 0 || x >= CHUNK_SIZE || z >= CHUNK_SIZE || y >= CHUNK_HEIGHT) return;
  voxels[x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE] = b;
}
