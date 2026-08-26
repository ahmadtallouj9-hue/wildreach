import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  ensureTrainDirs,
  safePathUnder,
  VYTHERA_DATASETS_DIR,
} from './paths.ts';
import type { TrainingModality } from './types.ts';

const SCHEMA_VERSION = 2;

export interface ExportedDatasetManifest {
  type: 'vythera_visual_dataset_export';
  schemaVersion: number;
  datasetVersion: string;
  createdAt: number;
  trainCount: number;
  validationCount: number;
  heldOutCount: number;
  imageFileCount: number;
  modality: TrainingModality;
  textOnly: boolean;
  sampleHashes: string[];
  sourceImageHashes: string[];
  modelsUsed: string[];
}

export interface VisualRecordLike {
  id: string;
  imageHash: string;
  task: string;
  instruction: string;
  split?: string;
  approvalState?: string;
  confidence?: number;
  modelVersion?: string;
  corrections?: unknown;
  labels?: string[];
  expectedOutput?: unknown;
  input?: unknown;
  target?: unknown;
  metadata?: unknown;
  timestamp?: number;
  /** When set, export emits a single VLM row for this learn task (no fan-out). */
  learnTaskType?: string;
  taskId?: string;
  sourceTeachSessionId?: string;
  analysisModel?: string;
  analysisVersion?: string;
  approvalTimestamp?: number;
}

function findImageFile(imagesDir: string, hash: string): string | null {
  if (!existsSync(imagesDir)) return null;
  for (const ext of ['png', 'jpg', 'jpeg', 'webp']) {
    const p = join(imagesDir, `${hash}.${ext}`);
    if (existsSync(p)) return p;
  }
  // fuzzy: any file starting with hash
  try {
    const hit = readdirSync(imagesDir).find((f) => f.startsWith(hash));
    return hit ? join(imagesDir, hit) : null;
  } catch {
    return null;
  }
}

/**
 * Export records to trainer-friendly layout.
 * For VISION_* modalities, preserves image + instruction + input + target + metadata.
 */
