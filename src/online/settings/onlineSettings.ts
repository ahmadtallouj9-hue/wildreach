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
  const t = raw.trim().replace(/\/+$/, '');
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
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}`;
  } catch {
    return '';
  }
}

export function loadOnlineSettings(): VytheraOnlineSettings {
  try {
    const raw = lsGet(KEY);
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
