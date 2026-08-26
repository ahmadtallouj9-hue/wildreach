import { sanitizeForDisplay } from '../vythera_ai/security/VytheraPrivacySanitizer';
import {
  MAX_ICON_CHARS,
  MAX_PACKAGE_CHARS,
  MAX_SCREENSHOT_CHARS,
  MAX_SCREENSHOTS,
  MOD_PACKAGE_FORMAT,
  VYTHERA_GAME_VERSION,
  type ModManifest,
  type ModPackage,
  type ValidationIssue,
  type ValidationResult,
} from './types';

const ID_RE = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[a-z0-9.]+)?$/i;
const UNSAFE_PATH = /(\.\.|\\|\/|%2e%2e|%2f|%5c)/i;
const EXEC_HINT = /\.(exe|bat|cmd|ps1|sh|dll|so|dylib|msi|scr|com|jar)$/i;

export function sanitizeModText(input: string, max = 2000): string {
  return sanitizeForDisplay(String(input ?? ''), { privacyMode: true }).slice(0, max);
}

export function isSafeModId(id: string): boolean {
  return ID_RE.test(id) && !UNSAFE_PATH.test(id) && !EXEC_HINT.test(id);
}

export function isSemver(v: string): boolean {
  return SEMVER_RE.test(v);
}

function issue(level: ValidationIssue['level'], code: string, message: string): ValidationIssue {
  return { level, code, message: sanitizeModText(message, 240) };
}

export function validateManifest(m: Partial<ModManifest> | null | undefined): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!m || typeof m !== 'object') {
    return { ok: false, issues: [issue('error', 'manifest.missing', 'Manifest missing')] };
  }
  if (!m.id || !isSafeModId(m.id)) {
    issues.push(issue('error', 'manifest.id', 'Mod id must be lowercase slug (a-z0-9._-), no paths'));
  }
  if (!m.name?.trim() || m.name.length > 64) {
    issues.push(issue('error', 'manifest.name', 'Internal name required (max 64)'));
  }
  if (!m.displayName?.trim() || m.displayName.length > 80) {
    issues.push(issue('error', 'manifest.displayName', 'Display name required (max 80)'));
  }
  if (!m.version || !isSemver(m.version)) {
    issues.push(issue('error', 'manifest.version', 'Version must be semver (e.g. 1.0.0)'));
  }
  if (!m.author?.trim() || m.author.length > 64) {
    issues.push(issue('error', 'manifest.author', 'Author required (max 64)'));
  }
  if ((m.description ?? '').length > 4000) {
    issues.push(issue('error', 'manifest.description', 'Description too long'));
  }
  if (UNSAFE_PATH.test(m.name ?? '') || UNSAFE_PATH.test(m.displayName ?? '')) {
    issues.push(issue('error', 'manifest.path', 'Names must not contain path separators'));
  }
  if (EXEC_HINT.test(m.name ?? '') || EXEC_HINT.test(m.displayName ?? '')) {
    issues.push(issue('error', 'manifest.exec', 'Executable-like names are not allowed'));
  }
  if (m.iconDataUrl && m.iconDataUrl.length > MAX_ICON_CHARS) {
    issues.push(issue('error', 'manifest.icon', 'Icon too large'));
  }
  if (m.iconDataUrl && !m.iconDataUrl.startsWith('data:image/')) {
    issues.push(issue('error', 'manifest.iconType', 'Icon must be a data:image URL'));
  }
  if ((m.screenshots?.length ?? 0) > MAX_SCREENSHOTS) {
    issues.push(issue('error', 'manifest.shots', `At most ${MAX_SCREENSHOTS} screenshots`));
  }
  for (const shot of m.screenshots ?? []) {
    if (!shot.startsWith('data:image/')) {
      issues.push(issue('error', 'manifest.shotType', 'Screenshots must be data:image URLs'));
      break;
    }
    if (shot.length > MAX_SCREENSHOT_CHARS) {
      issues.push(issue('error', 'manifest.shotSize', 'A screenshot is too large'));
      break;
    }
  }
  for (const dep of m.dependencies ?? []) {
    if (!isSafeModId(dep.id) || !isSemver(dep.version)) {
      issues.push(issue('error', 'manifest.dep', `Bad dependency ${sanitizeModText(dep.id, 40)}`));
    }
  }
  if (m.gameVersion && !isSemver(m.gameVersion)) {
    issues.push(issue('warn', 'manifest.gameVersion', 'gameVersion should be semver'));
  }
  return { ok: !issues.some((i) => i.level === 'error'), issues };
}

export function validatePackage(pkg: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!pkg || typeof pkg !== 'object') {
    return { ok: false, issues: [issue('error', 'pkg.missing', 'Package missing')] };
  }
  const p = pkg as ModPackage;
  if (JSON.stringify(p).length > MAX_PACKAGE_CHARS) {
    issues.push(issue('error', 'pkg.size', 'Package exceeds size limit'));
  }
  if (p.format !== MOD_PACKAGE_FORMAT) {
    issues.push(issue('error', 'pkg.format', `Unsupported format (need ${MOD_PACKAGE_FORMAT})`));
  }
  issues.push(...validateManifest(p.manifest).issues);
  if (typeof p.assetJson !== 'string' || p.assetJson.length < 2) {
    issues.push(issue('error', 'pkg.asset', 'Asset payload missing'));
  } else {
    try {
      const asset = JSON.parse(p.assetJson) as { version?: number };
      if (asset.version !== 1) issues.push(issue('error', 'pkg.assetVer', 'Asset version must be 1'));
    } catch {
      issues.push(issue('error', 'pkg.assetJson', 'Asset JSON is malformed'));
    }
  }
  if (typeof p.integrity !== 'string' || p.integrity.length < 8) {
    issues.push(issue('error', 'pkg.integrity', 'Integrity hash missing'));
  }
  if (EXEC_HINT.test(JSON.stringify(p.manifest ?? {}))) {
    issues.push(issue('error', 'pkg.exec', 'Executable-like names are not allowed in metadata'));
  }
  return { ok: !issues.some((i) => i.level === 'error'), issues };
}

export function gameCompatible(manifest: ModManifest): 'compatible' | 'update' | 'incompatible' {
  const need = manifest.gameVersion || VYTHERA_GAME_VERSION;
  const [a1, a2] = need.split('.').map(Number);
  const [b1, b2] = VYTHERA_GAME_VERSION.split('.').map(Number);
  if ((a1 ?? 0) !== (b1 ?? 0)) return 'incompatible';
  if ((a2 ?? 0) > (b2 ?? 0)) return 'update';
  return 'compatible';
}
