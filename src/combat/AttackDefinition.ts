import { Item } from '../player/items';
import { TICK_RATE } from '../player/PlayerConfig';

export interface AttackDefinition {
  baseDamage: number;
  knockback: number;
  verticalKnockback: number;
  range: number;
  cooldownSeconds: number;
  cooldownTicks: number;
}

export const WEAPON_ATTACKS: Record<number, AttackDefinition> = {
  0: {
    // Bare fist
    baseDamage: 1,
    knockback: 0.35,
    verticalKnockback: 0.25,
    range: 3.5,
    cooldownSeconds: 0.5,
    cooldownTicks: Math.round(0.5 * TICK_RATE),
  },
  [Item.WoodenSword]: {
    baseDamage: 4,
    knockback: 0.45,
    verticalKnockback: 0.28,
    range: 3.5,
    cooldownSeconds: 0.4,
    cooldownTicks: Math.round(0.4 * TICK_RATE),
  },
  [Item.StoneSword]: {
    baseDamage: 6,
    knockback: 0.5,
    verticalKnockback: 0.3,
    range: 3.5,
    cooldownSeconds: 0.4,
    cooldownTicks: Math.round(0.4 * TICK_RATE),
  },
  [Item.WoodenAxe]: {
    baseDamage: 3,
    knockback: 0.4,
    verticalKnockback: 0.25,
    range: 3.5,
    cooldownSeconds: 0.55,
    cooldownTicks: Math.round(0.55 * TICK_RATE),
  },
  [Item.StoneAxe]: {
    baseDamage: 5,
    knockback: 0.45,
    verticalKnockback: 0.28,
    range: 3.5,
    cooldownSeconds: 0.55,
    cooldownTicks: Math.round(0.55 * TICK_RATE),
  },
  [Item.WoodenPickaxe]: {
    baseDamage: 2,
    knockback: 0.35,
    verticalKnockback: 0.25,
    range: 3.5,
    cooldownSeconds: 0.5,
    cooldownTicks: Math.round(0.5 * TICK_RATE),
  },
  [Item.StonePickaxe]: {
    baseDamage: 3,
    knockback: 0.38,
    verticalKnockback: 0.25,
    range: 3.5,
    cooldownSeconds: 0.5,
    cooldownTicks: Math.round(0.5 * TICK_RATE),
  },
};

export function getAttackDefinition(toolId: number): AttackDefinition {
  if (WEAPON_ATTACKS[toolId]) {
    return WEAPON_ATTACKS[toolId];
  }
  return {
    baseDamage: 1,
    knockback: 0.35,
    verticalKnockback: 0.25,
    range: 3.5,
    cooldownSeconds: 0.5,
    cooldownTicks: Math.round(0.5 * TICK_RATE),
  };
}
