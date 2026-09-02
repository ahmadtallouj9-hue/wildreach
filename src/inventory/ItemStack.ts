import { ItemRegistry, type ItemDefinition } from './ItemDefinition';

export interface ItemStack {
  id: number;
  count: number;
  durability?: number;
  maxDurability?: number;
  meta?: Record<string, string | number | boolean>;
}

export class ItemStackHelper {
  static create(id: number, count = 1, extra?: Partial<ItemStack>): ItemStack | null {
    if (id <= 0 || count <= 0) return null;
    const def = ItemRegistry.get().get(id);
    const maxStack = def?.maxStackSize ?? 64;
    const maxDur = extra?.maxDurability ?? def?.durability;

    return {
      id,
      count: Math.min(count, maxStack),
      durability: extra?.durability ?? maxDur,
      maxDurability: maxDur,
      meta: extra?.meta ? { ...extra.meta } : undefined,
    };
  }

  static clone(stack: ItemStack | null): ItemStack | null {
    if (!stack || stack.count <= 0) return null;
    return {
      id: stack.id,
      count: stack.count,
      durability: stack.durability,
      maxDurability: stack.maxDurability,
      meta: stack.meta ? { ...stack.meta } : undefined,
    };
  }

  static canMerge(a: ItemStack | null, b: ItemStack | null): boolean {
    if (!a || !b) return false;
    if (a.id !== b.id) return false;

    // Damageable tools with different durabilities cannot stack
    if (a.durability != null || b.durability != null) {
      if (a.durability !== b.durability) return false;
      if (a.maxDurability !== b.maxDurability) return false;
    }

    const am = a.meta ?? {};
    const bm = b.meta ?? {};
    const keys = new Set([...Object.keys(am), ...Object.keys(bm)]);
    for (const k of keys) {
      if (am[k] !== bm[k]) return false;
    }

    const def = ItemRegistry.get().get(a.id);
    const maxStack = def?.maxStackSize ?? 64;
    return a.count < maxStack;
  }

  static merge(target: ItemStack, incoming: ItemStack): number {
    if (!this.canMerge(target, incoming)) return incoming.count;
    const def = ItemRegistry.get().get(target.id);
    const maxStack = def?.maxStackSize ?? 64;
    const room = maxStack - target.count;
    const amountToTransfer = Math.min(room, incoming.count);

    target.count += amountToTransfer;
    incoming.count -= amountToTransfer;
    return incoming.count;
  }

  static split(stack: ItemStack, amount: number): ItemStack | null {
    if (amount <= 0 || stack.count <= 0) return null;
    const take = Math.min(amount, stack.count);
    stack.count -= take;
    return {
      id: stack.id,
      count: take,
      durability: stack.durability,
      maxDurability: stack.maxDurability,
      meta: stack.meta ? { ...stack.meta } : undefined,
    };
  }

  static damage(stack: ItemStack, amount = 1): boolean {
    if (stack.durability == null) return false;
    stack.durability = Math.max(0, stack.durability - amount);
    return stack.durability <= 0; // returns true if item broke
  }

  static getDefinition(stack: ItemStack | null): ItemDefinition | undefined {
    if (!stack) return undefined;
    return ItemRegistry.get().get(stack.id);
  }
}
