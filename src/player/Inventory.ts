import { Block } from '../world/blocks';

export interface ItemStack {
  id: number;
  count: number;
}

export const STACK_MAX = 64;
export const INV_SIZE = 36;
export const HOTBAR_SIZE = 9;

export class Inventory {
  readonly slots: (ItemStack | null)[] = Array.from({ length: INV_SIZE }, () => null);
  selectedHotbar = 0;

  constructor() {
    this.setSlot(0, { id: Block.Dirt, count: 24 });
    this.setSlot(1, { id: Block.Stone, count: 16 });
    this.setSlot(2, { id: Block.Wood, count: 12 });
    this.setSlot(3, { id: Block.Sand, count: 8 });
    this.setSlot(4, { id: Block.Leaves, count: 8 });
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
        ? { id: stack.id, count: Math.min(STACK_MAX, stack.count) }
        : null;
  }

  add(id: number, count: number): number {
    if (id === Block.Air || count <= 0) return 0;
    let left = count;
    for (let i = 0; i < INV_SIZE && left > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id && s.count < STACK_MAX) {
        const take = Math.min(STACK_MAX - s.count, left);
        s.count += take;
        left -= take;
      }
    }
    for (let i = 0; i < INV_SIZE && left > 0; i++) {
      if (!this.slots[i]) {
        const take = Math.min(STACK_MAX, left);
        this.slots[i] = { id, count: take };
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
}
