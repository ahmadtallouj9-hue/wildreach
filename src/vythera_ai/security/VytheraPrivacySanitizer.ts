/**
 * Local privacy redaction for VYTHERA AI user-facing strings and payloads.
 * Core secrets stay protected even if Privacy Mode UI is toggled off.
 */

/** Always applied — not gated on Privacy Mode. */
const ALWAYS = true;

const IPV4 =
  /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d{1,2})\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d{1,2})(?::\d{1,5})?\b/g;
const IPV6 =
  /\b(?:\[)?(?:[0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}(?:\](?::\d{1,5})?|:)\b/g;
const LOOPBACK_SERVICE = /\b(?:127\.0\.0\.1|localhost|\[::1\])(?::\d{1,5})?\b/gi;
const WIN_USER_PATH = /\b[A-Za-z]:\\Users\\[^\\\s"']+(?:\\[^\s"']*)*/gi;
const UNIX_HOME = /\/(?:home|Users)\/[^/\s"']+(?:\/[^\s"']*)*/g;
const UNC_PATH = /\\\\[^\s"'\\]+(?:\\[^\s"']*)+/g;
const DEVICE_ID = /\b(?:device[_-]?id|android[_-]?id|advertising[_-]?id)\s*[:=]\s*['"]?[^\s'"]+/gi;
const USERNAME_EQ = /\b(?:username|user(?:name)?|hostname|computername)\s*[:=]\s*['"]?[^\s'"]+/gi;
const BEARER = /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi;
const API_KEY_SK = /\bsk-[A-Za-z0-9]{8,}\b/g;
const API_KEY_GENERIC = /\b(?:api[_-]?key|access[_-]?token|secret[_-]?key)\s*[:=]\s*['"]?[^\s'"]+/gi;
const PASSWORD = /\b(?:password|passwd|pwd)\s*[:=]\s*['"]?[^\s'"]+/gi;
const TOKEN_EQ = /\b(?:token|auth|authorization|cookie|session)\s*[:=]\s*['"]?[^\s'"]+/gi;
const PRIVATE_KEY = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;
const CONNECTION =
  /\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|amqp):\/\/[^\s'"]+/gi;
const ENV_SECRET = /\b(?:AWS_|AZURE_|GCP_|OPENAI_|HF_|GITHUB_|NPM_)[A-Z0-9_]{2,}\s*[:=]\s*['"]?[^\s'"]+/gi;

export type PrivacySanitizeOpts = {
  /** When true (default), aggressive path/IP hiding for UI. */
  privacyMode?: boolean;
};

export function sanitizeForDisplay(input: string, opts: PrivacySanitizeOpts = {}): string {
  if (!input || typeof input !== 'string') return input;
  const privacy = opts.privacyMode !== false;
  let s = input;

  // Loopback services → friendly label (always — UI must not show 127.0.0.1:8791)
  if (ALWAYS) {
    s = s.replace(LOOPBACK_SERVICE, 'LOCAL SERVICE');
  }

  s = s.replace(IPV4, '[REDACTED]');
  s = s.replace(IPV6, '[REDACTED]');
  s = s.replace(BEARER, '[REDACTED]');
  s = s.replace(API_KEY_SK, '[REDACTED]');
  s = s.replace(API_KEY_GENERIC, '[REDACTED]');
  s = s.replace(PASSWORD, '[REDACTED]');
  s = s.replace(TOKEN_EQ, '[REDACTED]');
  s = s.replace(PRIVATE_KEY, '[REDACTED]');
  s = s.replace(CONNECTION, '[REDACTED]');
  s = s.replace(ENV_SECRET, '[REDACTED]');
  s = s.replace(DEVICE_ID, '[REDACTED]');
  s = s.replace(USERNAME_EQ, '[REDACTED]');

  if (privacy) {
    s = s.replace(WIN_USER_PATH, '[LOCAL PATH]');
    s = s.replace(UNIX_HOME, '[LOCAL PATH]');
    s = s.replace(UNC_PATH, '[LOCAL PATH]');
    // Generic drive paths under user-ish folders
    s = s.replace(/\b[A-Za-z]:\\[^\s"']+/g, (m) => {
      if (/\\(?:Users|Documents|Downloads|Desktop|AppData)\\/i.test(m)) return '[LOCAL PATH]';
      // Keep short project-relative looking paths that are already relative
      if (m.length > 40) return '[LOCAL PATH]';
      return m;
    });
  }

  return s;
}

/** Safe error for UI / client JSON. */
export function sanitizeUserFacingError(err: unknown, fallback = 'LOCAL SERVICE ERROR'): string {
  const raw = err instanceof Error ? err.message : String(err ?? fallback);
  const s = sanitizeForDisplay(raw, { privacyMode: true });
  if (/ECONNREFUSED|ENOTFOUND|fetch failed|network/i.test(raw)) {
    return 'LOCAL TRAINING SERVICE UNAVAILABLE';
  }
  if (/EADDRINUSE/i.test(raw)) {
    return 'LOCAL TRAINING SERVICE ALREADY RUNNING';
  }
  if (/LOCAL VISION MODEL NOT INSTALLED|LOCAL MODEL/i.test(s)) return s;
  // Avoid dumping stack-like paths
  if (s.length > 240) return s.slice(0, 240) + '…';
  return s || fallback;
}

export function sanitizeCapabilityLines(lines: string[]): string[] {
  return lines.map((l) => {
    let s = sanitizeForDisplay(l, { privacyMode: true });
    s = s.replace(/\((?:LOCAL SERVICE|[^)]*python[^)]*)\)/gi, '');
    s = s.replace(/Python:\s*OK\s*([\d.]+).*/i, 'Python: OK $1');
    s = s.replace(/Trainer:\s*OK\s*\([^)]*\)/i, 'Trainer: OK');
    s = s.replace(/VLM trainer\s+PASS\s+.*/i, 'VLM trainer            PASS');
    s = s.replace(/Output directory\s+PASS\s+.*/i, 'Output directory       PASS');
    return s.trim();
  });
}

/** Strip absolute paths / network fields from capability JSON sent to browsers. */
export function sanitizeCapabilityPayload<T extends Record<string, unknown>>(cap: T): T {
  const clone = JSON.parse(JSON.stringify(cap)) as Record<string, unknown>;
  const py = clone.python as Record<string, unknown> | undefined;
  if (py) {
    if (typeof py.executable === 'string') py.executable = 'LOCAL_VENV';
    if (typeof py.venvPath === 'string') py.venvPath = 'LOCAL_VENV';
  }
  const trainer = clone.trainer as Record<string, unknown> | undefined;
  if (trainer && typeof trainer.path === 'string') trainer.path = 'LOCAL_TRAINER';
  if (Array.isArray(clone.lines)) {
    clone.lines = sanitizeCapabilityLines(clone.lines as string[]);
  }
  if (typeof clone.reason === 'string') {
    clone.reason = sanitizeForDisplay(clone.reason, { privacyMode: true });
  }
  // Never include serials / GUIDs if present
  for (const k of Object.keys(clone)) {
    if (/serial|guid|uuid|mac|hostname|username|productId/i.test(k)) delete clone[k];
  }
  return clone as T;
}

export function sanitizeManifestForPersist(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const allow = new Set([
    'type',
    'status',
    'datasetVersion',
    'modality',
    'model',
    'baseModel',
    'adapterPath',
    'adapter',
    'task',
    'taskType',
    'timestamp',
    'completedAt',
    'promotedAt',
    'metrics',
    'trainingSteps',
    'epochs',
    'trainLoss',
    'validationLoss',
    'method',
    'provider',
    'schemaVersion',
    'trainCount',
    'validationCount',
    'heldOutCount',
    'imageFileCount',
    'taskTypes',
    'sampleHashes',
    'sourceImageHashes',
    'vlmType',
    'textOnly',
    'createdAt',
    'loraTargets',
    'evaluationSamples',
    'configuration',
    'name',
    'jobId',
    'evaluationScore',
    'trainingMethod',
  ]);
  for (const [k, v] of Object.entries(obj)) {
    if (!allow.has(k) && /path|host|ip|user|home|env|serial|mac|cookie|token|key|password/i.test(k)) {
      continue;
    }
    if (typeof v === 'string') {
      out[k] = sanitizeForDisplay(v, { privacyMode: true });
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = sanitizeManifestForPersist(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  // Prefer relative adapter label over absolute path
  if (typeof out.adapterPath === 'string' && /[\\/]/.test(out.adapterPath as string)) {
    const parts = String(out.adapterPath).split(/[/\\]/);
    out.adapterPath = parts[parts.length - 1] || 'LOCAL_ADAPTER';
  }
  return out;
}

/** Classify a string for the security auditor (no secret echoed). */
export function classifySecretPattern(line: string): string | null {
  if (PRIVATE_KEY.test(line)) return 'PRIVATE_KEY';
  PRIVATE_KEY.lastIndex = 0;
  if (BEARER.test(line)) return 'BEARER_TOKEN';
  BEARER.lastIndex = 0;
  if (API_KEY_SK.test(line)) return 'API_KEY';
  API_KEY_SK.lastIndex = 0;
  if (PASSWORD.test(line)) return 'PASSWORD';
  PASSWORD.lastIndex = 0;
  if (CONNECTION.test(line)) return 'CONNECTION_STRING';
  CONNECTION.lastIndex = 0;
  if (ENV_SECRET.test(line)) return 'ENV_SECRET';
  ENV_SECRET.lastIndex = 0;
  // Skip loopback-only IPs in source (allowed as bind config) — flag non-loopback
  const ips = line.match(IPV4);
  if (ips) {
    for (const ip of ips) {
      const host = ip.split(':')[0]!;
      if (host !== '127.0.0.1' && host !== '0.0.0.0') return 'IP_ADDRESS';
      if (host === '0.0.0.0') return 'BIND_ALL_INTERFACES';
    }
  }
  return null;
}

export const PRIVACY_SAFE_STATUS = {
  trainingOnline: 'LOCAL TRAINING\nREADY',
  trainingOffline: 'LOCAL TRAINING SERVICE\nOFFLINE',
  visionConnected: 'LOCAL VISION\nCONNECTED',
  visionOffline: 'LOCAL VISION\nOFFLINE',
  modelActive: 'LOCAL MODEL\nACTIVE',
  daemonLabel: 'LOCAL TRAINING DAEMON',
  ollamaLabel: 'LOCAL CHAT SERVICE',
} as const;
