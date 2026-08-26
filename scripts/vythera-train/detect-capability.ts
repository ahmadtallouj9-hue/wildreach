/**
 * Detect real local training capability. Never guesses hardware.
 * Distinguishes GPU detected vs CUDA toolkit vs PyTorch CUDA.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { platform, cpus, totalmem } from 'node:os';
import {
  PYTHON_TRAINER,
  PYTHON_VLM_TRAINER,
  PYTHON_REQS,
  assertWritableDir,
  VYTHERA_ADAPTERS_DIR,
  VYTHERA_CAPABILITY_MANIFEST,
  ensureTrainDirs,
  venvPythonPath,
} from './paths.ts';
import { resolveTrainingPython } from './resolve-python.ts';
import type { ExecFn } from './exec-types.ts';
import type {
  TrainingModality,
  VytheraPackageInfo,
  VytheraTrainingCapability,
  VytheraTrainerType,
} from './types.ts';

export type { ExecFn } from './exec-types.ts';

function defaultExec(cmd: string, args: string[], opts?: { timeout?: number }) {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    timeout: opts?.timeout ?? 15_000,
    windowsHide: true,
    shell: false,
  });
  return {
    status: r.status,
    stdout: String(r.stdout ?? ''),
    stderr: String(r.stderr ?? ''),
  };
}

function detectCpuRam(exec: ExecFn): { cpu?: string; ramMb?: number } {
  let cpu = cpus()[0]?.model?.trim();
  let ramMb = Math.round(totalmem() / (1024 * 1024));
  if (process.platform === 'win32') {
    const wmi = exec(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        "(Get-CimInstance Win32_Processor | Select-Object -First 1 -ExpandProperty Name);"
          + "(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory",
      ],
      { timeout: 12_000 },
    );
    if (wmi.status === 0) {
      const lines = wmi.stdout
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines[0]) cpu = lines[0];
      const bytes = Number(lines[1]);
      if (Number.isFinite(bytes) && bytes > 0) ramMb = Math.round(bytes / (1024 * 1024));
    }
  }
  return { cpu, ramMb };
}

function detectNvidia(exec: ExecFn): {
  detected: boolean;
  name?: string;
  vramMb?: number;
  driverVersion?: string;
  cudaRuntimeVersion?: string;
} {
  const smi = exec(
    'nvidia-smi',
    [
      '--query-gpu=name,memory.total,driver_version',
      '--format=csv,noheader,nounits',
    ],
    { timeout: 8_000 },
  );
  if (smi.status !== 0 || !smi.stdout.trim()) {
    return { detected: false };
  }
  const line = smi.stdout.trim().split(/\r?\n/)[0]!;
  const parts = line.split(',').map((s) => s.trim());
  const name = parts[0] || undefined;
  const vram = Number(parts[1]);
  const driver = parts[2] || undefined;

  let cudaRuntimeVersion: string | undefined;
  const smiCuda = exec('nvidia-smi', [], { timeout: 8_000 });
  if (smiCuda.status === 0) {
    const m =
      smiCuda.stdout.match(/CUDA\s+UMD\s+Version:\s*([\d.]+)/i) ||
      smiCuda.stdout.match(/CUDA\s+Version:\s*([\d.]+)/i);
    if (m) cudaRuntimeVersion = m[1];
  }
  return {
    detected: !!name,
    name,
    vramMb: Number.isFinite(vram) ? vram : undefined,
    driverVersion: driver,
    cudaRuntimeVersion,
  };
}

function detectCudaToolkit(exec: ExecFn): { available: boolean; version?: string } {
  const nvcc = exec('nvcc', ['--version'], { timeout: 8_000 });
  if (nvcc.status === 0) {
    const m = (nvcc.stdout || nvcc.stderr).match(/release\s+([\d.]+)/i);
    return { available: true, version: m?.[1] };
  }
  return { available: false };
}

function probePackages(
  pythonCmd: string,
  exec: ExecFn,
): {
  packages: VytheraPackageInfo;
  pytorchCuda: boolean;
  pytorchCudaVersion?: string;
  gpuFromTorch?: string;
  vramFromTorch?: number;
} {
  const empty: VytheraPackageInfo = {};
  const script = [
    'import json',
    'out={"torch":False,"torch_ver":None,"transformers":False,"peft":False,',
    '"accelerate":False,"datasets":False,"bitsandbytes":False,"safetensors":False,',
    '"sentencepiece":False,"cuda":False,"cuda_ver":None,"gpu":None,"vram":None}',
    'try:',
    ' import torch',
    ' out["torch"]=True',
    ' out["torch_ver"]=getattr(torch,"__version__",None)',
    ' out["cuda"]=bool(torch.cuda.is_available())',
    ' if out["cuda"]:',
    '  out["cuda_ver"]=torch.version.cuda',
    '  out["gpu"]=torch.cuda.get_device_name(0)',
    '  try: out["vram"]=int(torch.cuda.get_device_properties(0).total_memory/1024/1024)',
    '  except Exception: pass',
    'except Exception: pass',
    'for name,key in [("transformers","transformers"),("peft","peft"),("accelerate","accelerate"),',
    '("datasets","datasets"),("bitsandbytes","bitsandbytes"),("safetensors","safetensors"),',
    '("sentencepiece","sentencepiece")]:',
    ' try:',
    '  __import__(name); out[key]=True',
    ' except Exception: pass',
    'print(json.dumps(out))',
  ].join('\n');

  const pkg = exec(pythonCmd, ['-c', script], { timeout: 45_000 });
  if (pkg.status !== 0) {
    return { packages: empty, pytorchCuda: false };
  }
  try {
    const j = JSON.parse(pkg.stdout.trim().split('\n').pop()!) as Record<string, unknown>;
    return {
      packages: {
        torch: !!j.torch,
        torchVersion: (j.torch_ver as string) || undefined,
        transformers: !!j.transformers,
        peft: !!j.peft,
        accelerate: !!j.accelerate,
        datasets: !!j.datasets,
        bitsandbytes: !!j.bitsandbytes,
        safetensors: !!j.safetensors,
        sentencepiece: !!j.sentencepiece,
      },
      pytorchCuda: !!j.cuda,
      pytorchCudaVersion: (j.cuda_ver as string) || undefined,
      gpuFromTorch: (j.gpu as string) || undefined,
      vramFromTorch: typeof j.vram === 'number' ? j.vram : undefined,
    };
  } catch {
    return { packages: empty, pytorchCuda: false };
  }
}

function probePip(pythonCmd: string, exec: ExecFn): { available: boolean; version?: string } {
  const r = exec(pythonCmd, ['-m', 'pip', '--version'], { timeout: 15_000 });
  if (r.status !== 0) return { available: false };
  const m = r.stdout.match(/pip\s+([\d.]+)/i);
  return { available: true, version: m?.[1] };
}

function supportedModalitiesFromPackages(
  peftStack: boolean,
  vlmTrainerPresent: boolean,
): TrainingModality[] {
  if (!peftStack) return [];
  const mods: TrainingModality[] = ['TEXT'];
  if (vlmTrainerPresent) mods.push('VISION_LANGUAGE');
  return mods;
}

/**
 * Detect real local training capability. Inject `exec` for tests.
 */
