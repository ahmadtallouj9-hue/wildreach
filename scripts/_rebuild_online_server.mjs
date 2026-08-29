/**
 * Rebuild server/online as a coherent minimal public API.
 * Private PC AI/training remain untouched (loopback-only elsewhere).
 */
import fs from 'fs';
import path from 'path';

const root = path.join(process.cwd(), 'server', 'online');

function rmrf(p) {
  if (!fs.existsSync(p)) return;
  for (const n of fs.readdirSync(p)) {
    const fp = path.join(p, n);
    if (fs.statSync(fp).isDirectory()) rmrf(fp);
    else fs.unlinkSync(fp);
  }
  fs.rmdirSync(p);
}

rmrf(root);
fs.mkdirSync(root, { recursive: true });

function w(rel, body) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
  console.log('wrote', rel);
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
  if (host === '0.0.0.0' && env('VYTHERA_ONLINE_ALLOW_PUBLIC_BIND') !== '1') {
    throw new Error(
      'Refusing to bind VYTHERA Online on 0.0.0.0 without VYTHERA_ONLINE_ALLOW_PUBLIC_BIND=1 (cloud VPS only).',
    );
  }
  const secret = env('VYTHERA_ONLINE_JWT_SECRET');
  if ((!secret || secret.length < 32) && env('NODE_ENV') === 'production') {
    throw new Error('VYTHERA_ONLINE_JWT_SECRET must be set (>=32 chars) in production.');
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
  'http.ts',
  `import type { IncomingMessage, ServerResponse } from 'node:http';

export type Ctx = {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  body: unknown;
  userId: string | null;
};

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export async function readBody(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > maxBytes) throw new Error('Payload too large');
    chunks.push(buf);
  }
  if (!chunks.length) return null;
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? (JSON.parse(raw) as unknown) : null;
}

export function clientKey(req: IncomingMessage): string {
  const xf = String(req.headers['x-forwarded-for'] ?? '').split(',')[0]?.trim();
  return xf || req.socket.remoteAddress || 'unknown';
}
`,
);

w(
  'security.ts',
  `import type { IncomingMessage, ServerResponse } from 'node:http';
import type { OnlineConfig } from './config';

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

type Bucket = { count: number; resetAt: number };
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

const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp']);

export function validateImageUpload(input: {
  mime: string;
  base64: string;
  maxBytes: number;
}): { ok: true; bytes: Buffer } | { ok: false; error: string } {
  const mime = String(input.mime || '').toLowerCase();
  if (!ALLOWED.has(mime)) return { ok: false, error: 'Unsupported image type.' };
  let bytes: Buffer;
  try {
    bytes = Buffer.from(String(input.base64 || ''), 'base64');
  } catch {
    return { ok: false, error: 'Malformed image payload.' };
  }
  if (!bytes.length) return { ok: false, error: 'Empty image.' };
  if (bytes.length > input.maxBytes) return { ok: false, error: 'Image too large.' };
  const png = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50;
  const jpg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8;
  const webp =
    bytes.length >= 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP';
  if (mime === 'image/png' && !png) return { ok: false, error: 'PNG signature mismatch.' };
  if (mime === 'image/jpeg' && !jpg) return { ok: false, error: 'JPEG signature mismatch.' };
  if (mime === 'image/webp' && !webp) return { ok: false, error: 'WEBP signature mismatch.' };
  return { ok: true, bytes };
}

export function leaksPrivate(text: string): boolean {
  return /[A-Za-z]:\\\\|\\/home\\/|\\/Users\\/|127\\.0\\.0\\.1|192\\.168\\.|dataset/i.test(text);
}
`,
);

