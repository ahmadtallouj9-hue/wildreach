import { isKnownCommand, listModCommands, MOD_COMMAND_REGISTRY } from './ModCommandBinder';
import type { ModRule, ModTrigger } from './ModLogicParser';
import { parseModLine } from './ModLogicParser';

export interface InterpretResult {
  rule: ModRule | null;
  summary: string | null;
  error: string | null;
}

export interface TriggerMeta {
  trigger: ModTrigger;
  label: string;
  short: string;
  icon: string;
}

export const TRIGGER_META: Record<ModTrigger, TriggerMeta> = {
  on_click: { trigger: 'on_click', label: 'When clicked', short: 'Click', icon: '🖱️' },
  on_use: { trigger: 'on_use', label: 'When used', short: 'Use', icon: '🤚' },
  on_spawn: { trigger: 'on_spawn', label: 'When spawned', short: 'Spawn', icon: '🌱' },
  on_tick: { trigger: 'on_tick', label: 'Continuously', short: 'Always', icon: '♾️' },
  on_collision: { trigger: 'on_collision', label: 'On collision', short: 'Hit', icon: '💢' },
};

const TRIGGER_HINTS: { trigger: ModTrigger; words: string[] }[] = [
  { trigger: 'on_click', words: ['click', 'clicked', 'tap', 'tapped', 'left click', 'when i click', 'on click'] },
  { trigger: 'on_use', words: ['use', 'used', 'interact', 'right click', 'when i use', 'on use', 'activate'] },
  { trigger: 'on_spawn', words: ['spawn', 'spawned', 'appear', 'created', 'when spawned', 'on spawn', 'when it appears'] },
  { trigger: 'on_tick', words: ['always', 'constantly', 'every frame', 'over time', 'continuously', 'on tick', 'keep', 'trail'] },
  { trigger: 'on_collision', words: ['collision', 'collide', 'hit', 'bump', 'touch', 'when hit', 'on collision', 'when colliding'] },
];

const COMMAND_HINTS: { command: string; words: string[] }[] = [
  {
    command: 'shoot_fireball',
    words: [
      'fireball',
      'fire ball',
      'shoot fire',
      'launch fire',
      'flame',
      'shoot a fireball',
      'shoot ball',
      'shoot a ball',
      'blue ball',
      'fire blue',
      'projectile',
      'blast',
      'shoot',
    ],
  },
  { command: 'glow', words: ['glow', 'light up', 'shine', 'luminous', 'emit light', 'glowing'] },
  { command: 'sparkle', words: ['sparkle', 'glitter', 'particles', 'spark', 'sparkles', 'particle'] },
  { command: 'bounce', words: ['bounce', 'hop', 'jump', 'bouncing'] },
  { command: 'explode', words: ['explode', 'explosion', 'burst', 'blow up', 'detonate'] },
  { command: 'teleport', words: ['teleport', 'blink', 'warp', 'phase'] },
  { command: 'spin', words: ['spin', 'rotate fast', 'twirl'] },
  { command: 'grow', words: ['grow', 'bigger', 'enlarge', 'scale up'] },
  { command: 'shrink', words: ['shrink', 'smaller', 'scale down', 'tiny'] },
  { command: 'trail', words: ['trail', 'leave trail', 'rainbow trail'] },
  { command: 'damage', words: ['damage', 'hurt', 'attack', 'strike'] },
  { command: 'speed_boost', words: ['speed', 'fast', 'sprint', 'dash', 'speed boost'] },
  { command: 'play_anim', words: ['play animation', 'animate', 'play anim', 'play clip', 'run animation'] },
  { command: 'say', words: ['say', 'speak', 'chat', 'message', 'tell', 'shout'] },
  { command: 'heal', words: ['heal', 'restore health', 'cure', 'healing', 'health'] },
  { command: 'summon', words: ['summon', 'spawn helper', 'call ally', 'companion'] },
  { command: 'shake', words: ['shake', 'vibrate', 'wobble', 'tremble'] },
  { command: 'particles', words: ['spawn particles', 'particle effect', 'fx particles', 'add particles'] },
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

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const row = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) row[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]!;
      row[j] = Math.min(
        row[j]! + 1,
        row[j - 1]! + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return row[b.length]!;
}

function containsPhrase(haystack: string, phrase: string): boolean {
  if (haystack.includes(phrase)) return true;
  if (phrase.length < 4) return false;
  const tokens = haystack.split(' ');
  const parts = phrase.split(' ');
  if (parts.length === 1) {
    const maxDist = phrase.length <= 4 ? 1 : 2;
    return tokens.some(
      (t) => Math.abs(t.length - phrase.length) <= maxDist && editDistance(t, phrase) <= maxDist,
    );
  }
  return false;
}

