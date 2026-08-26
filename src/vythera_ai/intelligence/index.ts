/** Thin domain facades — all mutations go through VYTHERA tools / host. */

export { validateVoxelPayload, validatePatch } from '../tools/registerVytheraTools';

export class VytheraVoxelIntelligence {
  readonly name = 'VytheraVoxelIntelligence';
  describe(): string {
    return 'Sparse 32³ voxel generation/patching via create_voxel_asset / apply_voxel_patch tools.';
  }
}

export class VytheraBehaviorIntelligence {
  readonly name = 'VytheraBehaviorIntelligence';
  describe(): string {
    return 'Allowlisted behavior graphs → ModCommandBinder scripts via create_behavior.';
  }
}

export class VytheraAnimationIntelligence {
  readonly name = 'VytheraAnimationIntelligence';
  describe(): string {
    return 'Euler keyframes → quaternion ModKeyframes via create_animation.';
  }
}

export class VytheraSkinIntelligence {
  readonly name = 'VytheraSkinIntelligence';
  describe(): string {
    return 'Palette/material variants via apply_palette (deterministic engine-side).';
  }
}

export class VytheraWorldIntelligence {
  readonly name = 'VytheraWorldIntelligence';
  describe(): string {
    return 'Retrieves VYTHERA world-gen module knowledge; editing tools expand with terrain APIs.';
  }
}

export const vytheraVoxelIntel = new VytheraVoxelIntelligence();
export const vytheraBehaviorIntel = new VytheraBehaviorIntelligence();
export const vytheraAnimationIntel = new VytheraAnimationIntelligence();
export const vytheraSkinIntel = new VytheraSkinIntelligence();
export const vytheraWorldIntel = new VytheraWorldIntelligence();
