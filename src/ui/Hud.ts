import { BIOMES, type BiomeId } from '../world/Biomes';
import type { DiscoverySystem } from '../discovery/DiscoverySystem';
import type { Landmark } from '../world/LandmarkGen';
import { CHUNK_SIZE } from '../world/blocks';
import { BLOCK_KINDS, BLOCK_NAMES, blockCssColor } from './InventoryUi';
import type { MapPlayerMarker } from '../net/RemotePlayers';
import type { NetLinkStatus } from '../net/NetClient';
import type { CameraDebugInfo } from '../player/PlayerCamera';

export class Hud {
  readonly root: HTMLElement;
  private biomeEl: HTMLElement;
  private biomeLabel: HTMLElement;
  private biomeDot: HTMLElement;
  private compassNeedle: HTMLElement;
  private landmarkPin: HTMLElement;
  private toastEl: HTMLElement;
  private journalPanel: HTMLElement;
  private journalList: HTMLElement;
  private mapCanvas: HTMLCanvasElement;
  private mapCtx: CanvasRenderingContext2D;
  private distanceEl: HTMLElement;
  private seedEl: HTMLElement;
  private paletteWrap: HTMLElement;
  private coordsEl: HTMLElement;
  private journalOpen = false;
  private mapOpen = false;
  private mapPanel: HTMLElement;
  private guideOpen = false;
  private guidePanel: HTMLElement;
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
  private camDebugEl: HTMLElement;
  private genDebugEl: HTMLElement;
  private lookViewerEl: HTMLElement;
  private lookNameEl: HTMLElement;
  private lookKindEl: HTMLElement;
  private lookSwatchEl: HTMLElement;
  private profileChip: HTMLElement;
  private profileNameEl: HTMLElement;
  private profileDot: HTMLElement;
  private heartsEl: HTMLElement;
  private foodBarEl: HTMLElement;
  private hurtFlashEl: HTMLElement;
  private deathScreenEl: HTMLElement;
  private onRespawnClick?: () => void;
  private onTitleClick?: () => void;
  private showFps = false;
  private fpsFrames = 0;
  private fpsTimer = 0;
  private fpsValue = 0;

