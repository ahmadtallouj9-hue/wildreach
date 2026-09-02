import { Block } from '../world/blocks';
import { Item } from '../player/items';
import { RecipeRegistry } from '../crafting/RecipeRegistry';
import { CraftingSystem } from '../crafting/CraftingSystem';
import { EquipmentSystem } from '../equipment/EquipmentSystem';
import { ArmorDamageCalculator } from '../equipment/ArmorDamageCalculator';
import { PlayerDamage } from '../player/PlayerDamage';
import { InventorySystem } from '../inventory/InventorySystem';
import { ItemStackHelper } from '../inventory/ItemStack';

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

console.log('=== VYTHERA CRAFTING, EQUIPMENT & ARMOR TEST SUITE ===\n');

// ── 1. RECIPE REGISTRY TESTS ──
console.log('--- 1. Recipe Registration & Lookups ---');
const registry = RecipeRegistry.get();
assert(registry.has('planks'), 'Registry contains Planks recipe');
assert(registry.has('sticks'), 'Registry contains Sticks recipe');
assert(registry.has('wooden_pickaxe'), 'Registry contains Wooden Pickaxe recipe');
assert(registry.has('iron_chestplate'), 'Registry contains Iron Chestplate recipe');

const planksRecipe = registry.get('planks');
assert(planksRecipe?.type === 'SHAPELESS', 'Planks recipe is SHAPELESS');
assert(planksRecipe?.result.id === Block.Planks && planksRecipe.result.count === 4, 'Planks yields 4 items');

const pickaxeRecipe = registry.get('wooden_pickaxe');
assert(pickaxeRecipe?.type === 'SHAPED', 'Pickaxe recipe is SHAPED');
assert(pickaxeRecipe?.gridRequired === '3x3', 'Pickaxe requires 3x3 workbench grid');

// ── 2. CRAFTING SYSTEM MATCHING & EXECUTION ──
console.log('\n--- 2. Crafting System Matching & Execution ---');
const crafting = new CraftingSystem();

// Empty grid
assert(crafting.match() === null, 'Empty grid returns no recipe');
assert(crafting.peekResult() === null, 'Empty grid peekResult returns null');

// Shapeless single log -> 4 planks
crafting.set(4, { id: Block.Wood, count: 1 }); // placed in center
let matched = crafting.match();
assert(matched?.id === 'planks', 'Shapeless log in center matches Planks recipe');
let peek = crafting.peekResult();
assert(peek?.id === Block.Planks && peek?.count === 4, 'Peek result is 4 Oak Planks');

const craftedPlanks = crafting.craftOnce();
assert(craftedPlanks?.id === Block.Planks && craftedPlanks?.count === 4, 'Crafting consumes input and produces 4 Planks');
assert(crafting.get(4) === null, 'Input log slot is cleared');

// Shaped crafting: Sticks (2 planks vertical)
crafting.set(1, { id: Block.Planks, count: 2 });
crafting.set(4, { id: Block.Planks, count: 2 });
matched = crafting.match();
assert(matched?.id === 'sticks', '2 vertical planks match Sticks recipe');
const craftedSticks = crafting.craftOnce();
assert(craftedSticks?.id === Item.Stick && craftedSticks?.count === 4, 'Crafted 4 Sticks');
assert(crafting.get(1)?.count === 1 && crafting.get(4)?.count === 1, 'Remaining inputs decremented atomically to 1');

// Mirrored / Offset shaped recipes (e.g. Iron Axe or Iron Boots)
crafting.clear();
crafting.set(0, { id: Item.IronIngot, count: 1 });
crafting.set(2, { id: Item.IronIngot, count: 1 });
crafting.set(3, { id: Item.IronIngot, count: 1 });
crafting.set(5, { id: Item.IronIngot, count: 1 });
matched = crafting.match(true);
assert(matched?.id === 'iron_boots', 'Iron Boots match on 3x3 grid');

// Extra ingredients rejection
crafting.set(8, { id: Block.Dirt, count: 1 }); // invalid extra dirt block
assert(crafting.match(true) === null, 'Extra stray ingredient invalidates recipe matching');

// ── 3. SHIFT-CLICK / MAX CRAFTING ──
console.log('\n--- 3. Max Crafting / Shift-Click ---');
crafting.clear();
const testInv = new InventorySystem(false);
crafting.set(0, { id: Block.Wood, count: 5 }); // 5 logs -> 20 planks
const totalMade = crafting.craftAllToInventory(testInv, true);
assert(totalMade === 20, 'Max craft produced exact 20 planks');
assert(testInv.getSlot(0)?.count === 20, 'Planks deposited cleanly into inventory');
assert(crafting.get(0) === null, 'Crafting grid emptied after all logs consumed');

