import { LOCAL_GRID_SIZE } from './constants';
import type { LocalVoxelGrid } from './LocalVoxelGrid';
import type { CustomMaterialPalette } from './CustomMaterials';
import { Block } from '../world/blocks';

export type CityTheme = 'medieval' | 'neon' | 'desert' | 'harbor' | 'fantasy';

export interface CityMats {
  road: number;
  sidewalk: number;
  wall: number;
  wallAlt: number;
  roof: number;
  roofAlt: number;
  accent: number;
  trim: number;
  green: number;
  leaf: number;
  water: number;
  light: number;
  dark: number;
}

function set(grid: LocalVoxelGrid, x: number, y: number, z: number, id: number, glow = false): void {
  if (!grid.inBounds(x, y, z) || id === Block.Air) {
    if (grid.inBounds(x, y, z) && id === Block.Air) {
      grid.set(x, y, z, Block.Air);
      grid.setEmissive(x, y, z, false);
    }
    return;
  }
  grid.set(x, y, z, id);
  grid.setEmissive(x, y, z, glow);
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
  glow = false,
): void {
  const ax = Math.min(x0, x1);
  const bx = Math.max(x0, x1);
  const ay = Math.min(y0, y1);
  const by = Math.max(y0, y1);
  const az = Math.min(z0, z1);
  const bz = Math.max(z0, z1);
  for (let x = ax; x <= bx; x++) {
    for (let y = ay; y <= by; y++) {
      for (let z = az; z <= bz; z++) set(grid, x, y, z, id, glow);
    }
  }
}

function hollowBox(
  grid: LocalVoxelGrid,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  wall: number,
  floor?: number,
): void {
  fillBox(grid, x0, y0, z0, x1, y1, z1, wall);
  if (x1 - x0 > 1 && z1 - z0 > 1 && y1 - y0 > 0) {
    for (let y = y0 + (floor != null ? 1 : 0); y <= y1; y++) {
      for (let x = x0 + 1; x < x1; x++) {
        for (let z = z0 + 1; z < z1; z++) set(grid, x, y, z, Block.Air);
      }
    }
  }
  if (floor != null) fillBox(grid, x0 + 1, y0, z0 + 1, x1 - 1, y0, z1 - 1, floor);
}

function hash(x: number, z: number, salt: number): number {
  let n = (x * 374761393 + z * 668265263 + salt * 982451653) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  return (n >>> 0) / 4294967296;
}

function ensureNamed(
  palette: CustomMaterialPalette,
  name: string,
  color: [number, number, number],
): number {
  const existing = palette.list().find((m) => m.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    palette.updateMaterial(existing.id, { color });
    return existing.id;
  }
  return palette.addMaterial(name, color, undefined, true, 'City')?.id ?? palette.defaultBrush();
}

