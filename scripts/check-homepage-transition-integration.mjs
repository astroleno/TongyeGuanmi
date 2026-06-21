import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFileSync(path.join(rootDir, relativePath), 'utf8');

const indexHtml = read('index.html');
const registrySource = read('js/transitions/homepage-transition-registry.js');
const runtimeSource = read('js/transitions/homepage-transition-runtime.js');

const namedModules = [
  'aod',
  'figure2',
  'pattern-bloom',
  'ttg',
  'figure3-transition',
  'ph',
  'crane'
];

function parseAttributes(tag) {
  const attrs = new Map();
  const attrPattern = /\s([A-Za-z0-9:_-]+)(?:="([^"]*)")?/g;
  for (const match of tag.matchAll(attrPattern)) {
    attrs.set(match[1], match[2] ?? '');
  }
  return attrs;
}

function assertExists(relativePath, message) {
  assert.ok(existsSync(path.join(rootDir, relativePath)), message);
}

const transitionHosts = [...indexHtml.matchAll(/<div\b[^>]*>/g)]
  .map((match) => ({ tag: match[0], attrs: parseAttributes(match[0]) }))
  .filter((node) => {
    const classes = (node.attrs.get('class') || '').split(/\s+/);
    return classes.includes('chapter-transition') || classes.includes('scene-transition');
  });

const moduleCounts = new Map();
for (const host of transitionHosts) {
  const moduleName = host.attrs.get('data-transition-module');
  if (!moduleName) continue;
  moduleCounts.set(moduleName, (moduleCounts.get(moduleName) || 0) + 1);
}

for (const moduleName of namedModules) {
  assert.equal(moduleCounts.get(moduleName), 1, `${moduleName} must appear exactly once on the homepage`);
  assert.ok(registrySource.includes(`${moduleName}`), `Registry must include ${moduleName}`);
}

const transitionById = new Map(
  transitionHosts.map((host) => [host.attrs.get('data-transition-id'), host])
);

assert.equal(
  transitionById.get('home-belief')?.attrs.get('data-transition-module'),
  'pattern-bloom',
  'home-belief must use the lotus pattern bloom transition'
);
assert.equal(
  transitionById.get('belief-method')?.attrs.get('data-transition-module'),
  'aod',
  'belief-method must keep the AOD transition into the method scene'
);
assert.equal(
  transitionById.get('services-lab')?.attrs.get('data-transition-module'),
  'soft-drilldown',
  'services-lab must stay an ordinary soft-drilldown continuity join'
);
assert.equal(
  transitionById.get('education-philosophy')?.attrs.get('data-transition-module'),
  'soft-breath',
  'education-philosophy must stay an ordinary soft-breath continuity join'
);

for (const host of transitionHosts) {
  const classes = (host.attrs.get('class') || '').split(/\s+/);
  if (!classes.includes('scene-transition')) continue;
  for (const attr of ['data-transition-id', 'data-transition-from', 'data-transition-to', 'data-transition-module']) {
    assert.ok(host.attrs.get(attr), `Internal scene transition is missing ${attr}`);
  }
}

assert.ok(
  runtimeSource.includes("'.chapter-transition[data-transition-module]'")
    && runtimeSource.includes("'.scene-transition[data-transition-module]'"),
  'Homepage runtime must scan chapter and scene transition hosts'
);
assert.ok(
  !runtimeSource.includes('createTransitionRoute'),
  'Homepage runtime must not call createTransitionRoute'
);

assertExists('js/components/ttg-transition.js', 'TTG component must exist');
assertExists('ttg-transition-route.html', 'TTG route-entry proof must exist');
assertExists('js/ttg-transition-route.js', 'TTG route-entry script must exist');

console.log('Homepage transition integration looks good.');
