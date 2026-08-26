/** Training modality + trainable-base validation (no fake vision claims). */
import type { TrainableModelKind, TrainingModality } from './types.ts';

/** Known Ollama / GGUF style tags — not PEFT-trainable via this pipeline. */
const OLLAMA_HINT =
  /^(llava|bakllava|moondream|minicpm-v|qwen2-vl|llama3\.2-vision|gemma3|nomic-embed|mxbai|all-minilm)(:|$)/i;

const VISION_VL_HINTS =
  /vl|vision|llava|blip|florence|qwen2[-.]?vl|idefics|paligemma|minicpm-v|internvl/i;

const ENCODER_HINTS = /clip|siglip|dinov2|vit-|image-encoder/i;
const EMBED_HINTS = /embed|nomic|bge-|e5-|gte-/i;

export function classifyTrainableBase(model: string): TrainableModelKind {
  const m = (model || '').trim();
  if (!m) return 'UNKNOWN';
  // Absolute/local paths: classify by basename
  const leaf = m.replace(/\\/g, '/').split('/').pop() ?? m;
  if (OLLAMA_HINT.test(m) || OLLAMA_HINT.test(leaf) || /\.gguf$/i.test(m)) {
    return 'OLLAMA_GGUF_NOT_TRAINABLE';
  }
  if (VISION_VL_HINTS.test(m) || VISION_VL_HINTS.test(leaf)) return 'VISION_LANGUAGE_MODEL';
  if (ENCODER_HINTS.test(m) || ENCODER_HINTS.test(leaf)) return 'VISION_ENCODER';
  if (EMBED_HINTS.test(m) || EMBED_HINTS.test(leaf)) return 'IMAGE_EMBEDDING_MODEL';
  // Default HF causal LM ids → text
  return 'TEXT_MODEL';
}

export function modalitiesForKind(kind: TrainableModelKind): TrainingModality[] {
  switch (kind) {
    case 'TEXT_MODEL':
      return ['TEXT'];
    case 'VISION_LANGUAGE_MODEL':
      return ['VISION_LANGUAGE', 'TEXT'];
    case 'VISION_ENCODER':
      return ['VISION_ENCODER'];
    case 'IMAGE_EMBEDDING_MODEL':
      return ['EMBEDDING'];
    default:
      return [];
  }
}

export function validateModalityCombo(opts: {
  modality: TrainingModality;
  baseModel: string;
  hasImages: boolean;
}): { ok: boolean; error?: string; kind: TrainableModelKind } {
  const kind = classifyTrainableBase(opts.baseModel);
  if (kind === 'OLLAMA_GGUF_NOT_TRAINABLE') {
    return {
      ok: false,
      kind,
      error: 'MODEL NOT TRAINABLE WITH CURRENT LOCAL BACKEND (Ollama/GGUF is inference-only)',
    };
  }
  if (kind === 'UNKNOWN') {
    return { ok: false, kind, error: 'MODEL NOT TRAINABLE WITH CURRENT LOCAL BACKEND' };
  }
  const allowed = modalitiesForKind(kind);
  if (!allowed.includes(opts.modality)) {
    return {
      ok: false,
      kind,
      error:
        `TRAINING BLOCKED\nReason:\nSelected base model is ${kind} but dataset requires ${opts.modality} training.`,
    };
  }
  if (
    (opts.modality === 'VISION_LANGUAGE' ||
      opts.modality === 'VISION_ENCODER' ||
      opts.modality === 'EMBEDDING') &&
    !opts.hasImages
  ) {
    return {
      ok: false,
      kind,
      error:
        'TRAINING BLOCKED\nReason:\nVision/embedding modality requires exported image files, not text-only rows.',
    };
  }
  return { ok: true, kind };
}

/** Infer a default modality from records + chosen base (honest defaults). */
export function inferDefaultModality(
  baseModel: string,
  opts?: { forceTextOnly?: boolean; hasImages?: boolean },
): TrainingModality {
  if (opts?.forceTextOnly) return 'TEXT';
  const kind = classifyTrainableBase(baseModel);
  if (kind === 'VISION_LANGUAGE_MODEL' && opts?.hasImages) return 'VISION_LANGUAGE';
  if (kind === 'VISION_ENCODER' && opts?.hasImages) return 'VISION_ENCODER';
  if (kind === 'IMAGE_EMBEDDING_MODEL' && opts?.hasImages) return 'EMBEDDING';
  return 'TEXT';
}