export function detectCapability(opts?: {
  exec?: ExecFn;
  forceMockTrainer?: boolean;
  writeManifest?: boolean;
}): VytheraTrainingCapability {
  const exec = opts?.exec ?? defaultExec;
  ensureTrainDirs();
  const plat = `${platform()}-${process.arch}`;
  const { cpu, ramMb } = detectCpuRam(exec);
  const nvidia = detectNvidia(exec);
  const toolkit = detectCudaToolkit(exec);

  const py = resolveTrainingPython(exec);
  const pythonAvailable = py.available;
  let packages: VytheraPackageInfo = {};
  let pytorchCuda = false;
  let pytorchCudaVersion: string | undefined;
  let pipAvailable = false;
  let pipVersion: string | undefined;

  if (pythonAvailable && py.cmd) {
    const pip = probePip(py.cmd, exec);
    pipAvailable = pip.available;
    pipVersion = pip.version;
    const probed = probePackages(py.cmd, exec);
    packages = probed.packages;
    pytorchCuda = probed.pytorchCuda;
    pytorchCudaVersion = probed.pytorchCudaVersion;
    if (probed.gpuFromTorch && !nvidia.name) {
      nvidia.detected = true;
      nvidia.name = probed.gpuFromTorch;
      nvidia.vramMb = probed.vramFromTorch ?? nvidia.vramMb;
    }
  }

  const trainerPath = PYTHON_TRAINER;
  const trainerFile = existsSync(trainerPath);
  const vlmTrainerFile = existsSync(PYTHON_VLM_TRAINER);
  const writable = assertWritableDir(VYTHERA_ADAPTERS_DIR);
  const peftStack = !!(packages.torch && packages.transformers && packages.peft);
  const qloraOk = peftStack && !!packages.bitsandbytes && pytorchCuda;
  const loraOk = peftStack;

  let available = false;
  let reason: string | undefined;
  let trainerAvailable = false;
  let trainerType: VytheraTrainerType | undefined;
  let method: VytheraTrainingCapability['backend']['method'] = 'none';

  if (opts?.forceMockTrainer) {
    trainerAvailable = true;
    trainerType = 'mock';
    available = true;
    method = 'lora';
    reason = 'Mock trainer forced (tests only — not real training)';
  } else if (!pythonAvailable) {
    reason = py.rejectedStub
      ? 'Python runtime not found (Windows Store python stub rejected). Install Python 3.11–3.12 or run: npm run vythera:train:setup'
      : 'Python runtime not found. Run: npm run vythera:train:setup';
  } else if (!trainerFile) {
    reason = `Trainer script missing: ${trainerPath}`;
  } else if (!peftStack) {
    reason =
      `Python packages incomplete (torch=${!!packages.torch}, transformers=${!!packages.transformers}, peft=${!!packages.peft}). `
      + `Run: npm run vythera:train:setup  (or pip install -r ${PYTHON_REQS})`;
    trainerAvailable = trainerFile;
    trainerType = qloraOk ? 'qlora' : 'lora';
  } else if (!writable) {
    reason = `Adapter output directory not writable: ${VYTHERA_ADAPTERS_DIR}`;
  } else {
    trainerAvailable = true;
    available = true;
    if (qloraOk) {
      method = 'qlora';
      trainerType = 'qlora';
      reason = 'LOCAL TRAINING READY (QLoRA)';
    } else if (loraOk && pytorchCuda) {
      method = 'lora';
      trainerType = 'lora';
      reason =
        'LOCAL TRAINING READY — LORA TRAINING AVAILABLE; QLoRA / 4-BIT NOT AVAILABLE (bitsandbytes missing or incompatible)';
    } else if (loraOk) {
      method = 'cpu-lora';
      trainerType = 'lora';
      reason = 'LOCAL TRAINING READY (CPU LoRA only — no PyTorch CUDA)';
    }
  }

  if (available && !reason) reason = 'LOCAL TRAINING READY';
  if (available && vlmTrainerFile && peftStack) {
    reason = (reason ?? 'LOCAL TRAINING READY') + ' · VISION TRAINING READY';
  } else if (available && !vlmTrainerFile) {
    reason = (reason ?? 'LOCAL TRAINING READY') + ' · VISION TRAINING NOT AVAILABLE (train_vlm.py missing)';
  }

  const cap: VytheraTrainingCapability = {
    available,
    platform: plat,
    system: { cpu, ramMb, os: plat },
    python: {
      available: pythonAvailable,
      version: py.version,
      executable: py.executable,
      pipAvailable,
      pipVersion,
      rejectedStub: py.rejectedStub,
      venvPath: existsSync(venvPythonPath()) ? py.venvPath : undefined,
    },
    gpu: {
      detected: nvidia.detected,
      available: nvidia.detected,
      vendor: nvidia.detected ? 'NVIDIA' : undefined,
      name: nvidia.name,
      vramMb: nvidia.vramMb,
      driverVersion: nvidia.driverVersion,
    },
    cuda: {
      runtimeAvailable: !!nvidia.cudaRuntimeVersion,
      runtimeVersion: nvidia.cudaRuntimeVersion,
      toolkitAvailable: toolkit.available,
      toolkitVersion: toolkit.version,
      pytorchCudaAvailable: pytorchCuda,
      pytorchCudaVersion,
    },
    trainer: {
      available: trainerAvailable,
      path: trainerFile ? trainerPath : undefined,
      type: trainerType,
    },
    packages,
    backend: {
      method,
      qloraAvailable: qloraOk,
      loraAvailable: loraOk,
      note: qloraOk
        ? 'QLoRA available'
        : loraOk
          ? 'LORA TRAINING AVAILABLE; QLoRA / 4-BIT NOT AVAILABLE'
          : undefined,
    },
    supportedModalities: supportedModalitiesFromPackages(peftStack, vlmTrainerFile),
    reason,
    stage: available ? 'LOCAL_TRAINING_READY' : 'LOCAL_TRAINING_BACKEND_NOT_AVAILABLE',
  };

  if (opts?.writeManifest !== false) {
    try {
      writeFileSync(VYTHERA_CAPABILITY_MANIFEST, JSON.stringify(cap, null, 2), 'utf8');
    } catch {
      /* non-fatal */
    }
  }

  return cap;
}

