import type { VytheraModelLifecycle } from '../models/VytheraModelManager';
import { saveModelMeta } from '../models/VytheraModelManager';
import { lsGet, lsSet } from '../util/safeStorage';

export interface VytheraModelVersionRecord {
  modelName: string;
  baseModel: string;
  datasetVersion: string;
  trainingConfig: Record<string, unknown>;
  evaluationScore: number | null;
  createdAt: number;
  vytheraVersion: string;
  lifecycle: VytheraModelLifecycle;
}

const KEY = 'vythera.ai.modelVersions';

export class VytheraModelVersioning {
  list(): VytheraModelVersionRecord[] {
    try {
      return JSON.parse(lsGet(KEY) ?? '[]') as VytheraModelVersionRecord[];
    } catch {
      return [];
    }
  }

  private save(rows: VytheraModelVersionRecord[]): void {
    lsSet(KEY, JSON.stringify(rows.slice(0, 100)));
  }

  register(rec: Omit<VytheraModelVersionRecord, 'createdAt'>): VytheraModelVersionRecord {
    const row: VytheraModelVersionRecord = { ...rec, createdAt: Date.now() };
    const all = this.list();
    all.unshift(row);
    this.save(all);
    saveModelMeta(rec.modelName, {
      version: rec.datasetVersion,
      lifecycle: rec.lifecycle,
      architecture: String(rec.trainingConfig.method ?? 'base'),
    });
    return row;
  }

  setLifecycle(modelName: string, lifecycle: VytheraModelLifecycle): void {
    const all = this.list();
    const row = all.find((r) => r.modelName === modelName);
    if (row) row.lifecycle = lifecycle;
    this.save(all);
    saveModelMeta(modelName, { lifecycle });
  }
}

export const vytheraVersions = new VytheraModelVersioning();
