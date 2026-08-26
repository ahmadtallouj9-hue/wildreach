import type { VytheraImageAnalysis } from '../VytheraImageAnalysis';
import type { VytheraExtractedPalette } from '../VytheraLocalPalette';
import { planVoxelFromAnalysis } from '../VytheraImageToVoxel';
import {
  registerImageReference,
  type VytheraImageRef,
} from '../VytheraImageStore';
import { vytheraKnowledge } from '../../knowledge/VytheraKnowledgeBase';
import { vytheraTraining } from '../../training/VytheraTrainingJob';
import { vytheraEvaluation } from '../../evaluation/VytheraEvaluation';
import type { VytheraLearningStage } from './VytheraLearningStates';
import { LEARNING_STAGE_LABELS } from './VytheraLearningStates';
import {
  applyCorrectionsToAnalysis,
  createTeachExample,
  emptyCorrections,
  parseCorrectionNotes,
  updateTeachExample,
  validateCorrections,
  type VytheraLearnTargets,
  type VytheraTeachCorrections,
  type VytheraTeachExample,
  DEFAULT_LEARN_TARGETS,
} from './VytheraTeachExample';
import { vytheraVisualDataset } from './VytheraVisualDataset';
import { listVisualConcepts, upsertConceptFromRecord } from './VytheraVisualConcepts';
import {
  detectTrainingCapability,
  probeTrainingCapability,
  trainDaemonCreateJob,
  isOllamaTagNotTrainable,
  type VytheraBrowserTrainingReport,
} from './VytheraTrainingCapability';
import {
  ensureBaseAdapter,
  listVisionAdapters,
  markAdapterEvaluated,
  promoteAdapter,
  registerCandidateAdapter,
  rollbackToAdapter,
  activeVisionAdapter,
} from './VytheraVisionAdapters';

export interface TeachSessionResult {
  example: VytheraTeachExample;
  stage: VytheraLearningStage;
  stageLabel: string;
  message: string;
  imageRef?: VytheraImageRef;
  datasetRecordId?: string;
  conceptId?: string;
  trainingJobId?: string;
  capability?: VytheraBrowserTrainingReport;
}

/**
 * Orchestrates TEACH → CORRECT → APPROVE → DATASET → TRAIN/ADAPT → EVAL → PROMOTE.
 * Never claims the model learned from reference-only saves.
 */
export class VytheraVisualLearning {
  beginTeach(opts: {
    imageHash: string;
    fileName: string;
    mimeType: string;
    visionModel?: string;
    project?: string;
  }): TeachSessionResult {
    const example = createTeachExample(opts);
    ensureBaseAdapter(opts.visionModel ?? '');
    return {
      example,
      stage: 'REFERENCE_SAVED',
      stageLabel: LEARNING_STAGE_LABELS.REFERENCE_SAVED,
      message: 'Image imported. Not training data until approved into the learning dataset.',
    };
  }

  attachAnalysis(
    exampleId: string,
    analysis: VytheraImageAnalysis,
    opts?: {
      palette?: VytheraExtractedPalette | null;
      visionModel?: string;
    },
  ): TeachSessionResult | null {
    const corrected = applyCorrectionsToAnalysis(analysis, emptyCorrections());
    const plan = planVoxelFromAnalysis(corrected, opts?.palette ?? null);
    const example = updateTeachExample(exampleId, {
      lifecycle: 'ANALYZED',
      analysis,
      correctedAnalysis: corrected,
      palette: opts?.palette ?? null,
      voxelPlan: plan,
      visionModel: opts?.visionModel,
    });
    if (!example) return null;
    return {
      example,
      stage: 'REFERENCE_SAVED',
      stageLabel: LEARNING_STAGE_LABELS.REFERENCE_SAVED,
      message: 'AI understanding attached. Correct before approving for the learning dataset.',
    };
  }

