/** Local vision backend abstraction — never contacts cloud. */

export interface VytheraVisionImage {
  /** Raw image bytes as base64 without data: prefix */
  base64: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  width?: number;
  height?: number;
  fileName?: string;
}

export interface VytheraVisionRequest {
  model: string;
  prompt: string;
  image: VytheraVisionImage;
  jsonMode?: boolean;
  temperature?: number;
  signal?: AbortSignal;
  requestId?: string;
}

export interface VytheraVisionModelInfo {
  name: string;
  capabilities: Array<'TEXT' | 'VISION' | 'EMBEDDING' | 'CODE' | 'AUDIO'>;
}

export interface VytheraVisionBackend {
  readonly id: string;
  readonly displayName: string;
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  isAvailable(signal?: AbortSignal): Promise<boolean>;
  listVisionModels(signal?: AbortSignal): Promise<VytheraVisionModelInfo[]>;
  analyze(req: VytheraVisionRequest): Promise<string>;
  cancel(requestId?: string): void;
}
