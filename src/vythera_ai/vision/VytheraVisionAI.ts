import { extractVytheraJson } from '../util/extractJson';
import { loadVytheraAISettings, saveVytheraAISettings } from '../inference/VytheraAISettings';
import type { VytheraVisionBackend, VytheraVisionImage } from './VytheraVisionBackend';
import { VytheraOllamaVisionBackend } from './VytheraOllamaVisionBackend';
import {
  VytheraMockVisionBackend,
  VytheraONNXVisionBackend,
  VytheraTransformersVisionBackend,
} from './VytheraVisionAltBackends';
import { VytheraDaemonVlmBackend } from './VytheraDaemonVlmBackend';
import {
  validateImageAnalysis,
  VISION_ANALYSIS_SYSTEM,
  type VytheraImageAnalysis,
} from './VytheraImageAnalysis';
import {
  extractPaletteFromFile,
  type VytheraExtractedPalette,
} from './VytheraLocalPalette';
import {
  ingestLocalImageFile,
  registerImageReference,
  type VytheraImageRef,
} from './VytheraImageStore';
import {
  createStyleExample,
  type VytheraStyleExample,
} from './VytheraStyleExamples';
import {
  diffAnalyses,
  planVoxelFromAnalysis,
  scaffoldVoxelsFromPlan,
  type VytheraImageDiff,
  type VytheraVoxelPlan,
} from './VytheraImageToVoxel';
import { vytheraDataset } from '../dataset/VytheraDatasetManager';
import { vytheraKnowledge } from '../knowledge/VytheraKnowledgeBase';
import type { VytheraEditorHost } from '../host/VytheraEditorHost';
import { vytheraTools } from '../tools/VytheraAIToolRegistry';
import { getCachedAnalysis, putCachedAnalysis } from './learning/VytheraAnalysisCache';
import { findSimilarConcepts } from './learning/VytheraVisualConcepts';
import { ensureBaseAdapter } from './learning/VytheraVisionAdapters';
import { vytheraVisualLearning } from './learning/VytheraVisualLearning';
import type { VytheraTeachExample } from './learning/VytheraTeachExample';
import { getTeachExample } from './learning/VytheraTeachExample';
import { ingestLocalImageClipboard } from './VytheraImageStore';

export type VytheraImageMode =
  | 'UNDERSTAND'
  | 'RECREATE'
  | 'LEARN_STYLE'
  | 'REFERENCE'
  | 'EXTRACT_ASSET';

export type VytheraVisionStatus =
  | 'READY'
  | 'OFFLINE'
  | 'NO_VISION_MODEL'
  | 'BUSY'
  | 'ERROR';

export interface VytheraVisionResult {
  mode: VytheraImageMode;
  analysis: VytheraImageAnalysis | null;
  palette: VytheraExtractedPalette | null;
  plan: VytheraVoxelPlan | null;
  scaffold: ReturnType<typeof scaffoldVoxelsFromPlan> | null;
  styleExample: VytheraStyleExample | null;
  imageRef: VytheraImageRef | null;
  diff: VytheraImageDiff | null;
  summary: string;
  /** Immediate retrieval learning ≠ model fine-tuning */
  learningNote: string;
  fromCache?: boolean;
  similarConcepts?: string[];
  teachExampleId?: string | null;
}

/**
 * VYTHERA Vision AI — local image learning subsystem.
 * Never contacts cloud vision APIs.
 */
export class VytheraVisionAI {
  private backends: VytheraVisionBackend[];
  private backend: VytheraVisionBackend;
  private visionModels: string[] = [];
  private status: VytheraVisionStatus = 'OFFLINE';
  private busy = false;
  private lastImage: VytheraVisionImage | null = null;
  private lastHash: string | null = null;
  private lastResult: VytheraVisionResult | null = null;
  private activeTeachId: string | null = null;

