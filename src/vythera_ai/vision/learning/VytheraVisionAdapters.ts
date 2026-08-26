import { lsGet, lsSet } from '../../util/safeStorage';
import type { VytheraLearningStage } from './VytheraLearningStates';

/**
 * Vision adapter version registry.
 * Base vision model ≠ VYTHERA adapter. Promotion is explicit.
 */
export type VytheraVisionAdapterLifecycle =
  | 'BASE'
  | 'CANDIDATE'
  | 'EVALUATED'
  | 'APPROVED'
  | 'ACTIVE'
  | 'ARCHIVED';

export interface VytheraVisionAdapterVersion {
  id: string;
  /** Display name e.g. VYTHERA-VISION-V1 */
  name: string;
  baseVisionModel: string;
  datasetVersion: string;
  trainingJobId: string | null;
  evaluationScore: number | null;
  lifecycle: VytheraVisionAdapterLifecycle;
  createdAt: number;
  notes: string;
  /** Honest: browser never writes adapter weights; path is where external trainer should put them. */
  adapterPath: string;
}

const KEY = 'vythera.ai.vision.adapters';
const ACTIVE_KEY = 'vythera.ai.vision.activeAdapter';

function load(): VytheraVisionAdapterVersion[] {
  try {
    return JSON.parse(lsGet(KEY) ?? '[]') as VytheraVisionAdapterVersion[];
  } catch {
    return [];
  }
}

function save(list: VytheraVisionAdapterVersion[]): void {
  lsSet(KEY, JSON.stringify(list.slice(0, 50)));
}

export function listVisionAdapters(): VytheraVisionAdapterVersion[] {
  return load();
}

export function activeVisionAdapter(): VytheraVisionAdapterVersion | null {
  const id = lsGet(ACTIVE_KEY);
  if (!id) return null;
  return load().find((a) => a.id === id) ?? null;
}

export function ensureBaseAdapter(baseVisionModel: string): VytheraVisionAdapterVersion {
  const list = load();
  let base = list.find((a) => a.name === 'VYTHERA-VISION-BASE');
  if (!base) {
    base = {
      id: 'adapter_base',
      name: 'VYTHERA-VISION-BASE',
      baseVisionModel: baseVisionModel || 'none',
      datasetVersion: 'none',
      trainingJobId: null,
      evaluationScore: null,
      lifecycle: 'BASE',
      createdAt: Date.now(),
      notes: 'Unadapted base vision model — no VYTHERA LoRA weights',
      adapterPath: '',
    };
    list.unshift(base);
    save(list);
  }
  if (!lsGet(ACTIVE_KEY)) lsSet(ACTIVE_KEY, base.id);
  return base;
}

export function registerCandidateAdapter(opts: {
  baseVisionModel: string;
  datasetVersion: string;
  trainingJobId: string;
  adapterPath: string;
  notes?: string;
}): VytheraVisionAdapterVersion {
  const n = load().filter((a) => /^VYTHERA-VISION-V\d+$/.test(a.name)).length + 1;
  const row: VytheraVisionAdapterVersion = {
    id: `adapter_${Date.now()}`,
    name: `VYTHERA-VISION-V${n}`,
    baseVisionModel: opts.baseVisionModel,
    datasetVersion: opts.datasetVersion,
    trainingJobId: opts.trainingJobId,
    evaluationScore: null,
    lifecycle: 'CANDIDATE',
    createdAt: Date.now(),
    notes: opts.notes ?? 'Candidate from local adapter job — not promoted',
    adapterPath: opts.adapterPath,
  };
  const list = load();
  list.unshift(row);
  save(list);
  return row;
}

export function markAdapterEvaluated(
  id: string,
  score: number,
): { adapter: VytheraVisionAdapterVersion; stage: VytheraLearningStage } | null {
  const list = load();
  const a = list.find((x) => x.id === id);
  if (!a) return null;
  a.evaluationScore = score;
  a.lifecycle = 'EVALUATED';
  save(list);
  return { adapter: a, stage: 'MODEL_EVALUATED' };
}

/**
 * Promote only if score beats the current active adapter (or active has no score).
 * Never overwrites BASE; demotes previous ACTIVE to ARCHIVED.
 */
export function promoteAdapter(
  id: string,
): { ok: true; adapter: VytheraVisionAdapterVersion; stage: VytheraLearningStage } | { ok: false; error: string } {
  const list = load();
  const candidate = list.find((x) => x.id === id);
  if (!candidate) return { ok: false, error: 'Adapter not found' };
  if (candidate.lifecycle !== 'EVALUATED' && candidate.lifecycle !== 'APPROVED') {
    return { ok: false, error: 'Adapter must be EVALUATED before promotion' };
  }
  if (candidate.evaluationScore == null) {
    return { ok: false, error: 'Adapter missing evaluation score' };
  }
  const activeId = lsGet(ACTIVE_KEY);
  const active = list.find((x) => x.id === activeId);
  if (
    active &&
    active.id !== candidate.id &&
    typeof active.evaluationScore === 'number' &&
    typeof candidate.evaluationScore === 'number' &&
    candidate.evaluationScore <= active.evaluationScore
  ) {
    return {
      ok: false,
      error: `Candidate score ${candidate.evaluationScore} does not beat active ${active.evaluationScore}`,
    };
  }
  for (const a of list) {
    if (a.lifecycle === 'ACTIVE' && a.id !== candidate.id) a.lifecycle = 'ARCHIVED';
  }
  candidate.lifecycle = 'ACTIVE';
  save(list);
  lsSet(ACTIVE_KEY, candidate.id);
  return { ok: true, adapter: candidate, stage: 'MODEL_PROMOTED' };
}

export function rollbackToAdapter(
  id: string,
): { ok: true; adapter: VytheraVisionAdapterVersion } | { ok: false; error: string } {
  const list = load();
  const target = list.find((x) => x.id === id);
  if (!target) return { ok: false, error: 'Adapter not found' };
  for (const a of list) {
    if (a.lifecycle === 'ACTIVE') a.lifecycle = 'ARCHIVED';
  }
  target.lifecycle = target.name === 'VYTHERA-VISION-BASE' ? 'BASE' : 'ACTIVE';
  if (target.name === 'VYTHERA-VISION-BASE') {
    /* BASE stays BASE but is active */
  } else {
    target.lifecycle = 'ACTIVE';
  }
  save(list);
  lsSet(ACTIVE_KEY, target.id);
  return { ok: true, adapter: target };
}

export function clearAdaptersForTests(): void {
  lsSet(KEY, '[]');
  lsSet(ACTIVE_KEY, '');
}
