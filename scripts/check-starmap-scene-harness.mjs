#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const exists = (path) => existsSync(new URL(`../${path}`, import.meta.url));

const pagePath = 'scene-harness-starmap.html';
const playerPath = 'js/scene-harness/starmap-scene-player.js';

assert.ok(exists(pagePath), 'scene-harness-starmap.html must exist');
assert.ok(exists(playerPath), 'js/scene-harness/starmap-scene-player.js must exist');

const page = read(pagePath);
const player = read(playerPath);

assert.match(page, /js\/scene-harness\/starmap-scene-player\.js/, 'harness page must load starmap scene player');
assert.match(page, /data-starmap-harness-host/, 'harness must expose standalone host');
assert.doesNotMatch(page, /js\/main\.js|SceneRuntime|homepage-runtime|ScrollTrigger|data-current-scene|location\.hash/i, 'harness must stay detached from homepage runtime');

for (const name of ['mount', 'showPoster', 'playForward', 'cancelToSource', 'reverseToPoster', 'destroy', 'getState']) {
  assert.match(player, new RegExp(`\\b${name}\\b`), `player must implement ${name}()`);
}

for (const state of ['idle', 'mounted', 'poster', 'playing-forward', 'complete', 'stable', 'destroyed']) {
  assert.match(player, new RegExp(`['"]${state}['"]`), `player must include state ${state}`);
}

assert.match(player, /initStarFieldReveal/, 'player must reuse StarFieldReveal');
assert.match(player, /STAR_MAP_SRC = 'assets\/back2\.png'/, 'player must use assets/back2.png');
assert.match(player, /renderEntrance/, 'player must implement star reveal');
assert.match(player, /renderBackground/, 'player must implement stable poster/background');
assert.match(player, /playForward\(\{ mode = 'reveal'/, 'playForward must default to reveal mode');
assert.match(player, /mode !== 'reveal'/, 'playForward must reject non-scene transition modes');
assert.match(player, /cancelToSource/, 'cancelToSource must restore source');
assert.match(player, /dispose/, 'destroy must dispose StarFieldReveal');
assert.match(player, /cancelAnimationFrame/, 'destroy/cancel must cancel RAF');
assert.match(player, /removeEventListener/, 'destroy must remove listeners');
assert.match(player, /pendingWaitCancels/, 'destroy must track pending waits');
assert.match(player, /cancelPendingWaits/, 'destroy must settle pending waits');
assert.match(player, /destroy\(\)[\s\S]*return this\.getState\(\)/, 'destroy must return getState()');

assert.doesNotMatch(player, /scrollY|pageYOffset|currentSceneId|location\.hash|history\.|lockScroll|unlockScroll|releaseScroll|SceneRuntime|homepage-runtime|ScrollTrigger|React/i, 'scene player must not touch scroll, nav, runtime, or React');
assert.doesNotMatch(player, /from ['"]\.\.\/main\.js['"]|from ['"]\.\.\/runtime\/|from ['"]\.\.\/sections\/hero|from ['"]\.\.\/.*pattern|from ['"]\.\.\/.*aod-scroll/i, 'scene player must not import production homepage/other scene wiring');
assert.doesNotMatch(player, /star-map-to-aod|createInkCurtainTransition|ink-scene-transition|data-starmap-target|data-starmap-ink|AOD_|aod_|targetCanvas|targetLayer|targetImages|inkCanvas|inkDuration/i, 'scene player must not own transition/AOD target responsibilities');
assert.doesNotMatch(page, /star-map-to-aod|Ink exit|data-starmap-target|data-starmap-ink|aod_|ink-scene-transition/i, 'harness page must remain star-map scene-only');

for (const asset of ['assets/back2.png']) {
  assert.ok(exists(asset), `${asset} must exist`);
}

console.log('starmap scene harness structure looks good.');
