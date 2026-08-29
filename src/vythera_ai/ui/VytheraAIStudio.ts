import {
  vytheraAI,
  vytheraDataset,
  vytheraEvaluation,
  vytheraKnowledge,
  vytheraMemory,
  vytheraTraining,
  vytheraVision,
  vytheraVisualLearning,
  vytheraVisualDataset,
  LEARNING_STAGE_LABELS,
  loadVytheraAISettings,
  saveVytheraAISettings,
  type VytheraEditorHost,
  type VytheraImageMode,
} from '../index';
import { vytheraTools } from '../tools/VytheraAIToolRegistry';
import { listImageRefs } from '../vision/VytheraImageStore';
import { listVisionAdapters } from '../vision/learning/VytheraVisionAdapters';
import { probeTrainingCapability } from '../vision/learning/VytheraTrainingCapability';
import {
  trainDaemonJobAction,
  trainDaemonListJobs,
  trainDaemonGetJob,
  trainDaemonRollback,
} from '../vision/learning/VytheraTrainingCapability';
import { DEFAULT_LEARN_TARGETS } from '../vision/learning/VytheraTeachExample';
import {
  listVisualTaskDefinitions,
  type VytheraVisualTaskType,
} from '../vision/learning/VytheraVisualTaskTypes';
import {
  effectiveTaskAnswer,
  type VytheraVisualLearningTask,
} from '../vision/learning/VytheraVisualTaskGenerator';
import {
  learningReportFromEval,
  taskTypeBalance,
  vytheraVisualLearningTasks,
} from '../vision/learning/VytheraVisualLearningTasks';
import {
  PRIVACY_SAFE_STATUS,
  sanitizeForDisplay,
  sanitizeUserFacingError,
} from '../security/VytheraPrivacySanitizer';

type Tab =
  | 'CHAT'
  | 'IMAGE'
  | 'MEMORY'
  | 'KNOWLEDGE'
  | 'DATASET'
  | 'TRAINING'
  | 'EVALUATION'
  | 'MODELS'
  | 'TOOLS'
  | 'SETTINGS'
  | 'PRIVACY'
  | 'JOBS';

const STATUS: Record<string, string> = {
  CONNECTED: '● CONNECTED',
  OFFLINE: '● OFFLINE',
  NO_MODEL: '● LOCAL MODEL REQUIRED',
  BUSY: '● BUSY',
  ERROR: '● ERROR',
};

const TAB_META: Record<
  Tab,
  { label: string; icon: string; group: 'AI' | 'LEARNING' | 'SYSTEM'; workspace: string }
> = {
  CHAT: { label: 'AI Chat', icon: '◇', group: 'AI', workspace: 'AI CHAT' },
  IMAGE: { label: 'Image Learning', icon: '▣', group: 'LEARNING', workspace: 'IMAGE LEARNING' },
  DATASET: { label: 'Dataset', icon: '▦', group: 'LEARNING', workspace: 'DATASET' },
  TRAINING: { label: 'Train / Adapt', icon: '◎', group: 'LEARNING', workspace: 'TRAIN / ADAPT' },
  EVALUATION: { label: 'Evaluation', icon: '◈', group: 'LEARNING', workspace: 'EVALUATION' },
  MODELS: { label: 'Models', icon: '⬡', group: 'LEARNING', workspace: 'MODELS' },
  MEMORY: { label: 'Memory', icon: '◉', group: 'AI', workspace: 'MEMORY' },
  KNOWLEDGE: { label: 'Knowledge', icon: '✦', group: 'AI', workspace: 'KNOWLEDGE' },
  TOOLS: { label: 'Tools', icon: '⚙', group: 'SYSTEM', workspace: 'TOOLS' },
  JOBS: { label: 'Jobs', icon: '▤', group: 'SYSTEM', workspace: 'JOBS' },
  SETTINGS: { label: 'Settings', icon: '☰', group: 'SYSTEM', workspace: 'SETTINGS' },
  PRIVACY: { label: 'Privacy', icon: '⊘', group: 'SYSTEM', workspace: 'PRIVACY' },
};

function getTitle(t: VytheraVisualTaskType): string {
  return listVisualTaskDefinitions().find((d) => d.type === t)?.title ?? t;
}

/** VYTHERA AI Studio — primary editor AI surface. */
export class VytheraAIStudio {
  readonly root: HTMLElement;
  private feed: HTMLElement;
  private input: HTMLTextAreaElement;
  private statusEl: HTMLElement;
  private connEl: HTMLElement;
  private modelSelect: HTMLSelectElement;
  private tabHost: HTMLElement;
  private panelHost: HTMLElement;
  private inspectorHost: HTMLElement;
  private workspaceTitleEl: HTMLElement;
  private toastEl: HTMLElement;
  private tab: Tab = 'CHAT';
  private busy = false;
  private abort: AbortController | null = null;
  private getHost: (() => VytheraEditorHost) | null = null;
  private onNotify: (msg: string) => void;
  private imageMode: VytheraImageMode = 'UNDERSTAND';
  private imagePreviewUrl: string | null = null;
  private imageMeta: {
    hash: string;
    fileName: string;
    palette: unknown;
    teachId?: string;
    privacyStripped?: boolean;
  } | null = null;
  private learnTargets = { ...DEFAULT_LEARN_TARGETS };
  private taskCategoryEnabled: Record<string, boolean> = Object.fromEntries(
    listVisualTaskDefinitions().map((d) => [d.type, true]),
  );
  private teachMoreFilter: VytheraVisualTaskType[] | null = null;
  private lastStageLabel = '';
  private imageZoom = 1;
  private lastPrivacyStripped = false;

  constructor(_onExecute: (actions: unknown[]) => void, onNotify: (msg: string) => void) {
    this.onNotify = (msg) => {
      const mode = loadVytheraAISettings().privacyMode !== false;
      const safe = sanitizeForDisplay(String(msg ?? ''), { privacyMode: mode });
      onNotify(safe);
      if (this.toastEl) this.toastEl.textContent = safe;
    };
    this.root = document.createElement('div');
    this.root.className = 'mod-project-ai vythera-ai-studio vas-shell';
    this.root.innerHTML = `
      <header class="vas-topbar" role="banner">
        <div class="vas-brand">
          <span class="vas-brand-mark" aria-hidden="true">◈</span>
          <div class="vas-brand-word">VYTHERA <span>AI</span></div>
        </div>
        <div class="vas-workspace-title" data-workspace-title>AI CHAT</div>
        <div class="vas-top-status">
          <span class="vas-pill" data-pill="chat" data-state="off" title="Local chat service"><span class="vas-dot"></span><span>Local AI</span></span>
          <span class="vas-pill" data-pill="gpu" data-state="off" title="Local GPU readiness"><span class="vas-dot"></span><span>GPU</span></span>
          <span class="vas-pill" data-pill="train" data-state="off" title="Local training daemon"><span class="vas-dot"></span><span>Training</span></span>
          <span class="vas-pill" data-pill="privacy" data-state="ok" title="Privacy mode"><span class="vas-dot"></span><span>Privacy</span></span>
          <button type="button" class="vas-cancel" data-ai-cancel hidden>Cancel</button>
        </div>
      </header>
      <div class="vas-body">
        <nav class="vas-nav" aria-label="VYTHERA AI navigation">
          <div class="vythera-ai-tabs vas-nav-tabs" role="tablist"></div>
          <button type="button" class="vas-nav-toggle" data-nav-toggle title="Collapse navigation ([)">Nav</button>
        </nav>
        <div class="vas-resize vas-resize-nav" data-resize="nav" role="separator" aria-orientation="vertical" tabindex="0"></div>
        <main class="vas-workspace">
          <div class="vas-workspace-scroll vythera-ai-panel" role="main"></div>
        </main>
        <div class="vas-resize vas-resize-insp" data-resize="insp" role="separator" aria-orientation="vertical" tabindex="0"></div>
        <aside class="vas-inspector" aria-label="Inspector">
          <div class="vas-insp-head">
            <span class="vas-insp-title">Inspector</span>
            <button type="button" class="vas-insp-toggle" data-insp-toggle title="Collapse inspector (])">⟩</button>
          </div>
          <div class="vas-insp-body" data-inspector></div>
        </aside>
      </div>
      <footer class="vas-statusbar" role="status">
        <span class="vas-pill" data-conn data-state="off"><span class="vas-dot"></span><span>Local AI</span></span>
        <span data-chat-svc>${PRIVACY_SAFE_STATUS.ollamaLabel}</span>
        <span data-train-svc>${PRIVACY_SAFE_STATUS.daemonLabel}</span>
        <span data-privacy>Privacy On</span>
        <span data-bottom-dataset>Dataset —</span>
        <span class="vas-toast" data-toast aria-live="polite"></span>
      </footer>
      <p class="mod-project-ai-status" aria-live="polite" hidden></p>
      <div class="mod-local-ai-status" hidden></div>
      <header class="mod-ai-header mod-ai-header--sub" hidden></header>
    `;
    this.connEl = this.root.querySelector('[data-conn]') as HTMLElement;
    this.statusEl = this.root.querySelector('.mod-project-ai-status') as HTMLElement;
    this.tabHost = this.root.querySelector('.vythera-ai-tabs') as HTMLElement;
    this.panelHost = this.root.querySelector('.vythera-ai-panel') as HTMLElement;
    this.inspectorHost = this.root.querySelector('[data-inspector]') as HTMLElement;
    this.workspaceTitleEl = this.root.querySelector('[data-workspace-title]') as HTMLElement;
    this.toastEl = this.root.querySelector('[data-toast]') as HTMLElement;
    this.feed = document.createElement('div');
    this.input = document.createElement('textarea');
    this.modelSelect = document.createElement('select');

    this.buildTabs();
    this.bindShellChrome();
    this.renderTab();
    this.root.querySelector('[data-ai-cancel]')!.addEventListener('click', () => this.cancel());
    void this.refresh();
  }

