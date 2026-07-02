#!/usr/bin/env node
/**
 * Structure and import checks for the standalone hero scene harness.
 *
 * Run: node scripts/check-hero-scene-harness.mjs
 */

import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];

async function exists(path) {
  try {
    await access(join(ROOT, path), constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function read(path) {
  return readFile(join(ROOT, path), 'utf8');
}

function assert(condition, message) {
  checks.push({ ok: Boolean(condition), message });
}

function assertIncludes(source, needle, message) {
  assert(source.includes(needle), `${message} (${needle})`);
}

function assertNotMatches(source, pattern, message) {
  assert(!pattern.test(source), `${message} (${pattern})`);
}

const requiredFiles = [
  'scene-harness-hero.html',
  'js/scene-harness/hero-scene-player.js',
  'scripts/check-hero-scene-harness.mjs',
  'assets/back1.png',
  'assets/back1_depth.png',
  'assets/middle1.png',
  'assets/middle1_depth.png',
  'assets/figure1.webm',
  'assets/figure-poster.jpg'
];

for (const file of requiredFiles) {
  assert(await exists(file), `required file exists: ${file}`);
}

const page = await read('scene-harness-hero.html');
const player = await read('js/scene-harness/hero-scene-player.js');

assertIncludes(page, 'data-hero-harness-host', 'standalone page owns an isolated harness host');
assertIncludes(page, 'css/sections/hero-stage.css', 'standalone page reuses hero-stage CSS');
assertIncludes(page, './js/scene-harness/hero-scene-player.js', 'standalone page imports the harness player');
assertIncludes(page, 'figure-alpha-clean', 'standalone page includes the figure alpha SVG filter');

for (const exportName of [
  'createHeroScenePlayer',
  'mount',
  'showPoster',
  'playForward',
  'cancelToSource',
  'reverseToPoster',
  'destroy',
  'getState'
]) {
  assertIncludes(player, `export ${exportName === 'createHeroScenePlayer' ? 'function' : 'const'} ${exportName}`, `player exports ${exportName}`);
}

assertIncludes(player, 'heroVideoSrc', 'player owns hero asset configuration');
assertIncludes(player, "'playing-forward'", 'player emits the playing-forward phase');
assertIncludes(player, "'complete'", 'player emits the complete phase');
assertIncludes(player, "'stable'", 'player emits the stable phase');
assertIncludes(player, 'assetReadyCleanup', 'player tracks cancellable asset readiness waiters');
assertIncludes(player, "figure.removeEventListener('loadedmetadata'", 'player removes video metadata listeners');
assertIncludes(player, 'assertCurrentToken(token)', 'player guards async lifecycle continuations');
assertIncludes(player, 'settleActivePlay(getState())', 'player settles active play after terminal state is applied');

assertNotMatches(player, /\bscrollY\b|\bpageYOffset\b/, 'hero-scene-player must not read scroll position');
assertNotMatches(player, /\bscrollTo\s*\(/, 'hero-scene-player must not move page scroll');
assertNotMatches(player, /\bcurrentSceneId\b/, 'hero-scene-player must not mutate scene runtime identity');
assertNotMatches(player, /\blocation\s*\.\s*hash\b|\bhashchange\b|\bwindow\s*\.\s*location\b/, 'hero-scene-player must not touch homepage hash');
assertNotMatches(player, /\bScrollTrigger\b/, 'hero-scene-player must not use ScrollTrigger');
assertNotMatches(player, /createInkSceneTransition|ink-scene-transition|heroNextSceneSrc|nextSceneSrc|back2\.png/, 'hero-scene-player must not use next-scene ink transition material');
assertNotMatches(player, /from\s+['"].*sections\/hero\.js['"]/, 'hero-scene-player must not import the scroll-driven hero module');
assertNotMatches(player, /from\s+['"].*(homepage|runtime).*['"]/, 'hero-scene-player must not import homepage runtime wiring');
assertNotMatches(player, /\breleaseRevealWithin\b|\bholdRevealWithin\b|\bsetRevealPresentedWithin\b|querySelectorAll\(['"]\.reveal/, 'hero-scene-player must not own global reveal state');
assertNotMatches(player, /index\.html|js\/main\.js/, 'hero-scene-player must not reference homepage production wiring');

const module = await import(pathToFileURL(join(ROOT, 'js/scene-harness/hero-scene-player.js')).href);
for (const name of [
  'createHeroScenePlayer',
  'mount',
  'showPoster',
  'playForward',
  'cancelToSource',
  'reverseToPoster',
  'destroy',
  'getState'
]) {
  assert(typeof module[name] === 'function', `module export is callable: ${name}`);
}

const scenePlayer = module.createHeroScenePlayer({
  requestFrame: () => 0,
  cancelFrame: () => {},
  now: () => 0
});
for (const name of ['mount', 'showPoster', 'playForward', 'cancelToSource', 'reverseToPoster', 'destroy', 'getState']) {
  assert(typeof scenePlayer[name] === 'function', `created player exposes ${name}`);
}
assert(scenePlayer.getState().phase === 'idle', 'created player starts idle');
scenePlayer.destroy();
assert(scenePlayer.getState().phase === 'destroyed', 'destroy transitions to destroyed');

const failures = checks.filter((check) => !check.ok);
if (failures.length) {
  console.error('Hero scene harness checks failed:');
  for (const failure of failures) console.error(`- ${failure.message}`);
  process.exit(1);
}

console.log(`hero-scene-harness: ${checks.length} checks passed`);
