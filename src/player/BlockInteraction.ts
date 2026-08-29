import * as THREE from 'three';
import { Block, BLOCK_COLORS, CHUNK_HEIGHT, isFluid } from '../world/blocks';
import type { ChunkManager } from '../world/ChunkManager';
import { voxelRaycast, type RayHit } from '../world/voxelRaycast';
import type { Inventory } from './Inventory';
import type { PlayerController } from './PlayerController';
import type { PlayerSurvival } from './PlayerSurvival';
import type { MobManager } from '../mobs/MobManager';
import {
  Item,
  isFood,
  isTool,
  toolMiningMultiplier,
  toolMeleeDamage,
  toolAttackCooldown,
} from './items';
import { ModManager } from '../modding/ModSystem';

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

const REACH = 6.5;

export class BlockInteraction {
  private hit: RayHit | null = null;
  private place: { x: number; y: number; z: number } | null = null;
  private highlight: THREE.LineSegments;
  private fluidHighlight: THREE.LineLoop;
  private cooldown = 0;
  private enabled = true;
  private onBlockChange: ((x: number, y: number, z: number, block: number) => void) | null = null;

  constructor(
    private scene: THREE.Scene,
    private chunks: ChunkManager,
    private player: PlayerController,
    private canvas: HTMLCanvasElement,
    private inventory: Inventory,
    private survival?: PlayerSurvival,
    private mobManager?: MobManager,
    private onOpenCraftingTable?: () => void,
    private onInventoryChange?: () => void,
    onBlockChange?: (x: number, y: number, z: number, block: number) => void,
  ) {
    this.highlight = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
      new THREE.LineBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.85,
        depthTest: true,
      }),
    );
    this.highlight.visible = false;
    this.highlight.renderOrder = 10;
    this.scene.add(this.highlight);

    this.fluidHighlight = new THREE.LineLoop(
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
    this.fluidHighlight.visible = false;
    this.fluidHighlight.renderOrder = 11;
    this.scene.add(this.fluidHighlight);

    this.bindInput();
    this.onBlockChange = onBlockChange ?? null;
  }

  get selectedBlock(): number {
    return this.inventory.selected?.id ?? Block.Air;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.highlight.visible = false;
      this.fluidHighlight.visible = false;
    }
  }

  setOnBlockChange(fn: (x: number, y: number, z: number, block: number) => void): void {
    this.onBlockChange = fn;
  }

  tryBreak(): void {
    if (!this.enabled || !this.player.aimActive) return;
    this.refresh();
    this.breakOrAttack();
  }

  tryPlace(): void {
    if (!this.enabled || !this.player.aimActive) return;
    this.refresh();
    this.placeOrInteract();
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
      this.refresh();
      this.placeOrInteract();
      if (!this.player.touchControlsActive && document.pointerLockElement !== this.canvas) {
        this.canvas.requestPointerLock();
      }
      return;
    }
    if (!this.player.aimActive) return;
    if (e.button === 0) {
      e.preventDefault();
      this.refresh();
      this.breakOrAttack();
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
    if (!this.enabled) return;
    if (this.survival?.isDead) return;
    if (e.code === 'KeyF') {
      e.preventDefault();
      this.refresh();
      this.placeOrInteract();
    }
  };

  private bindInput(): void {
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
    this.scene.remove(this.highlight);
    this.scene.remove(this.fluidHighlight);
    this.highlight.geometry.dispose();
    (this.highlight.material as THREE.Material).dispose();
    this.fluidHighlight.geometry.dispose();
    (this.fluidHighlight.material as THREE.Material).dispose();
  }

  update(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.enabled) this.refresh();
  }

  getLookAt(): { id: number; x: number; y: number; z: number } | null {
    if (!this.hit) return null;
    const id = this.chunks.getBlock(this.hit.x, this.hit.y, this.hit.z);
    if (id === Block.Air) return null;
    return { id, x: this.hit.x, y: this.hit.y, z: this.hit.z };
  }

  private refresh(): void {
    const origin = this.player.getAimOrigin();
    const dir = this.player.getAimDirection();
    origin.addScaledVector(dir, 0.05);

    this.hit = voxelRaycast(origin, dir, REACH, (x, y, z) => this.chunks.getBlock(x, y, z));
    this.place = this.hit ? this.resolvePlaceCell(this.hit) : null;

    if (this.hit) {
      const id = this.chunks.getBlock(this.hit.x, this.hit.y, this.hit.z);
      if (isFluid(id)) {
        this.highlight.visible = false;
        const lv = this.chunks.getFluidLevelAt(this.hit.x, this.hit.y, this.hit.z);
        const h = Math.max(0.08, lv / 8);
        this.fluidHighlight.visible = true;
        this.fluidHighlight.position.set(this.hit.x + 0.5, this.hit.y + h + 0.002, this.hit.z + 0.5);
      } else {
        this.fluidHighlight.visible = false;
        this.highlight.visible = true;
        this.highlight.scale.set(1, 1, 1);
        this.highlight.position.set(this.hit.x + 0.5, this.hit.y + 0.5, this.hit.z + 0.5);
      }
    } else {
      this.highlight.visible = false;
      this.fluidHighlight.visible = false;
    }
  }

  private resolvePlaceCell(hit: RayHit): { x: number; y: number; z: number } | null {
    let px = hit.px;
    let py = hit.py;
    let pz = hit.pz;

    if (px === hit.x && py === hit.y && pz === hit.z) {
      const dir = this.player.getAimDirection();
      const ax = Math.abs(dir.x);
      const ay = Math.abs(dir.y);
      const az = Math.abs(dir.z);
      if (ax >= ay && ax >= az) px = hit.x + (dir.x > 0 ? -1 : 1);
      else if (ay >= az) py = hit.y + (dir.y > 0 ? -1 : 1);
      else pz = hit.z + (dir.z > 0 ? -1 : 1);
    }

    if (!this.isEmpty(px, py, pz)) {
      const dirs: [number, number, number][] = [
        [0, 1, 0],
        [0, -1, 0],
        [1, 0, 0],
        [-1, 0, 0],
        [0, 0, 1],
        [0, 0, -1],
      ];
      const eye = this.player.getAimOrigin();
      dirs.sort((a, b) => {
        const da =
          (hit.x + a[0] + 0.5 - eye.x) ** 2 +
          (hit.y + a[1] + 0.5 - eye.y) ** 2 +
          (hit.z + a[2] + 0.5 - eye.z) ** 2;
        const db =
          (hit.x + b[0] + 0.5 - eye.x) ** 2 +
          (hit.y + b[1] + 0.5 - eye.y) ** 2 +
          (hit.z + b[2] + 0.5 - eye.z) ** 2;
        return da - db;
      });
      for (const [dx, dy, dz] of dirs) {
        const x = hit.x + dx;
        const y = hit.y + dy;
        const z = hit.z + dz;
        if (this.isEmpty(x, y, z) && !this.eyesIn(x, y, z)) return { x, y, z };
      }
      return null;
    }

    if (this.eyesIn(px, py, pz)) return null;
    return { x: px, y: py, z: pz };
  }

  private isEmpty(x: number, y: number, z: number): boolean {
    if (y < 1 || y >= CHUNK_HEIGHT) return false;
    const b = this.chunks.getBlock(x, y, z);
    return b === Block.Air || b === Block.Water;
  }

  private eyesIn(x: number, y: number, z: number): boolean {
    const e = this.player.getAimOrigin();
    return x <= e.x && e.x < x + 1 && y <= e.y && e.y < y + 1 && z <= e.z && e.z < z + 1;
  }

  private breakOrAttack(): void {
    if (this.cooldown > 0) return;

    const origin = this.player.getAimOrigin();
    const dir = this.player.getAimDirection();
    const selectedItem = this.inventory.selected;
    const toolId = selectedItem?.id ?? 0;

    // 1. Check if aim hits a Mob first (Phase D Combat)
    if (this.mobManager) {
      const hitMob = this.mobManager.raycastMob(origin, dir, 3.6);
      if (hitMob) {
        const dmg = toolMeleeDamage(toolId);
        const knockback = dir.clone().setY(0.25).normalize();
        hitMob.takeDamage(dmg, knockback);
        if (isTool(toolId)) {
          this.inventory.damageSelected(1);
        }
        this.cooldown = toolAttackCooldown(toolId);
        this.onInventoryChange?.();
        return;
      }
    }

    // 2. Block Breaking
    if (!this.hit) return;
    if (this.hit.y <= 0) return;
    const broken = this.chunks.getBlock(this.hit.x, this.hit.y, this.hit.z);
    if (broken === Block.Air || broken === Block.Water) return;

    // Compute tool mining speed multiplier
    const speedMult = toolMiningMultiplier(toolId, broken);
    const breakDelay = Math.max(0.04, 0.16 / speedMult);

    if (this.chunks.setBlock(this.hit.x, this.hit.y, this.hit.z, Block.Air)) {
      // Survival Drops Logic
      if (broken >= 32) {
        const drop = ModManager.get().getCustomBlockDrop(broken);
        this.inventory.add(drop.itemId, drop.count);
      } else if (broken === Block.Wood) {
        this.inventory.add(Block.Wood, 1);
      } else if (broken === Block.Stone) {
        // Stone drops cobblestone (Minecraft style)
        this.inventory.add(Block.Cobblestone, 1);
      } else if (broken === Block.Leaves) {
        const roll = Math.random();
        if (roll < 0.12) {
          this.inventory.add(Item.Apple, 1);
        } else if (roll < 0.28) {
          this.inventory.add(Item.Stick, 1);
        } else {
          this.inventory.add(Block.Leaves, 1);
        }
      } else if (broken === Block.CoalOre) {
        this.inventory.add(Item.Coal, 1);
      } else if (broken === Block.IronOre) {
        this.inventory.add(Block.IronOre, 1);
      } else {
        this.inventory.add(broken, 1);
      }

      if (isTool(toolId)) {
        this.inventory.damageSelected(1);
      }

      this.onInventoryChange?.();
      this.onBlockChange?.(this.hit.x, this.hit.y, this.hit.z, Block.Air);
      this.cooldown = breakDelay;
      this.refresh();
    }
  }

  private placeOrInteract(): void {
    if (this.cooldown > 0) return;

    const selectedItem = this.inventory.selected;
    const heldId = selectedItem?.id ?? 0;

    // 1. Food Consumption Check (Phase A Eating)
    if (isFood(heldId) && this.survival && this.survival.canEat(heldId)) {
      if (this.inventory.consumeSelected(1)) {
        this.survival.eat(heldId);
        this.cooldown = 0.35;
        this.onInventoryChange?.();
        return;
      }
    }

    // 2. Crafting Table Interaction (Phase B)
    if (this.hit && !this.player.sneaking) {
      const lookedBlock = this.chunks.getBlock(this.hit.x, this.hit.y, this.hit.z);
      if (lookedBlock === Block.CraftingTable) {
        this.onOpenCraftingTable?.();
        this.cooldown = 0.3;
        return;
      }
    }

    // 3. Block Placement
    if (!this.place) return;
    const { x, y, z } = this.place;
    if (!this.isEmpty(x, y, z) || this.eyesIn(x, y, z)) return;

    // Only blocks <= 99 can be placed in world (not tool items >= 100)
    if (heldId <= 0 || heldId >= 100) return;

    if (!this.inventory.consumeSelected(1)) return;
    if (this.chunks.setBlock(x, y, z, heldId)) {
      this.onInventoryChange?.();
      this.onBlockChange?.(x, y, z, heldId);
      this.cooldown = 0.08;
      this.refresh();
    } else {
      this.inventory.add(heldId, 1);
    }
  }
}

export function blockCssColor(id: number): string {
  const c = BLOCK_COLORS[id] ?? [1, 0, 1];
  return `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;
}
