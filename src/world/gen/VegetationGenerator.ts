import { Block, CHUNK_HEIGHT, CHUNK_SIZE, SEA_LEVEL } from '../blocks';
import { BiomeId } from '../Biomes';
import { BIOME_GEN } from './BiomeTable';
import { treeChanceAt } from './BiomeBlend';
import { blockToChunk, worldToLocalX, worldToLocalZ } from './WorldCoords';
import type { WorldSeed } from './SeedSystem';
import type { ColumnInfo } from '../ColumnInfo';
import type { ClimateSample } from './Climate';

const TREE_MARGIN = 2;

type TreeKind = NonNullable<(typeof BIOME_GEN)[BiomeId.Plains]['treeKind']>;

/**
 * Vegetation + trees with feature ownership so canopy crossing chunk borders
 * is order-independent: origin chunk owns the feature; neighbors stamp local parts.
 */
export class VegetationGenerator {
  private salt: number;

  constructor(seed: WorldSeed) {
    this.salt = seed.derive('trees');
  }

  decorate(
    cx: number,
    cz: number,
    voxels: Uint8Array,
    columns: ColumnInfo[],
    heightAt: (wx: number, wz: number) => number,
    biomeAt: (wx: number, wz: number) => BiomeId,
    climateAt?: (wx: number, wz: number) => ClimateSample,
  ): void {
    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;

    for (let wz = oz - TREE_MARGIN; wz < oz + CHUNK_SIZE + TREE_MARGIN; wz += 3) {
      for (let wx = ox - TREE_MARGIN; wx < ox + CHUNK_SIZE + TREE_MARGIN; wx += 3) {
        const jx = wx + Math.floor(hash(wx, wz, this.salt + 3) * 2);
        const jz = wz + Math.floor(hash(wx + 5, wz + 7, this.salt + 5) * 2);
        const owner = blockToChunk(jx, jz);
        const r = hash(jx, jz, this.salt);
        const biome = biomeAt(jx, jz);
        const def = BIOME_GEN[biome];
        const climate = climateAt?.(jx, jz);
        if (!def || def.treeKind === 'none') {
          if (owner.cx === cx && owner.cz === cz) {
            this.tryGrass(jx, jz, voxels, cx, cz, columns, def?.grassChance ?? 0, r);
          }
          continue;
        }

        const h = heightAt(jx, jz);
        const passTree =
          climate != null
            ? treeChanceAt(def.treeChance, climate, h, SEA_LEVEL, r)
            : r < def.treeChance;

        if (!passTree) {
          if (owner.cx === cx && owner.cz === cz) {
            this.tryGrass(jx, jz, voxels, cx, cz, columns, def.grassChance, r);
          }
          continue;
        }

        if (h <= SEA_LEVEL) continue;
        if (biome === BiomeId.Ocean || biome === BiomeId.DeepOcean) continue;

        const trunk = treeHeight(def.treeKind, jx, jz, this.salt);
        placeTree(voxels, cx, cz, jx, h + 1, jz, def.treeKind, trunk);

        if (biome === BiomeId.Mountains || biome === BiomeId.SnowyMountains) {
          if (r < 0.04 && h > SEA_LEVEL + 16) {
            placeBoulder(voxels, cx, cz, jx, h + 1, jz, hash(jx + 1, jz, this.salt));
          }
        }
      }
    }
  }

  private tryGrass(
    wx: number,
    wz: number,
    voxels: Uint8Array,
    cx: number,
    cz: number,
    columns: ColumnInfo[],
    chance: number,
    r: number,
  ): void {
    if (chance <= 0 || r >= chance + 0.02) return;
    const lx = worldToLocalX(wx);
    const lz = worldToLocalZ(wz);
    if (lx < 0 || lz < 0 || lx >= CHUNK_SIZE || lz >= CHUNK_SIZE) return;
    // only when this world cell is inside the chunk we're filling
    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;
    if (wx < ox || wx >= ox + CHUNK_SIZE || wz < oz || wz >= oz + CHUNK_SIZE) return;
    const col = columns[lz * CHUNK_SIZE + lx];
    if (!col || col.height <= SEA_LEVEL) return;
    const top = getLocal(voxels, lx, col.height, lz);
    if (top !== Block.Grass && top !== Block.Moss) return;
    setWorld(voxels, cx, cz, wx, col.height + 1, wz, Block.Moss);
  }
}

