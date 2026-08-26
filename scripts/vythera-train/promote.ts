import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ensureTrainDirs, VYTHERA_ADAPTERS_DIR, safePathUnder } from './paths.ts';
import { readJob } from './jobStore.ts';
import type { TrainingModality } from './types.ts';

/** Legacy combined pointer (text jobs historically wrote here). */
const ACTIVE_FILE = join(VYTHERA_ADAPTERS_DIR, 'ACTIVE.json');
const ACTIVE_TEXT = join(VYTHERA_ADAPTERS_DIR, 'ACTIVE_TEXT.json');
const ACTIVE_VISION = join(VYTHERA_ADAPTERS_DIR, 'ACTIVE_VISION.json');

export interface ActiveAdapterRef {
  name: string;
  path: string;
  jobId: string | null;
  datasetVersion: string;
  promotedAt: number;
  evaluationScore: number | null;
  modality?: TrainingModality;
  baseModel?: string;
  trainingMethod?: string;
  status?: 'candidate' | 'active' | 'archived';
}

function activePathFor(modality: TrainingModality): string {
  if (modality === 'VISION_LANGUAGE' || modality === 'VISION_ENCODER' || modality === 'EMBEDDING') {
    return ACTIVE_VISION;
  }
  return ACTIVE_TEXT;
}

function loadActiveFile(file: string): ActiveAdapterRef | null {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as ActiveAdapterRef;
  } catch {
    return null;
  }
}

function saveActiveFile(file: string, ref: ActiveAdapterRef): void {
  ensureTrainDirs();
  if (!existsSync(VYTHERA_ADAPTERS_DIR)) mkdirSync(VYTHERA_ADAPTERS_DIR, { recursive: true });
  writeFileSync(file, JSON.stringify(ref, null, 2), 'utf8');
}

export function loadActive(modality: TrainingModality = 'TEXT'): ActiveAdapterRef | null {
  const primary = loadActiveFile(activePathFor(modality));
  if (primary) return primary;
  // Legacy: TEXT may still live in ACTIVE.json
  if (modality === 'TEXT') return loadActiveFile(ACTIVE_FILE);
  return null;
}

export function validateAdapterDir(dir: string): {
  ok: boolean;
  error?: string;
  score?: number;
  modality?: TrainingModality;
} {
  if (!existsSync(dir)) return { ok: false, error: 'adapter dir missing' };
  if (!existsSync(join(dir, 'adapter_config.json'))) return { ok: false, error: 'adapter_config.json missing' };
  const weights =
    existsSync(join(dir, 'adapter_model.safetensors')) || existsSync(join(dir, 'adapter_model.bin'));
  if (!weights) return { ok: false, error: 'adapter weights missing' };
  if (!existsSync(join(dir, 'manifest.json'))) return { ok: false, error: 'manifest.json missing' };
  let modality: TrainingModality | undefined;
  try {
    const man = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as {
      status?: string;
      modality?: TrainingModality;
    };
    if (man.status !== 'completed') return { ok: false, error: 'manifest not completed' };
    modality = man.modality;
  } catch {
    return { ok: false, error: 'invalid manifest' };
  }
  let score: number | undefined;
  const evalPath = join(dir, 'evaluation.json');
  if (existsSync(evalPath)) {
    try {
      const ev = JSON.parse(readFileSync(evalPath, 'utf8')) as {
        metrics?: { candidateScore?: number };
        modality?: TrainingModality;
      };
      score = ev.metrics?.candidateScore;
      if (!modality && ev.modality) modality = ev.modality;
    } catch {
      /* optional */
    }
  }
  return { ok: true, score, modality };
}

/**
 * Promote only when adapter exists, evaluation present, and score beats
 * the active adapter **for the same modality**.
 */