function detectTrigger(text: string): ModTrigger {
  let best: ModTrigger = 'on_click';
  let bestLen = 0;
  for (const { trigger, words } of TRIGGER_HINTS) {
    for (const w of words) {
      if (containsPhrase(text, w) && w.length > bestLen) {
        best = trigger;
        bestLen = w.length;
      }
    }
  }
  return best;
}

function detectCommand(text: string): string | null {
  let best: string | null = null;
  let bestLen = 0;
  for (const { command, words } of COMMAND_HINTS) {
    for (const w of words) {
      if (containsPhrase(text, w) && w.length > bestLen) {
        best = command;
        bestLen = w.length;
      }
    }
  }
  return best;
}

function extractSayArgs(raw: string): string[] {
  const patterns = [
    /(?:say|speak|message|tell|chat|shout)\s+["'](.+?)["']/i,
    /(?:say|speak|message|tell|chat|shout)\s+(.+)/i,
  ];
  for (const re of patterns) {
    const m = re.exec(raw);
    if (m?.[1]) return m[1].trim().split(/\s+/).filter(Boolean);
  }
  return [];
}

function extractNumberArg(text: string): string[] {
  const m = /(\d+)\s*(?:hp|health|points?|damage|dmg)?/.exec(text);
  return m ? [m[1]!] : [];
}

function extractAnimName(raw: string): string[] {
  const m = /(?:play|run)\s+(?:animation|anim|clip)\s+["']?(\w+)["']?/i.exec(raw);
  return m?.[1] ? [m[1]] : [];
}

function commandLabel(id: string): string {
  return listModCommands().find((c) => c.id === id)?.label ?? id;
}

function commandIcon(id: string): string {
  return MOD_COMMAND_REGISTRY[id]?.icon ?? '⚡';
}

export function triggerLabel(t: ModTrigger): string {
  return TRIGGER_META[t].label;
}

export function ruleCardTitle(rule: ModRule): string {
  return `${commandIcon(rule.command)} ${commandLabel(rule.command)}`;
}

/** Turn plain English (or legacy command lines) into mod rules. */
export function interpretModLine(raw: string): InterpretResult {
  const line = raw.trim();
  if (!line || line.startsWith('#') || line.startsWith('//')) {
    return { rule: null, summary: null, error: null };
  }

  const legacy = parseModLine(line);
  if (legacy.rule) {
    return {
      rule: legacy.rule,
      summary: `${triggerLabel(legacy.rule.trigger)} → ${commandLabel(legacy.rule.command)}`,
      error: null,
    };
  }
  if (legacy.error && /^\s*[a-z_]+\s*:/i.test(line)) {
    return { rule: null, summary: null, error: legacy.error };
  }

  const text = norm(line);
  const command = detectCommand(text);
  if (!command || !isKnownCommand(command)) {
    return {
      rule: null,
      summary: null,
      error: `Could not understand “${line}”. Pick a power below or try “shoot fireball when clicked”.`,
    };
  }

  const trigger = detectTrigger(text);
  let args: string[] = [];
  if (command === 'say') args = extractSayArgs(raw);
  else if (command === 'heal' || command === 'damage') args = extractNumberArg(text);
  else if (command === 'play_anim') args = extractAnimName(raw);
  else if (command === 'shoot_fireball' || command === 'particles' || command === 'sparkle' || command === 'trail') {
    const color = extractColorArg(text);
    if (color) args = [color];
  }

  const rule: ModRule = { trigger, command, args, source: line };
  const extra = args.length ? ` (${args.join(' ')})` : '';
  return {
    rule,
    summary: `${triggerLabel(trigger)} → ${commandLabel(command)}${extra}`,
    error: null,
  };
}

function extractColorArg(text: string): string | null {
  const colors = [
    'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'cyan', 'white', 'black', 'gold', 'teal',
  ];
  for (const c of colors) {
    if (containsPhrase(text, c)) return c;
  }
  return null;
}

export function interpretModScripts(lines: string[]): {
  rules: ModRule[];
  summaries: string[];
  errors: string[];
} {
  const rules: ModRule[] = [];
  const summaries: string[] = [];
  const errors: string[] = [];
  for (const line of lines) {
    const { rule, summary, error } = interpretModLine(line);
    if (error) errors.push(error);
    if (rule) {
      rules.push(rule);
      if (summary) summaries.push(summary);
    }
  }
  return { rules, summaries, errors };
}

export const MOD_AI_EXAMPLES = listModCommands().slice(0, 6).map((c) => c.quickPrompt);

export function livePreview(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const { summary, error } = interpretModLine(trimmed);
  if (error) return error;
  return summary ? `✓ ${summary}` : null;
}
