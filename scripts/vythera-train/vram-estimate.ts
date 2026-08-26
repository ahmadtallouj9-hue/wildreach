/**
 * Estimate whether a VLM training config likely fits in VRAM.
 * Conservative heuristic — blocks oversized jobs before GPU OOM.
 */
export type VramEstimateInput = {
  vramMb: number;
  paramBillions: number;
  method: 'LoRA' | 'QLoRA';
  batchSize: number;
  gradAccum: number;
  imageSide: number;
  maxSeqLen: number;
  loraRank: number;
  gradientCheckpointing: boolean;
  mixedPrecision: boolean;
};

export type VramEstimateResult = {
  ok: boolean;
  estimatedMb: number;
  availableMb: number;
  headroomMb: number;
  blockedReason?: string;
  lines: string[];
};

/** Rough param counts for known small VLMs (billions). */
export function estimateParamBillions(modelId: string): number {
  const m = modelId.toLowerCase();
  if (m.includes('256m') || m.includes('0.25')) return 0.256;
  if (m.includes('500m') || m.includes('0.5b')) return 0.5;
  if (m.includes('2b')) return 2.0;
  if (m.includes('3b')) return 3.0;
  if (m.includes('7b')) return 7.0;
  if (m.includes('smolvlm') && !m.includes('256') && !m.includes('500')) return 2.2;
  return 1.0; // conservative unknown
}

export function estimateVramMb(input: VramEstimateInput): VramEstimateResult {
  const bytesPerParam = input.method === 'QLoRA' ? 0.5 : input.mixedPrecision ? 2 : 4;
  const baseWeights = input.paramBillions * 1e9 * bytesPerParam;
  // Activations scale with batch * seq * image tokens (coarse)
  const imgTokens = Math.ceil((input.imageSide / 16) ** 2);
  const actFactor = input.gradientCheckpointing ? 0.35 : 1.0;
  const activations =
    input.batchSize *
    (input.maxSeqLen + imgTokens) *
    2048 *
    2 *
    actFactor *
    (input.mixedPrecision ? 2 : 4);
  const loraOverhead = input.loraRank * 4e6 * 4; // rough adapter + optimizer
  const optimizer = input.method === 'QLoRA' ? loraOverhead * 2 : loraOverhead * 3;
  const total = (baseWeights + activations + optimizer) / (1024 * 1024);
  // Safety margin 15%
  const estimatedMb = Math.ceil(total * 1.15);
  const availableMb = Math.max(0, input.vramMb - 512); // reserve driver
  const headroomMb = availableMb - estimatedMb;
  const ok = estimatedMb <= availableMb;
  const lines = [
    'VYTHERA VRAM ESTIMATE',
    `Model params: ~${input.paramBillions}B`,
    `Method: ${input.method}`,
    `Batch×accum: ${input.batchSize}×${input.gradAccum}`,
    `Image side: ${input.imageSide}`,
    `Seq len: ${input.maxSeqLen}`,
    `LoRA rank: ${input.loraRank}`,
    `Grad checkpoint: ${input.gradientCheckpointing}`,
    `Estimated: ${estimatedMb} MB`,
    `Available: ${availableMb} MB (of ${input.vramMb} MB)`,
    ok ? 'VRAM PREFLIGHT PASS' : 'TRAINING BLOCKED — ESTIMATED VRAM EXCEEDED',
  ];
  return {
    ok,
    estimatedMb,
    availableMb,
    headroomMb,
    blockedReason: ok ? undefined : 'TRAINING BLOCKED — ESTIMATED VRAM EXCEEDED',
    lines,
  };
}

export function defaultVlmTrainSettings(vramMb: number): {
  batchSize: number;
  gradAccum: number;
  imageSide: number;
  maxSeqLen: number;
  loraRank: number;
  method: 'LoRA' | 'QLoRA';
  gradientCheckpointing: boolean;
  mixedPrecision: boolean;
} {
  if (vramMb >= 10000) {
    return {
      batchSize: 1,
      gradAccum: 4,
      imageSide: 384,
      maxSeqLen: 512,
      loraRank: 8,
      method: 'QLoRA',
      gradientCheckpointing: true,
      mixedPrecision: true,
    };
  }
  return {
    batchSize: 1,
    gradAccum: 8,
    imageSide: 256,
    maxSeqLen: 384,
    loraRank: 4,
    method: 'LoRA',
    gradientCheckpointing: true,
    mixedPrecision: true,
  };
}
