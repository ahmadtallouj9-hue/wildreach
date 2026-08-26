export interface VytheraOnlineChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface VytheraOnlineInferenceProvider {
  chat(messages: VytheraOnlineChatMessage[], opts?: { model?: string; signal?: AbortSignal }): Promise<string>;
  vision(
    prompt: string,
    image: { base64: string; mime: string },
    opts?: { model?: string; signal?: AbortSignal },
  ): Promise<string>;
  health(): Promise<{ ok: boolean; modality: Array<'TEXT' | 'VISION_LANGUAGE'> }>;
}

export class HttpVytheraOnlineInferenceProvider implements VytheraOnlineInferenceProvider {
  constructor(
    private baseUrl: string,
    private getToken: () => string,
  ) {}

  private async post<T>(p: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const res = await fetch(`${this.baseUrl}${p}`, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        ...(this.getToken() ? { Authorization: `Bearer ${this.getToken()}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Online inference failed (${res.status})`);
    return (await res.json()) as T;
  }

  async chat(
    messages: VytheraOnlineChatMessage[],
    opts?: { model?: string; signal?: AbortSignal },
  ): Promise<string> {
    const data = await this.post<{ text: string }>(
      '/api/v1/inference/chat',
      { messages, model: opts?.model },
      opts?.signal,
    );
    return data.text;
  }

  async vision(
    prompt: string,
    image: { base64: string; mime: string },
    opts?: { model?: string; signal?: AbortSignal },
  ): Promise<string> {
    const data = await this.post<{ text: string }>(
      '/api/v1/inference/vision',
      { prompt, imageBase64: image.base64, mime: image.mime, model: opts?.model },
      opts?.signal,
    );
    return data.text;
  }

  async health(): Promise<{ ok: boolean; modality: Array<'TEXT' | 'VISION_LANGUAGE'> }> {
    const res = await fetch(`${this.baseUrl}/api/v1/health`);
    if (!res.ok) return { ok: false, modality: [] };
    const data = (await res.json()) as {
      services?: { inference?: string };
      modalities?: Array<'TEXT' | 'VISION_LANGUAGE'>;
    };
    const ok = data.services?.inference === 'ok';
    return { ok, modality: data.modalities ?? (ok ? ['TEXT'] : []) };
  }
}
