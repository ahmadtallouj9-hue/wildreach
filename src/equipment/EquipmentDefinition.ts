import { Item } from '../player/items';
import type { EquipmentSlot } from './EquipmentSlot';

export interface ArmorDefinition {
  itemId: number;
  displayName: string;
  slot: EquipmentSlot;
  armorPoints: number;
  toughness: number;
  knockbackResistance: number;
  maxDurability: number;
}

export const ARMOR_DEFINITIONS: Record<number, ArmorDefinition> = {
  [Item.IronHelmet]: {
    itemId: Item.IronHelmet,
    displayName: 'Iron Helmet',
    slot: 'HEAD',
    armorPoints: 2,
    toughness: 0,
    knockbackResistance: 0,
    maxDurability: 165,
  },
  [Item.IronChestplate]: {
    itemId: Item.IronChestplate,
    displayName: 'Iron Chestplate',
    slot: 'CHEST',
    armorPoints: 6,
    toughness: 0,
    knockbackResistance: 0,
    maxDurability: 240,
  },
  [Item.IronLeggings]: {
    itemId: Item.IronLeggings,
    displayName: 'Iron Leggings',
    slot: 'LEGS',
    armorPoints: 5,
    toughness: 0,
    knockbackResistance: 0,
    maxDurability: 225,
  },
  [Item.IronBoots]: {
    itemId: Item.IronBoots,
    displayName: 'Iron Boots',
    slot: 'FEET',
    armorPoints: 2,
    toughness: 0,
    knockbackResistance: 0,
    maxDurability: 195,
  },
};

export function getArmorDefinition(itemId: number): ArmorDefinition | undefined {
  return ARMOR_DEFINITIONS[itemId];
}
