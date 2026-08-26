import { LOCAL_GRID_SIZE } from './constants';
import type { Cell } from './EditorTools';
import { boxBounds, boxFillCells, boxOutlineCells, lineCells } from './EditorTools';

function clamp(n: number): number {
  return Math.max(0, Math.min(LOCAL_GRID_SIZE - 1, n));
}

/** Solid ellipsoid fitted in AABB from a→b. */
export function sphereCells(a: Cell, b: Cell): Cell[] {
  const { min, max } = boxBounds(a, b);
  const cx = (min.x + max.x) / 2;
  const cy = (min.y + max.y) / 2;
  const cz = (min.z + max.z) / 2;
  const rx = Math.max((max.x - min.x) / 2, 0.5);
  const ry = Math.max((max.y - min.y) / 2, 0.5);
  const rz = Math.max((max.z - min.z) / 2, 0.5);
  const out: Cell[] = [];
  for (let x = min.x; x <= max.x; x++) {
    for (let y = min.y; y <= max.y; y++) {
      for (let z = min.z; z <= max.z; z++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        const dz = (z - cz) / rz;
        if (dx * dx + dy * dy + dz * dz <= 1.05) out.push({ x, y, z });
      }
    }
  }
  return out;
}

/** Hollow sphere / ellipsoid shell. */
export function domeCells(a: Cell, b: Cell): Cell[] {
  const { min, max } = boxBounds(a, b);
  const cx = (min.x + max.x) / 2;
  const cy = min.y;
  const cz = (min.z + max.z) / 2;
  const rx = Math.max((max.x - min.x) / 2, 0.5);
  const ry = Math.max(max.y - min.y, 0.5);
  const rz = Math.max((max.z - min.z) / 2, 0.5);
  const out: Cell[] = [];
  for (let x = min.x; x <= max.x; x++) {
    for (let y = min.y; y <= max.y; y++) {
      for (let z = min.z; z <= max.z; z++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        const dz = (z - cz) / rz;
        const d = dx * dx + dy * dy + dz * dz;
        if (d <= 1.05 && dy >= 0) out.push({ x, y, z });
      }
    }
  }
  return out;
}

/** Vertical cylinder (Y axis) in AABB. */
export function cylinderCells(a: Cell, b: Cell): Cell[] {
  const { min, max } = boxBounds(a, b);
  const cx = (min.x + max.x) / 2;
  const cz = (min.z + max.z) / 2;
  const rx = Math.max((max.x - min.x) / 2, 0.5);
  const rz = Math.max((max.z - min.z) / 2, 0.5);
  const out: Cell[] = [];
  for (let x = min.x; x <= max.x; x++) {
    for (let z = min.z; z <= max.z; z++) {
      const dx = (x - cx) / rx;
      const dz = (z - cz) / rz;
      if (dx * dx + dz * dz > 1.05) continue;
      for (let y = min.y; y <= max.y; y++) out.push({ x, y, z });
    }
  }
  return out;
}

/** Hollow cylinder / tube. */
export function tubeCells(a: Cell, b: Cell): Cell[] {
  const { min, max } = boxBounds(a, b);
  const cx = (min.x + max.x) / 2;
  const cz = (min.z + max.z) / 2;
  const rx = Math.max((max.x - min.x) / 2, 0.5);
  const rz = Math.max((max.z - min.z) / 2, 0.5);
  const inner = 0.55;
  const out: Cell[] = [];
  for (let x = min.x; x <= max.x; x++) {
    for (let z = min.z; z <= max.z; z++) {
      const dx = (x - cx) / rx;
      const dz = (z - cz) / rz;
      const d = dx * dx + dz * dz;
      if (d > 1.05 || d < inner * inner) continue;
      for (let y = min.y; y <= max.y; y++) out.push({ x, y, z });
    }
  }
  return out;
}

/** Cone pointing +Y. */
export function coneCells(a: Cell, b: Cell): Cell[] {
  const { min, max } = boxBounds(a, b);
  const cx = (min.x + max.x) / 2;
  const cz = (min.z + max.z) / 2;
  const h = Math.max(max.y - min.y, 1);
  const rx = Math.max((max.x - min.x) / 2, 0.5);
  const rz = Math.max((max.z - min.z) / 2, 0.5);
  const out: Cell[] = [];
  for (let y = min.y; y <= max.y; y++) {
    const t = 1 - (y - min.y) / h;
    const rScale = Math.max(t, 0.08);
    for (let x = min.x; x <= max.x; x++) {
      for (let z = min.z; z <= max.z; z++) {
        const dx = (x - cx) / (rx * rScale);
        const dz = (z - cz) / (rz * rScale);
        if (dx * dx + dz * dz <= 1.05) out.push({ x, y, z });
      }
    }
  }
  return out;
}