/** Theme-tuned palette so cities no longer look like tan boxes + red lids. */
export function ensureCityMaterials(palette: CustomMaterialPalette, theme: CityTheme): CityMats {
  const packs: Record<CityTheme, Record<keyof CityMats, [string, [number, number, number]]>> = {
    medieval: {
      road: ['City Cobble', [0.42, 0.4, 0.38]],
      sidewalk: ['City Stone', [0.62, 0.6, 0.56]],
      wall: ['City Plaster', [0.86, 0.8, 0.68]],
      wallAlt: ['City Timber', [0.42, 0.28, 0.16]],
      roof: ['City Clay Roof', [0.62, 0.22, 0.18]],
      roofAlt: ['City Slate Roof', [0.32, 0.36, 0.42]],
      accent: ['City Banner', [0.18, 0.42, 0.48]],
      trim: ['City Oak', [0.48, 0.32, 0.18]],
      green: ['City Grass', [0.28, 0.55, 0.28]],
      leaf: ['City Canopy', [0.22, 0.48, 0.24]],
      water: ['City Fountain', [0.35, 0.62, 0.82]],
      light: ['City Lamp', [1, 0.86, 0.45]],
      dark: ['City Shadow', [0.18, 0.16, 0.14]],
    },
    neon: {
      road: ['Neon Asphalt', [0.12, 0.13, 0.16]],
      sidewalk: ['Neon Concrete', [0.28, 0.3, 0.34]],
      wall: ['Neon Glass', [0.22, 0.28, 0.38]],
      wallAlt: ['Neon Steel', [0.4, 0.44, 0.5]],
      roof: ['Neon Magenta', [0.92, 0.18, 0.62]],
      roofAlt: ['Neon Violet', [0.42, 0.22, 0.78]],
      accent: ['Neon Cyan', [0.2, 0.95, 1]],
      trim: ['Neon Chrome', [0.72, 0.78, 0.86]],
      green: ['Neon Planter', [0.15, 0.55, 0.35]],
      leaf: ['Neon Leaf', [0.2, 0.85, 0.55]],
      water: ['Neon Pool', [0.15, 0.55, 0.9]],
      light: ['Neon Sign', [0.45, 1, 0.95]],
      dark: ['Neon Black', [0.06, 0.07, 0.1]],
    },
    desert: {
      road: ['Desert Sand', [0.86, 0.74, 0.52]],
      sidewalk: ['Desert Adobe', [0.78, 0.62, 0.42]],
      wall: ['Desert Clay', [0.9, 0.78, 0.58]],
      wallAlt: ['Desert Terracotta', [0.72, 0.42, 0.28]],
      roof: ['Desert Dome', [0.55, 0.28, 0.22]],
      roofAlt: ['Desert Gold', [0.92, 0.74, 0.28]],
      accent: ['Desert Turquoise', [0.2, 0.72, 0.68]],
      trim: ['Desert Cedar', [0.48, 0.3, 0.18]],
      green: ['Desert Palm', [0.28, 0.52, 0.28]],
      leaf: ['Desert Frond', [0.22, 0.58, 0.3]],
      water: ['Oasis Water', [0.25, 0.58, 0.72]],
      light: ['Desert Lantern', [1, 0.78, 0.35]],
      dark: ['Desert Shade', [0.32, 0.22, 0.14]],
    },
    harbor: {
      road: ['Harbor Pier', [0.45, 0.35, 0.25]],
      sidewalk: ['Harbor Stone', [0.55, 0.55, 0.52]],
      wall: ['Harbor Whitewash', [0.9, 0.9, 0.86]],
      wallAlt: ['Harbor Navy', [0.16, 0.28, 0.48]],
      roof: ['Harbor Red Tile', [0.7, 0.28, 0.22]],
      roofAlt: ['Harbor Blue', [0.28, 0.48, 0.72]],
      accent: ['Harbor Teal', [0.15, 0.62, 0.62]],
      trim: ['Harbor Rope', [0.62, 0.48, 0.28]],
      green: ['Harbor Grass', [0.32, 0.55, 0.32]],
      leaf: ['Harbor Tree', [0.22, 0.48, 0.28]],
      water: ['Harbor Sea', [0.18, 0.42, 0.62]],
      light: ['Harbor Lamp', [1, 0.88, 0.5]],
      dark: ['Harbor Hull', [0.2, 0.16, 0.14]],
    },
    fantasy: {
      road: ['Fantasy Path', [0.48, 0.42, 0.55]],
      sidewalk: ['Fantasy Marble', [0.82, 0.8, 0.88]],
      wall: ['Fantasy Stone', [0.62, 0.58, 0.72]],
      wallAlt: ['Fantasy Amethyst', [0.48, 0.28, 0.68]],
      roof: ['Fantasy Copper', [0.28, 0.58, 0.48]],
      roofAlt: ['Fantasy Gold', [0.9, 0.74, 0.32]],
      accent: ['Fantasy Mana', [0.55, 0.35, 1]],
      trim: ['Fantasy Ebony', [0.22, 0.16, 0.28]],
      green: ['Fantasy Moss', [0.35, 0.62, 0.38]],
      leaf: ['Fantasy Bloom', [0.72, 0.42, 0.85]],
      water: ['Fantasy Spring', [0.45, 0.72, 0.95]],
      light: ['Fantasy Glow', [0.85, 0.7, 1]],
      dark: ['Fantasy Night', [0.12, 0.1, 0.18]],
    },
  };

  const p = packs[theme];
  const out = {} as CityMats;
  for (const key of Object.keys(p) as (keyof CityMats)[]) {
    out[key] = ensureNamed(palette, p[key][0], p[key][1]);
  }
  return out;
}

