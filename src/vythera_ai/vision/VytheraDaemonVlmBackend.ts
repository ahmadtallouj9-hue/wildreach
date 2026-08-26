import type {
  VytheraVisionBackend,
  VytheraVisionModelInfo,
  VytheraVisionRequest,
} from './VytheraVisionBackend';

function trainBaseUrl(): string {
  if (typeof window !== 'undefined' && import.meta.env?.DEV) return '/vythera-train';
  return 'http://127.0.0.1:8791';
}

/**
 * Routes vision inference through the local training daemon:
 * Base VLM + ACTIVE_VISION adapter (when present).
 */
export class VytheraDaemonVlmBackend implements VytheraVisionBackend {
  readonly id = 'daemon-vlm';
  readonly displayName = 'Local VLM + Adapter (daemon)';
  private abort: AbortController | null = null;

  async initialize(): Promise<void> {}
  async shutdown(): Promise<void> {
    this.cancel();
  }
  cancel(): void {
    this.abort?.abort();
    this.abort = null;
  }

  async isAvailable(signal?: AbortSignal): Promise<boolean> {
    try {
      const res = await fetch(`${trainBaseUrl()}/health`, { signal });
      return res.ok;
    } catch {
      return false;
    }
  }

  async listVisionModels(signal?: AbortSignal): Promise<VytheraVisionModelInfo[]> {
    try {
      const res = await fetch(`${trainBaseUrl()}/capability`, { signal });
      if (!res.ok) return [];
      const cap = (await res.json()) as {
        defaultVlmBase?: string;
        activeVision?: { baseModel?: string; name?: string };
        supportedModalities?: string[];
      };
      if (!cap.supportedModalities?.includes('VISION_LANGUAGE')) return [];
      const name = cap.activeVision?.baseModel || cap.defaultVlmBase || 'HuggingFaceTB/SmolVLM-256M-Instruct';
      return [
        {
          name: `vlm:${name}${cap.activeVision?.name ? `+${cap.activeVision.name}` : ''}`,
          capabilities: ['TEXT', 'VISION'],
        },
      ];
    } catch {
      return [];
    }
  }

  async analyze(req: VytheraVisionRequest): Promise<string> {
    this.abort = new AbortController();
    if (req.signal) {
      req.signal.addEventListener('abort', () => this.abort?.abort());
    }
    const res = await fetch(`${trainBaseUrl()}/vision/infer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: this.abort.signal,
      body: JSON.stringify({
        imageBase64: req.image.base64,
        prompt: req.prompt,
        maxNew: 160,
      }),
    });
    const data = (await res.json()) as { ok?: boolean; text?: string; error?: string };
    if (!res.ok || !data.ok || !data.text) {
      throw new Error(data.error || 'Local VLM inference failed');
    }
    return data.text;
  }
}
