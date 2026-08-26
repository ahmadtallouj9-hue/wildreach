import { VytheraOllamaBackend } from './inference/VytheraOllamaBackend';
import { VytheraGGUFBackend, VytheraONNXBackend } from './inference/VytheraAltBackends';
import type { VytheraInferenceBackend } from './inference/VytheraInferenceBackend';
import { loadVytheraAISettings, saveVytheraAISettings } from './inference/VytheraAISettings';
import { VytheraModelManager } from './models/VytheraModelManager';
import { vytheraKnowledge } from './knowledge/VytheraKnowledgeBase';
import { vytheraMemory } from './memory/VytheraMemory';
import { registerVytheraTools } from './tools/registerVytheraTools';
import { VytheraAgent, type VytheraAgentProgress, type VytheraAgentResult } from './agent/VytheraAgent';
import type { VytheraEditorHost } from './host/VytheraEditorHost';
import { vytheraDataset } from './dataset/VytheraDatasetManager';
import { vytheraTraining } from './training/VytheraTrainingJob';
import { vytheraEvaluation } from './evaluation/VytheraEvaluation';
import { vytheraVersions } from './versioning/VytheraModelVersioning';
import { vytheraVision } from './vision/VytheraVisionAI';
import type { VytheraVisionAI } from './vision/VytheraVisionAI';
import { vytheraVisualLearning } from './vision/learning/VytheraVisualLearning';
import { vytheraVisualDataset } from './vision/learning/VytheraVisualDataset';

export type VytheraAIConnection = 'CONNECTED' | 'OFFLINE' | 'NO_MODEL' | 'BUSY' | 'ERROR';

/**
 * VYTHERA AI — game-specific intelligence layer.
 * Local only. Tool-mediated. Dataset/training/eval are first-class.
 */
export class VytheraAI {
  private backends: VytheraInferenceBackend[];
  private backend: VytheraInferenceBackend;
  private models: VytheraModelManager;
  private agent: VytheraAgent;
  private vision: VytheraVisionAI;
  private connection: VytheraAIConnection = 'OFFLINE';
  private busy = false;

  constructor(backend?: VytheraInferenceBackend) {
    registerVytheraTools();
    this.backends = [new VytheraOllamaBackend(), new VytheraGGUFBackend(), new VytheraONNXBackend()];
    this.backend = backend ?? this.backends[0]!;
    this.models = new VytheraModelManager(this.backend);
    this.agent = new VytheraAgent(this.backend);
    this.vision = vytheraVision;
    vytheraKnowledge.seedFromGame();
  }

  /** Test/prod override — must still be a local backend. */
  setBackend(backend: VytheraInferenceBackend): void {
    this.backend = backend;
    this.models.setBackend(backend);
    this.agent.setBackend(backend);
  }

  getVision(): VytheraVisionAI {
    return this.vision;
  }

  getConnection(): VytheraAIConnection {
    return this.connection;
  }

  getModelManager(): VytheraModelManager {
    return this.models;
  }

  getBackend(): VytheraInferenceBackend {
    return this.backend;
  }

  listBackends(): { id: string; name: string }[] {
    return this.backends.map((b) => ({ id: b.id, name: b.displayName }));
  }

  cancel(): void {
    this.backend.cancel();
    this.vision.cancel();
  }

  async refresh(): Promise<VytheraAIConnection> {
    try {
      await this.backend.initialize();
      const ok = await this.backend.isAvailable();
      if (!ok) {
        this.connection = 'OFFLINE';
        await this.vision.refresh();
        return this.connection;
      }
      const list = await this.models.refresh();
      await this.vision.refresh();
      if (!list.length) {
        this.connection = 'NO_MODEL';
        return this.connection;
      }
      const settings = loadVytheraAISettings();
      if (!settings.activeModel || !list.some((m) => m.name === settings.activeModel)) {
        this.models.setActive(list[0]!.name);
      }
      this.connection = this.busy ? 'BUSY' : 'CONNECTED';
      return this.connection;
    } catch {
      this.connection = 'OFFLINE';
      return this.connection;
    }
  }

  async chat(
    host: VytheraEditorHost,
    prompt: string,
    opts?: {
      signal?: AbortSignal;
      onProgress?: (p: VytheraAgentProgress) => void;
      confirmDestructive?: (tool: string, detail: string) => boolean;
    },
  ): Promise<VytheraAgentResult> {
    await this.refresh();
    if (this.connection === 'OFFLINE') throw new Error('VYTHERA AI OFFLINE');
    if (this.connection === 'NO_MODEL') throw new Error('VYTHERA AI — LOCAL MODEL REQUIRED');

    const rem = /^remember\s+(.+)/i.exec(prompt.trim());
    if (rem) {
      const e = vytheraMemory.remember(rem[1]!, 'PROJECT');
      return { summary: `Remembered: ${e.text}`, toolCalls: [{ name: 'remember', result: e }], cancelled: false };
    }
    const forget = /^forget\s+(\S+)/i.exec(prompt.trim());
    if (forget) {
      const ok = vytheraMemory.forget(forget[1]!);
      return { summary: ok ? 'Forgot.' : 'Memory id not found.', toolCalls: [], cancelled: false };
    }

    this.busy = true;
    this.connection = 'BUSY';
    try {
      const model = this.models.activeName();
      return await this.agent.run(host, prompt, {
        model,
        signal: opts?.signal,
        onProgress: opts?.onProgress,
        confirmDestructive:
          opts?.confirmDestructive ??
          ((name) => window.confirm(`Allow destructive VYTHERA tool: ${name}?`)),
      });
    } finally {
      this.busy = false;
      await this.refresh();
    }
  }
}

export const vytheraAI = new VytheraAI();

export {
  vytheraMemory,
  vytheraKnowledge,
  vytheraDataset,
  vytheraTraining,
  vytheraEvaluation,
  vytheraVersions,
  vytheraVision,
  vytheraVisualLearning,
  vytheraVisualDataset,
  loadVytheraAISettings,
  saveVytheraAISettings,
};
