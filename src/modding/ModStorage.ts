import { createModAsset, modAssetFromJson, type ModAsset } from './ModAsset';
import type { LocalModelData } from './LocalVoxelGrid';

const STORAGE_KEY = 'wildreach.mods';

export interface ModSummary {
  id: string;
  name: string;
  updatedAt: number;
  voxelCount: number;
}

interface ModStore {
  version: 1;
  mods: Record<string, ModAsset & { updatedAt: number }>;
}

function readStore(): ModStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, mods: {} };
    const parsed = JSON.parse(raw) as ModStore;
    if (parsed.version !== 1 || !parsed.mods) return { version: 1, mods: {} };
    return parsed;
  } catch {
    return { version: 1, mods: {} };
  }
}

function writeStore(store: ModStore): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function slugId(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'mod';
}

function uniqueId(store: ModStore, name: string): string {
  let id = slugId(name);
  let n = 2;
  while (store.mods[id] && store.mods[id]!.name !== name.trim()) {
    id = `${slugId(name)}-${n++}`;
  }
  return id;
}

export function listSavedMods(): ModSummary[] {
  const store = readStore();
  return Object.entries(store.mods)
    .map(([id, mod]) => ({
      id,
      name: mod.name,
      updatedAt: mod.updatedAt,
      voxelCount: mod.shape.voxels.filter((b) => b !== 0).length,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveModAsset(asset: ModAsset, preferredId?: string): string {
  const store = readStore();
  const id = preferredId && store.mods[preferredId] ? preferredId : uniqueId(store, asset.name);
  store.mods[id] = { ...asset, updatedAt: Date.now() };
  writeStore(store);
  return id;
}

export function loadModAsset(id: string): ModAsset | null {
  const entry = readStore().mods[id];
  if (!entry) return null;
  const { updatedAt: _u, ...asset } = entry;
  return asset;
}

export function deleteModAsset(id: string): void {
  const store = readStore();
  delete store.mods[id];
  writeStore(store);
}

export function quickSaveShape(name: string, shape: LocalModelData, id?: string): string {
  return saveModAsset(createModAsset(name, shape), id);
}

export function importModFromJson(raw: string): ModAsset {
  return modAssetFromJson(raw);
}
