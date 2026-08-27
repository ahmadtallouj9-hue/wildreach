/**
 * Validation and sanitization for world styles.
 *
 * Imported style files are untrusted input from other players. A style is data
 * only: this module rebuilds every style field by field from a known schema
 * rather than trusting the incoming object, so unknown keys, prototype
 * pollution attempts, oversized payloads and out-of-range numbers cannot
 * survive the trip.
 */
import { WORLD_GENERATION_VERSION } from '../gen/version';
import {
  CLOUD_STYLES,
  LANDSCAPE_STYLES,
  MAX_AUTHOR_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_NAME_LENGTH,
  MAX_SEED_LENGTH,
  PARAM_SPECS,
  SKY_STYLES,
  TERRAIN_RESOLUTIONS,
  WEATHER_STYLES,
  WORLD_STYLE_FORMAT,
  clampToSpec,
  createDefaultStyle,
  newStyleId,
  type CloudStyle,
  type LandscapeStyle,
  type SkyStyle,
  type StyleGroup,
  type TerrainResolution,
  type VytheraWorldStyle,
  type WeatherStyle,
} from './WorldStyle';

/** Refuse to even parse anything larger; a style is a few kilobytes of numbers. */
export const MAX_STYLE_FILE_BYTES = 256 * 1024;

export interface ValidationResult {
  ok: boolean;
  style: VytheraWorldStyle | null;
  errors: string[];
  warnings: string[];
}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Strip control characters and collapse whitespace, then bound the length. */
function safeText(value: unknown, max: number, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, max);
}

/**
 * Author-supplied text must never look like a path or a URL: styles are pure
 * parameters and nothing in them should ever be resolved against the
 * filesystem or the network.
 */
function looksLikePath(value: string): boolean {
  return (
    value.includes('..') ||
    value.includes('://') ||
    /^[a-zA-Z]:[\\/]/.test(value) ||
    value.startsWith('/') ||
    value.startsWith('\\')
  );
}

function safeNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

const ORIGIN_KINDS = ['manual', 'preset', 'imported', 'randomized', 'vision'] as const;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * Rebuild the optional provenance block, or return null if there isn't a
 * usable one. Colours must be plain six-digit hex and the label is length
 * capped, so nothing here can carry a payload into the library UI.
 */
function sanitizeOrigin(input: unknown): VytheraWorldStyle['origin'] | null {
  if (typeof input !== 'object' || input === null) return null;
  const raw = input as Record<string, unknown>;
  const kind = ORIGIN_KINDS.includes(raw.kind as never)
    ? (raw.kind as (typeof ORIGIN_KINDS)[number])
    : null;
  if (!kind) return null;

  const out: NonNullable<VytheraWorldStyle['origin']> = { kind };
  if (typeof raw.label === 'string' && raw.label.trim()) {
    out.label = raw.label.trim().slice(0, 120);
  }
  if (Array.isArray(raw.palette)) {
    const palette = raw.palette
      .filter((c): c is string => typeof c === 'string' && HEX_COLOR.test(c))
      .slice(0, 16);
    if (palette.length) out.palette = palette;
  }
  return out;
}

/**
 * Rebuild a valid style from arbitrary input. Never throws: anything
 * unrecognised falls back to the default for that field and is reported as a
 * warning, so a slightly-off file is repaired rather than rejected.
 */
