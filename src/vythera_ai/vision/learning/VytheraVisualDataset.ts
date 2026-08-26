import { lsGet, lsSet } from '../../util/safeStorage';
import type { VytheraImageAnalysis } from '../VytheraImageAnalysis';
import type { VytheraExtractedPalette } from '../VytheraLocalPalette';
import type { VytheraVoxelPlan } from '../VytheraImageToVoxel';
import type { VytheraTeachCorrections, VytheraLearnTargets, VytheraTeachExample } from './VytheraTeachExample';
import { applyCorrectionsToAnalysis } from './VytheraTeachExample';
import type { VytheraLearningStage } from './VytheraLearningStates';

export type VytheraVisualTask =
  | 'IMAGE_TO_TEXT'
  | 'IMAGE_TO_VOXEL'
  | 'IMAGE_TO_STYLE'
  | 'IMAGE_TO_PALETTE'
  | 'IMAGE_TO_CONCEPT'
  | 'IMAGE';

export type VytheraVisualSampleSplit = 'train' | 'validation' | 'held_out';

export interface VytheraVisualTrainingRecord {
  type: 'vythera_visual_training_record';
  id: string;
  imageHash: string;
  source: 'teach' | 'import' | 'migrate';
  task: VytheraVisualTask;
  instruction: string;
  input: {
    analysis: VytheraImageAnalysis | null;
    learnTargets: VytheraLearnTargets;
  };
  expectedOutput: {
    analysis: VytheraImageAnalysis;
    palette: VytheraExtractedPalette | null;
    voxelPlan: VytheraVoxelPlan | null;
    vytheraConcept: string;
    structuredTarget?: unknown;
  };
  labels: string[];
  objects: string[];
  style: Record<string, unknown>;
  palette: VytheraExtractedPalette | null;
  scene: VytheraImageAnalysis['scene'] | null;
  voxelPlan: VytheraVoxelPlan | null;
  corrections: VytheraTeachCorrections;
  confidence: number;
  approvalState: 'approved' | 'rejected';
  split: VytheraVisualSampleSplit;
  timestamp: number;
  modelVersion: string;
  datasetVersion: string;
  teachExampleId: string | null;
  /** Multi-task learn type when record came from GENERATE LEARNING TASKS */
  learnTaskType?: string;
  taskId?: string;
  sourceTeachSessionId?: string;
  analysisModel?: string;
  analysisVersion?: string;
  approvalTimestamp?: number;
  correctionVersion?: number;
  learnTargets?: import('./VytheraTeachExample').VytheraLearnTargets;
}

export interface VytheraVisualDatasetVersion {
  id: string;
  label: string;
  createdAt: number;
  sampleIds: string[];
  notes: string;
}

const RECORDS_KEY = 'vythera.ai.visual.dataset.records';
const REJECTED_KEY = 'vythera.ai.visual.dataset.rejected';
const VERSIONS_KEY = 'vythera.ai.visual.dataset.versions';
const MIN_CONFIDENCE = 0.35;

function loadRecords(): VytheraVisualTrainingRecord[] {
  try {
    return JSON.parse(lsGet(RECORDS_KEY) ?? '[]') as VytheraVisualTrainingRecord[];
  } catch {
    return [];
  }
}

function saveRecords(list: VytheraVisualTrainingRecord[]): void {
  lsSet(RECORDS_KEY, JSON.stringify(list.slice(0, 2000)));
}

function loadRejected(): { imageHash: string; reason: string; at: number }[] {
  try {
    return JSON.parse(lsGet(REJECTED_KEY) ?? '[]') as { imageHash: string; reason: string; at: number }[];
  } catch {
    return [];
  }
}

function saveRejected(list: { imageHash: string; reason: string; at: number }[]): void {
  lsSet(REJECTED_KEY, JSON.stringify(list.slice(0, 500)));
}

function loadVersions(): VytheraVisualDatasetVersion[] {
  try {
    return JSON.parse(lsGet(VERSIONS_KEY) ?? '[]') as VytheraVisualDatasetVersion[];
  } catch {
    return [];
  }
}

function saveVersions(list: VytheraVisualDatasetVersion[]): void {
  lsSet(VERSIONS_KEY, JSON.stringify(list.slice(0, 100)));
}

/** Dedup key: same image + task must not poison the set twice. */
export function visualDedupKey(imageHash: string, task: VytheraVisualTask): string {
  return `${imageHash}::${task}`;
}

export class VytheraVisualDatasetManager {
  list(): VytheraVisualTrainingRecord[] {
    return loadRecords();
  }

  rejected(): { imageHash: string; reason: string; at: number }[] {
    return loadRejected();
  }

  versions(): VytheraVisualDatasetVersion[] {
    return loadVersions();
  }

