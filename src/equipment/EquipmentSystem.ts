import type { EquipmentSlot } from './EquipmentSlot';
import { getArmorDefinition } from './EquipmentDefinition';
import { ItemStackHelper, type ItemStack } from '../inventory/ItemStack';
import { ArmorDamageCalculator } from './ArmorDamageCalculator';

export interface EquipmentStats {
  armorPoints: number;
  toughness: number;
  knockbackResistance: number;
}

export interface EquipmentChangedEvent {
  slot: EquipmentSlot;
  previous: ItemStack | null;
  current: ItemStack | null;
  stats: EquipmentStats;
}

export interface EquipmentDamagedEvent {
  slot: EquipmentSlot;
  durabilityRemaining: number;
  maxDurability: number;
}

export interface EquipmentBrokenEvent {
  slot: EquipmentSlot;
  itemId: number;
}

export type EquipmentEventMap = {
  equipmentChanged: EquipmentChangedEvent;
  equipmentDamaged: EquipmentDamagedEvent;
  equipmentBroken: EquipmentBrokenEvent;
};

export class EquipmentEventEmitter {
  private listeners = new Map<keyof EquipmentEventMap, Array<(e: any) => void>>();

  on<K extends keyof EquipmentEventMap>(event: K, cb: (e: EquipmentEventMap[K]) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(cb);
    return () => this.off(event, cb);
  }

  off<K extends keyof EquipmentEventMap>(event: K, cb: (e: EquipmentEventMap[K]) => void): void {
    const list = this.listeners.get(event);
    if (!list) return;
    this.listeners.set(event, list.filter((fn) => fn !== cb));
  }

  emit<K extends keyof EquipmentEventMap>(event: K, data: EquipmentEventMap[K]): void {
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

export class EquipmentSystem {
  readonly slots: Record<EquipmentSlot, ItemStack | null> = {
    HEAD: null,
    CHEST: null,
    LEGS: null,
    FEET: null,
  };

  readonly events = new EquipmentEventEmitter();
  private cachedStats: EquipmentStats = { armorPoints: 0, toughness: 0, knockbackResistance: 0 };

  constructor() {
    this.recalculateStats();
  }

  get stats(): EquipmentStats {
    return this.cachedStats;
  }

  getSlot(slot: EquipmentSlot): ItemStack | null {
    return this.slots[slot];
  }

  canEquip(slot: EquipmentSlot, stack: ItemStack | null): boolean {
    if (!stack) return true;
    const armorDef = getArmorDefinition(stack.id);
    if (!armorDef) return false;
    return armorDef.slot === slot;
  }

  equip(slot: EquipmentSlot, stack: ItemStack | null): ItemStack | null {
    if (stack && !this.canEquip(slot, stack)) {
      return stack; // Rejected, return incoming
    }

    const previous = this.slots[slot];
    this.slots[slot] = stack ? ItemStackHelper.clone(stack) : null;
    this.recalculateStats();

    this.events.emit('equipmentChanged', {
      slot,
      previous,
      current: this.slots[slot],
      stats: this.cachedStats,
    });

    return previous; // Return previously equipped item to be placed in inventory or swapped
  }

  unequip(slot: EquipmentSlot): ItemStack | null {
    return this.equip(slot, null);
  }

  damageArmor(amount = 1, damageType = 'physical'): void {
    // Only damageable by damage types that interact with armor
    if (damageType === 'starvation' || damageType === 'void' || damageType === 'fall') return;

    const slots: EquipmentSlot[] = ['HEAD', 'CHEST', 'LEGS', 'FEET'];
    for (const slot of slots) {
      const piece = this.slots[slot];
      if (!piece || piece.durability == null) continue;

      const broke = ItemStackHelper.damage(piece, amount);
      if (broke) {
        const itemId = piece.id;
        this.slots[slot] = null;
        this.recalculateStats();
        this.events.emit('equipmentBroken', { slot, itemId });
        this.events.emit('equipmentChanged', {
          slot,
          previous: piece,
          current: null,
          stats: this.cachedStats,
        });
      } else {
        this.events.emit('equipmentDamaged', {
          slot,
          durabilityRemaining: piece.durability,
          maxDurability: piece.maxDurability ?? 100,
        });
      }
    }
  }

  calculateDamage(baseDamage: number, damageType = 'physical'): number {
    return ArmorDamageCalculator.calculateDamage({
      baseDamage,
      armorPoints: this.cachedStats.armorPoints,
      toughness: this.cachedStats.toughness,
      damageType,
    }).finalDamage;
  }

  recalculateStats(): void {
    let totalArmor = 0;
    let totalToughness = 0;
    let totalKbRes = 0;

    const slots: EquipmentSlot[] = ['HEAD', 'CHEST', 'LEGS', 'FEET'];
    for (const slot of slots) {
      const piece = this.slots[slot];
      if (!piece) continue;
      const def = getArmorDefinition(piece.id);
      if (def) {
        totalArmor += def.armorPoints;
        totalToughness += def.toughness;
        totalKbRes += def.knockbackResistance;
      }
    }

    this.cachedStats = {
      armorPoints: totalArmor,
      toughness: totalToughness,
      knockbackResistance: totalKbRes,
    };
  }

  serialize(): Record<EquipmentSlot, ItemStack | null> {
    return {
      HEAD: ItemStackHelper.clone(this.slots.HEAD),
      CHEST: ItemStackHelper.clone(this.slots.CHEST),
      LEGS: ItemStackHelper.clone(this.slots.LEGS),
      FEET: ItemStackHelper.clone(this.slots.FEET),
    };
  }

  deserialize(data: any): boolean {
    if (!data || typeof data !== 'object') return false;

    const slots: EquipmentSlot[] = ['HEAD', 'CHEST', 'LEGS', 'FEET'];
    for (const slot of slots) {
      const piece = data[slot];
      if (
        piece &&
        typeof piece.id === 'number' &&
        typeof piece.count === 'number' &&
        this.canEquip(slot, piece)
      ) {
        this.slots[slot] = ItemStackHelper.clone(piece);
      } else {
        this.slots[slot] = null;
      }
    }

    this.recalculateStats();
    return true;
  }
}