  setInferenceHost(getHost: () => VytheraEditorHost): void {
    this.getHost = getHost;
  }

  /** Compatibility alias for ModLogicPanel. */
  setHost(getHost: () => VytheraEditorHost): void {
    this.setInferenceHost(getHost);
  }

  private allTabs(): Tab[] {
    return [
      'CHAT',
      'IMAGE',
      'MEMORY',
      'KNOWLEDGE',
      'DATASET',
      'TRAINING',
      'EVALUATION',
      'MODELS',
      'TOOLS',
      'JOBS',
      'SETTINGS',
      'PRIVACY',
    ];
  }

  private buildTabs(): void {
    this.tabHost.replaceChildren();
    const groups: Array<'AI' | 'LEARNING' | 'SYSTEM'> = ['AI', 'LEARNING', 'SYSTEM'];
    for (const g of groups) {
      const wrap = document.createElement('div');
      wrap.className = 'vas-nav-group';
      const lab = document.createElement('div');
      lab.className = 'vas-nav-group-label';
      lab.textContent = g === 'LEARNING' ? 'Learning' : g === 'AI' ? 'AI' : 'System';
      wrap.appendChild(lab);
      for (const t of this.allTabs().filter((x) => TAB_META[x].group === g)) {
        const meta = TAB_META[t];
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'vythera-ai-tab vas-nav-btn';
        b.dataset.tab = t;
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', 'false');
        b.title = meta.label;
        b.innerHTML = `<span class="vas-nav-ico" aria-hidden="true">${meta.icon}</span><span class="vas-nav-label">${meta.label}</span>`;
        b.addEventListener('click', () => {
          this.tab = t;
          this.renderTab();
        });
        wrap.appendChild(b);
      }
      this.tabHost.appendChild(wrap);
    }
  }

