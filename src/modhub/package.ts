import type { ModAsset } from '../modding/ModAsset';
import {
  MOD_PACKAGE_FORMAT,
  VYTHERA_GAME_VERSION,
  type ModCategory,
  type ModLifecycle,
  type ModManifest,
  type ModPackage,
  type ModVisibility,
} from './types';
import { isSafeModId, isSemver, sanitizeModText, validatePackage } from './validator';

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  if (globalThis.crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 2166136261;
  for (let i = 0; i < data.length; i++) {
    h ^= data[i]!;
    h = Math.imul(h, 16777619);
  }
  return `fnv_${(h >>> 0).toString(16)}`;
}

export function slugModId(author: string, name: string): string {
  const a =
    author
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 24) || 'creator';
  const n =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'mod';
  const id = `${a}.${n}`;
  return isSafeModId(id) ? id : `creator.${n}`.slice(0, 64);
}

export function createManifest(input: {
  id?: string;
  name: string;
  displayName?: string;
  description?: string;
  version?: string;
  author: string;
  category?: ModCategory;
  tags?: string[];
  visibility?: ModVisibility;
  lifecycle?: ModLifecycle;
}): ModManifest {
  const now = Date.now();
  const name = sanitizeModText(input.name, 64);
  return {
    id: input.id && isSafeModId(input.id) ? input.id : slugModId(input.author, name),
    name,
    displayName: sanitizeModText(input.displayName || name, 80),
    description: sanitizeModText(input.description || '', 4000),
    version: input.version && isSemver(input.version) ? input.version : '0.1.0',
    author: sanitizeModText(input.author, 64),
    category: input.category ?? 'other',
    tags: (input.tags ?? []).map((t) => sanitizeModText(t, 24)).filter(Boolean).slice(0, 12),
    gameVersion: VYTHERA_GAME_VERSION,
    dependencies: [],
    permissions: [],
    visibility: input.visibility ?? 'private',
    lifecycle: input.lifecycle ?? 'draft',
    screenshots: [],
    features: [],
    changelog: '',
    createdAt: now,
    updatedAt: now,
  };
}

export async function buildPackage(manifest: ModManifest, asset: ModAsset): Promise<ModPackage> {
  const clean: ModManifest = {
    ...manifest,
    name: sanitizeModText(manifest.name, 64),
    displayName: sanitizeModText(manifest.displayName, 80),
    description: sanitizeModText(manifest.description, 4000),
    author: sanitizeModText(manifest.author, 64),
    changelog: sanitizeModText(manifest.changelog ?? '', 8000),
    features: (manifest.features ?? []).map((f) => sanitizeModText(f, 120)).slice(0, 32),
    tags: (manifest.tags ?? []).map((t) => sanitizeModText(t, 24)).slice(0, 12),
    screenshots: (manifest.screenshots ?? []).slice(0, 8),
    dependencies: manifest.dependencies ?? [],
    permissions: manifest.permissions ?? [],
    updatedAt: Date.now(),
  };
  const assetJson = JSON.stringify(asset);
  const integrity = await sha256Hex(`${clean.id}@${clean.version}\n${assetJson}`);
  const pkg: ModPackage = {
    format: MOD_PACKAGE_FORMAT,
    manifest: clean,
    assetJson,
    integrity,
  };
  const v = validatePackage(pkg);
  if (!v.ok) {
    throw new Error(
      v.issues
        .filter((i) => i.level === 'error')
        .map((i) => i.message)
        .join(' · ') || 'Invalid package',
    );
  }
  return pkg;
}

export async function verifyPackageIntegrity(pkg: ModPackage): Promise<boolean> {
  const expected = await sha256Hex(`${pkg.manifest.id}@${pkg.manifest.version}\n${pkg.assetJson}`);
  return expected === pkg.integrity;
}

export function packageToDownloadBlob(pkg: ModPackage): Blob {
  return new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
}

export function parsePackageJson(raw: string): ModPackage {
  const parsed = JSON.parse(raw) as ModPackage;
  const v = validatePackage(parsed);
  if (!v.ok) {
    throw new Error(
      v.issues
        .filter((i) => i.level === 'error')
        .map((i) => i.message)
        .join(' · '),
    );
  }
  return parsed;
}

export function bumpPatch(version: string): string {
  const [a, b, c] = version.split('.').map((x) => Number(x) || 0);
  return `${a}.${b}.${(c ?? 0) + 1}`;
}
