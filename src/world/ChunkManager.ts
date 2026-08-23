import * as THREE from 'three';
import { Block, CHUNK_HEIGHT, CHUNK_SIZE, RENDER_DISTANCE, chunkKey, isSolid } from './blocks';
import { Chunk } from './Chunk';
import { LandmarkGen, type Landmark } from './LandmarkGen';
import { meshChunk } from './VoxelMesher';
import type { WorldGen } from './WorldGen';
import { BIOMES, type BiomeId } from './Biomes';
import type { TerrainMaterials } from '../render/TerrainMaterials';

export class ChunkManager {
  private chunks = new Map<string, Chunk>();
  private landmarks = new Map<string, Landmark>();
  private explored = new Set<string>();
  private landmarkGen: LandmarkGen;
  private lastCx = Number.NaN;
  private lastCz = Number.NaN;
  private buildQueue: Chunk[] = [];
  private genQueue: { cx: number; cz: number; dist: number }[] = [];
  renderDistance = RENDER_DISTANCE;
  private generateStructures: boolean;
  private edits = new Map<string, number>();

  constructor(
    private scene: THREE.Scene,
    private world: WorldGen,
    private materials: TerrainMaterials,
    generateStructures = true,
  ) {
    this.generateStructures = generateStructures;
    this.landmarkGen = new LandmarkGen(world);
  }

  setRenderDistance(r: number): void {
    this.renderDistance = Math.min(8, Math.max(3, Math.round(r)));
    this.lastCx = Number.NaN;
    this.lastCz = Number.NaN;
  }

  getLandmarks(): Landmark[] {
    return [...this.landmarks.values()];
  }

  getExploredKeys(): Set<string> {
    return this.explored;
  }

  getBiomeAt(wx: number, wz: number): BiomeId {
    return this.world.getBiome(Math.floor(wx), Math.floor(wz));
  }

  getBiomeName(wx: number, wz: number): string {
    return BIOMES[this.getBiomeAt(wx, wz)].name;
  }

  getBlock(wx: number, y: number, wz: number): number {
    wx = Math.floor(wx);
    y = Math.floor(y);
    wz = Math.floor(wz);
    if (y < 0 || y >= CHUNK_HEIGHT) return Block.Air;
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (!chunk || !chunk.ready) return Block.Stone;
    const lx = wx - cx * CHUNK_SIZE;
    const lz = wz - cz * CHUNK_SIZE;
    return chunk.getLocal(lx, y, lz);
  }

  isSolidAt(wx: number, y: number, wz: number): boolean {
    return isSolid(this.getBlock(Math.floor(wx), Math.floor(y), Math.floor(wz)));
  }

  isWaterAt(wx: number, y: number, wz: number): boolean {
    return this.getBlock(Math.floor(wx), Math.floor(y), Math.floor(wz)) === Block.Water;
  }

