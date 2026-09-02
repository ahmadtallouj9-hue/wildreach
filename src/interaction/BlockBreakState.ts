import { TICK_RATE } from '../player/PlayerConfig';
import { getBlockInteractionProperties, getToolDefinition } from './BlockInteractionProperties';

export interface BlockBreakStateSnapshot {
  active: boolean;
  blockPosition: { x: number; y: number; z: number } | null;
  blockId: number;
  progress: number; // 0.0 to 1.0
  totalTicks: number;
  ticksElapsed: number;
  toolId: number;
}

export class BlockBreakState {
  active = false;
  blockPosition: { x: number; y: number; z: number } | null = null;
  blockId = 0;
  progress = 0;
  totalTicks = 1;
  ticksElapsed = 0;
  toolId = 0;

  /**
   * Calculates the required simulation ticks to break a given block with a tool.
   */
  static calculateRequiredTicks(blockId: number, toolId: number): number {
    const props = getBlockInteractionProperties(blockId);
    if (props.hardness <= 0) return 1;

    const tool = getToolDefinition(toolId);
    let speedMult = 1.0;

    if (props.preferredToolCategory === tool.category && tool.category !== 'none') {
      speedMult = tool.blockSpeedMultiplier;
    } else if (props.preferredToolCategory === 'shovel' || props.preferredToolCategory === 'none') {
      speedMult = 1.5;
    } else {
      speedMult = 0.7; // Wrong tool or fist on hard block
    }

    const breakDurationSec = Math.max(0.05, props.baseBreakTime / speedMult);
    return Math.max(1, Math.round(breakDurationSec * TICK_RATE));
  }

  start(x: number, y: number, z: number, blockId: number, toolId: number): void {
    this.active = true;
    this.blockPosition = { x, y, z };
    this.blockId = blockId;
    this.toolId = toolId;
    this.ticksElapsed = 0;
    this.totalTicks = BlockBreakState.calculateRequiredTicks(blockId, toolId);
    this.progress = 0;
  }

  tick(): boolean {
    if (!this.active || !this.blockPosition) return false;

    this.ticksElapsed++;
    this.progress = Math.min(1.0, this.ticksElapsed / this.totalTicks);
    return this.progress >= 1.0;
  }

  isMatchingTarget(x: number, y: number, z: number, blockId: number, toolId: number): boolean {
    if (!this.active || !this.blockPosition) return false;
    return (
      this.blockPosition.x === x &&
      this.blockPosition.y === y &&
      this.blockPosition.z === z &&
      this.blockId === blockId &&
      this.toolId === toolId
    );
  }

  cancel(): void {
    this.active = false;
    this.blockPosition = null;
    this.blockId = 0;
    this.progress = 0;
    this.ticksElapsed = 0;
    this.totalTicks = 1;
  }

  getSnapshot(): BlockBreakStateSnapshot {
    return {
      active: this.active,
      blockPosition: this.blockPosition ? { ...this.blockPosition } : null,
      blockId: this.blockId,
      progress: this.progress,
      totalTicks: this.totalTicks,
      ticksElapsed: this.ticksElapsed,
      toolId: this.toolId,
    };
  }
}
