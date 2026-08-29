import fs from 'fs';
import path from 'path';

const base = path.join(process.cwd(), 'server', 'online');
function w(rel, body) {
  const abs = path.join(base, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
  console.log('wrote', rel);
}

w(
  'auth/passwords.ts',
  `import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return \`scrypt:\${salt.toString('hex')}:\${hash.toString('hex')}\`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltHex, hashHex] = stored.split(':');
  if (algo !== 'scrypt' || !saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
`,
);

w(
  'auth/tokens.ts',
  `import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

export function mintAccessToken(userId: string, secret: string, ttlSec = 60 * 60 * 24 * 7): string {
  const header = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const payload = b64url(Buffer.from(JSON.stringify({ sub: userId, exp })));
  const data = \`\${header}.\${payload}\`;
  const sig = createHmac('sha256', secret).update(data).digest();
  return \`\${data}.\${b64url(sig)}\`;
}

export function verifyAccessToken(token: string, secret: string): { userId: string } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const data = \`\${header}.\${payload}\`;
  const expected = createHmac('sha256', secret).update(data).digest();
  let got: Buffer;
  try {
    got = Buffer.from(sig!, 'base64url');
  } catch {
    return null;
  }
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
  try {
    const body = JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8')) as {
      sub?: string;
      exp?: number;
    };
    if (!body.sub || !body.exp || body.exp * 1000 < Date.now()) return null;
    return { userId: body.sub };
  } catch {
    return null;
  }
}

export function randomId(prefix: string): string {
  return \`\${prefix}_\${randomBytes(10).toString('hex')}\`;
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
  const raw = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(raw);
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
  if (!raw) return null;
  return JSON.parse(raw) as unknown;
}

export function clientKey(req: IncomingMessage): string {
  // Prefer reverse-proxy headers when present; never log the value in responses.
  const xf = String(req.headers['x-forwarded-for'] ?? '')
    .split(',')[0]
    ?.trim();
  return xf || req.socket.remoteAddress || 'unknown';
}
`,
);

w(
  'routes.ts',
  `import { createHash, randomUUID } from 'node:crypto';
import type { OnlineConfig } from './config';
import { hashPassword, verifyPassword } from './auth/passwords';
import { mintAccessToken, randomId, verifyAccessToken } from './auth/tokens';
import type { JsonDb } from './db/JsonDb';
import { sendJson, type Ctx } from './http';
import { validateImageUpload } from './security/uploadSafety';
import type { LocalFsObjectStore } from './storage/LocalFsObjectStore';
import { LocalFsObjectStore as StoreUtil } from './storage/LocalFsObjectStore';

function bearer(req: Ctx['req']): string | null {
  const h = String(req.headers.authorization ?? '');
  const m = /^Bearer\\s+(.+)$/i.exec(h);
  return m?.[1]?.trim() || null;
}

export function attachUser(ctx: Ctx, cfg: OnlineConfig): void {
  const token = bearer(ctx.req);
  if (!token) return;
  const verified = verifyAccessToken(token, cfg.jwtSecret);
  if (verified) ctx.userId = verified.userId;
}

export async function handleRoute(
  ctx: Ctx,
  cfg: OnlineConfig,
  db: JsonDb,
  store: LocalFsObjectStore,
): Promise<boolean> {
  const { method } = ctx.req;
  const p = ctx.url.pathname;

  if (method === 'GET' && p === '/api/v1/health') {
    sendJson(ctx.res, 200, {
      status: 'ok',
      services: {
        api: 'ok',
        database: 'ok',
        storage: 'ok',
        inference: cfg.inferenceEnabled ? 'ok' : 'down',
      },
      inference: { modality: cfg.inferenceModality },
    });
    return true;
  }

  if (method === 'POST' && p === '/api/v1/auth/register') {
    const body = (ctx.body ?? {}) as { username?: string; password?: string };
    const username = String(body.username ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_\\-]/g, '')
      .slice(0, 32);
    const password = String(body.password ?? '');
    if (username.length < 3) return void sendJson(ctx.res, 400, { error: 'Username too short.' });
    if (password.length < 8) return void sendJson(ctx.res, 400, { error: 'Password too short.' });
    if (db.users.some((u) => u.username === username)) {
      return void sendJson(ctx.res, 409, { error: 'Username taken.' });
    }
    const user = {
      id: randomId('usr'),
      username,
      passwordHash: await hashPassword(password),
      createdAt: Date.now(),
    };
    db.users.push(user);
    await db.save();
    const token = mintAccessToken(user.id, cfg.jwtSecret);
    return void sendJson(ctx.res, 201, { token });
  }

  if (method === 'POST' && p === '/api/v1/auth/login') {
    const body = (ctx.body ?? {}) as { username?: string; password?: string };
    const username = String(body.username ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const user = db.users.find((u) => u.username === username);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return void sendJson(ctx.res, 401, { error: 'Invalid credentials.' });
    }
    return void sendJson(ctx.res, 200, { token: mintAccessToken(user.id, cfg.jwtSecret) });
  }

  if (method === 'POST' && p === '/api/v1/auth/logout') {
    return void sendJson(ctx.res, 204, {});
  }

  if (method === 'GET' && p === '/api/v1/mods') {
    const q = (ctx.url.searchParams.get('q') ?? '').toLowerCase();
    let mods = db.mods.slice();
    if (q) {
      mods = mods.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.displayName.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q) ||
          m.author.toLowerCase().includes(q),
      );
    }
    return void sendJson(ctx.res, 200, {
      mods: mods.map((m) => ({
        id: m.id,
        name: m.name,
        displayName: m.displayName,
        description: m.description,
        version: m.version,
        author: m.author,
        category: m.category,
        downloads: m.downloads,
        ratingAvg: m.ratingAvg,
        ratingCount: m.ratingCount,
      })),
    });
  }

  if (method === 'GET' && p.startsWith('/api/v1/mods/') && !p.endsWith('/download')) {
    const id = decodeURIComponent(p.slice('/api/v1/mods/'.length));
    const mod = db.mods.find((m) => m.id === id);
    if (!mod) return void sendJson(ctx.res, 404, { error: 'Mod not found.' });
    return void sendJson(ctx.res, 200, {
      id: mod.id,
      name: mod.name,
      displayName: mod.displayName,
      description: mod.description,
      version: mod.version,
      author: mod.author,
      category: mod.category,
      downloads: mod.downloads,
      ratingAvg: mod.ratingAvg,
      ratingCount: mod.ratingCount,
      packageJson: mod.packageJson,
    });
  }

  if (method === 'GET' && p.endsWith('/download') && p.startsWith('/api/v1/mods/')) {
    const id = decodeURIComponent(p.slice('/api/v1/mods/'.length, -'/download'.length));
    const mod = db.mods.find((m) => m.id === id);
    if (!mod) return void sendJson(ctx.res, 404, { error: 'Mod not found.' });
    mod.downloads += 1;
    await db.save();
    const downloadUrl = await store.signedUrl(mod.packageKey, 600);
    return void sendJson(ctx.res, 200, { downloadUrl, sha256: mod.sha256 });
  }

  if (method === 'POST' && p === '/api/v1/mods') {
    if (!ctx.userId) return void sendJson(ctx.res, 401, { error: 'Authentication required.' });
    const body = (ctx.body ?? {}) as { packageJson?: string };
    const packageJson = String(body.packageJson ?? '');
    if (!packageJson || packageJson.length > cfg.maxBodyBytes) {
      return void sendJson(ctx.res, 400, { error: 'Invalid package.' });
    }
    // Reject private path / loopback leakage in packages
    if (/[A-Za-z]:\\\\|\\/home\\/|\\/Users\\/|127\\.0\\.0\\.1|192\\.168\\./i.test(packageJson)) {
      return void sendJson(ctx.res, 400, { error: 'Package metadata failed privacy validation.' });
    }
    let parsed: {
      manifest?: {
        id?: string;
        name?: string;
        displayName?: string;
        description?: string;
        version?: string;
        author?: string;
        category?: string;
      };
    };
    try {
      parsed = JSON.parse(packageJson) as typeof parsed;
    } catch {
      return void sendJson(ctx.res, 400, { error: 'Package JSON invalid.' });
    }
    const m = parsed.manifest ?? {};
    const id = String(m.id ?? randomId('mod'));
    const author = db.users.find((u) => u.id === ctx.userId)?.username ?? 'creator';
    const buf = Buffer.from(packageJson, 'utf8');
    const sha256 = StoreUtil.sha256(buf);
    const packageKey = \`mods/\${id}/\${Date.now()}.json\`;
    await store.put(packageKey, buf, 'application/json');
    const row = {
      id,
      name: String(m.name ?? id).slice(0, 64),
      displayName: String(m.displayName ?? m.name ?? id).slice(0, 80),
      description: String(m.description ?? '').slice(0, 2000),
      version: String(m.version ?? '0.0.1').slice(0, 32),
      author: String(m.author ?? author).slice(0, 64),
      authorId: ctx.userId,
      category: String(m.category ?? 'other').slice(0, 32),
      downloads: 0,
      ratingAvg: 0,
      ratingCount: 0,
      packageKey,
      sha256,
      packageJson,
      createdAt: Date.now(),
    };
    const idx = db.mods.findIndex((x) => x.id === id);
    if (idx >= 0) db.mods[idx] = row;
    else db.mods.push(row);
    await db.save();
    return void sendJson(ctx.res, 201, { id });
  }

  if (method === 'GET' && p === '/api/v1/models') {
    return void sendJson(ctx.res, 200, {
      models: db.models.filter((m) => m.status === 'published'),
    });
  }

  if (method === 'POST' && p === '/api/v1/models') {
    if (!ctx.userId) return void sendJson(ctx.res, 401, { error: 'Authentication required.' });
    const body = (ctx.body ?? {}) as Record<string, unknown>;
    const probe = JSON.stringify(body);
    if (/[A-Za-z]:\\\\|\\/home\\/|\\/Users\\/|dataset|127\\.0\\.0\\.1/i.test(probe)) {
      return void sendJson(ctx.res, 400, { error: 'Model metadata failed privacy validation.' });
    }
    const id = String(body.id ?? randomId('mdl'))
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '')
      .slice(0, 64);
    const row = {
      id,
      name: String(body.name ?? id).slice(0, 80),
      version: String(body.version ?? '1.0.0').slice(0, 32),
      modality: body.modality === 'VISION_LANGUAGE' ? 'VISION_LANGUAGE' as const : 'TEXT' as const,
      baseModel: String(body.baseModel ?? 'unspecified').slice(0, 120),
      adapterVersion: String(body.adapterVersion ?? body.version ?? '1.0.0').slice(0, 64),
      status: 'published' as const,
      description: String(body.description ?? '').slice(0, 2000),
      license: String(body.license ?? 'Proprietary').slice(0, 120),
      creator: db.users.find((u) => u.id === ctx.userId)?.username ?? 'creator',
      createdAt: Date.now(),
    };
    const idx = db.models.findIndex((m) => m.id === id && m.version === row.version);
    if (idx >= 0) db.models[idx] = row;
    else db.models.push(row);
    await db.save();
    return void sendJson(ctx.res, 201, { id: row.id, version: row.version });
  }

  if (method === 'POST' && p === '/api/v1/inference/chat') {
    if (!ctx.userId) return void sendJson(ctx.res, 401, { error: 'Authentication required.' });
    if (!cfg.inferenceEnabled) return void sendJson(ctx.res, 503, { error: 'Inference unavailable.' });
    const body = (ctx.body ?? {}) as { messages?: Array<{ role?: string; content?: string }> };
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (!messages.length) return void sendJson(ctx.res, 400, { error: 'messages required' });
    const joined = messages.map((m) => String(m.content ?? '')).join('\\n');
    if (/[A-Za-z]:\\\\|\\/home\\/|\\/Users\\//i.test(joined)) {
      return void sendJson(ctx.res, 400, { error: 'Request blocked by privacy policy.' });
    }
    // Placeholder public inference — replace with deployed model server via env later.
    const last = String(messages[messages.length - 1]?.content ?? '').slice(0, 500);
    const text =
      \`[VYTHERA Online] Received your message (\${last.length} chars). \` +
      'Connect a production inference backend to replace this stub response.';
    return void sendJson(ctx.res, 200, { text });
  }

  if (method === 'POST' && p === '/api/v1/inference/vision') {
    if (!ctx.userId) return void sendJson(ctx.res, 401, { error: 'Authentication required.' });
    if (!cfg.inferenceEnabled) return void sendJson(ctx.res, 503, { error: 'Inference unavailable.' });
    if (!cfg.inferenceModality.includes('VISION_LANGUAGE')) {
      return void sendJson(ctx.res, 501, { error: 'Vision inference is not enabled on this deployment.' });
    }
    const body = (ctx.body ?? {}) as { prompt?: string; imageBase64?: string; mime?: string };
    const img = validateImageUpload({
      mime: String(body.mime ?? ''),
      base64: String(body.imageBase64 ?? ''),
      maxBytes: cfg.maxImageBytes,
    });
    if (!img.ok) return void sendJson(ctx.res, 400, { error: img.error });
    // Do not persist uploaded images by default.
    const text =
      '[VYTHERA Online Vision] Image accepted and discarded after request. ' +
      'Wire a production VLM endpoint to replace this stub.';
    return void sendJson(ctx.res, 200, { text });
  }

  if (method === 'GET' && p.startsWith('/api/v1/storage/')) {
    const token = p.slice('/api/v1/storage/'.length);
    const key = store.resolveToken(token);
    if (!key) return void sendJson(ctx.res, 404, { error: 'Expired or invalid download.' });
    const buf = await store.get(key);
    if (!buf) return void sendJson(ctx.res, 404, { error: 'Object missing.' });
    ctx.res.statusCode = 200;
    ctx.res.setHeader('Content-Type', 'application/octet-stream');
    ctx.res.setHeader('Content-Length', String(buf.length));
    ctx.res.end(buf);
    return true;
  }

  return false;
}

// silence unused import in some TS configs
void createHash;
void randomUUID;
`,
);

w(
  'index.ts',
  `/**
 * VYTHERA Online API — cloud/VPS service.
 * Does NOT host local Ollama, training daemon, or private datasets.
 * Default bind: 127.0.0.1 (local online-service development).
 * Cloud: VYTHERA_ONLINE_HOST=0.0.0.0 VYTHERA_ONLINE_ALLOW_PUBLIC_BIND=1
 */
import http from 'node:http';
import { loadOnlineConfig } from './config';
import { JsonDb } from './db/JsonDb';
import { applySecurityHeaders } from './security/headers';
import { rateLimit } from './security/rateLimit';
import { LocalFsObjectStore } from './storage/LocalFsObjectStore';
import { attachUser, handleRoute } from './routes';
import { clientKey, readBody, sendJson, type Ctx } from './http';

async function main(): Promise<void> {
  const cfg = loadOnlineConfig();
  const db = new JsonDb(cfg.dataDir);
  await db.load();
  const store = new LocalFsObjectStore(cfg.dataDir + '/objects');

  const server = http.createServer(async (req, res) => {
    applySecurityHeaders(req, res, cfg);
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    const rl = rateLimit(clientKey(req), cfg.rateLimitPerMinute);
    if (!rl.ok) {
      res.setHeader('Retry-After', String(rl.retryAfterSec));
      sendJson(res, 429, { error: 'Rate limit exceeded.' });
      return;
    }

    let body: unknown = null;
    try {
      if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
        body = await readBody(req, cfg.maxBodyBytes);
      }
    } catch (e) {
      sendJson(res, 413, { error: e instanceof Error ? e.message : 'Bad payload' });
      return;
    }

    const host = req.headers.host || \`\${cfg.host}:\${cfg.port}\`;
    const url = new URL(req.url || '/', \`http://\${host}\`);
    const ctx: Ctx = { req, res, url, body, userId: null };
    attachUser(ctx, cfg);

    try {
      const handled = await handleRoute(ctx, cfg, db, store);
      if (!handled) sendJson(res, 404, { error: 'Not found' });
    } catch (e) {
      sendJson(res, 500, { error: 'Internal error' });
      // Avoid logging secrets / bodies
      console.error('[vythera-online]', e instanceof Error ? e.message : 'error');
    }
  });

  server.listen(cfg.port, cfg.host, () => {
    console.log(\`VYTHERA Online API listening on \${cfg.host}:\${cfg.port}\`);
    console.log('Private AI/training remain on the developer PC (loopback only).');
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
`,
);

console.log('server routes+index done');
