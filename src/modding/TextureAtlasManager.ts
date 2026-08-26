import {
  CUSTOM_TEX_SIZE,
  solidPixels,
  type CustomMaterialPalette,
} from './CustomMaterials';

const ATLAS_GRID = 8;

export interface TileUv {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export interface TileRect {
  col: number;
  row: number;
  ox: number;
  oy: number;
}

/** Dynamic atlas tile layout + pixel read/write with live GPU partial uploads. */
export class TextureAtlasManager {
  readonly atlasResolution: number;

  constructor(readonly palette: CustomMaterialPalette) {
    this.atlasResolution = CUSTOM_TEX_SIZE * ATLAS_GRID;
  }

  /** Normalized atlas UV for a material tile (greedy mesher). */
  tileUv(matId: number): TileUv {
    return this.palette.tileUv(matId);
  }

  /** Atlas pixel origin for a material tile. */
  tileRect(matId: number): TileRect {
    const tile = Math.max(0, Math.min(ATLAS_GRID * ATLAS_GRID - 1, matId - 1));
    const col = tile % ATLAS_GRID;
    const row = Math.floor(tile / ATLAS_GRID);
    return {
      col,
      row,
      ox: col * CUSTOM_TEX_SIZE,
      oy: row * CUSTOM_TEX_SIZE,
    };
  }

  /**
   * Map local face UV (0–1) into global atlas UV:
   * UV_global = (TilePos + UV_local * TileSize) / AtlasResolution
   */
  globalUvFromLocal(matId: number, localU: number, localV: number): [number, number] {
    const tile = this.tileUv(matId);
    return [
      tile.u0 + localU * (tile.u1 - tile.u0),
      tile.v0 + localV * (tile.v1 - tile.v0),
    ];
  }

  /** Convert mesh intersection atlas UV → integer tile pixel (top-left origin). */
  atlasPixelFromHitUv(matId: number, atlasU: number, atlasV: number): { tx: number; ty: number } {
    const tile = this.tileUv(matId);
    const spanU = tile.u1 - tile.u0;
    const spanV = tile.v1 - tile.v0;
    if (spanU <= 0 || spanV <= 0) return { tx: 0, ty: 0 };
    const localU = (atlasU - tile.u0) / spanU;
    const localV = (atlasV - tile.v0) / spanV;
    const tx = Math.min(
      CUSTOM_TEX_SIZE - 1,
      Math.max(0, Math.floor(localU * CUSTOM_TEX_SIZE)),
    );
    const ty = Math.min(
      CUSTOM_TEX_SIZE - 1,
      Math.max(0, Math.floor((1 - localV) * CUSTOM_TEX_SIZE)),
    );
    return { tx, ty };
  }

  /** Global atlas pixel from tile-local pixel. */
  globalPixelFromTilePixel(matId: number, tx: number, ty: number): { px: number; py: number } {
    const { ox, oy } = this.tileRect(matId);
    return { px: ox + tx, py: oy + ty };
  }

  /** Ensure material has an RGBA tile buffer (creates from flat color if needed). */
  getOrCreateTilePixels(matId: number): number[] | null {
    const mat = this.palette.get(matId);
    if (!mat) return null;
    if (!mat.pixels?.length) {
      mat.pixels = solidPixels(mat.color);
    }
    return mat.pixels;
  }

  /** Write tile pixels and upload only that tile region to the GPU texture. */
  writeTilePixels(matId: number, pixels: number[], notify = false): void {
    this.palette.patchTilePixels(matId, pixels, notify);
  }

  /** Sample RGBA from a tile pixel. */
  sampleTilePixel(matId: number, tx: number, ty: number): [number, number, number, number] | null {
    const pixels = this.getOrCreateTilePixels(matId);
    if (!pixels) return null;
    const i = (ty * CUSTOM_TEX_SIZE + tx) * 4;
    return [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!, pixels[i + 3]!];
  }
}
