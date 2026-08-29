/**
 * VYTHERA world scale — the single source of truth for spatial size.
 *
 * Three spaces exist and must never be conflated:
 *
 *   GRID SPACE    canonical. Whole-number block coordinates. Chunk storage,
 *                 world generation, save data and structure placement all live
 *                 here, and none of them change when the scale changes.
 *   WORLD SPACE   physical. Grid coordinates multiplied by `worldVoxelSize`.
 *                 Collision, camera and asset dimensions live here.
 *   RENDER SPACE  whatever the renderer does with world space.
 *
 * Because grid space is canonical, changing the scale of a world never alters
 * how many blocks it contains, only how large each one is. That is what keeps
 * a rescaled world byte-compatible with its own save data.
 *
 * Three sizes are deliberately kept separate:
 *
 *   worldVoxelSize    how large one gameplay block is, in world units
 *   terrainVoxelSize  how finely natural terrain elevation is represented
 *   asset scale       the grid a voxel asset was authored against
 *
 * "Smaller terrain voxels" and "a smaller world" are different requests. The
 * first refines terrain detail within a block; the second shrinks the block.
 */

/** World units per gameplay block in a stock VYTHERA world. */
export const DEFAULT_WORLD_VOXEL_SIZE = 1;

/** World units per terrain cell in a stock VYTHERA world. */
export const DEFAULT_TERRAIN_VOXEL_SIZE = 0.25;

/**
 * Preferred scales. Each is half the one before, so the ratio between any two
 * is a power of two and grid relationships stay exact in binary floating point.
 */
export const WORLD_SCALE_PRESETS = [1, 0.5, 0.25, 0.125] as const;

/**
 * Bounds for custom scales. Below the minimum a render distance in blocks
 * collapses to almost nothing on screen; above the maximum a chunk spans far
 * enough to strain precision and draw distance.
 */
export const MIN_WORLD_VOXEL_SIZE = 0.03125;
export const MAX_WORLD_VOXEL_SIZE = 4;

/**
 * Comparison tolerance for scale arithmetic.
 *
 * Ratios between preset scales are exact in floating point, but custom values
 * such as 0.37 are not, so "is this a whole number of cells" has to be asked
 * with a tolerance rather than with equality.
 */
const EPSILON = 1e-9;

export interface WorldScaleConfig {
  /** World units per gameplay block. */
  worldVoxelSize: number;
  /** Grid units spanned by one gameplay block. Always 1: a block is the unit. */
  gameplayBlockSize: number;
  /** World units per terrain elevation cell. */
  terrainVoxelSize: number;
}

export const DEFAULT_WORLD_SCALE: WorldScaleConfig = Object.freeze({
  worldVoxelSize: DEFAULT_WORLD_VOXEL_SIZE,
  gameplayBlockSize: 1,
  terrainVoxelSize: DEFAULT_TERRAIN_VOXEL_SIZE,
});

/**
 * Coerce an untrusted value into a usable block size.
 *
 * Imported styles and save files are untrusted input, so anything absent,
 * non-finite or out of range falls back to the stock scale rather than
 * producing a world nobody can stand in.
 */
export function sanitizeWorldVoxelSize(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_WORLD_VOXEL_SIZE;
  return Math.min(MAX_WORLD_VOXEL_SIZE, Math.max(MIN_WORLD_VOXEL_SIZE, n));
}

/** Build a complete config from whatever parts are known. */
export function makeWorldScale(partial?: Partial<WorldScaleConfig>): WorldScaleConfig {
  return {
    worldVoxelSize: sanitizeWorldVoxelSize(partial?.worldVoxelSize ?? DEFAULT_WORLD_VOXEL_SIZE),
    gameplayBlockSize: 1,
    terrainVoxelSize: sanitizeWorldVoxelSize(
      partial?.terrainVoxelSize ?? DEFAULT_TERRAIN_VOXEL_SIZE,
    ),
  };
}

/** True for the scales listed as presets, which are the well-behaved ones. */
export function isPresetScale(worldVoxelSize: number): boolean {
  return (WORLD_SCALE_PRESETS as readonly number[]).some(
    (p) => Math.abs(p - worldVoxelSize) < EPSILON,
  );
}

// --- Grid ↔ world conversion -------------------------------------------------
//
// Everything spatial goes through these four functions. Multiplying by a scale
// inline anywhere else is how the two spaces drift apart.

/** Grid coordinate or length → world units. */
export function gridToWorld(grid: number, scale: WorldScaleConfig): number {
  return grid * scale.worldVoxelSize;
}

/** World coordinate or length → grid units, unrounded. */
export function worldToGrid(world: number, scale: WorldScaleConfig): number {
  return world / scale.worldVoxelSize;
}

/**
 * Grid length → world length.
 *
 * Identical arithmetic to `gridToWorld`, kept separate because a distance and
 * a coordinate are different things and mixing them up is a common bug. The
 * distinction matters if an origin offset is ever introduced.
 */
export function gridDistanceToWorld(gridDistance: number, scale: WorldScaleConfig): number {
  return gridDistance * scale.worldVoxelSize;
}

/** World length → grid length. */
export function worldDistanceToGrid(worldDistance: number, scale: WorldScaleConfig): number {
  return worldDistance / scale.worldVoxelSize;
}