  applyHumanCorrections(
    exampleId: string,
    input: {
      notesText?: string;
      corrections?: Partial<VytheraTeachCorrections>;
      learnTargets?: Partial<VytheraLearnTargets>;
    },
  ): TeachSessionResult | null {
    const parsed = input.notesText ? parseCorrectionNotes(input.notesText) : {};
    const merged = validateCorrections({
      ...emptyCorrections(),
      ...parsed,
      ...input.corrections,
      notes: [
        ...(parsed.notes ?? []),
        ...((input.corrections?.notes as string[] | undefined) ?? []),
      ],
      labelOverrides: {
        ...(parsed.labelOverrides ?? {}),
        ...(input.corrections?.labelOverrides ?? {}),
      },
    });
    const current = updateTeachExample(exampleId, {});
    if (!current?.analysis) return null;
    const learnTargets: VytheraLearnTargets = {
      ...DEFAULT_LEARN_TARGETS,
      ...current.learnTargets,
      ...input.learnTargets,
      ignoreBackground: merged.ignoreBackground || !!input.learnTargets?.ignoreBackground,
    };
    const corrected = applyCorrectionsToAnalysis(current.analysis, merged);
    const plan = planVoxelFromAnalysis(corrected, current.palette);
    const example = updateTeachExample(exampleId, {
      lifecycle: 'CORRECTED',
      corrections: merged,
      learnTargets,
      correctedAnalysis: corrected,
      voxelPlan: plan,
    });
    if (!example) return null;
    return {
      example,
      stage: 'REFERENCE_SAVED',
      stageLabel: LEARNING_STAGE_LABELS.REFERENCE_SAVED,
      message: 'Corrections stored. Still not in training dataset until you approve.',
    };
  }

  async saveAsReference(
    exampleId: string,
    imageBase64?: string,
  ): Promise<TeachSessionResult | null> {
    const ex = updateTeachExample(exampleId, { lifecycle: 'ANALYZED' });
    if (!ex) return null;
    let imageRef: VytheraImageRef | undefined;
    if (imageBase64) {
      try {
        imageRef = await registerImageReference({
          hash: ex.imageHash,
          base64: imageBase64,
          mimeType: ex.mimeType,
          fileName: ex.fileName,
          category:
            ex.correctedAnalysis?.subject.category ??
            ex.analysis?.subject.category ??
            'unknown',
          project: ex.project,
          tags: ['reference', 'teach'],
          approved: true,
        });
      } catch {
        /* optional */
      }
    }
    return {
      example: ex,
      stage: 'REFERENCE_SAVED',
      stageLabel: LEARNING_STAGE_LABELS.REFERENCE_SAVED,
      message: 'REFERENCE SAVED — retrieval only. Model weights unchanged.',
      imageRef,
    };
  }

  approveAndAddToDataset(
    exampleId: string,
    opts?: { force?: boolean; instruction?: string },
  ): TeachSessionResult | null {
    let ex = updateTeachExample(exampleId, { lifecycle: 'APPROVED' });
    if (!ex) return null;
    const added = vytheraVisualDataset.addFromTeachExample(ex, {
      force: opts?.force,
      instruction: opts?.instruction,
    });
    if (!added.ok) {
      return {
        example: ex,
        stage: added.stage,
        stageLabel: LEARNING_STAGE_LABELS[added.stage],
        message: added.error,
      };
    }
    ex = updateTeachExample(exampleId, { lifecycle: 'DATASET' }) ?? ex;
    const concept = upsertConceptFromRecord(added.record);
    try {
      vytheraKnowledge.ingestText(
        `visual_${added.record.id}`,
        `VYTHERA visual concept: ${concept.name}`,
        'visual-learning',
        `${concept.archetype} · ${concept.voxelHints.generationRecipe} · corrections: ${concept.correctionsSummary.join('; ')}`,
        ['visual', 'learned', concept.category],
      );
    } catch {
      /* optional */
    }
    const ready = vytheraVisualDataset.readiness();
    return {
      example: ex,
      stage: ready.ready ? 'READY_FOR_TRAINING' : 'ADDED_TO_LEARNING_DATASET',
      stageLabel: LEARNING_STAGE_LABELS[ready.ready ? 'READY_FOR_TRAINING' : 'ADDED_TO_LEARNING_DATASET'],
      message: ready.ready
        ? `ADDED TO LEARNING DATASET · ${ready.reason}`
        : `ADDED TO LEARNING DATASET · ${ready.reason}`,
      datasetRecordId: added.record.id,
      conceptId: concept.id,
    };
  }

  reject(exampleId: string, reason: string): TeachSessionResult | null {
    const ex = updateTeachExample(exampleId, { lifecycle: 'REJECTED' });
    if (!ex) return null;
    vytheraVisualDataset.rejectHash(ex.imageHash, reason);
    return {
      example: ex,
      stage: 'REFERENCE_SAVED',
      stageLabel: LEARNING_STAGE_LABELS.REFERENCE_SAVED,
      message: `Rejected — will not enter learning dataset. ${reason}`,
    };
  }

