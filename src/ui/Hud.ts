import { BIOMES, type BiomeId } from '../world/Biomes';
import type { DiscoverySystem } from '../discovery/DiscoverySystem';
import type { Landmark } from '../world/LandmarkGen';
import { CHUNK_SIZE } from '../world/blocks';
import { PLACEABLE, blockCssColor } from '../player/BlockInteraction';
import { BLOCK_KINDS, BLOCK_NAMES } from './InventoryUi';
import type { MapPlayerMarker } from '../net/RemotePlayers';
import type { NetLinkStatus } from '../net/NetClient';

export class Hud {
  readonly root: HTMLElement;
  private biomeEl: HTMLElement;
  private compassNeedle: HTMLElement;
  private landmarkPin: HTMLElement;
  private toastEl: HTMLElement;
  private journalPanel: HTMLElement;
  private journalList: HTMLElement;
  private mapCanvas: HTMLCanvasElement;
  private mapCtx: CanvasRenderingContext2D;
  private distanceEl: HTMLElement;
  private seedEl: HTMLElement;
  private paletteEl: HTMLElement;
  private paletteNameEl: HTMLElement;
  private coordsEl: HTMLElement;
  private coordsChunkEl: HTMLElement;
  private journalOpen = false;
  private mapOpen = false;
  private mapPanel: HTMLElement;
  private underwaterOverlay: HTMLElement;
  private mpChip: HTMLElement;
  private mpLabel: HTMLElement;
  private mapRosterEl: HTMLElement;
  private mapMetaCountEl: HTMLElement;
  private mapWorldNameEl: HTMLElement;
  private worldLinkStatus: NetLinkStatus = 'offline';
  private worldDisplayName = 'World';
  private localPlayerName = 'You';
  private toasts: { el: HTMLElement; t: number }[] = [];
  private fpsEl: HTMLElement;
  private lookViewerEl: HTMLElement;
  private lookNameEl: HTMLElement;
  private lookKindEl: HTMLElement;
  private lookSwatchEl: HTMLElement;
  private showFps = false;
  private fpsFrames = 0;
  private fpsTimer = 0;
  private fpsValue = 0;

