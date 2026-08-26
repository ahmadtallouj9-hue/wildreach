import {
  defaultRootPart,
  type ModAsset,
  type ModKeyframe,
  type ModPart,
} from './ModAsset';

export type ClipLoopMode = 'loop' | 'once' | 'hold';

/** Named animation clip (Blockbench / MagicaVoxel-style). */
export interface ModAnimationClip {
  id: string;
  name: string;
  /** Frames per second for timeline ↔ seconds conversion. */
  fps: number;
  /** Duration in frames (inclusive play range is [0, duration]). */
  duration: number;
  loop: ClipLoopMode;
  keyframes: ModKeyframe[];
}

export const DEFAULT_CLIP_FPS = 30;
export const DEFAULT_CLIP_DURATION = 48;

function maxFrame(keyframes: ModKeyframe[]): number {
  let max = 0;
  for (const kf of keyframes) max = Math.max(max, kf.frame);
  return max;
}

export function createAnimationClip(
  name: string,
  partial?: Partial<Omit<ModAnimationClip, 'name'>> & { id?: string },
): ModAnimationClip {
  const id = partial?.id ?? `clip-${Date.now().toString(36)}`;
  return {
    id,
    name,
    fps: partial?.fps ?? DEFAULT_CLIP_FPS,
    duration: partial?.duration ?? DEFAULT_CLIP_DURATION,
    loop: partial?.loop ?? 'loop',
    keyframes: partial?.keyframes ? [...partial.keyframes] : [],
  };
}

/** Wrap a legacy flat keyframe list into a single "default" clip. */
export function clipFromLegacyKeyframes(
  keyframes: ModKeyframe[],
  name = 'default',
): ModAnimationClip {
  const maxF = maxFrame(keyframes);
  return createAnimationClip(name, {
    id: 'clip-default',
    fps: DEFAULT_CLIP_FPS,
    duration: Math.max(DEFAULT_CLIP_DURATION, maxF),
    loop: 'loop',
    keyframes: [...keyframes],
  });
}

/** Ensure asset.clips exists; migrate flat keyframes when missing. */
export function ensureAssetClips(asset: ModAsset): ModAnimationClip[] {
  if (Array.isArray(asset.clips) && asset.clips.length > 0) {
    return asset.clips;
  }
  const clip = clipFromLegacyKeyframes(asset.keyframes ?? [], 'default');
  asset.clips = [clip];
  asset.keyframes = clip.keyframes;
  return asset.clips;
}

export function findClip(
  clips: ModAnimationClip[],
  nameOrId: string,
): ModAnimationClip | undefined {
  const q = nameOrId.trim().toLowerCase();
  return (
    clips.find((c) => c.id === nameOrId || c.name === nameOrId) ??
    clips.find((c) => c.name.toLowerCase() === q || c.id.toLowerCase() === q)
  );
}

export function clipDurationSeconds(clip: ModAnimationClip): number {
  const fps = clip.fps > 0 ? clip.fps : DEFAULT_CLIP_FPS;
  return clip.duration / fps;
}

export function frameToTime(frame: number, fps: number): number {
  return frame / (fps > 0 ? fps : DEFAULT_CLIP_FPS);
}

export function timeToFrame(timeSec: number, fps: number): number {
  return timeSec * (fps > 0 ? fps : DEFAULT_CLIP_FPS);
}

/** Sync legacy asset.keyframes from the active clip (editor compatibility). */
export function syncLegacyKeyframes(asset: ModAsset, activeClipId?: string): void {
  const clips = ensureAssetClips(asset);
  const active =
    (activeClipId ? findClip(clips, activeClipId) : undefined) ?? clips[0]!;
  asset.keyframes = active.keyframes;
}

export function duplicateClip(clip: ModAnimationClip, newName?: string): ModAnimationClip {
  return createAnimationClip(newName ?? `${clip.name} copy`, {
    fps: clip.fps,
    duration: clip.duration,
    loop: clip.loop,
    keyframes: clip.keyframes.map((k) => ({
      ...k,
      position: { ...k.position },
      rotation: { ...k.rotation },
      scale: k.scale ? { ...k.scale } : undefined,
      ease: k.ease ? { ...k.ease } : undefined,
    })),
  });
}

/** Parts helper for empty assets. */
export function ensureParts(parts: ModPart[] | undefined): ModPart[] {
  return parts?.length ? parts : [defaultRootPart()];
}
