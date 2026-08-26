import { lsGet, lsSet } from '../../util/safeStorage';
import type { VytheraImageAnalysis } from '../VytheraImageAnalysis';
import type { VytheraVisualTrainingRecord } from './VytheraVisualDataset';

/**
 * Level-2 runtime knowledge: approved visual examples → VYTHERA concepts.
 * Retrieval learning — not model weights.
 */
export interface VytheraVisualConcept {
  id: string;
  name: string;
  category: string;
  archetype: string;
  imageHashes: string[];
  materials: string[];
  palette: [number, number, number, number][];
  style: {
    chunkiness: number;
    detailLevel: number;
    silhouette: string;
    notes: string[];
  };
  voxelHints: {
    parts: string[];
    features: string[];
    generationRecipe: string;
  };
  correctionsSummary: string[];
  recordIds: string[];
  updatedAt: number;
}

const KEY = 'vythera.ai.visual.concepts';

function load(): VytheraVisualConcept[] {
  try {
    return JSON.parse(lsGet(KEY) ?? '[]') as VytheraVisualConcept[];
  } catch {
    return [];
  }
}

function save(list: VytheraVisualConcept[]): void {
  lsSet(KEY, JSON.stringify(list.slice(0, 400)));
}

export function listVisualConcepts(): VytheraVisualConcept[] {
  return load();
}

export function upsertConceptFromRecord(record: VytheraVisualTrainingRecord): VytheraVisualConcept {
  const a = record.expectedOutput.analysis;
  const name = (a.subject.name ?? a.subject.category).slice(0, 64);
  const archetype = mapCategoryToArchetype(a.subject.category);
  const list = load();
  const existing = list.find(
    (c) => c.category === a.subject.category && c.name.toLowerCase() === name.toLowerCase(),
  );
  const concept: VytheraVisualConcept = existing
    ? {
        ...existing,
        imageHashes: [...new Set([...existing.imageHashes, record.imageHash])].slice(0, 32),
        materials: [...new Set([...existing.materials, ...a.materials])].slice(0, 24),
        palette: a.palette.colors.length ? a.palette.colors : existing.palette,
        style: {
          chunkiness: a.style.chunkiness,
          detailLevel: a.style.detailLevel,
          silhouette: a.shape.silhouette || existing.style.silhouette,
          notes: [...new Set([...existing.style.notes, ...a.style.styleNotes])].slice(0, 24),
        },
        voxelHints: {
          parts: a.components.map((c) => c.name).slice(0, 16),
          features: a.features.slice(0, 24),
          generationRecipe: buildRecipe(a, archetype),
        },
        correctionsSummary: [
          ...existing.correctionsSummary,
          ...record.corrections.notes,
        ].slice(0, 32),
        recordIds: [...new Set([...existing.recordIds, record.id])].slice(0, 64),
        updatedAt: Date.now(),
      }
    : {
        id: `concept_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name,
        category: a.subject.category,
        archetype,
        imageHashes: [record.imageHash],
        materials: a.materials.slice(0, 24),
        palette: a.palette.colors.slice(0, 12),
        style: {
          chunkiness: a.style.chunkiness,
          detailLevel: a.style.detailLevel,
          silhouette: a.shape.silhouette,
          notes: a.style.styleNotes.slice(0, 16),
        },
        voxelHints: {
          parts: a.components.map((c) => c.name).slice(0, 16),
          features: a.features.slice(0, 24),
          generationRecipe: buildRecipe(a, archetype),
        },
        correctionsSummary: record.corrections.notes.slice(0, 16),
        recordIds: [record.id],
        updatedAt: Date.now(),
      };

  if (existing) {
    const i = list.findIndex((c) => c.id === existing.id);
    list[i] = concept;
  } else {
    list.unshift(concept);
  }
  save(list);
  return concept;
}

export function searchVisualConcepts(query: string, limit = 6): VytheraVisualConcept[] {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const all = load();
  if (!words.length) return all.slice(0, limit);
  return all
    .map((c) => {
      const hay = `${c.name} ${c.category} ${c.archetype} ${c.style.silhouette} ${c.materials.join(' ')} ${c.voxelHints.features.join(' ')}`.toLowerCase();
      const score = words.reduce((s, w) => s + (hay.includes(w) ? 1 : 0), 0);
      return { c, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.c);
}

export function findSimilarConcepts(
  analysis: VytheraImageAnalysis,
  limit = 4,
): VytheraVisualConcept[] {
  const all = load().filter((c) => c.category === analysis.subject.category || c.category === 'unknown');
  return all
    .map((c) => {
      let score = 0;
      if (c.category === analysis.subject.category) score += 2;
      score += 1 - Math.abs(c.style.chunkiness - analysis.style.chunkiness);
      for (const m of analysis.materials) {
        if (c.materials.some((x) => x.toLowerCase() === m.toLowerCase())) score += 0.5;
      }
      return { c, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.c);
}

export function clearConceptsForTests(): void {
  lsSet(KEY, '[]');
}

function mapCategoryToArchetype(category: string): string {
  const map: Record<string, string> = {
    creature: 'vythera_creature',
    character: 'vythera_character',
    tree: 'vythera_tree',
    rock: 'vythera_rock',
    terrain: 'vythera_terrain',
    building: 'vythera_building',
    structure: 'vythera_structure',
    weapon: 'vythera_weapon',
    prop: 'vythera_prop',
    biome: 'vythera_biome',
    decoration: 'vythera_decoration',
    environment: 'vythera_environment',
    item: 'vythera_item',
    texture: 'vythera_texture',
    ui: 'vythera_ui',
  };
  return map[category] ?? 'vythera_asset';
}

function buildRecipe(a: VytheraImageAnalysis, archetype: string): string {
  return [
    `archetype=${archetype}`,
    `silhouette=${a.shape.silhouette.slice(0, 60)}`,
    `chunkiness=${a.style.chunkiness.toFixed(2)}`,
    `detail=${a.style.detailLevel.toFixed(2)}`,
    `parts=${a.components.map((c) => c.role).join('+') || 'body'}`,
    `materials=${a.materials.join(',') || 'default'}`,
  ].join('; ');
}
