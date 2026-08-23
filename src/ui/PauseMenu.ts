export type PauseMenuAction = 'resume' | 'title';

export type PauseJoinRequest = { id: string; name: string };
export type PauseFriendRow = {
  accountId: string;
  name: string;
  status: string;
  online: boolean;
  inGame: boolean;
  canInvite: boolean;
};

/** Minecraft-style in-game pause overlay with friend invites. */
export class PauseMenu {
  readonly root: HTMLElement;
  private onAction: ((action: PauseMenuAction) => void) | null = null;
  private onJoinRespond: ((requestId: string, accept: boolean) => void) | null = null;
  private onInviteFriend: ((accountId: string) => void) | null = null;
  private socialEl: HTMLElement;
  private open = false;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'pause-menu';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="pause-menu__dim" aria-hidden="true"></div>
      <div class="pause-menu__panel" role="dialog" aria-modal="true" aria-labelledby="pause-menu-title">
        <h2 id="pause-menu-title" class="pause-menu__title">Game Menu</h2>
        <div class="pause-menu__social"></div>
        <div class="pause-menu__actions">
          <button type="button" class="pause-menu__btn" data-action="resume">Back to Game</button>
          <button type="button" class="pause-menu__btn" data-action="title">Quit to Title</button>
        </div>
      </div>
    `;

    this.socialEl = this.root.querySelector('.pause-menu__social')!;

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

  onFriendInvite(handler: (accountId: string) => void): void {
    this.onInviteFriend = handler;
  }

  setSocial(opts: { requests: PauseJoinRequest[]; friends: PauseFriendRow[] }): void {
    const { requests, friends } = opts;
    const parts: string[] = [];

    if (requests.length) {
      parts.push(`
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
      `);
    }

    parts.push(`
      <section class="pause-menu__block">
        <p class="pause-menu__section-title">Friends</p>
        ${
          friends.length
            ? friends
                .map(
                  (f) => `
            <div class="pause-menu__row">
              <span class="pause-menu__dot ${f.inGame ? 'in-game' : f.online ? 'online' : 'offline'}"></span>
              <span class="pause-menu__row-text">
                <strong>${escapeHtml(f.name)}</strong>
                <span class="pause-menu__badge pause-menu__badge--${f.inGame ? 'in-game' : f.online ? 'online' : 'offline'}">${
                  f.inGame ? 'IN WORLD' : f.online ? 'IN MENU' : 'OFFLINE'
                }</span>
                <em>${escapeHtml(f.status)}</em>
              </span>
              <div class="pause-menu__row-actions">
                ${
                  f.canInvite
                    ? `<button type="button" class="pause-menu__btn pause-menu__btn--small pause-menu__btn--invite" data-invite="${f.accountId}">Invite</button>`
                    : `<span class="pause-menu__row-muted">${f.online ? '—' : 'Offline'}</span>`
                }
              </div>
            </div>
          `,
                )
                .join('')
            : `<p class="pause-menu__empty">Add friends from Title → Friends, then invite them here.</p>`
        }
      </section>
    `);

    this.socialEl.innerHTML = parts.join('');

    this.socialEl.querySelectorAll<HTMLButtonElement>('[data-accept]').forEach((btn) => {
      btn.addEventListener('click', () => this.onJoinRespond?.(btn.dataset.accept!, true));
    });
    this.socialEl.querySelectorAll<HTMLButtonElement>('[data-deny]').forEach((btn) => {
      btn.addEventListener('click', () => this.onJoinRespond?.(btn.dataset.deny!, false));
    });
    this.socialEl.querySelectorAll<HTMLButtonElement>('[data-invite]').forEach((btn) => {
      btn.addEventListener('click', () => this.onInviteFriend?.(btn.dataset.invite!));
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
