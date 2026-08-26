/**
 * Multimodal VYTHERA vision-language dataset export.
 * Preserves real image files — never text-only for VISION_LANGUAGE.
 */
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  copyFileSync,
} from 'node:fs';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import {
  ensureTrainDirs,
  safePathUnder,
  VYTHERA_DATASETS_DIR,
} from './paths.ts';
import type { TrainingModality } from './types.ts';
import type { VisualRecordLike } from './export-dataset.ts';

export type VlmLearnTask =
  | 'STYLE_IDENTIFICATION'
  | 'OBJECT_IDENTIFICATION'
  | 'MATERIAL_IDENTIFICATION'
  | 'PALETTE_IDENTIFICATION'
  | 'SCENE_UNDERSTANDING'
  | 'TERRAIN_UNDERSTANDING'
  | 'VOXEL_STRUCTURE'
  | 'ASSET_EXTRACTION'
  | 'VYTHERA_STYLE_RECREATION';

const TASK_PROMPTS: Record<VlmLearnTask, string> = {
  STYLE_IDENTIFICATION: 'What visual style is this? Reply with structured VYTHERA JSON.',
  OBJECT_IDENTIFICATION: 'Identify the main objects. Reply with structured VYTHERA JSON.',
  MATERIAL_IDENTIFICATION: 'Identify materials present. Reply with structured VYTHERA JSON.',
  PALETTE_IDENTIFICATION: 'Extract the dominant VYTHERA palette. Reply with structured VYTHERA JSON.',
  SCENE_UNDERSTANDING: 'Describe the scene for VYTHERA. Reply with structured VYTHERA JSON.',
  TERRAIN_UNDERSTANDING: 'Describe terrain and ground materials. Reply with structured VYTHERA JSON.',
  VOXEL_STRUCTURE: 'Describe this as a VYTHERA voxel structure. Reply with structured VYTHERA JSON.',
  ASSET_EXTRACTION: 'Extract a reusable VYTHERA asset description. Reply with structured JSON.',
  VYTHERA_STYLE_RECREATION: 'How should VYTHERA recreate this style? Reply with structured JSON.',
};

export interface VlmExportManifest {
  type: 'vythera_vlm_dataset_export';
  schemaVersion: number;
  datasetVersion: string;
  modality: 'VISION_LANGUAGE';
  createdAt: number;
  trainCount: number;
  validationCount: number;
  heldOutCount: number;
  imageFileCount: number;
  taskTypes: string[];
  sampleHashes: string[];
  sourceImageHashes: string[];
}

function buildStructuredTarget(r: VisualRecordLike): Record<string, unknown> {
  const expected =
    r.expectedOutput && typeof r.expectedOutput === 'object'
      ? (r.expectedOutput as Record<string, unknown>)
      : {};
  const corrections =
    r.corrections && typeof r.corrections === 'object'
      ? (r.corrections as Record<string, unknown>)
      : {};
  const palette =
    (corrections.paletteOverrides as unknown[]) ||
    (expected.palette as unknown[]) ||
    [];
  return {
    type: 'vythera_image_analysis',
    style:
      (corrections.styleAttributes as Record<string, unknown>)?.style ||
      expected.style ||
      expected.visualStyle ||
      'unknown',
    materials: corrections.objectTypes
      ? undefined
      : expected.materials || expected.materialLabels || [],
    objects:
      (corrections.objectTypes as string[]) ||
      (expected.objects as string[]) ||
      (r.labels ?? []),
    palette,
    voxelStructure: expected.voxelStructure || expected.structure || null,
    category: corrections.categoryOverride || expected.category || r.task,
    notes: (corrections.notes as string[]) || [],
    confidence: corrections.confidenceOverride ?? r.confidence ?? null,
    ...expected,
  };
}

