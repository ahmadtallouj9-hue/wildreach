/**
 * Hybrid menu background: real voxel "lay of the land" + animated pixel-art sky.
 */
import {
  loadBgPrefs,
  isReducedMotionPreferred,
  type VytheraBgMode,
  type VytheraBgPrefs,
} from './backgroundPrefs.js';
import { PixelBackgroundEngine, type BgPanelContext } from './PixelBackgroundEngine.js';
import { VoxelMenuLayer } from './VoxelMenuLayer.js';
import type { VytheraBgContext } from './backgroundContext.js';
export type { VytheraBgContext } from './backgroundContext.js';

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
  private readonly skyStage: HTMLDivElement;
  private readonly readability: HTMLDivElement;
  private voxel: VoxelMenuLayer | null = null;
  private sky: PixelBackgroundEngine;
  private context: VytheraBgContext = 'home';
  private prefs: VytheraBgPrefs = loadBgPrefs();
  private useVoxel = true;
  private driftT = 0;
  private driftRaf = 0;
  private onResize = (): void => this.applyDrift();
  private visibilityHandler = (): void => {
    if (document.hidden) {
      this.setRunning(false);
    } else if (this.root.isConnected) {
      this.setRunning(true);
    }
  };

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'vy-world-bg vy-pixel-bg vy-hybrid-bg';
    this.root.setAttribute('aria-hidden', 'true');
    this.stage = document.createElement('div');
    this.stage.className = 'vy-pixel-bg__stage vy-hybrid-bg__terrain';
    this.skyStage = document.createElement('div');
    this.skyStage.className = 'vy-hybrid-bg__sky';
    this.readability = document.createElement('div');
    this.readability.className = 'vy-world-bg__readability';
    this.sky = new PixelBackgroundEngine(this.prefs, 'sky-only');
    this.root.append(this.stage, this.skyStage, this.readability);
  }

  setCloudSpeed(_seconds: readonly [number, number, number]): void {}

  setContext(ctx: VytheraBgContext): void {
    if (ctx === this.context) return;
    this.context = ctx;
    this.root.dataset.context = ctx;
    this.readability.dataset.context = ctx;
    this.sky.setContext(toPixelContext(ctx));
    this.voxel?.setContext(ctx);
  }

  setPrefs(prefs: VytheraBgPrefs): void {
    this.prefs = prefs;
    this.root.dataset.mode = prefs.mode;
    this.root.dataset.quality = prefs.quality;
    this.root.dataset.animation = prefs.animation;
    this.root.style.setProperty('--vy-bg-atmosphere', String(prefs.atmosphere));
    this.sky.setPrefs(prefs);
    this.voxel?.setPrefs(prefs, this.driftEnabled());
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
    this.skyStage.replaceChildren();
    this.voxel?.dispose();
    this.voxel = null;
    this.useVoxel = this.prefs.mode !== 'static';

    if (this.useVoxel) {
      this.voxel = new VoxelMenuLayer(this.prefs);
      const ok = this.voxel.mount(this.stage);
      if (!ok) {
        this.voxel.dispose();
        this.voxel = null;
        this.useVoxel = false;
      } else {
        this.voxel.setContext(this.context);
        this.voxel.setPrefs(this.prefs, this.driftEnabled());
      }
    }

    const skyEngine = new PixelBackgroundEngine(this.prefs, this.useVoxel ? 'sky-only' : 'full');
    this.sky.dispose();
    this.sky = skyEngine;
    const skyHost = this.useVoxel ? this.skyStage : this.stage;
    const skyOk = this.sky.mount(skyHost);
    if (!skyOk) this.root.classList.add('vy-pixel-bg--static-fallback');
    this.sky.setContext(toPixelContext(this.context));
    this.sky.setPrefs(this.prefs);

    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  start(): void {
    this.setRunning(true);
    this.startDrift();
  }

  stop(): void {
    this.setRunning(false);
    this.stopDrift();
  }

  dispose(): void {
    this.stop();
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.visibilityHandler);
    this.voxel?.dispose();
    this.voxel = null;
    this.sky.dispose();
    this.root.remove();
  }

  getDebugState(): ReturnType<PixelBackgroundEngine['getState']> {
    return this.sky.getState();
  }

  private setRunning(on: boolean): void {
    if (on) {
      this.sky.setVisible(true);
      this.sky.start();
      this.voxel?.start();
    } else {
      this.sky.setVisible(false);
      this.sky.stop();
      this.voxel?.stop();
    }
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
    this.skyStage.style.transform = `translate(${dx * 0.35}px, ${dy * 0.25}px)`;
  }
}

export { VytheraWorldBackground as MainMenuSky };
export type { VytheraBgMode };
export { isReducedMotionPreferred as prefersReducedMotion } from './backgroundPrefs.js';
