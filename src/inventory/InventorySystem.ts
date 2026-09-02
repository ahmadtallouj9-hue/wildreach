import { Block } from '../world/blocks';
import { ItemRegistry } from './ItemDefinition';
import { ItemStackHelper, type ItemStack } from './ItemStack';
import { InventoryEventEmitter } from './InventoryEvents';

export const MAIN_INVENTORY_SIZE = 27;
export const HOTBAR_SIZE = 9;
export const TOTAL_INVENTORY_SIZE = MAIN_INVENTORY_SIZE + HOTBAR_SIZE; // 36 slots
export const DEFAULT_STACK_MAX = 64;

export interface SerializedSlot {
  slot: number;
  id: number;
  count: number;
  durability?: number;
  maxDurability?: number;
  meta?: Record<string, string | number | boolean>;
}

export interface SerializedInventory {
  slots: SerializedSlot[];
  selectedHotbar: number;
}

export class InventorySystem {
  readonly slots: (ItemStack | null)[] = Array.from({ length: TOTAL_INVENTORY_SIZE }, () => null);
  readonly events = new InventoryEventEmitter();
  private selectedHotbarSlot = 0;

  constructor(setupDefaults = true) {
    if (setupDefaults) {
      this.initDefaultInventory();
    }
  }

  get selectedHotbar(): number {
    return this.selectedHotbarSlot;
  }

  get selected(): ItemStack | null {
    return this.slots[this.selectedHotbarSlot];
  }

  get heldItem(): ItemStack | null {
    return this.selected;
  }

  setHotbar(index: number): void {
    const prev = this.selectedHotbarSlot;
    this.selectedHotbarSlot = ((index % HOTBAR_SIZE) + HOTBAR_SIZE) % HOTBAR_SIZE;
    if (prev !== this.selectedHotbarSlot) {
      this.events.emit('hotbarChanged', {
        previousSlot: prev,
        selectedSlot: this.selectedHotbarSlot,
        heldItem: this.heldItem,
      });
      this.events.emit('heldItemChanged', {
        heldItem: this.heldItem,
      });
    }
  }

  cycleHotbar(dir: number): void {
    this.setHotbar(this.selectedHotbarSlot + dir);
  }

  getSlot(i: number): ItemStack | null {
    if (i < 0 || i >= TOTAL_INVENTORY_SIZE) return null;
    return this.slots[i];
  }

  setSlot(i: number, stack: ItemStack | null): void {
    if (i < 0 || i >= TOTAL_INVENTORY_SIZE) return;
    const sanitized = ItemStackHelper.clone(stack);
    this.slots[i] = sanitized;

    if (sanitized) {
      this.events.emit('itemAdded', { slot: i, stack: sanitized });
    } else {
      this.events.emit('itemRemoved', { slot: i, stack: { id: 0, count: 0 } });
    }

    if (i === this.selectedHotbarSlot) {
      this.events.emit('heldItemChanged', { heldItem: this.heldItem });
    }
  }

  /**
   * Deterministic insertion algorithm:
   * 1. Merges with compatible existing stacks.
   * 2. Places in empty slots.
   * 3. Returns any leftover count (0 if completely inserted).
   */
  add(id: number, count: number, extra?: Partial<ItemStack>): number {
    if (id <= 0 || count <= 0) return 0;
    const def = ItemRegistry.get().get(id);
    const maxStack = def?.maxStackSize ?? DEFAULT_STACK_MAX;
    const maxDur = extra?.maxDurability ?? def?.durability;

    const incoming: ItemStack = {
      id,
      count,
      durability: extra?.durability ?? maxDur,
      maxDurability: maxDur,
      meta: extra?.meta ? { ...extra.meta } : undefined,
    };

    let remaining = count;

    // Step 1: Merge into compatible partially filled stacks
    for (let i = 0; i < TOTAL_INVENTORY_SIZE && remaining > 0; i++) {
      const target = this.slots[i];
      if (target && ItemStackHelper.canMerge(target, incoming)) {
        const room = maxStack - target.count;
        const take = Math.min(room, remaining);
        target.count += take;
        remaining -= take;
        incoming.count = remaining;
      }
    }

    // Step 2: Create new stacks in empty slots
    for (let i = 0; i < TOTAL_INVENTORY_SIZE && remaining > 0; i++) {
      if (!this.slots[i]) {
        const take = Math.min(maxStack, remaining);
        const newStack: ItemStack = {
          id,
          count: take,
          durability: incoming.durability,
          maxDurability: incoming.maxDurability,
          meta: incoming.meta ? { ...incoming.meta } : undefined,
        };
        this.slots[i] = newStack;
        remaining -= take;
        incoming.count = remaining;
        this.events.emit('itemAdded', { slot: i, stack: newStack });
      }
    }

    if (this.slots[this.selectedHotbarSlot]) {
      this.events.emit('heldItemChanged', { heldItem: this.heldItem });
    }

    return remaining;
  }