type BldgKind = 'house' | 'shop' | 'tower' | 'hall' | 'manor' | 'gate';

interface Lot {
  x: number;
  z: number;
  w: number;
  d: number;
  kind: BldgKind;
  seed: number;
}

function pitchedRoof(
  grid: LocalVoxelGrid,
  x0: number,
  y: number,
  z0: number,
  w: number,
  d: number,
  mat: number,
  glow = false,
): void {
  const layers = Math.max(1, Math.min(3, Math.floor(Math.min(w, d) / 2)));
  for (let i = 0; i < layers; i++) {
    fillBox(grid, x0 + i, y + i, z0 + i, x0 + w - 1 - i, y + i, z0 + d - 1 - i, mat, glow);
  }
}

function windows(
  grid: LocalVoxelGrid,
  x0: number,
  z0: number,
  w: number,
  d: number,
  y0: number,
  y1: number,
  glass: number,
  glow: boolean,
): void {
  for (let y = y0; y <= y1; y += 2) {
    for (let x = x0 + 1; x < x0 + w - 1; x += 2) {
      set(grid, x, y, z0, glass, glow);
      set(grid, x, y, z0 + d - 1, glass, glow);
    }
    for (let z = z0 + 1; z < z0 + d - 1; z += 2) {
      set(grid, x0, y, z, glass, glow);
      set(grid, x0 + w - 1, y, z, glass, glow);
    }
  }
}

function door(grid: LocalVoxelGrid, x: number, y: number, z: number, trim: number): void {
  set(grid, x, y, z, Block.Air);
  set(grid, x, y + 1, z, Block.Air);
  set(grid, x - 1, y, z, trim);
  set(grid, x + 1, y, z, trim);
  set(grid, x, y + 2, z, trim);
}

function tree(grid: LocalVoxelGrid, x: number, z: number, trunk: number, leaf: number): void {
  set(grid, x, 1, z, trunk);
  set(grid, x, 2, z, trunk);
  fillBox(grid, x - 1, 3, z - 1, x + 1, 4, z + 1, leaf);
  set(grid, x, 5, z, leaf);
}

function lamp(grid: LocalVoxelGrid, x: number, z: number, pole: number, light: number, glow: boolean): void {
  set(grid, x, 1, z, pole);
  set(grid, x, 2, z, pole);
  set(grid, x, 3, z, light, glow);
}

function buildHouse(grid: LocalVoxelGrid, lot: Lot, m: CityMats, theme: CityTheme): void {
  const h = 4 + Math.floor(hash(lot.seed, 1, 2) * 3);
  const wall = hash(lot.seed, 2, 3) > 0.45 ? m.wall : m.wallAlt;
  const roof = hash(lot.seed, 3, 4) > 0.5 ? m.roof : m.roofAlt;
  hollowBox(grid, lot.x, 1, lot.z, lot.x + lot.w - 1, h, lot.z + lot.d - 1, wall, m.sidewalk);
  pitchedRoof(grid, lot.x, h + 1, lot.z, lot.w, lot.d, roof, theme === 'neon');
  door(grid, lot.x + Math.floor(lot.w / 2), 1, lot.z, m.trim);
  windows(grid, lot.x, lot.z, lot.w, lot.d, 3, h - 1, m.accent, theme === 'neon');
  // Chimney
  set(grid, lot.x + lot.w - 2, h + 2, lot.z + 1, m.dark);
  set(grid, lot.x + lot.w - 2, h + 3, lot.z + 1, m.dark);
}

