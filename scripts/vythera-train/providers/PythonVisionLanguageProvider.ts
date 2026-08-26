/**
 * Spawns the real Python VLM PEFT trainer (separate from text QLoRA).
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PYTHON_VLM_TRAINER,
  PYTHON_VLM_EVAL,
  isSafeModelId,
  venvPythonPath,
} from '../paths.ts';
import type {
  VytheraDiskTrainingJob,
  VytheraEvaluationResult,
  VytheraTrainingProgress,
  VytheraTrainingProvider,
  VytheraTrainingResult,
  VytheraCompletionManifest,
} from '../types.ts';
import { sanitizePersistedError } from '../sanitize-log.ts';

function resolvePython(): string {
  const venv = venvPythonPath();
  if (existsSync(venv)) return venv;
  return process.platform === 'win32' ? 'python' : 'python3';
}

export class PythonVisionLanguageProvider implements VytheraTrainingProvider {
  readonly id = 'python-vlm';
  readonly displayName = 'Python Vision-Language PEFT (local)';
  readonly isMock = false;
  private child: ChildProcessWithoutNullStreams | null = null;

  constructor(private pythonCmd: string = resolvePython()) {}

  async canTrain(model: string): Promise<boolean> {
    if (!isSafeModelId(model)) return false;
    return existsSync(PYTHON_VLM_TRAINER);
  }

  cancel(): void {
    if (this.child && !this.child.killed) {
      this.child.kill('SIGTERM');
      setTimeout(() => {
        if (this.child && !this.child.killed) this.child.kill('SIGKILL');
      }, 3000);
    }
  }

  async train(
    job: VytheraDiskTrainingJob,
    opts: { onProgress: (p: VytheraTrainingProgress) => void; signal?: AbortSignal },
  ): Promise<VytheraTrainingResult> {
    if (job.modality !== 'VISION_LANGUAGE') {
      return { ok: false, job, error: 'PythonVisionLanguageProvider requires VISION_LANGUAGE modality' };
    }
    if (!existsSync(PYTHON_VLM_TRAINER)) {
      return { ok: false, job, error: 'VLM trainer script missing' };
    }
    if (!isSafeModelId(job.trainableBaseModel)) {
      return { ok: false, job, error: 'Unsafe trainable base model' };
    }
    if (!existsSync(job.outputPath)) mkdirSync(job.outputPath, { recursive: true });

    const method = job.method.toLowerCase() === 'qlora' ? 'qlora' : 'lora';
    const args = [
      PYTHON_VLM_TRAINER,
      '--base',
      job.trainableBaseModel,
      '--data',
      job.datasetDir,
      '--out',
      job.outputPath,
      '--epochs',
      String(job.epochs),
      '--lr',
      String(job.learningRate),
      '--batch',
      String(job.batchSize),
      '--method',
      method,
      '--grad-accum',
      '4',
      '--grad-checkpoint',
      '--lora-r',
      '8',
    ];

    return await new Promise((resolve) => {
      const child = spawn(this.pythonCmd, args, {
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.child = child;
      let stderr = '';
      const onAbort = () => this.cancel();
      opts.signal?.addEventListener('abort', onAbort);

      child.stdout.on('data', (buf: Buffer) => {
        const line = buf.toString('utf8');
        for (const raw of line.split(/\r?\n/)) {
          if (!raw.trim()) continue;
          const m = raw.match(/step=(\d+)\s*\/\s*(\d+)(?:\s+loss=([\d.eE+-]+))?/);
          opts.onProgress({
            message: raw.includes('TRAINING COMPLETE')
              ? 'TRAINING COMPLETE'
              : m
                ? `Step ${m[1]} / ${m[2]}${m[3] ? ` · Loss: ${m[3]}` : ''}`
                : 'TRAINING IN PROGRESS',
            step: m ? Number(m[1]) : undefined,
            totalSteps: m ? Number(m[2]) : undefined,
            loss: m?.[3] != null ? Number(m[3]) : undefined,
            rawLine: raw.slice(0, 500),
          });
        }
      });
      child.stderr.on('data', (buf: Buffer) => {
        stderr += buf.toString('utf8');
      });
      child.on('close', (code) => {
        opts.signal?.removeEventListener('abort', onAbort);
        this.child = null;
        if (opts.signal?.aborted) {
          resolve({ ok: false, job, error: 'CANCELLED' });
          return;
        }
        if (code !== 0) {
          const err = (stderr || `VLM trainer exited ${code}`).trim();
          resolve({
            ok: false,
            job,
            error: sanitizePersistedError(err.slice(Math.max(0, err.length - 1200))),
          });
          return;
        }
        try {
          const man = JSON.parse(
            readFileSync(join(job.outputPath, 'manifest.json'), 'utf8'),
          ) as VytheraCompletionManifest;
          if (man.status !== 'completed') {
            resolve({ ok: false, job, error: 'manifest not completed' });
            return;
          }
          resolve({ ok: true, job, manifest: man });
        } catch (e) {
          resolve({
            ok: false,
            job,
            error: e instanceof Error ? e.message : 'bad completion manifest',
          });
        }
      });
    });
  }

  async evaluate(opts: {
    job: VytheraDiskTrainingJob;
    validationJsonl: string;
  }): Promise<VytheraEvaluationResult> {
    const outPath = join(opts.job.outputPath, 'evaluation.json');
    if (!existsSync(PYTHON_VLM_EVAL)) {
      return {
        ok: false,
        baseScore: 0,
        candidateScore: 0,
        improved: false,
        metricsPath: outPath,
        details: { error: 'evaluate_vlm.py missing' },
      };
    }
    const args = [
      PYTHON_VLM_EVAL,
      '--base',
      opts.job.trainableBaseModel,
      '--adapter',
      opts.job.outputPath,
      '--data',
      opts.job.datasetDir,
      '--out',
      outPath,
    ];
    return await new Promise((resolve) => {
      const child = spawn(this.pythonCmd, args, {
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stderr = '';
      child.stderr.on('data', (b: Buffer) => {
        stderr += b.toString('utf8');
      });
      child.on('close', (code) => {
        if (code !== 0 || !existsSync(outPath)) {
          resolve({
            ok: false,
            baseScore: 0,
            candidateScore: 0,
            improved: false,
            metricsPath: outPath,
            details: { error: stderr.slice(0, 400) },
          });
          return;
        }
        try {
          const ev = JSON.parse(readFileSync(outPath, 'utf8')) as {
            metrics?: { baseScore?: number; candidateScore?: number; improved?: boolean };
          };
          const baseScore = Number(ev.metrics?.baseScore ?? 0);
          const candidateScore = Number(ev.metrics?.candidateScore ?? 0);
          resolve({
            ok: true,
            baseScore,
            candidateScore,
            improved: !!ev.metrics?.improved,
            metricsPath: outPath,
            details: ev as Record<string, unknown>,
          });
        } catch (e) {
          resolve({
            ok: false,
            baseScore: 0,
            candidateScore: 0,
            improved: false,
            metricsPath: outPath,
            details: { error: e instanceof Error ? e.message : 'parse error' },
          });
        }
      });
    });
  }
}

/** Write a minimal evaluation stub only for unit tests — never used for real VLM jobs. */
export function writeVlmEvalStub(path: string, scores: { base: number; candidate: number }): void {
  writeFileSync(
    path,
    JSON.stringify({
      modality: 'VISION_LANGUAGE',
      metrics: {
        baseScore: scores.base,
        candidateScore: scores.candidate,
        improved: scores.candidate > scores.base,
        samples: 1,
      },
      timestamp: Date.now(),
    }),
    'utf8',
  );
}