/** World coordinate → the whole grid cell containing it. */
export function worldToGridCell(world: number, scale: WorldScaleConfig): number {
  return Math.floor(worldToGrid(world, scale));
}

// --- Terrain resolution relationship ----------------------------------------

/**
 * Terrain cells spanned by one gameplay block along a single axis.
 *
 * Calculated, never assumed: at a world scale of 0.5 with 0.25 terrain cells a
 * block is 2 cells across, and at 0.25 with 0.125 it is also 2. The stock
 * combination of 1.0 and 0.25 gives 4.
 */
export function terrainCellsPerWorldVoxel(scale: WorldScaleConfig): number {
  return scale.worldVoxelSize / scale.terrainVoxelSize;
}

/** Terrain cells filling one gameplay block in three dimensions. */
export function terrainCellsPerWorldVoxelVolume(scale: WorldScaleConfig): number {
  const perAxis = terrainCellsPerWorldVoxel(scale);
  return perAxis ** 3;
}

/**
 * Whether a block divides into a whole number of terrain cells.
 *
 * Clean ratios let terrain cells tile a block exactly. A ratio like 1.0 / 0.37
 * leaves a partial cell at the block boundary, which is legal but has to be
 * resolved by snapping rather than by assuming it fits.
 */
export function hasCleanTerrainRatio(scale: WorldScaleConfig): boolean {
  const cells = terrainCellsPerWorldVoxel(scale);
  return Math.abs(cells - Math.round(cells)) < 1e-6 && cells >= 1;
}

/**
 * Snap a world-space height onto the terrain cell grid.
 *
 * Rounds rather than truncates so error stays bounded at half a cell instead of
 * accumulating downward across successive conversions.
 */
export function snapToTerrainCell(worldHeight: number, scale: WorldScaleConfig): number {
  const cells = Math.round(worldHeight / scale.terrainVoxelSize);
  return cells * scale.terrainVoxelSize;
}

/** Snap a world coordinate onto the gameplay block grid. */
export function snapToGrid(world: number, scale: WorldScaleConfig): number {
  return Math.round(worldToGrid(world, scale)) * scale.worldVoxelSize;
}

// --- Asset scaling -----------------------------------------------------------

/**
 * Factor converting an asset authored for one block size onto another.
 *
 * A tree modelled as 12 blocks tall stays 12 blocks tall at every scale; this
 * is for imported assets that recorded raw world-unit sizes instead, and for
 * telling a creator how far off an import is before they accept it.
 */
export function matchWorldScaleFactor(
  assetWorldVoxelSize: number,
  scale: WorldScaleConfig,
): number {
  const from = sanitizeWorldVoxelSize(assetWorldVoxelSize);
  return scale.worldVoxelSize / from;
}

/** Whether an asset was authored against the active grid. */
export function assetMatchesWorldScale(
  assetWorldVoxelSize: number,
  scale: WorldScaleConfig,
): boolean {
  return Math.abs(matchWorldScaleFactor(assetWorldVoxelSize, scale) - 1) < 1e-6;
}

/**
 * Dimensions of a procedural or imported asset, in grid cells.
 *
 * Storing counts rather than lengths is what makes an asset scale-independent:
 * a door of 2 stays two blocks tall whatever a block measures.
 */
export interface VoxelAssetSize {
  width: number;
  height: number;
  depth: number;
}

/** Grid-cell dimensions → physical world-unit dimensions. */
export function assetSizeToWorld(
  size: VoxelAssetSize,
  scale: WorldScaleConfig,
): { width: number; height: number; depth: number } {
  return {
    width: gridDistanceToWorld(size.width, scale),
    height: gridDistanceToWorld(size.height, scale),
    depth: gridDistanceToWorld(size.depth, scale),
  };
}

// --- Description -------------------------------------------------------------

export interface WorldScaleSummary {
  worldVoxelSize: number;
  terrainVoxelSize: number;
  /** Terrain cells per block along one axis. */
  cellsPerBlock: number;
  /** Detail relative to a stock 1.0 world, e.g. 4 at a scale of 0.25. */
  relativeResolution: number;
  cleanRatio: boolean;
  preset: boolean;
}

/** Everything the editor needs to explain a scale to a creator. */
export function describeWorldScale(scale: WorldScaleConfig): WorldScaleSummary {
  return {
    worldVoxelSize: scale.worldVoxelSize,
    terrainVoxelSize: scale.terrainVoxelSize,
    cellsPerBlock: terrainCellsPerWorldVoxel(scale),
    relativeResolution: DEFAULT_WORLD_VOXEL_SIZE / scale.worldVoxelSize,
    cleanRatio: hasCleanTerrainRatio(scale),
    preset: isPresetScale(scale.worldVoxelSize),
  };
}

/** Whether two worlds would generate at the same physical scale. */
export function sameWorldScale(a: WorldScaleConfig, b: WorldScaleConfig): boolean {
  return (
    Math.abs(a.worldVoxelSize - b.worldVoxelSize) < EPSILON &&
    Math.abs(a.terrainVoxelSize - b.terrainVoxelSize) < EPSILON
  );
}
