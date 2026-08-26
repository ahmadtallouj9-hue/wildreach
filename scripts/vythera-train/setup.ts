/**
 * One-command Windows-friendly VYTHERA training environment setup.
 *
 * npm run vythera:train:setup
 *
 * Never silently installs arbitrary packages — prints every install command.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import {
  ensureTrainDirs,
  VYTHERA_TRAIN_ROOT,
  VYTHERA_VENV_DIR,
  VYTHERA_CAPABILITY_MANIFEST,
  PYTHON_SMOKE,
  PYTHON_TRAINER,
  venvPythonPath,
} from './paths.ts';
import { detectCapability, formatCapabilityLines } from './detect-capability.ts';
import { isWindowsStoreStub } from './resolve-python.ts';

function run(cmd: string, args: string[], opts?: { cwd?: string; env?: NodeJS.ProcessEnv }): number {
  console.log(`\n> ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    stdio: 'inherit',
    shell: false,
    windowsHide: true,
    cwd: opts?.cwd,
    env: opts?.env ?? process.env,
  });
  return r.status ?? 1;
}

function runCapture(cmd: string, args: string[]): { status: number; stdout: string; stderr: string } {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    timeout: 60_000,
  });
  return {
    status: r.status ?? 1,
    stdout: String(r.stdout ?? ''),
    stderr: String(r.stderr ?? ''),
  };
}

function findUv(): string | null {
  const r = runCapture(process.platform === 'win32' ? 'where' : 'which', ['uv']);
  if (r.status === 0 && r.stdout.trim()) {
    return r.stdout.trim().split(/\r?\n/)[0]!.trim();
  }
  const local = join(homedir(), '.local', 'bin', process.platform === 'win32' ? 'uv.exe' : 'uv');
  return existsSync(local) ? local : null;
}

function findBasePython(): { cmd: string; version: string } | null {
  // Prefer uv-managed 3.12 once installed; else any non-stub python 3.10–3.13
  const candidates: string[] = [];
  if (process.platform === 'win32') {
    const localBin = join(homedir(), '.local', 'bin');
    for (const n of ['python3.12.exe', 'python3.11.exe', 'python3.13.exe']) {
      const p = join(localBin, n);
      if (existsSync(p)) candidates.push(p);
    }
  }
  candidates.push('python3.12', 'python3.11', 'python3.13', 'python3', 'python');

  for (const cmd of candidates) {
    const v = runCapture(cmd, ['--version']);
    if (v.status !== 0) continue;
    const loc = runCapture(cmd, ['-c', 'import sys; print(sys.executable)']);
    const exe = loc.status === 0 ? loc.stdout.trim() : cmd;
    if (isWindowsStoreStub(exe) || isWindowsStoreStub(cmd)) {
      console.log(`Skipping Windows Store stub: ${exe}`);
      continue;
    }
    const m = (v.stdout || v.stderr).match(/Python\s+(\d+)\.(\d+)/i);
    if (!m) continue;
    const major = Number(m[1]);
    const minor = Number(m[2]);
    if (major !== 3 || minor < 10 || minor > 13) {
      console.log(`Skipping Python ${m[1]}.${m[2]} (need 3.10–3.13 for torch wheels): ${exe}`);
      continue;
    }
    return { cmd: exe, version: `${m[1]}.${m[2]}` };
  }
  return null;
}

function detectNvidiaDriver(): { name?: string; driver?: string; cudaRuntime?: string } {
  const smi = runCapture('nvidia-smi', [
    '--query-gpu=name,driver_version',
    '--format=csv,noheader',
  ]);
  const out: { name?: string; driver?: string; cudaRuntime?: string } = {};
  if (smi.status === 0 && smi.stdout.trim()) {
    const [name, driver] = smi.stdout.trim().split('\n')[0]!.split(',').map((s) => s.trim());
    out.name = name;
    out.driver = driver;
  }
  const full = runCapture('nvidia-smi', []);
  const m =
    full.stdout.match(/CUDA\s+UMD\s+Version:\s*([\d.]+)/i) ||
    full.stdout.match(/CUDA\s+Version:\s*([\d.]+)/i);
  if (m) out.cudaRuntime = m[1];
  return out;
}

function chooseTorchInstall(nvidia: { name?: string; cudaRuntime?: string }): {
  packages: string[];
  indexUrl?: string;
  note: string;
} {
  if (nvidia.name && /nvidia|geforce|rtx|quadro|tesla/i.test(nvidia.name)) {
    // Blackwell (50-series) needs cu128+; also safe for Ada with driver CUDA ≥12.8
    const major = Number((nvidia.cudaRuntime ?? '0').split('.')[0]);
    if (major >= 12 || /50\d{2}|blackwell/i.test(nvidia.name ?? '')) {
      return {
        packages: ['torch', 'torchvision', 'torchaudio'],
        indexUrl: 'https://download.pytorch.org/whl/cu128',
        note: 'NVIDIA GPU detected → installing PyTorch CUDA 12.8 wheels (sm_120 / Blackwell capable)',
      };
    }
    return {
      packages: ['torch', 'torchvision', 'torchaudio'],
      indexUrl: 'https://download.pytorch.org/whl/cu124',
      note: 'NVIDIA GPU detected → installing PyTorch CUDA 12.4 wheels',
    };
  }
  return {
    packages: ['torch', 'torchvision', 'torchaudio'],
    note: 'No NVIDIA GPU via nvidia-smi → installing default PyTorch (CPU)',
  };
}

async function main(): Promise<void> {
  console.log('=== VYTHERA local training setup ===\n');
  ensureTrainDirs();

  const nvidia = detectNvidiaDriver();
  console.log('Hardware probe (pre-install):');
  console.log(`  GPU: ${nvidia.name ?? 'not detected via nvidia-smi'}`);
  console.log(`  Driver: ${nvidia.driver ?? 'unknown'}`);
  console.log(`  CUDA runtime (driver): ${nvidia.cudaRuntime ?? 'unknown'}`);

  let base = findBasePython();
  const uv = findUv();

  if (!base && uv) {
    console.log('\nNo suitable Python 3.10–3.13 found. Using uv to install CPython 3.12…');
    const code = run(uv, ['python', 'install', '3.12']);
    if (code !== 0) {
      console.error('\nFAILED: could not install Python 3.12 via uv.');
      console.error('Install Python 3.12 from https://www.python.org/downloads/ and re-run.');
      process.exit(1);
    }
    base = findBasePython();
  }

  if (!base) {
    console.error('\nPython: MISSING');
    console.error('Install Python 3.11 or 3.12 (not the Windows Store stub), or install uv, then re-run:');
    console.error('  npm run vythera:train:setup');
    process.exit(1);
  }

  console.log(`\nUsing base Python: ${base.cmd} (${base.version})`);

  if (!existsSync(VYTHERA_VENV_DIR)) {
    mkdirSync(VYTHERA_TRAIN_ROOT, { recursive: true });
    console.log(`\nCreating venv at ${VYTHERA_VENV_DIR}`);
    const code = run(base.cmd, ['-m', 'venv', VYTHERA_VENV_DIR]);
    if (code !== 0) {
      console.error('FAILED: venv creation');
      process.exit(1);
    }
  } else {
    console.log(`\nReusing venv at ${VYTHERA_VENV_DIR}`);
  }

  const py = venvPythonPath();
  if (!existsSync(py)) {
    console.error(`FAILED: venv python missing at ${py}`);
    process.exit(1);
  }

  console.log('\nUpgrading pip/setuptools/wheel…');
  if (run(py, ['-m', 'pip', 'install', '--upgrade', 'pip', 'setuptools', 'wheel']) !== 0) {
    process.exit(1);
  }

  const torchPlan = chooseTorchInstall(nvidia);
  console.log(`\n${torchPlan.note}`);
  console.log('Packages to install (explicit):');
  for (const p of torchPlan.packages) console.log(`  - ${p}`);
  if (torchPlan.indexUrl) console.log(`  index: ${torchPlan.indexUrl}`);

  const torchArgs = ['-m', 'pip', 'install', ...torchPlan.packages];
  if (torchPlan.indexUrl) {
    torchArgs.push('--index-url', torchPlan.indexUrl);
  }
  if (run(py, torchArgs) !== 0) {
    console.error('FAILED: PyTorch install');
    process.exit(1);
  }

  const peftPkgs = [
    'transformers>=4.40.0',
    'peft>=0.11.0',
    'accelerate>=0.30.0',
    'datasets>=2.19.0',
    'safetensors>=0.4.0',
    'sentencepiece>=0.2.0',
  ];
  console.log('\nInstalling PEFT stack (explicit):');
  for (const p of peftPkgs) console.log(`  - ${p}`);
  if (run(py, ['-m', 'pip', 'install', ...peftPkgs]) !== 0) {
    console.error('FAILED: PEFT stack install');
    process.exit(1);
  }

  let bitsandbytesOk = false;
  if (nvidia.name) {
    console.log('\nAttempting bitsandbytes (optional QLoRA)…');
    console.log('  - bitsandbytes');
    const bb = run(py, ['-m', 'pip', 'install', 'bitsandbytes']);
    if (bb === 0) {
      const check = runCapture(py, ['-c', 'import bitsandbytes; print("ok")']);
      bitsandbytesOk = check.status === 0;
    }
    if (!bitsandbytesOk) {
      console.log('bitsandbytes not usable on this Windows config.');
      console.log('LORA TRAINING AVAILABLE');
      console.log('QLORA / 4-BIT NOT AVAILABLE');
    } else {
      console.log('bitsandbytes import OK — QLoRA may be available');
    }
  } else {
    console.log('\nSkipping bitsandbytes (no NVIDIA GPU).');
  }

  console.log('\nVerifying imports…');
  const verify = runCapture(
    py,
    [
      '-c',
      'import torch,transformers,peft,accelerate,datasets,safetensors; '
        + 'print("torch",torch.__version__,"cuda",torch.cuda.is_available()); '
        + 'print("device", torch.cuda.get_device_name(0) if torch.cuda.is_available() else "cpu")',
    ],
  );
  console.log(verify.stdout || verify.stderr);
  if (verify.status !== 0) {
    console.error('FAILED: import verification');
    process.exit(1);
  }

  if (!existsSync(PYTHON_TRAINER)) {
    console.error(`FAILED: trainer missing ${PYTHON_TRAINER}`);
    process.exit(1);
  }
  console.log(`Trainer script OK: ${PYTHON_TRAINER}`);

  console.log('\nRunning smoke test…');
  const smokeOut = join(VYTHERA_TRAIN_ROOT, 'smoke_adapter');
  const smoke = run(py, [PYTHON_SMOKE, '--out', smokeOut]);
  if (smoke !== 0) {
    console.error('Smoke test FAILED — see output above.');
    process.exit(1);
  }

  const cap = detectCapability({ writeManifest: true });
  console.log('\n=== Capability manifest ===');
  console.log(formatCapabilityLines(cap).join('\n'));
  writeFileSync(
    join(VYTHERA_TRAIN_ROOT, 'setup-report.json'),
    JSON.stringify(
      {
        completedAt: Date.now(),
        python: py,
        nvidia,
        bitsandbytesOk,
        torchPlan,
        capability: cap,
      },
      null,
      2,
    ),
    'utf8',
  );
  console.log(`\nWrote ${VYTHERA_CAPABILITY_MANIFEST}`);
  console.log('Setup complete.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
