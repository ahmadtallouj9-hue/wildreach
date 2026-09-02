export interface ArmorCalculationInput {
  baseDamage: number;
  armorPoints: number;
  toughness?: number;
  damageType?: string;
}

export class ArmorDamageCalculator {
  /**
   * Deterministic Minecraft Java Edition standard armor reduction formula:
   * damageReduction = clamp(armor - damage / (2 + toughness / 4), armor / 5, 20) / 25
   * finalDamage = baseDamage * (1 - damageReduction)
   */
  static calculateDamage(input: ArmorCalculationInput): {
    finalDamage: number;
    damageReduced: number;
    reductionPercentage: number;
  } {
    const { baseDamage, armorPoints, toughness = 0, damageType = 'physical' } = input;

    // Environmental/Starvation/Void damage bypasses standard armor
    if (damageType === 'starvation' || damageType === 'void' || damageType === 'fall') {
      return {
        finalDamage: baseDamage,
        damageReduced: 0,
        reductionPercentage: 0,
      };
    }

    if (armorPoints <= 0 || baseDamage <= 0) {
      return {
        finalDamage: baseDamage,
        damageReduced: 0,
        reductionPercentage: 0,
      };
    }

    const effectiveArmor = Math.max(
      armorPoints / 5,
      armorPoints - baseDamage / (2 + toughness / 4),
    );
    const clampedArmor = Math.min(20, Math.max(0, effectiveArmor));
    const reductionFactor = clampedArmor / 25; // max 80% reduction at 20 armor points

    const reducedAmount = baseDamage * reductionFactor;
    const finalDamage = Math.max(1, Math.round(baseDamage - reducedAmount));

    return {
      finalDamage,
      damageReduced: baseDamage - finalDamage,
      reductionPercentage: reductionFactor * 100,
    };
  }
}
