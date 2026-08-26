/** Run VLM smoke test via training venv. */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { detectCapability, formatCapabilityLines } from './detect-capability.ts';
import {
  PYTHON_VLM_SMOKE,
  VYTHERA_TRAIN_ROOT,
  venvPythonPath,
  ensureTrainDirs,
  DEFAULT_VLM_BASE,
} from './paths.ts';

ensureTrainDirs();
const cap = detectCapability();
console.log(formatCapabilityLines(cap).join('\n'));
console.log('');

const py = existsSync(venvPythonPath())
  ? venvPythonPath()
  : cap.python.executable || (process.platform === 'win32' ? 'python' : 'python3');

if (!cap.python.available && !existsSync(venvPythonPath())) {
  console.log('VYTHERA VLM TRAINING SMOKE TEST: FAIL');
  console.log('Reason: Python not available — run npm run vythera:train:setup');
  process.exit(1);
}

const out = join(VYTHERA_TRAIN_ROOT, 'vlm_smoke_adapter');
const r = spawnSync(py, [PYTHON_VLM_SMOKE, '--base', DEFAULT_VLM_BASE, '--out', out], {
  encoding: 'utf8',
  stdio: 'inherit',
  shell: false,
  windowsHide: true,
});
process.exit(r.status ?? 1);