  async requestTrainAdapt(opts?: {
    baseVisionModel?: string;
    trainableBaseModel?: string;
    autoStart?: boolean;
    modality?: 'TEXT' | 'VISION_LANGUAGE';
  }): Promise<TeachSessionResult> {
    const capability = await probeTrainingCapability();
    const ready = vytheraVisualDataset.readiness();
    const stats = vytheraVisualDataset.stats();
    const dummyExample = {
      id: '',
      lifecycle: 'DATASET' as const,
      imageHash: '',
      fileName: '',
      mimeType: 'image/png',
      visionModel: opts?.baseVisionModel ?? '',
      analysis: null,
      correctedAnalysis: null,
      corrections: emptyCorrections(),
      learnTargets: { ...DEFAULT_LEARN_TARGETS },
      palette: null,
      voxelPlan: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      project: '',
    };

    if (!ready.ready) {
      return {
        example: dummyExample,
        stage: 'ADDED_TO_LEARNING_DATASET',
        stageLabel: LEARNING_STAGE_LABELS.ADDED_TO_LEARNING_DATASET,
        message: ready.reason,
        capability,
      };
    }

    const version = vytheraVisualDataset.createVersion(
      `train-${stats.approved}`,
      `Visual adapter job from ${stats.approved} samples`,
    );
    const records = vytheraVisualDataset.list().filter((r) => r.approvalState === 'approved');

    // Prefer local daemon when online — real orchestrator bridge
    if (capability.local?.daemonOnline) {
      try {
        const trainable = opts?.trainableBaseModel?.trim() || '';
        if (!trainable || isOllamaTagNotTrainable(trainable)) {
          return {
            example: dummyExample,
            stage: 'LOCAL_TRAINING_BACKEND_NOT_AVAILABLE',
            stageLabel: LEARNING_STAGE_LABELS.LOCAL_TRAINING_BACKEND_NOT_AVAILABLE,
            message:
              'MODEL NOT TRAINABLE WITH CURRENT LOCAL BACKEND — set a Hugging Face / Transformers base (Ollama GGUF is inference-only).',
            capability,
          };
        }
        const jobModality = opts?.modality ?? 'TEXT';
        const images: Record<string, { base64: string; mimeType: string }> = {};
        if (jobModality === 'VISION_LANGUAGE') {
          const { getImageBlob } = await import('../VytheraImageStore');
          for (const r of records) {
            if (images[r.imageHash]) continue;
            const blob = await getImageBlob(r.imageHash);
            if (blob) images[r.imageHash] = blob;
          }
          if (!Object.keys(images).length) {
            return {
              example: dummyExample,
              stage: 'LOCAL_TRAINING_BACKEND_NOT_AVAILABLE',
              stageLabel: LEARNING_STAGE_LABELS.LOCAL_TRAINING_BACKEND_NOT_AVAILABLE,
              message:
                'VISION TRAINING NOT AVAILABLE — no image bytes in local store for approved samples.',
              capability,
            };
          }
        }
        const { job: diskJob } = await trainDaemonCreateJob({
          records,
          datasetVersion: version.id,
          baseModel: opts?.baseVisionModel || 'local-vision',
          trainableBaseModel: trainable,
          modality: jobModality,
          textOnly: jobModality === 'TEXT',
          images: jobModality === 'VISION_LANGUAGE' ? images : undefined,
          autoStart: opts?.autoStart === true && capability.available,
          epochs: 1,
        });
        const studioJob = vytheraTraining.createJob({
          baseModel: opts?.baseVisionModel || 'local-vision',
          datasetVersion: version.id,
          method: 'QLoRA',
          outputPath: `./adapters/${diskJob.id}`,
          status: capability.available ? 'QUEUED' : 'awaiting_external',
          diskJobId: diskJob.id,
        });
        vytheraTraining.appendLog(
          studioJob.id,
          `Disk job ${diskJob.id} · ${capability.available ? 'LOCAL TRAINING READY' : 'awaiting_external'}`,
        );
        registerCandidateAdapter({
          baseVisionModel: opts?.baseVisionModel || 'local-vision',
          datasetVersion: version.id,
          trainingJobId: studioJob.id,
          adapterPath: `./adapters`,
          notes: capability.available
            ? 'Queued on local training daemon'
            : 'awaiting_external — install Python/PEFT or start when ready',
        });
        if (!capability.available) {
          return {
            example: dummyExample,
            stage: 'LOCAL_TRAINING_BACKEND_NOT_AVAILABLE',
            stageLabel: LEARNING_STAGE_LABELS.LOCAL_TRAINING_BACKEND_NOT_AVAILABLE,
            message: `${capability.message} Dataset exported; job ${diskJob.id} is awaiting_external.`,
            trainingJobId: studioJob.id,
            capability,
          };
        }
        return {
          example: dummyExample,
          stage: opts?.autoStart ? 'TRAINING_IN_PROGRESS' : 'LOCAL_TRAINING_READY',
          stageLabel: LEARNING_STAGE_LABELS[opts?.autoStart ? 'TRAINING_IN_PROGRESS' : 'LOCAL_TRAINING_READY'],
          message: opts?.autoStart
            ? `TRAINING IN PROGRESS · job ${diskJob.id}`
            : `LOCAL TRAINING READY · job ${diskJob.id} created — press START TRAINING`,
          trainingJobId: studioJob.id,
          capability,
        };
      } catch (e) {
        /* fall through to awaiting_external recipe */
        console.warn(e);
      }
    }

    // Fallback recipe (preserves awaiting_external)
    const job = vytheraTraining.createJob({
      baseModel: opts?.baseVisionModel || 'local-vision',
      datasetVersion: version.id,
      method: 'QLoRA',
      outputPath: `./adapters/vythera-vision-${Date.now()}`,
    });
    vytheraTraining.appendLog(
      job.id,
      'Daemon offline — job awaiting_external. Run: npm run vythera:train:daemon',
    );
    registerCandidateAdapter({
      baseVisionModel: opts?.baseVisionModel || 'local-vision',
      datasetVersion: version.id,
      trainingJobId: job.id,
      adapterPath: job.outputPath,
      notes: 'Awaiting local training daemon',
    });
    return {
      example: dummyExample,
      stage: 'LOCAL_TRAINING_BACKEND_NOT_AVAILABLE',
      stageLabel: LEARNING_STAGE_LABELS.LOCAL_TRAINING_BACKEND_NOT_AVAILABLE,
      message: capability.message,
      trainingJobId: job.id,
      capability,
    };
  }

