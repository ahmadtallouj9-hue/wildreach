import { Block } from '../world/blocks';
import { LOCAL_GRID_SIZE } from './constants';
import type { LocalVoxelGrid } from './LocalVoxelGrid';

export type EditorTool =
  | 'brush'
  | 'erase'
  | 'paint'
  | 'eyedrop'
  | 'flood'
  | 'stamptex'
  | 'texpaint'
  | 'extrude'
  | 'line'
  | 'box'
  | 'fill'
  | 'sphere'
  | 'dome'
  | 'cylinder'
  | 'tube'
  | 'cone'
  | 'pyramid'
  | 'wedge'
  | 'torus'
  | 'helix';

export type MirrorAxis = 'none' | 'x' | 'y' | 'z' | 'xz' | 'xy' | 'yz' | 'xyz';

export interface Cell {
  x: number;
  y: number;
  z: number;
}

/** 3D line through grid cells (lerp + dedupe). */
export function lineCells(a: Cell, b: Cell): Cell[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz), 1);
  const out: Cell[] = [];
  const seen = new Set<string>();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const c = clampCell({
      x: Math.round(a.x + dx * t),
      y: Math.round(a.y + dy * t),
      z: Math.round(a.z + dz * t),
    });
    const k = `${c.x},${c.y},${c.z}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

function clampCell(c: Cell): Cell {
  return {
    x: Math.max(0, Math.min(LOCAL_GRID_SIZE - 1, c.x)),
    y: Math.max(0, Math.min(LOCAL_GRID_SIZE - 1, c.y)),
    z: Math.max(0, Math.min(LOCAL_GRID_SIZE - 1, c.z)),
  };
}

export function boxBounds(a: Cell, b: Cell): { min: Cell; max: Cell } {
  const ca = clampCell(a);
  const cb = clampCell(b);
  return {
    min: {
      x: Math.min(ca.x, cb.x),
      y: Math.min(ca.y, cb.y),
      z: Math.min(ca.z, cb.z),
    },
    max: {
      x: Math.max(ca.x, cb.x),
      y: Math.max(ca.y, cb.y),
      z: Math.max(ca.z, cb.z),
    },
  };
}

/** Edge voxels of an axis-aligned box (outline only). */
export function boxOutlineCells(a: Cell, b: Cell): Cell[] {
  const { min, max } = boxBounds(a, b);
  const set = new Set<string>();
  const cells: Cell[] = [];
  const add = (x: number, y: number, z: number) => {
    const k = `${x},${y},${z}`;
    if (set.has(k)) return;
    set.add(k);
    cells.push({ x, y, z });
  };

  for (let x = min.x; x <= max.x; x++) {
    for (let y = min.y; y <= max.y; y++) {
      add(x, y, min.z);
      add(x, y, max.z);
    }
  }
  for (let x = min.x; x <= max.x; x++) {
    for (let z = min.z; z <= max.z; z++) {
      add(x, min.y, z);
      add(x, max.y, z);
    }
  }
  for (let y = min.y; y <= max.y; y++) {
    for (let z = min.z; z <= max.z; z++) {
      add(min.x, y, z);
      add(max.x, y, z);
    }
  }
  return cells;
}

/** All cells inside an axis-aligned box. */
export function boxFillCells(a: Cell, b: Cell): Cell[] {
  const { min, max } = boxBounds(a, b);
  const cells: Cell[] = [];
  for (let x = min.x; x <= max.x; x++) {
    for (let y = min.y; y <= max.y; y++) {
      for (let z = min.z; z <= max.z; z++) cells.push({ x, y, z });
    }
  }
  return cells;
}

function mirrorOnce(c: Cell, axis: 'x' | 'y' | 'z'): Cell {
  const S = LOCAL_GRID_SIZE;
  if (axis === 'x') return { x: S - 1 - c.x, y: c.y, z: c.z };
  if (axis === 'y') return { x: c.x, y: S - 1 - c.y, z: c.z };
  return { x: c.x, y: c.y, z: S - 1 - c.z };
}

/** All unique cells including original after multi-axis mirror. */
export function mirroredCells(c: Cell, axis: MirrorAxis): Cell[] {
  if (axis === 'none') return [c];
  const axes: ('x' | 'y' | 'z')[] = [];
  if (axis.includes('x')) axes.push('x');
  if (axis.includes('y')) axes.push('y');
  if (axis.includes('z')) axes.push('z');

  const out: Cell[] = [c];
  const seen = new Set([`${c.x},${c.y},${c.z}`]);
  for (const ax of axes) {
    const more: Cell[] = [];
    for (const cell of out) {
      const m = mirrorOnce(cell, ax);
      const k = `${m.x},${m.y},${m.z}`;
      if (seen.has(k)) continue;
      seen.add(k);
      more.push(m);
    }
    out.push(...more);
  }
  return out;
}

/** @deprecated use mirroredCells — kept for call sites expecting single pair. */
export function mirrorCell(c: Cell, axis: MirrorAxis): Cell | null {
  const all = mirroredCells(c, axis);
  return all.length > 1 ? all[1]! : null;
}

export function placeBlock(
  grid: LocalVoxelGrid,
  x: number,
  y: number,
  z: number,
  block: number,
  emissive: boolean,
  mirror: MirrorAxis,
  overwrite = false,
): boolean {
  let placed = false;
  for (const c of mirroredCells({ x, y, z }, mirror)) {
    if (!grid.canWriteAt(c.x, c.y, c.z, overwrite)) continue;
    grid.set(c.x, c.y, c.z, block);
    if (emissive) grid.setEmissive(c.x, c.y, c.z, true);
    placed = true;
  }
  return placed;
}

export function removeBlock(
  grid: LocalVoxelGrid,
  x: number,
  y: number,
  z: number,
  mirror: MirrorAxis,
): boolean {
  let removed = false;
  for (const c of mirroredCells({ x, y, z }, mirror)) {
    if (grid.get(c.x, c.y, c.z) === Block.Air) continue;
    grid.set(c.x, c.y, c.z, Block.Air);
    grid.setEmissive(c.x, c.y, c.z, false);
    removed = true;
  }
  return removed;
}
