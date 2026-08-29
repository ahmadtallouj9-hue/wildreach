import fs from 'fs';
import path from 'path';

const root = path.join(process.cwd(), 'server', 'online');

function w(name, body) {
  fs.writeFileSync(path.join(root, name), body);
  console.log('wrote', name);
}

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
  private signed = new Map<string, { key: string; exp: number }>();

  constructor(root: string, _signingSecret: string) {
    this.root = root;
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

console.log('phase2a done');
