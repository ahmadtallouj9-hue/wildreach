import { EASE_BEZIER_PRESETS, KEYFRAME_EASE, normalizeEaseCurve } from '../modding/Easing';
import type { ModEaseCurve } from '../modding/ModAsset';

/**
 * Touch/drag anywhere on the graph to shape easing — no visible handles.
 * Left half of the graph edits the start handle; right half edits the end handle
 * so the curve is free to move off-center (asymmetric).
 */
export class AnimateCurveEditor {
  readonly root: HTMLElement;
  private readonly svg: SVGSVGElement;
  private readonly curve: SVGPathElement;
  private readonly readout: HTMLElement;
  private onChange: (ease: ModEaseCurve) => void = () => {};

  private ease: ModEaseCurve = { ...KEYFRAME_EASE };
  private dragging = false;
  /** Which handle the current drag owns (sticky for the gesture). */
  private activeHandle: 'p1' | 'p2' = 'p1';
  private enabled = true;

  constructor(host: HTMLElement) {
    this.root = host;
    this.svg = host.querySelector('.mod-anim-curve-svg') as SVGSVGElement;
    this.curve = this.svg.querySelector('.mod-curve-path') as SVGPathElement;
    this.readout = host.querySelector('.mod-anim-curve-readout') as HTMLElement;

    host.querySelector('[data-curve-presets]')!.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-preset]') as HTMLElement | null;
      if (!btn || !this.enabled) return;
      const preset = EASE_BEZIER_PRESETS[btn.dataset.preset!];
      if (!preset) return;
      host.querySelectorAll('[data-preset]').forEach((b) => {
        b.classList.toggle('active', b === btn);
      });
      this.setEase(preset, true);
    });

    const onPointerDown = (e: PointerEvent) => {
      if (!this.enabled) return;
      this.dragging = true;
      this.svg.classList.add('is-dragging');
      this.svg.setPointerCapture(e.pointerId);
      const pt = this.clientToNorm(e.clientX, e.clientY);
      this.activeHandle = pt.x < 0.5 ? 'p1' : 'p2';
      this.applyTouch(pt, true);
      e.preventDefault();
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!this.dragging || !this.enabled) return;
      this.applyTouch(this.clientToNorm(e.clientX, e.clientY), true);
    };
    const endDrag = () => {
      this.dragging = false;
      this.svg.classList.remove('is-dragging');
    };

    this.svg.addEventListener('pointerdown', onPointerDown);
    this.svg.addEventListener('pointermove', onPointerMove);
    this.svg.addEventListener('pointerup', endDrag);
    this.svg.addEventListener('pointercancel', endDrag);

    this.paint(true);
  }

  bind(onChange: (ease: ModEaseCurve) => void): void {
    this.onChange = onChange;
  }

  setEase(ease: ModEaseCurve, notify = false): void {
    this.ease = normalizeEaseCurve(ease);
    this.paint(false);
    this.highlightMatchingPreset();
    if (notify) this.onChange({ ...this.ease });
  }

  getEase(): ModEaseCurve {
    return { ...this.ease };
  }

  setEnabled(on: boolean, hint = ''): void {
    this.enabled = on;
    this.root.classList.toggle('mod-anim-curve--disabled', !on);
    this.svg.classList.toggle('mod-anim-curve-svg--disabled', !on);
    if (hint) this.readout.textContent = hint;
    else this.updateReadout();
  }

  private applyTouch(pt: { x: number; y: number }, notify: boolean): void {
    if (this.activeHandle === 'p1') {
      this.ease = normalizeEaseCurve({
        x1: pt.x,
        y1: pt.y,
        x2: this.ease.x2,
        y2: this.ease.y2,
      });
    } else {
      this.ease = normalizeEaseCurve({
        x1: this.ease.x1,
        y1: this.ease.y1,
        x2: pt.x,
        y2: pt.y,
      });
    }
    this.paint(false);
    this.clearPresetActive();
    if (notify) this.onChange({ ...this.ease });
  }

  private clientToNorm(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.svg.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = 1 - (clientY - rect.top) / rect.height;
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  }

  private paint(markCustom: boolean): void {
    const { x1, y1, x2, y2 } = this.ease;

    const samples: string[] = [];
    for (let i = 0; i <= 32; i++) {
      const t = i / 32;
      const inv = 1 - t;
      const px = 3 * inv * inv * t * x1 + 3 * inv * t * t * x2 + t * t * t;
      const py = 3 * inv * inv * t * y1 + 3 * inv * t * t * y2 + t * t * t;
      samples.push(`${i === 0 ? 'M' : 'L'} ${px} ${1 - py}`);
    }
    this.curve.setAttribute('d', samples.join(' '));

    if (markCustom) this.clearPresetActive();
    this.updateReadout();
  }

  private clearPresetActive(): void {
    this.root.querySelectorAll('[data-preset]').forEach((b) => b.classList.remove('active'));
  }

  private highlightMatchingPreset(): void {
    const { x1, y1, x2, y2 } = this.ease;
    let matched: string | null = null;
    for (const [id, preset] of Object.entries(EASE_BEZIER_PRESETS)) {
      if (
        near(preset.x1, x1) &&
        near(preset.y1, y1) &&
        near(preset.x2, x2) &&
        near(preset.y2, y2)
      ) {
        matched = id;
        break;
      }
    }
    this.root.querySelectorAll('[data-preset]').forEach((b) => {
      b.classList.toggle('active', matched !== null && (b as HTMLElement).dataset.preset === matched);
    });
  }

  private updateReadout(): void {
    const { x1, y1, x2, y2 } = this.ease;
    this.readout.textContent = `${fmt(x1)}, ${fmt(y1)} · ${fmt(x2)}, ${fmt(y2)}`;
  }
}

function fmt(v: number): string {
  return (Math.round(v * 100) / 100).toFixed(2).replace(/0+$/, '').replace(/\.$/, '0');
}

function near(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.015;
}