  constructor(private discovery: DiscoverySystem, seed: string) {
    this.root = document.createElement('div');
    this.root.id = 'hud';
    this.root.innerHTML = `
      <div class="hud-frame">
      <div class="brand">
        <span class="brand-title">VYTHERA</span>
        <span class="profile-chip" hidden><span class="profile-dot"></span><span class="profile-name"></span></span>
      </div>
      <div class="compass" aria-hidden="true">
        <div class="compass-ring">
          <span class="tick n">N</span>
          <span class="tick e">E</span>
          <span class="tick s">S</span>
          <span class="tick w">W</span>
          <div class="needle"></div>
          <div class="landmark-pin" hidden></div>
        </div>
      </div>
      <div class="biome-chip"><span class="dot"></span><span class="label">…</span></div>
      <div class="mp-chip" hidden><span class="mp-dot"></span><span class="mp-label">Solo</span></div>
      <div class="coords" aria-label="Coordinates">
        <span class="coords-xyz">XYZ 0 0 0</span>
        <span class="coords-chunk">Chunk 0 0</span>
      </div>
      <div class="look-viewer" hidden aria-live="polite">
        <span class="look-swatch" aria-hidden="true"></span>
        <div class="look-text">
          <span class="look-kind"></span>
          <span class="look-name"></span>
        </div>
      </div>
      <div class="reticle"></div>
      <div class="toast-stack"></div>
      <div class="palette-wrap">
        <div class="palette-name" aria-live="polite"></div>
        <div class="block-palette" role="listbox" aria-label="Placeable blocks"></div>
      </div>
      <aside class="journal" hidden>
        <header>
          <h2>FIELD JOURNAL</h2>
          <button type="button" class="close-journal" aria-label="Close">✕</button>
        </header>
        <p class="journal-meta"><span class="distance">0</span> strides · seed <code class="seed"></code></p>
        <ul class="journal-list"></ul>
        <p class="hint">LMB break · RMB / F place · 1–9 select · J journal · M map</p>
      </aside>
      <aside class="map-panel" hidden>
        <header>
          <h2>WORLD MAP</h2>
          <button type="button" class="close-map" aria-label="Close">✕</button>
        </header>
        <p class="map-meta"><span class="map-world-name">World</span> · <span class="map-player-count">1 here</span></p>
        <canvas class="sketch-map" width="360" height="360"></canvas>
        <ul class="map-legend" aria-hidden="true">
          <li><span class="map-legend-you"></span> You</li>
          <li><span class="map-legend-other"></span> Players</li>
          <li><span class="map-legend-site"></span> Sites</li>
        </ul>
        <ul class="map-roster"></ul>
      </aside>
      <div class="underwater-overlay" aria-hidden="true">
        <span class="uw-bubble"></span>
        <span class="uw-bubble"></span>
        <span class="uw-bubble"></span>
        <span class="uw-bubble"></span>
        <span class="uw-bubble"></span>
        <span class="uw-bubble"></span>
      </div>
      <div class="fps-chip" hidden>0 FPS</div>
      </div>
    `;

    this.biomeEl = this.root.querySelector('.biome-chip')!;
    this.compassNeedle = this.root.querySelector('.needle')!;
    this.landmarkPin = this.root.querySelector('.landmark-pin')!;
    this.toastEl = this.root.querySelector('.toast-stack')!;
    this.journalPanel = this.root.querySelector('.journal')!;
    this.journalList = this.root.querySelector('.journal-list')!;
    this.mapPanel = this.root.querySelector('.map-panel')!;
    this.mapCanvas = this.root.querySelector('.sketch-map')!;
    this.mapCtx = this.mapCanvas.getContext('2d')!;
    this.distanceEl = this.root.querySelector('.distance')!;
    this.seedEl = this.root.querySelector('.seed')!;
    this.underwaterOverlay = this.root.querySelector('.underwater-overlay')!;
    this.mpChip = this.root.querySelector('.mp-chip')!;
    this.mpLabel = this.root.querySelector('.mp-label')!;
    this.mapRosterEl = this.root.querySelector('.map-roster')!;
    this.mapMetaCountEl = this.root.querySelector('.map-player-count')!;
    this.mapWorldNameEl = this.root.querySelector('.map-world-name')!;
    this.paletteEl = this.root.querySelector('.block-palette')!;
    this.paletteNameEl = this.root.querySelector('.palette-name')!;
    this.coordsEl = this.root.querySelector('.coords-xyz')!;
    this.coordsChunkEl = this.root.querySelector('.coords-chunk')!;
    this.fpsEl = this.root.querySelector('.fps-chip')!;
    this.lookViewerEl = this.root.querySelector('.look-viewer')!;
    this.lookNameEl = this.root.querySelector('.look-name')!;
    this.lookKindEl = this.root.querySelector('.look-kind')!;
    this.lookSwatchEl = this.root.querySelector('.look-swatch')!;
    this.seedEl.textContent = seed;

    this.buildPalette();

    this.root.querySelector('.close-journal')!.addEventListener('click', () => this.setJournal(false));
    this.root.querySelector('.close-map')!.addEventListener('click', () => this.setMap(false));

    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyJ') this.setJournal(!this.journalOpen);
      if (e.code === 'KeyM') this.setMap(!this.mapOpen);
      if (e.code === 'Escape') {
        this.setJournal(false);
        this.setMap(false);
      }
    });

    this.discovery.onDiscover(() => this.refreshJournal());
    this.setPaletteSelection(0);
  }

  private buildPalette(): void {
    this.paletteEl.innerHTML = PLACEABLE.map(
      (b, i) => `
      <div class="palette-slot" data-index="${i}" title="${b.name} (${i + 1})">
        <span class="swatch" style="background:${blockCssColor(b.id)}"></span>
        <span class="slot-name">${b.name}</span>
        <span class="key">${i + 1}</span>
      </div>`,
    ).join('');
  }

  setPaletteSelection(index: number): void {
    const i = Math.max(0, Math.min(PLACEABLE.length - 1, index));
    const slots = this.paletteEl.querySelectorAll('.palette-slot');
    slots.forEach((el, idx) => {
      el.classList.toggle('active', idx === i);
    });
    const block = PLACEABLE[i];
    this.paletteNameEl.textContent = block ? block.name : '';
  }

  setWorldLink(opts: {
    status: NetLinkStatus;
    count: number;
    worldName?: string;
    others?: string[];
  }): void {
    this.worldLinkStatus = opts.status;
    if (opts.worldName) {
      this.worldDisplayName = opts.worldName;
      if (this.mapWorldNameEl) this.mapWorldNameEl.textContent = opts.worldName;
    }
    const online = opts.status === 'connected';
    const linking = opts.status === 'connecting' || opts.status === 'reconnecting';
    this.mpChip.hidden = opts.status === 'offline';
    this.mpChip.classList.toggle('mp-online', online);
    this.mpChip.classList.toggle('mp-wait', linking);
    this.mpChip.classList.toggle('mp-down', opts.status === 'offline');
    if (opts.status === 'connecting') {
      this.mpLabel.textContent = 'Joining world…';
    } else if (opts.status === 'reconnecting') {
      this.mpLabel.textContent = 'Reconnecting…';
    } else if (online) {
      this.mpLabel.textContent =
        opts.count <= 1 ? 'In world · alone' : `${opts.count} in world`;
    } else {
      this.mpLabel.textContent = 'Offline';
    }
    void this.worldLinkStatus;
    void this.worldDisplayName;
    if (this.mapMetaCountEl) {
      this.mapMetaCountEl.textContent =
        opts.count <= 1 ? 'Just you' : `${opts.count} players`;
    }
    if (this.mapRosterEl) {
      const rows = [
        `<li class="you"><span class="dot"></span>${escapeMap(this.localPlayerName)} (you)</li>`,
      ];
      for (const name of opts.others ?? []) {
        rows.push(`<li><span class="dot other"></span>${escapeMap(name)}</li>`);
      }
      this.mapRosterEl.innerHTML = rows.join('');
    }
  }

  /** Bridge for older call sites */
  setMultiplayer(count: number, online: boolean): void {
    this.setWorldLink({
      status: online ? 'connected' : count > 0 ? 'reconnecting' : 'offline',
      count,
    });
  }

  setLocalPlayerName(name: string): void {
    this.localPlayerName = name.trim() || 'You';
  }

  showToast(title: string, detail = ''): void {
    const el = document.createElement('div');
    el.className = 'toast player';
    el.innerHTML = detail
      ? `<strong>${title}</strong><span>${detail}</span>`
      : `<strong>${title}</strong>`;
    this.toastEl.appendChild(el);
    this.toasts.push({ el, t: 4.5 });
  }

  setUnderwater(amount: number): void {
    const u = Math.min(1, Math.max(0, amount));
    this.underwaterOverlay.style.opacity = String(u * 0.32);
    this.underwaterOverlay.style.visibility = u > 0.02 ? 'visible' : 'hidden';
    this.underwaterOverlay.classList.toggle('uw-active', u > 0.08);
    if (u > 0.02) this.underwaterOverlay.classList.remove('lava-active');
  }

  setInLava(amount: number): void {
    const u = Math.min(1, Math.max(0, amount));
    if (u <= 0.02) {
      this.underwaterOverlay.classList.remove('lava-active');
      return;
    }
    this.underwaterOverlay.classList.add('lava-active');
    this.underwaterOverlay.style.visibility = 'visible';
    this.underwaterOverlay.style.opacity = String(0.18 + u * 0.38);
    this.underwaterOverlay.classList.toggle('uw-active', u > 0.12);
  }

  setShowFps(on: boolean): void {
    this.showFps = on;
    this.fpsEl.hidden = !on;
  }

  tickFps(dt: number): void {
    if (!this.showFps) return;
    this.fpsFrames += 1;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 0.5) {
      this.fpsValue = Math.round(this.fpsFrames / this.fpsTimer);
      this.fpsEl.textContent = `${this.fpsValue} FPS`;
      this.fpsFrames = 0;
      this.fpsTimer = 0;
    }
  }

  get isJournalOpen(): boolean {
    return this.journalOpen;
  }

  get isMapOpen(): boolean {
    return this.mapOpen;
  }

  setPointerLocked(_locked: boolean): void {
    /* Click-to-play overlay removed — Escape opens the pause menu instead. */
  }

  setTouchMode(on: boolean): void {
    this.root.classList.toggle('touch-mode', on);
  }

  setViewMode(mode: string): void {
    this.root.classList.toggle('hud--no-reticle', mode === 'third' || mode === 'front');
  }

  toggleJournal(): void {
    this.setJournal(!this.journalOpen);
    if (this.journalOpen) this.setMap(false);
  }

  toggleMap(): void {
    this.setMap(!this.mapOpen);
    if (this.mapOpen) this.setJournal(false);
  }

  setMenuOpen(open: boolean): void {
    this.root.classList.toggle('menu-open', open);
  }

  /** Inventory hotbar replaces the old material tray. */
  hidePalette(): void {
    const wrap = this.root.querySelector<HTMLElement>('.palette-wrap');
    if (wrap) {
      wrap.hidden = true;
      wrap.style.display = 'none';
    }
  }

  setProfileName(name: string, accent?: string): void {
    const chip = this.root.querySelector<HTMLElement>('.profile-chip');
    const nameEl = this.root.querySelector('.profile-name');
    const dot = this.root.querySelector<HTMLElement>('.profile-dot');
    if (!chip || !nameEl) return;
    const label = name.trim();
    if (!label) {
      chip.hidden = true;
      return;
    }
    chip.hidden = false;
    nameEl.textContent = label;
    if (dot && accent) dot.style.background = accent;
  }

  private setJournal(open: boolean): void {
    this.journalOpen = open;
    this.journalPanel.hidden = !open;
    if (open) this.refreshJournal();
  }

  private setMap(open: boolean): void {
    this.mapOpen = open;
    this.mapPanel.hidden = !open;
  }

  private refreshJournal(): void {
    const items: string[] = [];
    for (const id of this.discovery.visitedBiomes) {
      items.push(`<li class="biome"><span class="tag">Biome</span>${BIOMES[id].name}</li>`);
    }
    for (const lm of this.discovery.foundLandmarks.values()) {
      items.push(`<li class="landmark"><span class="tag">Site</span>${lm.name}</li>`);
    }
    this.journalList.innerHTML =
      items.length > 0 ? items.join('') : '<li class="empty">Nothing logged yet — walk the reaches.</li>';
  }

  update(opts: {
    biome: BiomeId;
    facingDeg: number;
    distance: number;
    nearest: { landmark: Landmark; dist: number } | null;
    playerX: number;
    playerY: number;
    playerZ: number;
    explored: Set<string>;
    landmarks: Landmark[];
    players?: MapPlayerMarker[];
    dt: number;
    genDebug?: string;
    lookAt?: { id: number } | null;
  }): void {
    const def = BIOMES[opts.biome];
    const label = this.biomeEl.querySelector('.label')!;
    const dot = this.biomeEl.querySelector('.dot') as HTMLElement;
    label.textContent = def.name;
    dot.style.background = def.color;
    this.biomeEl.style.borderColor = def.color;

    this.compassNeedle.style.transform = `rotate(${opts.facingDeg}deg)`;

    const x = Math.floor(opts.playerX);
    const y = Math.floor(opts.playerY);
    const z = Math.floor(opts.playerZ);
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    this.coordsEl.textContent = opts.genDebug
      ? `XYZ ${x} ${y} ${z} · ${opts.genDebug}`
      : `XYZ ${x} ${y} ${z}`;
    this.coordsChunkEl.textContent = `Chunk ${cx} ${cz}`;

    if (opts.nearest && opts.nearest.dist < 180) {
      this.landmarkPin.hidden = false;
      const ang =
        (Math.atan2(opts.nearest.landmark.wx - opts.playerX, -(opts.nearest.landmark.wz - opts.playerZ)) *
          180) /
          Math.PI -
        opts.facingDeg;
      this.landmarkPin.style.transform = `rotate(${ang}deg) translateY(-34px)`;
    } else {
      this.landmarkPin.hidden = true;
    }

    this.distanceEl.textContent = Math.floor(opts.distance).toString();

    const look = opts.lookAt;
    if (look && look.id > 0) {
      this.lookViewerEl.hidden = false;
      this.lookNameEl.textContent = BLOCK_NAMES[look.id] ?? `Block ${look.id}`;
      this.lookKindEl.textContent = BLOCK_KINDS[look.id] ?? 'Block';
      this.lookSwatchEl.style.background = blockCssColor(look.id);
    } else {
      this.lookViewerEl.hidden = true;
    }

    for (let i = this.toasts.length - 1; i >= 0; i--) {
      this.toasts[i].t -= opts.dt;
      if (this.toasts[i].t <= 0) {
        this.toasts[i].el.remove();
        this.toasts.splice(i, 1);
      }
    }

    if (this.mapOpen) {
      this.drawMap(opts.playerX, opts.playerZ, opts.facingDeg, opts.explored, opts.landmarks, opts.players ?? []);
    }
  }

  private drawMap(
    px: number,
    pz: number,
    facing: number,
    explored: Set<string>,
    landmarks: Landmark[],
    players: MapPlayerMarker[],
  ): void {
    const ctx = this.mapCtx;
    const w = this.mapCanvas.width;
    const h = this.mapCanvas.height;
    const scale = 1.35;
    ctx.fillStyle = '#0a1418';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(94, 196, 176, 0.08)';
    ctx.lineWidth = 1;
    const step = CHUNK_SIZE * scale;
    const ox = (w / 2) % step;
    const oy = (h / 2) % step;
    ctx.beginPath();
    for (let x = ox; x < w; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = oy; y < h; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    const cx = Math.floor(px / CHUNK_SIZE);
    const cz = Math.floor(pz / CHUNK_SIZE);

    for (const key of explored) {
      const [sx, sz] = key.split(',').map(Number);
      const dx = (sx - cx) * CHUNK_SIZE * scale + w / 2;
      const dy = (sz - cz) * CHUNK_SIZE * scale + h / 2;
      ctx.fillStyle = '#1a3840';
      ctx.fillRect(dx, dy, CHUNK_SIZE * scale - 1, CHUNK_SIZE * scale - 1);
    }

    for (const lm of landmarks) {
      const dx = (lm.wx - px) * scale + w / 2;
      const dy = (lm.wz - pz) * scale + h / 2;
      const found = this.discovery.foundLandmarks.has(lm.id);
      ctx.fillStyle = found ? '#5ec4b0' : '#3a5a60';
      ctx.beginPath();
      ctx.arc(dx, dy, found ? 4.5 : 2.5, 0, Math.PI * 2);
      ctx.fill();
      if (found) {
        ctx.fillStyle = 'rgba(232, 244, 240, 0.85)';
        ctx.font = '600 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(lm.name, dx, dy - 8);
      }
    }

    for (const p of players) {
      const dx = (p.x - px) * scale + w / 2;
      const dy = (p.z - pz) * scale + h / 2;
      if (dx < -20 || dy < -20 || dx > w + 20 || dy > h + 20) continue;
      ctx.save();
      ctx.translate(dx, dy);
      ctx.rotate(p.yaw);
      ctx.fillStyle = p.accent || '#7aa2ff';
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(4.5, 5);
      ctx.lineTo(0, 2.5);
      ctx.lineTo(-4.5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.rotate(-p.yaw);
      ctx.fillStyle = '#f5f0e8';
      ctx.font = '700 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.lineWidth = 3;
      ctx.strokeText(p.name, 0, 16);
      ctx.fillText(p.name, 0, 16);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate((facing * Math.PI) / 180);
    ctx.fillStyle = '#e8f4f0';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(5.5, 7);
    ctx.lineTo(0, 3.5);
    ctx.lineTo(-5.5, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = 'rgba(232, 197, 106, 0.9)';
    ctx.font = '700 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', w / 2, 14);
  }
}

function escapeMap(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c,
  );
}
