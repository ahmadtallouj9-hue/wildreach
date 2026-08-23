import type { TerrainType, WorldSettings, WorldTime } from './worldSettings';
import { DEFAULT_WORLD_SETTINGS, loadWorldSettings, saveWorldSettings } from './worldSettings';

export type ShareParams = {
  seed: string;
  settings?: Partial<WorldSettings>;
};

const TERRAINS: TerrainType[] = ['balanced', 'flat', 'mountains', 'islands', 'wild'];
const TIMES: WorldTime[] = ['day', 'noon', 'sunset', 'night'];

export function parseShareFromUrl(search = window.location.search): ShareParams | null {
  const params = new URLSearchParams(search);
  const seed = params.get('seed')?.trim();
  if (!seed) return null;

  const settings: Partial<WorldSettings> = {};
  const terrain = params.get('t');
  if (terrain && TERRAINS.includes(terrain as TerrainType)) {
    settings.terrain = terrain as TerrainType;
  }
  if (params.has('c')) settings.caves = params.get('c') !== '0';
  if (params.has('s')) settings.structures = params.get('s') !== '0';
  const time = params.get('tm');
  if (time && TIMES.includes(time as WorldTime)) settings.time = time as WorldTime;
  const rd = params.get('rd');
  if (rd) settings.renderDistance = Number(rd);

  return {
    seed,
    settings: Object.keys(settings).length > 0 ? settings : undefined,
  };
}

/** Apply URL world settings to local storage. */
export function applyShareParams(params: ShareParams): void {
  const merged = { ...loadWorldSettings(params.seed), ...params.settings };
  saveWorldSettings(params.seed, merged);
}

export function replaceSeedInUrl(seed: string): void {
  const params = new URLSearchParams(window.location.search);
  params.set('seed', seed.trim());
  params.delete('join');
  const query = params.toString();
  window.history.replaceState({}, '', query ? `${window.location.pathname}?${query}` : window.location.pathname);
}

/** @deprecated Link sharing removed — kept for bookmarks with world options only. */
export function buildShareUrl(seed: string, settings?: WorldSettings): string {
  const params = new URLSearchParams();
  const trimmed = seed.trim();
  params.set('seed', trimmed);

  const world = settings ?? loadWorldSettings(trimmed);
  if (world.terrain !== DEFAULT_WORLD_SETTINGS.terrain) params.set('t', world.terrain);
  if (!world.caves) params.set('c', '0');
  if (!world.structures) params.set('s', '0');
  if (world.time !== DEFAULT_WORLD_SETTINGS.time) params.set('tm', world.time);
  if (world.renderDistance !== DEFAULT_WORLD_SETTINGS.renderDistance) {
    params.set('rd', String(world.renderDistance));
  }

  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}?${params.toString()}`;
}
