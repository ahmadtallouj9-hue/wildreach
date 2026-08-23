/** Saved positions are viewport percentages (0–100) of the element center. */
export type HudPos = { x: number; y: number };

export type HudLayout = {
  hotbarScale: number;
  controlsScale: number;
  hotbar?: HudPos;
  stick?: HudPos;
  actions?: HudPos;
  utils?: HudPos;
};

export const DEFAULT_HUD_LAYOUT: HudLayout = {
  hotbarScale: 0.72,
  controlsScale: 1,
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
      hotbarScale: clamp(Number(parsed.hotbarScale) || DEFAULT_HUD_LAYOUT.hotbarScale, 0.45, 1.2),
      controlsScale: clamp(
        Number(parsed.controlsScale) || DEFAULT_HUD_LAYOUT.controlsScale,
        0.7,
        1.35,
      ),
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
  root.style.setProperty('--hud-controls-scale', String(layout.controlsScale));
  setPosVar('hotbar', layout.hotbar);
  setPosVar('stick', layout.stick);
  setPosVar('actions', layout.actions);
  setPosVar('utils', layout.utils);
}

type DragTarget = 'hotbar' | 'stick' | 'actions' | 'utils';

const TARGETS: { key: DragTarget; selector: string; label: string }[] = [
  { key: 'hotbar', selector: '.hotbar-wrap', label: 'Hotbar' },
  { key: 'stick', selector: '.touch-stick-wrap', label: 'Move stick' },
  { key: 'actions', selector: '.touch-actions', label: 'Actions' },
  { key: 'utils', selector: '.touch-top-bar', label: 'Quick buttons' },
];

function centerPos(el: HTMLElement): HudPos {
  const r = el.getBoundingClientRect();
  return {
    x: clamp(((r.left + r.width / 2) / window.innerWidth) * 100, 4, 96),
    y: clamp(((r.top + r.height / 2) / window.innerHeight) * 100, 4, 96),
  };
}

/**
 * Drag editor for every on-screen play control (hotbar, stick, actions, quick bar).
 * Built for phones: touch-first, seeds free positions so pieces leave the dock.
 */
export class HudLayoutEditor {
  private overlay: HTMLElement | null = null;
  private layout: HudLayout = loadHudLayout();
  private boundEls: { key: DragTarget; el: HTMLElement; onDown: (e: PointerEvent) => void }[] = [];
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

    // Free every visible piece from dock/flex so all can be dragged on mobile.
    for (const t of TARGETS) {
      const el = document.querySelector<HTMLElement>(t.selector);
      if (!el || el.offsetParent === null) continue;
      if (!this.layout[t.key]) this.layout[t.key] = centerPos(el);
    }
    applyHudLayout(this.layout);

    this.overlay = document.createElement('div');
    this.overlay.className = 'hud-edit-overlay';
    this.overlay.innerHTML = `
      <div class="hud-edit-bar">
        <p class="hud-edit-title">Move HUD — drag every highlighted control</p>
        <div class="hud-edit-actions">
          <label class="hud-edit-scale">
            Hotbar
            <input type="range" class="hud-edit-hotbar-scale" min="0.45" max="1.15" step="0.05" value="${this.layout.hotbarScale}" />
          </label>
          <label class="hud-edit-scale">
            Controls
            <input type="range" class="hud-edit-controls-scale" min="0.7" max="1.35" step="0.05" value="${this.layout.controlsScale}" />
          </label>
          <button type="button" class="hud-edit-btn" data-act="reset">Reset</button>
          <button type="button" class="hud-edit-btn primary" data-act="done">Done</button>
        </div>
      </div>
    `;
    document.body.appendChild(this.overlay);
    document.documentElement.classList.add('hud-editing');

    const hotbarScale = this.overlay.querySelector<HTMLInputElement>('.hud-edit-hotbar-scale')!;
    const controlsScale = this.overlay.querySelector<HTMLInputElement>('.hud-edit-controls-scale')!;
    hotbarScale.addEventListener('input', () => {
      this.layout.hotbarScale = Number(hotbarScale.value);
      applyHudLayout(this.layout);
    });
    controlsScale.addEventListener('input', () => {
      this.layout.controlsScale = Number(controlsScale.value);
      applyHudLayout(this.layout);
    });

    this.overlay.querySelector('[data-act="done"]')!.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.finish(false);
    });
    this.overlay.querySelector('[data-act="reset"]')!.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.layout = { ...DEFAULT_HUD_LAYOUT };
      // Re-seed live centers after reset clears custom coords.
      applyHudLayout(this.layout);
      for (const t of TARGETS) {
        const el = document.querySelector<HTMLElement>(t.selector);
        if (!el || el.offsetParent === null) continue;
        this.layout[t.key] = centerPos(el);
      }
      hotbarScale.value = String(this.layout.hotbarScale);
      controlsScale.value = String(this.layout.controlsScale);
      applyHudLayout(this.layout);
    });

    this.boundEls = [];
    for (const t of TARGETS) {
      const el = document.querySelector<HTMLElement>(t.selector);
      if (!el) continue;
      el.classList.add('hud-drag-target');
      el.dataset.hudLabel = t.label;
      const onDown = (e: PointerEvent) => this.onPointerDown(e, t.key, el);
      el.addEventListener('pointerdown', onDown, { capture: true });
      this.boundEls.push({ key: t.key, el, onDown });
    }

    window.addEventListener('pointermove', this.onPointerMove, { passive: false });
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
  }

  private onPointerDown = (e: PointerEvent, key: DragTarget, el: HTMLElement): void => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    // Ignore chrome inside the edit bar.
    if ((e.target as HTMLElement).closest?.('.hud-edit-bar')) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const rect = el.getBoundingClientRect();
    this.dragging = {
      key,
      el,
      pid: e.pointerId,
      grabX: e.clientX - (rect.left + rect.width / 2),
      grabY: e.clientY - (rect.top + rect.height / 2),
    };
    el.classList.add('hud-dragging');
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging || e.pointerId !== this.dragging.pid) return;
    e.preventDefault();
    const cx = ((e.clientX - this.dragging.grabX) / window.innerWidth) * 100;
    const cy = ((e.clientY - this.dragging.grabY) / window.innerHeight) * 100;
    this.layout[this.dragging.key] = { x: clamp(cx, 4, 96), y: clamp(cy, 4, 96) };
    applyHudLayout(this.layout);
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.dragging || e.pointerId !== this.dragging.pid) return;
    this.dragging.el.classList.remove('hud-dragging');
    this.dragging = null;
  };

  private finish(discard: boolean): void {
    if (!discard) {
      saveHudLayout(this.layout);
      applyHudLayout(this.layout);
    } else {
      applyHudLayout(loadHudLayout());
    }
    for (const { el, onDown } of this.boundEls) {
      el.classList.remove('hud-drag-target', 'hud-dragging');
      delete el.dataset.hudLabel;
      el.removeEventListener('pointerdown', onDown, { capture: true });
    }
    this.boundEls = [];
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
