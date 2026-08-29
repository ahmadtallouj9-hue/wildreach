/**
 * Rewrite hybrid online modules to a single consistent API, then emit
 * server/online, tests, UI wiring helpers, and deployment docs.
 */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
function w(rel, body) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
  console.log('wrote', rel);
}

// ── privacy ───────────────────────────────────────────────
w(
  'src/online/privacy/classification.ts',
  `/** Hybrid privacy classifications — PRIVATE/LOCAL_ONLY never auto-upload. */

export type VytheraDataClass = 'PRIVATE' | 'LOCAL_ONLY' | 'PUBLISHABLE' | 'PUBLIC';

export type PrivacyDecision =
  | { allowed: true; classification: VytheraDataClass }
  | { allowed: false; classification: VytheraDataClass; reason: string };

const PRIVATE_MARKERS = [
  /dataset/i,
  /training[_-]?data/i,
  /adapter[_-]?private/i,
  /unpublished/i,
  /\\.vythera[\\\\/]/i,
  /local[_-]?only/i,
  /private[_-]?adapter/i,
];

export function classifyOutboundPayload(input: {
  kind: 'text' | 'image' | 'mod' | 'model' | 'metadata';
  labels?: string[];
  explicitClass?: VytheraDataClass;
  containsLocalPaths?: boolean;
  containsSecrets?: boolean;
  userMarkedPublishable?: boolean;
}): VytheraDataClass {
  if (input.explicitClass) return input.explicitClass;
  if (input.containsLocalPaths || input.containsSecrets) return 'PRIVATE';
  const labels = (input.labels ?? []).join(' ');
  for (const re of PRIVATE_MARKERS) {
    if (re.test(labels)) return 'PRIVATE';
  }
  if (input.kind === 'mod' || input.kind === 'model') {
    return input.userMarkedPublishable ? 'PUBLISHABLE' : 'PRIVATE';
  }
  if (input.kind === 'metadata' && input.userMarkedPublishable) return 'PUBLISHABLE';
  if (input.kind === 'text' || input.kind === 'image') return 'LOCAL_ONLY';
  return 'PRIVATE';
}

export function canSendToOnline(
  classification: VytheraDataClass,
  opts?: { onlineEnabled?: boolean; userConsentOnline?: boolean },
): PrivacyDecision {
  if (!opts?.onlineEnabled) {
    return {
      allowed: false,
      classification,
      reason: 'Online services are disabled in settings.',
    };
  }
  if (classification === 'PRIVATE') {
    return {
      allowed: false,
      classification,
      reason: 'PRIVATE data cannot be uploaded to VYTHERA Online.',
    };
  }
  if (classification === 'LOCAL_ONLY') {
    if (!opts.userConsentOnline) {
      return {
        allowed: false,
        classification,
        reason:
          'LOCAL_ONLY data stays on this computer unless AI mode is ONLINE (or AUTO with a safe fallback) and Online AI is enabled.',
      };
    }
    return { allowed: true, classification };
  }
  if (classification === 'PUBLISHABLE' || classification === 'PUBLIC') {
    return { allowed: true, classification };
  }
  return {
    allowed: false,
    classification,
    reason: 'Unknown classification — default deny.',
  };
}

export function assertPublishableMetadata(meta: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const blob = JSON.stringify(meta);
  if (/[A-Za-z]:\\\\/.test(blob) || /\\/home\\/|\\/Users\\//.test(blob)) {
    errors.push('Metadata must not include filesystem paths.');
  }
  if (/127\\.0\\.0\\.1|192\\.168\\.|10\\.\\d|172\\.(1[6-9]|2\\d|3[0-1])\\./.test(blob)) {
    errors.push('Metadata must not include private network addresses.');
  }
  if (/api[_-]?key|password|jwt|token|secret/i.test(blob)) {
    errors.push('Metadata must not include credentials or secrets.');
  }
  if (meta.datasetPath || meta.localAdapterPath || meta.trainingLogPath) {
    errors.push('Private training fields are not publishable.');
  }
  return errors;
}
`,
);

