/**
 * In-game / headless skeletal animation driver.
 *
 * Typical game-loop wiring:
 *
 * ```ts
 * const skeleton = buildVoxelSkeleton(asset.parts);
 * const player = new AnimationPlayer({
 *   onSample: (poses) => {
 *     const worlds = evaluateWorldMatrices(skeleton, poses);
 *     // upload worlds to GPU / apply to THREE meshes
 *   },
 * });
 * player.setParts(asset.parts);
 * player.setClips(ensureAssetClips(asset));
 * player.play('walk');
 *
 * function update(dtMs: number) {
 *   player.update(dtMs);
 * }
 * ```
 */
import { AnimationPlayer } from './AnimationPlayer';
import type { ModAsset } from './ModAsset';
import { ensureAssetClips, findClip } from './ModClip';
import {
  buildVoxelSkeleton,
  evaluateWorldMatrices,
  type VoxelSkeleton,
} from './VoxelSkeleton';
import type { PartPose } from './ModAnimation';
import type * as THREE from 'three';

export class ModSkeletalAnimator {
  readonly player = new AnimationPlayer();
  private skeleton: VoxelSkeleton;
  private asset: ModAsset;
  private lastWorlds = new Map<string, THREE.Matrix4>();

  constructor(asset: ModAsset) {
    this.asset = asset;
    this.skeleton = buildVoxelSkeleton(asset.parts);
    this.player.setParts(asset.parts);
    this.player.setClips(ensureAssetClips(asset));
  }

  reload(asset: ModAsset): void {
    this.asset = asset;
    this.skeleton = buildVoxelSkeleton(asset.parts);
    this.player.setParts(asset.parts);
    this.player.setClips(ensureAssetClips(asset));
  }

  getSkeleton(): VoxelSkeleton {
    return this.skeleton;
  }

  play(clipName: string): boolean {
    return this.player.play(clipName);
  }

  stop(): void {
    this.player.stop();
  }

  /** Advance playback and return world matrices per bone id. */
  update(dtMs: number): Map<string, THREE.Matrix4> {
    const poses = this.player.update(dtMs);
    this.lastWorlds = evaluateWorldMatrices(this.skeleton, poses);
    return this.lastWorlds;
  }

  sample(): { poses: Map<string, PartPose>; worlds: Map<string, THREE.Matrix4> } {
    const poses = this.player.sample();
    const worlds = evaluateWorldMatrices(this.skeleton, poses);
    this.lastWorlds = worlds;
    return { poses, worlds };
  }

  hasClip(name: string): boolean {
    return Boolean(findClip(ensureAssetClips(this.asset), name));
  }
}
