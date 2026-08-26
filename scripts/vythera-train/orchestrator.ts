import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectCapability } from './detect-capability.ts';
import { exportVisualDataset, validateExportedDataset, type VisualRecordLike } from './export-dataset.ts';
import { exportVlmDataset, validateVlmDataset } from './export-vlm-dataset.ts';
import {
  appendJobLog,
  createDiskJob,
  listJobs,
  readJob,
  updateJobStatus,
  writeJob,
} from './jobStore.ts';
import {
  ensureTrainDirs,
  safePathUnder,
  VYTHERA_ADAPTERS_DIR,
  isSafeModelId,
  resolveTrainableBase,
  venvPythonPath,
  PYTHON_VLM_TRAINER,
  DEFAULT_VLM_BASE,
} from './paths.ts';
import { inferDefaultModality, validateModalityCombo, classifyTrainableBase } from './modality.ts';
import { runPreflight } from './preflight.ts';
import { estimateVramMb, estimateParamBillions, defaultVlmTrainSettings } from './vram-estimate.ts';
import { MockTrainingProvider } from './providers/MockTrainingProvider.ts';
import { PythonQLoRAProvider } from './providers/PythonQLoRAProvider.ts';
import { PythonVisionLanguageProvider } from './providers/PythonVisionLanguageProvider.ts';
import type {
  TrainingModality,
  VytheraDiskTrainingJob,
  VytheraTrainingCapability,
  VytheraTrainingProvider,
} from './types.ts';

const activeAborts = new Map<string, AbortController>();
const activeProviders = new Map<string, { cancel(): void }>();

function resolvePythonCmd(cap: VytheraTrainingCapability): string {
  if (cap.python.executable && existsSync(cap.python.executable)) return cap.python.executable;
  const venv = venvPythonPath();
  if (existsSync(venv)) return venv;
  return process.platform === 'win32' ? 'python' : 'python3';
}

export function selectProvider(
  cap: VytheraTrainingCapability,
  opts?: { useMock?: boolean; modality?: TrainingModality },
): VytheraTrainingProvider {
  if (opts?.useMock) return new MockTrainingProvider();
  const py = resolvePythonCmd(cap);
  if (opts?.modality === 'VISION_LANGUAGE') {
    if (!existsSync(PYTHON_VLM_TRAINER)) {
      return new PythonVisionLanguageProvider(py);
    }
    return new PythonVisionLanguageProvider(py);
  }
  return new PythonQLoRAProvider(py);
}

function pickMethod(cap: VytheraTrainingCapability, modality?: TrainingModality): 'QLoRA' | 'LoRA' {
  // Prefer LoRA for VLMs — 4-bit QLoRA is flakier on ImageTextToText stacks
  if (modality === 'VISION_LANGUAGE') return 'LoRA';
  return cap.backend.qloraAvailable ? 'QLoRA' : 'LoRA';
}

