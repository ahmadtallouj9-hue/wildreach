import fs from 'fs';
import path from 'path';

const root = process.cwd();
const online = path.join(root, 'src', 'online');
function w(rel, body) {
  const abs = path.join(online, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
  console.log('wrote', rel);
}

// Read backend interface for correct method names
const backendSrc = fs.readFileSync(
  path.join(root, 'src/vythera_ai/inference/VytheraInferenceBackend.ts'),
  'utf8',
);
const hasIsAvailable = /isAvailable\(/.test(backendSrc);
const hasGenerate = /generate\(/.test(backendSrc);
console.log({ hasIsAvailable, hasGenerate });

w(
  'client/VytheraOnlineClient.ts',
  `/** Public HTTP client for VYTHERA Online (never local Ollama/training). */
import { loadOnlineSettings, type VytheraOnlineSettings } from '../settings/onlineSettings';

export type OnlineHealth = {
  status: 'ok' | 'degraded' | 'down';
  services: {
    api: 'ok' | 'down' | 'unknown';
    database: 'ok' | 'down' | 'unknown';
    storage: 'ok' | 'down' | 'unknown';
    inference: 'ok' | 'down' | 'unknown';
  };
  inference?: { modality?: Array<'TEXT' | 'VISION_LANGUAGE'> };
};

export type OnlineModSummary = {
  id: string;
  name: string;
  displayName: string;
  description: string;
  version: string;
  author: string;
  category: string;
  downloads: number;
  ratingAvg: number;
  ratingCount: number;
};

export type OnlineModelEntry = {
  id: string;
  name: string;
  version: string;
  modality: 'TEXT' | 'VISION_LANGUAGE';
  baseModel: string;
  adapterVersion: string;
  status: 'published' | 'yanked';
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
    if (this.settings.accessToken) h.Authorization = \`Bearer \${this.settings.accessToken}\`;
    return h;
  }

  private async req<T>(p: string, init?: RequestInit): Promise<T> {
    if (!this.settings.apiBaseUrl) throw new Error('VYTHERA Online is not configured.');
    const url = \`\${this.settings.apiBaseUrl}\${p.startsWith('/') ? p : \`/\${p}\`}\`;
    const res = await fetch(url, {
      ...init,
      headers: { ...this.headers(init?.body !== undefined), ...(init?.headers ?? {}) },
    });
    if (!res.ok) {
      let msg = \`Online request failed (\${res.status})\`;
      try {
        const body = (await res.json()) as { error?: string };
        if (body.error) msg = body.error;
      } catch { /* ignore */ }
      throw new Error(msg);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  health(): Promise<OnlineHealth> {
    return this.req('/api/v1/health');
  }

  register(username: string, password: string): Promise<{ token: string }> {
    return this.req('/api/v1/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) });
  }

  login(username: string, password: string): Promise<{ token: string }> {
    return this.req('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
  }

  async logout(): Promise<void> {
    try { await this.req('/api/v1/auth/logout', { method: 'POST', body: '{}' }); } catch { /* ignore */ }
  }

  async listMods(q?: string): Promise<OnlineModSummary[]> {
    const qs = q ? \`?q=\${encodeURIComponent(q)}\` : '';
    const data = await this.req<{ mods: OnlineModSummary[] }>(\`/api/v1/mods\${qs}\`);
    return data.mods ?? [];
  }

  getMod(id: string): Promise<OnlineModSummary & { packageJson?: string }> {
    return this.req(\`/api/v1/mods/\${encodeURIComponent(id)}\`);
  }

  downloadMod(id: string): Promise<{ downloadUrl: string; sha256: string }> {
    return this.req(\`/api/v1/mods/\${encodeURIComponent(id)}/download\`);
  }

  publishMod(packageJson: string): Promise<{ id: string }> {
    return this.req('/api/v1/mods', { method: 'POST', body: JSON.stringify({ packageJson }) });
  }

  async listModels(): Promise<OnlineModelEntry[]> {
    const data = await this.req<{ models: OnlineModelEntry[] }>('/api/v1/models');
    return data.models ?? [];
  }

  async chat(messages: { role: string; content: string }[], model?: string): Promise<string> {
    const data = await this.req<{ text: string }>('/api/v1/inference/chat', {
      method: 'POST', body: JSON.stringify({ messages, model }),
    });
    return data.text;
  }

  async vision(prompt: string, imageBase64: string, mime: string, model?: string): Promise<string> {
    const data = await this.req<{ text: string }>('/api/v1/inference/vision', {
      method: 'POST', body: JSON.stringify({ prompt, imageBase64, mime, model }),
    });
    return data.text;
  }
}

export const vytheraOnline = new VytheraOnlineClient();
`,
);

w(
  'ai/VytheraOnlineInferenceProvider.ts',
  `export interface VytheraOnlineChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface VytheraOnlineInferenceProvider {
  chat(messages: VytheraOnlineChatMessage[], opts?: { model?: string; signal?: AbortSignal }): Promise<string>;
  vision(prompt: string, image: { base64: string; mime: string }, opts?: { model?: string; signal?: AbortSignal }): Promise<string>;
  health(): Promise<{ ok: boolean; modality: Array<'TEXT' | 'VISION_LANGUAGE'> }>;
}

export class HttpVytheraOnlineInferenceProvider implements VytheraOnlineInferenceProvider {
  constructor(private baseUrl: string, private getToken: () => string) {}

  private async post<T>(p: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const res = await fetch(\`\${this.baseUrl}\${p}\`, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        ...(this.getToken() ? { Authorization: \`Bearer \${this.getToken()}\` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(\`Online inference failed (\${res.status})\`);
    return (await res.json()) as T;
  }

  async chat(messages: VytheraOnlineChatMessage[], opts?: { model?: string; signal?: AbortSignal }): Promise<string> {
    const data = await this.post<{ text: string }>('/api/v1/inference/chat', { messages, model: opts?.model }, opts?.signal);
    return data.text;
  }

  async vision(prompt: string, image: { base64: string; mime: string }, opts?: { model?: string; signal?: AbortSignal }): Promise<string> {
    const data = await this.post<{ text: string }>(
      '/api/v1/inference/vision',
      { prompt, imageBase64: image.base64, mime: image.mime, model: opts?.model },
      opts?.signal,
    );
    return data.text;
  }

  async health(): Promise<{ ok: boolean; modality: Array<'TEXT' | 'VISION_LANGUAGE'> }> {
    const res = await fetch(\`\${this.baseUrl}/api/v1/health\`);
    if (!res.ok) return { ok: false, modality: [] };
    const data = (await res.json()) as { services?: { inference?: string }; inference?: { modality?: Array<'TEXT' | 'VISION_LANGUAGE'> } };
    const ok = data.services?.inference === 'ok';
    return { ok, modality: data.inference?.modality ?? (ok ? ['TEXT'] : []) };
  }
}
`,
);

w(
  'ai/VytheraAIRouter.ts',
  `import type { VytheraChatMessage, VytheraInferenceBackend } from '../../vythera_ai/inference/VytheraInferenceBackend';
import { evaluateOnlineGate, type VytheraDataClass } from '../privacy/gate';
import { loadOnlineSettings, onlineAiAllowed, type VytheraOnlineSettings } from '../settings/onlineSettings';
import {
  HttpVytheraOnlineInferenceProvider,
  type VytheraOnlineChatMessage,
  type VytheraOnlineInferenceProvider,
} from './VytheraOnlineInferenceProvider';

export type RouterChatResult = { text: string; route: 'local' | 'online'; reason?: string };

export class VytheraAIRouter {
  constructor(
    private localBackend: VytheraInferenceBackend,
    private online: VytheraOnlineInferenceProvider | null = null,
  ) {}

  setLocalBackend(backend: VytheraInferenceBackend): void { this.localBackend = backend; }
  setOnlineProvider(provider: VytheraOnlineInferenceProvider | null): void { this.online = provider; }

  ensureOnlineFromSettings(s: VytheraOnlineSettings = loadOnlineSettings()): void {
    if (s.apiBaseUrl && onlineAiAllowed(s)) {
      this.online = new HttpVytheraOnlineInferenceProvider(s.apiBaseUrl, () => loadOnlineSettings().accessToken);
    } else {
      this.online = null;
    }
  }

  async chat(messages: VytheraOnlineChatMessage[], opts?: { model?: string }): Promise<RouterChatResult> {
    const settings = loadOnlineSettings();
    const userText = messages.filter((m) => m.role === 'user').map((m) => m.content).join('\\n');
    const localOk = await this.localBackend.isAvailable().catch(() => false);
    const asLocal = messages as VytheraChatMessage[];

    if (settings.aiMode === 'LOCAL' || !onlineAiAllowed(settings)) {
      if (!localOk) throw new Error('Local AI unavailable. Online AI is disabled.');
      return { text: await this.localBackend.generate({ model: opts?.model || '', messages: asLocal }), route: 'local' };
    }

    if (settings.aiMode === 'ONLINE') {
      const gate = evaluateOnlineGate({
        kind: 'text', text: userText, onlineEnabled: true, allowOnlineForSafeLocal: true, explicitClass: 'LOCAL_ONLY',
      });
      if (!gate.allowed) throw new Error(gate.reason);
      if (!this.online) throw new Error('Online AI provider not configured.');
      return { text: await this.online.chat(messages, { model: opts?.model }), route: 'online' };
    }

    if (localOk) {
      return { text: await this.localBackend.generate({ model: opts?.model || '', messages: asLocal }), route: 'local' };
    }

    const gate = evaluateOnlineGate({
      kind: 'text', text: userText, onlineEnabled: onlineAiAllowed(settings),
      allowOnlineForSafeLocal: true, explicitClass: 'LOCAL_ONLY',
    });
    if (!gate.allowed) {
      throw new Error(\`\${gate.reason} Local AI is offline; private/local-only content was not sent online.\`);
    }
    if (!this.online) throw new Error('Local AI offline and Online AI is not configured.');
    return { text: await this.online.chat(messages, { model: opts?.model }), route: 'online', reason: 'local_unavailable_safe_fallback' };
  }

  async vision(
    prompt: string,
    image: { base64: string; mime: string },
    opts?: {
      model?: string;
      classification?: VytheraDataClass;
      localVision?: (prompt: string, image: { base64: string; mime: string }) => Promise<string>;
    },
  ): Promise<RouterChatResult> {
    const settings = loadOnlineSettings();
    const classification = opts?.classification ?? 'LOCAL_ONLY';
    const localVision = opts?.localVision;

    if (settings.aiMode === 'LOCAL' || classification === 'PRIVATE' || !onlineAiAllowed(settings)) {
      if (!localVision) throw new Error('Local vision unavailable.');
      return { text: await localVision(prompt, image), route: 'local' };
    }

    if (settings.aiMode === 'ONLINE') {
      const gate = evaluateOnlineGate({
        kind: 'image', text: prompt, onlineEnabled: true,
        allowOnlineForSafeLocal: classification !== 'PRIVATE', explicitClass: classification,
      });
      if (!gate.allowed) throw new Error(gate.reason);
      if (!this.online) throw new Error('Online AI provider not configured.');
      return { text: await this.online.vision(prompt, image, { model: opts?.model }), route: 'online' };
    }

    if (localVision) {
      try { return { text: await localVision(prompt, image), route: 'local' }; } catch { /* fallthrough */ }
    }
    if (classification === 'PRIVATE') {
      throw new Error('Private vision data cannot use Online AI. Keep Local AI available.');
    }
    const gate = evaluateOnlineGate({
      kind: 'image', text: prompt, onlineEnabled: onlineAiAllowed(settings),
      allowOnlineForSafeLocal: true, explicitClass: classification,
    });
    if (!gate.allowed) throw new Error(gate.reason);
    if (!this.online) throw new Error('Local vision offline; Online AI not configured.');
    return {
      text: await this.online.vision(prompt, image, { model: opts?.model }),
      route: 'online',
      reason: 'local_unavailable_safe_fallback',
    };
  }
}
`,
);

w(
  'models/types.ts',
  `export type PublishedModelModality = 'TEXT' | 'VISION_LANGUAGE';

export interface PublishedModelRecord {
  id: string;
  name: string;
  version: string;
  modality: PublishedModelModality;
  baseModel: string;
  adapterVersion: string;
  status: 'published' | 'yanked';
  description: string;
  license: string;
  creator: string;
  createdAt: number;
  artifactKey?: string;
}

export interface ModelPublishRequest {
  id: string;
  name: string;
  version: string;
  modality: PublishedModelModality;
  baseModel: string;
  adapterVersion: string;
  description: string;
  license: string;
  creator: string;
  artifactBase64?: string;
}

export function sanitizeModelPublishRequest(raw: ModelPublishRequest):
  | { ok: true; record: Omit<PublishedModelRecord, 'createdAt' | 'status' | 'artifactKey'>; artifactBase64?: string }
  | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const id = String(raw.id ?? '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 64);
  if (!id) errors.push('Model id required.');
  const name = String(raw.name ?? '').trim().slice(0, 80);
  if (!name) errors.push('Model name required.');
  const version = String(raw.version ?? '').trim().slice(0, 32);
  if (!/^\\d+\\.\\d+\\.\\d+[a-z0-9.-]*$/i.test(version)) errors.push('Semver-like version required.');
  const modality = raw.modality === 'VISION_LANGUAGE' ? 'VISION_LANGUAGE' : 'TEXT';
  const baseModel = String(raw.baseModel ?? '').trim().slice(0, 120);
  if (!baseModel) errors.push('Base model attribution required.');
  const adapterVersion = String(raw.adapterVersion ?? '').trim().slice(0, 64) || version;
  const description = String(raw.description ?? '').trim().slice(0, 2000);
  const license = String(raw.license ?? '').trim().slice(0, 120) || 'Proprietary';
  const creator = String(raw.creator ?? '').trim().slice(0, 64) || 'unknown';
  const probe = JSON.stringify(raw);
  if (/[A-Za-z]:\\\\|\\/home\\/|\\/Users\\/|dataset|train\\.jsonl|127\\.0\\.0\\.1/i.test(probe)) {
    errors.push('Publish payload must not include private paths, datasets, or loopback hosts.');
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    record: { id, name, version, modality, baseModel, adapterVersion, description, license, creator },
    artifactBase64: raw.artifactBase64,
  };
}
`,
);

w(
  'status/serviceStatus.ts',
  `import { vytheraOnline } from '../client/VytheraOnlineClient';
import { loadOnlineSettings, onlineConfigured } from '../settings/onlineSettings';

export type VytheraServiceUiStatus = 'VYTHERA ONLINE' | 'VYTHERA OFFLINE' | 'VYTHERA LOCAL ONLY';

export async function resolveServiceUiStatus(): Promise<{
  label: VytheraServiceUiStatus;
  api: 'ok' | 'down' | 'unconfigured';
  inference: 'ok' | 'down' | 'unknown';
  storage: 'ok' | 'down' | 'unknown';
}> {
  if (!onlineConfigured(loadOnlineSettings())) {
    return { label: 'VYTHERA LOCAL ONLY', api: 'unconfigured', inference: 'unknown', storage: 'unknown' };
  }
  try {
    vytheraOnline.refreshSettings();
    const health = await vytheraOnline.health();
    return {
      label: health.status === 'ok' || health.status === 'degraded' ? 'VYTHERA ONLINE' : 'VYTHERA OFFLINE',
      api: health.services.api === 'ok' ? 'ok' : 'down',
      inference: health.services.inference === 'ok' ? 'ok' : health.services.inference === 'down' ? 'down' : 'unknown',
      storage: health.services.storage === 'ok' ? 'ok' : health.services.storage === 'down' ? 'down' : 'unknown',
    };
  } catch {
    return { label: 'VYTHERA OFFLINE', api: 'down', inference: 'unknown', storage: 'unknown' };
  }
}
`,
);

w(
  'index.ts',
  `export * from './privacy/classification';
export * from './privacy/gate';
export * from './settings/onlineSettings';
export * from './client/VytheraOnlineClient';
export * from './ai/VytheraOnlineInferenceProvider';
export * from './ai/VytheraAIRouter';
export * from './models/types';
export * from './status/serviceStatus';
`,
);

w(
  'privacy/privacy.test.ts',
  `import {
  assertPublishableMetadata,
  canSendToOnline,
  classifyOutboundPayload,
} from './classification';
import { evaluateOnlineGate } from './gate';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

assert(classifyOutboundPayload({ kind: 'text' }) === 'LOCAL_ONLY', 'text defaults LOCAL_ONLY');
assert(classifyOutboundPayload({ kind: 'mod' }) === 'PRIVATE', 'mod defaults PRIVATE');
assert(
  classifyOutboundPayload({ kind: 'mod', userMarkedPublishable: true }) === 'PUBLISHABLE',
  'publishable mod',
);
assert(
  classifyOutboundPayload({ kind: 'text', containsLocalPaths: true }) === 'PRIVATE',
  'paths => PRIVATE',
);

const denyPrivate = canSendToOnline('PRIVATE', { onlineEnabled: true, userConsentOnline: true });
assert(!denyPrivate.allowed, 'PRIVATE never online');

const denyLocal = canSendToOnline('LOCAL_ONLY', { onlineEnabled: true, userConsentOnline: false });
assert(!denyLocal.allowed, 'LOCAL_ONLY needs consent');

const allowLocal = canSendToOnline('LOCAL_ONLY', { onlineEnabled: true, userConsentOnline: true });
assert(allowLocal.allowed, 'LOCAL_ONLY with consent');

const metaErrs = assertPublishableMetadata({ datasetPath: 'C:\\\\data' });
assert(metaErrs.length > 0, 'reject datasetPath');

const blocked = evaluateOnlineGate({
  kind: 'text',
  text: 'see C:\\\\Users\\\\me\\\\secret.png',
  onlineEnabled: true,
  allowOnlineForSafeLocal: true,
});
assert(!blocked.allowed, 'path in text blocked');

const ok = evaluateOnlineGate({
  kind: 'text',
  text: 'What biome is this?',
  onlineEnabled: true,
  allowOnlineForSafeLocal: true,
});
assert(ok.allowed, 'safe chat allowed');

console.log('online privacy tests: ok');
`,
);


console.log('phase2 client/ai done');
