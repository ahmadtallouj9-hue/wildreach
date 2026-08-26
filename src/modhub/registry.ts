import type { CatalogEntry, InstalledMod, ModPackage, ModReport } from './types';
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
    id: `rpt_${Date.now().toString(36)}`,
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
    const hay =
      `${m.displayName} ${m.name} ${m.author} ${m.description} ${m.tags.join(' ')} ${m.id} ${m.shareId ?? ''}`.toLowerCase();
    if (m.visibility === 'unlisted') return m.id === q || m.shareId?.toLowerCase() === q;
    return hay.includes(q);
  });
}
