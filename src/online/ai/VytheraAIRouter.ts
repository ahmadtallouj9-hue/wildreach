import type { VytheraChatMessage, VytheraInferenceBackend } from '../../vythera_ai/inference/VytheraInferenceBackend';
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

  setLocalBackend(backend: VytheraInferenceBackend): void {
    this.localBackend = backend;
  }

  setOnlineProvider(provider: VytheraOnlineInferenceProvider | null): void {
    this.online = provider;
  }

  ensureOnlineFromSettings(s: VytheraOnlineSettings = loadOnlineSettings()): void {
    if (s.apiBaseUrl && onlineAiAllowed(s)) {
      this.online = new HttpVytheraOnlineInferenceProvider(s.apiBaseUrl, () => loadOnlineSettings().accessToken);
    } else {
      this.online = null;
    }
  }

  async chat(messages: VytheraOnlineChatMessage[], opts?: { model?: string }): Promise<RouterChatResult> {
    const settings = loadOnlineSettings();
    const userText = messages
      .filter((m) => m.role === 'user')
      .map((m) => m.content)
      .join('\n');
    const localOk = await this.localBackend.isAvailable().catch(() => false);
    const asLocal = messages as VytheraChatMessage[];

    if (settings.aiMode === 'LOCAL' || !onlineAiAllowed(settings)) {
      if (!localOk) throw new Error('Local AI unavailable. Online AI is disabled.');
      return {
        text: await this.localBackend.generate({ model: opts?.model || '', messages: asLocal }),
        route: 'local',
      };
    }

    if (settings.aiMode === 'ONLINE') {
      const gate = evaluateOnlineGate({
        kind: 'text',
        text: userText,
        onlineEnabled: true,
        allowOnlineForSafeLocal: true,
        explicitClass: 'LOCAL_ONLY',
      });
      if (!gate.allowed) throw new Error(gate.reason);
      if (!this.online) throw new Error('Online AI provider not configured.');
      return { text: await this.online.chat(messages, { model: opts?.model }), route: 'online' };
    }

    if (localOk) {
      return {
        text: await this.localBackend.generate({ model: opts?.model || '', messages: asLocal }),
        route: 'local',
      };
    }

    const gate = evaluateOnlineGate({
      kind: 'text',
      text: userText,
      onlineEnabled: onlineAiAllowed(settings),
      allowOnlineForSafeLocal: true,
      explicitClass: 'LOCAL_ONLY',
    });
    if (!gate.allowed) {
      throw new Error(`${gate.reason} Local AI is offline; private/local-only content was not sent online.`);
    }
    if (!this.online) throw new Error('Local AI offline and Online AI is not configured.');
    return {
      text: await this.online.chat(messages, { model: opts?.model }),
      route: 'online',
      reason: 'local_unavailable_safe_fallback',
    };
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
        kind: 'image',
        text: prompt,
        onlineEnabled: true,
        allowOnlineForSafeLocal: true,
        explicitClass: classification,
      });
      if (!gate.allowed) throw new Error(gate.reason);
      if (!this.online) throw new Error('Online AI provider not configured.');
      return { text: await this.online.vision(prompt, image, { model: opts?.model }), route: 'online' };
    }

    if (localVision) {
      try {
        return { text: await localVision(prompt, image), route: 'local' };
      } catch {
        /* fallthrough */
      }
    }

    const gate = evaluateOnlineGate({
      kind: 'image',
      text: prompt,
      onlineEnabled: onlineAiAllowed(settings),
      allowOnlineForSafeLocal: true,
      explicitClass: classification,
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
