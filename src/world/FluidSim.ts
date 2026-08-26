import { Block, CHUNK_HEIGHT, CHUNK_SIZE, SEA_LEVEL, isFluid, isSolid, chunkKey } from './blocks';
import type { Chunk } from './Chunk';

/** Full source / falling column height. */
export const FLUID_SOURCE = 8;
/** Lowest flowing level before drying to air. */
export const FLUID_MIN = 1;
/** Search radius for nearest drop-off when choosing horizontal spread. */
const DROP_SEARCH = 4;

const DIRS_H: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export type FluidHost = {
  getBlock(wx: number, y: number, wz: number): number;
  setBlock(wx: number, y: number, z: number, block: number): boolean;
  /** Batched fluid write — preferred over setBlock for sim ticks. */
  applyFluid?(wx: number, y: number, z: number, block: number, level: number): boolean;
  /** Skip static world fluids (oceans). */
  shouldSimulateFluid?(wx: number, y: number, z: number, block: number): boolean;
  getChunk(cx: number, cz: number): Chunk | undefined;
  forEachReadyChunk(fn: (chunk: Chunk) => void): void;
  remeshDirty?: () => void;
};

type FluidUpdate = { x: number; y: number; z: number; block: number; level: number };

let acc = 0;
const TICK_INTERVAL = 0.12;
const MAX_UPDATES = 192;

function getLevel(host: FluidHost, wx: number, y: number, wz: number): number {
  const cx = Math.floor(wx / CHUNK_SIZE);
  const cz = Math.floor(wz / CHUNK_SIZE);
  const c = host.getChunk(cx, cz);
  if (!c?.ready) return 0;
  const lx = wx - cx * CHUNK_SIZE;
  const lz = wz - cz * CHUNK_SIZE;
  const b = c.getLocal(lx, y, lz);
  if (!isFluid(b)) return 0;
  const lv = c.fluidLevel[c.index(lx, y, lz)]!;
  return lv > 0 ? lv : FLUID_SOURCE;
}

function canOccupy(host: FluidHost, wx: number, y: number, wz: number, fluid: number): boolean {
  if (y < 1 || y >= CHUNK_HEIGHT - 1) return false;
  const b = host.getBlock(wx, y, wz);
  return b === Block.Air || b === fluid;
}

/** True if this column can drain downward at (wx,y,wz) or below within range. */
function isDropOff(host: FluidHost, wx: number, y: number, wz: number, fluid: number): boolean {
  const below = host.getBlock(wx, y - 1, wz);
  return below === Block.Air || (below === fluid && getLevel(host, wx, y - 1, wz) < FLUID_SOURCE);
}

/**
 * BFS within DROP_SEARCH for nearest hole. Returns preferred cardinal dirs,
 * or all open dirs if no hole found.
 */
function preferredSpreadDirs(
  host: FluidHost,
  wx: number,
  y: number,
  wz: number,
  fluid: number,
): [number, number][] {
  type Node = { x: number; z: number; dist: number; firstDx: number; firstDz: number };
  const visited = new Set<string>();
  const q: Node[] = [];
  const holeFirst = new Set<string>();

  for (const [dx, dz] of DIRS_H) {
    const nx = wx + dx;
    const nz = wz + dz;
    if (!canOccupy(host, nx, y, nz, fluid)) continue;
    const key = `${nx},${nz}`;
    visited.add(key);
    if (isDropOff(host, nx, y, nz, fluid)) {
      holeFirst.add(`${dx},${dz}`);
    }
    q.push({ x: nx, z: nz, dist: 1, firstDx: dx, firstDz: dz });
  }

  if (holeFirst.size > 0) {
    return DIRS_H.filter(([dx, dz]) => holeFirst.has(`${dx},${dz}`));
  }

  let bestDist = Infinity;
  const bestDirs = new Set<string>();

  while (q.length) {
    const n = q.shift()!;
    if (n.dist > DROP_SEARCH) continue;
    if (isDropOff(host, n.x, y, n.z, fluid)) {
      if (n.dist < bestDist) {
        bestDist = n.dist;
        bestDirs.clear();
        bestDirs.add(`${n.firstDx},${n.firstDz}`);
      } else if (n.dist === bestDist) {
        bestDirs.add(`${n.firstDx},${n.firstDz}`);
      }
      continue;
    }
    if (n.dist === DROP_SEARCH) continue;
    for (const [dx, dz] of DIRS_H) {
      const nx = n.x + dx;
      const nz = n.z + dz;
      const key = `${nx},${nz}`;
      if (visited.has(key)) continue;
      if (!canOccupy(host, nx, y, nz, fluid)) continue;
      visited.add(key);
      q.push({ x: nx, z: nz, dist: n.dist + 1, firstDx: n.firstDx, firstDz: n.firstDz });
    }
  }

  if (bestDirs.size > 0) {
    return DIRS_H.filter(([dx, dz]) => bestDirs.has(`${dx},${dz}`));
  }
  return DIRS_H.filter(([dx, dz]) => canOccupy(host, wx + dx, y, wz + dz, fluid));
}

