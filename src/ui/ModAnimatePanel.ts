import {
  DEFAULT_EASE_TYPE,
  eulerYXZFromQuat,
  KEYFRAME_EASE,
  maxKeyframeFrame,
  normalizeEase,
  quatFromEulerYXZ,
  resolveEaseType,
  sampleAllPartPoses,
  samplePartPose,
  upsertKeyframe,
  type EaseType,
} from '../modding/ModAnimation';
import { EASE_BEZIER_PRESETS, EASE_TYPE_OPTIONS } from '../modding/Easing';
import {
  defaultRootPart,
  type ModEaseCurve,
  type ModKeyframe,
  type ModMotionPreset,
  type ModPart,
  type Vec3,
} from '../modding/ModAsset';
import type { ModAnimationClip } from '../modding/ModClip';
import {
  assignBoxToPart,
  assignSelectionToPart,
  countVoxelsForPart,
  newPartId,
  selectionPivot,
} from '../modding/PartAssignment';
import type { VoxelEditorViewport } from '../modding/VoxelEditorViewport';
import { AnimateCurveEditor } from './AnimateCurveEditor';
import {
  bindAnimateStudioExtras,
  bootstrapClips,
  type AnimateStudioHost,
} from './AnimateStudioExtras';
import { ANIMATE_STUDIO_HTML } from './animateStudioHtml';
import { CapCutTimeline, type EaseSegment } from './CapCutTimeline';

const DEFAULT_FRAMES = 48;
const FPS = 30;

export interface AnimateState {
  parts: ModPart[];
  keyframes: ModKeyframe[];
  clips?: ModAnimationClip[];
  activeClipId?: string;
}

/** Four-panel Animation Studio with CapCut-style multi-track timeline. */
export class ModAnimatePanel {
  readonly root: HTMLElement;
  private readonly viewport: VoxelEditorViewport;
  private readonly treeEl: HTMLElement;
  private readonly partNameInput: HTMLInputElement;
  private readonly pivotInputs: HTMLInputElement[];
  private readonly rotInputs: HTMLInputElement[];
  private readonly rotNumInputs: HTMLInputElement[];
  private readonly posNumInputs: HTMLInputElement[];
  private readonly boxInputs: HTMLInputElement[];
  private readonly partStatsEl: HTMLElement;
  private readonly playBtn: HTMLButtonElement;
  private readonly keyToggleBtn: HTMLButtonElement;
  private readonly curvesBtn: HTMLButtonElement;
  private readonly curvesPanel: HTMLElement;
  private readonly speedSlider: HTMLInputElement;
  private readonly speedLabel: HTMLElement;
  private readonly timeEl: HTMLElement;
  private readonly frameLabel: HTMLElement;
  private readonly easeSelect: HTMLSelectElement;
  private readonly selectStatsEl: HTMLElement;
  private readonly curveEditor: AnimateCurveEditor;
  private readonly timeline: CapCutTimeline;
  private onChange: (state: AnimateState) => void;

  parts: ModPart[] = [defaultRootPart()];
  keyframes: ModKeyframe[] = [];
  clips: ModAnimationClip[] = [];
  activeClipId = '';
  frame = 0;
  maxFrame = DEFAULT_FRAMES;
  playing = false;
  private playSpeed = 1;
  selectedPartId = 'root';
  selectedKey: { partId: string; frame: number } | null = null;
  /** Both endpoints of the ease segment currently being edited (CapCut-style). */
  private easeSegment: EaseSegment | null = null;
  private active = false;
  liveEuler = { y: 0, x: 0, z: 0 };
  livePos = { x: 0, y: 0, z: 0 };
  liveScale: Vec3 = { x: 1, y: 1, z: 1 };
  autoKey = true;
  snapToKeys = false;
  gizmoMode: 'rotate' | 'translate' | 'scale' | 'off' = 'rotate';

