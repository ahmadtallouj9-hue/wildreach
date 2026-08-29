import fs from 'fs';
import path from 'path';

const root = path.join(process.cwd(), 'server', 'online');
fs.rmSync(root, { recursive: true, force: true });
fs.mkdirSync(root, { recursive: true });

function w(name, body) {
  fs.writeFileSync(path.join(root, name), body);
  console.log('wrote', name);
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
  return /[A-Za-z]:\\\\|\\/home\\/|\\/Users\\/|127\\.0\\.0\\.1|192\\.168\\.|10\\.\\d+\\.|172\\.(1[6-9]|2\\d|3[0-1])\\.|dataset/i.test(
    text,
  );
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
    accessToken: sign({ sub: userId, exp: now + 3600, typ: 'access' }, cfg.jwtSecret),
    refreshToken: sign({ sub: userId, exp: now + 14 * 86400, typ: 'refresh' }, cfg.jwtSecret),
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

console.log('phase1 done');
