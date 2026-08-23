export type TouchControlHandlers = {
  onMove?: (x: number, z: number) => void;
  onLook?: (dx: number, dy: number) => void;
  onJump?: (down: boolean) => void;
  onSneak?: (down: boolean) => void;
  onBreak?: () => void;
  onPlace?: () => void;
  onPack?: () => void;
  onJournal?: () => void;
  onMap?: () => void;
  onChat?: () => void;
  onMenu?: () => void;
};

export class TouchControls {
  readonly root: HTMLElement;
  private enabled = true;
  private stickPointerId: number | null = null;
  private lookPointerId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private lookLast = { x: 0, y: 0 };
  private lookMoved = false;
  private knobEl: HTMLElement;
  private handlers: TouchControlHandlers;

  /** True while Move HUD editor is open — ignore gameplay input. */
  private layoutEditMode = false;

  constructor(handlers: TouchControlHandlers = {}) {
    this.handlers = handlers;
    this.root = document.createElement('div');
    this.root.id = 'touch-controls';
    this.root.className = 'touch-controls';
    this.root.innerHTML = `
      <div class="touch-top-bar" aria-label="Quick actions">
        <button type="button" class="touch-util-btn" data-action="journal" aria-label="Journal">J</button>
        <button type="button" class="touch-util-btn" data-action="map" aria-label="Map">M</button>
        <button type="button" class="touch-util-btn" data-action="chat" aria-label="Chat">💬</button>
        <button type="button" class="touch-util-btn" data-action="menu" aria-label="Menu">☰</button>
      </div>
      <div class="touch-look-zone" aria-hidden="true"></div>
      <div class="touch-dock">
        <div class="touch-stick-wrap">
          <div class="touch-stick-base" aria-hidden="true"></div>
          <div class="touch-stick-knob" aria-hidden="true"></div>
        </div>
        <div class="touch-actions" aria-label="Game actions">
          <button type="button" class="touch-action-btn touch-action-jump" data-action="jump" aria-label="Jump">↑</button>
          <button type="button" class="touch-action-btn touch-action-place" data-action="place" aria-label="Place">+</button>
          <button type="button" class="touch-action-btn touch-action-sneak" data-action="sneak" aria-label="Sneak">↓</button>
          <button type="button" class="touch-action-btn touch-action-pack" data-action="pack" aria-label="Inventory">☰</button>
        </div>
      </div>
      <p class="touch-hint" aria-hidden="true">Drag to look · tap to break</p>
    `;

    this.knobEl = this.root.querySelector('.touch-stick-knob')!;
    this.bind();
  }

  setHandlers(handlers: TouchControlHandlers): void {
    this.handlers = { ...this.handlers, ...handlers };
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.root.hidden = !enabled && !this.layoutEditMode;
    if (!enabled) this.resetStick();
  }

  /** Keep controls visible but ignore stick/look/buttons (Move HUD mode). */
  setLayoutEditMode(on: boolean): void {
    this.layoutEditMode = on;
    this.root.classList.toggle('touch-controls--layout-edit', on);
    if (on) {
      this.root.hidden = false;
      this.resetStick();
    }
  }

  private gameplayLive(): boolean {
    return this.enabled && !this.layoutEditMode;
  }

