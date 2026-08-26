/**
 * Minecraft-compatible 64×64 / 128×128 skin PNG importer.
 * Maps standard Steve/Alex layout onto the internal 64×64 atlas used by PlayerAvatar.
 */

import { BOX_FACES, PART_UV, SKIN_SIZE, type SkinPart } from './SkinAtlas';
import { OVERLAY_PART_UV, type OverlayPart } from './SkinOverlayUV';

export type SkinPNGFormat = '64x64' | '128x128' | '64x32';

export interface SkinImportResult {
  pixels: Uint8ClampedArray;
  format: SkinPNGFormat;
  /** Source ÷ atlas (1 for 64×64, 2 for 128×128). */
  scaleFactor: number;
  sourceWidth: number;
  sourceHeight: number;
}

export class SkinImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkinImportError';
  }
}

const BASE_PARTS: SkinPart[] = ['head', 'body', 'armR', 'armL', 'legR', 'legL'];

/** Detect supported Minecraft skin dimensions. */
export function detectSkinFormat(width: number, height: number): SkinPNGFormat {
  if (width === SKIN_SIZE && height === SKIN_SIZE) return '64x64';
  if (width === SKIN_SIZE * 2 && height === SKIN_SIZE * 2) return '128x128';
  if (width === SKIN_SIZE && height === SKIN_SIZE / 2) return '64x32';
  throw new SkinImportError(
    `Unsupported skin size ${width}×${height}. Use 64×64, 128×128, or legacy 64×32 PNG.`,
  );
}

export function scaleFactorForFormat(format: SkinPNGFormat): number {
  if (format === '128x128') return 2;
  return 1;
}

function sampleSrc(
  src: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  sx: number,
  sy: number,
): [number, number, number, number] {
  const x = Math.max(0, Math.min(srcW - 1, sx));
  const y = Math.max(0, Math.min(srcH - 1, sy));
  const i = (y * srcW + x) * 4;
  return [src[i]!, src[i + 1]!, src[i + 2]!, src[i + 3]!];
}

/** Nearest-neighbor resample any supported layout into a 64×64 RGBA atlas. */
export function normalizeSkinImageData(
  src: Uint8ClampedArray,
  srcW: number,
  srcH: number,
): SkinImportResult {
  const format = detectSkinFormat(srcW, srcH);
  const scaleFactor = scaleFactorForFormat(format);
  const out = new Uint8ClampedArray(SKIN_SIZE * SKIN_SIZE * 4);

  for (let ay = 0; ay < SKIN_SIZE; ay++) {
    for (let ax = 0; ax < SKIN_SIZE; ax++) {
      const sx = ax * scaleFactor;
      const sy = ay * scaleFactor;
      const [r, g, b, a] = sampleSrc(src, srcW, srcH, sx, sy);
      const di = (ay * SKIN_SIZE + ax) * 4;
      out[di] = r;
      out[di + 1] = g;
      out[di + 2] = b;
      out[di + 3] = a;
    }
  }

  return {
    pixels: postProcessMinecraftSkin(out),
    format,
    scaleFactor,
    sourceWidth: srcW,
    sourceHeight: srcH,
  };
}

type AtlasRect = { x: number; y: number; w: number; h: number };

function clearTexel(out: Uint8ClampedArray, i: number): void {
  out[i] = 0;
  out[i + 1] = 0;
  out[i + 2] = 0;
  out[i + 3] = 0;
}

/**
 * Unused 2nd-layer atlas space is often filled with opaque #000000 instead of alpha=0.
 * Always cut out pure black overlay texels (real black clothing uses #010101+).
 * Also wipe whole overlay parts that are only black/empty filler.
 */
function scrubOverlayLayer(out: Uint8ClampedArray): void {
  const overlayParts: { rects: AtlasRect[] }[] = [];

  const hatRects: AtlasRect[] = [];
  for (const face of BOX_FACES) hatRects.push(PART_UV.hat[face]);
  overlayParts.push({ rects: hatRects });

  for (const part of Object.keys(OVERLAY_PART_UV) as OverlayPart[]) {
    const rects: AtlasRect[] = [];
    for (const face of BOX_FACES) rects.push(OVERLAY_PART_UV[part][face]);
    overlayParts.push({ rects });
  }

  for (const { rects } of overlayParts) {
    let painted = 0;
    let dead = 0;
    for (const r of rects) {
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          const i = (y * SKIN_SIZE + x) * 4;
          const a = out[i + 3]!;
          const lum = out[i]! + out[i + 1]! + out[i + 2]!;
          if (a < 8 || lum === 0) dead++;
          else painted++;
        }
      }
    }
    const wipeAll = painted <= 4;
    for (const r of rects) {
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          const i = (y * SKIN_SIZE + x) * 4;
          const a = out[i + 3]!;
          const lum = out[i]! + out[i + 1]! + out[i + 2]!;
          if (wipeAll || a < 8 || lum === 0) clearTexel(out, i);
        }
      }
    }
  }
}

/** Opaque materials show transparent atlas texels as black — fill empty base faces. */
function healTransparentBase(out: Uint8ClampedArray): void {
  for (const part of BASE_PARTS) {
    for (const face of BOX_FACES) {
      const r = PART_UV[part][face];
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let n = 0;
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          const i = (y * SKIN_SIZE + x) * 4;
          if (out[i + 3]! >= 8 && out[i]! + out[i + 1]! + out[i + 2]! > 0) {
            sr += out[i]!;
            sg += out[i + 1]!;
            sb += out[i + 2]!;
            n++;
          }
        }
      }
      const fr = n > 0 ? Math.round(sr / n) : 200;
      const fg = n > 0 ? Math.round(sg / n) : 200;
      const fb = n > 0 ? Math.round(sb / n) : 200;
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          const i = (y * SKIN_SIZE + x) * 4;
          if (out[i + 3]! < 8) {
            out[i] = fr;
            out[i + 1] = fg;
            out[i + 2] = fb;
            out[i + 3] = 255;
          } else {
            out[i + 3] = 255;
          }
        }
      }
    }
  }
}

