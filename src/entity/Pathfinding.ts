import type { ChunkManager } from '../world/ChunkManager';
import { Block, isSolid } from '../world/blocks';

export type PathNode = { x: number; y: number; z: number };

const STEP_UP = 1;
const JUMP_CLEAR = 1.25;
const MAX_FALL = 4;

function key(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function heuristic(a: PathNode, b: PathNode): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) * 1.2 + Math.abs(a.z - b.z);
}

function walkCost(chunks: ChunkManager, x: number, y: number, z: number): number {
  const feet = chunks.getBlock(x, y, z);
  if (feet === Block.Lava) return 40;
  if (feet === Block.Water) return 6;
  return 1;
}

function canStand(chunks: ChunkManager, x: number, y: number, z: number): boolean {
  if (!isSolid(chunks.getBlock(x, y - 1, z))) return false;
  if (isSolid(chunks.getBlock(x, y, z))) return false;
  if (isSolid(chunks.getBlock(x, y + 1, z))) return false;
  // 1.25-block jump clearance: head space
  if (JUMP_CLEAR > 1 && isSolid(chunks.getBlock(x, y + 1, z))) return false;
  return true;
}

function neighbors(chunks: ChunkManager, n: PathNode): PathNode[] {
  const out: PathNode[] = [];
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const x = n.x + dx;
    const z = n.z + dz;
    for (let dy = -MAX_FALL; dy <= STEP_UP; dy++) {
      const y = n.y + dy;
      if (!canStand(chunks, x, y, z)) continue;
      if (dy > 0) {
        // Step/jump: need clearance above current feet
        if (isSolid(chunks.getBlock(n.x, n.y + 1, n.z))) continue;
      }
      out.push({ x, y, z });
    }
  }
  return out;
}

/** 3D voxel A* across surface-ish nodes with step, jump, fall, and fluid costs. */
export function findPath(
  chunks: ChunkManager,
  start: PathNode,
  goal: PathNode,
  maxNodes = 1200,
): PathNode[] | null {
  if (!canStand(chunks, start.x, start.y, start.z)) {
    start = { ...start, y: start.y + 1 };
  }
  if (!canStand(chunks, goal.x, goal.y, goal.z)) return null;

  const open: { n: PathNode; f: number; g: number }[] = [
    { n: start, f: heuristic(start, goal), g: 0 },
  ];
  const came = new Map<string, string>();
  const gScore = new Map<string, number>([[key(start.x, start.y, start.z), 0]]);
  let explored = 0;

  while (open.length && explored++ < maxNodes) {
    open.sort((a, b) => a.f - b.f);
    const cur = open.shift()!;
    if (cur.n.x === goal.x && cur.n.y === goal.y && cur.n.z === goal.z) {
      return reconstruct(came, cur.n);
    }
    for (const nb of neighbors(chunks, cur.n)) {
      const nk = key(nb.x, nb.y, nb.z);
      const step = walkCost(chunks, nb.x, nb.y, nb.z) + Math.abs(nb.y - cur.n.y) * 0.35;
      const g = cur.g + step;
      if (g >= (gScore.get(nk) ?? Infinity)) continue;
      came.set(nk, key(cur.n.x, cur.n.y, cur.n.z));
      gScore.set(nk, g);
      open.push({ n: nb, g, f: g + heuristic(nb, goal) });
    }
  }
  return null;
}

function reconstruct(came: Map<string, string>, goal: PathNode): PathNode[] {
  const path = [goal];
  let k = key(goal.x, goal.y, goal.z);
  while (came.has(k)) {
    const p = came.get(k)!;
    const [x, y, z] = p.split(',').map(Number) as [number, number, number];
    path.push({ x, y, z });
    k = p;
  }
  path.reverse();
  return path;
}
