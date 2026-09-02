import { Block } from '../world/blocks';
import { Item } from '../player/items';
import { ItemRegistry } from './ItemDefinition';
import { ItemStackHelper, type ItemStack } from './ItemStack';
import {
  InventorySystem,
  MAIN_INVENTORY_SIZE,
  HOTBAR_SIZE,
  TOTAL_INVENTORY_SIZE,
} from './InventorySystem';
import { ItemDropEntity } from '../world/ItemDropEntity';
import * as THREE from 'three';

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

console.log('=== VYTHERA ITEMS, INVENTORY & HOTBAR TEST SUITE ===\n');

// ── 1. ITEM REGISTRY TESTS ──
console.log('--- 1. Item Registry ---');
const registry = ItemRegistry.get();
assert(registry.has(Block.Stone), 'Registry contains Stone block definition');
assert(registry.has(Item.WoodenPickaxe), 'Registry contains Wooden Pickaxe tool definition');
assert(registry.has(Item.Apple), 'Registry contains Apple food definition');

const stoneDef = registry.get(Block.Stone);
assert(stoneDef?.maxStackSize === 64, 'Stone max stack size is 64');
assert(stoneDef?.itemType === 'BLOCK', 'Stone itemType is BLOCK');

const pickDef = registry.get(Item.WoodenPickaxe);
assert(pickDef?.maxStackSize === 1, 'Tool max stack size is 1');
assert(pickDef?.durability === 60, 'Wooden Pickaxe durability is 60');
assert(pickDef?.itemType === 'TOOL', 'Wooden Pickaxe itemType is TOOL');

// ── 2. ITEM STACK & MERGING TESTS ──
console.log('\n--- 2. ItemStack Operations & Merging ---');
const s1 = ItemStackHelper.create(Block.Dirt, 32);
const s2 = ItemStackHelper.create(Block.Dirt, 40);
assert(s1 !== null && s2 !== null, 'ItemStacks created successfully');
assert(ItemStackHelper.canMerge(s1, s2), 'Identical block stacks can merge');

const leftAfterMerge = ItemStackHelper.merge(s1!, s2!);
assert(s1!.count === 64, 'Target stack merged to max 64');
assert(s2!.count === 8 && leftAfterMerge === 8, 'Incoming stack retained remainder of 8');

// Splitting
const splitStack = ItemStackHelper.split(s1!, 20);
assert(s1!.count === 44, 'Original stack count reduced after split');
assert(splitStack?.count === 20 && splitStack.id === Block.Dirt, 'Split stack has exact requested count (20)');

// Tool durability damage
const swordStack = ItemStackHelper.create(Item.WoodenSword, 1);
assert(swordStack?.durability === 60, 'Initial sword durability is 60');
const broke = ItemStackHelper.damage(swordStack!, 59);
assert(!broke && swordStack!.durability === 1, 'Damaging tool reduces durability without breaking');
const fullyBroke = ItemStackHelper.damage(swordStack!, 1);
assert(fullyBroke && swordStack!.durability === 0, 'Depleting durability reports item broken');

// ── 3. INVENTORY SYSTEM & SIZES ──
console.log('\n--- 3. Inventory Layout & Slot Sizes ---');
const inv = new InventorySystem(false); // empty
assert(MAIN_INVENTORY_SIZE === 27, 'Main storage has 27 slots');
assert(HOTBAR_SIZE === 9, 'Hotbar has 9 slots');
assert(TOTAL_INVENTORY_SIZE === 36, 'Total inventory has 36 slots');

// ── 4. HOTBAR CYCLING & SELECTION ──
console.log('\n--- 4. Hotbar Selection & Wrapping ---');
inv.setHotbar(0);
assert(inv.selectedHotbar === 0, 'Hotbar starts at slot 0');
inv.setHotbar(8);
assert(inv.selectedHotbar === 8, 'Direct selection sets hotbar slot 8');
inv.cycleHotbar(1);
assert(inv.selectedHotbar === 0, 'Cycling forward from 8 wraps to 0');
inv.cycleHotbar(-1);
assert(inv.selectedHotbar === 8, 'Cycling backward from 0 wraps to 8');

// ── 5. HELD ITEM SYNCHRONIZATION ──
console.log('\n--- 5. Active Held Item Synchronization ---');
inv.setSlot(0, { id: Block.Wood, count: 10 });
inv.setSlot(1, { id: Item.StoneSword, count: 1, durability: 132, maxDurability: 132 });

inv.setHotbar(0);
assert(inv.heldItem?.id === Block.Wood && inv.heldItem.count === 10, 'Held item reflects selected hotbar slot 0');

inv.setHotbar(1);
assert(inv.heldItem?.id === Item.StoneSword, 'Held item automatically updates when switching hotbar slot');

