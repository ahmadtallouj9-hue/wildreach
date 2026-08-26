import * as THREE from 'three';
import { Block, BLOCK_COLORS, CHUNK_HEIGHT, isFluid } from '../world/blocks';
import type { ChunkManager } from '../world/ChunkManager';
import { voxelRaycast, type RayHit } from '../world/voxelRaycast';
import type { Inventory } from './Inventory';
import type { PlayerController } from './PlayerController';

/** Kept for Hud/guide references. */
export const PLACEABLE: { id: number; name: string }[] = [
  { id: Block.Grass, name: 'Grass' },
  { id: Block.Dirt, name: 'Dirt' },
  { id: Block.Stone, name: 'Stone' },
  { id: Block.Sand, name: 'Sand' },
  { id: Block.Wood, name: 'Wood' },
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

const REACH = 8;

export class BlockInteraction {
  private hit: RayHit | null = null;
  private place: { x: number; y: number; z: number } | null = null;
  private highlight: THREE.LineSegments;
  /** Flat outline on fluid surface — avoids full-cube wire through neighbors. */
  private fluidHighlight: THREE.LineLoop;
  private cooldown = 0;
  private enabled = true;
  private onBlockChange: ((x: number, y: number, z: number, block: number) => void) | null =
    null;

  constructor(
    private scene: THREE.Scene,
    private chunks: ChunkManager,
    private player: PlayerController,
    private canvas: HTMLCanvasElement,
    private inventory: Inventory,
    private onInventoryChange?: () => void,
    onBlockChange?: (x: number, y: number, z: number, block: number) => void,
  ) {
    // Minecraft-style: wire outline only on the looked-at block (no filled ghost).
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
    this.breakBlock();
  }

  tryPlace(): void {
    if (!this.enabled || !this.player.aimActive) return;
    this.refresh();
    this.placeBlock();
  }

  private isGamePointer(e: Event): boolean {
    const t = e.target as Element | null;
    if (!t) return true;
    return !t.closest(
      '#touch-controls, .inv-root, #main-menu, .journal, .map-panel, .click-overlay',
    );
  }

  private bindInput(): void {
    document.addEventListener('pointerdown', (e) => {
      if (!this.enabled || !this.isGamePointer(e)) return;
      if (e.button === 2) {
        e.preventDefault();
        this.refresh();
        this.placeBlock();
        if (!this.player.touchControlsActive && document.pointerLockElement !== this.canvas) {
          this.canvas.requestPointerLock();
        }
        return;
      }
      if (!this.player.aimActive) return;
      if (e.button === 0) {
        e.preventDefault();
        this.refresh();
        // LMB always breaks — Shift is used for sprint, so Shift+LMB must not place.
        this.breakBlock();
      }
    });

    document.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener(
      'wheel',
      (e) => {
        if (!this.enabled || !this.player.aimActive) return;
        e.preventDefault();
        this.inventory.cycleHotbar(e.deltaY > 0 ? 1 : -1);
        this.onInventoryChange?.();
      },
      { passive: false },
    );

    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (e.code === 'KeyF') {
        e.preventDefault();
        this.refresh();
        this.placeBlock();
      }
    });
  }

  update(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.enabled) this.refresh();
  }

  /** Block under the crosshair, if any. */
  getLookAt(): { id: number; x: number; y: number; z: number } | null {
    if (!this.hit) return null;
    const id = this.chunks.getBlock(this.hit.x, this.hit.y, this.hit.z);
    if (id === Block.Air) return null;
    return { id, x: this.hit.x, y: this.hit.y, z: this.hit.z };
  }

  private refresh(): void {
    // Aim from the player's eyes along look direction — not the camera boom
    // (third/front cameras sit away from the head).
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

  private breakBlock(): void {
    if (this.cooldown > 0 || !this.hit) return;
    if (this.hit.y <= 0) return;
    const broken = this.chunks.getBlock(this.hit.x, this.hit.y, this.hit.z);
    if (broken === Block.Air || broken === Block.Water) return;
    if (this.chunks.setBlock(this.hit.x, this.hit.y, this.hit.z, Block.Air)) {
      this.inventory.add(broken, 1);
      this.onInventoryChange?.();
      this.onBlockChange?.(this.hit.x, this.hit.y, this.hit.z, Block.Air);
      this.cooldown = 0.05;
      this.refresh();
    }
  }

  private placeBlock(): void {
    if (this.cooldown > 0 || !this.place) return;
    const { x, y, z } = this.place;
    if (!this.isEmpty(x, y, z) || this.eyesIn(x, y, z)) return;
    const block = this.selectedBlock;
    if (block === Block.Air) return;
    if (!this.inventory.consumeSelected(1)) return;
    if (this.chunks.setBlock(x, y, z, block)) {
      this.onInventoryChange?.();
      this.onBlockChange?.(x, y, z, block);
      this.cooldown = 0.05;
      this.refresh();
    } else {
      this.inventory.add(block, 1);
    }
  }
}

export function blockCssColor(id: number): string {
  const c = BLOCK_COLORS[id] ?? [1, 0, 1];
  return `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;
}
