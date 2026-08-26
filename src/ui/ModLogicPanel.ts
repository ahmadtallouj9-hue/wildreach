import type { ProjectAction } from '../modding/ModProjectPlanner';
import { interpretModScripts, TRIGGER_META } from '../modding/ModAiInterpreter';
import { ModCommandBinder } from '../modding/ModCommandBinder';
import type { ModTrigger } from '../modding/ModLogicParser';
import type { ParticleStyle } from '../modding/ModStudioAi';
import { ProfilePreview3D } from './ProfilePreview3D';
import { loadProfile } from './prefs';
import { decodeSkin } from '../player/SkinAtlas';

/** Character skin preview + workshop behavior tests (AI lives in AI Studio). */
export class ModLogicPanel {
  readonly root: HTMLElement;
  private readonly validationEl: HTMLElement;
  private readonly skinHost: HTMLElement;
  private skinPreview: ProfilePreview3D | null = null;
  private onChange: (scripts: string[]) => void;
  private onNotify: (msg: string) => void;
  private onStudioAi: ((actions: ProjectAction[]) => void) | null;
  private binder = new ModCommandBinder();
  private modName = 'Untitled';
  private lines: string[] = [];

  constructor(
    onChange: (scripts: string[]) => void,
    onNotify: (msg: string) => void,
    onStudioAi?: (actions: ProjectAction[]) => void,
  ) {
    this.onChange = onChange;
    this.onNotify = onNotify;
    this.onStudioAi = onStudioAi ?? null;

    this.root = document.createElement('aside');
    this.root.className = 'mod-logic-panel mod-studio-logic-docked';
    this.root.hidden = false;
    this.root.innerHTML = `
      <header class="mod-ai-header">
        <div class="mod-ai-brand">
          <span class="mod-ai-orb" aria-hidden="true">✦</span>
          <div>
            <p class="voxel-editor-label mod-ai-title">Character</p>
            <p class="mod-ai-subtitle">Skin preview + behavior tests</p>
          </div>
        </div>
      </header>
      <section class="mod-char-skin">
        <div class="mod-char-skin-preview" aria-label="Player skin preview"></div>
        <div class="mod-char-skin-meta">
          <p class="mod-char-skin-name">Wanderer</p>
          <p class="mod-char-skin-hint">Same skin as the SKIN menu. Press Add my skin character on the left to place it in the grid. Open AI Studio from the main menu for chat, vision, and training.</p>
          <button type="button" class="voxel-editor-btn mod-char-skin-refresh">Refresh skin</button>
        </div>
      </section>
      <div class="mod-ai-chat" aria-live="polite" hidden></div>
      <p class="mod-logic-validation" aria-live="polite"></p>
      <p class="voxel-editor-label mod-ai-section-label">Test in workshop</p>
      <div class="mod-logic-test"></div>
      <button type="button" class="voxel-editor-btn mod-ai-run-all">▶ Run all behaviors</button>`;

    this.validationEl = this.root.querySelector('.mod-logic-validation') as HTMLElement;
    this.skinHost = this.root.querySelector('.mod-char-skin-preview') as HTMLElement;


    this.buildTestButtons();
    this.commit(false);

    this.root.querySelector('.mod-ai-run-all')!.addEventListener('click', () => this.runAll());
    this.root.querySelector('.mod-char-skin-refresh')!.addEventListener('click', () => {
      this.refreshPlayerSkin();
      this.onNotify('Skin refreshed from profile');
    });
  }

  /** Show/hide + sync the live player skin preview. */
  setActive(on: boolean): void {
    this.root.classList.toggle('is-active', on);
    this.root.hidden = false;
    if (on) {
      this.ensureSkinPreview();
      this.refreshPlayerSkin();
      this.skinPreview?.start();
      requestAnimationFrame(() => this.skinPreview?.layout());
    } else {
      this.skinPreview?.stop();
    }
  }

  private ensureSkinPreview(): void {
    if (this.skinPreview) return;
    this.skinPreview = new ProfilePreview3D({
      className: 'mod-char-skin-3d',
      interactive: true,
      autoSpin: true,
    });
    this.skinHost.appendChild(this.skinPreview.root);
  }

