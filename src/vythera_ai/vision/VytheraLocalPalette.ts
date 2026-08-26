/** Local dominant-color extraction via canvas — no remote APIs. */

export interface VytheraExtractedPalette {
  type: 'vythera_palette';
  dominant: [number, number, number, number][];
  accents: [number, number, number, number][];
  shadows: [number, number, number, number][];
  highlights: [number, number, number, number][];
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function dist(
  a: [number, number, number, number],
  b: [number, number, number, number],
): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * Extract palette from ImageData using quantized bucket clustering.
 * Pure local CPU — never leaves the browser.
 */
export function extractPaletteFromImageData(
  data: ImageData,
  maxColors = 8,
): VytheraExtractedPalette {
  const buckets = new Map<string, { c: [number, number, number, number]; n: number }>();
  const step = Math.max(1, Math.floor(Math.sqrt((data.width * data.height) / 4000)));
  for (let y = 0; y < data.height; y += step) {
    for (let x = 0; x < data.width; x += step) {
      const i = (y * data.width + x) * 4;
      const a = data.data[i + 3]!;
      if (a < 32) continue;
      const r = data.data[i]! >> 4 << 4;
      const g = data.data[i + 1]! >> 4 << 4;
      const b = data.data[i + 2]! >> 4 << 4;
      const key = `${r},${g},${b}`;
      const hit = buckets.get(key);
      if (hit) hit.n++;
      else buckets.set(key, { c: [r, g, b, 255], n: 1 });
    }
  }
  const sorted = [...buckets.values()].sort((a, b) => b.n - a.n);
  const dominant: [number, number, number, number][] = [];
  for (const row of sorted) {
    if (dominant.length >= maxColors) break;
    if (dominant.some((d) => dist(d, row.c) < 28)) continue;
    dominant.push(row.c);
  }
  if (!dominant.length) dominant.push([128, 128, 128, 255]);

  const accents: [number, number, number, number][] = [];
  const shadows: [number, number, number, number][] = [];
  const highlights: [number, number, number, number][] = [];
  for (const c of dominant) {
    const L = luminance(c[0], c[1], c[2]);
    if (L < 70) shadows.push(c);
    else if (L > 190) highlights.push(c);
    else accents.push(c);
  }
  if (!shadows.length) {
    const d = dominant[0]!;
    shadows.push([
      clampByte(d[0] * 0.45),
      clampByte(d[1] * 0.45),
      clampByte(d[2] * 0.45),
      255,
    ]);
  }
  if (!highlights.length) {
    const d = dominant[0]!;
    highlights.push([
      clampByte(d[0] + (255 - d[0]) * 0.4),
      clampByte(d[1] + (255 - d[1]) * 0.4),
      clampByte(d[2] + (255 - d[2]) * 0.4),
      255,
    ]);
  }
  if (!accents.length) accents.push(dominant[Math.min(1, dominant.length - 1)]!);

  return {
    type: 'vythera_palette',
    dominant: dominant.slice(0, maxColors),
    accents: accents.slice(0, 4),
    shadows: shadows.slice(0, 4),
    highlights: highlights.slice(0, 4),
  };
}

export async function extractPaletteFromFile(file: File): Promise<VytheraExtractedPalette> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  const w = Math.min(256, bitmap.width);
  const h = Math.min(256, bitmap.height);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return extractPaletteFromImageData(ctx.getImageData(0, 0, w, h));
}

export function validatePalette(data: unknown): VytheraExtractedPalette {
  if (!data || typeof data !== 'object') throw new Error('palette must be object');
  const o = data as Record<string, unknown>;
  if (o.type !== 'vythera_palette') throw new Error('type must be vythera_palette');
  const read = (key: string): [number, number, number, number][] => {
    const arr = Array.isArray(o[key]) ? o[key] : [];
    const out: [number, number, number, number][] = [];
    for (const c of arr.slice(0, 16)) {
      if (!Array.isArray(c) || c.length < 3) throw new Error(`invalid ${key} color`);
      const r = Number(c[0]),
        g = Number(c[1]),
        b = Number(c[2]),
        a = c.length >= 4 ? Number(c[3]) : 255;
      if (![r, g, b, a].every((n) => Number.isFinite(n) && n >= 0 && n <= 255)) {
        throw new Error(`invalid ${key} channel`);
      }
      out.push([Math.round(r), Math.round(g), Math.round(b), Math.round(a)]);
    }
    return out;
  };
  return {
    type: 'vythera_palette',
    dominant: read('dominant'),
    accents: read('accents'),
    shadows: read('shadows'),
    highlights: read('highlights'),
  };
}
