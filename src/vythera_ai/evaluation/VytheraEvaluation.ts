import { validatePatch, validateVoxelPayload } from '../tools/registerVytheraTools';

export interface VytheraEvalCase {
  id: string;
  category: 'VOXEL' | 'BEHAVIOR' | 'ANIMATION' | 'SKIN' | 'TOOLS' | 'PROJECT_KNOWLEDGE' | 'GAMEPLAY';
  instruction: string;
  /** Fixture JSON the model should produce (for offline scoring). */
  expectedType: string;
}

export interface VytheraEvalScore {
  caseId: string;
  passed: boolean;
  reason: string;
}

export interface VytheraEvalReport {
  model: string;
  mode: 'schema_offline' | 'live_inference';
  scores: VytheraEvalScore[];
  passRate: number;
  createdAt: number;
}

const BENCHMARK: VytheraEvalCase[] = [
  {
    id: 'voxel_sparse',
    category: 'VOXEL',
    instruction: 'Create a small VYTHERA wolf.',
    expectedType: 'voxel_model',
  },
  {
    id: 'behavior_click_glow',
    category: 'BEHAVIOR',
    instruction: 'When clicked, glow blue.',
    expectedType: 'behavior_graph',
  },
  {
    id: 'anim_walk',
    category: 'ANIMATION',
    instruction: 'Give it a walking animation.',
    expectedType: 'animation',
  },
  {
    id: 'palette_moss',
    category: 'SKIN',
    instruction: 'Create a mossy ancient palette.',
    expectedType: 'palette',
  },
];

/** Offline schema benchmarks — does not claim live model quality without inference. */
export class VytheraEvaluation {
  cases(): VytheraEvalCase[] {
    return [...BENCHMARK];
  }

  /** Score structured payloads offline (used by tests + Studio). */
  scorePayload(caseId: string, payload: unknown): VytheraEvalScore {
    const c = BENCHMARK.find((x) => x.id === caseId);
    if (!c) return { caseId, passed: false, reason: 'unknown case' };
    try {
      const o = payload as Record<string, unknown>;
      if (c.expectedType === 'voxel_model') {
        validateVoxelPayload(o);
        return { caseId, passed: true, reason: 'voxel schema ok' };
      }
      if (c.expectedType === 'behavior_graph') {
        if (o.type !== 'behavior_graph') throw new Error('wrong type');
        return { caseId, passed: true, reason: 'behavior type ok' };
      }
      if (c.expectedType === 'animation') {
        if (o.type !== 'animation') throw new Error('wrong type');
        return { caseId, passed: true, reason: 'animation type ok' };
      }
      if (c.expectedType === 'palette') {
        if (o.type !== 'palette') throw new Error('wrong type');
        return { caseId, passed: true, reason: 'palette type ok' };
      }
      if (c.expectedType === 'voxel_patch') {
        validatePatch(o);
        return { caseId, passed: true, reason: 'patch ok' };
      }
      return { caseId, passed: false, reason: 'unhandled' };
    } catch (e) {
      return { caseId, passed: false, reason: e instanceof Error ? e.message : String(e) };
    }
  }

  runOfflineFixtures(fixtures: Record<string, unknown>, model = 'fixture'): VytheraEvalReport {
    const scores = BENCHMARK.map((c) => this.scorePayload(c.id, fixtures[c.id] ?? {}));
    const pass = scores.filter((s) => s.passed).length;
    return {
      model,
      mode: 'schema_offline',
      scores,
      passRate: pass / Math.max(1, scores.length),
      createdAt: Date.now(),
    };
  }
}

export const vytheraEvaluation = new VytheraEvaluation();
