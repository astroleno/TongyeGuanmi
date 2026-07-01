import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFileSync(path.join(rootDir, relativePath), 'utf8');

const runtimeSource = read('js/scenes/runtime/SceneRuntime.js');
const inkPlayerSource = read('js/scenes/runtime/players/ink-transition-player.js');
const aodPlayerSource = read('js/scenes/runtime/players/aod-player.js');
const shellCss = read('css/sections/homepage-snap-heights.css');
const packageJson = JSON.parse(read('package.json'));
const checklist = read('docs/scene-runtime-visual-parity-checklist.md');

assert(runtimeSource.includes("import { initFallbackParallax, initLayeredHero } from '../../sections/hero.js'"), 'SceneRuntime must drive the real layered hero visuals');
assert(runtimeSource.includes('loadHeroAnimationLibraries'), 'SceneRuntime must load local animation libraries for the real hero driver');
assert(runtimeSource.includes("html.dataset.sceneRuntimeHeroDriver = 'layered'"), 'SceneRuntime must expose layered hero driver state');
assert(runtimeSource.includes('hero-natural-scroll'), 'SceneRuntime must let hero use natural scroll before arming hero-to-pattern');
assert(runtimeSource.includes("import { createPatternBloomScene } from '../../pattern-mirror-stage.js'"), 'SceneRuntime must mount the real pattern mirror canvas');
assert(runtimeSource.includes('data-scene-runtime-pattern-canvas'), 'pattern scene must expose a SceneRuntime pattern canvas');
assert(runtimeSource.includes('this.aodPlayer?.prepare?.()'), 'SceneRuntime must prepare AOD poster visuals when aod-animation is presented');
assert(runtimeSource.includes('function presentRevealWithinScene(root)'), 'SceneRuntime early-copy must present reveal state through a scene-owned helper');
assert(runtimeSource.includes("root.matches?.('.reveal')"), 'SceneRuntime early-copy must include the target scene host when it is itself a reveal');
assert(runtimeSource.includes('const routeVisibleSceneIds = new Set(MVP_SCENE_ROUTE);'), 'SceneRuntime must gate MVP scenes to current-only visibility');
assert(runtimeSource.includes('function applyUniqueSceneVisibility'), 'SceneRuntime must centralize current-only scene visibility');
assert(runtimeSource.includes("sceneId === 'method-top' && host.dataset.sceneRuntimeEarlyCopy === 'true'"), 'method-top early-copy must be the only non-current visible exception');
assert(!runtimeSource.includes('scene-runtime-pattern-field'), 'SceneRuntime must not render placeholder pattern rings');

assert(inkPlayerSource.includes("import { mountPatternBloomTransition } from '../../../transitions/pattern-bloom-adapter.js'"), 'hero/pattern segments must reuse the legacy pattern bloom adapter');
assert(inkPlayerSource.includes("import { createInkCurtainTransition } from '../../../effects/ink-scene-transition.js'"), 'star-map-to-aod must use the real ink curtain');
assert(inkPlayerSource.includes("'hero-to-pattern'"), 'hero-to-pattern must be wired in the visual player');
assert(inkPlayerSource.includes("'pattern-to-star-map'"), 'pattern-to-star-map must be wired in the visual player');
assert(inkPlayerSource.includes("'star-map-to-aod'"), 'star-map-to-aod must be wired in the visual player');
assert(inkPlayerSource.includes("'method-bottom-to-figure2'"), 'method-bottom-to-figure2 must be wired in the visual player');
assert(inkPlayerSource.includes('progressSource: () => controlledProgress'), 'pattern bloom must be driven by SceneRuntime player progress, not scrollY');
assert(inkPlayerSource.includes('end: 0.58'), 'hero-to-pattern must stop before the legacy belief reveal range');
assert(inkPlayerSource.includes('start: 0.58'), 'pattern-to-star-map must resume at the legacy belief reveal range');
assert(inkPlayerSource.includes('center: { x: 0.50'), 'hero-to-pattern must bloom from the viewport center');
assert(inkPlayerSource.includes('onCover({ segment, progress })'), 'ink curtain transitions must expose a covered point before switching from/to scenes');
assert(!inkPlayerSource.includes('scene-runtime-ink-transition'), 'MVP ink player must not use the old flat CSS ink div');
assert(!inkPlayerSource.includes('--scene-runtime-ink-progress'), 'MVP ink player must not drive flat CSS progress');
assert(!inkPlayerSource.includes('data-ink-variant'), 'MVP ink player must not use CSS variant sinks');

assert(aodPlayerSource.includes("import { createInkCurtainTransition } from '../../../effects/ink-scene-transition.js'"), 'AOD player must render the real ink curtain');
assert(!aodPlayerSource.includes('createSceneRuntimeHandoffReceiver'), 'AOD player must not use a handoff receiver for method copy');
assert(!aodPlayerSource.includes('../../../transitions/homepage/handoff-receiver.js'), 'AOD player must not reload the legacy homepage handoff module');
assert(aodPlayerSource.includes('function prepare()'), 'AOD player must expose a poster/first-frame prepare gate');
assert(aodPlayerSource.includes('preparePromise = null;'), 'AOD prepare failure must clear the cached promise so play can retry');
assert(aodPlayerSource.includes('function presentRealTargetCopy(targetScene)'), 'AOD player must present the real target scene copy directly');
assert(aodPlayerSource.includes('window.scrollTo({ top, behavior: \'auto\' })'), 'AOD early copy must land on the real method-top DOM');
assert(aodPlayerSource.includes('durationMs = 2600'), 'AOD player must preserve the legacy 2600ms playback window');
assert(aodPlayerSource.includes('syncFigureVisibility(video, safeProgress)'), 'AOD poster gate must keep the figure video from covering the background stack at progress 0');
assert(aodPlayerSource.includes("mountedVideo.style.visibility = 'hidden'"), 'AOD teardown must hide the fixed video so it cannot cover method scenes');
assert(aodPlayerSource.includes('mountedInkTransition?.render(smoothStep(safeProgress))'), 'AOD player must render ink curtain progress during playback');
assert(aodPlayerSource.includes('progress >= (segment.earlyCopyAt ?? 0.8)'), 'AOD player must keep 80% early-copy timing');

