/**
 * Inspect Transformers configs for trainable modality.
 * Prefer real config fields over name heuristics.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { venvPythonPath, VYTHERA_TRAIN_ROOT, ensureTrainDirs } from './paths.ts';
import type { TrainingModality } from './types.ts';

export type VytheraModelArchFamily =
  | 'TEXT_ONLY'
  | 'VISION_LANGUAGE'
  | 'VISION_ENCODER'
  | 'UNSUPPORTED';

export type VytheraModelCapabilities = {
  modelId: string;
  modality: TrainingModality;
  archFamily: VytheraModelArchFamily;
  modelType?: string;
  architectures?: string[];
  trainingSupported: boolean;
  imageInputSupported: boolean;
  loraSupported: boolean;
  qloraSupported: boolean;
  maxImageSize?: number;
  processorType?: string;
  recommendedTargetModules?: string[];
  reason?: string;
};

const CACHE = join(VYTHERA_TRAIN_ROOT, 'model-capabilities-cache.json');

const VLM_MODEL_TYPES = new Set([
  'idefics3',
  'idefics2',
  'idefics',
  'qwen2_vl',
  'qwen2_5_vl',
  'llava',
  'llava_next',
  'llava_onevision',
  'paligemma',
  'blip-2',
  'blip',
  'instructblip',
  'florence2',
  'phi3_v',
  'mllama',
  'aria',
]);

const ENCODER_TYPES = new Set(['clip', 'siglip', 'vit', 'dinov2', 'imagegpt']);

const TEXT_TYPES = new Set([
  'llama',
  'mistral',
  'qwen2',
  'gpt2',
  'gemma',
  'gemma2',
  'phi',
  'phi3',
  'falcon',
  'opt',
  'bloom',
  'mpt',
]);

function pythonCmd(): string {
  const v = venvPythonPath();
  return existsSync(v) ? v : process.platform === 'win32' ? 'python' : 'python3';
}

/** Heuristic fallback when Python/transformers unavailable (tests). */
export function classifyFromConfigFields(opts: {
  modelType?: string;
  architectures?: string[];
  hasVisionConfig?: boolean;
}): Omit<VytheraModelCapabilities, 'modelId'> {
  const mt = (opts.modelType || '').toLowerCase();
  const arch = (opts.architectures || []).join(' ').toLowerCase();
  const visionHint =
    opts.hasVisionConfig ||
    VLM_MODEL_TYPES.has(mt) ||
    /vision|vlm|idefics|llava|blip|paligemma|florence|qwen2.?vl/i.test(arch);

  if (ENCODER_TYPES.has(mt) || /clip|siglip|dinov2/.test(arch)) {
    return {
      modality: 'VISION_ENCODER',
      archFamily: 'VISION_ENCODER',
      modelType: opts.modelType,
      architectures: opts.architectures,
      trainingSupported: false,
      imageInputSupported: true,
      loraSupported: false,
      qloraSupported: false,
      reason: 'Vision encoder — embedding/encoder PEFT not in current trainer',
    };
  }
  if (visionHint) {
    const targets = defaultLoraTargets(mt);
    return {
      modality: 'VISION_LANGUAGE',
      archFamily: 'VISION_LANGUAGE',
      modelType: opts.modelType,
      architectures: opts.architectures,
      trainingSupported: true,
      imageInputSupported: true,
      loraSupported: true,
      qloraSupported: true,
      processorType: 'AutoProcessor',
      recommendedTargetModules: targets,
      reason: 'Config indicates multimodal conditional generation',
    };
  }
  if (TEXT_TYPES.has(mt) || /CausalLM|ForCausalLM/i.test(arch)) {
    return {
      modality: 'TEXT',
      archFamily: 'TEXT_ONLY',
      modelType: opts.modelType,
      architectures: opts.architectures,
      trainingSupported: true,
      imageInputSupported: false,
      loraSupported: true,
      qloraSupported: true,
      reason: 'Text causal LM',
    };
  }
  return {
    modality: 'TEXT',
    archFamily: 'UNSUPPORTED',
    modelType: opts.modelType,
    architectures: opts.architectures,
    trainingSupported: false,
    imageInputSupported: false,
    loraSupported: false,
    qloraSupported: false,
    reason: 'Unrecognized architecture',
  };
}

