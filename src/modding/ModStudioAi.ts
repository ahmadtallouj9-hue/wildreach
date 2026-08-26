/**
 * Studio AI — turn free-form text into model / texture / animation / behavior / particle actions.
 * Fuzzy matching so typos like “file ball” still mean fireball.
 */

import type { ShapeStarterId } from './ShapeStarters';
import { interpretModLine, type InterpretResult } from './ModAiInterpreter';
import type { ModRule } from './ModLogicParser';

export type StudioAiAction =
  | { kind: 'starter'; id: ShapeStarterId; summary: string }
  | { kind: 'texture_color'; name: string; rgb: [number, number, number]; summary: string }
  | { kind: 'anim_preset'; preset: 'spin' | 'bounce' | 'wave' | 'idle'; summary: string }
  | { kind: 'particles'; style: ParticleStyle; color: [number, number, number]; summary: string }
  | { kind: 'behavior'; rule: ModRule; summary: string };

export type ParticleStyle =
  | 'sparkle'
  | 'fire'
  | 'smoke'
  | 'magic'
  | 'burst'
  | 'trail'
  | 'hearts'
  | 'snow';

export interface StudioAiResult {
  actions: StudioAiAction[];
  error: string | null;
  /** Friendly one-line confirmation. */
  summary: string | null;
}

const COLOR_WORDS: { word: string; rgb: [number, number, number] }[] = [
  { word: 'red', rgb: [0.86, 0.28, 0.28] },
  { word: 'crimson', rgb: [0.72, 0.12, 0.22] },
  { word: 'orange', rgb: [0.92, 0.55, 0.22] },
  { word: 'yellow', rgb: [0.95, 0.82, 0.28] },
  { word: 'gold', rgb: [0.9, 0.74, 0.28] },
  { word: 'green', rgb: [0.32, 0.72, 0.42] },
  { word: 'lime', rgb: [0.62, 0.88, 0.28] },
  { word: 'blue', rgb: [0.28, 0.48, 0.86] },
  { word: 'sky', rgb: [0.48, 0.72, 0.94] },
  { word: 'cyan', rgb: [0.28, 0.82, 0.88] },
  { word: 'teal', rgb: [0.22, 0.72, 0.68] },
  { word: 'purple', rgb: [0.58, 0.36, 0.82] },
  { word: 'pink', rgb: [0.9, 0.45, 0.68] },
  { word: 'white', rgb: [0.94, 0.95, 0.97] },
  { word: 'black', rgb: [0.12, 0.13, 0.15] },
  { word: 'brown', rgb: [0.52, 0.35, 0.22] },
  { word: 'gray', rgb: [0.5, 0.52, 0.55] },
  { word: 'grey', rgb: [0.5, 0.52, 0.55] },
];

const STARTER_HINTS: { id: ShapeStarterId; words: string[] }[] = [
  { id: 'sword', words: ['sword', 'blade', 'weapon', 'katana', 'dagger'] },
  { id: 'dragon', words: ['dragon', 'drake', 'wyvern', 'lizard boss'] },
  { id: 'animal', words: ['animal', 'dog', 'wolf', 'cat', 'beast', 'creature', 'quadruped'] },
  { id: 'character', words: ['character', 'person', 'human', 'steve', 'player', 'humanoid', 'avatar'] },
];

const ANIM_HINTS: { preset: 'spin' | 'bounce' | 'wave' | 'idle'; words: string[] }[] = [
  { preset: 'spin', words: ['spin anim', 'spin animation', 'rotate animation', 'twirl anim', 'make it spin', 'spinning animation'] },
  { preset: 'bounce', words: ['bounce anim', 'bounce animation', 'hop animation', 'jump anim'] },
  { preset: 'wave', words: ['wave anim', 'wave animation', 'wiggle', 'sway'] },
  { preset: 'idle', words: ['idle anim', 'idle animation', 'breathing', 'idle loop'] },
];

