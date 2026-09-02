import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Block } from '../world/blocks';
import { WorldGen } from '../world/WorldGen';
import { ChunkManager } from '../world/ChunkManager';
import type {
  CollisionAvailability,
  CollisionVoxelQuery,
} from '../world/ChunkManager';
import { PlayerCollision, type CollisionResult } from './PlayerCollision';
import { PlayerDamage } from './PlayerDamage';
import { PlayerHunger } from './PlayerHunger';
import { PlayerPhysics } from './PlayerPhysics';
import type { PlayerInputSnapshot } from './PlayerInput';

const CHUNK_SIZE = 16;
const CHUNK_HEIGHT = 144;

type QueryRecord = { x: number; y: number; z: number; query: CollisionVoxelQuery };

class StreamingWorld {
  readonly readyChunks = new Set<string>();
  readonly requestedChunks = new Set<string>();
  readonly queries: QueryRecord[] = [];
  lowCeiling = false;
  readonly airFloorColumns = new Set<string>();

  getBlock(x: number, y: number, z: number): number {
    return this.getCollisionBlock(x, y, z).blockId;
  }

  getCollisionBlock(x: number, y: number, z: number): CollisionVoxelQuery {
    const chunk = this.chunkKey(x, z);
    if (!this.readyChunks.has(chunk)) {
      this.requestedChunks.add(chunk);
      const query: CollisionVoxelQuery = { state: 'UNLOADED', blockId: Block.Air, loaded: false };
      this.queries.push({ x, y, z, query });
      return query;
    }

    const column = `${Math.floor(x)},${Math.floor(z)}`;
    const blockId =
      y === 0 && !this.airFloorColumns.has(column)
        ? Block.Stone
        : this.lowCeiling && y === 2
          ? Block.Stone
          : Block.Air;
    const query: CollisionVoxelQuery = {
      state: blockId === Block.Air ? 'AIR' : 'SOLID',
      blockId,
      loaded: true,
    };
    this.queries.push({ x, y, z, query });
    return query;
  }

  getCollisionAvailabilityForRegion(
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number,
  ): CollisionAvailability {
    if (![minX, minY, minZ, maxX, maxY, maxZ].every(Number.isFinite)) return 'NOT_READY';
    if (maxY < 0 || minY >= CHUNK_HEIGHT) return 'READY';

    const cx0 = Math.floor(Math.floor(minX) / CHUNK_SIZE);
    const cx1 = Math.floor(Math.floor(maxX) / CHUNK_SIZE);
    const cz0 = Math.floor(Math.floor(minZ) / CHUNK_SIZE);
    const cz1 = Math.floor(Math.floor(maxZ) / CHUNK_SIZE);
    // Model streaming faithfully: the world delivers EVERY missing chunk the
    // swept region touches (a corner crossing needs both diagonal neighbors),
    // not just the first one found.
    let missing = false;
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const key = `${cx},${cz}`;
        if (!this.readyChunks.has(key)) {
          this.requestedChunks.add(key);
          missing = true;
        }
      }
    }
    return missing ? 'UNLOADED' : 'READY';
  }

  releaseRequested(): void {
    for (const key of this.requestedChunks) this.readyChunks.add(key);
    this.requestedChunks.clear();
  }

  isColumnReady(x: number, z: number): boolean {
    return this.readyChunks.has(this.chunkKey(x, z));
  }

  isSolidAt(x: number, y: number, z: number): boolean {
    return this.getCollisionBlock(x, y, z).state === 'SOLID';
  }

  isBodyInWater(): boolean {
    return false;
  }

  isBodyInLava(): boolean {
    return false;
  }

  isWaterAt(): boolean {
    return false;
  }

  getSubmersion(): number {
    return 0;
  }

  private chunkKey(x: number, z: number): string {
    return `${Math.floor(Math.floor(x) / CHUNK_SIZE)},${Math.floor(Math.floor(z) / CHUNK_SIZE)}`;
  }
}

class TracingCollision extends PlayerCollision {
  lastResult: CollisionResult | null = null;

  override resolveMovement(...args: Parameters<PlayerCollision['resolveMovement']>): CollisionResult {
    this.lastResult = super.resolveMovement(...args);
    return this.lastResult;
  }
}

function input(overrides: Partial<PlayerInputSnapshot> = {}): PlayerInputSnapshot {
  return {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jumpPressed: false,
    jumpHeld: false,
    sprintPressed: false,
    sprintHeld: false,
    sneakPressed: false,
    sneakHeld: false,
    attackPressed: false,
    attackHeld: false,
    usePressed: false,
    useHeld: false,
    analogX: 0,
    analogZ: 0,
    ...overrides,
  };
}