function tasksForRecord(r: VisualRecordLike): VlmLearnTask[] {
  const out: VlmLearnTask[] = [];
  // Always include a few core tasks from approved teach data
  out.push('STYLE_IDENTIFICATION', 'OBJECT_IDENTIFICATION', 'PALETTE_IDENTIFICATION');
  if (/terrain|ground|landscape/i.test(r.task + r.instruction)) {
    out.push('TERRAIN_UNDERSTANDING');
  }
  if (/voxel|structure|tree|build/i.test(r.task + r.instruction)) {
    out.push('VOXEL_STRUCTURE');
  }
  if (/asset|extract/i.test(r.task + r.instruction)) {
    out.push('ASSET_EXTRACTION');
  }
  out.push('SCENE_UNDERSTANDING', 'VYTHERA_STYLE_RECREATION');
  return [...new Set(out)];
}

function writeImage(
  imagesDir: string,
  hash: string,
  img: { base64: string; mimeType: string },
): string {
  const ext = img.mimeType.includes('jpeg') ? 'jpg' : img.mimeType.includes('webp') ? 'webp' : 'png';
  const name = `${hash.slice(0, 16)}_${createHash('sha256').update(hash).digest('hex').slice(0, 8)}.${ext}`;
  const buf = Buffer.from(img.base64.replace(/^data:[^;]+;base64,/, ''), 'base64');
  if (buf.length < 32) {
    throw new Error(`Image bytes too small for hash ${hash.slice(0, 12)}… (${buf.length} bytes)`);
  }
  // PNG magic or JPEG SOI
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
  const isWebp = buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
  if (!isPng && !isJpeg && !isWebp) {
    throw new Error(`Image for hash ${hash.slice(0, 12)}… is not a recognizable PNG/JPEG/WebP`);
  }
  writeFileSync(join(imagesDir, name), buf);
  return name;
}

/**
 * Export nested multimodal dataset:
 * train|validation|held_out/{images,data.jsonl} + manifest.json
 */
export function exportVlmDataset(
  records: VisualRecordLike[],
  opts: {
    datasetVersion: string;
    images: Record<string, { base64: string; mimeType: string }>;
  },
): { dir: string; manifest: VlmExportManifest } {
  ensureTrainDirs();
  if (!opts.images || !Object.keys(opts.images).length) {
    throw new Error('VISION_LANGUAGE export requires image bytes');
  }
  const version =
    opts.datasetVersion.replace(/[^\w.-]/g, '_').slice(0, 64) || `vlm_${Date.now()}`;
  const dir = safePathUnder(VYTHERA_DATASETS_DIR, version);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const approved = records.filter((r) => (r.approvalState ?? 'approved') === 'approved');
  if (!approved.length) throw new Error('No approved samples to export');

  const buckets: Record<'train' | 'validation' | 'held_out', VisualRecordLike[]> = {
    train: [],
    validation: [],
    held_out: [],
  };
  for (const r of approved) {
    const s = (r.split ?? 'train') as keyof typeof buckets;
    if (s === 'validation') buckets.validation.push(r);
    else if (s === 'held_out') buckets.held_out.push(r);
    else buckets.train.push(r);
  }
  if (!buckets.train.length && buckets.validation.length) {
    buckets.train.push(buckets.validation.shift()!);
  }
  if (!buckets.train.length) throw new Error('Empty train split');

  const sampleHashes: string[] = [];
  const imageHashes = new Set<string>();
  const taskTypes = new Set<string>();
  let imageFileCount = 0;

  const writeBucket = (split: 'train' | 'validation' | 'held_out', rows: VisualRecordLike[]) => {
    const splitDir = join(dir, split);
    const imagesDir = join(splitDir, 'images');
    mkdirSync(imagesDir, { recursive: true });
    const lines: string[] = [];
    for (const r of rows) {
      const src = opts.images[r.imageHash];
      if (!src) {
        throw new Error(`Missing image bytes for hash ${r.imageHash.slice(0, 12)}…`);
      }
      const fileName = writeImage(imagesDir, r.imageHash, src);
      imageFileCount++;
      imageHashes.add(r.imageHash);
      const target = buildStructuredTarget(r);
      const tasks = tasksForRecord(r);
      for (const task of tasks) {
        taskTypes.add(task);
        const row = {
          id: `${r.id}_${task}`,
          image: `images/${fileName}`,
          instruction: TASK_PROMPTS[task],
          input: r.instruction || '',
          target,
          metadata: {
            sourceHash: r.imageHash,
            datasetVersion: version,
            learnTargets: tasks,
            task,
            sourceTask: r.task,
            corrections: r.corrections ?? null,
            labels: r.labels ?? [],
          },
        };
        const line = JSON.stringify(row);
        sampleHashes.push(createHash('sha256').update(line).digest('hex'));
        lines.push(line);
      }
    }
    writeFileSync(join(splitDir, 'data.jsonl'), lines.join('\n') + (lines.length ? '\n' : ''), 'utf8');
  };

  writeBucket('train', buckets.train);
  writeBucket('validation', buckets.validation);
  writeBucket('held_out', buckets.held_out);

  // Also write flat train.jsonl pointer compatibility for validators that expect it
  const flatTrain = join(dir, 'train.jsonl');
  const nestedTrain = join(dir, 'train', 'data.jsonl');
  if (existsSync(nestedTrain)) {
    writeFileSync(flatTrain, readFileSync(nestedTrain, 'utf8'), 'utf8');
  }

  const manifest: VlmExportManifest = {
    type: 'vythera_vlm_dataset_export',
    schemaVersion: 1,
    datasetVersion: version,
    modality: 'VISION_LANGUAGE',
    createdAt: Date.now(),
    trainCount: buckets.train.length,
    validationCount: buckets.validation.length,
    heldOutCount: buckets.held_out.length,
    imageFileCount,
    taskTypes: [...taskTypes],
    sampleHashes,
    sourceImageHashes: [...imageHashes],
  };
  // Dual-type for orchestrator validators that still check visual export type
  writeFileSync(
    join(dir, 'manifest.json'),
    JSON.stringify(
      {
        ...manifest,
        // compatibility fields used by validateExportedDataset / train_vlm
        type: 'vythera_visual_dataset_export',
        vlmType: 'vythera_vlm_dataset_export',
        textOnly: false,
        trainCount: Math.max(1, sampleHashes.length ? buckets.train.length : 0),
      },
      null,
      2,
    ),
    'utf8',
  );
  return { dir, manifest };
}

