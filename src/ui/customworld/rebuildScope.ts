/**
 * Which parts of the preview an edit invalidates.
 *
 * Kept separate from the editor so the dependency rules can be tested without
 * a browser, and so it is obvious in one place why a cloud slider does not
 * regenerate mountains.
 */
import type { StyleGroup } from '../../world/style/WorldStyle';

/** Ordered cheapest to most expensive. */
export type RebuildScope = 'sky' | 'vegetation' | 'terrain';

export const SCOPE_WEIGHT: Record<RebuildScope, number> = {
  sky: 0,
  vegetation: 1,
  terrain: 2,
};

/**
 * Atmosphere is uniforms and lights only. Vegetation reuses the terrain mesh
 * already on screen. Landform, water and biome edits move the ground itself or
 * the material bands painted on it, so they need the full pass.
 */
export function scopeForGroup(group: StyleGroup): RebuildScope {
  if (group === 'atmosphere') return 'sky';
  if (group === 'vegetation') return 'vegetation';
  return 'terrain';
}

/** Coalesce two pending scopes into the one that covers both. */
export function widestScope(a: RebuildScope, b: RebuildScope): RebuildScope {
  return SCOPE_WEIGHT[a] >= SCOPE_WEIGHT[b] ? a : b;
}
