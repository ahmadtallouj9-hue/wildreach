/**
 * Privacy / leak-protection tests for VYTHERA AI.
 */
import {
  sanitizeForDisplay,
  sanitizeUserFacingError,
  sanitizeCapabilityPayload,
  sanitizeManifestForPersist,
  sanitizeCapabilityLines,
  classifySecretPattern,
  PRIVACY_SAFE_STATUS,
} from './VytheraPrivacySanitizer.ts';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import {
  sanitizePersistedLogLine,
  sanitizePersistedError,
} from '../../../scripts/vythera-train/sanitize-log.ts';
import {
  createDiskJob,
  appendJobLog,
  readJob,
  jobManifestPath,
} from '../../../scripts/vythera-train/jobStore.ts';

let passed = 0;
let failed = 0;

function ok(name: string, cond: boolean): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

console.log('VYTHERA privacy tests\n');

{
  const s = sanitizeForDisplay('connect 192.168.1.25 please');
  ok('private IP redacted', !s.includes('192.168') && s.includes('[REDACTED]'));
}

{
  const s = sanitizeForDisplay('daemon at 127.0.0.1:8791');
  ok('localhost redacted to LOCAL SERVICE', s.includes('LOCAL SERVICE') && !s.includes('127.0.0.1'));
}

{
  const s = sanitizeForDisplay('host 10.0.0.5:9000');
  ok('10.x redacted', !s.includes('10.0.0.5'));
}

{
  const s = sanitizeForDisplay('path C:\\Users\\Ahmad\\Documents\\secret.png');
  ok('windows user path redacted', !s.includes('Ahmad') && s.includes('[LOCAL PATH]'));
}

{
  const s = sanitizeForDisplay('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc');
  ok('bearer token redacted', !s.includes('eyJ') && s.includes('[REDACTED]'));
}

{
  const s = sanitizeForDisplay('password=hunter2');
  ok('password redacted', !s.includes('hunter2'));
}

{
  const s = sanitizeForDisplay('sk-abcdefghijklmnopqrstuvwxyz');
  ok('api key redacted', !s.includes('sk-abc'));
}

{
  const s = sanitizeUserFacingError(new Error('Failed to connect to 192.168.1.10:8791'));
  ok('safe connection error', s === 'LOCAL TRAINING SERVICE UNAVAILABLE' || !s.includes('192.168'));
}

{
  const s = sanitizeUserFacingError(new Error('EADDRINUSE'));
  ok('eaddrinuse safe', s.includes('ALREADY RUNNING'));
}

{
  const payload = sanitizeCapabilityPayload({
    python: { executable: 'C:\\Users\\Ahmad\\venv\\python.exe', version: '3.12' },
    trainer: { path: 'C:\\Users\\Ahmad\\train.py', available: true },
    lines: ['Python: OK 3.12 (C:\\Users\\Ahmad\\python.exe)'],
    reason: 'ready at 127.0.0.1:8791',
    gpuSerial: 'ABC123',
  });
  const py = payload.python as { executable?: string };
  ok('capability executable scrubbed', py.executable === 'LOCAL_VENV');
  ok('capability serial stripped', !('gpuSerial' in payload));
  ok(
    'capability lines scrubbed',
    !(payload.lines as string[]).some((l) => /Ahmad|127\.0\.0\.1/.test(l)),
  );
}

{
  const man = sanitizeManifestForPersist({
    datasetVersion: 'VYTHERA-VISION-V2',
    adapterPath: 'C:\\Users\\Ahmad\\Projects\\wildreach\\adapters\\VYTHERA-VLM-1',
    password: 'nope',
    status: 'completed',
  });
  ok('manifest adapter basename only', !String(man.adapterPath).includes('Users'));
  ok('manifest password excluded', !('password' in man));
}

{
  const lines = sanitizeCapabilityLines([
    'Python: OK 3.12 (C:\\Users\\Ahmad\\venv\\Scripts\\python.exe)',
    'Output directory       PASS  C:\\Users\\Ahmad\\out',
  ]);
  ok('capability line paths scrubbed', lines.every((l) => !/Ahmad|Users/.test(l)));
}

{
  ok('classify api key', classifySecretPattern('sk-abcdefghijklmnop') === 'API_KEY');
  ok('classify password', classifySecretPattern('password=secret') === 'PASSWORD');
  ok('safe status constants', PRIVACY_SAFE_STATUS.daemonLabel.includes('LOCAL'));
}

{
  const daemon = readFileSync(join(process.cwd(), 'scripts/vythera-train/daemon.ts'), 'utf8');
  ok('daemon binds loopback', /HOST\s*=\s*['"]127\.0\.0\.1['"]/.test(daemon));
  ok('daemon not 0.0.0.0 default', !/HOST\s*=\s*['"]0\.0\.0\.0['"]/.test(daemon));
}

{
  const store = readFileSync(join(process.cwd(), 'src/vythera_ai/vision/VytheraImageStore.ts'), 'utf8');
  ok('image strip wired', store.includes('stripImagePrivacyMetadata'));
  ok('clipboard ignores text', store.includes('Ignore text/plain') || store.includes('non-image'));
}

{
  // No telemetry in vythera_ai
  const ui = readFileSync(join(process.cwd(), 'src/vythera_ai/ui/VytheraAIStudio.ts'), 'utf8');
  ok('no sendBeacon in studio', !/sendBeacon|google-analytics|mixpanel/i.test(ui));
  ok('no raw host in header', !ui.includes('Host: 127.0.0.1:11434'));
}

{
  const s = sanitizeForDisplay('share \\\\fileserver\\share\\secret.png');
  ok('unc path redacted', !s.includes('fileserver') && s.includes('[LOCAL PATH]'));
}

{
  const line = sanitizePersistedLogLine(
    'Failed reading C:\\Users\\Ahmad\\Projects\\wildreach\\.vythera\\training\\jobs\\train_1\\job.json',
  );
  ok('persisted log no username', !line.includes('Ahmad') && !/C:\\Users/i.test(line));
  ok('persisted log uses LOCAL PATH', line.includes('[LOCAL PATH]'));
  const err = sanitizePersistedError(
    new Error('Traceback in D:\\models\\foo\\bar\\train.py line 12'),
  );
  ok('persisted error no drive path', !err.includes('D:\\models') && !err.includes('Ahmad'));
}

{
  const job = createDiskJob({
    id: `train_privacy_${Date.now()}`,
    baseModel: 'test',
    trainableBaseModel: 'test',
    datasetVersion: 'v1',
    datasetDir: 'C:\\Users\\Ahmad\\datasets\\x',
    outputPath: 'C:\\Users\\Ahmad\\out\\y',
    isMock: true,
  });
  appendJobLog(job.id, `ERROR loading C:\\Users\\Ahmad\\secret\\weights.bin`);
  const disk = readFileSync(jobManifestPath(job.id), 'utf8');
  const diskJob = JSON.parse(disk) as { log: string[]; datasetDir: string };
  ok(
    'job.json log has no user path',
    diskJob.log.every((l) => !l.includes('Ahmad')),
  );
  const re = readJob(job.id);
  ok(
    'job log scrubbed',
    !!re && re.log.every((l) => !l.includes('Ahmad') && !/C:\\Users\\Ahmad/i.test(l)),
  );
  ok('datasetDir kept for execution', !!re && re.datasetDir.includes('datasets'));
  try {
    rmSync(dirname(jobManifestPath(job.id)), { recursive: true, force: true });
  } catch {
    /* cleanup best-effort */
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