  private bindShellChrome(): void {
    this.root.querySelector('[data-nav-toggle]')?.addEventListener('click', () => {
      this.root.classList.toggle('is-nav-collapsed');
    });
    this.root.querySelector('[data-insp-toggle]')?.addEventListener('click', () => {
      this.root.classList.toggle('is-insp-collapsed');
    });
    this.root.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === '[') this.root.classList.toggle('is-nav-collapsed');
      if (e.key === ']') this.root.classList.toggle('is-insp-collapsed');
      if (e.key === 'F' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault();
        this.root.classList.toggle('is-workspace-full');
      }
      if (e.altKey && e.key >= '1' && e.key <= '9') {
        const i = Number(e.key) - 1;
        const t = this.allTabs()[i];
        if (t) {
          this.tab = t;
          this.renderTab();
        }
      }
    });
    this.bindResize('nav', '--vas-nav-w', 48, 280);
    this.bindResize('insp', '--vas-insp-w', 180, 380);
  }

  private bindResize(kind: 'nav' | 'insp', cssVar: string, min: number, max: number): void {
    const handle = this.root.querySelector(`[data-resize="${kind}"]`) as HTMLElement | null;
    if (!handle) return;
    let dragging = false;
    handle.addEventListener('pointerdown', (e) => {
      dragging = true;
      handle.classList.add('is-dragging');
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const rect = this.root.getBoundingClientRect();
      let w =
        kind === 'nav' ? e.clientX - rect.left : rect.right - e.clientX;
      w = Math.max(min, Math.min(max, w));
      this.root.style.setProperty(cssVar, `${Math.round(w)}px`);
    });
    const end = () => {
      dragging = false;
      handle.classList.remove('is-dragging');
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  private renderTab(): void {
    const tabs = this.allTabs();
    this.tabHost.querySelectorAll('.vas-nav-btn').forEach((el) => {
      const btn = el as HTMLElement;
      const active = btn.dataset.tab === this.tab;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    this.workspaceTitleEl.textContent = TAB_META[this.tab].workspace;
    this.panelHost.replaceChildren();
    if (this.tab === 'CHAT') this.renderChat();
    else if (this.tab === 'IMAGE') this.renderImageLearning();
    else if (this.tab === 'MEMORY') this.renderMemory();
    else if (this.tab === 'KNOWLEDGE') this.renderKnowledge();
    else if (this.tab === 'DATASET') this.renderDataset();
    else if (this.tab === 'TRAINING' || this.tab === 'JOBS') this.renderTraining();
    else if (this.tab === 'EVALUATION') this.renderEval();
    else if (this.tab === 'MODELS') this.renderModels();
    else if (this.tab === 'TOOLS') this.renderTools();
    else if (this.tab === 'PRIVACY') this.renderPrivacy();
    else this.renderSettings();
    this.updateInspector();
    void tabs;
  }

  private updateInspector(): void {
    this.inspectorHost.replaceChildren();
    const block = (k: string, v: string, mono = false) => {
      const d = document.createElement('div');
      d.className = 'vas-insp-block';
      d.innerHTML = `<div class="vas-insp-k">${k}</div><div class="vas-insp-v${mono ? ' mono' : ''}"></div>`;
      (d.querySelector('.vas-insp-v') as HTMLElement).textContent = v;
      this.inspectorHost.appendChild(d);
    };
    const privacy = loadVytheraAISettings().privacyMode !== false;
    const dash = vytheraVisualLearning.dashboard();
    block('Workspace', TAB_META[this.tab].workspace);
    block('Stage', this.lastStageLabel || '—');
    block('Vision', vytheraVision.getStatus());
    block('Active model', sanitizeForDisplay(vytheraVision.activeVisionModel() || '—', { privacyMode: privacy }), true);
    block('Dataset approved', String(dash.dataset.approved));
    block('Concepts', String(dash.concepts));
    block('Privacy', privacy ? 'ON · Local only' : 'OFF');
    block('Cloud', 'DISABLED');
    if (this.imageMeta) {
      block('Image hash', this.imageMeta.hash.slice(0, 16) + '…', true);
      block('File', this.imageMeta.fileName);
      if (this.imageMeta.privacyStripped || this.lastPrivacyStripped) {
        block('Metadata', 'STRIPPED');
      }
    }
  }

  private renderImageLearning(): void {
    const wrap = document.createElement('div');
    wrap.className = 'vythera-ai-image vas-view';
    const dash = vytheraVisualLearning.dashboard();

    const head = document.createElement('div');
    head.className = 'vas-view-head';
    head.innerHTML = `
      <h2>Image Learning</h2>
      <p>Teach VYTHERA visual concepts and game-specific knowledge. Saving a reference is not model training.</p>`;

    const stage = document.createElement('p');
    stage.className = 'vythera-ai-stage';
    stage.textContent = this.lastStageLabel
      ? `Stage · ${this.lastStageLabel}`
      : 'Pipeline · Reference → Dataset → Train/Adapt → Evaluate → Promote';

    const visionStatus = document.createElement('div');
    visionStatus.className = 'vas-row';
    const vs = vytheraVision.getStatus();
    const activeV = sanitizeForDisplay(vytheraVision.activeVisionModel() || '—', {
      privacyMode: true,
    });
    const vsBadge = document.createElement('span');
    vsBadge.className = `vas-badge${vs === 'READY' ? ' vas-badge--ok' : ''}`;
    vsBadge.textContent =
      vs === 'READY' ? `Local VLM · ${activeV}` : vs === 'NO_VISION_MODEL' ? 'Local vision model not installed' : `Vision · ${vs}`;
    visionStatus.appendChild(vsBadge);
    const privBadge = document.createElement('span');
    privBadge.className = 'vas-badge vas-badge--priv';
    privBadge.textContent = 'Private · Local';
    visionStatus.appendChild(privBadge);
    if (this.imageMeta?.privacyStripped || this.lastPrivacyStripped) {
      const strip = document.createElement('span');
      strip.className = 'vas-badge vas-badge--ok';
      strip.textContent = 'Privacy metadata stripped';
      visionStatus.appendChild(strip);
    }

    const stats = document.createElement('p');
    stats.className = 'mod-ai-subtitle';
    stats.textContent = `Dataset ${dash.dataset.approved} approved · ${dash.dataset.training} train · ${dash.dataset.validation} val · ${dash.concepts} concepts · ${listImageRefs().length} refs`;

    const drop = document.createElement('div');
    drop.className = 'vythera-ai-image-drop vas-drop';
    drop.innerHTML = `<div class="vas-drop-title">Drop image here</div><div class="vas-drop-sub">PNG · JPG · WEBP</div>`;
    drop.addEventListener('dragover', (e) => {
      e.preventDefault();
      drop.classList.add('is-drag');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('is-drag'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('is-drag');
      const f = e.dataTransfer?.files?.[0];
      if (f) void this.loadImageFile(f, preview, paletteEl);
    });

    const filePill = document.createElement('label');
    filePill.className = 'vy-file-pill';
    const filePillBtn = document.createElement('span');
    filePillBtn.className = 'vy-file-pill__btn vy-btn--primary';
    filePillBtn.textContent = 'Upload image';
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp';
    fileInput.hidden = true;
    const fileNameEl = document.createElement('span');
    fileNameEl.className = 'vy-file-pill__name';
    fileNameEl.hidden = true;
    const fileClearBtn = document.createElement('button');
    fileClearBtn.type = 'button';
    fileClearBtn.className = 'vy-file-pill__clear';
    fileClearBtn.hidden = true;
    fileClearBtn.title = 'Clear file';
    fileClearBtn.setAttribute('aria-label', 'Clear file');
    fileClearBtn.textContent = '✕';

    filePill.append(filePillBtn, fileInput, fileNameEl, fileClearBtn);

    fileInput.addEventListener('change', () => {
      const f = fileInput.files?.[0];
      if (f) {
        fileNameEl.textContent = f.name;
        fileNameEl.hidden = false;
        fileClearBtn.hidden = false;
        void this.loadImageFile(f, preview, paletteEl);
      }
    });

    fileClearBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      fileInput.value = '';
      fileNameEl.textContent = '';
      fileNameEl.hidden = true;
      fileClearBtn.hidden = true;
    });

    const pasteBtn = document.createElement('button');
    pasteBtn.type = 'button';
    pasteBtn.className = 'vas-btn';
    pasteBtn.textContent = 'Paste Clipboard Image';
    pasteBtn.addEventListener('click', () => void this.pasteClipboardImage(preview, paletteEl));

    const dropActions = document.createElement('div');
    dropActions.className = 'vas-row';
    dropActions.style.justifyContent = 'center';
    dropActions.style.marginTop = '0.55rem';
    dropActions.append(filePill, pasteBtn);
    drop.appendChild(dropActions);

    const stageWrap = document.createElement('div');
    stageWrap.className = 'vas-image-stage';
    const preview = document.createElement('img');
    preview.className = 'vythera-ai-image-preview';
    preview.alt = 'Local image preview';
    if (this.imagePreviewUrl) {
      preview.src = this.imagePreviewUrl;
      preview.style.transform = `scale(${this.imageZoom})`;
      drop.hidden = true;
    } else {
      preview.hidden = true;
      stageWrap.hidden = true;
    }
    const toolbar = document.createElement('div');
    toolbar.className = 'vas-image-toolbar';
    for (const [label, fn] of [
      ['−', () => { this.imageZoom = Math.max(0.5, this.imageZoom - 0.15); preview.style.transform = `scale(${this.imageZoom})`; }],
      ['+', () => { this.imageZoom = Math.min(3, this.imageZoom + 0.15); preview.style.transform = `scale(${this.imageZoom})`; }],
      ['Fit', () => { this.imageZoom = 1; preview.style.transform = 'scale(1)'; }],
    ] as Array<[string, () => void]>) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'vas-btn vas-btn--ghost';
      b.textContent = label;
      b.addEventListener('click', fn);
      toolbar.appendChild(b);
    }
    stageWrap.append(preview, toolbar);

    const paletteEl = document.createElement('pre');
    paletteEl.className = 'vythera-ai-json';
    if (this.imageMeta?.palette) paletteEl.textContent = JSON.stringify(this.imageMeta.palette, null, 2);

    const modes = document.createElement('div');
    modes.className = 'mod-project-ai-chips vas-row';
    for (const m of [
      { id: 'UNDERSTAND' as VytheraImageMode, label: 'Understand' },
      { id: 'RECREATE' as VytheraImageMode, label: 'Recreate' },
      { id: 'LEARN_STYLE' as VytheraImageMode, label: 'Learn Style' },
      { id: 'REFERENCE' as VytheraImageMode, label: 'Reference' },
      { id: 'EXTRACT_ASSET' as VytheraImageMode, label: 'Extract Asset' },
    ]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mod-ai-chip vas-chip';
      b.textContent = m.label;
      b.classList.toggle('is-active', this.imageMode === m.id);
      b.addEventListener('click', () => {
        this.imageMode = m.id;
        this.renderTab();
      });
      modes.appendChild(b);
    }

    const analysisSection = document.createElement('section');
    analysisSection.className = 'vas-section';
    const analysisHead = document.createElement('div');
    analysisHead.className = 'vas-section-head';
    analysisHead.innerHTML = `<h3>Vision Analysis</h3>`;
    const analysisBody = document.createElement('div');
    analysisBody.className = 'vas-section-body';
    const last = vytheraVision.last();
    if (last?.analysis) {
      analysisBody.appendChild(this.buildAnalysisAccordion(last.analysis));
    } else {
      const empty = document.createElement('div');
      empty.className = 'vas-empty';
      empty.innerHTML = `<strong>No analysis yet</strong>Run Analyze after importing an image.`;
      analysisBody.appendChild(empty);
    }
    const understand = document.createElement('pre');
    understand.className = 'vythera-ai-json';
    understand.hidden = true;
    understand.textContent = last?.analysis ? JSON.stringify(last.analysis, null, 2) : '';
    analysisSection.append(analysisHead, analysisBody, understand);

    const corrections = document.createElement('textarea');
    corrections.className = 'mod-ai-input';
    corrections.rows = 3;
    corrections.placeholder =
      'Corrections: This is grass, not moss. Ignore the background. Use this exact voxel style…';

    const learnBox = document.createElement('div');
    learnBox.className = 'vythera-ai-learn-targets';
    const targetKeys: (keyof typeof DEFAULT_LEARN_TARGETS)[] = [
      'visualStyle',
      'objects',
      'materials',
      'palette',
      'voxelStructure',
      'ignoreBackground',
    ];
    const labels: Record<string, string> = {
      visualStyle: 'Visual Style',
      objects: 'Objects',
      materials: 'Materials',
      palette: 'Palette',
      voxelStructure: 'Voxel Structure',
      ignoreBackground: 'Ignore Background',
    };
    for (const k of targetKeys) {
      const lab = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = this.learnTargets[k];
      cb.addEventListener('change', () => {
        this.learnTargets[k] = cb.checked;
      });
      lab.append(cb, document.createTextNode(` ${labels[k]}`));
      learnBox.appendChild(lab);
    }

    const resultHost = document.createElement('div');
    resultHost.className = 'vythera-ai-image-result';

    const actions = document.createElement('div');
    actions.className = 'mod-ai-compose vas-row';
    const mk = (label: string, fn: () => void, primary = false) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = primary ? 'vas-btn vas-btn--primary' : 'vas-btn';
      b.textContent = label;
      b.addEventListener('click', fn);
      actions.appendChild(b);
    };
    mk('Analyze', () => void this.runImageAnalyze('', resultHost, understand), true);
    mk('Apply Corrections', () => {
      const id = this.imageMeta?.teachId ?? vytheraVision.getActiveTeachExample()?.id;
      if (!id) {
        this.onNotify('Load and analyze an image first');
        return;
      }
      const res = vytheraVisualLearning.applyHumanCorrections(id, {
        notesText: corrections.value,
        learnTargets: this.learnTargets,
      });
      if (res) {
        this.lastStageLabel = res.stageLabel;
        this.onNotify(res.message);
        understand.textContent = JSON.stringify(res.example.correctedAnalysis, null, 2);
        this.renderTab();
      }
    });
    mk('Reject', () => {
      const id = this.imageMeta?.teachId ?? vytheraVision.getActiveTeachExample()?.id;
      if (!id) return;
      const res = vytheraVisualLearning.reject(id, corrections.value || 'user rejected');
      if (res) {
        this.lastStageLabel = res.stageLabel;
        this.onNotify(res.message);
        this.renderTab();
      }
    });
    mk('Save as Reference', () => {
      const id = this.imageMeta?.teachId ?? vytheraVision.getActiveTeachExample()?.id;
      if (!id) return;
      void vytheraVisualLearning.saveAsReference(id).then((res) => {
        if (!res) return;
        this.lastStageLabel = res.stageLabel;
        this.onNotify(res.message);
      });
    });
    mk('Add to Dataset', () => {
      const id = this.imageMeta?.teachId ?? vytheraVision.getActiveTeachExample()?.id;
      if (!id) {
        this.onNotify('No teach session');
        return;
      }
      vytheraVisualLearning.applyHumanCorrections(id, {
        notesText: corrections.value,
        learnTargets: this.learnTargets,
      });
      const res = vytheraVisualLearning.approveAndAddToDataset(id);
      if (res) {
        this.lastStageLabel = res.stageLabel;
        this.onNotify(res.message);
        this.renderTab();
      }
    });
    mk('Train / Adapt', () => {
      void vytheraVisualLearning
        .requestTrainAdapt({ baseVisionModel: vytheraVision.activeVisionModel() })
        .then((res) => {
          this.lastStageLabel = res.stageLabel;
          this.onNotify(res.message);
          this.renderTab();
        });
    });
    mk('Apply Voxel Plan', () => {
      const editor = this.getHost?.();
      if (!editor) {
        this.onNotify('Open voxel editor first');
        return;
      }
      void vytheraVision
        .applyToEditor(editor)
        .then((s) => this.onNotify(s))
        .catch((e) => this.onNotify(e instanceof Error ? e.message : 'Apply failed'));
    });

    this.renderLastImageResult(resultHost);

    const corrSection = document.createElement('section');
    corrSection.className = 'vas-section';
    corrSection.innerHTML = `<div class="vas-section-head"><h3>Corrections</h3></div>`;
    const corrBody = document.createElement('div');
    corrBody.className = 'vas-section-body';
    corrBody.append(corrections, document.createElement('div'));
    (corrBody.lastChild as HTMLElement).className = 'vas-section-head';
    (corrBody.lastChild as HTMLElement).innerHTML = '<h3>Learn Targets</h3>';
    corrBody.appendChild(learnBox);
    corrSection.appendChild(corrBody);

    const multiTaskSection = this.buildMultiTaskTeachSection();

    wrap.append(
      head,
      stage,
      visionStatus,
      stats,
      drop,
      stageWrap,
      modes,
      analysisSection,
      corrSection,
      actions,
      multiTaskSection,
      resultHost,
      paletteEl,
    );
    this.panelHost.appendChild(wrap);
  }

  private buildAnalysisAccordion(analysis: import('../vision/VytheraImageAnalysis').VytheraImageAnalysis): HTMLElement {
    const host = document.createElement('div');
    const confPct = Math.round((analysis.confidence ?? 0) * 100);
    const confEl = (pct: number) => {
      const span = document.createElement('span');
      span.className = 'vas-conf';
      span.innerHTML = `<span class="vas-conf-bar"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></span>${pct}%`;
      return span;
    };
    const add = (title: string, body: string, pct = confPct) => {
      const det = document.createElement('details');
      det.className = 'vas-acc';
      det.open = title === 'Scene' || title === 'Objects';
      const sum = document.createElement('summary');
      sum.textContent = title;
      sum.appendChild(confEl(pct));
      const b = document.createElement('div');
      b.className = 'vas-acc-body';
      b.textContent = body;
      det.append(sum, b);
      host.appendChild(det);
    };
    add('Scene', analysis.scene?.description || analysis.subject.name || analysis.subject.category);
    add(
      'Objects',
      (analysis.scene?.objects?.map((o) => o.name || o.type).join(', ') || analysis.features.join(', ') || analysis.subject.category),
    );
    add('Terrain', analysis.scene?.terrain || '—');
    add('Materials', analysis.materials.join(', ') || '—');
    add(
      'Palette',
      analysis.palette.colors
        .slice(0, 6)
        .map((c) => `rgb(${c[0]|0},${c[1]|0},${c[2]|0})`)
        .join(' · ') || '—',
    );
    add('Lighting', analysis.scene?.lighting || '—');
    add(
      'Style',
      [
        analysis.style.voxelLike ? 'voxel-like' : 'non-voxel',
        `chunkiness ${analysis.style.chunkiness.toFixed(2)}`,
        ...(analysis.style.styleNotes ?? []),
      ].join(' · '),
    );
    add(
      'Voxel Structure',
      analysis.shape.silhouette ||
        analysis.components.map((c) => c.name).join(', ') ||
        '—',
    );
    return host;
  }

  private buildMultiTaskTeachSection(): HTMLElement {
    const section = document.createElement('section');
    section.className = 'vythera-ai-multitask vas-section';
    const head = document.createElement('div');
    head.className = 'vas-section-head';
    head.innerHTML = `<h3>Learning Tasks</h3>`;
    const body = document.createElement('div');
    body.className = 'vas-section-body';

    const hint = document.createElement('p');
    hint.className = 'mod-ai-subtitle';
    hint.textContent =
      'Analyze → Generate learning tasks → Correct → Approve → Add to dataset (does not train)';

    const cats = document.createElement('div');
    cats.className = 'vythera-ai-learn-targets';
    const genLabel = document.createElement('p');
    genLabel.className = 'vas-task-label';
    genLabel.textContent = 'Generate categories';
    cats.appendChild(genLabel);
    for (const d of listVisualTaskDefinitions()) {
      const lab = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = this.taskCategoryEnabled[d.type] !== false;
      if (this.teachMoreFilter?.length) {
        cb.checked = this.teachMoreFilter.includes(d.type);
        this.taskCategoryEnabled[d.type] = cb.checked;
      }
      cb.addEventListener('change', () => {
        this.taskCategoryEnabled[d.type] = cb.checked;
      });
      lab.append(cb, document.createTextNode(` ${d.title}`));
      cats.appendChild(lab);
    }

    const hash = this.imageMeta?.hash;
    const tasks = hash ? vytheraVisualLearningTasks.list(hash) : [];
    const report = hash ? vytheraVisualLearningTasks.qualityReport(hash) : null;
    const preview = hash ? vytheraVisualLearningTasks.previewDataset(hash) : null;
    const balance = taskTypeBalance(vytheraVisualDataset.list());

    const stats = document.createElement('div');
    stats.className = 'vas-task-stats';
    if (report) {
      stats.innerHTML = `
        <span><strong>${report.generated}</strong> generated</span>
        <span><strong>${report.approved}</strong> approved</span>
        <span><strong>${report.needsCorrection}</strong> need review</span>
        <span><strong>${report.rejected}</strong> rejected</span>`;
    } else {
      stats.innerHTML = `<span>No tasks yet</span>`;
    }

    if (preview && Object.keys(balance.percents).length) {
      const bal = document.createElement('div');
      bal.className = 'vas-balance';
      for (const [k, p] of Object.entries(balance.percents).slice(0, 10)) {
        const row = document.createElement('div');
        row.className = 'vas-balance-row';
        row.innerHTML = `<span>${k}</span><span class="vas-balance-track"><i style="width:${p}%"></i></span><span>${p}%</span>`;
        bal.appendChild(row);
      }
      if (balance.warning) {
        const w = document.createElement('p');
        w.className = 'mod-ai-subtitle';
        w.textContent = balance.warning;
        bal.appendChild(w);
      }
      body.appendChild(bal);
    }

    const actions = document.createElement('div');
    actions.className = 'mod-ai-compose vas-row';
    const mk = (label: string, fn: () => void, primary = false) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = primary ? 'vas-btn vas-btn--primary' : 'vas-btn';
      b.textContent = label;
      b.addEventListener('click', fn);
      actions.appendChild(b);
    };

    mk(
      'Generate Learning Tasks',
      () => {
        const id = this.imageMeta?.teachId ?? vytheraVision.getActiveTeachExample()?.id;
        if (!id) {
          this.onNotify('Load and analyze an image first');
          return;
        }
        if (vytheraVision.getStatus() === 'NO_VISION_MODEL') {
          this.onNotify('LOCAL VISION MODEL NOT INSTALLED');
          return;
        }
        const enabled = listVisualTaskDefinitions()
          .map((d) => d.type)
          .filter((t) => this.taskCategoryEnabled[t] !== false);
        const r = vytheraVisualLearning.generateLearningTasks(id, { enabledTypes: enabled });
        this.lastStageLabel = r.stageLabel;
        this.onNotify(r.message);
        this.teachMoreFilter = null;
        this.renderTab();
      },
      true,
    );

    mk('Approve All Valid', () => {
      if (!hash) return;
      const r = vytheraVisualLearningTasks.approveAllValid(hash);
      this.onNotify(`Approved ${r.approved.length} · skipped ${r.skipped.length}`);
      this.renderTab();
    });

    mk('Add Approved Tasks to Dataset', () => {
      const id = this.imageMeta?.teachId ?? vytheraVision.getActiveTeachExample()?.id;
      if (!id) {
        this.onNotify('No teach session');
        return;
      }
      const res = vytheraVisualLearning.addApprovedLearningTasks(id);
      if (res) {
        this.lastStageLabel = res.stageLabel;
        this.onNotify(res.message);
        this.renderTab();
      }
    });

    mk('Teach More', () => {
      const reportLearn = learningReportFromEval(
        Object.fromEntries(
          listVisualTaskDefinitions().map((d) => [
            d.type,
            (balance.percents[d.type] ?? 0) / 100 || 0.5,
          ]),
        ),
      );
      const weak = reportLearn.needsMore.length
        ? (reportLearn.needsMore as VytheraVisualTaskType[])
        : (['VOXEL_STRUCTURE', 'VYTHERA_STYLE', 'GAME_ASSET_PLAN'] as VytheraVisualTaskType[]);
      this.teachMoreFilter = weak.filter((t) => listVisualTaskDefinitions().some((d) => d.type === t));
      for (const d of listVisualTaskDefinitions()) {
        this.taskCategoryEnabled[d.type] = this.teachMoreFilter.includes(d.type);
      }
      this.onNotify(
        `TEACH MORE · focus: ${this.teachMoreFilter.map((t) => getTitle(t)).join(', ')}`,
      );
      this.renderTab();
    });

    const list = document.createElement('div');
    list.className = 'vythera-ai-task-list vas-task-list';
    for (const task of tasks.slice(0, 24)) {
      list.appendChild(this.buildTaskReviewCard(task));
    }
    if (!tasks.length) {
      const empty = document.createElement('div');
      empty.className = 'vas-empty';
      empty.innerHTML = `<strong>No learning tasks</strong>Generate tasks after analyzing an image.`;
      list.appendChild(empty);
    }

    body.append(hint, cats, stats, actions, list);
    section.append(head, body);
    return section;
  }

  private buildTaskReviewCard(task: VytheraVisualLearningTask): HTMLElement {
    const card = document.createElement('div');
    card.className = 'vythera-ai-task-card vas-task-card';
    if (task.status === 'APPROVED') card.classList.add('is-approved');
    if (task.status === 'REJECTED') card.classList.add('is-rejected');
    if (task.correctedAnswer != null) card.classList.add('is-changed');

    const head = document.createElement('div');
    head.className = 'vas-task-type';
    head.textContent = `${task.title} · ${task.status}`;
    const conf = document.createElement('div');
    conf.className = 'vas-conf';
    const pct = Math.round((task.confidence ?? 0) * 100);
    conf.innerHTML = `<span class="vas-conf-bar"><i style="width:${pct}%"></i></span>confidence ${pct}%`;

    const aiLab = document.createElement('div');
    aiLab.className = 'vas-task-label';
    aiLab.textContent = 'AI Answer';
    const ai = document.createElement('pre');
    ai.className = 'vythera-ai-json';
    ai.textContent = sanitizeForDisplay(JSON.stringify(task.aiAnswer ?? null, null, 2).slice(0, 1200), {
      privacyMode: true,
    });

    const corrLab = document.createElement('div');
    corrLab.className = 'vas-task-label';
    corrLab.textContent = task.correctedAnswer != null ? 'Corrected Answer · Changed' : 'Correct Answer';
    const edit = document.createElement('textarea');
    edit.className = 'mod-ai-input';
    edit.rows = 5;
    edit.placeholder = 'CORRECT ANSWER (JSON)';
    edit.value = JSON.stringify(effectiveTaskAnswer(task) ?? {}, null, 2);

    const row = document.createElement('div');
    row.className = 'mod-ai-compose vas-row';
    const mk = (label: string, fn: () => void, cls = 'vas-btn') => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = cls;
      b.textContent = label;
      b.addEventListener('click', fn);
      row.appendChild(b);
    };
    mk('Save Correction', () => {
      try {
        const parsed = JSON.parse(edit.value) as unknown;
        const r = vytheraVisualLearningTasks.saveCorrection(task.id, parsed);
        this.onNotify(r.ok ? 'Correction saved' : r.error);
        this.renderTab();
      } catch {
        this.onNotify('Correction must be valid JSON');
      }
    });
    mk('Approve', () => {
      const r = vytheraVisualLearningTasks.approve(task.id);
      this.onNotify(r.ok ? 'Approved' : r.error);
      this.renderTab();
    }, 'vas-btn vas-btn--ok');
    mk('Reject', () => {
      const r = vytheraVisualLearningTasks.reject(task.id);
      this.onNotify(r.ok ? 'Rejected' : r.error);
      this.renderTab();
    }, 'vas-btn vas-btn--danger');
    card.append(head, conf, aiLab, ai, corrLab, edit, row);
    return card;
  }

  private async pasteClipboardImage(
    preview: HTMLImageElement,
    paletteEl: HTMLElement,
  ): Promise<void> {
    try {
      const items = await navigator.clipboard.read();
      const { ingestLocalImageClipboard } = await import('../vision/VytheraImageStore');
      const ingested = await ingestLocalImageClipboard(
        items as unknown as DataTransferItemList,
      );
      if (!ingested.ok) {
        this.onNotify(`${ingested.error} — use drop/file picker if clipboard API blocked`);
        return;
      }
      const teach = vytheraVisualLearning.beginTeach({
        imageHash: ingested.hash,
        fileName: ingested.fileName,
        mimeType: ingested.image.mimeType,
        visionModel: vytheraVision.activeVisionModel(),
      });
      if (this.imagePreviewUrl) URL.revokeObjectURL(this.imagePreviewUrl);
      this.imagePreviewUrl = `data:${ingested.image.mimeType};base64,${ingested.image.base64}`;
      preview.src = this.imagePreviewUrl;
      preview.hidden = false;
      this.imageMeta = {
        hash: ingested.hash,
        fileName: ingested.fileName,
        palette: {
          type: 'vythera_palette',
          dominant: [[128, 128, 128, 255]],
          accents: [],
          shadows: [],
          highlights: [],
        },
        teachId: teach.example.id,
      };
      paletteEl.textContent = JSON.stringify(this.imageMeta.palette, null, 2);
      this.lastStageLabel = LEARNING_STAGE_LABELS.REFERENCE_SAVED;
      this.onNotify(`Clipboard image imported · ${LEARNING_STAGE_LABELS.REFERENCE_SAVED}`);
    } catch (e) {
      this.onNotify(e instanceof Error ? e.message : 'Clipboard paste failed');
    }
  }

  private async loadImageFile(
    file: File,
    preview: HTMLImageElement,
    paletteEl: HTMLElement,
  ): Promise<void> {
    try {
      const loaded = await vytheraVision.ingestFile(file);
      if (this.imagePreviewUrl) URL.revokeObjectURL(this.imagePreviewUrl);
      this.imagePreviewUrl = URL.createObjectURL(file);
      preview.src = this.imagePreviewUrl;
      preview.hidden = false;
      this.imageMeta = {
        hash: loaded.hash,
        fileName: loaded.fileName,
        palette: loaded.palette,
        teachId: loaded.teachExampleId,
        privacyStripped: !!loaded.privacyMetadataStripped,
      };
      this.lastPrivacyStripped = !!loaded.privacyMetadataStripped;
      paletteEl.textContent = JSON.stringify(loaded.palette, null, 2);
      this.lastStageLabel = LEARNING_STAGE_LABELS.REFERENCE_SAVED;
      this.onNotify(
        `IMPORTED · hash ${loaded.hash.slice(0, 8)}… · not training data yet` +
          (loaded.privacyMetadataStripped ? ' · PRIVACY METADATA: STRIPPED' : ''),
      );
      this.renderTab();
    } catch (e) {
      this.onNotify(e instanceof Error ? e.message : 'Image load failed');
    }
  }

  private async runImageAnalyze(
    prompt: string,
    resultHost: HTMLElement,
    understandEl?: HTMLElement,
  ): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    (this.root.querySelector('[data-ai-cancel]') as HTMLElement).hidden = false;
    this.abort = new AbortController();
    try {
      let palette = this.imageMeta?.palette as
        | import('../vision/VytheraLocalPalette').VytheraExtractedPalette
        | null
        | undefined;
      const paletteEl = this.panelHost.querySelector('.vythera-ai-json');
      if (paletteEl?.textContent?.trim()) {
        try {
          palette = JSON.parse(paletteEl.textContent) as typeof palette;
        } catch {
          /* keep */
        }
      }
      const result = await vytheraVision.analyze(this.imageMode, {
        prompt,
        hash: this.imageMeta?.hash,
        fileName: this.imageMeta?.fileName,
        palette: palette ?? null,
        signal: this.abort.signal,
      });
      if (understandEl) understandEl.textContent = JSON.stringify(result.analysis, null, 2);
      this.renderLastImageResult(resultHost);
      this.onNotify(result.summary + (result.fromCache ? ' (cache)' : ''));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Analyze failed';
      resultHost.textContent = msg;
      this.onNotify(msg);
    } finally {
      this.busy = false;
      (this.root.querySelector('[data-ai-cancel]') as HTMLElement).hidden = true;
      this.abort = null;
    }
  }

  private renderLastImageResult(host: HTMLElement): void {
    host.replaceChildren();
    const r = vytheraVision.last();
    if (!r) {
      host.textContent = 'No analysis yet.';
      return;
    }
    for (const [title, body] of [
      ['OBSERVATION', JSON.stringify(r.analysis, null, 2)],
      ['STYLE', JSON.stringify(r.analysis?.style ?? null, null, 2)],
      ['PALETTE', JSON.stringify(r.palette, null, 2)],
      ['ASSET / PLAN', JSON.stringify(r.plan, null, 2)],
      [
        'SUGGESTED VOXEL',
        r.scaffold ? `${r.scaffold.voxels.length} voxels @ ${r.scaffold.size}³` : '—',
      ],
    ] as [string, string][]) {
      const h = document.createElement('h4');
      h.textContent = title;
      const pre = document.createElement('pre');
      pre.className = 'vythera-ai-json';
      pre.textContent = body;
      host.append(h, pre);
    }
    const note = document.createElement('p');
    note.textContent = r.learningNote;
    if (r.similarConcepts?.length) {
      note.textContent += ` · similar concepts: ${r.similarConcepts.join(', ')}`;
    }
    host.appendChild(note);
  }

  private renderChat(): void {
    const wrap = document.createElement('div');
    wrap.className = 'vythera-ai-chat vas-view';
    const head = document.createElement('div');
    head.className = 'vas-view-head';
    head.innerHTML = `<h2>AI Chat</h2><p>Local models and VYTHERA tools only — cloud disabled.</p>`;
    this.feed = document.createElement('div');
    this.feed.className = 'mod-project-ai-feed';
    this.feed.appendChild(msgEl('assistant', 'VYTHERA AI is ready. I use local models + VYTHERA tools only — no cloud.'));
    this.input = document.createElement('textarea');
    this.input.className = 'mod-ai-input mod-project-ai-input';
    this.input.rows = 3;
    this.input.placeholder = 'Create a voxel dragon… Make wings larger… Glow when clicked…';
    const row = document.createElement('div');
    row.className = 'vas-chat-compose';
    const send = document.createElement('button');
    send.type = 'button';
    send.className = 'vas-btn vas-btn--primary';
    send.textContent = 'Send';
    send.addEventListener('click', () => void this.send());
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void this.send();
      }
    });
    row.append(this.input, send);
    const chips = document.createElement('div');
    chips.className = 'mod-project-ai-chips vas-row';
    chips.style.marginTop = '0.45rem';
    for (const c of [
      'Create a voxel dragon',
      'Make the wings larger',
      'When clicked, glow blue',
      'Give it a walking animation',
      'Remember VYTHERA creatures use chunky proportions',
    ]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mod-ai-chip vas-chip';
      b.textContent = c;
      b.addEventListener('click', () => {
        this.input.value = c;
        void this.send();
      });
      chips.appendChild(b);
    }
    wrap.append(head, this.feed, row, chips);
    this.panelHost.appendChild(wrap);
  }

  private renderMemory(): void {
    const ul = document.createElement('ul');
    ul.className = 'vythera-ai-list';
    for (const m of vytheraMemory.list().slice(0, 40)) {
      const li = document.createElement('li');
      li.textContent = `[${m.category}] ${m.text}`;
      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = 'Forget';
      del.addEventListener('click', () => {
        vytheraMemory.forget(m.id);
        this.renderTab();
      });
      li.appendChild(del);
      ul.appendChild(li);
    }
    this.panelHost.appendChild(ul);
  }

  private renderKnowledge(): void {
    const ul = document.createElement('ul');
    ul.className = 'vythera-ai-list';
    for (const d of vytheraKnowledge.list()) {
      const li = document.createElement('li');
      li.innerHTML = `<strong>${escapeHtml(d.title)}</strong><p>${escapeHtml(d.body.slice(0, 160))}</p>`;
      ul.appendChild(li);
    }
    const refresh = document.createElement('button');
    refresh.type = 'button';
    refresh.className = 'voxel-editor-btn';
    refresh.textContent = 'Re-ingest engine knowledge';
    refresh.addEventListener('click', () => {
      vytheraKnowledge.seedFromGame();
      this.renderTab();
      this.onNotify('Knowledge re-seeded from VYTHERA engine');
    });
    this.panelHost.append(ul, refresh);
  }

  private renderDataset(): void {
    const stats = vytheraDataset.stats();
    const head = document.createElement('p');
    head.textContent = `Candidates: ${stats.candidates} · Approved: ${stats.approved}`;
    const ul = document.createElement('ul');
    ul.className = 'vythera-ai-list';
    for (const s of vytheraDataset.candidates().slice(0, 20)) {
      const li = document.createElement('li');
      li.textContent = `${s.taskType}: ${s.instruction.slice(0, 80)}`;
      const ok = document.createElement('button');
      ok.type = 'button';
      ok.textContent = 'Approve';
      ok.addEventListener('click', () => {
        vytheraDataset.approve(s.id);
        this.renderTab();
      });
      const no = document.createElement('button');
      no.type = 'button';
      no.textContent = 'Reject';
      no.addEventListener('click', () => {
        vytheraDataset.reject(s.id);
        this.renderTab();
      });
      li.append(ok, no);
      ul.appendChild(li);
    }
    const exp = document.createElement('button');
    exp.type = 'button';
    exp.className = 'voxel-editor-btn';
    exp.textContent = 'Download approved JSONL';
    exp.addEventListener('click', () => {
      const blob = new Blob([vytheraDataset.exportApprovedJsonl()], { type: 'application/jsonl' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'vythera-dataset.jsonl';
      a.click();
    });
    this.panelHost.append(head, ul, exp);
  }

  private renderTraining(): void {
    const wrap = document.createElement('div');
    const section = (title: string) => {
      const h = document.createElement('h4');
      h.textContent = title;
      return h;
    };
    const pre = () => {
      const el = document.createElement('pre');
      el.className = 'vythera-ai-json';
      return el;
    };

    const systemEl = pre();
    systemEl.textContent = 'Probing local training daemon…';
    const modelsEl = pre();
    const datasetEl = pre();
    const trainingEl = pre();
    const versionEl = pre();
    const progressEl = document.createElement('p');
    progressEl.textContent = '';

    let lastDiskJobId: string | null =
      vytheraTraining.list().find((j) => j.diskJobId)?.diskJobId ?? null;

    const dash = vytheraVisualLearning.dashboard();
    const inference = vytheraVision.activeVisionModel() || '—';

    const trainable = document.createElement('input');
    trainable.className = 'mod-ai-input';
    trainable.placeholder = 'Trainable base (HF id / path) — not an Ollama tag';
    trainable.value = '';

    let modality: 'TEXT' | 'VISION_LANGUAGE' = 'TEXT';
    const modalityRow = document.createElement('div');
    modalityRow.className = 'mod-ai-compose';
    const textBtn = document.createElement('button');
    textBtn.type = 'button';
    textBtn.className = 'voxel-editor-btn';
    textBtn.textContent = '● TEXT';
    const visionBtn = document.createElement('button');
    visionBtn.type = 'button';
    visionBtn.className = 'voxel-editor-btn';
    visionBtn.textContent = '○ VISION-LANGUAGE';
    const syncModalityButtons = () => {
      textBtn.textContent = `${modality === 'TEXT' ? '●' : '○'} TEXT`;
      visionBtn.textContent = `${modality === 'VISION_LANGUAGE' ? '●' : '○'} VISION-LANGUAGE`;
    };
    textBtn.addEventListener('click', () => {
      modality = 'TEXT';
      syncModalityButtons();
      refreshModels();
    });
    visionBtn.addEventListener('click', () => {
      modality = 'VISION_LANGUAGE';
      if (!trainable.value.trim()) trainable.value = 'HuggingFaceTB/SmolVLM-256M-Instruct';
      syncModalityButtons();
      refreshModels();
    });
    modalityRow.append(textBtn, visionBtn);

    const refreshModels = () => {
      modelsEl.textContent = [
        '### MODELS',
        `Training modality: ${modality}`,
        `Inference Model`,
        `Ollama: ${inference}`,
        `Trainable Base Model`,
        `Transformers/Hugging Face: ${trainable.value.trim() || '(set below)'}`,
        `Adapter`,
        dash.activeAdapter?.name ?? 'VYTHERA-VISION-BASE',
      ].join('\n');
    };
    refreshModels();
    trainable.addEventListener('input', refreshModels);

    datasetEl.textContent = [
      '### DATASET',
      `Version: ${dash.dataset.versions}`,
      `Samples (approved): ${dash.dataset.approved}`,
      `Training: ${dash.dataset.training}`,
      `Validation: ${dash.dataset.validation}`,
      `Held-out: ${dash.dataset.heldOut}`,
      `Images: local store (export includes bytes when vision modality)`,
      `Readiness: ${dash.readiness.ready ? 'ready' : dash.readiness.reason}`,
    ].join('\n');

    versionEl.textContent = [
      '### MODEL VERSION',
      `BASE: VYTHERA-VISION-BASE`,
      `CANDIDATE: (after training)`,
      `EVALUATED: (after evaluate)`,
      `ACTIVE: ${dash.activeAdapter?.name ?? 'VYTHERA-VISION-BASE'}`,
    ].join('\n');

    void probeTrainingCapability().then((cap) => {
      const L = cap.local;
      const pkg = L?.packages ?? {};
      const privacy = loadVytheraAISettings().privacyMode !== false;
      const privEl = this.root.querySelector('[data-privacy]');
      if (privEl) privEl.textContent = `PRIVACY MODE: ${privacy ? 'ON' : 'OFF'}`;
      const trainEl = this.root.querySelector('[data-train-svc]');
      if (trainEl) {
        trainEl.textContent = L?.daemonOnline
          ? `${PRIVACY_SAFE_STATUS.daemonLabel}: CONNECTED`
          : `${PRIVACY_SAFE_STATUS.daemonLabel}: OFFLINE`;
      }
      systemEl.textContent = [
        '### SYSTEM',
        `Daemon: ${L?.daemonOnline ? 'online' : 'offline'}`,
        `CPU: ${L?.system?.cpu ?? '—'}`,
        `RAM: ${L?.system?.ramMb != null ? `${L.system.ramMb} MB` : '—'}`,
        `Python: ${L?.python?.available ? `OK ${L.python.version ?? ''}` : 'MISSING'}`,
        `PyTorch: ${pkg.torch ? `OK ${pkg.torchVersion ?? ''}` : 'MISSING'}`,
        `GPU: ${L?.gpu?.detected || L?.gpu?.available ? `OK ${L.gpu.name ?? ''}` : 'MISSING'}`,
        `VRAM: ${L?.gpu?.vramMb != null ? `${L.gpu.vramMb} MB` : '—'}`,
        `CUDA runtime: ${L?.cuda?.runtimeAvailable ? `OK ${L.cuda.runtimeVersion ?? ''}` : L?.cuda?.available ? `OK ${L.cuda.version ?? ''}` : 'MISSING'}`,
        `CUDA toolkit: ${L?.cuda?.toolkitAvailable ? `OK ${L.cuda.toolkitVersion ?? ''}` : 'MISSING'}`,
        `PyTorch CUDA: ${L?.cuda?.pytorchCudaAvailable ? `OK ${L.cuda.pytorchCudaVersion ?? ''}` : 'MISSING'}`,
        `PEFT: ${pkg.peft ? 'OK' : 'MISSING'}`,
        `BitsAndBytes: ${pkg.bitsandbytes ? 'OK' : 'MISSING'}`,
        `Backend: ${L?.backend?.note ?? L?.backend?.method ?? '—'}`,
        `Modalities: ${(L?.supportedModalities ?? []).join(', ') || 'none'}`,
        sanitizeForDisplay(cap.message, { privacyMode: privacy }),
        ...(L?.lines ?? []).map((l) => sanitizeForDisplay(l, { privacyMode: privacy })),
      ].join('\n');
      trainingEl.textContent = [
        '### TRAINING',
        `Capability: ${cap.available ? 'READY' : 'LOCAL TRAINING BACKEND NOT AVAILABLE'}`,
        `Preflight: run on START TRAINING`,
        `Job: ${lastDiskJobId ?? '—'}`,
        `Progress / Loss / Output: select a disk job below`,
      ].join('\n');
      this.lastStageLabel = String(cap.stage).replace(/_/g, ' ');
    });

    const row = document.createElement('div');
    row.className = 'mod-ai-compose';
    const mk = (label: string, fn: () => void, enabled = true) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'voxel-editor-btn';
      b.textContent = label;
      b.disabled = !enabled;
      b.addEventListener('click', fn);
      row.appendChild(b);
      return b;
    };

    mk('EXPORT DATASET', () => {
      const blob = new Blob([vytheraVisualDataset.exportBackup()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'vythera-visual-backup.json';
      a.click();
      this.onNotify('Dataset backup downloaded (local file only)');
    });

    mk('START TRAINING', () => {
      const base = trainable.value.trim();
      if (!base) {
        this.onNotify('MODEL NOT TRAINABLE WITH CURRENT LOCAL BACKEND — enter a HF/Transformers base');
        return;
      }
      void import('../vision/learning/VytheraTrainingCapability').then(({ isOllamaTagNotTrainable }) => {
        if (isOllamaTagNotTrainable(base)) {
          this.onNotify('MODEL NOT TRAINABLE WITH CURRENT LOCAL BACKEND (Ollama/GGUF is inference-only)');
          return;
        }
        void vytheraVisualLearning
          .requestTrainAdapt({
            baseVisionModel: vytheraVision.activeVisionModel(),
            trainableBaseModel: base,
            modality,
            autoStart: true,
          })
          .then((res) => {
            this.lastStageLabel = res.stageLabel;
            this.onNotify(res.message);
            const j = vytheraTraining.list().find((x) => x.id === res.trainingJobId);
            lastDiskJobId = j?.diskJobId ?? lastDiskJobId;
            this.renderTab();
          });
      });
    });

    mk('PREFLIGHT', () => {
      this.onNotify(
        modality === 'VISION_LANGUAGE'
          ? 'Preflight runs automatically on START TRAINING (VLM + VRAM checks).'
          : 'Preflight runs automatically on START TRAINING.',
      );
    });

    mk('CANCEL', () => {
      if (!lastDiskJobId) {
        this.onNotify('No disk job id');
        return;
      }
      void trainDaemonJobAction(lastDiskJobId, 'cancel')
        .then(() => {
          this.onNotify('CANCEL requested');
          this.renderTab();
        })
        .catch((e) => this.onNotify(e instanceof Error ? e.message : 'Cancel failed'));
    });

    mk('EVALUATE', () => {
      if (!lastDiskJobId) {
        this.onNotify('No job to evaluate');
        return;
      }
      void trainDaemonJobAction(lastDiskJobId, 'evaluate')
        .then((r) => {
          this.onNotify(JSON.stringify(r).slice(0, 160));
          this.renderTab();
        })
        .catch((e) => this.onNotify(e instanceof Error ? e.message : 'Evaluate failed'));
    });

    mk('PROMOTE', () => {
      if (!lastDiskJobId) {
        this.onNotify('No job to promote');
        return;
      }
      void trainDaemonJobAction(lastDiskJobId, 'promote')
        .then((r) => {
          const ok = (r as { ok?: boolean }).ok;
          this.onNotify(ok ? 'MODEL PROMOTED (active pointer updated)' : JSON.stringify(r).slice(0, 160));
          this.renderTab();
        })
        .catch((e) => this.onNotify(e instanceof Error ? e.message : 'Promote failed'));
    });

    mk('ROLLBACK', () => {
      const name = window.prompt('Adapter folder name under ./adapters/');
      if (!name) return;
      void trainDaemonRollback(name)
        .then((r) => {
          this.onNotify(JSON.stringify(r).slice(0, 160));
          this.renderTab();
        })
        .catch((e) => this.onNotify(e instanceof Error ? e.message : 'Rollback failed'));
    });

    const diskJobs = document.createElement('ul');
    diskJobs.className = 'vythera-ai-list';
    void trainDaemonListJobs()
      .then(({ jobs }) => {
        for (const raw of jobs.slice(0, 12)) {
          const j = raw as {
            id: string;
            status: string;
            progress?: { message?: string; loss?: number };
            isMock?: boolean;
            error?: string;
            outputPath?: string;
            modality?: string;
          };
          const li = document.createElement('li');
          li.textContent = `${j.id} · ${j.status}${j.isMock ? ' · MOCK' : ''}${
            j.modality ? ` · ${j.modality}` : ''
          }${j.progress?.message ? ` · ${j.progress.message}` : ''}${
            j.progress?.loss != null ? ` · loss=${j.progress.loss}` : ''
          }${j.error ? ` · ${j.error}` : ''}`;
          li.addEventListener('click', () => {
            lastDiskJobId = j.id;
            void trainDaemonGetJob(j.id).then(({ job }) => {
              progressEl.textContent = '';
              trainingEl.textContent = [
                '### TRAINING',
                `Capability: (see SYSTEM)`,
                `Preflight: see job log`,
                `Job: ${job.id}`,
                `Status: ${job.status}`,
                `Progress: ${JSON.stringify(job.progress ?? null)}`,
                `Loss: ${(job.progress as { loss?: number } | null)?.loss ?? '—'}`,
                `Output: ${job.outputPath ?? '—'}`,
                `Modality: ${job.modality ?? '—'}`,
                `isMock: ${job.isMock ? 'yes (tests only)' : 'no'}`,
              ].join('\n');
            });
          });
          diskJobs.appendChild(li);
        }
      })
      .catch(() => {
        const li = document.createElement('li');
        li.textContent = 'LOCAL TRAINING SERVICE OFFLINE — npm run vythera:train:setup && npm run vythera:train:daemon';
        diskJobs.appendChild(li);
      });

    const adapters = document.createElement('ul');
    adapters.className = 'vythera-ai-list';
    for (const a of listVisionAdapters()) {
      const li = document.createElement('li');
      li.textContent = `${a.name} · ${a.lifecycle} · score ${a.evaluationScore ?? '—'}`;
      adapters.appendChild(li);
    }

    const warn = document.createElement('p');
    warn.textContent =
      'Ollama inference ≠ trainable Transformers model. Saving an image ≠ training. Text descriptions ≠ vision-model training. Progress comes from the trainer only.';

    wrap.append(
      section('SYSTEM'),
      systemEl,
      section('TRAINING MODALITY'),
      modalityRow,
      section('MODELS'),
      modelsEl,
      labelWrap('Trainable base', trainable),
      section('DATASET'),
      datasetEl,
      section('TRAINING'),
      trainingEl,
      row,
      progressEl,
      section('MODEL VERSION'),
      versionEl,
      section('Disk jobs'),
      diskJobs,
      section('Studio adapter registry'),
      adapters,
      warn,
    );
    this.panelHost.appendChild(wrap);
  }

  private renderEval(): void {
    const fixtures: Record<string, unknown> = {
      voxel_sparse: {
        type: 'voxel_model',
        voxels: [{ x: 16, y: 4, z: 16, color: [80, 80, 90, 255] }],
      },
      behavior_click_glow: {
        type: 'behavior_graph',
        nodes: [{ id: 'n1', trigger: 'Click', action: 'Glow', parameters: {} }],
      },
      anim_walk: { type: 'animation', name: 'walk', duration: 1, keyframes: [] },
      palette_moss: { type: 'palette', name: 'Moss', colors: [[40, 60, 40, 255]] },
    };
    const report = vytheraEvaluation.runOfflineFixtures(fixtures, 'schema-fixtures');
    const p = document.createElement('p');
    p.textContent = `Offline schema pass rate: ${(report.passRate * 100).toFixed(0)}% (does not equal a fine-tuned model score)`;
    const ul = document.createElement('ul');
    for (const s of report.scores) {
      const li = document.createElement('li');
      li.textContent = `${s.passed ? '✓' : '✗'} ${s.caseId}: ${s.reason}`;
      ul.appendChild(li);
    }
    this.panelHost.append(p, ul);
  }

  private renderModels(): void {
    this.modelSelect = document.createElement('select');
    this.modelSelect.className = 'mod-local-ai-model-select';
    for (const m of vytheraAI.getModelManager().list()) {
      const o = document.createElement('option');
      const caps = m.capabilities.join(',');
      o.value = m.name;
      o.textContent = `${m.name} [${m.lifecycle}] ${caps}`;
      if (m.name === vytheraAI.getModelManager().activeName()) o.selected = true;
      this.modelSelect.appendChild(o);
    }
    this.modelSelect.addEventListener('change', () => {
      vytheraAI.getModelManager().setActive(this.modelSelect.value);
      this.onNotify(`Active model: ${this.modelSelect.value}`);
    });

    const visionBackendSelect = document.createElement('select');
    visionBackendSelect.className = 'mod-local-ai-model-select';
    const activeBackend = vytheraVision.activeBackendId();
    for (const b of vytheraVision.listBackends()) {
      const o = document.createElement('option');
      o.value = b.id;
      o.textContent = b.name;
      if (b.id === activeBackend) o.selected = true;
      visionBackendSelect.appendChild(o);
    }
    visionBackendSelect.addEventListener('change', () => {
      if (vytheraVision.setBackendById(visionBackendSelect.value)) {
        this.onNotify(`Vision backend: ${visionBackendSelect.value}`);
        void vytheraVision.refresh().then(() => this.renderTab());
      }
    });

    const visionLine = document.createElement('p');
    const hasV = vytheraAI.getModelManager().hasVisionModel() || vytheraVision.getVisionModels().length > 0;
    const activeV = vytheraVision.activeVisionModel() || '—';
    visionLine.textContent = hasV
      ? `VISION MODEL: Installed · ACTIVE VISION MODEL: ${activeV}`
      : 'VISION MODEL: Missing — never assume the chat model can process images';

    const visionSelect = document.createElement('select');
    visionSelect.className = 'mod-local-ai-model-select';
    const vModels = vytheraVision.getVisionModels();
    if (!vModels.length) {
      const o = document.createElement('option');
      o.textContent = 'No local vision model';
      visionSelect.appendChild(o);
      visionSelect.disabled = true;
    } else {
      for (const name of vModels) {
        const o = document.createElement('option');
        o.value = name;
        o.textContent = name;
        if (name === activeV) o.selected = true;
        visionSelect.appendChild(o);
      }
      visionSelect.addEventListener('change', () => {
        vytheraVision.setActiveVisionModel(visionSelect.value);
        this.onNotify(`Active vision model: ${visionSelect.value}`);
        this.renderTab();
      });
    }

    const backends = document.createElement('p');
    backends.textContent =
      `Active vision stack: ${vytheraVision.listBackends().find((b) => b.id === vytheraVision.activeBackendId())?.name ?? '—'} · ${PRIVACY_SAFE_STATUS.daemonLabel} required for Local VLM + Adapter`;
    this.panelHost.append(
      labelWrap('Chat / text model', this.modelSelect),
      labelWrap('Vision backend', visionBackendSelect),
      visionLine,
      labelWrap('Vision model', visionSelect),
      backends,
    );
  }

  private renderTools(): void {
    const ul = document.createElement('ul');
    ul.className = 'vythera-ai-list';
    for (const t of vytheraTools.list()) {
      const li = document.createElement('li');
      li.textContent = `[${t.permission}] ${t.name} — ${t.description}`;
      ul.appendChild(li);
    }
    this.panelHost.appendChild(ul);
  }

  private renderSettings(): void {
    const s = loadVytheraAISettings();
    const note = document.createElement('p');
    note.className = 'mod-ai-subtitle';
    note.textContent =
      'Backend host/port stay internal. UI never shows network addresses. Privacy Mode is ON by default.';

    const privacyLab = document.createElement('label');
    const privacyCb = document.createElement('input');
    privacyCb.type = 'checkbox';
    privacyCb.checked = s.privacyMode !== false;
    privacyLab.append(privacyCb, document.createTextNode(' PRIVACY MODE'));

    const diagLab = document.createElement('label');
    const diagCb = document.createElement('input');
    diagCb.type = 'checkbox';
    diagCb.checked = !!s.developerDiagnostics;
    diagLab.append(diagCb, document.createTextNode(' Developer diagnostics (explicit only)'));

    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'voxel-editor-btn';
    save.textContent = 'Save privacy settings';
    save.addEventListener('click', () => {
      try {
        saveVytheraAISettings({
          ...s,
          privacyMode: privacyCb.checked,
          developerDiagnostics: diagCb.checked,
          // Host remains loopback-only via sanitizeVytheraHost
          backendHost: '127.0.0.1',
          backendPort: s.backendPort || 11434,
        });
        const privEl = this.root.querySelector('[data-privacy]');
        if (privEl) privEl.textContent = `PRIVACY MODE: ${privacyCb.checked ? 'ON' : 'OFF'}`;
        this.onNotify('VYTHERA AI privacy settings saved');
        void this.refresh();
      } catch (e) {
        this.onNotify(sanitizeUserFacingError(e, 'Blocked'));
      }
    });
    this.panelHost.append(note, privacyLab, diagLab, save);
  }

  private async refresh(): Promise<void> {
    const state = await vytheraAI.refresh();
    const privacy = loadVytheraAISettings().privacyMode !== false;
    this.connEl.dataset.state = state === 'CONNECTED' ? 'ok' : state === 'BUSY' ? 'warn' : 'off';
    const connLabel = this.connEl.querySelector('span:last-child');
    if (connLabel) connLabel.textContent = STATUS[state]?.replace(/^●\s*/, '') ?? state;
    this.connEl.classList.toggle('is-offline', state === 'OFFLINE' || state === 'NO_MODEL');

    const setPill = (key: string, st: 'ok' | 'warn' | 'off' | 'err') => {
      const el = this.root.querySelector(`[data-pill="${key}"]`) as HTMLElement | null;
      if (el) el.dataset.state = st;
    };
    setPill('chat', state === 'CONNECTED' ? 'ok' : state === 'BUSY' ? 'warn' : 'off');
    setPill('privacy', privacy ? 'ok' : 'warn');

    const privEl = this.root.querySelector('[data-privacy]');
    if (privEl) privEl.textContent = privacy ? 'Privacy On' : 'Privacy Off';

    const dash = vytheraVisualLearning.dashboard();
    const dsEl = this.root.querySelector('[data-bottom-dataset]');
    if (dsEl) {
      dsEl.textContent = `Dataset ${dash.dataset.approved} approved · v${dash.dataset.versions}`;
    }

    void probeTrainingCapability().then((cap) => {
      const online = !!cap.local?.daemonOnline;
      const gpu = !!(cap.local?.gpu?.detected || cap.local?.gpu?.available);
      setPill('train', online ? (cap.available ? 'ok' : 'warn') : 'off');
      setPill('gpu', gpu ? 'ok' : 'off');
      const trainEl = this.root.querySelector('[data-train-svc]');
      if (trainEl) {
        trainEl.textContent = online
          ? `${PRIVACY_SAFE_STATUS.daemonLabel}: Ready`
          : `${PRIVACY_SAFE_STATUS.daemonLabel}: Idle`;
      }
      const chatEl = this.root.querySelector('[data-chat-svc]');
      if (chatEl) {
        chatEl.textContent =
          state === 'CONNECTED'
            ? `${PRIVACY_SAFE_STATUS.ollamaLabel}: Online`
            : `${PRIVACY_SAFE_STATUS.ollamaLabel}: Offline`;
      }
    });
  }

  private renderPrivacy(): void {
    const wrap = document.createElement('div');
    wrap.className = 'vas-view';
    wrap.innerHTML = `
      <div class="vas-view-head">
        <h2>Privacy</h2>
        <p>Local-only controls. No IP addresses, hostnames, or absolute paths are shown here.</p>
      </div>`;
    const grid = document.createElement('div');
    grid.className = 'vas-privacy-grid';
    const privacy = loadVytheraAISettings().privacyMode !== false;
    const cards: Array<[string, string]> = [
      ['Privacy Mode', privacy ? 'ON' : 'OFF'],
      ['Local Only', '✓'],
      ['Cloud Training', 'OFF'],
      ['Telemetry', 'OFF'],
      ['Image Metadata', 'STRIPPED ON INGEST'],
      ['Network Exposure', 'LOOPBACK ONLY'],
      ['Chat Service', PRIVACY_SAFE_STATUS.ollamaLabel],
      ['Training Daemon', PRIVACY_SAFE_STATUS.daemonLabel],
    ];
    for (const [k, v] of cards) {
      const c = document.createElement('div');
      c.className = 'vas-privacy-card';
      c.innerHTML = `<div class="k">${k}</div><div class="v">${v}</div>`;
      grid.appendChild(c);
    }
    const note = document.createElement('p');
    note.className = 'mod-ai-subtitle';
    note.style.marginTop = '0.75rem';
    note.textContent =
      'Persisted logs redact paths and secrets. Process internals may still use real local paths.';
    wrap.append(grid, note);
    this.panelHost.appendChild(wrap);
  }

  private cancel(): void {
    this.abort?.abort();
    vytheraAI.cancel();
    vytheraVision.cancel();
    this.busy = false;
    (this.root.querySelector('[data-ai-cancel]') as HTMLElement).hidden = true;
    this.statusEl.textContent = 'Cancelled';
  }

  private async send(): Promise<void> {
    const text = this.input.value.trim();
    if (!text || this.busy) return;
    const host = this.getHost?.();
    if (!host) {
      this.feed.appendChild(msgEl('assistant', 'Open the VYTHERA voxel editor first.'));
      return;
    }
    this.input.value = '';
    this.feed.appendChild(msgEl('user', text));
    this.busy = true;
    (this.root.querySelector('[data-ai-cancel]') as HTMLElement).hidden = false;
    this.abort = new AbortController();
    try {
      await this.refresh();
      const st = vytheraAI.getConnection();
      if (st === 'OFFLINE') {
        this.feed.appendChild(
          msgEl('assistant', 'VYTHERA AI OFFLINE — start local chat service (Ollama)'),
        );
        return;
      }
      if (st === 'NO_MODEL') {
        this.feed.appendChild(msgEl('assistant', 'VYTHERA AI — LOCAL MODEL REQUIRED'));
        return;
      }
      const result = await vytheraAI.chat(host, text, {
        signal: this.abort.signal,
        onProgress: (p) => {
          this.statusEl.textContent = p.message;
        },
      });
      this.feed.appendChild(
        msgEl(
          'assistant',
          `${result.summary}${result.toolCalls.length ? ` · tools: ${result.toolCalls.map((t) => t.name).join(', ')}` : ''}`,
        ),
      );
      this.onNotify(result.summary);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed';
      this.feed.appendChild(msgEl('assistant', msg));
      this.onNotify(msg);
    } finally {
      this.busy = false;
      (this.root.querySelector('[data-ai-cancel]') as HTMLElement).hidden = true;
      this.abort = null;
      this.statusEl.textContent = '';
      void this.refresh();
    }
  }
}

function msgEl(role: string, text: string): HTMLElement {
  const d = document.createElement('div');
  d.className = `mod-ai-msg mod-ai-msg--${role}`;
  d.textContent = text;
  return d;
}

function labelWrap(label: string, el: HTMLElement): HTMLElement {
  const l = document.createElement('label');
  l.className = 'mod-ai-field';
  l.textContent = label;
  l.appendChild(el);
  return l;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
