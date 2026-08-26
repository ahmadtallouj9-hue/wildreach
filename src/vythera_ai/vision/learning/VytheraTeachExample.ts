import { lsGet, lsSet } from '../../util/safeStorage';
import type { VytheraImageAnalysis } from '../VytheraImageAnalysis';
import type { VytheraExtractedPalette } from '../VytheraLocalPalette';
import type { VytheraVoxelPlan } from '../VytheraImageToVoxel';
import type { VytheraTeachLifecycle } from './VytheraLearningStates';

/** What the user wants VYTHERA to learn from this teach session. */
export interface VytheraLearnTargets {
  visualStyle: boolean;
  objects: boolean;
  materials: boolean;
  palette: boolean;
  voxelStructure: boolean;
  ignoreBackground: boolean;
}

export const DEFAULT_LEARN_TARGETS: VytheraLearnTargets = {
  visualStyle: true,
  objects: true,
  materials: true,
  palette: true,
  voxelStructure: true,
  ignoreBackground: false,
};

/** Structured human corrections — not free-form-only. */
export interface VytheraTeachCorrections {
  notes: string[];
  labelOverrides: Record<string, string>;
  objectTypes: string[];
  styleAttributes: Record<string, string | number | boolean>;
  paletteOverrides: [number, number, number, number][];
  categoryOverride: string | null;
  confidenceOverride: number | null;
  positiveExamples: string[];
  negativeExamples: string[];
  preferredVariants: string[];
  rejectedVariants: string[];
  ignoreBackground: boolean;
}

export function emptyCorrections(): VytheraTeachCorrections {
  return {
    notes: [],
    labelOverrides: {},
    objectTypes: [],
    styleAttributes: {},
    paletteOverrides: [],
    categoryOverride: null,
    confidenceOverride: null,
    positiveExamples: [],
    negativeExamples: [],
    preferredVariants: [],
    rejectedVariants: [],
    ignoreBackground: false,
  };
}

export function validateCorrections(data: unknown): VytheraTeachCorrections {
  const base = emptyCorrections();
  if (!data || typeof data !== 'object') return base;
  const o = data as Record<string, unknown>;
  if (Array.isArray(o.notes)) {
    base.notes = o.notes.filter((x): x is string => typeof x === 'string').slice(0, 32);
  }
  if (o.labelOverrides && typeof o.labelOverrides === 'object') {
    for (const [k, v] of Object.entries(o.labelOverrides as Record<string, unknown>)) {
      if (typeof v === 'string') base.labelOverrides[k.slice(0, 64)] = v.slice(0, 128);
    }
  }
  if (Array.isArray(o.objectTypes)) {
    base.objectTypes = o.objectTypes.filter((x): x is string => typeof x === 'string').slice(0, 32);
  }
  if (o.styleAttributes && typeof o.styleAttributes === 'object') {
    for (const [k, v] of Object.entries(o.styleAttributes as Record<string, unknown>)) {
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        base.styleAttributes[k.slice(0, 64)] = v;
      }
    }
  }
  if (Array.isArray(o.paletteOverrides)) {
    for (const c of o.paletteOverrides.slice(0, 16)) {
      if (!Array.isArray(c) || c.length < 3) continue;
      const r = Number(c[0]),
        g = Number(c[1]),
        b = Number(c[2]),
        a = c.length >= 4 ? Number(c[3]) : 255;
      if (![r, g, b, a].every((n) => Number.isFinite(n) && n >= 0 && n <= 255)) continue;
      base.paletteOverrides.push([Math.round(r), Math.round(g), Math.round(b), Math.round(a)]);
    }
  }
  if (typeof o.categoryOverride === 'string') base.categoryOverride = o.categoryOverride.slice(0, 64);
  if (typeof o.confidenceOverride === 'number' && o.confidenceOverride >= 0 && o.confidenceOverride <= 1) {
    base.confidenceOverride = o.confidenceOverride;
  }
  if (Array.isArray(o.positiveExamples)) {
    base.positiveExamples = o.positiveExamples.filter((x): x is string => typeof x === 'string').slice(0, 16);
  }
  if (Array.isArray(o.negativeExamples)) {
    base.negativeExamples = o.negativeExamples.filter((x): x is string => typeof x === 'string').slice(0, 16);
  }
  if (Array.isArray(o.preferredVariants)) {
    base.preferredVariants = o.preferredVariants.filter((x): x is string => typeof x === 'string').slice(0, 8);
  }
  if (Array.isArray(o.rejectedVariants)) {
    base.rejectedVariants = o.rejectedVariants.filter((x): x is string => typeof x === 'string').slice(0, 8);
  }
  base.ignoreBackground = o.ignoreBackground === true;
  return base;
}

