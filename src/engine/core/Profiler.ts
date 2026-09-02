export interface ProfilerStats {
  count: number;
  last: number;
  avg: number;
  min: number;
  max: number;
}

const DEFAULT_WINDOW = 120;

/**
 * Lightweight rolling-window profiler. Records named millisecond samples
 * (frame time, chunk generation, meshing, …) and exposes aggregate stats.
 *
 * Deliberately allocation-free on the hot path: samples land in a fixed
 * circular buffer per metric. This is the measurement layer that quality
 * auto-tuning and perf regression checks read from — no guessing.
 */
export class Profiler {
  private readonly windowSize: number;
  private samples = new Map<string, { buf: Float64Array; head: number; count: number }>();

  constructor(windowSize = DEFAULT_WINDOW) {
    this.windowSize = windowSize;
  }

  /** Record one sample in milliseconds. */
  record(name: string, durationMs: number): void {
    if (!Number.isFinite(durationMs)) return;
    let slot = this.samples.get(name);
    if (!slot) {
      slot = { buf: new Float64Array(this.windowSize), head: 0, count: 0 };
      this.samples.set(name, slot);
    }
    slot.buf[slot.head] = durationMs;
    slot.head = (slot.head + 1) % this.windowSize;
    if (slot.count < this.windowSize) slot.count++;
  }

  /** Measure a section: `const end = profiler.begin('mesh'); …; end();` */
  begin(name: string): () => void {
    const t0 = performance.now();
    let done = false;
    return () => {
      if (done) return; // idempotent: double-dispose must not double-record
      done = true;
      this.record(name, performance.now() - t0);
    };
  }

  /** Wrap a synchronous function, recording its duration every call. */
  measure<T>(name: string, fn: () => T): T {
    const end = this.begin(name);
    try {
      return fn();
    } finally {
      end();
    }
  }

  stats(name: string): ProfilerStats | null {
    const slot = this.samples.get(name);
    if (!slot || slot.count === 0) return null;
    const n = slot.count;
    let sum = 0;
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < n; i++) {
      const v = slot.buf[i]!;
      sum += v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const last = slot.buf[(slot.head - 1 + this.windowSize) % this.windowSize]!;
    return { count: n, last, avg: sum / n, min, max };
  }

  /** All metrics with data, keyed by name. */
  snapshot(): Record<string, ProfilerStats> {
    const out: Record<string, ProfilerStats> = {};
    for (const name of this.samples.keys()) {
      const s = this.stats(name);
      if (s) out[name] = s;
    }
    return out;
  }

  reset(): void {
    this.samples.clear();
  }
}

/** Shared engine-wide profiler. Subsystems may also own local instances. */
export const profiler = new Profiler();
