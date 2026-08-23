import type { SocialClient } from '../net/SocialClient';
import type { FriendSummary } from '../net/socialProtocol';
import type { ProfileWire } from '../net/protocol';
import { getFriendCode } from '../ui/account';
import type { Profile } from './prefs';
import { ProfilePreview3D } from './ProfilePreview3D';
import { createDefaultSkin, decodeSkin, drawSkinFrontPreview } from '../player/SkinAtlas';

function wireToProfile(p: ProfileWire): Profile {
  return {
    name: p.name || 'Wanderer',
    accent: p.accent,
    skin: p.skin,
    outfit: p.outfit,
    pants: p.pants,
    hair: p.hair,
    eyes: p.eyes,
    shoes: p.shoes,
    style: p.style ?? 'classic',
    hat: p.hat ?? 'none',
    hairStyle: p.hairStyle ?? 'short',
    face: p.face ?? 'neutral',
    glasses: p.glasses ?? 'none',
    facial: p.facial ?? 'none',
    sleeves: p.sleeves ?? 'bare',
    cape: p.cape ?? 'none',
    skinData: p.skinData,
  };
}

async function pixelsForProfile(p: ProfileWire): Promise<Uint8ClampedArray> {
  if (p.skinData) {
    try {
      return await decodeSkin(p.skinData);
    } catch {
      /* ignore bad skin data */
    }
  }
  return createDefaultSkin(p.skin, p.outfit, p.accent, {
    hair: p.hair,
    eyes: p.eyes,
    shoes: p.shoes,
    hairStyle: p.hairStyle,
    face: p.face,
    facial: p.facial,
    sleeves: p.sleeves,
    pants: p.pants,
    outfit: p.outfit,
    skin: p.skin,
  });
}

function statusLabel(f: FriendSummary): string {
  if (!f.online) return 'Offline';
  if (f.inGame) return f.worldName ? `In world · ${f.worldName}` : 'In world';
  return 'In menu';
}

function statusClass(f: FriendSummary): string {
  if (!f.online) return 'offline';
  if (f.inGame) return 'in-game';
  return 'online';
}

function statusBadge(f: FriendSummary): string {
  const cls = statusClass(f);
  const label = !f.online ? 'OFFLINE' : f.inGame ? 'IN WORLD' : 'IN MENU';
  return `<span class="friend-status-badge friend-status-badge--${cls}">${label}</span>`;
}

