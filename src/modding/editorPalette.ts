import {
  type CustomMaterialJson,
  type CustomMaterialPalette,
  hexToRgb01,
  rgb01ToHex,
} from '../modding/CustomMaterials';

/** Serializable palette entry for export (color + optional texture pixels). */
export interface PaletteEntry {
  id: number;
  name: string;
  color: [number, number, number];
  pixels?: number[];
}

let activePalette: CustomMaterialPalette | null = null;

export function setActiveMaterialPalette(palette: CustomMaterialPalette | null): void {
  activePalette = palette;
}

export function getActiveMaterialPalette(): CustomMaterialPalette | null {
  return activePalette;
}

export function isEditorPaletteBlock(id: number): boolean {
  if (!activePalette) return id > 0 && id <= 48;
  return activePalette.has(id);
}

export function editorPaletteEntries(): PaletteEntry[] {
  if (!activePalette) return [];
  return activePalette.toJson();
}

export function paletteEntryFor(id: number): PaletteEntry | null {
  const mat = activePalette?.get(id);
  if (!mat) return null;
  return {
    id: mat.id,
    name: mat.name,
    color: [...mat.color] as [number, number, number],
    pixels: mat.pixels ? mat.pixels.slice() : undefined,
  };
}

export function defaultEditorBrush(): number {
  return activePalette?.defaultBrush() ?? 1;
}

export function materialCssColor(id: number): string {
  return activePalette?.cssColor(id) ?? '#888';
}

export { hexToRgb01, rgb01ToHex };
export type { CustomMaterialJson };