  constructor(backend?: VytheraVisionBackend) {
    this.backends = [
      new VytheraOllamaVisionBackend(),
      new VytheraDaemonVlmBackend(),
      new VytheraTransformersVisionBackend(),
      new VytheraONNXVisionBackend(),
    ];
    if (backend) {
      this.backend = backend;
    } else {
      const preferred = loadVytheraAISettings().activeVisionBackend || 'daemon-vlm';
      this.backend =
        this.backends.find((b) => b.id === preferred) ?? this.backends[0]!;
    }
  }

  /** Switch local vision stack (Ollama, daemon VLM+adapter, etc.). */
  setBackend(backend: VytheraVisionBackend): void {
    this.backend = backend;
    const s = loadVytheraAISettings();
    s.activeVisionBackend = backend.id;
    saveVytheraAISettings(s);
  }

  setBackendById(id: string): boolean {
    const b = this.backends.find((x) => x.id === id);
    if (!b) return false;
    this.setBackend(b);
    return true;
  }

  activeBackendId(): string {
    return this.backend.id;
  }

  getStatus(): VytheraVisionStatus {
    return this.status;
  }

  getVisionModels(): string[] {
    return [...this.visionModels];
  }

  activeVisionModel(): string {
    return loadVytheraAISettings().activeVisionModel;
  }

  setActiveVisionModel(name: string): void {
    const s = loadVytheraAISettings();
    s.activeVisionModel = name;
    saveVytheraAISettings(s);
  }

  last(): VytheraVisionResult | null {
    return this.lastResult;
  }

  listBackends(): { id: string; name: string }[] {
    return this.backends.map((b) => ({ id: b.id, name: b.displayName }));
  }

  cancel(): void {
    this.backend.cancel();
  }

  private preferBackendOrder(): VytheraVisionBackend[] {
    const preferred = loadVytheraAISettings().activeVisionBackend || 'daemon-vlm';
    const first = this.backends.find((b) => b.id === preferred);
    const rest = this.backends.filter((b) => b.id !== preferred);
    return first ? [first, ...rest] : [...this.backends];
  }

  async refresh(): Promise<VytheraVisionStatus> {
    try {
      const order = this.preferBackendOrder();
      for (const candidate of order) {
        try {
          await candidate.initialize();
          const ok = await candidate.isAvailable();
          if (!ok) continue;
          const listed = await candidate.listVisionModels();
          if (!listed.length) {
            // Backend up but no models — keep looking (e.g. Ollama without llava)
            if (candidate.id === order[0]?.id && listed.length === 0) {
              this.backend = candidate;
              this.visionModels = [];
              this.status = 'NO_VISION_MODEL';
              // still try others
              continue;
            }
            continue;
          }
          this.backend = candidate;
          this.visionModels = listed.map((m) => m.name);
          const settings = loadVytheraAISettings();
          if (settings.activeVisionBackend !== candidate.id) {
            settings.activeVisionBackend = candidate.id;
            saveVytheraAISettings(settings);
          }
          if (
            !settings.activeVisionModel ||
            !this.visionModels.includes(settings.activeVisionModel)
          ) {
            this.setActiveVisionModel(this.visionModels[0]!);
          }
          this.status = this.busy ? 'BUSY' : 'READY';
          return this.status;
        } catch {
          /* try next backend */
        }
      }
      this.visionModels = [];
      this.status = 'OFFLINE';
      return this.status;
    } catch {
      this.status = 'OFFLINE';
      return this.status;
    }
  }

  async ingestFile(file: File): Promise<{
    image: VytheraVisionImage;
    hash: string;
    fileName: string;
    palette: VytheraExtractedPalette;
    teachExampleId: string;
  }> {
    const ingested = await ingestLocalImageFile(file);
    if (!ingested.ok) throw new Error(ingested.error);
    let palette: VytheraExtractedPalette;
    try {
      palette = await extractPaletteFromFile(file);
    } catch {
      palette = {
        type: 'vythera_palette',
        dominant: [[128, 128, 128, 255]],
        accents: [[160, 160, 160, 255]],
        shadows: [[64, 64, 64, 255]],
        highlights: [[220, 220, 220, 255]],
      };
    }
    this.lastImage = ingested.image;
    this.lastHash = ingested.hash;
    const teach = vytheraVisualLearning.beginTeach({
      imageHash: ingested.hash,
      fileName: ingested.fileName,
      mimeType: ingested.image.mimeType,
      visionModel: this.activeVisionModel(),
    });
    this.activeTeachId = teach.example.id;
    return {
      image: ingested.image,
      hash: ingested.hash,
      fileName: ingested.fileName,
      palette,
      teachExampleId: teach.example.id,
    };
  }

