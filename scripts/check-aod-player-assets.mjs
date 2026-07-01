import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { homepageAssets } from '../src/homepage/homepage.assets.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(rootDir, 'js/scenes/runtime/players/aod-player.js'), 'utf8');
const assetsById = new Map(homepageAssets.map((asset) => [asset.id, asset]));

function localPath(rawUrl) {
  return path.join(rootDir, rawUrl.split(/[?#]/)[0]);
}

[
  ['paper-wash', 'assets/aod-paper-bg.png'],
  ['aod-cloud', 'assets/aod_cloud-alpha.png'],
  ['aod-sun', 'assets/aod_sun-alpha.png'],
  ['aod-figure-front', 'assets/aod_figure-alpha-front-scrub.webm']
].forEach(([id, rawUrl]) => {
  const declaration = assetsById.get(id);
  assert(declaration, `${id} must be declared in homepage.assets.mjs`);
  assert.equal(declaration.rawUrl, rawUrl, `${id} rawUrl drifted`);
  assert(declaration.owners.includes('aod-animation') || id === 'paper-wash', `${id} must be owned by aod-animation`);
  assert(existsSync(localPath(declaration.rawUrl)), `${id} file is missing`);
  assert(source.includes(rawUrl), `AOD player must preserve raw asset URL ${rawUrl}`);
});

assert(!/setAttribute\(\s*['"]src['"]/.test(source), 'AOD player must not hide AOD media behind an unresolved dynamic src sink');
assert(!/\bvideo\.src\s*=/.test(source), 'AOD player must not use unresolved video.src assignment');
assert(source.includes('muted') && source.includes('playsinline') && source.includes('preload="auto"'), 'AOD media must be muted, inline, and preloaded');

console.log('AOD player asset checks passed.');