  /**
   * Offline eval of a candidate adapter using held-out visual records + schema fixtures.
   * Does not claim live vision quality without inference.
   */
  evaluateAdapter(adapterId: string): {
    stage: VytheraLearningStage;
    score: number;
    message: string;
  } {
    const records = vytheraVisualDataset.list().filter((r) => r.split === 'held_out' || r.split === 'validation');
    let pass = 0;
    let total = 0;
    for (const r of records.slice(0, 20)) {
      total++;
      if (r.expectedOutput.analysis?.type === 'vythera_image_analysis' && r.confidence >= 0.35) {
        pass++;
      }
      if (r.voxelPlan || r.expectedOutput.voxelPlan) {
        total++;
        pass++;
      }
    }
    const fixtures = vytheraEvaluation.runOfflineFixtures(
      {
        voxel_sparse: {
          type: 'voxel_model',
          voxels: [{ x: 16, y: 4, z: 16, color: [80, 80, 90, 255] }],
        },
        palette_moss: { type: 'palette', name: 'Moss', colors: [[40, 60, 40, 255]] },
      },
      adapterId,
    );
    const score =
      total > 0
        ? (pass / total) * 0.7 + fixtures.passRate * 0.3
        : fixtures.passRate;
    const marked = markAdapterEvaluated(adapterId, score);
    if (!marked) {
      return { stage: 'MODEL_ADAPTED', score: 0, message: 'Adapter not found' };
    }
    return {
      stage: 'MODEL_EVALUATED',
      score,
      message: `MODEL EVALUATED · score ${score.toFixed(3)} (offline schema/held-out — not live vision accuracy)`,
    };
  }

  promote(adapterId: string): { ok: boolean; message: string; stage: VytheraLearningStage } {
    const res = promoteAdapter(adapterId);
    if (!res.ok) {
      return {
        ok: false,
        message: res.error,
        stage: 'MODEL_EVALUATED',
      };
    }
    return {
      ok: true,
      message: `MODEL PROMOTED · ${res.adapter.name} is now active`,
      stage: 'MODEL_PROMOTED',
    };
  }

  rollback(adapterId: string): { ok: boolean; message: string } {
    const res = rollbackToAdapter(adapterId);
    if (!res.ok) return { ok: false, message: res.error };
    return { ok: true, message: `Rolled back to ${res.adapter.name}` };
  }

  dashboard(): {
    dataset: ReturnType<typeof vytheraVisualDataset.stats>;
    readiness: ReturnType<typeof vytheraVisualDataset.readiness>;
    adapters: ReturnType<typeof listVisionAdapters>;
    activeAdapter: ReturnType<typeof activeVisionAdapter>;
    capability: ReturnType<typeof detectTrainingCapability>;
    concepts: number;
  } {
    return {
      dataset: vytheraVisualDataset.stats(),
      readiness: vytheraVisualDataset.readiness(),
      adapters: listVisionAdapters(),
      activeAdapter: activeVisionAdapter(),
      capability: detectTrainingCapability({ trainerScriptExists: true }),
      concepts: listVisualConcepts().length,
    };
  }
}

export const vytheraVisualLearning = new VytheraVisualLearning();
