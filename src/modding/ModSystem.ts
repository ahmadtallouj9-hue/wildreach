/**
 * Dynamic Mod System Manager for VYTHERA.
 * Registers and handles custom blocks, items, recipes, textures, and runtime state.
 * Fully localStorage backed + safe data-driven execution.
 */

import type { ModBlockDef, ModItemDef, ModManifestJson, ModRecipeDef } from './ModSchema';
import { Block, BLOCK_COLORS } from '../world/blocks';
import { ITEM_NAMES, ITEM_KINDS, ITEM_COLORS, setCustomItemResolver, type CustomItemResolver } from '../player/items';
import { RECIPES, type Recipe } from '../player/Crafting';

const MODS_ENABLED_KEY = 'vythera.mods.enabled';
const MOD_DATA_PREFIX = 'vythera.mod.';

export const CUSTOM_BLOCK_OFFSET = 32; // Custom blocks IDs 32..99
export const CUSTOM_ITEM_OFFSET = 200;  // Custom items IDs 200..400

export class ModManager implements CustomItemResolver {
  private static instance: ModManager | null = null;

  private enabledModIds = new Set<string>();
  private loadedMods = new Map<string, ModManifestJson>();

  // Runtime lookup maps
  private blockIdToDef = new Map<number, { modId: string; def: ModBlockDef }>();
  private blockStringToNum = new Map<string, number>();

  private itemIdToDef = new Map<number, { modId: string; def: ModItemDef }>();
  private itemStringToNum = new Map<string, number>();

  // Custom block textures / faces: blockId -> array of 6 face textures/colors
  private customBlockTextures = new Map<number, string[]>();

  private nextBlockId = CUSTOM_BLOCK_OFFSET;
  private nextItemId = CUSTOM_ITEM_OFFSET;

  private constructor() {
    setCustomItemResolver(this);
    this.loadEnabledSet();
    this.loadAllInstalledMods();
  }

  static get(): ModManager {
    if (!ModManager.instance) {
      ModManager.instance = new ModManager();
    }
    return ModManager.instance;
  }

  // --- Storage & Loading ---

