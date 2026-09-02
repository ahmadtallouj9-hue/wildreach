import * as THREE from 'three';
import { Block, CHUNK_HEIGHT } from '../world/blocks';
import { Item } from '../player/items';
import { raycastBlock } from './BlockRaycast';
import { getBlockInteractionProperties, getToolDefinition } from './BlockInteractionProperties';
import { BlockBreakState } from './BlockBreakState';
import { validateBlockPlacement } from './BlockPlacement';
import { CombatSystem } from '../combat/CombatSystem';
import { getAttackDefinition } from '../combat/AttackDefinition';
import { raycastAttackTarget } from '../combat/AttackTargeting';

class MockWorld {
  blocks = new Map<string, number>();

  getBlock(x: number, y: number, z: number): number {
    if (y < 0 || y >= CHUNK_HEIGHT) return Block.Air;
    return this.blocks.get(`${x},${y},${z}`) ?? Block.Air;
  }

  setBlock(x: number, y: number, z: number, id: number): boolean {
    if (y < 0 || y >= CHUNK_HEIGHT) return false;
    this.blocks.set(`${x},${y},${z}`, id);
    return true;
  }
}

class MockMob {
  id = 'mock_zombie_1';
  type = 'zombie';
  position = new THREE.Vector3(0, 5, 2);
  health = 20;
  lastDamageTaken = 0;
  lastKnockback: THREE.Vector3 | null = null;

  takeDamage(amount: number, knockback?: THREE.Vector3): void {
    this.health = Math.max(0, this.health - amount);
    this.lastDamageTaken = amount;
    this.lastKnockback = knockback ? knockback.clone() : null;
  }
}

class MockMobManager {
  mobs: MockMob[] = [];

