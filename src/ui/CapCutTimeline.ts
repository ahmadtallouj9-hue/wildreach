import type { ModKeyframe, ModPart } from '../modding/ModAsset';

export interface EaseSegment {
  partId: string;
  fromFrame: number;
  toFrame: number;
}

export interface CapCutTimelineCallbacks {
  onScrub: (frame: number) => void;
  onSelectKeyframe: (partId: string, frame: number) => void;
  onRetimedKeyframe: (partId: string, fromFrame: number, toFrame: number) => void;
  onSelectPart: (partId: string) => void;
}

/** CapCut-style multi-track board: labels, ruler, diamond keys, vertical playhead. */
export class CapCutTimeline {
  readonly root: HTMLElement;
  private readonly labelsEl: HTMLElement;
  private readonly laneEl: HTMLElement;
  private readonly rulerEl: HTMLElement;
  private readonly tracksEl: HTMLElement;
  private readonly playheadEl: HTMLElement;
  private readonly cbs: CapCutTimelineCallbacks;

  private parts: ModPart[] = [];
  private keyframes: ModKeyframe[] = [];
  private frame = 0;
  private maxFrame = 48;
  private selectedPartId = 'root';
  private selectedKey: { partId: string; frame: number } | null = null;
  private easeSegment: EaseSegment | null = null;

  private scrubbing = false;
  private dragKey: { partId: string; fromFrame: number; el: HTMLElement } | null = null;

  constructor(root: HTMLElement, cbs: CapCutTimelineCallbacks) {
    this.root = root;
    this.cbs = cbs;
    this.labelsEl = root.querySelector('.mod-tl-labels') as HTMLElement;
    this.laneEl = root.querySelector('.mod-tl-lane') as HTMLElement;
    this.rulerEl = root.querySelector('.mod-tl-ruler') as HTMLElement;
    this.tracksEl = root.querySelector('.mod-tl-tracks') as HTMLElement;
    this.playheadEl = root.querySelector('.mod-tl-playhead') as HTMLElement;
    this.bind();
  }

  setData(
    parts: ModPart[],
    keyframes: ModKeyframe[],
    frame: number,
    maxFrame: number,
    selectedPartId: string,
    selectedKey: { partId: string; frame: number } | null,
    easeSegment: EaseSegment | null = null,
  ): void {
    this.parts = parts;
    this.keyframes = keyframes;
    this.frame = frame;
    this.maxFrame = Math.max(1, maxFrame);
    this.selectedPartId = selectedPartId;
    this.selectedKey = selectedKey;
    this.easeSegment = easeSegment;
    this.render();
  }

  setFrame(frame: number): void {
    this.frame = frame;
    this.updatePlayhead();
  }

  private bind(): void {
    const startScrub = (clientX: number) => {
      this.scrubbing = true;
      this.scrubTo(clientX);
    };

    this.laneEl.addEventListener('pointerdown', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.mod-tl-key-node')) return;
      if (
        target.closest('.mod-tl-playhead-grip') ||
        target === this.laneEl ||
        target.closest('.mod-tl-ruler') ||
        target.closest('.mod-tl-track-row') ||
        target.closest('.mod-tl-seg')
      ) {
        this.laneEl.setPointerCapture(e.pointerId);
        startScrub(e.clientX);
        e.preventDefault();
      }
    });

    this.laneEl.addEventListener('pointermove', (e) => {
      if (this.dragKey) {
        const frame = this.clientXToFrame(e.clientX);
        this.dragKey.el.style.left = `${(frame / this.maxFrame) * 100}%`;
        this.dragKey.el.dataset.kf = String(frame);
        return;
      }
      if (!this.scrubbing) return;
      this.scrubTo(e.clientX);
    });

    const endPointer = (e: PointerEvent) => {
      if (this.dragKey) {
        const toFrame = this.clientXToFrame(e.clientX);
        const { partId, fromFrame } = this.dragKey;
        this.dragKey = null;
        if (toFrame !== fromFrame) this.cbs.onRetimedKeyframe(partId, fromFrame, toFrame);
        else this.cbs.onSelectKeyframe(partId, fromFrame);
        return;
      }
      if (!this.scrubbing) return;
      this.scrubbing = false;
      this.scrubTo(e.clientX);
    };

    this.laneEl.addEventListener('pointerup', endPointer);
    this.laneEl.addEventListener('pointercancel', () => {
      this.scrubbing = false;
      this.dragKey = null;
    });