  refreshPlayerSkin(): void {
    const profile = loadProfile();
    const nameEl = this.root.querySelector('.mod-char-skin-name');
    if (nameEl) nameEl.textContent = profile.name || 'Wanderer';
    this.ensureSkinPreview();
    this.skinPreview?.applyProfile(profile);
    if (profile.skinData) {
      void decodeSkin(profile.skinData)
        .then((pixels) => this.skinPreview?.syncPixels(pixels))
        .catch(() => undefined);
    }
  }

  setModName(name: string): void {
    this.modName = name || 'Untitled';
  }


  setScripts(scripts: string[]): void {
    this.lines = scripts.length ? [...scripts] : [];
    this.commit(false);
  }

  getScripts(): string[] {
    return [...this.lines];
  }

  /** Append story / behavior lines from Project AI. */
  appendScripts(scripts: string[]): void {
    for (const s of scripts) {
      const t = s.trim();
      if (t) this.lines.push(t);
    }
    this.commit();
  }

  private buildTestButtons(): void {
    const host = this.root.querySelector('.mod-logic-test') as HTMLElement;
    const triggers: ModTrigger[] = ['on_click', 'on_use', 'on_spawn', 'on_tick', 'on_collision'];
    for (const t of triggers) {
      const meta = TRIGGER_META[t];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'voxel-editor-btn mod-ai-test-btn';
      btn.dataset.trigger = t;
      btn.innerHTML = `${meta.icon} ${meta.short}`;
      btn.addEventListener('click', () => this.testTrigger(t));
      host.appendChild(btn);
    }
  }

  private testTrigger(trigger: ModTrigger): void {
    const meta = TRIGGER_META[trigger];
    const n = this.binder.dispatch(trigger, {
      modName: this.modName,
      notify: (m) => this.onNotify(m),
      spawnParticles: (style, color) =>
        this.onStudioAi?.([
          {
            kind: 'particles',
            style: asParticleStyle(style),
            color: colorRgb(color),
            summary: `${style} particles`,
          },
        ]),
    });
    if (!n) this.onNotify(`No ${meta.short.toLowerCase()} behaviors set.`);
  }

  private runAll(): void {
    const n = this.binder.dispatchAll({
      modName: this.modName,
      notify: (m) => this.onNotify(m),
      spawnParticles: (style, color) =>
        this.onStudioAi?.([
          {
            kind: 'particles',
            style: asParticleStyle(style),
            color: colorRgb(color),
            summary: `${style} particles`,
          },
        ]),
    });
    if (!n) this.onNotify('No behaviors loaded yet.');
  }

  private commit(notifyChange = true): void {
    const { errors, rules } = interpretModScripts(this.lines);
    this.validationEl.textContent = errors.length ? errors.join(' · ') : '';
    this.validationEl.classList.toggle('mod-logic-validation--error', errors.length > 0);
    if (notifyChange && !errors.length) this.onChange(this.getScripts());
    this.binder.loadRules(rules);
  }
}

function asParticleStyle(s: string): ParticleStyle {
  const allowed: ParticleStyle[] = ['sparkle', 'fire', 'smoke', 'magic', 'burst', 'trail', 'hearts', 'snow'];
  return (allowed.includes(s as ParticleStyle) ? s : 'sparkle') as ParticleStyle;
}

function colorRgb(name?: string): [number, number, number] {
  const map: Record<string, [number, number, number]> = {
    red: [0.86, 0.28, 0.28],
    blue: [0.28, 0.48, 0.86],
    green: [0.32, 0.72, 0.42],
    yellow: [0.95, 0.82, 0.28],
    orange: [0.92, 0.55, 0.22],
    purple: [0.58, 0.36, 0.82],
    pink: [0.9, 0.45, 0.68],
    cyan: [0.28, 0.82, 0.88],
    white: [0.94, 0.95, 0.97],
    black: [0.12, 0.13, 0.15],
    gold: [0.9, 0.74, 0.28],
    teal: [0.22, 0.72, 0.68],
  };
  return map[name ?? ''] ?? [0.95, 0.55, 0.2];
}
