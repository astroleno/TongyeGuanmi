import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const exists = (path) => existsSync(new URL(`../${path}`, import.meta.url));
const lineCount = (text) => text.split('\n').length;

const indexHtml = read('index.html');
assert.match(
  indexHtml,
  /<script\s+type="module"\s+src="js\/main\.js"><\/script>/,
  'index.html must load js/main.js as an ES module'
);

const mainJs = read('js/main.js');
const usesLegacyBridge = mainJs.includes("import './legacy-main.js';");
const usesFinalBoot = [
  "from './site/runtime.js'",
  "from './effects/ink-text-reveal.js'",
  "from './components/ink-keyword.js'",
  "from './sections/hero.js'"
].every((needle) => mainJs.includes(needle));

assert.ok(
  usesLegacyBridge || usesFinalBoot,
  'js/main.js must be either the temporary legacy bridge or the final module bootstrap'
);

if (!usesLegacyBridge) {
  assert.ok(lineCount(mainJs) <= 120, 'final js/main.js should stay under 120 lines');
  assert.ok(!exists('js/legacy-main.js'), 'js/legacy-main.js should be removed after final extraction');
}

if (exists('js/effects/ink-text-reveal.js')) {
  const inkText = read('js/effects/ink-text-reveal.js');
  assert.match(inkText, /export function createInkTextReveal/, 'ink text module must export createInkTextReveal');
  assert.match(inkText, /export function initLoaderInkReveal/, 'ink text module must export initLoaderInkReveal');
}

if (exists('js/effects/ink-scene-transition.js')) {
  const sceneInk = read('js/effects/ink-scene-transition.js');
  assert.match(sceneInk, /export function createInkSceneTransition/, 'scene ink module must export createInkSceneTransition');
  assert.match(sceneInk, /export function createInkCurtainTransition/, 'scene ink module must export createInkCurtainTransition');
}

if (exists('js/components/ink-keyword.js')) {
  const keyword = read('js/components/ink-keyword.js');
  assert.match(keyword, /export function initInkKeywords/, 'keyword module must export initInkKeywords');
  assert.match(keyword, /\[data-ink-reveal\]/, 'keyword module must scan data-ink-reveal markers');
}

if (exists('css/components/ink-keyword.css')) {
  const css = read('css/components/ink-keyword.css');
  assert.match(css, /\.ink-keyword/, 'keyword CSS must define .ink-keyword');
  assert.match(css, /prefers-reduced-motion/, 'keyword CSS must handle reduced motion');
}

if (exists('index.html')) {
  const webglKeywordMatches = indexHtml.match(/data-ink-reveal="webgl"/g) || [];
  assert.ok(webglKeywordMatches.length <= 2, 'index.html should not declare more than two WebGL ink keywords');
  const patternBloomAdapter = exists('js/transitions/pattern-bloom-adapter.js')
    ? read('js/transitions/pattern-bloom-adapter.js')
    : '';
  assert.ok(
    /data-hero-exit-ink-canvas/.test(indexHtml) || /pattern-bloom-transition__exit-ink/.test(patternBloomAdapter),
    'homepage must include a bottom-up exit ink canvas'
  );
}

if (exists('docs/ink-effects-usage.md')) {
  const usage = read('docs/ink-effects-usage.md');
  assert.match(usage, /data-ink-reveal/, 'ink effects usage doc must show the keyword marker');
  assert.match(usage, /maxWebglKeywords/, 'ink effects usage doc must explain the WebGL keyword budget');
}

console.log('Ink module structure looks good.');
