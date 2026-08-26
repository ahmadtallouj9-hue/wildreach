import { lsGet, lsSet } from '../util/safeStorage';

/** Persistent local VYTHERA memory — separate from knowledge & training data. */

export type VytheraMemoryCategory =
  | 'GLOBAL_GAME'
  | 'PROJECT'
  | 'WORLD'
  | 'ASSET'
  | 'CHARACTER'
  | 'SESSION'
  | 'USER_PREFERENCE'
  | 'TASK';

export interface VytheraMemoryEntry {
  id: string;
  category: VytheraMemoryCategory;
  text: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

const KEY = 'vythera.ai.memory';

export class VytheraMemory {
  private entries: VytheraMemoryEntry[] = [];

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      this.entries = JSON.parse(lsGet(KEY) ?? '[]') as VytheraMemoryEntry[];
    } catch {
      this.entries = [];
    }
  }

  private save(): void {
    lsSet(KEY, JSON.stringify(this.entries.slice(0, 500)));
  }

  list(category?: VytheraMemoryCategory): VytheraMemoryEntry[] {
    return category ? this.entries.filter((e) => e.category === category) : [...this.entries];
  }

  remember(text: string, category: VytheraMemoryCategory = 'PROJECT', tags: string[] = []): VytheraMemoryEntry {
    const now = Date.now();
    const entry: VytheraMemoryEntry = {
      id: `mem_${now}_${Math.random().toString(36).slice(2, 7)}`,
      category,
      text: text.trim().slice(0, 2000),
      tags,
      createdAt: now,
      updatedAt: now,
    };
    this.entries.unshift(entry);
    this.save();
    return entry;
  }

  forget(id: string): boolean {
    const n = this.entries.length;
    this.entries = this.entries.filter((e) => e.id !== id);
    this.save();
    return this.entries.length < n;
  }

  update(id: string, text: string): boolean {
    const e = this.entries.find((x) => x.id === id);
    if (!e) return false;
    e.text = text.trim().slice(0, 2000);
    e.updatedAt = Date.now();
    this.save();
    return true;
  }

  search(query: string, limit = 8): VytheraMemoryEntry[] {
    const q = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!q.length) return this.list().slice(0, limit);
    return this.entries
      .map((e) => ({
        e,
        score: q.reduce((s, w) => s + (e.text.toLowerCase().includes(w) ? 1 : 0) + (e.tags.some((t) => t.includes(w)) ? 1 : 0), 0),
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => x.e);
  }

  clearSession(): void {
    this.entries = this.entries.filter((e) => e.category !== 'SESSION');
    this.save();
  }
}

export const vytheraMemory = new VytheraMemory();