  findDuplicate(imageHash: string, task: VytheraVisualTask): VytheraVisualTrainingRecord | null {
    const key = visualDedupKey(imageHash, task);
    return (
      loadRecords().find((r) => visualDedupKey(r.imageHash, r.task) === key && r.approvalState === 'approved') ??
      null
    );
  }

  /**
   * Convert an APPROVED teach example into a training record.
   * Rejects low confidence / duplicates. Does NOT train a model.
   */
  addFromTeachExample(
    ex: VytheraTeachExample,
    opts: {
      task?: VytheraVisualTask;
      instruction?: string;
      split?: VytheraVisualSampleSplit;
      modelVersion?: string;
      datasetVersion?: string;
      force?: boolean;
    } = {},
  ):
    | { ok: true; record: VytheraVisualTrainingRecord; stage: VytheraLearningStage }
    | { ok: false; error: string; stage: VytheraLearningStage } {
    if (ex.lifecycle !== 'APPROVED' && ex.lifecycle !== 'DATASET') {
      return {
        ok: false,
        error: 'Example must be APPROVED before entering the learning dataset',
        stage: 'REFERENCE_SAVED',
      };
    }
    const analysis = ex.correctedAnalysis ?? ex.analysis;
    if (!analysis) {
      return { ok: false, error: 'No analysis on teach example', stage: 'REFERENCE_SAVED' };
    }
    const conf = analysis.confidence;
    if (conf < MIN_CONFIDENCE && !opts.force) {
      return {
        ok: false,
        error: `Confidence ${conf} below threshold ${MIN_CONFIDENCE}`,
        stage: 'REFERENCE_SAVED',
      };
    }

    const task =
      opts.task ??
      (ex.learnTargets.voxelStructure
        ? 'IMAGE_TO_VOXEL'
        : ex.learnTargets.visualStyle
          ? 'IMAGE_TO_STYLE'
          : ex.learnTargets.palette
            ? 'IMAGE_TO_PALETTE'
            : 'IMAGE_TO_CONCEPT');

    const dup = this.findDuplicate(ex.imageHash, task);
    if (dup && !opts.force) {
      return {
        ok: false,
        error: `Duplicate training sample for hash+task (${dup.id})`,
        stage: 'ADDED_TO_LEARNING_DATASET',
      };
    }

    const expected = applyCorrectionsToAnalysis(analysis, ex.corrections);
    const concept = buildVytheraConceptLabel(expected, ex);
    const datasetVersion = opts.datasetVersion ?? currentOrCreateVersionId();
    const record: VytheraVisualTrainingRecord = {
      type: 'vythera_visual_training_record',
      id: `vds_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      imageHash: ex.imageHash,
      source: 'teach',
      task,
      instruction:
        opts.instruction ??
        `Teach VYTHERA: ${expected.subject.category} from image (${ex.fileName})`,
      input: {
        analysis: ex.analysis,
        learnTargets: ex.learnTargets,
      },
      expectedOutput: {
        analysis: expected,
        palette: ex.palette,
        voxelPlan: ex.voxelPlan,
        vytheraConcept: concept,
      },
      labels: [
        expected.subject.category,
        ...Object.values(ex.corrections.labelOverrides),
        ...ex.corrections.objectTypes,
      ].slice(0, 32),
      objects: (expected.scene?.objects.map((o) => o.name) ?? expected.features).slice(0, 32),
      style: { ...expected.style, ...ex.corrections.styleAttributes },
      palette: ex.palette,
      scene: expected.scene ?? null,
      voxelPlan: ex.voxelPlan,
      corrections: ex.corrections,
      confidence: expected.confidence,
      approvalState: 'approved',
      split: opts.split ?? assignSplit(loadRecords().length),
      timestamp: Date.now(),
      modelVersion: opts.modelVersion ?? (ex.visionModel || 'base'),
      datasetVersion,
      teachExampleId: ex.id,
    };

    const list = loadRecords();
    list.unshift(record);
    saveRecords(list);
    attachToVersion(datasetVersion, record.id);

    return { ok: true, record, stage: 'ADDED_TO_LEARNING_DATASET' };
  }

  /**
   * Add a training record from an approved multi-task learning task.
   * Same imageHash may appear many times with distinct learnTaskType.
   */
  addFromLearningTask(opts: {
    teach: import('./VytheraTeachExample').VytheraTeachExample;
    analysis: import('../VytheraImageAnalysis').VytheraImageAnalysis;
    learningTask: { id: string; type: string; confidence?: number };
    structuredTarget: unknown;
    datasetTask: VytheraVisualTask;
    instruction: string;
    datasetVersion: string;
    learnTaskType: string;
  }):
    | { ok: true; record: VytheraVisualTrainingRecord; stage: VytheraLearningStage }
    | { ok: false; error: string; stage: VytheraLearningStage } {
    const { teach, analysis, learningTask, structuredTarget, datasetTask, instruction, datasetVersion, learnTaskType } =
      opts;
    const conf = learningTask.confidence ?? analysis.confidence;
    if (conf < MIN_CONFIDENCE) {
      return {
        ok: false,
        error: `Confidence ${conf} below threshold ${MIN_CONFIDENCE}`,
        stage: 'REFERENCE_SAVED',
      };
    }
    const dedupKey = `${teach.imageHash}::${learnTaskType}`;
    const existing = loadRecords().find(
      (r) =>
        r.approvalState === 'approved' &&
        `${r.imageHash}::${r.learnTaskType || r.task}` === dedupKey,
    );
    if (existing) {
      return {
        ok: false,
        error: `Duplicate learning task sample (${existing.id})`,
        stage: 'ADDED_TO_LEARNING_DATASET',
      };
    }

    const expected = applyCorrectionsToAnalysis(analysis, teach.corrections);
    const record: VytheraVisualTrainingRecord = {
      type: 'vythera_visual_training_record',
      id: `vds_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      imageHash: teach.imageHash,
      source: 'teach',
      task: datasetTask,
      instruction,
      input: {
        analysis: teach.analysis,
        learnTargets: teach.learnTargets,
      },
      expectedOutput: {
        analysis: expected,
        palette: teach.palette,
        voxelPlan: teach.voxelPlan,
        vytheraConcept: buildVytheraConceptLabel(expected, teach),
        structuredTarget,
      },
      labels: [learnTaskType, expected.subject.category].slice(0, 32),
      objects: (expected.scene?.objects.map((o) => o.name) ?? expected.features).slice(0, 32),
      style: { ...expected.style },
      palette: teach.palette,
      scene: expected.scene ?? null,
      voxelPlan: teach.voxelPlan,
      corrections: teach.corrections,
      confidence: conf,
      approvalState: 'approved',
      split: assignSplit(loadRecords().length),
      timestamp: Date.now(),
      modelVersion: teach.visionModel || 'base',
      datasetVersion,
      teachExampleId: teach.id,
      learnTaskType,
      taskId: learningTask.id,
      sourceTeachSessionId: teach.id,
      analysisModel: teach.visionModel,
      analysisVersion: String(
        (learningTask as { analysisVersion?: string }).analysisVersion || learningTask.id,
      ),
      correctionVersion: teach.corrections ? 1 : 0,
      approvalTimestamp: Date.now(),
      learnTargets: teach.learnTargets,
    };

    const list = loadRecords();
    list.unshift(record);
    saveRecords(list);
    attachToVersion(datasetVersion, record.id);
    return { ok: true, record, stage: 'ADDED_TO_LEARNING_DATASET' };
  }

