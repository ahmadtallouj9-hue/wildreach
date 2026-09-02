import * as THREE from 'three';
import { Mob, type MobType } from './Mob';
import type { ChunkManager } from '../world/ChunkManager';
import { Block } from '../world/blocks';
import { ItemDropEntity } from '../world/ItemDropEntity';

export class MobManager {
  readonly mobs: Mob[] = [];
  readonly dropEntities: ItemDropEntity[] = [];
  private spawnTimer = 2.0;
  private pickupGroup = new THREE.Group();

  constructor(
    private scene: THREE.Scene,
    private chunks: ChunkManager,
    private onPlayerCollectItem?: (itemId: number, count: number, durability?: number, maxDurability?: number) => void,
  ) {
    this.scene.add(this.pickupGroup);
  }

  spawnMob(type: MobType, pos: THREE.Vector3): Mob | null {
    if (this.mobs.length >= 10) return null;
    const mob = new Mob(type, pos, this.chunks);
    this.mobs.push(mob);
    this.scene.add(mob.group);
    return mob;
  }

  dropItem(
    itemId: number,
    count: number,
    pos: THREE.Vector3,
    durability?: number,
    maxDurability?: number,
  ): ItemDropEntity {
    // Check merging with nearby compatible drops
    for (const existing of this.dropEntities) {
      if (existing.canMergeWith({ itemId, count, durability } as any) && existing.position.distanceTo(pos) < 1.2) {
        existing.count += count;
        return existing;
      }
    }

    const drop = new ItemDropEntity(
      {
        itemId,
        count,
        durability,
        maxDurability,
        position: pos,
      },
      this.chunks,
    );

    this.dropEntities.push(drop);
    this.pickupGroup.add(drop.mesh);
    return drop;
  }

  raycastMob(origin: THREE.Vector3, dir: THREE.Vector3, maxDist = 3.6): Mob | null {
    let closestMob: Mob | null = null;
    let closestDist = maxDist;

    const ray = new THREE.Ray(origin, dir);
    const box = new THREE.Box3();

    for (const mob of this.mobs) {
      if (mob.isDead) continue;
      const pos = mob.position;
      const h = mob.type === 'zombie' ? 1.9 : 1.1;
      const r = mob.type === 'zombie' ? 0.45 : 0.6;
      box.min.set(pos.x - r, pos.y, pos.z - r);
      box.max.set(pos.x + r, pos.y + h, pos.z + r);

      const target = new THREE.Vector3();
      const hit = ray.intersectBox(box, target);
      if (hit) {
        const dist = origin.distanceTo(target);
        if (dist < closestDist) {
          closestDist = dist;
          closestMob = mob;
        }
      }
    }

    return closestMob;
  }

  update(
    dt: number,
    playerPos: THREE.Vector3,
    isNight: boolean,
    onPlayerDamage: (dmg: number) => void,
  ): void {
    // 1. Spawning
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 6.0;
      if (this.mobs.length < 10) {
        this.trySpawnRandomMob(playerPos, isNight);
      }
    }

    // 2. Mob Updates
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const mob = this.mobs[i]!;
      mob.update(dt, playerPos, isNight, onPlayerDamage);

      if (mob.isDead && mob.deathTimer <= 0) {
        const drops = mob.getDrops();
        for (const d of drops) {
          this.dropItem(d.itemId, d.count, mob.position);
        }
        mob.dispose();
        this.mobs.splice(i, 1);
        continue;
      }

      if (!mob.isDead) {
        const dx = mob.position.x - playerPos.x;
        const dz = mob.position.z - playerPos.z;
        if (dx * dx + dz * dz > 52 * 52) {
          mob.dispose();
          this.mobs.splice(i, 1);
        }
      }
    }

    // 3. Item Drop Physics & Magnetization to Player
    for (let i = this.dropEntities.length - 1; i >= 0; i--) {
      const drop = this.dropEntities[i]!;
      drop.update(dt);

      const dist = drop.position.distanceTo(playerPos);

      // Magnetize slightly toward player when near
      if (dist < 2.5 && drop.canBePickedUp) {
        const pullDir = playerPos.clone().sub(drop.position).normalize();
        drop.velocity.addScaledVector(pullDir, 12 * dt);
      }

      // Collect when close
      if (dist < 1.5 && drop.canBePickedUp) {
        this.onPlayerCollectItem?.(drop.itemId, drop.count, drop.durability, drop.maxDurability);
        drop.dispose();
        this.dropEntities.splice(i, 1);
      } else if (drop.age > 300) {
        // Despawn after 5 minutes
        drop.dispose();
        this.dropEntities.splice(i, 1);
      }
    }
  }

  private trySpawnRandomMob(playerPos: THREE.Vector3, isNight: boolean): void {
    const angle = Math.random() * Math.PI * 2;
    const dist = 14 + Math.random() * 18;
    const sx = Math.floor(playerPos.x + Math.sin(angle) * dist);
    const sz = Math.floor(playerPos.z + Math.cos(angle) * dist);

    const sy = this.chunks.surfaceHeight(sx, sz);
    if (sy <= 0 || sy >= 128) return;

    const groundBlock = this.chunks.getBlock(sx, sy, sz);
    const above1 = this.chunks.getBlock(sx, sy + 1, sz);
    const above2 = this.chunks.getBlock(sx, sy + 2, sz);

    if (above1 !== Block.Air || above2 !== Block.Air) return;

    let type: MobType = 'pig';
    if (isNight) {
      type = Math.random() < 0.75 ? 'zombie' : Math.random() < 0.5 ? 'pig' : 'cow';
    } else {
      if (groundBlock === Block.Grass) {
        type = Math.random() < 0.5 ? 'pig' : 'cow';
      } else {
        return;
      }
    }

    this.spawnMob(type, new THREE.Vector3(sx + 0.5, sy + 1, sz + 0.5));
  }

  dispose(): void {
    for (const mob of this.mobs) {
      mob.dispose();
    }
    this.mobs.length = 0;
    for (const drop of this.dropEntities) {
      drop.dispose();
    }
    this.dropEntities.length = 0;
    this.scene.remove(this.pickupGroup);
  }
}
