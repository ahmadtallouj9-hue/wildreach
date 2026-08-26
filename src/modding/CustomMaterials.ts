import * as THREE from 'three';

/** Pixel resolution of each custom block texture. */
export const CUSTOM_TEX_SIZE = 16;
/** Max custom materials (ids 1…MAX). Id 0 = air. */
export const MAX_CUSTOM_MATERIALS = 64;
const ATLAS_GRID = 8;
const ATLAS_PX = CUSTOM_TEX_SIZE * ATLAS_GRID;

export interface CustomMaterial {
  id: number;
  name: string;
  /** Linear RGB 0–1. */
  color: [number, number, number];
  /** Optional RGBA pixels (16×16×4). When set, used instead of flat color. */
  pixels?: number[];
  /** Palette group for organized UI lists. */
  group?: string;
}

export interface CustomMaterialJson {
  id: number;
  name: string;
  color: [number, number, number];
  pixels?: number[];
  group?: string;
}

/** Default studio blocks — full hue range + neutrals (leaves room under MAX for customs). */
const DEFAULT_COLORS: [string, [number, number, number], string][] = [
  // Warm
  ['Red', [0.86, 0.28, 0.28], 'Warm'],
  ['Crimson', [0.72, 0.12, 0.22], 'Warm'],
  ['Coral', [0.95, 0.48, 0.42], 'Warm'],
  ['Salmon', [0.95, 0.58, 0.52], 'Warm'],
  ['Orange', [0.92, 0.55, 0.22], 'Warm'],
  ['Amber', [0.94, 0.68, 0.18], 'Warm'],
  ['Gold', [0.9, 0.74, 0.28], 'Warm'],
  ['Yellow', [0.95, 0.82, 0.28], 'Warm'],
  ['Cream', [0.96, 0.92, 0.78], 'Warm'],
  ['Peach', [0.98, 0.78, 0.62], 'Warm'],
  // Green
  ['Lime', [0.62, 0.88, 0.28], 'Green'],
  ['Chartreuse', [0.78, 0.9, 0.22], 'Green'],
  ['Green', [0.32, 0.72, 0.42], 'Green'],
  ['Forest', [0.18, 0.48, 0.28], 'Green'],
  ['Olive', [0.52, 0.56, 0.28], 'Green'],
  ['Mint', [0.55, 0.88, 0.72], 'Green'],
  // Cool
  ['Teal', [0.22, 0.72, 0.68], 'Cool'],
  ['Cyan', [0.28, 0.82, 0.88], 'Cool'],
  ['Turquoise', [0.25, 0.78, 0.76], 'Cool'],
  ['Sky', [0.48, 0.72, 0.94], 'Cool'],
  ['Blue', [0.28, 0.48, 0.86], 'Cool'],
  ['Cobalt', [0.18, 0.36, 0.78], 'Cool'],
  ['Navy', [0.14, 0.22, 0.48], 'Cool'],
  ['Indigo', [0.32, 0.28, 0.72], 'Cool'],
  // Violet / pink
  ['Purple', [0.58, 0.36, 0.82], 'Violet'],
  ['Violet', [0.52, 0.28, 0.78], 'Violet'],
  ['Lavender', [0.72, 0.62, 0.9], 'Violet'],
  ['Magenta', [0.86, 0.28, 0.72], 'Violet'],
  ['Pink', [0.9, 0.45, 0.68], 'Violet'],
  ['Rose', [0.88, 0.38, 0.52], 'Violet'],
  ['Plum', [0.52, 0.28, 0.48], 'Violet'],
  // Neutrals / earth
  ['White', [0.94, 0.95, 0.97], 'Neutral'],
  ['Ivory', [0.96, 0.94, 0.88], 'Neutral'],
  ['Sand', [0.88, 0.8, 0.62], 'Neutral'],
  ['Tan', [0.78, 0.64, 0.48], 'Neutral'],
  ['Brown', [0.52, 0.35, 0.22], 'Neutral'],
  ['Cocoa', [0.38, 0.24, 0.16], 'Neutral'],
  ['Maroon', [0.48, 0.14, 0.18], 'Neutral'],
  ['Gray', [0.5, 0.52, 0.55], 'Neutral'],
  ['Slate', [0.38, 0.42, 0.48], 'Neutral'],
  ['Charcoal', [0.24, 0.26, 0.28], 'Neutral'],
  ['Black', [0.12, 0.13, 0.15], 'Neutral'],
];

