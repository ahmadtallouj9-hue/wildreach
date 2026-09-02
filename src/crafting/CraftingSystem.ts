import { RecipeRegistry } from './RecipeRegistry';
import type { RecipeDefinition } from './RecipeDefinition';
import { ItemStackHelper, type ItemStack } from '../inventory/ItemStack';
import type { InventorySystem } from '../inventory/InventorySystem';

export interface RecipeMatchedEvent {
  recipe: RecipeDefinition | null;
  result: ItemStack | null;
}

export interface CraftCompletedEvent {
  recipeId: string;
  result: ItemStack;
  countCrafted: number;
}

export interface CraftFailedEvent {
  reason: 'no_recipe' | 'insufficient_ingredients' | 'inventory_full';
}

export type CraftingEventMap = {
  recipeMatched: RecipeMatchedEvent;
  craftCompleted: CraftCompletedEvent;
  craftFailed: CraftFailedEvent;
};

export class CraftingEventEmitter {
  private listeners = new Map<keyof CraftingEventMap, Array<(e: any) => void>>();

  on<K extends keyof CraftingEventMap>(event: K, cb: (e: CraftingEventMap[K]) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(cb);
    return () => this.off(event, cb);
  }

  off<K extends keyof CraftingEventMap>(event: K, cb: (e: CraftingEventMap[K]) => void): void {
    const list = this.listeners.get(event);
    if (!list) return;
    this.listeners.set(event, list.filter((fn) => fn !== cb));
  }

  emit<K extends keyof CraftingEventMap>(event: K, data: CraftingEventMap[K]): void {
    const list = this.listeners.get(event);
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      list[i]!(data);
    }
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}

export class CraftingSystem {
  readonly cells: (ItemStack | null)[] = Array.from({ length: 9 }, () => null);
  readonly events = new CraftingEventEmitter();

  constructor(private recipeRegistry = RecipeRegistry.get()) {}

  get(index: number): ItemStack | null {
    return this.cells[index] ?? null;
  }

  set(index: number, stack: ItemStack | null): void {
    if (index < 0 || index >= 9) return;
    this.cells[index] = stack && stack.count > 0 ? ItemStackHelper.clone(stack) : null;
    this.onGridChange();
  }

  clear(): (ItemStack | null)[] {
    const items = [...this.cells];
    for (let i = 0; i < 9; i++) {
      this.cells[i] = null;
    }
    this.onGridChange();
    return items;
  }

  private onGridChange(): void {
    const res = this.peekResult(true);
    const rec = this.match(true);
    this.events.emit('recipeMatched', { recipe: rec, result: res });
  }

  match(is3x3 = true): RecipeDefinition | null {
    const inputIds = this.cells.map((c) => (c && c.count > 0 ? c.id : 0));
    const nonZeroCount = inputIds.filter((id) => id > 0).length;

    if (nonZeroCount === 0) return null;

    for (const recipe of this.recipeRegistry.getAll()) {
      if (!is3x3 && recipe.gridRequired === '3x3') continue;

      if (recipe.type === 'SHAPELESS') {
        if (this.matchShapeless(inputIds, recipe.ingredients)) {
          return recipe;
        }
      } else {
        if (this.matchShaped(inputIds, recipe.ingredients)) {
          return recipe;
        }
      }
    }

    return null;
  }

  peekResult(is3x3 = true): ItemStack | null {
    const recipe = this.match(is3x3);
    return recipe ? ItemStackHelper.clone(recipe.result) : null;
  }

