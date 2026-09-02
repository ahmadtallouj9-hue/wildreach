import * as THREE from 'three';
import { PlayerConfig } from './PlayerConfig';
import { Difficulty, type DamageEvent } from './PlayerState';
import type { EquipmentSystem } from '../equipment/EquipmentSystem';

export class PlayerDamage {
  health: number = PlayerConfig.survival.maxHealth;
  maxHealth: number = PlayerConfig.survival.maxHealth;
  isDead: boolean = false;
  difficulty: Difficulty = Difficulty.NORMAL;
  equipment?: EquipmentSystem;

  private immunityTicksRemaining = 0;
  private hurtFlashTimer = 0;

  private onDamageCallbacks: Array<(amount: number, source: string) => void> = [];
  private onDeathCallbacks: Array<() => void> = [];

  constructor(initialHealth?: number, equipment?: EquipmentSystem) {
    if (initialHealth != null) {
      this.health = THREE.MathUtils.clamp(initialHealth, 0, this.maxHealth);
    }
    this.equipment = equipment;
  }

  get hurtFlash(): number {
    return Math.max(0, this.hurtFlashTimer / PlayerConfig.damage.hurtFlashDuration);
  }

  get isInvulnerable(): boolean {
    return this.immunityTicksRemaining > 0;
  }

  get immunityTicks(): number {
    return this.immunityTicksRemaining;
  }

  onDamage(cb: (amount: number, source: string) => void): () => void {
    this.onDamageCallbacks.push(cb);
    return () => {
      this.onDamageCallbacks = this.onDamageCallbacks.filter((c) => c !== cb);
    };
  }

  onDeath(cb: () => void): () => void {
    this.onDeathCallbacks.push(cb);
    return () => {
      this.onDeathCallbacks = this.onDeathCallbacks.filter((c) => c !== cb);
    };
  }

  /**
   * Process a damage event through the full damage pipeline.
   * Returns true if damage was actually dealt.
   */
  processDamage(event: DamageEvent, playerPos?: THREE.Vector3, playerVel?: THREE.Vector3): boolean {
    if (this.isDead || event.amount <= 0) return false;

    // Peaceful mode ignores mob/starvation damage
    if (this.difficulty === Difficulty.PEACEFUL && (event.source === 'mob' || event.source === 'starvation')) {
      return false;
    }

    if (!event.bypassCooldown && this.immunityTicksRemaining > 0) {
      return false;
    }

    let finalDamage = event.amount;

    // Apply difficulty modifiers if applicable
    if (this.difficulty === Difficulty.EASY && event.source === 'mob') {
      finalDamage = Math.max(1, Math.round(finalDamage * 0.75));
    } else if (this.difficulty === Difficulty.HARD && event.source === 'mob') {
      finalDamage = Math.round(finalDamage * 1.5);
    }

    // Apply armor reduction & durability wear through EquipmentSystem
    if (this.equipment) {
      const source = String(event.source ?? 'physical');
      finalDamage = this.equipment.calculateDamage(finalDamage, source);
      this.equipment.damageArmor(1, source);
    }

    this.health = Math.max(0, this.health - finalDamage);
    this.immunityTicksRemaining = PlayerConfig.damage.immunityTicks;
    this.hurtFlashTimer = PlayerConfig.damage.hurtFlashDuration;

    // Apply knockback
    if (playerVel && (event.knockback ?? 0) > 0) {
      const kb = event.knockback ?? 0.3;
      let kbDir = new THREE.Vector3();

      if (event.direction) {
        kbDir.copy(event.direction).normalize();
      } else if (event.attackerPos && playerPos) {
        kbDir.subVectors(playerPos, event.attackerPos);
        kbDir.y = 0;
        if (kbDir.lengthSq() > 0.001) {
          kbDir.normalize();
        } else {
          kbDir.set(0, 0, 1);
        }
      }

      playerVel.x += kbDir.x * kb;
      playerVel.z += kbDir.z * kb;
      playerVel.y = Math.min(playerVel.y + 0.35, 0.5);
    }

    // Callbacks
    for (const cb of this.onDamageCallbacks) {
      cb(finalDamage, String(event.source));
    }

    if (this.health <= 0) {
      this.die();
    }

    return true;
  }

  heal(amount: number): void {
    if (this.isDead || amount <= 0) return;
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  setHealth(val: number): void {
    this.health = THREE.MathUtils.clamp(val, 0, this.maxHealth);
    if (this.health <= 0 && !this.isDead) {
      this.die();
    }
  }

  /**
   * Fixed tick update for damage timers.
   */
  tick(): void {
    if (this.immunityTicksRemaining > 0) {
      this.immunityTicksRemaining--;
    }
  }

  /**
   * Render frame update for visual effects like hurt flash.
   */
  updateFrame(dt: number): void {
    if (this.hurtFlashTimer > 0) {
      this.hurtFlashTimer = Math.max(0, this.hurtFlashTimer - dt);
    }
  }

  respawn(): void {
    this.isDead = false;
    this.health = this.maxHealth;
    this.immunityTicksRemaining = 0;
    this.hurtFlashTimer = 0;
  }

  private die(): void {
    if (this.isDead) return;
    this.isDead = true;
    this.health = 0;
    for (const cb of this.onDeathCallbacks) {
      cb();
    }
  }
}
