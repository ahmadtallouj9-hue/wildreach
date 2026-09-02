import * as THREE from 'three';
import type { MobManager } from '../mobs/MobManager';
import type { Mob } from '../mobs/Mob';

export interface AttackHitResult {
  hit: boolean;
  entity: Mob | null;
  hitPosition: THREE.Vector3 | null;
  distance: number;
  direction: THREE.Vector3 | null;
}

/**
 * Performs a camera-relative raycast against entities/mobs in range.
 */
export function raycastAttackTarget(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  range: number,
  mobManager?: MobManager,
): AttackHitResult {
  if (!mobManager || mobManager.mobs.length === 0) {
    return {
      hit: false,
      entity: null,
      hitPosition: null,
      distance: Infinity,
      direction: null,
    };
  }

  const normDir = direction.clone().normalize();
  const hitMob = mobManager.raycastMob(origin, normDir, range);

  if (hitMob) {
    const dist = origin.distanceTo(hitMob.position);
    return {
      hit: true,
      entity: hitMob,
      hitPosition: hitMob.position.clone(),
      distance: dist,
      direction: normDir,
    };
  }

  return {
    hit: false,
    entity: null,
    hitPosition: null,
    distance: Infinity,
    direction: normDir,
  };
}
