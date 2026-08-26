/** Structured capability from local training daemon (127.0.0.1). */
import type { VytheraLearningStage } from './VytheraLearningStates';

export type TrainingModality =
  | 'TEXT'
  | 'VISION_LANGUAGE'
  | 'VISION_ENCODER'
  | 'EMBEDDING';

export type VytheraLocalTrainingCapability = {
  available: boolean;
  platform: string;
  system?: { cpu?: string; ramMb?: number; os?: string };
  python: {
    available: boolean;
    version?: string;
    executable?: string;
    pipAvailable?: boolean;
    rejectedStub?: boolean;
  };
  gpu: {
    detected?: boolean;
    available: boolean;
    vendor?: string;
    name?: string;
    vramMb?: number;
    driverVersion?: string;
  };
  cuda?: {
    available?: boolean;
    version?: string;
    runtimeAvailable?: boolean;
    runtimeVersion?: string;
    toolkitAvailable?: boolean;
    toolkitVersion?: string;
    pytorchCudaAvailable?: boolean;
    pytorchCudaVersion?: string;
  };
  trainer: { available: boolean; path?: string; type?: string };
  packages?: Record<string, boolean | string | undefined>;
  backend?: {
    method?: string;
    qloraAvailable?: boolean;
    loraAvailable?: boolean;
    note?: string;
  };
  supportedModalities?: TrainingModality[];
  reason?: string;
  stage: 'LOCAL_TRAINING_READY' | 'LOCAL_TRAINING_BACKEND_NOT_AVAILABLE';
  lines?: string[];
  daemonOnline: boolean;
};

export type VytheraBrowserTrainingReport = {
  browserCanTrain: false;
  trainerScriptPresent: boolean;
  pythonPeftHint: boolean;
  ollamaPresent: boolean;
  available: boolean;
  stage: VytheraLearningStage | 'LOCAL_TRAINING_READY';
  message: string;
  recommendedCommand: string;
  local?: VytheraLocalTrainingCapability;
};

function trainBaseUrl(): string {
  if (typeof window !== 'undefined' && import.meta.env?.DEV) return '/vythera-train';
  return 'http://127.0.0.1:8791';
}

/** Legacy detect — browser cannot train weights itself. */
export function detectTrainingCapability(opts?: {
  trainerScriptExists?: boolean;
  ollamaAvailable?: boolean;
  pythonPeftDetected?: boolean;
}): VytheraBrowserTrainingReport {
  return {
    browserCanTrain: false,
    trainerScriptPresent: opts?.trainerScriptExists ?? false,
    pythonPeftHint: opts?.pythonPeftDetected ?? false,
    ollamaPresent: opts?.ollamaAvailable ?? false,
    available: false,
    stage: 'LOCAL_TRAINING_BACKEND_NOT_AVAILABLE',
    message:
      'Start the local training daemon: npm run vythera:train:daemon',
    recommendedCommand: 'npm run vythera:train:daemon',
  };
}

export async function probeTrainingCapability(
  signal?: AbortSignal,
): Promise<VytheraBrowserTrainingReport> {
  let ollamaAvailable = false;
  try {
    const base =
      typeof window !== 'undefined' && import.meta.env?.DEV
        ? '/ollama'
        : 'http://127.0.0.1:11434';
    const res = await fetch(`${base}/api/tags`, { signal, method: 'GET' });
    ollamaAvailable = res.ok;
  } catch {
    ollamaAvailable = false;
  }

  try {
    const res = await fetch(`${trainBaseUrl()}/capability`, { signal });
    if (!res.ok) throw new Error('daemon error');
    const local = (await res.json()) as VytheraLocalTrainingCapability;
    local.daemonOnline = true;
    const available = !!local.available;
    return {
      browserCanTrain: false,
      trainerScriptPresent: !!local.trainer?.available,
      pythonPeftHint: !!local.packages?.peft,
      ollamaPresent: ollamaAvailable,
      available,
      stage: available ? 'LOCAL_TRAINING_READY' : 'LOCAL_TRAINING_BACKEND_NOT_AVAILABLE',
      message:
        local.reason ??
        (available
          ? 'LOCAL TRAINING READY'
          : 'LOCAL TRAINING BACKEND NOT AVAILABLE'),
      recommendedCommand: available
        ? 'Use START TRAINING in Studio (daemon online)'
        : 'npm run vythera:train:setup && npm run vythera:train:daemon',
      local,
    };
  } catch {
    return {
      ...detectTrainingCapability({
        ollamaAvailable,
        trainerScriptExists: true,
        pythonPeftDetected: false,
      }),
      message:
        'LOCAL TRAINING BACKEND NOT AVAILABLE — training daemon offline (npm run vythera:train:daemon)',
      local: {
        available: false,
        platform: 'unknown',
        python: { available: false },
        gpu: { available: false, detected: false },
        trainer: { available: false },
        reason: 'Daemon not reachable on 127.0.0.1:8791',
        stage: 'LOCAL_TRAINING_BACKEND_NOT_AVAILABLE',
        daemonOnline: false,
        lines: [
          'Python: unknown (daemon offline)',
          'GPU: unknown (daemon offline)',
          'CUDA: unknown (daemon offline)',
          'Trainer: MISSING (start daemon)',
          'Run: npm run vythera:train:setup',
        ],
      },
    };
  }
}

export async function trainDaemonCreateJob(body: {
  records: unknown[];
  datasetVersion: string;
  baseModel: string;
  trainableBaseModel?: string;
  images?: Record<string, { base64: string; mimeType: string }>;
  modality?: TrainingModality;
  textOnly?: boolean;
  autoStart?: boolean;
  useMock?: boolean;
  epochs?: number;
}): Promise<{ job: { id: string; status: string }; capability: VytheraLocalTrainingCapability }> {
  const res = await fetch(`${trainBaseUrl()}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t.slice(0, 200) || 'Failed to create training job');
  }
  return res.json() as Promise<{
    job: { id: string; status: string };
    capability: VytheraLocalTrainingCapability;
  }>;
}

export async function trainDaemonJobAction(
  id: string,
  action: 'start' | 'cancel' | 'evaluate' | 'promote',
): Promise<unknown> {
  const res = await fetch(`${trainBaseUrl()}/jobs/${encodeURIComponent(id)}/${action}`, {
    method: 'POST',
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Job action failed');
  return data;
}

export async function trainDaemonListJobs(): Promise<{ jobs: unknown[] }> {
  const res = await fetch(`${trainBaseUrl()}/jobs`);
  if (!res.ok) throw new Error('Cannot list jobs — is the daemon running?');
  return res.json() as Promise<{ jobs: unknown[] }>;
}

export async function trainDaemonGetJob(id: string): Promise<{ job: Record<string, unknown> }> {
  const res = await fetch(`${trainBaseUrl()}/jobs/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error('Job not found');
  return res.json() as Promise<{ job: Record<string, unknown> }>;
}

export async function trainDaemonRollback(to: string): Promise<unknown> {
  const res = await fetch(`${trainBaseUrl()}/rollback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to }),
  });
  return res.json();
}

/** Client-side check: Ollama tags are never valid PEFT bases. */
export function isOllamaTagNotTrainable(model: string): boolean {
  const m = (model || '').trim();
  if (!m) return false;
  if (/\.gguf$/i.test(m)) return true;
  return /^(llava|bakllava|moondream|minicpm-v|qwen2-vl|llama3\.2-vision|gemma3)(:|$)/i.test(m);
}