  async ingestClipboard(
    items: DataTransferItemList | null,
  ): Promise<{
    image: VytheraVisionImage;
    hash: string;
    fileName: string;
    palette: VytheraExtractedPalette;
    teachExampleId: string;
  }> {
    const ingested = await ingestLocalImageClipboard(items);
    if (!ingested.ok) throw new Error(ingested.error);
    this.lastImage = ingested.image;
    this.lastHash = ingested.hash;
    const teach = vytheraVisualLearning.beginTeach({
      imageHash: ingested.hash,
      fileName: ingested.fileName,
      mimeType: ingested.image.mimeType,
      visionModel: this.activeVisionModel(),
    });
    this.activeTeachId = teach.example.id;
    return {
      image: ingested.image,
      hash: ingested.hash,
      fileName: ingested.fileName,
      palette: {
        type: 'vythera_palette',
        dominant: [[128, 128, 128, 255]],
        accents: [[160, 160, 160, 255]],
        shadows: [[64, 64, 64, 255]],
        highlights: [[220, 220, 220, 255]],
      },
      teachExampleId: teach.example.id,
    };
  }

  getActiveTeachExample(): VytheraTeachExample | null {
    return this.activeTeachId ? getTeachExample(this.activeTeachId) : null;
  }

  async analyze(
    mode: VytheraImageMode,
    opts: {
      prompt?: string;
      image?: VytheraVisionImage;
      hash?: string;
      fileName?: string;
      palette?: VytheraExtractedPalette | null;
      project?: string;
      referenceAnalysis?: VytheraImageAnalysis | null;
      signal?: AbortSignal;
    } = {},
  ): Promise<VytheraVisionResult> {
    await this.refresh();
    if (this.status === 'OFFLINE') throw new Error('VYTHERA AI OFFLINE');
    if (this.status === 'NO_VISION_MODEL') {
      throw new Error('VYTHERA AI — LOCAL VISION MODEL NOT INSTALLED');
    }

    const image = opts.image ?? this.lastImage;
    const hash = opts.hash ?? this.lastHash;
    if (!image) throw new Error('No local image loaded');

    this.busy = true;
    this.status = 'BUSY';
    try {
      const model = this.activeVisionModel();
      ensureBaseAdapter(model);

      let analysis: VytheraImageAnalysis | null = null;
      let fromCache = false;
      if (hash) {
        const cached = getCachedAnalysis(hash, model, mode);
        if (cached) {
          analysis = cached;
          fromCache = true;
        }
      }
      if (!analysis) {
        const userPrompt = buildModePrompt(mode, opts.prompt ?? '');
        const priorConcepts = findSimilarConcepts(
          {
            type: 'vythera_image_analysis',
            subject: { category: 'unknown', name: null },
            shape: { silhouette: '', proportions: {}, symmetry: '' },
            palette: { colors: [] },
            materials: [],
            features: [],
            style: { voxelLike: true, chunkiness: 0.5, detailLevel: 0.5, styleNotes: [] },
            components: [],
            animationHints: [],
            behaviorHints: [],
            confidence: 0.5,
          },
          3,
        );
        const conceptHint =
          priorConcepts.length > 0
            ? `\nKnown VYTHERA concepts (retrieval, not fine-tune): ${priorConcepts.map((c) => c.voxelHints.generationRecipe).join(' || ')}`
            : '';
        const raw = await this.backend.analyze({
          model,
          prompt: `${VISION_ANALYSIS_SYSTEM}${conceptHint}\n\n${userPrompt}`,
          image,
          jsonMode: true,
          signal: opts.signal,
        });
        const parsed = extractVytheraJson(raw);
        analysis = validateImageAnalysis(parsed);
        if (hash) putCachedAnalysis(hash, model, mode, analysis, raw.slice(0, 120));
        fromCache = false;
      }
      this.lastImage = image;

      // Blend learned concept style into analysis for planning
      const similar = findSimilarConcepts(analysis, 3);
      if (similar[0] && (mode === 'RECREATE' || mode === 'EXTRACT_ASSET' || mode === 'LEARN_STYLE')) {
        analysis = {
          ...analysis,
          style: {
            ...analysis.style,
            chunkiness: (analysis.style.chunkiness + similar[0].style.chunkiness) / 2,
            detailLevel: (analysis.style.detailLevel + similar[0].style.detailLevel) / 2,
            styleNotes: [
              ...analysis.style.styleNotes,
              `learned:${similar[0].archetype}`,
            ].slice(0, 16),
          },
          materials: [...new Set([...similar[0].materials, ...analysis.materials])].slice(0, 16),
        };
      }

      let palette = opts.palette ?? null;
      if (!palette && analysis.palette.colors.length) {
        palette = {
          type: 'vythera_palette',
          dominant: analysis.palette.colors,
          accents: analysis.palette.colors.slice(1, 4),
          shadows: analysis.palette.colors.slice(-2),
          highlights: analysis.palette.colors.slice(0, 2),
        };
      }

      let plan: VytheraVoxelPlan | null = null;
      let scaffold: ReturnType<typeof scaffoldVoxelsFromPlan> | null = null;
      let styleExample: VytheraStyleExample | null = null;
      let imageRef: VytheraImageRef | null = null;
      let diff: VytheraImageDiff | null = null;

      if (mode === 'RECREATE' || mode === 'EXTRACT_ASSET') {
        plan = planVoxelFromAnalysis(analysis, palette);
        if (similar[0]) {
          plan = {
            ...plan,
            chunkiness: similar[0].style.chunkiness,
            silhouette: similar[0].style.silhouette || plan.silhouette,
            features: [...new Set([...plan.features, ...similar[0].voxelHints.features])].slice(0, 16),
          };
        }
        scaffold = scaffoldVoxelsFromPlan(plan);
      }

      if (mode === 'LEARN_STYLE') {
        styleExample = createStyleExample({
          category: analysis.subject.category,
          analysis,
          imageHash: hash,
          userDescription: opts.prompt ?? '',
          project: opts.project ?? '',
        });
      }

      if (mode === 'REFERENCE' || mode === 'LEARN_STYLE' || mode === 'UNDERSTAND') {
        if (hash) {
          imageRef = await registerImageReference({
            hash,
            base64: image.base64,
            mimeType: image.mimeType,
            fileName: opts.fileName ?? image.fileName ?? 'image',
            category: analysis.subject.category,
            project: opts.project ?? '',
            tags: [mode.toLowerCase()],
            approved: mode === 'REFERENCE',
          });
        }
      }

      if (opts.referenceAnalysis) {
        diff = diffAnalyses(opts.referenceAnalysis, analysis);
      }

      if (this.activeTeachId) {
        vytheraVisualLearning.attachAnalysis(this.activeTeachId, analysis, {
          palette,
          visionModel: model,
        });
      }

      const result: VytheraVisionResult = {
        mode,
        analysis,
        palette,
        plan,
        scaffold,
        styleExample,
        imageRef,
        diff,
        summary: summarize(mode, analysis, styleExample) + (fromCache ? ' · cached' : ''),
        learningNote:
          'Retrieval/concepts may influence planning — model is NOT fine-tuned until a local training job completes and is promoted.',
        fromCache,
        similarConcepts: similar.map((c) => c.name),
        teachExampleId: this.activeTeachId,
      };
      this.lastResult = result;
      return result;
    } finally {
      this.busy = false;
      await this.refresh();
    }
  }

