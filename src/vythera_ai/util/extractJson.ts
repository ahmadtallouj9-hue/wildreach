/** Safe JSON extraction — never invents semantic fields. */

export function extractVytheraJson(raw: string): unknown {
  const text = raw.trim();
  if (!text) throw new Error('Empty response');
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced?.[1]?.trim() ?? text;
  const start = body.indexOf('{');
  if (start < 0) throw new Error('No JSON object');
  let depth = 0,
    end = -1,
    inStr = false,
    esc = false;
  for (let i = start; i < body.length; i++) {
    const ch = body[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) throw new Error('Incomplete JSON');
  return JSON.parse(body.slice(start, end + 1));
}
