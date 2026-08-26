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
import { FriendsPanel } from './FriendsPanel';
import { MainMenuSky } from './MainMenuSky';
import { TerrainMaterials } from '../render/TerrainMaterials';
import { VoxelEditorUi } from './VoxelEditorUi';

export type MenuAction =
  | { type: 'play'; seed: string }
  | { type: 'resume' }
  | { type: 'edit-hud' }
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, '&#39;');
}

type Panel = 'home' | 'settings' | 'customize' | 'multiplayer' | 'world' | 'mod';

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
  private homePreview: ProfilePreview3D | null = null;
  private activePresetId: string | null = null;
  private previewPresetId: string | null = null;
  private presetPreviews: PresetCardPreview3D[] = [];
  private friendsPanel: FriendsPanel | null = null;
  private selectedWorldSeed: string | null = null;
  private worldView: 'list' | 'create' = 'list';
  private menuSky = new MainMenuSky();
  private modMaterials: TerrainMaterials | null = null;
  private modWorkshop: VoxelEditorUi | null = null;

  constructor(private social?: SocialClient) {
    this.root = document.createElement('div');
    this.root.id = 'main-menu';
    this.root.innerHTML = `
      <div class="menu-stage menu-home" data-panel="home">
        <div class="menu-atmosphere" aria-hidden="true"></div>
        <div class="menu-home-inner menu-home-hero">
          <header class="menu-header menu-header--vythera">
            <div class="menu-brand-wrap">
              <span class="menu-brand-spark" aria-hidden="true"></span>
              <span class="menu-brand-spark menu-brand-spark--left" aria-hidden="true"></span>
              <span class="menu-brand-spark menu-brand-spark--right" aria-hidden="true"></span>
              <h1 class="menu-brand menu-brand--vythera">VYTHERA</h1>
              <div class="menu-brand-ornament" aria-hidden="true">
                <span class="menu-brand-line"></span>
                <span class="menu-lotus" aria-hidden="true">
                  <svg viewBox="0 0 36 30" width="36" height="30" fill="none">
                    <path d="M18 26c-6-5-10-10-10-15 0-4 3-7 7-7 1.4 0 2.6.5 3.5 1.3C19.4 4.5 20.6 4 22 4c4 0 7 3 7 7 0 5-4 10-11 15z" fill="#eef7ff"/>
                    <path d="M18 26c-4-8-3-14 0-18 3 4 4 10 0 18z" fill="#cfe6ff"/>
                    <path d="M18 26c-8-2-13-7-12-12 4 1 9 5 12 12z" fill="#d9ecff"/>
                    <path d="M18 26c8-2 13-7 12-12-4 1-9 5-12 12z" fill="#d9ecff"/>
                  </svg>
                </span>
                <span class="menu-brand-line"></span>
              </div>
            </div>
          </header>
          <div class="menu-home-body">
            <div class="menu-home-side menu-home-side--spacer" aria-hidden="true"></div>
            <nav class="menu-nav menu-nav--vythera" aria-label="Main menu">
              <button type="button" class="menu-hero-btn menu-hero-btn--play" data-action="play">
                <span class="menu-hero-btn__spark" aria-hidden="true"></span>
                <span class="menu-hero-btn__label">PLAY</span>
                <span class="menu-hero-btn__spark" aria-hidden="true"></span>
              </button>
              <button type="button" class="menu-hero-btn" data-action="settings">
                <span class="menu-hero-btn__icon" aria-hidden="true">
                  <svg viewBox="0 0 16 16" width="16" height="16"><circle cx="8" cy="8" r="2.2" fill="currentColor"/><path d="M8 1.5l1.1 2.2 2.4-.2-.2 2.4 2.2 1.1-2.2 1.1.2 2.4-2.4-.2L8 14.5l-1.1-2.2-2.4.2.2-2.4L2.5 9.1l2.2-1.1-.2-2.4 2.4.2z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>
                </span>
                <span class="menu-hero-btn__plus" aria-hidden="true">+</span>
                <span class="menu-hero-btn__label">SETTINGS</span>
              </button>
              <button type="button" class="menu-hero-btn" data-action="mod">
                <span class="menu-hero-btn__icon" aria-hidden="true">
                  <svg viewBox="0 0 16 16" width="16" height="16"><path d="M2 2h5v5H2V2zm7 0h5v5H9V2zM2 9h5v5H2V9zm7 2h5v3H9v-3z" fill="currentColor"/></svg>
                </span>
                <span class="menu-hero-btn__plus" aria-hidden="true">+</span>
                <span class="menu-hero-btn__label">MOD</span>
              </button>
              <button type="button" class="menu-hero-btn" data-action="multiplayer">
                <span class="menu-hero-btn__icon" aria-hidden="true">
                  <svg viewBox="0 0 16 16" width="16" height="16"><path d="M5.5 7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm5 0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM1.5 14c0-2.2 1.8-3.5 4-3.5s4 1.3 4 3.5M8.5 14c.3-1.5 1.2-2.6 2.5-3.1 1.1-.4 2.3-.3 3.5.2" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
                </span>
                <span class="menu-hero-btn__plus" aria-hidden="true">+</span>
                <span class="menu-hero-btn__label">FRIENDS</span>
              </button>
            </nav>
            <aside class="menu-home-player menu-home-side">
              <span class="menu-home-player-name">Wanderer</span>
              <div class="menu-home-player-viewport" aria-hidden="true"></div>
              <button type="button" class="menu-hero-btn menu-home-skins-btn" data-action="customize">
                <span class="menu-hero-btn__icon" aria-hidden="true">
                  <svg viewBox="0 0 16 16" width="14" height="14"><path d="M8 1.5l1.6 4.2H14l-3.4 2.8 1.2 4.5L8 10.6 4.2 13l1.2-4.5L2 5.7h4.4z" fill="currentColor"/></svg>
                </span>
                <span class="menu-hero-btn__plus" aria-hidden="true">+</span>
                <span class="menu-hero-btn__label">SKINS</span>
              </button>
            </aside>
          </div>
        </div>
      </div>

      <div class="menu-stage panel" data-panel="settings" hidden>
        <button type="button" class="panel-back" data-action="home">BACK</button>
        <h2 class="panel-title">SETTINGS</h2>
        <div class="menu-brand-ornament panel-ornament" aria-hidden="true">
          <span class="menu-brand-line"></span>
          <span class="menu-lotus">
            <svg viewBox="0 0 36 30" width="28" height="24" fill="none">
              <path d="M18 26c-6-5-10-10-10-15 0-4 3-7 7-7 1.4 0 2.6.5 3.5 1.3C19.4 4.5 20.6 4 22 4c4 0 7 3 7 7 0 5-4 10-11 15z" fill="#eef7ff"/>
              <path d="M18 26c-4-8-3-14 0-18 3 4 4 10 0 18z" fill="#cfe6ff"/>
              <path d="M18 26c-8-2-13-7-12-12 4 1 9 5 12 12z" fill="#d9ecff"/>
              <path d="M18 26c8-2 13-7 12-12-4 1-9 5-12 12z" fill="#d9ecff"/>
            </svg>
          </span>
          <span class="menu-brand-line"></span>
        </div>
        <label class="field">
          <span>Mouse sensitivity <em class="sens-val">1.0</em></span>
          <input type="range" class="sens-range" min="0.35" max="2.5" step="0.05" />
        </label>
        <label class="field">
          <span>Field of view <em class="fov-val">75</em></span>
          <input type="range" class="fov-range" min="55" max="100" step="1" />
        </label>
        <label class="field">
          <span>Render distance <em class="dist-val">7</em></span>
          <input type="range" class="dist-range" min="3" max="8" step="1" />
        </label>
        <label class="field">
          <span>Brightness <em class="bright-val">1.0</em></span>
          <input type="range" class="bright-range" min="0.6" max="1.4" step="0.05" />
        </label>
        <label class="field">
          <span>Clouds <em class="cloud-val">70%</em></span>
          <input type="range" class="cloud-range" min="0" max="1" step="0.05" />
        </label>
        <div class="field">
          <span>Person view</span>
          <div class="seg" role="group" aria-label="Camera view">
            <button type="button" class="seg-btn" data-view="first">First person</button>
            <button type="button" class="seg-btn" data-view="third">Third person</button>
            <button type="button" class="seg-btn" data-view="front">Front</button>
          </div>
        </div>
        <label class="field field-check">
          <input type="checkbox" class="invert-y-check" />
          <span>Invert Y look</span>
        </label>
        <label class="field field-check">
          <input type="checkbox" class="show-fps-check" />
          <span>Show FPS</span>
        </label>
        <label class="field field-check">
          <input type="checkbox" class="uw-fx-check" checked />
          <span>Underwater effects</span>
        </label>
        <div class="field">
          <span>Touch &amp; HUD layout</span>
          <button type="button" class="menu-btn" data-action="edit-hud">Move HUD</button>
          <p class="field-hint edit-hud-hint">Drag hotbar and controls while in a world. Open a world first if this is disabled.</p>
        </div>
        <button type="button" class="menu-btn primary" data-action="save-settings">SAVE</button>
      </div>

      <div class="menu-stage panel profile-panel blocky customize-panel" data-panel="customize" hidden>
        <header class="profile-topbar">
          <button type="button" class="panel-back" data-action="home">BACK</button>
          <h2 class="panel-title">CHARACTER</h2>
          <button type="button" class="menu-btn primary block-btn" data-action="save-profile">SAVE</button>
        </header>
        <div class="profile-shell">
          <aside class="profile-stage">
            <div class="profile-hero-viewport"></div>
            <div class="profile-pose-row" role="group" aria-label="Preview pose">
              <button type="button" class="seg-btn active" data-pose="idle">Idle</button>
              <button type="button" class="seg-btn" data-pose="walk">Walk</button>
              <button type="button" class="seg-btn" data-pose="sneak">Sneak</button>
              <button type="button" class="seg-btn" data-pose="sit">Sit</button>
              <button type="button" class="seg-btn" data-snap-view="front">Front</button>
              <button type="button" class="seg-btn" data-snap-view="side">Side</button>
              <button type="button" class="seg-btn" data-snap-view="back">Back</button>
            </div>
            <div class="profile-stage-meta">
              <span class="profile-preview-name">Wanderer</span>
              <span class="profile-preview-tag">Skins, colors, body, and gear</span>
              <label class="field field-tight">
                <span>Name</span>
                <input type="text" class="name-input" maxlength="20" spellcheck="false" autocomplete="off" />
              </label>
              <button type="button" class="menu-btn ghost block-btn profile-random" data-action="random-look">RANDOM LOOK</button>
            </div>
          </aside>

          <div class="profile-scroll">
            <section class="profile-section block-card">
              <h3 class="profile-section-title">Skin presets</h3>
              <p class="profile-preset-hint">Simple block voxel looks — pick one, then tweak below.</p>
              <div class="skin-upload-row">
                <label class="menu-btn primary skin-upload-main">
                  Upload skin
                  <input type="file" class="skin-upload-input" accept="image/png" hidden />
                </label>
                <p class="skin-upload-hint">Minecraft 64×64 or 128×128 PNG · drop on preview</p>
              </div>
              <div class="skin-preset-grid skins-preset-grid" role="list"></div>
            </section>

            <section class="profile-section block-card">
              <h3 class="profile-section-title">Wardrobe</h3>
              <p class="profile-preset-hint">Save looks to swap later. Up to 12 slots.</p>
              <div class="wardrobe-actions">
                <button type="button" class="menu-btn quiet" data-action="wardrobe-save">Save look</button>
              </div>
              <div class="wardrobe-grid" role="list"></div>
            </section>

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
                  <button type="button" class="seg-btn" data-hair-style="bun">Bun</button>
                  <button type="button" class="seg-btn" data-hair-style="afro">Afro</button>
                  <button type="button" class="seg-btn" data-hair-style="bangs">Bangs</button>
                </div>
              </div>
              <div class="field field-tight">
                <span>Face</span>
                <div class="seg seg-wrap" role="group" aria-label="Face">
                  <button type="button" class="seg-btn" data-face="neutral">Neutral</button>
                  <button type="button" class="seg-btn" data-face="smile">Smile</button>
                  <button type="button" class="seg-btn" data-face="frown">Frown</button>
                  <button type="button" class="seg-btn" data-face="scar">Scar</button>
                  <button type="button" class="seg-btn" data-face="wink">Wink</button>
                  <button type="button" class="seg-btn" data-face="cool">Cool</button>
                  <button type="button" class="seg-btn" data-face="blush">Blush</button>
                  <button type="button" class="seg-btn" data-face="freckles">Freckles</button>
                  <button type="button" class="seg-btn" data-face="kawaii">Kawaii</button>
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
              <div class="field field-tight">
                <span>Backpack</span>
                <div class="seg seg-wrap" role="group" aria-label="Backpack">
                  <button type="button" class="seg-btn" data-backpack="none">None</button>
                  <button type="button" class="seg-btn" data-backpack="pack">Pack</button>
                  <button type="button" class="seg-btn" data-backpack="satchel">Satchel</button>
                </div>
              </div>
              <div class="field field-tight">
                <span>Belt</span>
                <div class="seg seg-wrap" role="group" aria-label="Belt">
                  <button type="button" class="seg-btn" data-belt="none">None</button>
                  <button type="button" class="seg-btn" data-belt="leather">Leather</button>
                  <button type="button" class="seg-btn" data-belt="utility">Utility</button>
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

      <div class="menu-stage panel mod-panel" data-panel="mod" hidden>
        <header class="profile-topbar mod-panel-header">
          <button type="button" class="panel-back" data-action="home">BACK</button>
          <h2 class="panel-title">MOD</h2>
          <div class="mod-panel-header-actions">
            <span class="mod-panel-tag">Shape maker</span>
            <button type="button" class="voxel-editor-btn" data-action="reset-view" title="Reset camera">↺</button>
            <button type="button" class="voxel-editor-btn" data-action="clear" title="Clear model">Clear</button>
          </div>
        </header>
        <div class="mod-play-link-wrap">
          <p class="menu-share-hint">Open the game — share this link</p>
          <div class="menu-play-link-row">
            <a class="menu-play-link" href="#" target="_blank" rel="noopener noreferrer"></a>
            <button type="button" class="menu-play-link-copy" data-action="copy-play-link">Copy</button>
          </div>
          <p class="menu-share-toast menu-play-link-toast" hidden>Link copied</p>
        </div>
        <div class="mod-workshop-mount"></div>
      </div>

      <div class="menu-stage menu-home mp-panel" data-panel="multiplayer" hidden>
        <div class="menu-home-inner menu-glass-window mp-glass-window mc-panel-window">
          <header class="mp-topbar mc-topbar">
            <button type="button" class="panel-back" data-action="home">BACK</button>
            <h2 class="panel-title">FRIENDS</h2>
          </header>
          <div class="mp-shell friends-shell mc-shell">
            <p class="mp-status mc-status">Friends server: connecting…</p>
            <div class="mc-block">
              <p class="mc-section-title">Your friend code</p>
              <div class="friends-code-row">
                <code class="friends-my-code"></code>
                <button type="button" class="mc-btn mc-btn--small friends-copy-btn" data-action="copy-friend-code">Copy</button>
              </div>
            </div>
            <div class="mc-block">
              <p class="mc-section-title">Add a friend</p>
              <div class="friends-add-row">
                <input type="text" class="friends-add-input mc-input" maxlength="6" inputmode="numeric" pattern="[0-9]*" spellcheck="false" autocomplete="off" placeholder="6-digit code" />
                <button type="button" class="mc-btn mc-btn--primary mc-btn--small" data-action="add-friend">Add</button>
              </div>
            </div>
            <p class="friends-toast" hidden></p>
            <div class="friends-requests mc-list" hidden></div>
            <p class="mc-section-title friends-section-title">Friends list</p>
            <div class="friends-list mc-list"></div>
            <div class="friends-tips mc-tips">
              <p class="friends-tips-title mc-section-title">Quick tips</p>
              <ul>
                <li>Share your code so friends can add you</li>
                <li>Tap a friend to open their profile</li>
                <li>Join when they are in a world</li>
                <li>Set your name under Character</li>
              </ul>
            </div>
          </div>
          <div class="friend-profile-modal" hidden>
            <div class="friend-profile-modal-inner menu-glass-window">
              <button type="button" class="panel-back" data-action="close-friend-profile">BACK</button>
              <div class="friend-profile-modal-body"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="menu-stage panel profile-panel blocky world-panel" data-panel="world" hidden>
        <header class="profile-topbar mc-topbar">
          <button type="button" class="panel-back" data-action="world-back">BACK</button>
          <h2 class="panel-title world-panel-title">WORLDS</h2>
          <span class="mc-topbar-spacer" aria-hidden="true"></span>
        </header>
        <div class="world-shell mc-shell">
          <div class="world-view" data-world-view="list">
            <div class="mc-list world-select-list" role="listbox" aria-label="Saved worlds"></div>
            <p class="mc-empty world-select-empty" hidden>No worlds yet. Create a new world to start exploring.</p>
            <div class="mc-action-bar world-select-actions">
              <button type="button" class="mc-btn mc-btn--primary" data-action="play-selected-world" disabled>Play Selected World</button>
              <div class="mc-action-bar__row">
                <button type="button" class="mc-btn" data-action="show-create-world">Create New World</button>
                <button type="button" class="mc-btn mc-btn--danger" data-action="delete-selected-world" disabled>Delete</button>
              </div>
            </div>
          </div>
          <div class="world-view" data-world-view="create" hidden>
            <div class="world-card block-card mc-block">
              <label class="field field-tight">
                <span>World name</span>
                <input type="text" class="world-name-input mc-input" maxlength="24" spellcheck="false" autocomplete="off" placeholder="Optional" />
              </label>
              <p class="world-preview-name">Misty Reach</p>
              <p class="world-preview-tag">Rolling hills and open sky.</p>
              <label class="field field-tight">
                <span>World seed</span>
                <div class="seed-row">
                  <input type="text" class="world-seed-input mc-input" maxlength="24" spellcheck="false" autocomplete="off" />
                  <button type="button" class="mc-btn mc-btn--small" data-action="random-world" title="New seed">↻</button>
                </div>
              </label>
              <p class="world-seed-note">Your seed defines the terrain. Friends can request to join when you are in this world.</p>

              <div class="world-share-row">
                <span class="world-option-label">Share link</span>
                <code class="world-share-url"></code>
                <button type="button" class="mc-btn mc-btn--small" data-action="copy-world-link">Copy link</button>
                <p class="world-share-toast" hidden>Link copied — send to friends</p>
              </div>

              <div class="world-settings-card block-card">
                <p class="mc-section-title">World options</p>

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
                  <span>Render distance <em class="world-dist-val">7</em></span>
                  <input type="range" class="world-dist-range" min="3" max="8" step="1" value="7" />
                </label>
              </div>

              <div class="world-actions mc-action-bar">
                <button type="button" class="mc-btn mc-btn--primary" data-action="create-world">Create New World</button>
                <button type="button" class="mc-btn" data-action="cancel-create-world">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.worldSeedInput = this.root.querySelector('.world-seed-input')!;
    const atmosphere = this.root.querySelector('.menu-atmosphere');
    if (atmosphere) {
      this.menuSky.mount(atmosphere as HTMLElement);
    }

    if (this.social) {
      this.friendsPanel = new FriendsPanel(this.root, this.social);
    }

    this.root.querySelector('[data-action="play"]')!.addEventListener('click', () => this.openWorldPanel());
    this.root.querySelector('[data-action="settings"]')!.addEventListener('click', () =>
      this.showPanel('settings'),
    );
    this.root.querySelectorAll('[data-action="customize"]').forEach((el) => {
      el.addEventListener('click', () => this.showPanel('customize'));
    });
    this.root.querySelector('[data-action="mod"]')!.addEventListener('click', () => this.showPanel('mod'));
    this.root.querySelector('[data-action="copy-play-link"]')?.addEventListener('click', () => {
      void this.copyPlayLink();
    });
    this.root.querySelectorAll('[data-action="multiplayer"]').forEach((el) => {
      el.addEventListener('click', () => this.openMultiplayerPanel());
    });
    this.root.querySelectorAll('[data-action="home"]').forEach((el) => {
      el.addEventListener('click', () => this.showPanel('home'));
    });
    this.root.querySelector('[data-action="world-back"]')?.addEventListener('click', () => {
      if (this.worldView === 'create') this.setWorldView('list');
      else this.showPanel('home');
    });
    this.root.querySelector('[data-action="show-create-world"]')?.addEventListener('click', () => {
      this.worldSeedInput.value = randomSeed();
      this.syncWorldUi();
      this.setWorldView('create');
    });
    this.root.querySelector('[data-action="cancel-create-world"]')?.addEventListener('click', () =>
      this.setWorldView('list'),
    );
    this.root.querySelector('[data-action="play-selected-world"]')?.addEventListener('click', () =>
      this.playSelectedWorld(),
    );
    this.root.querySelector('[data-action="delete-selected-world"]')?.addEventListener('click', () =>
      this.deleteSelectedWorld(),
    );
    this.root.querySelectorAll('[data-action="create-world"]').forEach((el) => {
      el.addEventListener('click', () => this.emitCreateWorld());
    });
    this.root.querySelector('[data-action="random-world"]')!.addEventListener('click', () => {
      this.worldSeedInput.value = randomSeed();
      this.syncWorldUi();
      this.worldSeedInput.focus();
    });
    this.root.querySelector('[data-action="save-settings"]')!.addEventListener('click', () => {
      this.collectSettingsFromUi();
      saveSettings(this.settings);
      this.emitPrefs();
      this.showPanel('home');
    });
    this.root.querySelector('[data-action="edit-hud"]')!.addEventListener('click', () => {
      if (!this.hasSession) return;
      this.onAction?.({ type: 'edit-hud' });
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
      this.previewPresetId = CUSTOM_PRESET_ID;
      this.profile = randomizeProfile(name);
      this.ensureSkinEditor();
      this.skinEditor?.randomize(this.profile);
      this.syncSkinFromEditor();
      this.updateCharacterMeta(this.profile.name, 'Random look');
      this.markActivePreset();
    });
    this.root.querySelector('[data-action="wardrobe-save"]')?.addEventListener('click', () => {
      this.collectProfileFromUi();
      saveWardrobeSlot(this.profile, this.profile.name);
      this.renderWardrobe();
    });

    this.bindSettingsUi();
    this.bindWorldUi();
    this.worldSeedInput.addEventListener('input', () => this.syncWorldUi());
    this.worldSeedInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.emitCreateWorld();
    });

    this.bindProfileUi();
    this.bindSkinUploadUi();
    this.fillPresetGrid();
    this.renderWardrobe();
    this.syncSettingsUi();
    this.syncProfileUi();
    this.ensureHomePreview();
    this.syncHomePreview();
  }

  on(handler: (action: MenuAction) => void): void {
    this.onAction = handler;
  }

  /** Re-push profile/skin into a live Game (e.g. right after world create). */
  pushPrefs(): void {
    this.emitPrefs();
  }

  hide(): void {
    this.heroPreview?.stop();
    this.homePreview?.stop();
    this.skinEditor?.setActive(false);
    this.modWorkshop?.stop();
    this.menuSky.stop();
    this.root.hidden = true;
  }

  show(opts?: { resumable?: boolean }): void {
    this.hasSession = opts?.resumable ?? this.hasSession;
    this.root.hidden = false;
    this.showPanel('home');
    requestAnimationFrame(() => this.menuSky.start());
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  

  private syncPlayLink(): void {
    const url = publicPlayUrl();
    const link = this.root.querySelector<HTMLAnchorElement>('.menu-play-link');
    if (!link) return;
    link.href = url;
    link.textContent = url;
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

  private setWorldView(view: 'list' | 'create'): void {
    this.worldView = view;
    this.root.querySelectorAll<HTMLElement>('[data-world-view]').forEach((el) => {
      el.hidden = el.dataset.worldView !== view;
    });
    const title = this.root.querySelector('.world-panel-title');
    if (title) title.textContent = view === 'create' ? 'Create New World' : 'Select World';
    if (view === 'list') this.renderWorldList();
  }

  private renderWorldList(): void {
    const listEl = this.root.querySelector('.world-select-list');
    const emptyEl = this.root.querySelector<HTMLElement>('.world-select-empty');
    const playBtn = this.root.querySelector<HTMLButtonElement>('[data-action="play-selected-world"]');
    const deleteBtn = this.root.querySelector<HTMLButtonElement>('[data-action="delete-selected-world"]');
    if (!listEl || !emptyEl || !playBtn || !deleteBtn) return;

    const worlds = listSavedWorlds();
    if (
      this.selectedWorldSeed &&
      !worlds.some((w) => w.seed === this.selectedWorldSeed)
    ) {
      this.selectedWorldSeed = worlds[0]?.seed ?? null;
    }
    if (!this.selectedWorldSeed && worlds.length) {
      this.selectedWorldSeed = worlds[0]!.seed;
    }

    emptyEl.hidden = worlds.length > 0;
    listEl.innerHTML = worlds
      .map((w) => {
        const name = w.settings.name.trim() || worldNameFromSeed(w.seed);
        const tag = worldTagFromSeed(w.seed);
        const selected = w.seed === this.selectedWorldSeed;
        return `
          <button type="button"
            class="mc-row world-select-row${selected ? ' is-selected' : ''}"
            role="option"
            aria-selected="${selected ? 'true' : 'false'}"
            data-action="select-world"
            data-seed="${escapeAttr(w.seed)}">
            <span class="mc-row-text">
              <strong>${escapeHtml(name)}</strong>
              <em>Seed: ${escapeHtml(w.seed)} · ${escapeHtml(w.settings.terrain)} · ${escapeHtml(tag)}</em>
            </span>
          </button>
        `;
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

    const hasSelection = Boolean(this.selectedWorldSeed);
    playBtn.disabled = !hasSelection;
    deleteBtn.disabled = !hasSelection;
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

  private syncMultiplayerUi(): void {
    this.friendsPanel?.refresh();
  }

  private syncWorldPreview(): void {
    const seed = this.worldSeedInput.value.trim() || randomSeed();
    const nameInput = this.root.querySelector<HTMLInputElement>('.world-name-input')!;
    const displayName = nameInput.value.trim() || worldNameFromSeed(seed);
    const nameEl = this.root.querySelector('.world-preview-name');
    const tagEl = this.root.querySelector('.world-preview-tag');
    if (nameEl) nameEl.textContent = displayName;
    if (tagEl) tagEl.textContent = worldTagFromSeed(seed);
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

    this.root.querySelectorAll<HTMLButtonElement>('.world-caves-seg [data-caves]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.worldSettings.caves = btn.dataset.caves === '1';
        this.syncWorldSegs();
        this.syncWorldShareLink();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>('.world-structures-seg [data-structures]').forEach(
      (btn) => {
        btn.addEventListener('click', () => {
          this.worldSettings.structures = btn.dataset.structures === '1';
          this.syncWorldSegs();
          this.syncWorldShareLink();
        });
      },
    );

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
    if (panel === 'home') this.menuSky.start();
    else this.menuSky.stop();

    this.root.querySelectorAll<HTMLElement>('.menu-stage').forEach((el) => {
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
      this.modWorkshop?.stop();
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
      this.syncPlayLink();
      this.ensureModWorkshop();
      requestAnimationFrame(() => {
        this.modWorkshop?.start();
        this.modWorkshop?.layout();
      });
    } else if (panel === 'multiplayer') {
      this.syncMultiplayerUi();
      this.homePreview?.stop();
      this.heroPreview?.stop();
      this.skinEditor?.setActive(false);
    } else {
      this.homePreview?.stop();
      this.heroPreview?.stop();
      this.skinEditor?.setActive(false);
      this.modWorkshop?.stop();
    }
  }

  private ensureModWorkshop(): void {
    if (this.modWorkshop) return;
    const mount = this.root.querySelector('.mod-workshop-mount');
    if (!mount) return;
    try {
      this.modMaterials = new TerrainMaterials();
      this.modWorkshop = new VoxelEditorUi(this.modMaterials);
      this.modWorkshop.mount(mount as HTMLElement);
      const header = this.root.querySelector('.mod-panel-header');
      if (header) this.modWorkshop.bindHeaderActions(header as HTMLElement);
    } catch (err) {
      console.error('[mod-workshop]', err);
      mount.textContent =
        err instanceof Error ? `Mod editor failed to load: ${err.message}` : 'Mod editor failed to load';
    }
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
    const mount = this.root.querySelector('.menu-home-player-viewport');
    if (!mount) return;
    this.homePreview = new ProfilePreview3D({
      transparent: true,
      interactive: true,
      autoSpin: false,
      className: 'profile-hero-3d menu-home-player-3d',
    });
    this.homePreview.mount(mount as HTMLElement);
    this.homePreview.applyProfile(this.profile);
    this.homePreview.setPose('idle');
  }

  private syncHomePlayerName(): void {
    const el = this.root.querySelector('.menu-home-player-name');
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
    const stage = this.root.querySelector('.profile-stage');
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
      void importSkinFromFile(file)
        .then(apply)
        .catch(() => undefined);
    });

    if (!stage) return;

    const onDragOver = (e: Event): void => {
      e.preventDefault();
      stage.classList.add('skin-upload-drag');
    };
    const onDragLeave = (): void => stage.classList.remove('skin-upload-drag');
    const onDrop = (e: Event): void => {
      e.preventDefault();
      stage.classList.remove('skin-upload-drag');
      const file = (e as DragEvent).dataTransfer?.files?.[0];
      if (!file) return;
      void importSkinFromFile(file)
        .then(apply)
        .catch(() => undefined);
    };

    stage.addEventListener('dragover', onDragOver);
    stage.addEventListener('dragleave', onDragLeave);
    stage.addEventListener('drop', onDrop);
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
      grid.innerHTML = `<p class="profile-preset-hint">No saved looks yet.</p>`;
      return;
    }
    grid.innerHTML = slots
      .map(
        (s) => `
      <div class="wardrobe-card" data-wardrobe="${escapeAttr(s.id)}">
        <button type="button" class="wardrobe-load" data-wardrobe-load="${escapeAttr(s.id)}">
          <span class="wardrobe-name">${escapeHtml(s.name)}</span>
          <span class="wardrobe-date">${new Date(s.savedAt).toLocaleDateString()}</span>
        </button>
        <button type="button" class="wardrobe-del" data-wardrobe-del="${escapeAttr(s.id)}" title="Delete">×</button>
      </div>`,
      )
      .join('');
    grid.querySelectorAll<HTMLButtonElement>('[data-wardrobe-load]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.wardrobeLoad!;
        const slot = loadWardrobe().find((s) => s.id === id);
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
    this.root.querySelectorAll<HTMLButtonElement>('.menu-stage[data-panel="settings"] [data-view]').forEach((btn) => {
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
    this.syncViewSeg();
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

  private syncViewSeg(): void {
    this.root.querySelectorAll<HTMLButtonElement>('.menu-stage[data-panel="settings"] [data-view]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === this.settings.viewMode);
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

    this.root.querySelectorAll<HTMLButtonElement>('[data-backpack]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.clearActivePreset();
        this.profile.backpack = btn.dataset.backpack as BackpackStyle;
        this.syncProfileUi();
        this.skinEditor?.syncAvatarProfile(this.profile);
        this.emitPrefs();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-belt]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.clearActivePreset();
        this.profile.belt = btn.dataset.belt as BeltStyle;
        this.syncProfileUi();
        this.skinEditor?.syncAvatarProfile(this.profile);
        this.emitPrefs();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-pose]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pose = btn.dataset.pose as 'idle' | 'walk' | 'sneak' | 'sit';
        this.heroPreview?.setPose(pose);
        this.root.querySelectorAll<HTMLButtonElement>('[data-pose]').forEach((b) => {
          b.classList.toggle('active', b.dataset.pose === pose);
        });
      });
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-snap-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.snapView as 'front' | 'side' | 'back';
        this.heroPreview?.snapView(view);
        this.root.querySelectorAll<HTMLButtonElement>('[data-snap-view]').forEach((b) => {
          b.classList.toggle('active', b.dataset.snapView === view);
        });
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
    this.root.querySelectorAll<HTMLButtonElement>('[data-backpack]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.backpack === this.profile.backpack);
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-belt]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.belt === this.profile.belt);
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
