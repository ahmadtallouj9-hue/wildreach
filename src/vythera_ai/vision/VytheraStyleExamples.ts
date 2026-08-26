import { lsGet, lsSet } from '../util/safeStorage';
import type { VytheraImageAnalysis } from './VytheraImageAnalysis';

export interface VytheraStyleExample {
  type: 'vythera_style_example';
  id: string;
  category: string;
  imageRefId: string | null;
  imageHash: string | null;
  analysis: VytheraImageAnalysis | null;
  style: {
    chunkiness: number;
    detailLevel: number;
    silhouette: string;
    paletteCharacteristics: string;
    materialCharacteristics: string;
  };
  userDescription: string;
  project: string;
  assetCategory: string;
  approved: boolean;
  name: string;
  createdAt: number;
}

const KEY = 'vythera.ai.style.examples';

function load(): VytheraStyleExample[] {
  try {
    return JSON.parse(lsGet(KEY) ?? '[]') as VytheraStyleExample[];
  } catch {
    return [];
  }
}

function save(list: VytheraStyleExample[]): void {
  lsSet(KEY, JSON.stringify(list.slice(0, 200)));
}

export function listStyleExamples(): VytheraStyleExample[] {
  return load();
}

export function approvedStyleExamples(): VytheraStyleExample[] {
  return load().filter((e) => e.approved);
}

export function createStyleExample(opts: {
  category: string;
  analysis: VytheraImageAnalysis;
  imageRefId?: string | null;
  imageHash?: string | null;
  userDescription?: string;
  project?: string;
  name?: string;
}): VytheraStyleExample {
  const a = opts.analysis;
  const ex: VytheraStyleExample = {
    type: 'vythera_style_example',
    id: `sty_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    category: opts.category || a.subject.category,
    imageRefId: opts.imageRefId ?? null,
    imageHash: opts.imageHash ?? null,
    analysis: a,
    style: {
      chunkiness: a.style.chunkiness,
      detailLevel: a.style.detailLevel,
      silhouette: a.shape.silhouette,
      paletteCharacteristics: a.palette.colors
        .slice(0, 5)
        .map((c) => `rgb(${c[0]},${c[1]},${c[2]})`)
        .join(', '),
      materialCharacteristics: a.materials.join(', ') || 'unspecified',
    },
    userDescription: (opts.userDescription ?? '').slice(0, 500),
    project: opts.project ?? '',
    assetCategory: a.subject.category,
    approved: false,
    name: (opts.name ?? a.subject.name ?? `Style ${a.subject.category}`).slice(0, 64),
    createdAt: Date.now(),
  };
  const list = load();
  list.unshift(ex);
  save(list);
  return ex;
}

export function updateStyleExample(
  id: string,
  patch: Partial<
    Pick<VytheraStyleExample, 'approved' | 'name' | 'userDescription' | 'category'>
  >,
): VytheraStyleExample | null {
  const list = load();
  const i = list.findIndex((e) => e.id === id);
  if (i < 0) return null;
  list[i] = { ...list[i]!, ...patch };
  save(list);
  return list[i]!;
}

export function deleteStyleExample(id: string): boolean {
  const list = load();
  const next = list.filter((e) => e.id !== id);
  if (next.length === list.length) return false;
  save(next);
  return true;
}
