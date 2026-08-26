import { LOCAL_GRID_SIZE } from './constants';
import type { LocalVoxelGrid } from './LocalVoxelGrid';
import { BOX_FACES, PART_UV, SKIN_SIZE, type SkinPart } from '../player/SkinAtlas';
import type { CustomMaterialPalette } from './CustomMaterials';
import { Block } from '../world/blocks';

export type ShapeStarterId = 'sword' | 'dragon' | 'animal' | 'character';

/** Per-limb material ids when stamping a skinned character. */
export type CharacterPartMats = {
  head: number;
  body: number;
  arm: number;
  leg: number;
};

export const SHAPE_STARTERS: {
  id: ShapeStarterId;
  name: string;
  hint: string;
}[] = [
  { id: 'sword', name: 'Sword', hint: 'Blade + crossguard + hilt' },
  { id: 'dragon', name: 'Dragon', hint: 'Body, wings, head, tail' },
  { id: 'animal', name: 'Animal', hint: 'Quadruped body + head + legs' },
  { id: 'character', name: 'Character', hint: 'Humanoid from your player skin' },
];

/** Average opaque RGB (0–1) from a Minecraft skin part. */
export function averageSkinPartColor(
  pixels: Uint8ClampedArray,
  part: SkinPart,
): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (const face of BOX_FACES) {
    const rect = PART_UV[part][face];
    for (let dy = 0; dy < rect.h; dy++) {
      for (let dx = 0; dx < rect.w; dx++) {
        const i = ((rect.y + dy) * SKIN_SIZE + (rect.x + dx)) * 4;
        const a = pixels[i + 3] ?? 0;
        if (a < 32) continue;
        const pr = pixels[i] ?? 0;
        const pg = pixels[i + 1] ?? 0;
        const pb = pixels[i + 2] ?? 0;
        // Skip pure black filler often left in unused atlas cells.
        if (pr + pg + pb < 12) continue;
        r += pr;
        g += pg;
        b += pb;
        n++;
      }
    }
  }
  if (!n) return [0.72, 0.58, 0.48];
  return [r / n / 255, g / n / 255, b / n / 255];
}

function ensureNamedColor(
  palette: CustomMaterialPalette,
  name: string,
  color: [number, number, number],
): number {
  const existing = palette.list().find((m) => m.name === name);
  if (existing) {
    palette.updateMaterial(existing.id, { color });
    return existing.id;
  }
  return palette.addMaterial(name, color, undefined, true, 'Skin')?.id ?? palette.defaultBrush();
}

/** Build head/body/arm/leg brush ids tinted from the player's skin atlas. */
export function characterMatsFromSkin(
  palette: CustomMaterialPalette,
  pixels: Uint8ClampedArray,
  fallback: number,
): CharacterPartMats {
  try {
    return {
      head: ensureNamedColor(palette, 'Skin Head', averageSkinPartColor(pixels, 'head')),
      body: ensureNamedColor(palette, 'Skin Body', averageSkinPartColor(pixels, 'body')),
      arm: ensureNamedColor(palette, 'Skin Arm', averageSkinPartColor(pixels, 'armR')),
      leg: ensureNamedColor(palette, 'Skin Leg', averageSkinPartColor(pixels, 'legR')),
    };
  } catch {
    return { head: fallback, body: fallback, arm: fallback, leg: fallback };
  }
}

function set(grid: LocalVoxelGrid, x: number, y: number, z: number, id: number): void {
  if (!grid.inBounds(x, y, z)) return;
  if (grid.get(x, y, z) === Block.Air) grid.set(x, y, z, id);
}

function fillBox(
  grid: LocalVoxelGrid,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  id: number,
): void {
  const ax = Math.min(x0, x1);
  const bx = Math.max(x0, x1);
  const ay = Math.min(y0, y1);
  const by = Math.max(y0, y1);
  const az = Math.min(z0, z1);
  const bz = Math.max(z0, z1);
  for (let x = ax; x <= bx; x++) {
    for (let y = ay; y <= by; y++) {
      for (let z = az; z <= bz; z++) set(grid, x, y, z, id);
    }
  }
}

/** Classic vertical sword along +Y (blade up). */
function stampSword(grid: LocalVoxelGrid, mat: number): void {
  const cx = Math.floor(LOCAL_GRID_SIZE / 2);
  const cz = Math.floor(LOCAL_GRID_SIZE / 2);
  // Blade
  fillBox(grid, cx - 1, 10, cz, cx, 28, cz, mat);
  fillBox(grid, cx, 11, cz, cx + 1, 27, cz, mat);
  // Tip
  set(grid, cx, 29, cz, mat);
  set(grid, cx, 30, cz, mat);
  // Crossguard
  fillBox(grid, cx - 4, 9, cz, cx + 4, 10, cz, mat);
  // Handle
  fillBox(grid, cx - 1, 4, cz, cx, 8, cz, mat);
  // Pommel
  fillBox(grid, cx - 2, 2, cz - 1, cx + 1, 3, cz + 1, mat);
}

