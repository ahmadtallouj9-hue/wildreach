/**
 * Resolve a real Python interpreter for VYTHERA training.
 * Rejects Windows Store stubs. Prefers dedicated training venv.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { venvPythonPath, VYTHERA_VENV_DIR } from './paths.ts';
import type { ExecFn } from './exec-types.ts';

const STORE_STUB = /\\windowsapps\\python/i;

export function isWindowsStoreStub(path: string): boolean {
  return STORE_STUB.test(path.replace(/\//g, '\\'));
}

function tryVersion(
  cmd: string,
  args: string[],
  exec: ExecFn,
): { ok: boolean; version?: string; executable?: string; rejectedStub?: boolean } {
  try {
    const r = exec(cmd, args, { timeout: 12_000 });
    if (r.status !== 0) return { ok: false };
    const ver = (r.stdout || r.stderr).trim().match(/Python\s+(\d+\.\d+\.\d+)/i)?.[1];
    // Resolve real executable when possible
    const loc = exec(cmd, ['-c', 'import sys; print(sys.executable)'], { timeout: 10_000 });
    const executable = loc.status === 0 ? loc.stdout.trim().split('\n').pop()!.trim() : cmd;
    if (executable && isWindowsStoreStub(executable)) {
      return { ok: false, rejectedStub: true, executable };
    }
    if (isWindowsStoreStub(cmd)) return { ok: false, rejectedStub: true, executable: cmd };
    return { ok: true, version: ver, executable };
  } catch {
    return { ok: false };
  }
}

/** Candidate interpreters in preference order. */
export function pythonCandidates(): string[] {
  const out: string[] = [];
  const venv = venvPythonPath();
  if (existsSync(venv)) out.push(venv);

  if (process.platform === 'win32') {
    // uv-managed shims / installs
    const localBin = join(homedir(), '.local', 'bin');
    for (const name of ['python3.12.exe', 'python3.11.exe', 'python3.13.exe', 'python3.14.exe']) {
      const p = join(localBin, name);
      if (existsSync(p)) out.push(p);
    }
    const uvRoot = join(homedir(), 'AppData', 'Roaming', 'uv', 'python');
    // Prefer 3.12 for torch wheels when present under uv cache (setup installs this)
    out.push('py', 'python3.12', 'python3.11', 'python', 'python3');
    void uvRoot;
  } else {
    out.push('python3.12', 'python3.11', 'python3', 'python');
  }
  return out;
}

export function resolveTrainingPython(exec: ExecFn): {
  available: boolean;
  version?: string;
  executable?: string;
  rejectedStub?: boolean;
  venvPath?: string;
  cmd: string;
} {
  let rejectedStub = false;
  for (const cmd of pythonCandidates()) {
    const r = tryVersion(cmd, ['--version'], exec);
    if (r.rejectedStub) rejectedStub = true;
    if (!r.ok || !r.executable) continue;
    return {
      available: true,
      version: r.version,
      executable: r.executable,
      cmd: r.executable,
      venvPath: existsSync(venvPythonPath()) ? VYTHERA_VENV_DIR : undefined,
      rejectedStub,
    };
  }
  return {
    available: false,
    rejectedStub,
    cmd: process.platform === 'win32' ? 'python' : 'python3',
  };
}