export function formatCapabilityLines(c: VytheraTrainingCapability): string[] {
  const yn = (ok: boolean | undefined, detail?: string) =>
    ok ? `OK${detail ? ` ${detail}` : ''}`.trim() : 'MISSING';
  return [
    c.stage.replace(/_/g, ' '),
    `Platform: ${c.platform}`,
    `CPU: ${c.system.cpu ?? 'unknown'}`,
    `RAM: ${c.system.ramMb != null ? `${c.system.ramMb} MB` : 'unknown'}`,
    `GPU DETECTED: ${c.gpu.detected ? yn(true, c.gpu.name) : 'MISSING'}`,
    `VRAM: ${c.gpu.vramMb != null ? `${c.gpu.vramMb} MB` : 'unknown'}`,
    `GPU driver: ${c.gpu.driverVersion ?? 'unknown'}`,
    `CUDA RUNTIME AVAILABLE: ${c.cuda.runtimeAvailable ? yn(true, c.cuda.runtimeVersion) : 'MISSING'}`,
    `CUDA TOOLKIT AVAILABLE: ${c.cuda.toolkitAvailable ? yn(true, c.cuda.toolkitVersion) : 'MISSING'}`,
    `PYTORCH CUDA AVAILABLE: ${c.cuda.pytorchCudaAvailable ? yn(true, c.cuda.pytorchCudaVersion) : 'MISSING'}`,
    `Python: ${c.python.available ? yn(true, `${c.python.version ?? ''} (${c.python.executable ?? ''})`) : 'MISSING'}`,
    `pip: ${c.python.pipAvailable ? yn(true, c.python.pipVersion) : 'MISSING'}`,
    `torch: ${c.packages.torch ? yn(true, c.packages.torchVersion) : 'MISSING'}`,
    `transformers: ${c.packages.transformers ? 'OK' : 'MISSING'}`,
    `peft: ${c.packages.peft ? 'OK' : 'MISSING'}`,
    `accelerate: ${c.packages.accelerate ? 'OK' : 'MISSING'}`,
    `bitsandbytes: ${c.packages.bitsandbytes ? 'OK' : 'MISSING'}`,
    `Backend: ${c.backend.method}${c.backend.note ? ` — ${c.backend.note}` : ''}`,
    `Modalities: ${c.supportedModalities.join(', ') || 'none'}`,
    `Vision trainer: ${c.supportedModalities.includes('VISION_LANGUAGE') ? 'OK' : 'MISSING'}`,
    `Trainer: ${c.trainer.available ? yn(true, `(${c.trainer.type})`) : 'MISSING'}`,
    c.reason ? `Reason: ${c.reason}` : '',
  ].filter(Boolean);
}