function hash(x: number, z: number, salt: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ (salt | 0);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function treeHeight(kind: TreeKind, wx: number, wz: number, salt: number): number {
  const r = hash(wx * 3, wz * 5, salt + 9);
  switch (kind) {
    case 'oak':
      return 4 + Math.floor(r * 3);
    case 'birch':
      return 5 + Math.floor(r * 4);
    case 'canopy':
      return 5 + Math.floor(r * 5);
    case 'pine':
      return 7 + Math.floor(r * 5);
    case 'jungle':
      return 8 + Math.floor(r * 6);
    case 'willow':
      return 5 + Math.floor(r * 2);
    case 'cactus':
      return 3 + Math.floor(r * 3);
    default:
      return 4;
  }
}

function placeTree(
  voxels: Uint8Array,
  cx: number,
  cz: number,
  wx: number,
  y: number,
  wz: number,
  kind: TreeKind,
  trunk: number,
): void {
  if (kind === 'cactus') {
    for (let i = 0; i < trunk; i++) setWorld(voxels, cx, cz, wx, y + i, wz, Block.Wood);
    if (trunk > 3) setWorld(voxels, cx, cz, wx + 1, y + 2, wz, Block.Wood);
    return;
  }
  if (kind === 'pine') {
    for (let i = 0; i < trunk; i++) setWorld(voxels, cx, cz, wx, y + i, wz, Block.Wood);
    for (let i = 2; i <= trunk + 1; i++) {
      const t = 1 - (i - 2) / Math.max(1, trunk);
      const rad = Math.max(1, Math.round(t * 2.6));
      leafLayer(voxels, cx, cz, wx, y + i, wz, rad, i < trunk);
    }
    putLeaf(voxels, cx, cz, wx, y + trunk + 2, wz);
    putLeaf(voxels, cx, cz, wx, y + trunk + 3, wz);
    return;
  }
  if (kind === 'willow') {
    for (let i = 0; i < trunk; i++) setWorld(voxels, cx, cz, wx, y + i, wz, Block.Wood);
    crown(voxels, cx, cz, wx, y + trunk - 1, wz, 2, 2);
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        if (Math.abs(dx) + Math.abs(dz) < 2) continue;
        const hang = 2 + Math.floor(hash(wx + dx, wz + dz, 3) * 2);
        for (let i = 0; i < hang; i++) putLeaf(voxels, cx, cz, wx + dx, y + trunk - 1 - i, wz + dz);
      }
    }
    return;
  }
  if (kind === 'jungle') {
    for (let i = 0; i < trunk; i++) setWorld(voxels, cx, cz, wx, y + i, wz, Block.Wood);
    crown(voxels, cx, cz, wx, y + trunk - 1, wz, 4, 4);
    return;
  }
  if (kind === 'birch') {
    for (let i = 0; i < trunk; i++) setWorld(voxels, cx, cz, wx, y + i, wz, Block.Wood);
    crown(voxels, cx, cz, wx, y + trunk - 1, wz, 2, 3);
    return;
  }
  // oak / canopy
  for (let i = 0; i < trunk; i++) setWorld(voxels, cx, cz, wx, y + i, wz, Block.Wood);
  const rad = kind === 'canopy' ? 3 : 2;
  const tall = kind === 'canopy' ? 4 : 3;
  crown(voxels, cx, cz, wx, y + trunk - 1, wz, rad, tall);
}

function crown(
  voxels: Uint8Array,
  cx: number,
  cz: number,
  x: number,
  y: number,
  z: number,
  rad: number,
  tall: number,
): void {
  for (let dy = 0; dy < tall; dy++) {
    const r = dy === 0 || dy === tall - 1 ? Math.max(1, rad - 1) : rad;
    leafLayer(voxels, cx, cz, x, y + dy, z, r, dy === 0);
  }
  putLeaf(voxels, cx, cz, x, y + tall, z);
}

function leafLayer(
  voxels: Uint8Array,
  cx: number,
  cz: number,
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
      putLeaf(voxels, cx, cz, x + dx, y, z + dz);
    }
  }
}

function placeBoulder(
  voxels: Uint8Array,
  cx: number,
  cz: number,
  wx: number,
  y: number,
  wz: number,
  r: number,
): void {
  const block = r < 0.35 ? Block.DarkStone : Block.Stone;
  for (let dy = 0; dy <= 1; dy++) {
    for (let dx = 0; dx <= 1; dx++) {
      for (let dz = 0; dz <= 1; dz++) {
        if (dx + dz + dy === 3 && r > 0.6) continue;
        setWorld(voxels, cx, cz, wx + dx, y + dy, wz + dz, block);
      }
    }
  }
}

function putLeaf(voxels: Uint8Array, cx: number, cz: number, wx: number, y: number, wz: number): void {
  const cur = getWorld(voxels, cx, cz, wx, y, wz);
  if (cur === Block.Air || cur === Block.Leaves) setWorld(voxels, cx, cz, wx, y, wz, Block.Leaves);
}

function setWorld(
  voxels: Uint8Array,
  cx: number,
  cz: number,
  wx: number,
  y: number,
  wz: number,
  b: number,
): void {
  if (y < 0 || y >= CHUNK_HEIGHT) return;
  const ox = cx * CHUNK_SIZE;
  const oz = cz * CHUNK_SIZE;
  if (wx < ox || wx >= ox + CHUNK_SIZE || wz < oz || wz >= oz + CHUNK_SIZE) return;
  const lx = wx - ox;
  const lz = wz - oz;
  voxels[lx + lz * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE] = b;
}

function getWorld(
  voxels: Uint8Array,
  cx: number,
  cz: number,
  wx: number,
  y: number,
  wz: number,
): number {
  if (y < 0 || y >= CHUNK_HEIGHT) return Block.Air;
  const ox = cx * CHUNK_SIZE;
  const oz = cz * CHUNK_SIZE;
  if (wx < ox || wx >= ox + CHUNK_SIZE || wz < oz || wz >= oz + CHUNK_SIZE) return Block.Air;
  const lx = wx - ox;
  const lz = wz - oz;
  return voxels[lx + lz * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE]!;
}

function getLocal(voxels: Uint8Array, x: number, y: number, z: number): number {
  if (x < 0 || z < 0 || y < 0 || x >= CHUNK_SIZE || z >= CHUNK_SIZE || y >= CHUNK_HEIGHT) {
    return Block.Air;
  }
  return voxels[x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE]!;
}