  constructor(private discovery: DiscoverySystem, seed: string) {
    this.root = document.createElement('div');
    this.root.id = 'hud';
    this.root.className = 'vy-hud';
    this.root.innerHTML = `
      <div class="vy-hud__brand">
        <span class="vy-hud__brand-title">VYTHERA</span>
        <span class="vy-chip vy-hud__profile" hidden>
          <span class="vy-dot vy-hud__profile-dot"></span>
          <span class="vy-hud__profile-name"></span>
        </span>
      </div>
      <div class="vy-chip vy-hud__day" data-day-chip aria-label="World time">Exploring</div>
      <div class="vy-hud__compass" aria-hidden="true">
        <span class="vy-hud__tick vy-hud__tick--n">N</span>
        <span class="vy-hud__tick vy-hud__tick--e">E</span>
        <span class="vy-hud__tick vy-hud__tick--s">S</span>
        <span class="vy-hud__tick vy-hud__tick--w">W</span>
        <div class="vy-hud__needle"></div>
        <div class="vy-hud__pin" hidden></div>
      </div>
      <div class="vy-chip vy-hud__biome">
        <span class="vy-dot vy-hud__biome-dot"></span>
        <span class="vy-hud__biome-label">…</span>
      </div>
      <div class="vy-chip vy-hud__mp" hidden>
        <span class="vy-dot vy-hud__mp-dot"></span>
        <span class="vy-hud__mp-label">Solo</span>
      </div>
      <div class="vy-hud__coords" aria-label="Coordinates"></div>
      <div class="vy-hud__gen-debug" hidden aria-label="Engine Debug Info"></div>
      <div class="vy-hud__cam-debug" hidden aria-label="Camera Debug Info"></div>
      <div class="vy-hud__look" hidden aria-live="polite">
        <span class="vy-hud__look-swatch" aria-hidden="true"></span>
        <div class="vy-hud__look-text">
          <span class="vy-hud__look-kind"></span>
          <span class="vy-hud__look-name"></span>
        </div>
      </div>
      <div class="vy-hud__reticle"></div>
      <div class="vy-hud__toasts"></div>
      <div class="vy-hud__palette" hidden aria-hidden="true"></div>
      <aside class="vy-side vy-hud__journal" hidden>
        <header>
          <h2>DISCOVERY</h2>
          <button type="button" class="vy-btn vy-btn--ghost vy-hud__close-journal" aria-label="Close">✕</button>
        </header>
        <p class="vy-hud__journal-meta"><span class="vy-hud__distance">0</span> strides · seed <code class="vy-hud__seed"></code></p>
        <ul class="vy-hud__journal-list"></ul>
        <p class="vy-hud__hint">LMB break · RMB / F place · 1–9 select · J discovery · M map</p>
      </aside>
      <aside class="vy-side vy-hud__map" hidden>
        <header>
          <h2>WORLD MAP</h2>
          <button type="button" class="vy-btn vy-btn--ghost vy-hud__close-map" aria-label="Close">✕</button>
        </header>
        <p class="vy-hud__map-meta"><span class="vy-hud__map-world">World</span> · <span class="vy-hud__map-count">1 here</span></p>
        <canvas class="vy-hud__map-canvas" width="360" height="360"></canvas>
        <ul class="vy-hud__map-legend" aria-hidden="true">
          <li><span class="vy-hud__legend-you"></span> You</li>
          <li><span class="vy-hud__legend-other"></span> Players</li>
          <li><span class="vy-hud__legend-site"></span> Sites</li>
        </ul>
        <ul class="vy-hud__map-roster"></ul>
      </aside>
      <aside class="vy-side vy-hud__guide" hidden>
        <header>
          <h2>GUIDE</h2>
          <button type="button" class="vy-btn vy-btn--ghost vy-hud__close-guide" aria-label="Close guide">✕</button>
        </header>
        <div class="vy-hud__guide-body">
          <section class="vy-hud__guide-sec">
            <h3>Move</h3>
            <p><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> walk · <kbd>Space</kbd> jump · <kbd>Shift</kbd> sprint · <kbd>Ctrl</kbd> sneak · mouse to look</p>
          </section>
          <section class="vy-hud__guide-sec">
            <h3>Break &amp; place</h3>
            <p><strong>LMB</strong> (hold) breaks the aimed block / attack · <strong>RMB</strong> / <kbd>F</kbd> places the selected block / eat</p>
          </section>
          <section class="vy-hud__guide-sec">
            <h3>Hotbar</h3>
            <p><kbd>1</kbd>–<kbd>9</kbd> select · scroll to cycle · <kbd>E</kbd> pack &amp; craft</p>
          </section>
          <section class="vy-hud__guide-sec">
            <h3>World</h3>
            <p><kbd>T</kbd> / <kbd>Enter</kbd> chat · <kbd>J</kbd> journal · <kbd>M</kbd> map · <kbd>V</kbd> view · <kbd>G</kbd> this guide</p>
          </section>
        </div>
      </aside>
      <div class="vy-hud__survival" aria-label="Player health and hunger">
        <div class="vy-hud__hearts" aria-label="Health"></div>
        <div class="vy-hud__food-bar" aria-label="Hunger"></div>
      </div>
      <div class="vy-hud__hurt-flash" aria-hidden="true"></div>
      <div class="vy-death-screen" hidden>
        <div class="vy-death-card">
          <h1 class="vy-death-title">YOU DIED</h1>
          <p class="vy-death-subtitle">Your journey continues with a new dawn.</p>
          <div class="vy-death-actions">
            <button type="button" class="vy-btn vy-btn--primary vy-death-respawn">Respawn</button>
            <button type="button" class="vy-btn vy-btn--ghost vy-death-title-btn">Quit to Title</button>
          </div>
        </div>
      </div>
      <div class="vy-uw" aria-hidden="true"></div>
      <div class="vy-hud__fps" hidden>0 FPS</div>
    `;

    this.biomeEl = this.root.querySelector('.vy-hud__biome')!;
    this.biomeLabel = this.root.querySelector('.vy-hud__biome-label')!;
    this.biomeDot = this.root.querySelector('.vy-hud__biome-dot')!;
    this.compassNeedle = this.root.querySelector('.vy-hud__needle')!;
    this.landmarkPin = this.root.querySelector('.vy-hud__pin')!;
    this.toastEl = this.root.querySelector('.vy-hud__toasts')!;
    this.journalPanel = this.root.querySelector('.vy-hud__journal')!;
    this.journalList = this.root.querySelector('.vy-hud__journal-list')!;
    this.mapPanel = this.root.querySelector('.vy-hud__map')!;
    this.guidePanel = this.root.querySelector('.vy-hud__guide')!;
    this.mapCanvas = this.root.querySelector('.vy-hud__map-canvas')!;
    this.mapCtx = this.mapCanvas.getContext('2d')!;
    this.distanceEl = this.root.querySelector('.vy-hud__distance')!;
    this.seedEl = this.root.querySelector('.vy-hud__seed')!;
    this.underwaterOverlay = this.root.querySelector('.vy-uw')!;
    this.mpChip = this.root.querySelector('.vy-hud__mp')!;
    this.mpLabel = this.root.querySelector('.vy-hud__mp-label')!;
    this.mapRosterEl = this.root.querySelector('.vy-hud__map-roster')!;
    this.mapMetaCountEl = this.root.querySelector('.vy-hud__map-count')!;
    this.mapWorldNameEl = this.root.querySelector('.vy-hud__map-world')!;
    this.paletteWrap = this.root.querySelector('.vy-hud__palette')!;
    this.coordsEl = this.root.querySelector('.vy-hud__coords')!;
    this.fpsEl = this.root.querySelector('.vy-hud__fps')!;
    this.camDebugEl = this.root.querySelector('.vy-hud__cam-debug')!;
    this.genDebugEl = this.root.querySelector('.vy-hud__gen-debug')!;
    this.lookViewerEl = this.root.querySelector('.vy-hud__look')!;
    this.lookNameEl = this.root.querySelector('.vy-hud__look-name')!;
    this.lookKindEl = this.root.querySelector('.vy-hud__look-kind')!;
    this.lookSwatchEl = this.root.querySelector('.vy-hud__look-swatch')!;
    this.profileChip = this.root.querySelector('.vy-hud__profile')!;
    this.profileNameEl = this.root.querySelector('.vy-hud__profile-name')!;
    this.profileDot = this.root.querySelector('.vy-hud__profile-dot')!;
    this.heartsEl = this.root.querySelector('.vy-hud__hearts')!;
    this.foodBarEl = this.root.querySelector('.vy-hud__food-bar')!;
    this.hurtFlashEl = this.root.querySelector('.vy-hud__hurt-flash')!;
    this.deathScreenEl = this.root.querySelector('.vy-death-screen')!;
    this.seedEl.textContent = seed;

    this.root.querySelector('.vy-death-respawn')!.addEventListener('click', () => {
      this.onRespawnClick?.();
    });
    this.root.querySelector('.vy-death-title-btn')!.addEventListener('click', () => {
      this.onTitleClick?.();
    });

    this.root.querySelector('.vy-hud__close-journal')!.addEventListener('click', () => this.setJournal(false));
    this.root.querySelector('.vy-hud__close-map')!.addEventListener('click', () => this.setMap(false));
    this.root.querySelector('.vy-hud__close-guide')!.addEventListener('click', () => this.setGuide(false));

    window.addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.code === 'KeyG') this.setGuide(!this.guideOpen);
      if (e.code === 'KeyJ') this.setJournal(!this.journalOpen);
      if (e.code === 'KeyM') this.setMap(!this.mapOpen);
      if (e.code === 'Escape') {
        this.setJournal(false);
        this.setMap(false);
        this.setGuide(false);
      }
    });

    this.discovery.onDiscover(() => this.refreshJournal());
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
      this.mapWorldNameEl.textContent = opts.worldName;
    }
    const online = opts.status === 'connected';
    const linking = opts.status === 'connecting' || opts.status === 'reconnecting';
    // Always show link state — Offline must be readable in solo play.
    this.mpChip.hidden = false;
    this.mpChip.classList.toggle('vy-hud__mp--online', online);
    this.mpChip.classList.toggle('vy-hud__mp--wait', linking);
    this.mpChip.classList.toggle('vy-hud__mp--down', opts.status === 'offline');
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
    this.mapMetaCountEl.textContent =
      opts.count <= 1 ? 'Just you' : `${opts.count} players`;
    const rows = [
      `<li class="vy-hud__roster-you"><span class="vy-dot"></span>${escapeHtml(this.localPlayerName)} (you)</li>`,
    ];
    for (const name of opts.others ?? []) {
      rows.push(`<li><span class="vy-dot vy-hud__roster-other"></span>${escapeHtml(name)}</li>`);
    }
    this.mapRosterEl.innerHTML = rows.join('');
  }

  setLocalPlayerName(name: string): void {
    this.localPlayerName = name.trim() || 'You';
  }

  showToast(title: string, detail = ''): void {
    const el = document.createElement('div');
    el.className = 'vy-toast';
    el.innerHTML = detail
      ? `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span>`
      : `<strong>${escapeHtml(title)}</strong>`;
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

  setCameraDebug(info: CameraDebugInfo | null): void {
    if (!this.camDebugEl) return;
    if (!info) {
      this.camDebugEl.hidden = true;
      return;
    }
    this.camDebugEl.hidden = false;
    this.camDebugEl.innerHTML = `
      <div style="font-weight:bold;margin-bottom:2px;color:#ffe066;">[CAMERA DEBUG]</div>
      <div>Physics Pos: (${info.physicsPos.x.toFixed(2)}, ${info.physicsPos.y.toFixed(2)}, ${info.physicsPos.z.toFixed(2)})</div>
      <div>Interpolated Pos: (${info.interpolatedPos.x.toFixed(2)}, ${info.interpolatedPos.y.toFixed(2)}, ${info.interpolatedPos.z.toFixed(2)})</div>
      <div>Physics Yaw: ${((info.physicsYaw * 180) / Math.PI).toFixed(1)}°</div>
      <div>Target Yaw: ${((info.targetYaw * 180) / Math.PI).toFixed(1)}°</div>
      <div>Render Yaw: ${((info.renderYaw * 180) / Math.PI).toFixed(1)}°</div>
      <div>Physics Pitch: ${((info.physicsPitch * 180) / Math.PI).toFixed(1)}°</div>
      <div>Target Pitch: ${((info.targetPitch * 180) / Math.PI).toFixed(1)}°</div>
      <div>Render Pitch: ${((info.renderPitch * 180) / Math.PI).toFixed(1)}°</div>
      <div>Render Delta: ${(info.renderDelta * 1000).toFixed(1)} ms</div>
      <div>Render Alpha: ${info.renderAlpha.toFixed(3)}</div>
      <div>Horiz Speed: ${info.horizontalSpeed.toFixed(2)} b/s</div>
      <div>Camera FOV: ${info.cameraFov.toFixed(1)}°</div>
    `;
  }

  get isJournalOpen(): boolean {
    return this.journalOpen;
  }

  get isMapOpen(): boolean {
    return this.mapOpen;
  }

  get isGuideOpen(): boolean {
    return this.guideOpen;
  }

  setPointerLocked(_locked: boolean): void {
    /* Escape opens the pause menu; no click-to-play overlay. */
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

  setSurvival(health: number, maxHealth: number, hunger: number, maxHunger: number, hurtFlash = 0): void {
    // 1. Health Hearts (10 icons = 20 HP)
    const heartsCount = 10;
    let heartsHtml = '';
    for (let i = 0; i < heartsCount; i++) {
      const heartHp = (i + 1) * 2;
      let state = 'empty';
      if (health >= heartHp) state = 'full';
      else if (health >= heartHp - 1) state = 'half';
      heartsHtml += `<span class="vy-hud__heart vy-hud__heart--${state}" aria-hidden="true">♥</span>`;
    }
    this.heartsEl.innerHTML = heartsHtml;
    this.heartsEl.setAttribute('title', `Health: ${Math.round(health)} / ${maxHealth}`);

    // 2. Hunger Drumsticks (10 icons = 20 Hunger)
    const foodCount = 10;
    let foodHtml = '';
    for (let i = 0; i < foodCount; i++) {
      const foodVal = (i + 1) * 2;
      let state = 'empty';
      if (hunger >= foodVal) state = 'full';
      else if (hunger >= foodVal - 1) state = 'half';
      foodHtml += `<span class="vy-hud__food vy-hud__food--${state}" aria-hidden="true">🍖</span>`;
    }
    this.foodBarEl.innerHTML = foodHtml;
    this.foodBarEl.setAttribute('title', `Hunger: ${Math.round(hunger)} / ${maxHunger}`);

    // 3. Hurt Flash Red Screen Vignette
    if (hurtFlash > 0.01) {
      this.hurtFlashEl.style.opacity = String(Math.min(0.7, hurtFlash * 0.8));
      this.hurtFlashEl.style.visibility = 'visible';
    } else {
      this.hurtFlashEl.style.opacity = '0';
      this.hurtFlashEl.style.visibility = 'hidden';
    }
  }

  showDeathScreen(show: boolean): void {
    this.deathScreenEl.hidden = !show;
    this.root.classList.toggle('is-dead', show);
  }

  onDeathActions(opts: { onRespawn: () => void; onTitle: () => void }): void {
    this.onRespawnClick = opts.onRespawn;
    this.onTitleClick = opts.onTitle;
  }

  setMenuOpen(open: boolean): void {
    this.root.classList.toggle('menu-open', open);
  }

  /** Inventory hotbar replaces the material tray. */
  hidePalette(): void {
    this.paletteWrap.hidden = true;
    this.paletteWrap.style.display = 'none';
  }

  setProfileName(name: string, accent?: string): void {
    const label = name.trim();
    if (!label) {
      this.profileChip.hidden = true;
      return;
    }
    this.profileChip.hidden = false;
    this.profileNameEl.textContent = label;
    if (accent) this.profileDot.style.background = accent;
  }

  private setJournal(open: boolean): void {
    this.journalOpen = open;
    this.journalPanel.hidden = !open;
    if (open) {
      this.setMap(false);
      this.setGuide(false);
      this.refreshJournal();
    }
  }

  private setMap(open: boolean): void {
    this.mapOpen = open;
    this.mapPanel.hidden = !open;
    if (open) {
      this.setJournal(false);
      this.setGuide(false);
    }
  }

  private setGuide(open: boolean): void {
    this.guideOpen = open;
    this.guidePanel.hidden = !open;
    if (open) {
      this.setJournal(false);
      this.setMap(false);
    }
  }

  private refreshJournal(): void {
    const items: string[] = [];
    for (const id of this.discovery.visitedBiomes) {
      items.push(
        `<li class="vy-hud__entry vy-hud__entry--biome"><span class="vy-hud__tag">Biome</span>${escapeHtml(BIOMES[id].name)}</li>`,
      );
    }
    for (const lm of this.discovery.foundLandmarks.values()) {
      items.push(
        `<li class="vy-hud__entry vy-hud__entry--site"><span class="vy-hud__tag">Site</span>${escapeHtml(lm.name)}</li>`,
      );
    }
    this.journalList.innerHTML =
      items.length > 0
        ? items.join('')
        : '<li class="vy-hud__entry vy-hud__entry--empty">Nothing logged yet — walk the reaches.</li>';
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
    this.biomeLabel.textContent = def.name;
    this.biomeDot.style.background = def.color;
    this.biomeEl.style.borderColor = def.color;

    this.compassNeedle.style.transform = `rotate(${opts.facingDeg}deg)`;

    const x = opts.playerX;
    const y = opts.playerY;
    const z = opts.playerZ;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    this.coordsEl.textContent = `X ${x.toFixed(1)}  Y ${Math.floor(y)}  Z ${z.toFixed(1)}  Chunk ${cx} ${cz}`;

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

    // Engine debug overlay (?genDebug=…): worldgen info plus the appended
    // profiler metrics line built by Game.
    if (opts.genDebug) {
      this.genDebugEl.hidden = false;
      this.genDebugEl.textContent = opts.genDebug;
    } else {
      this.genDebugEl.hidden = true;
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
    ctx.fillStyle = '#080b0e';
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
      ctx.fillStyle = '#121820';
      ctx.fillRect(dx, dy, CHUNK_SIZE * scale - 1, CHUNK_SIZE * scale - 1);
    }

    for (const lm of landmarks) {
      const dx = (lm.wx - px) * scale + w / 2;
      const dy = (lm.wz - pz) * scale + h / 2;
      const found = this.discovery.foundLandmarks.has(lm.id);
      ctx.fillStyle = found ? '#c9a227' : '#3a4540';
      ctx.beginPath();
      ctx.arc(dx, dy, found ? 4.5 : 2.5, 0, Math.PI * 2);
      ctx.fill();
      if (found) {
        ctx.fillStyle = 'rgba(230, 235, 228, 0.85)';
        ctx.font = '600 9px Outfit, sans-serif';
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

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c,
  );
}
