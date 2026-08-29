import type { ItemStack } from '../player/Inventory';

export interface SavedSurvivalState {
  health: number;
  hunger: number;
  position?: { x: number; y: number; z: number };
  yaw?: number;
  pitch?: number;
  slots?: (ItemStack | null)[];
  selectedHotbar?: number;
  savedAt?: number;
}

const SURVIVAL_PREFIX = 'wildreach.survival.';

function storageKey(seed: string): string {
  return SURVIVAL_PREFIX + seed.trim();
}

export function loadSurvivalState(seed: string): SavedSurvivalState | null {
  const key = storageKey(seed);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data === 'object' && data !== null) {
      return {
        health: typeof data.health === 'number' ? Math.max(0, Math.min(20, data.health)) : 20,
        hunger: typeof data.hunger === 'number' ? Math.max(0, Math.min(20, data.hunger)) : 20,
        position: data.position && typeof data.position.x === 'number' ? data.position : undefined,
        yaw: typeof data.yaw === 'number' ? data.yaw : undefined,
        pitch: typeof data.pitch === 'number' ? data.pitch : undefined,
        slots: Array.isArray(data.slots) ? data.slots : undefined,
        selectedHotbar: typeof data.selectedHotbar === 'number' ? data.selectedHotbar : 0,
        savedAt: data.savedAt,
      };
    }
  } catch {
    /* ignore parse errors */
  }
  return null;
}

export function saveSurvivalState(seed: string, state: SavedSurvivalState): boolean {
  const key = storageKey(seed);
  try {
    const payload = JSON.stringify({
      ...state,
      savedAt: Date.now(),
    });
    localStorage.setItem(key, payload);
    return true;
  } catch {
    return false;
  }
}

export function clearSurvivalState(seed: string): void {
  const key = storageKey(seed);
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
