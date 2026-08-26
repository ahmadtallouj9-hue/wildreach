/** Shared types for VYTHERA local training orchestrator (Node side). */

export type VytheraDiskJobStatus =
  | 'CREATED'
  | 'QUEUED'
  | 'EXPORTING'
  | 'STARTING'
  | 'RUNNING'
  | 'EVALUATING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'awaiting_external';

export type VytheraTrainerType = 'qlora' | 'lora' | 'mock' | 'other';

/** Declared training task modality — not inferred from “has an image file”. */
export type TrainingModality =
  | 'TEXT'
  | 'VISION_LANGUAGE'
  | 'VISION_ENCODER'
  | 'EMBEDDING';

export type TrainableModelKind =
  | 'TEXT_MODEL'
  | 'VISION_LANGUAGE_MODEL'
  | 'VISION_ENCODER'
  | 'IMAGE_EMBEDDING_MODEL'
  | 'UNKNOWN'
  | 'OLLAMA_GGUF_NOT_TRAINABLE';

export interface VytheraSystemInfo {
  cpu?: string;
  ramMb?: number;
  os: string;
}

export interface VytheraGpuInfo {
  /** GPU hardware present (nvidia-smi / WMI / Metal) — independent of CUDA toolkit */
  detected: boolean;
  available: boolean;
  vendor?: string;
  name?: string;
  vramMb?: number;
  driverVersion?: string;
}

export interface VytheraCudaInfo {
  /** NVIDIA driver reports a CUDA version (UMD) */
  runtimeAvailable: boolean;
  runtimeVersion?: string;
  /** nvcc / CUDA toolkit on PATH */
  toolkitAvailable: boolean;
  toolkitVersion?: string;
  /** torch.cuda.is_available() inside the training venv */
  pytorchCudaAvailable: boolean;
  pytorchCudaVersion?: string;
}

export interface VytheraPythonInfo {
  available: boolean;
  version?: string;
  /** Absolute path to interpreter used for training */
  executable?: string;
  pipAvailable?: boolean;
  pipVersion?: string;
  /** True when WindowsApps store stub was rejected */
  rejectedStub?: boolean;
  venvPath?: string;
}

export interface VytheraPackageInfo {
  torch?: boolean;
  torchVersion?: string;
  transformers?: boolean;
  peft?: boolean;
  accelerate?: boolean;
  datasets?: boolean;
  bitsandbytes?: boolean;
  safetensors?: boolean;
  sentencepiece?: boolean;
}

export interface VytheraTrainingBackendInfo {
  /** Compatible method advertised honestly */
  method: 'qlora' | 'lora' | 'cpu-lora' | 'none';
  qloraAvailable: boolean;
  loraAvailable: boolean;
  note?: string;
}

export interface VytheraTrainingCapability {
  available: boolean;
  platform: string;
  system: VytheraSystemInfo;
  python: VytheraPythonInfo;
  gpu: VytheraGpuInfo;
  cuda: VytheraCudaInfo;
  trainer: {
    available: boolean;
    path?: string;
    type?: VytheraTrainerType;
  };
  packages: VytheraPackageInfo;
  backend: VytheraTrainingBackendInfo;
  supportedModalities: TrainingModality[];
  reason?: string;
  /** Honest UI stage */
  stage: 'LOCAL_TRAINING_READY' | 'LOCAL_TRAINING_BACKEND_NOT_AVAILABLE';
}

export interface VytheraPreflightCheck {
  name: string;
  status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP';
  detail?: string;
}

export interface VytheraPreflightResult {
  ok: boolean;
  ready: boolean;
  checks: VytheraPreflightCheck[];
  blockedReason?: string;
  lines: string[];
}

export interface VytheraTrainingProgress {
  message: string;
  step?: number;
  totalSteps?: number;
  loss?: number;
  epoch?: number;
  /** Never invent percentages — omit if unknown */
  rawLine?: string;
}

export interface VytheraCompletionManifest {
  status: 'completed' | 'failed' | 'cancelled';
  baseModel: string;
  adapterPath: string;
  datasetVersion: string;
  trainingSteps: number;
  epochs: number;
  trainLoss: number | null;
  validationLoss: number | null;
  metricsPath?: string;
  evaluationPath?: string;
  modality?: TrainingModality;
  completedAt: number;
  provider: string;
}

export interface VytheraDiskTrainingJob {
  id: string;
  status: VytheraDiskJobStatus;
  baseModel: string;
  /** HuggingFace id or local path — trainable base, not Ollama tag unless exported */
  trainableBaseModel: string;
  /** Declared modality for this job */
  modality: TrainingModality;
  datasetVersion: string;
  datasetDir: string;
  outputPath: string;
  method: 'QLoRA' | 'LoRA';
  epochs: number;
  learningRate: number;
  batchSize: number;
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  pid: number | null;
  progress: VytheraTrainingProgress | null;
  log: string[];
  error: string | null;
  completionManifest: VytheraCompletionManifest | null;
  provider: string;
  /** True only when MockTrainingProvider used — never report as real training in UI */
  isMock: boolean;
}

export interface VytheraTrainingResult {
  ok: boolean;
  job: VytheraDiskTrainingJob;
  manifest?: VytheraCompletionManifest;
  error?: string;
}

export interface VytheraEvaluationResult {
  ok: boolean;
  baseScore: number;
  candidateScore: number;
  improved: boolean;
  metricsPath: string;
  details: Record<string, unknown>;
}

export interface VytheraTrainingProvider {
  readonly id: string;
  readonly displayName: string;
  /** Tests only — UI must never present mock as real training. */
  readonly isMock: boolean;
  canTrain(model: string): Promise<boolean>;
  train(job: VytheraDiskTrainingJob, opts: {
    onProgress: (p: VytheraTrainingProgress) => void;
    signal?: AbortSignal;
  }): Promise<VytheraTrainingResult>;
  evaluate(opts: {
    job: VytheraDiskTrainingJob;
    validationJsonl: string;
  }): Promise<VytheraEvaluationResult>;
}
