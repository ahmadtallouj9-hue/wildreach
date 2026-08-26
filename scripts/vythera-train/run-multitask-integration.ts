/**
 * Real local-image integration (no full retrain):
 * IMAGE → ANALYZE fixture → GENERATE TASKS → CORRECT → APPROVE → RECORDS → DATASET → EXPORT
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  generateTasksFromTeachExample,
  vytheraVisualLearningTasks,
} from '../../src/vythera_ai/vision/learning/VytheraVisualLearningTasks.ts';
import { createTeachExample, updateTeachExample } from '../../src/vythera_ai/vision/learning/VytheraTeachExample.ts';
import type { VytheraImageAnalysis } from '../../src/vythera_ai/vision/VytheraImageAnalysis.ts';
import { exportVlmDataset, validateVlmDataset } from './export-vlm-dataset.ts';
import { sanitizePersistedLogLine } from './sanitize-log.ts';

const ROOT = process.cwd();
const FIXTURE =
  existsSync(join(ROOT, 'scripts/vythera-train/fixtures/tiny.png'))
    ? join(ROOT, 'scripts/vythera-train/fixtures/tiny.png')
    : null;

function ensureTinyPng(): { path: string; base64: string; hash: string } {
  const dir = join(ROOT, '.vythera', 'training', 'fixtures');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'multitask-integration.png');
  const bytes = FIXTURE
    ? readFileSync(FIXTURE)
    : Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC',
        'base64',
      );
  writeFileSync(path, bytes);
  const hash = createHash('sha256').update(bytes).digest('hex');
  return { path, base64: bytes.toString('base64'), hash };
}

const analysis: VytheraImageAnalysis = {
  type: 'vythera_image_analysis',
  subject: { category: 'tree', name: 'integration-tree' },
  shape: {
    silhouette: 'vertical trunk',
    proportions: { width: 0.35, height: 0.9, depth: 0.35 },
    symmetry: 'approx',
  },
  palette: { colors: [[40, 120, 40, 255], [90, 60, 30, 255]] },
  materials: ['wood', 'leaves'],
  features: ['trunk', 'canopy'],
  style: {
    voxelLike: true,
    chunkiness: 0.75,
    detailLevel: 0.45,
    styleNotes: ['vythera block style'],
  },
  components: [
    { name: 'trunk', role: 'structure' },
    { name: 'canopy', role: 'foliage' },
  ],
  animationHints: [],
  behaviorHints: [],
  confidence: 0.88,
  scene: {
    description: 'A single tree on grassy terrain',
    objects: [{ name: 'tree', type: 'tree' }],
    terrain: 'plains',
    vegetation: 'grass',
    architecture: 'none',
    lighting: 'day',
    composition: 'centered',
    depthLayout: 'subject-foreground',
    voxelSuitability: 0.9,
    possibleAssets: ['tree'],
  },
};

console.log('VYTHERA multi-task integration\n');

const img = ensureTinyPng();
const ex = createTeachExample({
  imageHash: img.hash,
  fileName: 'multitask-integration.png',
  mimeType: 'image/png',
  visionModel: 'local-integration',
});
updateTeachExample(ex.id, {
  lifecycle: 'ANALYZED',
  analysis,
  correctedAnalysis: analysis,
});

const gen = generateTasksFromTeachExample(updateTeachExample(ex.id, {})!);
if (!gen.ok || !gen.tasks.length) {
  console.error('FAIL: task generation', gen.error);
  process.exit(1);
}
console.log(`  TASK GENERATION: ${gen.tasks.length} tasks`);

const first = gen.tasks[0]!;
vytheraVisualLearningTasks.saveCorrection(first.id, {
  ...(first.aiAnswer as object),
  human: true,
});
const bulk = vytheraVisualLearningTasks.approveAllValid(img.hash);
console.log(`  TASK REVIEW: approved ${bulk.approved.length}, skipped ${bulk.skipped.length}`);

const added = vytheraVisualLearningTasks.addApprovedToDataset(
  img.hash,
  updateTeachExample(ex.id, {})!,
  analysis,
);
if (!added.ok) {
  console.error('FAIL: dataset', added.message);
  process.exit(1);
}
console.log(`  DATASET CREATION: ${added.added.length} records · ${added.message}`);

const { dir, manifest } = exportVlmDataset(
  added.added.map((r) => ({
    id: r.id,
    imageHash: r.imageHash,
    task: r.task,
    instruction: r.instruction,
    approvalState: r.approvalState,
    split: r.split,
    confidence: r.confidence,
    learnTaskType: r.learnTaskType,
    taskId: r.taskId,
    sourceTeachSessionId: r.sourceTeachSessionId,
    analysisModel: r.analysisModel,
    analysisVersion: r.analysisVersion,
    approvalTimestamp: r.approvalTimestamp,
    expectedOutput: r.expectedOutput,
    corrections: r.corrections,
    labels: r.labels,
  })),
  {
    datasetVersion: `integration_mt_${Date.now()}`,
    images: { [img.hash]: { base64: img.base64, mimeType: 'image/png' } },
  },
);
const v = validateVlmDataset(dir);
if (!v.ok) {
  console.error('FAIL: export', v.error);
  process.exit(1);
}
console.log(
  `  VLM EXPORT: PASS · ${manifest.taskTypes.length} task types · train=${manifest.trainCount}`,
);

const scrubbed = sanitizePersistedLogLine(`fail ${img.path}`);
if (scrubbed.includes('Users') || /C:\\Users/i.test(scrubbed)) {
  console.error('FAIL: privacy path leak', scrubbed);
  process.exit(1);
}
console.log('  PRIVACY: PASS (path scrubbed in log line)');

try {
  rmSync(dir, { recursive: true, force: true });
} catch {
  /* */
}

console.log('\nINTEGRATION RESULT: PASS');
console.log('Ready for existing SmolVLM LoRA pipeline (export only — no retrain required).');