  /**
   * Crafts once.
   * Atomically consumes exactly 1 item per ingredient cell.
   * Returns resulting ItemStack or null if matching failed.
   */
  craftOnce(is3x3 = true): ItemStack | null {
    const recipe = this.match(is3x3);
    if (!recipe) {
      this.events.emit('craftFailed', { reason: 'no_recipe' });
      return null;
    }

    // Atomic verify: all active ingredient cells must have count >= 1
    for (let i = 0; i < 9; i++) {
      const c = this.cells[i];
      if (c && c.count < 1) {
        this.events.emit('craftFailed', { reason: 'insufficient_ingredients' });
        return null;
      }
    }

    // Atomic consume
    for (let i = 0; i < 9; i++) {
      const c = this.cells[i];
      if (!c) continue;
      c.count -= 1;
      if (c.count <= 0) this.cells[i] = null;
    }

    const output = ItemStackHelper.clone(recipe.result);
    this.onGridChange();
    if (output) {
      this.events.emit('craftCompleted', {
        recipeId: recipe.id,
        result: output,
        countCrafted: output.count,
      });
    }
    return output;
  }

  /**
   * Max-craft / Shift-click craft directly into player inventory.
   * Crafts repeatedly until grid ingredients run out or inventory becomes full.
   */
  craftAllToInventory(inventory: InventorySystem, is3x3 = true): number {
    let totalCrafted = 0;
    while (true) {
      const peek = this.peekResult(is3x3);
      if (!peek) break;

      // Dry-run check if inventory can receive the item
      const cloned = ItemStackHelper.clone(peek)!;
      const leftover = inventory.add(cloned.id, cloned.count, {
        durability: cloned.durability,
        maxDurability: cloned.maxDurability,
      });

      if (leftover === peek.count) {
        // Inventory full, could not fit even partial
        this.events.emit('craftFailed', { reason: 'inventory_full' });
        break;
      }

      // If partial or full fit, consume actual grid ingredients
      for (let i = 0; i < 9; i++) {
        const c = this.cells[i];
        if (!c) continue;
        c.count -= 1;
        if (c.count <= 0) this.cells[i] = null;
      }

      totalCrafted += peek.count - leftover;
      this.onGridChange();

      if (leftover > 0) {
        break; // partially filled and inventory now full
      }
    }
    return totalCrafted;
  }

  private matchShapeless(gridIds: number[], ingredients: number[]): boolean {
    const present = gridIds.filter((id) => id > 0);
    if (present.length !== ingredients.length) return false;

    const remaining = [...ingredients];
    for (const id of present) {
      const idx = remaining.indexOf(id);
      if (idx < 0) return false;
      remaining.splice(idx, 1);
    }
    return remaining.length === 0;
  }

  private matchShaped(gridIds: number[], pattern: number[]): boolean {
    const gridNorm = this.normalize(gridIds);
    const patNorm = this.normalize(pattern);

    if (gridNorm.w !== patNorm.w || gridNorm.h !== patNorm.h) return false;

    // Direct match
    let matchDirect = true;
    for (let i = 0; i < 9; i++) {
      if (gridNorm.map[i] !== patNorm.map[i]) {
        matchDirect = false;
        break;
      }
    }
    if (matchDirect) return true;

    // Mirrored horizontally
    const mirMap = this.mirror(patNorm.map, patNorm.w, patNorm.h);
    for (let i = 0; i < 9; i++) {
      if (gridNorm.map[i] !== mirMap[i]) return false;
    }

    return true;
  }

  private normalize(ids: number[]): { map: number[]; w: number; h: number } {
    let minX = 3, minY = 3, maxX = -1, maxY = -1;
    for (let i = 0; i < 9; i++) {
      if (!ids[i]) continue;
      const x = i % 3;
      const y = Math.floor(i / 3);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    if (maxX < 0) return { map: Array(9).fill(0), w: 0, h: 0 };
    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    const map = Array(9).fill(0);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        map[y * 3 + x] = ids[(y + minY) * 3 + (x + minX)];
      }
    }
    return { map, w, h };
  }

  private mirror(map: number[], w: number, h: number): number[] {
    const out = Array(9).fill(0);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        out[y * 3 + x] = map[y * 3 + (w - 1 - x)];
      }
    }
    return out;
  }
}
