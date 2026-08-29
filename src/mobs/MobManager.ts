import * as THREE from 'three';
import { Mob, type MobType } from './Mob';
import type { ChunkManager } from '../world/ChunkManager';
import { Block } from '../world/blocks';

export interface ItemPickup {
  id: string;
  itemId: number;
  count: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  mesh: THREE.Mesh;
  age: number;
}

const MAX_MOBS = 10;
const SPAWN_INTERVAL = 6.0;
const DESPAWN_DISTANCE_SQ = 52 * 52;
const MIN_SPAWN_DIST = 14;
const MAX_SPAWN_DIST = 32;

export class MobManager {
  readonly mobs: Mob[] = [];
  readonly pickups: ItemPickup[] = [];
  private spawnTimer = 2.0;

  private itemGeo = new THREE.BoxGeometry(0.32, 0.32, 0.32);
  private pickupGroup = new THREE.Group();

  constructor(
    private scene: THREE.Scene,
    private chunks: ChunkManager,
    private onPlayerCollectItem?: (itemId: number, count: number) => void,
  ) {
    this.scene.add(this.pickupGroup);
  }

  spawnMob(type: MobType, pos: THREE.Vector3): Mob | null {
    if (this.mobs.length >= MAX_MOBS) return null;
    const mob = new Mob(type, pos, this.chunks);
    this.mobs.push(mob);
    this.scene.add(mob.group);
    return mob;
  }

  dropItem(itemId: number, count: number, pos: THREE.Vector3): void {
    const mat = new THREE.MeshLambertMaterial({
      color: 0xe5b834,
      emissive: 0x332211,
    });
    const mesh = new THREE.Mesh(this.itemGeo, mat);
    mesh.position.copy(pos);
    mesh.position.y += 0.25;
    this.pickupGroup.add(mesh);

    const ang = Math.random() * Math.PI * 2;
    this.pickups.push({
      id: Math.random().toString(36).slice(2),
      itemId,
      count,
      position: mesh.position,
      velocity: new THREE.Vector3(Math.cos(ang) * 1.5, 3.5, Math.sin(ang) * 1.5),
      mesh,
      age: 0,
    });
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
      this.spawnTimer = SPAWN_INTERVAL;
      if (this.mobs.length < MAX_MOBS) {
        this.trySpawnRandomMob(playerPos, isNight);
      }
    }

    // 2. Mob Updates
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const mob = this.mobs[i];
      mob.update(dt, playerPos, isNight, onPlayerDamage);

      // Check dead and remove
      if (mob.isDead && mob.deathTimer <= 0) {
        const drops = mob.getDrops();
        for (const d of drops) {
          this.dropItem(d.itemId, d.count, mob.position);
        }
        mob.dispose();
        this.mobs.splice(i, 1);
        continue;
      }

      // Check distance for despawning
      if (!mob.isDead) {
        const dx = mob.position.x - playerPos.x;
        const dz = mob.position.z - playerPos.z;
        if (dx * dx + dz * dz > DESPAWN_DISTANCE_SQ) {
          mob.dispose();
          this.mobs.splice(i, 1);
        }
      }
    }

    // 3. Item Pickups
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.age += dt;

      // Gravity & motion
      p.velocity.y -= 18 * dt;
      p.velocity.x *= 1 - 2 * dt;
      p.velocity.z *= 1 - 2 * dt;

      p.position.addScaledVector(p.velocity, dt);

      // Simple ground bounce
      const groundY = Math.floor(p.position.y);
      if (this.chunks.isSolidAt(Math.floor(p.position.x), groundY, Math.floor(p.position.z))) {
        if (p.position.y <= groundY + 1.15) {
          p.position.y = groundY + 1.15;
          p.velocity.y = 0;
        }
      }

      // Spin
      p.mesh.rotation.y += dt * 3;

      // Magnetize to player if within 2.2 blocks
      const dist = p.position.distanceTo(playerPos);
      if (dist < 2.0 && p.age > 0.4) {
        this.onPlayerCollectItem?.(p.itemId, p.count);
        p.mesh.removeFromParent();
        (p.mesh.material as THREE.Material).dispose();
        this.pickups.splice(i, 1);
      } else if (p.age > 180) {
        // Despawn after 3 minutes
        p.mesh.removeFromParent();
        (p.mesh.material as THREE.Material).dispose();
        this.pickups.splice(i, 1);
      }
    }
  }

  private trySpawnRandomMob(playerPos: THREE.Vector3, isNight: boolean): void {
    const angle = Math.random() * Math.PI * 2;
    const dist = MIN_SPAWN_DIST + Math.random() * (MAX_SPAWN_DIST - MIN_SPAWN_DIST);
    const sx = Math.floor(playerPos.x + Math.sin(angle) * dist);
    const sz = Math.floor(playerPos.z + Math.cos(angle) * dist);

    // Find surface height
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
        type = Math.random() < 0.3 ? 'zombie' : 'pig';
      }
    }

    this.spawnMob(type, new THREE.Vector3(sx + 0.5, sy + 1.0, sz + 0.5));
  }

  dispose(): void {
    for (const mob of this.mobs) mob.dispose();
    this.mobs.length = 0;
    for (const p of this.pickups) {
      p.mesh.removeFromParent();
      (p.mesh.material as THREE.Material).dispose();
    }
    this.pickups.length = 0;
    this.pickupGroup.removeFromParent();
    this.itemGeo.dispose();
  }
}
