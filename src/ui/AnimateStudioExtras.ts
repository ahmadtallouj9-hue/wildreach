import {
  DEFAULT_EASE_TYPE,
  quatFromEulerYXZ,
  upsertKeyframe,
} from '../modding/ModAnimation';
import type { ModKeyframe, ModMotionPreset, ModPart, Quat, Vec3 } from '../modding/ModAsset';
import {
  createAnimationClip,
  duplicateClip,
  ensureAssetClips,
  type ClipLoopMode,
  type ModAnimationClip,
} from '../modding/ModClip';
import {
  growSelection,
  invertSolidSelection,
  newPartId,
  partCentroid,
  selectPartVoxels,
} from '../modding/PartAssignment';
import type { VoxelEditorViewport } from '../modding/VoxelEditorViewport';

export interface PoseClipboard {
  position: Vec3;
  rotation: Quat;
  scale: Vec3;
  euler: { y: number; x: number; z: number };
}

/** Host surface that AnimateStudioExtras mutates / calls back into. */
export interface AnimateStudioHost {
  root: HTMLElement;
  viewport: VoxelEditorViewport;
  parts: ModPart[];
  keyframes: ModKeyframe[];
  clips: ModAnimationClip[];
  activeClipId: string;
  frame: number;
  maxFrame: number;
  selectedPartId: string;
  selectedKey: { partId: string; frame: number } | null;
  liveEuler: { y: number; x: number; z: number };
  livePos: Vec3;
  liveScale: Vec3;
  autoKey: boolean;
  snapToKeys: boolean;
  gizmoMode: 'rotate' | 'translate' | 'scale' | 'off';
  playing: boolean;

  setHint(msg: string): void;
  emitChange(): void;
  applyPreview(fromGizmo?: boolean, scrubbing?: boolean): void;
  refreshAll(): void;
  refreshTree(): void;
  refreshTimeline(): void;
  syncPartFields(): void;
  syncRotFromPose(): void;
  syncMotionPresets(): void;
  updateTimecode(): void;
  updateSelectStats(n: number): void;
  selectPart(id: string): void;
  scrubTo(frame: number): void;
  addKeyframeAtFrame(frame?: number): void;
  deleteKeyframe(partId: string, frame: number): void;
  stopPlay(): void;
  startPlay(): void;
  selectedPart(): ModPart | undefined;
  partIndex(): number;
  syncActiveClipFromState(): void;
  loadActiveClipIntoState(): void;
  setGizmoMode(mode: 'rotate' | 'translate' | 'scale' | 'off'): void;
}

let poseClipboard: PoseClipboard | null = null;

