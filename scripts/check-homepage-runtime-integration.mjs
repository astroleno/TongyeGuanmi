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
import { readFileSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const integrationSource = readFileSync(join(ROOT, 'js/runtime/homepage-runtime-integration.js'), 'utf8');
const indexHtml = readFileSync(join(ROOT, 'index.html'), 'utf8');
const { homepageTimeline: builtHomepageTimeline } = await import(
  pathToFileURL(join(ROOT, 'js/transitions/homepage/scene-timeline-manifest.js')).href
);
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
  { id: 'services', kind: 'reading', publicSectionId: 'services' },
  { id: 'ttg-animation', kind: 'animation' },
  { id: 'lab', kind: 'reading', publicSectionId: 'lab' },
  { id: 'ph-animation', kind: 'animation' },
  { id: 'education', kind: 'reading', publicSectionId: 'education' },
  { id: 'philosophy', kind: 'reading', publicSectionId: 'philosophy' },
  { id: 'crane-animation', kind: 'animation', copy: { targetScene: 'contact' } },
  { id: 'contact', kind: 'reading', publicSectionId: 'contact' }
];
const joins = [
  { id: 'home-belief', fromScene: 'home', toScene: 'belief' },
  { id: 'belief-method', fromScene: 'belief', toScene: 'method' },
  { id: 'brand-services', fromScene: 'brand', toScene: 'services' },
  { id: 'services-lab', fromScene: 'services', toScene: 'lab' },
  { id: 'lab-education', fromScene: 'lab', toScene: 'education' },
  { id: 'philosophy-contact', fromScene: 'philosophy', toScene: 'contact' }
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
    fromIndex: 3,
    toIndex: 2,
    direction: -1,
    adapterScene: joinScenes[3],
    joins
  }) === null,
  'reverse aod-animation -> belief-star does not reuse forward belief-method join'
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

assert(
  selectTimelineJoinForPlayback({
    scenes: joinScenes,
    fromIndex: 6,
    toIndex: 5,
    direction: -1,
    adapterScene: joinScenes[6],
    joins
  }) === null,
  'reverse figure3-animation -> brand does not present services through brand-services'
);

assert(
  selectTimelineJoinForPlayback({
    scenes: joinScenes,
    fromIndex: 7,
    toIndex: 8,
    direction: 1,
    adapterScene: joinScenes[8],
    joins
  })?.id === 'services-lab',
  'ttg-animation maps to SceneTimeline join services-lab'
);

assert(
  selectTimelineJoinForPlayback({
    scenes: joinScenes,
    fromIndex: 9,
    toIndex: 10,
    direction: 1,
    adapterScene: joinScenes[10],
    joins
  })?.id === 'lab-education',
  'ph-animation maps to SceneTimeline join lab-education'
);

assert(
  selectTimelineJoinForPlayback({
    scenes: joinScenes,
    fromIndex: 12,
    toIndex: 13,
    direction: 1,
    adapterScene: joinScenes[13],
    joins
  })?.id === 'philosophy-contact',
  'crane-animation maps to SceneTimeline join philosophy-contact'
);

assert(
  integrationSource.includes('function primeSceneAdapter')
    && integrationSource.includes('adapter.showFirstFrame')
    && integrationSource.includes("primeSceneAdapter('aod-animation', adapter)")
    && integrationSource.includes("primeSceneAdapter('figure2-animation', adapter)")
    && integrationSource.includes("primeSceneAdapter('figure3-animation', adapter)")
    && integrationSource.includes("primeSceneAdapter(sceneId, adapter)"),
  'registered media scene adapters prime their first frame so default snap path never exposes empty transition hosts'
);

assert(
  integrationSource.includes('function createTransitionModuleSceneAdapter')
    && integrationSource.includes('TRANSITION_MODULE_SCENE_ADAPTERS')
    && integrationSource.includes("'ttg-animation': { moduleName: 'ttg'")
    && integrationSource.includes("'ph-animation': { moduleName: 'ph'")
    && integrationSource.includes("'crane-animation': { moduleName: 'crane'")
    && integrationSource.includes('homepageTransitionRegistry')
    && integrationSource.includes('createTimedProgressDriver')
    && !integrationSource.includes('VISUAL_ONLY_TRANSITION_MODULES')
    && !integrationSource.includes('mountVisualOnlyTransitionHosts'),
  'TTG/PH/Crane mount as Director-owned scene adapters, not legacy visual-only hosts'
);

assert(
  integrationSource.includes('Homepage snap runtime requires every scene to have a DOM host')
    && integrationSource.includes('const scenes = homepageTimeline.scenes;'),
  'default snap runtime fails fast instead of silently shrinking the scene graph'
);

assert(
  integrationSource.includes('autoPresent: false')
    && integrationSource.includes("completeTimelinePlayback('director-completing')"),
  'Director frame updates do not auto-present before the Completing hook'
);

assert(
  integrationSource.includes('if (direction === -1) return null;')
    && integrationSource.includes('playback.direction === -1')
    && integrationSource.includes('sceneTimeline.cleanupJoin(playback.join.id, reason)')
    && integrationSource.includes("recoverToTerminalState('director-error-recovery')"),
  'reverse playback and error recovery cannot commit/present the forward target copy'
);

assert(
  integrationSource.includes('function recoverToTerminalState')
    && integrationSource.includes('adapter.render(terminalProgress)')
    && integrationSource.includes("adapterTerminalState = direction === -1 ? 'reversed' : 'presented'")
    && integrationSource.includes('adapterEl && adapterEl !== targetEl')
    && integrationSource.includes("targetEl.setAttribute('data-scene-state', 'presented')")
    && integrationSource.includes("data-runtime-recovery', 'terminal'")
    && integrationSource.includes('alignDocumentToScene(targetScene)')
    && integrationSource.includes("recoverToTerminalState('director-recovery')"),
  'recovery terminalizes adapter/target hosts and aligns the document through the integration layer'
);

assert(
  integrationSource.includes('typeof adapter.render === \'function\'')
    && integrationSource.includes('adapter.render(nextFrame)')
    && integrationSource.includes('reportFrame: renderAdapterFrame'),
  'Director converts adapter progress reports into SceneTimelineFrame and calls adapter.render(frame)'
);

assert(
  integrationSource.includes('function findSceneByHashId')
    && integrationSource.includes('scene.publicSectionId === id')
    && integrationSource.includes('onHashChange();')
    && integrationSource.includes("window.addEventListener('site:loader-hidden', alignInitialHash, { once: true })")
    && integrationSource.includes('window.setTimeout(onHashChange, 650)')
    && integrationSource.includes('window.setTimeout(onHashChange, 3000)')
    && integrationSource.includes('scrollController.scrollTo(targetY')
    && integrationSource.includes('runtime.handleScroll();'),
  'direct hash maps public section ids to Director scene ids and immediately aligns the real scene host'
);

const missingBuiltSceneHosts = builtHomepageTimeline.scenes
  .filter((scene) => !indexHtml.includes(`data-scene-id="${scene.id}"`))
  .map((scene) => scene.id);
assert(
  missingBuiltSceneHosts.length === 0,
  `built index.html has a data-scene-id host for every homepageTimeline scene (missing: ${missingBuiltSceneHosts.join(', ') || 'none'})`
);

console.log(`homepage-runtime-integration: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
