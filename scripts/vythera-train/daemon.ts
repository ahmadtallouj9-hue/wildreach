/**
 * Localhost-only VYTHERA training + vision inference daemon.
 * Bind: loopback only — never expose remotely.
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
import {
  sanitizeCapabilityPayload,
  sanitizeUserFacingError,
} from '../../src/vythera_ai/security/VytheraPrivacySanitizer.ts';

/** Loopback only — never default to 0.0.0.0 */
const HOST = '127.0.0.1';
const PORT = Number(process.env.VYTHERA_TRAIN_PORT) || 8791;
const MAX_BODY = 32 * 1024 * 1024;

function isAllowedHostHeader(hostHeader: string | undefined): boolean {
  if (!hostHeader) return true;
  const h = hostHeader.trim().toLowerCase().split(':')[0] ?? '';
  return h === '127.0.0.1' || h === 'localhost' || h === '[::1]' || h === '::1';
}

function isLocalOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  try {
    const u = new URL(origin);
    return u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.hostname === '::1';
  } catch {
    return false;
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
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

function send(res: ServerResponse, code: number, data: unknown, origin?: string): void {
  const body = JSON.stringify(data);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (origin && isLocalOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  } else if (!origin) {
    headers['Access-Control-Allow-Origin'] = 'http://127.0.0.1:5173';
  }
  res.writeHead(code, headers);
  res.end(body);
}

function py(): string {
  const v = venvPythonPath();
  return existsSync(v) ? v : process.platform === 'win32' ? 'python' : 'python3';
}

async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const origin = req.headers.origin;

  if (!isAllowedHostHeader(req.headers.host)) {
    send(res, 403, { error: 'LOCAL SERVICE ONLY' }, origin);
    return;
  }

  if (req.method === 'OPTIONS') {
    send(res, 204, {}, origin);
    return;
  }
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  const path = url.pathname;

  try {
    if (req.method === 'GET' && path === '/health') {
      send(res, 200, { ok: true, service: 'vythera-train', bind: 'loopback' }, origin);
      return;
    }
    if (req.method === 'GET' && path === '/capability') {
      const cap = detectCapability();
      const payload = sanitizeCapabilityPayload({
        ...cap,
        lines: formatCapabilityLines(cap),
        defaultVlmBase: DEFAULT_VLM_BASE,
        activeText: getActiveTextAdapter(),
        activeVision: getActiveVisionAdapter(),
      } as Record<string, unknown>);
      send(res, 200, payload, origin);
      return;
    }
    if (req.method === 'GET' && path === '/jobs') {
      send(res, 200, { jobs: listJobs() }, origin);
      return;
    }
    if (req.method === 'GET' && path.startsWith('/jobs/')) {
      const id = path.slice('/jobs/'.length).split('/')[0]!;
      const job = readJob(id);
      if (!job) {
        send(res, 404, { error: 'not found' }, origin);
        return;
      }
      const safe = {
        ...job,
        error: job.error ? sanitizeUserFacingError(job.error) : job.error,
        datasetDir: job.datasetDir ? 'LOCAL_DATASET' : job.datasetDir,
        outputPath: job.outputPath?.split(/[/\\]/).pop() ?? job.outputPath,
        log: (job.log ?? []).map((l) => sanitizeUserFacingError(l)),
      };
      send(res, 200, { job: safe }, origin);
      return;
    }
    if (req.method === 'POST' && path === '/models/detect') {
      const raw = await readBody(req);
      const body = JSON.parse(raw) as { model: string };
      if (!isSafeModelId(body.model)) {
        send(res, 400, { error: 'unsafe model id' }, origin);
        return;
      }
      send(res, 200, detectModelCapabilities(body.model), origin);
      return;
    }
    if (req.method === 'POST' && path === '/preflight') {
      const raw = await readBody(req);
      const body = JSON.parse(raw) as {
        datasetDir: string;
        outputPath: string;
        trainableBaseModel: string;
        modality: TrainingModality;
      };
      const pre = runPreflight({
        datasetDir: body.datasetDir,
        outputPath: body.outputPath,
        trainableBaseModel: body.trainableBaseModel,
        modality: body.modality,
      });
      send(
        res,
        200,
        {
          ...pre,
          lines: pre.lines.map((l) => sanitizeUserFacingError(l)),
          blockedReason: pre.blockedReason
            ? sanitizeUserFacingError(pre.blockedReason)
            : pre.blockedReason,
        },
        origin,
      );
      return;
    }
    if (req.method === 'POST' && path === '/vram-estimate') {
      const raw = await readBody(req);
      const body = JSON.parse(raw) as { model: string; method?: 'LoRA' | 'QLoRA' };
      const paramsB = estimateParamBillions(body.model);
      const settings = defaultVlmTrainSettings();
      const est = estimateVramMb({
        paramBillions: paramsB,
        method: body.method ?? 'LoRA',
        ...settings,
      });
      send(res, 200, { ...est, lines: est.lines.map((l) => sanitizeUserFacingError(l)) }, origin);
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
        send(res, 400, { error: 'imageBase64 and prompt required' }, origin);
        return;
      }
      const active = getActiveVisionAdapter();
      const base = body.baseModel || active?.baseModel || DEFAULT_VLM_BASE;
      const adapter = body.adapterPath || active?.path || '';
      if (!isSafeModelId(base)) {
        send(res, 400, { error: 'unsafe base model' }, origin);
        return;
      }
      if (!existsSync(PYTHON_VLM_INFER)) {
        send(res, 503, { error: 'LOCAL VISION INFER UNAVAILABLE' }, origin);
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
      if (adapter) args.push('--adapter', adapter);
      const r = spawnSync(py(), args, {
        encoding: 'utf8',
        timeout: 180_000,
        windowsHide: true,
        shell: false,
        maxBuffer: 16 * 1024 * 1024,
      });
      const line = (r.stdout || '').trim().split('\n').pop() || '{}';
      try {
        const parsed = JSON.parse(line) as { ok?: boolean; error?: string; text?: string };
        if (parsed.error) parsed.error = sanitizeUserFacingError(parsed.error);
        send(res, parsed.ok ? 200 : 500, parsed, origin);
      } catch {
        send(res, 500, { ok: false, error: 'LOCAL VISION INFER FAILED' }, origin);
      }
      return;
    }
    if (req.method === 'POST' && path === '/recover') {
      send(res, 200, { jobs: recoverJobs() }, origin);
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
        send(res, 400, { error: 'records required' }, origin);
        return;
      }
      const { job, capability } = await exportAndCreateJob({
        records: body.records,
        datasetVersion: body.datasetVersion,
        baseModel: body.baseModel,
        trainableBaseModel: body.trainableBaseModel,
        images: body.images,
        modality: body.modality,
        textOnly: body.textOnly,
        useMock: body.useMock,
        epochs: body.epochs,
      });
      if (body.autoStart && job.status === 'QUEUED') {
        void startJob(job.id).catch(() => {
          /* job store records failure */
        });
      }
      send(
        res,
        200,
        {
          job: readJob(job.id),
          capability: sanitizeCapabilityPayload(capability as unknown as Record<string, unknown>),
        },
        origin,
      );
      return;
    }
    if (req.method === 'POST' && path.startsWith('/jobs/') && path.endsWith('/start')) {
      const id = path.slice('/jobs/'.length, -'/start'.length);
      void startJob(id).catch(() => {
        /* job store records failure */
      });
      send(res, 200, { job: readJob(id), started: true }, origin);
      return;
    }
    if (req.method === 'POST' && path.startsWith('/jobs/') && path.endsWith('/cancel')) {
      const id = path.slice('/jobs/'.length, -'/cancel'.length);
      send(res, 200, { job: cancelJob(id) }, origin);
      return;
    }
    if (req.method === 'POST' && path.startsWith('/jobs/') && path.endsWith('/evaluate')) {
      const id = path.slice('/jobs/'.length, -'/evaluate'.length);
      const result = await evaluateJob(id);
      send(res, result.ok ? 200 : 400, result, origin);
      return;
    }
    if (req.method === 'POST' && path.startsWith('/jobs/') && path.endsWith('/promote')) {
      const id = path.slice('/jobs/'.length, -'/promote'.length);
      send(res, 200, promoteFromJob(id), origin);
      return;
    }
    if (req.method === 'POST' && path === '/rollback') {
      const raw = await readBody(req);
      const body = JSON.parse(raw) as { to: string; modality?: TrainingModality };
      send(res, 200, rollbackTo(body.to, body.modality ?? 'TEXT'), origin);
      return;
    }
    void getActiveAdapter;
    send(res, 404, { error: 'not found' }, origin);
  } catch (e) {
    send(res, 500, { error: sanitizeUserFacingError(e) }, origin);
  }
}

recoverJobs();
const server = createServer((req, res) => {
  void handler(req, res);
});
server.listen(PORT, HOST, () => {
  console.log('VYTHERA training daemon · LOCAL SERVICE · loopback only');
  console.log(formatCapabilityLines(detectCapability()).join('\n'));
});