/**
 * If a whole base part is flat #000 while the rest of the skin has color
 * (common empty-canvas arms/legs), fill it from the head/body average.
 */
function healSolidBlackBaseParts(out: Uint8ClampedArray): void {
  const partStats = (part: SkinPart): { black: number; painted: number } => {
    let black = 0;
    let painted = 0;
    for (const face of BOX_FACES) {
      const r = PART_UV[part][face];
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          const i = (y * SKIN_SIZE + x) * 4;
          if (out[i]! + out[i + 1]! + out[i + 2]! === 0) black++;
          else painted++;
        }
      }
    }
    return { black, painted };
  };

  const head = partStats('head');
  const body = partStats('body');
  const hasContent = head.painted + body.painted > 32;
  if (!hasContent) return;

  let fillR = 0;
  let fillG = 0;
  let fillB = 0;
  let fillN = 0;
  for (const part of ['head', 'body'] as SkinPart[]) {
    for (const face of BOX_FACES) {
      const r = PART_UV[part][face];
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          const i = (y * SKIN_SIZE + x) * 4;
          const lum = out[i]! + out[i + 1]! + out[i + 2]!;
          if (lum > 0) {
            fillR += out[i]!;
            fillG += out[i + 1]!;
            fillB += out[i + 2]!;
            fillN++;
          }
        }
      }
    }
  }
  if (fillN < 1) return;
  fillR = Math.round(fillR / fillN);
  fillG = Math.round(fillG / fillN);
  fillB = Math.round(fillB / fillN);

  for (const part of ['armR', 'armL', 'legR', 'legL'] as SkinPart[]) {
    const s = partStats(part);
    if (s.painted > 4) continue;
    if (s.black < 16) continue;
    for (const face of BOX_FACES) {
      const r = PART_UV[part][face];
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          const i = (y * SKIN_SIZE + x) * 4;
          out[i] = fillR;
          out[i + 1] = fillG;
          out[i + 2] = fillB;
          out[i + 3] = 255;
        }
      }
    }
  }
}

/** Base layer → opaque texels; overlay layers keep alpha for cutout. */
export function postProcessMinecraftSkin(data: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data);
  healTransparentBase(out);
  healSolidBlackBaseParts(out);
  scrubOverlayLayer(out);
  return out;
}

function readImagePixels(img: HTMLImageElement): Uint8ClampedArray {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new SkinImportError('Canvas unavailable');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  return new Uint8ClampedArray(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
}

function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new SkinImportError('Failed to decode PNG'));
    img.src = url;
  });
}

/** Import from PNG bytes (FileReader result or fetch). */
export async function importSkinFromBytes(bytes: Uint8Array): Promise<SkinImportResult> {
  const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' });
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImageFromUrl(url);
    return importSkinFromImage(img);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Import from a data URL or blob URL. */
export async function importSkinFromDataUrl(dataUrl: string): Promise<SkinImportResult> {
  const img = await loadImageFromUrl(dataUrl);
  return importSkinFromImage(img);
}

/** Import from a user-selected PNG file. */
export async function importSkinFromFile(file: File): Promise<SkinImportResult> {
  if (!file.type.startsWith('image/') && !file.name.toLowerCase().endsWith('.png')) {
    throw new SkinImportError('Please choose a PNG skin file.');
  }
  const buf = await file.arrayBuffer();
  return importSkinFromBytes(new Uint8Array(buf));
}

/** Import from a loaded HTMLImageElement. */
export function importSkinFromImage(img: HTMLImageElement): SkinImportResult {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (w < 1 || h < 1) throw new SkinImportError('Empty image');
  const src = readImagePixels(img);
  return normalizeSkinImageData(src, w, h);
}

export type SkinImportHandler = (result: SkinImportResult) => void;

/** Wire file picker + drag-and-drop onto a host element. */
export function bindSkinUpload(
  host: HTMLElement,
  input: HTMLInputElement,
  onImport: SkinImportHandler,
  onError?: (err: unknown) => void,
): () => void {
  const pick = (): void => input.click();

  const onInput = (): void => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    void importSkinFromFile(file).then(onImport).catch((e) => onError?.(e));
  };

  const onDragOver = (e: DragEvent): void => {
    e.preventDefault();
    host.classList.add('skin-upload-drag');
  };
  const onDragLeave = (): void => host.classList.remove('skin-upload-drag');
  const onDrop = (e: DragEvent): void => {
    e.preventDefault();
    host.classList.remove('skin-upload-drag');
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    void importSkinFromFile(file).then(onImport).catch((err) => onError?.(err));
  };

  host.addEventListener('click', pick);
  input.addEventListener('change', onInput);
  host.addEventListener('dragover', onDragOver);
  host.addEventListener('dragleave', onDragLeave);
  host.addEventListener('drop', onDrop);

  return () => {
    host.removeEventListener('click', pick);
    input.removeEventListener('change', onInput);
    host.removeEventListener('dragover', onDragOver);
    host.removeEventListener('dragleave', onDragLeave);
    host.removeEventListener('drop', onDrop);
  };
}
