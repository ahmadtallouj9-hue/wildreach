import fs from 'fs';
import path from 'path';

const root = process.cwd();
const online = path.join(root, 'src', 'online');

function rmrf(p) {
  if (!fs.existsSync(p)) return;
  for (const n of fs.readdirSync(p)) {
    const fp = path.join(p, n);
    if (fs.statSync(fp).isDirectory()) rmrf(fp);
    else fs.unlinkSync(fp);
  }
  fs.rmdirSync(p);
}

rmrf(online);
fs.mkdirSync(online, { recursive: true });

function w(rel, body) {
  const abs = path.join(online, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
  console.log('wrote', rel);
}

w(
  'privacy/classification.ts',
  `/** Privacy classifications for hybrid VYTHERA. */
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
  for (const re of PRIVATE_MARKERS) if (re.test(labels)) return 'PRIVATE';
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
    return { allowed: false, classification, reason: 'Online services are disabled in settings.' };
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
          'LOCAL_ONLY data stays on this computer unless Online AI is enabled and AI mode allows it.',
      };
    }
    return { allowed: true, classification };
  }
  if (classification === 'PUBLISHABLE' || classification === 'PUBLIC') {
    return { allowed: true, classification };
  }
  return { allowed: false, classification, reason: 'Unknown classification — default deny.' };
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
  'privacy/gate.ts',
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
  allowOnlineForSafeLocal: boolean;
  metadata?: Record<string, unknown>;
};

function probe(text: string): { paths: boolean; secrets: boolean } {
  return {
    paths: /[A-Za-z]:\\\\|\\/home\\/|\\/Users\\/|\\.vythera[\\\\/]/.test(text),
    secrets: /api[_-]?key|password\\s*=|bearer\\s+[a-z0-9]|jwt_secret|sk-[a-z0-9]{10,}/i.test(text),
  };
}

export function evaluateOnlineGate(req: OnlineGateRequest): PrivacyDecision {
  const p = probe(req.text ?? '');
  const classification = classifyOutboundPayload({
    kind: req.kind,
    labels: req.labels,
    explicitClass: req.explicitClass,
    containsLocalPaths: p.paths,
    containsSecrets: p.secrets,
    userMarkedPublishable: req.explicitClass === 'PUBLISHABLE' || req.explicitClass === 'PUBLIC',
  });
  if ((req.kind === 'model' || req.kind === 'mod' || req.kind === 'metadata') && req.metadata) {
    const errs = assertPublishableMetadata(req.metadata);
    if (errs.length) return { allowed: false, classification: 'PRIVATE', reason: errs[0]! };
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

const storagePath = path.join(root, 'src/vythera_ai/util/safeStorage.ts');
const storage = fs.readFileSync(storagePath, 'utf8');
const getName = /export function (\w+)\(key: string\): string \| null/.exec(storage)?.[1] ?? 'lsGet';
const setName = /export function (\w+)\(key: string, value: string\)/.exec(storage)?.[1] ?? 'lsSet';
console.log('storage exports', getName, setName);

w(
  'settings/onlineSettings.ts',
  `import { ${getName}, ${setName} } from '../../vythera_ai/util/safeStorage';

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
    const raw = ${getName}(KEY);
    if (!raw) return { ...VYTHERA_ONLINE_DEFAULTS };
    const p = JSON.parse(raw) as Partial<VytheraOnlineSettings>;
    return {
      ...VYTHERA_ONLINE_DEFAULTS,
      apiBaseUrl: sanitizeBaseUrl(typeof p.apiBaseUrl === 'string' ? p.apiBaseUrl : ''),
      aiMode: p.aiMode === 'ONLINE' || p.aiMode === 'AUTO' || p.aiMode === 'LOCAL' ? p.aiMode : 'LOCAL',
      modHubMode: p.modHubMode === 'ONLINE' ? 'ONLINE' : 'OFFLINE',
      dataSharing:
        p.dataSharing === 'PUBLISHABLE' || p.dataSharing === 'PUBLIC' || p.dataSharing === 'PRIVATE'
          ? p.dataSharing
          : 'PRIVATE',
      cloudAiEnabled: p.cloudAiEnabled === true,
      accessToken: typeof p.accessToken === 'string' ? p.accessToken.slice(0, 2048) : '',
    };
  } catch {
    return { ...VYTHERA_ONLINE_DEFAULTS };
  }
}

export function saveOnlineSettings(s: VytheraOnlineSettings): void {
  ${setName}(
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

console.log('phase1 done');
