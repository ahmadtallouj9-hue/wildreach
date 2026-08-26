import { vytheraOnline } from '../client/VytheraOnlineClient';
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
    const online = health.status === 'ok' || health.status === 'degraded';
    return {
      label: online ? 'VYTHERA ONLINE' : 'VYTHERA OFFLINE',
      api: health.services.api === 'ok' ? 'ok' : 'down',
      inference:
        health.services.inference === 'ok'
          ? 'ok'
          : health.services.inference === 'disabled'
            ? 'unknown'
            : 'down',
      storage: health.services.storage === 'ok' ? 'ok' : 'down',
    };
  } catch {
    return { label: 'VYTHERA OFFLINE', api: 'down', inference: 'unknown', storage: 'unknown' };
  }
}
