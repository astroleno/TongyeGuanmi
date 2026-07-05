#!/usr/bin/env node
/**
 * Executable contract checks for the homepage runtime integration layer.
 *
 * The snap FSM only knows from/to indices; the integration layer decides which
 * visual adapter drives that boundary. Reverse playback must be owned by the
 * source animation scene, not the reading scene being returned to.
 *
 * Run: node scripts/check-homepage-runtime-integration.mjs
 */

import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { selectPlaybackAdapterScene, selectTimelineJoinForPlayback } = await import(
  pathToFileURL(join(ROOT, 'js/runtime/homepage-runtime-integration.js')).href
);

let pass = 0;
let fail = 0;
const assert = (condition, message) => {
  if (condition) {
    pass++;
  } else {
    fail++;
    console.error('  ✗', message);
  }
};

const scenes = [
  { id: 'hero', kind: 'reading' },
  { id: 'pattern-bloom', kind: 'animation' },
  { id: 'belief-star', kind: 'reading' },
  { id: 'aod-animation', kind: 'animation' },
  { id: 'method-upper', kind: 'reading' }
];

const joinScenes = [
  { id: 'hero', kind: 'reading', publicSectionId: 'home' },
  { id: 'pattern-bloom', kind: 'animation' },
  { id: 'belief-star', kind: 'reading', publicSectionId: 'belief' },
  { id: 'aod-animation', kind: 'animation', copy: { targetScene: 'method-upper' } },
  { id: 'method-upper', kind: 'reading', publicSectionId: 'method' },
  { id: 'brand', kind: 'reading', publicSectionId: 'brand' },
  { id: 'figure3-animation', kind: 'animation', copy: { targetScene: 'services' } },
  { id: 'services', kind: 'reading', publicSectionId: 'services' }
];
const joins = [
  { id: 'home-belief', fromScene: 'home', toScene: 'belief' },
  { id: 'belief-method', fromScene: 'belief', toScene: 'method' },
  { id: 'brand-services', fromScene: 'brand', toScene: 'services' }
];

assert(
  selectPlaybackAdapterScene({ scenes, fromIndex: 0, toIndex: 1, direction: 1 })?.id === 'pattern-bloom',
  'forward hero -> pattern-bloom uses target animation adapter'
);

assert(
  selectPlaybackAdapterScene({ scenes, fromIndex: 1, toIndex: 0, direction: -1 })?.id === 'pattern-bloom',
  'reverse pattern-bloom -> hero uses source animation adapter'
);

assert(
  selectPlaybackAdapterScene({ scenes, fromIndex: 2, toIndex: 3, direction: 1 })?.id === 'aod-animation',
  'forward belief-star -> aod-animation uses target media adapter'
);

assert(
  selectPlaybackAdapterScene({ scenes, fromIndex: 3, toIndex: 2, direction: -1 })?.id === 'aod-animation',
  'reverse aod-animation -> belief-star uses source media adapter'
);

assert(
  selectPlaybackAdapterScene({ scenes: null, fromIndex: 1, toIndex: 0, direction: -1 }) === null,
  'missing scene list returns null'
);

assert(
  selectTimelineJoinForPlayback({
    scenes: joinScenes,
    fromIndex: 2,
    toIndex: 3,
    direction: 1,
    adapterScene: joinScenes[3],
    joins
  })?.id === 'belief-method',
  'aod-animation maps to SceneTimeline join belief-method'
);

assert(
  selectTimelineJoinForPlayback({
    scenes: joinScenes,
    fromIndex: 5,
    toIndex: 6,
    direction: 1,
    adapterScene: joinScenes[6],
    joins
  })?.id === 'brand-services',
  'figure3-animation maps to SceneTimeline join brand-services'
);

console.log(`homepage-runtime-integration: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
