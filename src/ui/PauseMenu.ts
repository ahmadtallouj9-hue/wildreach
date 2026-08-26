export type PauseMenuAction = 'resume' | 'title' | 'settings' | 'social';

export type PauseJoinRequest = { id: string; name: string };

/** In-game pause overlay — VYTHERA dark panel with gold accents. */
export class PauseMenu {
  readonly root: HTMLElement;
  private onAction: ((action: PauseMenuAction) => void) | null = null;
  private onJoinRespond: ((requestId: string, accept: boolean) => void) | null = null;
  private socialEl: HTMLElement;
  private open = false;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'pause-menu vy-pause';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="vy-pause__dim" aria-hidden="true"></div>
      <div class="vy-pause__panel" role="dialog" aria-modal="true" aria-labelledby="vy-pause-title">
        <h2 id="vy-pause-title" class="vy-pause__title">VYTHERA</h2>
        <div class="vy-pause__social"></div>
        <div class="vy-pause__actions">
          <button type="button" class="vy-btn vy-btn--primary" data-action="resume">Resume</button>
          <button type="button" class="vy-btn" data-action="settings">Settings</button>
          <button type="button" class="vy-btn" data-action="social">Social</button>
          <button type="button" class="vy-btn" data-action="title">Quit to title</button>
        </div>
      </div>
    `;

    this.socialEl = this.root.querySelector('.vy-pause__social')!;

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
      <section class="vy-pause__block">
        <p class="vy-pause__section">Join requests</p>
        ${requests
          .map(
            (r) => `
          <div class="vy-actions">
            <span class="vy-pause__row-text">${escapeHtml(r.name)} wants to join</span>
            <button type="button" class="vy-btn" data-accept="${r.id}">Accept</button>
            <button type="button" class="vy-btn vy-btn--ghost" data-deny="${r.id}">Deny</button>
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
    this.root.classList.toggle('vy-pause--open', open);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
