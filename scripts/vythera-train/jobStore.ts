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

function jobDir(id: string): string {
  if (!/^train_[\w-]+$/.test(id) && !/^job_[\w-]+$/.test(id)) {
    throw new Error(`Invalid job id: ${id}`);
  }
  return safePathUnder(VYTHERA_JOBS_DIR, id);
}

export function jobManifestPath(id: string): string {
  return join(jobDir(id), 'job.json');
}

export function writeJob(job: VytheraDiskTrainingJob): void {
  ensureTrainDirs();
  const dir = jobDir(job.id);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  job.updatedAt = Date.now();
  writeFileSync(jobManifestPath(job.id), JSON.stringify(job, null, 2), 'utf8');
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
  job.log.push(line.slice(0, 1000));
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