/** Side-view dragon silhouette (head +Z, wings ±X). */
function stampDragon(grid: LocalVoxelGrid, mat: number): void {
  const cy = 8;
  // Body
  fillBox(grid, 8, cy, 6, 22, cy + 5, 14, mat);
  // Neck
  fillBox(grid, 20, cy + 3, 12, 25, cy + 7, 16, mat);
  // Head
  fillBox(grid, 24, cy + 5, 14, 29, cy + 9, 19, mat);
  set(grid, 29, cy + 7, 19, mat);
  set(grid, 30, cy + 7, 18, mat);
  // Horns
  set(grid, 26, cy + 10, 16, mat);
  set(grid, 27, cy + 11, 16, mat);
  set(grid, 26, cy + 10, 18, mat);
  set(grid, 27, cy + 11, 18, mat);
  // Tail
  fillBox(grid, 2, cy + 2, 8, 8, cy + 4, 11, mat);
  fillBox(grid, 0, cy + 3, 9, 2, cy + 5, 10, mat);
  // Legs
  fillBox(grid, 10, 0, 7, 12, cy, 9, mat);
  fillBox(grid, 18, 0, 7, 20, cy, 9, mat);
  fillBox(grid, 10, 0, 12, 12, cy, 14, mat);
  fillBox(grid, 18, 0, 12, 20, cy, 14, mat);
  // Wings
  for (let i = 0; i < 8; i++) {
    fillBox(grid, 12 - i, cy + 5 + (i >> 1), 4 - (i >> 2), 14 - i, cy + 6 + (i >> 1), 5, mat);
    fillBox(grid, 12 - i, cy + 5 + (i >> 1), 15, 14 - i, cy + 6 + (i >> 1), 16 + (i >> 2), mat);
  }
}

/** Simple quadruped (dog / wolf style). */
function stampAnimal(grid: LocalVoxelGrid, mat: number): void {
  const cy = 6;
  // Torso
  fillBox(grid, 8, cy, 10, 20, cy + 5, 16, mat);
  // Head
  fillBox(grid, 19, cy + 2, 11, 25, cy + 6, 15, mat);
  // Snout
  fillBox(grid, 24, cy + 2, 12, 27, cy + 4, 14, mat);
  // Ears
  set(grid, 20, cy + 7, 11, mat);
  set(grid, 20, cy + 7, 15, mat);
  // Tail
  fillBox(grid, 5, cy + 3, 12, 8, cy + 5, 14, mat);
  fillBox(grid, 3, cy + 4, 13, 5, cy + 6, 14, mat);
  // Legs
  fillBox(grid, 9, 0, 10, 11, cy, 12, mat);
  fillBox(grid, 9, 0, 14, 11, cy, 16, mat);
  fillBox(grid, 17, 0, 10, 19, cy, 12, mat);
  fillBox(grid, 17, 0, 14, 19, cy, 16, mat);
}

/**
 * Minecraft-like humanoid (Steve proportions) centered in the grid.
 * Parts use offsets so Animation can assign limbs later.
 * When mats is an object, each limb uses colors from the player skin.
 */
function stampCharacter(grid: LocalVoxelGrid, mats: number | CharacterPartMats): void {
  const m =
    typeof mats === 'number'
      ? { head: mats, body: mats, arm: mats, leg: mats }
      : mats;
  const cx = Math.floor(LOCAL_GRID_SIZE / 2);
  const cz = Math.floor(LOCAL_GRID_SIZE / 2);
  // Legs (2×6×2 each) — feet at y=0
  fillBox(grid, cx - 2, 0, cz - 1, cx - 1, 5, cz, m.leg);
  fillBox(grid, cx, 0, cz - 1, cx + 1, 5, cz, m.leg);
  // Body (4×6×2)
  fillBox(grid, cx - 2, 6, cz - 1, cx + 1, 11, cz, m.body);
  // Arms (2×6×2)
  fillBox(grid, cx - 4, 6, cz - 1, cx - 3, 11, cz, m.arm);
  fillBox(grid, cx + 2, 6, cz - 1, cx + 3, 11, cz, m.arm);
  // Head (4×4×4)
  fillBox(grid, cx - 2, 12, cz - 2, cx + 1, 15, cz + 1, m.head);
}

/** Clear grid and stamp a starter silhouette with the active material. */
export function applyShapeStarter(
  grid: LocalVoxelGrid,
  id: ShapeStarterId,
  materialId: number | CharacterPartMats,
  clearFirst = true,
): number {
  if (clearFirst) grid.clear();
  const before = grid.filledCount();
  const brush = typeof materialId === 'number' ? materialId : materialId.body;
  if (id === 'sword') stampSword(grid, brush);
  else if (id === 'dragon') stampDragon(grid, brush);
  else if (id === 'animal') stampAnimal(grid, brush);
  else stampCharacter(grid, materialId);
  return grid.filledCount() - before;
}
