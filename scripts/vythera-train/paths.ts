import { existsSync, mkdirSync, accessSync, constants } from 'node:fs';
import { join, resolve, normalize, isAbsolute } from 'node:path';

const ROOT = process.cwd();

export const VYTHERA_TRAIN_ROOT = join(ROOT, '.vythera', 'training');
export const VYTHERA_JOBS_DIR = join(VYTHERA_TRAIN_ROOT, 'jobs');
export const VYTHERA_DATASETS_DIR = join(VYTHERA_TRAIN_ROOT, 'datasets');
export const VYTHERA_VENV_DIR = join(VYTHERA_TRAIN_ROOT, 'venv');
export const VYTHERA_CAPABILITY_MANIFEST = join(VYTHERA_TRAIN_ROOT, 'capability.json');
export const VYTHERA_ADAPTERS_DIR = join(ROOT, 'adapters');
export const PYTHON_TRAINER = join(ROOT, 'scripts', 'vythera-train', 'python', 'train_qlora.py');
export const PYTHON_EVAL = join(ROOT, 'scripts', 'vythera-train', 'python', 'evaluate_adapter.py');
export const PYTHON_SMOKE = join(ROOT, 'scripts', 'vythera-train', 'python', 'smoke_test.py');
export const PYTHON_VLM_TRAINER = join(ROOT, 'scripts', 'vythera-train', 'python', 'train_vlm.py');
export const PYTHON_VLM_EVAL = join(ROOT, 'scripts', 'vythera-train', 'python', 'evaluate_vlm.py');
export const PYTHON_VLM_SMOKE = join(ROOT, 'scripts', 'vythera-train', 'python', 'vlm_smoke_test.py');
export const PYTHON_VLM_INFER = join(ROOT, 'scripts', 'vythera-train', 'python', 'infer_vlm.py');
export const PYTHON_REQS = join(ROOT, 'scripts', 'vythera-train', 'python', 'requirements.txt');
export const DEFAULT_VLM_BASE = 'HuggingFaceTB/SmolVLM-256M-Instruct';

export function venvPythonPath(): string {
  return process.platform === 'win32'
    ? join(VYTHERA_VENV_DIR, 'Scripts', 'python.exe')
    : join(VYTHERA_VENV_DIR, 'bin', 'python');
}

export function ensureTrainDirs(): void {
  for (const d of [VYTHERA_TRAIN_ROOT, VYTHERA_JOBS_DIR, VYTHERA_DATASETS_DIR, VYTHERA_ADAPTERS_DIR]) {
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
  }
}

/** Normalize and ensure path stays under an allowed root (no traversal). */
export function safePathUnder(root: string, ...parts: string[]): string {
  const base = resolve(root);
  const target = resolve(base, ...parts.map((p) => p.replace(/\\/g, '/')));
  const normBase = normalize(base + (base.endsWith('\\') || base.endsWith('/') ? '' : '\\'));
  // Windows-safe: compare resolved lowercase prefixes
  const baseCmp = resolve(base).toLowerCase();
  const targetCmp = target.toLowerCase();
  if (!targetCmp.startsWith(baseCmp)) {
    throw new Error(`Path escapes allowed root: ${target}`);
  }
  void normBase;
  return target;
}

export function assertWritableDir(dir: string): boolean {
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    accessSync(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export function isSafeModelId(model: string): boolean {
  // HF ids like org/name or local relative path under repo — no shell metacharacters
  if (!model || model.length > 256) return false;
  if (/[;&|`$<>]/.test(model)) return false;
  if (model.includes('..')) return false;
  return /^[\w./:@+-]+$/.test(model);
}

export function resolveTrainableBase(model: string): string {
  if (!isSafeModelId(model)) throw new Error('Unsafe base model id');
  if (isAbsolute(model)) {
    const abs = resolve(model);
    if (!existsSync(abs)) throw new Error(`Base model path not found: ${abs}`);
    return abs;
  }
  // Prefer local HF cache path if present under models/
  const local = join(ROOT, 'models', model);
  if (existsSync(local)) return local;
  return model;
}
