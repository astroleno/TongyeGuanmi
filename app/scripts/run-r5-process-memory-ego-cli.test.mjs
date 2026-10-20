import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, mkdir, rm, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';

const scripts = path.dirname(fileURLToPath(import.meta.url));
async function invoke(changes) {
  const temporary = await mkdtemp(path.join(tmpdir(), 'ego-memory-cli-test-'));
  try {
    const directory = path.join(temporary, 'app/scripts'), bin = path.join(temporary, 'bin');
    await mkdir(directory, { recursive: true }); await mkdir(bin);
    for (const filename of ['run-r5-process-memory.mjs', 'run-r5-process-memory-ego.mjs', 'run-r5-process-memory-ego-cli.mjs',
      'r5-process-memory-contract.mjs', 'r5-scroll-memory.mjs', 'release-paths.mjs', 'scroll-browser-events.mjs']) {
      await cp(path.join(scripts, filename), path.join(directory, filename));
    }
    for (const command of ['ego-browser', 'pnpm']) {
      const filename = path.join(bin, command);
      await writeFile(filename, '#!/bin/sh\necho forbidden-test-launch >&2\nexit 79\n'); await chmod(filename, 0o700);
    }
    return spawnSync(process.execPath, [path.join(directory, 'run-r5-process-memory.mjs')], {
      encoding: 'utf8', timeout: 5000, env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH,
        R5_MEMORY_BROWSER_CHANNEL: 'ego-lite', R5_EGO_TASK_SPACE_ID: '', R5_EGO_PAGE_LABEL: '',
        R5_PREVIEW_HOST: '127.0.0.1', R5_PREVIEW_PORT: '4173', ...changes }
    });
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

for (const [name, env, reason] of [
  ['missing owned task/page', {}, /authorized TaskSpace/],
  ['non-loopback preview', { R5_PREVIEW_HOST: '0.0.0.0' }, /loopback/],
  ['unknown browser', { R5_MEMORY_BROWSER_CHANNEL: 'other-browser' }, /unsupported R5_MEMORY_BROWSER_CHANNEL/],
  ['missing frozen build', { R5_EGO_TASK_SPACE_ID: '7', R5_EGO_PAGE_LABEL: 'p1' }, /ENOENT/]
]) test(`formal Ego CLI rejects ${name} before launching any process`, async () => {
  const result = await invoke(env);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, reason);
  assert(!`${result.stdout}${result.stderr}`.includes('forbidden-test-launch'));
});
