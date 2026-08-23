import {
  ACCENT_SWATCHES,
  EYE_SWATCHES,
  HAIR_SWATCHES,
  OUTFIT_SWATCHES,
  PANTS_SWATCHES,
  SHOE_SWATCHES,
  SKIN_SWATCHES,
  loadProfile,
  loadSettings,
  randomizeProfile,
  saveProfile,
  saveSettings,
  type AvatarStyle,
  type CapeStyle,
  type FaceStyle,
  type FacialStyle,
  type GlassesStyle,
  type HairStyle,
  type HatStyle,
  type Profile,
  type Settings,
  type SleeveStyle,
  type ViewMode,
} from './prefs';
import { SkinEditor } from './SkinEditor';
import { ProfilePreview3D } from './ProfilePreview3D';
import { decodeSkin, drawSkinFrontPreview, createDefaultSkin } from '../player/SkinAtlas';
import {
  SKIN_PRESETS,
  applyPresetToProfile,
  presetMatchesProfile,
} from './SkinPresets';
import { loadLastWorld, saveLastWorld, worldNameFromSeed, worldTagFromSeed } from './worldNames';
import {
  loadWorldSettings,
  saveWorldSettings,
  type TerrainType,
  type WorldSettings,
  type WorldTime,
} from './worldSettings';
import { buildShareUrl, copyShareUrl, replaceUrlForShare } from './shareUrl';

export type MenuAction =
  | { type: 'play'; seed: string }
  | { type: 'resume' }
  | { type: 'prefs'; profile: Profile; settings: Settings; skinPixels?: Uint8ClampedArray };

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

function readSeedFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('seed');
  if (fromUrl && fromUrl.trim()) return fromUrl.trim();
  return randomSeed();
}

type Panel = 'home' | 'settings' | 'customize' | 'skins' | 'world';

