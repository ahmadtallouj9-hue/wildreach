/**
 * VYTHERA pixel-art animated UI background.
 * Single layered canvas system — sky, clouds, sun, terrain, vegetation, water, ambient life.
 */
import {
  loadBgPrefs,
  isReducedMotionPreferred,
  type VytheraBgMode,
  type VytheraBgPrefs,
} from './backgroundPrefs.js';
import { PixelBackgroundEngine, type BgPanelContext } from './PixelBackgroundEngine.js';

export type VytheraBgContext =
  | 'home'
  | 'world'
  | 'loading'
  | 'hub'
  | 'studio'
  | 'settings'
  | 'ai'
  | 'pause'
  | 'customize'
  | 'multiplayer';

function toPixelContext(ctx: VytheraBgContext): BgPanelContext {
  switch (ctx) {
    case 'loading':
      return 'loading';
    case 'hub':
      return 'hub';
    case 'studio':
      return 'studio';
    case 'settings':
    case 'pause':
    case 'customize':
      return 'settings';
    case 'world':
    case 'ai':
    case 'multiplayer':
      return 'hub';
    default:
      return 'home';
  }
}

export class VytheraWorldBackground {
  readonly root: HTMLDivElement;
  private readonly stage: HTMLDivElement;
  private readonly readability: HTMLDivElement;
  private engine: PixelBackgroundEngine;
  private context: VytheraBgContext = 'home';
  private prefs: VytheraBgPrefs = loadBgPrefs();
  private driftT = 0;
  private driftRaf = 0;
  private onResize = (): void => this.applyDrift();
  private visibilityHandler = (): void => {
    if (document.hidden) {
      this.engine.setVisible(false);
      this.stopDrift();
    } else if (this.root.isConnected) {
      this.engine.setVisible(true);
      this.engine.start();
      this.startDrift();
    }
  };

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'vy-world-bg vy-pixel-bg';
    this.root.setAttribute('aria-hidden', 'true');
    this.stage = document.createElement('div');
    this.stage.className = 'vy-pixel-bg__stage';
    this.readability = document.createElement('div');
    this.readability.className = 'vy-world-bg__readability';
    this.engine = new PixelBackgroundEngine(this.prefs);
    this.root.append(this.stage, this.readability);
  }

  /** Legacy no-op — cloud speeds come from animation prefs. */
  setCloudSpeed(_seconds: readonly [number, number, number]): void {}

  setContext(ctx: VytheraBgContext): void {
    if (ctx === this.context) return;
    this.context = ctx;
    this.root.dataset.context = ctx;
    this.readability.dataset.context = ctx;
    this.engine.setContext(toPixelContext(ctx));
  }

  setPrefs(prefs: VytheraBgPrefs): void {
    this.prefs = prefs;
    this.root.dataset.mode = prefs.mode;
    this.root.dataset.quality = prefs.quality;
    this.root.dataset.animation = prefs.animation;
    this.root.style.setProperty('--vy-bg-atmosphere', String(prefs.atmosphere));
    this.engine.setPrefs(prefs);
  }

  reloadPrefs(): void {
    this.setPrefs(loadBgPrefs());
  }

  mount(host: HTMLElement): void {
    host.replaceChildren(this.root);
    this.prefs = loadBgPrefs();
    this.root.dataset.mode = this.prefs.mode;
    this.root.dataset.context = this.context;
    this.readability.dataset.context = this.context;
    this.root.style.setProperty('--vy-bg-atmosphere', String(this.prefs.atmosphere));

    this.stage.replaceChildren();
    const ok = this.engine.mount(this.stage);
    if (!ok) this.root.classList.add('vy-pixel-bg--static-fallback');
    this.engine.setContext(toPixelContext(this.context));
    this.engine.setPrefs(this.prefs);

    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  start(): void {
    this.engine.setVisible(true);
    this.engine.start();
    this.startDrift();
  }

  stop(): void {
    this.engine.setVisible(false);
    this.engine.stop();
    this.stopDrift();
  }

  dispose(): void {
    this.stop();
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.visibilityHandler);
    this.engine.dispose();
    this.root.remove();
  }

  /** Test hook — inspect engine/layer state. */
  getDebugState(): ReturnType<PixelBackgroundEngine['getState']> {
    return this.engine.getState();
  }

  private driftEnabled(): boolean {
    if (isReducedMotionPreferred()) return false;
    if (this.prefs.mode === 'static') return false;
    return this.prefs.motion;
  }

  private startDrift(): void {
    if (!this.driftEnabled() || this.driftRaf) return;
    let last = performance.now();
    const tick = (now: number) => {
      if (!this.driftEnabled()) {
        this.stage.style.transform = '';
        this.driftRaf = 0;
        return;
      }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.driftT += dt;
      this.applyDrift();
      this.driftRaf = requestAnimationFrame(tick);
    };
    this.driftRaf = requestAnimationFrame(tick);
  }

  private stopDrift(): void {
    if (this.driftRaf) cancelAnimationFrame(this.driftRaf);
    this.driftRaf = 0;
    this.stage.style.transform = '';
  }

  private applyDrift(): void {
    if (!this.driftEnabled()) {
      this.stage.style.transform = '';
      return;
    }
    const dx = Math.sin(this.driftT * 0.07) * 1.5;
    const dy = Math.sin(this.driftT * 0.05 + 1.2) * 0.4;
    this.stage.style.transform = `translate(${dx}px, ${dy}px) scale(1.015)`;
  }
}

/** Legacy export name. */
export { VytheraWorldBackground as MainMenuSky };
export type { VytheraBgMode };
export { isReducedMotionPreferred as prefersReducedMotion } from './backgroundPrefs.js';
