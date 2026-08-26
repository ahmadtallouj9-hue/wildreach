import { VytheraAIStudio } from '../vythera_ai/ui/VytheraAIStudio';
import type { ProjectAction } from '../modding/ModProjectPlanner';
import type { VytheraEditorHost } from '../vythera_ai/host/VytheraEditorHost';
import {
  interpretModLine,
  interpretModScripts,
  ruleCardTitle,
  TRIGGER_META,
} from '../modding/ModAiInterpreter';
import { listModCommands, ModCommandBinder } from '../modding/ModCommandBinder';
import type { ModTrigger } from '../modding/ModLogicParser';
import { normalizeScriptLines } from '../modding/ModLogicParser';
import type { ParticleStyle } from '../modding/ModStudioAi';
import { ProfilePreview3D } from './ProfilePreview3D';
import { loadProfile } from './prefs';
import { decodeSkin } from '../player/SkinAtlas';

const DEFAULT_SCRIPT = `When I click, shoot a blue fireball
Glow when spawned`;

/** Character skin + Project AI co-builder + behavior list. */
export class ModLogicPanel {
  readonly root: HTMLElement;
  private readonly behaviorList: HTMLElement;
  private readonly validationEl: HTMLElement;
  private readonly ruleCountEl: HTMLElement;
  private readonly emptyState: HTMLElement;
  private readonly skinHost: HTMLElement;
  private readonly projectAi: VytheraAIStudio;
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
            <p class="mod-ai-subtitle">Preview + behaviors for your mod</p>
          </div>
        </div>
        <span class="mod-ai-rule-count">0 rules</span>
      </header>
      <section class="mod-char-skin">
        <div class="mod-char-skin-preview" aria-label="Player skin preview"></div>
        <div class="mod-char-skin-meta">
          <p class="mod-char-skin-name">Wanderer</p>
          <p class="mod-char-skin-hint">Same skin as the SKIN menu. Press Add my skin character on the left to place it in the 32³ grid.</p>
          <button type="button" class="voxel-editor-btn mod-char-skin-refresh">Refresh skin</button>
        </div>
      </section>
      <div class="mod-project-ai-slot"></div>
      <p class="voxel-editor-label mod-ai-section-label">Quick powers</p>
      <div class="mod-ai-powers"></div>
      <div class="mod-ai-list-head">
        <p class="voxel-editor-label">Behaviors</p>
        <button type="button" class="mod-ai-clear" title="Clear all">Clear</button>
      </div>
      <div class="mod-ai-empty">No behaviors yet — ask Project AI or tap a power.</div>
      <ul class="mod-ai-behaviors" aria-label="Mod behaviors"></ul>
      <div class="mod-ai-chat" aria-live="polite" hidden></div>
      <p class="mod-logic-validation" aria-live="polite"></p>
      <p class="voxel-editor-label mod-ai-section-label">Test in workshop</p>
      <div class="mod-logic-test"></div>
      <button type="button" class="voxel-editor-btn mod-ai-run-all">▶ Run all behaviors</button>`;

    this.behaviorList = this.root.querySelector('.mod-ai-behaviors') as HTMLElement;
    this.validationEl = this.root.querySelector('.mod-logic-validation') as HTMLElement;
    this.ruleCountEl = this.root.querySelector('.mod-ai-rule-count') as HTMLElement;
    this.emptyState = this.root.querySelector('.mod-ai-empty') as HTMLElement;
    this.skinHost = this.root.querySelector('.mod-char-skin-preview') as HTMLElement;

    this.projectAi = new VytheraAIStudio(
      (actions) => this.onStudioAi?.(actions as ProjectAction[]),
      (msg) => this.onNotify(msg),
    );
    this.root.querySelector('.mod-project-ai-slot')!.appendChild(this.projectAi.root);

    this.buildPowers();
    this.buildTestButtons();
    this.setScripts(normalizeScriptLines(DEFAULT_SCRIPT));

    this.root.querySelector('.mod-ai-clear')!.addEventListener('click', () => this.clearAll());
    this.root.querySelector('.mod-ai-run-all')!.addEventListener('click', () => this.runAll());
    this.root.querySelector('.mod-char-skin-refresh')!.addEventListener('click', () => {
      this.refreshPlayerSkin();
      this.onNotify('Skin refreshed from profile');
    });
  }

  /** Show/hide + sync the live player skin preview. */
  setActive(on: boolean): void {
    this.root.classList.toggle('is-active', on);
    // Docked panel visibility is controlled by the Character section; keep root visible for layout.
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

  /** Wire VYTHERA AI → viewport apply host. */
  setInferenceHost(getHost: () => VytheraEditorHost): void {
    this.projectAi.setInferenceHost(getHost);
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

  private buildPowers(): void {
    const host = this.root.querySelector('.mod-ai-powers') as HTMLElement;
    for (const cmd of listModCommands()) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mod-ai-power';
      btn.title = cmd.description;
      btn.innerHTML = `<span>${cmd.icon}</span><span>${cmd.label}</span>`;
      btn.addEventListener('click', () => {
        this.lines.push(cmd.quickPrompt);
        this.commit();
        this.onNotify(`Added: ${cmd.label}`);
      });
      host.appendChild(btn);
    }
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

  private clearAll(): void {
    if (!this.lines.length) return;
    this.lines = [];
    this.commit();
    this.onNotify('Cleared all behaviors.');
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
    if (!n) this.onNotify('Add behaviors first.');
  }

  private moveLine(index: number, dir: -1 | 1): void {
    const next = index + dir;
    if (next < 0 || next >= this.lines.length) return;
    [this.lines[index], this.lines[next]] = [this.lines[next]!, this.lines[index]!];
    this.commit();
  }

  private duplicateLine(index: number): void {
    this.lines.splice(index + 1, 0, this.lines[index]!);
    this.commit();
  }

  private removeLine(index: number, doCommit = true): void {
    this.lines.splice(index, 1);
    if (doCommit) this.commit();
    else this.renderBehaviors();
  }

  private renderBehaviors(): void {
    this.behaviorList.replaceChildren();
    this.emptyState.hidden = this.lines.length > 0;
    this.ruleCountEl.textContent = `${this.lines.length} rule${this.lines.length === 1 ? '' : 's'}`;

    this.lines.forEach((line, i) => {
      const { rule, summary } = interpretModLine(line);
      if (!rule) return;
      const meta = TRIGGER_META[rule.trigger];
      const li = document.createElement('li');
      li.className = 'mod-ai-behavior';
      li.innerHTML = `
        <div class="mod-ai-behavior-top">
          <span class="mod-ai-trigger-badge">${meta.icon} ${meta.short}</span>
          <span class="mod-ai-behavior-title">${escapeHtml(ruleCardTitle(rule))}</span>
        </div>
        <p class="mod-ai-behavior-text">“${escapeHtml(line)}”</p>
        ${summary ? `<p class="mod-ai-behavior-meta">${escapeHtml(summary)}</p>` : ''}
        <div class="mod-ai-behavior-actions">
          <button type="button" class="mod-ai-act" data-act="up" title="Move up">▲</button>
          <button type="button" class="mod-ai-act" data-act="down" title="Move down">▼</button>
          <button type="button" class="mod-ai-act" data-act="dup" title="Duplicate">⧉</button>
          <button type="button" class="mod-ai-act mod-ai-act--danger" data-act="del" title="Remove">×</button>
        </div>`;

      li.querySelector('[data-act="up"]')!.addEventListener('click', () => this.moveLine(i, -1));
      li.querySelector('[data-act="down"]')!.addEventListener('click', () => this.moveLine(i, 1));
      li.querySelector('[data-act="dup"]')!.addEventListener('click', () => this.duplicateLine(i));
      li.querySelector('[data-act="del"]')!.addEventListener('click', () => this.removeLine(i));
      this.behaviorList.appendChild(li);
    });
  }

  private commit(notifyChange = true): void {
    const { errors } = interpretModScripts(this.lines);
    this.validationEl.textContent = errors.length ? errors.join(' · ') : '';
    this.validationEl.classList.toggle('mod-logic-validation--error', errors.length > 0);
    if (notifyChange && !errors.length) this.onChange(this.getScripts());
    this.renderBehaviors();
    this.binder.loadRules(interpretModScripts(this.lines).rules);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