function labelOrNone(v: string | undefined, none = 'none'): string {
  if (!v || v === 'none') return none;
  return v;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function profileViewHtml(f: FriendSummary): string {
  const p = f.profile;
  const status = statusLabel(f);
  return `
    <div class="friend-profile-stage-wrap">
      <div class="friend-profile-stage" data-friend-preview></div>
      <p class="friend-profile-stage-hint">Drag to turn · scroll to zoom</p>
    </div>

    <div class="friend-profile-hero friend-profile-hero--text">
      <div class="friend-profile-hero-text">
        <p class="friend-profile-name">${escapeHtml(p.name || 'Wanderer')}</p>
        <p class="friend-profile-code">Code <strong>${escapeHtml(f.code)}</strong></p>
        ${statusBadge(f)}
        <p class="friend-profile-status-detail">${escapeHtml(status)}</p>
      </div>
    </div>

    <section class="friend-profile-section">
      <p class="friend-profile-section-title">Look</p>
      <div class="friend-profile-swatches">
        <div class="friend-profile-swatch-item"><span style="background:${p.skin}"></span><em>Skin</em></div>
        <div class="friend-profile-swatch-item"><span style="background:${p.hair}"></span><em>Hair</em></div>
        <div class="friend-profile-swatch-item"><span style="background:${p.eyes}"></span><em>Eyes</em></div>
        <div class="friend-profile-swatch-item"><span style="background:${p.outfit}"></span><em>Outfit</em></div>
        <div class="friend-profile-swatch-item"><span style="background:${p.pants}"></span><em>Pants</em></div>
        <div class="friend-profile-swatch-item"><span style="background:${p.shoes}"></span><em>Shoes</em></div>
        <div class="friend-profile-swatch-item"><span style="background:${p.accent}"></span><em>Accent</em></div>
      </div>
      <ul class="friend-profile-traits">
        <li><span>Style</span><strong>${escapeHtml(p.style || 'classic')}</strong></li>
        <li><span>Hair</span><strong>${escapeHtml(labelOrNone(p.hairStyle, 'bald'))}</strong></li>
        <li><span>Face</span><strong>${escapeHtml(p.face || 'neutral')}</strong></li>
        <li><span>Hat</span><strong>${escapeHtml(labelOrNone(p.hat))}</strong></li>
        <li><span>Glasses</span><strong>${escapeHtml(labelOrNone(p.glasses))}</strong></li>
        <li><span>Facial</span><strong>${escapeHtml(labelOrNone(p.facial))}</strong></li>
        <li><span>Sleeves</span><strong>${escapeHtml(p.sleeves || 'bare')}</strong></li>
        <li><span>Cape</span><strong>${escapeHtml(labelOrNone(p.cape))}</strong></li>
      </ul>
    </section>

    <section class="friend-profile-section">
      <p class="friend-profile-section-title">World</p>
      <p class="friend-profile-world">
        ${
          f.inGame
            ? `Playing <strong>${escapeHtml(f.worldName || 'a world')}</strong>${f.seed ? ` · seed ${escapeHtml(f.seed)}` : ''}`
            : f.online
              ? 'In the title menu — not in a world yet.'
              : 'Offline right now.'
        }
      </p>
    </section>

    <div class="friend-profile-actions">
      ${
        f.inGame
          ? `<button type="button" class="menu-btn primary block-btn" data-profile-action="request-join" data-id="${f.accountId}">Request to join</button>`
          : `<button type="button" class="menu-btn ghost block-btn" disabled title="Friend must be in a world">Request to join</button>`
      }
      <button type="button" class="menu-btn ghost block-btn" data-profile-action="copy-code" data-code="${escapeHtml(f.code)}">Copy their code</button>
      <button type="button" class="menu-btn quiet block-btn" data-profile-action="remove" data-id="${f.accountId}">Remove friend</button>
    </div>
  `;
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
  private toastTimer = 0;
  private openFriendId: string | null = null;
  private preview: ProfilePreview3D | null = null;
  private previewFriendId: string | null = null;

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
    this.addInput.addEventListener('input', () => {
      this.addInput.value = this.addInput.value.replace(/\D/g, '').slice(0, 6);
    });
    this.addInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.addFriend();
    });
    host.querySelector('[data-action="close-friend-profile"]')?.addEventListener('click', () =>
      this.hideProfile(),
    );
    this.profileModal.addEventListener('click', (e) => {
      if (e.target === this.profileModal) this.hideProfile();
    });
    this.profileBody.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-profile-action]');
      if (!btn) return;
      const action = btn.dataset.profileAction;
      const id = btn.dataset.id;
      if (action === 'request-join' && id) {
        this.social.requestJoin(id);
        this.showToast('Join request sent');
        return;
      }
      if (action === 'copy-code' && btn.dataset.code) {
        void navigator.clipboard.writeText(btn.dataset.code).then(
          () => this.showToast('Friend code copied'),
          () => this.showToast(`Code: ${btn.dataset.code}`),
        );
        return;
      }
      if (action === 'remove' && id) {
        if (!confirm('Remove this friend?')) return;
        this.social.removeFriend(id);
        this.hideProfile();
        this.showToast('Friend removed');
      }
    });

    this.social.on({
      onRegistered: (code) => {
        this.codeEl.textContent = code || getFriendCode();
        this.render();
      },
      onFriends: () => {
        this.render();
        if (this.openFriendId) {
          const friend = this.social.friendList.find((f) => f.accountId === this.openFriendId);
          if (friend) this.showProfile(friend);
          else this.hideProfile();
        }
      },
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
      this.listEl.innerHTML = `
        <div class="friends-empty-card">
          <p class="friends-empty">No friends yet</p>
          <p class="friends-empty-hint">Ask a friend for their 6-digit code, type it above, then tap Add friend. They must open Wildreach once so their code is online.</p>
        </div>
      `;
      return;
    }

    const online = friends.filter((f) => f.online).length;
    this.listEl.innerHTML = `
      <p class="friends-list-meta">${friends.length} friend${friends.length === 1 ? '' : 's'} · ${online} online</p>
      ${friends
        .map(
          (f) => `
      <article class="friend-row" data-id="${f.accountId}">
        <button type="button" class="friend-row-main" data-action="view-friend" data-id="${f.accountId}">
          <canvas class="friend-row-skin" width="32" height="64" data-friend-skin="${f.accountId}" aria-hidden="true"></canvas>
          <span class="friend-dot ${statusClass(f)}"></span>
          <span class="friend-row-text">
            <strong>${escapeHtml(f.profile.name || 'Wanderer')}</strong>
            <span class="friend-row-status-line">
              ${statusBadge(f)}
              ${f.inGame && f.worldName ? `<em class="friend-row-world">${escapeHtml(f.worldName)}</em>` : ''}
            </span>
          </span>
        </button>
        <div class="friend-row-actions">
          ${
            f.inGame
              ? `<button type="button" class="menu-btn primary block-btn friend-join-btn" data-action="request-join" data-id="${f.accountId}">Join</button>`
              : `<button type="button" class="menu-btn ghost block-btn" data-action="view-friend" data-id="${f.accountId}">Profile</button>`
          }
          <button type="button" class="menu-btn quiet" data-action="remove-friend" data-id="${f.accountId}" title="Remove">✕</button>
        </div>
      </article>
    `,
        )
        .join('')}
    `;

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
        if (id) {
          this.social.requestJoin(id);
          this.showToast('Join request sent');
        }
      });
    });
    this.listEl.querySelectorAll('[data-action="remove-friend"]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = (el as HTMLElement).dataset.id;
        if (id && confirm('Remove this friend?')) {
          this.social.removeFriend(id);
          this.showToast('Friend removed');
        }
      });
    });
    this.paintFriendRowSkins(friends);
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
          this.showToast('Invite sent');
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
    this.openFriendId = friend.accountId;
    this.profileBody.innerHTML = profileViewHtml(friend);
    this.profileModal.hidden = false;
    this.mountFriendPreview(friend);
  }

  hideProfile(): void {
    this.openFriendId = null;
    this.stopFriendPreview();
    this.profileBody.innerHTML = '';
    this.profileModal.hidden = true;
  }

  private mountFriendPreview(friend: FriendSummary): void {
    const mount = this.profileBody.querySelector<HTMLElement>('[data-friend-preview]');
    if (!mount) return;
    if (!this.preview) this.preview = new ProfilePreview3D();
    if (this.preview.root.parentElement !== mount) {
      mount.replaceChildren();
      this.preview.mount(mount);
    }
    this.previewFriendId = friend.accountId;
    this.preview.applyProfile(wireToProfile(friend.profile));
    this.preview.start();
    requestAnimationFrame(() => this.preview?.layout());
    const token = friend.accountId;
    void pixelsForProfile(friend.profile).then((pixels) => {
      if (this.previewFriendId !== token) return;
      this.preview?.syncPixels(pixels);
    });
  }

  private stopFriendPreview(): void {
    this.previewFriendId = null;
    this.preview?.stop();
  }

  private paintFriendRowSkins(friends: FriendSummary[]): void {
    this.listEl.querySelectorAll<HTMLCanvasElement>('[data-friend-skin]').forEach((canvas) => {
      const id = canvas.dataset.friendSkin;
      const friend = friends.find((f) => f.accountId === id);
      if (!friend) return;
      void pixelsForProfile(friend.profile).then((pixels) => {
        if (!canvas.isConnected) return;
        drawSkinFrontPreview(pixels, canvas, 2);
      });
    });
  }

  private addFriend(): void {
    const code = this.addInput.value.replace(/\D/g, '').slice(0, 6);
    if (!code) {
      this.showToast('Enter a 6-digit friend code');
      return;
    }
    if (code.length !== 6) {
      this.showToast('Code must be 6 digits');
      return;
    }
    if (!this.social.connected) {
      this.showToast('Friends server offline — wait until it says connected');
      return;
    }
    this.social.addFriend(code);
    this.addInput.value = '';
  }

  private async copyCode(): Promise<void> {
    const code = this.social.friendCode || getFriendCode();
    try {
      await navigator.clipboard.writeText(code);
      this.showToast('Code copied — friend must open the game once, then add this code');
    } catch {
      this.showToast(`Your code: ${code}`);
    }
  }

  private showToast(text: string): void {
    this.toastEl.textContent = text;
    this.toastEl.hidden = false;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.hidden = true;
    }, 4200);
  }
}
