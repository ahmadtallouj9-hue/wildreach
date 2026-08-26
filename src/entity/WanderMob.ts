import * as THREE from 'three';
import type { ChunkManager } from '../world/ChunkManager';
import { findPath, type PathNode } from './Pathfinding';
import { Block } from '../world/blocks';

/** Simple wandering surface mob that follows voxel A* paths. */
export class WanderMob {
  readonly mesh: THREE.Mesh;
  private path: PathNode[] = [];
  private pathI = 0;
  private retarget = 0;
  private readonly pos = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    private chunks: ChunkManager,
    x: number,
    y: number,
    z: number,
  ) {
    const geo = new THREE.BoxGeometry(0.55, 0.7, 0.85);
    const mat = new THREE.MeshLambertMaterial({ color: 0xc4a574 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.pos.set(x + 0.5, y, z + 0.5);
    this.mesh.position.copy(this.pos).add(new THREE.Vector3(0, 0.35, 0));
    scene.add(this.mesh);
  }

  update(dt: number): void {
    this.retarget -= dt;
    if (this.retarget <= 0 || this.pathI >= this.path.length) {
      this.retarget = 3 + Math.random() * 4;
      this.pickGoal();
    }
    if (this.pathI >= this.path.length) return;

    const target = this.path[this.pathI]!;
    const tx = target.x + 0.5;
    const ty = target.y;
    const tz = target.z + 0.5;
    const dx = tx - this.pos.x;
    const dz = tz - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const speed = 1.8;
    if (dist < 0.12) {
      this.pos.y = ty;
      this.pathI++;
    } else {
      this.pos.x += (dx / dist) * speed * dt;
      this.pos.z += (dz / dist) * speed * dt;
      this.pos.y += (ty - this.pos.y) * Math.min(1, 8 * dt);
      this.mesh.rotation.y = Math.atan2(dx, dz);
    }
    // Avoid lava
    if (this.chunks.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y), Math.floor(this.pos.z)) === Block.Lava) {
      this.path = [];
      this.pathI = 0;
    }
    this.mesh.position.set(this.pos.x, this.pos.y + 0.35, this.pos.z);
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }

  private pickGoal(): void {
    const sx = Math.floor(this.pos.x);
    const sy = Math.floor(this.pos.y);
    const sz = Math.floor(this.pos.z);
    for (let n = 0; n < 8; n++) {
      const gx = sx + Math.floor((Math.random() - 0.5) * 24);
      const gz = sz + Math.floor((Math.random() - 0.5) * 24);
      let gy = sy;
      for (let y = sy + 6; y >= sy - 8; y--) {
        if (this.chunks.getBlock(gx, y, gz) !== Block.Air && this.chunks.getBlock(gx, y + 1, gz) === Block.Air) {
          gy = y + 1;
          break;
        }
      }
      const path = findPath(this.chunks, { x: sx, y: sy, z: sz }, { x: gx, y: gy, z: gz });
      if (path && path.length > 1) {
        this.path = path;
        this.pathI = 1;
        return;
      }
    }
    this.path = [];
    this.pathI = 0;
  }
}
