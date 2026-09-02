import type { ItemStack } from '../inventory/ItemStack';

export type RecipeType = 'SHAPED' | 'SHAPELESS';

export interface RecipeDefinition {
  id: string;
  name: string;
  type: RecipeType;
  /**
   * For SHAPED: 9 numbers representing 3x3 grid (row-major: 0..8), 0 for empty.
   * For SHAPELESS: list of ingredient item IDs required.
   */
  ingredients: number[];
  result: ItemStack;
  count?: number;
  hint?: string;
  gridRequired?: '2x2' | '3x3';
}
