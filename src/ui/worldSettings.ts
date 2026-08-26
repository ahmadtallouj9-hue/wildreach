export type TerrainType = 'balanced' | 'flat' | 'mountains' | 'islands' | 'wild';
export type WorldTime = 'day' | 'noon' | 'sunset' | 'night';

export interface WorldSettings {
  name: string;
  terrain: TerrainType;
  caves: boolean;
  structures: boolean;
  time: WorldTime;
  renderDistance: number;
}

const WORLD_KEY = 'wildreach.worlds';

const TERRAINS: TerrainType[] = ['balanced', 'flat', 'mountains', 'islands', 'wild'];
const TIMES: WorldTime[] = ['day', 'noon', 'sunset', 'night'];

export const DEFAULT_WORLD_SETTINGS: WorldSettings = {
  name: '',
  terrain: 'balanced',
  caves: true,
  structures: true,
  time: 'day',
  renderDistance: 6,
};

export const WORLD_TIME_VALUES: Record<WorldTime, number> = {
  night: 0.0,
  day: 0.38,
  noon: 0.5,
  sunset: 0.72,
};

function readStore(): Record<string, WorldSettings> {
  try {
    const raw = localStorage.getItem(WORLD_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, WorldSettings>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, WorldSettings>): void {
  try {
    localStorage.setItem(WORLD_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

function normalize(settings: Partial<WorldSettings>): WorldSettings {
  return {
    name: (settings.name ?? '').slice(0, 24),
    terrain: TERRAINS.includes(settings.terrain as TerrainType)
      ? (settings.terrain as TerrainType)
      : 'balanced',
    caves: settings.caves !== false,
    structures: settings.structures !== false,
    time: TIMES.includes(settings.time as WorldTime) ? (settings.time as WorldTime) : 'day',
    renderDistance: Math.min(8, Math.max(3, Math.round(Number(settings.renderDistance) || 7))),
  };
}

export function loadWorldSettings(seed: string): WorldSettings {
  const store = readStore();
  return normalize({ ...DEFAULT_WORLD_SETTINGS, ...store[seed] });
}

export function saveWorldSettings(seed: string, settings: WorldSettings): void {
  const store = readStore();
  store[seed] = normalize(settings);
  writeStore(store);
}

export type SavedWorldEntry = {
  seed: string;
  settings: WorldSettings;
};

/** All worlds saved on this device (Minecraft-style select list). */
export function listSavedWorlds(): SavedWorldEntry[] {
  const store = readStore();
  return Object.entries(store)
    .map(([seed, settings]) => ({ seed, settings: normalize(settings) }))
    .sort((a, b) => {
      const an = (a.settings.name || a.seed).toLowerCase();
      const bn = (b.settings.name || b.seed).toLowerCase();
      return an.localeCompare(bn);
    });
}

export function deleteWorldSettings(seed: string): void {
  const store = readStore();
  if (!(seed in store)) return;
  delete store[seed];
  writeStore(store);
}