  raycastMob(origin: THREE.Vector3, direction: THREE.Vector3, maxDist: number): MockMob | null {
    for (const mob of this.mobs) {
      const toMob = mob.position.clone().sub(origin);
      const proj = toMob.dot(direction);
      if (proj > 0 && proj <= maxDist) {
        const perp = toMob.clone().sub(direction.clone().multiplyScalar(proj));
        if (perp.length() < 0.6) {
          return mob;
        }
      }
    }
    return null;
  }
}

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${msg}`);
    failed++;
  }
}

console.log('=== VYTHERA BLOCK INTERACTION & COMBAT TEST SUITE ===\n');

// ── 1. BLOCK TARGETING RAYCAST ──
console.log('--- 1. Block Targeting Raycast ---');
const world = new MockWorld();

// Empty world
const hitEmpty = raycastBlock(
  { x: 0.5, y: 5.5, z: 0.5 },
  { x: 0, y: 0, z: 1 },
  5.0,
  (x, y, z) => world.getBlock(x, y, z),
);
assert(hitEmpty === null, 'Empty world raycast returns null (no target)');

// Place a stone block at (0, 5, 3)
world.setBlock(0, 5, 3, Block.Stone);

const hitStone = raycastBlock(
  { x: 0.5, y: 5.5, z: 0.5 },
  { x: 0, y: 0, z: 1 },
  5.0,
  (x, y, z) => world.getBlock(x, y, z),
);
assert(hitStone !== null && hitStone.hit, 'Raycast hits solid block');
assert(
  hitStone?.blockPosition.x === 0 &&
    hitStone?.blockPosition.y === 5 &&
    hitStone?.blockPosition.z === 3 &&
    hitStone?.blockId === Block.Stone,
  'Hit result contains exact block coordinates and ID',
);
assert(hitStone?.face === 'north', 'Raycast entering from negative Z hits north face');
assert(
  hitStone?.placePosition.x === 0 &&
    hitStone?.placePosition.y === 5 &&
    hitStone?.placePosition.z === 2,
  'Adjacent placement cell is in front of the hit face (0, 5, 2)',
);

// Raycast from above (hitting top face)
const hitTop = raycastBlock(
  { x: 0.5, y: 8.5, z: 3.5 },
  { x: 0, y: -1, z: 0 },
  5.0,
  (x, y, z) => world.getBlock(x, y, z),
);
assert(hitTop !== null && hitTop.face === 'top', 'Raycast from above hits top face');
assert(
  hitTop?.placePosition.x === 0 &&
    hitTop?.placePosition.y === 6 &&
    hitTop?.placePosition.z === 3,
  'Adjacent placement cell above top face is (0, 6, 3)',
);

// Out of range check
const hitFar = raycastBlock(
  { x: 0.5, y: 5.5, z: 0.5 },
  { x: 0, y: 0, z: 1 },
  2.0, // range is 2.0, target is at z=3 (distance 2.5)
  (x, y, z) => world.getBlock(x, y, z),
);
assert(hitFar === null, 'Raycast beyond reach distance is rejected');

// Raycast stopped by first solid block
world.setBlock(0, 5, 1, Block.Wood);
const hitFirst = raycastBlock(
  { x: 0.5, y: 5.5, z: 0.5 },
  { x: 0, y: 0, z: 1 },
  5.0,
  (x, y, z) => world.getBlock(x, y, z),
);
assert(hitFirst?.blockPosition.z === 1 && hitFirst?.blockId === Block.Wood, 'Raycast stops at first solid block, does not penetrate');

// ── 2. BLOCK HARDNESS & BREAKING PROGRESS ──
console.log('\n--- 2. Block Hardness & Breaking Progress ---');

const dirtProps = getBlockInteractionProperties(Block.Dirt);
const stoneProps = getBlockInteractionProperties(Block.Stone);
const woodProps = getBlockInteractionProperties(Block.Wood);

assert(dirtProps.hardness < stoneProps.hardness, 'Dirt hardness (0.5) is less than Stone hardness (1.5)');
assert(stoneProps.preferredToolCategory === 'pickaxe', 'Stone preferred tool is pickaxe');
assert(woodProps.preferredToolCategory === 'axe', 'Wood preferred tool is axe');

const breakState = new BlockBreakState();
breakState.start(0, 5, 3, Block.Stone, 0); // Bare fist on stone
const fistStoneTicks = breakState.totalTicks;

breakState.start(0, 5, 3, Block.Stone, Item.WoodenPickaxe);
const woodPickStoneTicks = breakState.totalTicks;

breakState.start(0, 5, 3, Block.Stone, Item.StonePickaxe);
const stonePickStoneTicks = breakState.totalTicks;

assert(fistStoneTicks > woodPickStoneTicks, `Fist mining (${fistStoneTicks} ticks) is slower than Wooden Pickaxe (${woodPickStoneTicks} ticks)`);
assert(woodPickStoneTicks > stonePickStoneTicks, `Wooden Pickaxe (${woodPickStoneTicks} ticks) is slower than Stone Pickaxe (${stonePickStoneTicks} ticks)`);

// Test deterministic break ticking
breakState.start(0, 5, 3, Block.Dirt, 0);
assert(!breakState.tick(), 'Tick 1 of break is in progress');
assert(breakState.progress > 0 && breakState.progress < 1.0, 'Progress is between 0.0 and 1.0');

// Cancel break
breakState.cancel();
assert(!breakState.active && breakState.progress === 0, 'Cancelled break resets break state');

// ── 3. BLOCK DROPS LOGIC ──
console.log('\n--- 3. Block Drops Logic ---');
const fistStoneDrops = stoneProps.drops(Block.Stone, 0);
assert(fistStoneDrops.length === 0, 'Mining stone with bare fist yields no drops (requires pickaxe)');

const pickStoneDrops = stoneProps.drops(Block.Stone, Item.WoodenPickaxe);
assert(pickStoneDrops.length === 1 && pickStoneDrops[0]!.itemId === Block.Cobblestone, 'Mining stone with Wooden Pickaxe yields Cobblestone');

const woodDrops = woodProps.drops(Block.Wood, 0);
assert(woodDrops.length === 1 && woodDrops[0]!.itemId === Block.Wood, 'Mining wood with bare hand yields Oak Log');

// ── 4. BLOCK PLACEMENT VALIDATION ──
console.log('\n--- 4. Block Placement Validation ---');
world.setBlock(0, 5, 1, Block.Air); // Clear intermediate block

const hitForPlace = raycastBlock(
  { x: 0.5, y: 5.5, z: 0.5 },
  { x: 0, y: 0, z: 1 },
  5.0,
  (x, y, z) => world.getBlock(x, y, z),
);

// Player at (0.5, 5, 0.5) placing block at (0, 5, 2)
const validPlacement = validateBlockPlacement(
  hitForPlace!,
  Block.Planks,
  new THREE.Vector3(0.5, 5, 0.5),
  1.8,
  world as any,
);
assert(validPlacement.valid, 'Valid placement into open air succeeds');

// Player standing inside the target placement cell (0.5, 5, 2.0)
const collidingPlacement = validateBlockPlacement(
  hitForPlace!,
  Block.Planks,
  new THREE.Vector3(0.5, 5, 2.0),
  1.8,
  world as any,
);
assert(!collidingPlacement.valid, 'Placement is rejected if player occupies the new block position');

// ── 5. COMBAT SYSTEM & ATTACK TARGETING ──
console.log('\n--- 5. Combat System & Attack Targeting ---');
const mobManager = new MockMobManager();
const zombie = new MockMob();
mobManager.mobs.push(zombie);

const combat = new CombatSystem(mobManager as any);

const attackOrigin = new THREE.Vector3(0, 5, 0);
const attackDir = new THREE.Vector3(0, 0, 1);

// Fist attack at distance 2.0
const fistResult = combat.executeAttack(
  attackOrigin,
  attackDir,
  0, // Bare fist
  true, // grounded
  0, // velY
  false, // not dead
);
assert(fistResult.hit && fistResult.entity === zombie, 'Attack raycast hits mob in front of player');
assert(zombie.health === 19 && zombie.lastDamageTaken === 1, 'Fist attack deals 1 damage to mob');
assert(zombie.lastKnockback !== null && zombie.lastKnockback.z > 0, 'Fist attack applies forward knockback vector');

// Wooden Sword attack (baseDamage = 4)
combat.tick();
for (let i = 0; i < 20; i++) combat.tick(); // cooldown expired

const swordResult = combat.executeAttack(
  attackOrigin,
  attackDir,
  Item.WoodenSword,
  true,
  0,
  false,
);
assert(swordResult.hit, 'Sword attack hits mob');
assert(zombie.health === 15 && zombie.lastDamageTaken === 4, 'Wooden Sword attack deals 4 damage to mob');

// Critical Hit (falling in air: velY < -0.05, !isGrounded)
for (let i = 0; i < 20; i++) combat.tick();
const critResult = combat.executeAttack(
  attackOrigin,
  attackDir,
  Item.StoneSword, // baseDamage 6 -> crit 1.5x = 9
  false, // in air
  -0.2, // falling downward
  false,
);
assert(critResult.hit, 'Falling jump attack hits mob');
assert(zombie.health === 6 && zombie.lastDamageTaken === 9, 'Critical attack deals 1.5x damage (6 * 1.5 = 9)');

// Out of range combat attack (> 3.5 blocks)
zombie.position.set(0, 5, 10);
const farAttack = combat.executeAttack(
  attackOrigin,
  attackDir,
  Item.StoneSword,
  true,
  0,
  false,
);
assert(!farAttack.hit, 'Attack beyond entity reach distance (3.5 blocks) misses');

console.log(`\n========================================`);
console.log(`Summary: ${passed} passed, ${failed} failed.`);
console.log(`========================================\n`);

if (failed > 0) {
  process.exit(1);
}
