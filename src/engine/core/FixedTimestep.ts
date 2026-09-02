/**
 * Fixed-timestep accumulator for deterministic simulation.
 *
 * Render frames vary; simulation must not. Call `addTime(dt)` once per frame,
 * run simulation while `hasStep`, then render with `alpha` interpolation.
 *
 * The accumulated time is clamped (`maxAccumulated`) so a long hitch (tab
 * switch, breakpoint) produces a bounded catch-up burst instead of a
 * death spiral of hundreds of simulation steps.
 */
export class FixedTimestep {
  readonly step: number;
  private readonly maxAccumulated: number;
  private accumulator = 0;

  /** @param step simulation step in seconds (default 0.05 = 20 Hz) */
  constructor(step = 0.05, maxAccumulated = 0.25) {
    if (!(step > 0)) throw new Error(`FixedTimestep: step must be > 0, got ${step}`);
    if (!(maxAccumulated >= step)) {
      throw new Error(`FixedTimestep: maxAccumulated (${maxAccumulated}) must be >= step (${step})`);
    }
    this.step = step;
    this.maxAccumulated = maxAccumulated;
  }

  /** Accumulate elapsed frame time (seconds). */
  addTime(dt: number): void {
    if (!(dt >= 0) || !Number.isFinite(dt)) return;
    this.accumulator += dt;
    if (this.accumulator > this.maxAccumulated) this.accumulator = this.maxAccumulated;
  }

  hasStep(): boolean {
    return this.accumulator >= this.step;
  }

  /** Mark one simulation step as consumed. */
  consumeStep(): void {
    this.accumulator = Math.max(0, this.accumulator - this.step);
  }

  /** Interpolation factor [0, 1) between the last and next simulated state. */
  get alpha(): number {
    return this.accumulator / this.step;
  }

  /** Seconds currently buffered (for diagnostics). */
  get pending(): number {
    return this.accumulator;
  }

  reset(): void {
    this.accumulator = 0;
  }
}
