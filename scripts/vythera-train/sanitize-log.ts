/**
 * Shared sanitization for persisted training logs (job.json, setup reports, etc.).
 * Process may still use real paths internally — only disk/diagnostic strings are scrubbed.
 */
import {
  sanitizeForDisplay,
  sanitizeUserFacingError,
} from '../../src/vythera_ai/security/VytheraPrivacySanitizer.ts';

const UNC = /\\\\[^\s"'\\]+(?:\\[^\s"']*)+/g;
const HOSTNAME_EQ = /\b(?:hostname|computername|username|user)\s*[:=]\s*[^\s"']+/gi;

/** Sanitize a single log/diagnostic line for disk persistence. */
export function sanitizePersistedLogLine(line: string): string {
  if (!line) return line;
  let s = sanitizeForDisplay(line, { privacyMode: true });
  s = s.replace(UNC, '[LOCAL PATH]');
  s = s.replace(HOSTNAME_EQ, '[REDACTED]');
  // Collapse leftover long absolute Windows paths
  s = s.replace(/\b[A-Za-z]:\\[^\s"']{8,}/g, '[LOCAL PATH]');
  if (/failed|error|traceback/i.test(line) && /\[LOCAL PATH\]|LOCAL FILE/.test(s)) {
    if (!/TRAINING PROCESS FAILED/i.test(s)) {
      s = `TRAINING PROCESS FAILED · ${s}`.slice(0, 1000);
    }
  }
  return s.slice(0, 1000);
}

export function sanitizePersistedError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? 'error');
  const s = sanitizePersistedLogLine(raw);
  if (/ECONNREFUSED|ENOTFOUND/i.test(raw)) return 'LOCAL TRAINING SERVICE UNAVAILABLE';
  return sanitizeUserFacingError(s, 'TRAINING PROCESS FAILED');
}

export function sanitizeLogLines(lines: string[]): string[] {
  return lines.map((l) => sanitizePersistedLogLine(l));
}
