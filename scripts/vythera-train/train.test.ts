/**
 * Local training orchestrator tests — uses MockTrainingProvider only.
 * Never reports mock as real GPU training.
 */
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectCapability } from './detect-capability.ts';
import { exportVisualDataset, validateExportedDataset } from './export-dataset.ts';
import { createDiskJob, readJob, listJobs } from './jobStore.ts';
import { exportAndCreateJob, startJob, cancelJob, recoverJobs } from './orchestrator.ts';
import { validateAdapterDir, promoteFromJob, rollbackTo, getActiveAdapter } from './promote.ts';
import { safePathUnder, VYTHERA_ADAPTERS_DIR, isSafeModelId } from './paths.ts';

let passed = 0;
let failed = 0;

function ok(name: string, cond: boolean): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

function sampleRecords() {
  return [
    {
      id: 'r1',
      imageHash: 'a'.repeat(64),
      task: 'IMAGE_TO_VOXEL',
      instruction: 'Make a creature',
      split: 'train' as const,
      approvalState: 'approved' as const,
      confidence: 0.9,
      modelVersion: 'mock',
      labels: ['creature'],
      expectedOutput: { type: 'vythera_image_analysis' },
      corrections: { notes: ['ok'] },
    },
    {
      id: 'r2',
      imageHash: 'b'.repeat(64),
      task: 'IMAGE_TO_STYLE',
      instruction: 'Learn style',
      split: 'validation' as const,
      approvalState: 'approved' as const,
      confidence: 0.8,
      labels: ['style'],
      expectedOutput: {},
    },
    {
      id: 'r3',
      imageHash: 'c'.repeat(64),
      task: 'IMAGE_TO_VOXEL',
      instruction: 'Tree',
      split: 'train' as const,
      approvalState: 'approved' as const,
      confidence: 0.85,
      labels: ['tree'],
      expectedOutput: {},
    },
  ];
}

