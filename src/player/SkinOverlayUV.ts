/** Shared Minecraft 64×64 second-layer (overlay) UV regions. */

import * as THREE from 'three';
import { BOX_FACES, SKIN_SIZE, type SkinFace } from './SkinAtlas';

export type OverlayPart = 'bodyOL' | 'armROL' | 'armLOL' | 'legROL' | 'legLOL';

export const OVERLAY_PART_UV: Record<
  OverlayPart,
  Record<SkinFace, { x: number; y: number; w: number; h: number }>
> = {
  bodyOL: {
    top: { x: 20, y: 32, w: 8, h: 4 },
    bottom: { x: 28, y: 32, w: 8, h: 4 },
    right: { x: 16, y: 36, w: 4, h: 12 },
    front: { x: 20, y: 36, w: 8, h: 12 },
    left: { x: 28, y: 36, w: 4, h: 12 },
    back: { x: 32, y: 36, w: 8, h: 12 },
  },
  armROL: {
    top: { x: 44, y: 32, w: 4, h: 4 },
    bottom: { x: 48, y: 32, w: 4, h: 4 },
    right: { x: 40, y: 36, w: 4, h: 12 },
    front: { x: 44, y: 36, w: 4, h: 12 },
    left: { x: 48, y: 36, w: 4, h: 12 },
    back: { x: 52, y: 36, w: 4, h: 12 },
  },
  armLOL: {
    top: { x: 52, y: 48, w: 4, h: 4 },
    bottom: { x: 56, y: 48, w: 4, h: 4 },
    right: { x: 48, y: 52, w: 4, h: 12 },
    front: { x: 52, y: 52, w: 4, h: 12 },
    left: { x: 56, y: 52, w: 4, h: 12 },
    back: { x: 60, y: 52, w: 4, h: 12 },
  },
  legROL: {
    top: { x: 4, y: 32, w: 4, h: 4 },
    bottom: { x: 8, y: 32, w: 4, h: 4 },
    right: { x: 0, y: 36, w: 4, h: 12 },
    front: { x: 4, y: 36, w: 4, h: 12 },
    left: { x: 8, y: 36, w: 4, h: 12 },
    back: { x: 12, y: 36, w: 4, h: 12 },
  },
  legLOL: {
    top: { x: 4, y: 48, w: 4, h: 4 },
    bottom: { x: 8, y: 48, w: 4, h: 4 },
    right: { x: 0, y: 52, w: 4, h: 12 },
    front: { x: 4, y: 52, w: 4, h: 12 },
    left: { x: 8, y: 52, w: 4, h: 12 },
    back: { x: 12, y: 52, w: 4, h: 12 },
  },
};

/** World-space shell thickness for overlay cuboids (~0.25 voxel at MC scale). */
export const OVERLAY_SHELL = 0.025;

export function overlayShellScale(w: number, h: number, d: number): THREE.Vector3 {
  return new THREE.Vector3(
    1 + (2 * OVERLAY_SHELL) / w,
    1 + (2 * OVERLAY_SHELL) / h,
    1 + (2 * OVERLAY_SHELL) / d,
  );
}

export function overlayLayerHasPixels(data: Uint8ClampedArray): boolean {
  let n = 0;
  for (const part of Object.keys(OVERLAY_PART_UV) as OverlayPart[]) {
    for (const face of BOX_FACES) {
      const r = OVERLAY_PART_UV[part][face];
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          const i = (y * SKIN_SIZE + x) * 4;
          if (data[i + 3]! > 16 && data[i]! + data[i + 1]! + data[i + 2]! > 0) n++;
        }
      }
    }
  }
  return n > 8;
}