export function promoteFromJob(jobId: string): {
  ok: boolean;
  error?: string;
  active?: ActiveAdapterRef;
} {
  const job = readJob(jobId);
  if (!job) return { ok: false, error: 'Job not found' };
  if (job.status !== 'COMPLETED') return { ok: false, error: 'Job not COMPLETED' };
  const modality: TrainingModality = job.modality ?? 'TEXT';
  const v = validateAdapterDir(job.outputPath);
  if (!v.ok) return { ok: false, error: v.error };
  if (!existsSync(join(job.outputPath, 'evaluation.json'))) {
    return { ok: false, error: 'evaluation.json required before promote' };
  }
  if (v.score == null) return { ok: false, error: 'evaluation score missing' };

  const adapterModality = v.modality ?? modality;
  if (adapterModality !== modality) {
    return {
      ok: false,
      error: `Adapter modality ${adapterModality} does not match job modality ${modality}`,
    };
  }
  // Never promote TEXT adapter into ACTIVE_VISION or vice versa
  const current = loadActive(modality);
  if (current?.modality && current.modality !== modality) {
    return {
      ok: false,
      error: `Active pointer modality mismatch (active=${current.modality}, job=${modality})`,
    };
  }
  if (current?.evaluationScore != null && v.score <= current.evaluationScore) {
    return {
      ok: false,
      error: `Candidate score ${v.score} does not beat active ${current.evaluationScore}`,
    };
  }

  const name = job.outputPath.split(/[/\\]/).pop() ?? 'adapter';
  const ref: ActiveAdapterRef = {
    name,
    path: job.outputPath,
    jobId: job.id,
    datasetVersion: job.datasetVersion,
    promotedAt: Date.now(),
    evaluationScore: v.score,
    modality,
    baseModel: job.trainableBaseModel,
    trainingMethod: job.method,
    status: 'active',
  };
  const file = activePathFor(modality);
  saveActiveFile(file, ref);
  // Keep legacy ACTIVE.json in sync for TEXT only
  if (modality === 'TEXT') saveActiveFile(ACTIVE_FILE, ref);
  writeFileSync(join(job.outputPath, 'PROMOTED.json'), JSON.stringify(ref, null, 2), 'utf8');
  writeFileSync(
    join(job.outputPath, 'registry.json'),
    JSON.stringify(
      {
        adapterId: name,
        modality,
        baseModel: job.trainableBaseModel,
        datasetVersion: job.datasetVersion,
        trainingMethod: job.method,
        metrics: { candidateScore: v.score },
        status: 'active',
      },
      null,
      2,
    ),
    'utf8',
  );
  return { ok: true, active: ref };
}

export function rollbackTo(
  pathOrName: string,
  modality: TrainingModality = 'TEXT',
): { ok: boolean; error?: string; active?: ActiveAdapterRef } {
  ensureTrainDirs();
  let dir = pathOrName;
  if (!existsSync(dir)) {
    dir = safePathUnder(VYTHERA_ADAPTERS_DIR, pathOrName);
  }
  const v = validateAdapterDir(dir);
  if (!v.ok) return { ok: false, error: v.error };
  const resolvedModality = v.modality ?? modality;
  const name = dir.split(/[/\\]/).pop() ?? 'adapter';
  const ref: ActiveAdapterRef = {
    name,
    path: dir,
    jobId: null,
    datasetVersion: 'rollback',
    promotedAt: Date.now(),
    evaluationScore: v.score ?? null,
    modality: resolvedModality,
    status: 'active',
  };
  saveActiveFile(activePathFor(resolvedModality), ref);
  if (resolvedModality === 'TEXT') saveActiveFile(ACTIVE_FILE, ref);
  return { ok: true, active: ref };
}

export function getActiveAdapter(modality: TrainingModality = 'TEXT'): ActiveAdapterRef | null {
  return loadActive(modality);
}

export function getActiveVisionAdapter(): ActiveAdapterRef | null {
  return loadActive('VISION_LANGUAGE');
}

export function getActiveTextAdapter(): ActiveAdapterRef | null {
  return loadActive('TEXT');
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('/promote.ts')) {
  const idx = process.argv.indexOf('--job');
  const id = idx >= 0 ? process.argv[idx + 1] : null;
  if (!id) {
    console.error('Usage: tsx promote.ts --job <id>');
    process.exit(1);
  }
  const r = promoteFromJob(id);
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.ok ? 0 : 1);
}
