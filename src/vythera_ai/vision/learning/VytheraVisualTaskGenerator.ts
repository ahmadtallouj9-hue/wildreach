/**
 * Context-aware multi-task generation from one VYTHERA image analysis.
 * Builds distinct structured targets — not duplicate prompts with the same answer.
 */
import type { VytheraImageAnalysis } from '../VytheraImageAnalysis';
import type { VytheraExtractedPalette } from '../VytheraLocalPalette';
import type { VytheraVoxelPlan } from '../VytheraImageToVoxel';
import type { VytheraTeachCorrections, VytheraLearnTargets } from './VytheraTeachExample';
import {
  getVisualTaskDefinition,
  listVisualTaskDefinitions,
  visualLearningTaskId,
  type VytheraVisualLearningTaskStatus,
  type VytheraVisualTaskType,
} from './VytheraVisualTaskTypes';

export interface VytheraVisualLearningTask {
  id: string;
  type: VytheraVisualTaskType;
  title: string;
  instruction: string;
  imageHash: string;
  teachSessionId: string;
  analysisVersion: string;
  generatedAt: string;
  correctedAt?: string;
  approvedAt?: string;
  status: VytheraVisualLearningTaskStatus;
  aiAnswer?: unknown;
  correctedAnswer?: unknown;
  confidence?: number;
  teachExampleId?: string;
  analysisModel?: string;
  validationErrors?: string[];
}

export interface GenerateTasksInput {
  imageHash: string;
  analysis: VytheraImageAnalysis;
  teachSessionId: string;
  analysisVersion?: string;
  analysisModel?: string;
  teachExampleId?: string;
  learnTargets?: Partial<VytheraLearnTargets>;
  /** User-disabled categories before GENERATE */
  enabledTypes?: VytheraVisualTaskType[];
  palette?: VytheraExtractedPalette | null;
  voxelPlan?: VytheraVoxelPlan | null;
  corrections?: VytheraTeachCorrections | null;
}

const TERRAIN_CATS = new Set(['terrain', 'environment', 'biome', 'tree', 'rock']);
const CHARACTER_CATS = new Set(['creature', 'character']);
const PROP_CATS = new Set(['weapon', 'item', 'prop', 'decoration', 'structure', 'building']);

/** Select relevant task types from analysis + learn targets (extensible). */
export function selectRelevantVisualTasks(input: {
  analysis: VytheraImageAnalysis;
  learnTargets?: Partial<VytheraLearnTargets>;
  enabledTypes?: VytheraVisualTaskType[];
}): VytheraVisualTaskType[] {
  const cat = input.analysis.subject.category;
  const scene = input.analysis.scene;
  const lt = input.learnTargets ?? {};
  const picked = new Set<VytheraVisualTaskType>();

  const add = (t: VytheraVisualTaskType, on = true) => {
    if (on) picked.add(t);
  };

  // Core always useful
  add('OBJECT_IDENTIFICATION', lt.objects !== false);
  add('STYLE_IDENTIFICATION', lt.visualStyle !== false);
  add('MATERIAL_IDENTIFICATION', lt.materials !== false);
  add('PALETTE_EXTRACTION', lt.palette !== false);
  add('SCENE_UNDERSTANDING', true);
  add('VYTHERA_STYLE', lt.visualStyle !== false);
  add('VOXEL_STRUCTURE', lt.voxelStructure !== false);
  add('GAME_ASSET_PLAN', lt.voxelStructure !== false || lt.objects !== false);

  if (lt.ignoreBackground) add('IGNORE_BACKGROUND');

  if (TERRAIN_CATS.has(cat) || scene?.terrain || /terrain|ground|landscape|biome/i.test(scene?.description ?? '')) {
    add('TERRAIN_ANALYSIS');
    add('LIGHTING_ANALYSIS');
  }

  if (CHARACTER_CATS.has(cat)) {
    // Avoid irrelevant terrain for portraits/characters
    picked.delete('TERRAIN_ANALYSIS');
    add('ASSET_EXTRACTION');
    add('LIGHTING_ANALYSIS', !!scene?.lighting);
  }

  if (PROP_CATS.has(cat) || cat === 'tree' || cat === 'rock') {
    add('ASSET_EXTRACTION');
  }

  if (scene?.lighting || scene?.composition) add('LIGHTING_ANALYSIS');

  if (input.enabledTypes?.length) {
    const allow = new Set(input.enabledTypes);
    for (const t of [...picked]) {
      if (!allow.has(t)) picked.delete(t);
    }
  }

  // Preserve registry order
  return listVisualTaskDefinitions()
    .map((d) => d.type)
    .filter((t) => picked.has(t));
}