export async function exportAndCreateJob(opts: {
  records: VisualRecordLike[];
  datasetVersion: string;
  baseModel: string;
  trainableBaseModel?: string;
  images?: Record<string, { base64: string; mimeType: string }>;
  modality?: TrainingModality;
  textOnly?: boolean;
  useMock?: boolean;
  epochs?: number;
}): Promise<{ job: VytheraDiskTrainingJob; capability: VytheraTrainingCapability }> {
  ensureTrainDirs();
  const capability = detectCapability({ forceMockTrainer: opts.useMock });

  let trainable = opts.trainableBaseModel ?? opts.baseModel;
  if (!isSafeModelId(trainable)) throw new Error('Unsafe model id');

  const kind = classifyTrainableBase(trainable);
  if (kind === 'OLLAMA_GGUF_NOT_TRAINABLE' && !opts.useMock) {
    throw new Error('MODEL NOT TRAINABLE WITH CURRENT LOCAL BACKEND');
  }

  try {
    trainable = resolveTrainableBase(trainable);
  } catch {
    /* keep HF id */
  }

  const hasImages = !!(opts.images && Object.keys(opts.images).length > 0);
  let modality =
    opts.modality ??
    inferDefaultModality(trainable, {
      forceTextOnly: opts.textOnly,
      hasImages,
    });

  // Default VLM base when user requests vision without a HF VLM id
  if (modality === 'VISION_LANGUAGE' && kind === 'TEXT_MODEL' && !opts.useMock) {
    throw new Error(
      'TRAINING BLOCKED\nReason:\nSelected base model is text-only but dataset requires vision-language training. '
        + `Use a VLM such as ${DEFAULT_VLM_BASE}.`,
    );
  }

  const combo = validateModalityCombo({
    modality,
    baseModel: trainable,
    hasImages: hasImages || modality === 'TEXT' || !!opts.useMock,
  });
  if (!combo.ok && !opts.useMock) {
    throw new Error(combo.error ?? 'Incompatible modality');
  }

  let dir: string;
  let datasetVersion: string;

  if (modality === 'VISION_LANGUAGE' && !opts.useMock) {
    if (!hasImages) throw new Error('VISION_LANGUAGE requires image bytes');
    const exported = exportVlmDataset(opts.records, {
      datasetVersion: opts.datasetVersion,
      images: opts.images!,
    });
    const valid = validateVlmDataset(exported.dir);
    if (!valid.ok) throw new Error(valid.error ?? 'Invalid VLM export');
    dir = exported.dir;
    datasetVersion = exported.manifest.datasetVersion;
  } else {
    const exported = exportVisualDataset(opts.records, {
      datasetVersion: opts.datasetVersion,
      images: opts.images,
      modality: opts.useMock ? 'TEXT' : modality,
      textOnly: opts.textOnly ?? (!hasImages || modality === 'TEXT'),
    });
    const valid = validateExportedDataset(exported.dir);
    if (!valid.ok) throw new Error(valid.error ?? 'Invalid export');
    dir = exported.dir;
    datasetVersion = exported.manifest.datasetVersion;
  }

  const outPrefix = modality === 'VISION_LANGUAGE' ? 'VYTHERA-VLM' : 'VYTHERA-VISION';
  const outputPath = safePathUnder(VYTHERA_ADAPTERS_DIR, `${outPrefix}-${Date.now()}`);

  const provider = selectProvider(capability, {
    useMock: opts.useMock,
    modality: opts.useMock ? 'TEXT' : modality,
  });
  const job = createDiskJob({
    baseModel: opts.baseModel,
    trainableBaseModel: trainable,
    modality: opts.useMock ? 'TEXT' : modality,
    datasetVersion,
    datasetDir: dir,
    outputPath,
    epochs: opts.epochs ?? 1,
    method: pickMethod(capability, opts.useMock ? 'TEXT' : modality),
    provider: provider.id,
    isMock: provider.isMock,
  });

  const visionReady =
    modality !== 'VISION_LANGUAGE' ||
    (capability.available && existsSync(PYTHON_VLM_TRAINER) && !!capability.packages?.peft);

  if ((!capability.available || (modality === 'VISION_LANGUAGE' && !visionReady)) && !opts.useMock) {
    updateJobStatus(job.id, 'awaiting_external', {
      log: [
        ...job.log,
        modality === 'VISION_LANGUAGE' ? 'VISION TRAINING NOT AVAILABLE' : 'LOCAL TRAINING BACKEND NOT AVAILABLE',
        capability.reason ?? '',
        'Export ready — run when dependencies are installed.',
      ],
      error:
        modality === 'VISION_LANGUAGE'
          ? 'VISION TRAINING NOT AVAILABLE'
          : capability.reason ?? 'backend unavailable',
    });
  } else {
    updateJobStatus(job.id, 'QUEUED');
  }
  return { job: readJob(job.id)!, capability };
}