w(
  'auth.ts',
  `import crypto from 'node:crypto';
import type { OnlineConfig } from './config';

export function hashPassword(password: string, salt = crypto.randomBytes(16).toString('hex')): string {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return \`scrypt:\${salt}:\${hash}\`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hash] = parts;
  const next = crypto.scryptSync(password, salt, 64).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(next, 'hex'));
  } catch {
    return false;
  }
}

type JwtPayload = { sub: string; exp: number; typ: 'access' | 'refresh' };

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

function sign(payload: JwtPayload, secret: string): string {
  const header = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = crypto.createHmac('sha256', secret).update(\`\${header}.\${body}\`).digest('base64url');
  return \`\${header}.\${body}.\${sig}\`;
}

function verify(token: string, secret: string): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = crypto.createHmac('sha256', secret).update(\`\${header}.\${body}\`).digest('base64url');
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as JwtPayload;
    if (!payload.sub || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function issueTokens(userId: string, cfg: OnlineConfig): { accessToken: string; refreshToken: string } {
  const now = Math.floor(Date.now() / 1000);
  return {
    accessToken: sign({ sub: userId, exp: now + 60 * 60, typ: 'access' }, cfg.jwtSecret),
    refreshToken: sign({ sub: userId, exp: now + 60 * 60 * 24 * 14, typ: 'refresh' }, cfg.jwtSecret),
  };
}

export function verifyAccessToken(token: string, cfg: OnlineConfig): string | null {
  const payload = verify(token, cfg.jwtSecret);
  if (!payload || payload.typ !== 'access') return null;
  return payload.sub;
}

export function verifyRefreshToken(token: string, cfg: OnlineConfig): string | null {
  const payload = verify(token, cfg.jwtSecret);
  if (!payload || payload.typ !== 'refresh') return null;
  return payload.sub;
}
`,
);

w(
  'db.ts',
  `import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export type UserRow = {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  createdAt: string;
};

export type ModVersionRow = {
  version: string;
  changelog: string;
  sha256: string;
  sizeBytes: number;
  objectKey: string;
  createdAt: string;
  compatibility: string[];
};

export type ModRow = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  categories: string[];
  creatorId: string;
  creatorName: string;
  visibility: 'public' | 'unlisted';
  versions: ModVersionRow[];
  downloads: number;
  createdAt: string;
  updatedAt: string;
};

export type PublishedModelRow = {
  id: string;
  name: string;
  version: string;
  modality: 'TEXT' | 'VISION_LANGUAGE';
  baseModel: string;
  adapterVersion: string;
  status: 'published' | 'draft';
  license: string;
  description: string;
  creatorId: string;
  createdAt: string;
};

type DbState = {
  users: UserRow[];
  mods: ModRow[];
  models: PublishedModelRow[];
  refreshTokens: Array<{ tokenHash: string; userId: string; expiresAt: number }>;
};

function empty(): DbState {
  return { users: [], mods: [], models: [], refreshTokens: [] };
}

export class JsonDb {
  private state: DbState;
  private file: string;

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.file = path.join(dataDir, 'db.json');
    if (fs.existsSync(this.file)) {
      this.state = JSON.parse(fs.readFileSync(this.file, 'utf8')) as DbState;
    } else {
      this.state = empty();
      this.save();
    }
  }

  private save(): void {
    fs.writeFileSync(this.file, JSON.stringify(this.state, null, 2));
  }

  createUser(input: { email: string; displayName: string; passwordHash: string }): UserRow {
    const email = input.email.toLowerCase();
    if (this.state.users.some((u) => u.email === email)) throw new Error('Email already registered');
    const row: UserRow = {
      id: crypto.randomUUID(),
      email,
      displayName: input.displayName.slice(0, 64),
      passwordHash: input.passwordHash,
      createdAt: new Date().toISOString(),
    };
    this.state.users.push(row);
    this.save();
    return row;
  }

  findUserByEmail(email: string): UserRow | null {
    return this.state.users.find((u) => u.email === email.toLowerCase()) ?? null;
  }

  findUserById(id: string): UserRow | null {
    return this.state.users.find((u) => u.id === id) ?? null;
  }

  storeRefresh(tokenHash: string, userId: string, expiresAt: number): void {
    this.state.refreshTokens = this.state.refreshTokens.filter((t) => t.expiresAt > Date.now() / 1000);
    this.state.refreshTokens.push({ tokenHash, userId, expiresAt });
    this.save();
  }

  revokeRefresh(tokenHash: string): void {
    this.state.refreshTokens = this.state.refreshTokens.filter((t) => t.tokenHash !== tokenHash);
    this.save();
  }

  hasRefresh(tokenHash: string, userId: string): boolean {
    return this.state.refreshTokens.some(
      (t) => t.tokenHash === tokenHash && t.userId === userId && t.expiresAt > Date.now() / 1000,
    );
  }

  listMods(q?: string, category?: string): ModRow[] {
    let rows = this.state.mods.filter((m) => m.visibility === 'public');
    if (category) rows = rows.filter((m) => m.categories.includes(category));
    if (q) {
      const needle = q.toLowerCase();
      rows = rows.filter(
        (m) =>
          m.title.toLowerCase().includes(needle) ||
          m.summary.toLowerCase().includes(needle) ||
          m.slug.toLowerCase().includes(needle),
      );
    }
    return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  getMod(idOrSlug: string): ModRow | null {
    return this.state.mods.find((m) => m.id === idOrSlug || m.slug === idOrSlug) ?? null;
  }

  upsertMod(mod: ModRow): ModRow {
    const i = this.state.mods.findIndex((m) => m.id === mod.id);
    if (i >= 0) this.state.mods[i] = mod;
    else this.state.mods.push(mod);
    this.save();
    return mod;
  }

  bumpDownload(id: string): void {
    const m = this.getMod(id);
    if (!m) return;
    m.downloads += 1;
    m.updatedAt = new Date().toISOString();
    this.save();
  }

  listModels(): PublishedModelRow[] {
    return this.state.models.filter((m) => m.status === 'published');
  }

  getModel(id: string): PublishedModelRow | null {
    return this.state.models.find((m) => m.id === id) ?? null;
  }

  publishModel(row: PublishedModelRow): PublishedModelRow {
    const i = this.state.models.findIndex((m) => m.id === row.id && m.version === row.version);
    if (i >= 0) this.state.models[i] = row;
    else this.state.models.push(row);
    this.save();
    return row;
  }
}
`,
);