  /** Y of the open water surface at this column, or null if dry. */
  getWaterSurfaceY(wx: number, wz: number): number | null {
    wx = Math.floor(wx);
    wz = Math.floor(wz);
    for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
      if (this.getBlock(wx, y, wz) !== Block.Water) continue;
      while (y + 1 < CHUNK_HEIGHT && this.getBlock(wx, y + 1, wz) === Block.Water) y++;
      return y + 1;
    }
    return null;
  }

  /** 0 = above water, 1 = fully submerged (for eye/camera). */
  getSubmersion(wx: number, wy: number, wz: number): number {
    if (this.isWaterAt(wx, wy, wz)) {
      const surface = this.getWaterSurfaceY(wx, wz);
      if (surface === null) return 1;
      return Math.min(1, (surface - wy) / 1.25 + 0.35);
    }
    const surface = this.getWaterSurfaceY(wx, wz);
    if (surface === null || wy >= surface) return 0;
    return Math.min(1, (surface - wy) / 1.1);
  }

  /** True if the player body overlaps any water block. */
  isBodyInWater(px: number, py: number, pz: number, height: number): boolean {
    const x0 = Math.floor(px - 0.25);
    const x1 = Math.floor(px + 0.25);
    const y0 = Math.floor(py);
    const y1 = Math.floor(py + height);
    const z0 = Math.floor(pz - 0.25);
    const z1 = Math.floor(pz + 0.25);
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          if (this.isWaterAt(x, y, z)) return true;
        }
      }
    }
    return false;
  }

  surfaceHeight(wx: number, wz: number): number {
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (!chunk?.columns) return this.world.getHeight(Math.floor(wx), Math.floor(wz));
    const lx = wx - cx * CHUNK_SIZE;
    const lz = wz - cz * CHUNK_SIZE;
    const col = chunk.columns[lz * CHUNK_SIZE + lx];
    return col?.height ?? this.world.getHeight(Math.floor(wx), Math.floor(wz));
  }

  updateAround(px: number, pz: number, maxBuildsPerFrame = 2): void {
    const cx = Math.floor(px / CHUNK_SIZE);
    const cz = Math.floor(pz / CHUNK_SIZE);

    if (cx !== this.lastCx || cz !== this.lastCz) {
      this.lastCx = cx;
      this.lastCz = cz;
      this.syncRadius(cx, cz);
    }

    const backlog = this.genQueue.length + this.buildQueue.length;
    const genBudget = backlog > 24 ? 3 : backlog > 10 ? 2 : 1;
    const meshBudget =
      backlog > 40 ? 8 : backlog > 24 ? 6 : backlog > 10 ? maxBuildsPerFrame + 2 : maxBuildsPerFrame;

    this.processGenQueue(cx, cz, genBudget);
    this.processBuildQueue(meshBudget);
  }

  /** Fast spawn: sync only the center chunk, queue everything else. */
  bootstrapAt(px: number, pz: number): void {
    const cx = Math.floor(px / CHUNK_SIZE);
    const cz = Math.floor(pz / CHUNK_SIZE);
    this.lastCx = cx;
    this.lastCz = cz;
    this.syncRadius(cx, cz, 0);

    const center = this.chunks.get(chunkKey(cx, cz));
    if (center?.ready) {
      this.removeFromBuildQueue(center);
      if (!center.mesh) this.buildMeshAndFixSeams(center);
    }
  }

  private removeFromBuildQueue(chunk: Chunk): void {
    const key = chunkKey(chunk.cx, chunk.cz);
    this.buildQueue = this.buildQueue.filter((c) => chunkKey(c.cx, c.cz) !== key);
  }

  private processGenQueue(cx: number, cz: number, budget: number): void {
    if (budget <= 0 || this.genQueue.length === 0) return;
    this.genQueue.sort((a, b) => a.dist - b.dist);
    let n = 0;
    while (n < budget && this.genQueue.length > 0) {
      const next = this.genQueue.shift()!;
      const key = chunkKey(next.cx, next.cz);
      if (this.chunks.has(key)) continue;
      const chunk = this.generateChunk(next.cx, next.cz);
      this.chunks.set(key, chunk);
      this.buildQueue.push(chunk);
      n++;
    }
    this.sortBuildQueue(cx, cz);
  }

  private processBuildQueue(budget: number): void {
    let built = 0;
    while (built < budget && this.buildQueue.length > 0) {
      const chunk = this.buildQueue.shift()!;
      if (!this.chunks.has(chunkKey(chunk.cx, chunk.cz))) continue;
      if (chunk.mesh) continue;
      this.buildMesh(chunk);
      built++;
    }
  }

  private sortBuildQueue(cx: number, cz: number): void {
    this.buildQueue.sort((a, b) => {
      const da = (a.cx - cx) ** 2 + (a.cz - cz) ** 2;
      const db = (b.cx - cx) ** 2 + (b.cz - cz) ** 2;
      return da - db;
    });
  }

  private syncRadius(cx: number, cz: number, urgentRadius = 1): void {
    const needed = new Set<string>();
    const r = this.renderDistance;

    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz > r * r) continue;
        const ncx = cx + dx;
        const ncz = cz + dz;
        const key = chunkKey(ncx, ncz);
        needed.add(key);
        this.explored.add(key);

        if (this.chunks.has(key)) continue;

        const dist = dx * dx + dz * dz;
        const urgent = Math.abs(dx) <= urgentRadius && Math.abs(dz) <= urgentRadius;
        if (urgent) {
          const chunk = this.generateChunk(ncx, ncz);
          this.chunks.set(key, chunk);
          this.buildQueue.push(chunk);
        } else {
          this.genQueue.push({ cx: ncx, cz: ncz, dist });
        }
      }
    }

    this.genQueue = this.genQueue.filter((g) => needed.has(chunkKey(g.cx, g.cz)));
    this.sortBuildQueue(cx, cz);

    for (const [key, chunk] of this.chunks) {
      if (!needed.has(key)) {
        if (chunk.mesh) this.scene.remove(chunk.mesh);
        if (chunk.cutoutMesh) this.scene.remove(chunk.cutoutMesh);
        if (chunk.waterMesh) this.scene.remove(chunk.waterMesh);
        chunk.dispose();
        this.chunks.delete(key);
      }
    }
  }

  private generateChunk(cx: number, cz: number): Chunk {
    const chunk = new Chunk(cx, cz);
    chunk.columns = this.world.fillChunk(cx, cz, chunk.voxels);
    if (this.generateStructures) {
      const landmark = this.landmarkGen.apply(cx, cz, chunk.voxels, chunk.columns);
      if (landmark) {
        chunk.landmark = landmark;
        this.landmarks.set(landmark.id, landmark);
      }
    }
    this.replayEditsInChunk(chunk);
    chunk.ready = true;
    return chunk;
  }

  private replayEditsInChunk(chunk: Chunk): void {
    const ox = chunk.cx * CHUNK_SIZE;
    const oz = chunk.cz * CHUNK_SIZE;
    for (const [key, block] of this.edits) {
      const [x, y, z] = key.split(',').map(Number);
      if (x < ox || x >= ox + CHUNK_SIZE || z < oz || z >= oz + CHUNK_SIZE) continue;
      if (y < 0 || y >= CHUNK_HEIGHT) continue;
      chunk.setLocal(x - ox, y, z - oz, block);
    }
  }

  applyRemoteEdit(wx: number, y: number, wz: number, block: number): void {
    wx = Math.floor(wx);
    y = Math.floor(y);
    wz = Math.floor(wz);
    this.edits.set(`${wx},${y},${wz}`, block);
    this.setBlock(wx, y, wz, block);
  }

  loadNetworkEdits(edits: { x: number; y: number; z: number; block: number }[]): void {
    for (const e of edits) {
      this.edits.set(`${e.x},${e.y},${e.z}`, e.block);
      this.setBlock(e.x, e.y, e.z, e.block);
    }
  }

  private buildMesh(chunk: Chunk): void {
    if (chunk.mesh) {
      this.scene.remove(chunk.mesh);
      chunk.mesh.geometry.dispose();
      chunk.mesh = null;
    }
    if (chunk.cutoutMesh) {
      this.scene.remove(chunk.cutoutMesh);
      chunk.cutoutMesh.geometry.dispose();
      chunk.cutoutMesh = null;
    }
    if (chunk.waterMesh) {
      this.scene.remove(chunk.waterMesh);
      chunk.waterMesh.geometry.dispose();
      chunk.waterMesh = null;
    }

    const ox = chunk.cx * CHUNK_SIZE;
    const oz = chunk.cz * CHUNK_SIZE;
    const { solid, cutout, water } = meshChunk(chunk.voxels, ox, oz, (wx, y, wz) =>
      this.sampleBlock(wx, y, wz),
    );

    if (solid) {
      const mesh = new THREE.Mesh(solid, this.materials.solid);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;
      chunk.mesh = mesh;
      this.scene.add(mesh);
    }

    if (cutout) {
      const mesh = new THREE.Mesh(cutout, this.materials.cutout);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;
      mesh.renderOrder = 1;
      chunk.cutoutMesh = mesh;
      this.scene.add(mesh);
    }

    if (water) {
      const mesh = new THREE.Mesh(water, this.materials.water);
      mesh.receiveShadow = false;
      mesh.frustumCulled = true;
      mesh.renderOrder = 10;
      chunk.waterMesh = mesh;
      this.scene.add(mesh);
    }
  }

  private rebuildMeshQuiet(chunk: Chunk): void {
    if (!chunk.ready) return;
    this.buildMesh(chunk);
  }

  private buildMeshAndFixSeams(chunk: Chunk): void {
    this.buildMesh(chunk);
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const neighbor = this.chunks.get(chunkKey(chunk.cx + dx, chunk.cz + dz));
      if (neighbor?.mesh || neighbor?.waterMesh) this.rebuildMeshQuiet(neighbor);
    }
  }

  private sampleBlock(wx: number, y: number, wz: number): number {
    if (y < 0 || y >= CHUNK_HEIGHT) return Block.Air;
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (!chunk) {
      const h = this.world.getHeight(wx, wz);
      if (y > h) return Block.Air;
      if (y === h) return Block.Grass;
      return Block.Stone;
    }
    return chunk.getLocal(wx - cx * CHUNK_SIZE, y, wz - cz * CHUNK_SIZE);
  }

  setBlock(wx: number, y: number, wz: number, block: number): boolean {
    wx = Math.floor(wx);
    y = Math.floor(y);
    wz = Math.floor(wz);
    if (y < 0 || y >= CHUNK_HEIGHT) return false;
    if (y === 0 && block === Block.Air) return false;

    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (!chunk?.ready) return false;

    const lx = wx - cx * CHUNK_SIZE;
    const lz = wz - cz * CHUNK_SIZE;
    if (chunk.getLocal(lx, y, lz) === block) return false;
    if (!chunk.setLocal(lx, y, lz, block)) return false;

    this.edits.set(`${wx},${y},${wz}`, block);

    this.buildMesh(chunk);
    if (lx === 0) this.remeshOne(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this.remeshOne(cx + 1, cz);
    if (lz === 0) this.remeshOne(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.remeshOne(cx, cz + 1);
    return true;
  }

  private remeshOne(cx: number, cz: number): void {
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (chunk?.ready) this.buildMesh(chunk);
  }
}
