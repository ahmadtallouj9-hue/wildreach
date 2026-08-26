/** Safe localStorage for browser + Node tests. */

const mem = new Map<string, string>();

function hasLS(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

export function lsGet(key: string): string | null {
  try {
    if (hasLS()) return localStorage.getItem(key);
    return mem.get(key) ?? null;
  } catch {
    return mem.get(key) ?? null;
  }
}

export function lsSet(key: string, value: string): void {
  try {
    if (hasLS()) localStorage.setItem(key, value);
    else mem.set(key, value);
  } catch {
    mem.set(key, value);
  }
}
