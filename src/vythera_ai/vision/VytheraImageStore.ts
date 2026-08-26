import { lsGet, lsSet } from '../util/safeStorage';
import type { VytheraVisionImage } from './VytheraVisionBackend';
import { stripImagePrivacyMetadata } from '../security/VytheraImagePrivacy';

const META_KEY = 'vythera.ai.image.refs';
const DB_NAME = 'vythera-ai-images';
const STORE = 'blobs';

export interface VytheraImageRef {
  id: string;
  hash: string;
  fileName: string;
  mimeType: string;
  tags: string[];
  category: string;
  project: string;
  approved: boolean;
  analysisId: string | null;
  createdAt: number;
  byteLength: number;
  /** True when EXIF/device metadata was stripped from the stored training copy. */
  privacyMetadataStripped?: boolean;
}

export type VytheraImageIngest =
  | {
      ok: true;
      image: VytheraVisionImage;
      hash: string;
      fileName: string;
      privacyMetadataStripped?: boolean;
    }
  | { ok: false; error: string };

const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp']);

/** SHA-256 hex of bytes. */
export async function hashBytes(buf: ArrayBuffer): Promise<string> {
  const dig = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(dig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function toB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

/** Ingest a local File — never uploads. Rejects remote URLs / disallowed types. */
export async function ingestLocalImageFile(file: File): Promise<VytheraImageIngest> {
  if (!ALLOWED.has(file.type) && !/\.(png|jpe?g|webp)$/i.test(file.name)) {
    return { ok: false, error: 'Unsupported format — use PNG, JPG, or WEBP' };
  }
  if (file.size > 12 * 1024 * 1024) {
    return { ok: false, error: 'Image too large (max 12MB)' };
  }
  const raw = await file.arrayBuffer();
  let mime: VytheraVisionImage['mimeType'] = 'image/png';
  if (file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name)) mime = 'image/jpeg';
  else if (file.type === 'image/webp' || /\.webp$/i.test(file.name)) mime = 'image/webp';

  // Sanitized training copy in memory — does not rewrite the user's original file on disk
  const sanitized = await stripImagePrivacyMetadata(raw, mime);
  const buf = sanitized.buffer;
  mime = sanitized.mimeType;
  const hash = await hashBytes(buf);
  const baseName = file.name.replace(/^.*[/\\]/, '').slice(0, 128) || 'image.png';

  return {
    ok: true,
    hash,
    fileName: baseName,
    privacyMetadataStripped: sanitized.stripped,
    image: {
      base64: toB64(buf),
      mimeType: mime,
      fileName: baseName,
    },
  };
}

/**
 * Clipboard image when practical — local only.
 * Processes image bytes only; never stores or logs clipboard text.
 */
export async function ingestLocalImageClipboard(
  items: DataTransferItemList | { length: number; [i: number]: DataTransferItem | ClipboardItem } | null | undefined,
): Promise<VytheraImageIngest> {
  if (!items || !items.length) return { ok: false, error: 'Clipboard empty' };
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const type = 'type' in item ? String(item.type) : '';
    // Ignore text/plain and other non-image clipboard payloads entirely
    if (!type.startsWith('image/')) continue;
    if ('getAsFile' in item && typeof item.getAsFile === 'function') {
      const file = item.getAsFile();
      if (file) return ingestLocalImageFile(file);
    } else if ('getType' in item && typeof item.getType === 'function') {
      const blob = await item.getType(type);
      const file = new File([blob], 'clipboard.png', { type });
      return ingestLocalImageFile(file);
    }
  }
  return { ok: false, error: 'No image on clipboard' };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IDB open failed'));
  });
}

/** Store image bytes once by hash — refs share the same blob. */
export async function putImageBlob(hash: string, base64: string, mimeType: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ base64, mimeType }, hash);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IDB put failed'));
    });
    db.close();
  } catch {
    /* fallback: keep only in memory session via refs without blob — metadata still saved */
  }
}

export async function getImageBlob(
  hash: string,
): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const db = await openDb();
    const row = await new Promise<{ base64: string; mimeType: string } | undefined>(
      (resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(hash);
        req.onsuccess = () => resolve(req.result as { base64: string; mimeType: string } | undefined);
        req.onerror = () => reject(req.error ?? new Error('IDB get failed'));
      },
    );
    db.close();
    return row ?? null;
  } catch {
    return null;
  }
}

function loadRefs(): VytheraImageRef[] {
  try {
    return JSON.parse(lsGet(META_KEY) ?? '[]') as VytheraImageRef[];
  } catch {
    return [];
  }
}

function saveRefs(list: VytheraImageRef[]): void {
  lsSet(META_KEY, JSON.stringify(list.slice(0, 200)));
}

export function listImageRefs(): VytheraImageRef[] {
  return loadRefs();
}

export async function registerImageReference(opts: {
  hash: string;
  base64: string;
  mimeType: string;
  fileName: string;
  category?: string;
  project?: string;
  tags?: string[];
  analysisId?: string | null;
  approved?: boolean;
}): Promise<VytheraImageRef> {
  await putImageBlob(opts.hash, opts.base64, opts.mimeType);
  const existing = loadRefs().find((r) => r.hash === opts.hash && r.project === (opts.project ?? ''));
  if (existing) {
    existing.tags = [...new Set([...existing.tags, ...(opts.tags ?? [])])];
    if (opts.analysisId) existing.analysisId = opts.analysisId;
    if (opts.approved != null) existing.approved = opts.approved;
    const all = loadRefs().map((r) => (r.id === existing.id ? existing : r));
    saveRefs(all);
    return existing;
  }
  const ref: VytheraImageRef = {
    id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    hash: opts.hash,
    fileName: opts.fileName,
    mimeType: opts.mimeType,
    tags: opts.tags ?? [],
    category: opts.category ?? 'unknown',
    project: opts.project ?? '',
    approved: opts.approved ?? false,
    analysisId: opts.analysisId ?? null,
    createdAt: Date.now(),
    byteLength: Math.floor((opts.base64.length * 3) / 4),
  };
  const list = loadRefs();
  list.unshift(ref);
  saveRefs(list);
  return ref;
}

export function updateImageRef(
  id: string,
  patch: Partial<Pick<VytheraImageRef, 'approved' | 'tags' | 'category' | 'analysisId'>>,
): VytheraImageRef | null {
  const list = loadRefs();
  const i = list.findIndex((r) => r.id === id);
  if (i < 0) return null;
  list[i] = { ...list[i]!, ...patch };
  saveRefs(list);
  return list[i]!;
}

export function deleteImageRef(id: string): boolean {
  const list = loadRefs();
  const next = list.filter((r) => r.id !== id);
  if (next.length === list.length) return false;
  saveRefs(next);
  return true;
}
