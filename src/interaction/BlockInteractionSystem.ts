import * as THREE from 'three';
import { Block, isFluid } from '../world/blocks';
import type { ChunkManager } from '../world/ChunkManager';
import type { PlayerController } from '../player/PlayerController';
import type { Inventory } from '../player/Inventory';
import type { PlayerSurvival } from '../player/PlayerSurvival';
import type { MobManager } from '../mobs/MobManager';
import { PlayerConfig } from '../player/PlayerConfig';
import { isFood, isTool } from '../player/items';
import { raycastBlock, type BlockHitResult } from './BlockRaycast';
import { getBlockInteractionProperties } from './BlockInteractionProperties';
import { BlockBreakState } from './BlockBreakState';
import { validateBlockPlacement } from './BlockPlacement';
import { BlockInteractionEventEmitter } from './BlockInteractionEvents';
import { CombatSystem } from '../combat/CombatSystem';
import { getBlockCollisionBoxes } from '../player/CollisionShape';
import type { PlayerInputSnapshot } from '../player/PlayerInput';

export interface BlockInteractionSystemOptions {
  scene: THREE.Scene;
  chunks: ChunkManager;
  player: PlayerController;
  canvas: HTMLCanvasElement;
  inventory: Inventory;
  survival?: PlayerSurvival;
  mobManager?: MobManager;
  combatSystem?: CombatSystem;
  onOpenCraftingTable?: () => void;
  onInventoryChange?: () => void;
  onBlockChange?: (x: number, y: number, z: number, block: number) => void;
}

export class BlockInteractionSystem {
  readonly events = new BlockInteractionEventEmitter();
  readonly breakState = new BlockBreakState();
  readonly combat: CombatSystem;

  private scene: THREE.Scene;
  private chunks: ChunkManager;
  private player: PlayerController;
  private canvas: HTMLCanvasElement;
  private inventory: Inventory;
  private survival?: PlayerSurvival;
  private mobManager?: MobManager;

  private onOpenCraftingTable?: () => void;
  private onInventoryChange?: () => void;
  private onBlockChange?: (x: number, y: number, z: number, block: number) => void;

  private hitResult: BlockHitResult | null = null;
  private placeCooldown = 0;
  private enabled = true;

  // 3D Target Outlines
  private highlightGroup = new THREE.Group();
  private boxHighlightMesh: THREE.LineSegments;
  private fluidHighlightMesh: THREE.LineLoop;

