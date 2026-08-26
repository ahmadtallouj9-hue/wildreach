import { Block } from '../../world/blocks';
import { LOCAL_GRID_SIZE } from '../../modding/constants';
import type { VytheraEditorHost, VytheraEditorSnapshot } from '../host/VytheraEditorHost';
import { vytheraKnowledge } from '../knowledge/VytheraKnowledgeBase';
import { vytheraMemory } from '../memory/VytheraMemory';
import { searchVisualConcepts } from '../vision/learning/VytheraVisualConcepts';
import { activeVisionAdapter } from '../vision/learning/VytheraVisionAdapters';

/** Selects only relevant editor/project context for the current user intent. */
export class VytheraContextEngine {
  snapshot(host: VytheraEditorHost): VytheraEditorSnapshot {
    const s = LOCAL_GRID_SIZE;
    let count = 0;
    let minX = s,
      minY = s,
      minZ = s,
      maxX = 0,
      maxY = 0,
      maxZ = 0;
    for (let y = 0; y < s; y++) {
      for (let z = 0; z < s; z++) {
        for (let x = 0; x < s; x++) {
          if (host.grid.get(x, y, z) === Block.Air) continue;
          count++;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          minZ = Math.min(minZ, z);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
          maxZ = Math.max(maxZ, z);
        }
      }
    }
    return {
      projectName: host.projectName,
      voxelCount: count,
      bounds: count ? `[${minX}-${maxX},${minY}-${maxY},${minZ}-${maxZ}]` : 'empty',
      parts: host.parts.map((p) => p.name),
      scriptCount: host.scripts.length,
      scriptsPreview: host.scripts.slice(0, 8),
      paletteNames: host.palette.list().slice(0, 24).map((m) => m.name),
    };
  }

  /** Intelligent context pack for a user prompt — not a full project dump. */
  buildPromptContext(host: VytheraEditorHost, userPrompt: string): string {
    const snap = this.snapshot(host);
    const t = userPrompt.toLowerCase();
    const chunks: string[] = [
      `Project: ${snap.projectName}`,
      `Voxels: ${snap.voxelCount} ${snap.bounds}`,
      `Parts: ${snap.parts.join(', ') || 'Body'}`,
    ];

    if (/\b(leg|arm|wing|horn|tail|head|body|character|dragon|creature)\b/.test(t)) {
      chunks.push(`Skeleton/parts in focus: ${snap.parts.join(', ')}`);
    }
    if (/\b(behavior|click|glow|bounce|spawn|touch|power)\b/.test(t)) {
      chunks.push(`Behaviors (${snap.scriptCount}): ${snap.scriptsPreview.join(' | ') || 'none'}`);
    }
    if (/\b(palette|color|skin|moss|material|recolor)\b/.test(t)) {
      chunks.push(`Palette: ${snap.paletteNames.join(', ') || 'default'}`);
    }
    if (/\b(anim|walk|run|idle|jump|bone|clip)\b/.test(t)) {
      chunks.push(`Animation bones: ${snap.parts.join(', ')}`);
    }
    if (/\b(world|biome|terrain|mountain|city)\b/.test(t)) {
      const docs = vytheraKnowledge.search('world biome terrain', 2);
      chunks.push(...docs.map((d) => `Knowledge[${d.title}]: ${d.body.slice(0, 200)}`));
    }

    const mem = vytheraMemory.search(userPrompt, 4);
    if (mem.length) {
      chunks.push('Memory:');
      chunks.push(...mem.map((m) => `- (${m.category}) ${m.text}`));
    }

    const know = vytheraKnowledge.search(userPrompt, 3);
    if (know.length) {
      chunks.push('Knowledge:');
      chunks.push(...know.map((d) => `- ${d.title}: ${d.body.slice(0, 180)}`));
    }

    const visual = searchVisualConcepts(userPrompt, 3);
    if (visual.length) {
      chunks.push('Visual concepts (retrieval — not fine-tuned weights):');
      chunks.push(
        ...visual.map(
          (c) => `- ${c.name} [${c.archetype}]: ${c.voxelHints.generationRecipe.slice(0, 160)}`,
        ),
      );
    }
    const adapter = activeVisionAdapter();
    if (adapter) {
      chunks.push(`Active vision adapter: ${adapter.name} (${adapter.lifecycle})`);
    }

    return chunks.join('\n');
  }
}

export const vytheraContext = new VytheraContextEngine();
