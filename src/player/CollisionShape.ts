import { isSolid } from '../world/blocks';

export interface AABB {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export function createAABB(
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
): AABB {
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

export function intersectsAABB(a: AABB, b: AABB): boolean {
  return (
    a.minX < b.maxX &&
    a.maxX > b.minX &&
    a.minY < b.maxY &&
    a.maxY > b.minY &&
    a.minZ < b.maxZ &&
    a.maxZ > b.minZ
  );
}

export type Facing = 'north' | 'south' | 'east' | 'west'; // north: -Z, south: +Z, east: +X, west: -X
export type SlabType = 'bottom' | 'top' | 'double';
export type StairShape = 'straight' | 'inner_left' | 'inner_right' | 'outer_left' | 'outer_right';
export type Half = 'bottom' | 'top';
export type DoorHinge = 'left' | 'right';

export interface BlockStateContext {
  slabType?: SlabType;
  stairHalf?: Half;
  stairFacing?: Facing;
  stairShape?: StairShape;
  fenceConnections?: { north: boolean; south: boolean; east: boolean; west: boolean };
  wallConnections?: { north: boolean; south: boolean; east: boolean; west: boolean; up?: boolean };
  doorOpen?: boolean;
  doorFacing?: Facing;
  doorHinge?: DoorHinge;
  doorHalf?: 'lower' | 'upper';
  trapdoorOpen?: boolean;
  trapdoorHalf?: Half;
  trapdoorFacing?: Facing;
}

/**
 * Registry mapping block types or custom IDs to specific collision geometry generators.
 */
export type CollisionBoxProvider = (x: number, y: number, z: number, ctx?: BlockStateContext) => AABB[];

const shapeProviders = new Map<number | string, CollisionBoxProvider>();

export function registerCollisionShape(blockIdOrName: number | string, provider: CollisionBoxProvider): void {
  shapeProviders.set(blockIdOrName, provider);
}

// ── SLAB COLLISION SHAPES ──
export function getSlabCollisionBoxes(x: number, y: number, z: number, slabType: SlabType = 'bottom'): AABB[] {
  if (slabType === 'top') {
    return [createAABB(x, y + 0.5, z, x + 1, y + 1, z + 1)];
  }
  if (slabType === 'double') {
    return [createAABB(x, y, z, x + 1, y + 1, z + 1)];
  }
  // bottom slab
  return [createAABB(x, y, z, x + 1, y + 0.5, z + 1)];
}

// ── STAIR COLLISION SHAPES ──
export function getStairCollisionBoxes(
  x: number,
  y: number,
  z: number,
  facing: Facing = 'north',
  half: Half = 'bottom',
): AABB[] {
  const boxes: AABB[] = [];

  if (half === 'bottom') {
    // 1. Bottom full base: y to y + 0.5
    boxes.push(createAABB(x, y, z, x + 1, y + 0.5, z + 1));

    // 2. Upper step half: y + 0.5 to y + 1.0 depending on facing direction
    switch (facing) {
      case 'north': // Ascends to north (-Z), step is on south (+Z) side
        boxes.push(createAABB(x, y + 0.5, z + 0.5, x + 1, y + 1.0, z + 1.0));
        break;
      case 'south': // Ascends to south (+Z), step is on north (-Z) side
        boxes.push(createAABB(x, y + 0.5, z, x + 1, y + 1.0, z + 0.5));
        break;
      case 'west': // Ascends to west (-X), step is on east (+X) side
        boxes.push(createAABB(x + 0.5, y + 0.5, z, x + 1.0, y + 1.0, z + 1));
        break;
      case 'east': // Ascends to east (+X), step is on west (-X) side
        boxes.push(createAABB(x, y + 0.5, z, x + 0.5, y + 1.0, z + 1));
        break;
    }
  } else {
    // Top inverted stair
    // 1. Top full ceiling: y + 0.5 to y + 1.0
    boxes.push(createAABB(x, y + 0.5, z, x + 1, y + 1.0, z + 1));

    // 2. Lower step half: y to y + 0.5 depending on facing direction
    switch (facing) {
      case 'north':
        boxes.push(createAABB(x, y, z + 0.5, x + 1, y + 0.5, z + 1.0));
        break;
      case 'south':
        boxes.push(createAABB(x, y, z, x + 1, y + 0.5, z + 0.5));
        break;
      case 'west':
        boxes.push(createAABB(x + 0.5, y, z, x + 1.0, y + 0.5, z + 1));
        break;
      case 'east':
        boxes.push(createAABB(x, y, z, x + 0.5, y + 0.5, z + 1));
        break;
    }
  }

  return boxes;
}

// ── FENCE COLLISION SHAPES ──
export function getFenceCollisionBoxes(
  x: number,
  y: number,
  z: number,
  connections = { north: false, south: false, east: false, west: false },
): AABB[] {
  const boxes: AABB[] = [];
  // In Minecraft Java, fences are 1.5 blocks tall in collision to prevent standard jumping over
  const fenceHeight = 1.5;

  // Center post: 0.375 to 0.625 (4/16 to 12/16 = 6/16 to 10/16 = 0.375 to 0.625)
  boxes.push(createAABB(x + 0.375, y, z + 0.375, x + 0.625, y + fenceHeight, z + 0.625));

  // Connected arms: width 0.125 (2/16) from post to edge
  if (connections.north) {
    boxes.push(createAABB(x + 0.4375, y, z, x + 0.5625, y + fenceHeight, z + 0.375));
  }
  if (connections.south) {
    boxes.push(createAABB(x + 0.4375, y, z + 0.625, x + 0.5625, y + fenceHeight, z + 1.0));
  }
  if (connections.west) {
    boxes.push(createAABB(x, y, z + 0.4375, x + 0.375, y + fenceHeight, z + 0.5625));
  }
  if (connections.east) {
    boxes.push(createAABB(x + 0.625, y, z + 0.4375, x + 1.0, y + fenceHeight, z + 0.5625));
  }

  return boxes;
}

// ── WALL COLLISION SHAPES ──
export function getWallCollisionBoxes(
  x: number,
  y: number,
  z: number,
  connections = { north: false, south: false, east: false, west: false },
): AABB[] {
  const boxes: AABB[] = [];
  // Walls in Minecraft Java are also 1.5 blocks high in collision box
  const wallHeight = 1.5;

  // Center post: 0.25 to 0.75 (8/16 width)
  boxes.push(createAABB(x + 0.25, y, z + 0.25, x + 0.75, y + wallHeight, z + 0.75));

  if (connections.north) {
    boxes.push(createAABB(x + 0.3125, y, z, x + 0.6875, y + wallHeight, z + 0.25));
  }
  if (connections.south) {
    boxes.push(createAABB(x + 0.3125, y, z + 0.75, x + 0.6875, y + wallHeight, z + 1.0));
  }
  if (connections.west) {
    boxes.push(createAABB(x, y, z + 0.3125, x + 0.25, y + wallHeight, z + 0.6875));
  }
  if (connections.east) {
    boxes.push(createAABB(x + 0.75, y, z + 0.3125, x + 1.0, y + wallHeight, z + 0.6875));
  }

  return boxes;
}

// ── TRAPDOOR COLLISION SHAPES ──
export function getTrapdoorCollisionBoxes(
  x: number,
  y: number,
  z: number,
  open = false,
  half: Half = 'bottom',
  facing: Facing = 'north',
): AABB[] {
  const thickness = 0.1875; // 3/16 = 0.1875

  if (!open) {
    // Horizontal closed trapdoor
    if (half === 'top') {
      return [createAABB(x, y + 1.0 - thickness, z, x + 1, y + 1.0, z + 1)];
    }
    return [createAABB(x, y, z, x + 1, y + thickness, z + 1)];
  }

  // Open vertical trapdoor (flush against the side indicated by facing)
  switch (facing) {
    case 'north': // Flush against north wall (z)
      return [createAABB(x, y, z, x + 1, y + 1, z + thickness)];
    case 'south': // Flush against south wall (z + 1)
      return [createAABB(x, y, z + 1.0 - thickness, x + 1, y + 1, z + 1.0)];
    case 'west': // Flush against west wall (x)
      return [createAABB(x, y, z, x + thickness, y + 1, z + 1)];
    case 'east': // Flush against east wall (x + 1)
      return [createAABB(x + 1.0 - thickness, y, z, x + 1.0, y + 1, z + 1)];
  }
}

// ── DOOR COLLISION SHAPES ──
export function getDoorCollisionBoxes(
  x: number,
  y: number,
  z: number,
  open = false,
  facing: Facing = 'north',
  hinge: DoorHinge = 'left',
): AABB[] {
  const thickness = 0.1875; // 3/16

  if (!open) {
    // Closed door along the facing edge
    switch (facing) {
      case 'north':
        return [createAABB(x, y, z, x + 1, y + 1, z + thickness)];
      case 'south':
        return [createAABB(x, y, z + 1.0 - thickness, x + 1, y + 1, z + 1.0)];
      case 'west':
        return [createAABB(x, y, z, x + thickness, y + 1, z + 1)];
      case 'east':
        return [createAABB(x + 1.0 - thickness, y, z, x + 1.0, y + 1, z + 1)];
    }
  }

  // Open door (rotates 90 deg around hinge)
  if (facing === 'north') {
    if (hinge === 'left') {
      // Swings to west edge (x)
      return [createAABB(x, y, z, x + thickness, y + 1, z + 1)];
    }
    // Swings to east edge (x+1)
    return [createAABB(x + 1.0 - thickness, y, z, x + 1.0, y + 1, z + 1)];
  }
  if (facing === 'south') {
    if (hinge === 'left') {
      return [createAABB(x + 1.0 - thickness, y, z, x + 1.0, y + 1, z + 1)];
    }
    return [createAABB(x, y, z, x + thickness, y + 1, z + 1)];
  }
  if (facing === 'west') {
    if (hinge === 'left') {
      return [createAABB(x, y, z + 1.0 - thickness, x + 1, y + 1, z + 1.0)];
    }
    return [createAABB(x, y, z, x + 1, y + 1, z + thickness)];
  }
  // east
  if (hinge === 'left') {
    return [createAABB(x, y, z, x + 1, y + 1, z + thickness)];
  }
  return [createAABB(x, y, z + 1.0 - thickness, x + 1, y + 1, z + 1.0)];
}

/**
 * Returns the collision bounding boxes for a specific block at integer world coordinates (x, y, z).
 * Full cube solid blocks return 1 full AABB [x, y, z] to [x+1, y+1, z+1].
 * Non-collidable blocks (Air, Water, Lava, Torch) return an empty array [].
 * Supports custom registered shapes or block context.
 */
export function getBlockCollisionBoxes(
  blockId: number,
  x: number,
  y: number,
  z: number,
  ctx?: BlockStateContext,
): AABB[] {
  // Check registered custom provider first
  const custom = shapeProviders.get(blockId);
  if (custom) {
    return custom(x, y, z, ctx);
  }

  if (!isSolid(blockId)) {
    return [];
  }

  // Default Full 1x1x1 solid block
  return [
    {
      minX: x,
      minY: y,
      minZ: z,
      maxX: x + 1,
      maxY: y + 1,
      maxZ: z + 1,
    },
  ];
}
