import {
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
    paths: /[A-Za-z]:\\|\/home\/|\/Users\/|\.vythera[\\/]/.test(text),
    secrets: /api[_-]?key|password\s*=|bearer\s+[a-z0-9]|jwt_secret|sk-[a-z0-9]{10,}/i.test(text),
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