const PARTICLE_HINTS: { style: ParticleStyle; words: string[] }[] = [
  { style: 'fire', words: ['fire particles', 'flame particles', 'embers', 'fire fx'] },
  { style: 'smoke', words: ['smoke', 'smoke particles', 'fog'] },
  { style: 'magic', words: ['magic particles', 'mana', 'arcane', 'magic fx'] },
  { style: 'burst', words: ['particle burst', 'burst particles', 'explode particles'] },
  { style: 'trail', words: ['particle trail', 'leave particles'] },
  { style: 'hearts', words: ['hearts', 'heart particles', 'love particles'] },
  { style: 'snow', words: ['snow', 'snow particles', 'flakes'] },
  { style: 'sparkle', words: ['particles', 'sparkles', 'sparkle fx', 'glitter fx', 'add particles'] },
];

function norm(text: string): string {
  return text
    .toLowerCase()
    .replace(/file\s*ball/g, 'fireball')
    .replace(/\bfile\b/g, 'fire')
    .replace(/\bfire\s+ball\b/g, 'fireball')
    .replace(/[^\w\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Levenshtein distance — small strings only. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) row[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]!;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + cost);
      prev = tmp;
    }
  }
  return row[b.length]!;
}

function fuzzyHas(hay: string, needle: string): boolean {
  if (hay.includes(needle)) return true;
  if (needle.length < 3) return false;
  const tokens = hay.split(' ');
  const maxDist = needle.length <= 4 ? 1 : 2;
  for (const t of tokens) {
    if (Math.abs(t.length - needle.length) > maxDist) continue;
    if (editDistance(t, needle) <= maxDist) return true;
  }
  return false;
}

function detectColor(text: string): { name: string; rgb: [number, number, number] } | null {
  for (const c of COLOR_WORDS) {
    if (fuzzyHas(text, c.word)) return { name: c.word, rgb: c.rgb };
  }
  return null;
}

function isBuildIntent(text: string): boolean {
  // “make it shoot…” is behavior, not model build.
  if (/\bmake it\b/.test(text) && /\b(shoot|explode|glow|spin|bounce|trail|sparkle|teleport)\b/.test(text)) {
    return false;
  }
  const hasStarterWord = STARTER_HINTS.some((s) => s.words.some((w) => fuzzyHas(text, w)));
  if (!hasStarterWord) return false;
  return /\b(make|build|create|generate|sculpt|model|shape|add a|spawn a)\b/.test(text) || hasStarterWord;
}

function isTextureIntent(text: string): boolean {
  return /\b(paint|texture|color|colour|dye|tint|recolor|recolour)\b/.test(text);
}

function isAnimIntent(text: string): boolean {
  return /\b(animat|animation|keyframe|timeline|pose)\b/.test(text) ||
    ANIM_HINTS.some((a) => a.words.some((w) => text.includes(w)));
}

function isParticleIntent(text: string): boolean {
  if (!/\b(particle|particles|sparkle|sparkles|embers|smoke|snow|fx)\b/.test(text)) {
    // Allow “fire particles” style phrases via word list exact includes only
    return PARTICLE_HINTS.some((p) => p.words.some((w) => text.includes(w)));
  }
  return true;
}

function detectStarter(text: string): ShapeStarterId | null {
  let best: ShapeStarterId | null = null;
  let bestLen = 0;
  for (const { id, words } of STARTER_HINTS) {
    for (const w of words) {
      // Prefer exact / substring match over fuzzy to avoid shoot≈sword.
      if (text.includes(w) && w.length > bestLen) {
        best = id;
        bestLen = w.length;
      }
    }
  }
  return best;
}

function detectAnim(text: string): 'spin' | 'bounce' | 'wave' | 'idle' | null {
  for (const { preset, words } of ANIM_HINTS) {
    for (const w of words) {
      if (text.includes(w) || fuzzyHas(text, w)) return preset;
    }
  }
  if (/\bspin\b/.test(text)) return 'spin';
  if (/\bbounce\b|\bhop\b/.test(text)) return 'bounce';
  if (/\bwave\b|\bwiggle\b/.test(text)) return 'wave';
  if (/\bidle\b/.test(text)) return 'idle';
  return null;
}

function detectParticle(text: string): ParticleStyle {
  let best: ParticleStyle = 'sparkle';
  let bestLen = 0;
  for (const { style, words } of PARTICLE_HINTS) {
    for (const w of words) {
      if ((text.includes(w) || fuzzyHas(text, w)) && w.length > bestLen) {
        best = style;
        bestLen = w.length;
      }
    }
  }
  if (/\bfire\b|\bflame\b/.test(text)) return 'fire';
  return best;
}

