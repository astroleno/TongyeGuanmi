import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { figure2InternalSteps, homepageSceneOrder, homepageScenes } from '../src/homepage/homepage.scenes.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactPath = path.join(rootDir, 'index-scene-runtime.html');
const cssPath = path.join(rootDir, 'css/sections/homepage-snap-heights.css');
const stylesPath = path.join(rootDir, 'css/styles.css');
const sceneById = new Map(homepageScenes.map((scene) => [scene.id, scene]));

function fail(message) {
  console.error(`Scene DOM shell contract failed: ${message}`);
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

function collectTags(html, attrName) {
  const tags = [];
  html.replace(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi, (tag, tagName, attrs) => {
    const value = getAttribute(attrs, attrName);
    if (value) tags.push({ tag, tagName, attrs, value });
    return tag;
  });
  return tags;
}

execFileSync(process.execPath, ['scripts/build-index.mjs', '--scene-runtime'], {
  cwd: rootDir,
  stdio: 'pipe'
});

const [html, css, styles] = await Promise.all([
  readFile(artifactPath, 'utf8'),
  readFile(cssPath, 'utf8'),
  readFile(stylesPath, 'utf8')
]);

const sceneHosts = collectTags(html, 'data-scene-id');
const actualOrder = sceneHosts.map((host) => host.value);
assert(actualOrder.length === 16, `expected exactly 16 top-level scene hosts, found ${actualOrder.length}`);
assert(
  JSON.stringify(actualOrder) === JSON.stringify(homepageSceneOrder),
  `scene host order drifted: ${actualOrder.join(', ')}`
);

sceneHosts.forEach((host) => {
  const scene = sceneById.get(host.value);
  assert(scene, `unknown scene host ${host.value}`);
  assert(getAttribute(host.attrs, 'data-scene-owner') === 'scene-runtime', `${host.value} is not scene-runtime owned`);
  assert(getAttribute(host.attrs, 'data-scene-kind') === scene.kind, `${host.value} has wrong scene kind`);
});

['pattern', 'star-map'].forEach((sceneId) => {
  assert(actualOrder.includes(sceneId), `${sceneId} host is not statically locatable`);
});

['method-field-law', 'method-cocreation', 'method-tooling', 'method-proof', 'philosophy'].forEach((sceneId) => {
  assert(!actualOrder.includes(sceneId), `${sceneId} must not be a top-level SceneRuntime scene`);
});

['method-field-law', 'method-cocreation', 'method-tooling'].forEach((refId) => {
  assert(html.includes(`data-scene-ref-id="${refId}"`), `${refId} must remain only as a ref/anchor`);
});
assert(html.includes('data-content-ref-id="method-proof"'), 'method-proof must remain only as a content ref');

const compoundSteps = collectTags(html, 'data-compound-step-id');
const actualStepIds = compoundSteps.map((step) => step.value);
const expectedStepIds = figure2InternalSteps.map((step) => step.id);
assert(
  JSON.stringify(actualStepIds) === JSON.stringify(expectedStepIds),
  `Figure2 compound step order drifted: ${actualStepIds.join(', ')}`
);
compoundSteps.forEach((step) => {
  assert(!getAttribute(step.attrs, 'data-scene-id'), `${step.value} must not also be a top-level scene`);
});

assert(!html.includes('src/sections/philosophy.html'), 'SceneRuntime artifact must not include the philosophy source include');
assert(!html.includes('id="philosophy"'), 'SceneRuntime artifact must not include a philosophy section host');
assert(styles.includes('./sections/homepage-snap-heights.css'), 'styles.css must import the SceneRuntime height shell');
assert(
  /\[data-scene-owner="scene-runtime"\]\[data-scene-kind="animation"\][\s\S]*height:\s*100dvh/.test(css),
  'animation scenes must have 100dvh height'
);
assert(
  /\[data-scene-owner="scene-runtime"\]\[data-scene-kind="reading"\][\s\S]*min-height:\s*100dvh/.test(css),
  'reading scenes must have min-height: 100dvh'
);

if (!process.exitCode) {
  console.log('Scene DOM shell contract passed.');
}
