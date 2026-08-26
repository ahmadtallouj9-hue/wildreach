import {
  sampleAllPartPoses,
  maxKeyframeFrame,
  type PartPose,
} from './ModAnimation';
import type { ModPart } from './ModAsset';
import {
  clipDurationSeconds,
  DEFAULT_CLIP_FPS,
  findClip,
  frameToTime,
  timeToFrame,
  type ClipLoopMode,
  type ModAnimationClip,
} from './ModClip';

export type PlayerState = 'stopped' | 'playing' | 'paused';

export interface AnimationPlayerOptions {
  /** Invoked when a non-looping clip finishes. */
  onComplete?: (clip: ModAnimationClip) => void;
  /** Invoked every tick after sampling (optional). */
  onSample?: (poses: Map<string, PartPose>, timeSec: number, frame: number) => void;
}

/** Prefer last keyframe as clip end so playback does not run past authored keys. */
function playDurationSeconds(clip: ModAnimationClip): number {
  const fps = clip.fps > 0 ? clip.fps : DEFAULT_CLIP_FPS;
  const lastKey = maxKeyframeFrame(clip.keyframes);
  if (lastKey > 0) return lastKey / fps;
  return clipDurationSeconds(clip);
}

/**
 * Blockbench-style animation playback controller.
 * Headless: samples PartPoses; caller applies them to skeleton / meshes.
 */
export class AnimationPlayer {
  private parts: ModPart[] = [];
  private clips: ModAnimationClip[] = [];
  private active: ModAnimationClip | null = null;
  private state: PlayerState = 'stopped';
  private currentTime = 0;
  private playbackSpeed = 1;
  private readonly opts: AnimationPlayerOptions;
  private lastPoses = new Map<string, PartPose>();

  constructor(opts: AnimationPlayerOptions = {}) {
    this.opts = opts;
  }

  setParts(parts: ModPart[]): void {
    this.parts = parts;
  }

  setClips(clips: ModAnimationClip[]): void {
    this.clips = clips;
    if (this.active && !findClip(clips, this.active.id)) {
      this.active = clips[0] ?? null;
      this.currentTime = 0;
      this.state = 'stopped';
    }
  }

  getClips(): ModAnimationClip[] {
    return this.clips;
  }

  getActiveClip(): ModAnimationClip | null {
    return this.active;
  }

  getState(): PlayerState {
    return this.state;
  }

  isPlaying(): boolean {
    return this.state === 'playing';
  }

  getCurrentTime(): number {
    return this.currentTime;
  }

  getCurrentFrame(): number {
    const fps = this.active?.fps ?? DEFAULT_CLIP_FPS;
    return timeToFrame(this.currentTime, fps);
  }

  setPlaybackSpeed(speed: number): void {
    this.playbackSpeed = Math.max(0.01, speed);
  }

  getPlaybackSpeed(): number {
    return this.playbackSpeed;
  }

  /** Seek to a time in seconds (clamped / wrapped per loop mode). */
  seek(timeSec: number): Map<string, PartPose> {
    this.currentTime = this.normalizeTime(timeSec);
    return this.sample();
  }

  seekFrame(frame: number): Map<string, PartPose> {
    const fps = this.active?.fps ?? DEFAULT_CLIP_FPS;
    return this.seek(frameToTime(frame, fps));
  }

  play(nameOrId?: string): boolean {
    if (nameOrId) {
      const clip = findClip(this.clips, nameOrId);
      if (!clip) return false;
      this.active = clip;
    } else if (!this.active) {
      this.active = this.clips[0] ?? null;
    }
    if (!this.active) return false;
    if (this.state === 'stopped') this.currentTime = 0;
    this.state = 'playing';
    return true;
  }

  pause(): void {
    if (this.state === 'playing') this.state = 'paused';
  }

  stop(): void {
    this.state = 'stopped';
    this.currentTime = 0;
    this.sample();
  }

  /**
   * Advance playback by delta milliseconds (game / editor loop).
   * Returns sampled poses for the current time.
   */
  update(deltaMs: number): Map<string, PartPose> {
    if (this.state === 'playing' && this.active) {
      const dt = (deltaMs / 1000) * this.playbackSpeed;
      const duration = playDurationSeconds(this.active);
      let next = this.currentTime + dt;
      const finished = this.advanceTime(next, duration, this.active.loop);
      if (finished) {
        this.state = 'stopped';
        this.opts.onComplete?.(this.active);
      }
    }
    return this.sample();
  }

  /** Sample poses at currentTime without advancing. */
  sample(): Map<string, PartPose> {
    if (!this.active || !this.parts.length) {
      this.lastPoses = new Map();
      return this.lastPoses;
    }
    const frame = timeToFrame(this.currentTime, this.active.fps);
    this.lastPoses = sampleAllPartPoses(this.parts, this.active.keyframes, frame);
    this.opts.onSample?.(this.lastPoses, this.currentTime, frame);
    return this.lastPoses;
  }

  getLastPoses(): Map<string, PartPose> {
    return this.lastPoses;
  }

  private normalizeTime(timeSec: number): number {
    if (!this.active) return Math.max(0, timeSec);
    const duration = playDurationSeconds(this.active);
    if (duration <= 0) return 0;
    if (this.active.loop === 'loop') {
      const t = timeSec % duration;
      return t < 0 ? t + duration : t;
    }
    return Math.max(0, Math.min(duration, timeSec));
  }

  /** Returns true if a once-clip completed. */
  private advanceTime(next: number, duration: number, mode: ClipLoopMode): boolean {
    if (duration <= 0) {
      this.currentTime = 0;
      return mode === 'once';
    }
    if (mode === 'loop') {
      this.currentTime = ((next % duration) + duration) % duration;
      return false;
    }
    if (mode === 'hold') {
      this.currentTime = Math.min(next, duration);
      return false;
    }
    // once
    if (next >= duration) {
      this.currentTime = duration;
      return true;
    }
    this.currentTime = Math.max(0, next);
    return false;
  }
}
