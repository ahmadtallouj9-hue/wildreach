import * as THREE from 'three';
import type { ChunkManager } from '../world/ChunkManager';
import { loadSettings, saveSettings, type Profile, type ViewMode } from '../ui/prefs';
import { PlayerAvatar, type AvatarPose } from './PlayerAvatar';
import { PlayerConfig } from './PlayerConfig';
import { PlayerInput } from './PlayerInput';
import { PlayerCollision } from './PlayerCollision';
import { PlayerPhysics } from './PlayerPhysics';
import { PlayerCamera } from './PlayerCamera';
import type { PlayerDamage } from './PlayerDamage';
import type { PlayerHunger } from './PlayerHunger';
import type { PlayerSimulationState } from './PlayerState';

export class PlayerController {
  readonly camera: THREE.PerspectiveCamera;
  readonly avatar: THREE.Group;

  readonly input: PlayerInput;
  readonly collision: PlayerCollision;
  readonly physics: PlayerPhysics;
  readonly playerCamera: PlayerCamera;
  private model: PlayerAvatar;

  distanceWalked = 0;

  constructor(
    canvas: HTMLCanvasElement,
    private chunks: ChunkManager,
  ) {
    this.input = new PlayerInput(canvas);
    this.collision = new PlayerCollision(chunks);
    this.physics = new PlayerPhysics(this.collision, chunks);
    this.playerCamera = new PlayerCamera(chunks);

    this.camera = this.playerCamera.camera;
    this.model = new PlayerAvatar();
    this.avatar = this.model.root;

    // Connect landing event to camera response
    this.physics.onLanded((evt) => {
      this.playerCamera.onLanded(evt);
    });
  }

  get position(): THREE.Vector3 {
    return this.physics.position;
  }

  get velocity(): THREE.Vector3 {
    return this.physics.velocity;
  }

  get yaw(): number {
    return this.playerCamera.yaw;
  }
  set yaw(v: number) {
    this.playerCamera.yaw = v;
  }

  facingDegrees(): number {
    return (this.playerCamera.yaw * 180) / Math.PI;
  }

  get pitch(): number {
    return this.playerCamera.pitch;
  }
  set pitch(v: number) {
    this.playerCamera.pitch = v;
  }

  get viewMode(): ViewMode {
    return this.playerCamera.viewMode;
  }
  set viewMode(v: ViewMode) {
    this.playerCamera.viewMode = v;
  }

  get mouseSensitivity(): number {
    return this.input.mouseSensitivity;
  }
  set mouseSensitivity(v: number) {
    this.input.mouseSensitivity = v;
  }

  get invertY(): boolean {
    return this.input.invertY;
  }
  set invertY(v: boolean) {
    this.input.invertY = v;
  }

  get sitting(): boolean {
    return this.physics.sitting;
  }
  set sitting(v: boolean) {
    this.physics.sitting = v;
    if (v) this.physics.velocity.set(0, 0, 0);
  }

  get pointerLocked(): boolean {
    return this.input.pointerLocked;
  }

  get aimActive(): boolean {
    return this.input.aimActive;
  }

  get touchControlsActive(): boolean {
    return this.input.isTouchMode;
  }

  get sneaking(): boolean {
    return this.physics.sneaking;
  }

  get isSprinting(): boolean {
    return this.physics.sprinting;
  }

  get isOnGround(): boolean {
    return this.physics.grounded;
  }

  get lavaSubmersion(): number {
    return this.physics.lavaSubmersion;
  }

  get pose(): AvatarPose {
    if (this.sitting) return 'sit';
    if (this.sneaking) return 'sneak';
    return 'stand';
  }

  get eyeHeight(): number {
    return this.physics.currentEyeHeight;
  }

  get playerHeight(): number {
    return this.physics.currentHeight;
  }

  setTouchMode(on: boolean): void {
    this.input.setTouchMode(on);
  }

  setTouchMove(x: number, z: number): void {
    this.input.setTouchMove(x, z);
  }

  setTouchJump(down: boolean): void {
    this.input.setTouchJump(down);
  }

  setTouchSneak(on: boolean): void {
    this.input.setTouchSneak(on);
  }

  applyLookDelta(dx: number, dy: number): void {
    this.playerCamera.applyLook(dx, dy, this.input.mouseSensitivity, this.input.invertY);
  }

  setInputEnabled(enabled: boolean): void {
    this.input.setEnabled(enabled);
  }

  applyProfile(profile: Profile): void {
    this.model.applyProfile(profile);
  }

  applySkinPixels(pixels: Uint8ClampedArray): void {
    this.model.applySkinPixels(pixels);
  }

  setFov(fov: number): void {
    this.playerCamera.setBaseFov(fov);
  }

