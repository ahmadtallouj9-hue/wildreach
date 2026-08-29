import fs from 'node:fs';

const write = (p, s) => {
  fs.writeFileSync(p, s.replace(/\n/g, '\n'));
  console.log('wrote', p);
};

write(
  'src/modhub/validator.ts',
  `import { sanitizeForDisplay } from '../vythera_ai/security/VytheraPrivacySanitizer';
import {
  MAX_ICON_CHARS,
  MAX_PACKAGE_CHARS,
  MAX_SCREENSHOT_CHARS,
  MAX_SCREENSHOTS,
  MOD_PACKAGE_FORMAT,
  VYTHERA_GAME_VERSION,
  type ModManifest,
  type ModPackage,
  type ValidationIssue,
  type ValidationResult,
} from './types';

const ID_RE = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const SEMVER_RE = /^\\d+\\.\\d+\\.\\d+(?:-[a-z0-9.]+)?$/i;
const UNSAFE_PATH = /(\\.{2}|\\\\|\\/|%2e%2e|%2f|%5c)/i;
const EXEC_HINT = /\\.(exe|bat|cmd|ps1|sh|dll|so|dylib|msi|scr|com|jar)$/i;

export function sanitizeModText(input: string, max = 2000): string {
  return sanitizeForDisplay(String(input ?? ''), { privacyMode: true }).slice(0, max);
}

export function isSafeModId(id: string): boolean {
  return ID_RE.test(id) && !UNSAFE_PATH.test(id) && !EXEC_HINT.test(id);
}

export function isSemver(v: string): boolean {
  return SEMVER_RE.test(v);
}

function issue(level: ValidationIssue['level'], code: string, message: string): ValidationIssue {
  return { level, code, message: sanitizeModText(message, 240) };
}

export function validateManifest(m: Partial<ModManifest> | null | undefined): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!m || typeof m !== 'object') {
    return { ok: false, issues: [issue('error', 'manifest.missing', 'Manifest missing')] };
  }
  if (!m.id || !isSafeModId(m.id)) {
    issues.push(issue('error', 'manifest.id', 'Mod id must be lowercase slug (a-z0-9._-), no paths'));
  }
  if (!m.name?.trim() || m.name.length > 64) {
    issues.push(issue('error', 'manifest.name', 'Internal name required (max 64)'));
  }
  if (!m.displayName?.trim() || m.displayName.length > 80) {
    issues.push(issue('error', 'manifest.displayName', 'Display name required (max 80)'));
  }
  if (!m.version || !isSemver(m.version)) {
    issues.push(issue('error', 'manifest.version', 'Version must be semver (e.g. 1.0.0)'));
  }
  if (!m.author?.trim() || m.author.length > 64) {
    issues.push(issue('error', 'manifest.author', 'Author required (max 64)'));
  }
  if ((m.description ?? '').length > 4000) {
    issues.push(issue('error', 'manifest.description', 'Description too long'));
  }
  if (UNSAFE_PATH.test(m.name ?? '') || UNSAFE_PATH.test(m.displayName ?? '')) {
    issues.push(issue('error', 'manifest.path', 'Names must not contain path separators'));
  }
  if (m.iconDataUrl && m.iconDataUrl.length > MAX_ICON_CHARS) {
    issues.push(issue('error', 'manifest.icon', 'Icon too large'));
  }
  if (m.iconDataUrl && !m.iconDataUrl.startsWith('data:image/')) {
    issues.push(issue('error', 'manifest.iconType', 'Icon must be a data:image URL'));
  }
  if ((m.screenshots?.length ?? 0) > MAX_SCREENSHOTS) {
    issues.push(issue('error', 'manifest.shots', \`At most \${MAX_SCREENSHOTS} screenshots\`));
  }
  for (const shot of m.screenshots ?? []) {
    if (!shot.startsWith('data:image/')) {
      issues.push(issue('error', 'manifest.shotType', 'Screenshots must be data:image URLs'));
      break;
    }
    if (shot.length > MAX_SCREENSHOT_CHARS) {
      issues.push(issue('error', 'manifest.shotSize', 'A screenshot is too large'));
      break;
    }
  }
  for (const dep of m.dependencies ?? []) {
    if (!isSafeModId(dep.id) || !isSemver(dep.version)) {
      issues.push(issue('error', 'manifest.dep', \`Bad dependency \${sanitizeModText(dep.id, 40)}\`));
    }
  }
  if (m.gameVersion && !isSemver(m.gameVersion)) {
    issues.push(issue('warn', 'manifest.gameVersion', 'gameVersion should be semver'));
  }
  return { ok: !issues.some((i) => i.level === 'error'), issues };
}

export function validatePackage(pkg: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!pkg || typeof pkg !== 'object') {
    return { ok: false, issues: [issue('error', 'pkg.missing', 'Package missing')] };
  }
  const p = pkg as ModPackage;
  if (JSON.stringify(p).length > MAX_PACKAGE_CHARS) {
    issues.push(issue('error', 'pkg.size', 'Package exceeds size limit'));
  }
  if (p.format !== MOD_PACKAGE_FORMAT) {
    issues.push(issue('error', 'pkg.format', \`Unsupported format (need \${MOD_PACKAGE_FORMAT})\`));
  }
  issues.push(...validateManifest(p.manifest).issues);
  if (typeof p.assetJson !== 'string' || p.assetJson.length < 2) {
    issues.push(issue('error', 'pkg.asset', 'Asset payload missing'));
  } else {
    try {
      const asset = JSON.parse(p.assetJson) as { version?: number };
      if (asset.version !== 1) issues.push(issue('error', 'pkg.assetVer', 'Asset version must be 1'));
    } catch {
      issues.push(issue('error', 'pkg.assetJson', 'Asset JSON is malformed'));
    }
  }
  if (typeof p.integrity !== 'string' || p.integrity.length < 8) {
    issues.push(issue('error', 'pkg.integrity', 'Integrity hash missing'));
  }
  if (EXEC_HINT.test(JSON.stringify(p.manifest ?? {}))) {
    issues.push(issue('error', 'pkg.exec', 'Executable-like names are not allowed in metadata'));
  }
  return { ok: !issues.some((i) => i.level === 'error'), issues };
}

export function gameCompatible(manifest: ModManifest): 'compatible' | 'update' | 'incompatible' {
  const need = manifest.gameVersion || VYTHERA_GAME_VERSION;
  const [a1, a2] = need.split('.').map(Number);
  const [b1, b2] = VYTHERA_GAME_VERSION.split('.').map(Number);
  if ((a1 ?? 0) !== (b1 ?? 0)) return 'incompatible';
  if ((a2 ?? 0) > (b2 ?? 0)) return 'update';
  return 'compatible';
}
`,
);

