/**
 * Localhost-only VYTHERA training + vision inference daemon.
 * Bind: 127.0.0.1:8791 — never expose remotely.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { detectCapability, formatCapabilityLines } from './detect-capability.ts';
import {
  cancelJob,
  exportAndCreateJob,
  recoverJobs,
  startJob,
} from './orchestrator.ts';
import { listJobs, readJob } from './jobStore.ts';
import { evaluateJob } from './evaluate.ts';
import {
  getActiveAdapter,
  getActiveVisionAdapter,
  getActiveTextAdapter,
  promoteFromJob,
  rollbackTo,
} from './promote.ts';
import { detectModelCapabilities, DEFAULT_VLM_BASE } from './model-detect.ts';
import { estimateVramMb, estimateParamBillions, defaultVlmTrainSettings } from './vram-estimate.ts';
import { runPreflight } from './preflight.ts';
import {
  PYTHON_VLM_INFER,
  venvPythonPath,
  isSafeModelId,
} from './paths.ts';
import type { VisualRecordLike } from './export-dataset.ts';
import type { TrainingModality } from './types.ts';

const HOST = '127.0.0.1';
const PORT = Number(process.env.VYTHERA_TRAIN_PORT) || 8791;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > 32 * 1024 * 1024) {
        reject(new Error('Body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res: ServerResponse, code: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

function py(): string {
  const v = venvPythonPath();
  return existsSync(v) ? v : process.platform === 'win32' ? 'python' : 'python3';
}

async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    send(res, 204, {});
    return;
  }
  const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`);
  const path = url.pathname;

  try {
    if (req.method === 'GET' && path === '/health') {
      send(res, 200, { ok: true, service: 'vythera-train' });
      return;
    }
    if (req.method === 'GET' && path === '/capability') {
      const cap = detectCapability();
      send(res, 200, {
        ...cap,
        lines: formatCapabilityLines(cap),
        defaultVlmBase: DEFAULT_VLM_BASE,
        activeText: getActiveTextAdapter(),
        activeVision: getActiveVisionAdapter(),
      });
      return;
    }
    if (req.method === 'GET' && path === '/jobs') {
      send(res, 200, { jobs: listJobs() });
      return;
    }
    if (req.method === 'GET' && path.startsWith('/jobs/')) {
      const id = path.slice('/jobs/'.length);
      const job = readJob(id);
      if (!job) {
        send(res, 404, { error: 'not found' });
        return;
      }
      send(res, 200, { job });
      return;
    }
    if (req.method === 'GET' && path === '/active') {
      send(res, 200, {
        active: getActiveAdapter('TEXT'),
        activeText: getActiveTextAdapter(),
        activeVision: getActiveVisionAdapter(),
      });
      return;
    }
    if (req.method === 'GET' && path === '/models/detect') {
      const model = url.searchParams.get('model') || DEFAULT_VLM_BASE;
      if (!isSafeModelId(model)) {
        send(res, 400, { error: 'unsafe model id' });
        return;
      }
      send(res, 200, detectModelCapabilities(model));
      return;
    }
    if (req.method === 'POST' && path === '/preflight') {
      const raw = await readBody(req);
      const body = JSON.parse(raw) as {
        datasetDir: string;
        trainableBaseModel: string;
        modality: TrainingModality;
        outputDir: string;
      };
      send(res, 200, runPreflight(body));
      return;
    }
    if (req.method === 'POST' && path === '/vram-estimate') {
      const raw = await readBody(req);
      const body = JSON.parse(raw) as { model: string; vramMb?: number; method?: 'LoRA' | 'QLoRA' };
      const cap = detectCapability({ writeManifest: false });
      const vram = body.vramMb ?? cap.gpu.vramMb ?? 8192;
      const settings = defaultVlmTrainSettings(vram);
      send(
        res,
        200,
        estimateVramMb({
          vramMb: vram,
          paramBillions: estimateParamBillions(body.model || DEFAULT_VLM_BASE),
          method: body.method ?? settings.method,
          batchSize: settings.batchSize,
          gradAccum: settings.gradAccum,
          imageSide: settings.imageSide,
          maxSeqLen: settings.maxSeqLen,
          loraRank: settings.loraRank,
          gradientCheckpointing: settings.gradientCheckpointing,
          mixedPrecision: settings.mixedPrecision,
        }),
      );
      return;
    }
    if (req.method === 'POST' && path === '/vision/infer') {
      const raw = await readBody(req);
      const body = JSON.parse(raw) as {
        baseModel?: string;
        adapterPath?: string;
        imageBase64: string;
        prompt: string;
        maxNew?: number;
      };
      if (!body.imageBase64 || !body.prompt) {
        send(res, 400, { error: 'imageBase64 and prompt required' });
        return;
      }
      const active = getActiveVisionAdapter();
      const base = body.baseModel || active?.baseModel || DEFAULT_VLM_BASE;
      const adapter = body.adapterPath || active?.path || '';
      if (!isSafeModelId(base)) {
        send(res, 400, { error: 'unsafe base model' });
        return;
      }
      if (!existsSync(PYTHON_VLM_INFER)) {
        send(res, 503, { error: 'infer_vlm.py missing' });
        return;
      }
      const args = [
        PYTHON_VLM_INFER,
        '--base',
        base,
        '--image-b64',
        body.imageBase64.replace(/^data:[^;]+;base64,/, ''),
        '--prompt',
        body.prompt,
        '--max-new',
        String(body.maxNew ?? 128),
      ];
      if (adapter) {
        args.push('--adapter', adapter);
      }
      const r = spawnSync(py(), args, {
        encoding: 'utf8',
        timeout: 180_000,
        windowsHide: true,
        shell: false,
        maxBuffer: 16 * 1024 * 1024,
      });
      const line = (r.stdout || '').trim().split('\n').pop() || '{}';
      try {
        const parsed = JSON.parse(line);
        send(res, parsed.ok ? 200 : 500, parsed);
      } catch {
        send(res, 500, { ok: false, error: (r.stderr || r.stdout || 'infer failed').slice(0, 500) });
      }
      return;
    }
    if (req.method === 'POST' && path === '/recover') {
      send(res, 200, { jobs: recoverJobs() });
      return;
    }
    if (req.method === 'POST' && path === '/jobs') {
      const raw = await readBody(req);
      const body = JSON.parse(raw) as {
        records: VisualRecordLike[];
        datasetVersion: string;
        baseModel: string;
        trainableBaseModel?: string;
        images?: Record<string, { base64: string; mimeType: string }>;
        modality?: TrainingModality;
        textOnly?: boolean;
        useMock?: boolean;
        epochs?: number;
        autoStart?: boolean;
      };
      if (!Array.isArray(body.records)) {
        send(res, 400, { error: 'records required' });
        return;
      }
      const { job, capability } = await exportAndCreateJob({
        records: body.records,
        datasetVersion: body.datasetVersion || `vdv_${Date.now()}`,
        baseModel: body.baseModel || 'local-base',
        trainableBaseModel: body.trainableBaseModel,
        images: body.images,
        modality: body.modality,
        textOnly: body.textOnly,
        useMock: body.useMock === true,
        epochs: body.epochs,
      });
      if (body.autoStart && (capability.available || body.useMock)) {
        void startJob(job.id).catch((e) => console.error(e));
      }
      send(res, 200, { job: readJob(job.id), capability });
      return;
    }
    if (req.method === 'POST' && path.startsWith('/jobs/') && path.endsWith('/start')) {
      const id = path.slice('/jobs/'.length, -'/start'.length);
      void startJob(id).catch((e) => console.error(e));
      send(res, 200, { job: readJob(id), started: true });
      return;
    }
    if (req.method === 'POST' && path.startsWith('/jobs/') && path.endsWith('/cancel')) {
      const id = path.slice('/jobs/'.length, -'/cancel'.length);
      send(res, 200, { job: cancelJob(id) });
      return;
    }
    if (req.method === 'POST' && path.startsWith('/jobs/') && path.endsWith('/evaluate')) {
      const id = path.slice('/jobs/'.length, -'/evaluate'.length);
      const result = await evaluateJob(id);
      send(res, result.ok ? 200 : 400, result);
      return;
    }
    if (req.method === 'POST' && path.startsWith('/jobs/') && path.endsWith('/promote')) {
      const id = path.slice('/jobs/'.length, -'/promote'.length);
      send(res, 200, promoteFromJob(id));
      return;
    }
    if (req.method === 'POST' && path === '/rollback') {
      const raw = await readBody(req);
      const body = JSON.parse(raw) as { to: string; modality?: TrainingModality };
      send(res, 200, rollbackTo(body.to, body.modality ?? 'TEXT'));
      return;
    }
    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 500, { error: e instanceof Error ? e.message : 'error' });
  }
}

recoverJobs();
const server = createServer((req, res) => {
  void handler(req, res);
});
server.listen(PORT, HOST, () => {
  console.log(`VYTHERA training daemon on http://${HOST}:${PORT}`);
  console.log(formatCapabilityLines(detectCapability()).join('\n'));
});