// ── 6. INVENTORY INSERTION ALGORITHM ──
console.log('\n--- 6. Inventory Insertion Algorithm ---');
inv.clear();
const rem1 = inv.add(Block.Cobblestone, 100);
assert(rem1 === 0, 'Adding 100 cobblestone fits completely');
assert(inv.getSlot(0)?.count === 64, 'Slot 0 has full stack of 64 Cobblestone');
assert(inv.getSlot(1)?.count === 36, 'Slot 1 has overflow stack of 36 Cobblestone');

// Add more to verify merging into partial stack at slot 1
const rem2 = inv.add(Block.Cobblestone, 30);
assert(rem2 === 0, 'Adding 30 more merges into slot 1');
assert(inv.getSlot(1)?.count === 64, 'Slot 1 is now filled to 64');
assert(inv.getSlot(2)?.count === 2, 'Slot 2 holds the remaining 2 Cobblestone');

// Full inventory behavior
inv.clear();
for (let i = 0; i < TOTAL_INVENTORY_SIZE; i++) {
  inv.setSlot(i, { id: Block.Stone, count: 64 });
}
const remFull = inv.add(Block.Dirt, 10);
assert(remFull === 10, 'Full inventory rejects incoming items without discarding or overwriting');

// ── 7. CONSUMPTION & DURABILITY ──
console.log('\n--- 7. Item Consumption & Tool Wear ---');
inv.clear();
inv.setHotbar(0);
inv.setSlot(0, { id: Block.Planks, count: 5 });
assert(inv.consumeSelected(1), 'consumeSelected successfully consumes 1 item');
assert(inv.getSlot(0)?.count === 4, 'Slot count decremented to 4');

// Consume remaining
inv.consumeSelected(4);
assert(inv.getSlot(0) === null, 'Empty stack is automatically cleared from slot');

// Damage selected tool
inv.setSlot(0, { id: Item.WoodenPickaxe, count: 1, durability: 2, maxDurability: 60 });
inv.damageSelected(1);
assert(inv.getSlot(0)?.durability === 1, 'Tool durability decreased to 1');
inv.damageSelected(1);
assert(inv.getSlot(0) === null, 'Tool breaks and disappears when durability hits 0');

// ── 8. SERIALIZATION & DESERIALIZATION ──
console.log('\n--- 8. Serialization & Data Validation ---');
inv.clear();
inv.setHotbar(3);
inv.setSlot(0, { id: Block.Wood, count: 16 });
inv.setSlot(3, { id: Item.StonePickaxe, count: 1, durability: 95, maxDurability: 132 });

const serialized = inv.serialize();
assert(serialized.selectedHotbar === 3, 'Serialized hotbar index matches');
assert(serialized.slots.length === 2, 'Serialized exact populated slots');

const newInv = new InventorySystem(false);
const ok = newInv.deserialize(serialized);
assert(ok, 'Deserialization succeeded');
assert(newInv.selectedHotbar === 3, 'Deserialized hotbar is slot 3');
assert(newInv.getSlot(0)?.id === Block.Wood && newInv.getSlot(0)?.count === 16, 'Deserialized slot 0 matches');
assert(newInv.getSlot(3)?.durability === 95, 'Deserialized tool durability matches');

// Malformed data resilience
const corruptData = {
  selectedHotbar: 999, // out of range
  slots: [
    { slot: -1, id: 999, count: -5 },
    { slot: 100, id: Block.Stone, count: 9999 },
    { slot: 0, id: Block.Dirt, count: 999 }, // should clamp to 64
  ],
};
newInv.deserialize(corruptData);
assert(newInv.selectedHotbar === 0, 'Out-of-range hotbar index sanitized to valid slot (0)');
assert(newInv.getSlot(0)?.count === 64, 'Corrupt stack count clamped to maxStack (64)');

// ── 9. PHYSICAL ITEM DROP ENTITY & MERGING ──
console.log('\n--- 9. Physical Item Drop Entity ---');
const mockChunks = { isSolidAt: () => false };
const drop1 = new ItemDropEntity(
  {
    itemId: Block.Cobblestone,
    count: 10,
    position: new THREE.Vector3(0, 5, 0),
  },
  mockChunks as any,
);
const drop2 = new ItemDropEntity(
  {
    itemId: Block.Cobblestone,
    count: 15,
    position: new THREE.Vector3(0.1, 5, 0.1),
  },
  mockChunks as any,
);

assert(drop1.canMergeWith(drop2), 'Compatible item drop entities can merge');
drop1.merge(drop2);
assert(drop1.count === 25, 'Merged drop entity has combined count (25)');
assert(drop2.isRemoved, 'Merged source drop entity is removed');

drop1.dispose();

console.log(`\n========================================`);
console.log(`Summary: ${passed} passed, ${failed} failed.`);
console.log(`========================================\n`);

if (failed > 0) {
  process.exit(1);
}
