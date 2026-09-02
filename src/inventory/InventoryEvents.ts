import type { ItemStack } from './ItemStack';

export interface ItemAddedEvent {
  slot: number;
  stack: ItemStack;
}

export interface ItemRemovedEvent {
  slot: number;
  stack: ItemStack;
}

export interface ItemMovedEvent {
  fromSlot: number;
  toSlot: number;
  stack: ItemStack;
}

export interface ItemConsumedEvent {
  slot: number;
  itemId: number;
  amount: number;
}

export interface ItemDroppedEvent {
  stack: ItemStack;
  position: { x: number; y: number; z: number };
}

export interface ItemPickedUpEvent {
  stack: ItemStack;
}

export interface ItemBrokenEvent {
  slot: number;
  itemId: number;
}

export interface HotbarChangedEvent {
  previousSlot: number;
  selectedSlot: number;
  heldItem: ItemStack | null;
}

export interface HeldItemChangedEvent {
  heldItem: ItemStack | null;
}

export type InventoryEventMap = {
  itemAdded: ItemAddedEvent;
  itemRemoved: ItemRemovedEvent;
  itemMoved: ItemMovedEvent;
  itemConsumed: ItemConsumedEvent;
  itemDropped: ItemDroppedEvent;
  itemPickedUp: ItemPickedUpEvent;
  itemBroken: ItemBrokenEvent;
  hotbarChanged: HotbarChangedEvent;
  heldItemChanged: HeldItemChangedEvent;
};

export class InventoryEventEmitter {
  private listeners = new Map<keyof InventoryEventMap, Array<(e: any) => void>>();

  on<K extends keyof InventoryEventMap>(event: K, cb: (e: InventoryEventMap[K]) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(cb);
    return () => this.off(event, cb);
  }

  off<K extends keyof InventoryEventMap>(event: K, cb: (e: InventoryEventMap[K]) => void): void {
    const list = this.listeners.get(event);
    if (!list) return;
    this.listeners.set(event, list.filter((fn) => fn !== cb));
  }

  emit<K extends keyof InventoryEventMap>(event: K, data: InventoryEventMap[K]): void {
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
