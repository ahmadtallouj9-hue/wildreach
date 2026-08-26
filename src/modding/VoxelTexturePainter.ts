import { CUSTOM_TEX_SIZE } from './CustomMaterials';
import { floodFillTex, setTexPx } from '../ui/textureOps';
import type { TextureAtlasManager } from './TextureAtlasManager';

export type VoxelTexTool = 'paint' | 'erase' | 'eyedrop' | 'bucket';

export interface VoxelTexPaintParams {
  tool: VoxelTexTool;
  color: [number, number, number];
  brush: number;
  mirrorX?: boolean;
  mirrorY?: boolean;
}

export interface VoxelTexPaintResult {
  kind: 'painted' | 'picked' | 'none';
  matId: number;
  pickedColor?: [number, number, number];
}

/** Apply a single 3D viewport texture stroke at a tile pixel. */
export function strokeVoxelTexture(
  atlas: TextureAtlasManager,
  matId: number,
  tx: number,
  ty: number,
  params: VoxelTexPaintParams,
): VoxelTexPaintResult {
  const pixels = atlas.getOrCreateTilePixels(matId);
  if (!pixels) return { kind: 'none', matId };

  if (params.tool === 'eyedrop') {
    const sample = atlas.sampleTilePixel(matId, tx, ty);
    if (!sample) return { kind: 'none', matId };
    return {
      kind: 'picked',
      matId,
      pickedColor: [sample[0] / 255, sample[1] / 255, sample[2] / 255],
    };
  }

  if (params.tool === 'bucket') {
    floodFillTex(
      pixels,
      tx,
      ty,
      Math.round(params.color[0] * 255),
      Math.round(params.color[1] * 255),
      Math.round(params.color[2] * 255),
    );
    atlas.writeTilePixels(matId, pixels, false);
    return { kind: 'painted', matId };
  }

  const erase = params.tool === 'erase';
  const r = erase ? 220 : Math.round(params.color[0] * 255);
  const g = erase ? 220 : Math.round(params.color[1] * 255);
  const b = erase ? 225 : Math.round(params.color[2] * 255);
  const half = Math.floor((params.brush - 1) / 2);

  const stamp = (sx: number, sy: number) => {
    for (let dy = -half; dy < params.brush - half; dy++) {
      for (let dx = -half; dx < params.brush - half; dx++) {
        setTexPx(pixels, sx + dx, sy + dy, r, g, b);
      }
    }
  };

  stamp(tx, ty);
  if (params.mirrorX) stamp(CUSTOM_TEX_SIZE - 1 - tx, ty);
  if (params.mirrorY) stamp(tx, CUSTOM_TEX_SIZE - 1 - ty);
  if (params.mirrorX && params.mirrorY) stamp(CUSTOM_TEX_SIZE - 1 - tx, CUSTOM_TEX_SIZE - 1 - ty);

  atlas.writeTilePixels(matId, pixels, false);
  return { kind: 'painted', matId };
}