function solidPixels(color: [number, number, number]): number[] {
  const r = Math.round(color[0] * 255);
  const g = Math.round(color[1] * 255);
  const b = Math.round(color[2] * 255);
  const out: number[] = [];
  for (let i = 0; i < CUSTOM_TEX_SIZE * CUSTOM_TEX_SIZE; i++) {
    out.push(r, g, b, 255);
  }
  return out;
}

function tintPixels(base: number[], color: [number, number, number]): number[] {
  const out = base.slice();
  for (let i = 0; i < out.length; i += 4) {
    out[i] = Math.round((out[i]! / 255) * color[0] * 255);
    out[i + 1] = Math.round((out[i + 1]! / 255) * color[1] * 255);
    out[i + 2] = Math.round((out[i + 2]! / 255) * color[2] * 255);
  }
  return out;
}

/** Runtime palette of custom color/texture blocks for the mod studio. */
export class CustomMaterialPalette {
  private materials = new Map<number, CustomMaterial>();
  private nextId = 1;
  readonly atlasCanvas: HTMLCanvasElement;
  readonly atlasTexture: THREE.CanvasTexture;
  private listeners = new Set<() => void>();

  constructor() {
    this.atlasCanvas = document.createElement('canvas');
    this.atlasCanvas.width = ATLAS_PX;
    this.atlasCanvas.height = ATLAS_PX;
    this.atlasTexture = new THREE.CanvasTexture(this.atlasCanvas);
    this.atlasTexture.magFilter = THREE.NearestFilter;
    this.atlasTexture.minFilter = THREE.NearestFilter;
    this.atlasTexture.colorSpace = THREE.SRGBColorSpace;
    this.atlasTexture.premultiplyAlpha = false;
    this.resetDefaults();
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(): void {
    this.rebuildAtlas();
    for (const cb of this.listeners) cb();
  }

  resetDefaults(): void {
    this.materials.clear();
    this.nextId = 1;
    for (const [name, color, group] of DEFAULT_COLORS) {
      this.addMaterial(name, color, undefined, false, group);
    }
    this.emit();
  }

  list(): CustomMaterial[] {
    return [...this.materials.values()].sort((a, b) => a.id - b.id);
  }

  get(id: number): CustomMaterial | undefined {
    return this.materials.get(id);
  }

  has(id: number): boolean {
    return this.materials.has(id);
  }

  defaultBrush(): number {
    return this.list()[0]?.id ?? 1;
  }

  addMaterial(
    name: string,
    color: [number, number, number],
    pixels?: number[],
    notify = true,
    group = 'Custom',
  ): CustomMaterial | null {
    if (this.materials.size >= MAX_CUSTOM_MATERIALS) return null;
    while (this.materials.has(this.nextId) && this.nextId <= MAX_CUSTOM_MATERIALS) {
      this.nextId++;
    }
    if (this.nextId > MAX_CUSTOM_MATERIALS) return null;
    const mat: CustomMaterial = {
      id: this.nextId++,
      name: name.trim() || `Color ${this.materials.size + 1}`,
      color,
      pixels: pixels?.length === CUSTOM_TEX_SIZE * CUSTOM_TEX_SIZE * 4 ? pixels.slice() : undefined,
      group,
    };
    this.materials.set(mat.id, mat);
    if (notify) this.emit();
    return mat;
  }

  updateMaterial(id: number, patch: Partial<Pick<CustomMaterial, 'name' | 'color' | 'pixels'>>): void {
    const mat = this.materials.get(id);
    if (!mat) return;
    if (patch.name !== undefined) mat.name = patch.name.trim() || mat.name;
    if (patch.color) mat.color = [...patch.color] as [number, number, number];
    if (patch.pixels !== undefined) {
      mat.pixels =
        patch.pixels && patch.pixels.length === CUSTOM_TEX_SIZE * CUSTOM_TEX_SIZE * 4
          ? patch.pixels.slice()
          : undefined;
    }
    this.emit();
  }

  /** Patch one tile's pixels and upload only that region (no full atlas rebuild). */
  patchTilePixels(id: number, pixels: number[], notify = false): void {
    const mat = this.materials.get(id);
    if (!mat || pixels.length !== CUSTOM_TEX_SIZE * CUSTOM_TEX_SIZE * 4) return;
    mat.pixels = pixels.slice();
    this.uploadTileRegion(id);
    if (notify) {
      for (const cb of this.listeners) cb();
    }
  }

  /** Upload a single material tile from its pixel buffer to the GPU atlas. */
  uploadTileRegion(id: number): void {
    const mat = this.materials.get(id);
    if (!mat) return;
    const pixels = mat.pixels?.length ? mat.pixels : solidPixels(mat.color);
    const tile = mat.id - 1;
    if (tile < 0 || tile >= ATLAS_GRID * ATLAS_GRID) return;
    const col = tile % ATLAS_GRID;
    const row = Math.floor(tile / ATLAS_GRID);
    const ox = col * CUSTOM_TEX_SIZE;
    const oy = row * CUSTOM_TEX_SIZE;
    const ctx = this.atlasCanvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const img = ctx.createImageData(CUSTOM_TEX_SIZE, CUSTOM_TEX_SIZE);
    for (let i = 0; i < pixels.length; i++) img.data[i] = pixels[i]!;
    ctx.putImageData(img, ox, oy);
    this.atlasTexture.needsUpdate = true;
  }

  removeMaterial(id: number): void {
    if (this.materials.size <= 1) return;
    this.materials.delete(id);
    this.emit();
  }

  /** UV for material tile (greedy mesher). */
  tileUv(id: number): { u0: number; v0: number; u1: number; v1: number } {
    const tile = Math.max(0, Math.min(ATLAS_GRID * ATLAS_GRID - 1, id - 1));
    const col = tile % ATLAS_GRID;
    const row = Math.floor(tile / ATLAS_GRID);
    const s = 1 / ATLAS_GRID;
    const pad = 0.5 / ATLAS_PX;
    return {
      u0: col * s + pad,
      v0: 1 - (row + 1) * s + pad,
      u1: (col + 1) * s - pad,
      v1: 1 - row * s - pad,
    };
  }

  cssColor(id: number): string {
    const mat = this.materials.get(id);
    if (!mat) return '#888';
    const [r, g, b] = mat.color;
    return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
  }

  toJson(): CustomMaterialJson[] {
    return this.list().map((m) => ({
      id: m.id,
      name: m.name,
      color: [...m.color] as [number, number, number],
      pixels: m.pixels ? m.pixels.slice() : undefined,
      group: m.group,
    }));
  }

  loadFromJson(entries: CustomMaterialJson[]): void {
    this.materials.clear();
    this.nextId = 1;
    for (const e of entries) {
      if (!e || typeof e.id !== 'number' || e.id < 1) continue;
      const color = Array.isArray(e.color) && e.color.length === 3
        ? ([e.color[0], e.color[1], e.color[2]] as [number, number, number])
        : ([0.7, 0.7, 0.7] as [number, number, number]);
      this.materials.set(e.id, {
        id: e.id,
        name: String(e.name || `Color ${e.id}`),
        color,
        pixels:
          Array.isArray(e.pixels) && e.pixels.length === CUSTOM_TEX_SIZE * CUSTOM_TEX_SIZE * 4
            ? e.pixels.slice()
            : undefined,
        group: typeof e.group === 'string' ? e.group : 'Custom',
      });
      this.nextId = Math.max(this.nextId, e.id + 1);
    }
    if (!this.materials.size) this.resetDefaults();
    else this.emit();
  }

  private rebuildAtlas(): void {
    const ctx = this.atlasCanvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, ATLAS_PX, ATLAS_PX);
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, ATLAS_PX, ATLAS_PX);

    for (const mat of this.materials.values()) {
      const tile = mat.id - 1;
      if (tile < 0 || tile >= ATLAS_GRID * ATLAS_GRID) continue;
      const col = tile % ATLAS_GRID;
      const row = Math.floor(tile / ATLAS_GRID);
      const ox = col * CUSTOM_TEX_SIZE;
      const oy = row * CUSTOM_TEX_SIZE;
      const pixels = mat.pixels?.length
        ? mat.pixels
        : solidPixels(mat.color);
      const img = ctx.createImageData(CUSTOM_TEX_SIZE, CUSTOM_TEX_SIZE);
      for (let i = 0; i < pixels.length; i++) img.data[i] = pixels[i]!;
      ctx.putImageData(img, ox, oy);
    }
    this.atlasTexture.needsUpdate = true;
  }
}

export function hexToRgb01(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) return [0.7, 0.7, 0.7];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgb01ToHex(c: [number, number, number]): string {
  const r = Math.round(c[0] * 255);
  const g = Math.round(c[1] * 255);
  const b = Math.round(c[2] * 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export { solidPixels, tintPixels };
