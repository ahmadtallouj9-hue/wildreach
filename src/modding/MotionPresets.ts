import * as THREE from 'three';
import type { PartPose } from './ModAnimation';
import type { ModPart, Quat } from './ModAsset';

export type MotionPresetId =
  | 'float'
  | 'spin'
  | 'wobble'
  | 'heartbeat'
  | 'pulse'
  | 'shake'
  | 'nod'
  | 'orbit';

export const MOTION_PRESET_OPTIONS: { id: MotionPresetId; label: string }[] = [
  { id: 'float', label: 'Float' },
  { id: 'spin', label: 'Spin' },
  { id: 'wobble', label: 'Wobble' },
  { id: 'heartbeat', label: 'Heartbeat' },
  { id: 'pulse', label: 'Pulse' },
  { id: 'shake', label: 'Shake' },
  { id: 'nod', label: 'Nod' },
  { id: 'orbit', label: 'Orbit' },
];

const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

function eulerFromQuat(q: Quat): { y: number; x: number; z: number } {
  _quat.set(q.x, q.y, q.z, q.w);
  _euler.setFromQuaternion(_quat, 'YXZ');
  return {
    y: (_euler.y * 180) / Math.PI,
    x: (_euler.x * 180) / Math.PI,
    z: (_euler.z * 180) / Math.PI,
  };
}

function quatFromEuler(yDeg: number, xDeg: number, zDeg: number): Quat {
  _euler.set(
    (xDeg * Math.PI) / 180,
    (yDeg * Math.PI) / 180,
    (zDeg * Math.PI) / 180,
    'YXZ',
  );
  _quat.setFromEuler(_euler);
  return { x: _quat.x, y: _quat.y, z: _quat.z, w: _quat.w };
}

/** Layer procedural idle motion on top of sampled keyframe pose. */
export function applyMotionPreset(pose: PartPose, part: ModPart, frame: number): PartPose {
  const preset = part.motionPreset;
  if (!preset) return pose;

  const e = eulerFromQuat(pose.rotation);
  const pos = { ...pose.position };
  const scale = pose.scale ? { ...pose.scale } : { x: 1, y: 1, z: 1 };

  switch (preset) {
    case 'float':
      return {
        position: { ...pos, y: pos.y + Math.sin(frame * 0.14) * 0.4 },
        rotation: pose.rotation,
        scale,
      };
    case 'spin':
      return {
        position: pos,
        rotation: quatFromEuler(e.y + frame * 2.8, e.x, e.z),
        scale,
      };
    case 'wobble': {
      const sway = Math.sin(frame * 0.22) * 9;
      return {
        position: pos,
        rotation: quatFromEuler(e.y, e.x + sway, e.z + sway * 0.45),
        scale,
      };
    }
    case 'heartbeat': {
      const phase = frame * 0.38;
      const pulse = Math.pow(Math.max(0, Math.sin(phase)), 2);
      const kick = Math.sin(phase * 2) * 5 * pulse;
      return {
        position: { ...pos, y: pos.y + pulse * 0.22 },
        rotation: quatFromEuler(e.y, e.x + kick, e.z - kick * 0.35),
        scale,
      };
    }
    case 'pulse': {
      const s = 1 + Math.sin(frame * 0.25) * 0.08;
      return {
        position: pos,
        rotation: pose.rotation,
        scale: { x: scale.x * s, y: scale.y * s, z: scale.z * s },
      };
    }
    case 'shake': {
      const n = Math.sin(frame * 1.7) * 0.12;
      return {
        position: { x: pos.x + n, y: pos.y, z: pos.z + n * 0.6 },
        rotation: quatFromEuler(e.y + n * 20, e.x, e.z),
        scale,
      };
    }
    case 'nod':
      return {
        position: pos,
        rotation: quatFromEuler(e.y, e.x + Math.sin(frame * 0.2) * 14, e.z),
        scale,
      };
    case 'orbit': {
      const a = frame * 0.12;
      return {
        position: {
          x: pos.x + Math.cos(a) * 0.55,
          y: pos.y,
          z: pos.z + Math.sin(a) * 0.55,
        },
        rotation: quatFromEuler(e.y + (a * 180) / Math.PI, e.x, e.z),
        scale,
      };
    }
    default:
      return pose;
  }
}
