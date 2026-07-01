import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { homepageAliases } from '../src/homepage/homepage.aliases.mjs';
import { homepageScenes } from '../src/homepage/homepage.scenes.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactPath = path.join(rootDir, 'index-scene-runtime.html');
const sceneById = new Map(homepageScenes.map((scene) => [scene.id, scene]));

function fail(message) {
  console.error(`Hash entry contract failed: ${message}`);
  process.exitCode = 1;
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getAttribute(attrs, name) {
  const match = attrs.match(new RegExp(`\\s${escapeRegExp(name)}="([^"]*)"`));
  return match?.[1] ?? null;
}

function collectSceneHosts(html) {
  const hosts = new Map();
  html.replace(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi, (tag, tagName, attrs) => {
    const sceneId = getAttribute(attrs, 'data-scene-id');
    if (sceneId) hosts.set(sceneId, { tag, tagName, attrs });
    return tag;
  });
  return hosts;
}

function hostHashes(host) {
  return [
    getAttribute(host.attrs, 'data-scene-hash'),
    getAttribute(host.attrs, 'data-scene-hash-secondary')
  ]
    .filter(Boolean)
    .flatMap((value) => value.split(',').map((hash) => hash.trim()).filter(Boolean));
}

execFileSync(process.execPath, ['scripts/build-index.mjs', '--scene-runtime'], {
  cwd: rootDir,
  stdio: 'pipe'
});

const html = await readFile(artifactPath, 'utf8');
const hosts = collectSceneHosts(html);
const requiredAliases = ['home', 'top', 'method', 'brand', 'services', 'lab', 'education', 'philosophy', 'contact'];

requiredAliases.forEach((aliasId) => {
  const alias = homepageAliases[aliasId];
  assert(alias, `${aliasId} alias is missing`);
  const scene = sceneById.get(alias.mapsToScene);
  assert(scene, `${alias.legacyHash} maps to unknown scene ${alias.mapsToScene}`);
  const host = hosts.get(alias.mapsToScene);
  assert(host, `${alias.legacyHash} maps to ${alias.mapsToScene}, but no host exists in the artifact`);
  assert(hostHashes(host).includes(alias.legacyHash), `${alias.legacyHash} is not declared on ${alias.mapsToScene}`);

  if (!['#home', '#top'].includes(alias.legacyHash)) {
    assert(scene.kind === 'reading', `${alias.legacyHash} must enter a stable reading scene, got ${scene.kind}`);
  }
});

assert(homepageAliases.philosophy.mapsToScene === 'education', '#philosophy must redirect to education');
assert(hosts.has('method-top'), '#method must have a method-top entry host');
assert(hosts.has('method-bottom'), '#method must have a method-bottom continuation host');
assert(hostHashes(hosts.get('method-bottom')).includes('#method'), 'method-bottom must remain declared as a #method continuation entry');
assert(!hosts.has('philosophy'), 'philosophy must not be a SceneRuntime scene host');
assert(!html.includes('id="philosophy"'), 'SceneRuntime artifact must not keep a philosophy DOM section');

if (!process.exitCode) {
  console.log('Hash entry contract passed.');
}