function rgbaToHex(c: [number, number, number, number] | number[]): string {
  const r = Math.round(Number(c[0]) || 0)
    .toString(16)
    .padStart(2, '0');
  const g = Math.round(Number(c[1]) || 0)
    .toString(16)
    .padStart(2, '0');
  const b = Math.round(Number(c[2]) || 0)
    .toString(16)
    .padStart(2, '0');
  return `#${r}${g}${b}`;
}

/** Build a distinct structured answer per task from existing analysis (no duplicate payloads). */
export function buildStructuredTaskAnswer(
  type: VytheraVisualTaskType,
  analysis: VytheraImageAnalysis,
  extras?: {
    palette?: VytheraExtractedPalette | null;
    voxelPlan?: VytheraVoxelPlan | null;
    corrections?: VytheraTeachCorrections | null;
  },
): { answer: unknown; confidence: number } {
  const conf = analysis.confidence;
  const corr = extras?.corrections;
  const objects =
    corr?.objectTypes?.length
      ? corr.objectTypes.map((t) => ({ type: t, count: 1, confidence: conf }))
      : (analysis.scene?.objects ?? []).map((o) => ({
          type: o.type || o.name,
          count: 1,
          confidence: conf,
        }));
  if (!objects.length && analysis.features.length) {
    for (const f of analysis.features.slice(0, 8)) {
      objects.push({ type: f, count: 1, confidence: conf * 0.8 });
    }
  }
  if (!objects.length) {
    objects.push({ type: analysis.subject.category, count: 1, confidence: conf });
  }

  const materials = (corr?.objectTypes?.length ? [] : analysis.materials).map((name) => ({
    name,
    appearance: analysis.style.styleNotes.join(', ') || 'blocky',
    confidence: conf,
  }));
  if (!materials.length && analysis.materials.length === 0) {
    materials.push({
      name: analysis.subject.category,
      appearance: 'primary surface',
      confidence: conf * 0.7,
    });
  }

  const paletteColors =
    corr?.paletteOverrides?.length
      ? corr.paletteOverrides
      : extras?.palette?.dominant?.length
        ? extras.palette.dominant
        : analysis.palette.colors;

  const hexPalette = paletteColors.slice(0, 8).map((c) => rgbaToHex(c as [number, number, number, number]));

  switch (type) {
    case 'OBJECT_IDENTIFICATION':
      return { answer: { type: 'vythera_objects', objects }, confidence: conf };
    case 'SCENE_UNDERSTANDING':
      return {
        answer: {
          type: 'vythera_scene',
          description: analysis.scene?.description || analysis.subject.name || analysis.subject.category,
          objects: analysis.scene?.objects ?? objects.map((o) => ({ name: o.type, type: o.type })),
          composition: analysis.scene?.composition || analysis.shape.silhouette,
          depthLayout: analysis.scene?.depthLayout || 'unknown',
          category: analysis.subject.category,
        },
        confidence: conf,
      };
    case 'STYLE_IDENTIFICATION':
      return {
        answer: {
          type: 'vythera_style',
          voxelLike: analysis.style.voxelLike,
          chunkiness: analysis.style.chunkiness,
          detailLevel: analysis.style.detailLevel,
          styleNotes: analysis.style.styleNotes,
          pixelArt: !!analysis.style.pixelArt,
          ...corr?.styleAttributes,
        },
        confidence: conf,
      };
    case 'MATERIAL_IDENTIFICATION':
      return { answer: { type: 'vythera_materials', materials }, confidence: conf };
    case 'PALETTE_EXTRACTION':
      return {
        answer: {
          type: 'vythera_palette',
          palette: hexPalette,
          rgba: paletteColors.slice(0, 8),
        },
        confidence: conf,
      };
    case 'LIGHTING_ANALYSIS':
      return {
        answer: {
          type: 'vythera_lighting',
          lighting: analysis.scene?.lighting || 'unspecified',
          contrast: analysis.style.detailLevel,
          saturationHint: analysis.style.chunkiness,
          composition: analysis.scene?.composition || analysis.shape.silhouette,
        },
        confidence: conf * (analysis.scene?.lighting ? 1 : 0.75),
      };
    case 'TERRAIN_ANALYSIS':
      return {
        answer: {
          type: 'vythera_terrain',
          terrainType: analysis.scene?.terrain || analysis.subject.category,
          features: [
            analysis.scene?.vegetation,
            analysis.scene?.architecture,
            ...(analysis.features ?? []),
          ].filter(Boolean),
          materials: analysis.materials,
        },
        confidence: conf,
      };
    case 'VOXEL_STRUCTURE': {
      const plan = extras?.voxelPlan;
      return {
        answer: {
          type: 'vythera_voxel_structure',
          assetType: analysis.subject.category,
          subject: analysis.subject.name,
          silhouette: analysis.shape.silhouette,
          proportions: analysis.shape.proportions,
          components: analysis.components,
          plan: plan
            ? {
                size: plan.size,
                category: plan.category,
                parts: plan.parts,
                features: plan.features,
              }
            : null,
        },
        confidence: conf,
      };
    }
    case 'ASSET_EXTRACTION':
      return {
        answer: {
          type: 'vythera_asset',
          name: analysis.subject.name || analysis.subject.category,
          category: analysis.subject.category,
          possibleAssets: analysis.scene?.possibleAssets ?? [analysis.subject.category],
          materials: analysis.materials,
          features: analysis.features,
        },
        confidence: conf,
      };
    case 'VYTHERA_STYLE':
      return {
        answer: {
          type: 'vythera_style_rules',
          voxelProportions: analysis.shape.proportions,
          blockFeel: analysis.style.chunkiness,
          silhouette: analysis.shape.silhouette,
          colorRelationships: hexPalette.slice(0, 5),
          materialAppearance: analysis.materials,
          lighting: analysis.scene?.lighting || 'soft',
          contrast: analysis.style.detailLevel,
          shapeSimplification: 1 - analysis.style.detailLevel,
          textureDensity: analysis.style.detailLevel,
          environmentalComposition: analysis.scene?.composition || analysis.shape.silhouette,
          voxelSuitability: analysis.scene?.voxelSuitability ?? (analysis.style.voxelLike ? 0.8 : 0.4),
          notes: analysis.style.styleNotes,
          disclaimer: 'Generalized VYTHERA style characteristics — not pixel-perfect reproduction',
        },
        confidence: conf,
      };
    case 'IGNORE_BACKGROUND':
      return {
        answer: {
          type: 'vythera_ignore_background',
          focusSubject: analysis.subject.name || analysis.subject.category,
          ignore: analysis.scene?.objects
            ?.filter((o) => /sky|bg|background|horizon/i.test(o.name + o.type))
            .map((o) => o.name) ?? ['distant background'],
          keep: objects.map((o) => o.type),
        },
        confidence: conf,
      };
    case 'GAME_ASSET_PLAN': {
      const size = extras?.voxelPlan?.size ?? 16;
      const h = Math.max(4, Math.round(size * (analysis.shape.proportions.height || 0.6)));
      const w = Math.max(3, Math.round(size * (analysis.shape.proportions.width || 0.4)));
      return {
        answer: {
          type: 'vythera_game_asset_plan',
          assetType: analysis.subject.category,
          recommendedVoxelSize: { width: w, height: h, depth: w },
          materials: analysis.materials.length ? analysis.materials : [analysis.subject.category],
          structure: analysis.shape.silhouette || analysis.components.map((c) => c.name).join(', '),
          generationNotes: analysis.style.styleNotes.join('; ') || 'chunky voxel silhouette',
          gameUse: TERRAIN_CATS.has(analysis.subject.category)
            ? 'biome decoration'
            : CHARACTER_CATS.has(analysis.subject.category)
              ? 'entity / NPC'
              : 'placeable prop',
        },
        confidence: conf,
      };
    }
    default:
      return { answer: { type: 'vythera_generic', category: analysis.subject.category }, confidence: conf };
  }
}

