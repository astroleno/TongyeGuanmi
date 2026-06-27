import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFileSync(path.join(rootDir, relativePath), 'utf8');

const scanRoots = [
  'src',
  'js',
  'css',
  'scripts/build-index.mjs',
  'index.html',
  'package.json'
];

const textExtensions = new Set(['.css', '.html', '.js', '.json', '.mjs']);

function walk(relativePath) {
  const absolutePath = path.join(rootDir, relativePath);
  const stat = statSync(absolutePath);
  if (stat.isFile()) {
    return textExtensions.has(path.extname(relativePath)) ? [relativePath] : [];
  }
  return readdirSync(absolutePath).flatMap((name) => walk(path.join(relativePath, name)));
}

const files = scanRoots.flatMap(walk);
const sources = files.map((file) => [file, read(file)]);

const forbiddenPatterns = [
  [/homepage-transition-dom-templates/, 'transition DOM templates must not be in the production source path'],
  [/host\.innerHTML\s*=\s*template/, 'production code must not mount visual templates through host.innerHTML'],
  [/const\s+[A-Z0-9_]+_HTML\s*=\s*`/, 'production code must not define hand-written visual HTML constants'],
  [/createMasterTransitionPlaybackController|master-transition-playback-controller/, 'production code must not import or create master playback controllers'],
  [/drawElementToTexture\(/, 'production visible path must not draw DOM/video into master textures'],
  [/data-homepage-master-track|data-homepage-master-stage|data-master-surface-layer/, 'production markup must not include master stage or surface layers'],
  [/data-master-dom-mode="master-visible"/, 'production HTML must not default to master-visible mode']
];

for (const [file, source] of sources) {
  for (const [pattern, message] of forbiddenPatterns) {
    assert.doesNotMatch(source, pattern, `${file}: ${message}`);
  }
}

for (const [file, source] of sources.filter(([file]) => file.endsWith('.css'))) {
  assert.doesNotMatch(
    source,
    /\.hero-wrap[^{]*\{[^}]*\b(?:min-height|height)\s*:\s*1px\b/s,
    `${file}: production CSS must not collapse .hero-wrap to a 1px anchor`
  );
  assert.doesNotMatch(
    source,
    /\.canvas-section[^{]*\{[^}]*\b(?:min-height|height)\s*:\s*1px\b/s,
    `${file}: production CSS must not collapse .canvas-section to a 1px anchor`
  );
}

const indexHtml = read('index.html');
const mainSource = read('js/main.js');
const observerLoaderSource = read('js/observers/homepage-master-observer-loader.js');
const packageJson = JSON.parse(read('package.json'));

assert.doesNotMatch(indexHtml, /data-master-dom-mode=/, 'index.html must not opt into a master DOM rendering mode by default');
assert.doesNotMatch(mainSource, /masterTimelineEnabled/, 'main.js must not gate the real homepage initializers behind masterTimelineEnabled');
assert.match(mainSource, /initBeliefStarField\(\{\s*root:\s*document,\s*reduceMotion\s*\}\)/, 'main.js must initialize the real Belief star field');
assert.match(mainSource, /initLayeredHero\(\{\s*root,\s*body,\s*runtime,\s*reduceMotion\s*\}\)/, 'main.js must initialize the real layered Hero when animation libraries load');
assert.match(mainSource, /initFallbackParallax\(\{\s*root,\s*reduceMotion,\s*runtime\s*\}\)/, 'main.js must keep the real Hero fallback path');
assert.match(mainSource, /initHomepageTransitionsWithObserver\(\{[\s\S]*ScrollTrigger:\s*window\.ScrollTrigger/, 'main.js must keep the real homepage transition runtime in the animated path');
assert.match(observerLoaderSource, /import\('\.\/homepage-master-observer\.js'\)/, 'observer runtime must load through dynamic import only');
assert.doesNotMatch(mainSource, /homepage-master-observer\.js/, 'main.js must not import the observer runtime directly');
assert.equal(
  packageJson.scripts['verify:homepage-main-render-path'],
  'node scripts/check-homepage-main-render-path.mjs',
  'package.json must expose verify:homepage-main-render-path'
);
assert.match(
  packageJson.scripts['verify:all'],
  /verify:homepage-main-render-path/,
  'verify:all must include the main render path guard'
);

console.log('Homepage main render path contract passed.');
