import './theme/tokens.css';
import './theme/screens.css';
import {
  ACCENT_SWATCHES,
  EYE_SWATCHES,
  HAIR_SWATCHES,
  OUTFIT_SWATCHES,
  PANTS_SWATCHES,
  SHOE_SWATCHES,
  SKIN_SWATCHES,
  deleteWardrobeSlot,
  loadProfile,
  loadSettings,
  loadWardrobe,
  randomizeProfile,
  saveProfile,
  saveSettings,
  saveWardrobeSlot,
  type AvatarStyle,
  type BackpackStyle,
  type BeltStyle,
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
import { decodeSkin, encodeSkin } from '../player/SkinAtlas';
import { importSkinFromFile, type SkinImportResult } from '../player/SkinPNGImporter';
import {
  SKIN_PRESETS,
  applyPresetToProfile,
  presetMatchesProfile,
  buildCustomBlankPixels,
  CUSTOM_PRESET_ID,
  customBlankProfile,
} from './SkinPresets';
import { PresetCardPreview3D } from './PresetCardPreview3D';
import { loadLastWorld, saveLastWorld, worldNameFromSeed, worldTagFromSeed } from './worldNames';
import {
  deleteWorldSettings,
  listSavedWorlds,
  loadWorldSettings,
  saveWorldSettings,
  type TerrainType,
  type WorldSettings,
  type WorldTime,
} from './worldSettings';
import { replaceSeedInUrl, buildShareUrl, publicPlayUrl } from './shareUrl';
import { SocialClient } from '../net/SocialClient';
import { bindUiSounds, uiSound } from './uiSound';
import { FriendsPanel } from './FriendsPanel';
import { MainMenuSky, type VytheraBgContext } from './MainMenuSky';
import { WorldPreviewCanvas, terrainPreviewTag } from './background/WorldPreviewCanvas';
import { loadBgPrefs, saveBgPrefs, type BgAnimationLevel, type BgQuality, type VytheraBgMode } from './background/backgroundPrefs';
import './background/vythera-world-bg.css';
import { TerrainMaterials } from '../render/TerrainMaterials';
import { ModStudioApp } from './modstudio/ModStudioApp';
import { ModHubApp } from './modhub/ModHubApp';
import { VytheraAIStudio } from '../vythera_ai/ui/VytheraAIStudio';
import {
  loadOnlineSettings,
  saveOnlineSettings,
  type VytheraAIMode,
  type VytheraDataSharing,
  type VytheraModHubMode,
} from '../online/settings/onlineSettings';
import { resolveServiceUiStatus } from '../online/status/serviceStatus';

export type MenuAction =
  | { type: 'play'; seed: string }
  | { type: 'resume' }
  | { type: 'edit-hud' }
  | { type: 'prefs'; profile: Profile; settings: Settings; skinPixels?: Uint8ClampedArray };

type Panel = 'home' | 'settings' | 'customize' | 'multiplayer' | 'world' | 'mod' | 'hub' | 'ai'

function panelToBgContext(panel: Panel): VytheraBgContext {
  switch (panel) {
    case 'world': return 'world';
    case 'hub': return 'hub';
    case 'mod': return 'studio';
    case 'settings': return 'settings';
    case 'ai': return 'ai';
    case 'customize': return 'customize';
    case 'multiplayer': return 'multiplayer';
    default: return 'home';
  }
}

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

function readSeedFromUrl(): string {
  const fromUrl = new URLSearchParams(window.location.search).get('seed');
  return fromUrl?.trim() || randomSeed();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, '&#39;');
}

function seg(attr: string, items: readonly [string, string][]): string {
  return `<div class="vy-seg" role="group">${items
    .map(
      ([v, label]) =>
        `<button type="button" class="vy-seg__btn" data-${attr}="${v}">${label}</button>`,
    )
    .join('')}</div>`;
}

function fieldRange(
  label: string,
  cls: string,
  valCls: string,
  min: number,
  max: number,
  step: number,
  valSuffix = '',
): string {
  return `<label class="vy-field"><span>${label} <em class="${valCls}">–</em>${valSuffix}</span>
    <input type="range" class="${cls}" min="${min}" max="${max}" step="${step}" /></label>`;
}

export class MainMenu {
  readonly root: HTMLElement;
  private worldSeedInput!: HTMLInputElement;
  private worldSettings: WorldSettings = loadWorldSettings('');
  private onAction: ((action: MenuAction) => void) | null = null;
  private hasSession = false;
  private profile: Profile = loadProfile();
  private settings: Settings = loadSettings();
  private skinEditor: SkinEditor | null = null;
  private heroPreview: ProfilePreview3D | null = null;
  private homePreview: ProfilePreview3D | null = null;
  private activePresetId: string | null = null;
  private previewPresetId: string | null = null;
  private presetPreviews: PresetCardPreview3D[] = [];
  private friendsPanel: FriendsPanel | null = null;
  private selectedWorldSeed: string | null = null;
  private worldView: 'list' | 'create' = 'list';
  private menuSky = new MainMenuSky();
  private worldPreview: WorldPreviewCanvas | null = null;
  private modMaterials: TerrainMaterials | null = null;
  private modStudio: ModStudioApp | null = null;
  private modHub: ModHubApp | null = null;
  private aiStudio: VytheraAIStudio | null = null;

  constructor(private social?: SocialClient) {
    this.root = document.createElement('div');
    this.root.id = 'main-menu';
    this.root.className = 'vy-menu';
    this.root.innerHTML = this.buildHtml();
    this.worldSeedInput = this.root.querySelector('.world-seed-input')!;

    const skyHost = this.root.querySelector('.vy-menu__sky');
    if (skyHost) this.menuSky.mount(skyHost as HTMLElement);
    const previewHost = this.root.querySelector('.world-preview-canvas-host');
    if (previewHost) {
      this.worldPreview = new WorldPreviewCanvas();
      previewHost.appendChild(this.worldPreview.element);
    }
    if (this.social) this.friendsPanel = new FriendsPanel(this.root, this.social);

    this.bindActions();
    this.bindSettingsUi();
    this.bindWorldUi();
    this.bindProfileUi();
    this.bindSkinUploadUi();
    this.fillPresetGrid();
    this.renderWardrobe();
    this.syncSettingsUi();
    this.syncProfileUi();
    bindUiSounds(this.root);
    this.ensureHomePreview();
    this.syncHomePreview();
  }

