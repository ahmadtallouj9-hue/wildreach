import { PlayerConfig } from './PlayerConfig';

export interface PlayerInputSnapshot {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jumpPressed: boolean;
  jumpHeld: boolean;
  sprintPressed: boolean;
  sprintHeld: boolean;
  sneakPressed: boolean;
  sneakHeld: boolean;
  attackPressed: boolean;
  attackHeld: boolean;
  usePressed: boolean;
  useHeld: boolean;
  analogX: number;
  analogZ: number;
}

export class PlayerInput {
  private keys = new Set<string>();
  private mouseButtons = new Set<number>();
  private locked = false;
  private enabled = true;

  // Jump buffering
  private jumpBufferTimer = 0;

  // Double tap forward (W) sprint detection
  private lastForwardPressTime = 0;
  private doubleTapSprintActive = false;

  // Track key transitions between fixed ticks
  private jumpPressedSinceLastTick = false;
  private sprintPressedSinceLastTick = false;
  private sneakPressedSinceLastTick = false;
  private attackPressedSinceLastTick = false;
  private usePressedSinceLastTick = false;

  // Touch controls state
  private touchMode = false;
  private touchMoveX = 0;
  private touchMoveZ = 0;
  private touchJump = false;
  private touchSneak = false;
  touchLookVelYaw = 0;
  touchLookVelPitch = 0;

  // Mouse look deltas (accumulated between ticks)
  mouseDeltaX = 0;
  mouseDeltaY = 0;
  mouseSensitivity = PlayerConfig.camera.mouseSensitivityDefault;
  invertY = false;

  private onKeyDownBound = this.onKeyDown.bind(this);
  private onKeyUpBound = this.onKeyUp.bind(this);
  private onMouseMoveBound = this.onMouseMove.bind(this);
  private onMouseDownBound = this.onMouseDown.bind(this);
  private onMouseUpBound = this.onMouseUp.bind(this);
  private onPointerLockChangeBound = this.onPointerLockChange.bind(this);
  private onCanvasClickBound = this.onCanvasClick.bind(this);

  constructor(private canvas: HTMLCanvasElement) {
    this.bindEvents();
  }

  get pointerLocked(): boolean {
    return this.locked;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  get isTouchMode(): boolean {
    return this.touchMode;
  }

  get aimActive(): boolean {
    return this.locked || this.touchMode;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.keys.clear();
      this.mouseButtons.clear();
      this.touchMoveX = 0;
      this.touchMoveZ = 0;
      this.touchJump = false;
      this.touchSneak = false;
      this.touchLookVelYaw = 0;
      this.touchLookVelPitch = 0;
      this.jumpBufferTimer = 0;
      this.doubleTapSprintActive = false;
    }
  }

  setTouchMode(on: boolean): void {
    this.touchMode = on;
    if (!on) {
      this.touchLookVelYaw = 0;
      this.touchLookVelPitch = 0;
    }
  }

  setTouchMove(x: number, z: number): void {
    this.touchMoveX = x;
    this.touchMoveZ = z;
  }

  setTouchJump(down: boolean): void {
    this.touchJump = down;
    if (down) {
      this.jumpBufferTimer = PlayerConfig.camera.jumpBufferTime;
      this.jumpPressedSinceLastTick = true;
    }
  }

  setTouchSneak(on: boolean): void {
    this.touchSneak = on;
    if (on) {
      this.sneakPressedSinceLastTick = true;
    }
  }

  applyLookDelta(dx: number, dy: number): void {
    if (!this.enabled) return;
    this.mouseDeltaX += dx;
    this.mouseDeltaY += dy;
  }

  /**
   * Called every render frame to update continuous timers like jump buffer.
   */
  updateFrame(dt: number): void {
    if (this.jumpBufferTimer > 0) {
      this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
    }
  }

