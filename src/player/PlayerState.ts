import * as THREE from 'three';

export type MovementState =
  | 'idle'
  | 'walking'
  | 'sprinting'
  | 'sneaking'
  | 'jumping'
  | 'falling'
  | 'swimming'
  | 'climbing'
  | 'crawling'
  | 'dead';

export enum Difficulty {
  PEACEFUL = 'peaceful',
  EASY = 'easy',
  NORMAL = 'normal',
  HARD = 'hard',
}

export type DamageSource =
  | 'player'
  | 'mob'
  | 'fall'
  | 'fire'
  | 'drowning'
  | 'lava'
  | 'starvation'
  | 'environment'
  | 'projectile'
  | 'other';

export interface DamageEvent {
  amount: number;
  source: DamageSource | string;
  attackerPos?: THREE.Vector3;
  direction?: THREE.Vector3;
  knockback?: number;
  bypassCooldown?: boolean;
}

export interface PlayerLandedEvent {
  fallDistance: number;
  landingVelocityY: number;
  surfaceBlock: number;
  wasSprinting: boolean;
  damageTaken: number;
}

export interface PlayerTransform {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  yaw: number;
  pitch: number;
}

export interface PlayerSimulationState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  yaw: number;
  pitch: number;
  grounded: boolean;
  movementState: MovementState;
  sprinting: boolean;
  sneaking: boolean;
  swimming: boolean;
  fallDistance: number;
  health: number;
  maxHealth: number;
  hunger: number;
  saturation: number;
  exhaustion: number;
  damageCooldown: number;
  hurtFlash: number;
}

export function lerpTransform(
  prevPos: THREE.Vector3,
  currPos: THREE.Vector3,
  alpha: number,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  return out.lerpVectors(prevPos, currPos, THREE.MathUtils.clamp(alpha, 0, 1));
}