  constructor(viewport: VoxelEditorViewport, onChange: (state: AnimateState) => void) {
    this.viewport = viewport;
    this.onChange = onChange;

    this.root = document.createElement('div');
    this.root.className = 'mod-animate-panel';
    this.root.hidden = true;
    this.root.innerHTML = ANIMATE_STUDIO_HTML;

    this.treeEl = this.root.querySelector('.mod-anim-tree') as HTMLElement;
    this.partNameInput = this.root.querySelector('.mod-part-name') as HTMLInputElement;
    this.partStatsEl = this.root.querySelector('.mod-part-stats') as HTMLElement;
    this.playBtn = this.root.querySelector('[data-action="anim-play"]') as HTMLButtonElement;
    this.keyToggleBtn = this.root.querySelector('[data-action="tl-key-toggle"]') as HTMLButtonElement;
    this.curvesBtn = this.root.querySelector('[data-action="tl-curves"]') as HTMLButtonElement;
    this.curvesPanel = this.root.querySelector('.mod-tl-curves-panel') as HTMLElement;
    this.speedSlider = this.root.querySelector('.mod-speed-slider') as HTMLInputElement;
    this.speedLabel = this.root.querySelector('.mod-speed-label') as HTMLElement;
    this.timeEl = this.root.querySelector('.mod-tl-time') as HTMLElement;
    this.frameLabel = this.root.querySelector('.mod-frame-label') as HTMLElement;
    this.easeSelect = this.root.querySelector('.mod-kf-ease-select') as HTMLSelectElement;
    this.selectStatsEl = this.root.querySelector('.mod-select-stats') as HTMLElement;
    for (const opt of EASE_TYPE_OPTIONS) {
      const el = document.createElement('option');
      el.value = opt.id;
      el.textContent = opt.label;
      this.easeSelect.appendChild(el);
    }
    this.pivotInputs = [
      this.root.querySelector('[data-axis="pivot"] [data-axis="x"]') as HTMLInputElement,
      this.root.querySelector('[data-axis="pivot"] [data-axis="y"]') as HTMLInputElement,
      this.root.querySelector('[data-axis="pivot"] [data-axis="z"]') as HTMLInputElement,
    ];
    this.rotInputs = [
      this.root.querySelector('[data-r="y"]') as HTMLInputElement,
      this.root.querySelector('[data-r="x"]') as HTMLInputElement,
      this.root.querySelector('[data-r="z"]') as HTMLInputElement,
    ];
    this.rotNumInputs = [
      this.root.querySelector('[data-rn="y"]') as HTMLInputElement,
      this.root.querySelector('[data-rn="x"]') as HTMLInputElement,
      this.root.querySelector('[data-rn="z"]') as HTMLInputElement,
    ];
    this.posNumInputs = [
      this.root.querySelector('[data-pn="x"]') as HTMLInputElement,
      this.root.querySelector('[data-pn="y"]') as HTMLInputElement,
      this.root.querySelector('[data-pn="z"]') as HTMLInputElement,
    ];
    const boxMin = this.root.querySelector('[data-axis="box-min"]')!;
    const boxMax = this.root.querySelector('[data-axis="box-max"]')!;
    this.boxInputs = [
      boxMin.querySelector('[data-b="x"]') as HTMLInputElement,
      boxMin.querySelector('[data-b="y"]') as HTMLInputElement,
      boxMin.querySelector('[data-b="z"]') as HTMLInputElement,
      boxMax.querySelector('[data-b="x"]') as HTMLInputElement,
      boxMax.querySelector('[data-b="y"]') as HTMLInputElement,
      boxMax.querySelector('[data-b="z"]') as HTMLInputElement,
    ];

    this.timeline = new CapCutTimeline(this.root.querySelector('.mod-anim-timeline') as HTMLElement, {
      onScrub: (f) => this.scrubTo(f),
      onSelectKeyframe: (partId, frame) => this.selectKeyframe(partId, frame),
      onRetimedKeyframe: (partId, from, to) => this.retimeKeyframe(partId, from, to),
      onSelectPart: (id) => this.selectPart(id),
    });

    this.curveEditor = new AnimateCurveEditor(
      this.root.querySelector('.mod-anim-curve-wrap') as HTMLElement,
    );
    this.curveEditor.bind((ease) => this.applyEaseToKeyframe(ease));

    this.bindControls();
    const boot = bootstrapClips(this.keyframes);
    this.clips = boot.clips;
    this.activeClipId = boot.activeId;
    bindAnimateStudioExtras(this as unknown as AnimateStudioHost);
    this.refreshAll();

    const onionCheck = this.root.querySelector('.mod-onion-check') as HTMLInputElement;
    onionCheck.addEventListener('change', () => {
      this.viewport.setOnionSkin(onionCheck.checked);
      this.applyPreview();
    });
    this.viewport.setOnionSkin(false);

    this.speedSlider.addEventListener('input', () => {
      this.playSpeed = Number(this.speedSlider.value) || 1;
      this.speedLabel.textContent = `${formatSpeed(this.playSpeed)}×`;
    });
  }

  setActive(on: boolean): void {
    this.active = on;
    if (on) {
      this.viewport.setAnimateMode(true, this.parts);
      this.viewport.setTransformGizmo(this.gizmoMode);
      this.viewport.setSelectedPart(this.selectedPartId);
      this.viewport.setOnPartPicked((id) => this.selectPart(id));
      this.viewport.setOnTransformChange((id, euler, pos) => {
        if (id !== this.selectedPartId) return;
        this.liveEuler = { y: euler.y, x: euler.x, z: euler.z };
        this.livePos = { x: pos.x, y: pos.y, z: pos.z };
        this.syncPoseInputs();
        this.autoKeyFromGizmo();
        this.applyPreview(true);
      });
      this.viewport.setOnVoxelSelectionChange((n) => this.updateSelectStats(n));
      this.applyPreview();
    } else {
      this.stopPlay();
      this.viewport.setVoxelSelectMode(false);
      this.viewport.setOnVoxelSelectionChange(null);
      this.viewport.setPlaybackTick(null);
      this.viewport.setOnPartPicked(null);
      this.viewport.setOnTransformChange(null);
      this.viewport.setTransformGizmo('off');
      this.viewport.setAnimateMode(false, this.parts);
      this.root.querySelectorAll('[data-action="voxel-select"]').forEach((b) => {
        b.classList.remove('active');
      });
    }
  }

  setState(parts: ModPart[], keyframes: ModKeyframe[], clips?: ModAnimationClip[]): void {
    this.parts = parts.length
      ? parts.map((p) => ({ ...p, pivot: { ...p.pivot } }))
      : [defaultRootPart()];
    this.keyframes = keyframes.map((k) => ({
      ...k,
      position: { ...k.position },
      rotation: { ...k.rotation },
      scale: k.scale ? { ...k.scale } : undefined,
      ease: k.ease ? { ...k.ease } : undefined,
      easeType: k.easeType,
    }));
    if (!this.parts.some((p) => p.id === this.selectedPartId)) {
      this.selectedPartId = this.parts[0]!.id;
    }
    const boot = bootstrapClips(this.keyframes, clips);
    this.clips = boot.clips;
    this.activeClipId = boot.activeId;
    this.loadActiveClipIntoState();
    this.refreshAll();
    if (this.active) {
      this.viewport.setAnimateMode(true, this.parts);
      this.viewport.setSelectedPart(this.selectedPartId);
      this.applyPreview();
    }
  }

  getState(): AnimateState {
    this.syncActiveClipFromState();
    return {
      parts: this.parts,
      keyframes: this.keyframes,
      clips: this.clips,
      activeClipId: this.activeClipId,
    };
  }

