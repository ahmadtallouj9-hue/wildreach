import * as THREE from 'three';
import { PlayerConfig } from './PlayerConfig';
import type { ViewMode } from '../ui/prefs';
import type { ChunkManager } from '../world/ChunkManager';
import { lerpTransform, type PlayerLandedEvent } from './PlayerState';

export class PlayerCamera {
  readonly camera: THREE.PerspectiveCamera;
  viewMode: ViewMode = 'first';

  yaw = 0;
  pitch = -0.12;

  // Touch look follow
  private camYaw = 0;
  private camPitch = -0.12;

  // Visual effects state
  private baseFov = 70;
  private currentFov = 70;
  private headBobPhase = 0;
  private landingOffset = 0;
  private damageTilt = 0;

  private readonly eyeWorld = new THREE.Vector3();
  private readonly aimDir = new THREE.Vector3();
  private readonly aimEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly aimQuat = new THREE.Quaternion();
  private readonly camDesired = new THREE.Vector3();
  private readonly camFocus = new THREE.Vector3();

  constructor(private chunks: ChunkManager) {
    this.camera = new THREE.PerspectiveCamera(this.baseFov, 1, 0.1, 520);
  }

  setBaseFov(fov: number): void {
    this.baseFov = fov;
    this.currentFov = fov;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  applyLook(dx: number, dy: number, sens: number, invertY: boolean): void {
    const scale = sens * 0.025;
    const lookY = invertY ? dy : -dy;

    this.yaw -= dx * scale;
    this.yaw = ((this.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

    this.pitch += lookY * scale;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch,
      -PlayerConfig.camera.pitchLimitRad,
      PlayerConfig.camera.pitchLimitRad,
    );
  }

  applyTouchLookDeltas(velYaw: number, velPitch: number, dt: number): void {
    this.yaw += velYaw * dt;
    this.yaw = ((this.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

    this.pitch += velPitch * dt;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch,
      -PlayerConfig.camera.pitchLimitRad,
      PlayerConfig.camera.pitchLimitRad,
    );

    const follow = 1 - Math.exp(-18 * dt);
    this.camYaw += (this.yaw - this.camYaw) * follow;
    this.camPitch += (this.pitch - this.camPitch) * follow;
  }

  onLanded(evt: PlayerLandedEvent): void {
    const impact = THREE.MathUtils.clamp(Math.abs(evt.landingVelocityY) * 0.15, 0.02, 0.15);
    this.landingOffset = -impact;
  }

  onHurt(): void {
    this.damageTilt = (Math.random() > 0.5 ? 1 : -1) * 0.06;
  }

  getAimOrigin(out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(this.eyeWorld);
  }

  getAimDirection(out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(this.aimDir);
  }

  /**
   * Render frame update for camera transforms, effects, and FOV.
   */
  update(
    prevPos: THREE.Vector3,
    currPos: THREE.Vector3,
    renderAlpha: number,
    eyeHeight: number,
    grounded: boolean,
    isSprinting: boolean,
    isSneaking: boolean,
    isSitting: boolean,
    isTouchMode: boolean,
    dt: number,
  ): void {
    // 1. Interpolate physics position for smooth visual rendering
    const renderPos = lerpTransform(prevPos, currPos, renderAlpha);

    // 2. Head bob calculation
    const horizDist = Math.hypot(currPos.x - prevPos.x, currPos.z - prevPos.z);
    if (grounded && horizDist > 0.001) {
      this.headBobPhase += horizDist * (isSneaking ? 1.2 : isSprinting ? 2.4 : 1.8);
    }

    const bobY =
      grounded && !isSneaking && !isSitting && horizDist > 0.001
        ? Math.sin(this.headBobPhase) * PlayerConfig.camera.bobVerticalAmp
        : 0;

    // 3. Relax landing dip effect
    if (Math.abs(this.landingOffset) > 0.001) {
      this.landingOffset += (0 - this.landingOffset) * Math.min(1, dt * 10);
    } else {
      this.landingOffset = 0;
    }

    // 4. Relax damage tilt
    if (Math.abs(this.damageTilt) > 0.001) {
      this.damageTilt += (0 - this.damageTilt) * Math.min(1, dt * 8);
    } else {
      this.damageTilt = 0;
    }

    // 5. Smooth FOV modifier on sprint
    const targetFov = this.baseFov + (isSprinting ? PlayerConfig.camera.sprintFovBoost : 0);
    this.currentFov += (targetFov - this.currentFov) * Math.min(1, dt * PlayerConfig.camera.fovTransitionSpeed);
    if (Math.abs(this.camera.fov - this.currentFov) > 0.05) {
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }

    // 6. Calculate Eye position & Aim quaternions
    const lookYaw = isTouchMode ? this.camYaw : this.yaw;
    const lookPitch = isTouchMode ? this.camPitch : this.pitch;

    this.eyeWorld.set(
      renderPos.x,
      renderPos.y + eyeHeight + bobY + this.landingOffset,
      renderPos.z,
    );

    this.aimEuler.set(lookPitch, lookYaw, this.damageTilt, 'YXZ');
    this.aimQuat.setFromEuler(this.aimEuler);
    this.aimDir.set(0, 0, -1).applyQuaternion(this.aimQuat).normalize();

    // 7. Update PerspectiveCamera position and orientation
    if (this.viewMode === 'first') {
      this.camera.position.copy(this.eyeWorld);
      this.camera.quaternion.copy(this.aimQuat);
      return;
    }

    // Third-person / Front-person framing
    this.camFocus.set(
      renderPos.x,
      renderPos.y + eyeHeight * 0.72 + PlayerConfig.camera.camHeightLift * 0.25,
      renderPos.z,
    );

    if (this.viewMode === 'front') {
      this.camDesired.copy(this.camFocus).addScaledVector(this.aimDir, PlayerConfig.camera.frontPersonDist);
      this.camDesired.y += PlayerConfig.camera.camHeightLift * 0.4;
      this.camera.position.copy(this.pullCameraIn(this.camFocus, this.camDesired));
      this.camera.lookAt(this.camFocus);
      return;
    }

    // Third-person back
    this.camDesired.copy(this.camFocus).addScaledVector(this.aimDir, -PlayerConfig.camera.thirdPersonDist);
    this.camDesired.y += PlayerConfig.camera.camHeightLift;
    this.camera.position.copy(this.pullCameraIn(this.camFocus, this.camDesired));
    this.camera.lookAt(
      this.camFocus.x + this.aimDir.x * 6,
      this.camFocus.y + this.aimDir.y * 6,
      this.camFocus.z + this.aimDir.z * 6,
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
}