export function bindAnimateStudioExtras(host: AnimateStudioHost): void {
  const root = host.root;
  const vp = host.viewport;

  const on = (action: string, fn: () => void) => {
    root.querySelectorAll(`[data-action="${action}"]`).forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        fn();
      });
    });
  };

  // —— Clips ——
  const clipSelect = root.querySelector('.mod-clip-select') as HTMLSelectElement | null;
  const clipName = root.querySelector('.mod-clip-name') as HTMLInputElement | null;
  const clipFps = root.querySelector('.mod-clip-fps') as HTMLInputElement | null;
  const clipLen = root.querySelector('.mod-clip-len') as HTMLInputElement | null;

  const refreshClipUi = () => {
    if (!clipSelect) return;
    clipSelect.innerHTML = '';
    for (const c of host.clips) {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      clipSelect.appendChild(opt);
    }
    clipSelect.value = host.activeClipId;
    const active = host.clips.find((c) => c.id === host.activeClipId);
    if (active) {
      if (clipName) clipName.value = active.name;
      if (clipFps) clipFps.value = String(active.fps);
      if (clipLen) clipLen.value = String(active.duration);
      root.querySelectorAll('[data-loop]').forEach((b) => {
        b.classList.toggle('active', (b as HTMLElement).dataset.loop === active.loop);
      });
    }
  };
  (host as AnimateStudioHost & { refreshClipUi?: () => void }).refreshClipUi = refreshClipUi;

  clipSelect?.addEventListener('change', () => {
    host.syncActiveClipFromState();
    host.activeClipId = clipSelect.value;
    host.loadActiveClipIntoState();
    host.refreshAll();
    host.applyPreview();
    refreshClipUi();
    host.setHint(`Clip “${host.clips.find((c) => c.id === host.activeClipId)?.name ?? ''}”`);
  });

  clipName?.addEventListener('change', () => {
    const c = host.clips.find((x) => x.id === host.activeClipId);
    if (!c || !clipName.value.trim()) return;
    c.name = clipName.value.trim().slice(0, 24);
    refreshClipUi();
    host.emitChange();
  });

  clipFps?.addEventListener('change', () => {
    const c = host.clips.find((x) => x.id === host.activeClipId);
    if (!c) return;
    c.fps = Math.max(1, Math.min(120, Number(clipFps.value) || 30));
    host.emitChange();
  });

  clipLen?.addEventListener('change', () => {
    const c = host.clips.find((x) => x.id === host.activeClipId);
    if (!c) return;
    c.duration = Math.max(1, Math.min(600, Number(clipLen.value) || 48));
    host.maxFrame = Math.max(host.maxFrame, c.duration);
    host.emitChange();
    host.refreshTimeline();
    host.updateTimecode();
  });

  root.querySelector('[data-loop-row]')?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('[data-loop]') as HTMLElement | null;
    if (!btn) return;
    const c = host.clips.find((x) => x.id === host.activeClipId);
    if (!c) return;
    c.loop = btn.dataset.loop as ClipLoopMode;
    refreshClipUi();
    host.emitChange();
  });

  on('clip-new', () => {
    host.syncActiveClipFromState();
    const clip = createAnimationClip(`Clip ${host.clips.length + 1}`, {
      fps: 30,
      duration: 48,
      loop: 'loop',
      keyframes: [],
    });
    host.clips.push(clip);
    host.activeClipId = clip.id;
    host.loadActiveClipIntoState();
    host.refreshAll();
    refreshClipUi();
    host.emitChange();
    host.setHint(`Created clip “${clip.name}”`);
  });

  on('clip-dup', () => {
    host.syncActiveClipFromState();
    const cur = host.clips.find((c) => c.id === host.activeClipId);
    if (!cur) return;
    const copy = duplicateClip(cur);
    host.clips.push(copy);
    host.activeClipId = copy.id;
    host.loadActiveClipIntoState();
    host.refreshAll();
    refreshClipUi();
    host.emitChange();
    host.setHint(`Duplicated “${copy.name}”`);
  });

  // —— Hierarchy ——
  on('dup-part', () => {
    const src = host.selectedPart();
    if (!src || src.id === 'root') {
      host.setHint('Select a non-Body part to duplicate');
      return;
    }
    const id = newPartId(host.parts);
    host.parts.push({
      ...src,
      id,
      name: `${src.name} copy`,
      pivot: { ...src.pivot },
      parentId: src.parentId ?? 'root',
    });
    host.selectedPartId = id;
    host.refreshAll();
    if (host.root.isConnected) vp.setAnimateMode(true, host.parts);
    host.emitChange();
    host.setHint(`Duplicated ${src.name}`);
  });

  on('del-part', () => {
    const part = host.selectedPart();
    if (!part || part.id === 'root') {
      host.setHint('Cannot delete Body');
      return;
    }
    const idx = host.partIndex();
    host.parts = host.parts.filter((p) => p.id !== part.id);
    for (const p of host.parts) {
      if (p.parentId === part.id) p.parentId = 'root';
    }
    host.keyframes = host.keyframes.filter((k) => k.partId !== part.id);
    // Remap part mask indices after removal
    if (idx >= 0) {
      const mask = vp.getPartMask();
      for (let i = 0; i < mask.length; i++) {
        if (mask[i] === idx) mask[i] = 0;
        else if (mask[i]! > idx) mask[i]!--;
      }
    }
    host.selectedPartId = 'root';
    host.refreshAll();
    vp.setAnimateMode(true, host.parts);
    host.emitChange();
    host.setHint(`Deleted ${part.name}`);
  });

  on('isolate-part', () => {
    const id = host.selectedPartId;
    for (const p of host.parts) {
      if (p.id === 'root') continue;
      p.hidden = p.id !== id;
    }
    host.refreshTree();
    vp.setPartVisibility(host.parts);
    host.emitChange();
  });

  on('show-all-parts', () => {
    for (const p of host.parts) p.hidden = false;
    host.refreshTree();
    vp.setPartVisibility(host.parts);
    host.emitChange();
  });

  const parentSelect = root.querySelector('.mod-part-parent') as HTMLSelectElement | null;
  parentSelect?.addEventListener('change', () => {
    const part = host.selectedPart();
    if (!part || part.id === 'root') return;
    const pid = parentSelect.value;
    if (pid === part.id) return;
    part.parentId = pid || undefined;
    host.emitChange();
    vp.setAnimateMode(true, host.parts);
    host.applyPreview();
    host.refreshTree();
  });

  // —— Pivot / pose ——
  on('pivot-center', () => {
    const idx = host.partIndex();
    const part = host.selectedPart();
    if (!part || idx < 0) return;
    const c = partCentroid(vp.getPartMask(), vp.grid, idx);
    if (!c) {
      host.setHint('No voxels in this part');
      return;
    }
    part.pivot = c;
    host.syncPartFields();
    vp.setAnimateMode(true, host.parts);
    host.applyPreview();
    host.emitChange();
    host.setHint(`Pivot → ${c.x}, ${c.y}, ${c.z}`);
  });

  on('pivot-origin', () => {
    const part = host.selectedPart();
    if (!part) return;
    part.pivot = { x: 8, y: 8, z: 8 };
    host.syncPartFields();
    vp.setAnimateMode(true, host.parts);
    host.applyPreview();
    host.emitChange();
  });

  on('pose-reset', () => {
    host.liveEuler = { y: 0, x: 0, z: 0 };
    host.livePos = { x: 0, y: 0, z: 0 };
    host.liveScale = { x: 1, y: 1, z: 1 };
    host.syncRotFromPose();
    host.applyPreview();
    if (host.autoKey) host.addKeyframeAtFrame(Math.round(host.frame));
    host.setHint('Pose reset');
  });

  on('pose-copy', () => {
    poseClipboard = {
      position: { ...host.livePos },
      rotation: quatFromEulerYXZ(host.liveEuler.y, host.liveEuler.x, host.liveEuler.z),
      scale: { ...host.liveScale },
      euler: { ...host.liveEuler },
    };
    host.setHint('Pose copied');
  });

  on('pose-paste', () => {
    if (!poseClipboard) {
      host.setHint('Clipboard empty');
      return;
    }
    host.livePos = { ...poseClipboard.position };
    host.liveEuler = { ...poseClipboard.euler };
    host.liveScale = { ...poseClipboard.scale };
    host.syncRotFromPose();
    host.applyPreview();
    if (host.autoKey) host.addKeyframeAtFrame(Math.round(host.frame));
    host.setHint('Pose pasted');
  });

  on('pose-mirror-x', () => {
    host.livePos = { ...host.livePos, x: -host.livePos.x };
    host.liveEuler = { ...host.liveEuler, y: -host.liveEuler.y, z: -host.liveEuler.z };
    host.syncRotFromPose();
    host.applyPreview();
    if (host.autoKey) host.addKeyframeAtFrame(Math.round(host.frame));
    host.setHint('Mirrored pose on X');
  });

  on('focus-part', () => {
    const part = host.selectedPart();
    if (!part) return;
    vp.focusOn(part.pivot.x, part.pivot.y, part.pivot.z);
    host.setHint(`Focused ${part.name}`);
  });

  // —— Selection ——
  on('sel-part', () => {
    const idx = host.partIndex();
    if (idx < 0) return;
    vp.setVoxelSelectMode(true, 'custom');
    host.setGizmoMode('off');
    const n = selectPartVoxels(vp.getVoxelSelection(), vp.getPartMask(), vp.grid, idx);
    vp.notifyVoxelSelectionChanged();
    host.updateSelectStats(n);
    host.setHint(`Selected ${n} voxels in part`);
  });

  on('sel-invert', () => {
    vp.setVoxelSelectMode(true, host.viewport.getVoxelSelectStyle());
    const n = invertSolidSelection(vp.getVoxelSelection(), vp.grid);
    vp.notifyVoxelSelectionChanged();
    host.updateSelectStats(n);
  });

  on('sel-grow', () => {
    vp.setVoxelSelectMode(true, host.viewport.getVoxelSelectStyle());
    const n = growSelection(vp.getVoxelSelection(), vp.grid);
    vp.notifyVoxelSelectionChanged();
    host.updateSelectStats(n);
    host.setHint(`Selection grown · ${n} voxels`);
  });

  // —— Timeline transport ——
  on('tl-start', () => host.scrubTo(0));
  on('tl-end', () => host.scrubTo(host.maxFrame));
  on('tl-frame-back', () => host.scrubTo(Math.round(host.frame) - 1));
  on('tl-frame-fwd', () => host.scrubTo(Math.round(host.frame) + 1));
  on('tl-prev-key', () => {
    const keys = host.keyframes
      .filter((k) => k.partId === host.selectedPartId)
      .map((k) => k.frame)
      .sort((a, b) => a - b);
    const cur = Math.round(host.frame);
    const prev = [...keys].reverse().find((f) => f < cur);
    host.scrubTo(prev ?? 0);
  });
  on('tl-next-key', () => {
    const keys = host.keyframes
      .filter((k) => k.partId === host.selectedPartId)
      .map((k) => k.frame)
      .sort((a, b) => a - b);
    const cur = Math.round(host.frame);
    const next = keys.find((f) => f > cur);
    host.scrubTo(next ?? host.maxFrame);
  });

  on('tl-key-all', () => {
    const f = Math.round(host.frame);
    for (const p of host.parts) {
      const pose = {
        position: p.id === host.selectedPartId ? { ...host.livePos } : { x: 0, y: 0, z: 0 },
        rotation:
          p.id === host.selectedPartId
            ? quatFromEulerYXZ(host.liveEuler.y, host.liveEuler.x, host.liveEuler.z)
            : { x: 0, y: 0, z: 0, w: 1 },
        scale: p.id === host.selectedPartId ? { ...host.liveScale } : { x: 1, y: 1, z: 1 },
      };
      // Prefer sampling existing pose for non-selected
      host.keyframes = upsertKeyframe(host.keyframes, {
        frame: f,
        partId: p.id,
        position: pose.position,
        rotation: pose.rotation,
        scale: pose.scale,
        easeType: DEFAULT_EASE_TYPE,
      });
    }
    host.maxFrame = Math.max(host.maxFrame, f);
    host.refreshAll();
    host.emitChange();
    host.setHint(`Keyed all parts @ ${f}`);
  });

  on('tl-key-dup', () => {
    if (!host.selectedKey) {
      host.setHint('Select a ◆ key first');
      return;
    }
    const src = host.keyframes.find(
      (k) => k.partId === host.selectedKey!.partId && k.frame === host.selectedKey!.frame,
    );
    if (!src) return;
    const to = Math.min(host.maxFrame, src.frame + 4);
    host.keyframes = upsertKeyframe(host.keyframes, {
      ...src,
      frame: to,
      position: { ...src.position },
      rotation: { ...src.rotation },
      scale: src.scale ? { ...src.scale } : undefined,
      ease: src.ease ? { ...src.ease } : undefined,
    });
    host.refreshAll();
    host.emitChange();
    host.scrubTo(to);
    host.setHint(`Duplicated key → ${to}`);
  });

  on('tl-key-del', () => {
    if (!host.selectedKey) return;
    host.deleteKeyframe(host.selectedKey.partId, host.selectedKey.frame);
  });

  // —— Toggles ——
  const autoKey = root.querySelector('.mod-autokey-check') as HTMLInputElement | null;
  autoKey?.addEventListener('change', () => {
    host.autoKey = autoKey.checked;
  });
  const snapKeys = root.querySelector('.mod-snap-keys-check') as HTMLInputElement | null;
  snapKeys?.addEventListener('change', () => {
    host.snapToKeys = snapKeys.checked;
  });

  // —— Scale inputs ——
  root.querySelectorAll('[data-sn]').forEach((el) => {
    el.addEventListener('input', () => {
      const x = Number((root.querySelector('[data-sn="x"]') as HTMLInputElement).value) || 1;
      const y = Number((root.querySelector('[data-sn="y"]') as HTMLInputElement).value) || 1;
      const z = Number((root.querySelector('[data-sn="z"]') as HTMLInputElement).value) || 1;
      host.liveScale = { x, y, z };
      host.applyPreview(true);
      if (host.autoKey) host.addKeyframeAtFrame(Math.round(host.frame));
    });
  });

  // —— Motion off ——
  root.querySelector('[data-motion="none"]')?.addEventListener('click', () => {
    const part = host.selectedPart();
    if (!part) return;
    part.motionPreset = undefined;
    host.syncMotionPresets();
    host.emitChange();
    host.applyPreview();
  });

  // —— Expanded keyboard ——
  window.addEventListener('keydown', (e) => {
    if (!host.root.isConnected || host.root.hidden) return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      host.scrubTo(Math.round(host.frame) - (e.shiftKey ? 5 : 1));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      host.scrubTo(Math.round(host.frame) + (e.shiftKey ? 5 : 1));
    } else if (e.key === '[') {
      e.preventDefault();
      root.querySelector<HTMLButtonElement>('[data-action="tl-prev-key"]')?.click();
    } else if (e.key === ']') {
      e.preventDefault();
      root.querySelector<HTMLButtonElement>('[data-action="tl-next-key"]')?.click();
    } else if (e.key === 'Home') {
      e.preventDefault();
      host.scrubTo(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      host.scrubTo(host.maxFrame);
    } else if (e.key === 'k' || e.key === 'K') {
      e.preventDefault();
      host.addKeyframeAtFrame(Math.round(host.frame));
    } else if (e.key === ' ') {
      e.preventDefault();
      if (host.playing) host.stopPlay();
      else host.startPlay();
    }
  });

  refreshClipUi();
}

/** Ensure clips array exists on a host that just loaded parts/keys. */
export function bootstrapClips(
  keyframes: ModKeyframe[],
  existing?: ModAnimationClip[],
): { clips: ModAnimationClip[]; activeId: string } {
  const asset = {
    version: 1 as const,
    name: '',
    shape: { version: 1 as const, size: 16, voxels: [] as number[] },
    parts: [],
    keyframes,
    clips: existing,
    scripts: [],
  };
  const clips = ensureAssetClips(asset);
  return { clips, activeId: clips[0]!.id };
}

export type { ModMotionPreset };
