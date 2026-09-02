import * as THREE from 'three';
import { getAttackDefinition } from './AttackDefinition';
import { raycastAttackTarget, type AttackHitResult } from './AttackTargeting';
import { CombatEventEmitter } from './CombatEvents';
import { PlayerConfig } from '../player/PlayerConfig';
import type { MobManager } from '../mobs/MobManager';

export class CombatSystem {
  readonly events = new CombatEventEmitter();
  private cooldownTicks = 0;
  private maxCooldownTicks = 1;

  constructor(private mobManager?: MobManager) {}

  setMobManager(mobManager: MobManager): void {
    this.mobManager = mobManager;
  }

  get isReady(): boolean {
    return this.cooldownTicks <= 0;
  }

  get cooldownProgress(): number {
    if (this.maxCooldownTicks <= 0) return 1.0;
    return Math.max(0, Math.min(1.0, 1.0 - this.cooldownTicks / this.maxCooldownTicks));
  }

  get remainingTicks(): number {
    return this.cooldownTicks;
  }

  /**
   * Deterministic 20 Hz fixed tick update.
   */
  tick(): void {
    if (this.cooldownTicks > 0) {
      this.cooldownTicks--;
    }
  }

  /**
   * Continuous render frame update (smooth countdown for visual display).
   */
  updateFrame(_dt: number): void {
    // Cooldown is authoritative on tick, but frame update can be used if needed
  }

  /**
   * Attempts an attack towards target direction with held tool.
   * Returns AttackHitResult.
   */
  executeAttack(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    toolId: number,
    isGrounded = true,
    velY = 0,
    isDead = false,
  ): AttackHitResult {
    if (isDead) {
      return { hit: false, entity: null, hitPosition: null, distance: Infinity, direction: null };
    }

    const attackDef = getAttackDefinition(toolId);
    this.maxCooldownTicks = Math.max(1, attackDef.cooldownTicks);
    this.cooldownTicks = this.maxCooldownTicks;

    // Critical hit check: Falling downward while not grounded (Minecraft Java style)
    const isCritical = !isGrounded && velY < -0.05;
    const baseDamage = attackDef.baseDamage;
    const finalDamage = isCritical ? Math.round(baseDamage * PlayerConfig.combat.criticalMultiplier) : baseDamage;

    this.events.emit('swung', {
      toolId,
      isCritical,
      direction: direction.clone(),
    });

    const hitResult = raycastAttackTarget(origin, direction, attackDef.range, this.mobManager);

    if (hitResult.hit && hitResult.entity) {
      const mob = hitResult.entity;
      const kbDir = direction.clone().setY(attackDef.verticalKnockback).normalize();
      const kbVector = kbDir.multiplyScalar(attackDef.knockback);

      mob.takeDamage(finalDamage, kbVector);

      this.events.emit('hit', {
        entityId: mob.id,
        entityType: mob.type,
        damage: finalDamage,
        knockback: attackDef.knockback,
        toolId,
        isCritical,
        hitPosition: hitResult.hitPosition ?? mob.position.clone(),
      });
    } else {
      this.events.emit('missed', {
        toolId,
        direction: direction.clone(),
      });
    }

    return hitResult;
  }
}
