import * as THREE from 'three';
import { PlayerConfig } from './PlayerConfig';
import { Difficulty } from './PlayerState';
import type { PlayerDamage } from './PlayerDamage';
import { isFood, foodValue } from './items';

export class PlayerHunger {
  hunger: number = PlayerConfig.survival.maxHunger;
  saturation: number = 5.0;
  exhaustion: number = 0.0;
  difficulty: Difficulty = Difficulty.NORMAL;

  private regenTickCounter = 0;
  private starvationTickCounter = 0;
  private sprintDistanceAccumulator = 0;
  private swimDistanceAccumulator = 0;

  constructor(initialHunger?: number) {
    if (initialHunger != null) {
      this.hunger = THREE.MathUtils.clamp(initialHunger, 0, PlayerConfig.survival.maxHunger);
    }
  }

  get canSprint(): boolean {
    return this.hunger >= PlayerConfig.survival.sprintMinHunger;
  }

  addExhaustion(amount: number): void {
    if (amount <= 0 || this.difficulty === Difficulty.PEACEFUL) return;
    this.exhaustion += amount;

    // Convert exhaustion to saturation/hunger
    while (this.exhaustion >= PlayerConfig.survival.exhaustionThreshold) {
      this.exhaustion -= PlayerConfig.survival.exhaustionThreshold;
      if (this.saturation > 0) {
        this.saturation = Math.max(0, this.saturation - 1);
      } else if (this.hunger > 0) {
        this.hunger = Math.max(0, this.hunger - 1);
      }
    }

    this.saturation = Math.min(this.saturation, this.hunger);
  }

  recordSprintDistance(distance: number): void {
    if (distance <= 0) return;
    this.sprintDistanceAccumulator += distance;
    if (this.sprintDistanceAccumulator >= 1.0) {
      const blocks = Math.floor(this.sprintDistanceAccumulator);
      this.addExhaustion(blocks * PlayerConfig.survival.exhaustionSprintPerBlock);
      this.sprintDistanceAccumulator -= blocks;
    }
  }

  recordSwimDistance(distance: number): void {
    if (distance <= 0) return;
    this.swimDistanceAccumulator += distance;
    if (this.swimDistanceAccumulator >= 1.0) {
      const blocks = Math.floor(this.swimDistanceAccumulator);
      this.addExhaustion(blocks * PlayerConfig.survival.exhaustionSwimPerBlock);
      this.swimDistanceAccumulator -= blocks;
    }
  }

  recordJump(isSprintJump: boolean): void {
    this.addExhaustion(
      isSprintJump
        ? PlayerConfig.survival.exhaustionSprintJump
        : PlayerConfig.survival.exhaustionJump,
    );
  }

  recordAttack(): void {
    this.addExhaustion(PlayerConfig.survival.exhaustionAttack);
  }

  recordHurt(): void {
    this.addExhaustion(PlayerConfig.survival.exhaustionHurt);
  }

  canEat(foodId: number, currentHealth: number, maxHealth: number): boolean {
    if (!isFood(foodId)) return false;
    return this.hunger < PlayerConfig.survival.maxHunger || currentHealth < maxHealth;
  }

  eat(foodId: number, damageSystem?: PlayerDamage): boolean {
    const val = foodValue(foodId);
    if (val <= 0) return false;

    this.hunger = Math.min(PlayerConfig.survival.maxHunger, this.hunger + val);
    this.saturation = Math.min(this.hunger, this.saturation + val * 0.6);

    // Mini-heal for high quality food
    if (val >= 5 && damageSystem && damageSystem.health < damageSystem.maxHealth) {
      damageSystem.heal(2);
    }

    return true;
  }

  /**
   * Fixed 20 Hz simulation tick for hunger regeneration and starvation.
   */
  tick(damageSystem: PlayerDamage): void {
    if (damageSystem.isDead) return;

    // In peaceful, hunger automatically refills
    if (this.difficulty === Difficulty.PEACEFUL) {
      this.hunger = PlayerConfig.survival.maxHunger;
      this.saturation = PlayerConfig.survival.maxSaturation;
      if (damageSystem.health < damageSystem.maxHealth) {
        this.regenTickCounter++;
        if (this.regenTickCounter >= 20) {
          this.regenTickCounter = 0;
          damageSystem.heal(1);
        }
      }
      return;
    }

    // 1. Natural Regeneration (hunger >= 18)
    if (this.hunger >= PlayerConfig.survival.naturalRegenMinHunger && damageSystem.health < damageSystem.maxHealth) {
      this.regenTickCounter++;
      if (this.regenTickCounter >= PlayerConfig.survival.regenIntervalTicks) {
        this.regenTickCounter = 0;
        damageSystem.heal(1);
        this.addExhaustion(PlayerConfig.survival.exhaustionPerHealthRegen);
      }
    } else {
      this.regenTickCounter = 0;
    }

    // 2. Starvation (hunger === 0)
    if (this.hunger === 0) {
      this.starvationTickCounter++;
      if (this.starvationTickCounter >= PlayerConfig.survival.starvationIntervalTicks) {
        this.starvationTickCounter = 0;

        let shouldStarve = false;
        if (this.difficulty === Difficulty.HARD) {
          shouldStarve = true; // Lethal
        } else if (this.difficulty === Difficulty.NORMAL && damageSystem.health > 1) {
          shouldStarve = true; // Down to 1 HP
        } else if (this.difficulty === Difficulty.EASY && damageSystem.health > 10) {
          shouldStarve = true; // Down to 10 HP
        }

        if (shouldStarve) {
          damageSystem.processDamage({
            amount: 1,
            source: 'starvation',
            bypassCooldown: true,
          });
        }
      }
    } else {
      this.starvationTickCounter = 0;
    }
  }

  respawn(): void {
    this.hunger = PlayerConfig.survival.maxHunger;
    this.saturation = 5.0;
    this.exhaustion = 0.0;
    this.regenTickCounter = 0;
    this.starvationTickCounter = 0;
    this.sprintDistanceAccumulator = 0;
    this.swimDistanceAccumulator = 0;
  }
}
