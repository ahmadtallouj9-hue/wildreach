/**
 * VYTHERA AI local training CLI.
 *
 * Usage:
 *   npx tsx scripts/vythera-train/run-job.ts --detect
 *   npx tsx scripts/vythera-train/run-job.ts --job <id> --start
 *   npx tsx scripts/vythera-train/run-job.ts --export-file dataset.json --version v1 --base MODEL
 *   npx tsx scripts/vythera-train/run-job.ts --daemon
 */
import { readFileSync, existsSync } from 'node:fs';
import { detectCapability, formatCapabilityLines } from './detect-capability.ts';
import { exportAndCreateJob, startJob, cancelJob, recoverJobs } from './orchestrator.ts';
import { listJobs, readJob } from './jobStore.ts';
import type { VisualRecordLike } from './export-dataset.ts';

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

function has(name: string): boolean {
  return process.argv.includes(name);
}

async function main(): Promise<void> {
  if (has('--daemon')) {
    await import('./daemon.ts');
    return;
  }

  if (has('--detect')) {
    const cap = detectCapability({ forceMockTrainer: has('--mock') });
    console.log(JSON.stringify(cap, null, 2));
    console.log(formatCapabilityLines(cap).join('\n'));
    process.exit(cap.available ? 0 : 2);
  }

  if (has('--recover')) {
    console.log(JSON.stringify(recoverJobs(), null, 2));
    return;
  }

  if (has('--list')) {
    console.log(JSON.stringify(listJobs(), null, 2));
    return;
  }

  const exportFile = arg('--export-file');
  if (exportFile) {
    if (!existsSync(exportFile)) {
      console.error('Export file not found');
      process.exit(1);
    }
    const raw = JSON.parse(readFileSync(exportFile, 'utf8')) as {
      records?: VisualRecordLike[];
    } | VisualRecordLike[];
    const records = Array.isArray(raw) ? raw : raw.records ?? [];
    const { job, capability } = await exportAndCreateJob({
      records,
      datasetVersion: arg('--version') ?? `vdv_${Date.now()}`,
      baseModel: arg('--base') ?? 'local-base',
      trainableBaseModel: arg('--trainable') ?? undefined,
      useMock: has('--mock'),
    });
    console.log(JSON.stringify({ job, capability }, null, 2));
    if (has('--start') && (capability.available || has('--mock'))) {
      const finished = await startJob(job.id);
      console.log(JSON.stringify(finished, null, 2));
      process.exit(finished.status === 'COMPLETED' ? 0 : 1);
    }
    if (!capability.available && !has('--mock')) {
      console.log('Status: awaiting_external — LOCAL TRAINING BACKEND NOT AVAILABLE');
      process.exit(2);
    }
    return;
  }

  const jobId = arg('--job');
  if (!jobId) {
    console.log(`VYTHERA local training
  --detect              Probe Python/GPU/CUDA/trainer
  --recover             Reconcile jobs from disk
  --list                List jobs
  --export-file FILE    Create job from JSON records
  --job ID --start      Start queued job
  --job ID --cancel     Cancel running job
  --daemon              Start localhost control API (127.0.0.1:8791)
  --mock                Use mock provider (tests only)
`);
    process.exit(0);
  }

  if (has('--cancel')) {
    console.log(JSON.stringify(cancelJob(jobId), null, 2));
    return;
  }

  if (has('--start')) {
    const job = readJob(jobId);
    if (!job) {
      console.error('Job not found — create via --export-file or Studio daemon');
      process.exit(1);
    }
    const finished = await startJob(jobId);
    console.log(JSON.stringify(finished, null, 2));
    process.exit(finished.status === 'COMPLETED' ? 0 : 1);
  }

  console.log(JSON.stringify(readJob(jobId), null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