    this.tracksEl.addEventListener('pointerdown', (e) => {
      const node = (e.target as HTMLElement).closest('.mod-tl-key-node') as HTMLElement | null;
      if (!node) return;
      e.stopPropagation();
      e.preventDefault();
      const partId = node.dataset.part!;
      const fromFrame = Number(node.dataset.kf);
      this.cbs.onSelectPart(partId);
      this.cbs.onSelectKeyframe(partId, fromFrame);
      this.dragKey = { partId, fromFrame, el: node };
      node.classList.add('is-dragging');
      this.laneEl.setPointerCapture(e.pointerId);
    });

    this.tracksEl.addEventListener('contextmenu', (e) => {
      const node = (e.target as HTMLElement).closest('.mod-tl-key-node') as HTMLElement | null;
      if (!node) return;
      e.preventDefault();
      this.cbs.onSelectPart(node.dataset.part!);
      this.cbs.onSelectKeyframe(node.dataset.part!, Number(node.dataset.kf));
    });
  }

  private scrubTo(clientX: number): void {
    this.cbs.onScrub(this.clientXToFrame(clientX));
  }

  private clientXToFrame(clientX: number): number {
    const rect = this.laneEl.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(rect.width, 1)));
    return Math.round(x * this.maxFrame);
  }

  private render(): void {
    this.renderLabels();
    this.renderRuler();
    this.renderTracks();
    this.updatePlayhead();
  }

  private renderLabels(): void {
    this.labelsEl.replaceChildren();
    const head = document.createElement('div');
    head.className = 'mod-tl-label mod-tl-label--head';
    head.textContent = 'Tracks';
    this.labelsEl.appendChild(head);
    for (const part of this.parts) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'mod-tl-label';
      if (part.id === this.selectedPartId) row.classList.add('is-selected');
      row.dataset.part = part.id;
      row.textContent = part.name.toUpperCase();
      row.title = part.name;
      row.addEventListener('click', () => this.cbs.onSelectPart(part.id));
      this.labelsEl.appendChild(row);
    }
  }

  private renderRuler(): void {
    this.rulerEl.replaceChildren();
    const step = this.maxFrame <= 24 ? 2 : this.maxFrame <= 60 ? 4 : 8;
    for (let f = 0; f <= this.maxFrame; f += step) {
      const tick = document.createElement('span');
      tick.className = 'mod-tl-tick';
      tick.style.left = `${(f / this.maxFrame) * 100}%`;
      tick.textContent = String(f);
      this.rulerEl.appendChild(tick);
    }
  }

  private renderTracks(): void {
    this.tracksEl.replaceChildren();
    for (const part of this.parts) {
      const row = document.createElement('div');
      row.className = 'mod-tl-track-row';
      if (part.id === this.selectedPartId) row.classList.add('is-selected');
      row.dataset.part = part.id;

      const seg = this.easeSegment;
      if (seg && seg.partId === part.id) {
        const bar = document.createElement('div');
        bar.className = 'mod-tl-seg';
        const left = (seg.fromFrame / this.maxFrame) * 100;
        const right = (seg.toFrame / this.maxFrame) * 100;
        bar.style.left = `${left}%`;
        bar.style.width = `${Math.max(0, right - left)}%`;
        bar.title = `Ease · frames ${seg.fromFrame}→${seg.toFrame}`;
        row.appendChild(bar);
      }

      const keys = this.keyframes.filter((k) => k.partId === part.id);
      for (const k of keys) {
        const node = document.createElement('button');
        node.type = 'button';
        node.className = 'mod-tl-key-node';
        node.dataset.part = part.id;
        node.dataset.kf = String(k.frame);
        node.style.left = `${(k.frame / this.maxFrame) * 100}%`;
        node.textContent = '◆';
        node.title = `${part.name} · frame ${k.frame}`;

        const inSeg =
          seg &&
          seg.partId === part.id &&
          (k.frame === seg.fromFrame || k.frame === seg.toFrame);
        const alone =
          this.selectedKey &&
          this.selectedKey.partId === part.id &&
          this.selectedKey.frame === k.frame;

        if (inSeg || alone) node.classList.add('is-selected');
        if (inSeg) node.classList.add('is-segment');
        row.appendChild(node);
      }
      this.tracksEl.appendChild(row);
    }
  }

  private updatePlayhead(): void {
    const pct = (this.frame / this.maxFrame) * 100;
    this.playheadEl.style.left = `${pct}%`;
  }
}
