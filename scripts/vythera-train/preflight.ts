/** Preflight checks before START TRAINING. */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { detectCapability } from './detect-capability.ts';
import { validateExportedDataset } from './export-dataset.ts';
import { validateVlmDataset } from './export-vlm-dataset.ts';
import { validateModalityCombo, classifyTrainableBase } from './modality.ts';
import { assertWritableDir, PYTHON_VLM_TRAINER } from './paths.ts';
import type {
  TrainingModality,
  VytheraPreflightCheck,
  VytheraPreflightResult,
  VytheraTrainingCapability,
} from './types.ts';

export function runPreflight(opts: {
  datasetDir: string;
  trainableBaseModel: string;
  modality: TrainingModality;
  outputDir: string;
  capability?: VytheraTrainingCapability;
  requireGpu?: boolean;
}): VytheraPreflightResult {
  const cap = opts.capability ?? detectCapability({ writeManifest: false });
  const checks: VytheraPreflightCheck[] = [];

  const add = (name: string, status: VytheraPreflightCheck['status'], detail?: string) => {
    checks.push({ name, status, detail });
  };

  add('Python', cap.python.available ? 'PASS' : 'FAIL', cap.python.version ?? cap.reason);
  add('PyTorch', cap.packages.torch ? 'PASS' : 'FAIL', cap.packages.torchVersion);
  const gpuOk = cap.gpu.detected;
  add(
    'GPU',
    gpuOk ? 'PASS' : opts.requireGpu ? 'FAIL' : 'WARN',
    cap.gpu.name ?? 'not detected',
  );
  add(
    'PyTorch CUDA',
    cap.cuda.pytorchCudaAvailable ? 'PASS' : opts.requireGpu ? 'FAIL' : 'WARN',
    cap.cuda.pytorchCudaVersion ?? 'CPU only',
  );
  add('Transformers', cap.packages.transformers ? 'PASS' : 'FAIL');
  add('PEFT', cap.packages.peft ? 'PASS' : 'FAIL');

  if (opts.modality === 'VISION_LANGUAGE') {
    add('VLM trainer', existsSync(PYTHON_VLM_TRAINER) ? 'PASS' : 'FAIL', PYTHON_VLM_TRAINER);
    const ds = validateVlmDataset(opts.datasetDir);
    add('Dataset', ds.ok ? 'PASS' : 'FAIL', ds.error);
  } else {
    const ds = validateExportedDataset(opts.datasetDir);
    add('Dataset', ds.ok ? 'PASS' : 'FAIL', ds.error);
  }

  const kind = classifyTrainableBase(opts.trainableBaseModel);
  const imagesDir =
    existsSync(join(opts.datasetDir, 'train', 'images')) ||
    existsSync(join(opts.datasetDir, 'images'));
  const mod = validateModalityCombo({
    modality: opts.modality,
    baseModel: opts.trainableBaseModel,
    hasImages: imagesDir || opts.modality === 'TEXT',
  });
  add(
    'Base model',
    kind === 'OLLAMA_GGUF_NOT_TRAINABLE' || kind === 'UNKNOWN' ? 'FAIL' : 'PASS',
    kind,
  );
  add('Training modality', mod.ok ? 'PASS' : 'FAIL', mod.error ?? opts.modality);

  const needsImages =
    opts.modality === 'VISION_LANGUAGE' ||
    opts.modality === 'VISION_ENCODER' ||
    opts.modality === 'EMBEDDING';
  add(
    'Image support',
    needsImages ? (imagesDir ? 'PASS' : 'FAIL') : 'SKIP',
    needsImages ? (imagesDir ? 'images present' : 'images missing') : 'text-only job',
  );

  const outOk = assertWritableDir(opts.outputDir);
  add('Output directory', outOk ? 'PASS' : 'FAIL', opts.outputDir);

  const hardFails = checks.filter((c) => c.status === 'FAIL');
  const ready =
    hardFails.length === 0 &&
    cap.available &&
    !!cap.packages.torch &&
    !!cap.packages.transformers &&
    !!cap.packages.peft &&
    (opts.modality !== 'VISION_LANGUAGE' || existsSync(PYTHON_VLM_TRAINER));

  const lines = [
    'VYTHERA TRAINING PREFLIGHT',
    ...checks.map((c) => `${c.name.padEnd(22)} ${c.status}${c.detail ? `  ${c.detail}` : ''}`),
    ready ? 'READY TO TRAIN' : 'TRAINING BLOCKED',
  ];
  if (!ready) {
    lines.push('Reason:');
    lines.push(
      hardFails[0]?.detail ||
        mod.error ||
        (opts.modality === 'VISION_LANGUAGE' ? 'VISION TRAINING NOT AVAILABLE' : null) ||
        cap.reason ||
        'LOCAL TRAINING BACKEND NOT AVAILABLE',
    );
  }

  return {
    ok: hardFails.length === 0,
    ready,
    checks,
    blockedReason: ready
      ? undefined
      : hardFails[0]?.detail || mod.error || cap.reason || 'TRAINING BLOCKED',
    lines,
  };
}