function buildShop(grid: LocalVoxelGrid, lot: Lot, m: CityMats, theme: CityTheme): void {
  const h = 5;
  hollowBox(grid, lot.x, 1, lot.z, lot.x + lot.w - 1, h, lot.z + lot.d - 1, m.wall, m.sidewalk);
  fillBox(grid, lot.x, h + 1, lot.z, lot.x + lot.w - 1, h + 1, lot.z + lot.d - 1, m.roofAlt, theme === 'neon');
  // Awning
  fillBox(grid, lot.x, 3, lot.z - 1, lot.x + lot.w - 1, 3, lot.z - 1, m.accent, theme === 'neon');
  door(grid, lot.x + Math.floor(lot.w / 2), 1, lot.z, m.trim);
  // Display windows
  for (let x = lot.x + 1; x < lot.x + lot.w - 1; x++) {
    set(grid, x, 2, lot.z, m.water, theme === 'neon');
  }
  windows(grid, lot.x, lot.z, lot.w, lot.d, 4, h, m.accent, theme === 'neon');
}

function buildTower(grid: LocalVoxelGrid, lot: Lot, m: CityMats, theme: CityTheme): void {
  const h = theme === 'neon' ? 14 : theme === 'fantasy' ? 13 : 11;
  hollowBox(grid, lot.x, 1, lot.z, lot.x + lot.w - 1, h, lot.z + lot.d - 1, m.wallAlt, m.dark);
  // Battlements / crown
  for (let x = lot.x; x < lot.x + lot.w; x++) {
    for (let z = lot.z; z < lot.z + lot.d; z++) {
      const edge = x === lot.x || x === lot.x + lot.w - 1 || z === lot.z || z === lot.z + lot.d - 1;
      if (edge && ((x + z) & 1) === 0) set(grid, x, h + 1, z, m.roof, theme === 'neon');
    }
  }
  door(grid, lot.x + Math.floor(lot.w / 2), 1, lot.z, m.trim);
  windows(grid, lot.x, lot.z, lot.w, lot.d, 3, h - 1, m.accent, true);
  // Spire tip
  const cx = lot.x + Math.floor(lot.w / 2);
  const cz = lot.z + Math.floor(lot.d / 2);
  set(grid, cx, h + 2, cz, m.light, true);
}

function buildHall(grid: LocalVoxelGrid, lot: Lot, m: CityMats, theme: CityTheme): void {
  const h = 7;
  hollowBox(grid, lot.x, 1, lot.z, lot.x + lot.w - 1, h, lot.z + lot.d - 1, m.wall, m.sidewalk);
  pitchedRoof(grid, lot.x - 1, h + 1, lot.z - 1, lot.w + 2, lot.d + 2, m.roofAlt, theme === 'fantasy');
  // Grand entrance
  const mx = lot.x + Math.floor(lot.w / 2);
  fillBox(grid, mx - 1, 1, lot.z, mx + 1, 3, lot.z, Block.Air);
  set(grid, mx - 2, 1, lot.z, m.trim);
  set(grid, mx + 2, 1, lot.z, m.trim);
  set(grid, mx, 4, lot.z, m.accent, theme !== 'desert');
  windows(grid, lot.x, lot.z, lot.w, lot.d, 3, h - 1, m.water, theme === 'neon');
  // Columns
  set(grid, lot.x + 1, 1, lot.z - 1, m.trim);
  set(grid, lot.x + 1, 2, lot.z - 1, m.trim);
  set(grid, lot.x + lot.w - 2, 1, lot.z - 1, m.trim);
  set(grid, lot.x + lot.w - 2, 2, lot.z - 1, m.trim);
}

