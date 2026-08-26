import { buildVytheraGameSpec, type VytheraGameSpec } from '../game/VytheraGameSpec';
import { listModCommands } from '../../modding/ModCommandBinder';
import { LOCAL_GRID_SIZE } from '../../modding/constants';
import { lsGet, lsSet } from '../util/safeStorage';

export interface VytheraKnowledgeDoc {
  id: string;
  title: string;
  source: string;
  tags: string[];
  body: string;
  updatedAt: number;
}

const KEY = 'vythera.ai.knowledge';

/** Local VYTHERA knowledge base — ingestion → index → retrieval. Never remote. */
export class VytheraKnowledgeBase {
  private docs: VytheraKnowledgeDoc[] = [];
  private spec: VytheraGameSpec;

  constructor() {
    this.spec = buildVytheraGameSpec();
    this.load();
    if (!this.docs.length) this.seedFromGame();
  }

  private load(): void {
    try {
      this.docs = JSON.parse(lsGet(KEY) ?? '[]') as VytheraKnowledgeDoc[];
    } catch {
      this.docs = [];
    }
  }

  private save(): void {
    lsSet(KEY, JSON.stringify(this.docs.slice(0, 200)));
  }

  /** Seed from live VYTHERA engine metadata (not hallucinated). */
  seedFromGame(): void {
    const cmds = listModCommands();
    this.upsert({
      id: 'spec',
      title: 'VYTHERA Game Spec',
      source: 'engine',
      tags: ['identity', 'rules'],
      body: JSON.stringify(this.spec, null, 2),
      updatedAt: Date.now(),
    });
    this.upsert({
      id: 'behaviors',
      title: 'VYTHERA Behavior Commands',
      source: 'ModCommandBinder',
      tags: ['behavior', 'tools'],
      body: cmds.map((c) => `${c.id}: ${c.description}`).join('\n'),
      updatedAt: Date.now(),
    });
    this.upsert({
      id: 'voxel',
      title: 'VYTHERA Voxel Workspace',
      source: 'constants',
      tags: ['voxel', 'editor'],
      body: `Local editor grid is ${LOCAL_GRID_SIZE}³. Sparse voxel JSON with RGBA. Index: x+z*S+y*S².`,
      updatedAt: Date.now(),
    });
    this.upsert({
      id: 'world-gen',
      title: 'VYTHERA World Generation Modules',
      source: 'world/gen',
      tags: ['world', 'terrain'],
      body: this.spec.world.generationModules.join(', '),
      updatedAt: Date.now(),
    });
    this.upsert({
      id: 'style',
      title: 'VYTHERA Style Rules',
      source: 'gameSpec',
      tags: ['style', 'creatures'],
      body: this.spec.styleRules.join('\n'),
      updatedAt: Date.now(),
    });
  }

  upsert(doc: VytheraKnowledgeDoc): void {
    const i = this.docs.findIndex((d) => d.id === doc.id);
    if (i >= 0) this.docs[i] = doc;
    else this.docs.unshift(doc);
    this.save();
  }

  ingestText(id: string, title: string, source: string, body: string, tags: string[] = []): void {
    this.upsert({
      id,
      title,
      source,
      tags,
      body: body.slice(0, 50_000),
      updatedAt: Date.now(),
    });
  }

  list(): VytheraKnowledgeDoc[] {
    return [...this.docs];
  }

  search(query: string, limit = 6): VytheraKnowledgeDoc[] {
    const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    if (!words.length) return this.docs.slice(0, limit);
    return this.docs
      .map((d) => {
        const hay = `${d.title} ${d.tags.join(' ')} ${d.body}`.toLowerCase();
        const score = words.reduce((s, w) => s + (hay.includes(w) ? 1 : 0), 0);
        return { d, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => x.d);
  }

  getSpec(): VytheraGameSpec {
    return this.spec;
  }
}

export const vytheraKnowledge = new VytheraKnowledgeBase();
