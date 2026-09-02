import * as THREE from 'three';
import { Block, BLOCK_COLORS } from '../world/blocks';
import type { ChunkManager } from '../world/ChunkManager';
import type { Inventory } from './Inventory';
import type { PlayerController } from './PlayerController';
import type { PlayerSurvival } from './PlayerSurvival';
import type { MobManager } from '../mobs/MobManager';
import { BlockInteractionSystem } from '../interaction/BlockInteractionSystem';
import type { RayHit } from '../world/voxelRaycast';
import type { PlayerInputSnapshot } from './PlayerInput';

export const PLACEABLE: { id: number; name: string }[] = [
  { id: Block.Grass, name: 'Grass' },
  { id: Block.Dirt, name: 'Dirt' },
  { id: Block.Stone, name: 'Stone' },
  { id: Block.Sand, name: 'Sand' },
  { id: Block.Wood, name: 'Oak Log' },
  { id: Block.Planks, name: 'Oak Planks' },
  { id: Block.CraftingTable, name: 'Crafting Table' },
  { id: Block.Cobblestone, name: 'Cobblestone' },
  { id: Block.CoalOre, name: 'Coal Ore' },
  { id: Block.IronOre, name: 'Iron Ore' },
  { id: Block.Leaves, name: 'Leaves' },
  { id: Block.Moss, name: 'Moss' },
  { id: Block.Crystal, name: 'Crystal' },
  { id: Block.Torch, name: 'Torch' },
  { id: Block.Gravel, name: 'Gravel' },
  { id: Block.Ice, name: 'Ice' },
  { id: Block.Water, name: 'Water' },
  { id: Block.DarkStone, name: 'Dark stone' },
  { id: Block.Lava, name: 'Lava' },
];

export class BlockInteraction {
  private system: BlockInteractionSystem;

  constructor(
    scene: THREE.Scene,
    chunks: ChunkManager,
    player: PlayerController,
    canvas: HTMLCanvasElement,
    inventory: Inventory,
    survival?: PlayerSurvival,
    mobManager?: MobManager,
    onOpenCraftingTable?: () => void,
    onInventoryChange?: () => void,
    onBlockChange?: (x: number, y: number, z: number, block: number) => void,
  ) {
    this.system = new BlockInteractionSystem({
      scene,
      chunks,
      player,
      canvas,
      inventory,
      survival,
      mobManager,
      onOpenCraftingTable,
      onInventoryChange,
      onBlockChange,
    });
  }

  get underlyingSystem(): BlockInteractionSystem {
    return this.system;
  }

  setEnabled(enabled: boolean): void {
    this.system.setEnabled(enabled);
  }

  setOnBlockChange(fn: (x: number, y: number, z: number, block: number) => void): void {
    this.system.setOnBlockChange(fn);
  }

  tryBreak(): void {
    this.system.tryBreak();
  }

  tryPlace(): void {
    this.system.tryPlace();
  }

  simulateTick(input: PlayerInputSnapshot): void {
    this.system.simulateTick(input);
  }

  update(dt: number): void {
    this.system.update(dt);
  }

  getLookAt(): { id: number; x: number; y: number; z: number } | null {
    return this.system.getLookAt();
  }

  get hit(): RayHit | null {
    const current = this.system.currentHit;
    if (!current || !current.hit) return null;
    return {
      x: current.blockPosition.x,
      y: current.blockPosition.y,
      z: current.blockPosition.z,
      px: current.placePosition.x,
      py: current.placePosition.y,
      pz: current.placePosition.z,
      face: current.faceNormal,
      distance: current.distance,
    };
  }

  dispose(): void {
    this.system.dispose();
  }
}

export function blockCssColor(id: number): string {
  const c = BLOCK_COLORS[id] ?? [1, 0, 1];
  return `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;
}
