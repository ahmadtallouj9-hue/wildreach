export type PauseMenuAction = 'resume' | 'title';

type JoinRequestRow = { id: string; name: string };

/** Minecraft-style in-game pause overlay. */
export class PauseMenu {
  readonly root: HTMLElement;
  private onAction: ((action: PauseMenuAction) => void) | null = null;
  private onJoinRespond: ((requestId: string, accept: boolean) => void) | null = null;
  private requestsEl: HTMLElement;
  private open = false;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'pause-menu';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="pause-menu__dim" aria-hidden="true"></div>
      <div class="pause-menu__panel" role="dialog" aria-modal="true" aria-labelledby="pause-menu-title">
        <h2 id="pause-menu-title" class="pause-menu__title">Game Menu</h2>
        <div class="pause-menu__requests" hidden></div>
        <div class="pause-menu__actions">
          <button type="button" class="pause-menu__btn" data-action="resume">Back to Game</button>
          <button type="button" class="pause-menu__btn" data-action="title">Quit to Title</button>
        </div>
      </div>
    `;

    this.requestsEl = this.root.querySelector('.pause-menu__requests')!;

    this.root.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const action = btn.dataset.action as PauseMenuAction;
        if (action === 'resume' || action === 'title') this.onAction?.(action);
      });
    });
  }

  on(handler: (action: PauseMenuAction) => void): void {
    this.onAction = handler;
  }

  onJoinRequestRespond(handler: (requestId: string, accept: boolean) => void): void {
    this.onJoinRespond = handler;
  }

  setJoinRequests(requests: JoinRequestRow[]): void {
    if (!requests.length) {
      this.requestsEl.hidden = true;
      this.requestsEl.innerHTML = '';
      return;
    }
    this.requestsEl.hidden = false;
    this.requestsEl.innerHTML = `
      <p class="pause-menu__requests-title">Join requests</p>
      ${requests
        .map(
          (r) => `
        <div class="pause-menu__request">
          <span>${escapeHtml(r.name)} wants to join</span>
          <div class="pause-menu__request-actions">
            <button type="button" class="pause-menu__btn pause-menu__btn--small" data-accept="${r.id}">Accept</button>
            <button type="button" class="pause-menu__btn pause-menu__btn--small pause-menu__btn--ghost" data-deny="${r.id}">Deny</button>
          </div>
        </div>
      `,
        )
        .join('')}
    `;
    this.requestsEl.querySelectorAll<HTMLButtonElement>('[data-accept]').forEach((btn) => {
      btn.addEventListener('click', () => this.onJoinRespond?.(btn.dataset.accept!, true));
    });
    this.requestsEl.querySelectorAll<HTMLButtonElement>('[data-deny]').forEach((btn) => {
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