/** Apply corrections onto analysis for expected_output (validated categories only). */
export function applyCorrectionsToAnalysis(
  analysis: VytheraImageAnalysis,
  corrections: VytheraTeachCorrections,
): VytheraImageAnalysis {
  const next: VytheraImageAnalysis = structuredClone(analysis);
  if (corrections.categoryOverride) {
    const allowed = new Set([
      'creature',
      'character',
      'weapon',
      'item',
      'environment',
      'structure',
      'unknown',
      'tree',
      'rock',
      'terrain',
      'building',
      'prop',
      'biome',
      'decoration',
      'texture',
      'ui',
    ]);
    if (allowed.has(corrections.categoryOverride)) {
      (next.subject as { category: string }).category = corrections.categoryOverride as VytheraImageAnalysis['subject']['category'];
    }
  }
  for (const [from, to] of Object.entries(corrections.labelOverrides)) {
    next.materials = next.materials.map((m) => (m.toLowerCase() === from.toLowerCase() ? to : m));
    next.features = next.features.map((f) => (f.toLowerCase() === from.toLowerCase() ? to : f));
  }
  if (corrections.objectTypes.length) {
    next.features = [...new Set([...next.features, ...corrections.objectTypes])].slice(0, 32);
  }
  if (corrections.paletteOverrides.length) {
    next.palette.colors = corrections.paletteOverrides;
  }
  if (corrections.confidenceOverride != null) {
    next.confidence = corrections.confidenceOverride;
  }
  if (typeof corrections.styleAttributes.chunkiness === 'number') {
    next.style.chunkiness = Math.max(0, Math.min(1, Number(corrections.styleAttributes.chunkiness)));
  }
  if (typeof corrections.styleAttributes.detailLevel === 'number') {
    next.style.detailLevel = Math.max(0, Math.min(1, Number(corrections.styleAttributes.detailLevel)));
  }
  for (const n of corrections.notes) {
    next.style.styleNotes = [...next.style.styleNotes, `correction: ${n}`].slice(0, 24);
  }
  if (corrections.ignoreBackground) {
    next.style.styleNotes = [...next.style.styleNotes, 'ignore_background'].slice(0, 24);
  }
  return next;
}

export interface VytheraTeachExample {
  id: string;
  lifecycle: VytheraTeachLifecycle;
  imageHash: string;
  fileName: string;
  mimeType: string;
  visionModel: string;
  analysis: VytheraImageAnalysis | null;
  correctedAnalysis: VytheraImageAnalysis | null;
  corrections: VytheraTeachCorrections;
  learnTargets: VytheraLearnTargets;
  palette: VytheraExtractedPalette | null;
  voxelPlan: VytheraVoxelPlan | null;
  createdAt: number;
  updatedAt: number;
  project: string;
}

const KEY = 'vythera.ai.teach.examples';

function load(): VytheraTeachExample[] {
  try {
    return JSON.parse(lsGet(KEY) ?? '[]') as VytheraTeachExample[];
  } catch {
    return [];
  }
}

function save(list: VytheraTeachExample[]): void {
  lsSet(KEY, JSON.stringify(list.slice(0, 300)));
}

export function listTeachExamples(): VytheraTeachExample[] {
  return load();
}

export function getTeachExample(id: string): VytheraTeachExample | null {
  return load().find((e) => e.id === id) ?? null;
}

export function createTeachExample(opts: {
  imageHash: string;
  fileName: string;
  mimeType: string;
  visionModel?: string;
  project?: string;
}): VytheraTeachExample {
  const ex: VytheraTeachExample = {
    id: `teach_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    lifecycle: 'IMPORTED',
    imageHash: opts.imageHash,
    fileName: opts.fileName.slice(0, 128),
    mimeType: opts.mimeType,
    visionModel: opts.visionModel ?? '',
    analysis: null,
    correctedAnalysis: null,
    corrections: emptyCorrections(),
    learnTargets: { ...DEFAULT_LEARN_TARGETS },
    palette: null,
    voxelPlan: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    project: opts.project ?? '',
  };
  const list = load();
  list.unshift(ex);
  save(list);
  return ex;
}

export function updateTeachExample(
  id: string,
  patch: Partial<
    Pick<
      VytheraTeachExample,
      | 'lifecycle'
      | 'analysis'
      | 'correctedAnalysis'
      | 'corrections'
      | 'learnTargets'
      | 'palette'
      | 'voxelPlan'
      | 'visionModel'
    >
  >,
): VytheraTeachExample | null {
  const list = load();
  const i = list.findIndex((e) => e.id === id);
  if (i < 0) return null;
  list[i] = { ...list[i]!, ...patch, updatedAt: Date.now() };
  save(list);
  return list[i]!;
}

export function deleteTeachExample(id: string): boolean {
  const list = load();
  const next = list.filter((e) => e.id !== id);
  if (next.length === list.length) return false;
  save(next);
  return true;
}

/** Parse correction notes like "This is grass, not moss." into label overrides when possible. */
export function parseCorrectionNotes(text: string): Partial<VytheraTeachCorrections> {
  const notes = text
    .split(/\n|;/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 32);
  const labelOverrides: Record<string, string> = {};
  const re = /(?:this is|use|it's|its)\s+([\w\s-]+?),\s*not\s+([\w\s-]+)/i;
  for (const n of notes) {
    const m = re.exec(n);
    if (m) labelOverrides[m[2]!.trim()] = m[1]!.trim();
  }
  const ignoreBackground = /ignore\s+(the\s+)?background/i.test(text);
  return { notes, labelOverrides, ignoreBackground };
}
