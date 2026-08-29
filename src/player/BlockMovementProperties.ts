import { Block } from '../world/blocks';
import { PlayerConfig } from './PlayerConfig';

export interface BlockMovementProperties {
  friction: number;
  movementMultiplier: number;
  accelerationMultiplier: number;
}

const DEFAULT_BLOCK_PROPERTIES: BlockMovementProperties = {
  friction: PlayerConfig.movement.groundFriction, // 0.546
  movementMultiplier: 1.0,
  accelerationMultiplier: 1.0,
};

const BLOCK_PROPERTIES_MAP: Record<number, BlockMovementProperties> = {
  [Block.Ice]: {
    friction: 0.98, // Slippery ice
    movementMultiplier: 1.1,
    accelerationMultiplier: 0.4,
  },
  [Block.Snow]: {
    friction: 0.5,
    movementMultiplier: 0.9,
    accelerationMultiplier: 0.9,
  },
  [Block.Sand]: {
    friction: 0.546,
    movementMultiplier: 0.95,
    accelerationMultiplier: 0.95,
  },
  [Block.Moss]: {
    friction: 0.6,
    movementMultiplier: 1.0,
    accelerationMultiplier: 1.0,
  },
};

export function getBlockMovementProperties(blockId: number): BlockMovementProperties {
  return BLOCK_PROPERTIES_MAP[blockId] ?? DEFAULT_BLOCK_PROPERTIES;
}
