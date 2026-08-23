const ADJECTIVES = [
  'Misty',
  'Sunlit',
  'Frozen',
  'Verdant',
  'Ashen',
  'Crystal',
  'Wild',
  'Deep',
  'Lost',
  'Ancient',
  'Bright',
  'Shadow',
  'Golden',
  'Silent',
  'Storm',
  'Ember',
];

const NOUNS = [
  'Reach',
  'Expanse',
  'Wilds',
  'Hollow',
  'Basin',
  'Ridge',
  'Shore',
  'Vale',
  'Span',
  'Drift',
  'Crown',
  'March',
  'Breach',
  'Grove',
  'Spire',
  'Crossing',
];

const TAGS = [
  'Rolling hills and open sky.',
  'Dense forests and hidden paths.',
  'Cold peaks and long shadows.',
  'Warm coasts and salt wind.',
  'Strange ruins wait beyond the tree line.',
  'Wide plains under a pale sun.',
  'Broken stone and old river beds.',
  'Quiet lakes and tall reeds.',
];

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function worldNameFromSeed(seed: string): string {
  const h = hashSeed(seed || 'wildreach');
  const adj = ADJECTIVES[h % ADJECTIVES.length]!;
  const noun = NOUNS[(h >>> 8) % NOUNS.length]!;
  return `${adj} ${noun}`;
}

export function worldTagFromSeed(seed: string): string {
  const h = hashSeed(seed || 'wildreach');
  return TAGS[(h >>> 16) % TAGS.length]!;
}

const LAST_WORLD_KEY = 'wildreach.lastWorld';

export function saveLastWorld(seed: string): void {
  try {
    localStorage.setItem(LAST_WORLD_KEY, seed);
  } catch {
    /* ignore */
  }
}

export function loadLastWorld(): string | null {
  try {
    return localStorage.getItem(LAST_WORLD_KEY);
  } catch {
    return null;
  }
}