  private loadEnabledSet(): void {
    try {
      const raw = localStorage.getItem(MODS_ENABLED_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          this.enabledModIds = new Set(arr);
        }
      }
    } catch {
      this.enabledModIds = new Set();
    }
  }

  private saveEnabledSet(): void {
    localStorage.setItem(MODS_ENABLED_KEY, JSON.stringify([...this.enabledModIds]));
  }

  isModEnabled(modId: string): boolean {
    return this.enabledModIds.has(modId);
  }

  setModEnabled(modId: string, enabled: boolean): void {
    if (enabled) {
      this.enabledModIds.add(modId);
    } else {
      this.enabledModIds.delete(modId);
    }
    this.saveEnabledSet();
    this.rebuildRuntimeRegistrations();
  }

  saveMod(manifest: ModManifestJson): void {
    manifest.updatedAt = Date.now();
    this.loadedMods.set(manifest.id, manifest);
    localStorage.setItem(`${MOD_DATA_PREFIX}${manifest.id}`, JSON.stringify(manifest));
    this.rebuildRuntimeRegistrations();
  }

  getMod(modId: string): ModManifestJson | null {
    return this.loadedMods.get(modId) ?? null;
  }

  listMods(): ModManifestJson[] {
    return [...this.loadedMods.values()];
  }

  deleteMod(modId: string): void {
    this.loadedMods.delete(modId);
    this.enabledModIds.delete(modId);
    this.saveEnabledSet();
    localStorage.removeItem(`${MOD_DATA_PREFIX}${modId}`);
    this.rebuildRuntimeRegistrations();
  }

  loadAllInstalledMods(): void {
    this.loadedMods.clear();
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(MOD_DATA_PREFIX)) {
        try {
          const raw = localStorage.getItem(k);
          if (raw) {
            const manifest = JSON.parse(raw) as ModManifestJson;
            if (manifest && manifest.id) {
              this.loadedMods.set(manifest.id, manifest);
            }
          }
        } catch {
          /* ignore bad parse */
        }
      }
    }
    this.rebuildRuntimeRegistrations();
  }

  // --- Runtime Registration ---

  rebuildRuntimeRegistrations(): void {
    this.blockIdToDef.clear();
    this.blockStringToNum.clear();
    this.itemIdToDef.clear();
    this.itemStringToNum.clear();
    this.customBlockTextures.clear();

    this.nextBlockId = CUSTOM_BLOCK_OFFSET;
    this.nextItemId = CUSTOM_ITEM_OFFSET;

    // Register active mods
    for (const modId of this.enabledModIds) {
      const mod = this.loadedMods.get(modId);
      if (!mod) continue;

      // 1. Blocks
      if (mod.blocks) {
        for (const blk of mod.blocks) {
          if (this.nextBlockId >= 99) break; // Limit 67 custom blocks
          const numericId = this.nextBlockId++;
          this.blockIdToDef.set(numericId, { modId, def: blk });
          this.blockStringToNum.set(blk.id, numericId);
          this.blockStringToNum.set(`${modId}:${blk.id}`, numericId);

          // Register in system tables
          ITEM_NAMES[numericId] = blk.displayName || blk.id;
          ITEM_KINDS[numericId] = 'Mod Block';
          const col = blk.color || [0.8, 0.4, 0.7];
          BLOCK_COLORS[numericId] = col;
          ITEM_COLORS[numericId] = col;
        }
      }

      // 2. Items
      if (mod.items) {
        for (const itm of mod.items) {
          if (this.nextItemId >= 400) break;
          const numericId = this.nextItemId++;
          this.itemIdToDef.set(numericId, { modId, def: itm });
          this.itemStringToNum.set(itm.id, numericId);
          this.itemStringToNum.set(`${modId}:${itm.id}`, numericId);

          ITEM_NAMES[numericId] = itm.displayName || itm.id;
          ITEM_KINDS[numericId] = itm.category ? `Mod ${itm.category}` : 'Mod Item';
          const col = itm.color || [0.9, 0.6, 0.2];
          ITEM_COLORS[numericId] = col;
        }
      }

      // 3. Recipes
      if (mod.recipes) {
        for (const rec of mod.recipes) {
          const registered = this.convertRecipe(modId, rec);
          if (registered) {
            // Remove existing with same id if any
            const idx = RECIPES.findIndex((r) => r.id === registered.id);
            if (idx >= 0) RECIPES.splice(idx, 1);
            RECIPES.push(registered);
          }
        }
      }
    }
  }

  private convertRecipe(modId: string, def: ModRecipeDef): Recipe | null {
    const resultNumId = this.resolveIdentifier(def.result.id, modId);
    if (!resultNumId) return null;

    const patternArray = new Array(9).fill(0);
    if (def.type === 'crafting_shaped' && def.pattern && def.key) {
      const rows = def.pattern;
      for (let r = 0; r < Math.min(3, rows.length); r++) {
        const rowStr = rows[r];
        for (let c = 0; c < Math.min(3, rowStr.length); c++) {
          const char = rowStr[c];
          if (char && char !== ' ' && def.key[char]) {
            const num = this.resolveIdentifier(def.key[char]!, modId);
            patternArray[r * 3 + c] = num;
          }
        }
      }
    } else if (def.type === 'crafting_shapeless' && def.ingredients) {
      for (let i = 0; i < Math.min(9, def.ingredients.length); i++) {
        patternArray[i] = this.resolveIdentifier(def.ingredients[i]!, modId);
      }
    }

    return {
      id: `${modId}:${def.id}`,
      name: ITEM_NAMES[resultNumId] || def.id,
      pattern: patternArray,
      result: { id: resultNumId, count: def.result.count || 1 },
      hint: `[Mod] ${ITEM_NAMES[resultNumId] || def.id}`,
      gridRequired: def.grid === '3x3' ? '3x3' : undefined,
    };
  }

  resolveIdentifier(identifier: string, currentModId?: string): number {
    const id = identifier.trim().toLowerCase();

    // 1. Vanilla block name mapping
    if (id === 'wood' || id === 'oak_log' || id === 'log') return Block.Wood;
    if (id === 'planks' || id === 'oak_planks') return Block.Planks;
    if (id === 'stone') return Block.Stone;
    if (id === 'cobblestone' || id === 'cobble') return Block.Cobblestone;
    if (id === 'dirt') return Block.Dirt;
    if (id === 'grass' || id === 'grass_block') return Block.Grass;
    if (id === 'sand') return Block.Sand;
    if (id === 'crafting_table' || id === 'table') return Block.CraftingTable;
    if (id === 'stick') return 101; // Item.Stick
    if (id === 'coal') return 114;  // Item.Coal
    if (id === 'iron_ingot') return 115; // Item.IronIngot

    // 2. Direct numeric check
    const num = Number(id);
    if (!Number.isNaN(num) && num > 0) return num;

    // 3. Custom item / block
    if (this.itemStringToNum.has(id)) return this.itemStringToNum.get(id)!;
    if (this.blockStringToNum.has(id)) return this.blockStringToNum.get(id)!;

    if (currentModId) {
      const full = `${currentModId}:${id}`;
      if (this.itemStringToNum.has(full)) return this.itemStringToNum.get(full)!;
      if (this.blockStringToNum.has(full)) return this.blockStringToNum.get(full)!;
    }

    return 0;
  }

  isCustomBlock(blockId: number): boolean {
    return this.blockIdToDef.has(blockId);
  }

  getBlockDef(blockId: number): ModBlockDef | null {
    return this.blockIdToDef.get(blockId)?.def ?? null;
  }

  getItemDef(itemId: number): ModItemDef | null {
    return this.itemIdToDef.get(itemId)?.def ?? null;
  }

  getCustomBlockDrop(blockId: number): { itemId: number; count: number } {
    const def = this.getBlockDef(blockId);
    if (!def) return { itemId: blockId, count: 1 };
    if (def.dropItemId) {
      const resolved = this.resolveIdentifier(def.dropItemId);
      return { itemId: resolved || blockId, count: def.dropCount ?? 1 };
    }
    return { itemId: blockId, count: def.dropCount ?? 1 };
  }

  getCustomBlockHardness(blockId: number): number {
    const def = this.getBlockDef(blockId);
    return def?.hardness ?? 1.0;
  }

  getCustomItemMiningMultiplier(itemId: number, blockId: number): number {
    const itm = this.getItemDef(itemId);
    if (!itm || !itm.isTool) return 1.0;
    const blk = this.getBlockDef(blockId);

    // If block specifies a tool type and it matches
    if (blk?.toolType && itm.toolType === blk.toolType) {
      return itm.miningSpeed ?? 4.0;
    }

    // Default general tools
    if (itm.toolType === 'pickaxe' && (blockId === Block.Stone || blockId === Block.Cobblestone || blockId === Block.CoalOre || blockId === Block.IronOre)) {
      return itm.miningSpeed ?? 4.0;
    }
    if (itm.toolType === 'axe' && (blockId === Block.Wood || blockId === Block.Planks || blockId === Block.CraftingTable)) {
      return itm.miningSpeed ?? 4.0;
    }

    return 1.0;
  }

  getCustomItemAttackDamage(itemId: number): number {
    const itm = this.getItemDef(itemId);
    return itm?.attackDamage ?? 1;
  }

  getCustomItemAttackCooldown(itemId: number): number {
    const itm = this.getItemDef(itemId);
    return itm?.attackCooldown ?? 0.25;
  }

  isFood(id: number): boolean {
    const itm = this.getItemDef(id);
    return itm?.isFood ?? false;
  }

  foodValue(id: number): number {
    const itm = this.getItemDef(id);
    return itm?.hungerRestore ?? 2;
  }

  isTool(id: number): boolean {
    const itm = this.getItemDef(id);
    return itm?.isTool ?? false;
  }

  toolMaxDurability(id: number): number {
    const itm = this.getItemDef(id);
    return itm?.durability ?? 100;
  }

  toolMiningMultiplier(toolId: number, blockId: number): number {
    return this.getCustomItemMiningMultiplier(toolId, blockId);
  }

  toolMeleeDamage(toolId: number): number {
    return this.getCustomItemAttackDamage(toolId);
  }

  toolAttackCooldown(toolId: number): number {
    return this.getCustomItemAttackCooldown(toolId);
  }
}
