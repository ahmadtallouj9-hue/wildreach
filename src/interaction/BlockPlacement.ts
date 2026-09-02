import * as THREE from 'three';
import { CHUNK_HEIGHT } from '../world/blocks';
import { getBlockInteractionProperties } from './BlockInteractionProperties';
import { getBlockCollisionBoxes, intersectsAABB, createAABB, type AABB } from '../player/CollisionShape';
import { PlayerConfig } from '../player/PlayerConfig';
import type { ChunkManager } from '../world/ChunkManager';
import type { BlockHitResult } from './BlockRaycast';

export interface PlacementValidationResult {
  valid: boolean;
  x: number;
  y: number;
  z: number;
  reason?: string;
}

export function validateBlockPlacement(
  hit: BlockHitResult,
  blockToPlace: number,
  playerPos: THREE.Vector3,
  playerHeight: number,
  chunks: ChunkManager,
  playerWidth = PlayerConfig.dimensions.width,
): PlacementValidationResult {
  const { x, y, z } = hit.placePosition;

  // 1. World height boundary check
  if (y < 1 || y >= CHUNK_HEIGHT) {
    return { valid: false, x, y, z, reason: 'Out of world bounds' };
  }

  // 2. Existing cell replaceability check
  const existingBlock = chunks.getBlock(x, y, z);
  const existingProps = getBlockInteractionProperties(existingBlock);
  if (!existingProps.replaceable) {
    return { valid: false, x, y, z, reason: 'Target location is not replaceable' };
  }

  // 3. Player intersection collision check
  const half = playerWidth * 0.5;
  const playerAABB: AABB = createAABB(
    playerPos.x - half,
    playerPos.y,
    playerPos.z - half,
    playerPos.x + half,
    playerPos.y + playerHeight,
    playerPos.z + half,
  );

  const blockBoxes = getBlockCollisionBoxes(blockToPlace, x, y, z);
  for (let i = 0; i < blockBoxes.length; i++) {
    if (intersectsAABB(playerAABB, blockBoxes[i]!)) {
      return { valid: false, x, y, z, reason: 'Collides with player' };
    }
  }

  return { valid: true, x, y, z };
}