  /**
   * Consumes buffered input into an immutable snapshot for the 20 Hz fixed simulation tick.
   */
  consumeTickSnapshot(): PlayerInputSnapshot {
    const forward = this.enabled && (this.keys.has('KeyW') || this.touchMoveZ < -0.15);
    const backward = this.enabled && (this.keys.has('KeyS') || this.touchMoveZ > 0.15);
    const left = this.enabled && (this.keys.has('KeyA') || this.touchMoveX < -0.15);
    const right = this.enabled && (this.keys.has('KeyD') || this.touchMoveX > 0.15);

    const jumpHeld = this.enabled && (this.keys.has('Space') || this.touchJump);
    const jumpPressed = this.enabled && (this.jumpPressedSinceLastTick || this.jumpBufferTimer > 0);

    const shiftSprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const sprintHeld = this.enabled && (shiftSprint || this.doubleTapSprintActive);
    const sprintPressed = this.enabled && (this.sprintPressedSinceLastTick || this.doubleTapSprintActive);

    const ctrlSneak = this.keys.has('ControlLeft') || this.keys.has('ControlRight') || this.keys.has('KeyC');
    const sneakHeld = this.enabled && (ctrlSneak || this.touchSneak);
    const sneakPressed = this.enabled && this.sneakPressedSinceLastTick;

    const attackPressed = this.enabled && this.attackPressedSinceLastTick;
    const attackHeld = this.enabled && this.mouseButtons.has(0);
    const usePressed = this.enabled && this.usePressedSinceLastTick;
    const useHeld = this.enabled && this.mouseButtons.has(2);

    // Reset single-frame pulse flags
    this.jumpPressedSinceLastTick = false;
    this.sprintPressedSinceLastTick = false;
    this.sneakPressedSinceLastTick = false;
    this.attackPressedSinceLastTick = false;
    this.usePressedSinceLastTick = false;

    // If forward key was released, stop double-tap sprint
    if (!forward) {
      this.doubleTapSprintActive = false;
    }

    return {
      forward,
      backward,
      left,
      right,
      jumpPressed,
      jumpHeld,
      sprintPressed,
      sprintHeld,
      sneakPressed,
      sneakHeld,
      attackPressed,
      attackHeld,
      usePressed,
      useHeld,
      analogX: this.touchMoveX,
      analogZ: this.touchMoveZ,
    };
  }

  consumeLookDeltas(): { dx: number; dy: number } {
    const dx = this.mouseDeltaX;
    const dy = this.mouseDeltaY;
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    return { dx, dy };
  }

  clearJumpBuffer(): void {
    this.jumpBufferTimer = 0;
    this.jumpPressedSinceLastTick = false;
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (!this.enabled) return;

    if (e.code === 'F3') {
      e.preventDefault();
      (window as any).CAMERA_DEBUG = !(window as any).CAMERA_DEBUG;
      return;
    }

    if (e.code === 'KeyW' && !this.keys.has('KeyW')) {
      const now = performance.now() / 1000;
      if (now - this.lastForwardPressTime <= PlayerConfig.camera.doubleTapSprintWindow) {
        this.doubleTapSprintActive = true;
      }
      this.lastForwardPressTime = now;
    }

    if (e.code === 'Space' && !this.keys.has('Space')) {
      this.jumpPressedSinceLastTick = true;
      this.jumpBufferTimer = PlayerConfig.camera.jumpBufferTime;
    }

    if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !this.keys.has(e.code)) {
      this.sprintPressedSinceLastTick = true;
    }

    if ((e.code === 'ControlLeft' || e.code === 'ControlRight' || e.code === 'KeyC') && !this.keys.has(e.code)) {
      this.sneakPressedSinceLastTick = true;
    }

    this.keys.add(e.code);
  }

  private onKeyUp(e: KeyboardEvent): void {
    this.keys.delete(e.code);
    if (e.code === 'KeyW') {
      this.doubleTapSprintActive = false;
    }
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.locked || !this.enabled) return;
    this.mouseDeltaX += e.movementX;
    this.mouseDeltaY += e.movementY;
  }

  private onMouseDown(e: MouseEvent): void {
    if (!this.locked || !this.enabled) return;
    this.mouseButtons.add(e.button);
    if (e.button === 0) this.attackPressedSinceLastTick = true;
    if (e.button === 2) this.usePressedSinceLastTick = true;
  }

  private onMouseUp(e: MouseEvent): void {
    this.mouseButtons.delete(e.button);
  }

  private onCanvasClick(): void {
    if (this.touchMode) return;
    if (!this.locked && this.enabled) {
      this.canvas.requestPointerLock?.();
    }
  }

  private onPointerLockChange(): void {
    this.locked = typeof document !== 'undefined' && document.pointerLockElement === this.canvas;
    if (!this.locked) {
      this.mouseButtons.clear();
    }
  }

  private bindEvents(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.onKeyDownBound);
      window.addEventListener('keyup', this.onKeyUpBound);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('mousemove', this.onMouseMoveBound);
      document.addEventListener('mousedown', this.onMouseDownBound);
      document.addEventListener('mouseup', this.onMouseUpBound);
      document.addEventListener('pointerlockchange', this.onPointerLockChangeBound);
    }
    if (this.canvas && typeof this.canvas.addEventListener === 'function') {
      this.canvas.addEventListener('click', this.onCanvasClickBound);
    }
  }

  dispose(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.onKeyDownBound);
      window.removeEventListener('keyup', this.onKeyUpBound);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('mousemove', this.onMouseMoveBound);
      document.removeEventListener('mousedown', this.onMouseDownBound);
      document.removeEventListener('mouseup', this.onMouseUpBound);
      document.removeEventListener('pointerlockchange', this.onPointerLockChangeBound);
    }
    if (this.canvas && typeof this.canvas.removeEventListener === 'function') {
      this.canvas.removeEventListener('click', this.onCanvasClickBound);
    }
    this.keys.clear();
    this.mouseButtons.clear();
  }
}
