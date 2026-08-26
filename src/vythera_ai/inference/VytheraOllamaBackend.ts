import {
  loadVytheraAISettings,
  vytheraOllamaBaseUrl,
} from './VytheraAISettings';
import type {
  VytheraGenerateRequest,
  VytheraInferenceBackend,
  VytheraModelInfo,
} from './VytheraInferenceBackend';

/** Functional local Ollama backend for VYTHERA AI (127.0.0.1 only). */
export class VytheraOllamaBackend implements VytheraInferenceBackend {
  readonly id = 'ollama';
  readonly displayName = 'Ollama (local)';
  private active: AbortController | null = null;
  private activeId: string | null = null;

  async initialize(): Promise<void> {
    /* no persistent connection */
  }

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

  async listModels(signal?: AbortSignal): Promise<VytheraModelInfo[]> {
    const res = await fetch(`${this.base()}/api/tags`, { signal });
    if (!res.ok) throw new Error('VYTHERA AI OFFLINE');
    const data = (await res.json()) as { models?: { name: string; size?: number }[] };
    return (data.models ?? []).map((m) => ({ name: m.name, sizeBytes: m.size }));
  }

  async generate(req: VytheraGenerateRequest): Promise<string> {
    this.cancel();
    const ac = new AbortController();
    this.active = ac;
    this.activeId = req.requestId ?? null;
    const settings = loadVytheraAISettings();
    const timeout = setTimeout(() => ac.abort(), settings.requestTimeoutMs);
    const signal = linkSignals(req.signal, ac.signal);

    try {
      const body: Record<string, unknown> = {
        model: req.model || settings.activeModel,
        messages: req.messages,
        stream: !!req.stream,
        options: { temperature: req.temperature ?? settings.temperature },
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
        if (res.status === 404) throw new Error('VYTHERA AI — LOCAL MODEL NOT FOUND');
        throw new Error(`Ollama HTTP ${res.status}: ${t.slice(0, 120)}`);
      }
      if (req.stream && res.body) return await this.readStream(res.body, req, signal);
      const data = (await res.json()) as { message?: { content?: string } };
      const content = data.message?.content?.trim();
      if (!content) throw new Error('Empty Ollama response');
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

  async embed(): Promise<null> {
    return null;
  }

  private async readStream(
    body: ReadableStream<Uint8Array>,
    req: VytheraGenerateRequest,
    signal: AbortSignal,
  ): Promise<string> {
    const reader = body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let out = '';
    try {
      while (true) {
        if (signal.aborted) throw new Error('CANCELLED');
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split(/\r?\n/);
        buf = lines.pop() ?? '';
        for (const line of lines) {
          const s = line.trim();
          if (!s) continue;
          try {
            const json = JSON.parse(s) as { message?: { content?: string }; error?: string };
            if (json.error) throw new Error(json.error);
            const tok = json.message?.content;
            if (tok) {
              out += tok;
              req.onToken?.(tok);
            }
          } catch (e) {
            if (e instanceof Error && e.message !== 'Unexpected end of JSON input') {
              if (/CANCELLED|error/i.test(e.message) && !e.message.includes('JSON')) throw e;
            }
          }
        }
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        /* */
      }
    }
    if (!out.trim()) throw new Error('Empty stream');
    return out.trim();
  }
}

function linkSignals(a?: AbortSignal, b?: AbortSignal): AbortSignal {
  if (!a) return b!;
  if (!b) return a;
  const linked = new AbortController();
  const abort = () => linked.abort();
  if (a.aborted || b.aborted) {
    linked.abort();
    return linked.signal;
  }
  a.addEventListener('abort', abort, { once: true });
  b.addEventListener('abort', abort, { once: true });
  return linked.signal;
}
