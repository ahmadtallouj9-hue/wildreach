/** Saved positions are viewport percentages (0–100) of the element center. */
export type HudPos = { x: number; y: number };

export type HudLayout = {
  hotbarScale: number;
  hotbar?: HudPos;
  stick?: HudPos;
  actions?: HudPos;
  utils?: HudPos;
};

export const DEFAULT_HUD_LAYOUT: HudLayout = {
  hotbarScale: 0.72,
};

const LAYOUT_KEY = 'wildreach.hudLayout';

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function readPos(raw: unknown): HudPos | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const x = Number(o.x);
  const y = Number(o.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  return { x: clamp(x, 2, 98), y: clamp(y, 2, 98) };
}

export function loadHudLayout(): HudLayout {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return { ...DEFAULT_HUD_LAYOUT };
    const parsed = JSON.parse(raw) as Partial<HudLayout>;
    return {
      hotbarScale: clamp(Number(parsed.hotbarScale) || DEFAULT_HUD_LAYOUT.hotbarScale, 0.45, 1.15),
      hotbar: readPos(parsed.hotbar),
      stick: readPos(parsed.stick),
      actions: readPos(parsed.actions),
      utils: readPos(parsed.utils),
    };
  } catch {
    return { ...DEFAULT_HUD_LAYOUT };
  }
}

export function saveHudLayout(layout: HudLayout): void {
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
}

function setPosVar(prefix: string, pos: HudPos | undefined): void {
  const root = document.documentElement;
  if (!pos) {
    root.style.removeProperty(`--hud-${prefix}-x`);
    root.style.removeProperty(`--hud-${prefix}-y`);
    root.classList.remove(`hud-pos-${prefix}`);
    return;
  }
  root.style.setProperty(`--hud-${prefix}-x`, `${pos.x}%`);
  root.style.setProperty(`--hud-${prefix}-y`, `${pos.y}%`);
  root.classList.add(`hud-pos-${prefix}`);
}

/** Push layout into CSS variables / classes on <html>. */
export function applyHudLayout(layout: HudLayout): void {
  const root = document.documentElement;
  root.style.setProperty('--hud-hotbar-scale', String(layout.hotbarScale));
  setPosVar('hotbar', layout.hotbar);
  setPosVar('stick', layout.stick);
  setPosVar('actions', layout.actions);
  setPosVar('utils', layout.utils);
}

type DragTarget = 'hotbar' | 'stick' | 'actions' | 'utils';

const TARGETS: { key: DragTarget; selector: string }[] = [
  { key: 'hotbar', selector: '.hotbar-wrap' },
  { key: 'stick', selector: '.touch-stick-wrap' },
  { key: 'actions', selector: '.touch-actions' },
  { key: 'utils', selector: '.touch-top-bar' },
];

/**
 * Full-screen drag editor for touch HUD pieces.
 * Call start() while in-game (pause closed). Resolves when the player taps Done/Reset.
 */
export class HudLayoutEditor {
  private overlay: HTMLElement | null = null;
  private layout: HudLayout = loadHudLayout();
  private dragging: {
    key: DragTarget;
    el: HTMLElement;
    pid: number;
    grabX: number;
    grabY: number;
  } | null = null;
  private onDone: ((layout: HudLayout) => void) | null = null;

  start(onDone: (layout: HudLayout) => void): void {
    if (this.overlay) return;
    this.onDone = onDone;
    this.layout = loadHudLayout();
    applyHudLayout(this.layout);

    this.overlay = document.createElement('div');
    this.overlay.className = 'hud-edit-overlay';
    this.overlay.innerHTML = `
      <div class="hud-edit-bar">
        <p class="hud-edit-title">Move HUD — drag the highlighted pieces</p>
        <div class="hud-edit-actions">
          <label class="hud-edit-scale">
            Hotbar size
            <input type="range" class="hud-edit-scale-range" min="0.45" max="1.1" step="0.05" value="${this.layout.hotbarScale}" />
          </label>
          <button type="button" class="hud-edit-btn" data-act="reset">Reset</button>
          <button type="button" class="hud-edit-btn primary" data-act="done">Done</button>
        </div>
      </div>
    `;
    document.body.appendChild(this.overlay);
    document.documentElement.classList.add('hud-editing');

    const scale = this.overlay.querySelector<HTMLInputElement>('.hud-edit-scale-range')!;
    scale.addEventListener('input', () => {
      this.layout.hotbarScale = Number(scale.value);
      applyHudLayout(this.layout);
    });

    this.overlay.querySelector('[data-act="done"]')!.addEventListener('click', () => this.finish(false));
    this.overlay.querySelector('[data-act="reset"]')!.addEventListener('click', () => {
      this.layout = { ...DEFAULT_HUD_LAYOUT };
      scale.value = String(this.layout.hotbarScale);
      applyHudLayout(this.layout);
    });

    for (const t of TARGETS) {
      const el = document.querySelector<HTMLElement>(t.selector);
      if (!el) continue;
      el.classList.add('hud-drag-target');
      el.addEventListener('pointerdown', (e) => this.onPointerDown(e, t.key, el));
    }
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
  }

  private onPointerDown = (e: PointerEvent, key: DragTarget, el: HTMLElement): void => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    e.stopPropagation();
    el.setPointerCapture(e.pointerId);
    const rect = el.getBoundingClientRect();
    this.dragging = {
      key,
      el,
      pid: e.pointerId,
      grabX: e.clientX - (rect.left + rect.width / 2),
      grabY: e.clientY - (rect.top + rect.height / 2),
    };
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging || e.pointerId !== this.dragging.pid) return;
    e.preventDefault();
    const cx = ((e.clientX - this.dragging.grabX) / window.innerWidth) * 100;
    const cy = ((e.clientY - this.dragging.grabY) / window.innerHeight) * 100;
    const pos = { x: clamp(cx, 4, 96), y: clamp(cy, 4, 96) };
    this.layout[this.dragging.key] = pos;
    applyHudLayout(this.layout);
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.dragging || e.pointerId !== this.dragging.pid) return;
    this.dragging = null;
  };

  private finish(discard: boolean): void {
    if (!discard) {
      saveHudLayout(this.layout);
      applyHudLayout(this.layout);
    } else {
      applyHudLayout(loadHudLayout());
    }
    for (const t of TARGETS) {
      document.querySelector(t.selector)?.classList.remove('hud-drag-target');
    }
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    this.overlay?.remove();
    this.overlay = null;
    document.documentElement.classList.remove('hud-editing');
    const cb = this.onDone;
    this.onDone = null;
    cb?.(this.layout);
  }
}
