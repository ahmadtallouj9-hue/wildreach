import type { VytheraInferenceBackend } from '../inference/VytheraInferenceBackend';
import { loadVytheraAISettings, saveVytheraAISettings } from '../inference/VytheraAISettings';
import { lsGet, lsSet } from '../util/safeStorage';
import { inferCapabilitiesFromName } from '../vision/visionModelHints';

export type VytheraModelRole =
  | 'VYTHERA_CHAT'
  | 'VYTHERA_PLANNER'
  | 'VYTHERA_VOXEL'
  | 'VYTHERA_BEHAVIOR'
  | 'VYTHERA_ANIMATION'
  | 'VYTHERA_CODE'
  | 'VYTHERA_VISION'
  | 'VYTHERA_EMBEDDING'
  | 'VYTHERA_FAST';

export type VytheraModelLifecycle =
  | 'BASE'
  | 'TRAINING'
  | 'CANDIDATE'
  | 'EVALUATED'
  | 'APPROVED'
  | 'ACTIVE'
  | 'ARCHIVED';

export interface VytheraRegisteredModel {
  name: string;
  provider: string;
  architecture: string;
  contextLength: number;
  quantization: string;
  capabilities: string[];
  roles: VytheraModelRole[];
  status: 'ready' | 'missing' | 'error';
  version: string;
  lifecycle: VytheraModelLifecycle;
}

const META_KEY = 'vythera.ai.modelMeta';

/** Registry of local models discovered via backends + user metadata. */
export class VytheraModelManager {
  private models: VytheraRegisteredModel[] = [];
  private backend: VytheraInferenceBackend;

  constructor(backend: VytheraInferenceBackend) {
    this.backend = backend;
  }

  setBackend(backend: VytheraInferenceBackend): void {
    this.backend = backend;
  }

  list(): VytheraRegisteredModel[] {
    return [...this.models];
  }

  activeName(): string {
    return loadVytheraAISettings().activeModel;
  }

  setActive(name: string): void {
    const s = loadVytheraAISettings();
    s.activeModel = name;
    saveVytheraAISettings(s);
    this.models = this.models.map((m) => ({
      ...m,
      lifecycle: m.name === name ? 'ACTIVE' : m.lifecycle === 'ACTIVE' ? 'APPROVED' : m.lifecycle,
    }));
  }

  async refresh(): Promise<VytheraRegisteredModel[]> {
    const available = await this.backend.isAvailable();
    if (!available) {
      this.models = [];
      return [];
    }
    const listed = await this.backend.listModels();
    const meta = loadMeta();
    this.models = listed.map((m) => {
      const prev = meta[m.name];
      const inferred = inferCapabilitiesFromName(m.name);
      const capabilities = prev?.capabilities?.length
        ? prev.capabilities
        : inferred.map((c) => c.toLowerCase());
      const roles: VytheraModelRole[] = prev?.roles?.length
        ? prev.roles
        : inferred.includes('VISION')
          ? ['VYTHERA_VISION', 'VYTHERA_CHAT']
          : ['VYTHERA_CHAT', 'VYTHERA_VOXEL', 'VYTHERA_BEHAVIOR', 'VYTHERA_ANIMATION'];
      return {
        name: m.name,
        provider: this.backend.id,
        architecture: prev?.architecture ?? 'unknown',
        contextLength: prev?.contextLength ?? 8192,
        quantization: prev?.quantization ?? 'unknown',
        capabilities,
        roles,
        status: 'ready' as const,
        version: prev?.version ?? 'base',
        lifecycle: (prev?.lifecycle as VytheraModelLifecycle) ?? 'BASE',
      };
    });
    const settings = loadVytheraAISettings();
    if (!settings.activeModel && this.models[0]) {
      this.setActive(this.models[0].name);
    } else if (settings.activeModel && !this.models.some((m) => m.name === settings.activeModel)) {
      /* keep selection but mark missing */
    }
    const active = this.activeName();
    this.models = this.models.map((m) =>
      m.name === active ? { ...m, lifecycle: 'ACTIVE' } : m,
    );
    return this.list();
  }

  modelForRole(role: VytheraModelRole): string | null {
    const hit = this.models.find((m) => m.roles.includes(role) && m.status === 'ready');
    return hit?.name ?? (this.activeName() || null);
  }

  visionModels(): VytheraRegisteredModel[] {
    return this.models.filter(
      (m) =>
        m.roles.includes('VYTHERA_VISION') ||
        m.capabilities.some((c) => c.toLowerCase() === 'vision'),
    );
  }

  hasVisionModel(): boolean {
    return this.visionModels().length > 0;
  }
}

function loadMeta(): Record<string, Partial<VytheraRegisteredModel>> {
  try {
    return JSON.parse(lsGet(META_KEY) ?? '{}') as Record<
      string,
      Partial<VytheraRegisteredModel>
    >;
  } catch {
    return {};
  }
}

export function saveModelMeta(name: string, patch: Partial<VytheraRegisteredModel>): void {
  const all = loadMeta();
  all[name] = { ...all[name], ...patch };
  lsSet(META_KEY, JSON.stringify(all));
}