w(
  'src/online/privacy/gate.ts',
  `import {
  assertPublishableMetadata,
  canSendToOnline,
  classifyOutboundPayload,
  type PrivacyDecision,
  type VytheraDataClass,
} from './classification';

export type OnlineGateRequest = {
  kind: 'text' | 'image' | 'mod' | 'model' | 'metadata';
  labels?: string[];
  explicitClass?: VytheraDataClass;
  text?: string;
  onlineEnabled: boolean;
  /** True for explicit ONLINE mode, or AUTO safe fallback after local failure. */
  allowOnlineForSafeLocal: boolean;
  metadata?: Record<string, unknown>;
};

function looksLikePathOrSecret(text: string): { paths: boolean; secrets: boolean } {
  const paths = /[A-Za-z]:\\\\|\\/home\\/|\\/Users\\/|\\.vythera[\\\\/]/.test(text);
  const secrets =
    /api[_-]?key|password\\s*=|bearer\\s+[a-z0-9]|jwt_secret|sk-[a-z0-9]{10,}/i.test(text);
  return { paths, secrets };
}

export function evaluateOnlineGate(req: OnlineGateRequest): PrivacyDecision {
  const probe = looksLikePathOrSecret(req.text ?? '');
  const classification = classifyOutboundPayload({
    kind: req.kind,
    labels: req.labels,
    explicitClass: req.explicitClass,
    containsLocalPaths: probe.paths,
    containsSecrets: probe.secrets,
    userMarkedPublishable:
      req.explicitClass === 'PUBLISHABLE' || req.explicitClass === 'PUBLIC',
  });

  if ((req.kind === 'model' || req.kind === 'mod' || req.kind === 'metadata') && req.metadata) {
    const metaErrs = assertPublishableMetadata(req.metadata);
    if (metaErrs.length) {
      return { allowed: false, classification: 'PRIVATE', reason: metaErrs[0]! };
    }
  }

  return canSendToOnline(classification, {
    onlineEnabled: req.onlineEnabled,
    userConsentOnline: req.allowOnlineForSafeLocal,
  });
}

export {
  assertPublishableMetadata,
  canSendToOnline,
  classifyOutboundPayload,
  type PrivacyDecision,
  type VytheraDataClass,
};
`,
);

w(
  'src/online/settings/onlineSettings.ts',
  `/** Client settings for VYTHERA Online — separate from local Ollama loopback. */
import { lsGet, lsSet } from '../../vythera_ai/util/safeStorage';

export type VytheraAIMode = 'LOCAL' | 'ONLINE' | 'AUTO';
export type VytheraModHubMode = 'ONLINE' | 'OFFLINE';
export type VytheraDataSharing = 'PRIVATE' | 'PUBLISHABLE' | 'PUBLIC';

export interface VytheraOnlineSettings {
  apiBaseUrl: string;
  aiMode: VytheraAIMode;
  modHubMode: VytheraModHubMode;
  dataSharing: VytheraDataSharing;
  cloudAiEnabled: boolean;
  accessToken: string;
}

const KEY = 'vythera.online.settings.v1';

export const VYTHERA_ONLINE_DEFAULTS: VytheraOnlineSettings = {
  apiBaseUrl: '',
  aiMode: 'LOCAL',
  modHubMode: 'OFFLINE',
  dataSharing: 'PRIVATE',
  cloudAiEnabled: false,
  accessToken: '',
};

function sanitizeBaseUrl(raw: string): string {
  const t = raw.trim().replace(/\\/+$/, '');
  if (!t) return '';
  try {
    const u = new URL(t);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    if (
      (u.hostname === '127.0.0.1' || u.hostname === 'localhost') &&
      (u.port === '11434' || u.port === '8791')
    ) {
      return '';
    }
    return \`\${u.protocol}//\${u.host}\${u.pathname.replace(/\\/+$/, '')}\`;
  } catch {
    return '';
  }
}

export function loadOnlineSettings(): VytheraOnlineSettings {
  try {
    const raw = lsGet(KEY);
    if (!raw) return { ...VYTHERA_ONLINE_DEFAULTS };
    const p = JSON.parse(raw) as Partial<VytheraOnlineSettings>;
    const aiMode =
      p.aiMode === 'ONLINE' || p.aiMode === 'AUTO' || p.aiMode === 'LOCAL' ? p.aiMode : 'LOCAL';
    const modHubMode = p.modHubMode === 'ONLINE' ? 'ONLINE' : 'OFFLINE';
    const dataSharing =
      p.dataSharing === 'PUBLISHABLE' || p.dataSharing === 'PUBLIC' || p.dataSharing === 'PRIVATE'
        ? p.dataSharing
        : 'PRIVATE';
    return {
      ...VYTHERA_ONLINE_DEFAULTS,
      apiBaseUrl: sanitizeBaseUrl(typeof p.apiBaseUrl === 'string' ? p.apiBaseUrl : ''),
      aiMode,
      modHubMode,
      dataSharing,
      cloudAiEnabled: p.cloudAiEnabled === true,
      accessToken: typeof p.accessToken === 'string' ? p.accessToken.slice(0, 2048) : '',
    };
  } catch {
    return { ...VYTHERA_ONLINE_DEFAULTS };
  }
}

export function saveOnlineSettings(s: VytheraOnlineSettings): void {
  lsSet(
    KEY,
    JSON.stringify({
      ...s,
      apiBaseUrl: sanitizeBaseUrl(s.apiBaseUrl),
      accessToken: s.accessToken.slice(0, 2048),
    }),
  );
}

export function onlineConfigured(s: VytheraOnlineSettings = loadOnlineSettings()): boolean {
  return Boolean(s.apiBaseUrl);
}

export function onlineAiAllowed(s: VytheraOnlineSettings = loadOnlineSettings()): boolean {
  return onlineConfigured(s) && s.cloudAiEnabled && (s.aiMode === 'ONLINE' || s.aiMode === 'AUTO');
}
`,
);

console.log('privacy+settings done');
