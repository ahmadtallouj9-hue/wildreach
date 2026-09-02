import {
  InventorySystem,
  HOTBAR_SIZE,
  TOTAL_INVENTORY_SIZE as INV_SIZE,
  DEFAULT_STACK_MAX as STACK_MAX,
} from '../inventory/InventorySystem';
import type { ItemStack } from '../inventory/ItemStack';

export {
  HOTBAR_SIZE,
  INV_SIZE,
  STACK_MAX,
  type ItemStack,
};

export class Inventory extends InventorySystem {
  constructor() {
    super(true);
  }
}