  rejectHash(imageHash: string, reason: string): void {
    const rej = loadRejected();
    rej.unshift({ imageHash, reason: reason.slice(0, 200), at: Date.now() });
    saveRejected(rej);
  }

  removeRecord(id: string): boolean {
    const list = loadRecords();
    const next = list.filter((r) => r.id !== id);
    if (next.length === list.length) return false;
    saveRecords(next);
    return true;
  }

  createVersion(
    label: string,
    notes = '',
    opts?: { empty?: boolean },
  ): VytheraVisualDatasetVersion {
    const records = opts?.empty
      ? []
      : loadRecords().filter((r) => r.approvalState === 'approved');
    const ver: VytheraVisualDatasetVersion = {
      id: `vdv_${Date.now()}`,
      label: label.slice(0, 64),
      createdAt: Date.now(),
      sampleIds: records.map((r) => r.id),
      notes: notes.slice(0, 500),
    };
    const all = loadVersions();
    all.unshift(ver);
    saveVersions(all);
    return ver;
  }

  stats(): {
    total: number;
    approved: number;
    rejected: number;
    duplicatesPossible: number;
    validation: number;
    training: number;
    heldOut: number;
    byTask: Record<string, number>;
    byCategory: Record<string, number>;
    versions: number;
    uniqueHashes: number;
  } {
    const records = loadRecords();
    const byTask: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    const hashes = new Set<string>();
    const keys = new Set<string>();
    let duplicatesPossible = 0;
    for (const r of records) {
      byTask[r.task] = (byTask[r.task] ?? 0) + 1;
      const cat = r.expectedOutput.analysis.subject.category;
      byCategory[cat] = (byCategory[cat] ?? 0) + 1;
      hashes.add(r.imageHash);
      const k = visualDedupKey(r.imageHash, r.task);
      if (keys.has(k)) duplicatesPossible++;
      else keys.add(k);
    }
    return {
      total: records.length,
      approved: records.filter((r) => r.approvalState === 'approved').length,
      rejected: loadRejected().length,
      duplicatesPossible,
      validation: records.filter((r) => r.split === 'validation').length,
      training: records.filter((r) => r.split === 'train').length,
      heldOut: records.filter((r) => r.split === 'held_out').length,
      byTask,
      byCategory,
      versions: loadVersions().length,
      uniqueHashes: hashes.size,
    };
  }