/**
 * Parse a free-form studio prompt into one or more actions.
 * Can combine: “make a blue dragon with fire particles” → starter + texture + particles.
 */
export function interpretStudioAi(raw: string): StudioAiResult {
  const line = raw.trim();
  if (!line) return { actions: [], error: null, summary: null };

  const text = norm(line);
  const actions: StudioAiAction[] = [];
  const color = detectColor(text);

  // Build / model — only with an explicit starter word
  if (isBuildIntent(text)) {
    const id = detectStarter(text);
    if (id) {
      actions.push({
        kind: 'starter',
        id,
        summary: `Build ${id} starter`,
      });
    }
  }

  // Texture / color — only when clearly asked to paint/tint (not just “blue fireball”)
  if (isTextureIntent(text)) {
    const c = color ?? { name: 'teal', rgb: [0.22, 0.72, 0.68] as [number, number, number] };
    actions.push({
      kind: 'texture_color',
      name: c.name,
      rgb: c.rgb,
      summary: `Paint ${c.name}`,
    });
  }

  // Animation
  if (isAnimIntent(text)) {
    const preset = detectAnim(text) ?? 'spin';
    actions.push({
      kind: 'anim_preset',
      preset,
      summary: `Animation: ${preset}`,
    });
  }

  // Particles — only when clearly asked
  if (isParticleIntent(text) || /\bparticles?\b/.test(text)) {
    const style = detectParticle(text);
    const rgb =
      color?.rgb ??
      (style === 'fire'
        ? ([0.95, 0.45, 0.15] as [number, number, number])
        : ([0.6, 0.9, 1] as [number, number, number]));
    actions.push({
      kind: 'particles',
      style,
      color: rgb,
      summary: `${style} particles`,
    });
  }

  // Behavior — only with a trigger / action verb (avoid “paint it blue” → random power)
  const hasBehaviorCue =
    /\b(when|clicked|click|used|use|spawned|spawn|always|constantly|collision|collide|shoot|fireball|explode|glow|teleport|damage|heal|summon|trail|sparkle|bounce|shake)\b/.test(
      text,
    ) || fuzzyHas(text, 'fireball');

  if (hasBehaviorCue) {
    const behavior: InterpretResult = interpretModLine(line);
    if (behavior.rule) {
      if (
        color &&
        (behavior.rule.command === 'shoot_fireball' ||
          behavior.rule.command === 'sparkle' ||
          behavior.rule.command === 'trail' ||
          behavior.rule.command === 'particles')
      ) {
        behavior.rule = {
          ...behavior.rule,
          args: [color.name],
        };
      }
      actions.push({
        kind: 'behavior',
        rule: behavior.rule,
        summary: behavior.summary ?? behavior.rule.command,
      });
    }
  }

  // Fallback: shoot / ball phrases without other actions
  if (!actions.length && (fuzzyHas(text, 'shoot') || fuzzyHas(text, 'fireball') || /\bball\b/.test(text))) {
    const c = color?.name;
    actions.push({
      kind: 'behavior',
      rule: {
        trigger: 'on_click',
        command: 'shoot_fireball',
        args: c ? [c] : [],
        source: line,
      },
      summary: `When clicked → Shoot fireball${c ? ` (${c})` : ''}`,
    });
    actions.push({
      kind: 'particles',
      style: 'fire',
      color: color?.rgb ?? [0.95, 0.45, 0.15],
      summary: 'Fire particles',
    });
  }

  if (!actions.length) {
    return {
      actions: [],
      error:
        `Could not understand “${line}”. Try: “make a dragon”, “paint it blue”, “spin animation”, “fire particles”, or “shoot blue fireball when clicked”.`,
      summary: null,
    };
  }

  return {
    actions,
    error: null,
    summary: actions.map((a) => a.summary).join(' · '),
  };
}

export function studioAiLivePreview(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const r = interpretStudioAi(trimmed);
  if (r.error) return r.error;
  return r.summary ? `✓ ${r.summary}` : null;
}
