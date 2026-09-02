import * as THREE from 'three';
import { PlayerConfig } from './PlayerConfig';
import type { ViewMode } from '../ui/prefs';
import type { ChunkManager } from '../world/ChunkManager';
import { lerpAngle, lerpTransform, type PlayerLandedEvent } from './PlayerState';

export interface CameraDebugInfo {
  physicsPos: THREE.Vector3;
  interpolatedPos: THREE.Vector3;
  physicsYaw: number;
  targetYaw: number;
  renderYaw: number;
  physicsPitch: number;
  targetPitch: number;
  renderPitch: number;
  renderDelta: number;
  renderAlpha: number;
  horizontalSpeed: number;
  cameraFov: number;
}

export class PlayerCamera {
  readonly camera: THREE.PerspectiveCamera;
  viewMode: ViewMode = 'first';

  // Authoritative target orientation
  private targetYaw = 0;
  private targetPitch = -0.12;

  // Render-rate smoothed orientation
  private renderYaw = 0;
  private renderPitch = -0.12;

  // Touch look follow
  private camYaw = 0;
  private camPitch = -0.12;

  // Visual effects state
  private baseFov = 70;
  private currentFov = 70;
  private renderEyeHeight = PlayerConfig.dimensions.standingEye;
  private headBobPhase = 0;
  private landingOffset = 0;
  private landingVelocity = 0;
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

  get yaw(): number {
    return this.targetYaw;
  }
  set yaw(v: number) {
    this.targetYaw = v;
    this.renderYaw = v;
  }

  get pitch(): number {
    return this.targetPitch;
  }
  set pitch(v: number) {
    this.targetPitch = v;
    this.renderPitch = v;
  }

  get smoothedYaw(): number {
    return this.renderYaw;
  }

  get smoothedPitch(): number {
    return this.renderPitch;
  }

