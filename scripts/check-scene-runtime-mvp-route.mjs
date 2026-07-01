import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MVP_SCENE_ROUTE, MVP_SEGMENT_ROUTE } from '../js/scenes/runtime/SceneRuntime.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFileSync(path.join(rootDir, relativePath), 'utf8');

const expectedScenes = ['hero', 'pattern', 'star-map', 'aod-animation', 'method-top', 'method-bottom'];
const expectedSegments = ['hero-to-pattern', 'pattern-to-star-map', 'star-map-to-aod', 'aod-play', 'method-read'];
assert.deepEqual(MVP_SCENE_ROUTE, expectedScenes, 'PR4 MVP scene route must stop at method-bottom');
assert.deepEqual(MVP_SEGMENT_ROUTE, expectedSegments, 'PR4 MVP segment route must stop before Figure2');

const mainSource = read('js/main.js');
assert(!/^\s*import\s/m.test(mainSource), 'js/main.js must not have static imports');
assert(mainSource.includes("params.get('sceneRuntime') === '1'"), '?sceneRuntime=1 gate is missing');
assert(mainSource.includes("params.get('legacyTimeline') === '1'"), '?legacyTimeline=1 conflict check is missing');
assert(mainSource.includes('mutually exclusive'), '?sceneRuntime=1 + ?legacyTimeline=1 must fail fast');
assert(mainSource.includes("import('./scenes/runtime/SceneRuntime.js')"), 'SceneRuntime branch must import only SceneRuntime.js');
assert(mainSource.includes("import('./site/legacy-homepage.js')"), 'legacy branch must import only the legacy homepage module');
assert(!mainSource.includes('homepage-transition-runtime.js'), 'main.js must not directly import the legacy homepage transition runtime');
assert(!mainSource.includes('section-presentation-controller.js'), 'main.js must not directly import the legacy section presentation controller');

const legacySource = read('js/site/legacy-homepage.js');
assert(legacySource.includes('../transitions/homepage-transition-runtime.js'), 'legacy homepage module must keep the legacy runtime import');
assert(!legacySource.includes('SceneRuntime.js'), 'legacy homepage module must not import SceneRuntime');

const jsImportPattern = /\bimport\s*(?:[^'"]*?\s+from\s*)?['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
function normalizeImport(importUrl, sourceFile) {
  if (!importUrl.startsWith('.')) return null;
  const base = path.dirname(path.join(rootDir, sourceFile));
  const resolved = path.resolve(base, importUrl);
  const candidates = [resolved, `${resolved}.js`, `${resolved}.mjs`];
  const filePath = candidates.find((candidate) => existsSync(candidate));
  if (!filePath) return null;
  return path.relative(rootDir, filePath).replaceAll(path.sep, '/');
}

function collectGraph(entrypoint) {
  const graph = [];
  const visited = new Set();

  function visit(relativePath) {
    if (visited.has(relativePath)) return;
    visited.add(relativePath);
    graph.push(relativePath);
    const source = read(relativePath);
    for (const match of source.matchAll(jsImportPattern)) {
      const imported = normalizeImport(match[1] || match[2], relativePath);
      if (imported) visit(imported);
    }
  }

  visit(entrypoint);
  return graph;
}

const sceneRuntimeGraph = collectGraph('js/scenes/runtime/SceneRuntime.js');
[
  'js/transitions/homepage-transition-runtime.js',
  'js/transitions/homepage/section-presentation-controller.js'
].forEach((forbidden) => {
  assert(!sceneRuntimeGraph.includes(forbidden), `SceneRuntime graph must not pull ${forbidden}`);
});
assert(sceneRuntimeGraph.includes('js/scenes/runtime/scroll-intent.js'), 'SceneRuntime graph must wire ScrollIntent');
assert(sceneRuntimeGraph.includes('js/scenes/runtime/read-monitor.js'), 'SceneRuntime graph must wire ReadMonitor');
assert(sceneRuntimeGraph.includes('js/scenes/runtime/state-machine.js'), 'SceneRuntime graph must wire the state machine');
assert(sceneRuntimeGraph.includes('js/scenes/runtime/recovery.js'), 'SceneRuntime graph must wire recovery');
assert(sceneRuntimeGraph.includes('js/scenes/runtime/players/aod-player.js'), 'SceneRuntime graph must wire the AOD player');
assert(sceneRuntimeGraph.includes('js/scenes/runtime/players/ink-transition-player.js'), 'SceneRuntime graph must wire the ink transition player');

const runtimeSource = read('js/scenes/runtime/SceneRuntime.js');
assert(runtimeSource.includes("['aod-animation', 'aod-play']"), 'AOD autoplay must be armed by the second 10vh intent at aod-animation');
assert(!runtimeSource.includes('figure2-compound-to-brand'), 'PR4 runtime must not wire Figure2');
assert(!runtimeSource.includes('figure3-play'), 'PR4 runtime must not wire Figure3');
assert(!runtimeSource.includes('ttg-play'), 'PR4 runtime must not wire TTG');
assert(!runtimeSource.includes('ph-play'), 'PR4 runtime must not wire PH');
assert(!runtimeSource.includes('crane-play'), 'PR4 runtime must not wire Crane');

console.log('SceneRuntime MVP route checks passed.');