function buildManor(grid: LocalVoxelGrid, lot: Lot, m: CityMats, theme: CityTheme): void {
  const h = 6;
  hollowBox(grid, lot.x, 1, lot.z, lot.x + lot.w - 1, h, lot.z + lot.d - 1, m.wall, m.sidewalk);
  // Wing
  fillBox(grid, lot.x, 1, lot.z, lot.x + 2, h - 1, lot.z + lot.d - 1, m.wallAlt);
  pitchedRoof(grid, lot.x, h + 1, lot.z, lot.w, lot.d, m.roof, theme === 'neon');
  door(grid, lot.x + Math.floor(lot.w / 2), 1, lot.z, m.trim);
  windows(grid, lot.x, lot.z, lot.w, lot.d, 2, h - 1, m.accent, theme === 'neon');
  // Balcony
  fillBox(grid, lot.x + 1, 4, lot.z - 1, lot.x + lot.w - 2, 4, lot.z - 1, m.trim);
}

function buildGate(grid: LocalVoxelGrid, lot: Lot, m: CityMats, theme: CityTheme): void {
  const h = 8;
  fillBox(grid, lot.x, 1, lot.z, lot.x + 1, h, lot.z + lot.d - 1, m.wallAlt);
  fillBox(grid, lot.x + lot.w - 2, 1, lot.z, lot.x + lot.w - 1, h, lot.z + lot.d - 1, m.wallAlt);
  fillBox(grid, lot.x, h - 1, lot.z, lot.x + lot.w - 1, h, lot.z + lot.d - 1, m.roof);
  // Archway
  fillBox(grid, lot.x + 2, 1, lot.z + 1, lot.x + lot.w - 3, 4, lot.z + lot.d - 2, Block.Air);
  set(grid, lot.x + Math.floor(lot.w / 2), h + 1, lot.z + Math.floor(lot.d / 2), m.light, true);
  if (theme === 'fantasy') {
    set(grid, lot.x, h + 1, lot.z, m.accent, true);
    set(grid, lot.x + lot.w - 1, h + 1, lot.z + lot.d - 1, m.accent, true);
  }
}

function stampBuilding(grid: LocalVoxelGrid, lot: Lot, m: CityMats, theme: CityTheme): void {
  switch (lot.kind) {
    case 'shop':
      buildShop(grid, lot, m, theme);
      break;
    case 'tower':
      buildTower(grid, lot, m, theme);
      break;
    case 'hall':
      buildHall(grid, lot, m, theme);
      break;
    case 'manor':
      buildManor(grid, lot, m, theme);
      break;
    case 'gate':
      buildGate(grid, lot, m, theme);
      break;
    default:
      buildHouse(grid, lot, m, theme);
  }
}

function layoutLots(theme: CityTheme): Lot[] {
  const lots: Lot[] = [
    { x: 1, z: 1, w: 5, d: 5, kind: 'manor', seed: 11 },
    { x: 7, z: 1, w: 4, d: 4, kind: 'shop', seed: 12 },
    { x: 12, z: 1, w: 5, d: 4, kind: 'house', seed: 13 },
    { x: 18, z: 1, w: 4, d: 5, kind: 'shop', seed: 14 },
    { x: 23, z: 1, w: 4, d: 4, kind: 'house', seed: 15 },
    { x: 28, z: 1, w: 3, d: 5, kind: 'tower', seed: 16 },
    { x: 1, z: 7, w: 4, d: 4, kind: 'house', seed: 21 },
    { x: 28, z: 7, w: 3, d: 4, kind: 'tower', seed: 26 },
    { x: 1, z: 12, w: 5, d: 5, kind: 'hall', seed: 31 },
    { x: 26, z: 12, w: 5, d: 5, kind: 'manor', seed: 36 },
    { x: 1, z: 18, w: 4, d: 4, kind: 'shop', seed: 41 },
    { x: 27, z: 18, w: 4, d: 4, kind: 'shop', seed: 46 },
    { x: 1, z: 23, w: 5, d: 4, kind: 'house', seed: 51 },
    { x: 7, z: 27, w: 4, d: 4, kind: 'house', seed: 52 },
    { x: 12, z: 26, w: 5, d: 5, kind: 'manor', seed: 53 },
    { x: 18, z: 27, w: 4, d: 4, kind: 'shop', seed: 54 },
    { x: 23, z: 26, w: 4, d: 5, kind: 'house', seed: 55 },
    { x: 28, z: 23, w: 3, d: 5, kind: 'tower', seed: 56 },
    { x: 13, z: 7, w: 6, d: 3, kind: 'gate', seed: 60 },
  ];
  if (theme === 'neon') {
    lots.push({ x: 20, z: 12, w: 4, d: 4, kind: 'tower', seed: 70 });
  }
  if (theme === 'fantasy') {
    lots.push({ x: 8, z: 18, w: 4, d: 4, kind: 'tower', seed: 71 });
  }
  return lots;
}