  syncActiveClipFromState(): void {
    const clip = this.clips.find((c) => c.id === this.activeClipId);
    if (!clip) return;
    clip.keyframes = this.keyframes.map((k) => ({
      ...k,
      position: { ...k.position },
      rotation: { ...k.rotation },
      scale: k.scale ? { ...k.scale } : undefined,
      ease: k.ease ? { ...k.ease } : undefined,
    }));
  }

  loadActiveClipIntoState(): void {
    const clip = this.clips.find((c) => c.id === this.activeClipId);
    if (!clip) return;
    this.keyframes = clip.keyframes.map((k) => ({
      ...k,
      position: { ...k.position },
      rotation: { ...k.rotation },
      scale: k.scale ? { ...k.scale } : undefined,
      ease: k.ease ? { ...k.ease } : undefined,
    }));
    this.maxFrame = Math.max(DEFAULT_FRAMES, clip.duration, maxKeyframeFrame(this.keyframes));
    this.frame = Math.min(this.frame, this.maxFrame);
  }

  setGizmoMode(mode: 'rotate' | 'translate' | 'scale' | 'off'): void {
    this.gizmoMode = mode;
    for (const b of this.root.querySelectorAll('[data-gizmo]')) {
      b.classList.toggle('active', (b as HTMLElement).dataset.gizmo === mode);
    }
    if (mode !== 'off' && this.viewport.isVoxelSelectMode()) {
      this.viewport.setVoxelSelectMode(false);
      this.root.querySelectorAll('[data-action="voxel-select"]').forEach((b) => {
        b.classList.remove('active');
      });
    }
    if (this.active) this.viewport.setTransformGizmo(mode);
  }