  private buildHtml(): string {
    return `
      <div class="vy-menu__sky" aria-hidden="true"></div>

      <div class="vy-menu__stage vy-home" data-panel="home">
        <header class="vy-home__brand">
          <h1 class="vy-home__title">VYTHERA</h1>
          <div class="vy-home__rule" aria-hidden="true">
            <span class="vy-home__rule-line"></span>
            <span class="vy-dot"></span>
            <span class="vy-home__rule-line"></span>
          </div>
        </header>
        <div class="vy-home__body">
          <nav class="vy-home__nav" aria-label="Main menu">
            <button type="button" class="vy-btn vy-btn--primary" data-action="new-game">New Game</button>
            <button type="button" class="vy-btn" data-action="continue-world">Continue</button>
            <button type="button" class="vy-btn" data-action="worlds">Worlds</button>
            <button type="button" class="vy-btn" data-action="custom-world">Custom World</button>
            <button type="button" class="vy-btn" data-action="multiplayer">Multiplayer</button>
            <button type="button" class="vy-btn" data-action="customize">Character</button>
            <button type="button" class="vy-btn" data-action="mod">MOD Studio</button>
            <button type="button" class="vy-btn" data-action="hub">MOD Hub</button>
            <button type="button" class="vy-btn" data-action="ai">AI Studio</button>
            <button type="button" class="vy-btn" data-action="settings">Settings</button>
          </nav>
          <aside class="vy-home__player">
            <span class="vy-home__player-name">Wanderer</span>
            <div class="vy-home__viewport" aria-hidden="true"></div>
            <button type="button" class="vy-btn vy-btn--ghost" data-action="customize">Profile</button>
          </aside>
        </div>
        <footer class="vy-home__footer">
          <span>Local session</span>
          <span class="vy-chip" title="Local AI"><span class="vy-dot" data-ai-dot data-state="off"></span> Local AI</span>
        </footer>
      </div>

      <div class="vy-menu__stage" data-panel="settings" hidden>
        <div class="vy-sheet">
          <header class="vy-sheet__head">
            <button type="button" class="vy-btn vy-btn--ghost" data-action="home">Back</button>
            <h2 class="vy-sheet__title">Settings</h2>
            <button type="button" class="vy-btn vy-btn--primary" data-action="save-settings">Save</button>
          </header>
          <nav class="vy-settings-nav" aria-label="Settings categories">
            ${['general', 'graphics', 'controls', 'accessibility', 'privacy']
              .map(
                (c, i) =>
                  `<button type="button" class="vy-seg__btn${i === 0 ? ' is-active' : ''}" data-settings-cat="${c}">${
                    c === 'accessibility' ? 'Access' : c[0]!.toUpperCase() + c.slice(1)
                  }</button>`,
              )
              .join('')}
          </nav>
          <div data-settings-pane="general">
            ${fieldRange('Mouse sensitivity', 'sens-range', 'sens-val', 0.35, 2.5, 0.05)}
            ${fieldRange('Field of view', 'fov-range', 'fov-val', 55, 100, 1)}
            <div class="vy-field"><span>Person view</span>
              ${seg('view', [
                ['first', 'First'],
                ['third', 'Third'],
                ['front', 'Front'],
              ])}
            </div>
          </div>
          <div data-settings-pane="graphics" hidden>
            ${fieldRange('Render distance', 'dist-range', 'dist-val', 3, 8, 1)}
            ${fieldRange('Brightness', 'bright-range', 'bright-val', 0.6, 1.4, 0.05)}
            ${fieldRange('Clouds', 'cloud-range', 'cloud-val', 0, 1, 0.05)}
            <div class="vy-field"><span>Background</span>
              ${seg('bg-mode', [
                ['dynamic', 'Dynamic World'],
                ['static', 'Static'],
                ['performance', 'Performance'],
              ])}
            </div>
            <div class="vy-field"><span>Background animation</span>
              ${seg('bg-animation', [
                ['off', 'Off'],
                ['low', 'Low'],
                ['normal', 'Normal'],
                ['high', 'High'],
              ])}
            </div>
            <div class="vy-field"><span>Background quality</span>
              ${seg('bg-quality', [
                ['low', 'Low'],
                ['medium', 'Medium'],
                ['high', 'High'],
                ['ultra', 'Ultra'],
              ])}
            </div>
            <label class="vy-field"><span><input type="checkbox" class="bg-cloud-check" checked /> Cloud motion</span></label>
            <label class="vy-field"><span><input type="checkbox" class="bg-veg-check" checked /> Vegetation motion</span></label>
            <label class="vy-field"><span><input type="checkbox" class="bg-water-check" checked /> Water motion</span></label>
            <label class="vy-field"><span><input type="checkbox" class="bg-atmo-enable-check" checked /> Atmosphere</span></label>
            <label class="vy-field"><span><input type="checkbox" class="bg-motion-check" /> Camera drift</span></label>
            <label class="vy-field"><span><input type="checkbox" class="bg-particles-check" checked /> Ambient life</span></label>
${fieldRange('Atmosphere', 'bg-atmo-range', 'bg-atmo-val', 0, 1, 0.05)}
            <label class="vy-field"><span><input type="checkbox" class="uw-fx-check" checked /> Underwater effects</span></label>
            <label class="vy-field"><span><input type="checkbox" class="show-fps-check" /> Show FPS</span></label>
          </div>
          <div data-settings-pane="controls" hidden>
            <label class="vy-field"><span><input type="checkbox" class="invert-y-check" /> Invert Y look</span></label>
            <div class="vy-field"><span>Touch &amp; HUD layout</span>
              <button type="button" class="vy-btn" data-action="edit-hud">Move HUD</button>
              <p class="edit-hud-hint" style="margin:6px 0 0;font-size:0.7rem;letter-spacing:0.06em;text-transform:none;color:var(--vy-muted)">Open a world first if disabled.</p>
            </div>
          </div>
          <div data-settings-pane="accessibility" hidden>
            <p style="font-size:0.75rem;color:var(--vy-muted);line-height:1.5">UI follows system reduced-motion (background motion, particles, and camera drift reduce automatically). Esc closes panels · E inventory · J journal · M map.</p>
          </div>
          <div data-settings-pane="privacy" hidden>
            <p class="online-service-label" style="margin:0 0 10px;font-size:0.75rem;letter-spacing:0.08em;text-transform:uppercase;color:var(--vy-muted)">VYTHERA LOCAL ONLY</p>
            <div class="vy-field"><span>AI mode</span>
              <div class="vy-seg" role="group" aria-label="AI mode">
                <button type="button" class="vy-seg__btn is-active" data-ai-mode="LOCAL">Local</button>
                <button type="button" class="vy-seg__btn" data-ai-mode="ONLINE">Online</button>
                <button type="button" class="vy-seg__btn" data-ai-mode="AUTO">Auto</button>
              </div>
            </div>
            <div class="vy-field"><span>Mod Hub</span>
              <div class="vy-seg" role="group" aria-label="Mod Hub mode">
                <button type="button" class="vy-seg__btn is-active" data-modhub-mode="OFFLINE">Offline</button>
                <button type="button" class="vy-seg__btn" data-modhub-mode="ONLINE">Online</button>
              </div>
            </div>
            <div class="vy-field"><span>Data sharing</span>
              <div class="vy-seg" role="group" aria-label="Data sharing">
                <button type="button" class="vy-seg__btn is-active" data-data-sharing="PRIVATE">Private</button>
                <button type="button" class="vy-seg__btn" data-data-sharing="PUBLISHABLE">Publishable</button>
                <button type="button" class="vy-seg__btn" data-data-sharing="PUBLIC">Public</button>
              </div>
            </div>
            <label class="vy-field"><span><input type="checkbox" class="cloud-ai-check" /> Cloud / Online AI</span></label>
            <label class="vy-field"><span>Online API base URL</span>
              <input type="url" class="online-api-url" placeholder="https://api.example.com" autocomplete="off" spellcheck="false" />
            </label>
            <dl class="vy-privacy-grid">
              <dt>Local AI</dt><dd>ON</dd>
              <dt>Cloud AI</dt><dd class="cloud-ai-status" data-off>OFF</dd>
              <dt>Telemetry</dt><dd data-off>OFF</dd>
              <dt>Local vision</dt><dd>AVAILABLE</dd>
              <dt>Local training</dt><dd>AVAILABLE</dd>
              <dt>Network exposure</dt><dd>LOCAL ONLY</dd>
            </dl>
            <p style="margin-top:10px;font-size:0.7rem;color:var(--vy-faint);line-height:1.45">
              LOCAL keeps data on this computer. ONLINE sends only data allowed by privacy rules.
              AUTO tries local first; private data never auto-uploads if local AI is offline.
              Training datasets and unpublished adapters stay on this PC unless you explicitly publish.
            </p>
          </div>
        </div>
      </div>

      <div class="vy-menu__stage" data-panel="customize" hidden>
        <div class="vy-sheet" style="width:min(1100px,96vw);max-height:94vh">
          <header class="vy-sheet__head">
            <button type="button" class="vy-btn vy-btn--ghost" data-action="home">Back</button>
            <h2 class="vy-sheet__title">Character</h2>
            <button type="button" class="vy-btn vy-btn--primary" data-action="save-profile">Save</button>
          </header>
          <div style="display:grid;grid-template-columns:minmax(200px,280px) 1fr;gap:18px">
            <aside>
              <div class="profile-hero-viewport vy-tool-host" style="height:280px;min-height:240px"></div>
              <div class="vy-seg" role="group" aria-label="Preview pose" style="margin:8px 0">
                ${['idle', 'walk', 'sneak', 'sit']
                  .map(
                    (p, i) =>
                      `<button type="button" class="vy-seg__btn${i === 0 ? ' is-active' : ''}" data-pose="${p}">${p}</button>`,
                  )
                  .join('')}
                ${['front', 'side', 'back']
                  .map((v) => `<button type="button" class="vy-seg__btn" data-snap-view="${v}">${v}</button>`)
                  .join('')}
              </div>
              <p class="profile-preview-name" style="margin:0;letter-spacing:0.12em;text-transform:uppercase">Wanderer</p>
              <p class="profile-preview-tag" style="margin:4px 0 10px;font-size:0.7rem;color:var(--vy-muted)">Custom look</p>
              <label class="vy-field"><span>Name</span>
                <input type="text" class="name-input vy-input" maxlength="20" spellcheck="false" autocomplete="off" /></label>
              <button type="button" class="vy-btn" data-action="random-look" style="width:100%">Random look</button>
            </aside>
            <div style="overflow:auto;max-height:78vh;padding-right:4px">
              <section class="vy-panel" style="padding:12px;margin-bottom:12px">
                <h3 style="margin:0 0 8px;font-size:0.75rem;letter-spacing:0.16em;text-transform:uppercase">Skin presets</h3>
                <label class="vy-btn vy-btn--primary skin-upload-main" style="display:inline-block;margin-bottom:8px">
                  Upload skin<input type="file" class="skin-upload-input" accept="image/png" hidden />
                </label>
                <div class="skin-preset-grid skins-preset-grid" role="list"></div>
              </section>
              <section class="vy-panel" style="padding:12px;margin-bottom:12px">
                <h3 style="margin:0 0 8px;font-size:0.75rem;letter-spacing:0.16em;text-transform:uppercase">Wardrobe</h3>
                <button type="button" class="vy-btn" data-action="wardrobe-save">Save look</button>
                <div class="wardrobe-grid" role="list" style="margin-top:8px"></div>
              </section>
              <section class="vy-panel" style="padding:12px;margin-bottom:12px">
                <h3 style="margin:0 0 8px;font-size:0.75rem;letter-spacing:0.16em;text-transform:uppercase">Colors</h3>
                <div style="display:grid;gap:8px">
                  ${['skin', 'outfit', 'pants', 'accent', 'hair', 'eyes', 'shoes']
                    .map(
                      (k) =>
                        `<div><span style="font-size:0.62rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--vy-muted)">${k}</span><div class="swatch-row" data-swatch="${k}"></div></div>`,
                    )
                    .join('')}
                </div>
              </section>
              <section class="vy-panel" style="padding:12px;margin-bottom:12px">
                <h3 style="margin:0 0 8px;font-size:0.75rem;letter-spacing:0.16em;text-transform:uppercase">Body</h3>
                <div class="vy-field"><span>Build</span>${seg('style', [
                  ['classic', 'Classic'],
                  ['stocky', 'Stocky'],
                  ['tall', 'Tall'],
                  ['slim', 'Slim'],
                ])}</div>
                <div class="vy-field"><span>Sleeves</span>${seg('sleeves', [
                  ['bare', 'Bare'],
                  ['short', 'Short'],
                  ['long', 'Long'],
                ])}</div>
              </section>
              <section class="vy-panel" style="padding:12px;margin-bottom:12px">
                <h3 style="margin:0 0 8px;font-size:0.75rem;letter-spacing:0.16em;text-transform:uppercase">Head</h3>
                <div class="vy-field"><span>Hair</span>${seg('hair-style', [
                  ['none', 'Bald'],
                  ['short', 'Short'],
                  ['long', 'Long'],
                  ['spiky', 'Spiky'],
                  ['curly', 'Curly'],
                  ['mohawk', 'Mohawk'],
                  ['bun', 'Bun'],
                  ['afro', 'Afro'],
                  ['bangs', 'Bangs'],
                ])}</div>
                <div class="vy-field"><span>Face</span>${seg('face', [
                  ['neutral', 'Neutral'],
                  ['smile', 'Smile'],
                  ['frown', 'Frown'],
                  ['scar', 'Scar'],
                  ['wink', 'Wink'],
                  ['cool', 'Cool'],
                  ['blush', 'Blush'],
                  ['freckles', 'Freckles'],
                  ['kawaii', 'Kawaii'],
                ])}</div>
                <div class="vy-field"><span>Facial</span>${seg('facial', [
                  ['none', 'None'],
                  ['stubble', 'Stubble'],
                  ['mustache', 'Mustache'],
                  ['beard', 'Beard'],
                ])}</div>
                <div class="vy-field"><span>Glasses</span>${seg('glasses', [
                  ['none', 'None'],
                  ['round', 'Round'],
                  ['square', 'Square'],
                  ['shades', 'Shades'],
                ])}</div>
                <div class="vy-field"><span>Hat</span>${seg('hat', [
                  ['none', 'None'],
                  ['cap', 'Cap'],
                  ['band', 'Band'],
                  ['hood', 'Hood'],
                  ['beanie', 'Beanie'],
                  ['visor', 'Visor'],
                  ['crown', 'Crown'],
                  ['helm', 'Helm'],
                ])}</div>
              </section>
              <section class="vy-panel" style="padding:12px;margin-bottom:12px">
                <h3 style="margin:0 0 8px;font-size:0.75rem;letter-spacing:0.16em;text-transform:uppercase">Gear</h3>
                <div class="vy-field"><span>Cape</span>${seg('cape', [
                  ['none', 'None'],
                  ['short', 'Short'],
                  ['long', 'Long'],
                ])}</div>
                <div class="vy-field"><span>Backpack</span>${seg('backpack', [
                  ['none', 'None'],
                  ['pack', 'Pack'],
                  ['satchel', 'Satchel'],
                ])}</div>
                <div class="vy-field"><span>Belt</span>${seg('belt', [
                  ['none', 'None'],
                  ['leather', 'Leather'],
                  ['utility', 'Utility'],
                ])}</div>
              </section>
              <section class="vy-panel" style="padding:12px;margin-bottom:12px">
                <h3 style="margin:0 0 8px;font-size:0.75rem;letter-spacing:0.16em;text-transform:uppercase">Pixel skin</h3>
                <div class="skin-editor-mount"></div>
              </section>
            </div>
          </div>
        </div>
      </div>

      <div class="vy-menu__stage" data-panel="mod" hidden>
        <div class="vy-sheet" style="width:min(1200px,98vw);max-height:96vh">
          <header class="vy-sheet__head">
            <button type="button" class="vy-btn vy-btn--ghost" data-action="home">Back</button>
            <h2 class="vy-sheet__title">MOD Studio</h2>
            <span class="vy-chip">Creator</span>
          </header>
          <div class="mod-studio-mount vy-tool-host"></div>
        </div>
      </div>

      <div class="vy-menu__stage" data-panel="hub" hidden>
        <div class="vy-sheet" style="width:min(1200px,98vw);max-height:96vh">
          <header class="vy-sheet__head">
            <button type="button" class="vy-btn vy-btn--ghost" data-action="home">Back</button>
            <h2 class="vy-sheet__title">MOD Hub</h2>
            <span class="vy-chip">Discover</span>
          </header>
          <div class="mod-hub-mount vy-tool-host"></div>
        </div>
      </div>

      <div class="vy-menu__stage" data-panel="ai" hidden>
        <div class="vy-sheet" style="width:min(1200px,98vw);max-height:96vh">
          <header class="vy-sheet__head">
            <button type="button" class="vy-btn vy-btn--ghost" data-action="home">Back</button>
            <h2 class="vy-sheet__title">AI Studio</h2>
            <span class="vy-chip">Local only</span>
          </header>
          <p style="margin:0 0 10px;font-size:0.72rem;color:var(--vy-muted);line-height:1.45">
            Chat, image learning, datasets, training, and tools. Apply-to-model tools use an open MOD Studio project when available.
          </p>
          <div class="ai-studio-mount vy-ai-studio-host"></div>
        </div>
      </div>
      <div class="vy-menu__stage" data-panel="multiplayer" hidden>
        <div class="vy-sheet">
          <header class="vy-sheet__head">
            <button type="button" class="vy-btn vy-btn--ghost" data-action="home">Back</button>
            <h2 class="vy-sheet__title">Friends</h2>
            <span></span>
          </header>
          <p class="mp-status" style="font-size:0.75rem;color:var(--vy-muted)">Friends server: connecting…</p>
          <div class="vy-panel" style="padding:12px;margin:12px 0">
            <p style="margin:0 0 6px;font-size:0.65rem;letter-spacing:0.14em;text-transform:uppercase;color:var(--vy-muted)">Your friend code</p>
            <div class="vy-actions" style="align-items:center">
              <code class="friends-my-code" style="flex:1;font-family:var(--vy-font-mono)"></code>
              <button type="button" class="vy-btn" data-action="copy-friend-code">Copy</button>
            </div>
          </div>
          <div class="vy-panel" style="padding:12px;margin-bottom:12px">
            <p style="margin:0 0 6px;font-size:0.65rem;letter-spacing:0.14em;text-transform:uppercase;color:var(--vy-muted)">Add a friend</p>
            <div class="vy-actions">
              <input type="text" class="friends-add-input vy-input" maxlength="6" inputmode="numeric" pattern="[0-9]*" spellcheck="false" autocomplete="off" placeholder="6-digit code" style="flex:1" />
              <button type="button" class="vy-btn vy-btn--primary" data-action="add-friend">Add</button>
            </div>
          </div>
          <p class="friends-toast" hidden></p>
          <div class="friends-requests" hidden></div>
          <p style="font-size:0.65rem;letter-spacing:0.14em;text-transform:uppercase;color:var(--vy-muted)">Friends list</p>
          <div class="friends-list"></div>
          <div class="friend-profile-modal" hidden style="position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.55)">
            <div class="vy-sheet" style="max-width:520px;position:relative">
              <button type="button" class="vy-btn vy-btn--ghost" data-action="close-friend-profile">Back</button>
              <div class="friend-profile-modal-body"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="vy-menu__stage" data-panel="world" hidden>
        <div class="vy-sheet">
          <header class="vy-sheet__head">
            <button type="button" class="vy-btn vy-btn--ghost" data-action="world-back">Back</button>
            <h2 class="vy-sheet__title world-panel-title">Worlds</h2>
            <span></span>
          </header>
          <div data-world-view="list">
            <div class="vy-world-list world-select-list" role="listbox" aria-label="Saved worlds"></div>
            <p class="world-select-empty" hidden style="color:var(--vy-muted);font-size:0.8rem">No worlds yet. Create a new world to start exploring.</p>
            <div class="vy-actions">
              <button type="button" class="vy-btn vy-btn--primary" data-action="play-selected-world" disabled>Play selected</button>
              <button type="button" class="vy-btn" data-action="show-create-world">Create new</button>
              <button type="button" class="vy-btn vy-btn--danger" data-action="delete-selected-world" disabled>Delete</button>
            </div>
          </div>
          <div data-world-view="create" hidden>
            <label class="vy-field"><span>World name</span>
              <input type="text" class="world-name-input vy-input" maxlength="24" spellcheck="false" autocomplete="off" placeholder="Optional" /></label>
            <p class="world-preview-name" style="margin:0;font-family:var(--vy-font-display);letter-spacing:0.08em">Misty Reach</p>
            <p class="world-preview-tag" style="margin:4px 0 8px;font-size:0.75rem;color:var(--vy-muted)">Rolling hills and open sky.</p>
            <div class="world-preview-canvas-host" style="margin:0 0 12px;border-radius:6px;overflow:hidden;border:1px solid var(--vy-line);max-width:100%"></div>
            <label class="vy-field"><span>World seed</span>
              <div class="vy-actions">
                <input type="text" class="world-seed-input vy-input" maxlength="24" spellcheck="false" autocomplete="off" style="flex:1" />
                <button type="button" class="vy-btn" data-action="random-world" title="New seed">↻</button>
              </div>
            </label>
            <div class="vy-actions" style="margin:8px 0 12px;align-items:center">
              <span style="font-size:0.65rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--vy-muted)">Share</span>
              <code class="world-share-url" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.7rem;color:var(--vy-ink-dim)"></code>
              <button type="button" class="vy-btn" data-action="copy-world-link">Copy</button>
            </div>
            <p class="world-share-toast" hidden style="font-size:0.7rem;color:var(--vy-moss)">Link copied</p>
            <div class="vy-panel" style="padding:14px;margin-bottom:14px">
              <p style="margin:0 0 8px;font-size:0.65rem;letter-spacing:0.14em;text-transform:uppercase;color:var(--vy-muted)">World creation</p>
              <div class="vy-seg" role="group" aria-label="Complexity" style="margin-bottom:10px">
                <button type="button" class="vy-seg__btn is-active" data-gen-mode="default">Default</button>
                <button type="button" class="vy-seg__btn" data-gen-mode="advanced">Advanced</button>
                <button type="button" class="vy-seg__btn" data-gen-mode="expert">Expert</button>
              </div>
              <p style="margin:0 0 6px;font-size:0.65rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--vy-muted)">World type</p>
              <div class="vy-seg world-terrain-seg" style="margin-bottom:10px">
                <button type="button" class="vy-seg__btn is-active" data-terrain="balanced">Plains</button>
                <button type="button" class="vy-seg__btn" data-terrain="wild">Forest</button>
                <button type="button" class="vy-seg__btn" data-terrain="mountains">Mountains</button>
                <button type="button" class="vy-seg__btn" data-terrain="flat">Desert</button>
                <button type="button" class="vy-seg__btn" data-terrain="islands">Ocean</button>
              </div>
              <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:10px">
                <div><span style="font-size:0.65rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--vy-muted)">Caves</span>
                  <div class="vy-seg world-caves-seg">
                    <button type="button" class="vy-seg__btn is-active" data-caves="1">On</button>
                    <button type="button" class="vy-seg__btn" data-caves="0">Off</button>
                  </div>
                </div>
                <div><span style="font-size:0.65rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--vy-muted)">Structures</span>
                  <div class="vy-seg world-structures-seg">
                    <button type="button" class="vy-seg__btn is-active" data-structures="1">On</button>
                    <button type="button" class="vy-seg__btn" data-structures="0">Off</button>
                  </div>
                </div>
              </div>
              <p style="margin:0 0 6px;font-size:0.65rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--vy-muted)">Starting time</p>
              <div class="vy-seg world-time-seg" style="margin-bottom:10px">
                <button type="button" class="vy-seg__btn is-active" data-time="day">Day</button>
                <button type="button" class="vy-seg__btn" data-time="noon">Noon</button>
                <button type="button" class="vy-seg__btn" data-time="sunset">Sunset</button>
                <button type="button" class="vy-seg__btn" data-time="night">Night</button>
              </div>
              ${fieldRange('World size / render distance', 'world-dist-range', 'world-dist-val', 3, 8, 1)}
              <div data-advanced-gen hidden>
                <p style="font-size:0.7rem;color:var(--vy-muted)">Procedural controls · AI world assist stays local only.</p>
                <div class="vy-seg" style="margin-top:8px">
                  <button type="button" class="vy-seg__btn is-active" data-ai-world="local">Local only</button>
                  <button type="button" class="vy-seg__btn" data-ai-world="off" disabled title="Cloud generation disabled">Cloud off</button>
                </div>
              </div>
            </div>
            <div class="vy-actions">
              <button type="button" class="vy-btn vy-btn--primary" data-action="create-world">Create world</button>
              <button type="button" class="vy-btn" data-action="cancel-create-world">Cancel</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private bindActions(): void {
    const go = (action: string, fn: () => void) => {
      this.root.querySelectorAll(`[data-action="${action}"]`).forEach((el) => {
        el.addEventListener('click', fn);
      });
    };
    go('new-game', () => {
      this.worldSeedInput.value = randomSeed();
      this.syncWorldUi();
      this.setWorldView('create');
      this.showPanel('world');
    });
    go('continue-world', () => this.continueLastWorld());
    go('worlds', () => this.openWorldPanel());
    // The style editor is its own page, so it needs a real navigation rather
    // than a panel swap. Worlds it creates are saved and then started from
    // Worlds here, which is why it also needs a way back.
    go('custom-world', () => {
      window.location.href = 'customworld.html';
    });
    go('settings', () => this.showPanel('settings'));
    go('customize', () => this.showPanel('customize'));
    go('mod', () => this.showPanel('mod'));
    go('hub', () => this.showPanel('hub'));
    go('ai', () => this.showPanel('ai'));
    go('multiplayer', () => this.openMultiplayerPanel());
    go('home', () => this.showPanel('home'));
    go('world-back', () => {
      if (this.worldView === 'create') this.setWorldView('list');
      else this.showPanel('home');
    });
    go('show-create-world', () => {
      this.worldSeedInput.value = randomSeed();
      this.syncWorldUi();
      this.setWorldView('create');
    });
    go('cancel-create-world', () => this.setWorldView('list'));
    go('play-selected-world', () => this.playSelectedWorld());
    go('delete-selected-world', () => this.deleteSelectedWorld());
    go('create-world', () => this.emitCreateWorld());
    go('random-world', () => {
      this.worldSeedInput.value = randomSeed();
      this.syncWorldUi();
      this.worldSeedInput.focus();
    });
    go('save-settings', () => {
      this.collectSettingsFromUi();
      this.collectBgPrefsFromUi();
      saveSettings(this.settings);
      this.menuSky.reloadPrefs();
      this.emitPrefs();
      this.showPanel('home');
    });
    go('edit-hud', () => {
      if (!this.hasSession) return;
      this.onAction?.({ type: 'edit-hud' });
    });
    go('save-profile', () => {
      this.collectProfileFromUi();
      saveProfile(this.profile);
      this.emitPrefs();
      this.showPanel('home');
    });
    go('random-look', () => {
      const name = this.profile.name;
      delete this.profile.skinData;
      this.activePresetId = null;
      this.previewPresetId = CUSTOM_PRESET_ID;
      this.profile = randomizeProfile(name);
      this.ensureSkinEditor();
      this.skinEditor?.randomize(this.profile);
      this.syncSkinFromEditor();
      this.updateCharacterMeta(this.profile.name, 'Random look');
      this.markActivePreset();
    });
    go('wardrobe-save', () => {
      this.collectProfileFromUi();
      saveWardrobeSlot(this.profile, this.profile.name);
      this.renderWardrobe();
    });
    go('copy-play-link', () => void this.copyPlayLink());
    this.worldSeedInput.addEventListener('input', () => this.syncWorldUi());
    this.worldSeedInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.emitCreateWorld();
    });
  }

  on(handler: (action: MenuAction) => void): void {
    this.onAction = handler;
  }

  pushPrefs(): void {
    this.emitPrefs();
  }

  hide(): void {
    this.heroPreview?.stop();
    this.homePreview?.stop();
    this.skinEditor?.setActive(false);
    this.modStudio?.stop();
    this.menuSky.stop();
    this.root.classList.remove('vy-menu--world-entry');
    this.root.hidden = true;
  }

  /** Keep cinematic world bg visible under the translucent loading overlay. */
  beginWorldEntry(): void {
    this.root.hidden = false;
    this.root.classList.add('vy-menu--world-entry');
    this.root.querySelectorAll<HTMLElement>('.vy-menu__stage').forEach((el) => {
      el.hidden = true;
    });
    this.menuSky.setContext('loading');
    this.menuSky.start();
  }

  show(opts?: { resumable?: boolean }): void {
    this.hasSession = opts?.resumable ?? this.hasSession;
    this.root.hidden = false;
    this.root.classList.remove('vy-menu--world-entry');
    this.showPanel('home');
    requestAnimationFrame(() => this.menuSky.start());
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  openPanel(panel: Panel): void {
    if (panel === 'multiplayer') this.openMultiplayerPanel();
    else this.showPanel(panel);
  }

  private async copyPlayLink(): Promise<void> {
    const url = publicPlayUrl();
    const toast = this.root.querySelector('.menu-play-link-toast') as HTMLElement | null;
    try {
      await navigator.clipboard.writeText(url);
      if (toast) {
        toast.hidden = false;
        window.setTimeout(() => {
          toast.hidden = true;
        }, 2200);
      }
    } catch {
      /* clipboard blocked */
    }
  }

  private emitCreateWorld(): void {
    const seed = this.worldSeedInput.value.trim() || randomSeed();
    this.worldSeedInput.value = seed;
    this.collectWorldFromUi();
    this.collectProfileFromUi();
    saveWorldSettings(seed, this.worldSettings);
    replaceSeedInUrl(seed);
    saveLastWorld(seed);
    this.selectedWorldSeed = seed;
    this.hasSession = true;
    this.emitPrefs();
    this.onAction?.({ type: 'play', seed });
  }

  private openWorldPanel(): void {
    const last = loadLastWorld();
    this.selectedWorldSeed = last;
    this.worldSeedInput.value = last ?? readSeedFromUrl();
    this.syncWorldUi();
    this.setWorldView('list');
    this.showPanel('world');
  }

  private continueLastWorld(): void {
    if (this.hasSession) {
      this.onAction?.({ type: 'resume' });
      return;
    }
    const last = loadLastWorld();
    if (last) {
      this.selectedWorldSeed = last;
      this.playSelectedWorld();
      return;
    }
    this.openWorldPanel();
  }

  private setWorldView(view: 'list' | 'create'): void {
    this.worldView = view;
    this.root.querySelectorAll<HTMLElement>('[data-world-view]').forEach((el) => {
      el.hidden = el.dataset.worldView !== view;
    });
    const title = this.root.querySelector('.world-panel-title');
    if (title) title.textContent = view === 'create' ? 'Create New World' : 'Worlds';
    if (view === 'list') this.renderWorldList();
  }

  private renderWorldList(): void {
    const listEl = this.root.querySelector('.world-select-list');
    const emptyEl = this.root.querySelector<HTMLElement>('.world-select-empty');
    const playBtn = this.root.querySelector<HTMLButtonElement>('[data-action="play-selected-world"]');
    const deleteBtn = this.root.querySelector<HTMLButtonElement>('[data-action="delete-selected-world"]');
    if (!listEl || !emptyEl || !playBtn || !deleteBtn) return;

    const worlds = listSavedWorlds();
    if (this.selectedWorldSeed && !worlds.some((w) => w.seed === this.selectedWorldSeed)) {
      this.selectedWorldSeed = worlds[0]?.seed ?? null;
    }
    if (!this.selectedWorldSeed && worlds.length) this.selectedWorldSeed = worlds[0]!.seed;

    emptyEl.hidden = worlds.length > 0;
    listEl.innerHTML = worlds
      .map((w) => {
        const name = w.settings.name.trim() || worldNameFromSeed(w.seed);
        const tag = worldTagFromSeed(w.seed);
        const selected = w.seed === this.selectedWorldSeed;
        return `<button type="button" class="vy-world-row${selected ? ' is-selected' : ''}" role="option"
          aria-selected="${selected}" data-action="select-world" data-seed="${escapeAttr(w.seed)}">
          <strong>${escapeHtml(name)}</strong>
          <em>${escapeHtml(w.seed)} · ${escapeHtml(w.settings.terrain)} · ${escapeHtml(tag)}</em>
        </button>`;
      })
      .join('');

    listEl.querySelectorAll('[data-action="select-world"]').forEach((el) => {
      el.addEventListener('click', () => {
        const seed = (el as HTMLElement).dataset.seed;
        if (!seed) return;
        this.selectedWorldSeed = seed;
        this.renderWorldList();
      });
      el.addEventListener('dblclick', () => {
        const seed = (el as HTMLElement).dataset.seed;
        if (!seed) return;
        this.selectedWorldSeed = seed;
        this.playSelectedWorld();
      });
    });

    const has = Boolean(this.selectedWorldSeed);
    playBtn.disabled = !has;
    deleteBtn.disabled = !has;
  }

  private playSelectedWorld(): void {
    const seed = this.selectedWorldSeed;
    if (!seed) return;
    this.worldSeedInput.value = seed;
    this.worldSettings = loadWorldSettings(seed);
    this.collectProfileFromUi();
    replaceSeedInUrl(seed);
    saveLastWorld(seed);
    this.hasSession = true;
    this.emitPrefs();
    this.onAction?.({ type: 'play', seed });
  }

  private deleteSelectedWorld(): void {
    const seed = this.selectedWorldSeed;
    if (!seed) return;
    const name = loadWorldSettings(seed).name.trim() || worldNameFromSeed(seed);
    if (!confirm(`Delete world "${name}"? This only removes it from this device.`)) return;
    deleteWorldSettings(seed);
    if (loadLastWorld() === seed) {
      try {
        localStorage.removeItem('wildreach.lastWorld');
      } catch {
        /* ignore */
      }
    }
    this.selectedWorldSeed = null;
    this.renderWorldList();
  }

  private openMultiplayerPanel(): void {
    this.friendsPanel?.refresh();
    this.showPanel('multiplayer');
  }

  private syncWorldPreview(): void {
    const seed = this.worldSeedInput.value.trim() || randomSeed();
    const nameInput = this.root.querySelector<HTMLInputElement>('.world-name-input')!;
    const displayName = nameInput.value.trim() || worldNameFromSeed(seed);
    const nameEl = this.root.querySelector('.world-preview-name');
    const tagEl = this.root.querySelector('.world-preview-tag');
    if (nameEl) nameEl.textContent = displayName;
    if (tagEl) tagEl.textContent = terrainPreviewTag(this.worldSettings.terrain);
    this.worldPreview?.render(seed, this.worldSettings.terrain);
  }

  private bindWorldUi(): void {
    const nameInput = this.root.querySelector<HTMLInputElement>('.world-name-input')!;
    const dist = this.root.querySelector<HTMLInputElement>('.world-dist-range')!;
    nameInput.addEventListener('input', () => this.syncWorldPreview());
    dist.addEventListener('input', () => {
      this.root.querySelector('.world-dist-val')!.textContent = dist.value;
      this.syncWorldShareLink();
    });
    this.root.querySelector('[data-action="copy-world-link"]')?.addEventListener('click', () => {
      void this.copyWorldShareLink();
    });
    this.root.querySelectorAll<HTMLButtonElement>('.world-terrain-seg [data-terrain]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.worldSettings.terrain = btn.dataset.terrain as TerrainType;
        this.syncWorldSegs();
        this.syncWorldShareLink();
      });
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-gen-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.genMode;
        this.root.querySelectorAll<HTMLButtonElement>('[data-gen-mode]').forEach((b) => {
          b.classList.toggle('is-active', b === btn);
        });
        const adv = this.root.querySelector<HTMLElement>('[data-advanced-gen]');
        if (adv) adv.hidden = mode === 'default';
      });
    });
    this.root.querySelectorAll<HTMLButtonElement>('.world-caves-seg [data-caves]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.worldSettings.caves = btn.dataset.caves === '1';
        this.syncWorldSegs();
        this.syncWorldShareLink();
      });
    });
    this.root.querySelectorAll<HTMLButtonElement>('.world-structures-seg [data-structures]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.worldSettings.structures = btn.dataset.structures === '1';
        this.syncWorldSegs();
        this.syncWorldShareLink();
      });
    });
    this.root.querySelectorAll<HTMLButtonElement>('.world-time-seg [data-time]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.worldSettings.time = btn.dataset.time as WorldTime;
        this.syncWorldSegs();
        this.syncWorldShareLink();
      });
    });
  }

  private syncWorldShareLink(): void {
    const el = this.root.querySelector('.world-share-url');
    if (!el) return;
    const seed = this.worldSeedInput.value.trim() || randomSeed();
    this.collectWorldFromUi();
    el.textContent = buildShareUrl(seed, this.worldSettings);
  }

  private async copyWorldShareLink(): Promise<void> {
    this.syncWorldShareLink();
    const url = this.root.querySelector('.world-share-url')?.textContent?.trim();
    if (!url) return;
    const toast = this.root.querySelector('.world-share-toast') as HTMLElement | null;
    try {
      await navigator.clipboard.writeText(url);
      if (toast) {
        toast.hidden = false;
        window.setTimeout(() => {
          toast.hidden = true;
        }, 2200);
      }
    } catch {
      /* clipboard blocked */
    }
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
    this.syncWorldShareLink();
  }

  private syncWorldSegs(): void {
    this.root.querySelectorAll<HTMLButtonElement>('.world-terrain-seg [data-terrain]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.terrain === this.worldSettings.terrain);
    });
    this.root.querySelectorAll<HTMLButtonElement>('.world-caves-seg [data-caves]').forEach((btn) => {
      btn.classList.toggle('is-active', (btn.dataset.caves === '1') === this.worldSettings.caves);
    });
    this.root.querySelectorAll<HTMLButtonElement>('.world-structures-seg [data-structures]').forEach((btn) => {
      btn.classList.toggle('is-active', (btn.dataset.structures === '1') === this.worldSettings.structures);
    });
    this.root.querySelectorAll<HTMLButtonElement>('.world-time-seg [data-time]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.time === this.worldSettings.time);
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
    if (this.skinEditor) {
      this.profile.skinData = this.skinEditor.getDataUrl();
      if (!skinPixels) skinPixels = this.skinEditor.getPixels();
    }
    saveProfile(this.profile);
    this.onAction?.({
      type: 'prefs',
      profile: { ...this.profile },
      settings: { ...this.settings },
      skinPixels,
    });
  }

  private showPanel(panel: Panel): void {
    this.menuSky.setContext(panelToBgContext(panel));
    this.menuSky.start();

    uiSound('menu_transition');

    this.root.querySelectorAll<HTMLElement>('.vy-menu__stage').forEach((el) => {
      el.hidden = el.dataset.panel !== panel;
    });
    if (panel !== 'multiplayer') this.friendsPanel?.hideProfile();
    if (panel === 'settings') this.syncSettingsUi();
    if (panel === 'world') {
      if (this.worldView === 'list') this.renderWorldList();
      else this.syncWorldUi();
    }
    if (panel === 'home') {
      this.heroPreview?.stop();
      this.skinEditor?.setActive(false);
      this.modStudio?.stop();
      this.ensureHomePreview();
      this.syncHomePreview();
      requestAnimationFrame(() => {
        this.homePreview?.start();
        this.homePreview?.layout();
      });
    } else if (panel === 'customize') {
      this.homePreview?.stop();
      this.ensureHeroPreview();
      this.ensureSkinEditor();
      this.syncProfileUi();
      this.markActivePreset();
      requestAnimationFrame(() => {
        this.heroPreview?.start();
        this.heroPreview?.layout();
        this.skinEditor?.setActive(true);
      });
    } else if (panel === 'mod') {
      this.homePreview?.stop();
      this.heroPreview?.stop();
      this.skinEditor?.setActive(false);
      this.ensureModStudio();
      this.wireAiToMod();
      requestAnimationFrame(() => {
        this.modStudio?.start();
        this.modStudio?.layout();
      });
    } else if (panel === 'hub') {
      this.homePreview?.stop();
      this.heroPreview?.stop();
      this.skinEditor?.setActive(false);
      this.modStudio?.stop();
      this.ensureModHub();
    } else if (panel === 'ai') {
      this.homePreview?.stop();
      this.heroPreview?.stop();
      this.skinEditor?.setActive(false);
      this.modStudio?.stop();
      this.ensureAiStudio();
      this.wireAiToMod();
    } else if (panel === 'multiplayer') {
      this.friendsPanel?.refresh();
      this.homePreview?.stop();
      this.heroPreview?.stop();
      this.skinEditor?.setActive(false);
    } else {
      this.homePreview?.stop();
      this.heroPreview?.stop();
      this.skinEditor?.setActive(false);
      this.modStudio?.stop();
    }
  }

  private ensureModStudio(): void {
    if (this.modStudio) return;
    const mount = this.root.querySelector('.mod-studio-mount');
    if (!mount) return;
    try {
      this.modMaterials = new TerrainMaterials();
      this.modStudio = new ModStudioApp(this.modMaterials);
      mount.appendChild(this.modStudio.root);
    } catch (err) {
      console.error('[mod-studio]', err);
      mount.textContent =
        err instanceof Error ? `MOD Studio failed to load: ${err.message}` : 'MOD Studio failed to load';
    }
  }

  private ensureModHub(): void {
    if (this.modHub) {
      this.modHub.refresh();
      return;
    }
    const mount = this.root.querySelector('.mod-hub-mount');
    if (!mount) return;
    try {
      this.modHub = new ModHubApp();
      mount.appendChild(this.modHub.root);
    } catch (err) {
      console.error('[mod-hub]', err);
      mount.textContent =
        err instanceof Error ? `MOD Hub failed to load: ${err.message}` : 'MOD Hub failed to load';
    }
  }

  private ensureAiStudio(): void {
    if (this.aiStudio) return;
    const mount = this.root.querySelector('.ai-studio-mount');
    if (!mount) return;
    this.aiStudio = new VytheraAIStudio(
      () => undefined,
      (msg) => console.info('[ai-studio]', msg),
    );
    mount.appendChild(this.aiStudio.root);
    this.wireAiToMod();
  }

  private wireAiToMod(): void {
    if (!this.aiStudio || !this.modStudio) return;
    this.aiStudio.setInferenceHost(() => {
      const host = this.modStudio!.getEditorHost();
      if (!host) throw new Error('MOD Studio editor host unavailable');
      return host;
    });
  }
  private updateCharacterMeta(name?: string, tag?: string): void {
    const nameEl = this.root.querySelector('.profile-preview-name');
    const tagEl = this.root.querySelector('.profile-preview-tag');
    if (nameEl) nameEl.textContent = name ?? this.profile.name;
    if (tagEl) tagEl.textContent = tag ?? 'Custom look';
  }

  private selectCustomSkin(): void {
    this.previewPresetId = CUSTOM_PRESET_ID;
    this.activePresetId = null;
    const pixels = buildCustomBlankPixels();
    this.profile = {
      ...this.profile,
      ...customBlankProfile(this.profile.name),
      skinData: undefined,
    };
    this.ensureSkinEditor();
    this.skinEditor?.applyPreset(this.profile, pixels);
    this.syncHeroPreview(pixels);
    if (this.skinEditor) {
      this.profile.skinData = this.skinEditor.getDataUrl();
      this.emitPrefs(pixels);
    }
    this.syncProfileUi();
    this.updateCharacterMeta(this.profile.name, 'Blank block canvas');
    this.markActivePreset();
  }

  private ensureHeroPreview(): void {
    if (this.heroPreview) return;
    const mount = this.root.querySelector('.profile-hero-viewport');
    if (!mount) return;
    this.heroPreview = new ProfilePreview3D();
    this.heroPreview.mount(mount as HTMLElement);
    this.heroPreview.applyProfile(this.profile);
  }

  private ensureHomePreview(): void {
    if (this.homePreview) return;
    const mount = this.root.querySelector('.vy-home__viewport');
    if (!mount) return;
    this.homePreview = new ProfilePreview3D({
      transparent: true,
      interactive: true,
      autoSpin: false,
      className: 'profile-hero-3d',
    });
    this.homePreview.mount(mount as HTMLElement);
    this.homePreview.applyProfile(this.profile);
    this.homePreview.setPose('idle');
  }

  private syncHomePlayerName(): void {
    const el = this.root.querySelector('.vy-home__player-name');
    if (el) el.textContent = this.profile.name.trim() || 'Wanderer';
  }

  private syncHomePreview(pixels?: Uint8ClampedArray): void {
    this.ensureHomePreview();
    this.syncHomePlayerName();
    if (!this.homePreview) return;
    this.homePreview.applyProfile(this.profile);
    if (pixels) {
      this.homePreview.syncPixels(pixels);
      return;
    }
    if (this.profile.skinData) {
      void decodeSkin(this.profile.skinData)
        .then((p) => this.homePreview?.syncPixels(p))
        .catch(() => undefined);
    }
  }

  private syncHeroPreview(pixels?: Uint8ClampedArray): void {
    this.ensureHeroPreview();
    this.syncHomePreview(pixels);
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
      backpack: this.profile.backpack,
      belt: this.profile.belt,
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

  private bindSkinUploadUi(): void {
    const input = this.root.querySelector<HTMLInputElement>('.skin-upload-input');
    const label = this.root.querySelector<HTMLLabelElement>('.skin-upload-main');
    const stage = this.root.querySelector('.profile-hero-viewport');
    if (!input || !label) return;

    const apply = (result: SkinImportResult): void => {
      this.ensureSkinEditor();
      this.previewPresetId = CUSTOM_PRESET_ID;
      this.activePresetId = null;
      this.profile.skinData = encodeSkin(result.pixels);
      this.skinEditor?.applyImportedSkin(result);
      this.syncHeroPreview(result.pixels);
      this.emitPrefs(result.pixels);
      const tag =
        result.format === '128x128'
          ? 'HD Minecraft skin'
          : result.format === '64x32'
            ? 'Legacy Minecraft skin'
            : 'Minecraft skin';
      this.updateCharacterMeta(this.profile.name, tag);
      this.markActivePreset();
    };

    label.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('input')) return;
      input.click();
    });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      void importSkinFromFile(file).then(apply).catch(() => undefined);
    });

    if (!stage) return;
    stage.addEventListener('dragover', (e) => {
      e.preventDefault();
      stage.classList.add('skin-upload-drag');
    });
    stage.addEventListener('dragleave', () => stage.classList.remove('skin-upload-drag'));
    stage.addEventListener('drop', (e) => {
      e.preventDefault();
      stage.classList.remove('skin-upload-drag');
      const file = (e as DragEvent).dataTransfer?.files?.[0];
      if (!file) return;
      void importSkinFromFile(file).then(apply).catch(() => undefined);
    });
  }

  private fillPresetGrid(): void {
    const grid = this.root.querySelector('.skins-preset-grid');
    if (!grid) return;
    this.presetPreviews.forEach((p) => p.dispose());
    this.presetPreviews = [];

    grid.innerHTML = `
      <button type="button" class="skin-preset-card skin-preset-custom" data-preset="${CUSTOM_PRESET_ID}" aria-label="Custom dual-layer look">
        <div class="skin-preset-3d-host"></div>
        <span class="skin-preset-name">Custom</span>
        <span class="skin-preset-tag">Blank block canvas</span>
      </button>
      ${SKIN_PRESETS.map(
        (p) => `
        <button type="button" class="skin-preset-card" data-preset="${p.id}" aria-label="${p.name}">
          <div class="skin-preset-3d-host"></div>
          <span class="skin-preset-name">${p.name}</span>
          <span class="skin-preset-tag">${p.tag}</span>
        </button>`,
      ).join('')}`;

    const mountPreview = (card: Element, profile: Profile, pixels?: Uint8ClampedArray) => {
      const host = card.querySelector('.skin-preset-3d-host');
      if (!host) return;
      const preview = new PresetCardPreview3D();
      preview.mount(host as HTMLElement);
      preview.applyProfile({ ...profile, name: 'Preview' });
      if (pixels) preview.applyPixels(pixels);
      preview.start();
      this.presetPreviews.push(preview);
    };

    const customBtn = grid.querySelector<HTMLButtonElement>(`[data-preset="${CUSTOM_PRESET_ID}"]`);
    if (customBtn) {
      mountPreview(customBtn, customBlankProfile('Preview'), buildCustomBlankPixels());
      customBtn.addEventListener('click', () => this.selectCustomSkin());
    }

    grid.querySelectorAll<HTMLButtonElement>('.skin-preset-card:not(.skin-preset-custom)').forEach((btn) => {
      const id = btn.dataset.preset!;
      const preset = SKIN_PRESETS.find((p) => p.id === id);
      if (!preset) return;
      const pixels = preset.build();
      mountPreview(btn, { name: 'Preview', ...preset.profile }, pixels);
      btn.addEventListener('click', () => {
        this.applySkinPreset(id);
        this.syncProfileUi();
        this.updateCharacterMeta(this.profile.name, preset.tag);
        this.markActivePreset();
      });
    });
    this.markActivePreset();
  }

  private renderWardrobe(): void {
    const grid = this.root.querySelector('.wardrobe-grid');
    if (!grid) return;
    const slots = loadWardrobe();
    if (!slots.length) {
      grid.innerHTML = `<p style="font-size:0.75rem;color:var(--vy-muted)">No saved looks yet.</p>`;
      return;
    }
    grid.innerHTML = slots
      .map(
        (s) => `
      <div class="wardrobe-card" data-wardrobe="${escapeAttr(s.id)}" style="display:flex;gap:6px;margin-bottom:6px">
        <button type="button" class="vy-btn" style="flex:1;text-align:left" data-wardrobe-load="${escapeAttr(s.id)}">
          ${escapeHtml(s.name)} · ${new Date(s.savedAt).toLocaleDateString()}
        </button>
        <button type="button" class="vy-btn vy-btn--ghost" data-wardrobe-del="${escapeAttr(s.id)}" title="Delete">×</button>
      </div>`,
      )
      .join('');
    grid.querySelectorAll<HTMLButtonElement>('[data-wardrobe-load]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const slot = loadWardrobe().find((s) => s.id === btn.dataset.wardrobeLoad!);
        if (!slot) return;
        this.profile = { ...slot.profile };
        this.clearActivePreset();
        this.ensureSkinEditor();
        if (this.profile.skinData) {
          void decodeSkin(this.profile.skinData).then((pixels) => {
            this.skinEditor?.applyPreset(this.profile, pixels);
            this.syncSkinFromEditor();
          });
        } else {
          this.skinEditor?.randomize(this.profile);
          this.syncSkinFromEditor();
        }
      });
    });
    grid.querySelectorAll<HTMLButtonElement>('[data-wardrobe-del]').forEach((btn) => {
      btn.addEventListener('click', () => {
        deleteWardrobeSlot(btn.dataset.wardrobeDel!);
        this.renderWardrobe();
      });
    });
  }

  private applySkinPreset(id: string): void {
    const next = applyPresetToProfile(this.profile.name, id);
    if (!next) return;
    this.profile = next;
    this.activePresetId = id;
    this.previewPresetId = id;
    this.ensureSkinEditor();
    const pixels = SKIN_PRESETS.find((p) => p.id === id)!.build();
    this.skinEditor?.applyPreset(this.profile, pixels);
    this.syncHeroPreview(pixels);
    if (this.skinEditor) this.profile.skinData = this.skinEditor.getDataUrl();
    this.emitPrefs(pixels);
  }

  private clearActivePreset(): void {
    this.activePresetId = null;
    this.previewPresetId = CUSTOM_PRESET_ID;
    this.markActivePreset();
  }

  private markActivePreset(): void {
    const activeId = this.previewPresetId ?? this.activePresetId;
    this.root.querySelectorAll<HTMLButtonElement>('.skin-preset-card').forEach((btn) => {
      const id = btn.dataset.preset!;
      let active = false;
      if (id === CUSTOM_PRESET_ID) {
        active =
          activeId === CUSTOM_PRESET_ID ||
          (!activeId && !SKIN_PRESETS.some((p) => presetMatchesProfile(this.profile, p.id)));
      } else {
        active =
          activeId === id ||
          (!activeId && id !== CUSTOM_PRESET_ID && presetMatchesProfile(this.profile, id));
      }
      btn.classList.toggle('active', active);
      btn.classList.toggle('is-active', active);
    });
  }

  private bindSettingsUi(): void {
    const sens = this.root.querySelector<HTMLInputElement>('.sens-range')!;
    const fov = this.root.querySelector<HTMLInputElement>('.fov-range')!;
    const dist = this.root.querySelector<HTMLInputElement>('.dist-range')!;
    const bright = this.root.querySelector<HTMLInputElement>('.bright-range')!;
    const clouds = this.root.querySelector<HTMLInputElement>('.cloud-range')!;
    sens.addEventListener('input', () => {
      this.root.querySelector('.sens-val')!.textContent = Number(sens.value).toFixed(2);
    });
    fov.addEventListener('input', () => {
      this.root.querySelector('.fov-val')!.textContent = fov.value;
    });
    dist.addEventListener('input', () => {
      this.root.querySelector('.dist-val')!.textContent = dist.value;
    });
    bright.addEventListener('input', () => {
      this.root.querySelector('.bright-val')!.textContent = Number(bright.value).toFixed(2);
    });
    clouds.addEventListener('input', () => {
      this.root.querySelector('.cloud-val')!.textContent = `${Math.round(Number(clouds.value) * 100)}%`;
    });
    this.root
      .querySelectorAll<HTMLButtonElement>('[data-panel="settings"] [data-view]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          this.settings.viewMode = btn.dataset.view as ViewMode;
          this.syncViewSeg();
        });
      });
    this.root.querySelectorAll<HTMLButtonElement>('[data-settings-cat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.settingsCat;
        if (!cat) return;
        this.root.querySelectorAll<HTMLButtonElement>('[data-settings-cat]').forEach((b) => {
          b.classList.toggle('is-active', b === btn);
        });
        this.root.querySelectorAll<HTMLElement>('[data-settings-pane]').forEach((pane) => {
          pane.hidden = pane.dataset.settingsPane !== cat;
        });
        if (cat === 'privacy') void this.refreshOnlineServiceLabel();
      });
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-ai-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.root.querySelectorAll<HTMLButtonElement>('[data-ai-mode]').forEach((b) => {
          b.classList.toggle('is-active', b === btn);
        });
      });
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-modhub-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.root.querySelectorAll<HTMLButtonElement>('[data-modhub-mode]').forEach((b) => {
          b.classList.toggle('is-active', b === btn);
        });
      });
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-data-sharing]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.root.querySelectorAll<HTMLButtonElement>('[data-data-sharing]').forEach((b) => {
          b.classList.toggle('is-active', b === btn);
        });
      });
    });
    const bindBgSeg = (attr: string) => {
      this.root
        .querySelectorAll<HTMLButtonElement>(`[data-panel="settings"] [data-${attr}]`)
        .forEach((btn) => {
          btn.addEventListener('click', () => {
            this.root
              .querySelectorAll<HTMLButtonElement>(`[data-panel="settings"] [data-${attr}]`)
              .forEach((b) => {
                b.classList.toggle('is-active', b === btn);
              });
          });
        });
    };
    bindBgSeg('bg-mode');
    bindBgSeg('bg-animation');
    bindBgSeg('bg-quality');
    const atmo = this.root.querySelector<HTMLInputElement>('.bg-atmo-range');
    atmo?.addEventListener('input', () => {
      this.root.querySelector('.bg-atmo-val')!.textContent = Number(atmo.value).toFixed(2);
    });
  }

  private syncSettingsUi(): void {
    const sens = this.root.querySelector<HTMLInputElement>('.sens-range')!;
    const fov = this.root.querySelector<HTMLInputElement>('.fov-range')!;
    const dist = this.root.querySelector<HTMLInputElement>('.dist-range')!;
    const bright = this.root.querySelector<HTMLInputElement>('.bright-range')!;
    const clouds = this.root.querySelector<HTMLInputElement>('.cloud-range')!;
    const invert = this.root.querySelector<HTMLInputElement>('.invert-y-check')!;
    const fps = this.root.querySelector<HTMLInputElement>('.show-fps-check')!;
    const uw = this.root.querySelector<HTMLInputElement>('.uw-fx-check')!;
    sens.value = String(this.settings.mouseSensitivity);
    fov.value = String(this.settings.fov);
    dist.value = String(this.settings.renderDistance);
    bright.value = String(this.settings.brightness);
    clouds.value = String(this.settings.clouds);
    invert.checked = this.settings.invertY;
    fps.checked = this.settings.showFps;
    uw.checked = this.settings.underwaterFx;
    this.root.querySelector('.sens-val')!.textContent = this.settings.mouseSensitivity.toFixed(2);
    this.root.querySelector('.fov-val')!.textContent = String(this.settings.fov);
    this.root.querySelector('.dist-val')!.textContent = String(this.settings.renderDistance);
    this.root.querySelector('.bright-val')!.textContent = this.settings.brightness.toFixed(2);
    this.root.querySelector('.cloud-val')!.textContent = `${Math.round(this.settings.clouds * 100)}%`;
    this.syncBgPrefsUi();
    this.syncViewSeg();
    this.syncOnlineSettingsUi();
    const editHud = this.root.querySelector<HTMLButtonElement>('[data-action="edit-hud"]');
    const hint = this.root.querySelector<HTMLElement>('.edit-hud-hint');
    if (editHud) {
      editHud.disabled = !this.hasSession;
      editHud.title = this.hasSession
        ? 'Drag hotbar and touch controls'
        : 'Open or resume a world first';
    }
    if (hint) {
      hint.textContent = this.hasSession
        ? 'Drag hotbar and controls. Done returns you to the world.'
        : 'Open or resume a world first, then return here from the title screen.';
    }
  }

  private syncOnlineSettingsUi(): void {
    const online = loadOnlineSettings();
    this.root.querySelectorAll<HTMLButtonElement>('[data-ai-mode]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.aiMode === online.aiMode);
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-modhub-mode]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.modhubMode === online.modHubMode);
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-data-sharing]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.dataSharing === online.dataSharing);
    });
    const cloud = this.root.querySelector<HTMLInputElement>('.cloud-ai-check');
    if (cloud) cloud.checked = online.cloudAiEnabled;
    const url = this.root.querySelector<HTMLInputElement>('.online-api-url');
    if (url) url.value = online.apiBaseUrl;
    const status = this.root.querySelector<HTMLElement>('.cloud-ai-status');
    if (status) {
      status.textContent = online.cloudAiEnabled ? 'ON' : 'OFF';
      if (online.cloudAiEnabled) status.removeAttribute('data-off');
      else status.setAttribute('data-off', '');
    }
    void this.refreshOnlineServiceLabel();
  }

  private async refreshOnlineServiceLabel(): Promise<void> {
    const label = this.root.querySelector<HTMLElement>('.online-service-label');
    if (!label) return;
    try {
      const status = await resolveServiceUiStatus();
      label.textContent = status.label;
    } catch {
      label.textContent = 'VYTHERA LOCAL ONLY';
    }
  }

  private collectOnlineSettingsFromUi(): void {
    const aiBtn = this.root.querySelector<HTMLButtonElement>('[data-ai-mode].is-active');
    const hubBtn = this.root.querySelector<HTMLButtonElement>('[data-modhub-mode].is-active');
    const shareBtn = this.root.querySelector<HTMLButtonElement>('[data-data-sharing].is-active');
    const cloud = this.root.querySelector<HTMLInputElement>('.cloud-ai-check');
    const url = this.root.querySelector<HTMLInputElement>('.online-api-url');
    const prev = loadOnlineSettings();
    const aiMode = (aiBtn?.dataset.aiMode as VytheraAIMode | undefined) ?? 'LOCAL';
    const modHubMode = (hubBtn?.dataset.modhubMode as VytheraModHubMode | undefined) ?? 'OFFLINE';
    const dataSharing = (shareBtn?.dataset.dataSharing as VytheraDataSharing | undefined) ?? 'PRIVATE';
    saveOnlineSettings({
      ...prev,
      apiBaseUrl: url?.value.trim() ?? '',
      aiMode: aiMode === 'ONLINE' || aiMode === 'AUTO' || aiMode === 'LOCAL' ? aiMode : 'LOCAL',
      modHubMode: modHubMode === 'ONLINE' ? 'ONLINE' : 'OFFLINE',
      dataSharing:
        dataSharing === 'PUBLISHABLE' || dataSharing === 'PUBLIC' || dataSharing === 'PRIVATE'
          ? dataSharing
          : 'PRIVATE',
      cloudAiEnabled: cloud?.checked === true,
    });
  }

  private syncViewSeg(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-panel="settings"] [data-view]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.view === this.settings.viewMode);
    });
  }

  private syncBgPrefsUi(): void {
    const prefs = loadBgPrefs();
    this.root
      .querySelectorAll<HTMLButtonElement>('[data-panel="settings"] [data-bg-mode]')
      .forEach((btn) => {
        btn.classList.toggle('is-active', btn.dataset.bgMode === prefs.mode);
      });
    this.root
      .querySelectorAll<HTMLButtonElement>('[data-panel="settings"] [data-bg-animation]')
      .forEach((btn) => {
        btn.classList.toggle('is-active', btn.dataset.bgAnimation === prefs.animation);
      });
    this.root
      .querySelectorAll<HTMLButtonElement>('[data-panel="settings"] [data-bg-quality]')
      .forEach((btn) => {
        btn.classList.toggle('is-active', btn.dataset.bgQuality === prefs.quality);
      });
    const motion = this.root.querySelector<HTMLInputElement>('.bg-motion-check');
    const particles = this.root.querySelector<HTMLInputElement>('.bg-particles-check');
    const cloud = this.root.querySelector<HTMLInputElement>('.bg-cloud-check');
    const veg = this.root.querySelector<HTMLInputElement>('.bg-veg-check');
    const water = this.root.querySelector<HTMLInputElement>('.bg-water-check');
    const atmoEnable = this.root.querySelector<HTMLInputElement>('.bg-atmo-enable-check');
    const atmo = this.root.querySelector<HTMLInputElement>('.bg-atmo-range');
    if (motion) motion.checked = prefs.motion;
    if (particles) particles.checked = prefs.particles;
    if (cloud) cloud.checked = prefs.cloudMotion;
    if (veg) veg.checked = prefs.vegetationMotion;
    if (water) water.checked = prefs.waterMotion;
    if (atmoEnable) atmoEnable.checked = prefs.atmosphereEnabled;
    if (atmo) {
      atmo.value = String(prefs.atmosphere);
      this.root.querySelector('.bg-atmo-val')!.textContent = prefs.atmosphere.toFixed(2);
    }
  }

  private collectBgPrefsFromUi(): void {
    const activeMode = this.root.querySelector<HTMLButtonElement>(
      '[data-panel="settings"] [data-bg-mode].is-active',
    );
    const activeAnim = this.root.querySelector<HTMLButtonElement>(
      '[data-panel="settings"] [data-bg-animation].is-active',
    );
    const activeQuality = this.root.querySelector<HTMLButtonElement>(
      '[data-panel="settings"] [data-bg-quality].is-active',
    );
    const mode = (activeMode?.dataset.bgMode as VytheraBgMode | undefined) ?? 'dynamic';
    const animation = (activeAnim?.dataset.bgAnimation as BgAnimationLevel | undefined) ?? 'normal';
    const quality = (activeQuality?.dataset.bgQuality as BgQuality | undefined) ?? 'medium';
    const motion = this.root.querySelector<HTMLInputElement>('.bg-motion-check');
    const particles = this.root.querySelector<HTMLInputElement>('.bg-particles-check');
    const cloud = this.root.querySelector<HTMLInputElement>('.bg-cloud-check');
    const veg = this.root.querySelector<HTMLInputElement>('.bg-veg-check');
    const water = this.root.querySelector<HTMLInputElement>('.bg-water-check');
    const atmoEnable = this.root.querySelector<HTMLInputElement>('.bg-atmo-enable-check');
    const atmo = this.root.querySelector<HTMLInputElement>('.bg-atmo-range');
    saveBgPrefs({
      mode: mode === 'static' || mode === 'performance' || mode === 'dynamic' ? mode : 'dynamic',
      animation:
        animation === 'off' || animation === 'low' || animation === 'normal' || animation === 'high'
          ? animation
          : 'normal',
      quality:
        quality === 'low' || quality === 'medium' || quality === 'high' || quality === 'ultra'
          ? quality
          : 'medium',
      motion: motion ? motion.checked : false,
      particles: particles ? particles.checked : true,
      cloudMotion: cloud ? cloud.checked : true,
      vegetationMotion: veg ? veg.checked : true,
      waterMotion: water ? water.checked : true,
      atmosphereEnabled: atmoEnable ? atmoEnable.checked : true,
      atmosphere: atmo ? Number(atmo.value) : 0.72,
      weather: 'clear',
    });
  }

  private collectSettingsFromUi(): void {
    const sens = this.root.querySelector<HTMLInputElement>('.sens-range')!;
    const fov = this.root.querySelector<HTMLInputElement>('.fov-range')!;
    const dist = this.root.querySelector<HTMLInputElement>('.dist-range')!;
    const bright = this.root.querySelector<HTMLInputElement>('.bright-range')!;
    const clouds = this.root.querySelector<HTMLInputElement>('.cloud-range')!;
    const invert = this.root.querySelector<HTMLInputElement>('.invert-y-check')!;
    const fps = this.root.querySelector<HTMLInputElement>('.show-fps-check')!;
    const uw = this.root.querySelector<HTMLInputElement>('.uw-fx-check')!;
    this.settings.mouseSensitivity = Number(sens.value);
    this.settings.fov = Number(fov.value);
    this.settings.renderDistance = Number(dist.value);
    this.settings.brightness = Number(bright.value);
    this.settings.clouds = Number(clouds.value);
    this.settings.invertY = invert.checked;
    this.settings.showFps = fps.checked;
    this.settings.underwaterFx = uw.checked;
    this.collectOnlineSettingsFromUi();
  }

  private bindProfileUi(): void {
    const nameInput = this.root.querySelector<HTMLInputElement>('.name-input')!;
    nameInput.addEventListener('input', () => {
      this.root.querySelector('.profile-preview-name')!.textContent =
        nameInput.value.trim() || 'Wanderer';
    });

    const pickColor = (
      kind: string,
      colors: string[],
      apply: (c: string) => void,
    ): void => {
      this.fillSwatches(kind, colors, (c) => {
        this.clearActivePreset();
        apply(c);
        this.syncSkinFromEditor();
      });
    };

    pickColor('skin', SKIN_SWATCHES, (c) => {
      this.profile.skin = c;
      this.skinEditor?.setBaseColors(this.profile.skin, this.profile.outfit, this.profile.accent, 'skin');
    });
    pickColor('outfit', OUTFIT_SWATCHES, (c) => {
      this.profile.outfit = c;
      this.skinEditor?.setBaseColors(this.profile.skin, this.profile.outfit, this.profile.accent, 'outfit');
      this.skinEditor?.applyCosmetics(this.profile);
    });
    pickColor('pants', PANTS_SWATCHES, (c) => {
      this.profile.pants = c;
      this.skinEditor?.applyCosmetics(this.profile);
    });
    pickColor('accent', ACCENT_SWATCHES, (c) => {
      this.profile.accent = c;
      this.skinEditor?.setBaseColors(this.profile.skin, this.profile.outfit, this.profile.accent, 'accent');
    });
    pickColor('hair', HAIR_SWATCHES, (c) => {
      this.profile.hair = c;
      this.skinEditor?.applyCosmetics(this.profile);
    });
    pickColor('eyes', EYE_SWATCHES, (c) => {
      this.profile.eyes = c;
      this.skinEditor?.applyCosmetics(this.profile);
    });
    pickColor('shoes', SHOE_SWATCHES, (c) => {
      this.profile.shoes = c;
      this.skinEditor?.applyCosmetics(this.profile);
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

    const syncOnly = <T extends string>(sel: string, set: (v: T) => void) => {
      this.root.querySelectorAll<HTMLButtonElement>(sel).forEach((btn) => {
        btn.addEventListener('click', () => {
          this.clearActivePreset();
          const attr = sel.match(/\[data-([^\]]+)\]/)?.[1] ?? '';
          const camel = attr.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
          const v = (btn.dataset[camel] ?? btn.getAttribute(`data-${attr}`)) as T;
          set(v);
          this.syncProfileUi();
          this.skinEditor?.syncAvatarProfile(this.profile);
          this.emitPrefs();
        });
      });
    };
    syncOnly('[data-glasses]', (v) => {
      this.profile.glasses = v as GlassesStyle;
    });
    syncOnly('[data-cape]', (v) => {
      this.profile.cape = v as CapeStyle;
    });
    syncOnly('[data-backpack]', (v) => {
      this.profile.backpack = v as BackpackStyle;
    });
    syncOnly('[data-belt]', (v) => {
      this.profile.belt = v as BeltStyle;
    });
    syncOnly('[data-style]', (v) => {
      this.profile.style = v as AvatarStyle;
    });
    syncOnly('[data-hat]', (v) => {
      this.profile.hat = v as HatStyle;
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-pose]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pose = btn.dataset.pose as 'idle' | 'walk' | 'sneak' | 'sit';
        this.heroPreview?.setPose(pose);
        this.root.querySelectorAll<HTMLButtonElement>('[data-pose]').forEach((b) => {
          b.classList.toggle('is-active', b.dataset.pose === pose);
        });
      });
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-snap-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.snapView as 'front' | 'side' | 'back';
        this.heroPreview?.snapView(view);
        this.root.querySelectorAll<HTMLButtonElement>('[data-snap-view]').forEach((b) => {
          b.classList.toggle('is-active', b.dataset.snapView === view);
        });
      });
    });
  }

  private fillSwatches(kind: string, colors: string[], onPick: (c: string) => void): void {
    const row = this.root.querySelector(`.swatch-row[data-swatch="${kind}"]`);
    if (!row) return;
    row.innerHTML = colors
      .map(
        (c) =>
          `<button type="button" class="swatch" data-color="${c}" style="--sw:${c};width:22px;height:22px;border-radius:4px;border:1px solid var(--vy-line);background:var(--sw);cursor:pointer" aria-label="${c}"></button>`,
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

    const mark = (sel: string, key: string, val: string) => {
      this.root.querySelectorAll<HTMLButtonElement>(sel).forEach((btn) => {
        const camel = key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
        const v = btn.dataset[camel] ?? btn.getAttribute(`data-${key}`);
        btn.classList.toggle('is-active', v === val);
      });
    };
    mark('[data-hair-style]', 'hair-style', this.profile.hairStyle);
    mark('[data-face]', 'face', this.profile.face);
    mark('[data-facial]', 'facial', this.profile.facial);
    mark('[data-sleeves]', 'sleeves', this.profile.sleeves);
    mark('[data-glasses]', 'glasses', this.profile.glasses);
    mark('[data-cape]', 'cape', this.profile.cape);
    mark('[data-backpack]', 'backpack', this.profile.backpack);
    mark('[data-belt]', 'belt', this.profile.belt);
    mark('[data-style]', 'style', this.profile.style);
    mark('[data-hat]', 'hat', this.profile.hat);

    const match = SKIN_PRESETS.find((p) => presetMatchesProfile(this.profile, p.id));
    this.updateCharacterMeta(this.profile.name, match?.tag ?? 'Custom look');
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
      el.classList.toggle('is-active', (el as HTMLElement).dataset.color === color);
    });
  }

  private collectProfileFromUi(): void {
    const nameInput = this.root.querySelector<HTMLInputElement>('.name-input');
    if (nameInput) this.profile.name = nameInput.value.trim().slice(0, 20) || 'Wanderer';
    if (this.skinEditor) this.profile.skinData = this.skinEditor.getDataUrl();
  }
}
