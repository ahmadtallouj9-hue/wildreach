import { Block } from '../world/blocks';

export interface ItemStack {
  id: number;
  count: number;
  /** Tool wear; undefined = non-durable block stack. */
  durability?: number;
  maxDurability?: number;
  /** NBT-style dynamic metadata. */
  meta?: Record<string, string | number | boolean>;
}

export const STACK_MAX = 64;
export const INV_SIZE = 36;
export const HOTBAR_SIZE = 9;

function sameStack(a: ItemStack, b: ItemStack): boolean {
  if (a.id !== b.id) return false;
  if ((a.durability ?? -1) !== (b.durability ?? -1)) return false;
  if ((a.maxDurability ?? -1) !== (b.maxDurability ?? -1)) return false;
  const am = a.meta ?? {};
  const bm = b.meta ?? {};
  const keys = new Set([...Object.keys(am), ...Object.keys(bm)]);
  for (const k of keys) if (am[k] !== bm[k]) return false;
  return true;
}

export class Inventory {
  readonly slots: (ItemStack | null)[] = Array.from({ length: INV_SIZE }, () => null);
  selectedHotbar = 0;

  constructor() {
    this.setSlot(0, { id: Block.Dirt, count: 24 });
    this.setSlot(1, { id: Block.Stone, count: 16 });
    this.setSlot(2, { id: Block.Wood, count: 12 });
    this.setSlot(3, { id: Block.Sand, count: 8 });
    this.setSlot(4, { id: Block.Torch, count: 16 });
    this.setSlot(5, { id: Block.Gravel, count: 8 });
    this.setSlot(6, { id: Block.Water, count: 16 });
    this.setSlot(7, { id: Block.Ice, count: 4 });
  }

  get selected(): ItemStack | null {
    return this.slots[this.selectedHotbar];
  }

  setHotbar(index: number): void {
    this.selectedHotbar = ((index % HOTBAR_SIZE) + HOTBAR_SIZE) % HOTBAR_SIZE;
  }

  cycleHotbar(dir: number): void {
    this.setHotbar(this.selectedHotbar + dir);
  }

  setSlot(i: number, stack: ItemStack | null): void {
    if (i < 0 || i >= INV_SIZE) return;
    this.slots[i] =
      stack && stack.count > 0
        ? {
            id: stack.id,
            count: Math.min(STACK_MAX, stack.count),
            durability: stack.durability,
            maxDurability: stack.maxDurability,
            meta: stack.meta ? { ...stack.meta } : undefined,
          }
        : null;
  }

  add(id: number, count: number, extra?: Partial<ItemStack>): number {
    if (id === Block.Air || count <= 0) return 0;
    const proto: ItemStack = {
      id,
      count: 1,
      durability: extra?.durability,
      maxDurability: extra?.maxDurability,
      meta: extra?.meta,
    };
    let left = count;
    for (let i = 0; i < INV_SIZE && left > 0; i++) {
      const s = this.slots[i];
      if (s && sameStack(s, proto) && s.count < STACK_MAX) {
        const take = Math.min(STACK_MAX - s.count, left);
        s.count += take;
        left -= take;
      }
    }
    for (let i = 0; i < INV_SIZE && left > 0; i++) {
      if (!this.slots[i]) {
        const take = Math.min(STACK_MAX, left);
        this.slots[i] = {
          id,
          count: take,
          durability: extra?.durability,
          maxDurability: extra?.maxDurability,
          meta: extra?.meta ? { ...extra.meta } : undefined,
        };
        left -= take;
      }
    }
    return left;
  }

  consumeSelected(n = 1): boolean {
    const s = this.slots[this.selectedHotbar];
    if (!s || s.count < n) return false;
    s.count -= n;
    if (s.count <= 0) this.slots[this.selectedHotbar] = null;
    return true;
  }

  /** Reduce durability on selected tool; breaks when depleted. */
  damageSelected(amount = 1): boolean {
    const s = this.slots[this.selectedHotbar];
    if (!s || s.durability == null) return false;
    s.durability -= amount;
    if (s.durability <= 0) {
      this.slots[this.selectedHotbar] = null;
      return true;
    }
    return false;
  }
}