// ── 4. EQUIPMENT SYSTEM & SLOTS ──
console.log('\n--- 4. Equipment System Slots & Validation ---');
const equip = new EquipmentSystem();
assert(equip.stats.armorPoints === 0, 'Initial armor points is 0');

const helmet = ItemStackHelper.create(Item.IronHelmet, 1)!;
const chest = ItemStackHelper.create(Item.IronChestplate, 1)!;
const legs = ItemStackHelper.create(Item.IronLeggings, 1)!;
const boots = ItemStackHelper.create(Item.IronBoots, 1)!;

// Slot type validation
assert(equip.canEquip('HEAD', helmet), 'Can equip Iron Helmet in HEAD slot');
assert(!equip.canEquip('FEET', helmet), 'Cannot equip Iron Helmet in FEET slot');
assert(!equip.canEquip('CHEST', { id: Block.Stone, count: 1 }), 'Cannot equip non-armor item');

// Equip pieces
equip.equip('HEAD', helmet);
assert(equip.getSlot('HEAD')?.id === Item.IronHelmet, 'Helmet equipped');
assert(equip.stats.armorPoints === 2, 'Armor points updated to 2');

equip.equip('CHEST', chest);
equip.equip('LEGS', legs);
equip.equip('FEET', boots);
assert(equip.stats.armorPoints === 15, 'Full iron set yields 15 armor points (2 + 6 + 5 + 2)');

// Unequip & Swap
const prevChest = equip.unequip('CHEST');
assert(prevChest?.id === Item.IronChestplate, 'Unequip returned previously equipped chestplate');
assert(equip.getSlot('CHEST') === null, 'Chest slot is empty');
assert(equip.stats.armorPoints === 9, 'Armor points decreased to 9');

// ── 5. ARMOR DAMAGE CALCULATOR & PIPELINE ──
console.log('\n--- 5. Armor Damage Calculations & Integration ---');
// Base 10 damage vs 15 armor points
const calc1 = ArmorDamageCalculator.calculateDamage({
  baseDamage: 10,
  armorPoints: 15,
  toughness: 0,
});
assert(calc1.finalDamage < 10, `Armor reduced damage from 10 to ${calc1.finalDamage}`);
assert(calc1.damageReduced > 0, `Damage reduced: ${calc1.damageReduced}`);

// Starvation & Fall bypass armor
const starvCalc = ArmorDamageCalculator.calculateDamage({
  baseDamage: 4,
  armorPoints: 20,
  damageType: 'starvation',
});
assert(starvCalc.finalDamage === 4, 'Starvation damage completely bypasses armor');

const fallCalc = ArmorDamageCalculator.calculateDamage({
  baseDamage: 6,
  armorPoints: 20,
  damageType: 'fall',
});
assert(fallCalc.finalDamage === 6, 'Fall damage completely bypasses armor');

// Integration with PlayerDamage
equip.equip('CHEST', chest); // Full 15 armor again
const playerDamage = new PlayerDamage(20, equip);
playerDamage.processDamage({ amount: 10, source: 'mob' });
assert(playerDamage.health > 10, `Player with armor took reduced damage (Health: ${playerDamage.health}/20)`);

// Armor durability wear
const headBefore = equip.getSlot('HEAD')!.durability!;
equip.damageArmor(1, 'mob');
assert(equip.getSlot('HEAD')!.durability === headBefore - 1, 'Armor durability decremented after taking damage');

// Armor breakage at 0 durability
equip.getSlot('HEAD')!.durability = 1;
equip.damageArmor(1, 'mob');
assert(equip.getSlot('HEAD') === null, 'Armor broke and unequipped when durability reached 0');
assert(equip.stats.armorPoints === 13, 'Stats recalculated after armor break');

// ── 6. EQUIPMENT SERIALIZATION & DESERIALIZATION ──
console.log('\n--- 6. Equipment Serialization & Resilience ---');
const serializedEquip = equip.serialize();
assert(serializedEquip.CHEST?.id === Item.IronChestplate, 'Serialized CHEST slot');
assert(serializedEquip.HEAD === null, 'Serialized empty HEAD slot');

const restoredEquip = new EquipmentSystem();
restoredEquip.deserialize(serializedEquip);
assert(restoredEquip.getSlot('CHEST')?.id === Item.IronChestplate, 'Deserialized CHEST slot');
assert(restoredEquip.stats.armorPoints === 13, 'Restored stats match serialized state');

// Corrupt data resilience
restoredEquip.deserialize({
  HEAD: { id: Block.Dirt, count: 64 }, // invalid armor
  FEET: { id: Item.IronBoots, count: 1, durability: -10 },
});
assert(restoredEquip.getSlot('HEAD') === null, 'Corrupt item in HEAD slot rejected');

console.log(`\n========================================`);
console.log(`Summary: ${passed} passed, ${failed} failed.`);
console.log(`========================================\n`);

if (failed > 0) {
  process.exit(1);
}
