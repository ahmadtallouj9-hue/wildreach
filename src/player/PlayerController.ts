import * as THREE from 'three';
import type { ChunkManager } from '../world/ChunkManager';
import { loadSettings, saveSettings, type Profile, type ViewMode } from '../ui/prefs';
import { PlayerAvatar, type AvatarPose } from './PlayerAvatar';

const EYE_STAND = 1.62;
const EYE_SNEAK = 1.35;
const EYE_SIT = 1.05;
const HEIGHT_STAND = 1.8;
const HEIGHT_SNEAK = 1.5;
const HEIGHT_SIT = 1.15;
const PLAYER_WIDTH = 0.6;
/** Behind the player — far enough to see the world, not glued to the back. */
const THIRD_DIST = 4.4;
const FRONT_DIST = 3.6;
const CAM_HEIGHT_LIFT = 0.35;

export class PlayerController {
  readonly camera: THREE.PerspectiveCamera;
  readonly avatar: THREE.Group;
  private model: PlayerAvatar;
  position = new THREE.Vector3(0, 80, 0);
  velocity = new THREE.Vector3();
  yaw = 0;
  pitch = -0.12;

  viewMode: ViewMode = 'first';
  mouseSensitivity = 1;
  invertY = false;
  sitting = false;
  private keys = new Set<string>();
  private locked = false;
  private onGround = false;
  private bobPhase = 0;
  distanceWalked = 0;
  private lastPos = new THREE.Vector3();
  private justJumped = false;
  private inputEnabled = true;
  private touchMode = false;
  private touchMoveX = 0;
  private touchMoveZ = 0;
  private touchJump = false;
  private touchSneak = false;
  private touchLookVelYaw = 0;
  private touchLookVelPitch = 0;
  private camYaw = 0;
  private camPitch = -0.12;
  private readonly eyeWorld = new THREE.Vector3();
  private readonly aimDir = new THREE.Vector3();
  private readonly aimEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly aimQuat = new THREE.Quaternion();
  private readonly camDesired = new THREE.Vector3();
  private readonly camFocus = new THREE.Vector3();
  lavaSubmersion = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private chunks: ChunkManager,
  ) {
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 520);
    this.model = new PlayerAvatar();
    this.avatar = this.model.root;
    this.bindInput();
  }

  get pointerLocked(): boolean {
    return this.locked;
  }

  get aimActive(): boolean {
    return this.locked || this.touchMode;
  }

  get touchControlsActive(): boolean {
    return this.touchMode;
  }

  setTouchMode(on: boolean): void {
    this.touchMode = on;
    if (on) {
      this.camYaw = this.yaw;
      this.camPitch = this.pitch;
    } else {
      this.touchLookVelYaw = 0;
      this.touchLookVelPitch = 0;
    }
  }

  setTouchMove(x: number, z: number): void {
    this.touchMoveX = x;
    this.touchMoveZ = z;
  }

  applyLookDelta(dx: number, dy: number): void {
    if (!this.inputEnabled) return;
    const sens = 0.0022 * this.mouseSensitivity;
    const lookY = this.invertY ? dy : -dy;
    if (this.touchMode) {
      const touchSens = sens * 1.25;
      const impulse = 16;
      this.touchLookVelYaw -= dx * touchSens * impulse;
      this.touchLookVelPitch += lookY * touchSens * impulse;
      const maxVel = 2.6;
      this.touchLookVelYaw = THREE.MathUtils.clamp(this.touchLookVelYaw, -maxVel, maxVel);
      this.touchLookVelPitch = THREE.MathUtils.clamp(this.touchLookVelPitch, -maxVel, maxVel);
      return;
    }
    this.yaw -= dx * sens;
    this.pitch += lookY * sens;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
  }

  setTouchJump(down: boolean): void {
    this.touchJump = down;
  }

  setTouchSneak(on: boolean): void {
    this.touchSneak = on;
  }

  get sneaking(): boolean {
    return (
      !this.sitting &&
      (this.keys.has('ControlLeft') ||
        this.keys.has('ControlRight') ||
        this.touchSneak)
    );
  }

  get pose(): AvatarPose {
    if (this.sitting) return 'sit';
    if (this.sneaking) return 'sneak';
    return 'stand';
  }

  get eyeHeight(): number {
    if (this.sitting) return EYE_SIT;
    if (this.sneaking) return EYE_SNEAK;
    return EYE_STAND;
  }

  get playerHeight(): number {
    if (this.sitting) return HEIGHT_SIT;
    if (this.sneaking) return HEIGHT_SNEAK;
    return HEIGHT_STAND;
  }

  setInputEnabled(enabled: boolean): void {
    this.inputEnabled = enabled;
    if (!enabled) {
      this.keys.clear();
      this.touchMoveX = 0;
      this.touchMoveZ = 0;
      this.touchJump = false;
      this.touchSneak = false;
      this.touchLookVelYaw = 0;
      this.touchLookVelPitch = 0;
    }
  }

  applyProfile(profile: Profile): void {
    this.model.applyProfile(profile);
  }

  applySkinPixels(pixels: Uint8ClampedArray): void {
    this.model.applySkinPixels(pixels);
  }

  setFov(fov: number): void {
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  setViewMode(mode: ViewMode): void {
    this.viewMode = mode;
    this.avatar.visible = mode === 'third' || mode === 'front';
    this.refreshAim(0);
    this.updateCamera();
  }

  cycleViewMode(): ViewMode {
    const order: ViewMode[] = ['first', 'third', 'front'];
    const i = order.indexOf(this.viewMode);
    const next = order[(i < 0 ? 0 : i + 1) % order.length]!;
    this.setViewMode(next);
    const s = loadSettings();
    s.viewMode = this.viewMode;
    saveSettings(s);
    return this.viewMode;
  }

  /** Eye position used for aiming (independent of camera boom). */
  getAimOrigin(out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(this.eyeWorld);
  }

  /** Look direction matching first-person aim. */
  getAimDirection(out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(this.aimDir);
  }

  private refreshAim(eyeYBob: number): void {
    const yaw = this.touchMode ? this.camYaw : this.yaw;
    const pitch = this.touchMode ? this.camPitch : this.pitch;
    this.eyeWorld.set(
      this.position.x,
      this.position.y + this.eyeHeight + eyeYBob,
      this.position.z,
    );
    this.aimEuler.set(pitch, yaw, 0, 'YXZ');
    this.aimQuat.setFromEuler(this.aimEuler);
    this.aimDir.set(0, 0, -1).applyQuaternion(this.aimQuat).normalize();
  }

  private applyTouchLook(dt: number): void {
    if (!this.touchMode || !this.inputEnabled) {
      this.touchLookVelYaw = 0;
      this.touchLookVelPitch = 0;
      return;
    }

    this.yaw += this.touchLookVelYaw * dt;
    this.pitch += this.touchLookVelPitch * dt;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.45, 1.45);

    const damp = Math.exp(-11 * dt);
    this.touchLookVelYaw *= damp;
    this.touchLookVelPitch *= damp;
    if (Math.abs(this.touchLookVelYaw) < 0.002) this.touchLookVelYaw = 0;
    if (Math.abs(this.touchLookVelPitch) < 0.002) this.touchLookVelPitch = 0;

    const follow = 1 - Math.exp(-18 * dt);
    this.camYaw += (this.yaw - this.camYaw) * follow;
    this.camPitch += (this.pitch - this.camPitch) * follow;
  }

  getSubmersion(): number {
    if (this.lavaSubmersion > 0.02) return 0;
    return this.chunks.getSubmersion(this.eyeWorld.x, this.eyeWorld.y, this.eyeWorld.z);
  }

  getLavaSubmersion(): number {
    return this.lavaSubmersion;
  }

  getNetState() {
    return {
      x: this.position.x,
      y: this.position.y,
      z: this.position.z,
      yaw: this.yaw,
      pitch: this.pitch,
      pose: this.pose,
      onGround: this.onGround,
    };
  }

  private bindInput(): void {
    window.addEventListener('keydown', (e) => {
      if (!this.inputEnabled) return;
      this.keys.add(e.code);
      if (e.code === 'KeyV' && this.aimActive) this.cycleViewMode();
      if (e.code === 'KeyC' && this.aimActive) {
        this.sitting = !this.sitting;
        if (this.sitting) this.velocity.set(0, 0, 0);
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

    this.canvas.addEventListener('click', () => {
      if (this.touchMode) return;
      if (!this.locked && this.inputEnabled) this.canvas.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.locked || !this.inputEnabled) return;
      const sens = 0.0022 * this.mouseSensitivity;
      this.yaw -= e.movementX * sens;
      this.pitch += (this.invertY ? e.movementY : -e.movementY) * sens;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    });
  }

  spawnAt(x: number, z: number): void {
    const h = this.chunks.surfaceHeight(Math.floor(x), Math.floor(z));
    this.position.set(x + 0.5, h + 2.5, z + 0.5);
    this.velocity.set(0, 0, 0);
    this.sitting = false;
    this.lastPos.copy(this.position);
    this.camYaw = this.yaw;
    this.camPitch = this.pitch;
    this.touchLookVelYaw = 0;
    this.touchLookVelPitch = 0;
    this.refreshAim(0);
    this.updateCamera();
  }

  update(dt: number): void {
    this.justJumped = false;
    this.applyTouchLook(dt);

    if (this.sitting) {
      // WASD stands up
      if (
        this.keys.has('KeyW') ||
        this.keys.has('KeyA') ||
        this.keys.has('KeyS') ||
        this.keys.has('KeyD') ||
        this.keys.has('Space') ||
        this.touchMoveX !== 0 ||
        this.touchMoveZ !== 0
      ) {
        this.sitting = false;
      }
    }

    const sneak = this.sneaking;
    const sprint =
      !sneak &&
      !this.sitting &&
      (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'));
    const speed = this.sitting ? 0 : sneak ? 2.1 : sprint ? 9.5 : 5.2;
    const inLava = this.chunks.isBodyInLava(
      this.position.x,
      this.position.y,
      this.position.z,
      this.playerHeight,
    );
    const inWater =
      !inLava &&
      this.chunks.isBodyInWater(
        this.position.x,
        this.position.y,
        this.position.z,
        this.playerHeight,
      );
    let moveSpeed = inWater ? speed * 0.52 : inLava ? speed * 0.24 : speed;

    const lookYaw = this.touchMode ? this.camYaw : this.yaw;
    const forward = new THREE.Vector3(-Math.sin(lookYaw), 0, -Math.cos(lookYaw));
    const right = new THREE.Vector3(Math.cos(lookYaw), 0, -Math.sin(lookYaw));

    const wish = new THREE.Vector3();
    if (!this.sitting) {
      if (this.keys.has('KeyW')) wish.add(forward);
      if (this.keys.has('KeyS')) wish.sub(forward);
      if (this.keys.has('KeyD')) wish.add(right);
      if (this.keys.has('KeyA')) wish.sub(right);
      if (this.touchMoveX !== 0 || this.touchMoveZ !== 0) {
        wish.addScaledVector(right, this.touchMoveX);
        wish.addScaledVector(forward, -this.touchMoveZ);
      }
      if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(moveSpeed);
    }

    this.velocity.x = wish.x;
    this.velocity.z = wish.z;

    if (inLava) {
      this.lavaSubmersion = Math.min(1, this.lavaSubmersion + dt * 2.2);
      this.velocity.y -= 3.5 * dt;
      this.velocity.y += 8.5 * dt;
      this.velocity.y *= 1 - 2.8 * dt;
      this.velocity.x *= 1 - 3.8 * dt;
      this.velocity.z *= 1 - 3.8 * dt;
      if (!this.sitting && (this.keys.has('Space') || this.touchJump)) {
        this.velocity.y += 11 * dt;
      }
      if (sneak) this.velocity.y -= 14 * dt;
      this.onGround = false;
    } else {
      this.lavaSubmersion = Math.max(0, this.lavaSubmersion - dt * 3.5);
    }

    if (inWater) {
      const surfaceY = this.chunks.getWaterSurfaceY(
        Math.floor(this.position.x),
        Math.floor(this.position.z),
      );
      if (surfaceY !== null) {
        const depth = surfaceY - (this.position.y + this.eyeHeight);
        if (depth > 0.35) this.velocity.y += Math.min(18, depth * 8) * dt;
      }
      this.velocity.y -= 5.5 * dt;
      this.velocity.y += 6.5 * dt;
      this.velocity.y *= 1 - 3.2 * dt;
      this.velocity.x *= 1 - 2.4 * dt;
      this.velocity.z *= 1 - 2.4 * dt;
      if (!this.sitting && (this.keys.has('Space') || this.touchJump)) {
        this.velocity.y += 18 * dt;
      }
      if (sneak) this.velocity.y -= 12 * dt;
      this.onGround = false;
    } else if (!inLava) {
      this.velocity.y -= 28 * dt;
    }

    if (
      this.onGround &&
      !this.sitting &&
      !inWater &&
      !inLava &&
      (this.keys.has('Space') || this.touchJump)
    ) {
      this.velocity.y = sneak ? 7.2 : 9.2;
      this.onGround = false;
      this.justJumped = true;
    }

    this.moveAxis(dt, 'x');
    this.moveAxis(dt, 'y');
    this.moveAxis(dt, 'z');

    const horiz = Math.hypot(this.position.x - this.lastPos.x, this.position.z - this.lastPos.z);
    if (this.onGround && horiz > 0.001) {
      this.distanceWalked += horiz;
      this.bobPhase += horiz * (sneak ? 1.1 : 1.8);
    }
    this.lastPos.copy(this.position);

    this.avatar.position.set(this.position.x, this.position.y, this.position.z);
    this.avatar.rotation.y = lookYaw;

    const moveAmt = moveSpeed > 0 ? Math.hypot(this.velocity.x, this.velocity.z) / Math.max(moveSpeed, 0.01) : 0;
    this.model.update(
      dt,
      moveAmt,
      this.onGround,
      this.velocity.y,
      this.pose,
      this.justJumped,
    );

    const bob =
      this.onGround && !sneak && !this.sitting ? Math.sin(this.bobPhase) * 0.04 : 0;
    this.refreshAim(bob);
    this.updateCamera();
  }

  private updateCamera(): void {
    const eye = this.eyeWorld;
    const look = this.aimDir;

    if (this.viewMode === 'first') {
      this.camera.position.copy(eye);
      this.camera.quaternion.copy(this.aimQuat);
      return;
    }

    // Aim at upper chest so third-person framing feels natural.
    this.camFocus.set(
      this.position.x,
      this.position.y + this.eyeHeight * 0.72 + CAM_HEIGHT_LIFT * 0.25,
      this.position.z,
    );

    if (this.viewMode === 'front') {
      this.camDesired.copy(this.camFocus).addScaledVector(look, FRONT_DIST);
      this.camDesired.y += CAM_HEIGHT_LIFT * 0.4;
      this.camera.position.copy(this.pullCameraIn(this.camFocus, this.camDesired));
      this.camera.lookAt(this.camFocus);
      return;
    }

    // Third: behind + slightly above, looking into the world.
    this.camDesired.copy(this.camFocus).addScaledVector(look, -THIRD_DIST);
    this.camDesired.y += CAM_HEIGHT_LIFT;
    this.camera.position.copy(this.pullCameraIn(this.camFocus, this.camDesired));
    this.camera.lookAt(
      this.camFocus.x + look.x * 6,
      this.camFocus.y + look.y * 6,
      this.camFocus.z + look.z * 6,
    );
  }

  private pullCameraIn(from: THREE.Vector3, desired: THREE.Vector3): THREE.Vector3 {
    const dir = desired.clone().sub(from);
    const dist = dir.length();
    if (dist < 0.01) return desired.clone();
    dir.normalize();
    let best = dist;
    const steps = 16;
    for (let i = 1; i <= steps; i++) {
      const t = (i / steps) * dist;
      const p = from.clone().addScaledVector(dir, t);
      if (this.chunks.isSolidAt(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))) {
        best = Math.max(0.75, t - dist / steps);
        break;
      }
    }
    return from.clone().addScaledVector(dir, best);
  }

  private moveAxis(dt: number, axis: 'x' | 'y' | 'z'): void {
    let remaining = this.velocity[axis] * dt;
    if (remaining === 0) return;

    const height = this.playerHeight;
    const half = PLAYER_WIDTH * 0.5;
    // Substep so we never move more than half a block per probe (anti-tunnel).
    const stepSize = 0.45;
    const steps = Math.max(1, Math.ceil(Math.abs(remaining) / stepSize));
    const step = remaining / steps;

    let hitGround = false;

    for (let s = 0; s < steps; s++) {
      this.position[axis] += step;

      const minX = this.position.x - half;
      const maxX = this.position.x + half;
      const minY = this.position.y;
      const maxY = this.position.y + height;
      const minZ = this.position.z - half;
      const maxZ = this.position.z + half;

      const x0 = Math.floor(minX);
      const x1 = Math.floor(maxX);
      const y0 = Math.floor(minY);
      const y1 = Math.floor(maxY);
      const z0 = Math.floor(minZ);
      const z1 = Math.floor(maxZ);

      let blocked = false;
      for (let y = y0; y <= y1 && !blocked; y++) {
        for (let z = z0; z <= z1 && !blocked; z++) {
          for (let x = x0; x <= x1; x++) {
            if (!this.chunks.isSolidAt(x, y, z)) continue;
            blocked = true;
            if (axis === 'y') {
              if (step > 0) {
                this.position.y = y - height - 0.001;
                this.velocity.y = 0;
              } else {
                this.position.y = y + 1;
                this.velocity.y = 0;
                hitGround = true;
              }
            } else if (axis === 'x') {
              this.position.x = step > 0 ? x - half - 0.001 : x + 1 + half + 0.001;
              this.velocity.x = 0;
            } else {
              this.position.z = step > 0 ? z - half - 0.001 : z + 1 + half + 0.001;
              this.velocity.z = 0;
            }
            break;
          }
        }
      }
      if (blocked) break;
    }

    if (axis === 'y') this.onGround = hitGround;
  }

  facingDegrees(): number {
    let deg = ((-this.yaw * 180) / Math.PI) % 360;
    if (deg < 0) deg += 360;
    return deg;
  }
}