/**
 * Expected flowing level from neighbors (Minecraft-style).
 * Sources (level === 8 with no fluid above forcing fall) stay 8 when marked as source.
 * Falling: fluid above → level 8. Else max(neighborLevel - cost).
 */
function computeExpectedLevel(
  host: FluidHost,
  wx: number,
  y: number,
  wz: number,
  fluid: number,
  currentLevel: number,
  isSource: boolean,
): number {
  const above = host.getBlock(wx, y + 1, wz);
  if (above === fluid) return FLUID_SOURCE;

  if (isSource && currentLevel === FLUID_SOURCE) return FLUID_SOURCE;

  const cost = fluid === Block.Lava ? 2 : 1;
  let best = 0;
  for (const [dx, dz] of DIRS_H) {
    const nb = host.getBlock(wx + dx, y, wz + dz);
    if (nb !== fluid) continue;
    const nl = getLevel(host, wx + dx, y, wz + dz);
    const next = nl - cost;
    if (next > best) best = next;
  }
  return best >= FLUID_MIN ? best : 0;
}

function queueSet(updates: FluidUpdate[], x: number, y: number, z: number, block: number, level: number): void {
  updates.push({ x, y, z, block, level });
}

/** Cellular fluid spread with drop-off pathfinding and drying. */
export function tickFluids(
  host: FluidHost & { getBlock: FluidHost['getBlock']; setBlock: FluidHost['setBlock'] },
  dt: number,
): void {
  tickFluidsNear(host, dt, 0, 0, Infinity);
}

