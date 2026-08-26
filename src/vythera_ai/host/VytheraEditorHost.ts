import type { CustomMaterialPalette } from '../../modding/CustomMaterials';
import type { LocalVoxelGrid } from '../../modding/LocalVoxelGrid';
import type { ModKeyframe, ModPart } from '../../modding/ModAsset';

/** Bridge from VYTHERA AI tools → live editor (main-thread only mutations). */
export interface VytheraEditorHost {
  grid: LocalVoxelGrid;
  palette: CustomMaterialPalette;
  parts: ModPart[];
  scripts: string[];
  projectName: string;
  historyPush: () => void;
  rebuildMesh: () => void;
  refreshPalette: () => void;
  applyKeyframes: (keys: ModKeyframe[], clipName: string) => void;
  applyTexturePixels: (name: string, pixels: number[], rgb: [number, number, number]) => void;
  appendBehaviors: (lines: string[]) => void;
  setScripts: (lines: string[]) => void;
  notify: (msg: string) => void;
  undo?: () => boolean;
  redo?: () => boolean;
}

export interface VytheraEditorSnapshot {
  projectName: string;
  voxelCount: number;
  bounds: string;
  parts: string[];
  scriptCount: number;
  scriptsPreview: string[];
  paletteNames: string[];
}