export function sanitizeStyle(input: unknown, warnings: string[] = []): VytheraWorldStyle {
  const base = createDefaultStyle();
  if (typeof input !== 'object' || input === null) {
    warnings.push('Style was not an object; defaults used.');
    return base;
  }
  const raw = input as Record<string, unknown>;

  const id = typeof raw.id === 'string' && ID_PATTERN.test(raw.id) ? raw.id : newStyleId();
  if (typeof raw.id === 'string' && !ID_PATTERN.test(raw.id)) {
    warnings.push('Style id contained unsupported characters; a new id was assigned.');
  }

  const name = safeText(raw.name, MAX_NAME_LENGTH, 'Imported World');
  const description = safeText(raw.description, MAX_DESCRIPTION_LENGTH);
  const author = safeText(raw.author, MAX_AUTHOR_LENGTH);
  const seed = safeText(raw.seed, MAX_SEED_LENGTH, base.seed) || base.seed;

  for (const [label, value] of [
    ['name', name],
    ['description', description],
    ['author', author],
  ] as const) {
    if (value && looksLikePath(value)) {
      warnings.push(`Style ${label} looked like a path or URL and was cleared.`);
    }
  }

  const style: VytheraWorldStyle = {
    ...base,
    id,
    name: name || 'Imported World',
    description: looksLikePath(description) ? '' : description,
    author: looksLikePath(author) ? '' : author,
    version: Math.max(1, Math.floor(safeNumber(raw.version, 1))),
    landscape: pickEnum<LandscapeStyle>(
      raw.landscape,
      LANDSCAPE_STYLES.map((s) => s.id),
      'rolling',
    ),
    seed: looksLikePath(seed) ? base.seed : seed,
    generationVersion: Math.floor(safeNumber(raw.generationVersion, WORLD_GENERATION_VERSION)),
    formatVersion: Math.floor(safeNumber(raw.formatVersion, WORLD_STYLE_FORMAT)),
    createdAt: Math.floor(safeNumber(raw.createdAt, Date.now())),
    updatedAt: Math.floor(safeNumber(raw.updatedAt, Date.now())),
  };

  // Provenance is optional and purely descriptive, but it still arrives from
  // untrusted files, so it is rebuilt field by field rather than copied. A
  // style saved before this existed simply has no origin, which is valid.
  const origin = sanitizeOrigin(raw.origin);
  if (origin) style.origin = origin;

  const requestedSize = safeNumber(raw.terrainVoxelSize, 0.25);
  style.terrainVoxelSize = (TERRAIN_RESOLUTIONS as readonly number[]).includes(requestedSize)
    ? (requestedSize as TerrainResolution)
    : 0.25;
  if (!(TERRAIN_RESOLUTIONS as readonly number[]).includes(requestedSize)) {
    warnings.push('Unsupported terrain resolution; High (0.25) used instead.');
  }

  // Numeric parameters are rebuilt strictly from the spec table, so any extra
  // keys in the imported object are simply never read.
  for (const spec of PARAM_SPECS) {
    const group = raw[spec.group];
    const incoming =
      typeof group === 'object' && group !== null
        ? (group as Record<string, unknown>)[spec.key]
        : undefined;
    const value = clampToSpec(spec, safeNumber(incoming, spec.default));
    if (incoming !== undefined && safeNumber(incoming, spec.default) !== value) {
      warnings.push(`${spec.label} was out of range and was clamped to ${value}.`);
    }
    (style[spec.group] as unknown as Record<string, number>)[spec.key] = value;
  }

  const atmosphere = (raw.atmosphere ?? {}) as Record<string, unknown>;
  style.atmosphere.skyStyle = pickEnum<SkyStyle>(atmosphere.skyStyle, SKY_STYLES, 'clear');
  style.atmosphere.cloudStyle = pickEnum<CloudStyle>(
    atmosphere.cloudStyle,
    CLOUD_STYLES,
    'natural',
  );
  style.atmosphere.weather = pickEnum<WeatherStyle>(atmosphere.weather, WEATHER_STYLES, 'clear');

  return style;
}

/**
 * Parse an untrusted .vyworld file. Returns errors instead of throwing, and
 * refuses outright only for problems that cannot be repaired safely.
 */
export function parseStyleFile(text: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const bytes = new TextEncoder().encode(text).length;
  if (bytes > MAX_STYLE_FILE_BYTES) {
    return {
      ok: false,
      style: null,
      errors: [`File is too large (${Math.round(bytes / 1024)} KB); world styles are small.`],
      warnings,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, style: null, errors: ['File is not valid JSON.'], warnings };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, style: null, errors: ['File does not contain a world style.'], warnings };
  }

  const envelope = parsed as Record<string, unknown>;
  const payload = (envelope.style ?? envelope) as Record<string, unknown>;

  const format = Number(envelope.formatVersion ?? payload.formatVersion ?? WORLD_STYLE_FORMAT);
  if (Number.isFinite(format) && format > WORLD_STYLE_FORMAT) {
    return {
      ok: false,
      style: null,
      errors: [
        `This style needs a newer version of VYTHERA (style format ${format}, this build supports ${WORLD_STYLE_FORMAT}).`,
      ],
      warnings,
    };
  }

  const style = sanitizeStyle(payload, warnings);

  if (style.generationVersion > WORLD_GENERATION_VERSION) {
    return {
      ok: false,
      style: null,
      errors: [
        `This style was made with a newer world generator (v${style.generationVersion}, this build has v${WORLD_GENERATION_VERSION}).`,
      ],
      warnings,
    };
  }
  if (style.generationVersion < WORLD_GENERATION_VERSION) {
    warnings.push(
      `Made with world generator v${style.generationVersion}; this build uses v${WORLD_GENERATION_VERSION}, so terrain may differ slightly.`,
    );
  }

  return { ok: true, style, errors, warnings };
}

export interface StyleCompatibility {
  compatible: boolean;
  generationVersion: number;
  formatVersion: number;
  notes: string[];
}

export function checkCompatibility(style: VytheraWorldStyle): StyleCompatibility {
  const notes: string[] = [];
  let compatible = true;
  if (style.formatVersion > WORLD_STYLE_FORMAT) {
    compatible = false;
    notes.push('Style format is newer than this build.');
  }
  if (style.generationVersion > WORLD_GENERATION_VERSION) {
    compatible = false;
    notes.push('World generator is newer than this build.');
  } else if (style.generationVersion < WORLD_GENERATION_VERSION) {
    notes.push('Made with an older generator; terrain may differ slightly.');
  }
  return {
    compatible,
    generationVersion: style.generationVersion,
    formatVersion: style.formatVersion,
    notes,
  };
}

/**
 * Build the exportable envelope. Only style fields are serialized — no local
 * paths, no machine identifiers, no environment data — and the author name is
 * included solely because the creator typed it in.
 */
export function serializeStyle(style: VytheraWorldStyle): string {
  const clean = sanitizeStyle(style);
  return JSON.stringify(
    {
      kind: 'vythera.worldstyle',
      formatVersion: WORLD_STYLE_FORMAT,
      exportedAt: new Date().toISOString(),
      style: clean,
    },
    null,
    2,
  );
}

export const STYLE_GROUPS: StyleGroup[] = ['terrain', 'water', 'biome', 'vegetation', 'atmosphere'];
