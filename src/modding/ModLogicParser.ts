/** Supported mod trigger events. */
export type ModTrigger = 'on_click' | 'on_use' | 'on_spawn' | 'on_tick' | 'on_collision';

export interface ModRule {
  trigger: ModTrigger;
  command: string;
  args: string[];
  source: string;
}

const TRIGGERS = new Set<ModTrigger>(['on_click', 'on_use', 'on_spawn', 'on_tick', 'on_collision']);

const LINE_RE = /^\s*([a-z_]+)\s*:\s*([a-z_][a-z0-9_]*)(?:\s+(.*))?\s*$/i;

export function parseModLine(raw: string): { rule: ModRule | null; error: string | null } {
  const line = raw.trim();
  if (!line || line.startsWith('#') || line.startsWith('//')) {
    return { rule: null, error: null };
  }

  const m = LINE_RE.exec(line);
  if (!m) {
    return { rule: null, error: `Invalid line: “${line}”` };
  }

  const trigger = m[1]!.toLowerCase() as ModTrigger;
  if (!TRIGGERS.has(trigger)) {
    return { rule: null, error: `Unknown trigger “${m[1]}”` };
  }

  const command = m[2]!.toLowerCase();
  const args = (m[3] ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return {
    rule: { trigger, command, args, source: line },
    error: null,
  };
}

export function parseModScripts(lines: string[]): { rules: ModRule[]; errors: string[] } {
  const rules: ModRule[] = [];
  const errors: string[] = [];
  for (const line of lines) {
    const { rule, error } = parseModLine(line);
    if (error) errors.push(error);
    if (rule) rules.push(rule);
  }
  return { rules, errors };
}

export function normalizeScriptLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}
