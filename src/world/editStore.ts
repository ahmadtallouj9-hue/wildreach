/**
 * Persist player block edits per world seed.
 * Compact localStorage payload; IndexedDB used only if quota is exceeded.
 */

const LS_PREFIX = 'wildreach.edits.';
const IDB_NAME = 'wildreach-edits';
const IDB_STORE = 'edits';
const IDB_VERSION = 1;

export type EditMap = Map<string, number>;

function lsKey(seed: string): string {
  return LS_PREFIX + seed.trim();
}

/** Encode edits as "x,y,z,b;…" — denser than JSON objects. */
export function encodeEdits(edits: EditMap): string {
  const parts: string[] = [];
  for (const [key, block] of edits) {
    parts.push(`${key},${block | 0}`);
  }
  return parts.join(';');
}

export function decodeEdits(raw: string): EditMap {
  const out: EditMap = new Map();
  if (!raw) return out;
  for (const part of raw.split(';')) {
    if (!part) continue;
    const bits = part.split(',');
    if (bits.length < 4) continue;
    const x = Number(bits[0]);
    const y = Number(bits[1]);
    const z = Number(bits[2]);
    const block = Number(bits[3]);
    if (![x, y, z, block].every(Number.isFinite)) continue;
    out.set(`${x | 0},${y | 0},${z | 0}`, block | 0);
  }
  return out;
}

export function loadEdits(seed: string): EditMap {
  const key = lsKey(seed);
  try {
    const raw = localStorage.getItem(key);
    if (raw != null) return decodeEdits(raw);
  } catch {
    /* ignore */
  }
  return new Map();
}

/** Synchronous save. Returns false if storage rejected the write. */
export function saveEdits(seed: string, edits: EditMap): boolean {
  const key = lsKey(seed);
  const payload = encodeEdits(edits);
  try {
    if (edits.size === 0) {
      localStorage.removeItem(key);
      return true;
    }
    localStorage.setItem(key, payload);
    return true;
  } catch {
    void saveEditsIdb(seed, payload);
    return false;
  }
}

function openIdb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onerror = () => resolve(null);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
    } catch {
      resolve(null);
    }
  });
}

async function saveEditsIdb(seed: string, payload: string): Promise<void> {
  const db = await openIdb();
  if (!db) return;
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(payload, seed.trim());
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  } finally {
    db.close();
  }
}

/** Prefer localStorage; fall back to IndexedDB when LS is empty (quota path). */
export async function loadEditsAsync(seed: string): Promise<EditMap> {
  const local = loadEdits(seed);
  if (local.size > 0) return local;
  const db = await openIdb();
  if (!db) return local;
  try {
    const raw = await new Promise<string | undefined>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(seed.trim());
      req.onsuccess = () => resolve(req.result as string | undefined);
      req.onerror = () => resolve(undefined);
    });
    if (typeof raw === 'string' && raw.length) return decodeEdits(raw);
  } catch {
    /* ignore */
  } finally {
    db.close();
  }
  return local;
}