  /** Training readiness: enough approved train samples + held-out for eval. */
  readiness(minTrain = 3): {
    ready: boolean;
    trainCount: number;
    validationCount: number;
    reason: string;
  } {
    const s = this.stats();
    if (s.training < minTrain) {
      return {
        ready: false,
        trainCount: s.training,
        validationCount: s.validation,
        reason: `Need at least ${minTrain} training samples (have ${s.training})`,
      };
    }
    return {
      ready: true,
      trainCount: s.training,
      validationCount: s.validation,
      reason: 'Dataset meets minimum size for adapter training attempt',
    };
  }

  exportJsonl(split?: VytheraVisualSampleSplit): string {
    return loadRecords()
      .filter((r) => r.approvalState === 'approved' && (!split || r.split === split))
      .map((r) => JSON.stringify(r))
      .join('\n');
  }

  exportBackup(): string {
    return JSON.stringify(
      {
        type: 'vythera_visual_dataset_backup',
        version: 1,
        exportedAt: Date.now(),
        records: loadRecords(),
        rejected: loadRejected(),
        versions: loadVersions(),
      },
      null,
      2,
    );
  }

  importBackup(raw: string): { imported: number; error?: string } {
    try {
      const data = JSON.parse(raw) as {
        type?: string;
        records?: VytheraVisualTrainingRecord[];
        rejected?: { imageHash: string; reason: string; at: number }[];
        versions?: VytheraVisualDatasetVersion[];
      };
      if (data.type !== 'vythera_visual_dataset_backup') {
        return { imported: 0, error: 'Invalid backup type' };
      }
      const existing = loadRecords();
      const byKey = new Set(existing.map((r) => visualDedupKey(r.imageHash, r.task)));
      let imported = 0;
      for (const r of data.records ?? []) {
        if (!r?.imageHash || !r.task) continue;
        const k = visualDedupKey(r.imageHash, r.task);
        if (byKey.has(k)) continue;
        existing.unshift(r);
        byKey.add(k);
        imported++;
      }
      saveRecords(existing);
      if (data.rejected?.length) {
        saveRejected([...data.rejected, ...loadRejected()].slice(0, 500));
      }
      if (data.versions?.length) {
        saveVersions([...data.versions, ...loadVersions()].slice(0, 100));
      }
      return { imported };
    } catch (e) {
      return { imported: 0, error: e instanceof Error ? e.message : 'Import failed' };
    }
  }

  clearAllForTests(): void {
    lsSet(RECORDS_KEY, '[]');
    lsSet(REJECTED_KEY, '[]');
    lsSet(VERSIONS_KEY, '[]');
  }
}

function assignSplit(index: number): VytheraVisualSampleSplit {
  if (index % 10 === 0) return 'held_out';
  if (index % 5 === 0) return 'validation';
  return 'train';
}

function currentOrCreateVersionId(): string {
  const vers = loadVersions();
  if (vers[0]) return vers[0].id;
  const ver = {
    id: `vdv_${Date.now()}`,
    label: 'visual-v1',
    createdAt: Date.now(),
    sampleIds: [] as string[],
    notes: 'auto',
  };
  saveVersions([ver]);
  return ver.id;
}

function attachToVersion(versionId: string, sampleId: string): void {
  const vers = loadVersions();
  const v = vers.find((x) => x.id === versionId);
  if (!v) return;
  if (!v.sampleIds.includes(sampleId)) v.sampleIds.unshift(sampleId);
  saveVersions(vers);
}

function buildVytheraConceptLabel(a: VytheraImageAnalysis, ex: VytheraTeachExample): string {
  const name = a.subject.name ?? a.subject.category;
  const parts = [
    `vythera:${a.subject.category}`,
    name,
    a.shape.silhouette.slice(0, 40),
    `chunkiness=${a.style.chunkiness.toFixed(2)}`,
  ];
  if (ex.learnTargets.ignoreBackground || ex.corrections.ignoreBackground) {
    parts.push('ignore_bg');
  }
  return parts.filter(Boolean).join(' | ').slice(0, 200);
}

export const vytheraVisualDataset = new VytheraVisualDatasetManager();