export function generateVisualLearningTasks(input: GenerateTasksInput): VytheraVisualLearningTask[] {
  const types = selectRelevantVisualTasks({
    analysis: input.analysis,
    learnTargets: input.learnTargets,
    enabledTypes: input.enabledTypes,
  });
  const analysisVersion =
    input.analysisVersion ||
    `av_${input.analysis.subject.category}_${Math.round(input.analysis.confidence * 100)}`;
  const now = new Date().toISOString();
  const seenAnswers = new Set<string>();
  const out: VytheraVisualLearningTask[] = [];
  const teachSessionId = input.teachSessionId || input.teachExampleId || input.imageHash;

  for (const type of types) {
    const def = getVisualTaskDefinition(type);
    const { answer, confidence } = buildStructuredTaskAnswer(type, input.analysis, {
      palette: input.palette,
      voxelPlan: input.voxelPlan,
      corrections: input.corrections,
    });
    let payload: unknown = answer;
    if (seenAnswers.has(JSON.stringify(answer)) && type !== 'OBJECT_IDENTIFICATION') {
      payload = { taskType: type, ...(answer as object) };
    }
    seenAnswers.add(JSON.stringify(payload));
    out.push({
      id: visualLearningTaskId(input.imageHash, type),
      type,
      title: def.title,
      instruction: def.instruction,
      imageHash: input.imageHash,
      teachSessionId,
      analysisVersion,
      generatedAt: now,
      status: 'ANSWERED',
      aiAnswer: payload,
      confidence,
      teachExampleId: input.teachExampleId,
      analysisModel: input.analysisModel,
    });
  }
  return out;
}

