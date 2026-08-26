/**
 * Mod hub validation / publish / install tests (local-only backend).
 */
import assert from 'node:assert/strict';
import { createModAsset } from '../modding/ModAsset.ts';
import { LOCAL_GRID_SIZE } from '../modding/constants.ts';
import {
  MOD_PACKAGE_FORMAT,
  buildPackage,
  createManifest,
  gameCompatible,
  getPublishBackendStatus,
  installPackage,
  parsePackageJson,
  publishLocal,
  sanitizeModText,
  validatePackage,
  verifyPackageIntegrity,
} from './index.ts';

function installMemoryLocalStorage(): void {
  const map = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
      setItem: (k: string, v: string) => {
        map.set(k, String(v));
      },
      removeItem: (k: string) => {
        map.delete(k);
      },
      clear: () => map.clear(),
      key: (i: number) => [...map.keys()][i] ?? null,
      get length() {
        return map.size;
      },
    },
  });
}

function emptyAsset(name: string) {
  const size = LOCAL_GRID_SIZE;
  return createModAsset(name, {
    version: 1,
    size,
    voxels: new Array(size * size * size).fill(0),
  });
}

async function main() {
  installMemoryLocalStorage();

  const backend = getPublishBackendStatus();
  assert.equal(backend.configured, false);
  assert.match(backend.message, /NOT CONFIGURED/i);

  const redacted = sanitizeModText('leak 192.168.1.10 and C:\\Users\\Ahmad\\secret');
  assert.ok(!redacted.includes('192.168'));
  assert.ok(!redacted.includes('Ahmad'));

  const manifest = createManifest({
    name: 'crystal-bridge',
    displayName: 'Crystal Bridge',
    author: 'Wanderer',
    description: 'A test bridge mod',
    version: '1.0.0',
    category: 'world',
    tags: ['bridge', 'crystal'],
  });
  assert.equal(manifest.lifecycle, 'draft');
  assert.equal(manifest.visibility, 'private');
  assert.ok(manifest.id.includes('.'));

  const pkg = await buildPackage(manifest, emptyAsset(manifest.displayName));
  assert.equal(pkg.format, MOD_PACKAGE_FORMAT);
  assert.ok(await verifyPackageIntegrity(pkg));
  assert.equal(validatePackage(pkg).ok, true);
  assert.equal(gameCompatible(pkg.manifest), 'compatible');

  const bad = structuredClone(pkg);
  bad.manifest.id = '../evil';
  assert.equal(validatePackage(bad).ok, false);

  const traversal = structuredClone(pkg);
  traversal.manifest.name = '..\\windows\\system32';
  assert.equal(validatePackage(traversal).ok, false);

  const execish = structuredClone(pkg);
  execish.manifest.displayName = 'payload.exe';
  assert.equal(validatePackage(execish).ok, false);

  const published = await publishLocal(pkg, 'public');
  assert.equal(published.ok, true);
  if (published.ok) {
    assert.equal(published.package.manifest.visibility, 'public');
    assert.equal(published.package.manifest.lifecycle, 'published');
  }

  const installed = await installPackage(pkg, 'hub');
  assert.equal(installed.ok, true);

  const roundtrip = parsePackageJson(JSON.stringify(pkg));
  assert.equal(roundtrip.manifest.id, pkg.manifest.id);
  assert.ok(await verifyPackageIntegrity(roundtrip));

  const tampered = { ...pkg, integrity: 'deadbeefdeadbeef' };
  assert.equal(await verifyPackageIntegrity(tampered), false);
  const reject = await installPackage(tampered, 'import');
  assert.equal(reject.ok, false);

  console.log('modhub.test.ts: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
