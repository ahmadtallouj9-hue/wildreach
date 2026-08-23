import * as THREE from 'three';
import { Block, CHUNK_HEIGHT, CHUNK_SIZE } from './blocks';
import type { ColumnInfo } from './WorldGen';
import type { Landmark } from './LandmarkGen';

export class Chunk {
  readonly cx: number;
  readonly cz: number;
  readonly voxels: Uint8Array;
  columns: ColumnInfo[] | null = null;
  landmark: Landmark | null = null;
  mesh: THREE.Mesh | null = null;
  cutoutMesh: THREE.Mesh | null = null;
  waterMesh: THREE.Mesh | null = null;
  ready = false;

  constructor(cx: number, cz: number) {
    this.cx = cx;
    this.cz = cz;
    this.voxels = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT);
  }

  index(x: number, y: number, z: number): number {
    return x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
  }

  getLocal(x: number, y: number, z: number): number {
    x = Math.floor(x);
    y = Math.floor(y);
    z = Math.floor(z);
    if (x < 0 || z < 0 || y < 0 || x >= CHUNK_SIZE || z >= CHUNK_SIZE || y >= CHUNK_HEIGHT) {
      return Block.Air;
    }
    return this.voxels[this.index(x, y, z)];
  }

  setLocal(x: number, y: number, z: number, block: number): boolean {
    x = Math.floor(x);
    y = Math.floor(y);
    z = Math.floor(z);
    if (x < 0 || z < 0 || y < 0 || x >= CHUNK_SIZE || z >= CHUNK_SIZE || y >= CHUNK_HEIGHT) {
      return false;
    }
    this.voxels[this.index(x, y, z)] = block;
    return true;
  }

  dispose(): void {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    if (this.cutoutMesh) {
      this.cutoutMesh.geometry.dispose();
      this.cutoutMesh = null;
    }
    if (this.waterMesh) {
      this.waterMesh.geometry.dispose();
      this.waterMesh = null;
    }
  }
}
