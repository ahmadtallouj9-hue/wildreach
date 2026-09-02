import * as THREE from 'three';
import type { ChunkManager } from '../world/ChunkManager';
import { ItemRegistry } from '../inventory/ItemDefinition';
import { BLOCK_COLORS } from '../world/blocks';
import { ITEM_COLORS } from '../player/items';
import type { ItemStack } from '../inventory/ItemStack';

export interface ItemDropEntityOptions {
  id?: string;
  itemId: number;
  count: number;
  durability?: number;
  maxDurability?: number;
  position: THREE.Vector3;
  velocity?: THREE.Vector3;
  pickupDelay?: number;
}

export class ItemDropEntity {
  readonly id: string;
  readonly itemId: number;
  count: number;
  durability?: number;
  maxDurability?: number;

  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  readonly mesh: THREE.Mesh;

  age = 0;
  pickupDelay = 0.4; // 0.4s pickup cooldown after spawning
  isRemoved = false;

  constructor(options: ItemDropEntityOptions, private chunks: ChunkManager) {
    this.id = options.id ?? Math.random().toString(36).slice(2, 9);
    this.itemId = options.itemId;
    this.count = options.count;
    this.durability = options.durability;
    this.maxDurability = options.maxDurability;

    this.position = options.position.clone();
    const ang = Math.random() * Math.PI * 2;
    this.velocity =
      options.velocity?.clone() ??
      new THREE.Vector3(Math.cos(ang) * 1.5, 3.5, Math.sin(ang) * 1.5);
    this.pickupDelay = options.pickupDelay ?? 0.4;

    // Build 3D mesh representation
    const c = ITEM_COLORS[this.itemId] ?? BLOCK_COLORS[this.itemId] ?? [0.9, 0.75, 0.2];
    const mat = new THREE.MeshLambertMaterial({
      color: new THREE.Color(c[0], c[1], c[2]),
      emissive: 0x221105,
    });
    const geo = new THREE.BoxGeometry(0.32, 0.32, 0.32);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(this.position);
  }

  get canBePickedUp(): boolean {
    return this.age >= this.pickupDelay && !this.isRemoved;
  }

  toItemStack(): ItemStack {
    return {
      id: this.itemId,
      count: this.count,
      durability: this.durability,
      maxDurability: this.maxDurability,
    };
  }

  update(dt: number): void {
    if (this.isRemoved) return;
    this.age += dt;

    // Physics: gravity + air drag
    this.velocity.y -= 18 * dt;
    this.velocity.x *= 1 - 2 * dt;
    this.velocity.z *= 1 - 2 * dt;

    this.position.addScaledVector(this.velocity, dt);

    // Voxel ground collision
    const groundY = Math.floor(this.position.y);
    if (this.chunks.isSolidAt(Math.floor(this.position.x), groundY, Math.floor(this.position.z))) {
      if (this.position.y <= groundY + 1.15) {
        this.position.y = groundY + 1.15;
        this.velocity.y = 0;
      }
    }

    // Mesh transform & gentle bobbing/spin
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y += dt * 3.0;
  }

  canMergeWith(other: ItemDropEntity): boolean {
    if (this.isRemoved || other.isRemoved || this === other) return false;
    if (this.itemId !== other.itemId) return false;
    if (this.durability !== other.durability) return false;

    const def = ItemRegistry.get().get(this.itemId);
    const maxStack = def?.maxStackSize ?? 64;
    return this.count + other.count <= maxStack;
  }

  merge(other: ItemDropEntity): void {
    this.count += other.count;
    other.dispose();
  }

  dispose(): void {
    this.isRemoved = true;
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