export function validateVlmDataset(dir: string): { ok: boolean; error?: string } {
  const man = join(dir, 'manifest.json');
  if (!existsSync(man)) return { ok: false, error: 'manifest.json missing' };
  try {
    const m = JSON.parse(readFileSync(man, 'utf8')) as {
      modality?: string;
      imageFileCount?: number;
    };
    if (m.modality !== 'VISION_LANGUAGE') {
      return { ok: false, error: 'manifest modality is not VISION_LANGUAGE' };
    }
    const nested = join(dir, 'train', 'data.jsonl');
    const flat = join(dir, 'train.jsonl');
    const trainPath = existsSync(nested) ? nested : flat;
    if (!existsSync(trainPath)) return { ok: false, error: 'train data missing' };
    const lines = readFileSync(trainPath, 'utf8').trim().split('\n').filter(Boolean);
    if (!lines.length) return { ok: false, error: 'empty train data' };
    for (const line of lines) {
      const o = JSON.parse(line) as { image?: string; instruction?: string; target?: unknown };
      if (!o.instruction) return { ok: false, error: 'missing instruction' };
      if (!o.image) return { ok: false, error: 'missing image path' };
      if (o.target == null) return { ok: false, error: 'missing target' };
    }
    const imgDir = join(dir, 'train', 'images');
    if (!existsSync(imgDir) || readdirSync(imgDir).length < 1) {
      return { ok: false, error: 'train/images empty — VLM requires real images' };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'invalid vlm dataset' };
  }
}

/** Copy a single image into a split for tests without base64 map duplication. */
export function placeTestImage(dir: string, split: string, fileName: string, fromPath: string): void {
  const imagesDir = join(dir, split, 'images');
  mkdirSync(imagesDir, { recursive: true });
  copyFileSync(fromPath, join(imagesDir, basename(fileName)));
}
