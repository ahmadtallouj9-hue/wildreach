export type PauseMenuAction = 'resume' | 'title' | 'settings' | 'social';

export type PauseJoinRequest = { id: string; name: string };

/** In-game pause overlay — VYTHERA cinematic panel. */
export class PauseMenu {
  readonly root: HTMLElement;
  private onAction: ((action: PauseMenuAction) => void) | null = null;
  private onJoinRespond: ((requestId: string, accept: boolean) => void) | null = null;
  private socialEl: HTMLElement;
  private open = false;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'pause-menu';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="pause-menu__dim" aria-hidden="true"></div>
      <div class="pause-menu__panel" role="dialog" aria-modal="true" aria-labelledby="pause-menu-title">
        <h2 id="pause-menu-title" class="pause-menu__title">VYTHERA</h2>
        <div class="menu-brand-ornament pause-menu__ornament" aria-hidden="true">
          <span class="menu-brand-line"></span>
          <span class="menu-lotus">
            <svg viewBox="0 0 36 30" width="28" height="24" fill="none">
              <path d="M18 26c-6-5-10-10-10-15 0-4 3-7 7-7 1.4 0 2.6.5 3.5 1.3C19.4 4.5 20.6 4 22 4c4 0 7 3 7 7 0 5-4 10-11 15z" fill="currentColor"/>
            </svg>
          </span>
          <span class="menu-brand-line"></span>
        </div>
        <div class="pause-menu__social"></div>
        <div class="pause-menu__actions">
          <button type="button" class="pause-menu__btn pause-menu__btn--play" data-action="resume">RESUME</button>
          <button type="button" class="pause-menu__btn" data-action="settings">SETTINGS</button>
          <button type="button" class="pause-menu__btn" data-action="social">SOCIAL</button>
          <button type="button" class="pause-menu__btn" data-action="title">QUIT TO TITLE</button>
        </div>
      </div>
    `;

    this.socialEl = this.root.querySelector('.pause-menu__social')!;

    this.root.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const action = btn.dataset.action as PauseMenuAction;
        if (action === 'resume' || action === 'title' || action === 'settings' || action === 'social') {
          this.onAction?.(action);
        }
      });
    });
  }

  on(handler: (action: PauseMenuAction) => void): void {
    this.onAction = handler;
  }

  onJoinRequestRespond(handler: (requestId: string, accept: boolean) => void): void {
    this.onJoinRespond = handler;
  }

  setSocial(opts: { requests: PauseJoinRequest[] }): void {
    const { requests } = opts;

    if (!requests.length) {
      this.socialEl.innerHTML = '';
      return;
    }

    this.socialEl.innerHTML = `
      <section class="pause-menu__block">
        <p class="pause-menu__section-title">Join requests</p>
        ${requests
          .map(
            (r) => `
          <div class="pause-menu__row pause-menu__row--stack">
            <span class="pause-menu__row-text">${escapeHtml(r.name)} wants to join</span>
            <div class="pause-menu__row-actions">
              <button type="button" class="pause-menu__btn pause-menu__btn--small" data-accept="${r.id}">Accept</button>
              <button type="button" class="pause-menu__btn pause-menu__btn--small pause-menu__btn--ghost" data-deny="${r.id}">Deny</button>
            </div>
          </div>
        `,
          )
          .join('')}
      </section>
    `;

    this.socialEl.querySelectorAll<HTMLButtonElement>('[data-accept]').forEach((btn) => {
      btn.addEventListener('click', () => this.onJoinRespond?.(btn.dataset.accept!, true));
    });
    this.socialEl.querySelectorAll<HTMLButtonElement>('[data-deny]').forEach((btn) => {
      btn.addEventListener('click', () => this.onJoinRespond?.(btn.dataset.deny!, false));
    });
  }

  get isOpen(): boolean {
    return this.open;
  }

  setOpen(open: boolean): void {
    this.open = open;
    this.root.hidden = !open;
    this.root.classList.toggle('pause-menu--open', open);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
