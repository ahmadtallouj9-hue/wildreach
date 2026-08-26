import {
  loadVytheraAISettings,
  vytheraOllamaBaseUrl,
} from '../inference/VytheraAISettings';
import type {
  VytheraVisionBackend,
  VytheraVisionModelInfo,
  VytheraVisionRequest,
} from './VytheraVisionBackend';
import { isLikelyVisionModelName } from './visionModelHints';

/**
 * Ollama multimodal chat — images stay on localhost only.
 * Uses /api/chat with message.images base64 arrays.
 */
export class VytheraOllamaVisionBackend implements VytheraVisionBackend {
  readonly id = 'ollama-vision';
  readonly displayName = 'Ollama Vision (local)';
  private active: AbortController | null = null;
  private activeId: string | null = null;

  async initialize(): Promise<void> {}
  async shutdown(): Promise<void> {
    this.cancel();
  }

  cancel(requestId?: string): void {
    if (requestId && this.activeId && requestId !== this.activeId) return;
    this.active?.abort();
    this.active = null;
    this.activeId = null;
  }

  private base(): string {
    return vytheraOllamaBaseUrl(loadVytheraAISettings());
  }

  async isAvailable(signal?: AbortSignal): Promise<boolean> {
    try {
      const res = await fetch(`${this.base()}/api/tags`, { signal, method: 'GET' });
      return res.ok;
    } catch {
      return false;
    }
  }

  async listVisionModels(signal?: AbortSignal): Promise<VytheraVisionModelInfo[]> {
    const res = await fetch(`${this.base()}/api/tags`, { signal });
    if (!res.ok) throw new Error('VYTHERA AI OFFLINE');
    const data = (await res.json()) as { models?: { name: string }[] };
    return (data.models ?? [])
      .filter((m) => isLikelyVisionModelName(m.name))
      .map((m) => ({
        name: m.name,
        capabilities: ['TEXT', 'VISION'] as Array<'TEXT' | 'VISION'>,
      }));
  }

  async analyze(req: VytheraVisionRequest): Promise<string> {
    this.cancel();
    const ac = new AbortController();
    this.active = ac;
    this.activeId = req.requestId ?? null;
    const settings = loadVytheraAISettings();
    const timeout = setTimeout(() => ac.abort(), settings.requestTimeoutMs);
    const signal = req.signal
      ? link(req.signal, ac.signal)
      : ac.signal;

    try {
      const body: Record<string, unknown> = {
        model: req.model,
        stream: false,
        messages: [
          {
            role: 'user',
            content: req.prompt,
            images: [req.image.base64],
          },
        ],
        options: { temperature: req.temperature ?? 0.2 },
      };
      if (req.jsonMode) body.format = 'json';

      const res = await fetch(`${this.base()}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        if (res.status === 404) throw new Error('VYTHERA AI — LOCAL VISION MODEL NOT INSTALLED');
        throw new Error(`Ollama vision HTTP ${res.status}: ${t.slice(0, 120)}`);
      }
      const data = (await res.json()) as { message?: { content?: string } };
      const content = data.message?.content?.trim();
      if (!content) throw new Error('Empty vision response');
      return content;
    } catch (e) {
      if (ac.signal.aborted || (e instanceof DOMException && e.name === 'AbortError')) {
        throw new Error('CANCELLED');
      }
      if (e instanceof TypeError || /fetch|network|Failed/i.test(String(e))) {
        throw new Error('VYTHERA AI OFFLINE');
      }
      throw e;
    } finally {
      clearTimeout(timeout);
      if (this.active === ac) {
        this.active = null;
        this.activeId = null;
      }
    }
  }
}

function link(a: AbortSignal, b: AbortSignal): AbortSignal {
  const c = new AbortController();
  const abort = () => c.abort();
  if (a.aborted || b.aborted) {
    c.abort();
    return c.signal;
  }
  a.addEventListener('abort', abort, { once: true });
  b.addEventListener('abort', abort, { once: true });
  return c.signal;
}