  private bind(): void {
    const stickWrap = this.root.querySelector('.touch-stick-wrap')!;
    const lookZone = this.root.querySelector('.touch-look-zone')!;

    const onStickDown = (evt: Event) => {
      const e = evt as PointerEvent;
      if (!this.gameplayLive() || e.pointerType === 'mouse') return;
      e.preventDefault();
      this.stickPointerId = e.pointerId;
      const rect = stickWrap.getBoundingClientRect();
      this.stickOrigin.x = rect.left + rect.width / 2;
      this.stickOrigin.y = rect.top + rect.height / 2;
      stickWrap.setPointerCapture(e.pointerId);
      this.updateStick(e.clientX, e.clientY);
    };

    const onStickMove = (evt: Event) => {
      const e = evt as PointerEvent;
      if (e.pointerId !== this.stickPointerId) return;
      e.preventDefault();
      this.updateStick(e.clientX, e.clientY);
    };

    const endStick = (evt: Event) => {
      const e = evt as PointerEvent;
      if (e.pointerId !== this.stickPointerId) return;
      this.stickPointerId = null;
      this.resetStick();
    };
    stickWrap.addEventListener('pointerdown', onStickDown);
    stickWrap.addEventListener('pointermove', onStickMove);
    stickWrap.addEventListener('pointerup', endStick);
    stickWrap.addEventListener('pointercancel', endStick);

    const onLookDown = (evt: Event) => {
      const e = evt as PointerEvent;
      if (!this.gameplayLive() || e.pointerType === 'mouse') return;
      if ((e.target as HTMLElement).closest('button')) return;
      e.preventDefault();
      this.lookPointerId = e.pointerId;
      this.lookLast.x = e.clientX;
      this.lookLast.y = e.clientY;
      this.lookMoved = false;
      lookZone.setPointerCapture(e.pointerId);
    };

    const onLookMove = (evt: Event) => {
      const e = evt as PointerEvent;
      if (e.pointerId !== this.lookPointerId) return;
      e.preventDefault();
      const samples = e.getCoalescedEvents?.() ?? [e];
      let dx = 0;
      let dy = 0;
      for (const sample of samples) {
        dx += sample.clientX - this.lookLast.x;
        dy += sample.clientY - this.lookLast.y;
        this.lookLast.x = sample.clientX;
        this.lookLast.y = sample.clientY;
      }
      if (Math.abs(dx) + Math.abs(dy) < 0.35) return;
      if (Math.abs(dx) + Math.abs(dy) > 2) this.lookMoved = true;
      this.handlers.onLook?.(dx, dy);
    };

    const endLook = (evt: Event) => {
      const e = evt as PointerEvent;
      if (e.pointerId !== this.lookPointerId) return;
      this.lookPointerId = null;
      if (!this.lookMoved) this.handlers.onBreak?.();
    };
    lookZone.addEventListener('pointerdown', onLookDown);
    lookZone.addEventListener('pointermove', onLookMove);
    lookZone.addEventListener('pointerup', endLook);
    lookZone.addEventListener('pointercancel', endLook);

    this.root.querySelector('[data-action="jump"]')!.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!this.gameplayLive()) return;
      this.handlers.onJump?.(true);
    });
    this.root.querySelector('[data-action="jump"]')!.addEventListener('pointerup', () => {
      this.handlers.onJump?.(false);
    });
    this.root.querySelector('[data-action="jump"]')!.addEventListener('pointercancel', () => {
      this.handlers.onJump?.(false);
    });

    const sneakBtn = this.root.querySelector('[data-action="sneak"]')!;
    let sneakOn = false;
    sneakBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (!this.gameplayLive()) return;
      sneakOn = !sneakOn;
      sneakBtn.classList.toggle('active', sneakOn);
      this.handlers.onSneak?.(sneakOn);
    });

    this.root.querySelector('[data-action="place"]')!.addEventListener('click', (e) => {
      e.preventDefault();
      if (!this.gameplayLive()) return;
      this.handlers.onPlace?.();
    });

    this.root.querySelector('[data-action="pack"]')!.addEventListener('click', (e) => {
      e.preventDefault();
      if (!this.gameplayLive()) return;
      this.handlers.onPack?.();
    });

    this.root.querySelector('[data-action="journal"]')!.addEventListener('click', (e) => {
      e.preventDefault();
      if (!this.gameplayLive()) return;
      this.handlers.onJournal?.();
    });

    this.root.querySelector('[data-action="map"]')!.addEventListener('click', (e) => {
      e.preventDefault();
      if (!this.gameplayLive()) return;
      this.handlers.onMap?.();
    });

    this.root.querySelector('[data-action="chat"]')!.addEventListener('click', (e) => {
      e.preventDefault();
      if (!this.gameplayLive()) return;
      this.handlers.onChat?.();
    });

    this.root.querySelector('[data-action="menu"]')!.addEventListener('click', (e) => {
      e.preventDefault();
      this.handlers.onMenu?.();
    });
  }

  private updateStick(clientX: number, clientY: number): void {
    const wrap = this.knobEl.parentElement!;
    const rect = wrap.getBoundingClientRect();
    const max = Math.max(18, rect.width * 0.38);
    let dx = clientX - this.stickOrigin.x;
    let dy = clientY - this.stickOrigin.y;
    const len = Math.hypot(dx, dy);
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    this.knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
    const nx = dx / max;
    const nz = dy / max;
    this.handlers.onMove?.(nx, nz);
  }

  private resetStick(): void {
    this.knobEl.style.transform = 'translate(0, 0)';
    this.handlers.onMove?.(0, 0);
  }
}