  setBaseFov(fov: number): void {
    this.baseFov = fov;
    this.currentFov = fov;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Directly updates target camera rotation from raw mouse movement.
   * Executed at full render frame rate.
   */
  applyLook(dx: number, dy: number, sens: number, invertY: boolean): void {
    const scale = sens * 0.025;
    const lookY = invertY ? dy : -dy;

    this.targetYaw -= dx * scale;
    this.targetYaw = ((this.targetYaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

    this.targetPitch += lookY * scale;
    this.targetPitch = THREE.MathUtils.clamp(
      this.targetPitch,
      -PlayerConfig.camera.pitchLimitRad,
      PlayerConfig.camera.pitchLimitRad,
    );
  }

  applyTouchLookDeltas(velYaw: number, velPitch: number, dt: number): void {
    this.targetYaw += velYaw * dt;
    this.targetYaw = ((this.targetYaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

    this.targetPitch += velPitch * dt;
    this.targetPitch = THREE.MathUtils.clamp(
      this.targetPitch,
      -PlayerConfig.camera.pitchLimitRad,
      PlayerConfig.camera.pitchLimitRad,
    );

    const follow = 1 - Math.exp(-18 * dt);
    this.camYaw += (this.targetYaw - this.camYaw) * follow;
    this.camPitch += (this.targetPitch - this.camPitch) * follow;
  }

  onLanded(evt: PlayerLandedEvent): void {
    if (evt.fallDistance > 0.5 && Math.abs(evt.landingVelocityY) > 0.05) {
      const impact = THREE.MathUtils.clamp(Math.abs(evt.landingVelocityY) * 0.15, 0.02, 0.12);
      this.landingVelocity -= impact * 8.0;
    }
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
   * Render frame update for camera transforms, visual effects, and FOV.
   * Runs at full render frequency (60 / 120 / 144 / 240 FPS).
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
    const safeDt = Math.max(0.0001, dt);

    // 1. Interpolate physics position for smooth visual rendering
    const renderPos = lerpTransform(prevPos, currPos, renderAlpha);

    // 2. Time-based camera rotation smoothing (crisp, responsive, no input lag)
    const rotSmooth = 1 - Math.exp(-PlayerConfig.camera.cameraRotationSmoothness * safeDt);
    this.renderYaw = lerpAngle(this.renderYaw, this.targetYaw, rotSmooth);
    this.renderYaw = ((this.renderYaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    this.renderPitch = THREE.MathUtils.lerp(this.renderPitch, this.targetPitch, rotSmooth);

    // 3. Visual sneak / sitting eye height smoothing
    const targetEyeHeight = eyeHeight;
    const eyeSmooth = 1 - Math.exp(-PlayerConfig.camera.eyeHeightSmoothSpeed * safeDt);
    this.renderEyeHeight += (targetEyeHeight - this.renderEyeHeight) * eyeSmooth;

    // 4. Head bob calculation (continuous render frequency based on horizontal speed)
    const horizDist = Math.hypot(currPos.x - prevPos.x, currPos.z - prevPos.z);
    const horizSpeed = horizDist / PlayerConfig.tickDt;
    const bobAmount = THREE.MathUtils.clamp(horizSpeed / PlayerConfig.movement.walkSpeed, 0, 1.2);

    let bobY = 0;
    if (grounded && !isSitting && bobAmount > 0.02) {
      const stepFreq = isSneaking ? 8.0 : isSprinting ? 16.0 : 12.0;
      this.headBobPhase += safeDt * stepFreq * bobAmount;
      const ampMult = isSneaking ? 0.35 : 1.0;
      bobY = Math.sin(this.headBobPhase) * PlayerConfig.camera.bobVerticalAmp * ampMult * bobAmount;
    }

    // 5. Landing dip spring simulation
    const k = PlayerConfig.camera.landingSpringStiffness;
    const c = PlayerConfig.camera.landingSpringDamping;
    const springForce = -k * this.landingOffset - c * this.landingVelocity;
    this.landingVelocity += springForce * safeDt;
    this.landingOffset += this.landingVelocity * safeDt;
    if (Math.abs(this.landingOffset) < 0.0001 && Math.abs(this.landingVelocity) < 0.001) {
      this.landingOffset = 0;
      this.landingVelocity = 0;
    }

    // 6. Damage tilt decay
    const damageDecay = 1 - Math.exp(-PlayerConfig.camera.damageTiltDecaySpeed * safeDt);
    this.damageTilt += (0 - this.damageTilt) * damageDecay;
    if (Math.abs(this.damageTilt) < 0.0001) {
      this.damageTilt = 0;
    }

    // 7. Smooth FOV modifier on sprint
    const targetFov = this.baseFov + (isSprinting ? PlayerConfig.camera.sprintFovBoost : 0);
    const fovSmooth = 1 - Math.exp(-PlayerConfig.camera.fovTransitionSpeed * safeDt);
    this.currentFov += (targetFov - this.currentFov) * fovSmooth;
    if (Math.abs(this.camera.fov - this.currentFov) > 0.01) {
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }

    // 8. Calculate Eye position & Aim quaternions
    const lookYaw = isTouchMode ? this.camYaw : this.renderYaw;
    const lookPitch = isTouchMode ? this.camPitch : this.renderPitch;

    this.eyeWorld.set(
      renderPos.x,
      renderPos.y + this.renderEyeHeight + bobY + this.landingOffset,
      renderPos.z,
    );

    this.aimEuler.set(lookPitch, lookYaw, this.damageTilt, 'YXZ');
    this.aimQuat.setFromEuler(this.aimEuler);
    this.aimDir.set(0, 0, -1).applyQuaternion(this.aimQuat).normalize();

    // 9. Update PerspectiveCamera position and orientation
    if (this.viewMode === 'first') {
      this.camera.position.copy(this.eyeWorld);
      this.camera.quaternion.copy(this.aimQuat);
      return;
    }

    // Third-person / Front-person framing
    this.camFocus.set(
      renderPos.x,
      renderPos.y + this.renderEyeHeight * 0.72 + PlayerConfig.camera.camHeightLift * 0.25,
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

  getDebugInfo(prevPos: THREE.Vector3, currPos: THREE.Vector3, renderAlpha: number, dt: number): CameraDebugInfo {
    const horizDist = Math.hypot(currPos.x - prevPos.x, currPos.z - prevPos.z);
    const horizSpeed = horizDist / PlayerConfig.tickDt;
    return {
      physicsPos: currPos.clone(),
      interpolatedPos: this.eyeWorld.clone(),
      physicsYaw: this.targetYaw,
      targetYaw: this.targetYaw,
      renderYaw: this.renderYaw,
      physicsPitch: this.targetPitch,
      targetPitch: this.targetPitch,
      renderPitch: this.renderPitch,
      renderDelta: dt,
      renderAlpha,
      horizontalSpeed: horizSpeed,
      cameraFov: this.camera.fov,
    };
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
