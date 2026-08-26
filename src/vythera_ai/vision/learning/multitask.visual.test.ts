/**
 * Multi-task visual teaching + VLM export compatibility tests (deterministic fixtures).
 */
import { createHash } from 'node:crypto';
import { rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildStructuredTaskAnswer,
  generateVisualLearningTasks,
  selectRelevantVisualTasks,
  validateTaskAnswer,
  effectiveTaskAnswer,
} from './VytheraVisualTaskGenerator.ts';
import {
  generateTasksFromTeachExample,
  vytheraVisualLearningTasks,
  taskTypeBalance,
  learningReportFromEval,
  nextVisionDatasetLabel,
} from './VytheraVisualLearningTasks.ts';
import { createTeachExample, updateTeachExample } from './VytheraTeachExample.ts';
import { vytheraVisualDataset } from './VytheraVisualDataset.ts';
import type { VytheraImageAnalysis } from '../VytheraImageAnalysis.ts';
import {
  exportVlmDataset,
  validateVlmDataset,
} from '../../../../scripts/vythera-train/export-vlm-dataset.ts';
import { sanitizeForDisplay } from '../../security/VytheraPrivacySanitizer.ts';

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

function fixtureAnalysis(category: VytheraImageAnalysis['subject']['category']): VytheraImageAnalysis {
  return {
    type: 'vythera_image_analysis',
    subject: { category, name: category === 'tree' ? 'oak' : category },
    shape: {
      silhouette: 'chunky vertical',
      proportions: { width: 0.4, height: 0.8, depth: 0.4 },
      symmetry: 'bilateral',
    },
    palette: {
      colors: [
        [34, 139, 34, 255],
        [101, 67, 33, 255],
        [50, 50, 50, 255],
      ],
    },
    materials: ['wood', 'leaves'],
    features: ['trunk', 'canopy'],
    style: {
      voxelLike: true,
      chunkiness: 0.8,
      detailLevel: 0.4,
      styleNotes: ['blocky', 'low poly'],
      pixelArt: false,
    },
    components: [
      { name: 'trunk', role: 'structure' },
      { name: 'leaves', role: 'foliage' },
    ],
    animationHints: [],
    behaviorHints: [],
    confidence: 0.9,
    scene: {
      description: 'forest terrain with trees',
      terrain: 'plains',
      lighting: 'soft daylight',
      composition: 'centered subject',
      vegetation: 'grass',
      architecture: 'none',
      depthLayout: 'near-mid-far',
      voxelSuitability: 0.85,
      objects: [
        { name: 'tree', type: 'tree' },
        { name: 'grass', type: 'terrain' },
      ],
      possibleAssets: ['tree', 'grass'],
    },
  };
}

console.log('VYTHERA multi-task visual teaching tests\n');

{
  const terrain = selectRelevantVisualTasks({ analysis: fixtureAnalysis('terrain') });
  ok('terrain includes TERRAIN_ANALYSIS', terrain.includes('TERRAIN_ANALYSIS'));
  ok('terrain includes LIGHTING', terrain.includes('LIGHTING_ANALYSIS'));
  const character = selectRelevantVisualTasks({ analysis: fixtureAnalysis('character') });
  ok('character excludes terrain', !character.includes('TERRAIN_ANALYSIS'));
  ok('character includes ASSET_EXTRACTION', character.includes('ASSET_EXTRACTION'));
}

{
  const tasks = generateVisualLearningTasks({
    imageHash: 'img_tree_fixture_hash_001',
    teachSessionId: 'teach_1',
    analysis: fixtureAnalysis('tree'),
    analysisModel: 'local-mock',
  });
  ok('generates multiple tasks', tasks.length >= 6);
  ok('all share image hash', tasks.every((t) => t.imageHash === 'img_tree_fixture_hash_001'));
  ok('all have teachSessionId', tasks.every((t) => t.teachSessionId === 'teach_1'));
  ok('dedup ids', new Set(tasks.map((t) => t.id)).size === tasks.length);
  ok('answers structured', tasks.every((t) => t.aiAnswer && typeof t.aiAnswer === 'object'));
  const types = new Set(tasks.map((t) => t.type));
  ok('includes VYTHERA_STYLE', types.has('VYTHERA_STYLE'));
  ok('includes GAME_ASSET_PLAN', types.has('GAME_ASSET_PLAN'));
}

{
  const filtered = generateVisualLearningTasks({
    imageHash: 'img_filter',
    teachSessionId: 't2',
    analysis: fixtureAnalysis('tree'),
    enabledTypes: ['OBJECT_IDENTIFICATION', 'PALETTE_EXTRACTION'],
  });
  ok('enabledTypes filter', filtered.length === 2);
  ok(
    'only enabled types',
    filtered.every((t) => t.type === 'OBJECT_IDENTIFICATION' || t.type === 'PALETTE_EXTRACTION'),
  );
}

{
  const { answer } = buildStructuredTaskAnswer('OBJECT_IDENTIFICATION', fixtureAnalysis('tree'));
  const v = validateTaskAnswer('OBJECT_IDENTIFICATION', answer);
  ok('object schema valid', v.ok);
  ok('empty answer rejected', !validateTaskAnswer('OBJECT_IDENTIFICATION', {}).ok);
  ok('vague terrain rejected', !validateTaskAnswer('TERRAIN_ANALYSIS', { terrainType: 'thing' }).ok);
}

