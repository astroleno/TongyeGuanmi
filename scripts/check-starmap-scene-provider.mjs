#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const exists = (path) => existsSync(new URL(`../${path}`, import.meta.url));

const pagePath = 'scene-provider-starmap.html';
const providerPath = 'js/scene-providers/starmap-scene-provider.js';

assert.ok(exists(pagePath), 'scene-provider-starmap.html must exist');
assert.ok(exists(providerPath), 'starmap-scene-provider.js must exist');

const page = read(pagePath);
const provider = read(providerPath);

assert.match(page, /js\/scene-providers\/starmap-scene-provider\.js/, 'harness page must load the provider module');
assert.match(page, /data-starmap-provider-host/, 'harness page must expose a standalone provider host');
assert.doesNotMatch(page, /js\/main\.js|SceneRuntime|homepage-runtime|ScrollTrigger|Presentation|data-hero|data-pattern|data-aod|scene-harness-(hero|pattern|aod)|createInk|ink-transition/i, 'harness page must stay detached from production routes and other scene providers');

assert.match(provider, /initStarFieldReveal/, 'provider must reuse StarFieldReveal');
assert.match(provider, /STAR_MAP_SRC = 'assets\/back2\.png'/, 'provider must use assets/back2.png');
assert.match(provider, /renderEntrance/, 'provider must drive star-field reveal');
assert.match(provider, /renderBackground/, 'provider must render poster/loop stable background');
assert.match(provider, /requestAnimationFrame/, 'provider must own its RAF loop');
assert.match(provider, /dispose/, 'provider destroy must dispose StarFieldReveal');
assert.match(provider, /clearCanvas/, 'provider destroy must clear canvas state');
assert.match(provider, /data-starmap-provider-copy/, 'provider must own the copy layer');

for (const name of ['mount', 'showPoster', 'playReveal', 'playLoop', 'cancelToPoster', 'reverseToPoster', 'destroy', 'getState']) {
  assert.match(provider, new RegExp(`\\b${name}\\b`), `provider must implement ${name}()`);
}

for (const status of ['idle', 'mounted', 'poster', 'revealing', 'looping', 'stable', 'destroyed']) {
  assert.match(provider, new RegExp(`['"]${status}['"]`), `provider must expose deterministic "${status}" lifecycle state`);
}

assert.doesNotMatch(provider, /scrollY|pageYOffset|currentSceneId|location\.hash|history\.|lockScroll|unlockScroll|releaseScroll|Presentation|SceneRuntime|homepage-runtime|ScrollTrigger|React|createInk|ink-transition|data-hero|data-pattern|data-aod|hero-provider|pattern-provider|aod-provider/i, 'provider must not touch scroll, nav, Presentation, other scene hosts, or transition providers');
assert.ok(exists('assets/back2.png'), 'assets/back2.png must exist');

console.log('starmap scene provider structure looks good.');
