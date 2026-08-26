import type {
  VytheraVisionBackend,
  VytheraVisionModelInfo,
  VytheraVisionRequest,
} from './VytheraVisionBackend';

/** Transformers.js / local HF vision — not wired in this browser build. */
export class VytheraTransformersVisionBackend implements VytheraVisionBackend {
  readonly id = 'transformers-vision';
  readonly displayName = 'Transformers Vision (local)';
  async initialize(): Promise<void> {}
  async shutdown(): Promise<void> {}
  cancel(): void {}
  async isAvailable(): Promise<boolean> {
    return false;
  }
  async listVisionModels(): Promise<VytheraVisionModelInfo[]> {
    return [];
  }
  async analyze(_req: VytheraVisionRequest): Promise<string> {
    throw new Error('VYTHERA AI — Transformers vision backend not available in this build');
  }
}

/** ONNX vision slot — unavailable until local ONNX runtime is integrated. */
export class VytheraONNXVisionBackend implements VytheraVisionBackend {
  readonly id = 'onnx-vision';
  readonly displayName = 'ONNX Vision (local)';
  async initialize(): Promise<void> {}
  async shutdown(): Promise<void> {}
  cancel(): void {}
  async isAvailable(): Promise<boolean> {
    return false;
  }
  async listVisionModels(): Promise<VytheraVisionModelInfo[]> {
    return [];
  }
  async analyze(_req: VytheraVisionRequest): Promise<string> {
    throw new Error('VYTHERA AI — ONNX vision backend not available in this build');
  }
}

/** Test-only mock — returns fixed structured analysis JSON. */
export class VytheraMockVisionBackend implements VytheraVisionBackend {
  readonly id = 'mock-vision';
  readonly displayName = 'Mock Vision (tests)';
  response = JSON.stringify({
    type: 'vythera_image_analysis',
    subject: { category: 'creature', name: null },
    shape: {
      silhouette: 'quadruped chunky body',
      proportions: { body: 0.5, head: 0.2, limbs: 0.3 },
      symmetry: 'bilateral',
    },
    palette: {
      colors: [
        [60, 80, 50, 255],
        [30, 40, 28, 255],
        [180, 170, 140, 255],
      ],
    },
    materials: ['moss', 'stone'],
    features: ['horns', 'glowing eyes'],
    style: {
      voxelLike: true,
      chunkiness: 0.85,
      detailLevel: 0.4,
      styleNotes: ['VYTHERA chunky silhouette'],
    },
    components: [
      { name: 'body', role: 'torso' },
      { name: 'head', role: 'head' },
    ],
    animationHints: ['idle_breathe', 'walk'],
    behaviorHints: ['Glow on Click'],
    confidence: 0.72,
  });

  async initialize(): Promise<void> {}
  async shutdown(): Promise<void> {}
  cancel(): void {}
  async isAvailable(): Promise<boolean> {
    return true;
  }
  async listVisionModels(): Promise<VytheraVisionModelInfo[]> {
    return [{ name: 'mock-vision', capabilities: ['TEXT', 'VISION'] }];
  }
  async analyze(req: VytheraVisionRequest): Promise<string> {
    if (req.signal?.aborted) throw new Error('CANCELLED');
    return this.response;
  }
}