/**
 * High-end mini-city for the 32³ workshop: avenues, lots, varied buildings,
 * plaza fountain, lamps, trees, theme accents.
 */
export function stampCity(
  grid: LocalVoxelGrid,
  mats: CityMats,
  theme: CityTheme = 'medieval',
  clearFirst = true,
): number {
  if (clearFirst) grid.clear();
  const S = LOCAL_GRID_SIZE;
  const before = grid.filledCount();
  const m = mats;

  // Terrain base
  fillBox(grid, 0, 0, 0, S - 1, 0, S - 1, m.green);

  // Main avenues (cross + ring) with sidewalks
  const avenues = new Set<string>();
  const markRoad = (x: number, z: number, wide = false) => {
    set(grid, x, 0, z, m.road);
    avenues.add(`${x},${z}`);
    if (wide) {
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx >= 0 && nx < S && nz >= 0 && nz < S) {
          set(grid, nx, 0, nz, m.road);
          avenues.add(`${nx},${nz}`);
        }
      }
    }
  };

  for (let i = 0; i < S; i++) {
    markRoad(i, 6, true);
    markRoad(i, 25, true);
    markRoad(6, i, true);
    markRoad(25, i, true);
    markRoad(i, 15);
    markRoad(15, i);
  }

  // Sidewalk strip beside roads
  for (let x = 0; x < S; x++) {
    for (let z = 0; z < S; z++) {
      if (avenues.has(`${x},${z}`)) continue;
      let near = false;
      for (let dx = -1; dx <= 1 && !near; dx++) {
        for (let dz = -1; dz <= 1 && !near; dz++) {
          if (avenues.has(`${x + dx},${z + dz}`)) near = true;
        }
      }
      if (near) set(grid, x, 0, z, m.sidewalk);
    }
  }

  // Central plaza
  fillBox(grid, 10, 0, 10, 21, 0, 21, m.sidewalk);
  fillBox(grid, 12, 0, 12, 19, 0, 19, m.accent);

  // Tiered fountain
  fillBox(grid, 14, 1, 14, 17, 1, 17, m.trim);
  fillBox(grid, 15, 2, 15, 16, 2, 16, m.water, theme === 'neon' || theme === 'fantasy');
  set(grid, 15, 3, 15, m.water, true);
  set(grid, 16, 3, 16, m.water, true);
  set(grid, 15, 4, 16, m.light, true);
  set(grid, 16, 4, 15, m.light, true);

  // Plaza benches + planters
  fillBox(grid, 11, 1, 11, 12, 1, 11, m.trim);
  fillBox(grid, 19, 1, 11, 20, 1, 11, m.trim);
  fillBox(grid, 11, 1, 20, 12, 1, 20, m.trim);
  fillBox(grid, 19, 1, 20, 20, 1, 20, m.trim);
  for (const [px, pz] of [
    [11, 13],
    [20, 13],
    [11, 18],
    [20, 18],
  ] as const) {
    set(grid, px, 1, pz, m.green);
    set(grid, px, 2, pz, m.leaf);
  }

  // Buildings
  for (const lot of layoutLots(theme)) stampBuilding(grid, lot, m, theme);

  // Street lamps along avenues
  for (const [lx, lz] of [
    [6, 3],
    [6, 10],
    [6, 20],
    [6, 28],
    [25, 3],
    [25, 10],
    [25, 20],
    [25, 28],
    [3, 6],
    [10, 6],
    [20, 6],
    [28, 6],
    [3, 25],
    [10, 25],
    [20, 25],
    [28, 25],
    [15, 10],
    [15, 21],
  ] as const) {
    if (grid.get(lx, 1, lz) === Block.Air) lamp(grid, lx, lz, m.dark, m.light, true);
  }

  // Park trees in quiet corners
  for (const [tx, tz] of [
    [3, 3],
    [9, 3],
    [3, 28],
    [28, 3],
    [28, 28],
    [9, 28],
    [22, 9],
    [9, 22],
  ] as const) {
    if (grid.get(tx, 1, tz) === Block.Air) tree(grid, tx, tz, m.trim, m.leaf);
  }

  // Theme set-pieces
  if (theme === 'harbor') {
    fillBox(grid, 0, 0, 13, 5, 0, 18, m.water);
    fillBox(grid, 0, 1, 14, 4, 1, 17, m.road);
    for (let i = 0; i < 4; i++) set(grid, i, 2, 14, m.trim);
  }
  if (theme === 'desert') {
    for (let i = 0; i < 12; i++) {
      const x = 2 + Math.floor(hash(i, 9, 1) * 10);
      const z = 2 + Math.floor(hash(i, 9, 2) * 10);
      if (grid.get(x, 1, z) === Block.Air) set(grid, x, 1, z, m.roofAlt);
    }
    // Oasis rim
    fillBox(grid, 14, 0, 14, 17, 0, 17, m.water, true);
  }
  if (theme === 'neon') {
    // Billboard strip
    fillBox(grid, 12, 8, 7, 19, 10, 7, m.roof, true);
    fillBox(grid, 13, 9, 7, 18, 9, 7, m.accent, true);
    // Ground neon lines
    for (let i = 8; i < 24; i += 2) {
      set(grid, i, 0, 15, m.accent, true);
      set(grid, 15, 0, i, m.light, true);
    }
  }
  if (theme === 'fantasy') {
    // Crystal pillars at plaza corners
    for (const [cx, cz] of [
      [12, 12],
      [19, 12],
      [12, 19],
      [19, 19],
    ] as const) {
      set(grid, cx, 1, cz, m.accent, true);
      set(grid, cx, 2, cz, m.accent, true);
      set(grid, cx, 3, cz, m.light, true);
    }
  }
  if (theme === 'medieval') {
    // Outer wall stubs at corners
    for (const [wx, wz] of [
      [0, 0],
      [S - 2, 0],
      [0, S - 2],
      [S - 2, S - 2],
    ] as const) {
      fillBox(grid, wx, 1, wz, wx + 1, 5, wz + 1, m.wallAlt);
      set(grid, wx, 6, wz, m.roof);
    }
  }

  return grid.filledCount() - before;
}

export function detectCityTheme(text: string): CityTheme {
  const t = text.toLowerCase();
  if (/neon|cyber|future|sci-?fi|tokyo|blade/.test(t)) return 'neon';
  if (/desert|sand|oasis|arabian|dune/.test(t)) return 'desert';
  if (/harbor|port|coast|pirate|seaside|dock/.test(t)) return 'harbor';
  if (/fantasy|magic|elf|wizard|crystal|mana/.test(t)) return 'fantasy';
  return 'medieval';
}