export async function startJob(id: string): Promise<VytheraDiskTrainingJob> {
  const job = readJob(id);
  if (!job) throw new Error('Job not found');
  if (job.status === 'RUNNING' || job.status === 'STARTING') throw new Error('Job already running');
  if (job.status === 'COMPLETED') throw new Error('Job already completed');

  const modality = job.modality ?? 'TEXT';
  const capability = detectCapability({ forceMockTrainer: job.isMock });
  if (!capability.available && !job.isMock) {
    updateJobStatus(id, 'awaiting_external', { error: capability.reason ?? 'unavailable' });
    return readJob(id)!;
  }
  if (modality === 'VISION_LANGUAGE' && !existsSync(PYTHON_VLM_TRAINER) && !job.isMock) {
    updateJobStatus(id, 'awaiting_external', { error: 'VISION TRAINING NOT AVAILABLE — train_vlm.py missing' });
    return readJob(id)!;
  }

  // VRAM gate for VLM
  if (modality === 'VISION_LANGUAGE' && !job.isMock) {
    const settings = defaultVlmTrainSettings(capability.gpu.vramMb ?? 8192);
    const est = estimateVramMb({
      vramMb: capability.gpu.vramMb ?? 0,
      paramBillions: estimateParamBillions(job.trainableBaseModel),
      method: settings.method,
      batchSize: settings.batchSize,
      gradAccum: settings.gradAccum,
      imageSide: settings.imageSide,
      maxSeqLen: settings.maxSeqLen,
      loraRank: settings.loraRank,
      gradientCheckpointing: settings.gradientCheckpointing,
      mixedPrecision: settings.mixedPrecision,
    });
    for (const line of est.lines) appendJobLog(id, line);
    if (!est.ok) {
      updateJobStatus(id, 'FAILED', { error: est.blockedReason });
      return readJob(id)!;
    }
  }

  const pre = runPreflight({
    datasetDir: job.datasetDir,
    trainableBaseModel: job.trainableBaseModel,
    modality,
    outputDir: job.outputPath,
    capability,
    requireGpu: modality === 'VISION_LANGUAGE',
  });
  for (const line of pre.lines) appendJobLog(id, line);
  if (!pre.ready && !job.isMock) {
    updateJobStatus(id, 'awaiting_external', {
      error: pre.blockedReason ?? 'TRAINING BLOCKED',
    });
    return readJob(id)!;
  }

  // Reject routing a VLM job to the text trainer
  if (modality === 'VISION_LANGUAGE' && !job.isMock) {
    const kind = classifyTrainableBase(job.trainableBaseModel);
    if (kind !== 'VISION_LANGUAGE_MODEL') {
      updateJobStatus(id, 'FAILED', {
        error:
          'TRAINING BLOCKED\nReason:\nSelected base model is text-only but dataset requires vision-language training.',
      });
      return readJob(id)!;
    }
  }

  const provider = selectProvider(capability, { useMock: job.isMock, modality });
  if (modality === 'VISION_LANGUAGE' && provider.id === 'python-qlora' && !job.isMock) {
    updateJobStatus(id, 'FAILED', {
      error: 'VISION_LANGUAGE job must not use text trainer',
    });
    return readJob(id)!;
  }

  const ac = new AbortController();
  activeAborts.set(id, ac);
  activeProviders.set(id, provider as { cancel(): void });

  updateJobStatus(id, 'EXPORTING');
  const valid =
    modality === 'VISION_LANGUAGE' && !job.isMock
      ? validateVlmDataset(job.datasetDir)
      : validateExportedDataset(job.datasetDir);
  if (!valid.ok) {
    updateJobStatus(id, 'FAILED', { error: valid.error ?? 'dataset invalid' });
    activeAborts.delete(id);
    return readJob(id)!;
  }

  const j0 = readJob(id)!;
  j0.method = pickMethod(capability, modality);
  writeJob(j0);

  updateJobStatus(id, 'STARTING');
  appendJobLog(id, `Starting provider ${provider.id} (${j0.method}) modality=${modality}`);
  updateJobStatus(id, 'RUNNING', { pid: null });

  const result = await provider.train(readJob(id)!, {
    signal: ac.signal,
    onProgress: (p) => {
      const j = readJob(id);
      if (!j) return;
      j.progress = p;
      j.log.push(p.message.slice(0, 300));
      if (j.log.length > 500) j.log = j.log.slice(-500);
      writeJob(j);
    },
  });

  activeAborts.delete(id);
  activeProviders.delete(id);

  if (ac.signal.aborted || result.error === 'CANCELLED') {
    updateJobStatus(id, 'CANCELLED', { error: 'CANCELLED' });
    return readJob(id)!;
  }

  if (!result.ok || !result.manifest) {
    updateJobStatus(id, 'FAILED', { error: result.error ?? 'training failed' });
    return readJob(id)!;
  }

  const cfg = join(job.outputPath, 'adapter_config.json');
  const weights =
    existsSync(join(job.outputPath, 'adapter_model.safetensors')) ||
    existsSync(join(job.outputPath, 'adapter_model.bin'));
  if (!existsSync(cfg) || !weights) {
    updateJobStatus(id, 'FAILED', { error: 'Adapter files missing after train' });
    return readJob(id)!;
  }
  if (!existsSync(join(job.outputPath, 'manifest.json'))) {
    updateJobStatus(id, 'FAILED', { error: 'Training manifest missing after train' });
    return readJob(id)!;
  }

  updateJobStatus(id, 'EVALUATING', { completionManifest: result.manifest });
  const valPath = join(job.datasetDir, 'validation.jsonl');
  const held = join(job.datasetDir, 'held_out.jsonl');
  const nestedVal = join(job.datasetDir, 'validation', 'data.jsonl');
  const nestedHeld = join(job.datasetDir, 'held_out', 'data.jsonl');
  const evalData = existsSync(nestedVal)
    ? nestedVal
    : existsSync(nestedHeld)
      ? nestedHeld
      : existsSync(valPath) && readFileSync(valPath, 'utf8').trim()
        ? valPath
        : held;
  try {
    const ev = await provider.evaluate({
      job: readJob(id)!,
      validationJsonl: evalData,
    });
    appendJobLog(id, `Evaluation candidate=${ev.candidateScore} base=${ev.baseScore}`);
    const j = readJob(id)!;
    if (j.completionManifest) {
      j.completionManifest.evaluationPath = ev.metricsPath;
      j.completionManifest.modality = j.modality;
      j.completionManifest.validationLoss = ev.candidateScore;
    }
    writeJob(j);
  } catch (e) {
    appendJobLog(id, `Evaluation error: ${e instanceof Error ? e.message : e}`);
  }

  updateJobStatus(id, 'COMPLETED', {
    completionManifest: readJob(id)?.completionManifest ?? result.manifest,
  });
  appendJobLog(id, 'COMPLETED — adapter ready for promote after review');
  return readJob(id)!;
}