export function exportVisualDataset(
  records: VisualRecordLike[],
  opts: {
    datasetVersion: string;
    images?: Record<string, { base64: string; mimeType: string }>;
    modality?: TrainingModality;
    /** Force text-only rows even if images provided */
    textOnly?: boolean;
  },
): { dir: string; manifest: ExportedDatasetManifest } {
  ensureTrainDirs();
  const version = opts.datasetVersion.replace(/[^\w.-]/g, '_').slice(0, 64) || `vdv_${Date.now()}`;
  const dir = safePathUnder(VYTHERA_DATASETS_DIR, version);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const imagesDir = join(dir, 'images');
  if (!existsSync(imagesDir)) mkdirSync(imagesDir, { recursive: true });
  const metaDir = join(dir, 'metadata');
  if (!existsSync(metaDir)) mkdirSync(metaDir, { recursive: true });

  const modality: TrainingModality = opts.modality ?? 'TEXT';
  const textOnly = opts.textOnly === true || modality === 'TEXT';

  if (opts.images) {
    for (const [hash, img] of Object.entries(opts.images)) {
      if (!/^[a-f0-9]{16,64}$/i.test(hash)) continue;
      const ext = img.mimeType.includes('jpeg') ? 'jpg' : img.mimeType.includes('webp') ? 'webp' : 'png';
      const buf = Buffer.from(img.base64, 'base64');
      writeFileSync(join(imagesDir, `${hash}.${ext}`), buf);
    }
  }

  const approved = records.filter((r) => (r.approvalState ?? 'approved') === 'approved');
  if (!approved.length) throw new Error('No approved samples to export');

  const train: VisualRecordLike[] = [];
  const validation: VisualRecordLike[] = [];
  const heldOut: VisualRecordLike[] = [];
  const sampleHashes: string[] = [];
  const imageHashes = new Set<string>();
  const models = new Set<string>();

  const toRow = (r: VisualRecordLike) => {
    const imagePath = textOnly ? null : findImageFile(imagesDir, r.imageHash);
    const target = r.target ?? r.expectedOutput ?? null;
    return {
      id: r.id,
      image_hash: r.imageHash,
      image: imagePath,
      instruction: r.instruction,
      input: r.input ?? null,
      target,
      expected_output: r.expectedOutput ?? target,
      metadata: r.metadata ?? {
        task: r.task,
        labels: r.labels ?? [],
        corrections: r.corrections ?? null,
        confidence: r.confidence ?? null,
        model_version: r.modelVersion ?? null,
        timestamp: r.timestamp ?? null,
      },
      task: r.task,
      modality,
    };
  };

  for (const r of approved) {
    const lineObj = toRow(r);
    const line = JSON.stringify(lineObj);
    const hash = createHash('sha256').update(line).digest('hex');
    sampleHashes.push(hash);
    imageHashes.add(r.imageHash);
    if (r.modelVersion) models.add(r.modelVersion);

    const split = r.split ?? 'train';
    if (split === 'validation') validation.push(r);
    else if (split === 'held_out') heldOut.push(r);
    else train.push(r);
  }

  if (!train.length && validation.length) train.push(validation.shift()!);
  if (!train.length && heldOut.length) train.push(heldOut.shift()!);
  if (!train.length) throw new Error('Invalid dataset: empty train split');

  const writeSplit = (name: string, rows: VisualRecordLike[]) => {
    const path = join(dir, `${name}.jsonl`);
    const body = rows.map((r) => JSON.stringify(toRow(r))).join('\n');
    writeFileSync(path, body + (body ? '\n' : ''), 'utf8');
  };

  writeSplit('train', train);
  writeSplit('validation', validation);
  writeSplit('held_out', heldOut);

  let imageFileCount = 0;
  if (existsSync(imagesDir)) {
    imageFileCount = readdirSync(imagesDir).filter((f) => !f.startsWith('.')).length;
  }

  if (
    (modality === 'VISION_LANGUAGE' ||
      modality === 'VISION_ENCODER' ||
      modality === 'EMBEDDING') &&
    imageFileCount < 1
  ) {
    throw new Error(
      `Modality ${modality} requires image files in export (got ${imageFileCount}). `
        + 'Pass opts.images or use text-only modality.',
    );
  }

  const manifest: ExportedDatasetManifest = {
    type: 'vythera_visual_dataset_export',
    schemaVersion: SCHEMA_VERSION,
    datasetVersion: version,
    createdAt: Date.now(),
    trainCount: train.length,
    validationCount: validation.length,
    heldOutCount: heldOut.length,
    imageFileCount,
    modality,
    textOnly,
    sampleHashes,
    sourceImageHashes: [...imageHashes],
    modelsUsed: [...models],
  };
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  writeFileSync(
    join(metaDir, 'export.json'),
    JSON.stringify({ schemaVersion: SCHEMA_VERSION, exportedAt: Date.now(), modality }, null, 2),
    'utf8',
  );
  return { dir, manifest };
}

export function validateExportedDataset(dir: string): { ok: boolean; error?: string } {
  const man = join(dir, 'manifest.json');
  const train = join(dir, 'train.jsonl');
  if (!existsSync(man)) return { ok: false, error: 'manifest.json missing' };
  if (!existsSync(train)) return { ok: false, error: 'train.jsonl missing' };
  try {
    const m = JSON.parse(readFileSync(man, 'utf8')) as ExportedDatasetManifest;
    if (m.type !== 'vythera_visual_dataset_export') return { ok: false, error: 'bad manifest type' };
    if (m.trainCount < 1) return { ok: false, error: 'trainCount < 1' };
    const lines = readFileSync(train, 'utf8').trim().split('\n').filter(Boolean);
    if (!lines.length) return { ok: false, error: 'empty train.jsonl' };
    for (const line of lines) {
      const o = JSON.parse(line) as {
        instruction?: string;
        image?: string | null;
        target?: unknown;
        input?: unknown;
      };
      if (!o.instruction) return { ok: false, error: 'train row missing instruction' };
      if (
        (m.modality === 'VISION_LANGUAGE' ||
          m.modality === 'VISION_ENCODER' ||
          m.modality === 'EMBEDDING') &&
        !o.image
      ) {
        return { ok: false, error: 'vision sample missing image path' };
      }
    }
    if (
      (m.modality === 'VISION_LANGUAGE' ||
        m.modality === 'VISION_ENCODER' ||
        m.modality === 'EMBEDDING') &&
      (m.imageFileCount ?? 0) < 1
    ) {
      return { ok: false, error: 'vision modality but no image files' };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'invalid export' };
  }
}
