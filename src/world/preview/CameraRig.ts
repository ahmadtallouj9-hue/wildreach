/**
 * Deterministic camera presets and free-look controls for the terrain lab.
 *
 * Presets derive only from the seed, so every resolution is judged from a
 * byte-identical viewpoint.
 */
import * as THREE from 'three';
import { TerrainField } from './TerrainField';


export type ViewName = 'panorama' | 'hilltop' | 'ground';

export interface Pose {
  eye: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

export interface RegionInfo {
  origin: { x: number; z: number };
  peak: THREE.Vector3;
}

/**
 * Locate a 512x512 window containing real landforms rather than open ocean.
 * Deterministic for a given seed.
 */
export function findRegion(field: TerrainField, regionBlocks: number): RegionInfo {
  const sea = field.seaLevel;
  const SCAN = 6144;
  const step = 64;
  const n = SCAN / step;
  const h = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) h[j * n + i] = field.heightAt(i * step, j * step);
  }

  const win = regionBlocks / step;
  let best = { score: -Infinity, x: 0, z: 0 };
  for (let j = 0; j + win < n; j++) {
    for (let i = 0; i + win < n; i++) {
      let land = 0;
      let max = -Infinity;
      let min = Infinity;
      let sum = 0;
      let count = 0;
      for (let b = 0; b < win; b++) {
        for (let a = 0; a < win; a++) {
          const v = h[(j + b) * n + i + a]!;
          if (v > sea + 1) land++;
          if (v > max) max = v;
          if (v < min) min = v;
          sum += v;
          count++;
        }
      }
      const landFrac = land / count;
      if (landFrac < 0.55 || landFrac > 0.97) continue;
      const score = (max - min) * 1.6 + (max - sea) * 1.2 + (sum / count - sea) * 0.3;
      if (score > best.score) best = { score, x: i * step, z: j * step };
    }
  }

  const origin = { x: best.x, z: best.z };

  // Highest point inside the chosen window becomes the composition anchor.
  const s = 8;
  const m = regionBlocks / s;
  let peakH = -Infinity;
  let px = origin.x;
  let pz = origin.z;
  for (let j = 0; j < m; j++) {
    for (let i = 0; i < m; i++) {
      const x = origin.x + i * s;
      const z = origin.z + j * s;
      const v = field.heightAt(x, z);
      if (v > peakH) {
        peakH = v;
        px = x;
        pz = z;
      }
    }
  }

  return { origin, peak: new THREE.Vector3(px, peakH, pz) };
}

/** The three fixed test views, all derived from the same region and peak. */
export function buildPoses(
  field: TerrainField,
  region: RegionInfo,
  regionBlocks: number,
): Record<ViewName, Pose> {
  const { origin, peak } = region;
  const sea = field.seaLevel;
  const s = 8;
  const n = regionBlocks / s;

  // Elevated stand-off with lower ground between viewer and peak.
  let best = { score: -Infinity, x: origin.x + 32, z: origin.z + 32, y: sea + 20 };
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = origin.x + i * s;
      const z = origin.z + j * s;
      const d = Math.hypot(x - peak.x, z - peak.z);
      if (d < 330 || d > 470) continue;
      const y = field.heightAt(x, z);
      if (y < sea + 6) continue;
      const mid = field.heightAt((x + peak.x) / 2, (z + peak.z) / 2);
      const score = y * 1.1 - mid * 0.9;
      if (score > best.score) best = { score, x, z, y };
    }
  }

  const panorama: Pose = {
    eye: new THREE.Vector3(best.x, best.y + 62, best.z),
    target: new THREE.Vector3(peak.x, sea + (peak.y - sea) * 0.22, peak.z),
    fov: 62,
  };

  const dir = new THREE.Vector3()
    .subVectors(panorama.target, panorama.eye)
    .setY(0)
    .normalize();
  const span = Math.hypot(peak.x - best.x, peak.z - best.z);

  // Hilltop: a local rise partway in, high enough to read the land's shape.
  const hx = best.x + dir.x * span * 0.32;
  const hz = best.z + dir.z * span * 0.32;
  const hGround = field.heightAt(hx, hz);
  const hilltop: Pose = {
    eye: new THREE.Vector3(hx, hGround + 14, hz),
    target: new THREE.Vector3(peak.x, sea + (peak.y - sea) * 0.42, peak.z),
    fov: 60,
  };

  // Ground: close to the surface at a grazing angle, where voxel size reads.
  const gx = best.x + dir.x * span * 0.66;
  const gz = best.z + dir.z * span * 0.66;
  const gGround = field.heightAt(gx, gz);
  const ground: Pose = {
    eye: new THREE.Vector3(gx, gGround + 2.2, gz),
    target: new THREE.Vector3(gx + dir.x * 80, gGround - 2, gz + dir.z * 80),
    fov: 62,
  };

  return { panorama, hilltop, ground };
}

/** Drag to look, wheel to dolly, WASD to move. */
export class CameraControls {
  private yaw = 0;
  private pitch = 0;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private keys = new Set<string>();
  private speed = 28;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private el: HTMLElement,
    private onChange: () => void,
  ) {
    el.addEventListener('pointerdown', this.down);
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointermove', this.move);
    el.addEventListener('wheel', this.wheel, { passive: false });
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
  }

  applyPose(pose: Pose): void {
    this.camera.position.copy(pose.eye);
    this.camera.fov = pose.fov;
    this.camera.updateProjectionMatrix();
    const d = new THREE.Vector3().subVectors(pose.target, pose.eye).normalize();
    this.yaw = Math.atan2(d.x, d.z);
    this.pitch = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
    this.sync();
  }

  private sync(): void {
    const dir = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    );
    this.camera.lookAt(new THREE.Vector3().addVectors(this.camera.position, dir));
    this.camera.updateMatrixWorld();
  }

  private down = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    this.dragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  };

  private up = (): void => {
    this.dragging = false;
  };

  private move = (e: PointerEvent): void => {
    if (!this.dragging) return;
    this.yaw -= (e.clientX - this.lastX) * 0.0032;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch - (e.clientY - this.lastY) * 0.0032,
      -1.35,
      1.35,
    );
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.sync();
    this.onChange();
  };

  private wheel = (e: WheelEvent): void => {
    e.preventDefault();
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    this.camera.position.addScaledVector(dir, -Math.sign(e.deltaY) * -this.speed * 0.4);
    this.sync();
    this.onChange();
  };

  private keyDown = (e: KeyboardEvent): void => {
    this.keys.add(e.key.toLowerCase());
  };

  private keyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key.toLowerCase());
  };

  /** Called each frame; returns true when the camera actually moved. */
  update(dt: number): boolean {
    if (this.keys.size === 0) return false;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    const step = this.speed * dt;
    let moved = false;
    if (this.keys.has('w')) (this.camera.position.addScaledVector(dir, step), (moved = true));
    if (this.keys.has('s')) (this.camera.position.addScaledVector(dir, -step), (moved = true));
    if (this.keys.has('a')) (this.camera.position.addScaledVector(right, -step), (moved = true));
    if (this.keys.has('d')) (this.camera.position.addScaledVector(right, step), (moved = true));
    if (this.keys.has('q')) (this.camera.position.y -= step, (moved = true));
    if (this.keys.has('e')) (this.camera.position.y += step, (moved = true));
    if (moved) {
      this.sync();
      this.onChange();
    }
    return moved;
  }

  dispose(): void {
    this.el.removeEventListener('pointerdown', this.down);
    window.removeEventListener('pointerup', this.up);
    window.removeEventListener('pointermove', this.move);
    this.el.removeEventListener('wheel', this.wheel);
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
  }
}