/** Square pyramid pointing +Y. */
export function pyramidCells(a: Cell, b: Cell): Cell[] {
  const { min, max } = boxBounds(a, b);
  const cx = (min.x + max.x) / 2;
  const cz = (min.z + max.z) / 2;
  const h = Math.max(max.y - min.y, 1);
  const hx = Math.max((max.x - min.x) / 2, 0.5);
  const hz = Math.max((max.z - min.z) / 2, 0.5);
  const out: Cell[] = [];
  for (let y = min.y; y <= max.y; y++) {
    const t = 1 - (y - min.y) / h;
    const sx = Math.max(hx * t, 0.25);
    const sz = Math.max(hz * t, 0.25);
    for (let x = min.x; x <= max.x; x++) {
      for (let z = min.z; z <= max.z; z++) {
        if (Math.abs(x - cx) <= sx + 0.01 && Math.abs(z - cz) <= sz + 0.01) {
          out.push({ x, y, z });
        }
      }
    }
  }
  return out;
}

/** Ramp / wedge rising +Y along +Z. */
export function wedgeCells(a: Cell, b: Cell): Cell[] {
  const { min, max } = boxBounds(a, b);
  const depth = Math.max(max.z - min.z, 1);
  const height = Math.max(max.y - min.y, 1);
  const out: Cell[] = [];
  for (let z = min.z; z <= max.z; z++) {
    const t = (z - min.z) / depth;
    const yTop = min.y + Math.round(t * height);
    for (let x = min.x; x <= max.x; x++) {
      for (let y = min.y; y <= yTop; y++) out.push({ x, y, z });
    }
  }
  return out;
}

/** Torus in XZ plane. */
export function torusCells(a: Cell, b: Cell): Cell[] {
  const { min, max } = boxBounds(a, b);
  const cx = (min.x + max.x) / 2;
  const cy = (min.y + max.y) / 2;
  const cz = (min.z + max.z) / 2;
  const R = Math.max(Math.min(max.x - min.x, max.z - min.z) / 2 - 1, 1.5);
  const r = Math.max(Math.min(R * 0.35, (max.y - min.y) / 2), 0.6);
  const out: Cell[] = [];
  for (let x = min.x; x <= max.x; x++) {
    for (let y = min.y; y <= max.y; y++) {
      for (let z = min.z; z <= max.z; z++) {
        const dx = x - cx;
        const dz = z - cz;
        const dist = Math.hypot(dx, dz);
        const ring = dist - R;
        if (ring * ring + (y - cy) * (y - cy) <= r * r * 1.1) out.push({ x, y, z });
      }
    }
  }
  return out;
}

/** Helix along Y. */
export function helixCells(a: Cell, b: Cell): Cell[] {
  const { min, max } = boxBounds(a, b);
  const cx = (min.x + max.x) / 2;
  const cz = (min.z + max.z) / 2;
  const rx = Math.max((max.x - min.x) / 2, 1);
  const rz = Math.max((max.z - min.z) / 2, 1);
  const h = Math.max(max.y - min.y, 1);
  const turns = 2.5;
  const out: Cell[] = [];
  const seen = new Set<string>();
  const steps = Math.max(h * 8, 24);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const ang = t * turns * Math.PI * 2;
    const x = clamp(Math.round(cx + Math.cos(ang) * rx));
    const z = clamp(Math.round(cz + Math.sin(ang) * rz));
    const y = clamp(Math.round(min.y + t * h));
    const k = `${x},${y},${z}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ x, y, z });
  }
  return out;
}

/** Brush tip: cube of odd diameter around center. */
export function brushTipCells(cx: number, cy: number, cz: number, size: number): Cell[] {
  const r = Math.max(0, Math.floor((size - 1) / 2));
  const out: Cell[] = [];
  for (let x = cx - r; x <= cx + r; x++) {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let z = cz - r; z <= cz + r; z++) {
        if (x < 0 || y < 0 || z < 0 || x >= LOCAL_GRID_SIZE || y >= LOCAL_GRID_SIZE || z >= LOCAL_GRID_SIZE) {
          continue;
        }
        out.push({ x, y, z });
      }
    }
  }
  return out;
}

export type ShapeGenId =
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

const GENERATORS: Record<ShapeGenId, (a: Cell, b: Cell) => Cell[]> = {
  line: lineCells,
  box: boxOutlineCells,
  fill: boxFillCells,
  sphere: sphereCells,
  dome: domeCells,
  cylinder: cylinderCells,
  tube: tubeCells,
  cone: coneCells,
  pyramid: pyramidCells,
  wedge: wedgeCells,
  torus: torusCells,
  helix: helixCells,
};

export function cellsForShape(tool: ShapeGenId, a: Cell, b: Cell): Cell[] {
  return GENERATORS[tool](a, b);
}

export function isShapeGenTool(tool: string): tool is ShapeGenId {
  return tool in GENERATORS;
}
