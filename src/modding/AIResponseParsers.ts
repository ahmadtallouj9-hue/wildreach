import { extractVytheraJson } from '../vythera_ai/util/extractJson';
import { CUSTOM_TEX_SIZE, type CustomMaterialPalette } from './CustomMaterials';
import { LOCAL_GRID_SIZE } from './constants';
import type { LocalVoxelGrid } from './LocalVoxelGrid';
import { identityQuat, type ModKeyframe, type ModPart, type Quat, type Vec3 } from './ModAsset';

export interface AiVoxelSpec {
  x: number;
  y: number;
  z: number;
  color: string;
  layer?: string;
}

export interface AiVoxelModel {
  resolution: [number, number, number];
  voxels: AiVoxelSpec[];
}

export interface AiAnimKey {
  timestamp: number;
  bone_name: string;
  position: [number, number, number];
  rotation_quaternion_xyzw: [number, number, number, number];
}

export interface AiAnimClip {
  name: string;
  fps: number;
  keyframes: AiAnimKey[];
}

export interface AiTextureSpec {
  name: string;
  size: number;
  pixels_base64_png?: string;
  palette?: string[];
  rows?: string[];
}

function clampInt(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}

function parseHex(color: string): [number, number, number] | null {
  const m = color.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function ensureColorMat(
  palette: CustomMaterialPalette,
  hex: string,
  cache: Map<string, number>,
): number {
  const key = hex.toLowerCase();
  const hit = cache.get(key);
  if (hit != null) return hit;
  const rgb = parseHex(hex) ?? [0.55, 0.55, 0.58];
  const name = `AI ${key}`;
  const existing = palette.list().find((m) => m.name.toLowerCase() === name.toLowerCase());
  const id =
    existing?.id ??
    palette.addMaterial(name, rgb, undefined, true, 'AI')?.id ??
    palette.defaultBrush();
  if (existing) palette.updateMaterial(existing.id, { color: rgb });
  cache.set(key, id);
  return id;
}

/** Validate + normalize voxel JSON from the LLM. */
export function parseVoxelModel(raw: string | unknown): AiVoxelModel {
  const data = typeof raw === 'string' ? (extractVytheraJson(raw) as Record<string, unknown>) : (raw as Record<string, unknown>);
  const resRaw = Array.isArray(data.resolution) ? data.resolution : [LOCAL_GRID_SIZE, LOCAL_GRID_SIZE, LOCAL_GRID_SIZE];
  const resolution: [number, number, number] = [
    clampInt(Number(resRaw[0]) || LOCAL_GRID_SIZE, 16, 128),
    clampInt(Number(resRaw[1]) || LOCAL_GRID_SIZE, 16, 128),
    clampInt(Number(resRaw[2]) || LOCAL_GRID_SIZE, 16, 128),
  ];
  const list = Array.isArray(data.voxels) ? data.voxels : [];
  const voxels: AiVoxelSpec[] = [];
  for (const v of list) {
    if (!v || typeof v !== 'object') continue;
    const o = v as Record<string, unknown>;
    const x = Number(o.x);
    const y = Number(o.y);
    const z = Number(o.z);
    if (![x, y, z].every(Number.isFinite)) continue;
    const color = typeof o.color === 'string' ? o.color : '#888888';
    voxels.push({
      x: clampInt(x, 0, resolution[0] - 1),
      y: clampInt(y, 0, resolution[1] - 1),
      z: clampInt(z, 0, resolution[2] - 1),
      color,
      layer: typeof o.layer === 'string' ? o.layer : 'base',
    });
  }
  if (!voxels.length) throw new Error('Voxel JSON had no valid voxels');
  return { resolution, voxels };
}

/**
 * Apply voxels into the editor grid in batches.
 * Centers smaller resolutions inside LOCAL_GRID_SIZE.
 * Calls onBatch after each chunk so the viewport can rebuildMesh live.
 */
export async function applyVoxelModelStreaming(
  grid: LocalVoxelGrid,
  palette: CustomMaterialPalette,
  model: AiVoxelModel,
  opts: {
    clearFirst?: boolean;
    batchSize?: number;
    signal?: AbortSignal;
    onBatch?: (placed: number, total: number) => void;
  } = {},
): Promise<number> {
  const batchSize = opts.batchSize ?? 96;
  if (opts.clearFirst !== false) grid.clear();
  const [rw, rh, rd] = model.resolution;
  const ox = Math.floor((LOCAL_GRID_SIZE - Math.min(rw, LOCAL_GRID_SIZE)) / 2);
  const oy = Math.floor((LOCAL_GRID_SIZE - Math.min(rh, LOCAL_GRID_SIZE)) / 2);
  const oz = Math.floor((LOCAL_GRID_SIZE - Math.min(rd, LOCAL_GRID_SIZE)) / 2);
  const cache = new Map<string, number>();
  let placed = 0;
  const total = model.voxels.length;

  for (let i = 0; i < model.voxels.length; i++) {
    if (opts.signal?.aborted) break;
    const v = model.voxels[i]!;
    const x = v.x + ox;
    const y = v.y + oy;
    const z = v.z + oz;
    if (!grid.inBounds(x, y, z)) continue;
    const id = ensureColorMat(palette, v.color, cache);
    grid.set(x, y, z, id);
    if (v.layer === 'overlay') grid.setEmissive(x, y, z, true);
    placed++;
    if (placed % batchSize === 0 || i === model.voxels.length - 1) {
      opts.onBatch?.(placed, total);
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
    }
  }
  return placed;
}

function boneToPartId(name: string, parts: ModPart[]): string {
  const n = name.toLowerCase();
  const hit = parts.find((p) => p.name.toLowerCase() === n || p.id.toLowerCase() === n);
  if (hit) return hit.id;
  if (/head/.test(n)) return parts.find((p) => /head/i.test(p.name))?.id ?? parts[0]!.id;
  if (/arm.*l|left.?arm/.test(n)) return parts.find((p) => /arm.*l|left/i.test(p.name))?.id ?? parts[0]!.id;
  if (/arm.*r|right.?arm/.test(n)) return parts.find((p) => /arm.*r|right/i.test(p.name))?.id ?? parts[0]!.id;
  if (/leg.*l|left.?leg/.test(n)) return parts.find((p) => /leg.*l|left/i.test(p.name))?.id ?? parts[0]!.id;
  if (/leg.*r|right.?leg/.test(n)) return parts.find((p) => /leg.*r|right/i.test(p.name))?.id ?? parts[0]!.id;
  return parts[0]?.id ?? 'root';
}

export function parseAnimClip(raw: string | unknown): AiAnimClip {
  const data = typeof raw === 'string' ? (extractVytheraJson(raw) as Record<string, unknown>) : (raw as Record<string, unknown>);
  const keys = Array.isArray(data.keyframes) ? data.keyframes : [];
  const keyframes: AiAnimKey[] = [];
  for (const k of keys) {
    if (!k || typeof k !== 'object') continue;
    const o = k as Record<string, unknown>;
    const pos = Array.isArray(o.position) ? o.position : [0, 0, 0];
    const quat = Array.isArray(o.rotation_quaternion_xyzw) ? o.rotation_quaternion_xyzw : [0, 0, 0, 1];
    keyframes.push({
      timestamp: Number(o.timestamp) || 0,
      bone_name: typeof o.bone_name === 'string' ? o.bone_name : 'Body',
      position: [Number(pos[0]) || 0, Number(pos[1]) || 0, Number(pos[2]) || 0],
      rotation_quaternion_xyzw: [
        Number(quat[0]) || 0,
        Number(quat[1]) || 0,
        Number(quat[2]) || 0,
        Number(quat[3]) || 1,
      ],
    });
  }
  if (!keyframes.length) throw new Error('Animation JSON had no keyframes');
  return {
    name: typeof data.name === 'string' ? data.name : 'AI Clip',
    fps: Math.max(1, Number(data.fps) || 30),
    keyframes,
  };
}

export function animClipToModKeyframes(clip: AiAnimClip, parts: ModPart[]): ModKeyframe[] {
  const out: ModKeyframe[] = [];
  for (const k of clip.keyframes) {
    const [qx, qy, qz, qw] = k.rotation_quaternion_xyzw;
    const rot: Quat = { x: qx, y: qy, z: qz, w: qw || 1 };
    const len = Math.hypot(rot.x, rot.y, rot.z, rot.w) || 1;
    rot.x /= len;
    rot.y /= len;
    rot.z /= len;
    rot.w /= len;
    const position: Vec3 = { x: k.position[0], y: k.position[1], z: k.position[2] };
    out.push({
      frame: Math.max(0, Math.round(k.timestamp * clip.fps)),
      partId: boneToPartId(k.bone_name, parts),
      position,
      rotation: rot,
    });
  }
  if (!out.length) {
    out.push({
      frame: 0,
      partId: parts[0]?.id ?? 'root',
      position: { x: 0, y: 0, z: 0 },
      rotation: identityQuat(),
    });
  }
  return out;
}

export function parseTextureSpec(raw: string | unknown): AiTextureSpec {
  const data = typeof raw === 'string' ? (extractVytheraJson(raw) as Record<string, unknown>) : (raw as Record<string, unknown>);
  return {
    name: typeof data.name === 'string' ? data.name : 'AI Tex',
    size: clampInt(Number(data.size) || CUSTOM_TEX_SIZE, 8, 64),
    pixels_base64_png: typeof data.pixels_base64_png === 'string' ? data.pixels_base64_png : undefined,
    palette: Array.isArray(data.palette) ? data.palette.filter((p): p is string => typeof p === 'string') : undefined,
    rows: Array.isArray(data.rows) ? data.rows.filter((r): r is string => typeof r === 'string') : undefined,
  };
}

/** Convert AI texture JSON into RGBA pixels for CUSTOM_TEX_SIZE. */
export async function textureSpecToPixels(spec: AiTextureSpec): Promise<number[]> {
  const size = CUSTOM_TEX_SIZE;
  const out = new Array(size * size * 4).fill(0);

  if (spec.pixels_base64_png) {
    const b64 = spec.pixels_base64_png.replace(/^data:image\/\w+;base64,/, '');
    const url = `data:image/png;base64,${b64}`;
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
    for (let i = 0; i < out.length; i++) out[i] = data[i]!;
    return out;
  }

  const palette = spec.palette?.length ? spec.palette : ['#2B2A2D', '#FAFAFA', '#3EBBA5', '#C45C26'];
  const rows = spec.rows ?? [];
  for (let y = 0; y < size; y++) {
    const row = rows[y] ?? '';
    for (let x = 0; x < size; x++) {
      const ch = row[x] ?? '.';
      const i = (y * size + x) * 4;
      if (ch === '.' || ch === ' ') continue;
      const idx = /[0-9]/.test(ch) ? Number(ch) % palette.length : (ch.charCodeAt(0) - 97) % palette.length;
      const rgb = parseHex(palette[Math.abs(idx)] ?? '#888888') ?? [0.5, 0.5, 0.5];
      out[i] = Math.round(rgb[0] * 255);
      out[i + 1] = Math.round(rgb[1] * 255);
      out[i + 2] = Math.round(rgb[2] * 255);
      out[i + 3] = 255;
    }
  }
  // If empty, stamp a simple checker so the user sees something
  if (out.every((v, i) => (i % 4 === 3 ? true : v === 0))) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const on = (x + y) % 2 === 0;
        out[i] = on ? 62 : 30;
        out[i + 1] = on ? 187 : 40;
        out[i + 2] = on ? 165 : 48;
        out[i + 3] = 255;
      }
    }
  }
  return out;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode AI texture image'));
    img.src = url;
  });
}
