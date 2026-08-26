import { lsGet, lsSet } from '../../util/safeStorage';
import type { VytheraImageAnalysis } from '../VytheraImageAnalysis';

type CacheMode = string;

interface CacheEntry {
  hash: string;
  model: string;
  mode: CacheMode;
  analysis: VytheraImageAnalysis;
  rawSnippet: string;
  at: number;
}

const KEY = 'vythera.ai.vision.analysisCache';
const MAX = 80;

function load(): CacheEntry[] {
  try {
    return JSON.parse(lsGet(KEY) ?? '[]') as CacheEntry[];
  } catch {
    return [];
  }
}

function save(list: CacheEntry[]): void {
  lsSet(KEY, JSON.stringify(list.slice(0, MAX)));
}

export function cacheKey(hash: string, model: string, mode: CacheMode): string {
  return `${hash}|${model}|${mode}`;
}

export function getCachedAnalysis(
  hash: string,
  model: string,
  mode: CacheMode,
): VytheraImageAnalysis | null {
  const k = cacheKey(hash, model, mode);
  const hit = load().find((e) => cacheKey(e.hash, e.model, e.mode) === k);
  return hit?.analysis ?? null;
}

export function putCachedAnalysis(
  hash: string,
  model: string,
  mode: CacheMode,
  analysis: VytheraImageAnalysis,
  rawSnippet = '',
): void {
  const list = load().filter(
    (e) => cacheKey(e.hash, e.model, e.mode) !== cacheKey(hash, model, mode),
  );
  list.unshift({
    hash,
    model,
    mode,
    analysis,
    rawSnippet: rawSnippet.slice(0, 200),
    at: Date.now(),
  });
  save(list);
}

export function clearAnalysisCache(): void {
  lsSet(KEY, '[]');
}
