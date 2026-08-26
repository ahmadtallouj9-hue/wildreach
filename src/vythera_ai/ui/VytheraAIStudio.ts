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
import { listVisualConcepts } from '../vision/learning/VytheraVisualConcepts';

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
  | 'SETTINGS';

const STATUS: Record<string, string> = {
  CONNECTED: '● CONNECTED',
  OFFLINE: '● OFFLINE',
  NO_MODEL: '● LOCAL MODEL REQUIRED',
  BUSY: '● BUSY',
  ERROR: '● ERROR',
};

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
  private tab: Tab = 'CHAT';
  private busy = false;
  private abort: AbortController | null = null;
  private getHost: (() => VytheraEditorHost) | null = null;
  private onNotify: (msg: string) => void;
  private imageMode: VytheraImageMode = 'UNDERSTAND';
  private imagePreviewUrl: string | null = null;
  private imageMeta: { hash: string; fileName: string; palette: unknown; teachId?: string } | null =
    null;
  private learnTargets = { ...DEFAULT_LEARN_TARGETS };
  private lastStageLabel = '';

  constructor(_onExecute: (actions: unknown[]) => void, onNotify: (msg: string) => void) {
    this.onNotify = onNotify;
    this.root = document.createElement('div');
    this.root.className = 'mod-project-ai vythera-ai-studio';
    this.root.innerHTML = `
      <header class="mod-ai-header mod-ai-header--sub">
        <div class="mod-ai-brand">
          <span class="mod-ai-orb" aria-hidden="true">◈</span>
          <div>
            <p class="voxel-editor-label mod-ai-title">VYTHERA AI</p>
            <p class="mod-ai-subtitle">Game intelligence · local · tool-mediated</p>
          </div>
        </div>
        <div class="mod-ai-header-actions">
          <button type="button" class="mod-ai-cancel-btn" data-ai-cancel hidden>Cancel</button>
        </div>
      </header>
      <div class="mod-local-ai-status">
        <span class="mod-local-ai-conn" data-conn>● Checking…</span>
        <span>Backend: Ollama</span>
        <span>Host: 127.0.0.1:11434</span>
        <span class="mod-local-ai-cloud">Cloud: DISABLED</span>
      </div>
      <div class="vythera-ai-tabs" role="tablist"></div>
      <div class="vythera-ai-panel"></div>
      <p class="mod-project-ai-status" aria-live="polite"></p>
    `;
    this.connEl = this.root.querySelector('[data-conn]') as HTMLElement;
    this.statusEl = this.root.querySelector('.mod-project-ai-status') as HTMLElement;
    this.tabHost = this.root.querySelector('.vythera-ai-tabs') as HTMLElement;
    this.panelHost = this.root.querySelector('.vythera-ai-panel') as HTMLElement;
    this.feed = document.createElement('div');
    this.input = document.createElement('textarea');
    this.modelSelect = document.createElement('select');

    this.buildTabs();
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
      'SETTINGS',
    ];
  }

  private buildTabs(): void {
    for (const t of this.allTabs()) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'vythera-ai-tab';
      b.textContent =
        t === 'IMAGE' ? 'TEACH VYTHERA' : t === 'TRAINING' ? 'TRAIN / ADAPT' : t;
      b.addEventListener('click', () => {
        this.tab = t;
        this.renderTab();
      });
      this.tabHost.appendChild(b);
    }
  }

  private renderTab(): void {
    const tabs = this.allTabs();
    this.tabHost.querySelectorAll('.vythera-ai-tab').forEach((el, i) => {
      el.classList.toggle('is-active', tabs[i] === this.tab);
    });
    this.panelHost.replaceChildren();
    if (this.tab === 'CHAT') this.renderChat();
    else if (this.tab === 'IMAGE') this.renderImageLearning();
    else if (this.tab === 'MEMORY') this.renderMemory();
    else if (this.tab === 'KNOWLEDGE') this.renderKnowledge();
    else if (this.tab === 'DATASET') this.renderDataset();
    else if (this.tab === 'TRAINING') this.renderTraining();
    else if (this.tab === 'EVALUATION') this.renderEval();
    else if (this.tab === 'MODELS') this.renderModels();
    else if (this.tab === 'TOOLS') this.renderTools();
    else this.renderSettings();
  }

  private renderImageLearning(): void {
    const wrap = document.createElement('div');
    wrap.className = 'vythera-ai-image';
    const dash = vytheraVisualLearning.dashboard();
    const stage = document.createElement('p');
    stage.className = 'vythera-ai-stage';
    stage.textContent = this.lastStageLabel
      ? `Stage: ${this.lastStageLabel}`
      : 'Stages: Reference Memory → Learning Dataset → Train/Adapt → Evaluate → Promote';

    const note = document.createElement('p');
    note.className = 'mod-ai-subtitle';
    note.textContent =
      'TEACH VYTHERA · local only · saving a reference is NOT model training';

    const visionStatus = document.createElement('p');
    const vs = vytheraVision.getStatus();
    const activeV = vytheraVision.activeVisionModel() || '—';
    visionStatus.textContent =
      vs === 'READY'
        ? `VISION MODEL: Installed · ACTIVE: ${activeV}`
        : vs === 'NO_VISION_MODEL'
          ? 'VISION MODEL: Missing — LOCAL VISION MODEL NOT INSTALLED'
          : `VISION MODEL: ${vs}`;

    const stats = document.createElement('p');
    stats.textContent = `Dataset: ${dash.dataset.approved} approved · ${dash.dataset.training} train · ${dash.dataset.validation} val · concepts ${dash.concepts} · refs ${listImageRefs().length}`;

    const drop = document.createElement('div');
    drop.className = 'vythera-ai-image-drop';
    drop.textContent = 'Drop Image Here (PNG / JPG / WEBP)';
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

    const fileBtn = document.createElement('button');
    fileBtn.type = 'button';
    fileBtn.className = 'voxel-editor-btn';
    fileBtn.textContent = 'Choose Local Image';
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp';
    fileInput.hidden = true;
    fileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const f = fileInput.files?.[0];
      if (f) void this.loadImageFile(f, preview, paletteEl);
    });
    const pasteBtn = document.createElement('button');
    pasteBtn.type = 'button';
    pasteBtn.className = 'voxel-editor-btn';
    pasteBtn.textContent = 'Paste Clipboard Image';
    pasteBtn.addEventListener('click', () => void this.pasteClipboardImage(preview, paletteEl));

    const preview = document.createElement('img');
    preview.className = 'vythera-ai-image-preview';
    preview.alt = 'Local image preview';
    if (this.imagePreviewUrl) preview.src = this.imagePreviewUrl;
    else preview.hidden = true;

    const paletteEl = document.createElement('pre');
    paletteEl.className = 'vythera-ai-json';
    if (this.imageMeta?.palette) paletteEl.textContent = JSON.stringify(this.imageMeta.palette, null, 2);

    const modes = document.createElement('div');
    modes.className = 'mod-project-ai-chips';
    for (const m of [
      { id: 'UNDERSTAND' as VytheraImageMode, label: 'Understand' },
      { id: 'RECREATE' as VytheraImageMode, label: 'Recreate' },
      { id: 'LEARN_STYLE' as VytheraImageMode, label: 'Learn Style' },
      { id: 'REFERENCE' as VytheraImageMode, label: 'Reference' },
      { id: 'EXTRACT_ASSET' as VytheraImageMode, label: 'Extract Asset' },
    ]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mod-ai-chip';
      b.textContent = m.label;
      b.classList.toggle('is-active', this.imageMode === m.id);
      b.addEventListener('click', () => {
        this.imageMode = m.id;
        this.renderTab();
      });
      modes.appendChild(b);
    }

    const understand = document.createElement('pre');
    understand.className = 'vythera-ai-json';
    const last = vytheraVision.last();
    understand.textContent = last?.analysis
      ? JSON.stringify(last.analysis, null, 2)
      : 'AI Understanding will appear here after Analyze.';

    const corrections = document.createElement('textarea');
    corrections.className = 'mod-ai-input';
    corrections.rows = 3;
    corrections.placeholder =
      'Corrections: This is grass, not moss. Ignore the background. Use this exact voxel style…';

    const learnBox = document.createElement('div');
    learnBox.className = 'vythera-ai-learn-targets';
    const targetKeys: (keyof typeof this.learnTargets)[] = [
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
    actions.className = 'mod-ai-compose';
    const mk = (label: string, fn: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'voxel-editor-btn';
      b.textContent = label;
      b.addEventListener('click', fn);
      actions.appendChild(b);
    };
    mk('Analyze', () => void this.runImageAnalyze('', resultHost, understand));
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
    mk('REJECT', () => {
      const id = this.imageMeta?.teachId ?? vytheraVision.getActiveTeachExample()?.id;
      if (!id) return;
      const res = vytheraVisualLearning.reject(id, corrections.value || 'user rejected');
      if (res) {
        this.lastStageLabel = res.stageLabel;
        this.onNotify(res.message);
        this.renderTab();
      }
    });
    mk('SAVE AS REFERENCE', () => {
      const id = this.imageMeta?.teachId ?? vytheraVision.getActiveTeachExample()?.id;
      if (!id) return;
      void vytheraVisualLearning.saveAsReference(id).then((res) => {
        if (!res) return;
        this.lastStageLabel = res.stageLabel;
        this.onNotify(res.message);
      });
    });
    mk('ADD TO DATASET', () => {
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
    mk('TRAIN / ADAPT', () => {
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

    const h1 = document.createElement('h4');
    h1.textContent = 'AI Understanding';
    const h2 = document.createElement('h4');
    h2.textContent = 'Corrections';
    const h3 = document.createElement('h4');
    h3.textContent = 'Learn';
    const concepts = document.createElement('p');
    concepts.textContent =
      'Runtime concepts: ' +
      listVisualConcepts()
        .slice(0, 6)
        .map((c) => c.name)
        .join(', ');

    wrap.append(
      note,
      stage,
      visionStatus,
      stats,
      drop,
      fileBtn,
      pasteBtn,
      fileInput,
      preview,
      modes,
      h1,
      understand,
      h2,
      corrections,
      h3,
      learnBox,
      actions,
      resultHost,
      concepts,
    );
    this.panelHost.appendChild(wrap);
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
      };
      paletteEl.textContent = JSON.stringify(loaded.palette, null, 2);
      this.lastStageLabel = LEARNING_STAGE_LABELS.REFERENCE_SAVED;
      this.onNotify(`IMPORTED · hash ${loaded.hash.slice(0, 8)}… · not training data yet`);
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
    wrap.className = 'vythera-ai-chat';
    this.feed = document.createElement('div');
    this.feed.className = 'mod-project-ai-feed';
    this.feed.appendChild(msgEl('assistant', 'VYTHERA AI is ready. I use local models + VYTHERA tools only — no cloud.'));
    this.input = document.createElement('textarea');
    this.input.className = 'mod-ai-input mod-project-ai-input';
    this.input.rows = 3;
    this.input.placeholder = 'Create a voxel dragon… Make wings larger… Glow when clicked…';
    const row = document.createElement('div');
    row.className = 'mod-ai-compose';
    const send = document.createElement('button');
    send.type = 'button';
    send.className = 'voxel-editor-btn mod-ai-add';
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
    chips.className = 'mod-project-ai-chips';
    for (const c of [
      'Create a voxel dragon',
      'Make the wings larger',
      'When clicked, glow blue',
      'Give it a walking animation',
      'Remember VYTHERA creatures use chunky proportions',
    ]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mod-ai-chip';
      b.textContent = c;
      b.addEventListener('click', () => {
        this.input.value = c;
        void this.send();
      });
      chips.appendChild(b);
    }
    wrap.append(this.feed, row, chips);
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
        cap.message,
        ...(L?.lines ?? []),
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
        li.textContent = 'Daemon offline — npm run vythera:train:setup && npm run vythera:train:daemon';
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
      `Active vision stack: ${vytheraVision.listBackends().find((b) => b.id === vytheraVision.activeBackendId())?.name ?? '—'} · Daemon must be running for Local VLM + Adapter`;
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
    const host = document.createElement('input');
    host.value = s.backendHost;
    const port = document.createElement('input');
    port.type = 'number';
    port.value = String(s.backendPort);
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'voxel-editor-btn';
    save.textContent = 'Save';
    save.addEventListener('click', () => {
      try {
        saveVytheraAISettings({ ...s, backendHost: host.value.trim(), backendPort: Number(port.value) });
        this.onNotify('VYTHERA AI settings saved');
        void this.refresh();
      } catch (e) {
        this.onNotify(e instanceof Error ? e.message : 'Blocked');
      }
    });
    this.panelHost.append(labelWrap('Host', host), labelWrap('Port', port), save);
  }

  private async refresh(): Promise<void> {
    const state = await vytheraAI.refresh();
    this.connEl.textContent = STATUS[state] ?? state;
    this.connEl.classList.toggle('is-offline', state === 'OFFLINE' || state === 'NO_MODEL');
    const vs = vytheraVision.getStatus();
    if (vs === 'NO_VISION_MODEL' && this.tab === 'IMAGE') {
      /* status already shown in IMAGE panel */
    }
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
        this.feed.appendChild(msgEl('assistant', 'VYTHERA AI OFFLINE — start Ollama at 127.0.0.1:11434'));
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