/** Spread fluids only in chunks near (px, pz). */
export function tickFluidsNear(
  host: FluidHost & { getBlock: FluidHost['getBlock']; setBlock: FluidHost['setBlock'] },
  dt: number,
  px: number,
  pz: number,
  radiusChunks: number,
): void {
  acc += dt;
  if (acc < TICK_INTERVAL) return;
  acc = 0;

  const pcx = Math.floor(px / CHUNK_SIZE);
  const pcz = Math.floor(pz / CHUNK_SIZE);
  const r2 = radiusChunks * radiusChunks;
  const updates: FluidUpdate[] = [];

  host.forEachReadyChunk((chunk) => {
    if (!chunk.hasFluid) return;
    const dx = chunk.cx - pcx;
    const dz = chunk.cz - pcz;
    if (dx * dx + dz * dz > r2) return;

    const ox = chunk.cx * CHUNK_SIZE;
    const oz = chunk.cz * CHUNK_SIZE;

    for (let y = 1; y < CHUNK_HEIGHT - 1; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const i = chunk.index(x, y, z);
          const block = chunk.voxels[i]!;
          if (!isFluid(block)) continue;

          let level = chunk.fluidLevel[i]!;
          if (level <= 0) {
            level = FLUID_SOURCE;
            chunk.fluidLevel[i] = FLUID_SOURCE;
          }

          const wx = ox + x;
          const wz = oz + z;
          if (host.shouldSimulateFluid && !host.shouldSimulateFluid(wx, y, wz, block)) continue;

          const isLava = block === Block.Lava;
          const spreadCost = isLava ? 2 : 1;
          const isSource = level === FLUID_SOURCE && host.getBlock(wx, y + 1, wz) !== block;

          // --- Drying / level reconcile ---
          const expected = computeExpectedLevel(host, wx, y, wz, block, level, isSource);
          if (expected === 0 && !isSource) {
            queueSet(updates, wx, y, wz, Block.Air, 0);
            continue;
          }
          if (expected > 0 && expected < level && !isSource) {
            queueSet(updates, wx, y, wz, block, expected);
            level = expected;
          } else if (expected > level) {
            queueSet(updates, wx, y, wz, block, expected);
            level = expected;
          }

          const below = host.getBlock(wx, y - 1, wz);

          // --- Vertical flow ---
          if (below === Block.Air || (below === block && getLevel(host, wx, y - 1, wz) < FLUID_SOURCE)) {
            queueSet(updates, wx, y - 1, wz, block, FLUID_SOURCE);
            // Flowing (non-source) blocks fall away entirely.
            if (!isSource) queueSet(updates, wx, y, wz, Block.Air, 0);
            continue;
          }

          // Blocked by solid / other fluid — horizontal spread
          if (isSolid(below) || (isFluid(below) && below !== block) || below === block) {
            if (level <= spreadCost) continue;
            const next = level - spreadCost;
            if (next < FLUID_MIN) continue;

            const dirs = preferredSpreadDirs(host, wx, y, wz, block);
            for (const [ddx, ddz] of dirs) {
              const nx = wx + ddx;
              const nz = wz + ddz;
              const nb = host.getBlock(nx, y, nz);
              if (nb === Block.Air) {
                queueSet(updates, nx, y, nz, block, next);
              } else if (nb === block) {
                const nl = getLevel(host, nx, y, nz);
                if (nl < next) queueSet(updates, nx, y, nz, block, next);
              } else if (isSolid(nb) && y > 1) {
                // Flow over block edge onto step / cliff below.
                const drop = host.getBlock(nx, y - 1, nz);
                if (drop === Block.Air) {
                  queueSet(updates, nx, y - 1, nz, block, FLUID_SOURCE);
                } else if (drop === block && getLevel(host, nx, y - 1, nz) < next) {
                  queueSet(updates, nx, y - 1, nz, block, next);
                }
              }
            }
          }
        }
      }
    }
  });

  // Last write wins per cell (scan order is stable enough for one tick).
  const merged = new Map<string, FluidUpdate>();
  for (const u of updates) {
    merged.set(`${u.x},${u.y},${u.z}`, u);
  }

  const list = [...merged.values()];
  const limit = list.length > MAX_UPDATES ? list.slice(0, MAX_UPDATES) : list;
  for (const u of limit) {
    if (u.block === Block.Air) {
      if (host.getBlock(u.x, u.y, u.z) === Block.Air) continue;
      if (host.applyFluid) host.applyFluid(u.x, u.y, u.z, Block.Air, 0);
      else host.setBlock(u.x, u.y, u.z, Block.Air);
      continue;
    }
    const cur = host.getBlock(u.x, u.y, u.z);
    if (cur === Block.Air || (isFluid(cur) && cur === u.block)) {
      if (host.applyFluid) host.applyFluid(u.x, u.y, u.z, u.block, u.level);
      else {
        if (cur !== u.block) host.setBlock(u.x, u.y, u.z, u.block);
        const cx = Math.floor(u.x / CHUNK_SIZE);
        const cz = Math.floor(u.z / CHUNK_SIZE);
        const c = host.getChunk(cx, cz);
        if (c) c.fluidLevel[c.index(u.x - cx * CHUNK_SIZE, u.y, u.z - cz * CHUNK_SIZE)] = u.level;
      }
    }
  }
  void SEA_LEVEL;
  void chunkKey;
}

/** Ensure generated water/lava columns are marked as sources. */
export function seedFluidLevels(chunk: Chunk): void {
  let any = false;
  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const i = chunk.index(x, y, z);
        const b = chunk.voxels[i]!;
        if (isFluid(b)) {
          chunk.fluidLevel[i] = FLUID_SOURCE;
          any = true;
        }
      }
    }
  }
  chunk.hasFluid = any;
}

/** Visual height 0–1 from level (8 = full). */
export function fluidHeight(level: number): number {
  if (level <= 0) return 0;
  if (level >= FLUID_SOURCE) return 1;
  return level / FLUID_SOURCE;
}

export { chunkKey };
