/**
 * Developer-only lab configuration.
 *
 * Stores the chosen candidate terrain resolution for development purposes.
 * Deliberately isolated from world settings and save data: selecting a target
 * records an intent, it does not change the live game.
 */
import { TERRAIN_RESOLUTIONS, type TerrainResolution } from '../../world/preview/TerrainField';

const KEY = 'vythera.dev.terrainTargetResolution';

export function loadTarget(): TerrainResolution | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const value = Number(raw);
    return (TERRAIN_RESOLUTIONS as readonly number[]).includes(value)
      ? (value as TerrainResolution)
      : null;
  } catch {
    return null;
  }
}

export function saveTarget(r: TerrainResolution): void {
  try {
    localStorage.setItem(KEY, String(r));
  } catch {
    // Developer tool: a blocked storage write is not worth surfacing.
  }
}

