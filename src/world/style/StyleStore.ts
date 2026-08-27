/**
 * Local library of saved world styles.
 *
 * Stores parameters only — never generated terrain — so the whole library
 * stays a few kilobytes regardless of how many worlds were previewed.
 * Works entirely offline; no server is involved at any point.
 */
import {
  MAX_NAME_LENGTH,
  cloneStyle,
  createDefaultStyle,
  newStyleId,
  type VytheraWorldStyle,
} from './WorldStyle';
import { parseStyleFile, sanitizeStyle, serializeStyle } from './styleValidation';

const LIBRARY_KEY = 'vythera.worldStyles';
const THUMB_KEY = 'vythera.worldStyleThumbs';
export const STYLE_FILE_EXTENSION = '.vyworld';

/** Thumbnails are stored apart so the style list stays small and fast to read. */
type ThumbMap = Record<string, string>;

export type StyleOrigin = 'builtin' | 'mine' | 'imported';

export interface StoredStyle {
  style: VytheraWorldStyle;
  origin: StyleOrigin;
}

function readLibrary(): StoredStyle[] {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e) => e && typeof e === 'object')
      .map((e) => ({
        style: sanitizeStyle((e as StoredStyle).style),
        origin: ((e as StoredStyle).origin === 'imported' ? 'imported' : 'mine') as StyleOrigin,
      }));
  } catch {
    return [];
  }
}

function writeLibrary(entries: StoredStyle[]): void {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(entries));
  } catch {
    // Quota or private-mode failure: the editor keeps working in memory.
  }
}

export function listStyles(): StoredStyle[] {
  return readLibrary().sort((a, b) => b.style.updatedAt - a.style.updatedAt);
}

export function getStyle(id: string): VytheraWorldStyle | null {
  return readLibrary().find((e) => e.style.id === id)?.style ?? null;
}

export function saveStyle(style: VytheraWorldStyle, origin: StyleOrigin = 'mine'): VytheraWorldStyle {
  const clean = sanitizeStyle(cloneStyle(style));
  clean.updatedAt = Date.now();
  const entries = readLibrary();
  const index = entries.findIndex((e) => e.style.id === clean.id);
  if (index >= 0) entries[index] = { style: clean, origin: entries[index]!.origin };
  else entries.push({ style: clean, origin });
  writeLibrary(entries);
  return clean;
}

export function deleteStyle(id: string): void {
  writeLibrary(readLibrary().filter((e) => e.style.id !== id));
  const thumbs = readThumbs();
  delete thumbs[id];
  writeThumbs(thumbs);
}

export function renameStyle(id: string, name: string): VytheraWorldStyle | null {
  const entries = readLibrary();
  const entry = entries.find((e) => e.style.id === id);
  if (!entry) return null;
  entry.style.name = name.slice(0, MAX_NAME_LENGTH).trim() || entry.style.name;
  entry.style.updatedAt = Date.now();
  writeLibrary(entries);
  return entry.style;
}

/**
 * Copy a style under a new id so edits cannot damage the original, and reset
 * the revision because a copy is a new lineage rather than a new version.
 */
export function duplicateStyle(id: string, nameSuffix = 'copy'): VytheraWorldStyle | null {
  const source = getStyle(id);
  if (!source) return null;
  const copy = cloneStyle(source);
  copy.id = newStyleId();
  copy.name = `${source.name} - ${nameSuffix}`.slice(0, MAX_NAME_LENGTH);
  copy.version = 1;
  copy.createdAt = Date.now();
  copy.updatedAt = Date.now();
  return saveStyle(copy, 'mine');
}

/**
 * Publishing-style revision bump. A downloaded style must never change under
 * another player, so edits intended for sharing become a new version number.
 */
export function bumpVersion(id: string): VytheraWorldStyle | null {
  const style = getStyle(id);
  if (!style) return null;
  style.version += 1;
  style.updatedAt = Date.now();
  return saveStyle(style);
}

// --- Thumbnails ---

function readThumbs(): ThumbMap {
  try {
    const raw = localStorage.getItem(THUMB_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as ThumbMap) : {};
  } catch {
    return {};
  }
}

function writeThumbs(map: ThumbMap): void {
  try {
    localStorage.setItem(THUMB_KEY, JSON.stringify(map));
  } catch {
    // Thumbnails are decorative; dropping them is acceptable.
  }
}

export function getThumbnail(id: string): string | null {
  return readThumbs()[id] ?? null;
}

export function setThumbnail(id: string, dataUrl: string): void {
  if (!dataUrl.startsWith('data:image/')) return;
  const map = readThumbs();
  map[id] = dataUrl;
  writeThumbs(map);
}

// --- Export / import ---

export function exportStyleToFile(style: VytheraWorldStyle): void {
  const blob = new Blob([serializeStyle(style)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeName = style.name.replace(/[^A-Za-z0-9 _-]/g, '').trim() || 'world-style';
  link.href = url;
  link.download = `${safeName}${STYLE_FILE_EXTENSION}`;
  link.click();
  URL.revokeObjectURL(url);
}

export interface ImportOutcome {
  ok: boolean;
  style: VytheraWorldStyle | null;
  errors: string[];
  warnings: string[];
}

/**
 * Import an untrusted style file. The incoming id is replaced so a shared file
 * can never overwrite a style the player already has.
 */
export async function importStyleFromFile(file: File): Promise<ImportOutcome> {
  if (file.size > 256 * 1024) {
    return { ok: false, style: null, errors: ['File is too large for a world style.'], warnings: [] };
  }
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, style: null, errors: ['Could not read the file.'], warnings: [] };
  }

  const result = parseStyleFile(text);
  if (!result.ok || !result.style) {
    return { ok: false, style: null, errors: result.errors, warnings: result.warnings };
  }

  const style = result.style;
  style.id = newStyleId();
  style.updatedAt = Date.now();
  const saved = saveStyle(style, 'imported');
  return { ok: true, style: saved, errors: [], warnings: result.warnings };
}

/** Seeded library entry so a first-run player has something to start from. */
export function ensureDefaultStyle(): VytheraWorldStyle {
  const existing = listStyles();
  if (existing.length > 0) return existing[0]!.style;
  const style = createDefaultStyle({ name: 'VYTHERA Default' });
  return saveStyle(style, 'mine');
}