  setViewMode(mode: ViewMode): void {
    this.playerCamera.viewMode = mode;
    this.avatar.visible = mode === 'third' || mode === 'front';
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

  getAimOrigin(out = new THREE.Vector3()): THREE.Vector3 {
    return this.playerCamera.getAimOrigin(out);
  }

  getAimDirection(out = new THREE.Vector3()): THREE.Vector3 {
    return this.playerCamera.getAimDirection(out);
  }

  getSubmersion(): number {
    if (this.physics.lavaSubmersion > 0.02) return 0;
    const origin = this.playerCamera.getAimOrigin();
    return this.chunks.getSubmersion(origin.x, origin.y, origin.z);
  }

  getLavaSubmersion(): number {
    return this.physics.lavaSubmersion;
  }

  getNetState() {
    return {
      x: this.physics.position.x,
      y: this.physics.position.y,
      z: this.physics.position.z,
      yaw: this.playerCamera.yaw,
      pitch: this.playerCamera.pitch,
      pose: this.pose,
      onGround: this.physics.grounded,
    };
  }

  spawnAt(x: number, z: number): void {
    const h = this.chunks.surfaceHeight(Math.floor(x), Math.floor(z));
    this.physics.teleport(x + 0.5, h + 2.5, z + 0.5);
    this.sitting = false;
  }

  /**
   * Deterministic 20 Hz fixed simulation step.
   */
  simulateTick(damageSystem: PlayerDamage, hungerSystem: PlayerHunger): void {
    // 1. Consume look deltas from mouse movement
    const look = this.input.consumeLookDeltas();
    if (look.dx !== 0 || look.dy !== 0) {
      this.playerCamera.applyLook(
        look.dx,
        look.dy,
        this.input.mouseSensitivity,
        this.input.invertY,
      );
    }

    // 2. Consume input snapshot
    const snapshot = this.input.consumeTickSnapshot();

    // 3. Step physics simulation
    this.physics.simulateTick(
      snapshot,
      this.playerCamera.yaw,
      damageSystem,
      hungerSystem,
    );
  }

  /**
   * Continuous render frame update (smooth interpolation and effects).
   */
  render(renderAlpha: number, dt: number): void {
    this.input.updateFrame(dt);

    if (this.input.isTouchMode) {
      this.playerCamera.applyTouchLookDeltas(
        this.input.touchLookVelYaw,
        this.input.touchLookVelPitch,
        dt,
      );
    }

    // Update camera with position interpolation
    this.playerCamera.update(
      this.physics.previousPosition,
      this.physics.position,
      renderAlpha,
      this.eyeHeight,
      this.physics.grounded,
      this.physics.sprinting,
      this.physics.sneaking,
      this.physics.sitting,
      this.input.isTouchMode,
      dt,
    );

    // Update 3D avatar position and animation
    const renderPos = new THREE.Vector3().lerpVectors(
      this.physics.previousPosition,
      this.physics.position,
      renderAlpha,
    );

    this.avatar.position.copy(renderPos);
    this.avatar.rotation.y = this.playerCamera.yaw;

    const moveAmt = Math.hypot(this.physics.velocity.x, this.physics.velocity.z) / PlayerConfig.movement.walkSpeedTick;
    this.model.update(
      dt,
      moveAmt,
      this.physics.grounded,
      this.physics.velocity.y,
      this.pose,
      this.physics.wasJustJumped,
    );
  }

  /**
   * Backward-compatible update helper for single-frame calls.
   */
  update(
    dt: number,
    damageSystem?: PlayerDamage,
    hungerSystem?: PlayerHunger,
  ): void {
    if (damageSystem && hungerSystem) {
      this.simulateTick(damageSystem, hungerSystem);
    }
    this.render(1.0, dt);
  }

  getStateSnapshot(damageSystem: PlayerDamage, hungerSystem: PlayerHunger): PlayerSimulationState {
    return {
      position: this.physics.position.clone(),
      velocity: this.physics.velocity.clone(),
      yaw: this.playerCamera.yaw,
      pitch: this.playerCamera.pitch,
      grounded: this.physics.grounded,
      movementState: this.physics.movementState,
      sprinting: this.physics.sprinting,
      sneaking: this.physics.sneaking,
      swimming: this.physics.inWater,
      fallDistance: this.physics.fallDistance,
      health: damageSystem.health,
      maxHealth: damageSystem.maxHealth,
      hunger: hungerSystem.hunger,
      saturation: hungerSystem.saturation,
      exhaustion: hungerSystem.exhaustion,
      damageCooldown: damageSystem.immunityTicks,
      hurtFlash: damageSystem.hurtFlash,
    };
  }

  dispose(): void {
    this.input.dispose();
  }
}
