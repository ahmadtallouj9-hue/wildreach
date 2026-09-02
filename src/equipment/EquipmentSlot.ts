export type EquipmentSlot = 'HEAD' | 'CHEST' | 'LEGS' | 'FEET';

export const EQUIPMENT_SLOTS: readonly EquipmentSlot[] = ['HEAD', 'CHEST', 'LEGS', 'FEET'] as const;

export interface EquipmentSlotInfo {
  slot: EquipmentSlot;
  name: string;
  index: number;
}
