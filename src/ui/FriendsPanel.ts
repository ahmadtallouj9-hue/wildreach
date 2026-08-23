import type { SocialClient } from '../net/SocialClient';
import type { FriendSummary, JoinRequestWire } from '../net/socialProtocol';
import { getFriendCode } from '../ui/account';

function statusLabel(f: FriendSummary): string {
  if (!f.online) return 'Offline';
  if (f.inGame) return f.worldName ? `In ${f.worldName}` : 'In world';
  return 'Online';
}

function profileCardHtml(f: FriendSummary): string {
  const p = f.profile;
  return `
    <div class="friend-profile-card">
      <div class="friend-profile-swatch" style="background:${p.accent}"></div>
      <div class="friend-profile-body">
        <p class="friend-profile-name">${escapeHtml(p.name || 'Wanderer')}</p>
        <p class="friend-profile-code">Code ${f.code}</p>
        <p class="friend-profile-meta">${escapeHtml(statusLabel(f))}</p>
        <div class="friend-profile-colors">
          <span style="background:${p.skin}" title="Skin"></span>
          <span style="background:${p.outfit}" title="Outfit"></span>
          <span style="background:${p.hair}" title="Hair"></span>
          <span style="background:${p.pants}" title="Pants"></span>
        </div>
        <p class="friend-profile-style">${escapeHtml(p.style)} · ${escapeHtml(p.hairStyle)} hair · ${escapeHtml(p.hat === 'none' ? 'no hat' : p.hat)}</p>
      </div>
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export class FriendsPanel {
  private listEl: HTMLElement;
  private requestsEl: HTMLElement;
  private codeEl: HTMLElement;
  private statusEl: HTMLElement;
  private toastEl: HTMLElement;
  private addInput: HTMLInputElement;
  private profileModal: HTMLElement;
  private profileBody: HTMLElement;

  constructor(
    host: HTMLElement,
    private social: SocialClient,
  ) {
    this.listEl = host.querySelector('.friends-list')!;
    this.requestsEl = host.querySelector('.friends-requests')!;
    this.codeEl = host.querySelector('.friends-my-code')!;
    this.statusEl = host.querySelector('.mp-status')!;
    this.toastEl = host.querySelector('.friends-toast')!;
    this.addInput = host.querySelector<HTMLInputElement>('.friends-add-input')!;
    this.profileModal = host.querySelector('.friend-profile-modal')!;
    this.profileBody = host.querySelector('.friend-profile-modal-body')!;

    host.querySelector('[data-action="copy-friend-code"]')?.addEventListener('click', () =>
      void this.copyCode(),
    );
    host.querySelector('[data-action="add-friend"]')?.addEventListener('click', () => this.addFriend());
    this.addInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.addFriend();
    });
    host.querySelector('[data-action="close-friend-profile"]')?.addEventListener('click', () =>
      this.hideProfile(),
    );
    this.profileModal.addEventListener('click', (e) => {
      if (e.target === this.profileModal) this.hideProfile();
    });

    this.social.on({
      onRegistered: (code) => {
        this.codeEl.textContent = code || getFriendCode();
        this.render();
      },
      onFriends: () => this.render(),
      onJoinRequest: () => this.renderRequests(),
      onConnection: (ok) => this.setStatus(ok),
      onToast: (title, body) => this.showToast(`${title}${body ? ` — ${body}` : ''}`),
      onError: (msg) => this.showToast(msg),
    });
  }

  refresh(): void {
    this.codeEl.textContent = this.social.friendCode || getFriendCode();
    this.setStatus(this.social.connected);
    this.render();
    this.renderRequests();
  }

  private setStatus(connected: boolean): void {
    if (!this.statusEl) return;
    this.statusEl.textContent = connected
      ? 'Friends server: connected'
      : 'Friends server: reconnecting…';
  }

  private render(): void {
    const friends = this.social.friendList;
    if (!friends.length) {
      this.listEl.innerHTML =
        '<p class="friends-empty">No friends yet. Add someone with their 6-letter code.</p>';
      return;
    }

    this.listEl.innerHTML = friends
      .map(
        (f) => `
      <article class="friend-row" data-id="${f.accountId}">
        <button type="button" class="friend-row-main" data-action="view-friend" data-id="${f.accountId}">
          <span class="friend-dot ${f.online ? (f.inGame ? 'in-game' : 'online') : 'offline'}"></span>
          <span class="friend-row-text">
            <strong>${escapeHtml(f.profile.name || 'Wanderer')}</strong>
            <em>${escapeHtml(statusLabel(f))}</em>
          </span>
        </button>
        <div class="friend-row-actions">
          ${
            f.inGame
              ? `<button type="button" class="menu-btn ghost block-btn" data-action="request-join" data-id="${f.accountId}">Request join</button>`
              : ''
          }
          <button type="button" class="menu-btn quiet" data-action="remove-friend" data-id="${f.accountId}" title="Remove">✕</button>
        </div>
      </article>
    `,
      )
      .join('');

    this.listEl.querySelectorAll('[data-action="view-friend"]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = (el as HTMLElement).dataset.id;
        const friend = friends.find((f) => f.accountId === id);
        if (friend) this.showProfile(friend);
      });
    });
    this.listEl.querySelectorAll('[data-action="request-join"]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = (el as HTMLElement).dataset.id;
        if (id) this.social.requestJoin(id);
      });
    });
    this.listEl.querySelectorAll('[data-action="remove-friend"]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = (el as HTMLElement).dataset.id;
        if (id && confirm('Remove this friend?')) this.social.removeFriend(id);
      });
    });
  }

  private renderRequests(): void {
    const reqs = this.social.incomingRequests;
    if (!reqs.length) {
      this.requestsEl.innerHTML = '';
      this.requestsEl.hidden = true;
      return;
    }
    this.requestsEl.hidden = false;
    this.requestsEl.innerHTML = `
      <p class="friends-section-title">Join requests</p>
      ${reqs
        .map(
          (r) => `
        <div class="friend-request-row" data-id="${r.id}">
          <span><strong>${escapeHtml(r.from.profile.name || 'Friend')}</strong> wants to join your world</span>
          <div class="friend-request-actions">
            <button type="button" class="menu-btn primary block-btn" data-action="accept-join" data-id="${r.id}">Accept</button>
            <button type="button" class="menu-btn ghost block-btn" data-action="deny-join" data-id="${r.id}">Deny</button>
          </div>
        </div>
      `,
        )
        .join('')}
    `;

    this.requestsEl.querySelectorAll('[data-action="accept-join"]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = (el as HTMLElement).dataset.id;
        if (id) {
          this.social.respondJoin(id, true);
          this.renderRequests();
        }
      });
    });
    this.requestsEl.querySelectorAll('[data-action="deny-join"]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = (el as HTMLElement).dataset.id;
        if (id) {
          this.social.respondJoin(id, false);
          this.renderRequests();
        }
      });
    });
  }

  private showProfile(friend: FriendSummary): void {
    this.profileBody.innerHTML = profileCardHtml(friend);
    this.profileModal.hidden = false;
  }

  private hideProfile(): void {
    this.profileModal.hidden = true;
  }

  private addFriend(): void {
    const code = this.addInput.value.trim();
    if (!code) return;
    this.social.addFriend(code);
    this.addInput.value = '';
  }

  private async copyCode(): Promise<void> {
    const code = this.social.friendCode || getFriendCode();
    try {
      await navigator.clipboard.writeText(code);
      this.showToast('Code copied — send it to a friend');
    } catch {
      this.showToast(`Your code: ${code}`);
    }
  }

  private showToast(text: string): void {
    this.toastEl.textContent = text;
    this.toastEl.hidden = false;
    window.setTimeout(() => {
      this.toastEl.hidden = true;
    }, 3200);
  }
}

export type { JoinRequestWire };
