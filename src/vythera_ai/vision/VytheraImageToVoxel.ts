import type { VytheraImageAnalysis } from './VytheraImageAnalysis';
import type { VytheraExtractedPalette } from './VytheraLocalPalette';
import { LOCAL_GRID_SIZE } from '../../modding/constants';

/** Plan a VYTHERA voxel asset from structured vision analysis — not free-form mesh. */

export interface VytheraVoxelPlan {
  type: 'vythera_voxel_plan';
  size: number;
  category: string;
  name: string;
  palette: [number, number, number, number][];
  parts: { name: string; role: string }[];
  features: string[];
  chunkiness: number;
  detailLevel: number;
  silhouette: string;
  animationHints: string[];
  behaviorHints: string[];
}

export function planVoxelFromAnalysis(
  analysis: VytheraImageAnalysis,
  palette?: VytheraExtractedPalette | null,
): VytheraVoxelPlan {
  const colors =
    palette?.dominant?.length
      ? palette.dominant
      : analysis.palette.colors.length
        ? analysis.palette.colors
        : ([[90, 110, 80, 255], [40, 50, 35, 255], [200, 190, 160, 255]] as [
            number,
            number,
            number,
            number,
          ][]);

  return {
    type: 'vythera_voxel_plan',
    size: LOCAL_GRID_SIZE,
    category: analysis.subject.category,
    name: analysis.subject.name ?? `FromImage_${analysis.subject.category}`,
    palette: colors.slice(0, 12),
    parts: analysis.components.length
      ? analysis.components
      : [
          { name: 'body', role: 'torso' },
          { name: 'head', role: 'head' },
        ],
    features: analysis.features.slice(0, 16),
    chunkiness: analysis.style.chunkiness,
    detailLevel: analysis.style.detailLevel,
    silhouette: analysis.shape.silhouette,
    animationHints: analysis.animationHints.slice(0, 8),
    behaviorHints: analysis.behaviorHints.slice(0, 8),
  };
}

/**
 * Build a simple validated voxel fill from plan (procedural scaffold).
 * Real generation goes through VYTHERA tools / agent — this is a deterministic seed.
 */
export function scaffoldVoxelsFromPlan(plan: VytheraVoxelPlan): {
  size: number;
  voxels: { x: number; y: number; z: number; color: [number, number, number, number] }[];
} {
  const size = plan.size;
  const voxels: { x: number; y: number; z: number; color: [number, number, number, number] }[] =
    [];
  const body = plan.palette[0] ?? [100, 120, 90, 255];
  const accent = plan.palette[1] ?? [50, 60, 45, 255];
  const cx = Math.floor(size / 2);
  const cy = Math.floor(size / 2);
  const cz = Math.floor(size / 2);
  const chunk = 0.4 + plan.chunkiness * 0.45;
  const rx = Math.floor(size * 0.22 * chunk);
  const ry = Math.floor(size * 0.28 * chunk);
  const rz = Math.floor(size * 0.18 * chunk);

  for (let x = cx - rx; x <= cx + rx; x++) {
    for (let y = cy - ry; y <= cy + ry; y++) {
      for (let z = cz - rz; z <= cz + rz; z++) {
        if (x < 0 || y < 0 || z < 0 || x >= size || y >= size || z >= size) continue;
        const nx = (x - cx) / Math.max(1, rx);
        const ny = (y - cy) / Math.max(1, ry);
        const nz = (z - cz) / Math.max(1, rz);
        if (nx * nx + ny * ny + nz * nz > 1) continue;
        const edge = nx * nx + ny * ny + nz * nz > 0.72;
        voxels.push({ x, y, z, color: edge ? accent : body });
      }
    }
  }

  /* Head bump for creature/character */
  if (plan.category === 'creature' || plan.category === 'character') {
    const hx = cx;
    const hy = Math.min(size - 2, cy + ry + 2);
    const hz = cz;
    const hr = Math.max(2, Math.floor(rx * 0.55));
    for (let x = hx - hr; x <= hx + hr; x++) {
      for (let y = hy - hr; y <= hy + hr; y++) {
        for (let z = hz - hr; z <= hz + hr; z++) {
          if (x < 0 || y < 0 || z < 0 || x >= size || y >= size || z >= size) continue;
          const nx = (x - hx) / hr;
          const ny = (y - hy) / hr;
          const nz = (z - hz) / hr;
          if (nx * nx + ny * ny + nz * nz > 1) continue;
          voxels.push({ x, y, z, color: body });
        }
      }
    }
  }

  /* Blade-like extruded shape for weapons */
  if (plan.category === 'weapon' || plan.features.some((f) => /blade|sword/i.test(f))) {
    const blade = plan.palette[2] ?? accent;
    for (let y = cy - 2; y <= cy + Math.floor(size * 0.35); y++) {
      for (let z = cz - 1; z <= cz + 1; z++) {
        if (y >= 0 && y < size && z >= 0 && z < size) {
          voxels.push({ x: cx, y, z, color: blade });
          if (cx + 1 < size) voxels.push({ x: cx + 1, y, z, color: blade });
        }
      }
    }
  }

  return { size, voxels };
}

export interface VytheraImageDiff {
  type: 'vythera_image_diff';
  silhouette: string;
  palette: string;
  proportions: string;
  materials: string;
  features: string;
  suggestedChanges: string[];
}

export function diffAnalyses(
  reference: VytheraImageAnalysis,
  current: VytheraImageAnalysis,
): VytheraImageDiff {
  const suggested: string[] = [];
  if (reference.style.chunkiness - current.style.chunkiness > 0.15) {
    suggested.push('Increase chunkiness toward reference');
  }
  if (current.style.detailLevel - reference.style.detailLevel > 0.2) {
    suggested.push('Reduce detail to match reference style');
  }
  if (reference.palette.colors.length && current.palette.colors.length) {
    suggested.push('Re-apply reference palette');
  }
  for (const f of reference.features) {
    if (!current.features.some((c) => c.toLowerCase() === f.toLowerCase())) {
      suggested.push(`Add missing feature: ${f}`);
    }
  }
  return {
    type: 'vythera_image_diff',
    silhouette: `ref: ${reference.shape.silhouette} | cur: ${current.shape.silhouette}`,
    palette: `ref ${reference.palette.colors.length} colors vs cur ${current.palette.colors.length}`,
    proportions: JSON.stringify({
      ref: reference.shape.proportions,
      cur: current.shape.proportions,
    }),
    materials: `ref: ${reference.materials.join(',')} | cur: ${current.materials.join(',')}`,
    features: `ref: ${reference.features.join(',')} | cur: ${current.features.join(',')}`,
    suggestedChanges: suggested.slice(0, 12),
  };
}
