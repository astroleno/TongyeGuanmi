import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { SCROLL_MEMORY_BUDGETS } from '../app/scripts/r5-scroll-memory.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const script = path.join(repo, 'scripts/deploy-experience-release.mjs');
// This test process cannot reach real transport, even if a preflight regresses.
async function fixture(mode) {
  const root = await mkdtemp(path.join(tmpdir(), 'tongye-native-deploy-test-'));
  const bin = path.join(root, 'bin');
  await mkdir(bin);
  for (const tool of ['ssh', 'scp', 'rsync']) {
    const file = path.join(bin, tool);
    await writeFile(file, '#!/bin/sh\nprintf "blocked-test-transport\\n" >&2\nexit 79\n');
    await chmod(file, 0o700);
  }
  const python = `
import importlib.util, pathlib, shutil, sys
spec=importlib.util.spec_from_file_location('fixture',sys.argv[1])
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
fixture=module.NativePublicationTests();fixture.setUp()
try:
    if sys.argv[3]=='pending':
        fixture.manifest['qualification']['status']='pending-memory';fixture.save_manifest()
    elif sys.argv[3]=='root':
        fixture.deploy['basePath']='/';fixture.save_deploy()
    elif sys.argv[3]=='corrupt':
        (fixture.package/'site/assets/new.js').write_bytes(b'corrupt')
    elif sys.argv[3]=='incomplete-memory':
        fixture.memory['runs']=[];fixture.save()
    elif sys.argv[3]=='complete-ego':
        fixture.ego_memory()
    shutil.copytree(fixture.package, pathlib.Path(sys.argv[2])/'package')
finally: fixture.doCleanups()
`;
  const created = spawnSync('python3', ['-c', python, path.join(repo, 'scripts/test-publish-experience-release.py'), root, mode], { encoding: 'utf8', timeout: 5000 });
  assert.equal(created.status, 0, created.stderr);
  return { root, bin };
}

for (const mode of ['pending', 'root', 'corrupt', 'incomplete-memory']) {
  test(`refuses ${mode} before any transport or upload`, async () => {
    const { root, bin } = await fixture(mode);
    try {
      const result = spawnSync(process.execPath, [script, '--package', path.join(root, 'package'),
        '--expected-vhost-sha', 'a'.repeat(64), '--expected-include-sha', 'b'.repeat(64)], {
        encoding: 'utf8', timeout: 5000,
        env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, TONGYE_SSH_TARGET: 'test.invalid' }
      });
      assert.equal(result.status, 1, result.stderr);
      assert(!`${result.stdout}${result.stderr}`.includes('blocked-test-transport'));
      if (mode === 'incomplete-memory') assert.match(result.stderr, /memory qualification requires two distinct runs/);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}

for (const mode of ['complete', 'complete-ego']) test(`a ${mode} synthetic qualification supports local --check without network`, async () => {
  const { root, bin } = await fixture(mode);
  try {
    const result = spawnSync(process.execPath, [script, '--package', path.join(root, 'package'),
      '--expected-vhost-sha', 'a'.repeat(64), '--expected-include-sha', 'b'.repeat(64), '--check'], {
      encoding: 'utf8', timeout: 5000,
      env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` }
    });
    assert.equal(result.status, 0, result.stderr);
    assert(!`${result.stdout}${result.stderr}`.includes('blocked-test-transport'));
    assert.match(result.stdout, /"published":false/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('server-side Ego budget values match the unchanged application contract', () => {
  const python = `import importlib.util,json,sys; s=importlib.util.spec_from_file_location('native',sys.argv[1]); m=importlib.util.module_from_spec(s);s.loader.exec_module(m);print(json.dumps(m.SCROLL_BUDGETS))`;
  const result = spawnSync('python3', ['-c', python, path.join(repo, 'scripts/publish-experience-release.py')], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), SCROLL_MEMORY_BUDGETS);
});

test('requires both inspected configuration identities before reading a package', () => {
  const result = spawnSync(process.execPath, [script, '--package', '/not-a-real-package'], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /usage:/);
});

test('an arbitrary direct-publication SHA cannot bypass preflight or reach transport', async () => {
  const { root, bin } = await fixture('pending');
  try {
    const result = spawnSync(process.execPath, [script, '--package', path.join(root, 'package'),
      '--expected-vhost-sha', 'a'.repeat(64), '--expected-include-sha', 'b'.repeat(64),
      '--user-directed-authorization-sha', 'c'.repeat(64)], {
      encoding: 'utf8', timeout: 5000, env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` }
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /exact user-directed v59 receipt/);
    assert(!`${result.stdout}${result.stderr}`.includes('blocked-test-transport'));
  } finally { await rm(root, { recursive: true, force: true }); }
});
