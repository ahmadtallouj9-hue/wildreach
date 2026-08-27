/**
 * Preview-only quality and per-view budgets.
 *
 * Nothing in this file belongs to a world style. A quality level changes how
 * much of the world the editor draws and how finely it draws the distance — it
 * never changes the terrain the style describes, so two creators on different
 * machines still design the same world. That separation is why quality lives
 * here instead of in VytheraWorldStyle.
 */
import type { ViewName } from './CameraRig';

export const PREVIEW_QUALITIES = ['fast', 'balanced', 'high', 'ultra'] as const;
export type PreviewQuality = (typeof PREVIEW_QUALITIES)[number];

export const DEFAULT_QUALITY: PreviewQuality = 'balanced';

/** Distance bands, in world blocks, at which vegetation drops a detail level. */
export interface VegetationBands {
  /** Full geometry: trunk plus shaped crown. */
  near: number;
  /** Simplified geometry: coarser crown, no separate trunk. */
  medium: number;
  /** Cheapest recognisable form: a single billboard cross. */
  far: number;
  /** Ground cover is only legible close in, so it gets its own shorter reach. */
  cover: number;
}

export interface QualityProfile {
  id: PreviewQuality;
  label: string;
  /** Shown under the selector; must stay honest about cost. */
  note: string;
  /** Square preview extent in world blocks. */
  regionBlocks: number;
  /** Tiles whose centre is beyond this from the eye are not built at all. */
  terrainRadius: number;
  /**
   * Divides the distance at which terrain LOD coarsens. Larger means detail is
   * dropped sooner with distance, which is the main terrain cost lever.
   */
  lodFalloff: number;
  /** Build a coarse pass first when the resolution is expensive. */
  progressive: boolean;
  vegetation: VegetationBands;
  /** Scales the hard per-kind instance ceilings. */
  vegetationBudget: number;
}

const PROFILES: Record<PreviewQuality, QualityProfile> = {
  fast: {
    id: 'fast',
    label: 'Fast',
    note: 'Smallest area, quickest rebuilds. Best while dragging sliders.',
    regionBlocks: 256,
    terrainRadius: 380,
    lodFalloff: 260,
    progressive: true,
    vegetation: { near: 70, medium: 150, far: 240, cover: 55 },
    vegetationBudget: 0.5,
  },
  balanced: {
    id: 'balanced',
    label: 'Balanced',
    note: 'Recommended. Full landscape with distance detail reduction.',
    regionBlocks: 512,
    terrainRadius: 620,
    lodFalloff: 420,
    progressive: true,
    vegetation: { near: 110, medium: 240, far: 420, cover: 90 },
    vegetationBudget: 1,
  },
  high: {
    id: 'high',
    label: 'High',
    note: 'More distant detail. Rebuilds take noticeably longer.',
    regionBlocks: 512,
    terrainRadius: 800,
    lodFalloff: 700,
    progressive: true,
    vegetation: { near: 150, medium: 330, far: 560, cover: 120 },
    vegetationBudget: 1.5,
  },
  ultra: {
    id: 'ultra',
    label: 'Ultra',
    note: 'Maximum detail for final checks. Expect multi-second rebuilds.',
    regionBlocks: 512,
    terrainRadius: 1000,
    lodFalloff: 1100,
    progressive: false,
    vegetation: { near: 200, medium: 440, far: 760, cover: 160 },
    vegetationBudget: 2.2,
  },
};

export function qualityProfile(q: PreviewQuality): QualityProfile {
  return PROFILES[q] ?? PROFILES.balanced;
}

/**
 * Per-view emphasis applied on top of the quality profile.
 *
 * Each preview view is answering a different question, so each one spends its
 * budget differently. Ground is judged on voxel size underfoot, hilltop on the
 * shape of the land, and panorama on the whole composition — there is no single
 * setting that serves all three well.
 */
export interface ViewProfile {
  /** Multiplies terrainRadius. */
  radius: number;
  /** Multiplies lodFalloff. Below 1 means detail is shed sooner with distance. */
  lod: number;
  /** Multiplies the vegetation band distances. */
  vegetation: number;
  /** Multiplies the ground-cover reach specifically. */
  cover: number;
}

const VIEW_PROFILES: Record<ViewName, ViewProfile> = {
  // Wide composition. The eye reads mountains, valleys, water and forest
  // masses, so reach is long but per-plant detail falls away quickly.
  panorama: { radius: 1.35, lod: 0.72, vegetation: 1.3, cover: 0.45 },
  // Silhouette and landform. Distance LOD can be aggressive here because
  // nothing near the camera is under inspection.
  hilltop: { radius: 1.1, lod: 0.8, vegetation: 1.1, cover: 0.7 },
  // Voxel size, materials and nearby planting are the whole point, so detail
  // is concentrated in a short radius rather than spread thin.
  ground: { radius: 0.55, lod: 1.6, vegetation: 0.8, cover: 1.6 },
};

export function viewProfile(view: ViewName): ViewProfile {
  return VIEW_PROFILES[view] ?? VIEW_PROFILES.panorama;
}

/** Terrain build budget for a quality level seen through a particular view. */
export interface TerrainBudget {
  regionBlocks: number;
  radius: number;
  lodFalloff: number;
  progressive: boolean;
}

export function terrainBudget(q: PreviewQuality, view: ViewName): TerrainBudget {
  const p = qualityProfile(q);
  const v = viewProfile(view);
  return {
    regionBlocks: p.regionBlocks,
    radius: p.terrainRadius * v.radius,
    lodFalloff: p.lodFalloff * v.lod,
    progressive: p.progressive,
  };
}

export function vegetationBands(q: PreviewQuality, view: ViewName): VegetationBands {
  const p = qualityProfile(q);
  const v = viewProfile(view);
  return {
    near: p.vegetation.near * v.vegetation,
    medium: p.vegetation.medium * v.vegetation,
    far: p.vegetation.far * v.vegetation,
    cover: p.vegetation.cover * v.cover,
  };
}

/**
 * Resolutions we know are slow enough to deserve a warning before the player
 * waits on them. Kept honest rather than hidden: 0.125 stays selectable.
 */
export function resolutionWarning(r: number, q: PreviewQuality): string | null {
  if (r > 0.125) return null;
  const p = qualityProfile(q);
  if (p.id === 'fast') return 'Ultra resolution. Preview may take longer.';
  return 'Ultra resolution. Preview may take several seconds to rebuild.';
}
