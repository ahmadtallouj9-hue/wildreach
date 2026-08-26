/** Central animation clock for VYTHERA UI backgrounds. */
export type ClockSpeedProfile = {
  /** Global motion multiplier (animation level × reduced-motion). */
  motion: number;
  /** Whether the clock should advance at all. */
  running: boolean;
};

export class AnimationClock {
  /** Elapsed seconds while running. */
  readonly time = { value: 0 };
  private last = 0;
  private active = false;
  private profile: ClockSpeedProfile = { motion: 1, running: true };

  setProfile(profile: ClockSpeedProfile): void {
    this.profile = profile;
  }

  start(): void {
    this.active = true;
    this.last = performance.now();
  }

  stop(): void {
    this.active = false;
  }

  /** Advance time; returns effective delta for this frame. */
  tick(now: number): number {
    if (!this.active || !this.profile.running) {
      this.last = now;
      return 0;
    }
    const raw = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const dt = raw * this.profile.motion;
    this.time.value += dt;
    return dt;
  }

  reset(): void {
    this.time.value = 0;
    this.last = performance.now();
  }
}

/** Seamless horizontal wrap for layer offsets. */
export function wrapOffset(x: number, span: number): number {
  if (span <= 0) return x;
  let v = x % span;
  if (v < 0) v += span;
  return v;
}
