import fs from 'fs';
import path from 'path';

const root = path.join(process.cwd(), 'server', 'online');
function w(name, body) {
  fs.writeFileSync(path.join(root, name), body);
  console.log('wrote', name);
}

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

export function authenticateRequest(authHeader: string | undefined, cfg: OnlineConfig): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return verifyAccessToken(authHeader.slice(7), cfg);
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
    if (!ctx.userId) {
      sendJson(ctx.res, 401, { error: 'Unauthorized' });
      return true;
    }
    const user = db.findUserById(ctx.userId);
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

  if (pathname === '/api/v1/search' && method === 'GET') {
    const q = ctx.url.searchParams.get('q') || undefined;
    sendJson(ctx.res, 200, {
      mods: db.listMods(q).map(publicMod),
      models: db.listModels().map(publicModel).filter((m) => !q || m.name.toLowerCase().includes(q.toLowerCase())),
    });
    return true;
  }

  if (pathname === '/api/v1/mods' && method === 'POST') {
    if (!ctx.userId) {
      sendJson(ctx.res, 401, { error: 'Unauthorized' });
      return true;
    }
    const user = db.findUserById(ctx.userId)!;
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
    const mod: ModRow =
      existing ??
      ({
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
      } satisfies ModRow);
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
    const mod = db.getMod(decodeURIComponent(modMatch[1]!));
    if (!mod) {
      sendJson(ctx.res, 404, { error: 'Mod not found.' });
      return true;
    }
    sendJson(ctx.res, 200, {
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
    return true;
  }

  const dlMatch = pathname.match(/^\\/api\\/v1\\/mods\\/([^/]+)\\/download$/);
  if (dlMatch && method === 'GET') {
    const mod = db.getMod(decodeURIComponent(dlMatch[1]!));
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
    if (!ctx.userId) {
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
      creatorId: ctx.userId,
      createdAt: new Date().toISOString(),
    };
    db.publishModel(row);
    sendJson(ctx.res, 201, { model: publicModel(row) });
    return true;
  }

  if (pathname === '/api/v1/inference/chat' && method === 'POST') {
    if (!ctx.userId) {
      sendJson(ctx.res, 401, { error: 'Authentication required for online inference.' });
      return true;
    }
    if (!cfg.inferenceEnabled || !cfg.inferenceModality.includes('TEXT')) {
      sendJson(ctx.res, 503, { error: 'Text inference unavailable.' });
      return true;
    }
    const rl = rateLimit(\`inf:\${ctx.userId}\`, Math.max(10, Math.floor(cfg.rateLimitPerMinute / 2)));
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
    sendJson(ctx.res, 200, {
      provider: 'vythera-online-stub',
      modality: 'TEXT',
      text: \`[VYTHERA Online] Received (\${prompt.length} chars). Deploy a real inference backend to replace this stub.\`,
    });
    return true;
  }

  if (pathname === '/api/v1/inference/vision' && method === 'POST') {
    if (!ctx.userId) {
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
    sendJson(ctx.res, 200, {
      provider: 'vythera-online-stub',
      modality: 'VISION_LANGUAGE',
      text: \`[VYTHERA Online Vision] Accepted \${img.bytes.length} bytes. Prompt: \${String(body.prompt || '').slice(0, 200)}\`,
    });
    return true;
  }

  const signed = pathname.match(/^\\/api\\/v1\\/storage\\/signed\\/([a-f0-9]+)$/);
  if (signed && method === 'GET') {
    const resolved = await store.resolveSigned(signed[1]!);
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
    if (!ctx.userId) {
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
      if (!handled) sendJson(res, 404, { error: 'Not found' });
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

const entry = process.argv[1] ?? '';
if (entry.includes('online') && (entry.endsWith('index.ts') || entry.endsWith('index.js'))) {
  startVytheraOnlineServer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
`,
);

console.log('phase2b done');