export function defaultLoraTargets(modelType: string): string[] {
  const mt = modelType.toLowerCase();
  if (mt.includes('idefics') || mt.includes('smolvlm')) {
    return ['q_proj', 'k_proj', 'v_proj', 'o_proj', 'gate_proj', 'up_proj', 'down_proj'];
  }
  if (mt.includes('qwen2_vl') || mt.includes('qwen2_5_vl')) {
    return ['q_proj', 'k_proj', 'v_proj', 'o_proj', 'gate_proj', 'up_proj', 'down_proj'];
  }
  if (mt.includes('llava')) {
    return ['q_proj', 'v_proj', 'k_proj', 'o_proj'];
  }
  return ['q_proj', 'v_proj', 'k_proj', 'o_proj'];
}

/** Recommended small VLM for ~12GB VRAM. */
export const DEFAULT_VLM_BASE = 'HuggingFaceTB/SmolVLM-256M-Instruct';

export function detectModelCapabilities(
  modelId: string,
  opts?: { useCache?: boolean; forcePython?: boolean },
): VytheraModelCapabilities {
  ensureTrainDirs();
  if (opts?.useCache !== false && existsSync(CACHE)) {
    try {
      const all = JSON.parse(readFileSync(CACHE, 'utf8')) as Record<string, VytheraModelCapabilities>;
      if (all[modelId]) return all[modelId];
    } catch {
      /* ignore */
    }
  }

  const script = [
    'import json,sys',
    'mid=sys.argv[1]',
    'out={"modelType":None,"architectures":None,"hasVisionConfig":False,"processorType":None,"error":None}',
    'try:',
    ' from transformers import AutoConfig',
    ' c=AutoConfig.from_pretrained(mid, trust_remote_code=True)',
    ' out["modelType"]=getattr(c,"model_type",None)',
    ' out["architectures"]=list(getattr(c,"architectures",None) or [])',
    ' out["hasVisionConfig"]=hasattr(c,"vision_config") and getattr(c,"vision_config") is not None',
    ' try:',
    '  from transformers import AutoProcessor',
    '  p=AutoProcessor.from_pretrained(mid, trust_remote_code=True)',
    '  out["processorType"]=type(p).__name__',
    ' except Exception as e:',
    '  out["processorError"]=str(e)[:200]',
    'except Exception as e:',
    ' out["error"]=str(e)[:400]',
    'print(json.dumps(out))',
  ].join('\n');

  const py = pythonCmd();
  const r = spawnSync(py, ['-c', script, modelId], {
    encoding: 'utf8',
    timeout: 120_000,
    windowsHide: true,
    shell: false,
  });

  if (r.status !== 0 && opts?.forcePython) {
    return {
      modelId,
      modality: 'TEXT',
      archFamily: 'UNSUPPORTED',
      trainingSupported: false,
      imageInputSupported: false,
      loraSupported: false,
      qloraSupported: false,
      reason: `Config inspect failed: ${(r.stderr || r.stdout || '').slice(0, 200)}`,
    };
  }

  let parsed: {
    modelType?: string;
    architectures?: string[];
    hasVisionConfig?: boolean;
    processorType?: string;
    error?: string;
  } = {};
  try {
    const line = (r.stdout || '').trim().split('\n').pop()!;
    parsed = JSON.parse(line);
  } catch {
    // Name-based last resort only when Python failed entirely
    const fromName = /smolvlm|idefics|qwen2-vl|llava|paligemma|florence|phi-.*vision/i.test(modelId);
    const base = classifyFromConfigFields({
      modelType: fromName ? 'idefics3' : 'gpt2',
      hasVisionConfig: fromName,
    });
    return {
      modelId,
      ...base,
      reason: fromName
        ? 'Fallback name hint (config inspect unavailable) — verify before training'
        : 'Config inspect unavailable',
    };
  }

  if (parsed.error) {
    return {
      modelId,
      modality: 'TEXT',
      archFamily: 'UNSUPPORTED',
      trainingSupported: false,
      imageInputSupported: false,
      loraSupported: false,
      qloraSupported: false,
      reason: parsed.error,
    };
  }

  const base = classifyFromConfigFields({
    modelType: parsed.modelType,
    architectures: parsed.architectures,
    hasVisionConfig: parsed.hasVisionConfig,
  });
  const cap: VytheraModelCapabilities = {
    modelId,
    ...base,
    processorType: parsed.processorType ?? base.processorType,
  };

  try {
    let all: Record<string, VytheraModelCapabilities> = {};
    if (existsSync(CACHE)) all = JSON.parse(readFileSync(CACHE, 'utf8'));
    all[modelId] = cap;
    writeFileSync(CACHE, JSON.stringify(all, null, 2), 'utf8');
  } catch {
    /* ignore */
  }
  return cap;
}