{
  const hash = `hash_mt_${Date.now()}`;
  const ex = createTeachExample({
    imageHash: hash,
    fileName: 'tree.png',
    mimeType: 'image/png',
    visionModel: 'mock-vlm',
  });
  updateTeachExample(ex.id, {
    analysis: fixtureAnalysis('tree'),
    correctedAnalysis: fixtureAnalysis('tree'),
    lifecycle: 'ANALYZED',
  });
  const gen = generateTasksFromTeachExample(updateTeachExample(ex.id, {})!);
  ok('generate from teach', gen.ok && gen.tasks.length > 0);
  const task = gen.tasks[0]!;
  const corr = { ...(task.aiAnswer as object), note: 'human fix' };
  const saved = vytheraVisualLearningTasks.saveCorrection(task.id, corr);
  ok('correction keeps aiAnswer', saved.ok && saved.task.aiAnswer != null);
  ok('correctedAnswer stored', saved.ok && saved.task.correctedAnswer != null);
  ok(
    'effective prefers correction',
    JSON.stringify(effectiveTaskAnswer(saved.ok ? saved.task : task)).includes('human fix'),
  );
  const ap = vytheraVisualLearningTasks.approve(task.id);
  ok('approve valid', ap.ok);

  const bulk = vytheraVisualLearningTasks.approveAllValid(hash);
  ok('bulk approve some', bulk.approved.length >= 1);

  const preview = vytheraVisualLearningTasks.previewDataset(hash);
  ok('preview has approved count', preview.trainingRecordsToAdd >= 1);
  ok('preview version label', /VYTHERA-VISION-DATASET-V\d+/.test(preview.datasetVersionLabel));

  const beforeVersions = vytheraVisualDataset.versions().length;
  const added = vytheraVisualLearningTasks.addApprovedToDataset(
    hash,
    updateTeachExample(ex.id, {})!,
    fixtureAnalysis('tree'),
  );
  ok('dataset add ok', added.ok && added.added.length >= 1);
  ok('version created', !!added.versionId && vytheraVisualDataset.versions().length > beforeVersions);
  ok('same image hash many records', added.added.every((r) => r.imageHash === hash));
  ok(
    'traceability fields',
    added.added.every(
      (r) => r.taskId && r.learnTaskType && r.sourceTeachSessionId && r.approvalTimestamp,
    ),
  );
  const label = nextVisionDatasetLabel();
  ok('next version increments', /VYTHERA-VISION-DATASET-V\d+/.test(label));
}

{
  const balance = taskTypeBalance(vytheraVisualDataset.list());
  ok('balance tracks types', typeof balance.percents === 'object');
  const report = learningReportFromEval({
    OBJECT_IDENTIFICATION: 0.91,
    VOXEL_STRUCTURE: 0.55,
    VYTHERA_STYLE: 0.6,
  });
  ok('strong objects', report.strong.includes('OBJECT_IDENTIFICATION'));
  ok('needs voxel', report.needsMore.includes('VOXEL_STRUCTURE'));
}

{
  const tinyPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  const hash = createHash('sha256').update(tinyPng).digest('hex');
  const records = [
    {
      id: 'rec_obj',
      imageHash: hash,
      task: 'IMAGE_TO_CONCEPT',
      instruction: 'Identify objects',
      approvalState: 'approved',
      split: 'train',
      confidence: 0.9,
      learnTaskType: 'OBJECT_IDENTIFICATION',
      taskId: 't1',
      sourceTeachSessionId: 'teach_x',
      expectedOutput: {
        structuredTarget: { type: 'vythera_objects', objects: [{ type: 'tree', count: 1 }] },
      },
    },
    {
      id: 'rec_style',
      imageHash: hash,
      task: 'IMAGE_TO_STYLE',
      instruction: 'Style',
      approvalState: 'approved',
      split: 'validation',
      confidence: 0.9,
      learnTaskType: 'VYTHERA_STYLE',
      taskId: 't2',
      sourceTeachSessionId: 'teach_x',
      expectedOutput: {
        structuredTarget: { type: 'vythera_style_rules', silhouette: 'chunky' },
      },
    },
  ];
  const { dir, manifest } = exportVlmDataset(records, {
    datasetVersion: `mt_export_${Date.now()}`,
    images: { [hash]: { base64: tinyPng.toString('base64'), mimeType: 'image/png' } },
  });
  const v = validateVlmDataset(dir);
  ok('vlm export valid', v.ok);
  ok('export does not double-expand', manifest.taskTypes.length === 2);
  const trainLines = readFileSync(join(dir, 'train', 'data.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean);
  ok('one row per learn task in train', trainLines.length === 1);
  const row = JSON.parse(trainLines[0]!) as {
    metadata: { learnTaskType: string; sourceImageHash: string };
  };
  ok('export metadata sourceImageHash', row.metadata.sourceImageHash === hash);
  ok('export metadata learnTaskType', row.metadata.learnTaskType === 'OBJECT_IDENTIFICATION');
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* */
  }
}

{
  const dirty = sanitizeForDisplay(
    'Task failed C:\\Users\\Ahmad\\image.png token=sk-abcdefghijklmnop',
  );
  ok('task error privacy', !dirty.includes('Ahmad') && !dirty.includes('sk-abc'));
}

{
  const bad = validateTaskAnswer('PALETTE_EXTRACTION', { palette: [] });
  ok('empty palette flagged', !bad.ok);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