  /**
   * Consumes `n` items from the selected hotbar slot.
   */
  consumeSelected(n = 1): boolean {
    const s = this.slots[this.selectedHotbarSlot];
    if (!s || s.count < n) return false;
    s.count -= n;
    this.events.emit('itemConsumed', {
      slot: this.selectedHotbarSlot,
      itemId: s.id,
      amount: n,
    });

    if (s.count <= 0) {
      this.slots[this.selectedHotbarSlot] = null;
      this.events.emit('itemRemoved', { slot: this.selectedHotbarSlot, stack: s });
    }

    this.events.emit('heldItemChanged', { heldItem: this.heldItem });
    return true;
  }

  /**
   * Applies durability damage to the selected tool. Returns true if the tool broke.
   */
  damageSelected(amount = 1): boolean {
    const s = this.slots[this.selectedHotbarSlot];
    if (!s || s.durability == null) return false;

    const broke = ItemStackHelper.damage(s, amount);
    if (broke) {
      const brokeId = s.id;
      this.slots[this.selectedHotbarSlot] = null;
      this.events.emit('itemBroken', {
        slot: this.selectedHotbarSlot,
        itemId: brokeId,
      });
      this.events.emit('itemRemoved', { slot: this.selectedHotbarSlot, stack: s });
      this.events.emit('heldItemChanged', { heldItem: this.heldItem });
      return true;
    }
    return false;
  }

  clear(): void {
    for (let i = 0; i < TOTAL_INVENTORY_SIZE; i++) {
      this.slots[i] = null;
    }
    this.events.emit('heldItemChanged', { heldItem: null });
  }

  serialize(): SerializedInventory {
    const serializedSlots: SerializedSlot[] = [];
    for (let i = 0; i < TOTAL_INVENTORY_SIZE; i++) {
      const s = this.slots[i];
      if (s && s.count > 0) {
        serializedSlots.push({
          slot: i,
          id: s.id,
          count: s.count,
          durability: s.durability,
          maxDurability: s.maxDurability,
          meta: s.meta ? { ...s.meta } : undefined,
        });
      }
    }
    return {
      slots: serializedSlots,
      selectedHotbar: this.selectedHotbarSlot,
    };
  }

  deserialize(data: any): boolean {
    if (!data || typeof data !== 'object') return false;

    this.clear();
    if (typeof data.selectedHotbar === 'number') {
      this.setHotbar(data.selectedHotbar);
    }

    if (Array.isArray(data.slots)) {
      for (const item of data.slots) {
        if (
          item &&
          typeof item.slot === 'number' &&
          item.slot >= 0 &&
          item.slot < TOTAL_INVENTORY_SIZE &&
          typeof item.id === 'number' &&
          typeof item.count === 'number' &&
          item.count > 0
        ) {
          const def = ItemRegistry.get().get(item.id);
          const maxStack = def?.maxStackSize ?? DEFAULT_STACK_MAX;
          const count = Math.min(maxStack, Math.max(1, item.count));
          const maxDur = def?.durability ?? item.maxDurability;
          const dur = item.durability != null ? Math.max(0, Math.min(maxDur ?? 100, item.durability)) : undefined;

          this.slots[item.slot] = {
            id: item.id,
            count,
            durability: dur,
            maxDurability: maxDur,
            meta: item.meta && typeof item.meta === 'object' ? { ...item.meta } : undefined,
          };
        }
      }
    }

    this.events.emit('heldItemChanged', { heldItem: this.heldItem });
    return true;
  }

  private initDefaultInventory(): void {
    this.setSlot(0, { id: Block.Dirt, count: 24 });
    this.setSlot(1, { id: Block.Stone, count: 16 });
    this.setSlot(2, { id: Block.Wood, count: 12 });
    this.setSlot(3, { id: Block.Sand, count: 8 });
    this.setSlot(4, { id: Block.Torch, count: 16 });
    this.setSlot(5, { id: Block.Gravel, count: 8 });
    this.setSlot(6, { id: Block.Water, count: 16 });
    this.setSlot(7, { id: Block.Ice, count: 4 });
  }
}