  private bindControls(): void {
    const onRot = () => {
      this.liveEuler = {
        y: Number(this.rotInputs[0]!.value),
        x: Number(this.rotInputs[1]!.value),
        z: Number(this.rotInputs[2]!.value),
      };
      this.syncPoseInputs();
      this.autoKeyFromGizmo();
      this.applyPreview();
    };
    for (const input of this.rotInputs) input.addEventListener('input', onRot);
    for (const input of this.rotNumInputs) {
      input.addEventListener('input', () => {
        this.liveEuler = {
          y: Number(this.rotNumInputs[0]!.value),
          x: Number(this.rotNumInputs[1]!.value),
          z: Number(this.rotNumInputs[2]!.value),
        };
        this.syncPoseInputs();
        this.autoKeyFromGizmo();
        this.applyPreview();
      });
    }
    for (const input of this.posNumInputs) {
      input.addEventListener('input', () => {
        this.livePos = {
          x: Number(this.posNumInputs[0]!.value),
          y: Number(this.posNumInputs[1]!.value),
          z: Number(this.posNumInputs[2]!.value),
        };
        this.syncPoseInputs();
        this.autoKeyFromGizmo();
        this.applyPreview();
      });
    }

    this.partNameInput.addEventListener('change', () => {
      const part = this.selectedPart();
      if (!part || part.id === 'root') return;
      part.name = this.partNameInput.value.trim() || part.name;
      this.refreshTree();
      this.refreshTimeline();
      this.emitChange();
    });

    for (const input of this.pivotInputs) {
      input.addEventListener('change', () => this.applyPivotFromInputs());
    }

    this.root.querySelector('[data-action="add-part"]')!.addEventListener('click', () => {
      const id = newPartId(this.parts);
      const parent = this.selectedPart();
      this.parts.push({
        id,
        name: `Part ${this.parts.length}`,
        pivot: { x: 8, y: 8, z: 8 },
        parentId: parent && parent.id !== 'root' ? parent.id : 'root',
      });
      this.selectedPartId = id;
      this.refreshAll();
      if (this.active) {
        this.viewport.setAnimateMode(true, this.parts);
        this.viewport.setSelectedPart(id);
      }
      this.emitChange();
    });

    this.root.querySelector('[data-action="assign-box"]')!.addEventListener('click', () => {
      const idx = this.partIndex();
      if (idx < 0) return;
      const min = this.readVec3(this.boxInputs, 0);
      const max = this.readVec3(this.boxInputs, 3);
      const n = assignBoxToPart(this.viewport.getPartMask(), this.viewport.grid, idx, min, max);
      this.syncPartStats();
      if (this.active) this.viewport.rebuildPartMeshes(this.parts);
      this.setHint(`Assigned ${n} voxel${n === 1 ? '' : 's'} to ${this.selectedPart()?.name ?? 'part'}`);
      this.applyPreview();
    });

    const syncSelectUi = (on: boolean, style: 'custom' | 'chunk') => {
      this.root.querySelectorAll('[data-action="voxel-select"]').forEach((b) => {
        const mode = (b as HTMLElement).dataset.selectMode as 'custom' | 'chunk' | undefined;
        const match = !mode || mode === style;
        b.classList.toggle('active', on && match);
      });
    };

    const enableVoxelSelect = (style: 'custom' | 'chunk', forceOn = false) => {
      const already = this.viewport.isVoxelSelectMode() && this.viewport.getVoxelSelectStyle() === style;
      const next = forceOn ? true : !already;
      if (!next) {
        this.viewport.setVoxelSelectMode(false);
        syncSelectUi(false, style);
        this.setHint('Drag gizmo to pose · auto-keys on ◆ frames · children follow parents');
        this.applyPreview();
        this.updateSelectStats(this.viewport.countVoxelSelection());
        return;
      }
      this.viewport.setVoxelSelectMode(true, style);
      syncSelectUi(true, style);
      this.setGizmoMode('off');
      this.stopPlay();
      this.setHint(
        style === 'custom'
          ? 'Custom select · tap/drag exact voxels · gold = selected · then New part'
          : 'Chunk select · tap a solid · whole connected piece · then New part',
      );
      this.applyPreview();
      this.updateSelectStats(this.viewport.countVoxelSelection());
    };

    this.root.querySelectorAll('[data-action="voxel-select"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const style =
          ((btn as HTMLElement).dataset.selectMode as 'custom' | 'chunk' | undefined) ?? 'custom';
        enableVoxelSelect(style);
      });
    });

    this.root.querySelector('[data-action="clear-selection"]')!.addEventListener('click', () => {
      this.viewport.clearVoxelSelection();
      this.updateSelectStats(0);
    });

    this.root.querySelector('[data-action="part-from-selection"]')!.addEventListener('click', () => {
      this.createPartFromSelection();
    });

    this.root.querySelector('[data-action="assign-selection"]')!.addEventListener('click', () => {
      this.assignSelectionToCurrentPart();
    });

    this.keyToggleBtn.addEventListener('click', () => this.toggleKeyframeAtPlayhead());
    this.playBtn.addEventListener('click', () => {
      if (this.playing) this.stopPlay();
      else this.startPlay();
    });
    this.root.querySelector('[data-action="anim-stop"]')?.addEventListener('click', () => {
      this.stopPlay();
      this.scrubTo(0);
    });
    this.root.querySelector('[data-action="tl-record"]')?.addEventListener('click', () => {
      this.toggleKeyframeAtPlayhead();
    });

    this.curvesBtn.addEventListener('click', () => {
      const open = this.curvesPanel.hasAttribute('hidden');
      if (open) {
        this.curvesPanel.removeAttribute('hidden');
        this.ensureEaseSegmentForCurves();
      } else {
        this.curvesPanel.setAttribute('hidden', '');
      }
      this.curvesBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      this.curvesBtn.classList.toggle('active', open);
    });

    this.root.querySelector('[data-gizmo-row]')!.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-gizmo]') as HTMLElement | null;
      if (!btn) return;
      const mode = btn.dataset.gizmo as 'rotate' | 'translate' | 'scale' | 'off';
      this.setGizmoMode(mode);
      if (this.active) this.applyPreview();
    });

    this.treeEl.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const eye = t.closest('[data-vis]') as HTMLElement | null;
      if (eye) {
        e.stopPropagation();
        const id = eye.dataset.vis!;
        const part = this.parts.find((p) => p.id === id);
        if (!part || part.id === 'root') return;
        part.hidden = !part.hidden;
        this.refreshTree();
        this.applyPartVisibility();
        this.emitChange();
        return;
      }
      const row = t.closest('[data-part]') as HTMLElement | null;
      if (row?.dataset.part) this.selectPart(row.dataset.part);
    });

    this.easeSelect.addEventListener('change', () => this.applyEaseTypeFromSelect());

    this.root.querySelector('[data-motion-presets]')!.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-motion]') as HTMLElement | null;
      if (!btn) return;
      const part = this.selectedPart();
      if (!part) return;
      const id = btn.dataset.motion as ModMotionPreset;
      part.motionPreset = part.motionPreset === id ? undefined : id;
      this.syncMotionPresets();
      this.emitChange();
      this.applyPreview();
    });

    window.addEventListener('keydown', (e) => {
      if (!this.active || this.root.hidden) return;
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (!this.selectedKey) return;
      e.preventDefault();
      this.deleteKeyframe(this.selectedKey.partId, this.selectedKey.frame);
    });
  }

  private scrubTo(frame: number): void {
    this.frame = Math.max(0, Math.min(this.maxFrame, frame));
    this.updateTimecode();
    this.timeline.setFrame(this.frame);
    this.syncKeyToggleBtn();
    this.syncRotFromPose();
    this.applyPreview(false, true);
  }

  private selectKeyframe(partId: string, frame: number): void {
    this.selectedPartId = partId;
    this.selectedKey = { partId, frame };
    this.easeSegment = resolveEaseSegment(this.keyframes, partId, frame);
    // Anchor selection on the start key of the ease segment (where curve is stored).
    if (this.easeSegment) {
      this.selectedKey = { partId, frame: this.easeSegment.fromFrame };
    }
    this.frame = frame;
    this.refreshTree();
    this.syncPartFields();
    this.syncRotFromPose();
    this.updateTimecode();
    this.refreshTimeline();
    this.syncKeyframeEaseUI();
    this.syncKeyToggleBtn();
    if (this.active) this.viewport.setSelectedPart(partId);
    this.applyPreview();
  }

  /** When Curves opens: auto-select both keys of the best segment for Smooth editing. */
  private ensureEaseSegmentForCurves(): void {
    const keys = this.keyframes
      .filter((k) => k.partId === this.selectedPartId)
      .sort((a, b) => a.frame - b.frame);
    if (keys.length < 2) {
      this.easeSegment = null;
      this.curveEditor.setEnabled(false, 'Add a second ◆ key to edit Smooth');
      this.refreshTimeline();
      return;
    }
    let seg = this.easeSegment;
    if (!seg || seg.partId !== this.selectedPartId) {
      seg = segmentUnderPlayhead(keys, this.selectedPartId, this.frame) ?? {
        partId: this.selectedPartId,
        fromFrame: keys[0]!.frame,
        toFrame: keys[1]!.frame,
      };
    }
    this.easeSegment = seg;
    this.selectedKey = { partId: seg.partId, frame: seg.fromFrame };
    this.refreshTimeline();
    this.syncKeyframeEaseUI();
  }

  private retimeKeyframe(partId: string, fromFrame: number, toFrame: number): void {
    const kf = this.keyframes.find((k) => k.partId === partId && k.frame === fromFrame);
    if (!kf) return;
    const occupied = this.keyframes.some((k) => k.partId === partId && k.frame === toFrame);
    if (occupied && toFrame !== fromFrame) {
      this.keyframes = this.keyframes.filter((k) => !(k.partId === partId && k.frame === toFrame));
    }
    kf.frame = toFrame;
    this.keyframes.sort((a, b) => a.frame - b.frame || a.partId.localeCompare(b.partId));
    this.maxFrame = Math.max(DEFAULT_FRAMES, maxKeyframeFrame(this.keyframes));
    this.selectedKey = { partId, frame: toFrame };
    this.easeSegment = resolveEaseSegment(this.keyframes, partId, toFrame);
    this.frame = toFrame;
    this.refreshTimeline();
    this.updateTimecode();
    this.syncKeyframeEaseUI();
    this.syncKeyToggleBtn();
    this.emitChange();
    this.applyPreview();
  }

  private toggleKeyframeAtPlayhead(): void {
    const f = Math.round(this.frame);
    const existing = this.keyframes.find(
      (k) => k.partId === this.selectedPartId && k.frame === f,
    );
    if (existing) this.deleteKeyframe(this.selectedPartId, f);
    else this.addKeyframeAtFrame(f);
  }

  private deleteKeyframe(partId: string, frame: number): void {
    this.keyframes = this.keyframes.filter((k) => !(k.partId === partId && k.frame === frame));
    if (this.selectedKey?.partId === partId && this.selectedKey.frame === frame) {
      this.selectedKey = null;
    }
    if (
      this.easeSegment &&
      this.easeSegment.partId === partId &&
      (this.easeSegment.fromFrame === frame || this.easeSegment.toFrame === frame)
    ) {
      this.easeSegment = null;
    }
    this.maxFrame = Math.max(DEFAULT_FRAMES, maxKeyframeFrame(this.keyframes));
    this.syncRotFromPose();
    this.refreshTimeline();
    this.syncKeyframeEaseUI();
    this.syncKeyToggleBtn();
    this.emitChange();
    this.applyPreview();
  }

  addKeyframeAtFrame(frame = Math.round(this.frame)): void {
    const part = this.selectedPart();
    if (!part) return;
    const rotation = quatFromEulerYXZ(this.liveEuler.y, this.liveEuler.x, this.liveEuler.z);
    const prev = this.keyframes.find((k) => k.partId === part.id && k.frame === frame);
    this.keyframes = upsertKeyframe(this.keyframes, {
      frame,
      partId: part.id,
      position: { ...this.livePos },
      rotation,
      scale: { ...this.liveScale },
      easeType: prev?.easeType ?? DEFAULT_EASE_TYPE,
      ease: prev?.ease ? { ...prev.ease } : undefined,
    });
    this.maxFrame = Math.max(this.maxFrame, frame, DEFAULT_FRAMES);
    this.selectedKey = { partId: part.id, frame };
    this.easeSegment = resolveEaseSegment(this.keyframes, part.id, frame);
    this.refreshTimeline();
    this.syncKeyframeEaseUI();
    this.syncKeyToggleBtn();
    this.emitChange();
    this.applyPreview();
  }

  /** CapCut auto-key: update transform when playhead sits on an existing key. */
  private autoKeyFromGizmo(): void {
    if (this.playing) return;
    const f = Math.round(this.frame);
    const existing = this.keyframes.find(
      (k) => k.partId === this.selectedPartId && k.frame === f,
    );
    if (!existing) return;
    existing.position = { ...this.livePos };
    existing.rotation = quatFromEulerYXZ(this.liveEuler.y, this.liveEuler.x, this.liveEuler.z);
    existing.scale = { ...this.liveScale };
    this.selectedKey = { partId: this.selectedPartId, frame: f };
    this.emitChange();
  }

  private syncKeyToggleBtn(): void {
    const f = Math.round(this.frame);
    const has = this.keyframes.some(
      (k) => k.partId === this.selectedPartId && k.frame === f,
    );
    this.keyToggleBtn.textContent = has ? '◆−' : '◆+';
    this.keyToggleBtn.title = has ? 'Remove keyframe' : 'Add keyframe';
    this.keyToggleBtn.classList.toggle('is-on-key', has);
  }

  private applyEaseTypeFromSelect(): void {
    const anchor = this.easeAnchorKey();
    if (!anchor || this.easeSelect.disabled) return;
    const kf = this.keyframes.find(
      (k) => k.partId === anchor.partId && k.frame === anchor.frame,
    );
    if (!kf) return;
    const type = this.easeSelect.value as EaseType;
    kf.easeType = type;
    if (type === 'smooth') kf.ease = { ...KEYFRAME_EASE };
    else if (type === 'bounce' || type === 'elastic') {
      kf.ease = { ...EASE_BEZIER_PRESETS[type]! };
    } else if (type !== 'custom') delete kf.ease;
    this.syncKeyframeEaseUI();
    this.emitChange();
    this.applyPreview();
  }

  /** Keyframe that owns the outgoing ease for the current segment. */
  private easeAnchorKey(): { partId: string; frame: number } | null {
    if (this.easeSegment) {
      return { partId: this.easeSegment.partId, frame: this.easeSegment.fromFrame };
    }
    return this.selectedKey;
  }

  private syncMotionPresets(): void {
    const preset = this.selectedPart()?.motionPreset;
    for (const btn of this.root.querySelectorAll('[data-motion]')) {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.motion === preset);
    }
  }

  private syncKeyframeEaseUI(): void {
    this.syncCurveEditor();
    const anchor = this.easeAnchorKey();
    if (!anchor || !this.easeSegment) {
      this.easeSelect.disabled = true;
      this.easeSelect.value = '';
      return;
    }
    const kf = this.keyframes.find(
      (k) => k.partId === anchor.partId && k.frame === anchor.frame,
    );
    if (!kf) {
      this.easeSelect.disabled = true;
      this.easeSelect.value = '';
      return;
    }
    this.easeSelect.disabled = false;
    this.easeSelect.value = resolveEaseType(kf.easeType, kf.ease);
  }

  private syncCurveEditor(): void {
    if (!this.easeSegment) {
      const keys = this.keyframes.filter((k) => k.partId === this.selectedPartId);
      if (keys.length < 2) {
        this.curveEditor.setEnabled(false, 'Add a second ◆ key · then edit Smooth');
      } else {
        this.curveEditor.setEnabled(false, 'Click a ◆ · both keys select for Smooth');
      }
      return;
    }
    const kf = this.keyframes.find(
      (k) =>
        k.partId === this.easeSegment!.partId && k.frame === this.easeSegment!.fromFrame,
    );
    if (!kf) {
      this.curveEditor.setEnabled(false, 'Select a key ◆ pair');
      return;
    }
    this.curveEditor.setEnabled(true);
    this.curveEditor.root.classList.toggle('mod-anim-curve-wrap--hidden', false);
    this.curveEditor.setEase(normalizeEase(kf.ease ?? KEYFRAME_EASE));
  }

  private applyEaseToKeyframe(ease: ModEaseCurve): void {
    const anchor = this.easeAnchorKey();
    if (!anchor) return;
    const kf = this.keyframes.find(
      (k) => k.partId === anchor.partId && k.frame === anchor.frame,
    );
    if (!kf) return;
    kf.ease = { ...ease };
    kf.easeType = inferEaseTypeFromCurve(ease);
    this.syncKeyframeEaseUI();
    this.emitChange();
    this.applyPreview();
  }

  private selectPart(id: string): void {
    if (!this.parts.some((p) => p.id === id)) return;
    this.selectedPartId = id;
    if (this.selectedKey?.partId !== id) {
      this.selectedKey = null;
      this.easeSegment = null;
    } else {
      this.easeSegment = this.selectedKey
        ? resolveEaseSegment(this.keyframes, id, this.selectedKey.frame)
        : null;
    }
    this.refreshTree();
    this.syncPartFields();
    this.syncRotFromPose();
    this.refreshTimeline();
    this.syncKeyframeEaseUI();
    this.syncKeyToggleBtn();
    if (this.active) this.viewport.setSelectedPart(id);
    this.applyPreview();
  }

  private selectedPart(): ModPart | undefined {
    return this.parts.find((p) => p.id === this.selectedPartId) ?? this.parts[0];
  }

  private partIndex(): number {
    return this.parts.findIndex((p) => p.id === this.selectedPartId);
  }

  private updateSelectStats(n: number): void {
    this.selectStatsEl.textContent = `${n} voxel${n === 1 ? '' : 's'} selected`;
  }

  private createPartFromSelection(): void {
    const count = this.viewport.countVoxelSelection();
    if (count <= 0) {
      this.setHint('Select a connected chunk first (Select chunk · tap the model)');
      return;
    }
    const id = newPartId(this.parts);
    const pivot =
      selectionPivot(this.viewport.getVoxelSelection(), this.viewport.grid) ?? {
        x: 8,
        y: 8,
        z: 8,
      };
    const parent = this.selectedPart();
    this.parts.push({
      id,
      name: `Part ${this.parts.length}`,
      pivot,
      parentId: parent && parent.id !== 'root' ? parent.id : 'root',
    });
    const idx = this.parts.length - 1;
    const n = assignSelectionToPart(
      this.viewport.getPartMask(),
      this.viewport.grid,
      idx,
      this.viewport.getVoxelSelection(),
    );
    this.selectedPartId = id;
    this.viewport.clearVoxelSelection();
    this.viewport.setVoxelSelectMode(false);
    this.root.querySelectorAll('[data-action="voxel-select"]').forEach((b) => {
      b.classList.remove('active');
    });
    this.updateSelectStats(0);
    this.refreshAll();
    if (this.active) {
      this.viewport.setAnimateMode(true, this.parts);
      this.viewport.setSelectedPart(id);
      this.viewport.setTransformGizmo(this.gizmoMode === 'off' ? 'rotate' : this.gizmoMode);
      if (this.gizmoMode === 'off') {
        this.gizmoMode = 'rotate';
        for (const b of this.root.querySelectorAll('[data-gizmo]')) {
          b.classList.toggle('active', (b as HTMLElement).dataset.gizmo === 'rotate');
        }
      }
    }
    this.emitChange();
    this.setHint(`Created part with ${n} voxels · animate that track only`);
    this.applyPreview();
  }

  private assignSelectionToCurrentPart(): void {
    const idx = this.partIndex();
    if (idx < 0) return;
    if (idx === 0) {
      this.setHint('Pick or create a non-Body part first, or use New part from sel');
      return;
    }
    const count = this.viewport.countVoxelSelection();
    if (count <= 0) {
      this.setHint('Select a connected chunk first');
      return;
    }
    const n = assignSelectionToPart(
      this.viewport.getPartMask(),
      this.viewport.grid,
      idx,
      this.viewport.getVoxelSelection(),
    );
    const pivot = selectionPivot(this.viewport.getVoxelSelection(), this.viewport.grid);
    const part = this.selectedPart();
    if (part && pivot) part.pivot = pivot;
    this.viewport.clearVoxelSelection();
    this.updateSelectStats(0);
    this.syncPartStats();
    if (this.active) this.viewport.rebuildPartMeshes(this.parts);
    this.emitChange();
    this.setHint(`Added ${n} voxels to ${part?.name ?? 'part'} · they move together`);
    this.applyPreview();
  }

  private refreshAll(): void {
    this.refreshTree();
    this.syncPartFields();
    this.syncRotFromPose();
    this.updateTimecode();
    this.refreshTimeline();
    this.syncKeyframeEaseUI();
    this.syncKeyToggleBtn();
    (this as unknown as { refreshClipUi?: () => void }).refreshClipUi?.();
  }

  private refreshTimeline(): void {
    this.timeline.setData(
      this.parts,
      this.keyframes,
      this.frame,
      this.maxFrame,
      this.selectedPartId,
      this.selectedKey,
      this.easeSegment,
    );
  }

  private refreshTree(): void {
    this.treeEl.replaceChildren();
    const childrenOf = new Map<string, ModPart[]>();
    for (const p of this.parts) {
      if (p.id === 'root') continue;
      const parent = this.parts.some((x) => x.id === (p.parentId ?? 'root'))
        ? (p.parentId ?? 'root')
        : 'root';
      const list = childrenOf.get(parent) ?? [];
      list.push(p);
      childrenOf.set(parent, list);
    }

    const addNode = (part: ModPart, depth: number) => {
      const li = document.createElement('li');
      li.className = 'mod-anim-tree-item';
      li.dataset.part = part.id;
      li.setAttribute('role', 'treeitem');
      li.setAttribute('aria-selected', part.id === this.selectedPartId ? 'true' : 'false');
      if (part.id === this.selectedPartId) li.classList.add('is-selected');
      li.style.setProperty('--depth', String(depth));

      const row = document.createElement('div');
      row.className = 'mod-anim-tree-row';
      const name = document.createElement('span');
      name.className = 'mod-anim-tree-name';
      name.textContent = part.name;
      row.appendChild(name);

      if (part.id !== 'root') {
        const eye = document.createElement('button');
        eye.type = 'button';
        eye.className = 'mod-anim-vis-btn';
        eye.dataset.vis = part.id;
        eye.title = part.hidden ? 'Show' : 'Hide';
        eye.textContent = part.hidden ? '○' : '●';
        eye.setAttribute('aria-pressed', part.hidden ? 'true' : 'false');
        row.appendChild(eye);
      }
      li.appendChild(row);
      this.treeEl.appendChild(li);

      for (const child of childrenOf.get(part.id) ?? []) addNode(child, depth + 1);
    };

    const root = this.parts.find((p) => p.id === 'root') ?? this.parts[0];
    if (root) addNode(root, 0);
  }

  private syncPartFields(): void {
    const part = this.selectedPart();
    if (!part) return;
    this.partNameInput.value = part.name;
    this.partNameInput.disabled = part.id === 'root';
    this.pivotInputs[0]!.value = String(Math.round(part.pivot.x));
    this.pivotInputs[1]!.value = String(Math.round(part.pivot.y));
    this.pivotInputs[2]!.value = String(Math.round(part.pivot.z));
    const parentSelect = this.root.querySelector('.mod-part-parent') as HTMLSelectElement | null;
    if (parentSelect) {
      parentSelect.innerHTML = '';
      for (const p of this.parts) {
        if (p.id === part.id) continue;
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        parentSelect.appendChild(opt);
      }
      parentSelect.value = part.parentId ?? 'root';
      parentSelect.disabled = part.id === 'root';
    }
    this.syncPartStats();
    this.syncMotionPresets();
  }

  private syncPartStats(): void {
    const idx = this.partIndex();
    const n = idx >= 0 ? countVoxelsForPart(this.viewport.getPartMask(), this.viewport.grid, idx) : 0;
    this.partStatsEl.textContent = `${n} voxel${n === 1 ? '' : 's'} in this part`;
  }

  private applyPivotFromInputs(): void {
    const part = this.selectedPart();
    if (!part) return;
    part.pivot = {
      x: clampAxis(Number(this.pivotInputs[0]!.value)),
      y: clampAxis(Number(this.pivotInputs[1]!.value)),
      z: clampAxis(Number(this.pivotInputs[2]!.value)),
    };
    this.emitChange();
    this.applyPreview();
  }

  private syncRotFromPose(): void {
    const pose = samplePartPose(this.selectedPartId, this.keyframes, this.frame);
    const e = eulerYXZFromQuat(pose.rotation);
    this.liveEuler = { y: e.y, x: e.x, z: e.z };
    this.livePos = { ...pose.position };
    this.liveScale = pose.scale ? { ...pose.scale } : { x: 1, y: 1, z: 1 };
    this.syncPoseInputs();
  }

  private syncPoseInputs(): void {
    this.rotInputs[0]!.value = String(this.liveEuler.y);
    this.rotInputs[1]!.value = String(this.liveEuler.x);
    this.rotInputs[2]!.value = String(this.liveEuler.z);
    this.rotNumInputs[0]!.value = formatAnimNum(this.liveEuler.y);
    this.rotNumInputs[1]!.value = formatAnimNum(this.liveEuler.x);
    this.rotNumInputs[2]!.value = formatAnimNum(this.liveEuler.z);
    this.posNumInputs[0]!.value = formatAnimNum(this.livePos.x);
    this.posNumInputs[1]!.value = formatAnimNum(this.livePos.y);
    this.posNumInputs[2]!.value = formatAnimNum(this.livePos.z);
    const sx = this.root.querySelector('[data-sn="x"]') as HTMLInputElement | null;
    const sy = this.root.querySelector('[data-sn="y"]') as HTMLInputElement | null;
    const sz = this.root.querySelector('[data-sn="z"]') as HTMLInputElement | null;
    if (sx) sx.value = formatAnimNum(this.liveScale.x);
    if (sy) sy.value = formatAnimNum(this.liveScale.y);
    if (sz) sz.value = formatAnimNum(this.liveScale.z);
  }

  private updateTimecode(): void {
    const totalSec = this.frame / FPS;
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = Math.floor(totalSec % 60);
    this.timeEl.textContent = `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
    const rounded = Math.round(this.frame);
    this.frameLabel.textContent =
      Math.abs(this.frame - rounded) < 0.005 ? String(rounded) : formatAnimNum(this.frame);
  }

  private applyPartVisibility(): void {
    if (!this.active) return;
    this.viewport.setPartVisibility(this.parts);
  }

  private applyPreview(fromGizmo = false, scrubbing = false): void {
    if (!this.active) return;
    if (!fromGizmo) {
      this.viewport.setAnimateTimeline(this.keyframes, this.frame, !scrubbing);
    }
    const poses = sampleAllPartPoses(this.parts, this.keyframes, this.frame);
    const part = this.selectedPart();
    const dragging = this.viewport.isTransformDragging();
    if (part && !this.playing && !scrubbing && (fromGizmo || dragging)) {
      poses.set(part.id, {
        position: { ...this.livePos },
        rotation: quatFromEulerYXZ(this.liveEuler.y, this.liveEuler.x, this.liveEuler.z),
        scale: { ...this.liveScale },
      });
    } else if (part && !this.playing && !scrubbing && !dragging) {
      const atKeyframe = this.keyframes.some(
        (k) => k.partId === part.id && k.frame === Math.round(this.frame),
      );
      if (!atKeyframe) {
        poses.set(part.id, {
          position: { ...this.livePos },
          rotation: quatFromEulerYXZ(this.liveEuler.y, this.liveEuler.x, this.liveEuler.z),
          scale: { ...this.liveScale },
        });
      }
    }
    if (!dragging) {
      this.viewport.setAnimationPoses(this.parts, poses);
    }
    if (this.playing && part) {
      const pose = poses.get(part.id);
      if (pose) {
        const e = eulerYXZFromQuat(pose.rotation);
        this.liveEuler = { y: e.y, x: e.x, z: e.z };
        this.livePos = { ...pose.position };
        this.liveScale = pose.scale ? { ...pose.scale } : { x: 1, y: 1, z: 1 };
        this.syncPoseInputs();
      }
    }
    if (!scrubbing) this.applyPartVisibility();
    if (!fromGizmo && !scrubbing) this.timeline.setFrame(this.frame);
  }

  private emitChange(): void {
    this.syncActiveClipFromState();
    this.onChange({
      parts: this.parts,
      keyframes: this.keyframes,
      clips: this.clips,
      activeClipId: this.activeClipId,
    });
  }

  private setHint(msg: string): void {
    const el = this.root.querySelector('.mod-animate-hint');
    if (el) el.textContent = msg;
  }

  private readVec3(inputs: HTMLInputElement[], offset: number): Vec3 {
    return {
      x: clampAxis(Number(inputs[offset]!.value)),
      y: clampAxis(Number(inputs[offset + 1]!.value)),
      z: clampAxis(Number(inputs[offset + 2]!.value)),
    };
  }

  private startPlay(): void {
    if (!this.keyframes.length) return;
    const clip = this.clips.find((c) => c.id === this.activeClipId);
    const mode = clip?.loop ?? 'once';
    const end = Math.max(0, maxKeyframeFrame(this.keyframes));
    // Restart from 0 when already sitting on the last key (once / hold).
    if ((mode === 'once' || mode === 'hold') && this.frame >= end - 0.001) {
      this.frame = 0;
    }
    this.playing = true;
    this.playBtn.textContent = '❚❚';
    this.viewport.setPlaybackTick((dt) => {
      if (!this.playing) return;
      this.frame += (dt / (1000 / FPS)) * this.playSpeed;
      if (this.frame >= end) {
        if (mode === 'loop' && end > 0) {
          this.frame = this.frame % end;
        } else {
          this.frame = end;
          this.updateTimecode();
          this.timeline.setFrame(this.frame);
          this.syncKeyToggleBtn();
          this.applyPreview(false, true);
          this.stopPlay();
          return;
        }
      }
      this.updateTimecode();
      this.timeline.setFrame(this.frame);
      this.syncKeyToggleBtn();
      this.applyPreview(false, true);
    });
  }

  private stopPlay(): void {
    this.playing = false;
    this.playBtn.textContent = '▶';
    this.viewport.setPlaybackTick(null);
  }
}

function clampAxis(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(15, Math.round(v)));
}

function formatAnimNum(v: number): string {
  if (!Number.isFinite(v)) return '0';
  const rounded = Math.round(v * 100) / 100;
  return Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function formatSpeed(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function inferEaseTypeFromCurve(ease: ModEaseCurve): EaseType {
  const n = normalizeEase(ease);
  if (curveNear(n, { x1: 0, y1: 0, x2: 1, y2: 1 })) return 'linear';
  if (curveNear(n, KEYFRAME_EASE)) return 'smooth';
  if (curveNear(n, EASE_BEZIER_PRESETS.bounce!)) return 'bounce';
  if (curveNear(n, EASE_BEZIER_PRESETS.elastic!)) return 'elastic';
  return 'custom';
}

function resolveEaseSegment(
  keyframes: ModKeyframe[],
  partId: string,
  frame: number,
): EaseSegment | null {
  const keys = keyframes
    .filter((k) => k.partId === partId)
    .sort((a, b) => a.frame - b.frame);
  if (keys.length < 2) return null;
  const idx = keys.findIndex((k) => k.frame === frame);
  if (idx < 0) return null;
  if (idx < keys.length - 1) {
    return { partId, fromFrame: keys[idx]!.frame, toFrame: keys[idx + 1]!.frame };
  }
  // Clicked the last key → select the preceding segment (both diamonds).
  return { partId, fromFrame: keys[idx - 1]!.frame, toFrame: keys[idx]!.frame };
}

function segmentUnderPlayhead(
  keys: ModKeyframe[],
  partId: string,
  frame: number,
): EaseSegment | null {
  if (keys.length < 2) return null;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]!;
    const b = keys[i + 1]!;
    if (frame >= a.frame && frame <= b.frame) {
      return { partId, fromFrame: a.frame, toFrame: b.frame };
    }
  }
  return { partId, fromFrame: keys[0]!.frame, toFrame: keys[1]!.frame };
}

function curveNear(a: ModEaseCurve, b: ModEaseCurve): boolean {
  const eps = 0.02;
  return (
    Math.abs(a.x1 - b.x1) < eps &&
    Math.abs(a.y1 - b.y1) < eps &&
    Math.abs(a.x2 - b.x2) < eps &&
    Math.abs(a.y2 - b.y2) < eps
  );
}
