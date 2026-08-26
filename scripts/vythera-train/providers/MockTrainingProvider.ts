import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  VytheraDiskTrainingJob,
  VytheraEvaluationResult,
  VytheraTrainingProgress,
  VytheraTrainingProvider,
  VytheraTrainingResult,
  VytheraCompletionManifest,
} from '../types.ts';

/**
 * Test-only provider. Writes real-looking adapter files but MUST never be
 * reported to users as real GPU training.
 */
export class MockTrainingProvider implements VytheraTrainingProvider {
  readonly id = 'mock';
  readonly displayName = 'Mock Training Provider (tests)';
  readonly isMock = true;
  fail = false;
  steps = 5;

  cancel(): void {
    /* no-op for mock */
  }

  async canTrain(_model: string): Promise<boolean> {
    return true;
  }

  async train(
    job: VytheraDiskTrainingJob,
    opts: { onProgress: (p: VytheraTrainingProgress) => void; signal?: AbortSignal },
  ): Promise<VytheraTrainingResult> {
    if (!existsSync(job.outputPath)) mkdirSync(job.outputPath, { recursive: true });
    let lastLoss = 2.5;
    for (let step = 1; step <= this.steps; step++) {
      if (opts.signal?.aborted) {
        return {
          ok: false,
          job: { ...job, status: 'CANCELLED' },
          error: 'CANCELLED',
        };
      }
      lastLoss = Math.max(0.1, lastLoss - 0.3);
      opts.onProgress({
        message: `Step ${step} / ${this.steps}`,
        step,
        totalSteps: this.steps,
        loss: Number(lastLoss.toFixed(4)),
        rawLine: `step=${step} loss=${lastLoss.toFixed(4)}`,
      });
      await new Promise((r) => setTimeout(r, 5));
    }
    if (this.fail) {
      return { ok: false, job, error: 'Mock trainer forced failure' };
    }
    writeFileSync(
      join(job.outputPath, 'adapter_config.json'),
      JSON.stringify({ peft_type: 'LORA', mock: true, base: job.trainableBaseModel }, null, 2),
    );
    writeFileSync(join(job.outputPath, 'adapter_model.safetensors'), Buffer.from('MOCK_ADAPTER_WEIGHTS'));
    mkdirSync(join(job.outputPath, 'tokenizer'), { recursive: true });
    writeFileSync(join(job.outputPath, 'tokenizer', 'tokenizer_config.json'), '{"mock":true}');
    const metrics = {
      train_loss: lastLoss,
      validation_loss: lastLoss + 0.05,
      steps: this.steps,
      epochs: job.epochs,
    };
    writeFileSync(join(job.outputPath, 'metrics.json'), JSON.stringify(metrics, null, 2));
    const manifest: VytheraCompletionManifest = {
      status: 'completed',
      baseModel: job.trainableBaseModel,
      adapterPath: job.outputPath,
      datasetVersion: job.datasetVersion,
      trainingSteps: this.steps,
      epochs: job.epochs,
      trainLoss: lastLoss,
      validationLoss: lastLoss + 0.05,
      metricsPath: join(job.outputPath, 'metrics.json'),
      modality: job.modality ?? 'TEXT',
      completedAt: Date.now(),
      provider: this.id,
    };
    writeFileSync(join(job.outputPath, 'manifest.json'), JSON.stringify(manifest, null, 2));
    return { ok: true, job, manifest };
  }

  async evaluate(opts: {
    job: VytheraDiskTrainingJob;
    validationJsonl: string;
  }): Promise<VytheraEvaluationResult> {
    const lines = existsSync(opts.validationJsonl)
      ? readFileSync(opts.validationJsonl, 'utf8').trim().split('\n').filter(Boolean)
      : [];
    const n = Math.max(1, lines.length);
    const baseScore = 0.4;
    const candidateScore = 0.55;
    const evaluation = {
      modality: opts.job.modality ?? 'TEXT',
      datasetVersion: opts.job.datasetVersion,
      baseModel: opts.job.trainableBaseModel,
      candidateAdapter: opts.job.outputPath,
      metrics: { baseScore, candidateScore, samples: n },
      timestamp: Date.now(),
      evaluationConfiguration: { provider: this.id, mock: true },
    };
    const metricsPath = join(opts.job.outputPath, 'evaluation.json');
    if (!existsSync(opts.job.outputPath)) mkdirSync(opts.job.outputPath, { recursive: true });
    writeFileSync(metricsPath, JSON.stringify(evaluation, null, 2));
    return {
      ok: true,
      baseScore,
      candidateScore,
      improved: candidateScore > baseScore,
      metricsPath,
      details: evaluation,
    };
  }
}
