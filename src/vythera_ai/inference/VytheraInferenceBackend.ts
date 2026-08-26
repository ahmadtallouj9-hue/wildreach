/** VYTHERA AI inference abstraction — local only. */

export interface VytheraChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface VytheraGenerateRequest {
  model: string;
  messages: VytheraChatMessage[];
  jsonMode?: boolean;
  temperature?: number;
  stream?: boolean;
  signal?: AbortSignal;
  onToken?: (token: string) => void;
  requestId?: string;
}

export interface VytheraModelInfo {
  name: string;
  sizeBytes?: number;
}

export interface VytheraInferenceBackend {
  readonly id: string;
  readonly displayName: string;
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  isAvailable(signal?: AbortSignal): Promise<boolean>;
  listModels(signal?: AbortSignal): Promise<VytheraModelInfo[]>;
  generate(req: VytheraGenerateRequest): Promise<string>;
  cancel(requestId?: string): void;
  /** Optional local embeddings — returns null if unsupported. */
  embed?(texts: string[], signal?: AbortSignal): Promise<number[][] | null>;
}