assert(shellCss.includes('.scene-runtime-pattern-canvas'), 'SceneRuntime shell CSS must style the real pattern canvas');
assert(shellCss.includes('.scene-runtime-ink-canvas'), 'SceneRuntime shell CSS must style the real ink canvas');
assert(shellCss.includes('.scene-runtime-active .hero-wrap[data-scene-id="hero"]'), 'SceneRuntime CSS must preserve the real hero scroll range');
assert(shellCss.includes('height: 230vh'), 'SceneRuntime hero must keep the legacy scroll-driven hero height');
assert(shellCss.includes('[data-scene-id="method-top"]:not([data-scene-runtime-current]):not([data-scene-runtime-early-copy])'), 'method-top must not stay visible outside its active or early-copy window');
assert(shellCss.includes('[data-scene-id="method-bottom"]:not([data-scene-runtime-current])'), 'method-bottom must not appear before its route step');
assert(shellCss.includes('[data-scene-id="figure2-animation"]:not([data-scene-runtime-current])'), 'figure2-animation must not appear before method-bottom-to-figure2 completes');
assert(shellCss.includes('@media (max-width: 900px) and (orientation: landscape)'), 'SceneRuntime shell CSS must define mobile landscape visual mode');
assert(shellCss.includes('--scene-runtime-stage-width'), 'mobile landscape mode must define a cinematic stage width');
assert(shellCss.includes('--scene-runtime-stage-height'), 'mobile landscape mode must define a cinematic stage height');
assert(shellCss.includes('.scene-runtime-active .pattern-bloom-transition__stage'), 'mobile landscape mode must adapt pattern bloom stage layout');
assert(shellCss.includes('.scene-runtime-active .aod-transition__sticky'), 'mobile landscape mode must adapt AOD stage layout');
assert(shellCss.includes('.scene-runtime-active .method-edition-layout--after-handoff'), 'mobile landscape mode must adapt method reading layout');
assert(
  /\.scene-runtime-active \.method-edition-layout \.chapter-intro--method[\s\S]*position:\s*relative;[\s\S]*top:\s*auto;/.test(shellCss),
  'mobile landscape method-top read host must remain in normal flow so read-complete can latch'
);
assert(
  /\.scene-runtime-active \.method-flow[\s\S]*grid-column:\s*2;[\s\S]*grid-row:\s*1;/.test(shellCss),
  'mobile landscape method-bottom flow must stay in the right column instead of dropping below method-top'
);
assert(shellCss.includes('@media (max-width: 900px) and (orientation: portrait)'), 'SceneRuntime shell CSS must define mobile portrait fallback mode');
assert(shellCss.includes('横屏继续观看完整动态体验'), 'mobile portrait fallback must show a rotate prompt');
assert(!shellCss.includes('.scene-runtime-pattern-field'), 'placeholder pattern CSS must not remain');
assert(!shellCss.includes('.scene-runtime-ink-transition'), 'placeholder flat ink CSS must not remain');
assert(!shellCss.includes('--scene-runtime-ink-progress'), 'flat CSS ink progress custom property must not remain');

assert.equal(
  packageJson.scripts['verify:scene-runtime-visual-parity'],
  'node scripts/check-scene-runtime-visual-parity.mjs',
  'visual parity checker must be exposed as an npm script'
);
assert(
  packageJson.scripts['verify:scene-runtime'].includes('verify:scene-runtime-visual-parity'),
  'verify:scene-runtime must include visual parity checks'
);
assert(checklist.includes('mobile portrait fallback'), 'manual visual checklist must specify mobile portrait fallback capture');
assert(checklist.includes('mobile landscape widths'), 'manual visual checklist must specify mobile landscape capture');
assert(checklist.includes('process flow in the right column'), 'manual visual checklist must verify the mobile landscape method flow column');
assert(checklist.includes('Mobile portrait fallback: `390x844`'), 'manual visual checklist must name the mobile portrait fallback viewport');
assert(checklist.includes('Mobile landscape: `844x390`'), 'manual visual checklist must name the mobile landscape reference viewport');

[
  'initial hero',
  'after hero-to-pattern',
  'pattern steady',
  'after pattern-to-star-map',
  'star-map steady',
  'aod poster',
  'AOD 80% early-copy',
  'method-top landed',
  'method-bottom landed',
  'after method-bottom-to-figure2'
].forEach((checkpoint) => {
  assert(checklist.includes(checkpoint), `manual visual checklist missing checkpoint: ${checkpoint}`);
});

console.log('SceneRuntime MVP visual parity checks passed.');
