import * as THREE from 'three';
import {
  applyEaseType,
  DEFAULT_EASE_TYPE,
  EASE_BEZIER_PRESETS,
  KEYFRAME_EASE,
  normalizeEaseCurve,
  resolveEaseType,
  type EaseType,
} from './Easing';
import { applyMotionPreset } from './MotionPresets';
import { identityQuat, unitScale, type ModKeyframe, type ModPart, type Quat, type Vec3 } from './ModAsset';
import type { ModAnimationClip } from './ModClip';
import { timeToFrame } from './ModClip';

export interface PartPose {
  position: Vec3;
  rotation: Quat;
  scale?: Vec3;
}

const _lerpA = new THREE.Vector3();
const _lerpB = new THREE.Vector3();
const _slerpA = new THREE.Quaternion();
const _slerpB = new THREE.Quaternion();

export {
  applyEaseType,
  DEFAULT_EASE_TYPE,
  EASE_BEZIER_PRESETS as EASE_PRESETS,
  KEYFRAME_EASE,
  normalizeEaseCurve as normalizeEase,
  resolveEaseType,
  type EaseType,
};

export function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  _lerpA.set(a.x, a.y, a.z);
  _lerpB.set(b.x, b.y, b.z);
  _lerpA.lerp(_lerpB, t);
  return { x: _lerpA.x, y: _lerpA.y, z: _lerpA.z };
}

export function slerpQuat(a: Quat, b: Quat, t: number): Quat {
  _slerpA.set(a.x, a.y, a.z, a.w);
  _slerpB.set(b.x, b.y, b.z, b.w);
  _slerpA.slerp(_slerpB, t);
  return { x: _slerpA.x, y: _slerpA.y, z: _slerpA.z, w: _slerpA.w };
}

export function quatFromEulerY(degrees: number): Quat {
  const half = (degrees * Math.PI) / 360;
  return { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
}

export function eulerYFromQuat(q: Quat): number {
  const siny = 2 * (q.w * q.y + q.x * q.z);
  const cosy = 1 - 2 * (q.y * q.y + q.x * q.x);
  return (Math.atan2(siny, cosy) * 180) / Math.PI;
}

export function maxKeyframeFrame(keyframes: ModKeyframe[]): number {
  let max = 0;
  for (const kf of keyframes) max = Math.max(max, kf.frame);
  return max;
}

/** Largest keyframe frame strictly before the given frame (0 if none). */
export function previousKeyframeFrame(keyframes: ModKeyframe[], frame: number): number {
  let prev = 0;
  for (const kf of keyframes) {
    if (kf.frame < frame) prev = Math.max(prev, kf.frame);
  }
  return prev;
}

/** Sample pose for one part at a timeline frame (hold before first, after last). */
export function samplePartPose(
  partId: string,
  keyframes: ModKeyframe[],
  frame: number,
): PartPose {
  const mine = keyframes
    .filter((k) => k.partId === partId)
    .sort((a, b) => a.frame - b.frame);
  const bindScale = unitScale();
  if (!mine.length) {
    return { position: { x: 0, y: 0, z: 0 }, rotation: identityQuat(), scale: { ...bindScale } };
  }
  const scaleOf = (k: ModKeyframe): Vec3 => (k.scale ? { ...k.scale } : { ...bindScale });
  if (frame <= mine[0]!.frame) {
    const k = mine[0]!;
    return { position: { ...k.position }, rotation: { ...k.rotation }, scale: scaleOf(k) };
  }
  const last = mine[mine.length - 1]!;
  if (frame >= last.frame) {
    return { position: { ...last.position }, rotation: { ...last.rotation }, scale: scaleOf(last) };
  }
  for (let i = 0; i < mine.length - 1; i++) {
    const a = mine[i]!;
    const b = mine[i + 1]!;
    if (frame >= a.frame && frame <= b.frame) {
      const span = b.frame - a.frame || 1;
      const linear = (frame - a.frame) / span;
      const t = applyEaseType(a.easeType, linear, a.ease);
      return {
        position: lerpVec3(a.position, b.position, t),
        rotation: slerpQuat(a.rotation, b.rotation, t),
        scale: lerpVec3(scaleOf(a), scaleOf(b), t),
      };
    }
  }
  return { position: { ...last.position }, rotation: { ...last.rotation }, scale: scaleOf(last) };
}

export function upsertKeyframe(keyframes: ModKeyframe[], next: ModKeyframe): ModKeyframe[] {
  const out = keyframes.filter((k) => !(k.partId === next.partId && k.frame === next.frame));
  out.push(next);
  out.sort((a, b) => a.frame - b.frame || a.partId.localeCompare(b.partId));
  return out;
}

export function quatFromEulerYXZ(yDeg: number, xDeg: number, zDeg: number): Quat {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const cy = Math.cos(toRad(yDeg) * 0.5);
  const sy = Math.sin(toRad(yDeg) * 0.5);
  const cx = Math.cos(toRad(xDeg) * 0.5);
  const sx = Math.sin(toRad(xDeg) * 0.5);
  const cz = Math.cos(toRad(zDeg) * 0.5);
  const sz = Math.sin(toRad(zDeg) * 0.5);
  return {
    w: cy * cx * cz + sy * sx * sz,
    x: cy * sx * cz + sy * cx * sz,
    y: sy * cx * cz - cy * sx * sz,
    z: cy * cx * sz - sy * sx * cz,
  };
}

export function eulerYXZFromQuat(q: Quat): { y: number; x: number; z: number } {
  const sinx = 2 * (q.w * q.x + q.y * q.z);
  const cosx = 1 - 2 * (q.x * q.x + q.y * q.y);
  const x = (Math.atan2(sinx, cosx) * 180) / Math.PI;
  const siny = 2 * (q.w * q.y - q.z * q.x);
  const cosy = 1 - 2 * (q.y * q.y + q.z * q.z);
  const y = (Math.atan2(siny, cosy) * 180) / Math.PI;
  const sinz = 2 * (q.w * q.z + q.x * q.y);
  const cosz = 1 - 2 * (q.x * q.x + q.z * q.z);
  const z = (Math.atan2(sinz, cosz) * 180) / Math.PI;
  return { y, x, z };
}

/** Sample poses for every part at a timeline frame (includes motion presets). */
export function sampleAllPartPoses(
  parts: ModPart[],
  keyframes: ModKeyframe[],
  frame: number,
): Map<string, PartPose> {
  const out = new Map<string, PartPose>();
  for (const part of parts) {
    const base = samplePartPose(part.id, keyframes, frame);
    out.set(part.id, applyMotionPreset(base, part, frame));
  }
  return out;
}

/** Sample a named clip at time in seconds (Blockbench / AnimationPlayer path). */
export function sampleClipPoses(
  parts: ModPart[],
  clip: ModAnimationClip,
  timeSec: number,
): Map<string, PartPose> {
  const frame = timeToFrame(timeSec, clip.fps);
  return sampleAllPartPoses(parts, clip.keyframes, frame);
}
