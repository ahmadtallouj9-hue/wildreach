/**
 * Dependency-keyed cache of generated preview tiles.
 *
 * Terrain is by far the most expensive thing the editor builds, and most edits
 * do not change it at all. A tile is identified by the terrain-affecting part
 * of the style plus its own position and detail step, so changing tree density
 * or cloud cover leaves every entry valid, while changing mountain height
 * invalidates all of them at once simply by producing a different key.
 *
 * Entries hold plain typed arrays, not GPU resources, so the budget below is
 * real measurable memory rather than an estimate.
 */
import type { Tile } from './TerrainField';
import { PARAM_SPECS, type StyleGroup, type VytheraWorldStyle } from '../style/WorldStyle';
import { WORLD_GENERATION_VERSION } from '../gen/version';

/**
 * Style groups whose parameters can move terrain geometry or surface material.
 *
 * Vegetation and atmosphere are absent on purpose: that omission is what makes
 * a tree-density or cloud-density edit reuse every cached tile. Biome is
 * included because the surface material of a cell comes from its biome.
 */
const TERRAIN_GROUPS: StyleGroup[] = ['terrain', 'water', 'biome'];

const TERRAIN_PARAMS = PARAM_SPECS.filter((s) => TERRAIN_GROUPS.includes(s.group));

/**
 * Identity of the terrain a style describes.
 *
 * Derived from PARAM_SPECS rather than a hand-written field list so that adding
 * a terrain parameter to the style automatically invalidates the cache. A
 * hand-maintained list would eventually miss one and serve stale geometry,
 * which is the one failure mode a preview cache must never have.
 */
export function terrainCacheKey(style: VytheraWorldStyle): string {
  const parts: (string | number)[] = [
    WORLD_GENERATION_VERSION,
    style.seed,
    style.terrainVoxelSize,
    style.landscape,
  ];
  for (const spec of TERRAIN_PARAMS) {
    const group = style[spec.group] as unknown as Record<string, number>;
    parts.push(group?.[spec.key] ?? spec.default);
  }
  return parts.join('|');
}

/** Groups the cache key deliberately ignores, exposed so tests can assert it. */
export const CACHE_IGNORED_GROUPS: StyleGroup[] = ['vegetation', 'atmosphere'];

function tileBytes(tile: Tile): number {
  return tile.heights.byteLength + tile.materials.byteLength;
}

/** Roughly 80 MB of heightfield, enough for two full 0.25 regions. */
const BUDGET_BYTES = 80 * 1024 * 1024;

export interface CacheStats {
  hits: number;
  misses: number;
  entries: number;
  bytes: number;
}

export class TerrainCache {
  /** Insertion order is the eviction order; re-reading refreshes an entry. */
  private map = new Map<string, Tile>();
  private bytes = 0;
  private hits = 0;
  private misses = 0;

  /** Current style key. Setting a different one drops everything. */
  private styleKey = '';

  /**
   * Point the cache at a style. Returns true when the terrain actually
   * changed, which is what tells the editor a remesh is unavoidable.
   */
  setStyle(key: string): boolean {
    if (key === this.styleKey) return false;
    this.styleKey = key;
    this.clear();
    return true;
  }

  get(x0: number, z0: number, step: number): Tile | null {
    const key = `${x0},${z0},${step}`;
    const tile = this.map.get(key);
    if (!tile) {
      this.misses++;
      return null;
    }
    // Refresh recency.
    this.map.delete(key);
    this.map.set(key, tile);
    this.hits++;
    return tile;
  }

  put(x0: number, z0: number, step: number, tile: Tile): void {
    const key = `${x0},${z0},${step}`;
    const existing = this.map.get(key);
    if (existing) this.bytes -= tileBytes(existing);
    this.map.set(key, tile);
    this.bytes += tileBytes(tile);
    this.evict();
  }

  private evict(): void {
    while (this.bytes > BUDGET_BYTES && this.map.size > 1) {
      const oldest = this.map.keys().next();
      if (oldest.done) return;
      const tile = this.map.get(oldest.value);
      if (tile) this.bytes -= tileBytes(tile);
      this.map.delete(oldest.value);
    }
  }

  clear(): void {
    this.map.clear();
    this.bytes = 0;
  }

  stats(): CacheStats {
    return { hits: this.hits, misses: this.misses, entries: this.map.size, bytes: this.bytes };
  }

  resetCounters(): void {
    this.hits = 0;
    this.misses = 0;
  }
}
