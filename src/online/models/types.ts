export type PublishedModelModality = 'TEXT' | 'VISION_LANGUAGE';

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
  if (!/^\d+\.\d+\.\d+[a-z0-9.-]*$/i.test(version)) errors.push('Semver-like version required.');
  const modality = raw.modality === 'VISION_LANGUAGE' ? 'VISION_LANGUAGE' : 'TEXT';
  const baseModel = String(raw.baseModel ?? '').trim().slice(0, 120);
  if (!baseModel) errors.push('Base model attribution required.');
  const adapterVersion = String(raw.adapterVersion ?? '').trim().slice(0, 64) || version;
  const description = String(raw.description ?? '').trim().slice(0, 2000);
  const license = String(raw.license ?? '').trim().slice(0, 120) || 'Proprietary';
  const creator = String(raw.creator ?? '').trim().slice(0, 64) || 'unknown';
  const probe = JSON.stringify(raw);
  if (/[A-Za-z]:\\|\/home\/|\/Users\/|dataset|train\.jsonl|127\.0\.0\.1/i.test(probe)) {
    errors.push('Publish payload must not include private paths, datasets, or loopback hosts.');
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    record: { id, name, version, modality, baseModel, adapterVersion, description, license, creator },
    artifactBase64: raw.artifactBase64,
  };
}