function makePhysics(world: StreamingWorld, x: number, z: number): {
  physics: PlayerPhysics;
  collision: TracingCollision;
  damage: PlayerDamage;
  hunger: PlayerHunger;
} {
  const collision = new TracingCollision(world as never);
  const physics = new PlayerPhysics(collision, world as never);
  physics.teleport(x, 1, z);
  physics.grounded = true;
  return { physics, collision, damage: new PlayerDamage(), hunger: new PlayerHunger() };
}

function tick(
  physics: PlayerPhysics,
  damage: PlayerDamage,
  hunger: PlayerHunger,
  nextInput: PlayerInputSnapshot,
): void {
  physics.simulateTick(nextInput, 0, damage, hunger);
}

function assertFinite(physics: PlayerPhysics): void {
  assert(Number.isFinite(physics.position.x));
  assert(Number.isFinite(physics.position.y));
  assert(Number.isFinite(physics.position.z));
  assert(Number.isFinite(physics.velocity.x));
  assert(Number.isFinite(physics.velocity.y));
  assert(Number.isFinite(physics.velocity.z));
}

function testCoreBoundary(): void {
  const world = new StreamingWorld();
  world.readyChunks.add('0,0');
  const { physics, collision, damage, hunger } = makePhysics(world, 15.5, 0.5);
  const walkRight = input({ right: true });

  tick(physics, damage, hunger, walkRight);
  const beforeBlocked = physics.position.clone();
  tick(physics, damage, hunger, walkRight);

  assert.equal(physics.blockedByStreaming, true);
  assert.equal(physics.collisionAvailability, 'UNLOADED');
  assert.equal(collision.lastResult?.blockedByStreaming, true);
  assert.equal(physics.grounded, true);
  assert.deepEqual(physics.position.toArray(), beforeBlocked.toArray());
  assert.equal(physics.velocity.lengthSq(), 0);
  assert(world.requestedChunks.size > 0);
  assert.equal(world.queries.filter((q) => q.query.state === 'UNLOADED' && q.query.loaded).length, 0);

  world.releaseRequested();
  for (let i = 0; i < 12; i++) tick(physics, damage, hunger, walkRight);
  assert(physics.position.x > beforeBlocked.x);
  assert.equal(physics.grounded, true);
  assert.equal(physics.blockedByStreaming, false);
  assertFinite(physics);
}

function testActualChunkReadiness(): void {
  const scene = new THREE.Scene();
  const material = new THREE.MeshBasicMaterial();
  const materials = { solid: material, cutout: material, water: material, lava: material } as never;
  const chunks = new ChunkManager(scene, new WorldGen('streaming-readiness'), materials);
  chunks.setRenderDistance(3);
  chunks.bootstrapAt(0, 0);

  assert.equal(chunks.getChunk(0, 0)?.collisionReady, true);
  assert.deepEqual(chunks.getCollisionBlock(0, 0, 0), {
    state: 'SOLID',
    blockId: Block.DarkStone,
    loaded: true,
  });
  assert.deepEqual(chunks.getCollisionBlock(16, 0, 0), {
    state: 'UNLOADED',
    blockId: Block.Air,
    loaded: false,
  });
  assert.equal(chunks.getCollisionAvailabilityForRegion(15.7, 0, 0.2, 16.3, 2.8, 0.8), 'UNLOADED');

  // Moving the streaming focus causes generation to run before mesh building;
  // collision readiness must not depend on the render queue.
  chunks.updateAround(16.5, 0.5, 1);
  assert.equal(chunks.getChunk(1, 0)?.collisionReady, true);
  assert.equal(chunks.getCollisionBlock(16, 0, 0).loaded, true);
  assert.equal(chunks.getCollisionAvailabilityForRegion(15.7, 0, 0.2, 16.3, 2.8, 0.8), 'READY');
  chunks.dispose();
  material.dispose();
}

function testNegativeBoundary(): void {
  const world = new StreamingWorld();
  world.readyChunks.add('-1,0');
  const { physics, collision, damage, hunger } = makePhysics(world, -15.5, 0.5);
  const walkLeft = input({ left: true });

  for (let i = 0; i < 8; i++) {
    tick(physics, damage, hunger, walkLeft);
    if (physics.blockedByStreaming) break;
  }
  assert.equal(physics.blockedByStreaming, true);
  assert.equal(physics.collisionAvailability, 'UNLOADED');
  assert.equal(collision.lastResult?.blockedByStreaming, true);
  assert.equal(physics.grounded, true);
  const blockedX = physics.position.x;

  world.releaseRequested();
  for (let i = 0; i < 12; i++) tick(physics, damage, hunger, walkLeft);
  assert(physics.position.x < blockedX);
  assert.equal(physics.grounded, true);
  assertFinite(physics);
}

