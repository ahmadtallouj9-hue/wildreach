/** Privacy classifications for hybrid VYTHERA. */
export type VytheraDataClass = 'PRIVATE' | 'LOCAL_ONLY' | 'PUBLISHABLE' | 'PUBLIC';

export type PrivacyDecision =
  | { allowed: true; classification: VytheraDataClass }
  | { allowed: false; classification: VytheraDataClass; reason: string };

const PRIVATE_MARKERS = [
  /dataset/i,
  /training[_-]?data/i,
  /adapter[_-]?private/i,
  /unpublished/i,
  /\.vythera[\\/]/i,
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
  if (/[A-Za-z]:\\/.test(blob) || /\/home\/|\/Users\//.test(blob)) {
    errors.push('Metadata must not include filesystem paths.');
  }
  if (/127\.0\.0\.1|192\.168\.|10\.\d|172\.(1[6-9]|2\d|3[0-1])\./.test(blob)) {
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
