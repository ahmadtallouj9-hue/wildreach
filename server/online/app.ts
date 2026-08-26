/**
 * VYTHERA Online — public API for cloud/VPS.
 * Never exposes local Ollama, training daemon, private datasets, or the home PC.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

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

type User = { id: string; email: string; displayName: string; passwordHash: string; createdAt: string };
type ModVersion = {
  version: string;
  changelog: string;
  sha256: string;
  sizeBytes: number;
  objectKey: string;
  createdAt: string;
  compatibility: string[];
};
type Mod = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  categories: string[];
  creatorId: string;
  creatorName: string;
  visibility: 'public' | 'unlisted';
  versions: ModVersion[];
  downloads: number;
  createdAt: string;
  updatedAt: string;
};
type Model = {
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
type Db = {
  users: User[];
  mods: Mod[];
  models: Model[];
  refresh: Array<{ hash: string; userId: string; exp: number }>;
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

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage, maxBytes: number): Promise<unknown> {
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

function applyHeaders(req: IncomingMessage, res: ServerResponse, cfg: OnlineConfig): void {
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

function checkRateLimit(key: string, limit: number): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + 60_000 };
    buckets.set(key, b);
  }
  b.count += 1;
  if (b.count > limit) return { ok: false, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  return { ok: true };
}

function leaksPrivate(text: string): boolean {
  return /[A-Za-z]:\\|\/home\/|\/Users\/|127\.0\.0\.1|192\.168\.|10\.\d+\.|172\.(1[6-9]|2\d|3[0-1])\.|dataset/i.test(
    text,
  );
}

function validateImage(
  mime: string,
  b64: string,
  maxBytes: number,
): { ok: true; bytes: Buffer } | { ok: false; error: string } {
  const m = mime.toLowerCase();
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(m)) return { ok: false, error: 'Unsupported image type.' };
  let bytes: Buffer;
  try {
    bytes = Buffer.from(b64, 'base64');
  } catch {
    return { ok: false, error: 'Malformed image.' };
  }
  if (!bytes.length || bytes.length > maxBytes) return { ok: false, error: 'Invalid image size.' };
  const png = bytes[0] === 0x89 && bytes[1] === 0x50;
  const jpg = bytes[0] === 0xff && bytes[1] === 0xd8;
  const webp = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if ((m === 'image/png' && !png) || (m === 'image/jpeg' && !jpg) || (m === 'image/webp' && !webp)) {
    return { ok: false, error: 'Image signature mismatch.' };
  }
  return { ok: true, bytes };
}

function hashPassword(password: string, salt = crypto.randomBytes(16).toString('hex')): string {
  return `scrypt:${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [algo, salt, hash] = stored.split(':');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(hash, 'hex'),
      Buffer.from(crypto.scryptSync(password, salt, 64).toString('hex'), 'hex'),
    );
  } catch {
    return false;
  }
}

type Jwt = { sub: string; exp: number; typ: 'access' | 'refresh' };

function signJwt(payload: Jwt, secret: string): string {
  const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const b = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const s = crypto.createHmac('sha256', secret).update(`${h}.${b}`).digest('base64url');
  return `${h}.${b}.${s}`;
}

function verifyJwt(token: string, secret: string, typ: 'access' | 'refresh'): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, b, s] = parts;
  const expected = crypto.createHmac('sha256', secret).update(`${h}.${b}`).digest('base64url');
  if (s !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(b, 'base64url').toString('utf8')) as Jwt;
    if (payload.typ !== typ || !payload.sub || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

function issueTokens(userId: string, secret: string) {
  const now = Math.floor(Date.now() / 1000);
  return {
    accessToken: signJwt({ sub: userId, exp: now + 3600, typ: 'access' }, secret),
    refreshToken: signJwt({ sub: userId, exp: now + 14 * 86400, typ: 'refresh' }, secret),
  };
}

function sha256Hex(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

class OnlineStore {
  private signed = new Map<string, { key: string; exp: number }>();
  private objectsRoot: string;
  private dbFile: string;
  private state: Db;

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.objectsRoot = path.join(dataDir, 'objects');
    fs.mkdirSync(this.objectsRoot, { recursive: true });
    this.dbFile = path.join(dataDir, 'db.json');
    this.state = fs.existsSync(this.dbFile)
      ? (JSON.parse(fs.readFileSync(this.dbFile, 'utf8')) as Db)
      : { users: [], mods: [], models: [], refresh: [] };
    this.save();
  }

  private save(): void {
    fs.writeFileSync(this.dbFile, JSON.stringify(this.state, null, 2));
  }

  private abs(key: string): string {
    const safe = key.replace(/\\/g, '/').replace(/\.\./g, '');
    const full = path.join(this.objectsRoot, safe);
    if (!full.startsWith(this.objectsRoot)) throw new Error('Invalid object key');
    return full;
  }

  putObject(key: string, data: Buffer, contentType: string) {
    const abs = this.abs(key);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, data);
    const sha256 = sha256Hex(data);
    fs.writeFileSync(`${abs}.meta.json`, JSON.stringify({ contentType, sha256, sizeBytes: data.length }));
    return { sha256, sizeBytes: data.length };
  }

  signedUrl(key: string, ttlSec = 300): string {
    const token = crypto.randomBytes(24).toString('hex');
    this.signed.set(token, { key, exp: Date.now() + ttlSec * 1000 });
    return `/api/v1/storage/signed/${token}`;
  }

  resolveSigned(token: string): { data: Buffer; contentType: string } | null {
    const e = this.signed.get(token);
    if (!e || e.exp < Date.now()) {
      this.signed.delete(token);
      return null;
    }
    const abs = this.abs(e.key);
    if (!fs.existsSync(abs)) return null;
    const meta = fs.existsSync(`${abs}.meta.json`)
      ? (JSON.parse(fs.readFileSync(`${abs}.meta.json`, 'utf8')) as { contentType: string })
      : { contentType: 'application/octet-stream' };
    return { data: fs.readFileSync(abs), contentType: meta.contentType };
  }

  createUser(email: string, displayName: string, passwordHash: string): User {
    email = email.toLowerCase();
    if (this.state.users.some((u) => u.email === email)) throw new Error('Email already registered');
    const row: User = {
      id: crypto.randomUUID(),
      email,
      displayName: displayName.slice(0, 64),
      passwordHash,
      createdAt: new Date().toISOString(),
    };
    this.state.users.push(row);
    this.save();
    return row;
  }

  userByEmail(email: string) {
    return this.state.users.find((u) => u.email === email.toLowerCase()) ?? null;
  }

  userById(id: string) {
    return this.state.users.find((u) => u.id === id) ?? null;
  }

  storeRefresh(hash: string, userId: string, exp: number) {
    this.state.refresh = this.state.refresh.filter((t) => t.exp > Date.now() / 1000);
    this.state.refresh.push({ hash, userId, exp });
    this.save();
  }

  revokeRefresh(hash: string) {
    this.state.refresh = this.state.refresh.filter((t) => t.hash !== hash);
    this.save();
  }

  hasRefresh(hash: string, userId: string) {
    return this.state.refresh.some((t) => t.hash === hash && t.userId === userId && t.exp > Date.now() / 1000);
  }

  listMods(q?: string, category?: string) {
    let rows = this.state.mods.filter((m) => m.visibility === 'public');
    if (category) rows = rows.filter((m) => m.categories.includes(category));
    if (q) {
      const n = q.toLowerCase();
      rows = rows.filter(
        (m) => m.title.toLowerCase().includes(n) || m.summary.toLowerCase().includes(n) || m.slug.includes(n),
      );
    }
    return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  getMod(idOrSlug: string) {
    return this.state.mods.find((m) => m.id === idOrSlug || m.slug === idOrSlug) ?? null;
  }

  upsertMod(mod: Mod) {
    const i = this.state.mods.findIndex((m) => m.id === mod.id);
    if (i >= 0) this.state.mods[i] = mod;
    else this.state.mods.push(mod);
    this.save();
  }

  bumpDownload(id: string) {
    const m = this.getMod(id);
    if (!m) return;
    m.downloads += 1;
    m.updatedAt = new Date().toISOString();
    this.save();
  }

  listModels() {
    return this.state.models.filter((m) => m.status === 'published');
  }

  publishModel(row: Model) {
    const i = this.state.models.findIndex((m) => m.id === row.id && m.version === row.version);
    if (i >= 0) this.state.models[i] = row;
    else this.state.models.push(row);
    this.save();
  }
}

function publicMod(m: Mod) {
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

function publicModel(m: Model) {
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

export async function startVytheraOnlineServer(): Promise<http.Server> {
  const cfg = loadOnlineConfig();
  const store = new OnlineStore(cfg.dataDir);
  const metrics = { requests: 0, errors: 0, inference: 0, downloads: 0 };

  const server = http.createServer(async (req, res) => {
    applyHeaders(req, res, cfg);
    if ((req.method || '').toUpperCase() === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    metrics.requests += 1;
    const host = req.headers.host || `${cfg.host}:${cfg.port}`;
    const url = new URL(req.url || '/', `http://${host}`);
    const ip =
      String(req.headers['x-forwarded-for'] ?? '')
        .split(',')[0]
        ?.trim() ||
      req.socket.remoteAddress ||
      'unknown';
    const rl = checkRateLimit(ip, cfg.rateLimitPerMinute);
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
      sendJson(res, 413, { error: e instanceof Error ? e.message : 'Bad body' });
      return;
    }

    const auth = String(req.headers.authorization ?? '');
    const userId = auth.startsWith('Bearer ') ? verifyJwt(auth.slice(7), cfg.jwtSecret, 'access') : null;
    const method = (req.method || 'GET').toUpperCase();
    const p = url.pathname;

    try {
      if (p === '/api/v1/health' && method === 'GET') {
        sendJson(res, 200, {
          status: 'ok',
          services: {
            api: 'ok',
            database: 'ok',
            storage: 'ok',
            inference: cfg.inferenceEnabled ? 'ok' : 'disabled',
          },
          modalities: cfg.inferenceModality,
        });
        return;
      }

      if (p === '/api/v1/auth/register' && method === 'POST') {
        const b = (body ?? {}) as { email?: string; password?: string; displayName?: string };
        const email = String(b.email || '')
          .trim()
          .toLowerCase();
        const password = String(b.password || '');
        const displayName = String(b.displayName || '').trim() || email.split('@')[0] || 'Player';
        if (!email.includes('@') || password.length < 10) {
          sendJson(res, 400, { error: 'Invalid email or password (min 10 chars).' });
          return;
        }
        try {
          const user = store.createUser(email, displayName, hashPassword(password));
          const tokens = issueTokens(user.id, cfg.jwtSecret);
          store.storeRefresh(
            sha256Hex(Buffer.from(tokens.refreshToken)),
            user.id,
            Math.floor(Date.now() / 1000) + 14 * 86400,
          );
          sendJson(res, 201, {
            user: { id: user.id, email: user.email, displayName: user.displayName },
            ...tokens,
          });
        } catch (e) {
          sendJson(res, 409, { error: e instanceof Error ? e.message : 'Register failed' });
        }
        return;
      }

      if (p === '/api/v1/auth/login' && method === 'POST') {
        const b = (body ?? {}) as { email?: string; password?: string };
        const user = store.userByEmail(String(b.email || ''));
        if (!user || !verifyPassword(String(b.password || ''), user.passwordHash)) {
          sendJson(res, 401, { error: 'Invalid credentials.' });
          return;
        }
        const tokens = issueTokens(user.id, cfg.jwtSecret);
        store.storeRefresh(
          sha256Hex(Buffer.from(tokens.refreshToken)),
          user.id,
          Math.floor(Date.now() / 1000) + 14 * 86400,
        );
        sendJson(res, 200, {
          user: { id: user.id, email: user.email, displayName: user.displayName },
          ...tokens,
        });
        return;
      }

      if (p === '/api/v1/auth/refresh' && method === 'POST') {
        const refresh = String((body as { refreshToken?: string } | null)?.refreshToken || '');
        const uid = verifyJwt(refresh, cfg.jwtSecret, 'refresh');
        const hash = sha256Hex(Buffer.from(refresh));
        if (!uid || !store.hasRefresh(hash, uid)) {
          sendJson(res, 401, { error: 'Invalid refresh token.' });
          return;
        }
        store.revokeRefresh(hash);
        const tokens = issueTokens(uid, cfg.jwtSecret);
        store.storeRefresh(
          sha256Hex(Buffer.from(tokens.refreshToken)),
          uid,
          Math.floor(Date.now() / 1000) + 14 * 86400,
        );
        sendJson(res, 200, tokens);
        return;
      }

      if (p === '/api/v1/auth/logout' && method === 'POST') {
        const refresh = String((body as { refreshToken?: string } | null)?.refreshToken || '');
        if (refresh) store.revokeRefresh(sha256Hex(Buffer.from(refresh)));
        sendJson(res, 200, { ok: true });
        return;
      }

      if (p === '/api/v1/auth/me' && method === 'GET') {
        if (!userId) {
          sendJson(res, 401, { error: 'Unauthorized' });
          return;
        }
        const user = store.userById(userId);
        if (!user) {
          sendJson(res, 401, { error: 'Unauthorized' });
          return;
        }
        sendJson(res, 200, { user: { id: user.id, email: user.email, displayName: user.displayName } });
        return;
      }

      if (p === '/api/v1/mods' && method === 'GET') {
        sendJson(res, 200, {
          mods: store
            .listMods(url.searchParams.get('q') || undefined, url.searchParams.get('category') || undefined)
            .map(publicMod),
        });
        return;
      }

      if (p === '/api/v1/search' && method === 'GET') {
        const q = url.searchParams.get('q') || undefined;
        sendJson(res, 200, {
          mods: store.listMods(q).map(publicMod),
          models: store
            .listModels()
            .map(publicModel)
            .filter((m) => !q || m.name.toLowerCase().includes(q.toLowerCase())),
        });
        return;
      }

      if (p === '/api/v1/mods' && method === 'POST') {
        if (!userId) {
          sendJson(res, 401, { error: 'Unauthorized' });
          return;
        }
        const user = store.userById(userId)!;
        const b = (body ?? {}) as {
          slug?: string;
          title?: string;
          summary?: string;
          categories?: string[];
          version?: string;
          changelog?: string;
          compatibility?: string[];
          packageBase64?: string;
        };
        const slug = String(b.slug || '')
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '-')
          .slice(0, 64);
        const title = String(b.title || '')
          .trim()
          .slice(0, 120);
        const pkg = String(b.packageBase64 || '');
        if (!slug || !title || !pkg) {
          sendJson(res, 400, { error: 'slug, title, packageBase64 required.' });
          return;
        }
        if (leaksPrivate(title) || leaksPrivate(String(b.summary || ''))) {
          sendJson(res, 400, { error: 'Metadata contains private markers.' });
          return;
        }
        const bytes = Buffer.from(pkg, 'base64');
        if (bytes.length > cfg.maxBodyBytes) {
          sendJson(res, 413, { error: 'Package too large.' });
          return;
        }
        // Opaque storage only — never execute uploaded mod code on the API server.
        const version = String(b.version || '1.0.0');
        const objectKey = `mods/${slug}/${version}.zip`;
        const put = store.putObject(objectKey, bytes, 'application/zip');
        const existing = store.getMod(slug);
        const now = new Date().toISOString();
        const mod: Mod =
          existing ??
          ({
            id: crypto.randomUUID(),
            slug,
            title,
            summary: String(b.summary || '').slice(0, 500),
            categories: Array.isArray(b.categories) ? b.categories.slice(0, 8).map(String) : [],
            creatorId: user.id,
            creatorName: user.displayName,
            visibility: 'public',
            versions: [],
            downloads: 0,
            createdAt: now,
            updatedAt: now,
          } satisfies Mod);
        if (existing && existing.creatorId !== user.id) {
          sendJson(res, 403, { error: 'Not the mod owner.' });
          return;
        }
        mod.title = title;
        mod.summary = String(b.summary || mod.summary).slice(0, 500);
        mod.categories = Array.isArray(b.categories) ? b.categories.slice(0, 8).map(String) : mod.categories;
        mod.versions.push({
          version,
          changelog: String(b.changelog || '').slice(0, 2000),
          sha256: put.sha256,
          sizeBytes: put.sizeBytes,
          objectKey,
          createdAt: now,
          compatibility: Array.isArray(b.compatibility) ? b.compatibility.map(String) : [],
        });
        mod.updatedAt = now;
        store.upsertMod(mod);
        sendJson(res, 201, { mod: publicMod(mod) });
        return;
      }

      const modGet = p.match(/^\/api\/v1\/mods\/([^/]+)$/);
      if (modGet && method === 'GET') {
        const mod = store.getMod(decodeURIComponent(modGet[1]!));
        if (!mod) {
          sendJson(res, 404, { error: 'Mod not found.' });
          return;
        }
        sendJson(res, 200, {
          mod: publicMod(mod),
          versions: mod.versions.map((v) => ({
            version: v.version,
            sha256: v.sha256,
            sizeBytes: v.sizeBytes,
            changelog: v.changelog,
            compatibility: v.compatibility,
            createdAt: v.createdAt,
          })),
        });
        return;
      }

      const modDl = p.match(/^\/api\/v1\/mods\/([^/]+)\/download$/);
      if (modDl && method === 'GET') {
        const mod = store.getMod(decodeURIComponent(modDl[1]!));
        if (!mod?.versions.length) {
          sendJson(res, 404, { error: 'Mod not found.' });
          return;
        }
        const ver = url.searchParams.get('version');
        const row = ver ? mod.versions.find((v) => v.version === ver) : mod.versions[mod.versions.length - 1];
        if (!row) {
          sendJson(res, 404, { error: 'Version not found.' });
          return;
        }
        const downloadUrl = store.signedUrl(row.objectKey, 300);
        store.bumpDownload(mod.id);
        metrics.downloads += 1;
        sendJson(res, 200, {
          downloadUrl,
          sha256: row.sha256,
          sizeBytes: row.sizeBytes,
          version: row.version,
          expiresInSec: 300,
        });
        return;
      }

      if (p === '/api/v1/models' && method === 'GET') {
        sendJson(res, 200, { models: store.listModels().map(publicModel) });
        return;
      }

      if (p === '/api/v1/models' && method === 'POST') {
        if (!userId) {
          sendJson(res, 401, { error: 'Unauthorized' });
          return;
        }
        const b = (body ?? {}) as Record<string, unknown>;
        const name = String(b.name || '').trim();
        const version = String(b.version || '').trim();
        const description = String(b.description || '');
        if (!name || !version) {
          sendJson(res, 400, { error: 'name and version required.' });
          return;
        }
        if (leaksPrivate(name) || leaksPrivate(description) || leaksPrivate(JSON.stringify(b))) {
          sendJson(res, 400, { error: 'Rejected: private paths/hosts/datasets in metadata.' });
          return;
        }
        if (b.datasetPath || b.localPath || b.trainingLog || b.privateDataset) {
          sendJson(res, 400, { error: 'Rejected: private training artifacts must not be uploaded.' });
          return;
        }
        const row: Model = {
          id: String(b.id || name.toLowerCase().replace(/[^a-z0-9-]/g, '-')).slice(0, 80),
          name: name.slice(0, 120),
          version: version.slice(0, 32),
          modality: String(b.modality) === 'VISION_LANGUAGE' ? 'VISION_LANGUAGE' : 'TEXT',
          baseModel: String(b.baseModel || 'unknown').slice(0, 120),
          adapterVersion: String(b.adapterVersion || version).slice(0, 64),
          status: 'published',
          license: String(b.license || 'proprietary').slice(0, 64),
          description: description.slice(0, 2000),
          creatorId: userId,
          createdAt: new Date().toISOString(),
        };
        store.publishModel(row);
        sendJson(res, 201, { model: publicModel(row) });
        return;
      }

      if (p === '/api/v1/inference/chat' && method === 'POST') {
        if (!userId) {
          sendJson(res, 401, { error: 'Authentication required for online inference.' });
          return;
        }
        if (!cfg.inferenceEnabled || !cfg.inferenceModality.includes('TEXT')) {
          sendJson(res, 503, { error: 'Text inference unavailable.' });
          return;
        }
        const infRl = checkRateLimit(`inf:${userId}`, Math.max(10, Math.floor(cfg.rateLimitPerMinute / 2)));
        if (!infRl.ok) {
          sendJson(res, 429, { error: 'Rate limit exceeded.', retryAfterSec: infRl.retryAfterSec });
          return;
        }
        const b = (body ?? {}) as { messages?: Array<{ role: string; content: string }>; privacy?: string };
        if (String(b.privacy || '').toUpperCase() === 'PRIVATE') {
          sendJson(res, 403, { error: 'PRIVATE data cannot be sent to online inference.' });
          return;
        }
        const messages = Array.isArray(b.messages) ? b.messages.slice(0, 32) : [];
        const last = messages.filter((m) => m.role === 'user').pop();
        const prompt = String(last?.content || '').slice(0, 4000);
        if (!prompt) {
          sendJson(res, 400, { error: 'messages required.' });
          return;
        }
        if (leaksPrivate(prompt)) {
          sendJson(res, 400, { error: 'Request appears to contain private path/host data.' });
          return;
        }
        metrics.inference += 1;
        sendJson(res, 200, {
          provider: 'vythera-online-stub',
          modality: 'TEXT',
          text: `[VYTHERA Online] Received (${prompt.length} chars). Deploy a real inference backend to replace this stub.`,
        });
        return;
      }

      if (p === '/api/v1/inference/vision' && method === 'POST') {
        if (!userId) {
          sendJson(res, 401, { error: 'Authentication required for online inference.' });
          return;
        }
        if (!cfg.inferenceEnabled || !cfg.inferenceModality.includes('VISION_LANGUAGE')) {
          sendJson(res, 503, { error: 'Vision inference not enabled on this deployment.' });
          return;
        }
        const b = (body ?? {}) as { mime?: string; imageBase64?: string; prompt?: string; privacy?: string };
        if (String(b.privacy || '').toUpperCase() === 'PRIVATE') {
          sendJson(res, 403, { error: 'PRIVATE images cannot be sent online.' });
          return;
        }
        const img = validateImage(String(b.mime || ''), String(b.imageBase64 || ''), cfg.maxImageBytes);
        if (!img.ok) {
          sendJson(res, 400, { error: img.error });
          return;
        }
        metrics.inference += 1;
        sendJson(res, 200, {
          provider: 'vythera-online-stub',
          modality: 'VISION_LANGUAGE',
          text: `[VYTHERA Online Vision] Accepted ${img.bytes.length} bytes. Prompt: ${String(b.prompt || '').slice(0, 200)}`,
        });
        return;
      }

      const signed = p.match(/^\/api\/v1\/storage\/signed\/([a-f0-9]+)$/);
      if (signed && method === 'GET') {
        const resolved = store.resolveSigned(signed[1]!);
        if (!resolved) {
          sendJson(res, 404, { error: 'Expired or invalid download.' });
          return;
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', resolved.contentType);
        res.setHeader('Content-Length', String(resolved.data.length));
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.end(resolved.data);
        return;
      }

      if (p === '/api/v1/metrics' && method === 'GET') {
        if (!userId) {
          sendJson(res, 401, { error: 'Unauthorized' });
          return;
        }
        sendJson(res, 200, metrics);
        return;
      }

      sendJson(res, 404, { error: 'Not found' });
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
  console.log(`[vythera-online] listening on http://${cfg.host}:${cfg.port} (private AI/training NOT exposed)`);
  return server;
}
