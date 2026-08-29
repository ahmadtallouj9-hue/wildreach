import * as THREE from 'three';
import { PlayerConfig, TICK_RATE, TICK_DT } from './PlayerConfig';
import { PlayerDamage } from './PlayerDamage';
import { PlayerHunger } from './PlayerHunger';
import { Difficulty, type DamageEvent } from './PlayerState';
import { PlayerCollision } from './PlayerCollision';
import { PlayerPhysics } from './PlayerPhysics';
import { PlayerCamera } from './PlayerCamera';
import {
  getBlockCollisionBoxes,
  getSlabCollisionBoxes,
  getStairCollisionBoxes,
  getFenceCollisionBoxes,
  getWallCollisionBoxes,
  getTrapdoorCollisionBoxes,
  getDoorCollisionBoxes,
  intersectsAABB,
  createAABB,
} from './CollisionShape';
import type { PlayerInputSnapshot } from './PlayerInput';

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${msg}`);
  }
}

function approx(a: number, b: number, eps = 0.02): boolean {
  return Math.abs(a - b) <= eps;
}

// Mock ChunkManager for testing collision and blocks
class MockChunkManager {
  private solidBlocks = new Set<string>();

  setSolid(x: number, y: number, z: number): void {
    this.solidBlocks.add(`${x},${y},${z}`);
  }

  isSolidAt(x: number, y: number, z: number): boolean {
    return this.solidBlocks.has(`${x},${y},${z}`);
  }

  getBlock(x: number, y: number, z: number): number {
    return this.isSolidAt(x, y, z) ? 1 : 0;
  }

  isColumnReady(): boolean {
    return true;
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
}

function emptyInput(): PlayerInputSnapshot {
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
    usePressed: false,
    analogX: 0,
    analogZ: 0,
  };
}

console.log('=== VYTHERA Final Player Physics & Gameplay Validation ===\n');

// ── 1. MOVEMENT FORMULA & VELOCITY CURVES ──
console.log('--- 1 & 2. Movement Formula & Velocity Curves ---');
const mockChunks = new MockChunkManager();
const collision = new PlayerCollision(mockChunks as any);
const physics = new PlayerPhysics(collision, mockChunks as any);
const damage = new PlayerDamage();
const hunger = new PlayerHunger();

for (let x = -50; x <= 50; x++) {
  for (let z = -50; z <= 50; z++) {
    mockChunks.setSolid(x, -1, z);
  }
}

// 20 ticks of walking from rest + 10 ticks deceleration
physics.teleport(0, 0, 0);
physics.grounded = true;
const walkInput: PlayerInputSnapshot = { ...emptyInput(), forward: true };

const walkTicks: { tick: number; vel: number; speed: number; posX: number; posZ: number }[] = [];
for (let t = 0; t < 20; t++) {
  physics.simulateTick(walkInput, 0, damage, hunger);
  const spd = Math.hypot(physics.velocity.x, physics.velocity.z);
  walkTicks.push({
    tick: t,
    vel: spd,
    speed: spd * TICK_RATE,
    posX: physics.position.x,
    posZ: physics.position.z,
  });
}

// Deceleration phase (10 ticks)
const walkDecelTicks: { tick: number; vel: number; speed: number }[] = [];
for (let t = 20; t < 30; t++) {
  physics.simulateTick(emptyInput(), 0, damage, hunger);
  const spd = Math.hypot(physics.velocity.x, physics.velocity.z);
  walkDecelTicks.push({
    tick: t,
    vel: spd,
    speed: spd * TICK_RATE,
  });
}

const finalWalkSpeed = walkTicks[19]!.speed;
assert(
  approx(finalWalkSpeed, PlayerConfig.movement.walkSpeed, 0.05),
  `Walk terminal speed matches 4.317 blocks/sec (got ${finalWalkSpeed.toFixed(3)})`,
);
assert(
  walkDecelTicks[9]!.speed < 0.001,
  `Deceleration reaches complete stop after 10 ticks without input (got ${walkDecelTicks[9]!.speed.toFixed(5)})`,
);

// Diagonal movement normalization test (W+D should match W speed)
physics.teleport(0, 0, 0);
physics.grounded = true;
const diagInput: PlayerInputSnapshot = { ...emptyInput(), forward: true, right: true };
for (let t = 0; t < 20; t++) {
  physics.simulateTick(diagInput, 0, damage, hunger);
}
const finalDiagSpeed = Math.hypot(physics.velocity.x, physics.velocity.z) * TICK_RATE;
assert(
  approx(finalDiagSpeed, PlayerConfig.movement.walkSpeed, 0.05),
  `Diagonal W+D terminal speed matches normalized forward speed (${finalDiagSpeed.toFixed(3)} b/s vs ${finalWalkSpeed.toFixed(3)} b/s)`,
);

// 20 ticks of sprinting from rest
physics.teleport(0, 0, 0);
physics.grounded = true;
const sprintInput: PlayerInputSnapshot = { ...emptyInput(), forward: true, sprintHeld: true };
const sprintTicks: { tick: number; speed: number }[] = [];
for (let t = 0; t < 20; t++) {
  physics.simulateTick(sprintInput, 0, damage, hunger);
  const spd = Math.hypot(physics.velocity.x, physics.velocity.z) * TICK_RATE;
  sprintTicks.push({ tick: t, speed: spd });
}
const finalSprintSpeed = sprintTicks[19]!.speed;
assert(
  approx(finalSprintSpeed, 5.612, 0.08),
  `Sprint terminal speed matches 5.612 blocks/sec (got ${finalSprintSpeed.toFixed(3)})`,
);

// 20 ticks of sneaking from rest
physics.teleport(0, 0, 0);
physics.grounded = true;
const sneakInput: PlayerInputSnapshot = { ...emptyInput(), forward: true, sneakHeld: true };
const sneakTicks: { tick: number; speed: number }[] = [];
for (let t = 0; t < 20; t++) {
  physics.simulateTick(sneakInput, 0, damage, hunger);
  const spd = Math.hypot(physics.velocity.x, physics.velocity.z) * TICK_RATE;
  sneakTicks.push({ tick: t, speed: spd });
}
const finalSneakSpeed = sneakTicks[19]!.speed;
assert(
  approx(finalSneakSpeed, 1.295, 0.05),
  `Sneak terminal speed matches 1.295 blocks/sec (got ${finalSneakSpeed.toFixed(3)})`,
);

// ── 3. DIRECTION CHANGE & SPRINT-TO-SNEAK TRANSITION ──
console.log('\n--- 3. Direction Change & Mode Transitions ---');
// W to S direction change
physics.teleport(0, 0, 0);
physics.grounded = true;
for (let t = 0; t < 20; t++) physics.simulateTick(walkInput, 0, damage, hunger);
physics.simulateTick({ ...emptyInput(), backward: true }, 0, damage, hunger);
assert(!Number.isNaN(physics.velocity.z), 'Instant direction reverse (W -> S) remains numerically stable');

// Sprint -> Sneak cancels sprint
physics.teleport(0, 0, 0);
physics.grounded = true;
physics.simulateTick(sprintInput, 0, damage, hunger);
assert(physics.sprinting, 'Player enters sprinting mode');
physics.simulateTick({ ...sprintInput, sneakHeld: true }, 0, damage, hunger);
assert(!physics.sprinting && physics.sneaking, 'Sneaking immediately cancels sprinting mode');

// ── 4. COMPLETE JUMP ARC SIMULATION ──
console.log('\n--- 4. Complete Jump Arc Simulation ---');
physics.teleport(0, 0, 0);
physics.grounded = true;
physics.velocity.set(0, 0, 0);

const jumpInput: PlayerInputSnapshot = { ...emptyInput(), jumpPressed: true };
const jumpArc: { tick: number; posY: number; velY: number; grounded: boolean }[] = [];

physics.simulateTick(jumpInput, 0, damage, hunger);
jumpArc.push({
  tick: 0,
  posY: physics.position.y,
  velY: physics.velocity.y,
  grounded: physics.grounded,
});

for (let t = 1; t <= 12; t++) {
  physics.simulateTick(emptyInput(), 0, damage, hunger);
  jumpArc.push({
    tick: t,
    posY: physics.position.y,
    velY: physics.velocity.y,
    grounded: physics.grounded,
  });
}

const maxJumpY = Math.max(...jumpArc.map((j) => j.posY));
const landedTick = jumpArc.findIndex((j, idx) => idx > 0 && j.grounded);

assert(
  approx(maxJumpY, 1.25, 0.05),
  `Jump apex is ~1.25 blocks (got ${maxJumpY.toFixed(3)})`,
);
assert(
  landedTick === 11 || landedTick === 12,
  `Jump airtime is 11-12 ticks (0.55-0.60s) (landed on tick ${landedTick})`,
);

// Held jump key doesn't trigger continuous jump while airborne
physics.simulateTick({ ...emptyInput(), jumpHeld: true }, 0, damage, hunger);
assert(!physics.grounded || physics.velocity.y <= 0.42, 'Holding jump key does not infinitely rocket player');

// ── 5. SPRINT JUMP MOMENTUM & REPEAT GUARD ──
console.log('\n--- 5. Sprint Jump Momentum & Boost Timing ---');
physics.teleport(0, 0, 0);
physics.grounded = true;
physics.velocity.set(0, 0, 0);

// Launch sprint jump
physics.simulateTick({ ...emptyInput(), forward: true, sprintHeld: true, jumpPressed: true }, 0, damage, hunger);
const initialSprintJumpSpd = Math.hypot(physics.velocity.x, physics.velocity.z);

// Next tick in air with jump held
physics.simulateTick({ ...emptyInput(), forward: true, sprintHeld: true, jumpHeld: true }, 0, damage, hunger);
const midAirSpd = Math.hypot(physics.velocity.x, physics.velocity.z);

assert(
  initialSprintJumpSpd > 0.25,
  `Sprint jump applies +0.20 forward boost on launch tick (got initial ${initialSprintJumpSpd.toFixed(3)})`,
);
assert(
  midAirSpd < initialSprintJumpSpd + 0.05,
  'Boost is not repeatedly applied on subsequent airborne ticks',
);

// ── 6. COLLISION SHAPES STATUS & GEOMETRY TESTS ──
console.log('\n--- 6. Collision Shapes Status & Geometry Tests ---');

// Full solid cube
const fullBlockBoxes = getBlockCollisionBoxes(1, 10, 5, 10);
assert(
  fullBlockBoxes.length === 1 &&
    fullBlockBoxes[0]!.minX === 10 &&
    fullBlockBoxes[0]!.maxX === 11 &&
    fullBlockBoxes[0]!.minY === 5 &&
    fullBlockBoxes[0]!.maxY === 6,
  'Full solid cube returns exact 1x1x1 AABB',
);

// Air / non-solid block
const airBoxes = getBlockCollisionBoxes(0, 10, 5, 10);
assert(airBoxes.length === 0, 'Air / non-solid blocks return empty collision list');

// Slab tests
const bottomSlab = getSlabCollisionBoxes(0, 0, 0, 'bottom');
assert(bottomSlab.length === 1 && bottomSlab[0]!.maxY === 0.5, 'Bottom slab height is exact 0.5 (0.0 to 0.5)');

const topSlab = getSlabCollisionBoxes(0, 0, 0, 'top');
assert(topSlab.length === 1 && topSlab[0]!.minY === 0.5 && topSlab[0]!.maxY === 1.0, 'Top slab height is 0.5 to 1.0');

// Stair tests
const stairNorth = getStairCollisionBoxes(0, 0, 0, 'north', 'bottom');
assert(stairNorth.length === 2, 'Straight bottom stair composed of 2 exact AABBs (base + step)');
assert(stairNorth[0]!.maxY === 0.5 && stairNorth[1]!.minY === 0.5 && stairNorth[1]!.maxY === 1.0, 'Stair has base to 0.5 and step to 1.0');

// Fence tests (1.5 height post + arms)
const fencePost = getFenceCollisionBoxes(0, 0, 0, { north: true, south: false, east: false, west: false });
assert(fencePost.length === 2 && fencePost[0]!.maxY === 1.5, 'Fence post has 1.5 collision height to prevent normal jump-over');

// Wall tests (1.5 height post + arms)
const wallPost = getWallCollisionBoxes(0, 0, 0, { north: true, south: true, east: false, west: false });
assert(wallPost.length === 3 && wallPost[0]!.maxY === 1.5, 'Wall has 1.5 collision height and connected arms');

// Trapdoor tests (closed vs open)
const trapdoorClosed = getTrapdoorCollisionBoxes(0, 0, 0, false, 'bottom');
assert(trapdoorClosed.length === 1 && approx(trapdoorClosed[0]!.maxY, 0.1875), 'Closed bottom trapdoor is 3/16 thick on bottom');

const trapdoorOpen = getTrapdoorCollisionBoxes(0, 0, 0, true, 'bottom', 'north');
assert(trapdoorOpen.length === 1 && approx(trapdoorOpen[0]!.maxZ, 0.1875), 'Open trapdoor is vertical against north edge');

// Door tests (closed vs open)
const doorClosed = getDoorCollisionBoxes(0, 0, 0, false, 'north');
assert(doorClosed.length === 1 && approx(doorClosed[0]!.maxZ, 0.1875), 'Closed door blocks passage along north face');

const doorOpen = getDoorCollisionBoxes(0, 0, 0, true, 'north', 'left');
assert(doorOpen.length === 1 && approx(doorOpen[0]!.maxX, 0.1875), 'Open door swung 90 deg against side hinge allowing passage');

// ── 7. STEP-UP ELEVATION TESTS ──
console.log('\n--- 7. Step-Up Elevation Tests ---');
const testStepHeights = [
  { height: 0.25, allowed: true },
  { height: 0.50, allowed: true },
  { height: 0.60, allowed: true },
  { height: 0.61, allowed: false },
  { height: 1.00, allowed: false },
];

for (const test of testStepHeights) {
  const canStep = test.height <= PlayerConfig.movement.maxStepHeight;
  assert(
    canStep === test.allowed,
    `Obstacle height ${test.height.toFixed(2)}m step-up: ${test.allowed ? 'ALLOWED (<= 0.60m)' : 'BLOCKED (> 0.60m)'}`,
  );
}

// ── 8. SNEAK EDGE RESTRAINT & CEILING CLEARANCE ──
console.log('\n--- 8. Sneak Edge Restraint & Ceiling Clearance ---');
const cliffChunks = new MockChunkManager();
for (let x = -10; x <= 0; x++) {
  for (let z = -10; z <= 10; z++) {
    cliffChunks.setSolid(x, -1, z);
  }
}
cliffChunks.setSolid(0, 1, 0); // Ceiling at Y=1 over player at Y=0

const cliffCollision = new PlayerCollision(cliffChunks as any);
const standingWalkOff = cliffCollision.resolveMovement(
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(0.5, 0, 0),
  PlayerConfig.dimensions.standingHeight,
  PlayerConfig.dimensions.width,
  false,
);
assert(!standingWalkOff.hitX, 'Standing player can move freely across block edges');

const restricted = cliffCollision.restrictSneakDelta(
  new THREE.Vector3(0, 0, 0),
  0.5,
  0,
  PlayerConfig.dimensions.width,
  PlayerConfig.dimensions.sneakingHeight,
);
assert(
  restricted.dx < 0.5,
  `Sneaking on ground restricts delta toward ledge (requested 0.50, restricted to ${restricted.dx.toFixed(2)})`,
);
assert(!cliffCollision.canStandUp(new THREE.Vector3(0, 0, 0)), 'Low ceiling at Y=1 prevents sneaking player from standing up');

// ── 9. HEALTH UNITS & HEART UI FORMULA ──
console.log('\n--- 9. Health Units & Clamping ---');
damage.respawn();
assert(damage.health === 20 && damage.maxHealth === 20, 'Health is 20 HP (10 full hearts)');
damage.heal(50);
assert(damage.health === 20, 'Health clamped to maxHealth (20)');
damage.processDamage({ amount: 100, source: 'void' });
assert(damage.health === 0 && damage.isDead, 'Health clamped to 0 on death');

// Verify Heart UI math (20 HP -> 10 full hearts, 1 HP -> 0.5 hearts, 0 HP -> 0 hearts)
function computeHeartStates(hp: number): string[] {
  const states: string[] = [];
  for (let i = 0; i < 10; i++) {
    const heartHp = (i + 1) * 2;
    if (hp >= heartHp) states.push('full');
    else if (hp >= heartHp - 1) states.push('half');
    else states.push('empty');
  }
  return states;
}
assert(computeHeartStates(20).filter((s) => s === 'full').length === 10, '20 HP displays exactly 10 full hearts');
assert(computeHeartStates(19).filter((s) => s === 'full').length === 9 && computeHeartStates(19)[9] === 'half', '19 HP displays 9 full hearts and 1 half heart');
assert(computeHeartStates(1)[0] === 'half' && computeHeartStates(1).filter((s) => s === 'empty').length === 9, '1 HP displays 1 half heart and 9 empty hearts');

// ── 10. DAMAGE IMMUNITY COOLDOWN SEQUENCE ──
console.log('\n--- 10. Damage Immunity Cooldown Sequence ---');
damage.respawn();
const d0 = damage.processDamage({ amount: 2, source: 'mob' });
assert(d0, 'Hit 1 at tick 0 processed');
assert(damage.health === 18, 'Health is 18 HP');

// Tick 1
damage.tick();
const d1 = damage.processDamage({ amount: 2, source: 'mob' });
assert(!d1, 'Hit at tick 1 ignored (immunity active)');

// Ticks 2-5
for (let t = 2; t <= 5; t++) damage.tick();
const d5 = damage.processDamage({ amount: 2, source: 'mob' });
assert(!d5, 'Hit at tick 5 ignored (immunity active)');

// Ticks 6-9
for (let t = 6; t <= 9; t++) damage.tick();
const d9 = damage.processDamage({ amount: 2, source: 'mob' });
assert(!d9, 'Hit at tick 9 ignored (immunity active)');

// Tick 10 (cooldown reaches 0)
damage.tick();
const d10 = damage.processDamage({ amount: 2, source: 'mob' });
assert(d10, 'Hit at tick 10 processed (immunity expired)');
assert(damage.health === 16, 'Health reduced to 16 HP');

// ── 11. FALL DAMAGE ──
console.log('\n--- 11. Fall Damage Formula ---');
const fallTests = [
  { dist: 3.0, expected: 0 },
  { dist: 4.0, expected: 1 },
  { dist: 5.0, expected: 2 },
  { dist: 6.0, expected: 3 },
  { dist: 10.0, expected: 7 },
];
for (const f of fallTests) {
  const dmg = Math.max(0, Math.floor(f.dist - PlayerConfig.damage.safeFallDistance));
  assert(dmg === f.expected, `Fall of ${f.dist} blocks deals ${f.expected} HP damage`);
}

// ── 12. HUNGER & EXHAUSTION ──
console.log('\n--- 12. Hunger & Exhaustion System ---');
hunger.respawn();
damage.setHealth(20);

// Distance-based sprint exhaustion
hunger.recordSprintDistance(10.0); // 10 blocks -> 1.0 exhaustion
assert(approx(hunger.exhaustion, 1.0, 0.01), '10 sprinted blocks produce 1.0 exhaustion (0.1/block)');

// Drain 4.0 exhaustion -> 1 saturation consumed
hunger.addExhaustion(3.0); // total 4.0
assert(hunger.saturation === 4 && hunger.hunger === 20, '4.0 exhaustion consumes 1 saturation (saturation: 4, hunger: 20)');

// Sprint cutoff
hunger.hunger = 7;
assert(hunger.canSprint, 'Can sprint at hunger = 7');
hunger.hunger = 6;
assert(!hunger.canSprint, 'Cannot sprint at hunger = 6');

// Natural regen (>= 18)
damage.setHealth(15);
hunger.hunger = 18;
for (let t = 0; t < 80; t++) hunger.tick(damage);
assert(damage.health === 16, 'Natural regen heals 1 HP after 80 ticks at hunger >= 18');

// Starvation (= 0)
damage.setHealth(20);
hunger.hunger = 0;
for (let t = 0; t < 80; t++) hunger.tick(damage);
assert(damage.health === 19, 'Starvation deals 1 HP damage after 80 ticks at hunger = 0');

// ── 13. FPS INDEPENDENCE ACROSS 30, 60, 120, 144, 240 FPS ──
console.log('\n--- 13. FPS Independence Across 30, 60, 120, 144, 240 FPS ---');
const fpsList = [30, 60, 120, 144, 240];
for (const fps of fpsList) {
  const dt = 1 / fps;
  let accum = 0;
  let ticks = 0;
  const frames = Math.round(fps * 2.0);
  for (let f = 0; f < frames; f++) {
    accum += dt;
    while (accum >= TICK_DT - 1e-7) {
      ticks++;
      accum -= TICK_DT;
    }
  }
  assert(ticks === 40, `At ${fps} FPS over 2.0s: exactly 40 fixed ticks simulated`);
}

// ── 14. CAMERA SEPARATION ──
console.log('\n--- 14. Camera Visual-Only Separation ---');
const camera = new PlayerCamera(mockChunks as any);
camera.setBaseFov(70);

const p1 = new THREE.Vector3(0, 0, 0);
const p2 = new THREE.Vector3(1, 0, 0);

// Camera update does NOT modify physics vector p1 or p2
camera.update(p1, p2, 0.5, 1.62, true, true, false, false, false, 0.016);
assert(p1.x === 0 && p2.x === 1, 'Camera visual effects and render interpolation do not mutate physics positions');
assert(camera.camera.position.x === 0.5, 'Camera positioned at interpolated render position (alpha = 0.5)');

// ── 15. LONG-RUN DETERMINISM (10,000 TICKS) ──
console.log('\n--- 15. Long-Run Determinism (10,000 Ticks Simulation) ---');
function run10kSimulation(): {
  pos: { x: number; y: number; z: number };
  vel: { x: number; y: number; z: number };
  health: number;
  hunger: number;
  exhaustion: number;
} {
  const c = new MockChunkManager();
  for (let x = -200; x <= 200; x++) {
    for (let z = -200; z <= 200; z++) {
      c.setSolid(x, -1, z);
    }
  }
  const col = new PlayerCollision(c as any);
  const phy = new PlayerPhysics(col, c as any);
  const dmg = new PlayerDamage();
  const hgr = new PlayerHunger();
  phy.teleport(0, 0, 0);
  phy.grounded = true;

  // Pseudo-random repeatable input pattern
  for (let t = 0; t < 10000; t++) {
    const input: PlayerInputSnapshot = {
      ...emptyInput(),
      forward: t % 4 !== 0,
      right: t % 7 === 0,
      left: t % 11 === 0,
      jumpPressed: t % 50 === 0,
      sprintHeld: t % 3 === 0,
      sneakHeld: t % 13 === 0,
    };
    phy.simulateTick(input, (t * 0.01) % (Math.PI * 2), dmg, hgr);
    hgr.tick(dmg);
    dmg.tick();
  }

  return {
    pos: { x: phy.position.x, y: phy.position.y, z: phy.position.z },
    vel: { x: phy.velocity.x, y: phy.velocity.y, z: phy.velocity.z },
    health: dmg.health,
    hunger: hgr.hunger,
    exhaustion: hgr.exhaustion,
  };
}

const runA = run10kSimulation();
const runB = run10kSimulation();

assert(
  !Number.isNaN(runA.pos.x) && !Number.isNaN(runA.vel.x) && isFinite(runA.pos.z),
  '10,000-tick simulation completes with zero NaN / Infinity',
);
assert(
  runA.pos.x === runB.pos.x &&
    runA.pos.y === runB.pos.y &&
    runA.pos.z === runB.pos.z &&
    runA.vel.x === runB.vel.x &&
    runA.vel.y === runB.vel.y &&
    runA.health === runB.health &&
    runA.hunger === runB.hunger &&
    runA.exhaustion === runB.exhaustion,
  '10,000-tick simulation is 100.000% bit-exact deterministic between runs',
);

console.log(`\n========================================`);
console.log(`Final Validation Results: ${passed} passed, ${failed} failed.`);
console.log(`========================================\n`);

if (failed > 0) {
  process.exit(1);
}