w(
  'store.ts',
  `import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export interface ObjectStore {
  put(key: string, data: Buffer, contentType: string): Promise<{ key: string; sha256: string; sizeBytes: number }>;
  get(key: string): Promise<Buffer | null>;
  signedUrl(key: string, ttlSec?: number): Promise<string>;
  resolveSigned(token: string): Promise<{ key: string; data: Buffer; contentType: string } | null>;
}

type Meta = { contentType: string; sha256: string; sizeBytes: number };

export class LocalFsObjectStore implements ObjectStore {
  private root: string;
  private signingSecret: string;
  private signed = new Map<string, { key: string; exp: number }>();

  constructor(root: string, signingSecret: string) {
    this.root = root;
    this.signingSecret = signingSecret;
    fs.mkdirSync(root, { recursive: true });
  }

  private abs(key: string): string {
    const safe = key.replace(/\\\\/g, '/').replace(/\\.\\./g, '');
    const full = path.join(this.root, safe);
    if (!full.startsWith(this.root)) throw new Error('Invalid object key');
    return full;
  }

  async put(key: string, data: Buffer, contentType: string) {
    const abs = this.abs(key);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, data);
    const sha256 = crypto.createHash('sha256').update(data).digest('hex');
    const meta: Meta = { contentType, sha256, sizeBytes: data.length };
    fs.writeFileSync(\`\${abs}.meta.json\`, JSON.stringify(meta));
    return { key, sha256, sizeBytes: data.length };
  }

  async get(key: string): Promise<Buffer | null> {
    const abs = this.abs(key);
    if (!fs.existsSync(abs)) return null;
    return fs.readFileSync(abs);
  }

  async signedUrl(key: string, ttlSec = 300): Promise<string> {
    const token = crypto.randomBytes(24).toString('hex');
    this.signed.set(token, { key, exp: Date.now() + ttlSec * 1000 });
    return \`/api/v1/storage/signed/\${token}\`;
  }

  async resolveSigned(token: string) {
    const entry = this.signed.get(token);
    if (!entry || entry.exp < Date.now()) {
      this.signed.delete(token);
      return null;
    }
    const data = await this.get(entry.key);
    if (!data) return null;
    const metaPath = \`\${this.abs(entry.key)}.meta.json\`;
    const meta = fs.existsSync(metaPath)
      ? (JSON.parse(fs.readFileSync(metaPath, 'utf8')) as Meta)
      : { contentType: 'application/octet-stream', sha256: '', sizeBytes: data.length };
    return { key: entry.key, data, contentType: meta.contentType };
  }
}

export function sha256Hex(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}
`,
);