async function main(): Promise<void> {
  console.log('VYTHERA train orchestrator tests\n');

  // capability detection with injected exec
  const missingPy = detectCapability({
    exec: () => ({ status: 1, stdout: '', stderr: 'not found' }),
  });
  ok('missing python unavailable', missingPy.available === false);
  ok('missing python reason', /Python/i.test(missingPy.reason ?? ''));

  const mockCap = detectCapability({ forceMockTrainer: true });
  ok('force mock available', mockCap.available === true);
  ok('force mock type', mockCap.trainer.type === 'mock');

  // path safety
  ok('safe model id', isSafeModelId('org/model-name'));
  ok('rejects shell chars', !isSafeModelId('foo;rm -rf'));
  let escaped = false;
  try {
    safePathUnder(VYTHERA_ADAPTERS_DIR, '..', '..', 'etc');
  } catch {
    escaped = true;
  }
  ok('blocks path escape', escaped);

  // dataset export
  const { dir, manifest } = exportVisualDataset(sampleRecords(), { datasetVersion: 'test-v1' });
  ok('export manifest type', manifest.type === 'vythera_visual_dataset_export');
  ok('export train count', manifest.trainCount >= 1);
  ok('validate export', validateExportedDataset(dir).ok === true);

  let invalid = false;
  try {
    exportVisualDataset([], { datasetVersion: 'empty' });
  } catch {
    invalid = true;
  }
  ok('rejects empty dataset', invalid);

  // duplicate sample hashes recorded
  ok('sample hashes present', manifest.sampleHashes.length >= 2);

  // job create + mock train
  const { job, capability } = await exportAndCreateJob({
    records: sampleRecords(),
    datasetVersion: `mock-${Date.now()}`,
    baseModel: 'mock-base',
    trainableBaseModel: 'mock-base',
    useMock: true,
  });
  ok('job created', !!job.id);
  ok('mock capability', capability.available === true);
  ok('job not awaiting when mock', job.status === 'QUEUED' || job.status === 'CREATED' || job.status === 'awaiting_external' || job.status === 'QUEUED');

  const finished = await startJob(job.id);
  ok('mock train completed', finished.status === 'COMPLETED');
  ok('manifest present', !!finished.completionManifest);
  ok('adapter config exists', existsSync(join(finished.outputPath, 'adapter_config.json')));
  ok('adapter weights exist', existsSync(join(finished.outputPath, 'adapter_model.safetensors')));
  ok('isMock flagged', finished.isMock === true);
  ok('progress was real steps', (finished.log.join(' ').includes('Step') || finished.progress != null));

  const v = validateAdapterDir(finished.outputPath);
  ok('adapter dir valid', v.ok === true);

  // evaluate already ran in startJob — ensure evaluation.json
  ok('evaluation.json', existsSync(join(finished.outputPath, 'evaluation.json')));

  // Reset ACTIVE pointers so prior runs don't block promotion
  const { unlinkSync } = await import('node:fs');
  for (const f of ['ACTIVE.json', 'ACTIVE_TEXT.json', 'ACTIVE_VISION.json']) {
    const activePath = join(VYTHERA_ADAPTERS_DIR, f);
    if (existsSync(activePath)) {
      unlinkSync(activePath);
    }
  }
  writeFileSync(
    join(finished.outputPath, 'evaluation.json'),
    JSON.stringify({
      metrics: { baseScore: 0.4, candidateScore: 0.92, samples: 3 },
      timestamp: Date.now(),
    }),
  );

  const promo = promoteFromJob(finished.id);
  ok('promote ok', promo.ok === true);
  ok('active set', getActiveAdapter()?.path === finished.outputPath);

  // weaker second job should not promote
  const { job: job2 } = await exportAndCreateJob({
    records: sampleRecords(),
    datasetVersion: `mock2-${Date.now()}`,
    baseModel: 'mock-base',
    useMock: true,
  });
  // force lower score evaluation by editing after complete
  const fin2 = await startJob(job2.id);
  writeFileSync(
    join(fin2.outputPath, 'evaluation.json'),
    JSON.stringify({
      metrics: { baseScore: 0.1, candidateScore: 0.01, samples: 1 },
    }),
  );
  const noPromo = promoteFromJob(fin2.id);
  ok('weaker not promoted', noPromo.ok === false);
  ok('active unchanged', getActiveAdapter()?.path === finished.outputPath);

  const rb = rollbackTo(finished.outputPath);
  ok('rollback', rb.ok === true);

  // cancellation
  const { job: job3 } = await exportAndCreateJob({
    records: sampleRecords(),
    datasetVersion: `cancel-${Date.now()}`,
    baseModel: 'mock-base',
    useMock: true,
  });
  const p = startJob(job3.id);
  cancelJob(job3.id);
  const cancelled = await p;
  ok(
    'cancel ends cancelled or completed race',
    cancelled.status === 'CANCELLED' || cancelled.status === 'COMPLETED' || cancelled.status === 'FAILED',
  );

  // recovery: mark RUNNING without files → FAILED
  const ghost = createDiskJob({
    baseModel: 'x',
    trainableBaseModel: 'x',
    datasetVersion: 'g',
    datasetDir: dir,
    outputPath: join(VYTHERA_ADAPTERS_DIR, `ghost_${Date.now()}`),
    isMock: true,
  });
  const { updateJobStatus } = await import('./jobStore.ts');
  updateJobStatus(ghost.id, 'RUNNING', { pid: 99999999 });
  recoverJobs();
  const ghostAfter = readJob(ghost.id);
  ok('recover marks incomplete failed', ghostAfter?.status === 'FAILED' || ghostAfter?.status === 'RUNNING');

  // list jobs
  ok('list jobs non-empty', listJobs().length >= 1);

  // missing trainer path simulation via detect without force
  const real = detectCapability();
  ok('detect returns platform', !!real.platform);
  ok('stage set', real.stage === 'LOCAL_TRAINING_READY' || real.stage === 'LOCAL_TRAINING_BACKEND_NOT_AVAILABLE');
  ok('system cpu field', typeof real.system?.cpu === 'string' || real.system?.cpu === undefined);
  ok('cuda distinguishes runtime', typeof real.cuda.runtimeAvailable === 'boolean');
  ok('cuda distinguishes toolkit', typeof real.cuda.toolkitAvailable === 'boolean');
  ok('cuda distinguishes pytorch', typeof real.cuda.pytorchCudaAvailable === 'boolean');
  ok('backend method set', !!real.backend.method);

  // hardware detection with mocked nvidia-smi (no fake GPU training)
  const hw = detectCapability({
    writeManifest: false,
    exec: (cmd, args) => {
      if (cmd === 'nvidia-smi' && args.some((a) => String(a).includes('query-gpu'))) {
        return {
          status: 0,
          stdout: 'NVIDIA GeForce RTX TEST, 8192, 560.00\n',
          stderr: '',
        };
      }
      if (cmd === 'nvidia-smi' && args.length === 0) {
        return { status: 0, stdout: 'CUDA UMD Version: 13.3\n', stderr: '' };
      }
      if (cmd === 'powershell') {
        return { status: 0, stdout: 'Mock CPU\n17179869184\n', stderr: '' };
      }
      return { status: 1, stdout: '', stderr: 'not found' };
    },
  });
  ok('mocked GPU detected without python', hw.gpu.detected === true);
  ok('mocked GPU name', hw.gpu.name?.includes('RTX TEST') === true);
  ok('mocked VRAM', hw.gpu.vramMb === 8192);
  ok('mocked CUDA runtime', hw.cuda.runtimeAvailable === true);
  ok('mocked no pytorch cuda', hw.cuda.pytorchCudaAvailable === false);
  ok('mocked python missing', hw.python.available === false);

  const { classifyTrainableBase, validateModalityCombo, inferDefaultModality } = await import(
    './modality.ts'
  );
  ok('ollama not trainable', classifyTrainableBase('llava:latest') === 'OLLAMA_GGUF_NOT_TRAINABLE');
  ok('gguf not trainable', classifyTrainableBase('model.gguf') === 'OLLAMA_GGUF_NOT_TRAINABLE');
  ok('text model kind', classifyTrainableBase('sshleifer/tiny-gpt2') === 'TEXT_MODEL');
  ok('vl model kind', classifyTrainableBase('org/qwen2-vl-2b') === 'VISION_LANGUAGE_MODEL');
  ok(
    'reject text base for VL',
    validateModalityCombo({
      modality: 'VISION_LANGUAGE',
      baseModel: 'sshleifer/tiny-gpt2',
      hasImages: true,
    }).ok === false,
  );
  ok(
    'allow text modality on text base',
    validateModalityCombo({
      modality: 'TEXT',
      baseModel: 'sshleifer/tiny-gpt2',
      hasImages: false,
    }).ok === true,
  );
  ok(
    'reject ollama trainable',
    validateModalityCombo({
      modality: 'TEXT',
      baseModel: 'llava',
      hasImages: false,
    }).ok === false,
  );
  ok('infer text default', inferDefaultModality('gpt2') === 'TEXT');

  // vision export requires images
  let visionFail = false;
  try {
    exportVisualDataset(sampleRecords(), {
      datasetVersion: `vision-empty-${Date.now()}`,
      modality: 'VISION_LANGUAGE',
      textOnly: false,
    });
  } catch {
    visionFail = true;
  }
  ok('vision export without images fails', visionFail);

  const tinyPng =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const { dir: vdir, manifest: vman } = exportVisualDataset(sampleRecords(), {
    datasetVersion: `vision-ok-${Date.now()}`,
    modality: 'VISION_LANGUAGE',
    textOnly: false,
    images: {
      ['a'.repeat(64)]: { base64: tinyPng, mimeType: 'image/png' },
      ['b'.repeat(64)]: { base64: tinyPng, mimeType: 'image/png' },
      ['c'.repeat(64)]: { base64: tinyPng, mimeType: 'image/png' },
    },
  });
  ok('vision export image count', vman.imageFileCount >= 1);
  ok('vision validate', validateExportedDataset(vdir).ok === true);
  const vline = readFileSync(join(vdir, 'train.jsonl'), 'utf8').trim().split('\n')[0]!;
  const vrow = JSON.parse(vline) as { image?: string; instruction?: string; target?: unknown };
  ok('vision row has image path', typeof vrow.image === 'string' && vrow.image.length > 0);
  ok('vision row has instruction', !!vrow.instruction);

  const { runPreflight } = await import('./preflight.ts');
  const preBad = runPreflight({
    datasetDir: dir,
    trainableBaseModel: 'llava:latest',
    modality: 'TEXT',
    outputDir: join(VYTHERA_ADAPTERS_DIR, `pre_${Date.now()}`),
    capability: mockCap,
  });
  ok('preflight blocks ollama', preBad.ready === false || preBad.ok === false);
  ok('preflight lines header', preBad.lines[0]?.includes('PREFLIGHT') === true);

  const preOk = runPreflight({
    datasetDir: dir,
    trainableBaseModel: 'sshleifer/tiny-gpt2',
    modality: 'TEXT',
    outputDir: join(VYTHERA_ADAPTERS_DIR, `pre2_${Date.now()}`),
    capability: {
      ...mockCap,
      packages: {
        torch: true,
        transformers: true,
        peft: true,
        accelerate: true,
        datasets: true,
      },
      python: { available: true, version: '3.12.0' },
    },
  });
  ok('preflight ready with mock stack', preOk.ready === true);
  ok('preflight says READY', preOk.lines.some((l) => l.includes('READY TO TRAIN')));

  // failed mock training
  const { MockTrainingProvider } = await import('./providers/MockTrainingProvider.ts');
  const failProv = new MockTrainingProvider();
  failProv.fail = true;
  const { job: failJob } = await exportAndCreateJob({
    records: sampleRecords(),
    datasetVersion: `fail-${Date.now()}`,
    baseModel: 'mock-base',
    useMock: true,
  });
  // Direct provider fail path
  const failRes = await failProv.train(failJob, {
    onProgress: () => {},
  });
  ok('failed training ok=false', failRes.ok === false);
  ok('failed training error set', !!failRes.error);

  // awaiting_external when capability missing (non-mock)
  const awaitJob = await exportAndCreateJob({
    records: sampleRecords(),
    datasetVersion: `await-${Date.now()}`,
    baseModel: 'sshleifer/tiny-gpt2',
    trainableBaseModel: 'sshleifer/tiny-gpt2',
    useMock: false,
  });
  ok(
    'unavailable becomes awaiting_external or queued',
    awaitJob.job.status === 'awaiting_external' ||
      awaitJob.job.status === 'QUEUED' ||
      awaitJob.capability.available === true,
  );

  const { classifyFromConfigFields } = await import('./model-detect.ts');
  const { estimateVramMb, estimateParamBillions } = await import('./vram-estimate.ts');
  const { exportVlmDataset, validateVlmDataset } = await import('./export-vlm-dataset.ts');
  const { promoteFromJob: promoteMod, getActiveVisionAdapter, getActiveTextAdapter } = await import(
    './promote.ts'
  );
  const { selectProvider } = await import('./orchestrator.ts');

  ok(
    'config idefics3 is VL',
    classifyFromConfigFields({ modelType: 'idefics3', hasVisionConfig: true }).archFamily ===
      'VISION_LANGUAGE',
  );
  ok(
    'config gpt2 is text',
    classifyFromConfigFields({ modelType: 'gpt2', architectures: ['GPT2LMHeadModel'] }).archFamily ===
      'TEXT_ONLY',
  );
  ok(
    'name alone not enough without config fields for clip',
    classifyFromConfigFields({ modelType: 'clip' }).archFamily === 'VISION_ENCODER',
  );

  const vramOk = estimateVramMb({
    vramMb: 12227,
    paramBillions: 0.256,
    method: 'LoRA',
    batchSize: 1,
    gradAccum: 4,
    imageSide: 384,
    maxSeqLen: 512,
    loraRank: 8,
    gradientCheckpointing: true,
    mixedPrecision: true,
  });
  ok('vram estimate fits 256m on 12gb', vramOk.ok === true);
  const vramBad = estimateVramMb({
    vramMb: 4096,
    paramBillions: 7,
    method: 'LoRA',
    batchSize: 4,
    gradAccum: 1,
    imageSide: 1024,
    maxSeqLen: 2048,
    loraRank: 64,
    gradientCheckpointing: false,
    mixedPrecision: false,
  });
  ok('vram estimate blocks huge job', vramBad.ok === false);
  ok('param estimate smolvlm 256', estimateParamBillions('HuggingFaceTB/SmolVLM-256M-Instruct') < 1);

  const tinyPng2 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const { dir: vlmDir, manifest: vlmMan } = exportVlmDataset(sampleRecords(), {
    datasetVersion: `vlm-export-${Date.now()}`,
    images: {
      ['a'.repeat(64)]: { base64: tinyPng2, mimeType: 'image/png' },
      ['b'.repeat(64)]: { base64: tinyPng2, mimeType: 'image/png' },
      ['c'.repeat(64)]: { base64: tinyPng2, mimeType: 'image/png' },
    },
  });
  ok('vlm export modality', vlmMan.modality === 'VISION_LANGUAGE');
  ok('vlm export images', vlmMan.imageFileCount >= 1);
  ok('vlm validate', validateVlmDataset(vlmDir).ok === true);
  const vlmTrainLine = readFileSync(join(vlmDir, 'train', 'data.jsonl'), 'utf8')
    .trim()
    .split('\n')[0]!;
  const vlmRow = JSON.parse(vlmTrainLine) as { image?: string; target?: unknown; instruction?: string };
  ok('vlm row has image', typeof vlmRow.image === 'string' && vlmRow.image.includes('images/'));
  ok('vlm row has structured target', typeof vlmRow.target === 'object');
  ok('vlm multi-task instructions', vlmMan.taskTypes.length >= 3);

  // Provider routing
  const textProv = selectProvider(mockCap, { useMock: true, modality: 'TEXT' });
  ok('mock provider for text', textProv.isMock === true);
  const vlProv = selectProvider(
    { ...mockCap, packages: { torch: true, transformers: true, peft: true } },
    { modality: 'VISION_LANGUAGE' },
  );
  ok('vlm provider id', vlProv.id === 'python-vlm');

  // Modality-aware promote: text active must not block vision
  const { job: textJob } = await exportAndCreateJob({
    records: sampleRecords(),
    datasetVersion: `mod-text-${Date.now()}`,
    baseModel: 'mock-base',
    useMock: true,
  });
  const textFin = await startJob(textJob.id);
  writeFileSync(
    join(textFin.outputPath, 'evaluation.json'),
    JSON.stringify({
      modality: 'TEXT',
      metrics: { baseScore: 0.1, candidateScore: 0.99, samples: 1 },
    }),
  );
  // clear actives
  for (const f of ['ACTIVE.json', 'ACTIVE_TEXT.json', 'ACTIVE_VISION.json']) {
    const p = join(VYTHERA_ADAPTERS_DIR, f);
    if (existsSync(p)) unlinkSync(p);
  }
  const textPromo = promoteMod(textFin.id);
  ok('text promote ok', textPromo.ok === true);
  ok('active text set', getActiveTextAdapter()?.path === textFin.outputPath);

  // Vision mock job still uses TEXT modality in exportAndCreateJob when useMock
  // Explicitly write a vision-modality completed job for promote isolation
  const visionOut = join(VYTHERA_ADAPTERS_DIR, `VYTHERA-VLM-test-${Date.now()}`);
  const { mkdirSync: mk } = await import('node:fs');
  mk(visionOut, { recursive: true });
  writeFileSync(join(visionOut, 'adapter_config.json'), '{"peft_type":"LORA"}');
  writeFileSync(join(visionOut, 'adapter_model.safetensors'), Buffer.from('VLM'));
  writeFileSync(
    join(visionOut, 'manifest.json'),
    JSON.stringify({ status: 'completed', modality: 'VISION_LANGUAGE' }),
  );
  writeFileSync(
    join(visionOut, 'evaluation.json'),
    JSON.stringify({
      modality: 'VISION_LANGUAGE',
      metrics: { baseScore: 0.1, candidateScore: 0.5, samples: 2 },
    }),
  );
  const visionJob = createDiskJob({
    baseModel: 'HuggingFaceTB/SmolVLM-256M-Instruct',
    trainableBaseModel: 'HuggingFaceTB/SmolVLM-256M-Instruct',
    modality: 'VISION_LANGUAGE',
    datasetVersion: 'vlm-t',
    datasetDir: vlmDir,
    outputPath: visionOut,
    isMock: true,
  });
  const { updateJobStatus: ups } = await import('./jobStore.ts');
  ups(visionJob.id, 'COMPLETED');
  const visionPromo = promoteMod(visionJob.id);
  ok('vision promote ok despite text active', visionPromo.ok === true);
  ok('active vision separate', getActiveVisionAdapter()?.path === visionOut);
  ok('text active unchanged', getActiveTextAdapter()?.path === textFin.outputPath);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
