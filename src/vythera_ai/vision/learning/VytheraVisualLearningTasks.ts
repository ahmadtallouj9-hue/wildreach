/**
 * Persist visual learning tasks, review/approve, convert to training records.
 * Does not train models — only dataset + stage messaging.
 */
import { lsGet, lsSet } from '../../util/safeStorage';
import type { VytheraImageAnalysis } from '../VytheraImageAnalysis';
import type { VytheraTeachExample } from './VytheraTeachExample';
import {
  effectiveTaskAnswer,
  generateVisualLearningTasks,
  validateTaskAnswer,
  type VytheraVisualLearningTask,
} from './VytheraVisualTaskGenerator';
import { getVisualTaskDefinition, type VytheraVisualTaskType } from './VytheraVisualTaskTypes';
import {
  vytheraVisualDataset,
  type VytheraVisualTrainingRecord,
} from './VytheraVisualDataset';

const TASKS_KEY = 'vythera.ai.visual.learningTasks';
const MIN_TASK_CONF = 0.35;
export const MULTI_TASK_DATASET_PREFIX = 'VYTHERA-VISION-DATASET-V';

export function nextVisionDatasetLabel(): string {
  const vers = vytheraVisualDataset.versions();
  let max = 1;
  for (const v of vers) {
    const m = new RegExp(`${MULTI_TASK_DATASET_PREFIX}(\\d+)`, 'i').exec(v.label);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${MULTI_TASK_DATASET_PREFIX}${max + 1}`;
}

/** @deprecated use nextVisionDatasetLabel — kept for callers expecting V2 name */
export const MULTI_TASK_DATASET_LABEL = 'VYTHERA-VISION-DATASET-V2';

function loadTasks(): VytheraVisualLearningTask[] {
  try {
    return JSON.parse(lsGet(TASKS_KEY) ?? '[]') as VytheraVisualLearningTask[];
  } catch {
    return [];
  }
}

function saveTasks(list: VytheraVisualLearningTask[]): void {
  lsSet(TASKS_KEY, JSON.stringify(list.slice(0, 2000)));
}

export interface LearningTaskQualityReport {
  generated: number;
  valid: number;
  rejected: number;
  needsCorrection: number;
  approved: number;
}

export interface DatasetPreview {
  sourceImageHash: string;
  tasks: number;
  trainingRecordsToAdd: number;
  categories: Record<string, number>;
  balanceWarning: string | null;
  datasetVersionLabel: string;
}

export class VytheraVisualLearningTaskStore {
  list(imageHash?: string): VytheraVisualLearningTask[] {
    const all = loadTasks();
    return imageHash ? all.filter((t) => t.imageHash === imageHash) : all;
  }

  get(id: string): VytheraVisualLearningTask | null {
    return loadTasks().find((t) => t.id === id) ?? null;
  }

  /** Replace tasks for an image (deterministic ids → upsert). */
  upsertMany(tasks: VytheraVisualLearningTask[]): VytheraVisualLearningTask[] {
    const all = loadTasks();
    const byId = new Map(all.map((t) => [t.id, t]));
    for (const t of tasks) {
      const prev = byId.get(t.id);
      if (prev && (prev.status === 'APPROVED' || prev.status === 'CORRECTED')) {
        // Keep human corrections unless regenerating over GENERATED/ANSWERED only
        if (prev.status === 'APPROVED') continue;
        byId.set(t.id, {
          ...t,
          correctedAnswer: prev.correctedAnswer,
          status: prev.correctedAnswer ? 'CORRECTED' : t.status,
        });
      } else {
        byId.set(t.id, t);
      }
    }
    const next = [...byId.values()].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
    saveTasks(next);
    return tasks.map((t) => byId.get(t.id)!);
  }

  saveCorrection(
    id: string,
    correctedAnswer: unknown,
    confidence?: number,
  ): { ok: true; task: VytheraVisualLearningTask } | { ok: false; error: string } {
    const all = loadTasks();
    const idx = all.findIndex((t) => t.id === id);
    if (idx < 0) return { ok: false, error: 'Task not found' };
    const task = all[idx]!;
    const v = validateTaskAnswer(task.type, correctedAnswer);
    const next: VytheraVisualLearningTask = {
      ...task,
      correctedAnswer,
      confidence: confidence ?? task.confidence,
      status: 'CORRECTED',
      correctedAt: new Date().toISOString(),
      validationErrors: v.ok ? [] : v.errors,
    };
    all[idx] = next;
    saveTasks(all);
    return { ok: true, task: next };
  }

  approve(id: string): { ok: true; task: VytheraVisualLearningTask } | { ok: false; error: string } {
    const all = loadTasks();
    const idx = all.findIndex((t) => t.id === id);
    if (idx < 0) return { ok: false, error: 'Task not found' };
    const task = all[idx]!;
    const answer = effectiveTaskAnswer(task);
    const v = validateTaskAnswer(task.type, answer);
    if (!v.ok) return { ok: false, error: v.errors.join('; ') };
    const conf = task.confidence ?? 0;
    if (conf < MIN_TASK_CONF) {
      return { ok: false, error: `Confidence ${conf} below ${MIN_TASK_CONF}` };
    }
    const next = {
      ...task,
      status: 'APPROVED' as const,
      approvedAt: new Date().toISOString(),
      validationErrors: [] as string[],
    };
    all[idx] = next;
    saveTasks(all);
    return { ok: true, task: next };
  }

  reject(id: string): { ok: true; task: VytheraVisualLearningTask } | { ok: false; error: string } {
    const all = loadTasks();
    const idx = all.findIndex((t) => t.id === id);
    if (idx < 0) return { ok: false, error: 'Task not found' };
    const next = { ...all[idx]!, status: 'REJECTED' as const };
    all[idx] = next;
    saveTasks(all);
    return { ok: true, task: next };
  }

  /** Approve tasks that pass schema + confidence; leave others. */
  approveAllValid(imageHash: string): {
    approved: string[];
    skipped: { id: string; reason: string }[];
  } {
    const approved: string[] = [];
    const skipped: { id: string; reason: string }[] = [];
    for (const t of this.list(imageHash)) {
      if (t.status === 'APPROVED' || t.status === 'REJECTED') continue;
      const r = this.approve(t.id);
      if (r.ok) approved.push(t.id);
      else skipped.push({ id: t.id, reason: r.error });
    }
    return { approved, skipped };
  }

  qualityReport(imageHash: string): LearningTaskQualityReport & {
    answered: number;
    corrected: number;
  } {
    const tasks = this.list(imageHash);
    let valid = 0;
    let needsCorrection = 0;
    for (const t of tasks) {
      const v = validateTaskAnswer(t.type, effectiveTaskAnswer(t));
      if (v.ok && (t.confidence ?? 0) >= MIN_TASK_CONF) valid++;
      else if (t.status !== 'REJECTED') needsCorrection++;
    }
    return {
      generated: tasks.length,
      answered: tasks.filter((t) => t.aiAnswer != null || t.status !== 'GENERATED').length,
      corrected: tasks.filter((t) => t.status === 'CORRECTED' || t.correctedAnswer != null).length,
      valid,
      rejected: tasks.filter((t) => t.status === 'REJECTED').length,
      needsCorrection,
      approved: tasks.filter((t) => t.status === 'APPROVED').length,
    };
  }

  previewDataset(imageHash: string): DatasetPreview {
    const approved = this.list(imageHash).filter((t) => t.status === 'APPROVED');
    const categories: Record<string, number> = {};
    for (const t of approved) {
      categories[t.title] = (categories[t.title] ?? 0) + 1;
    }
    const balance = taskTypeBalance(vytheraVisualDataset.list());
    const label = nextVisionDatasetLabel();
    return {
      sourceImageHash: imageHash,
      tasks: this.list(imageHash).length,
      trainingRecordsToAdd: approved.length,
      categories,
      balanceWarning: balance.warning,
      datasetVersionLabel: label,
    };
  }

  /**
   * Convert APPROVED tasks → separate training records (same imageHash).
   * Creates immutable dataset version VYTHERA-VISION-DATASET-Vn.
   */
  addApprovedToDataset(
    imageHash: string,
    teach: VytheraTeachExample,
    analysis: VytheraImageAnalysis,
  ): {
    ok: boolean;
    added: VytheraVisualTrainingRecord[];
    errors: string[];
    versionId: string | null;
    message: string;
  } {
    const approved = this.list(imageHash).filter((t) => t.status === 'APPROVED');
    if (!approved.length) {
      return {
        ok: false,
        added: [],
        errors: ['No APPROVED tasks'],
        versionId: null,
        message: 'Approve tasks before adding to dataset',
      };
    }
    const label = nextVisionDatasetLabel();
    const version = vytheraVisualDataset.createVersion(
      label,
      `Multi-task from image ${imageHash.slice(0, 12)} · ${approved.length} tasks`,
      { empty: true },
    );
    const added: VytheraVisualTrainingRecord[] = [];
    const errors: string[] = [];

    for (const task of approved) {
      const def = getVisualTaskDefinition(task.type);
      const answer = effectiveTaskAnswer(task);
      const r = vytheraVisualDataset.addFromLearningTask({
        teach,
        analysis,
        learningTask: task,
        structuredTarget: answer,
        datasetTask: def.datasetTask,
        instruction: task.instruction,
        datasetVersion: version.id,
        learnTaskType: task.type,
      });
      if (r.ok) added.push(r.record);
      else errors.push(`${task.type}: ${r.error}`);
    }

    return {
      ok: added.length > 0,
      added,
      errors,
      versionId: version.id,
      message:
        added.length > 0
          ? `ADDED TO DATASET · ${added.length} training records · version ${label}`
          : `No records added · ${errors.join('; ')}`,
    };
  }
}

export function taskTypeBalance(records: VytheraVisualTrainingRecord[]): {
  distribution: Record<string, number>;
  percents: Record<string, number>;
  warning: string | null;
} {
  const distribution: Record<string, number> = {};
  let total = 0;
  for (const r of records) {
    if (r.approvalState !== 'approved') continue;
    const key = r.learnTaskType || r.task;
    distribution[key] = (distribution[key] ?? 0) + 1;
    total++;
  }
  const percents: Record<string, number> = {};
  let warning: string | null = null;
  for (const [k, n] of Object.entries(distribution)) {
    const p = total ? n / total : 0;
    percents[k] = Math.round(p * 1000) / 10;
    if (p > 0.4 && total >= 8) {
      warning = `Task type ${k} is ${percents[k]}% of dataset — consider teaching other categories`;
    }
  }
  return { distribution, percents, warning };
}

/** Generate tasks from teach example analysis (structured answers; local only). */
export function generateTasksFromTeachExample(
  ex: VytheraTeachExample,
  opts?: { enabledTypes?: VytheraVisualTaskType[] },
): {
  ok: boolean;
  tasks: VytheraVisualLearningTask[];
  error?: string;
  stageLabel: string;
} {
  const analysis = ex.correctedAnalysis ?? ex.analysis;
  if (!analysis) {
    return {
      ok: false,
      tasks: [],
      error: 'Analyze the image first',
      stageLabel: 'TASK GENERATED',
    };
  }
  const generated = generateVisualLearningTasks({
    imageHash: ex.imageHash,
    analysis,
    teachSessionId: ex.id,
    analysisModel: ex.visionModel,
    teachExampleId: ex.id,
    learnTargets: ex.learnTargets,
    enabledTypes: opts?.enabledTypes,
    palette: ex.palette,
    voxelPlan: ex.voxelPlan,
    corrections: ex.corrections,
  });
  const store = vytheraVisualLearningTasks;
  const saved = store.upsertMany(generated);
  return {
    ok: true,
    tasks: saved,
    stageLabel: 'TASK GENERATED',
  };
}

export function learningReportFromEval(byTask: Record<string, number>): {
  strong: string[];
  needsMore: string[];
} {
  const entries = Object.entries(byTask);
  if (!entries.length) return { strong: [], needsMore: [] };
  const sorted = [...entries].sort((a, b) => b[1] - a[1]);
  const strong = sorted.filter(([, s]) => s >= 0.75).map(([k]) => k);
  const needsMore = sorted.filter(([, s]) => s < 0.7).map(([k]) => k);
  return { strong, needsMore };
}

export const vytheraVisualLearningTasks = new VytheraVisualLearningTaskStore();

export type { VytheraVisualTaskType };
