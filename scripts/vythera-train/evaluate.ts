import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readJob } from './jobStore.ts';
import { MockTrainingProvider } from './providers/MockTrainingProvider.ts';
import { PythonQLoRAProvider } from './providers/PythonQLoRAProvider.ts';
import { PythonVisionLanguageProvider } from './providers/PythonVisionLanguageProvider.ts';

/** Evaluate a completed job's adapter against held-out/validation split. */
export async function evaluateJob(jobId: string, opts?: { useMock?: boolean }): Promise<{
  ok: boolean;
  path?: string;
  error?: string;
  baseScore?: number;
  candidateScore?: number;
  improved?: boolean;
}> {
  const job = readJob(jobId);
  if (!job) return { ok: false, error: 'Job not found' };
  if (!existsSync(job.outputPath)) return { ok: false, error: 'Adapter path missing' };
  const nestedVal = join(job.datasetDir, 'validation', 'data.jsonl');
  const nestedHeld = join(job.datasetDir, 'held_out', 'data.jsonl');
  const val = join(job.datasetDir, 'validation.jsonl');
  const held = join(job.datasetDir, 'held_out.jsonl');
  const data = existsSync(nestedVal)
    ? nestedVal
    : existsSync(nestedHeld)
      ? nestedHeld
      : existsSync(val) && readFileSync(val, 'utf8').trim()
        ? val
        : held;
  const provider =
    opts?.useMock || job.isMock
      ? new MockTrainingProvider()
      : job.modality === 'VISION_LANGUAGE'
        ? new PythonVisionLanguageProvider()
        : new PythonQLoRAProvider();
  const result = await provider.evaluate({ job, validationJsonl: data });
  return {
    ok: result.ok,
    path: result.metricsPath,
    baseScore: result.baseScore,
    candidateScore: result.candidateScore,
    improved: result.improved,
  };
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('/evaluate.ts')) {
  const idx = process.argv.indexOf('--job');
  const id = idx >= 0 ? process.argv[idx + 1] : null;
  if (!id) {
    console.error('Usage: tsx evaluate.ts --job <id>');
    process.exit(1);
  }
  evaluateJob(id).then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
  });
}
