import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const legacyArtifactPath = path.join(rootDir, 'index.html');
const sceneArtifactPath = path.join(rootDir, 'index-scene-runtime.html');
const philosophySourcePath = path.join(rootDir, 'src/sections/philosophy.html');

function fail(message) {
  console.error(`SceneRuntime artifact isolation failed: ${message}`);
  process.exitCode = 1;
}

function assert(condition, message) {
  if (!condition) fail(message);
}

await access(philosophySourcePath, constants.R_OK).catch(() => {
  fail('src/sections/philosophy.html must remain as a source file');
});

execFileSync(process.execPath, ['scripts/build-index.mjs'], {
  cwd: rootDir,
  stdio: 'pipe'
});
const legacyHtml = await readFile(legacyArtifactPath, 'utf8');
assert(legacyHtml.includes('data-transition-id="home-belief"'), 'default build must remain legacy-compatible');
assert(legacyHtml.includes('id="philosophy"'), 'default build must keep the legacy philosophy section');

execFileSync(process.execPath, ['scripts/build-index.mjs', '--scene-runtime'], {
  cwd: rootDir,
  stdio: 'pipe'
});
const sceneHtml = await readFile(sceneArtifactPath, 'utf8');

[
  [/\sdata-transition(?:-[a-z0-9-]+)?=/i, 'data-transition-*'],
  [/\sdata-handoff(?:-[a-z0-9-]+)?=/i, 'data-handoff-*'],
  [/\sdata-target-entry(?:-[a-z0-9-]+)?=/i, 'data-target-entry-*'],
  [/\sdata-scene-copy=/i, 'data-scene-copy'],
  [/\sdata-scene-target=/i, 'data-scene-target'],
  [/\bchapter-transition\b/, 'chapter-transition host'],
  [/\bscene-transition\b/, 'scene-transition host'],
  [/id="philosophy"/, 'legacy philosophy section']
].forEach(([pattern, label]) => {
  assert(!pattern.test(sceneHtml), `SceneRuntime artifact must not include ${label}`);
});

assert(sceneHtml.includes('data-scene-runtime-artifact="true"'), 'SceneRuntime artifact marker is missing');
assert(sceneHtml.includes('data-scene-owner="scene-runtime"'), 'SceneRuntime artifact must contain SceneRuntime-owned scene hosts');

if (!process.exitCode) {
  console.log('SceneRuntime artifact isolation passed.');
}
