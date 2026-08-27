import { Block, CHUNK_HEIGHT, CHUNK_SIZE } from '../blocks';
import { BiomeId } from '../Biomes';
import {
  NEUTRAL_VEGETATION,
  SITE_STEP,
  forEachPlant,
  vegHash,
  type PlantSite,
  type TreeKind,
  type VegetationTuning,
} from './VegetationPlacement';
import type { WorldSeed } from './SeedSystem';
import type { ColumnInfo } from '../ColumnInfo';
import type { ClimateSample } from './Climate';

/**
 * Margin in blocks around a chunk whose plants can still reach inside it.
 * Sized for the widest canopy plus the lattice jitter.
 */
const TREE_MARGIN = SITE_STEP + 6;

/**
 * Stamps vegetation blocks into a chunk.
 *
 * Placement decisions come entirely from VegetationPlacement, which the Custom
 * World preview also uses; this class only turns those decisions into blocks.
 * The lattice is global rather than chunk-relative, so a canopy straddling a
 * chunk border is evaluated identically by both neighbours and cannot be
 * half-stamped.
 */
export class VegetationGenerator {
  private salt: number;
  private veg: VegetationTuning;

  constructor(seed: WorldSeed, vegetation: VegetationTuning = NEUTRAL_VEGETATION) {
    this.salt = seed.derive('trees');
    this.veg = vegetation;
  }

  decorate(
    cx: number,
    cz: number,
    voxels: Uint8Array,
    columns: ColumnInfo[],
    heightAt: (wx: number, wz: number) => number,
    biomeAt: (wx: number, wz: number) => BiomeId,
    climateAt?: (wx: number, wz: number) => ClimateSample,
    seaLevelOverride?: number,
  ): void {
    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;
    const seaLevel = seaLevelOverride ?? 48;

    forEachPlant(
      ox,
      oz,
      CHUNK_SIZE,
      this.salt,
      TREE_MARGIN,
      (x, z) => {
        const climate = climateAt?.(x, z);
        if (!climate) return null;
        const height = heightAt(x, z);
        // A one-block baseline keeps the grade comparable with the preview,
        // which measures slope the same way.
        const slope = Math.max(
          Math.abs(heightAt(x + 1, z) - height),
          Math.abs(heightAt(x, z + 1) - height),
        );
        return {
          biome: biomeAt(x, z),
          climate,
          height,
          slope,
          seaLevel,
          veg: this.veg,
        };
      },
      (site) => this.stamp(site, voxels, cx, cz, columns, heightAt),
    );
  }

  private stamp(
    site: PlantSite,
    voxels: Uint8Array,
    cx: number,
    cz: number,
    columns: ColumnInfo[],
    heightAt: (wx: number, wz: number) => number,
  ): void {
    const h = Math.floor(heightAt(site.x, site.z));
    const y = h + 1;
    switch (site.kind) {
      case 'tree':
        placeTree(voxels, cx, cz, site.x, y, site.z, site.treeKind, site.size);
        return;
      case 'rock':
        placeBoulder(voxels, cx, cz, site.x, y, site.z, site.roll);
        return;
      case 'bush':
        placeBush(voxels, cx, cz, site.x, y, site.z);
        return;
      case 'grass':
      case 'flower':
        // No dedicated flower block exists yet, so both kinds render in-world
        // as ground cover; the preview draws them apart.
        this.putCover(voxels, cx, cz, site.x, site.z, columns);
        return;
    }
  }

  private putCover(
    voxels: Uint8Array,
    cx: number,
    cz: number,
    wx: number,
    wz: number,
    columns: ColumnInfo[],
  ): void {
    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;
    if (wx < ox || wx >= ox + CHUNK_SIZE || wz < oz || wz >= oz + CHUNK_SIZE) return;
    const col = columns[(wz - oz) * CHUNK_SIZE + (wx - ox)];
    if (!col) return;
    const top = getLocal(voxels, wx - ox, col.height, wz - oz);
    if (top !== Block.Grass && top !== Block.Moss) return;
    setWorld(voxels, cx, cz, wx, col.height + 1, wz, Block.Moss);
  }
}

function placeBush(
  voxels: Uint8Array,
  cx: number,
  cz: number,
  wx: number,
  y: number,
  wz: number,
): void {
  putLeaf(voxels, cx, cz, wx, y, wz);
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    if (vegHash(wx + dx, wz + dz, 77) < 0.55) putLeaf(voxels, cx, cz, wx + dx, y, wz + dz);
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
        const hang = 2 + Math.floor(vegHash(wx + dx, wz + dz, 3) * 2);
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
