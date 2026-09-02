import * as THREE from 'three';
import { Block, CHUNK_HEIGHT, CHUNK_SIZE, RENDER_DISTANCE, SEA_LEVEL, chunkKey, isSolid } from './blocks';
import { Chunk } from './Chunk';
import { LandmarkGen, type Landmark } from './LandmarkGen';
import { meshChunk } from './VoxelMesher';
import { rebuildChunkLights, sampleLight } from './LightEngine';
import { seedFluidLevels, tickFluidsNear } from './FluidSim';
import type { WorldGen } from './WorldGen';
import { BIOMES, type BiomeId } from './Biomes';
import type { TerrainMaterials } from '../render/TerrainMaterials';
import { surfaceHeightFromStep } from './terrainResolution';
import { loadEdits, saveEdits } from './editStore';
import { profiler } from '../engine/core/Profiler';
import { GenWorkerClient, type GenFilled } from './GenWorkerClient';
import type { ColumnInfo } from './ColumnInfo';

export type CollisionVoxelState = 'SOLID' | 'AIR' | 'UNLOADED';
export type CollisionAvailability = 'READY' | 'UNLOADED' | 'GENERATING' | 'NOT_READY';

export interface CollisionVoxelQuery {
  state: CollisionVoxelState;
  blockId: number;
  loaded: boolean;
}

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
  private chunkBudget = 2;
  private pausedHidden = false;
  private generateStructures: boolean;
  private edits = new Map<string, number>();
  private fluidDirty = new Set<string>();
  private fluidLightDirty = new Set<string>();
  private fluidNeighborDirty = new Set<string>();
  /** Player-placed or spread fluid cells that should simulate (not whole oceans). */
  private activeFluids = new Set<string>();
  private persistSeed: string | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private persistDirty = false;
  /** Async raw-terrain filler — Web Worker in browsers, inline elsewhere. */
  private genClient: GenWorkerClient;
  /** Chunk keys requested but not yet answered, so we never double-dispatch. */
  private workersInFlight = new Set<string>();
  /** Current streaming disc; responses outside it are discarded (radius shrink). */
  private wanted = new Set<string>();

  constructor(
    private scene: THREE.Scene,
    private world: WorldGen,
    private materials: TerrainMaterials,
    generateStructures = true,
  ) {
    this.generateStructures = generateStructures;
    this.landmarkGen = new LandmarkGen(world.seed);
    this.persistSeed = world.seed;
    this.genClient = new GenWorkerClient(world);
    const saved = loadEdits(world.seed);
    for (const [k, v] of saved) this.edits.set(k, v);
  }

  setRenderDistance(r: number): void {
    this.renderDistance = Math.min(8, Math.max(3, Math.round(r)));
    this.lastCx = Number.NaN;
    this.lastCz = Number.NaN;
  }

  setChunkBudget(budget: number): void {
    this.chunkBudget = Math.max(1, Math.min(4, Math.round(budget)));
  }

  setPausedHidden(paused: boolean): void {
    this.pausedHidden = paused;
  }

  getLandmarks(): Landmark[] {
    return [...this.landmarks.values()];
  }

  /** Queue/chunk counters for the engine profiler HUD line. */
  get loadedChunks(): number {
    return this.chunks.size;
  }

  get genPending(): number {
    return this.genQueue.length;
  }

  get buildPending(): number {
    return this.buildQueue.length;
  }

  getExploredKeys(): Set<string> {
    return this.explored;
  }

  getBiomeAt(wx: number, wz: number): BiomeId {
    wx = Math.floor(wx);
    wz = Math.floor(wz);
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (chunk?.columns) {
      const lx = wx - cx * CHUNK_SIZE;
      const lz = wz - cz * CHUNK_SIZE;
      const col = chunk.columns[lz * CHUNK_SIZE + lx];
      if (col) return col.biome;
    }
    return this.world.getBiome(wx, wz);
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
    // Unloaded / not-ready → air. Inventing stone here hid faces and caused holes.
    if (!chunk?.ready) return Block.Air;
    const lx = wx - cx * CHUNK_SIZE;
    const lz = wz - cz * CHUNK_SIZE;
    return chunk.getLocal(lx, y, lz);
  }

  /**
   * Authoritative collision query. Unlike getBlock(), this never collapses a
   * missing/generated chunk into ordinary Air.
   */
  getCollisionBlock(wx: number, y: number, wz: number): CollisionVoxelQuery {
    wx = Math.floor(wx);
    y = Math.floor(y);
    wz = Math.floor(wz);
    if (y < 0 || y >= CHUNK_HEIGHT) {
      return { state: 'AIR', blockId: Block.Air, loaded: true };
    }

    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (!chunk) {
      return { state: 'UNLOADED', blockId: Block.Air, loaded: false };
    }
    if (!chunk.collisionReady) {
      return { state: 'UNLOADED', blockId: Block.Air, loaded: false };
    }

    const blockId = chunk.getLocal(wx - cx * CHUNK_SIZE, y, wz - cz * CHUNK_SIZE);
    return {
      state: isSolid(blockId) ? 'SOLID' : 'AIR',
      blockId,
      loaded: true,
    };
  }

  /**
   * Returns whether every chunk column touched by a collision region has
   * generated voxel data. Mesh generation is deliberately not required.
   */
  getCollisionAvailabilityForRegion(
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number,
  ): CollisionAvailability {
    if (![minX, minY, minZ, maxX, maxY, maxZ].every(Number.isFinite)) {
      return 'NOT_READY';
    }
    if (maxY < 0 || minY >= CHUNK_HEIGHT) return 'READY';

    const x0 = Math.floor(minX);
    const x1 = Math.floor(maxX);
    const z0 = Math.floor(minZ);
    const z1 = Math.floor(maxZ);
    const cx0 = Math.floor(x0 / CHUNK_SIZE);
    const cx1 = Math.floor(x1 / CHUNK_SIZE);
    const cz0 = Math.floor(z0 / CHUNK_SIZE);
    const cz1 = Math.floor(z1 / CHUNK_SIZE);

    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const chunk = this.chunks.get(chunkKey(cx, cz));
        if (!chunk) return 'UNLOADED';
        if (!chunk.collisionReady) return 'GENERATING';
      }
    }
    return 'READY';
  }

  /** True when the chunk column at this XZ has finished generation. */
  isColumnReady(wx: number, wz: number): boolean {
    const cx = Math.floor(Math.floor(wx) / CHUNK_SIZE);
    const cz = Math.floor(Math.floor(wz) / CHUNK_SIZE);
    return !!this.chunks.get(chunkKey(cx, cz))?.collisionReady;
  }

  /**
   * Collision probe. Unloaded columns use generated surface height so the
   * player cannot fall through streaming voids (getBlock still returns Air).
   */
  isSolidAt(wx: number, y: number, wz: number): boolean {
    wx = Math.floor(wx);
    y = Math.floor(y);
    wz = Math.floor(wz);
    if (y < 0) return true;
    if (y >= CHUNK_HEIGHT) return false;
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (!chunk?.ready) {
      const h = this.world.getHeight(wx, wz);
      return y <= h;
    }
    const lx = wx - cx * CHUNK_SIZE;
    const lz = wz - cz * CHUNK_SIZE;
    return isSolid(chunk.getLocal(lx, y, lz));
  }

  isWaterAt(wx: number, y: number, wz: number): boolean {
    return this.getBlock(Math.floor(wx), Math.floor(y), Math.floor(wz)) === Block.Water;
  }

  isLavaAt(wx: number, y: number, wz: number): boolean {
    return this.getBlock(Math.floor(wx), Math.floor(y), Math.floor(wz)) === Block.Lava;
  }

  /** True if the player body overlaps any lava block. */
  isBodyInLava(px: number, py: number, pz: number, height: number): boolean {
    const x0 = Math.floor(px - 0.25);
    const x1 = Math.floor(px + 0.25);
    const y0 = Math.floor(py);
    const y1 = Math.floor(py + height);
    const z0 = Math.floor(pz - 0.25);
    const z1 = Math.floor(pz + 0.25);
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          if (this.isLavaAt(x, y, z)) return true;
        }
      }
    }
    return false;
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

  /**
   * Sub-voxel surface offset for a column, in terrain voxels.
   *
   * Returns 0 unless `y` is the column's natural generated surface block, so
   * player-placed blocks stay flat-topped on the gameplay grid.
   */
  surfaceStep(wx: number, wz: number, y?: number): number {
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (!chunk?.columns) return 0;
    const lx = wx - cx * CHUNK_SIZE;
    const lz = wz - cz * CHUNK_SIZE;
    const col = chunk.columns[lz * CHUNK_SIZE + lx];
    if (!col) return 0;
    if (y !== undefined && y !== col.height) return 0;
    return col.step;
  }

  /**
   * Standing height in world units, including the sub-voxel surface offset.
   * Use this for placement and collision resolution rather than surfaceHeight.
   */
  groundHeight(wx: number, wz: number): number {
    const bx = Math.floor(wx);
    const bz = Math.floor(wz);
    return surfaceHeightFromStep(this.surfaceHeight(bx, bz) + 1, this.surfaceStep(bx, bz));
  }

  updateAround(px: number, pz: number, _maxBuildsPerFrame = 2): void {
    if (this.pausedHidden) return;
    const cx = Math.floor(px / CHUNK_SIZE);
    const cz = Math.floor(pz / CHUNK_SIZE);

    if (cx !== this.lastCx || cz !== this.lastCz) {
      this.lastCx = cx;
      this.lastCz = cz;
      this.syncRadius(cx, cz, 0);
    }

    // Time-sliced streaming — stay under budget so movement stays smooth.
    const backlog = this.genQueue.length + this.buildQueue.length;
    const budgetMs = this.chunkBudget === 1 ? 2.5 : backlog > 40 ? 3.5 : backlog > 15 ? 4.5 : 6;
    const t0 = performance.now();
    if (this.genQueue.length > 1) this.genQueue.sort((a, b) => a.dist - b.dist);
    this.processGenQueue(cx, cz, Math.min(1, this.chunkBudget));
    let builds = 0;
    while (
      performance.now() - t0 < budgetMs &&
      this.buildQueue.length > 0 &&
      builds < this.chunkBudget
    ) {
      const before = this.buildQueue.length;
      this.processBuildQueue(1);
      builds++;
      if (this.buildQueue.length === before) break;
    }
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
      if (!center.meshed) this.buildMeshAndFixSeams(center);
    }
  }

  private removeFromBuildQueue(chunk: Chunk): void {
    const key = chunkKey(chunk.cx, chunk.cz);
    this.buildQueue = this.buildQueue.filter((c) => chunkKey(c.cx, c.cz) !== key);
  }

  private processGenQueue(cx: number, cz: number, budget: number): void {
    if (budget <= 0 || this.genQueue.length === 0) return;
    let n = 0;
    while (n < budget && this.genQueue.length > 0) {
      const next = this.genQueue.shift()!;
      const key = chunkKey(next.cx, next.cz);
      if (this.chunks.has(key) || this.workersInFlight.has(key)) continue;
      this.workersInFlight.add(key);
      this.genClient
        .request(next.cx, next.cz)
        .then((filled: GenFilled) => {
          this.workersInFlight.delete(key);
          // Radius may have shrunk while the worker ran — drop stale results.
          if (!this.wanted.has(key)) return;
          const chunk = this.materializeGenFilled(filled);
          this.chunks.set(key, chunk);
          this.buildQueue.push(chunk);
          this.sortBuildQueue(this.lastCx, this.lastCz);
        })
        .catch((err) => {
          this.workersInFlight.delete(key);
          const disposed = err instanceof Error && err.message === 'GenWorkerClient disposed';
          if (disposed || !this.wanted.has(key)) return;
          // Worker failures fall back to inline generation — streaming never stalls.
          const fallback = this.generateChunk(next.cx, next.cz);
          this.chunks.set(key, fallback);
          this.buildQueue.push(fallback);
        });
      n++;
    }
    this.sortBuildQueue(cx, cz);
  }

  private processBuildQueue(budget: number): void {
    let built = 0;
    while (built < budget && this.buildQueue.length > 0) {
      const chunk = this.buildQueue.shift()!;
      if (!this.chunks.has(chunkKey(chunk.cx, chunk.cz))) continue;
      if (chunk.meshed) continue;
      this.buildMeshAndFixSeams(chunk);
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
        if (chunk.lavaMesh) this.scene.remove(chunk.lavaMesh);
        chunk.dispose();
        this.chunks.delete(key);
      }
    }
  }

  /**
   * Synchronous generator used for urgent bootstrap chunks and worker-error
   * fallback. Raw terrain fill runs inline; everything else funnels into the
   * same materialize path as worker responses.
   */
  private generateChunk(cx: number, cz: number): Chunk {
    const columns = this.world.fillChunk(cx, cz, new Chunk(cx, cz).voxels);
    return this.materializeGenFilled({ cx, cz, voxels: new Chunk(cx, cz).voxels, columns });
  }

  /**
   * Applies everything after raw terrain fill: landmarks, saved player
   * edits, fluid seeding, collision flags, lighting. Shared between the
   * inline path and worker responses so both produce identical chunks.
   */
  private materializeGenFilled(filled: GenFilled): Chunk {
    const genEnd = profiler.begin('chunk.gen');
    try {
      const chunk = new Chunk(filled.cx, filled.cz);
      chunk.voxels.set(filled.voxels);
      chunk.columns = filled.columns;
      if (this.generateStructures) {
        const landmark = this.landmarkGen.apply(filled.cx, filled.cz, chunk.voxels, chunk.columns);
        if (landmark) {
          chunk.landmark = landmark;
          this.landmarks.set(landmark.id, landmark);
        }
      }
      this.replayEditsInChunk(chunk);
      seedFluidLevels(chunk);
      // Collision becomes available as soon as the final voxel edit is applied;
      // lighting and mesh construction are visual work and may happen later.
      chunk.collisionReady = true;
      chunk.ready = true;
      rebuildChunkLights(chunk, this.lightWorld());
      return chunk;
    } finally {
      genEnd();
    }
  }

  private lightWorld() {
    return {
      getBlock: (wx: number, y: number, wz: number) => this.sampleBlock(wx, y, wz),
      getChunk: (cx: number, cz: number) => this.chunks.get(chunkKey(cx, cz)),
    };
  }

  getChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(chunkKey(cx, cz));
  }

  forEachReadyChunk(fn: (chunk: Chunk) => void): void {
    for (const c of this.chunks.values()) if (c.ready) fn(c);
  }

  applyFluidBlock(wx: number, y: number, wz: number, block: number, level: number): boolean {
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
    const prev = chunk.getLocal(lx, y, lz);
    if (prev === block && (block === Block.Air || chunk.fluidLevel[chunk.index(lx, y, lz)] === level)) {
      return false;
    }

    if (!chunk.setLocal(lx, y, lz, block)) return false;
    const i = chunk.index(lx, y, lz);
    if (block === Block.Water || block === Block.Lava) {
      chunk.fluidLevel[i] = level;
      chunk.hasFluid = true;
    } else {
      chunk.fluidLevel[i] = 0;
    }

    // Persist Air too — otherwise mined blocks regenerate on reload.
    this.edits.set(`${wx},${y},${wz}`, block);
    this.schedulePersist();
    this.trackFluid(wx, y, wz, block, prev);

    const key = chunkKey(cx, cz);
    this.fluidDirty.add(key);
    if (block === Block.Lava || prev === Block.Lava) this.fluidLightDirty.add(key);
    if (lx === 0) this.fluidNeighborDirty.add(chunkKey(cx - 1, cz));
    if (lx === CHUNK_SIZE - 1) this.fluidNeighborDirty.add(chunkKey(cx + 1, cz));
    if (lz === 0) this.fluidNeighborDirty.add(chunkKey(cx, cz - 1));
    if (lz === CHUNK_SIZE - 1) this.fluidNeighborDirty.add(chunkKey(cx, cz + 1));
    return true;
  }

  /** Only active/spread fluids and deep cave water — not sea-level oceans. */
  private shouldSimulateFluid(wx: number, y: number, wz: number, block: number): boolean {
    const key = `${wx},${y},${wz}`;
    if (block === Block.Lava) return this.activeFluids.has(key) || y < SEA_LEVEL;
    if (block === Block.Water) {
      if (this.activeFluids.has(key)) return true;
      if (y < SEA_LEVEL - 4) return true;
      return false;
    }
    return false;
  }

  private trackFluid(wx: number, y: number, wz: number, block: number, prev?: number, force = false): void {
    const key = `${wx},${y},${wz}`;
    if (block !== Block.Water && block !== Block.Lava) {
      this.activeFluids.delete(key);
      return;
    }
    if (force || block === Block.Lava) {
      this.activeFluids.add(key);
      return;
    }
    // Water: simulate player/spread sources, not static oceans at sea level.
    if (y < SEA_LEVEL - 4 || this.activeFluids.has(key) || prev === Block.Air) {
      this.activeFluids.add(key);
    }
  }

  setFluidBlock(wx: number, y: number, wz: number, block: number, level: number): void {
    this.applyFluidBlock(wx, y, wz, block, level);
  }

  flushFluidMeshes(): void {
    for (const key of this.fluidLightDirty) {
      const chunk = this.chunks.get(key);
      if (chunk?.ready) rebuildChunkLights(chunk, this.lightWorld());
    }
    this.fluidLightDirty.clear();

    for (const key of this.fluidDirty) {
      const chunk = this.chunks.get(key);
      if (!chunk?.ready) continue;
      this.buildMesh(chunk);
    }
    // Only remesh neighbors that actually share a changed edge — avoid full 4-way thrash.
    for (const key of this.fluidNeighborDirty) {
      if (this.fluidDirty.has(key)) continue;
      const [cx, cz] = key.split(',').map(Number) as [number, number];
      this.remeshOne(cx, cz);
    }
    this.fluidDirty.clear();
    this.fluidNeighborDirty.clear();
  }

  /** Fluid flow near the player — active water/lava only, not whole oceans. */
  tickWorld(dt: number, px: number, pz: number): void {
    if (this.activeFluids.size === 0) return;
    tickFluidsNear(this.fluidSimHost(), dt, px, pz, 3);
    this.flushFluidMeshes();
  }

  private fluidSimHost() {
    return {
      getBlock: (wx: number, y: number, wz: number) => this.getBlock(wx, y, wz),
      setBlock: (wx: number, y: number, wz: number, block: number) => this.setBlock(wx, y, wz, block),
      applyFluid: (wx: number, y: number, wz: number, block: number, level: number) =>
        this.applyFluidBlock(wx, y, wz, block, level),
      shouldSimulateFluid: (wx: number, y: number, wz: number, block: number) =>
        this.shouldSimulateFluid(wx, y, wz, block),
      getChunk: (cx: number, cz: number) => this.chunks.get(chunkKey(cx, cz)),
      forEachReadyChunk: (fn: (chunk: Chunk) => void) => {
        for (const c of this.chunks.values()) if (c.ready) fn(c);
      },
    };
  }

  getLightAt(wx: number, y: number, wz: number): number {
    return sampleLight(this.lightWorld(), Math.floor(wx), Math.floor(y), Math.floor(wz));
  }

  /** Fluid level 0–8 at world coords (0 if not fluid). */
  getFluidLevelAt(wx: number, y: number, wz: number): number {
    return this.sampleFluidLevel(Math.floor(wx), Math.floor(y), Math.floor(wz));
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
    this.schedulePersist();
  }

  loadNetworkEdits(edits: { x: number; y: number; z: number; block: number }[]): void {
    for (const e of edits) {
      this.edits.set(`${e.x},${e.y},${e.z}`, e.block);
      this.setBlock(e.x, e.y, e.z, e.block);
    }
    this.schedulePersist();
  }

  /** Flush pending edit saves immediately (world leave / dispose). */
  flushPersist(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    if (!this.persistDirty || !this.persistSeed) return;
    this.persistDirty = false;
    saveEdits(this.persistSeed, this.edits);
  }

  private schedulePersist(): void {
    if (!this.persistSeed) return;
    this.persistDirty = true;
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.flushPersist();
    }, 400);
  }

  dispose(): void {
    this.flushPersist();
    for (const chunk of this.chunks.values()) {
      if (chunk.mesh) this.scene.remove(chunk.mesh);
      if (chunk.cutoutMesh) this.scene.remove(chunk.cutoutMesh);
      if (chunk.waterMesh) this.scene.remove(chunk.waterMesh);
      if (chunk.lavaMesh) this.scene.remove(chunk.lavaMesh);
      chunk.dispose();
    }
    this.chunks.clear();
    this.buildQueue = [];
    this.genQueue = [];
    this.landmarks.clear();
    this.explored.clear();
    this.fluidDirty.clear();
    this.fluidLightDirty.clear();
    this.fluidNeighborDirty.clear();
    this.activeFluids.clear();
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
    if (chunk.lavaMesh) {
      this.scene.remove(chunk.lavaMesh);
      chunk.lavaMesh.geometry.dispose();
      chunk.lavaMesh = null;
    }

    const ox = chunk.cx * CHUNK_SIZE;
    const oz = chunk.cz * CHUNK_SIZE;
    if (chunk.lightsDirty) rebuildChunkLights(chunk, this.lightWorld());
    const { solid, cutout, water, lava } = profiler.measure('chunk.mesh', () =>
      meshChunk(
        chunk.voxels,
        ox,
        oz,
        (wx, y, wz) => this.sampleBlock(wx, y, wz),
        (wx, y, wz) => sampleLight(this.lightWorld(), wx, y, wz),
        chunk.fluidLevel,
        (wx, y, wz) => this.sampleFluidLevel(wx, y, wz),
        (wx, y, wz) => this.surfaceStep(wx, wz, y),
      ),
    );

    if (solid) {
      const mesh = new THREE.Mesh(solid, this.materials.solid);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;
      chunk.mesh = mesh;
      this.scene.add(mesh);
    }

    if (cutout) {
      const mesh = new THREE.Mesh(cutout, this.materials.cutout);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;
      mesh.renderOrder = 1;
      cutout.computeBoundingBox();
      cutout.boundingBox?.expandByScalar(0.45);
      cutout.computeBoundingSphere();
      chunk.cutoutMesh = mesh;
      this.scene.add(mesh);
    }

    // Transparent liquids after opaque/cutout (renderOrder + depthWrite:false).
    if (lava) {
      const mesh = new THREE.Mesh(lava, this.materials.lava);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = true;
      mesh.renderOrder = 20;
      chunk.lavaMesh = mesh;
      this.scene.add(mesh);
    }

    if (water) {
      const mesh = new THREE.Mesh(water, this.materials.water);
      mesh.receiveShadow = false;
      mesh.frustumCulled = true;
      mesh.renderOrder = 21;
      chunk.waterMesh = mesh;
      this.scene.add(mesh);
    }

    chunk.meshed = true;
  }

  private rebuildMeshQuiet(chunk: Chunk): void {
    if (!chunk.ready) return;
    this.buildMesh(chunk);
  }

  /** Build this chunk, then refresh neighbors so shared faces cull correctly. */
  private buildMeshAndFixSeams(chunk: Chunk): void {
    this.buildMesh(chunk);
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const neighbor = this.chunks.get(chunkKey(chunk.cx + dx, chunk.cz + dz));
      if (neighbor?.ready && neighbor.meshed) this.rebuildMeshQuiet(neighbor);
    }
  }

  private sampleBlock(wx: number, y: number, wz: number): number {
    if (y < 0 || y >= CHUNK_HEIGHT) return Block.Air;
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.chunks.get(chunkKey(cx, cz));
    // Missing neighbor → air so border faces stay visible until the neighbor remeshes.
    if (!chunk?.ready) return Block.Air;
    return chunk.getLocal(wx - cx * CHUNK_SIZE, y, wz - cz * CHUNK_SIZE);
  }

  private sampleFluidLevel(wx: number, y: number, wz: number): number {
    if (y < 0 || y >= CHUNK_HEIGHT) return 0;
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (!chunk?.ready) return 0;
    const lx = wx - cx * CHUNK_SIZE;
    const lz = wz - cz * CHUNK_SIZE;
    const b = chunk.getLocal(lx, y, lz);
    if (b !== Block.Water && b !== Block.Lava) return 0;
    const lv = chunk.fluidLevel[chunk.index(lx, y, lz)]!;
    return lv > 0 ? lv : 8;
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
    const prev = chunk.getLocal(lx, y, lz);
    if (prev === block) return false;
    if (!chunk.setLocal(lx, y, lz, block)) return false;
    if (block === Block.Water || block === Block.Lava) {
      chunk.fluidLevel[chunk.index(lx, y, lz)] = 8;
      chunk.hasFluid = true;
    } else {
      chunk.fluidLevel[chunk.index(lx, y, lz)] = 0;
    }

    const key = `${wx},${y},${wz}`;
    // Persist Air too — otherwise mined blocks regenerate on reload.
    this.edits.set(key, block);
    this.schedulePersist();
    const placedFluid = block === Block.Water || block === Block.Lava;
    this.trackFluid(wx, y, wz, block, prev, placedFluid);

    // Rebuild lights for this chunk and neighbors, then remesh.
    rebuildChunkLights(chunk, this.lightWorld());
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const n = this.chunks.get(chunkKey(cx + dx, cz + dz));
      if (n?.ready) rebuildChunkLights(n, this.lightWorld());
    }

    this.buildMesh(chunk);
    if (lx === 0) this.remeshOne(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this.remeshOne(cx + 1, cz);
    if (lz === 0) this.remeshOne(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.remeshOne(cx, cz + 1);
    if (placedFluid) {
      for (let i = 0; i < 8; i++) tickFluidsNear(this.fluidSimHost(), 0.15, wx, wz, 3);
      this.flushFluidMeshes();
    }
    return true;
  }

  private remeshOne(cx: number, cz: number): void {
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (chunk?.ready) this.buildMesh(chunk);
  }
}