export function validateTaskAnswer(
  type: VytheraVisualTaskType,
  answer: unknown,
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (answer == null) {
    errors.push('empty answer');
    return { ok: false, errors };
  }
  if (typeof answer !== 'object') {
    errors.push('answer must be structured object');
    return { ok: false, errors };
  }
  const o = answer as Record<string, unknown>;
  const vague = (s: unknown) =>
    typeof s === 'string' && (s.trim().length < 2 || /^(thing|stuff|object|unknown)$/i.test(s.trim()));

  switch (type) {
    case 'OBJECT_IDENTIFICATION':
      if (!Array.isArray(o.objects) || !o.objects.length) errors.push('objects[] required');
      break;
    case 'MATERIAL_IDENTIFICATION':
      if (!Array.isArray(o.materials) || !o.materials.length) errors.push('materials[] required');
      break;
    case 'PALETTE_EXTRACTION':
      if (!Array.isArray(o.palette) || o.palette.length < 1) errors.push('palette[] required');
      break;
    case 'TERRAIN_ANALYSIS':
      if (!o.terrainType || vague(o.terrainType)) errors.push('terrainType required');
      break;
    case 'VOXEL_STRUCTURE':
      if (!o.assetType && !o.silhouette) errors.push('assetType or silhouette required');
      break;
    case 'GAME_ASSET_PLAN':
      if (!o.assetType) errors.push('assetType required');
      if (!o.recommendedVoxelSize || typeof o.recommendedVoxelSize !== 'object') {
        errors.push('recommendedVoxelSize required');
      }
      break;
    case 'VYTHERA_STYLE':
      if (!o.silhouette && !o.voxelProportions) errors.push('style fields missing');
      break;
    case 'SCENE_UNDERSTANDING':
      if (!o.description || vague(o.description)) errors.push('description required');
      break;
    default:
      if (!Object.keys(o).length) errors.push('empty object');
  }
  return { ok: errors.length === 0, errors };
}

export function effectiveTaskAnswer(task: VytheraVisualLearningTask): unknown {
  return task.correctedAnswer ?? task.aiAnswer;
}
