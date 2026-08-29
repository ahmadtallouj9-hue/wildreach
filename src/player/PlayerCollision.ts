import * as THREE from 'three';
import type { ChunkManager } from '../world/ChunkManager';
import { PlayerConfig } from './PlayerConfig';
import { createAABB, getBlockCollisionBoxes, intersectsAABB, type AABB } from './CollisionShape';

export interface CollisionResult {
  hitX: boolean;
  hitY: boolean;
  hitZ: boolean;
  hitCeiling: boolean;
  onGround: boolean;
  steppedUp: boolean;
  groundBlock: number;
}

export class PlayerCollision {
  constructor(private chunks: ChunkManager) {}

  /**
   * Constructs the player's bounding box AABB at feet position `pos`.
   */
  getPlayerAABB(
    pos: THREE.Vector3,
    width: number = PlayerConfig.dimensions.width,
    height: number = PlayerConfig.dimensions.standingHeight,
  ): AABB {
    const half = width * 0.5;
    return createAABB(
      pos.x - half,
      pos.y,
      pos.z - half,
      pos.x + half,
      pos.y + height,
      pos.z + half,
    );
  }

  /**
   * Retrieves all block collision AABBs overlapping the query region.
   */
  getBlockBoxesInRegion(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): AABB[] {
    const x0 = Math.floor(minX);
    const x1 = Math.floor(maxX);
    const y0 = Math.floor(minY);
    const y1 = Math.floor(maxY);
    const z0 = Math.floor(minZ);
    const z1 = Math.floor(maxZ);

    const boxes: AABB[] = [];

    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          const block = this.chunks.getBlock(x, y, z);
          const blockBoxes = getBlockCollisionBoxes(block, x, y, z);
          for (let i = 0; i < blockBoxes.length; i++) {
            boxes.push(blockBoxes[i]!);
          }
        }
      }
    }

    return boxes;
  }

  /**
   * Checks if the player AABB at `pos` intersects any solid block collision boxes.
   */
  isBoxBlocked(
    pos: THREE.Vector3,
    width: number = PlayerConfig.dimensions.width,
    height: number = PlayerConfig.dimensions.standingHeight,
  ): boolean {
    const playerBox = this.getPlayerAABB(pos, width, height);
    const boxes = this.getBlockBoxesInRegion(
      playerBox.minX,
      playerBox.minY,
      playerBox.minZ,
      playerBox.maxX,
      playerBox.maxY,
      playerBox.maxZ,
    );

    for (let i = 0; i < boxes.length; i++) {
      if (intersectsAABB(playerBox, boxes[i]!)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if player can safely stand up without colliding with ceiling blocks.
   */
  canStandUp(pos: THREE.Vector3): boolean {
    return !this.isBoxBlocked(
      pos,
      PlayerConfig.dimensions.width,
      PlayerConfig.dimensions.standingHeight,
    );
  }

  /**
   * Checks if moving by (dx, dz) while on ground and sneaking would step off an edge into open air.
   * Restricts horizontal delta to prevent falling off solid blocks.
   */
  restrictSneakDelta(
    pos: THREE.Vector3,
    dx: number,
    dz: number,
    width: number = PlayerConfig.dimensions.width,
    height: number = PlayerConfig.dimensions.sneakingHeight,
  ): { dx: number; dz: number } {
    // Check X
    let testX = dx;
    while (testX !== 0) {
      const p = pos.clone();
      p.x += testX;
      p.y -= 0.1; // check underneath
      if (this.isBoxBlocked(p, width, height)) {
        break;
      }
      if (Math.abs(testX) < 0.02) {
        testX = 0;
        break;
      }
      testX -= Math.sign(testX) * 0.02;
    }

    // Check Z
    let testZ = dz;
    while (testZ !== 0) {
      const p = pos.clone();
      p.x += testX;
      p.z += testZ;
      p.y -= 0.1; // check underneath
      if (this.isBoxBlocked(p, width, height)) {
        break;
      }
      if (Math.abs(testZ) < 0.02) {
        testZ = 0;
        break;
      }
      testZ -= Math.sign(testZ) * 0.02;
    }

    return { dx: testX, dz: testZ };
  }

  /**
   * Resolves player movement and collision with swept AABB + step-up support.
   */
  resolveMovement(
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    height: number,
    width: number = PlayerConfig.dimensions.width,
    sneakingOnGround = false,
  ): CollisionResult {
    let hitX = false;
    let hitY = false;
    let hitZ = false;
    let hitCeiling = false;
    let onGround = false;
    let steppedUp = false;

    const half = width * 0.5;
    const maxStep = PlayerConfig.movement.maxStepHeight;

    let moveX = vel.x;
    let moveZ = vel.z;

    // Apply sneak edge restriction if sneaking on ground
    if (sneakingOnGround) {
      const restricted = this.restrictSneakDelta(pos, moveX, moveZ, width, height);
      moveX = restricted.dx;
      moveZ = restricted.dz;
    }

    // 1. Resolve Horizontal X
    if (moveX !== 0) {
      const moved = this.moveSingleAxis(pos, moveX, 'x', half, height);
      if (moved.collided) {
        // Test Step-Up if small obstacle
        const stepResult = this.tryStepUp(pos, moveX, 0, half, height, maxStep);
        if (stepResult.success) {
          pos.copy(stepResult.newPos);
          steppedUp = true;
        } else {
          hitX = true;
          vel.x = 0;
        }
      }
    }

    // 2. Resolve Horizontal Z
    if (moveZ !== 0) {
      const moved = this.moveSingleAxis(pos, moveZ, 'z', half, height);
      if (moved.collided) {
        // Test Step-Up if small obstacle
        const stepResult = this.tryStepUp(pos, 0, moveZ, half, height, maxStep);
        if (stepResult.success) {
          pos.copy(stepResult.newPos);
          steppedUp = true;
        } else {
          hitZ = true;
          vel.z = 0;
        }
      }
    }

    // 3. Resolve Vertical Y
    if (vel.y !== 0) {
      const moved = this.moveSingleAxis(pos, vel.y, 'y', half, height);
      if (moved.collided) {
        if (vel.y < 0) {
          onGround = true;
          hitY = true;
        } else {
          hitCeiling = true;
          hitY = true;
        }
        vel.y = 0;
      }
    }

    // Check ground support underneath feet if not already verified
    if (!onGround) {
      const testPos = pos.clone();
      testPos.y -= 0.05;
      if (this.isBoxBlocked(testPos, width, height)) {
        onGround = true;
      }
    }

    const groundBlock = this.getGroundBlock(pos);

    return {
      hitX,
      hitY,
      hitZ,
      hitCeiling,
      onGround,
      steppedUp,
      groundBlock,
    };
  }

  /**
   * Helper to move along one axis with substep anti-tunneling.
   */
  private moveSingleAxis(
    pos: THREE.Vector3,
    delta: number,
    axis: 'x' | 'y' | 'z',
    half: number,
    height: number,
  ): { collided: boolean } {
    if (delta === 0) return { collided: false };

    const maxSubstep = 0.35;
    const steps = Math.max(1, Math.ceil(Math.abs(delta) / maxSubstep));
    const step = delta / steps;

    for (let s = 0; s < steps; s++) {
      pos[axis] += step;

      const playerBox = createAABB(
        pos.x - half,
        pos.y,
        pos.z - half,
        pos.x + half,
        pos.y + height,
        pos.z + half,
      );

      const blockBoxes = this.getBlockBoxesInRegion(
        playerBox.minX,
        playerBox.minY,
        playerBox.minZ,
        playerBox.maxX,
        playerBox.maxY,
        playerBox.maxZ,
      );

      let blocked = false;
      for (let i = 0; i < blockBoxes.length; i++) {
        if (intersectsAABB(playerBox, blockBoxes[i]!)) {
          blocked = true;
          break;
        }
      }

      if (blocked) {
        pos[axis] -= step; // Revert step
        return { collided: true };
      }
    }

    return { collided: false };
  }

  /**
   * Step-up elevation testing.
   */
  private tryStepUp(
    pos: THREE.Vector3,
    dx: number,
    dz: number,
    half: number,
    height: number,
    maxStep: number,
  ): { success: boolean; newPos: THREE.Vector3 } {
    const candidate = pos.clone();

    // 1. Lift upward by step height
    candidate.y += maxStep;
    if (this.isBoxBlocked(candidate, half * 2, height)) {
      return { success: false, newPos: pos };
    }

    // 2. Move horizontally
    candidate.x += dx;
    candidate.z += dz;
    if (this.isBoxBlocked(candidate, half * 2, height)) {
      return { success: false, newPos: pos };
    }

    // 3. Lower downward back to solid surface
    const downSubstep = 0.05;
    while (candidate.y > pos.y) {
      candidate.y -= downSubstep;
      if (this.isBoxBlocked(candidate, half * 2, height)) {
        candidate.y += downSubstep;
        break;
      }
    }

    return { success: true, newPos: candidate };
  }

  /**
   * Returns the block ID right below the player's feet.
   */
  getGroundBlock(pos: THREE.Vector3): number {
    const x = Math.floor(pos.x);
    const y = Math.floor(pos.y - 0.1);
    const z = Math.floor(pos.z);
    return this.chunks.getBlock(x, y, z);
  }
}