export function cancelJob(id: string): VytheraDiskTrainingJob | null {
  const ac = activeAborts.get(id);
  ac?.abort();
  const py = activeProviders.get(id);
  if (py && typeof py.cancel === 'function') py.cancel();
  const job = readJob(id);
  if (!job) return null;
  if (job.status === 'COMPLETED') return job;
  updateJobStatus(id, 'CANCELLED', { error: 'CANCELLED' });
  return readJob(id);
}

export function recoverJobs(): VytheraDiskTrainingJob[] {
  const out: VytheraDiskTrainingJob[] = [];
  for (const job of listJobs()) {
    if (job.status !== 'RUNNING' && job.status !== 'STARTING' && job.status !== 'EXPORTING') {
      continue;
    }
    const cfg = join(job.outputPath, 'adapter_config.json');
    const weights =
      existsSync(join(job.outputPath, 'adapter_model.safetensors')) ||
      existsSync(join(job.outputPath, 'adapter_model.bin'));
    const man = join(job.outputPath, 'manifest.json');
    if (existsSync(cfg) && weights && existsSync(man)) {
      try {
        const m = JSON.parse(readFileSync(man, 'utf8')) as { status?: string };
        if (m.status === 'completed') {
          updateJobStatus(job.id, 'COMPLETED');
          out.push(readJob(job.id)!);
          continue;
        }
      } catch {
        /* fall through */
      }
    }
    updateJobStatus(job.id, 'FAILED', {
      error: 'Recovered incomplete job — adapter artifacts incomplete (never marked COMPLETED)',
    });
    out.push(readJob(job.id)!);
  }
  return out;
}