  /** Apply last voxel scaffold via registered tools when host is present. */
  async applyToEditor(host: VytheraEditorHost): Promise<string> {
    const result = this.lastResult;
    if (!result?.plan || !result.scaffold) {
      throw new Error('No voxel plan to apply — run Recreate or Extract Asset first');
    }
    const ctx = { host };
    const out = await vytheraTools.invoke(
      'create_voxel_asset',
      {
        type: 'voxel_model',
        voxels: result.scaffold.voxels.slice(0, 8000),
      },
      ctx,
    );
    if (result.palette) {
      await vytheraTools.invoke(
        'apply_palette',
        {
          type: 'palette',
          name: `${result.plan.name}_palette`,
          colors: result.palette.dominant,
        },
        ctx,
      );
    }
    return `Applied vision voxel plan (${JSON.stringify(out)})`;
  }

  saveAnalysisAsDataset(opts: {
    instruction: string;
    modality:
      | 'IMAGE'
      | 'IMAGE_TO_TEXT'
      | 'IMAGE_TO_VOXEL'
      | 'IMAGE_TO_STYLE'
      | 'IMAGE_TO_PALETTE';
    approved?: boolean;
  }): string {
    const r = this.lastResult;
    if (!r?.analysis) throw new Error('No analysis to save');
    const sample = vytheraDataset.addCandidate({
      instruction: opts.instruction,
      context: JSON.stringify({
        modality: opts.modality,
        imageHash: this.lastHash,
        analysis: r.analysis,
        plan: r.plan,
        palette: r.palette,
      }),
      toolCalls: [],
      output: JSON.stringify(r.analysis),
      taskType: opts.modality,
      validationOk: true,
      model: this.activeVisionModel() || 'vision',
      modality: opts.modality,
      imageHash: this.lastHash,
    });
    if (opts.approved) vytheraDataset.approve(sample.id);
    try {
      vytheraKnowledge.ingestText(
        `img_${Date.now()}`,
        `Image ${opts.modality}`,
        'image-learning',
        opts.instruction.slice(0, 200) + ' · ' + r.summary,
        ['image', opts.modality.toLowerCase()],
      );
    } catch {
      /* knowledge optional */
    }
    return sample.id;
  }
}

