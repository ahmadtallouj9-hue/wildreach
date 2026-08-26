/** Public HTTP client for VYTHERA Online (never local Ollama/training). */
import {
  loadOnlineSettings,
  saveOnlineSettings,
  type VytheraOnlineSettings,
} from '../settings/onlineSettings';

export type OnlineHealth = {
  status: 'ok' | 'degraded' | 'error';
  services: {
    api: 'ok' | 'down' | 'unknown';
    database: 'ok' | 'down' | 'unknown';
    storage: 'ok' | 'down' | 'unknown';
    inference: 'ok' | 'disabled' | 'down' | 'unknown';
  };
  modalities?: Array<'TEXT' | 'VISION_LANGUAGE'>;
};

export type OnlineModSummary = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  categories: string[];
  creatorName: string;
  downloads: number;
  latestVersion: {
    version: string;
    sha256: string;
    sizeBytes: number;
    compatibility: string[];
    createdAt: string;
  } | null;
  updatedAt: string;
};

export type OnlineModelEntry = {
  id: string;
  name: string;
  version: string;
  modality: 'TEXT' | 'VISION_LANGUAGE';
  baseModel: string;
  adapterVersion: string;
  status: 'published' | 'draft';
  description?: string;
  license?: string;
};

export class VytheraOnlineClient {
  constructor(private settings: VytheraOnlineSettings = loadOnlineSettings()) {}

  refreshSettings(): void {
    this.settings = loadOnlineSettings();
  }

  get baseUrl(): string {
    return this.settings.apiBaseUrl;
  }

  configured(): boolean {
    return Boolean(this.settings.apiBaseUrl);
  }

  private headers(json = true): HeadersInit {
    const h: Record<string, string> = {};
    if (json) h['Content-Type'] = 'application/json';
    if (this.settings.accessToken) h.Authorization = `Bearer ${this.settings.accessToken}`;
    return h;
  }

  private async req<T>(p: string, init?: RequestInit): Promise<T> {
    if (!this.settings.apiBaseUrl) throw new Error('VYTHERA Online is not configured.');
    const url = `${this.settings.apiBaseUrl}${p.startsWith('/') ? p : `/${p}`}`;
    const res = await fetch(url, {
      ...init,
      headers: { ...this.headers(init?.body !== undefined), ...(init?.headers ?? {}) },
    });
    if (!res.ok) {
      let msg = `Online request failed (${res.status})`;
      try {
        const body = (await res.json()) as { error?: string };
        if (body.error) msg = body.error;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  health(): Promise<OnlineHealth> {
    return this.req('/api/v1/health');
  }

  async register(
    email: string,
    password: string,
    displayName?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const data = await this.req<{ accessToken: string; refreshToken: string }>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, displayName }),
    });
    const next = { ...loadOnlineSettings(), accessToken: data.accessToken };
    saveOnlineSettings(next);
    this.settings = next;
    return data;
  }

  async login(email: string, password: string): Promise<{ accessToken: string; refreshToken: string }> {
    const data = await this.req<{ accessToken: string; refreshToken: string }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    const next = { ...loadOnlineSettings(), accessToken: data.accessToken };
    saveOnlineSettings(next);
    this.settings = next;
    return data;
  }

  async logout(): Promise<void> {
    try {
      await this.req('/api/v1/auth/logout', { method: 'POST', body: '{}' });
    } catch {
      /* ignore */
    }
    const next = { ...loadOnlineSettings(), accessToken: '' };
    saveOnlineSettings(next);
    this.settings = next;
  }

  async listMods(q?: string): Promise<OnlineModSummary[]> {
    const qs = q ? `?q=${encodeURIComponent(q)}` : '';
    const data = await this.req<{ mods: OnlineModSummary[] }>(`/api/v1/mods${qs}`);
    return data.mods ?? [];
  }

  getMod(id: string): Promise<{ mod: OnlineModSummary }> {
    return this.req(`/api/v1/mods/${encodeURIComponent(id)}`);
  }

  downloadMod(
    id: string,
  ): Promise<{ downloadUrl: string; sha256: string; sizeBytes: number; version: string }> {
    return this.req(`/api/v1/mods/${encodeURIComponent(id)}/download`);
  }

  publishMod(input: {
    slug: string;
    title: string;
    summary?: string;
    categories?: string[];
    version?: string;
    changelog?: string;
    compatibility?: string[];
    packageBase64: string;
  }): Promise<{ mod: OnlineModSummary }> {
    return this.req('/api/v1/mods', { method: 'POST', body: JSON.stringify(input) });
  }

  async listModels(): Promise<OnlineModelEntry[]> {
    const data = await this.req<{ models: OnlineModelEntry[] }>('/api/v1/models');
    return data.models ?? [];
  }

  publishModel(input: Record<string, unknown>): Promise<{ model: OnlineModelEntry }> {
    return this.req('/api/v1/models', { method: 'POST', body: JSON.stringify(input) });
  }

  async chat(messages: { role: string; content: string }[], model?: string): Promise<string> {
    const data = await this.req<{ text: string }>('/api/v1/inference/chat', {
      method: 'POST',
      body: JSON.stringify({ messages, model }),
    });
    return data.text;
  }

  async vision(prompt: string, imageBase64: string, mime: string, model?: string): Promise<string> {
    const data = await this.req<{ text: string }>('/api/v1/inference/vision', {
      method: 'POST',
      body: JSON.stringify({ prompt, imageBase64, mime, model }),
    });
    return data.text;
  }
}

export const vytheraOnline = new VytheraOnlineClient();
