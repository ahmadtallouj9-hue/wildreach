import type {
  VytheraGenerateRequest,
  VytheraInferenceBackend,
  VytheraModelInfo,
} from './VytheraInferenceBackend';

/**
 * GGUF / llama.cpp backend slot.
 * Not wired to a browser-native runtime yet — reports unavailable honestly.
 */
export class VytheraGGUFBackend implements VytheraInferenceBackend {
  readonly id = 'gguf';
  readonly displayName = 'GGUF / llama.cpp (local)';

  async initialize(): Promise<void> {}
  async shutdown(): Promise<void> {}
  cancel(): void {}

  async isAvailable(): Promise<boolean> {
    return false;
  }

  async listModels(): Promise<VytheraModelInfo[]> {
    return [];
  }

  async generate(_req: VytheraGenerateRequest): Promise<string> {
    throw new Error('VYTHERA AI — GGUF backend not available in this build');
  }

  async embed(): Promise<null> {
    return null;
  }
}

/**
 * ONNX Runtime backend slot — unavailable until a local ONNX runtime is integrated.
 */
export class VytheraONNXBackend implements VytheraInferenceBackend {
  readonly id = 'onnx';
  readonly displayName = 'ONNX Runtime (local)';

  async initialize(): Promise<void> {}
  async shutdown(): Promise<void> {}
  cancel(): void {}

  async isAvailable(): Promise<boolean> {
    return false;
  }

  async listModels(): Promise<VytheraModelInfo[]> {
    return [];
  }

  async generate(_req: VytheraGenerateRequest): Promise<string> {
    throw new Error('VYTHERA AI — ONNX backend not available in this build');
  }

  async embed(): Promise<null> {
    return null;
  }
}

/** Test-only mock — production UI never selects this. */
export class VytheraMockBackend implements VytheraInferenceBackend {
  readonly id = 'mock';
  readonly displayName = 'Mock (tests)';
  response =
    '{"tool":"apply_voxel_patch","args":{"type":"voxel_model","size":[32,32,32],"voxels":[{"x":15,"y":4,"z":15,"color":[120,80,40,255]}]}}';
  delayMs = 0;

  async initialize(): Promise<void> {}
  async shutdown(): Promise<void> {}
  cancel(): void {}
  async isAvailable(): Promise<boolean> {
    return true;
  }
  async listModels(): Promise<VytheraModelInfo[]> {
    return [{ name: 'vythera-mock' }];
  }
  async generate(req: VytheraGenerateRequest): Promise<string> {
    if (req.signal?.aborted) throw new Error('CANCELLED');
    if (this.delayMs) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, this.delayMs);
        req.signal?.addEventListener(
          'abort',
          () => {
            clearTimeout(t);
            reject(new Error('CANCELLED'));
          },
          { once: true },
        );
      });
    }
    if (req.signal?.aborted) throw new Error('CANCELLED');
    return this.response;
  }
  async embed(): Promise<null> {
    return null;
  }
}
