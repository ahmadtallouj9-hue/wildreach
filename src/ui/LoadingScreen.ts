/**
 * Cinematic world-entry loading overlay.
 * Phase labels only — no fabricated percentages.
 * Completes when the caller signals the world is ready.
 */

import { uiSound } from './uiSound';

export type LoadPhase =
  | 'Preparing world…'
  | 'Generating terrain…'
  | 'Building biome…'
  | 'Creating vegetation…'
  | 'Initializing local systems…'
  | 'Entering world…';

export class LoadingScreen {
  readonly root: HTMLElement;
  private phaseEl: HTMLElement;
  private fillEl: HTMLElement;
  private barEl: HTMLElement;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'vy-loading';
    this.root.hidden = true;
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('aria-live', 'polite');
    this.root.innerHTML = `
      <div class="vy-loading__brand">VYTHERA</div>
      <div class="vy-loading__phase">Preparing world…</div>
      <div class="vy-loading__bar vy-loading__bar--indeterminate" aria-hidden="true">
        <div class="vy-loading__fill"></div>
      </div>
      <div class="vy-loading__hint">Local world · private session</div>
    `;
    this.phaseEl = this.root.querySelector('.vy-loading__phase')!;
    this.fillEl = this.root.querySelector('.vy-loading__fill')!;
    this.barEl = this.root.querySelector('.vy-loading__bar')!;
  }

  show(phase: LoadPhase = 'Preparing world…'): void {
    this.root.hidden = false;
    this.root.classList.remove('is-exit', 'is-ready');
    this.barEl.classList.add('vy-loading__bar--indeterminate');
    this.fillEl.style.width = '';
    this.setPhase(phase);
    uiSound('open');
  }

  setPhase(phase: string): void {
    this.phaseEl.textContent = phase;
  }

  /** Call only with a real completion signal (world constructed / first frame). */
  complete(): void {
    this.barEl.classList.remove('vy-loading__bar--indeterminate');
    this.fillEl.style.width = '100%';
    this.setPhase('Entering world…');
    this.root.classList.add('is-ready');
  }

  hide(opts?: { fadeMs?: number }): void {
    const fadeMs = opts?.fadeMs ?? 280;
    this.root.classList.add('is-exit');
    uiSound('close');
    window.setTimeout(() => {
      this.root.hidden = true;
      this.root.classList.remove('is-exit', 'is-ready');
      this.fillEl.style.width = '';
    }, fadeMs);
  }
}
