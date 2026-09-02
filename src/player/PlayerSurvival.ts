import { PlayerDamage } from './PlayerDamage';
import { PlayerHunger } from './PlayerHunger';
import { Difficulty, type DamageSource } from './PlayerState';
import { isFood } from './items';
import type { EquipmentSystem } from '../equipment/EquipmentSystem';

export interface SurvivalSnapshot {
  health: number;
  maxHealth: number;
  hunger: number;
  maxHunger: number;
  saturation: number;
  exhaustion: number;
  isDead: boolean;
  hurtFlash: number;
}

export class PlayerSurvival {
  readonly damageSystem: PlayerDamage;
  readonly hungerSystem: PlayerHunger;

  constructor(initial?: { health?: number; hunger?: number }, equipment?: EquipmentSystem) {
    this.damageSystem = new PlayerDamage(initial?.health, equipment);
    this.hungerSystem = new PlayerHunger(initial?.hunger);
  }

  get health(): number {
    return this.damageSystem.health;
  }
  set health(v: number) {
    this.damageSystem.setHealth(v);
  }

  get maxHealth(): number {
    return this.damageSystem.maxHealth;
  }

  get hunger(): number {
    return this.hungerSystem.hunger;
  }
  set hunger(v: number) {
    this.hungerSystem.hunger = v;
  }

  get maxHunger(): number {
    return 20;
  }

  get saturation(): number {
    return this.hungerSystem.saturation;
  }

  get exhaustion(): number {
    return this.hungerSystem.exhaustion;
  }

  get isDead(): boolean {
    return this.damageSystem.isDead;
  }

  get hurtFlash(): number {
    return this.damageSystem.hurtFlash;
  }

  get difficulty(): Difficulty {
    return this.damageSystem.difficulty;
  }
  set difficulty(d: Difficulty) {
    this.damageSystem.difficulty = d;
    this.hungerSystem.difficulty = d;
  }

  onDamage(cb: (amount: number, source: string) => void): () => void {
    return this.damageSystem.onDamage(cb);
  }

  onDeath(cb: () => void): () => void {
    return this.damageSystem.onDeath(cb);
  }

  damage(amount: number, source: DamageSource | string = 'damage', ignoreIFrames = false): boolean {
    return this.damageSystem.processDamage({
      amount,
      source,
      bypassCooldown: ignoreIFrames,
    });
  }

  heal(amount: number): void {
    this.damageSystem.heal(amount);
  }

  canEat(foodId: number): boolean {
    if (this.isDead || !isFood(foodId)) return false;
    return this.hungerSystem.canEat(foodId, this.damageSystem.health, this.damageSystem.maxHealth);
  }

  eat(foodId: number): boolean {
    if (!this.canEat(foodId)) return false;
    return this.hungerSystem.eat(foodId, this.damageSystem);
  }

  respawn(): void {
    this.damageSystem.respawn();
    this.hungerSystem.respawn();
  }

  /**
   * Deterministic 20 Hz simulation tick.
   */
  tick(): void {
    this.damageSystem.tick();
    this.hungerSystem.tick(this.damageSystem);
  }

  /**
   * Render frame update for visual effects (e.g. hurt flash).
   */
  updateFrame(dt: number): void {
    this.damageSystem.updateFrame(dt);
  }

  /**
   * Backward-compatible update call for fluid lava/drown damage checks.
   */
  update(
    dt: number,
    state: {
      onGround: boolean;
      posY: number;
      isMoving: boolean;
      isSprinting: boolean;
      inLava: boolean;
      isSubmerged: boolean;
    },
  ): void {
    this.updateFrame(dt);

    if (state.inLava) {
      this.damage(4, 'lava', true);
    }
  }

  getSnapshot(): SurvivalSnapshot {
    return {
      health: this.health,
      maxHealth: this.maxHealth,
      hunger: this.hunger,
      maxHunger: this.maxHunger,
      saturation: this.saturation,
      exhaustion: this.exhaustion,
      isDead: this.isDead,
      hurtFlash: this.hurtFlash,
    };
  }
}
