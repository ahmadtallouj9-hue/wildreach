import { Block } from '../world/blocks';
import { LOCAL_GRID_SIZE, LOCAL_GRID_VOLUME } from './constants';
import { editorPaletteEntries, type PaletteEntry } from './editorPalette';
import type { LocalModelData, LocalVoxelGrid } from './LocalVoxelGrid';

/** Phase-1 export bundle: voxel buffer + palette metadata for animation phases. */
export interface ModShapeExport {
  version: 1;
  size: number;
  capacity: number;
  /** Dense block-id array (index layout: x + z·S + y·S²). */
  voxelData: number[];
  /** Editor palette — block id → name/color. */
  palette: PaletteEntry[];
  /** Distinct block ids present in voxelData (sorted). */
  usedBlocks: number[];
  filledCount: number;
}

export function usedBlockIds(voxels: ArrayLike<number>): number[] {
  const seen = new Set<number>();
  for (let i = 0; i < voxels.length; i++) {
    const id = voxels[i]!;
    if (id !== Block.Air) seen.add(id);
  }
  return [...seen].sort((a, b) => a - b);
}

/** Serialize the live grid + palette for save/export. */
export function exportModShape(grid: LocalVoxelGrid): ModShapeExport {
  const voxelData = Array.from(grid.voxels);
  return {
    version: 1,
    size: LOCAL_GRID_SIZE,
    capacity: LOCAL_GRID_VOLUME,
    voxelData,
    palette: editorPaletteEntries(),
    usedBlocks: usedBlockIds(voxelData),
    filledCount: grid.filledCount(),
  };
}

/** Legacy `LocalModelData` consumed by ModAsset.shape. */
export function shapeToModelData(exportShape: ModShapeExport): LocalModelData {
  return {
    version: 1,
    size: exportShape.size,
    voxels: exportShape.voxelData,
    palette: exportShape.palette,
    usedBlocks: exportShape.usedBlocks,
  };
}

export function exportGridAsModelData(
  grid: LocalVoxelGrid,
  partMask?: number[],
  emissiveMask?: number[],
): LocalModelData {
  const base = shapeToModelData(exportModShape(grid));
  if (partMask?.length === grid.voxels.length) base.partMask = partMask;
  const em = emissiveMask ?? Array.from(grid.emissive);
  if (em.length === grid.voxels.length && em.some((v) => v)) base.emissiveMask = em;
  return base;
}