  constructor(options: BlockInteractionSystemOptions) {
    this.scene = options.scene;
    this.chunks = options.chunks;
    this.player = options.player;
    this.canvas = options.canvas;
    this.inventory = options.inventory;
    this.survival = options.survival;
    this.mobManager = options.mobManager;
    this.combat = options.combatSystem ?? new CombatSystem(options.mobManager);

    this.onOpenCraftingTable = options.onOpenCraftingTable;
    this.onInventoryChange = options.onInventoryChange;
    this.onBlockChange = options.onBlockChange;

    // Build outline highlight geometries
    this.boxHighlightMesh = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
      new THREE.LineBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.85,
        depthTest: true,
      }),
    );
    this.boxHighlightMesh.visible = false;
    this.boxHighlightMesh.renderOrder = 10;
    this.highlightGroup.add(this.boxHighlightMesh);

    this.fluidHighlightMesh = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.501, 0, -0.501),
        new THREE.Vector3(0.501, 0, -0.501),
        new THREE.Vector3(0.501, 0, 0.501),
        new THREE.Vector3(-0.501, 0, 0.501),
      ]),
      new THREE.LineBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.75,
        depthTest: true,
      }),
    );
    this.fluidHighlightMesh.visible = false;
    this.fluidHighlightMesh.renderOrder = 11;
    this.highlightGroup.add(this.fluidHighlightMesh);

    this.scene.add(this.highlightGroup);
    this.bindDOMEvents();
  }

  get currentHit(): BlockHitResult | null {
    return this.hitResult;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.highlightGroup.visible = false;
      this.breakState.cancel();
    } else {
      this.highlightGroup.visible = true;
    }
  }

  setOnBlockChange(fn: (x: number, y: number, z: number, block: number) => void): void {
    this.onBlockChange = fn;
  }

  getLookAt(): { id: number; x: number; y: number; z: number } | null {
    if (!this.hitResult || !this.hitResult.hit) return null;
    const { x, y, z } = this.hitResult.blockPosition;
    const id = this.chunks.getBlock(x, y, z);
    if (id === Block.Air) return null;
    return { id, x, y, z };
  }

  /**
   * Deterministic 20 Hz fixed simulation step for block breaking, placement timers, and combat cooldown.
   */
  simulateTick(input: PlayerInputSnapshot): void {
    if (!this.enabled || this.survival?.isDead) {
      this.breakState.cancel();
      return;
    }

    this.combat.tick();

    if (this.placeCooldown > 0) {
      this.placeCooldown = Math.max(0, this.placeCooldown - PlayerConfig.tickDt);
    }

    const toolId = this.inventory.selected?.id ?? 0;

    // Handle continuous attack / breaking
    if (input.attackHeld || input.attackPressed) {
      this.processAttackOrBreakTick(toolId, input.attackPressed);
    } else {
      if (this.breakState.active) {
        this.breakState.cancel();
      }
    }

    // Handle block placement / interaction
    if (input.usePressed) {
      this.tryPlaceOrInteract();
    }
  }

  /**
   * Continuous render frame update (raycast refresh & visual outline update).
   */
  update(_dt: number): void {
    if (!this.enabled) return;

    this.refreshRaycast();
    this.updateHighlightMesh();
  }

  private refreshRaycast(): void {
    const origin = this.player.getAimOrigin();
    const dir = this.player.getAimDirection();
    origin.addScaledVector(dir, 0.05);

    const prevTarget = this.hitResult;
    this.hitResult = raycastBlock(
      origin,
      dir,
      PlayerConfig.interaction.blockReachDistance,
      (x, y, z) => this.chunks.getBlock(x, y, z),
      false,
    );

    // Emit target change events
    if (this.hitResult && (!prevTarget || prevTarget.blockPosition.x !== this.hitResult.blockPosition.x || prevTarget.blockPosition.y !== this.hitResult.blockPosition.y || prevTarget.blockPosition.z !== this.hitResult.blockPosition.z)) {
      this.events.emit('targeted', {
        blockId: this.hitResult.blockId,
        pos: this.hitResult.blockPosition,
        face: this.hitResult.face,
        distance: this.hitResult.distance,
      });
    } else if (!this.hitResult && prevTarget) {
      this.events.emit('targeted', null);
    }
  }

  private updateHighlightMesh(): void {
    if (!this.hitResult || !this.hitResult.hit) {
      this.boxHighlightMesh.visible = false;
      this.fluidHighlightMesh.visible = false;
      return;
    }

    const { x, y, z } = this.hitResult.blockPosition;
    const blockId = this.chunks.getBlock(x, y, z);

    if (isFluid(blockId)) {
      this.boxHighlightMesh.visible = false;
      const lv = this.chunks.getFluidLevelAt(x, y, z);
      const h = Math.max(0.08, lv / 8);
      this.fluidHighlightMesh.visible = true;
      this.fluidHighlightMesh.position.set(x + 0.5, y + h + 0.002, z + 0.5);
    } else {
      this.fluidHighlightMesh.visible = false;
      this.boxHighlightMesh.visible = true;

      // Check for partial block shapes (slabs, stairs, fences)
      const boxes = getBlockCollisionBoxes(blockId, x, y, z);
      if (boxes.length === 1) {
        const box = boxes[0]!;
        const width = box.maxX - box.minX;
        const height = box.maxY - box.minY;
        const depth = box.maxZ - box.minZ;
        const cx = (box.minX + box.maxX) * 0.5;
        const cy = (box.minY + box.maxY) * 0.5;
        const cz = (box.minZ + box.maxZ) * 0.5;

        this.boxHighlightMesh.scale.set(width * 1.002, height * 1.002, depth * 1.002);
        this.boxHighlightMesh.position.set(cx, cy, cz);
      } else {
        this.boxHighlightMesh.scale.set(1.002, 1.002, 1.002);
        this.boxHighlightMesh.position.set(x + 0.5, y + 0.5, z + 0.5);
      }
    }
  }

  private processAttackOrBreakTick(toolId: number, attackJustPressed: boolean): void {
    const origin = this.player.getAimOrigin();
    const dir = this.player.getAimDirection();

    // 1. Check Mob combat attack first
    if (attackJustPressed && this.mobManager) {
      const isGrounded = this.player.isOnGround;
      const velY = this.player.velocity.y;
      const combatResult = this.combat.executeAttack(
        origin,
        dir,
        toolId,
        isGrounded,
        velY,
        this.survival?.isDead ?? false,
      );

      if (combatResult.hit) {
        if (isTool(toolId)) {
          this.inventory.damageSelected(1);
        }
        this.onInventoryChange?.();
        this.breakState.cancel();
        return;
      }
    }

    // 2. Block Breaking
    if (!this.hitResult || !this.hitResult.hit) {
      this.breakState.cancel();
      return;
    }

    const { x, y, z } = this.hitResult.blockPosition;
    const blockId = this.chunks.getBlock(x, y, z);
    if (blockId === Block.Air || isFluid(blockId) || y <= 0) {
      this.breakState.cancel();
      return;
    }

    if (!this.breakState.isMatchingTarget(x, y, z, blockId, toolId)) {
      this.breakState.start(x, y, z, blockId, toolId);
      this.events.emit('breakStarted', {
        blockId,
        pos: { x, y, z },
        toolId,
        totalTicks: this.breakState.totalTicks,
      });
    }

    const completed = this.breakState.tick();
    this.events.emit('breakProgress', {
      blockId,
      pos: { x, y, z },
      progress: this.breakState.progress,
    });

    if (completed) {
      this.completeBreak(x, y, z, blockId, toolId);
    }
  }

  private completeBreak(x: number, y: number, z: number, blockId: number, toolId: number): void {
    const props = getBlockInteractionProperties(blockId);
    const drops = props.drops(blockId, toolId);

    if (this.chunks.setBlock(x, y, z, Block.Air)) {
      if (this.mobManager) {
        // Spawn physical item drop entities in the voxel world
        for (let i = 0; i < drops.length; i++) {
          this.mobManager.dropItem(
            drops[i]!.itemId,
            drops[i]!.count,
            new THREE.Vector3(x + 0.5, y + 0.2, z + 0.5),
          );
        }
      } else {
        // Fallback to direct inventory add if no drop manager exists
        for (let i = 0; i < drops.length; i++) {
          this.inventory.add(drops[i]!.itemId, drops[i]!.count);
        }
      }

      if (isTool(toolId)) {
        this.inventory.damageSelected(1);
      }

      this.events.emit('broken', {
        blockId,
        pos: { x, y, z },
        toolId,
        drops,
      });

      this.onInventoryChange?.();
      this.onBlockChange?.(x, y, z, Block.Air);
      this.breakState.cancel();
      this.refreshRaycast();
    }
  }

  tryBreak(): void {
    if (!this.enabled || !this.player.aimActive) return;
    this.refreshRaycast();
    const toolId = this.inventory.selected?.id ?? 0;
    this.processAttackOrBreakTick(toolId, true);
  }

  tryPlace(): void {
    if (!this.enabled || !this.player.aimActive) return;
    this.refreshRaycast();
    this.tryPlaceOrInteract();
  }

  private tryPlaceOrInteract(): void {
    if (this.placeCooldown > 0) return;

    const selectedItem = this.inventory.selected;
    const heldId = selectedItem?.id ?? 0;

    // 1. Food Consumption
    if (isFood(heldId) && this.survival && this.survival.canEat(heldId)) {
      if (this.inventory.consumeSelected(1)) {
        this.survival.eat(heldId);
        this.placeCooldown = 0.35;
        this.onInventoryChange?.();
        return;
      }
    }

    // 2. Interactive Blocks (Crafting Table)
    if (this.hitResult && this.hitResult.hit && !this.player.sneaking) {
      const { x, y, z } = this.hitResult.blockPosition;
      const lookedBlock = this.chunks.getBlock(x, y, z);
      if (lookedBlock === Block.CraftingTable) {
        this.events.emit('used', {
          blockId: lookedBlock,
          pos: { x, y, z },
          action: 'crafting_table',
        });
        this.onOpenCraftingTable?.();
        this.placeCooldown = 0.3;
        return;
      }
    }

    // 3. Block Placement
    if (!this.hitResult || !this.hitResult.hit) return;
    if (heldId <= 0 || heldId >= 100) return; // Non-placeable items

    const validation = validateBlockPlacement(
      this.hitResult,
      heldId,
      this.player.position,
      this.player.playerHeight,
      this.chunks,
      PlayerConfig.dimensions.width,
    );

    if (!validation.valid) return;

    if (!this.inventory.consumeSelected(1)) return;

    if (this.chunks.setBlock(validation.x, validation.y, validation.z, heldId)) {
      this.events.emit('placed', {
        blockId: heldId,
        pos: { x: validation.x, y: validation.y, z: validation.z },
        face: this.hitResult.face,
      });

      this.onInventoryChange?.();
      this.onBlockChange?.(validation.x, validation.y, validation.z, heldId);
      this.placeCooldown = PlayerConfig.interaction.placeCooldown;
      this.refreshRaycast();
    } else {
      this.inventory.add(heldId, 1);
    }
  }

  private isGamePointer(e: Event): boolean {
    const t = e.target as Element | null;
    if (!t) return true;
    return !t.closest(
      '#touch-controls, .inv-root, #main-menu, .journal, .map-panel, .click-overlay, .vy-death-screen',
    );
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (!this.enabled || !this.isGamePointer(e)) return;
    if (this.survival?.isDead) return;

    if (e.button === 2) {
      e.preventDefault();
      this.refreshRaycast();
      this.tryPlaceOrInteract();
      if (!this.player.touchControlsActive && document.pointerLockElement !== this.canvas) {
        this.canvas.requestPointerLock();
      }
      return;
    }

    if (!this.player.aimActive) return;
    if (e.button === 0) {
      e.preventDefault();
      this.refreshRaycast();
      const toolId = this.inventory.selected?.id ?? 0;
      this.processAttackOrBreakTick(toolId, true);
    }
  };

  private onContextMenu = (e: Event): void => {
    e.preventDefault();
  };

  private onWheel = (e: WheelEvent): void => {
    if (!this.enabled || !this.player.aimActive) return;
    e.preventDefault();
    this.inventory.cycleHotbar(e.deltaY > 0 ? 1 : -1);
    this.onInventoryChange?.();
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.enabled || this.survival?.isDead) return;
    if (e.code === 'KeyF') {
      e.preventDefault();
      this.refreshRaycast();
      this.tryPlaceOrInteract();
    }
  };

  private bindDOMEvents(): void {
    document.addEventListener('pointerdown', this.onPointerDown);
    document.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', this.onKeyDown);
  }

  dispose(): void {
    document.removeEventListener('pointerdown', this.onPointerDown);
    document.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onKeyDown);
    this.events.removeAllListeners();

    this.scene.remove(this.highlightGroup);
    this.boxHighlightMesh.geometry.dispose();
    (this.boxHighlightMesh.material as THREE.Material).dispose();
    this.fluidHighlightMesh.geometry.dispose();
    (this.fluidHighlightMesh.material as THREE.Material).dispose();
  }
}
