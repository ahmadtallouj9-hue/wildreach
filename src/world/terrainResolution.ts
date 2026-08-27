/**
 * VYTHERA terrain voxel resolution.
 *
 * Two distinct grids exist and must never be conflated:
 *
 *   GAMEPLAY BLOCK   1.0 world units  — building, inventory, collision volumes
 *   TERRAIN VOXEL    0.25 world units — terrain elevation / surface silhouette
 *
 * Every conversion between them goes through this module. Do not scatter
 * literal 0.25 / 4 constants through the codebase.
 */

/** Size of one terrain voxel in world units. */
export const TERRAIN_VOXEL_SIZE = 0.25;

/** Size of one gameplay building block in world units. */
export const GAMEPLAY_BLOCK_SIZE = 1;

/** Terrain voxels per gameplay block along one axis (4 at 0.25). */
export const TERRAIN_SUBDIVISIONS = Math.round(GAMEPLAY_BLOCK_SIZE / TERRAIN_VOXEL_SIZE);

/** Terrain voxels contained in one gameplay block (64 at 0.25). */
export const TERRAIN_VOXELS_PER_BLOCK = TERRAIN_SUBDIVISIONS ** 3;

/**
 * Terrain representation mode.
 *
 * LEGACY          — surface snaps to whole gameplay blocks (pre-v6 behaviour).
 * HIGH_RESOLUTION — surface elevation resolves to TERRAIN_VOXEL_SIZE steps.
 *
 * Both modes share the same block storage, lighting, collision and save
 * format; HIGH_RESOLUTION adds a sub-block surface offset per column.
 */
export type TerrainResolutionMode = 'LEGACY' | 'HIGH_RESOLUTION';

export const DEFAULT_TERRAIN_MODE: TerrainResolutionMode = 'HIGH_RESOLUTION';

/** Number of distinct sub-block surface steps (0..TERRAIN_SUBDIVISIONS-1). */
export const SURFACE_STEPS = TERRAIN_SUBDIVISIONS;

/** Gameplay-block coordinate → terrain-voxel index. */
export function blockToTerrainVoxel(blockCoord: number): number {
  return Math.round(blockCoord * TERRAIN_SUBDIVISIONS);
}

/** Terrain-voxel index → world-unit coordinate. */
export function terrainVoxelToWorld(voxelIndex: number): number {
  return voxelIndex * TERRAIN_VOXEL_SIZE;
}

/** World-unit coordinate → terrain-voxel index (floor). */
export function worldToTerrainVoxel(world: number): number {
  return Math.floor(world / TERRAIN_VOXEL_SIZE);
}

/** World-unit coordinate → containing gameplay block index (floor). */
export function worldToBlock(world: number): number {
  return Math.floor(world / GAMEPLAY_BLOCK_SIZE);
}

/**
 * Snap a continuous height to the terrain voxel grid.
 * Deterministic: pure function of the input, no RNG, no accumulation.
 */
export function quantizeHeight(height: number, mode: TerrainResolutionMode = DEFAULT_TERRAIN_MODE): number {
  if (mode === 'LEGACY') return Math.floor(height);
  return Math.round(height / TERRAIN_VOXEL_SIZE) * TERRAIN_VOXEL_SIZE;
}

/**
 * Split a continuous height into whole-block height plus sub-block step.
 *
 * `blockHeight` is the topmost fully solid gameplay block (unchanged from the
 * legacy pipeline, so storage/light/collision stay valid). `step` is how many
 * terrain voxels of material sit on top of it, 0..SURFACE_STEPS-1.
 */
export function splitSurfaceHeight(
  height: number,
  mode: TerrainResolutionMode = DEFAULT_TERRAIN_MODE,
): { blockHeight: number; step: number } {
  if (mode === 'LEGACY') {
    return { blockHeight: Math.floor(height), step: 0 };
  }
  const q = quantizeHeight(height, mode);
  const blockHeight = Math.floor(q);
  const step = Math.round((q - blockHeight) / TERRAIN_VOXEL_SIZE);
  // Guard against float edge cases landing exactly on the next block.
  if (step >= SURFACE_STEPS) return { blockHeight: blockHeight + 1, step: 0 };
  return { blockHeight, step };
}

/** Recombine block height + sub-block step into a world-unit surface height. */
export function surfaceHeightFromStep(blockHeight: number, step: number): number {
  return blockHeight + step * TERRAIN_VOXEL_SIZE;
}

/** Vertical thickness in world units contributed by a surface step. */
export function stepThickness(step: number): number {
  return step * TERRAIN_VOXEL_SIZE;
}

/**
 * Material layer depths expressed in world units, converted to whole blocks.
 * Keeps material rules independent of the voxel resolution constant.
 */
export function worldUnitsToBlocks(units: number): number {
  return Math.max(1, Math.round(units / GAMEPLAY_BLOCK_SIZE));
}
