import { lsGet, lsSet } from '../util/safeStorage';

/** Local-only settings for VYTHERA AI. */

const KEY = 'vythera.ai.settings';

export interface VytheraAISettings {
  backendHost: string;
  backendPort: number;
  activeModel: string;
  /** Separate from chat model — never assume text model can see images. */
  activeVisionModel: string;
  /** Vision stack id: ollama | daemon-vlm | transformers-vision | onnx-vision */
  activeVisionBackend: string;
  maxAgentSteps: number;
  maxToolCalls: number;
  requestTimeoutMs: number;
  maxRetries: number;
  temperature: number;
  debug: boolean;
  /** ON by default — redact UI paths/IPs; core secret redaction always on. */
  privacyMode: boolean;
  /** Explicit opt-in for verbose diagnostics (never default). */
  developerDiagnostics: boolean;
}

export const VYTHERA_AI_DEFAULTS: VytheraAISettings = {
  backendHost: '127.0.0.1',
  backendPort: 11434,
  activeModel: '',
  activeVisionModel: '',
  activeVisionBackend: 'daemon-vlm',
  maxAgentSteps: 8,
  maxToolCalls: 12,
  requestTimeoutMs: 180_000,
  maxRetries: 2,
  temperature: 0.4,
  debug: false,
  privacyMode: true,
  developerDiagnostics: false,
};

const LOCAL = new Set(['127.0.0.1', 'localhost', '::1']);

export function assertVytheraLocalHost(host: string): void {
  const raw = host.trim();
  if (!raw || /^https?:\/\//i.test(raw)) {
    throw new Error('VYTHERA AI BLOCKED — Non-local backend rejected');
  }
  const h = raw.toLowerCase().replace(/^\[|\]$/g, '');
  if (h.includes('/') || (h.includes(':') && h !== '::1')) {
    throw new Error('VYTHERA AI BLOCKED — Non-local backend rejected');
  }
  if (!LOCAL.has(h)) {
    throw new Error('VYTHERA AI BLOCKED — Non-local backend rejected');
  }
}

export function sanitizeVytheraHost(host: string): string {
  assertVytheraLocalHost(host);
  return '127.0.0.1';
}

export function vytheraOllamaBaseUrl(s: VytheraAISettings = loadVytheraAISettings()): string {
  sanitizeVytheraHost(s.backendHost);
  if (typeof window !== 'undefined' && import.meta.env?.DEV) return '/ollama';
  return `http://127.0.0.1:${s.backendPort || 11434}`;
}

export function loadVytheraAISettings(): VytheraAISettings {
  try {
    const raw = lsGet(KEY);
    if (!raw) return { ...VYTHERA_AI_DEFAULTS };
    const p = JSON.parse(raw) as Partial<VytheraAISettings>;
    let host = typeof p.backendHost === 'string' ? p.backendHost : VYTHERA_AI_DEFAULTS.backendHost;
    try {
      host = sanitizeVytheraHost(host);
    } catch {
      return { ...VYTHERA_AI_DEFAULTS };
    }
    return {
      ...VYTHERA_AI_DEFAULTS,
      ...p,
      backendHost: host,
      backendPort: typeof p.backendPort === 'number' ? p.backendPort : VYTHERA_AI_DEFAULTS.backendPort,
      maxAgentSteps: Math.max(1, Math.min(16, p.maxAgentSteps ?? VYTHERA_AI_DEFAULTS.maxAgentSteps)),
      maxToolCalls: Math.max(1, Math.min(24, p.maxToolCalls ?? VYTHERA_AI_DEFAULTS.maxToolCalls)),
      maxRetries: Math.max(0, Math.min(2, p.maxRetries ?? VYTHERA_AI_DEFAULTS.maxRetries)),
    };
  } catch {
    return { ...VYTHERA_AI_DEFAULTS };
  }
}

export function saveVytheraAISettings(s: VytheraAISettings): void {
  saveVytheraAISettingsRaw({ ...s, backendHost: sanitizeVytheraHost(s.backendHost) });
}

function saveVytheraAISettingsRaw(s: VytheraAISettings): void {
  lsSet(KEY, JSON.stringify(s));
}
