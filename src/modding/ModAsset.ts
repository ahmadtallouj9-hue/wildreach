import type { EaseType } from './Easing';
import type { ModRule } from './ModLogicParser';
import type { LocalModelData } from './LocalVoxelGrid';
import { exportGridAsModelData, exportModShape, type ModShapeExport } from './ModShapeExport';
import type { LocalVoxelGrid } from './LocalVoxelGrid';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** Cubic-bezier handles for easing to the next keyframe (P0=0,0 P3=1,1). */
export interface ModEaseCurve {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export type ModMotionPreset =
  | 'float'
  | 'spin'
  | 'wobble'
  | 'heartbeat'
  | 'pulse'
  | 'shake'
  | 'nod'
  | 'orbit';

/** Voxel group with a pivot for animation (Phase 2). */
export interface ModPart {
  id: string;
  name: string;
  pivot: Vec3;
  /** Parent part id for hierarchy (omit / undefined = Body root). */
  parentId?: string;
  /** Hidden in viewport when true. */
  hidden?: boolean;
  /** Procedural idle motion layered during playback. */
  motionPreset?: ModMotionPreset;
}

/** Rotation/translation/scale keyframe (Phase 2 playback). */
export interface ModKeyframe {
  frame: number;
  partId: string;
  position: Vec3;
  rotation: Quat;
  /** Optional scale channel (defaults to 1,1,1 when absent). */
  scale?: Vec3;
  /** Named easing out of this key (CapCut-style). */
  easeType?: EaseType;
  /** Custom bezier when easeType is custom or smooth. */
  ease?: ModEaseCurve;
}

/** Compiled logic rules bundled for runtime load. */
export interface ModLogicBundle {
  version: 1;
  scripts: string[];
  rules: Array<{ trigger: string; command: string; args: string[] }>;
}

/** Full mod bundle: shape + animation + logic. */
export interface ModAsset {
  version: 1;
  name: string;
  shape: LocalModelData;
  parts: ModPart[];
  /** Legacy flat timeline (kept in sync with the active clip). */
  keyframes: ModKeyframe[];
  /** Named Blockbench-style clips (optional; migrated from keyframes on load). */
  clips?: import('./ModClip').ModAnimationClip[];
  scripts: string[];
  /** Pre-parsed logic for game engine (optional; rebuilt on import if missing). */
  logic?: ModLogicBundle;
}

export function defaultRootPart(): ModPart {
  return {
    id: 'root',
    name: 'Body',
    pivot: { x: 8, y: 8, z: 8 },
  };
}

export function identityQuat(): Quat {
  return { x: 0, y: 0, z: 0, w: 1 };
}

export function unitScale(): Vec3 {
  return { x: 1, y: 1, z: 1 };
}

export function createModAsset(name: string, shape: LocalModelData): ModAsset {
  return {
    version: 1,
    name,
    shape,
    parts: [defaultRootPart()],
    keyframes: [],
    scripts: [],
  };
}

/** Build a ModAsset from the live editor grid (includes palette + masks). */
export function createModAssetFromGrid(
  name: string,
  grid: LocalVoxelGrid,
  partMask?: number[],
): ModAsset {
  return createModAsset(name, exportGridAsModelData(grid, partMask));
}

/** Attach compiled logic rules to an asset before save/export. */
export function bundleModLogic(asset: ModAsset, rules: ModRule[]): ModAsset {
  return {
    ...asset,
    logic: {
      version: 1,
      scripts: [...asset.scripts],
      rules: rules.map((r) => ({
        trigger: r.trigger,
        command: r.command,
        args: [...r.args],
      })),
    },
  };
}

/** Full Phase-1 shape export (voxelData + palette) for tooling / Phase 2. */
export function exportModAssetShape(name: string, grid: LocalVoxelGrid): ModShapeExport & { name: string } {
  return { name, ...exportModShape(grid) };
}

export function modAssetToJson(asset: ModAsset): string {
  return JSON.stringify(asset, null, 2);
}

export function modAssetFromJson(raw: string): ModAsset {
  const data = JSON.parse(raw) as ModAsset & { shape?: LocalModelData & { voxelData?: number[] } };
  const shapeRaw = data.shape;
  if (data.version !== 1 || !shapeRaw) {
    throw new Error('Invalid mod file');
  }
  const voxels = Array.isArray(shapeRaw.voxels)
    ? shapeRaw.voxels
    : Array.isArray(shapeRaw.voxelData)
      ? shapeRaw.voxelData
      : null;
  if (!voxels) throw new Error('Invalid mod file');

  const shape: LocalModelData = {
    version: 1,
    size: shapeRaw.size ?? 16,
    voxels,
    palette: Array.isArray(shapeRaw.palette) ? shapeRaw.palette : undefined,
    usedBlocks: Array.isArray(shapeRaw.usedBlocks) ? shapeRaw.usedBlocks : undefined,
    partMask: Array.isArray(shapeRaw.partMask) ? shapeRaw.partMask : undefined,
    emissiveMask: Array.isArray(shapeRaw.emissiveMask) ? shapeRaw.emissiveMask : undefined,
  };

  const scripts = Array.isArray(data.scripts)
    ? data.scripts
    : data.logic?.scripts ?? [];

  const keyframes = Array.isArray(data.keyframes) ? data.keyframes : [];
  let clips = Array.isArray((data as ModAsset).clips) ? (data as ModAsset).clips : undefined;
  if (!clips?.length) {
    let maxF = 0;
    for (const kf of keyframes) maxF = Math.max(maxF, kf.frame);
    clips = [
      {
        id: 'clip-default',
        name: 'default',
        fps: 30,
        duration: Math.max(48, maxF),
        loop: 'loop',
        keyframes,
      },
    ];
  }

  return {
    version: 1,
    name: String(data.name || 'Untitled'),
    shape,
    parts: Array.isArray(data.parts) && data.parts.length ? data.parts : [defaultRootPart()],
    keyframes: clips[0]?.keyframes ?? keyframes,
    clips,
    scripts,
    logic: data.logic?.version === 1 ? data.logic : undefined,
  };
}

export function downloadModFile(asset: ModAsset): void {
  const blob = new Blob([modAssetToJson(asset)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const slug = asset.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'mod';
  a.href = url;
  a.download = `${slug}.mod.json`;
  a.click();
  URL.revokeObjectURL(url);
}