function testZAndCornerBoundaries(): void {
  const cases: Array<{ name: string; start: [number, number]; move: Partial<PlayerInputSnapshot> }> = [
    { name: '+Z', start: [0.5, 15.5], move: { backward: true } },
    { name: '-Z', start: [0.5, -15.5], move: { forward: true } },
    { name: '+X +Z', start: [15.5, 15.5], move: { right: true, backward: true } },
    { name: '+X -Z', start: [15.5, -15.5], move: { right: true, forward: true } },
    { name: '-X +Z', start: [-15.5, 15.5], move: { left: true, backward: true } },
    { name: '-X -Z', start: [-15.5, -15.5], move: { left: true, forward: true } },
  ];

  for (const test of cases) {
    const world = new StreamingWorld();
    const startChunk = `${Math.floor(test.start[0] / CHUNK_SIZE)},${Math.floor(test.start[1] / CHUNK_SIZE)}`;
    world.readyChunks.add(startChunk);
    const { physics, damage, hunger } = makePhysics(world, ...test.start);
    for (let i = 0; i < 12; i++) {
      tick(physics, damage, hunger, input(test.move));
      if (physics.blockedByStreaming) break;
    }
    assert.equal(physics.blockedByStreaming, true, `${test.name} blocks before an unavailable corner`);
    assert.equal(physics.position.y, 1, `${test.name} keeps its vertical position while waiting`);
    assertFinite(physics);
  }
}

function testUnloadedStart(): void {
  const world = new StreamingWorld();
  const { physics, damage, hunger } = makePhysics(world, 16.5, 0.5);
  tick(physics, damage, hunger, input({ forward: true }));
  assert.equal(physics.blockedByStreaming, true);
  assert.equal(physics.collisionAvailability, 'UNLOADED');
  assert.equal(physics.grounded, false);
  assert.equal(physics.position.y, 1);
  assert.equal(physics.velocity.lengthSq(), 0);
  assertFinite(physics);
}

function testBorderCoordinates(): void {
  const world = new StreamingWorld();
  world.readyChunks.add('0,0');
  const collision = new TracingCollision(world as never);
  for (const x of [15.999, 16, 16.001]) {
    const query = world.getCollisionBlock(x, 0, 0);
    if (x >= 16) assert.equal(query.state, 'UNLOADED');
    const availability = collision.getCollisionAvailabilityForMovement(
      new THREE.Vector3(x, 1, 0.5),
      new THREE.Vector3(0.01, 0, 0),
      1.8,
    );
    assert.equal(availability, 'UNLOADED');
  }

  world.readyChunks.add('1,0');
  for (const x of [15.999, 16, 16.001]) {
    assert.equal(world.getCollisionBlock(x, 0, 0).state, 'SOLID');
    assert.equal(
      collision.getCollisionAvailabilityForMovement(
        new THREE.Vector3(x, 1, 0.5),
        new THREE.Vector3(0.01, 0, 0),
        1.8,
      ),
      'READY',
    );
  }
}

function testRealAirStillFalls(): void {
  const world = new StreamingWorld();
  world.readyChunks.add('0,0');
  world.readyChunks.add('1,0');
  for (let z = -2; z <= 2; z++) {
    for (let x = 16; x <= 18; x++) world.airFloorColumns.add(`${x},${z}`);
  }
  const { physics, damage, hunger } = makePhysics(world, 15.5, 0.5);
  const walkRight = input({ right: true });
  for (let i = 0; i < 25; i++) tick(physics, damage, hunger, walkRight);
  assert(physics.position.y < 1);
  assert.equal(physics.grounded, false);
  assert.equal(physics.blockedByStreaming, false);
  assertFinite(physics);
}

function testMovementModes(): void {
  const cases: Array<{ name: string; start: [number, number]; input: PlayerInputSnapshot; ceiling?: boolean }> = [
    { name: 'sprint', start: [0.5, -15.5], input: input({ forward: true, sprintHeld: true }) },
    { name: 'sneak', start: [15.5, 0.5], input: input({ right: true, sneakHeld: true }) },
    { name: 'diagonal', start: [15.5, 15.5], input: input({ right: true, backward: true }) },
    { name: 'crawl', start: [15.5, 0.5], input: input({ right: true }), ceiling: true },
  ];

  for (const test of cases) {
    const world = new StreamingWorld();
    world.readyChunks.add(`${Math.floor(test.start[0] / CHUNK_SIZE)},${Math.floor(test.start[1] / CHUNK_SIZE)}`);
    world.lowCeiling = test.ceiling ?? false;
    const { physics, damage, hunger } = makePhysics(world, ...test.start);
    const before = physics.position.clone();
    for (let i = 0; i < 12; i++) {
      tick(physics, damage, hunger, test.input);
      if (physics.blockedByStreaming) break;
    }
    assert.equal(physics.blockedByStreaming, true, `${test.name} blocks at unavailable boundary`);
    assert.equal(physics.position.y, before.y, `${test.name} does not fall while waiting`);
    if (test.name === 'sneak') assert.equal(physics.sneaking, true);
    if (test.name === 'crawl') assert.equal(physics.crawling, true);
    assertFinite(physics);

    const blockedPosition = physics.position.clone();
    world.releaseRequested();
    for (let i = 0; i < 12; i++) tick(physics, damage, hunger, test.input);
    assert(
      Math.hypot(physics.position.x - blockedPosition.x, physics.position.z - blockedPosition.z) > 0,
      `${test.name} moves after the neighbor is ready`,
    );
    assert.equal(physics.position.y, before.y, `${test.name} crosses once the neighbor is ready`);
    assert.equal(physics.blockedByStreaming, false);
    assertFinite(physics);
  }
}

