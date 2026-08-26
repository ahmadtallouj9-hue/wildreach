/**
 * Extensible registry of visual learning task types (one image → many samples).
 * UI and generators read from this — do not hard-code task lists in the Studio.
 */

export type VytheraVisualTaskType =
  | 'OBJECT_IDENTIFICATION'
  | 'SCENE_UNDERSTANDING'
  | 'STYLE_IDENTIFICATION'
  | 'MATERIAL_IDENTIFICATION'
  | 'PALETTE_EXTRACTION'
  | 'LIGHTING_ANALYSIS'
  | 'TERRAIN_ANALYSIS'
  | 'VOXEL_STRUCTURE'
  | 'ASSET_EXTRACTION'
  | 'VYTHERA_STYLE'
  | 'IGNORE_BACKGROUND'
  | 'GAME_ASSET_PLAN';

export type VytheraVisualLearningTaskStatus =
  | 'GENERATED'
  | 'ANSWERED'
  | 'CORRECTED'
  | 'APPROVED'
  | 'REJECTED';

export interface VytheraVisualTaskDefinition {
  type: VytheraVisualTaskType;
  title: string;
  instruction: string;
  /** Maps onto existing VytheraVisualTask for dataset compatibility. */
  datasetTask:
    | 'IMAGE_TO_TEXT'
    | 'IMAGE_TO_VOXEL'
    | 'IMAGE_TO_STYLE'
    | 'IMAGE_TO_PALETTE'
    | 'IMAGE_TO_CONCEPT'
    | 'IMAGE';
  /** Export-side VLM task id when present (single-row export, no expand). */
  vlmExportTask?: string;
}

export const VYTHERA_VISUAL_TASK_DEFINITIONS: readonly VytheraVisualTaskDefinition[] = [
  {
    type: 'OBJECT_IDENTIFICATION',
    title: 'Objects',
    instruction: 'Identify the main objects. Reply with structured VYTHERA JSON only.',
    datasetTask: 'IMAGE_TO_CONCEPT',
    vlmExportTask: 'OBJECT_IDENTIFICATION',
  },
  {
    type: 'SCENE_UNDERSTANDING',
    title: 'Scene',
    instruction: 'Describe the scene for VYTHERA. Reply with structured VYTHERA JSON only.',
    datasetTask: 'IMAGE_TO_TEXT',
    vlmExportTask: 'SCENE_UNDERSTANDING',
  },
  {
    type: 'STYLE_IDENTIFICATION',
    title: 'Style',
    instruction: 'What visual style is this? Reply with structured VYTHERA JSON only.',
    datasetTask: 'IMAGE_TO_STYLE',
    vlmExportTask: 'STYLE_IDENTIFICATION',
  },
  {
    type: 'MATERIAL_IDENTIFICATION',
    title: 'Materials',
    instruction: 'Identify materials present. Reply with structured VYTHERA JSON only.',
    datasetTask: 'IMAGE_TO_CONCEPT',
    vlmExportTask: 'MATERIAL_IDENTIFICATION',
  },
  {
    type: 'PALETTE_EXTRACTION',
    title: 'Palette',
    instruction: 'Extract the dominant VYTHERA palette. Reply with structured VYTHERA JSON only.',
    datasetTask: 'IMAGE_TO_PALETTE',
    vlmExportTask: 'PALETTE_IDENTIFICATION',
  },
  {
    type: 'LIGHTING_ANALYSIS',
    title: 'Lighting',
    instruction: 'Describe lighting and contrast for VYTHERA. Reply with structured JSON only.',
    datasetTask: 'IMAGE_TO_CONCEPT',
    vlmExportTask: 'SCENE_UNDERSTANDING',
  },
  {
    type: 'TERRAIN_ANALYSIS',
    title: 'Terrain',
    instruction: 'Describe terrain and ground materials. Reply with structured VYTHERA JSON only.',
    datasetTask: 'IMAGE_TO_CONCEPT',
    vlmExportTask: 'TERRAIN_UNDERSTANDING',
  },
  {
    type: 'VOXEL_STRUCTURE',
    title: 'Voxel Structure',
    instruction: 'Describe this as a VYTHERA voxel structure. Reply with structured JSON only.',
    datasetTask: 'IMAGE_TO_VOXEL',
    vlmExportTask: 'VOXEL_STRUCTURE',
  },
  {
    type: 'ASSET_EXTRACTION',
    title: 'Asset Extraction',
    instruction: 'Extract a reusable VYTHERA asset description. Reply with structured JSON only.',
    datasetTask: 'IMAGE_TO_VOXEL',
    vlmExportTask: 'ASSET_EXTRACTION',
  },
  {
    type: 'VYTHERA_STYLE',
    title: 'VYTHERA Style',
    instruction:
      'What makes this suitable for the VYTHERA visual language (voxel proportions, silhouette, materials, lighting)? Structured JSON only — generalized style rules, not pixel copying.',
    datasetTask: 'IMAGE_TO_STYLE',
    vlmExportTask: 'VYTHERA_STYLE_RECREATION',
  },
  {
    type: 'IGNORE_BACKGROUND',
    title: 'Ignore Background',
    instruction:
      'Focus on the main subject only; list background elements to ignore. Structured JSON only.',
    datasetTask: 'IMAGE_TO_CONCEPT',
    vlmExportTask: 'OBJECT_IDENTIFICATION',
  },
  {
    type: 'GAME_ASSET_PLAN',
    title: 'Game Asset Plan',
    instruction:
      'Convert this into a VYTHERA game asset plan (size, materials, structure notes, biome use). Structured JSON only — no Three.js code.',
    datasetTask: 'IMAGE_TO_VOXEL',
    vlmExportTask: 'ASSET_EXTRACTION',
  },
] as const;

const BY_TYPE = new Map(VYTHERA_VISUAL_TASK_DEFINITIONS.map((d) => [d.type, d]));

export function listVisualTaskDefinitions(): readonly VytheraVisualTaskDefinition[] {
  return VYTHERA_VISUAL_TASK_DEFINITIONS;
}

export function getVisualTaskDefinition(type: VytheraVisualTaskType): VytheraVisualTaskDefinition {
  const d = BY_TYPE.get(type);
  if (!d) throw new Error(`Unknown visual task type: ${type}`);
  return d;
}

export function isVisualTaskType(v: string): v is VytheraVisualTaskType {
  return BY_TYPE.has(v as VytheraVisualTaskType);
}

/** Deterministic task id: one slot per image+type (dedup). */
export function visualLearningTaskId(imageHash: string, type: VytheraVisualTaskType): string {
  return `vlt_${imageHash.slice(0, 24)}_${type}`;
}
