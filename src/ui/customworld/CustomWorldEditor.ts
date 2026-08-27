/**
 * VYTHERA Custom World editor.
 *
 * The descendant of the Terrain Resolution Lab: the same bounded preview
 * region, camera presets and resolution comparison, now driven by an editable
 * world style that players can save, share and create worlds from.
 *
 * Preview generation is bounded (PREVIEW_BLOCKS square), debounced and
 * cancellable, so dragging a slider never queues up overlapping builds.
 */
import * as THREE from 'three';
import { TerrainField } from '../../world/preview/TerrainField';
import { TerrainView } from '../../world/preview/TerrainView';
import {
  CameraControls,
  buildPoses,
  findRegion,
  type Pose,
  type RegionInfo,
  type ViewName,
} from '../../world/preview/CameraRig';
import {
  cloneStyle,
  createDefaultStyle,
  writeParam,
  type LandscapeStyle,
  type LockState,
  type ParamSpec,
  type StyleGroup,
  type TerrainResolution,
  type VytheraWorldStyle,
} from '../../world/style/WorldStyle';
import { tuningFromStyle } from '../../world/style/styleTuning';
import { SKY_STYLE_TIME } from '../../world/preview/atmosphere';
import { scopeForGroup, widestScope, type RebuildScope } from './rebuildScope';
import {
  applyLandscapePreset,
  applyVegetationPreset,
  randomSeed,
  randomizeStyle,
} from '../../world/style/stylePresets';
import {
  ensureDefaultStyle,
  exportStyleToFile,
  saveStyle,
  setThumbnail,
} from '../../world/style/StyleStore';
import { MapView } from './MapView';
import { StyleHistory } from './StyleHistory';
import { StyleLibrary } from './StyleLibrary';
import { StylePanel, type PreviewView } from './StylePanel';
import { loadWorldSettings, saveWorldSettings } from '../worldSettings';
import { saveLastWorld } from '../worldNames';
import './customworld.css';

/** Bounded preview area in world blocks — enough to judge the landscape. */
const PREVIEW_BLOCKS = 512;
/** Slider drags settle before an expensive rebuild starts. */
const REBUILD_DELAY_MS = 280;

/** Hour each sky preset implies, so picking "Dusk" actually looks like dusk. */
const SKY_PRESET_TIME = SKY_STYLE_TIME;

export class CustomWorldEditor {
  readonly root = document.createElement('div');

  private stage = document.createElement('div');
  private status = document.createElement('div');
  private notices = document.createElement('div');

