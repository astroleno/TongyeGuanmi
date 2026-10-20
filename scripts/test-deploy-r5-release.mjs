import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./deploy-r5-release.mjs', import.meta.url));

// Every process is isolated from real SSH, even when testing the legacy root
// branch. The stub exits at the first invocation, before rsync or any upload.
async function invoke(basePath) {
  const fixture = await mkdtemp(path.join(tmpdir(), 'tongye-deploy-mount-test-'));
  try {
    const bin = path.join(fixture, 'bin');
    await mkdir(bin);
    const stub = path.join(bin, 'ssh');
    await writeFile(stub, '#!/bin/sh\nprintf "blocked-test-ssh\\n" >&2\nexit 79\n');
    await chmod(stub, 0o700);
    await writeFile(path.join(fixture, 'release-deploy-manifest.json'), JSON.stringify({
      schemaVersion: 1, releaseId: 'r5-mount-test',
      ...(basePath === undefined ? {} : { basePath })
    }));
    return spawnSync(process.execPath, [script, '--package', fixture], {
      encoding: 'utf8', timeout: 5000,
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
        TONGYE_SSH_TARGET: 'release-test.invalid',
        TONGYE_SSH_KEY: path.join(fixture, 'nonexistent-test-key')
      }
    });
  } finally { await rm(fixture, { recursive: true, force: true }); }
}

test('rejects a native experience package before any remote command or upload', async () => {
  const result = await invoke('/experience/');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /root-only deployer cannot publish a subpath release/);
  assert.equal(result.stdout, '');
  assert(!result.stderr.includes('blocked-test-ssh'));
});

test('fails closed on every other explicit non-root mount', async () => {
  for (const base of ['', null, '/another/', '//other.example/']) {
    const result = await invoke(base);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /root-only deployer cannot publish a subpath release/);
    assert.equal(result.stdout, '');
    assert(!result.stderr.includes('blocked-test-ssh'));
  }
});

for (const base of ['/', undefined]) {
  test(`preserves the existing root package contract (${base ?? 'legacy omitted field'})`, async () => {
    const result = await invoke(base);
    assert.equal(result.status, 1, 'the test SSH stub deliberately stops before any network operation');
    assert.match(result.stderr, /blocked-test-ssh/);
    assert(!result.stderr.includes('root-only deployer cannot publish a subpath release'));
    assert.match(result.stdout, /^\+ ssh /);
  });
}
