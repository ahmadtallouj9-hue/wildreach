import { lsGet, lsSet } from '../util/safeStorage';

/** Local approved / candidate training samples for VYTHERA AI. */

export type VytheraDatasetModality =
  | 'TEXT'
  | 'IMAGE'
  | 'IMAGE_TO_TEXT'
  | 'IMAGE_TO_VOXEL'
  | 'IMAGE_TO_STYLE'
  | 'IMAGE_TO_PALETTE';

export interface VytheraDatasetSample {
  id: string;
  instruction: string;
  context: string;
  toolCalls: { name: string; result: unknown }[];
  output: string;
  taskType: string;
  modality: VytheraDatasetModality;
  /** SHA-256 of local image when modality involves images — bytes stay in IndexedDB. */
  imageHash: string | null;
  validationOk: boolean;
  userRating: number | null;
  approved: boolean;
  model: string;
  timestamp: number;
  projectVersion: string;
}

const CAND_KEY = 'vythera.ai.dataset.candidates';
const APPROVED_KEY = 'vythera.ai.dataset.approved';

export class VytheraDatasetManager {
  addCandidate(
    partial: Omit<
      VytheraDatasetSample,
      'id' | 'timestamp' | 'approved' | 'userRating' | 'projectVersion' | 'modality' | 'imageHash'
    > & {
      projectVersion?: string;
      modality?: VytheraDatasetModality;
      imageHash?: string | null;
    },
  ): VytheraDatasetSample {
    const sample: VytheraDatasetSample = {
      id: `ds_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      instruction: partial.instruction,
      context: partial.context.slice(0, 4000),
      toolCalls: partial.toolCalls.slice(0, 20),
      output: partial.output.slice(0, 2000),
      taskType: partial.taskType,
      modality: partial.modality ?? 'TEXT',
      imageHash: partial.imageHash ?? null,
      validationOk: partial.validationOk,
      userRating: null,
      approved: false,
      model: partial.model,
      timestamp: Date.now(),
      projectVersion: partial.projectVersion ?? '0.0.0',
    };
    const list = this.candidates();
    list.unshift(sample);
    lsSet(CAND_KEY, JSON.stringify(list.slice(0, 200)));
    return sample;
  }

  candidates(): VytheraDatasetSample[] {
    try {
      const list = JSON.parse(lsGet(CAND_KEY) ?? '[]') as VytheraDatasetSample[];
      return list.map(normalizeSample);
    } catch {
      return [];
    }
  }

  approved(): VytheraDatasetSample[] {
    try {
      const list = JSON.parse(lsGet(APPROVED_KEY) ?? '[]') as VytheraDatasetSample[];
      return list.map(normalizeSample);
    } catch {
      return [];
    }
  }

  approve(id: string, rating = 5): boolean {
    const cands = this.candidates();
    const i = cands.findIndex((s) => s.id === id);
    if (i < 0) return false;
    const s = { ...cands[i]!, approved: true, userRating: rating };
    cands.splice(i, 1);
    lsSet(CAND_KEY, JSON.stringify(cands));
    const ap = this.approved();
    ap.unshift(s);
    lsSet(APPROVED_KEY, JSON.stringify(ap.slice(0, 500)));
    return true;
  }

  reject(id: string): boolean {
    const cands = this.candidates().filter((s) => s.id !== id);
    lsSet(CAND_KEY, JSON.stringify(cands));
    return true;
  }

  exportApprovedJsonl(): string {
    return this.approved()
      .map((s) =>
        JSON.stringify({
          instruction: s.instruction,
          context: s.context,
          output: s.output,
          tool_calls: s.toolCalls,
          task_type: s.taskType,
          modality: s.modality ?? 'TEXT',
          image_hash: s.imageHash ?? null,
          model: s.model,
        }),
      )
      .join('\n');
  }

  stats(): { candidates: number; approved: number; byTask: Record<string, number> } {
    const byTask: Record<string, number> = {};
    for (const s of this.approved()) {
      byTask[s.taskType] = (byTask[s.taskType] ?? 0) + 1;
    }
    return { candidates: this.candidates().length, approved: this.approved().length, byTask };
  }
}

export const vytheraDataset = new VytheraDatasetManager();

function normalizeSample(s: VytheraDatasetSample): VytheraDatasetSample {
  return {
    ...s,
    modality: s.modality ?? 'TEXT',
    imageHash: s.imageHash ?? null,
  };
}
