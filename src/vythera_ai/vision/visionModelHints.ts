/** Heuristic detection of Ollama vision-capable model names. */

const VISION_HINTS = [
  'llava',
  'bakllava',
  'moondream',
  'minicpm-v',
  'minicpm_v',
  'qwen2-vl',
  'qwen2.5-vl',
  'qwen-vl',
  'gemma3', // gemma3 multimodal variants often include vision
  'llama3.2-vision',
  'vision',
  'pixtral',
  'internvl',
];

export function isLikelyVisionModelName(name: string): boolean {
  const n = name.toLowerCase();
  return VISION_HINTS.some((h) => n.includes(h));
}

export type VytheraModelCapability = 'TEXT' | 'VISION' | 'EMBEDDING' | 'CODE' | 'AUDIO';

export function inferCapabilitiesFromName(name: string): VytheraModelCapability[] {
  const caps: VytheraModelCapability[] = ['TEXT'];
  if (isLikelyVisionModelName(name)) caps.push('VISION');
  if (/embed|nomic|bge|mxbai/i.test(name)) caps.push('EMBEDDING');
  if (/coder|code|deepseek-coder/i.test(name)) caps.push('CODE');
  return caps;
}