function buildModePrompt(mode: VytheraImageMode, user: string): string {
  const base = user.trim();
  switch (mode) {
    case 'UNDERSTAND':
      return `MODE: UNDERSTAND. Describe what you see as structured VYTHERA analysis.\nUser: ${base || 'Look at this and tell me what you see.'}`;
    case 'RECREATE':
      return `MODE: RECREATE. Analyze for a VYTHERA voxel character/creature recreation.\nUser: ${base || 'Turn this into a VYTHERA voxel character.'}`;
    case 'LEARN_STYLE':
      return `MODE: LEARN_STYLE. Extract shape language, proportions, palette, materials, silhouette, motifs for a style example (do not claim training).\nUser: ${base || 'Learn this style.'}`;
    case 'REFERENCE':
      return `MODE: REFERENCE. Analyze for use as a visual reference.\nUser: ${base || 'Use this image as a reference.'}`;
    case 'EXTRACT_ASSET':
      return `MODE: EXTRACT_ASSET. Focus on silhouette, parts (handle/blade/etc), materials, colors, proportions for a VYTHERA voxel asset.\nUser: ${base || 'Turn this into a VYTHERA voxel asset.'}`;
  }
}

function summarize(
  mode: VytheraImageMode,
  a: VytheraImageAnalysis,
  style: VytheraStyleExample | null,
): string {
  const sub = a.subject.name ?? a.subject.category;
  if (mode === 'LEARN_STYLE' && style) {
    return `Style example "${style.name}" created (unapproved). Confidence ${a.confidence.toFixed(2)}.`;
  }
  return `${mode}: ${sub} · silhouette “${a.shape.silhouette.slice(0, 60)}” · confidence ${a.confidence.toFixed(2)}`;
}

export const vytheraVision = new VytheraVisionAI();

/** Test helper */
export function createMockVytheraVision(): VytheraVisionAI {
  return new VytheraVisionAI(new VytheraMockVisionBackend());
}