w(
  'routes.ts',
  `import crypto from 'node:crypto';
import type { OnlineConfig } from './config';
import { JsonDb, type ModRow, type PublishedModelRow } from './db';
import type { ObjectStore } from './store';
import { sha256Hex } from './store';
import type { Ctx } from './http';
import { sendJson } from './http';
import {
  hashPassword,
  verifyPassword,
  issueTokens,
  verifyAccessToken,
  verifyRefreshToken,
} from './auth';
import { rateLimit, validateImageUpload, leaksPrivate } from './security';

export type OnlineDeps = {
  cfg: OnlineConfig;
  db: JsonDb;
  store: ObjectStore;
  metrics: { requests: number; errors: number; inference: number; downloads: number };
};

function requireAuth(ctx: Ctx): string | null {
  return ctx.userId;
}

function publicUser(u: { id: string; displayName: string; email: string }) {
  return { id: u.id, displayName: u.displayName, email: u.email };
}

function publicMod(m: ModRow) {
  const latest = m.versions[m.versions.length - 1] ?? null;
  return {
    id: m.id,
    slug: m.slug,
    title: m.title,
    summary: m.summary,
    categories: m.categories,
    creatorName: m.creatorName,
    downloads: m.downloads,
    latestVersion: latest
      ? {
          version: latest.version,
          sha256: latest.sha256,
          sizeBytes: latest.sizeBytes,
          compatibility: latest.compatibility,
          createdAt: latest.createdAt,
        }
      : null,
    updatedAt: m.updatedAt,
  };
}

function publicModel(m: PublishedModelRow) {
  return {
    id: m.id,
    name: m.name,
    version: m.version,
    modality: m.modality,
    baseModel: m.baseModel,
    adapterVersion: m.adapterVersion,
    status: m.status,
    license: m.license,
    description: m.description,
    createdAt: m.createdAt,
  };
}

export async function handleRoute(ctx: Ctx, deps: OnlineDeps): Promise<boolean> {
  const { cfg, db, store, metrics } = deps;
  const { pathname } = ctx.url;
  const method = (ctx.req.method || 'GET').toUpperCase();

  if (pathname === '/api/v1/health' && method === 'GET') {
    sendJson(ctx.res, 200, {
      status: 'ok',
      services: {
        api: 'ok',
        database: 'ok',
        storage: 'ok',
        inference: cfg.inferenceEnabled ? 'ok' : 'disabled',
      },
      modalities: cfg.inferenceModality,
    });
    return true;
  }

  if (pathname === '/api/v1/auth/register' && method === 'POST') {
    const body = (ctx.body ?? {}) as { email?: string; password?: string; displayName?: string };
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const displayName = String(body.displayName || '').trim() || email.split('@')[0] || 'Player';
    if (!email.includes('@') || password.length < 10) {
      sendJson(ctx.res, 400, { error: 'Invalid email or password (min 10 chars).' });
      return true;
    }
    try {
      const user = db.createUser({ email, displayName, passwordHash: hashPassword(password) });
      const tokens = issueTokens(user.id, cfg);
      db.storeRefresh(sha256Hex(Buffer.from(tokens.refreshToken)), user.id, Math.floor(Date.now() / 1000) + 14 * 86400);
      sendJson(ctx.res, 201, { user: publicUser(user), ...tokens });
    } catch (e) {
      sendJson(ctx.res, 409, { error: e instanceof Error ? e.message : 'Register failed' });
    }
    return true;
  }

  if (pathname === '/api/v1/auth/login' && method === 'POST') {
    const body = (ctx.body ?? {}) as { email?: string; password?: string };
    const user = db.findUserByEmail(String(body.email || ''));
    if (!user || !verifyPassword(String(body.password || ''), user.passwordHash)) {
      sendJson(ctx.res, 401, { error: 'Invalid credentials.' });
      return true;
    }
    const tokens = issueTokens(user.id, cfg);
    db.storeRefresh(sha256Hex(Buffer.from(tokens.refreshToken)), user.id, Math.floor(Date.now() / 1000) + 14 * 86400);
    sendJson(ctx.res, 200, { user: publicUser(user), ...tokens });
    return true;
  }

  if (pathname === '/api/v1/auth/refresh' && method === 'POST') {
    const body = (ctx.body ?? {}) as { refreshToken?: string };
    const refresh = String(body.refreshToken || '');
    const userId = verifyRefreshToken(refresh, cfg);
    const hash = sha256Hex(Buffer.from(refresh));
    if (!userId || !db.hasRefresh(hash, userId)) {
      sendJson(ctx.res, 401, { error: 'Invalid refresh token.' });
      return true;
    }
    db.revokeRefresh(hash);
    const tokens = issueTokens(userId, cfg);
    db.storeRefresh(sha256Hex(Buffer.from(tokens.refreshToken)), userId, Math.floor(Date.now() / 1000) + 14 * 86400);
    sendJson(ctx.res, 200, tokens);
    return true;
  }

  if (pathname === '/api/v1/auth/logout' && method === 'POST') {
    const body = (ctx.body ?? {}) as { refreshToken?: string };
    if (body.refreshToken) db.revokeRefresh(sha256Hex(Buffer.from(String(body.refreshToken))));
    sendJson(ctx.res, 200, { ok: true });
    return true;
  }

  if (pathname === '/api/v1/auth/me' && method === 'GET') {
    const uid = requireAuth(ctx);
    if (!uid) {
      sendJson(ctx.res, 401, { error: 'Unauthorized' });
      return true;
    }
    const user = db.findUserById(uid);
    if (!user) {
      sendJson(ctx.res, 401, { error: 'Unauthorized' });
      return true;
    }
    sendJson(ctx.res, 200, { user: publicUser(user) });
    return true;
  }

  if (pathname === '/api/v1/mods' && method === 'GET') {
    const q = ctx.url.searchParams.get('q') || undefined;
    const category = ctx.url.searchParams.get('category') || undefined;
    sendJson(ctx.res, 200, { mods: db.listMods(q, category).map(publicMod) });
    return true;
  }

  if (pathname === '/api/v1/mods' && method === 'POST') {
    const uid = requireAuth(ctx);
    if (!uid) {
      sendJson(ctx.res, 401, { error: 'Unauthorized' });
      return true;
    }
    const user = db.findUserById(uid)!;
    const body = (ctx.body ?? {}) as {
      slug?: string;
      title?: string;
      summary?: string;
      categories?: string[];
      version?: string;
      changelog?: string;
      compatibility?: string[];
      packageBase64?: string;
    };
    const slug = String(body.slug || '')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .slice(0, 64);
    const title = String(body.title || '').trim().slice(0, 120);
    const pkgB64 = String(body.packageBase64 || '');
    if (!slug || !title || !pkgB64) {
      sendJson(ctx.res, 400, { error: 'slug, title, and packageBase64 required.' });
      return true;
    }
    if (leaksPrivate(title) || leaksPrivate(String(body.summary || ''))) {
      sendJson(ctx.res, 400, { error: 'Metadata contains private path/host markers.' });
      return true;
    }
    const bytes = Buffer.from(pkgB64, 'base64');
    if (bytes.length > cfg.maxBodyBytes) {
      sendJson(ctx.res, 413, { error: 'Package too large.' });
      return true;
    }
    // Never execute uploaded packages — store as opaque bytes only.
    const version = String(body.version || '1.0.0');
    const objectKey = \`mods/\${slug}/\${version}.zip\`;
    const put = await store.put(objectKey, bytes, 'application/zip');
    const existing = db.getMod(slug);
    const now = new Date().toISOString();
    const mod: ModRow = existing ?? {
      id: crypto.randomUUID(),
      slug,
      title,
      summary: String(body.summary || '').slice(0, 500),
      categories: Array.isArray(body.categories) ? body.categories.slice(0, 8).map(String) : [],
      creatorId: user.id,
      creatorName: user.displayName,
      visibility: 'public',
      versions: [],
      downloads: 0,
      createdAt: now,
      updatedAt: now,
    };
    if (existing && existing.creatorId !== user.id) {
      sendJson(ctx.res, 403, { error: 'Not the mod owner.' });
      return true;
    }
    mod.title = title;
    mod.summary = String(body.summary || mod.summary).slice(0, 500);
    mod.categories = Array.isArray(body.categories) ? body.categories.slice(0, 8).map(String) : mod.categories;
    mod.versions.push({
      version,
      changelog: String(body.changelog || '').slice(0, 2000),
      sha256: put.sha256,
      sizeBytes: put.sizeBytes,
      objectKey,
      createdAt: now,
      compatibility: Array.isArray(body.compatibility) ? body.compatibility.map(String) : [],
    });
    mod.updatedAt = now;
    db.upsertMod(mod);
    sendJson(ctx.res, 201, { mod: publicMod(mod) });
    return true;
  }

  const modMatch = pathname.match(/^\\/api\\/v1\\/mods\\/([^/]+)$/);
  if (modMatch && method === 'GET') {
    const mod = db.getMod(decodeURIComponent(modMatch[1]));
    if (!mod) {
      sendJson(ctx.res, 404, { error: 'Mod not found.' });
      return true;
    }
    sendJson(ctx.res, 200, { mod: publicMod(mod), versions: mod.versions.map((v) => ({
      version: v.version,
      sha256: v.sha256,
      sizeBytes: v.sizeBytes,
      changelog: v.changelog,
      compatibility: v.compatibility,
      createdAt: v.createdAt,
    })) });
    return true;
  }

  const dlMatch = pathname.match(/^\\/api\\/v1\\/mods\\/([^/]+)\\/download$/);
  if (dlMatch && method === 'GET') {
    const mod = db.getMod(decodeURIComponent(dlMatch[1]));
    if (!mod || !mod.versions.length) {
      sendJson(ctx.res, 404, { error: 'Mod not found.' });
      return true;
    }
    const ver = ctx.url.searchParams.get('version');
    const row = ver ? mod.versions.find((v) => v.version === ver) : mod.versions[mod.versions.length - 1];
    if (!row) {
      sendJson(ctx.res, 404, { error: 'Version not found.' });
      return true;
    }
    const url = await store.signedUrl(row.objectKey, 300);
    db.bumpDownload(mod.id);
    metrics.downloads += 1;
    sendJson(ctx.res, 200, {
      downloadUrl: url,
      sha256: row.sha256,
      sizeBytes: row.sizeBytes,
      version: row.version,
      expiresInSec: 300,
    });
    return true;
  }

  if (pathname === '/api/v1/models' && method === 'GET') {
    sendJson(ctx.res, 200, { models: db.listModels().map(publicModel) });
    return true;
  }

  if (pathname === '/api/v1/models' && method === 'POST') {
    const uid = requireAuth(ctx);
    if (!uid) {
      sendJson(ctx.res, 401, { error: 'Unauthorized' });
      return true;
    }
    const body = (ctx.body ?? {}) as Record<string, unknown>;
    const name = String(body.name || '').trim();
    const version = String(body.version || '').trim();
    const modality = String(body.modality || 'TEXT');
    const description = String(body.description || '');
    if (!name || !version) {
      sendJson(ctx.res, 400, { error: 'name and version required.' });
      return true;
    }
    if (leaksPrivate(name) || leaksPrivate(description) || leaksPrivate(JSON.stringify(body))) {
      sendJson(ctx.res, 400, { error: 'Rejected: private paths/hosts/datasets in metadata.' });
      return true;
    }
    if (body.datasetPath || body.localPath || body.trainingLog || body.privateDataset) {
      sendJson(ctx.res, 400, { error: 'Rejected: private training artifacts must not be uploaded.' });
      return true;
    }
    const row: PublishedModelRow = {
      id: String(body.id || name.toLowerCase().replace(/[^a-z0-9-]/g, '-')).slice(0, 80),
      name: name.slice(0, 120),
      version: version.slice(0, 32),
      modality: modality === 'VISION_LANGUAGE' ? 'VISION_LANGUAGE' : 'TEXT',
      baseModel: String(body.baseModel || 'unknown').slice(0, 120),
      adapterVersion: String(body.adapterVersion || version).slice(0, 64),
      status: 'published',
      license: String(body.license || 'proprietary').slice(0, 64),
      description: description.slice(0, 2000),
      creatorId: uid,
      createdAt: new Date().toISOString(),
    };
    db.publishModel(row);
    sendJson(ctx.res, 201, { model: publicModel(row) });
    return true;
  }

  if (pathname === '/api/v1/inference/chat' && method === 'POST') {
    const uid = requireAuth(ctx);
    if (!uid) {
      sendJson(ctx.res, 401, { error: 'Authentication required for online inference.' });
      return true;
    }
    if (!cfg.inferenceEnabled || !cfg.inferenceModality.includes('TEXT')) {
      sendJson(ctx.res, 503, { error: 'Text inference unavailable.' });
      return true;
    }
    const rl = rateLimit(\`inf:\${uid}\`, Math.max(10, Math.floor(cfg.rateLimitPerMinute / 2)));
    if (!rl.ok) {
      sendJson(ctx.res, 429, { error: 'Rate limit exceeded.', retryAfterSec: rl.retryAfterSec });
      return true;
    }
    const body = (ctx.body ?? {}) as { messages?: Array<{ role: string; content: string }>; privacy?: string };
    if (String(body.privacy || '').toUpperCase() === 'PRIVATE') {
      sendJson(ctx.res, 403, { error: 'PRIVATE data cannot be sent to online inference.' });
      return true;
    }
    const messages = Array.isArray(body.messages) ? body.messages.slice(0, 32) : [];
    const last = messages.filter((m) => m.role === 'user').pop();
    const prompt = String(last?.content || '').slice(0, 4000);
    if (!prompt) {
      sendJson(ctx.res, 400, { error: 'messages required.' });
      return true;
    }
    if (leaksPrivate(prompt)) {
      sendJson(ctx.res, 400, { error: 'Request appears to contain private path/host data.' });
      return true;
    }
    metrics.inference += 1;
    // Replaceable stub — swap for real deployment backend without changing API.
    sendJson(ctx.res, 200, {
      provider: 'vythera-online-stub',
      modality: 'TEXT',
      text: \`[VYTHERA Online] Received (\${prompt.length} chars). Deploy a real inference backend to replace this stub.\`,
    });
    return true;
  }

  if (pathname === '/api/v1/inference/vision' && method === 'POST') {
    const uid = requireAuth(ctx);
    if (!uid) {
      sendJson(ctx.res, 401, { error: 'Authentication required for online inference.' });
      return true;
    }
    if (!cfg.inferenceEnabled || !cfg.inferenceModality.includes('VISION_LANGUAGE')) {
      sendJson(ctx.res, 503, { error: 'Vision inference not enabled on this deployment.' });
      return true;
    }
    const body = (ctx.body ?? {}) as { mime?: string; imageBase64?: string; prompt?: string; privacy?: string };
    if (String(body.privacy || '').toUpperCase() === 'PRIVATE') {
      sendJson(ctx.res, 403, { error: 'PRIVATE images cannot be sent online.' });
      return true;
    }
    const img = validateImageUpload({
      mime: String(body.mime || ''),
      base64: String(body.imageBase64 || ''),
      maxBytes: cfg.maxImageBytes,
    });
    if (!img.ok) {
      sendJson(ctx.res, 400, { error: img.error });
      return true;
    }
    metrics.inference += 1;
    // Temporary bytes only — not persisted.
    sendJson(ctx.res, 200, {
      provider: 'vythera-online-stub',
      modality: 'VISION_LANGUAGE',
      text: \`[VYTHERA Online Vision] Accepted \${img.bytes.length} bytes. Prompt: \${String(body.prompt || '').slice(0, 200)}\`,
    });
    return true;
  }

  const signed = pathname.match(/^\\/api\\/v1\\/storage\\/signed\\/([a-f0-9]+)$/);
  if (signed && method === 'GET') {
    const resolved = await store.resolveSigned(signed[1]);
    if (!resolved) {
      sendJson(ctx.res, 404, { error: 'Expired or invalid download.' });
      return true;
    }
    ctx.res.statusCode = 200;
    ctx.res.setHeader('Content-Type', resolved.contentType);
    ctx.res.setHeader('Content-Length', String(resolved.data.length));
    ctx.res.setHeader('X-Content-Type-Options', 'nosniff');
    ctx.res.end(resolved.data);
    return true;
  }

  if (pathname === '/api/v1/metrics' && method === 'GET') {
    const uid = requireAuth(ctx);
    if (!uid) {
      sendJson(ctx.res, 401, { error: 'Unauthorized' });
      return true;
    }
    sendJson(ctx.res, 200, {
      requests: metrics.requests,
      errors: metrics.errors,
      inference: metrics.inference,
      downloads: metrics.downloads,
    });
    return true;
  }

  return false;
}

export function authenticateRequest(authHeader: string | undefined, cfg: OnlineConfig): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return verifyAccessToken(authHeader.slice(7), cfg);
}
`,
);

