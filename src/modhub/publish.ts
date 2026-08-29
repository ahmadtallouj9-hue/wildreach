import { createModAsset } from '../modding/ModAsset';
import { LOCAL_GRID_SIZE } from '../modding/constants';
import { saveModAsset } from '../modding/ModStorage';
import { buildPackage, parsePackageJson, verifyPackageIntegrity } from './package';
import {
  bumpDownload,
  getCatalogEntry,
  getInstalled,
  listAuthoredPackages,
  removeCatalog,
  saveAuthoredPackage,
  setInstalled,
  upsertCatalog,
} from './registry';
import type { ModManifest, ModPackage, ModVisibility, ValidationResult } from './types';
import { gameCompatible, sanitizeModText, validatePackage } from './validator';
import { loadOnlineSettings, onlineConfigured } from '../online/settings/onlineSettings';
import { ModManager } from '../modding/ModSystem';

export interface PublishBackendStatus {
  configured: boolean;
  mode: 'local-only' | 'remote';
  message: string;
}

export function getPublishBackendStatus(): PublishBackendStatus {
  const s = loadOnlineSettings();
  if (onlineConfigured(s) && s.modHubMode === 'ONLINE') {
    return {
      configured: true,
      mode: 'remote',
      message: 'VYTHERA Online Mod Hub is configured. Packages upload only after explicit publish.',
    };
  }
  return {
    configured: false,
    mode: 'local-only',
    message:
      'PUBLIC MOD HUB BACKEND NOT CONFIGURED — publishing stays on this device (local catalog / package export).',
  };
}

export async function publishLocal(
  pkg: ModPackage,
  visibility: ModVisibility,
): Promise<{ ok: true; package: ModPackage } | { ok: false; validation: ValidationResult }> {
  const validation = validatePackage(pkg);
  if (!validation.ok) return { ok: false, validation };
  if (!(await verifyPackageIntegrity(pkg))) {
    return {
      ok: false,
      validation: {
        ok: false,
        issues: [{ level: 'error', code: 'integrity', message: 'Integrity check failed' }],
      },
    };
  }
  const next: ModPackage = {
    ...pkg,
    manifest: {
      ...pkg.manifest,
      visibility,
      lifecycle: visibility === 'private' ? 'draft' : 'published',
      shareId:
        visibility === 'unlisted'
          ? pkg.manifest.shareId || `u_${Math.random().toString(36).slice(2, 10)}`
          : pkg.manifest.shareId,
      updatedAt: Date.now(),
    },
  };
  saveAuthoredPackage(next);
  if (visibility === 'private') {
    removeCatalog(next.manifest.id);
  } else {
    const prev = getCatalogEntry(next.manifest.id);
    upsertCatalog({
      package: next,
      downloads: prev?.downloads ?? 0,
      ratingSum: prev?.ratingSum ?? 0,
      ratingCount: prev?.ratingCount ?? 0,
      listedAt: prev?.listedAt ?? Date.now(),
    });
  }
  return { ok: true, package: next };
}

export async function installPackage(
  pkg: ModPackage,
  source: 'local-publish' | 'import' | 'hub' = 'import',
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const validation = validatePackage(pkg);
  if (!validation.ok) {
    return { ok: false, reason: validation.issues.map((i) => i.message).join(' · ') };
  }
  if (!(await verifyPackageIntegrity(pkg))) {
    return { ok: false, reason: 'Integrity verification failed' };
  }
  if (gameCompatible(pkg.manifest) === 'incompatible') {
    return { ok: false, reason: 'Incompatible with this VYTHERA version' };
  }
  for (const dep of pkg.manifest.dependencies) {
    if (!getInstalled(dep.id)?.enabled) {
      return { ok: false, reason: `Missing dependency: ${sanitizeModText(dep.id, 40)}` };
    }
  }
  try {
    const asset = JSON.parse(pkg.assetJson);
    saveModAsset({ ...asset, name: pkg.manifest.displayName || pkg.manifest.name }, pkg.manifest.id);
  } catch {
    const size = LOCAL_GRID_SIZE;
    saveModAsset(
      createModAsset(pkg.manifest.displayName || pkg.manifest.name, {
        version: 1,
        size,
        voxels: new Array(size * size * size).fill(0),
      }),
      pkg.manifest.id,
    );
  }
  setInstalled({
    package: pkg,
    enabled: true,
    installedAt: Date.now(),
    source,
  });

  // Also bridge into ModManager runtime system
  const modSlug = pkg.manifest.id.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
  ModManager.get().saveMod({
    id: pkg.manifest.id,
    name: pkg.manifest.name,
    displayName: pkg.manifest.displayName || pkg.manifest.name,
    description: pkg.manifest.description || '',
    version: pkg.manifest.version,
    author: pkg.manifest.author,
    packFormat: 1,
    blocks: [
      {
        id: `${modSlug}_block`,
        displayName: pkg.manifest.displayName || pkg.manifest.name,
        hardness: 1.2,
        color: [0.85, 0.45, 0.75],
      },
    ],
    recipes: [
      {
        id: `${modSlug}_recipe`,
        type: 'crafting_shapeless',
        grid: '2x2',
        ingredients: ['dirt', 'stone'],
        result: { id: `${modSlug}_block`, count: 1 },
      },
    ],
    createdAt: pkg.manifest.createdAt || Date.now(),
    updatedAt: pkg.manifest.updatedAt || Date.now(),
  });
  ModManager.get().setModEnabled(pkg.manifest.id, true);

  if (source === 'hub' || source === 'import') bumpDownload(pkg.manifest.id);
  return { ok: true };
}

export async function importPackageFile(
  raw: string,
): Promise<{ ok: true; package: ModPackage } | { ok: false; reason: string }> {
  try {
    const pkg = parsePackageJson(raw);
    const installed = await installPackage(pkg, 'import');
    if (!installed.ok) return { ok: false, reason: installed.reason };
    return { ok: true, package: pkg };
  } catch (e) {
    return {
      ok: false,
      reason: sanitizeModText(e instanceof Error ? e.message : 'Import failed', 200),
    };
  }
}

export function creatorStats(): { mods: number; downloads: number; published: number } {
  const authored = listAuthoredPackages();
  let downloads = 0;
  let published = 0;
  for (const p of authored) {
    const e = getCatalogEntry(p.manifest.id);
    if (e) downloads += e.downloads;
    if (p.manifest.lifecycle === 'published') published += 1;
  }
  return { mods: authored.length, downloads, published };
}

export async function packageFromManifestAndAssetJson(
  manifest: ModManifest,
  assetJson: string,
): Promise<ModPackage> {
  return buildPackage(manifest, JSON.parse(assetJson));
}