write(
  'src/modhub/package.ts',
  `import type { ModAsset } from '../modding/ModAsset';
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
  return \`fnv_\${(h >>> 0).toString(16)}\`;
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
  const id = \`\${a}.\${n}\`;
  return isSafeModId(id) ? id : \`creator.\${n}\`.slice(0, 64);
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
  const integrity = await sha256Hex(\`\${clean.id}@\${clean.version}\\n\${assetJson}\`);
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
  const expected = await sha256Hex(\`\${pkg.manifest.id}@\${pkg.manifest.version}\\n\${pkg.assetJson}\`);
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
  return \`\${a}.\${b}.\${(c ?? 0) + 1}\`;
}
`,
);

write(
  'src/modhub/registry.ts',
  `import type { CatalogEntry, InstalledMod, ModPackage, ModReport } from './types';
import { sanitizeModText } from './validator';

const KEYS = {
  authored: 'vythera.modhub.authored.v1',
  library: 'vythera.modhub.library.v1',
  catalog: 'vythera.modhub.catalog.v1',
  reports: 'vythera.modhub.reports.v1',
  ratings: 'vythera.modhub.ratings.v1',
} as const;

type AuthoredStore = { versions: Record<string, ModPackage[]> };
type LibraryStore = { mods: Record<string, InstalledMod> };
type CatalogStore = { entries: Record<string, CatalogEntry> };
type ReportStore = { reports: ModReport[] };
type RatingStore = { byMod: Record<string, { sum: number; count: number; mine?: number }> };

function read<T>(key: string, fallback: T): T {
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStore(key: string, value: unknown): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(value));
}

export function listAuthoredPackages(): ModPackage[] {
  const store = read<AuthoredStore>(KEYS.authored, { versions: {} });
  const out: ModPackage[] = [];
  for (const versions of Object.values(store.versions)) {
    if (versions.length) out.push(versions[versions.length - 1]!);
  }
  return out.sort((a, b) => b.manifest.updatedAt - a.manifest.updatedAt);
}

export function listAuthoredVersions(modId: string): ModPackage[] {
  const store = read<AuthoredStore>(KEYS.authored, { versions: {} });
  return [...(store.versions[modId] ?? [])].sort((a, b) =>
    a.manifest.version.localeCompare(b.manifest.version, undefined, { numeric: true }),
  );
}

export function saveAuthoredPackage(pkg: ModPackage): void {
  const store = read<AuthoredStore>(KEYS.authored, { versions: {} });
  const list = store.versions[pkg.manifest.id] ?? [];
  const idx = list.findIndex((p) => p.manifest.version === pkg.manifest.version);
  if (idx >= 0) list[idx] = pkg;
  else list.push(pkg);
  store.versions[pkg.manifest.id] = list;
  writeStore(KEYS.authored, store);
}

export function listInstalled(): InstalledMod[] {
  const store = read<LibraryStore>(KEYS.library, { mods: {} });
  return Object.values(store.mods).sort((a, b) => b.installedAt - a.installedAt);
}

export function getInstalled(modId: string): InstalledMod | null {
  return read<LibraryStore>(KEYS.library, { mods: {} }).mods[modId] ?? null;
}

export function setInstalled(mod: InstalledMod): void {
  const store = read<LibraryStore>(KEYS.library, { mods: {} });
  store.mods[mod.package.manifest.id] = mod;
  writeStore(KEYS.library, store);
}

export function removeInstalled(modId: string): void {
  const store = read<LibraryStore>(KEYS.library, { mods: {} });
  delete store.mods[modId];
  writeStore(KEYS.library, store);
}

export function setInstalledEnabled(modId: string, enabled: boolean): void {
  const cur = getInstalled(modId);
  if (!cur) return;
  setInstalled({ ...cur, enabled });
}

export function listCatalog(): CatalogEntry[] {
  const store = read<CatalogStore>(KEYS.catalog, { entries: {} });
  return Object.values(store.entries).sort((a, b) => b.listedAt - a.listedAt);
}

export function getCatalogEntry(modId: string): CatalogEntry | null {
  return read<CatalogStore>(KEYS.catalog, { entries: {} }).entries[modId] ?? null;
}

export function upsertCatalog(entry: CatalogEntry): void {
  const store = read<CatalogStore>(KEYS.catalog, { entries: {} });
  store.entries[entry.package.manifest.id] = entry;
  writeStore(KEYS.catalog, store);
}

export function removeCatalog(modId: string): void {
  const store = read<CatalogStore>(KEYS.catalog, { entries: {} });
  delete store.entries[modId];
  writeStore(KEYS.catalog, store);
}

export function bumpDownload(modId: string): void {
  const e = getCatalogEntry(modId);
  if (!e) return;
  upsertCatalog({ ...e, downloads: e.downloads + 1 });
}

export function rateMod(modId: string, stars: number): void {
  const s = Math.max(1, Math.min(5, Math.round(stars)));
  const store = read<RatingStore>(KEYS.ratings, { byMod: {} });
  const cur = store.byMod[modId] ?? { sum: 0, count: 0 };
  if (cur.mine != null) {
    cur.sum -= cur.mine;
    cur.count = Math.max(0, cur.count - 1);
  }
  cur.mine = s;
  cur.sum += s;
  cur.count += 1;
  store.byMod[modId] = cur;
  writeStore(KEYS.ratings, store);
  const e = getCatalogEntry(modId);
  if (e) upsertCatalog({ ...e, ratingSum: cur.sum, ratingCount: cur.count });
}

export function addReport(input: {
  modId: string;
  version: string;
  category: ModReport['category'];
  note?: string;
}): void {
  const store = read<ReportStore>(KEYS.reports, { reports: [] });
  store.reports.push({
    id: \`rpt_\${Date.now().toString(36)}\`,
    modId: input.modId,
    version: input.version,
    category: input.category,
    note: sanitizeModText(input.note ?? '', 500),
    createdAt: Date.now(),
  });
  writeStore(KEYS.reports, store);
}

export function searchCatalog(query: string, category?: string): CatalogEntry[] {
  const q = query.trim().toLowerCase();
  return listCatalog().filter((e) => {
    const m = e.package.manifest;
    if (m.visibility === 'private') return false;
    if (category && category !== 'all' && m.category !== category) return false;
    if (!q) return m.visibility === 'public';
    const hay = \`\${m.displayName} \${m.name} \${m.author} \${m.description} \${m.tags.join(' ')} \${m.id} \${m.shareId ?? ''}\`.toLowerCase();
    if (m.visibility === 'unlisted') return m.id === q || m.shareId?.toLowerCase() === q;
    return hay.includes(q);
  });
}
`,
);

write(
  'src/modhub/publish.ts',
  `import { createModAsset } from '../modding/ModAsset';
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

export interface PublishBackendStatus {
  configured: boolean;
  mode: 'local-only' | 'remote';
  message: string;
}

export function getPublishBackendStatus(): PublishBackendStatus {
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
          ? pkg.manifest.shareId || \`u_\${Math.random().toString(36).slice(2, 10)}\`
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
      return { ok: false, reason: \`Missing dependency: \${sanitizeModText(dep.id, 40)}\` };
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
`,
);

write(
  'src/modhub/index.ts',
  `export * from './types';
export * from './validator';
export * from './package';
export * from './registry';
export * from './publish';
`,
);

console.log('modhub core rewritten');
