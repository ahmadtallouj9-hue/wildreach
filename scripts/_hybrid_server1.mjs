/**
 * Emit server/online — public VYTHERA Online API (separate from home PC / Ollama / training).
 * Default bind: 127.0.0.1 for local online-service development.
 * Production: set VYTHERA_ONLINE_HOST=0.0.0.0 only on a cloud VPS (never on the private PC for AI).
 */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const base = path.join(root, 'server', 'online');

function w(rel, body) {
  const abs = path.join(base, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
  console.log('wrote', path.relative(root, abs));
}

w(
  'config.ts',
  `import path from 'node:path';

export type OnlineConfig = {
  host: string;
  port: number;
  dataDir: string;
  jwtSecret: string;
  corsOrigins: string[];
  rateLimitPerMinute: number;
  maxBodyBytes: number;
  maxImageBytes: number;
  inferenceEnabled: boolean;
  inferenceModality: Array<'TEXT' | 'VISION_LANGUAGE'>;
};

function env(name: string, fallback = ''): string {
  return (process.env[name] ?? fallback).trim();
}

export function loadOnlineConfig(): OnlineConfig {
  const host = env('VYTHERA_ONLINE_HOST', '127.0.0.1');
  // Refuse accidental all-interface bind without explicit opt-in flag.
  if (host === '0.0.0.0' && env('VYTHERA_ONLINE_ALLOW_PUBLIC_BIND') !== '1') {
    throw new Error(
      'Refusing to bind VYTHERA Online on 0.0.0.0 without VYTHERA_ONLINE_ALLOW_PUBLIC_BIND=1 (cloud VPS only).',
    );
  }
  const secret = env('VYTHERA_ONLINE_JWT_SECRET');
  if (!secret || secret.length < 32) {
    if (env('NODE_ENV') === 'production') {
      throw new Error('VYTHERA_ONLINE_JWT_SECRET must be set (>=32 chars) in production.');
    }
  }
  return {
    host,
    port: Number(env('VYTHERA_ONLINE_PORT', '8788')) || 8788,
    dataDir: env('VYTHERA_ONLINE_DATA', path.join(process.cwd(), 'data', 'online')),
    jwtSecret: secret || 'dev-only-vythera-online-secret-change-me!!',
    corsOrigins: env('VYTHERA_ONLINE_CORS', 'http://127.0.0.1:5173,http://localhost:5173')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    rateLimitPerMinute: Math.max(10, Number(env('VYTHERA_ONLINE_RATE_LIMIT', '60')) || 60),
    maxBodyBytes: Math.max(64_000, Number(env('VYTHERA_ONLINE_MAX_BODY', String(2_000_000))) || 2_000_000),
    maxImageBytes: Math.max(32_000, Number(env('VYTHERA_ONLINE_MAX_IMAGE', String(1_500_000))) || 1_500_000),
    inferenceEnabled: env('VYTHERA_ONLINE_INFERENCE', '1') !== '0',
    inferenceModality: env('VYTHERA_ONLINE_VISION', '0') === '1' ? ['TEXT', 'VISION_LANGUAGE'] : ['TEXT'],
  };
}
`,
);

w(
  'security/headers.ts',
  `import type { IncomingMessage, ServerResponse } from 'node:http';
import type { OnlineConfig } from '../config';

export function applySecurityHeaders(req: IncomingMessage, res: ServerResponse, cfg: OnlineConfig): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  const origin = String(req.headers.origin ?? '');
  if (origin && cfg.corsOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  }
}
`,
);

w(
  'security/rateLimit.ts',
  `type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limitPerMinute: number): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + 60_000 };
    buckets.set(key, b);
  }
  b.count += 1;
  if (b.count > limitPerMinute) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  }
  return { ok: true };
}
`,
);

w(
  'security/uploadSafety.ts',
  `const ALLOWED_IMAGE = new Set(['image/png', 'image/jpeg', 'image/webp']);

export function validateImageUpload(input: {
  mime: string;
  base64: string;
  maxBytes: number;
}): { ok: true; bytes: Buffer } | { ok: false; error: string } {
  const mime = String(input.mime || '').toLowerCase();
  if (!ALLOWED_IMAGE.has(mime)) return { ok: false, error: 'Unsupported image type.' };
  let bytes: Buffer;
  try {
    bytes = Buffer.from(String(input.base64 || ''), 'base64');
  } catch {
    return { ok: false, error: 'Malformed image payload.' };
  }
  if (!bytes.length) return { ok: false, error: 'Empty image.' };
  if (bytes.length > input.maxBytes) return { ok: false, error: 'Image too large.' };
  // Magic-byte checks
  const png = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const jpg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const webp =
    bytes.length >= 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP';
  if (mime === 'image/png' && !png) return { ok: false, error: 'PNG signature mismatch.' };
  if (mime === 'image/jpeg' && !jpg) return { ok: false, error: 'JPEG signature mismatch.' };
  if (mime === 'image/webp' && !webp) return { ok: false, error: 'WEBP signature mismatch.' };
  return { ok: true, bytes };
}
`,
);

w(
  'storage/ObjectStore.ts',
  `export interface ObjectStore {
  put(key: string, data: Buffer, contentType?: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  /** Controlled download URL — local FS returns a path token, S3 would return signed URL. */
  signedUrl(key: string, ttlSec?: number): Promise<string>;
}
`,
);

w(
  'storage/LocalFsObjectStore.ts',
  `import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ObjectStore } from './ObjectStore';

export class LocalFsObjectStore implements ObjectStore {
  private tokens = new Map<string, { key: string; exp: number }>();

  constructor(private rootDir: string) {}

  private abs(key: string): string {
    const safe = key.replace(/\\\\/g, '/').replace(/\\.\\./g, '').replace(/^\\/+/, '');
    return path.join(this.rootDir, safe);
  }

  async put(key: string, data: Buffer): Promise<void> {
    const abs = this.abs(key);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, data);
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.abs(key));
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.abs(key));
    } catch {
      /* ignore */
    }
  }

  async signedUrl(key: string, ttlSec = 300): Promise<string> {
    const token = randomBytes(24).toString('hex');
    this.tokens.set(token, { key, exp: Date.now() + ttlSec * 1000 });
    return \`/api/v1/storage/\${token}\`;
  }

  resolveToken(token: string): string | null {
    const row = this.tokens.get(token);
    if (!row) return null;
    if (Date.now() > row.exp) {
      this.tokens.delete(token);
      return null;
    }
    return row.key;
  }

  static sha256(buf: Buffer): string {
    return createHash('sha256').update(buf).digest('hex');
  }
}
`,
);

w(
  'db/JsonDb.ts',
  `import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type OnlineUser = {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: number;
};

export type OnlineModRow = {
  id: string;
  name: string;
  displayName: string;
  description: string;
  version: string;
  author: string;
  authorId: string;
  category: string;
  downloads: number;
  ratingAvg: number;
  ratingCount: number;
  packageKey: string;
  sha256: string;
  packageJson: string;
  createdAt: number;
};

export type OnlineModelRow = {
  id: string;
  name: string;
  version: string;
  modality: 'TEXT' | 'VISION_LANGUAGE';
  baseModel: string;
  adapterVersion: string;
  status: 'published' | 'yanked';
  description: string;
  license: string;
  creator: string;
  createdAt: number;
  artifactKey?: string;
};

type DbShape = {
  users: OnlineUser[];
  mods: OnlineModRow[];
  models: OnlineModelRow[];
  tokens: Array<{ token: string; userId: string; exp: number }>;
};

export class JsonDb {
  private data: DbShape = { users: [], mods: [], models: [], tokens: [] };
  private file: string;

  constructor(dataDir: string) {
    this.file = path.join(dataDir, 'online-db.json');
  }

  async load(): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    try {
      const raw = await readFile(this.file, 'utf8');
      this.data = { ...this.data, ...(JSON.parse(raw) as DbShape) };
    } catch {
      await this.save();
    }
  }

  async save(): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify(this.data, null, 2));
  }

  get users() { return this.data.users; }
  get mods() { return this.data.mods; }
  get models() { return this.data.models; }
  get tokens() { return this.data.tokens; }
}
`,
);

console.log('server online core files written');