  private view = new TerrainView('vy-cw__canvas');
  private map = new MapView();
  private camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 4000);
  private controls: CameraControls;

  private history: StyleHistory;
  private panel: StylePanel;
  private library: StyleLibrary;

  private locks: LockState = {
    terrain: false,
    water: false,
    biome: false,
    vegetation: false,
    atmosphere: false,
  };

  private previewView: PreviewView = 'panorama';
  private field: TerrainField | null = null;
  private region: RegionInfo | null = null;
  private poses: Record<ViewName, Pose> | null = null;

  private rebuildTimer = 0;
  private buildToken = { cancelled: false };
  private disposed = false;
  /**
   * Heaviest scope requested since the last rebuild ran. Starts at the
   * cheapest: the initial build is kicked off directly by mount(), so nothing
   * is pending until the player edits something.
   */
  private pendingScope: RebuildScope = 'sky';

  constructor(initial?: VytheraWorldStyle) {
    const style = initial ?? ensureDefaultStyle();
    this.history = new StyleHistory(style);

    this.root.className = 'vy-cw';
    this.stage.className = 'vy-cw__stage';
    this.status.className = 'vy-cw__status';
    this.notices.className = 'vy-cw__notices';

    this.controls = new CameraControls(this.camera, this.view.canvas, () => undefined);

    this.panel = new StylePanel(style, this.locks, {
      onParam: (spec, value) => this.editParam(spec, value),
      onResolution: (r) => this.setResolution(r),
      onLandscape: (id) => this.setLandscape(id),
      onVegetationPreset: (id) =>
        this.commit(applyVegetationPreset(this.style, id), 'veg-preset', 'vegetation'),
      onSky: (id) => this.setAtmosphere('skyStyle', id),
      onCloud: (id) => this.setAtmosphere('cloudStyle', id),
      onWeather: (id) => this.setAtmosphere('weather', id),
      onSeed: (seed) => this.setSeed(seed),
      onRandomSeed: () => this.setSeed(randomSeed()),
      onLockToggle: (group, locked) => this.setLock(group, locked),
      onMode: () => undefined,
      onView: (view) => this.setView(view),
    });

    this.library = new StyleLibrary({
      onOpen: (s) => this.load(s),
      onNotice: (message, kind) => this.notify(message, kind),
    });

    this.stage.append(this.view.canvas, this.map.canvas, this.status);
    const center = document.createElement('div');
    center.className = 'vy-cw__center';
    center.append(this.stage, this.actionBar(), this.notices);

    this.root.append(this.panel.root, center, this.library.root);
    this.library.setActive(style.id);
  }

  private get style(): VytheraWorldStyle {
    return this.history.style;
  }

  async mount(host: HTMLElement): Promise<void> {
    host.append(this.root);
    window.addEventListener('resize', this.onResize);
    this.onResize();
    this.loop();
    await this.rebuild(true);
  }

  dispose(): void {
    this.disposed = true;
    this.buildToken.cancelled = true;
    window.removeEventListener('resize', this.onResize);
    this.controls.dispose();
    this.view.renderer.dispose();
  }

  // --- Editing ---

  private commit(next: VytheraWorldStyle, tag: string, scope: RebuildScope = 'terrain'): void {
    this.history.push(next, tag);
    this.syncUi();
    this.scheduleRebuild(scope);
  }

  private editParam(spec: ParamSpec, value: number): void {
    // Slider drags coalesce into one undo entry via the shared tag, and the
    // panel is synced without re-rendering so the dragged control survives.
    this.history.push(writeParam(this.style, spec, value), `${spec.group}.${spec.key}`);
    this.panel.sync(this.style);
    this.scheduleRebuild(scopeForGroup(spec.group));
  }

  private setResolution(r: TerrainResolution): void {
    const next = cloneStyle(this.style);
    next.terrainVoxelSize = r;
    this.commit(next, 'resolution');
  }

  private setLandscape(id: LandscapeStyle): void {
    this.commit(applyLandscapePreset(this.style, id, this.locks), 'landscape');
  }

  private setAtmosphere(key: 'skyStyle' | 'cloudStyle' | 'weather', value: string): void {
    const next = cloneStyle(this.style);
    (next.atmosphere as unknown as Record<string, string>)[key] = value;
    // A sky preset also sets the hour, so the time slider follows the choice.
    if (key === 'skyStyle') {
      const preset = SKY_PRESET_TIME[value];
      if (preset !== undefined) next.atmosphere.timeOfDay = preset;
    }
    this.commit(next, `atmosphere.${key}`, 'sky');
  }

  private setSeed(seed: string): void {
    const next = cloneStyle(this.style);
    next.seed = seed.trim().slice(0, 64) || 'vythera';
    this.commit(next, 'seed');
  }

  private setLock(group: StyleGroup, locked: boolean): void {
    this.locks[group] = locked;
    this.syncUi();
  }

  private setView(view: PreviewView): void {
    this.previewView = view;
    const isMap = view === 'map';
    this.stage.classList.toggle('is-map', isMap);
    if (isMap) this.renderMap();
    else if (this.poses) this.applyPose(this.poses[view as ViewName]);
  }

  private syncUi(): void {
    this.panel.update(this.style, this.locks);
  }

  // --- Preview ---

  private scheduleRebuild(scope: RebuildScope = 'terrain'): void {
    this.pendingScope = widestScope(this.pendingScope, scope);

    // Atmosphere is cheap enough to apply on the spot, so the sky tracks the
    // slider live instead of waiting for the debounce.
    if (this.pendingScope === 'sky') {
      this.view.applyAtmosphere(this.style);
      this.setStatus('Updating atmosphere');
    }

    window.clearTimeout(this.rebuildTimer);
    this.rebuildTimer = window.setTimeout(() => {
      const scoped = this.pendingScope;
      this.pendingScope = 'sky';
      void this.rebuild(false, scoped);
    }, REBUILD_DELAY_MS);
  }

  private setStatus(text: string): void {
    this.status.textContent = text;
  }

  /**
   * Regenerate the bounded preview. `relocate` re-scans for a scenic region,
   * which is only needed when the seed or landform changes the world outright;
   * otherwise the camera stays put so parameter edits are directly comparable.
   *
   * `scope` decides how much is thrown away: sky-only edits never touch
   * geometry, and vegetation edits reuse the terrain mesh already on screen.
   */
  private async rebuild(relocate: boolean, scope: RebuildScope = 'terrain'): Promise<void> {
    if (this.disposed) return;
    this.buildToken.cancelled = true;
    const token = { cancelled: false };
    this.buildToken = token;

    const style = cloneStyle(this.style);

    // Atmosphere always re-applies: it is a handful of uniforms.
    this.view.applyAtmosphere(style);

    if (scope === 'sky') {
      // Nothing was regenerated, so keep reporting what is actually on screen
      // rather than replacing real figures with a bare "Ready".
      this.setStatus(this.summary());
      return;
    }

    // The field is rebuilt for both terrain and vegetation edits because it
    // carries the plant densities as well as the landform. Constructing one is
    // cheap — it only creates samplers — and the expensive terrain remesh below
    // is still skipped unless the landform itself changed.
    const field = new TerrainField(style.seed, 'balanced', tuningFromStyle(style));
    this.field = field;

    if (relocate || !this.region) this.region = findRegion(field, PREVIEW_BLOCKS);
    this.poses = buildPoses(field, this.region, PREVIEW_BLOCKS);

    if (this.previewView === 'map') {
      this.renderMap();
      this.setStatus('Ready');
      return;
    }

    const pose = this.poses[this.previewView as ViewName];
    this.applyPose(pose);

    if (scope === 'terrain') {
      this.setStatus('Building terrain');
      const metrics = await this.view.build(
        field,
        this.region.origin,
        PREVIEW_BLOCKS,
        style.terrainVoxelSize,
        pose.eye,
        (done, total) => {
          if (!token.cancelled) this.setStatus(`Building terrain ${done}/${total}`);
        },
        token,
      );
      if (token.cancelled || this.disposed || !metrics) return;

      this.setStatus('Updating water');
      this.view.setSeaLevel(this.region.origin, PREVIEW_BLOCKS, field.seaLevel);
    }

    this.setStatus('Placing vegetation');
    const veg = await this.view.rebuildVegetation(
      field,
      this.region.origin,
      PREVIEW_BLOCKS,
      pose.eye,
      (done, total) => {
        if (!token.cancelled) this.setStatus(`Placing vegetation ${done}/${total}`);
      },
      token,
    );
    if (token.cancelled || this.disposed) return;

    if (!veg) return;
    this.setStatus(this.summary());
    this.renderMap();
  }

  /** Honest one-line readout of what was actually built. */
  private summary(): string {
    const m = this.view.metrics;
    const v = this.view.vegetationMetrics;
    const parts: string[] = [];
    if (m) {
      parts.push(`${m.triangles.toLocaleString()} triangles`);
      parts.push(`terrain ${(m.genMs + m.meshMs).toFixed(0)} ms`);
    }
    parts.push(`${v.total.toLocaleString()} plants`);
    parts.push(`vegetation ${(v.placeMs + v.buildMs).toFixed(0)} ms`);
    return `Ready · ${parts.join(' · ')}`;
  }

  private renderMap(): void {
    if (!this.field || !this.region) return;
    this.map.render(this.field, this.region.origin, PREVIEW_BLOCKS, this.style);
  }

  private applyPose(pose: Pose): void {
    this.controls.applyPose(pose);
  }

  private onResize = (): void => {
    const rect = this.stage.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    this.view.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  private lastFrame = performance.now();

  private loop = (): void => {
    if (this.disposed) return;
    requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (this.previewView === 'map') return;
    this.controls.update(dt);
    this.view.tick(dt, this.camera.position);
    this.view.render(this.camera);
  };

  // --- Actions ---

  private actionBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'vy-cw__actions';

    const undo = action('Undo', () => {
      const style = this.history.undo();
      if (style) {
        this.syncUi();
        this.scheduleRebuild();
      }
    });
    const redo = action('Redo', () => {
      const style = this.history.redo();
      if (style) {
        this.syncUi();
        this.scheduleRebuild();
      }
    });

    bar.append(
      undo,
      redo,
      action('Randomize style', () => {
        this.history.push(randomizeStyle(this.style, this.locks), 'randomize');
        this.syncUi();
        void this.rebuild(true);
      }),
      action('Save style', () => this.save()),
      action('Export', () => exportStyleToFile(this.style)),
      action('Create world with this style', () => this.createWorld(), 'primary'),
    );
    return bar;
  }

  private save(): void {
    const name = prompt('Name this world style', this.style.name);
    if (name === null) return;
    const next = cloneStyle(this.style);
    next.name = name.trim().slice(0, 60) || next.name;
    const saved = saveStyle(next);
    this.history.replace(saved);

    const thumb = this.captureThumbnail() ?? this.map.toThumbnail();
    if (thumb) setThumbnail(saved.id, thumb);

    this.library.refresh();
    this.library.setActive(saved.id);
    this.syncUi();
    this.notify(`Saved "${saved.name}".`, 'info');
  }

  /**
   * Grab the live 3D preview for the style library, so a saved style is
   * recognisable by its landscape, forest, water and sky rather than by a bare
   * heightfield. Falls back to the map when the 3D view has nothing drawn yet.
   */
  private captureThumbnail(): string | null {
    if (this.previewView === 'map' || !this.view.metrics) return null;
    try {
      this.view.render(this.camera);
      const source = this.view.canvas;
      const w = 320;
      const h = Math.max(1, Math.round((source.height / source.width) * w));
      const scaled = document.createElement('canvas');
      scaled.width = w;
      scaled.height = h;
      const ctx = scaled.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(source, 0, 0, w, h);
      return scaled.toDataURL('image/jpeg', 0.7);
    } catch {
      return null;
    }
  }

  private load(style: VytheraWorldStyle): void {
    this.history.reset(cloneStyle(style));
    this.library.setActive(style.id);
    this.syncUi();
    void this.rebuild(true);
  }

  /**
   * Copy the style into a brand-new world's settings. Existing worlds are never
   * touched: a seed that already has settings gets a fresh suffixed seed so a
   * saved world cannot silently change shape underneath the player.
   */
  private createWorld(): void {
    const style = cloneStyle(this.style);
    let seed = style.seed;
    const existing = loadWorldSettings(seed);
    if (existing.style || existing.name) {
      seed = `${style.seed}-${randomSeed()}`;
      this.notify(`A world already used that seed, so the new world uses "${seed}".`, 'info');
    }

    saveWorldSettings(seed, {
      ...loadWorldSettings(seed),
      name: style.name.slice(0, 24),
      style,
    });
    saveLastWorld(seed);
    this.notify(`World "${style.name}" is ready. Start it from the main menu.`, 'info');
  }

  private notify(message: string, kind: 'info' | 'error'): void {
    const line = document.createElement('p');
    line.className = kind === 'error' ? 'vy-cw__notice vy-cw__notice--bad' : 'vy-cw__notice';
    line.textContent = message;
    this.notices.prepend(line);
    while (this.notices.childElementCount > 4) this.notices.lastElementChild?.remove();
    window.setTimeout(() => line.remove(), 8000);
  }
}

function action(text: string, onClick: () => void, variant = ''): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = text;
  if (variant) btn.classList.add(`is-${variant}`);
  btn.onclick = onClick;
  return btn;
}

export function createDefaultCustomStyle(): VytheraWorldStyle {
  return createDefaultStyle();
}