w(
  'index.ts',
  `import http from 'node:http';
import { loadOnlineConfig } from './config';
import { JsonDb } from './db';
import { LocalFsObjectStore } from './store';
import { applySecurityHeaders, rateLimit } from './security';
import { readBody, sendJson, clientKey, type Ctx } from './http';
import { authenticateRequest, handleRoute } from './routes';

export async function startVytheraOnlineServer(): Promise<http.Server> {
  const cfg = loadOnlineConfig();
  const db = new JsonDb(cfg.dataDir);
  const store = new LocalFsObjectStore(\`\${cfg.dataDir}/objects\`, cfg.jwtSecret);
  const metrics = { requests: 0, errors: 0, inference: 0, downloads: 0 };

  const server = http.createServer(async (req, res) => {
    applySecurityHeaders(req, res, cfg);
    if ((req.method || '').toUpperCase() === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    metrics.requests += 1;
    const host = req.headers.host || \`\${cfg.host}:\${cfg.port}\`;
    const url = new URL(req.url || '/', \`http://\${host}\`);
    const rl = rateLimit(clientKey(req), cfg.rateLimitPerMinute);
    if (!rl.ok) {
      metrics.errors += 1;
      res.setHeader('Retry-After', String(rl.retryAfterSec));
      sendJson(res, 429, { error: 'Too many requests.', retryAfterSec: rl.retryAfterSec });
      return;
    }

    let body: unknown = null;
    try {
      if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
        body = await readBody(req, cfg.maxBodyBytes);
      }
    } catch (e) {
      metrics.errors += 1;
      sendJson(res, 413, { error: e instanceof Error ? e.message : 'Bad request body' });
      return;
    }

    const ctx: Ctx = {
      req,
      res,
      url,
      body,
      userId: authenticateRequest(req.headers.authorization, cfg),
    };

    try {
      const handled = await handleRoute(ctx, { cfg, db, store, metrics });
      if (!handled) {
        sendJson(res, 404, { error: 'Not found' });
      }
    } catch (e) {
      metrics.errors += 1;
      sendJson(res, 500, { error: 'Internal error' });
      // eslint-disable-next-line no-console
      console.error('[vythera-online]', e instanceof Error ? e.message : e);
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(cfg.port, cfg.host, () => resolve());
  });

  // eslint-disable-next-line no-console
  console.log(\`[vythera-online] listening on http://\${cfg.host}:\${cfg.port} (private AI/training NOT exposed)\`);
  return server;
}

if (import.meta.url === \`file://\${process.argv[1]?.replace(/\\\\/g, '/')}\` || process.argv[1]?.endsWith('online/index.ts') || process.argv[1]?.endsWith('online\\\\index.ts')) {
  startVytheraOnlineServer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
`,
);

console.log('server/online rebuilt');