export class MainMenu {
  readonly root: HTMLElement;
  private worldSeedInput: HTMLInputElement;
  private worldSettings: WorldSettings = loadWorldSettings('');
  private onAction: ((action: MenuAction) => void) | null = null;
  private hasSession = false;
  private profile: Profile = loadProfile();
  private settings: Settings = loadSettings();
  private skinEditor: SkinEditor | null = null;
  private heroPreview: ProfilePreview3D | null = null;
  private activePresetId: string | null = null;
  private previewPresetId: string | null = null;

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'main-menu';
    this.root.innerHTML = `
      <div class="menu-atmosphere" aria-hidden="true"></div>
      <div class="menu-stage menu-home" data-panel="home">
        <div class="menu-home-inner">
          <header class="menu-header">
            <div class="menu-logo-stack">
              <div class="menu-canopy" aria-hidden="true"></div>
              <div class="menu-logo-mark" aria-hidden="true"></div>
            </div>
            <h1 class="menu-brand">Wildreach</h1>
            <p class="menu-tagline">
              <span class="menu-star" aria-hidden="true">✦</span>
              Wander seeded reaches. Chart what you find.
              <span class="menu-star" aria-hidden="true">✦</span>
            </p>
            <p class="menu-share-hint">Copy your link — friends join the same world and see each other.</p>
          </header>
          <nav class="menu-nav" aria-label="Main menu">
            <button type="button" class="menu-framed-btn menu-framed-btn--play" data-action="play">
              <span class="menu-framed-btn__frame">
                <span class="menu-framed-btn__star" aria-hidden="true">✦</span>
                <span class="menu-framed-btn__label">Play</span>
                <span class="menu-framed-btn__star" aria-hidden="true">✦</span>
              </span>
            </button>
            <button type="button" class="menu-framed-btn" data-action="world">
              <span class="menu-framed-btn__frame">
                <span class="menu-framed-btn__star" aria-hidden="true">✦</span>
                <span class="menu-framed-btn__label">Worlds</span>
                <span class="menu-framed-btn__star" aria-hidden="true">✦</span>
              </span>
            </button>
            <button type="button" class="menu-framed-btn" data-action="settings">
              <span class="menu-framed-btn__frame">
                <span class="menu-framed-btn__star" aria-hidden="true">✦</span>
                <span class="menu-framed-btn__label">Settings</span>
                <span class="menu-framed-btn__star" aria-hidden="true">✦</span>
              </span>
            </button>
            <button type="button" class="menu-framed-btn" data-action="customize">
              <span class="menu-framed-btn__frame">
                <span class="menu-framed-btn__star" aria-hidden="true">✦</span>
                <span class="menu-framed-btn__label">Customize</span>
                <span class="menu-framed-btn__star" aria-hidden="true">✦</span>
              </span>
            </button>
            <button type="button" class="menu-framed-btn" data-action="skins">
              <span class="menu-framed-btn__frame">
                <span class="menu-framed-btn__star" aria-hidden="true">✦</span>
                <span class="menu-framed-btn__label">Skins</span>
                <span class="menu-framed-btn__star" aria-hidden="true">✦</span>
              </span>
            </button>
          </nav>
          <footer class="menu-footer">
            <a class="menu-game-link menu-framed-box" href="#" target="_blank" rel="noopener noreferrer">
              <span class="menu-framed-box__inner">
                <span class="menu-framed-btn__star" aria-hidden="true">✦</span>
                <span class="menu-game-link-text">
                  <span class="menu-game-link-label">Share link</span>
                  <code class="menu-game-link-url"></code>
                </span>
                <span class="menu-framed-btn__star" aria-hidden="true">✦</span>
              </span>
            </a>
            <p class="menu-controls">
              <span class="menu-star" aria-hidden="true">✦</span>
              WASD move · mouse look · E pack · J journal · M map
              <span class="menu-star" aria-hidden="true">✦</span>
            </p>
            <p class="menu-share-toast" hidden>Link copied — send it to your friend!</p>
          </footer>
        </div>
      </div>

      <div class="menu-stage panel" data-panel="settings" hidden>
        <button type="button" class="panel-back" data-action="home">← Back</button>
        <h2 class="panel-title">Settings</h2>
        <label class="field">
          <span>Mouse sensitivity <em class="sens-val">1.0</em></span>
          <input type="range" class="sens-range" min="0.35" max="2.5" step="0.05" />
        </label>
        <label class="field">
          <span>Field of view <em class="fov-val">75</em></span>
          <input type="range" class="fov-range" min="55" max="100" step="1" />
        </label>
        <label class="field">
          <span>Render distance <em class="dist-val">6</em></span>
          <input type="range" class="dist-range" min="3" max="8" step="1" />
        </label>
        <div class="field">
          <span>Person view</span>
          <div class="seg" role="group" aria-label="Camera view">
            <button type="button" class="seg-btn" data-view="first">First person</button>
            <button type="button" class="seg-btn" data-view="third">Third person</button>
            <button type="button" class="seg-btn" data-view="front">Front</button>
          </div>
        </div>
        <button type="button" class="menu-btn primary" data-action="save-settings">Save</button>
      </div>

      <div class="menu-stage panel profile-panel blocky customize-panel" data-panel="customize" hidden>
        <header class="profile-topbar">
          <button type="button" class="panel-back block-btn" data-action="home">← BACK</button>
          <h2 class="panel-title">CUSTOMIZE</h2>
          <button type="button" class="menu-btn primary block-btn" data-action="save-profile">SAVE</button>
        </header>
        <div class="profile-shell">
          <aside class="profile-stage">
            <div class="profile-hero-viewport"></div>
            <div class="profile-stage-meta">
              <span class="profile-preview-name">Wanderer</span>
              <span class="profile-preview-tag">Tweak colors, body, and gear</span>
              <label class="field field-tight">
                <span>Name</span>
                <input type="text" class="name-input" maxlength="20" spellcheck="false" autocomplete="off" />
              </label>
              <button type="button" class="menu-btn ghost block-btn profile-random" data-action="random-look">RANDOM LOOK</button>
            </div>
          </aside>

          <div class="profile-scroll">
            <section class="profile-section block-card">
              <h3 class="profile-section-title">Colors</h3>
              <div class="profile-color-grid">
                <div class="profile-color-cell"><span>Skin</span><div class="swatch-row" data-swatch="skin"></div></div>
                <div class="profile-color-cell"><span>Shirt</span><div class="swatch-row" data-swatch="outfit"></div></div>
                <div class="profile-color-cell"><span>Pants</span><div class="swatch-row" data-swatch="pants"></div></div>
                <div class="profile-color-cell"><span>Accent</span><div class="swatch-row" data-swatch="accent"></div></div>
                <div class="profile-color-cell"><span>Hair</span><div class="swatch-row" data-swatch="hair"></div></div>
                <div class="profile-color-cell"><span>Eyes</span><div class="swatch-row" data-swatch="eyes"></div></div>
                <div class="profile-color-cell"><span>Shoes</span><div class="swatch-row" data-swatch="shoes"></div></div>
              </div>
            </section>

            <section class="profile-section block-card">
              <h3 class="profile-section-title">Body</h3>
              <div class="field field-tight">
                <span>Build</span>
                <div class="seg seg-wrap" role="group" aria-label="Body style">
                  <button type="button" class="seg-btn" data-style="classic">Classic</button>
                  <button type="button" class="seg-btn" data-style="stocky">Stocky</button>
                  <button type="button" class="seg-btn" data-style="tall">Tall</button>
                  <button type="button" class="seg-btn" data-style="slim">Slim</button>
                </div>
              </div>
              <div class="field field-tight">
                <span>Sleeves</span>
                <div class="seg seg-wrap" role="group" aria-label="Sleeves">
                  <button type="button" class="seg-btn" data-sleeves="bare">Bare</button>
                  <button type="button" class="seg-btn" data-sleeves="short">Short</button>
                  <button type="button" class="seg-btn" data-sleeves="long">Long</button>
                </div>
              </div>
            </section>

            <section class="profile-section block-card">
              <h3 class="profile-section-title">Head</h3>
              <div class="field field-tight">
                <span>Hair</span>
                <div class="seg seg-wrap" role="group" aria-label="Hair style">
                  <button type="button" class="seg-btn" data-hair-style="none">Bald</button>
                  <button type="button" class="seg-btn" data-hair-style="short">Short</button>
                  <button type="button" class="seg-btn" data-hair-style="long">Long</button>
                  <button type="button" class="seg-btn" data-hair-style="spiky">Spiky</button>
                  <button type="button" class="seg-btn" data-hair-style="curly">Curly</button>
                  <button type="button" class="seg-btn" data-hair-style="mohawk">Mohawk</button>
                </div>
              </div>
              <div class="field field-tight">
                <span>Face</span>
                <div class="seg seg-wrap" role="group" aria-label="Face">
                  <button type="button" class="seg-btn" data-face="neutral">Neutral</button>
                  <button type="button" class="seg-btn" data-face="smile">Smile</button>
                  <button type="button" class="seg-btn" data-face="frown">Frown</button>
                  <button type="button" class="seg-btn" data-face="scar">Scar</button>
                </div>
              </div>
              <div class="field field-tight">
                <span>Facial hair</span>
                <div class="seg seg-wrap" role="group" aria-label="Facial hair">
                  <button type="button" class="seg-btn" data-facial="none">None</button>
                  <button type="button" class="seg-btn" data-facial="stubble">Stubble</button>
                  <button type="button" class="seg-btn" data-facial="mustache">Mustache</button>
                  <button type="button" class="seg-btn" data-facial="beard">Beard</button>
                </div>
              </div>
              <div class="field field-tight">
                <span>Glasses</span>
                <div class="seg seg-wrap" role="group" aria-label="Glasses">
                  <button type="button" class="seg-btn" data-glasses="none">None</button>
                  <button type="button" class="seg-btn" data-glasses="round">Round</button>
                  <button type="button" class="seg-btn" data-glasses="square">Square</button>
                  <button type="button" class="seg-btn" data-glasses="shades">Shades</button>
                </div>
              </div>
              <div class="field field-tight">
                <span>Hat</span>
                <div class="seg seg-wrap" role="group" aria-label="Hat">
                  <button type="button" class="seg-btn" data-hat="none">None</button>
                  <button type="button" class="seg-btn" data-hat="cap">Cap</button>
                  <button type="button" class="seg-btn" data-hat="band">Band</button>
                  <button type="button" class="seg-btn" data-hat="hood">Hood</button>
                  <button type="button" class="seg-btn" data-hat="beanie">Beanie</button>
                  <button type="button" class="seg-btn" data-hat="visor">Visor</button>
                  <button type="button" class="seg-btn" data-hat="crown">Crown</button>
                  <button type="button" class="seg-btn" data-hat="helm">Helm</button>
                </div>
              </div>
            </section>

            <section class="profile-section block-card">
              <h3 class="profile-section-title">Gear</h3>
              <div class="field field-tight">
                <span>Cape</span>
                <div class="seg seg-wrap" role="group" aria-label="Cape">
                  <button type="button" class="seg-btn" data-cape="none">None</button>
                  <button type="button" class="seg-btn" data-cape="short">Short</button>
                  <button type="button" class="seg-btn" data-cape="long">Long</button>
                </div>
              </div>
            </section>

            <section class="profile-section block-card">
              <h3 class="profile-section-title">Pixel skin</h3>
              <div class="skin-editor-mount"></div>
            </section>
            <button type="button" class="menu-btn primary block-btn profile-save-mobile" data-action="save-profile">SAVE</button>
          </div>
        </div>
      </div>

      <div class="menu-stage panel profile-panel blocky skins-panel" data-panel="skins" hidden>
        <header class="profile-topbar">
          <button type="button" class="panel-back block-btn" data-action="home">← BACK</button>
          <h2 class="panel-title">SKINS</h2>
          <button type="button" class="menu-btn primary block-btn" data-action="save-profile">SAVE</button>
        </header>
        <div class="skins-shell">
          <p class="profile-preset-hint">Tap a preset to apply it to your character.</p>
          <div class="skin-preset-grid skins-preset-grid" role="list"></div>
          <button type="button" class="menu-btn primary block-btn skins-save-mobile" data-action="save-profile">SAVE</button>
        </div>
      </div>

      <div class="menu-stage panel profile-panel blocky world-panel" data-panel="world" hidden>
        <header class="profile-topbar">
          <button type="button" class="panel-back block-btn" data-action="home">← BACK</button>
          <h2 class="panel-title">WORLDS</h2>
          <button type="button" class="menu-btn primary block-btn" data-action="create-world">CREATE</button>
        </header>
        <div class="world-shell">
          <div class="world-card block-card">
            <label class="field field-tight">
              <span>World name</span>
              <input type="text" class="world-name-input" maxlength="24" spellcheck="false" autocomplete="off" placeholder="Optional" />
            </label>
            <p class="world-preview-name">Misty Reach</p>
            <p class="world-preview-tag">Rolling hills and open sky.</p>
            <label class="field field-tight">
              <span>World seed</span>
              <div class="seed-row">
                <input type="text" class="world-seed-input" maxlength="24" spellcheck="false" autocomplete="off" />
                <button type="button" class="menu-btn quiet" data-action="random-world" title="New seed">↻</button>
              </div>
            </label>
            <p class="world-seed-note">Same link = same terrain and builds. Send it to friends — they drop straight into your world.</p>

            <div class="world-share-row">
              <code class="world-share-url"></code>
              <button type="button" class="menu-btn ghost block-btn" data-action="copy-share">COPY LINK</button>
            </div>
            <p class="world-share-toast" hidden>Link copied — send it to your friend!</p>

            <div class="world-settings-card block-card">
              <p class="profile-section-title">World options</p>

              <span class="world-option-label">Terrain type</span>
              <div class="seg-wrap world-terrain-seg">
                <button type="button" class="seg-btn active" data-terrain="balanced">Balanced</button>
                <button type="button" class="seg-btn" data-terrain="flat">Flat</button>
                <button type="button" class="seg-btn" data-terrain="mountains">Peaks</button>
                <button type="button" class="seg-btn" data-terrain="islands">Islands</button>
                <button type="button" class="seg-btn" data-terrain="wild">Wild</button>
              </div>

              <div class="world-option-row">
                <span class="world-option-label">Caves</span>
                <div class="seg-wrap world-caves-seg">
                  <button type="button" class="seg-btn active" data-caves="1">On</button>
                  <button type="button" class="seg-btn" data-caves="0">Off</button>
                </div>
              </div>

              <div class="world-option-row">
                <span class="world-option-label">Structures</span>
                <div class="seg-wrap world-structures-seg">
                  <button type="button" class="seg-btn active" data-structures="1">On</button>
                  <button type="button" class="seg-btn" data-structures="0">Off</button>
                </div>
              </div>

              <span class="world-option-label">Starting time</span>
              <div class="seg-wrap world-time-seg">
                <button type="button" class="seg-btn active" data-time="day">Day</button>
                <button type="button" class="seg-btn" data-time="noon">Noon</button>
                <button type="button" class="seg-btn" data-time="sunset">Sunset</button>
                <button type="button" class="seg-btn" data-time="night">Night</button>
              </div>

              <label class="field field-tight">
                <span>Render distance <em class="world-dist-val">6</em></span>
                <input type="range" class="world-dist-range" min="3" max="8" step="1" value="6" />
              </label>
            </div>

            <div class="world-actions">
              <button type="button" class="menu-btn primary block-btn" data-action="create-world">CREATE & ENTER</button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.worldSeedInput = this.root.querySelector('.world-seed-input')!;

    const seed = loadLastWorld() ?? readSeedFromUrl();
    this.syncShareLinkDisplay(seed);
    const linkEl = this.root.querySelector<HTMLAnchorElement>('.menu-game-link')!;
    linkEl.addEventListener('click', (e) => {
      e.preventDefault();
      const shareSeed = this.worldSeedInput.value.trim() || loadLastWorld() || readSeedFromUrl();
      this.collectWorldFromUi();
      const settings = loadWorldSettings(shareSeed);
      void copyShareUrl(shareSeed, settings).then((ok) => {
        const toast = this.root.querySelector<HTMLElement>('.menu-share-toast');
        if (toast) {
          toast.hidden = false;
          toast.textContent = ok ? 'Link copied — send it to your friend!' : 'Copy failed';
          window.setTimeout(() => {
            toast.hidden = true;
          }, 3200);
        }
      });
    });

    this.root.querySelector('[data-action="play"]')!.addEventListener('click', () => this.onPlayClick());
    this.root.querySelector('[data-action="settings"]')!.addEventListener('click', () =>
      this.showPanel('settings'),
    );
    this.root.querySelector('[data-action="customize"]')!.addEventListener('click', () =>
      this.showPanel('customize'),
    );
    this.root.querySelector('[data-action="skins"]')!.addEventListener('click', () =>
      this.showPanel('skins'),
    );
    this.root.querySelectorAll('[data-action="home"]').forEach((el) => {
      el.addEventListener('click', () => this.showPanel('home'));
    });
    this.root.querySelector('[data-action="world"]')!.addEventListener('click', () =>
      this.openWorldPanel(),
    );
    this.root.querySelectorAll('[data-action="create-world"]').forEach((el) => {
      el.addEventListener('click', () => this.emitCreateWorld());
    });
    this.root.querySelector('[data-action="random-world"]')!.addEventListener('click', () => {
      this.worldSeedInput.value = randomSeed();
      this.syncWorldUi();
      this.worldSeedInput.focus();
    });
    this.root.querySelector('[data-action="copy-share"]')!.addEventListener('click', () =>
      void this.copyWorldShareLink(),
    );
    this.root.querySelector('[data-action="save-settings"]')!.addEventListener('click', () => {
      this.collectSettingsFromUi();
      saveSettings(this.settings);
      this.emitPrefs();
      this.showPanel('home');
    });
    this.root.querySelectorAll('[data-action="save-profile"]').forEach((el) => {
      el.addEventListener('click', () => {
        this.collectProfileFromUi();
        saveProfile(this.profile);
        this.emitPrefs();
        this.showPanel('home');
      });
    });
    this.root.querySelector('[data-action="random-look"]')!.addEventListener('click', () => {
      const name = this.profile.name;
      delete this.profile.skinData;
      this.activePresetId = null;
      this.previewPresetId = 'custom';
      this.profile = randomizeProfile(name);
      this.ensureSkinEditor();
      this.skinEditor?.randomize(this.profile);
      this.syncSkinFromEditor();
      this.updateCharacterMeta(this.profile.name, 'Random look');
      this.markActivePreset();
    });

    this.bindSettingsUi();
    this.bindWorldUi();
    this.worldSeedInput.addEventListener('input', () => this.syncWorldUi());
    this.worldSeedInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.emitCreateWorld();
    });

    this.bindProfileUi();
    this.fillPresetGrid();
    this.syncSettingsUi();
    this.syncProfileUi();
  }

  on(handler: (action: MenuAction) => void): void {
    this.onAction = handler;
  }

  show(opts?: { resumable?: boolean }): void {
    this.hasSession = opts?.resumable ?? this.hasSession;
    const playLabel = this.root.querySelector('.menu-framed-btn--play .menu-framed-btn__label');
    if (playLabel) playLabel.textContent = 'Play';
    this.showPanel('home');
    this.root.hidden = false;
  }

  hide(): void {
    this.heroPreview?.stop();
    this.skinEditor?.setActive(false);
    this.root.hidden = true;
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  private onPlayClick(): void {
    if (this.hasSession) {
      this.onAction?.({ type: 'resume' });
      return;
    }
    this.emitPlay();
  }

  private getPlaySeed(): string {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('seed')?.trim();
    if (fromUrl) return fromUrl;
    return loadLastWorld() ?? randomSeed();
  }

  private emitPlay(): void {
    const seed = this.getPlaySeed();
    this.worldSeedInput.value = seed;
    replaceUrlForShare(seed, loadWorldSettings(seed));
    saveLastWorld(seed);
    this.hasSession = true;
    this.emitPrefs();
    this.onAction?.({ type: 'play', seed });
  }

  private emitCreateWorld(): void {
    const seed = this.worldSeedInput.value.trim() || randomSeed();
    this.worldSeedInput.value = seed;
    this.collectWorldFromUi();
    saveWorldSettings(seed, this.worldSettings);
    replaceUrlForShare(seed, this.worldSettings);
    saveLastWorld(seed);
    this.hasSession = true;
    this.emitPrefs();
    this.onAction?.({ type: 'play', seed });
  }

  private openWorldPanel(): void {
    this.worldSeedInput.value = loadLastWorld() ?? readSeedFromUrl();
    this.syncWorldUi();
    this.showPanel('world');
  }

  private syncWorldPreview(): void {
    const seed = this.worldSeedInput.value.trim() || randomSeed();
    const nameInput = this.root.querySelector<HTMLInputElement>('.world-name-input')!;
    const displayName = nameInput.value.trim() || worldNameFromSeed(seed);
    const nameEl = this.root.querySelector('.world-preview-name');
    const tagEl = this.root.querySelector('.world-preview-tag');
    if (nameEl) nameEl.textContent = displayName;
    if (tagEl) tagEl.textContent = worldTagFromSeed(seed);
    this.syncShareLinkDisplay(seed);
  }

  private syncShareLinkDisplay(seed: string): void {
    const settings = loadWorldSettings(seed);
    const shareUrl = buildShareUrl(seed, settings, true);
    const worldShare = this.root.querySelector('.world-share-url');
    if (worldShare) worldShare.textContent = shareUrl;
    const menuUrl = this.root.querySelector('.menu-game-link-url');
    const menuLink = this.root.querySelector<HTMLAnchorElement>('.menu-game-link');
    if (menuUrl) menuUrl.textContent = shareUrl;
    if (menuLink) menuLink.href = shareUrl;
  }

  private async copyWorldShareLink(): Promise<void> {
    const seed = this.worldSeedInput.value.trim() || randomSeed();
    this.collectWorldFromUi();
    saveWorldSettings(seed, this.worldSettings);
    const ok = await copyShareUrl(seed, this.worldSettings);
    const toast = this.root.querySelector<HTMLElement>('.world-share-toast');
    if (toast) {
      toast.hidden = false;
      toast.textContent = ok
        ? 'Link copied — send it to your friend!'
        : 'Copy failed — select the link and copy manually.';
    }
    if (ok && toast) {
      window.setTimeout(() => {
        toast.hidden = true;
      }, 3200);
    }
    this.syncShareLinkDisplay(seed);
  }

  private bindWorldUi(): void {
    const nameInput = this.root.querySelector<HTMLInputElement>('.world-name-input')!;
    const dist = this.root.querySelector<HTMLInputElement>('.world-dist-range')!;

    nameInput.addEventListener('input', () => this.syncWorldPreview());

    dist.addEventListener('input', () => {
      this.root.querySelector('.world-dist-val')!.textContent = dist.value;
    });

    this.root.querySelectorAll<HTMLButtonElement>('.world-terrain-seg [data-terrain]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.worldSettings.terrain = btn.dataset.terrain as TerrainType;
        this.syncWorldSegs();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>('.world-caves-seg [data-caves]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.worldSettings.caves = btn.dataset.caves === '1';
        this.syncWorldSegs();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>('.world-structures-seg [data-structures]').forEach(
      (btn) => {
        btn.addEventListener('click', () => {
          this.worldSettings.structures = btn.dataset.structures === '1';
          this.syncWorldSegs();
        });
      },
    );

    this.root.querySelectorAll<HTMLButtonElement>('.world-time-seg [data-time]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.worldSettings.time = btn.dataset.time as WorldTime;
        this.syncWorldSegs();
      });
    });
  }

  private syncWorldUi(): void {
    const seed = this.worldSeedInput.value.trim() || randomSeed();
    this.worldSettings = loadWorldSettings(seed);
    const nameInput = this.root.querySelector<HTMLInputElement>('.world-name-input')!;
    const dist = this.root.querySelector<HTMLInputElement>('.world-dist-range')!;
    nameInput.value = this.worldSettings.name;
    dist.value = String(this.worldSettings.renderDistance);
    this.root.querySelector('.world-dist-val')!.textContent = String(this.worldSettings.renderDistance);
    this.syncWorldSegs();
    this.syncWorldPreview();
  }

  private syncWorldSegs(): void {
    this.root.querySelectorAll<HTMLButtonElement>('.world-terrain-seg [data-terrain]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.terrain === this.worldSettings.terrain);
    });
    this.root.querySelectorAll<HTMLButtonElement>('.world-caves-seg [data-caves]').forEach((btn) => {
      const on = this.worldSettings.caves;
      btn.classList.toggle('active', (btn.dataset.caves === '1') === on);
    });
    this.root.querySelectorAll<HTMLButtonElement>('.world-structures-seg [data-structures]').forEach(
      (btn) => {
        const on = this.worldSettings.structures;
        btn.classList.toggle('active', (btn.dataset.structures === '1') === on);
      },
    );
    this.root.querySelectorAll<HTMLButtonElement>('.world-time-seg [data-time]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.time === this.worldSettings.time);
    });
  }

  private collectWorldFromUi(): void {
    const nameInput = this.root.querySelector<HTMLInputElement>('.world-name-input')!;
    const dist = this.root.querySelector<HTMLInputElement>('.world-dist-range')!;
    this.worldSettings = {
      ...this.worldSettings,
      name: nameInput.value.trim().slice(0, 24),
      renderDistance: Number(dist.value),
    };
  }

  private emitPrefs(skinPixels?: Uint8ClampedArray): void {
    this.onAction?.({
      type: 'prefs',
      profile: { ...this.profile },
      settings: { ...this.settings },
      skinPixels,
    });
  }

  private showPanel(panel: Panel): void {
    this.root.querySelectorAll<HTMLElement>('.menu-stage').forEach((el) => {
      el.hidden = el.dataset.panel !== panel;
    });
    if (panel === 'settings') this.syncSettingsUi();
    if (panel === 'world') this.syncWorldUi();
    if (panel === 'customize') {
      this.ensureHeroPreview();
      this.ensureSkinEditor();
      this.syncProfileUi();
      requestAnimationFrame(() => {
        this.heroPreview?.start();
        this.heroPreview?.layout();
        this.skinEditor?.setActive(true);
      });
    } else if (panel === 'skins') {
      this.syncProfileUi();
      this.syncCustomCardThumb();
      this.markActivePreset();
      this.heroPreview?.stop();
      this.skinEditor?.setActive(false);
    } else {
      this.heroPreview?.stop();
      this.skinEditor?.setActive(false);
    }
  }

  private updateCharacterMeta(name?: string, tag?: string): void {
    const nameEl = this.root.querySelector('.profile-preview-name');
    const tagEl = this.root.querySelector('.profile-preview-tag');
    if (nameEl) nameEl.textContent = name ?? this.profile.name;
    if (tagEl) tagEl.textContent = tag ?? 'Custom look';
  }

  private selectCustomSkin(): void {
    this.previewPresetId = 'custom';
    this.activePresetId = null;
    this.syncProfileUi();
    this.updateCharacterMeta(this.profile.name, 'Build your own');
    this.markActivePreset();
  }

  private async getProfilePixels(): Promise<Uint8ClampedArray> {
    if (this.skinEditor) return this.skinEditor.getPixels();
    if (this.profile.skinData) {
      try {
        return await decodeSkin(this.profile.skinData);
      } catch {
        /* fall through */
      }
    }
    return createDefaultSkin(this.profile.skin, this.profile.outfit, this.profile.accent, {
      hair: this.profile.hair,
      eyes: this.profile.eyes,
      shoes: this.profile.shoes,
      hairStyle: this.profile.hairStyle,
      face: this.profile.face,
      facial: this.profile.facial,
      sleeves: this.profile.sleeves,
      pants: this.profile.pants,
      outfit: this.profile.outfit,
      skin: this.profile.skin,
    });
  }

  private syncCustomCardThumb(pixels?: Uint8ClampedArray): void {
    const canvas = this.root.querySelector<HTMLCanvasElement>('.skin-preset-custom-thumb');
    if (!canvas) return;
    const draw = (p: Uint8ClampedArray) => drawSkinFrontPreview(p, canvas, 3);
    if (pixels) {
      draw(pixels);
      return;
    }
    void this.getProfilePixels().then(draw);
  }

  private ensureHeroPreview(): void {
    if (this.heroPreview) return;
    const mount = this.root.querySelector('.profile-hero-viewport');
    if (!mount) return;
    this.heroPreview = new ProfilePreview3D();
    this.heroPreview.mount(mount as HTMLElement);
    this.heroPreview.applyProfile(this.profile);
  }

  private syncHeroPreview(pixels?: Uint8ClampedArray): void {
    this.ensureHeroPreview();
    if (!this.heroPreview) return;
    this.heroPreview.applyProfile(this.profile);
    if (pixels) {
      this.heroPreview.syncPixels(pixels);
      return;
    }
    if (this.profile.skinData) {
      void decodeSkin(this.profile.skinData)
        .then((p) => this.heroPreview?.syncPixels(p))
        .catch(() => undefined);
    }
  }

  private ensureSkinEditor(): void {
    if (this.skinEditor) return;
    const mount = this.root.querySelector('.skin-editor-mount');
    if (!mount) return;
    this.skinEditor = new SkinEditor({
      skin: this.profile.skin,
      outfit: this.profile.outfit,
      accent: this.profile.accent,
      pants: this.profile.pants,
      hair: this.profile.hair,
      eyes: this.profile.eyes,
      shoes: this.profile.shoes,
      hairStyle: this.profile.hairStyle,
      face: this.profile.face,
      facial: this.profile.facial,
      sleeves: this.profile.sleeves,
      cape: this.profile.cape,
      glasses: this.profile.glasses,
      style: this.profile.style,
      hat: this.profile.hat,
      skinData: this.profile.skinData,
      onChange: (pixels, dataUrl) => {
        this.profile.skinData = dataUrl;
        this.syncHeroPreview(pixels);
        this.emitPrefs(pixels);
      },
    });
    mount.appendChild(this.skinEditor.root);
    this.skinEditor.syncAvatarProfile(this.profile);
    this.syncHeroPreview();
  }

  private fillPresetGrid(): void {
    const grid = this.root.querySelector('.skins-preset-grid');
    if (!grid) return;
    grid.innerHTML = `
      <button type="button" class="skin-preset-card skin-preset-custom" data-preset="custom" aria-label="Custom look">
        <canvas class="skin-preset-thumb skin-preset-custom-thumb" width="48" height="96" aria-hidden="true"></canvas>
        <span class="skin-preset-name">Custom</span>
        <span class="skin-preset-tag">Build your own</span>
      </button>
    ${SKIN_PRESETS.map(
      (p) => `
        <button type="button" class="skin-preset-card" data-preset="${p.id}" aria-label="${p.name}">
          <canvas class="skin-preset-thumb" width="48" height="96" aria-hidden="true"></canvas>
          <span class="skin-preset-name">${p.name}</span>
          <span class="skin-preset-tag">${p.tag}</span>
        </button>`,
    ).join('')}`;

    const customBtn = grid.querySelector<HTMLButtonElement>('[data-preset="custom"]');
    customBtn?.addEventListener('click', () => this.selectCustomSkin());

    grid.querySelectorAll<HTMLButtonElement>('.skin-preset-card:not(.skin-preset-custom)').forEach((btn) => {
      const id = btn.dataset.preset!;
      const preset = SKIN_PRESETS.find((p) => p.id === id);
      if (!preset) return;
      const canvas = btn.querySelector<HTMLCanvasElement>('.skin-preset-thumb');
      if (canvas) drawSkinFrontPreview(preset.build(), canvas, 3);

      btn.addEventListener('click', () => {
        this.applySkinPreset(id);
        this.syncProfileUi();
        this.updateCharacterMeta(this.profile.name, preset.tag);
        this.markActivePreset();
      });
    });

    this.syncCustomCardThumb();
  }

  private applySkinPreset(id: string): void {
    const name = this.profile.name;
    const next = applyPresetToProfile(name, id);
    if (!next) return;
    this.profile = next;
    this.activePresetId = id;
    this.previewPresetId = id;
    this.ensureSkinEditor();
    const pixels = SKIN_PRESETS.find((p) => p.id === id)!.build();
    this.skinEditor?.applyPreset(this.profile, pixels);
    this.syncHeroPreview(pixels);
    if (this.skinEditor) {
      this.profile.skinData = this.skinEditor.getDataUrl();
      this.emitPrefs(pixels);
    } else {
      this.emitPrefs(pixels);
    }
  }

  private clearActivePreset(): void {
    this.activePresetId = null;
    this.previewPresetId = 'custom';
    this.markActivePreset();
  }

  private markActivePreset(): void {
    const activeId = this.previewPresetId ?? this.activePresetId;
    this.root.querySelectorAll<HTMLButtonElement>('.skin-preset-card').forEach((btn) => {
      const id = btn.dataset.preset!;
      let active = false;
      if (id === 'custom') {
        active =
          activeId === 'custom' ||
          (!activeId && !SKIN_PRESETS.some((p) => presetMatchesProfile(this.profile, p.id)));
      } else {
        active =
          activeId === id ||
          (!activeId && id !== 'custom' && presetMatchesProfile(this.profile, id));
      }
      btn.classList.toggle('active', active);
    });
  }

  private bindSettingsUi(): void {
    const sens = this.root.querySelector<HTMLInputElement>('.sens-range')!;
    const fov = this.root.querySelector<HTMLInputElement>('.fov-range')!;
    const dist = this.root.querySelector<HTMLInputElement>('.dist-range')!;
    sens.addEventListener('input', () => {
      this.root.querySelector('.sens-val')!.textContent = Number(sens.value).toFixed(2);
    });
    fov.addEventListener('input', () => {
      this.root.querySelector('.fov-val')!.textContent = fov.value;
    });
    dist.addEventListener('input', () => {
      this.root.querySelector('.dist-val')!.textContent = dist.value;
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.settings.viewMode = btn.dataset.view as ViewMode;
        this.syncViewSeg();
      });
    });
  }

  private syncSettingsUi(): void {
    const sens = this.root.querySelector<HTMLInputElement>('.sens-range')!;
    const fov = this.root.querySelector<HTMLInputElement>('.fov-range')!;
    const dist = this.root.querySelector<HTMLInputElement>('.dist-range')!;
    sens.value = String(this.settings.mouseSensitivity);
    fov.value = String(this.settings.fov);
    dist.value = String(this.settings.renderDistance);
    this.root.querySelector('.sens-val')!.textContent = this.settings.mouseSensitivity.toFixed(2);
    this.root.querySelector('.fov-val')!.textContent = String(this.settings.fov);
    this.root.querySelector('.dist-val')!.textContent = String(this.settings.renderDistance);
    this.syncViewSeg();
  }

  private syncViewSeg(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === this.settings.viewMode);
    });
  }

  private collectSettingsFromUi(): void {
    const sens = this.root.querySelector<HTMLInputElement>('.sens-range')!;
    const fov = this.root.querySelector<HTMLInputElement>('.fov-range')!;
    const dist = this.root.querySelector<HTMLInputElement>('.dist-range')!;
    this.settings.mouseSensitivity = Number(sens.value);
    this.settings.fov = Number(fov.value);
    this.settings.renderDistance = Number(dist.value);
  }

  private bindProfileUi(): void {
    const nameInput = this.root.querySelector<HTMLInputElement>('.name-input')!;
    nameInput.addEventListener('input', () => {
      this.root.querySelector('.profile-preview-name')!.textContent =
        nameInput.value.trim() || 'Wanderer';
    });

    this.fillSwatches('skin', SKIN_SWATCHES, (c) => {
      this.clearActivePreset();
      this.profile.skin = c;
      this.skinEditor?.setBaseColors(
        this.profile.skin,
        this.profile.outfit,
        this.profile.accent,
        'skin',
      );
      this.syncSkinFromEditor();
    });
    this.fillSwatches('outfit', OUTFIT_SWATCHES, (c) => {
      this.clearActivePreset();
      this.profile.outfit = c;
      this.skinEditor?.setBaseColors(
        this.profile.skin,
        this.profile.outfit,
        this.profile.accent,
        'outfit',
      );
      this.skinEditor?.applyCosmetics(this.profile);
      this.syncSkinFromEditor();
    });
    this.fillSwatches('pants', PANTS_SWATCHES, (c) => {
      this.clearActivePreset();
      this.profile.pants = c;
      this.skinEditor?.applyCosmetics(this.profile);
      this.syncSkinFromEditor();
    });
    this.fillSwatches('accent', ACCENT_SWATCHES, (c) => {
      this.clearActivePreset();
      this.profile.accent = c;
      this.skinEditor?.setBaseColors(
        this.profile.skin,
        this.profile.outfit,
        this.profile.accent,
        'accent',
      );
      this.syncSkinFromEditor();
    });
    this.fillSwatches('hair', HAIR_SWATCHES, (c) => {
      this.clearActivePreset();
      this.profile.hair = c;
      this.skinEditor?.applyCosmetics(this.profile);
      this.syncSkinFromEditor();
    });
    this.fillSwatches('eyes', EYE_SWATCHES, (c) => {
      this.clearActivePreset();
      this.profile.eyes = c;
      this.skinEditor?.applyCosmetics(this.profile);
      this.syncSkinFromEditor();
    });
    this.fillSwatches('shoes', SHOE_SWATCHES, (c) => {
      this.clearActivePreset();
      this.profile.shoes = c;
      this.skinEditor?.applyCosmetics(this.profile);
      this.syncSkinFromEditor();
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-hair-style]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.clearActivePreset();
        this.profile.hairStyle = btn.dataset.hairStyle as HairStyle;
        this.skinEditor?.applyCosmetics(this.profile);
        this.syncProfileUi();
        this.syncSkinFromEditor();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-face]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.clearActivePreset();
        this.profile.face = btn.dataset.face as FaceStyle;
        this.skinEditor?.applyCosmetics(this.profile);
        this.syncProfileUi();
        this.syncSkinFromEditor();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-facial]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.clearActivePreset();
        this.profile.facial = btn.dataset.facial as FacialStyle;
        this.skinEditor?.applyCosmetics(this.profile);
        this.syncProfileUi();
        this.syncSkinFromEditor();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-sleeves]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.clearActivePreset();
        this.profile.sleeves = btn.dataset.sleeves as SleeveStyle;
        this.skinEditor?.applyCosmetics(this.profile);
        this.syncProfileUi();
        this.syncSkinFromEditor();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-glasses]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.clearActivePreset();
        this.profile.glasses = btn.dataset.glasses as GlassesStyle;
        this.syncProfileUi();
        this.skinEditor?.syncAvatarProfile(this.profile);
        this.emitPrefs();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-cape]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.clearActivePreset();
        this.profile.cape = btn.dataset.cape as CapeStyle;
        this.syncProfileUi();
        this.skinEditor?.syncAvatarProfile(this.profile);
        this.emitPrefs();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-style]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.clearActivePreset();
        this.profile.style = btn.dataset.style as AvatarStyle;
        this.syncProfileUi();
        this.skinEditor?.syncAvatarProfile(this.profile);
        this.emitPrefs();
      });
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-hat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.clearActivePreset();
        this.profile.hat = btn.dataset.hat as HatStyle;
        this.syncProfileUi();
        this.skinEditor?.syncAvatarProfile(this.profile);
        this.emitPrefs();
      });
    });
  }

  private fillSwatches(kind: string, colors: string[], onPick: (c: string) => void): void {
    const row = this.root.querySelector(`.swatch-row[data-swatch="${kind}"]`);
    if (!row) return;
    row.innerHTML = colors
      .map(
        (c) =>
          `<button type="button" class="swatch" data-color="${c}" style="--sw:${c}" aria-label="${c}"></button>`,
      )
      .join('');
    row.querySelectorAll<HTMLButtonElement>('.swatch').forEach((btn) => {
      btn.addEventListener('click', () => onPick(btn.dataset.color!));
    });
  }

  private syncProfileUi(): void {
    const nameInput = this.root.querySelector<HTMLInputElement>('.name-input')!;
    nameInput.value = this.profile.name;
    this.root.querySelector('.profile-preview-name')!.textContent = this.profile.name;

    this.syncHeroPreview(this.profile.skinData ? undefined : this.skinEditor?.getPixels());
    this.skinEditor?.syncAvatarProfile(this.profile);

    this.markSwatchActive('skin', this.profile.skin);
    this.markSwatchActive('outfit', this.profile.outfit);
    this.markSwatchActive('pants', this.profile.pants);
    this.markSwatchActive('accent', this.profile.accent);
    this.markSwatchActive('hair', this.profile.hair);
    this.markSwatchActive('eyes', this.profile.eyes);
    this.markSwatchActive('shoes', this.profile.shoes);

    this.root.querySelectorAll<HTMLButtonElement>('[data-hair-style]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.hairStyle === this.profile.hairStyle);
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-face]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.face === this.profile.face);
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-facial]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.facial === this.profile.facial);
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-sleeves]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.sleeves === this.profile.sleeves);
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-glasses]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.glasses === this.profile.glasses);
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-cape]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.cape === this.profile.cape);
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-style]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.style === this.profile.style);
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-hat]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.hat === this.profile.hat);
    });

    const match = SKIN_PRESETS.find((p) => presetMatchesProfile(this.profile, p.id));
    if (match) {
      this.updateCharacterMeta(this.profile.name, match.tag);
    } else {
      this.updateCharacterMeta(this.profile.name, 'Custom look');
    }
    this.syncCustomCardThumb();
    this.markActivePreset();
  }

  private syncSkinFromEditor(): void {
    if (this.skinEditor) {
      this.profile.skinData = this.skinEditor.getDataUrl();
      this.emitPrefs(this.skinEditor.getPixels());
    } else {
      this.emitPrefs();
    }
    this.syncProfileUi();
  }

  private markSwatchActive(kind: string, color: string): void {
    this.root.querySelectorAll(`.swatch-row[data-swatch="${kind}"] .swatch`).forEach((el) => {
      el.classList.toggle('active', (el as HTMLElement).dataset.color === color);
    });
  }

  private collectProfileFromUi(): void {
    const nameInput = this.root.querySelector<HTMLInputElement>('.name-input')!;
    this.profile.name = nameInput.value.trim().slice(0, 20) || 'Wanderer';
    if (this.skinEditor) {
      this.profile.skinData = this.skinEditor.getDataUrl();
    }
  }
}
