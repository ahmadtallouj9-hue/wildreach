import { lsGet, lsSet } from '../util/safeStorage';

/** Local fine-tuning job records — training runs outside the browser. */

export type VytheraTrainingMethod = 'LoRA' | 'QLoRA' | 'PEFT';
export type VytheraTrainingStatus =
  | 'CREATED'
  | 'QUEUED'
  | 'EXPORTING'
  | 'STARTING'
  | 'RUNNING'
  | 'EVALUATING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'awaiting_external';

export interface VytheraTrainingJob {
  id: string;
  baseModel: string;
  datasetVersion: string;
  method: VytheraTrainingMethod;
  epochs: number;
  learningRate: number;
  batchSize: number;
  outputPath: string;
  status: VytheraTrainingStatus;
  createdAt: number;
  finishedAt: number | null;
  log: string[];
  /** Browser cannot complete GPU fine-tune alone — orchestrator/daemon required. */
  requiresExternalTrainer: true;
  progressMessage?: string;
  diskJobId?: string;
}

const KEY = 'vythera.ai.training.jobs';

export class VytheraTrainingSystem {
  list(): VytheraTrainingJob[] {
    try {
      return JSON.parse(lsGet(KEY) ?? '[]') as VytheraTrainingJob[];
    } catch {
      return [];
    }
  }

  private save(jobs: VytheraTrainingJob[]): void {
    lsSet(KEY, JSON.stringify(jobs.slice(0, 50)));
  }

  /**
   * Creates a local training job config + CLI recipe.
   * Does NOT claim training succeeded — status remains awaiting_external
   * until an external local trainer reports completion via markComplete().
   */
  createJob(opts: {
    baseModel: string;
    datasetVersion: string;
    method?: VytheraTrainingMethod;
    epochs?: number;
    learningRate?: number;
    batchSize?: number;
    outputPath?: string;
    status?: VytheraTrainingStatus;
    diskJobId?: string;
  }): VytheraTrainingJob {
    const job: VytheraTrainingJob = {
      id: `train_${Date.now()}`,
      baseModel: opts.baseModel,
      datasetVersion: opts.datasetVersion,
      method: opts.method ?? 'QLoRA',
      epochs: opts.epochs ?? 3,
      learningRate: opts.learningRate ?? 2e-4,
      batchSize: opts.batchSize ?? 2,
      outputPath: opts.outputPath ?? `./adapters/vythera-${Date.now()}`,
      status: opts.status ?? 'awaiting_external',
      createdAt: Date.now(),
      finishedAt: null,
      log: [
        'Training job created in VYTHERA AI Studio.',
        'Browser cannot run LoRA/QLoRA alone — use local daemon.',
        'npm run vythera:train:daemon',
      ],
      requiresExternalTrainer: true,
      diskJobId: opts.diskJobId,
    };
    const jobs = this.list();
    jobs.unshift(job);
    this.save(jobs);
    return job;
  }

  appendLog(id: string, line: string): void {
    const jobs = this.list();
    const j = jobs.find((x) => x.id === id);
    if (!j) return;
    j.log.push(line.slice(0, 500));
    this.save(jobs);
  }

  markComplete(id: string, ok: boolean, detail: string): void {
    const jobs = this.list();
    const j = jobs.find((x) => x.id === id);
    if (!j) return;
    j.status = ok ? 'succeeded' : 'failed';
    j.finishedAt = Date.now();
    j.log.push(detail);
    this.save(jobs);
  }

  cancel(id: string): void {
    const jobs = this.list();
    const j = jobs.find((x) => x.id === id);
    if (!j || j.status === 'succeeded') return;
    j.status = 'cancelled';
    j.finishedAt = Date.now();
    j.log.push('Cancelled by user');
    this.save(jobs);
  }
}

export const vytheraTraining = new VytheraTrainingSystem();
