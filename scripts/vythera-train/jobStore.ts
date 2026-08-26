import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { ensureTrainDirs, safePathUnder, VYTHERA_JOBS_DIR } from './paths.ts';
import type { VytheraDiskTrainingJob, VytheraDiskJobStatus } from './types.ts';
import { sanitizePersistedError, sanitizePersistedLogLine, sanitizeLogLines } from './sanitize-log.ts';

function jobDir(id: string): string {
  if (!/^train_[\w-]+$/.test(id) && !/^job_[\w-]+$/.test(id)) {
    throw new Error(`Invalid job id: ${id}`);
  }
  return safePathUnder(VYTHERA_JOBS_DIR, id);
}

export function jobManifestPath(id: string): string {
  return join(jobDir(id), 'job.json');
}

/** Sanitize log/error fields before disk write — keep operational paths intact. */
function scrubJobForPersist(job: VytheraDiskTrainingJob): VytheraDiskTrainingJob {
  return {
    ...job,
    log: sanitizeLogLines(job.log ?? []),
    error: job.error != null ? sanitizePersistedError(job.error) : null,
    progress: job.progress
      ? {
          ...job.progress,
          message: job.progress.message
            ? sanitizePersistedLogLine(job.progress.message)
            : job.progress.message,
          rawLine: job.progress.rawLine
            ? sanitizePersistedLogLine(job.progress.rawLine)
            : job.progress.rawLine,
        }
      : job.progress,
  };
}

export function writeJob(job: VytheraDiskTrainingJob): void {
  ensureTrainDirs();
  const dir = jobDir(job.id);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  job.updatedAt = Date.now();
  const safe = scrubJobForPersist(job);
  // Keep in-memory job log scrubbed so subsequent reads stay clean
  job.log = safe.log;
  job.error = safe.error;
  if (safe.progress) job.progress = safe.progress;
  writeFileSync(jobManifestPath(job.id), JSON.stringify(safe, null, 2), 'utf8');
}

export function readJob(id: string): VytheraDiskTrainingJob | null {
  const p = jobManifestPath(id);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as VytheraDiskTrainingJob;
  } catch {
    return null;
  }
}

export function listJobs(): VytheraDiskTrainingJob[] {
  ensureTrainDirs();
  if (!existsSync(VYTHERA_JOBS_DIR)) return [];
  const out: VytheraDiskTrainingJob[] = [];
  for (const name of readdirSync(VYTHERA_JOBS_DIR)) {
    const j = readJob(name);
    if (j) out.push(j);
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

export function updateJobStatus(
  id: string,
  status: VytheraDiskJobStatus,
  patch?: Partial<VytheraDiskTrainingJob>,
): VytheraDiskTrainingJob | null {
  const job = readJob(id);
  if (!job) return null;
  const next: VytheraDiskTrainingJob = {
    ...job,
    ...patch,
    status,
    updatedAt: Date.now(),
  };
  if (patch?.error != null) next.error = sanitizePersistedError(patch.error);
  if (patch?.log) next.log = sanitizeLogLines(patch.log);
  if (status === 'RUNNING' && !next.startedAt) next.startedAt = Date.now();
  if (status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED') {
    next.finishedAt = Date.now();
  }
  writeJob(next);
  return next;
}

export function appendJobLog(id: string, line: string): void {
  const job = readJob(id);
  if (!job) return;
  job.log.push(sanitizePersistedLogLine(line));
  if (job.log.length > 500) job.log = job.log.slice(-500);
  writeJob(job);
}

export function createDiskJob(opts: {
  id?: string;
  baseModel: string;
  trainableBaseModel: string;
  modality?: import('./types.ts').TrainingModality;
  datasetVersion: string;
  datasetDir: string;
  outputPath: string;
  method?: 'QLoRA' | 'LoRA';
  epochs?: number;
  learningRate?: number;
  batchSize?: number;
  provider?: string;
  isMock?: boolean;
}): VytheraDiskTrainingJob {
  ensureTrainDirs();
  const id = opts.id ?? `train_${Date.now()}`;
  const job: VytheraDiskTrainingJob = {
    id,
    status: 'CREATED',
    baseModel: opts.baseModel,
    trainableBaseModel: opts.trainableBaseModel,
    modality: opts.modality ?? 'TEXT',
    datasetVersion: opts.datasetVersion,
    datasetDir: opts.datasetDir,
    outputPath: opts.outputPath,
    method: opts.method ?? 'QLoRA',
    epochs: opts.epochs ?? 1,
    learningRate: opts.learningRate ?? 2e-4,
    batchSize: opts.batchSize ?? 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    startedAt: null,
    finishedAt: null,
    pid: null,
    progress: null,
    log: ['Job CREATED'],
    error: null,
    completionManifest: null,
    provider: opts.provider ?? 'python-qlora',
    isMock: opts.isMock ?? false,
  };
  writeJob(job);
  return job;
}