function testJumpAcrossBoundary(): void {
  const world = new StreamingWorld();
  world.readyChunks.add('0,0');
  const { physics, damage, hunger } = makePhysics(world, 15.5, 0.5);
  const jumpRight = input({ right: true, jumpPressed: true });
  tick(physics, damage, hunger, jumpRight);
  assert(physics.position.y > 1);
  const airborneY = physics.position.y;
  for (let i = 0; i < 10; i++) {
    tick(physics, damage, hunger, input({ right: true, jumpHeld: true }));
    if (physics.blockedByStreaming) break;
  }
  assert.equal(physics.blockedByStreaming, true);
  assert.equal(physics.grounded, false);
  assert.equal(physics.position.y, airborneY);
  world.releaseRequested();
  for (let i = 0; i < 30; i++) tick(physics, damage, hunger, input({ right: true }));
  assert.equal(physics.grounded, true);
  assertFinite(physics);
}

function testStepClearanceIsCovered(): void {
  const world = new StreamingWorld();
  world.readyChunks.add('0,0');
  const collision = new TracingCollision(world as never);
  const pos = new THREE.Vector3(15.5, 1, 0.5);
  for (const step of [0.25, 0.5, 0.6]) {
    assert.equal(
      collision.getCollisionAvailabilityForMovement(pos, new THREE.Vector3(step, 0, 0), 1.8),
      'UNLOADED',
      `step ${step} checks the target collision region`,
    );
  }
}

function testFixedRates(): void {
  for (const fps of [30, 60, 120, 144]) {
    const world = new StreamingWorld();
    world.readyChunks.add('0,-1');
    const { physics, damage, hunger } = makePhysics(world, 0.5, -15.5);
    const sprintForward = input({ forward: true, sprintHeld: true });
    let accumulator = 0;
    let ticks = 0;
    for (let frame = 0; frame < fps * 2; frame++) {
      accumulator += 1 / fps;
      while (accumulator >= 0.05 - 1e-9) {
        tick(physics, damage, hunger, sprintForward);
        ticks++;
        if (physics.blockedByStreaming) world.releaseRequested();
        accumulator -= 0.05;
      }
    }
    assert.equal(ticks, 40, `${fps} FPS still produces 40 simulation ticks`);
    assert(physics.position.z < -16, `${fps} FPS crosses after collision data becomes ready`);
    assert(physics.position.y >= 1, `${fps} FPS does not fall at the border`);
    assertFinite(physics);
  }
}

function longTravel(blocks: number, direction: 'positive' | 'negative'): number {
  const world = new StreamingWorld();
  world.readyChunks.add('0,0');
  const { physics, damage, hunger } = makePhysics(world, 0.5, 0.5);
  const move = direction === 'positive' ? input({ right: true }) : input({ left: true });
  const origin = physics.position.x;
  for (let i = 0; i < 12000; i++) {
    tick(physics, damage, hunger, move);
    if (physics.blockedByStreaming) world.releaseRequested();
    if (Math.abs(physics.position.x - origin) >= blocks) break;
  }
  assert(Math.abs(physics.position.x - origin) >= blocks, `${direction} travel reaches ${blocks} blocks`);
  assert.equal(physics.grounded, true);
  assert.equal(physics.blockedByStreaming, false);
  assertFinite(physics);
  return Math.abs(physics.position.x - origin);
}

function testLongTravel(): void {
  const positive = longTravel(100, 'positive');
  const negative = longTravel(500, 'negative');
  console.log(`100-block travel: ${positive.toFixed(2)} blocks`);
  console.log(`500-block travel: ${negative.toFixed(2)} blocks`);
}

testCoreBoundary();
testActualChunkReadiness();
testNegativeBoundary();
testZAndCornerBoundaries();
testUnloadedStart();
testBorderCoordinates();
testRealAirStillFalls();
testMovementModes();
testJumpAcrossBoundary();
testStepClearanceIsCovered();
testFixedRates();
testLongTravel();
console.log('player streaming tests: ok');
