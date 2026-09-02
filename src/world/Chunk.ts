import * as THREE from 'three';
import { Block, CHUNK_HEIGHT, CHUNK_SIZE } from './blocks';
import type { ColumnInfo } from './ColumnInfo';
import type { Landmark } from './LandmarkGen';

const VOL = CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT;

export class Chunk {
  readonly cx: number;
  readonly cz: number;
  readonly voxels: Uint8Array;
  /** Sky light 0–15 per voxel. */
  readonly skyLight: Uint8Array;
  /** Block light 0–14 per voxel. */
  readonly blockLight: Uint8Array;
  /** Fluid level 0–8: 8 = source/full, 7..1 = flowing, 0 = empty. */
  readonly fluidLevel: Uint8Array;
  columns: ColumnInfo[] | null = null;
  landmark: Landmark | null = null;
  mesh: THREE.Mesh | null = null;
  cutoutMesh: THREE.Mesh | null = null;
  waterMesh: THREE.Mesh | null = null;
  lavaMesh: THREE.Mesh | null = null;
  ready = false;
  /** True after first mesh build (even if all layers are empty). */
  meshed = false;
  /** True once voxel data is safe for authoritative gameplay collision. */
  collisionReady = false;
  lightsDirty = true;
  /** Skip fluid sim when false (set by seedFluidLevels / edits). */
  hasFluid = false;

  constructor(cx: number, cz: number) {
    this.cx = cx;
    this.cz = cz;
    this.voxels = new Uint8Array(VOL);
    this.skyLight = new Uint8Array(VOL);
    this.blockLight = new Uint8Array(VOL);
    this.fluidLevel = new Uint8Array(VOL);
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
    return this.voxels[this.index(x, y, z)]!;
  }

  setLocal(x: number, y: number, z: number, block: number): boolean {
    x = Math.floor(x);
    y = Math.floor(y);
    z = Math.floor(z);
    if (x < 0 || z < 0 || y < 0 || x >= CHUNK_SIZE || z >= CHUNK_SIZE || y >= CHUNK_HEIGHT) {
      return false;
    }
    const i = this.index(x, y, z);
    this.voxels[i] = block;
    this.lightsDirty = true;
    return true;
  }

  getSky(x: number, y: number, z: number): number {
    if (x < 0 || z < 0 || y < 0 || x >= CHUNK_SIZE || z >= CHUNK_SIZE || y >= CHUNK_HEIGHT) return 0;
    return this.skyLight[this.index(x, y, z)]!;
  }

  getBlockL(x: number, y: number, z: number): number {
    if (x < 0 || z < 0 || y < 0 || x >= CHUNK_SIZE || z >= CHUNK_SIZE || y >= CHUNK_HEIGHT) return 0;
    return this.blockLight[this.index(x, y, z)]!;
  }

  /** Combined light 0–15. */
  getLight(x: number, y: number, z: number): number {
    return Math.max(this.getSky(x, y, z), this.getBlockL(x, y, z));
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
    if (this.lavaMesh) {
      this.lavaMesh.geometry.dispose();
      this.lavaMesh = null;
    }
    this.meshed = false;
    this.collisionReady = false;
  }
}
