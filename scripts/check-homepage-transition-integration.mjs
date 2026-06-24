import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFileSync(path.join(rootDir, relativePath), 'utf8');

const indexHtml = read('index.html');
const registrySource = read('js/transitions/homepage-transition-registry.js');
const runtimeSource = read('js/transitions/homepage-transition-runtime.js');
const revealSource = read('js/ui/reveal.js');
const presentationControllerSource = read('js/transitions/homepage/section-presentation-controller.js');
const handoffPreviewSource = read('js/transitions/homepage/handoff-preview.js');
const handoffReceiverSource = read('js/transitions/homepage/handoff-receiver.js');
const patternBloomAdapterSource = read('js/transitions/pattern-bloom-adapter.js');
const aodHomepageAdapterSource = read('js/transitions/homepage/aod-homepage-adapter.js');
const figure2HomepageAdapterSource = read('js/transitions/homepage/figure2-homepage-adapter.js');
const figure3HomepageAdapterSource = read('js/transitions/homepage/figure3-homepage-adapter.js');
const craneHomepageAdapterSource = read('js/transitions/homepage/crane-homepage-adapter.js');
const phHomepageAdapterSource = read('js/transitions/homepage/ph-homepage-adapter.js');
const ttgHomepageAdapterSource = read('js/transitions/homepage/ttg-homepage-adapter.js');
const ttgComponentSource = read('js/components/ttg-transition.js');
const figure2ComponentSource = read('js/components/figure2-transition.js');
const figure3ComponentSource = read('js/components/figure3-transition.js');
const stylesSource = read('css/styles.css');
const homepageTransitionCss = read('css/components/homepage-transitions.css');
const homepageContinuityCss = read('css/components/homepage-continuity.css');
const canvasStageCss = read('css/sections/canvas-stage.css');
const figure3Css = read('css/components/figure3-transition.css');
const figure2Css = read('css/figure2.css');

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
  'ttg',
  'services-lab must use the TTG transition before the scenario scene'
);
assert.doesNotMatch(
  `${figure3HomepageAdapterSource}\n${figure3ComponentSource}\n${figure3Css}`,
  /SERVICE_TITLE|figure3-transition__service-copy|figure3-transition__service-|figure3-transition--service-visible|真正的 AI 转型/,
  'Figure3 transition code and CSS must stay visual-only instead of keeping deprecated Services presentation copy surfaces'
);
assert.ok(
  figure3HomepageAdapterSource.includes('timeline?.update(progress')
    && figure3HomepageAdapterSource.includes('playbackComplete'),
  'Figure3 visual bridge must present Services through the homepage timeline'
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

const figure2SceneTransition = transitionById.get('method-tooling__method-proof');
const aodHandoffTransition = transitionById.get('belief-method');
const craneHandoffTransition = transitionById.get('philosophy-contact');
assert.equal(
  transitionById.get('home-belief')?.attrs.get('data-transition-drive'),
  'scroll',
  'home-belief must be scroll-driven so it cannot expose an empty snap host'
);
assert.doesNotMatch(
  `${patternBloomAdapterSource}\n${canvasStageCss}`,
  /pattern-bloom-transition__copy|一句话讲清我们干什么|让 AI 从一场培训/,
  'Pattern Bloom code and CSS must not keep deprecated Belief presentation copy surfaces'
);
assert.ok(
  patternBloomAdapterSource.includes('textProgress: beliefCopyProgress')
    && patternBloomAdapterSource.includes('presentationTarget: beliefSection')
    && patternBloomAdapterSource.includes('const SECOND_REVEAL_START = 0.58')
    && patternBloomAdapterSource.includes('timeline?.update(progress')
    && patternBloomAdapterSource.includes('lotusContracted')
    && patternBloomAdapterSource.includes('targetReady')
    && patternBloomAdapterSource.includes('beliefCopyComplete')
    && !patternBloomAdapterSource.includes('beliefPinned ? 0.18 : 1'),
  'Pattern Bloom must hand off through homepage timeline milestones instead of the old local opacity clamp'
);
assert.ok(
  patternBloomAdapterSource.includes('isDirectVisitToBelief')
    && patternBloomAdapterSource.includes('delete host.dataset.patternBloomMounted'),
  'Pattern Bloom must not pin Belief copy on direct target hash visits'
);
assert.equal(
  aodHandoffTransition?.attrs.get('data-transition-stage-stops'),
  undefined,
  'AOD handoff must play normally instead of stopping mid-transition'
);
assert.equal(
  aodHandoffTransition?.attrs.get('data-transition-play-ms'),
  '2600',
  'AOD handoff must use one continuous playback duration'
);
assert.equal(
  aodHandoffTransition?.attrs.get('data-transition-post-scroll-vh'),
  undefined,
  'AOD handoff must not add a detached paper-only hold after normal playback'
);
assert.equal(
  aodHandoffTransition?.attrs.get('data-transition-handoff-target'),
  '#method',
  'AOD handoff must declare the native Method section as its release target'
);
assert.equal(
  aodHandoffTransition?.attrs.get('data-transition-handoff-phase'),
  'after-playback',
  'AOD handoff must release immediately after playback'
);
assert.ok(
  !aodHomepageAdapterSource.includes('aod-transition__method-copy')
    && !aodHomepageAdapterSource.includes('先看懂，')
    && !aodHomepageAdapterSource.includes('<strong>识场</strong>')
    && !aodHomepageAdapterSource.includes('AI 落地前两步'),
  'AOD handoff must not render a duplicate Method block inside the transition'
);
assert.ok(
  !aodHomepageAdapterSource.includes('createHandoffReceiver')
    && aodHomepageAdapterSource.includes('timeline?.update')
    && aodHomepageAdapterSource.includes('playbackComplete')
    && aodHomepageAdapterSource.includes('handoffProgressSource'),
  'AOD handoff must report timeline progress without adopting the native Method DOM'
);
assert.ok(
  indexHtml.includes('method-handoff-anchor')
    && indexHtml.includes('method-scene-anchor')
    && indexHtml.includes('method-edition-layout')
    && indexHtml.includes('process-list--method')
    && indexHtml.includes('先看懂，')
    && indexHtml.includes('<strong>识场</strong>')
    && indexHtml.includes('<strong>立法</strong>')
    && indexHtml.includes('<span>03</span><strong>共创</strong>')
    && indexHtml.includes('<span>04</span><strong>成器</strong>')
    && indexHtml.includes('<span>05</span><strong>陪跑</strong>')
    && !indexHtml.includes('AI 落地前两步')
    && !indexHtml.includes('process-list--cocreation')
    && !indexHtml.includes('process-list--tooling')
    && !indexHtml.includes('start="3"')
    && !indexHtml.includes('start="4"')
    && !indexHtml.includes('共创之后')
    && !indexHtml.includes('一起做，'),
  'Method section must render the only visible 01-05 block as native content'
);
assert.equal(
  figure2SceneTransition?.attrs.get('data-transition-stage-stops'),
  '0.72',
  'Figure2 method proof transition must stop after the intro stage'
);
assert.equal(
  figure2SceneTransition?.attrs.get('data-transition-stage-play-ms'),
  '2600,1500',
  'Figure2 method proof transition must use separate autoplay durations for both stages'
);
assert.equal(
  figure2SceneTransition?.attrs.get('data-transition-stage-hold-vh'),
  '30',
  'Figure2 method proof transition must hold the snapped first-stage scene for 30vh before the second stage'
);
assert.equal(
  figure2SceneTransition?.attrs.get('data-transition-post-scroll-vh'),
  '56',
  'Figure2 method proof transition must keep the snapped Figure2 stage for a single proof-copy scene'
);
assert.equal(
  figure2SceneTransition?.attrs.get('data-transition-handoff-target'),
  '#brand',
  'Figure2 proof transition must declare the native Brand section as its release target'
);
assert.equal(
  figure2SceneTransition?.attrs.get('data-transition-handoff-phase'),
  'post-scroll',
  'Figure2 proof transition must release only after its proof-copy post-scroll'
);
assert.equal(
  craneHandoffTransition?.attrs.get('data-transition-handoff-target'),
  '#contact',
  'Crane transition must declare the native Contact section as its release target'
);
assert.equal(
  craneHandoffTransition?.attrs.get('data-transition-handoff-phase'),
  'after-playback',
  'Crane transition must release immediately after playback'
);
assert.ok(
  runtimeSource.includes('transitionStageStops')
    && runtimeSource.includes('transitionStagePlayMs')
    && runtimeSource.includes('transitionStageHoldVh')
    && runtimeSource.includes('transitionPostScrollVh')
    && runtimeSource.includes('transitionDrive')
    && runtimeSource.includes('transitionHandoffTarget')
    && runtimeSource.includes('transitionHandoffPhase')
    && runtimeSource.includes('HANDOFF_POST_SCROLL')
    && runtimeSource.includes('REDUCED_MOTION_CLASS')
    && runtimeSource.includes('handoffProgressSource')
    && runtimeSource.includes('postProgressSource')
    && runtimeSource.includes('FIXED_STAGE_CLASS')
    && runtimeSource.includes('SNAP_EXTRA_HEIGHT_VAR'),
  'Homepage runtime must support staged transition autoplay and snapped hold height'
);
assert.ok(
  revealSource.includes('export function setRevealPresentedWithin')
    && revealSource.includes('export function suppressRevealOnceWithin')
    && revealSource.includes('export function holdRevealWithin')
    && revealSource.includes('export function releaseRevealWithin')
    && revealSource.includes('wasPresented')
    && revealSource.includes('revealControls.delete')
    && revealSource.includes('data-entry-state')
    && revealSource.includes('data-entry-count'),
  'Reveal runtime must expose target presentation controls and entry counters'
);
assert.ok(
  presentationControllerSource.includes('createSectionPresentationController')
    && presentationControllerSource.includes('markPresented')
    && presentationControllerSource.includes('suppressEntryOnce')
    && presentationControllerSource.includes('completeHandoff'),
  'Homepage must have a section presentation controller'
);
assert.ok(
  runtimeSource.includes("from './homepage/section-presentation-controller.js'")
    && runtimeSource.includes('presentationController.completeHandoff')
    && runtimeSource.includes('presentationController.beginHandoff'),
  'Homepage runtime must notify the presentation controller during handoff lifecycle'
);
assert.ok(
  runtimeSource.includes('beginTargetRevealGate')
    && runtimeSource.includes('releaseTargetRevealGate')
    && runtimeSource.includes('targetRevealHeld')
    && runtimeSource.includes('DEFAULT_TARGET_GATE_RELEASE_PROGRESS')
    && runtimeSource.includes('transitionTargetReleaseProgress')
    && runtimeSource.includes('controller.playhead >= controller.targetRevealReleaseProgress')
    && runtimeSource.includes('homepage-transition-target-gated')
    && runtimeSource.includes('releaseTargetGate: !hold && direction > 0'),
  'Homepage runtime must gate non-handoff target sections only until the visual bridge tail can reveal native copy'
);
assert.doesNotMatch(
  runtimeSource,
  /holdRevealWithin|releaseRevealWithin/,
  'Homepage runtime must not pause or hide child reveal tweens while gating visual bridge targets'
);
assert.ok(
  runtimeSource.includes('controller.handoffId && controller.handoffTarget'),
  'Homepage runtime must notify presentation state only for declared handoffs'
);
assert.ok(
  runtimeSource.includes('getDirectHashTargetId')
    && runtimeSource.includes('isDirectHandoffTarget')
    && runtimeSource.includes('skipForDirectHash')
    && runtimeSource.includes('completeDirectHashHandoff(controller)')
    && runtimeSource.includes('directHashHandoffComplete')
    && runtimeSource.includes('handoffComplete: isDirectHandoffTarget')
    && runtimeSource.includes('playedForward: isDirectHandoffTarget'),
  'Homepage runtime must skip preceding handoff playback and complete target presentation for direct target anchors'
);
assert.ok(
  runtimeSource.includes('shouldContinueStagedForward')
    && runtimeSource.includes('? getScrollY()')
    && runtimeSource.includes('inStageHold')
    && runtimeSource.includes('controller.playhead > 0.001 && controller.playhead < 0.998'),
  'Homepage runtime must keep Figure2 fixed through the 30vh staged hold and avoid jump-scroll when continuing'
);
assert.ok(
  homepageTransitionCss.includes('.homepage-transition > section')
    && homepageTransitionCss.includes('position: sticky')
    && homepageTransitionCss.includes('height: calc(var(--homepage-transition-snap-height, 100dvh) + var(--transition-seam-bleed)'),
  'Homepage transition visual layer must remain viewport-sized and sticky during staged holds'
);
assert.doesNotMatch(
  homepageTransitionCss,
  /\.homepage-transition > section\s*\{[\s\S]*?height:\s*calc\(100%/,
  'Homepage transition visual layer must not inherit the extra staged hold height'
);
assert.doesNotMatch(
  homepageTransitionCss,
  /\.homepage-transition \.aod-transition,[\s\S]*?\.homepage-transition \.ttg-scroll\s*\{[\s\S]*?height:\s*calc\(100%/,
  'Homepage transition inner scroll surfaces must stay viewport-sized during staged holds'
);
assert.match(
  homepageTransitionCss,
  /\.homepage-transition \.figure2-sticky\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?inset:\s*0;/,
  'Homepage Figure2 visual stage must fill the pinned section instead of running its own sticky scroll'
);
assert.ok(
  homepageTransitionCss.includes('.homepage-transition--figure2.homepage-transition--fixed-stage > section')
    && homepageTransitionCss.includes('position: fixed')
    && homepageTransitionCss.includes('contain: none'),
  'Homepage Figure2 staged visuals must stay fixed to the viewport while snapped'
);
assert.ok(
  handoffReceiverSource.includes('createHandoffReceiver')
    && handoffPreviewSource.includes('createHandoffPreview')
    && handoffReceiverSource.includes('has been retired')
    && handoffReceiverSource.includes('throw new Error'),
  'Shared handoff helper must be retired loudly instead of adopting real target DOM'
);
assert.doesNotMatch(
  `${handoffPreviewSource}\n${handoffReceiverSource}`,
  /cloneNode\s*\(\s*true\s*\)/,
  'Shared handoff helper must not clone target content'
);
assert.equal(
  [...stylesSource.matchAll(/@import url\("([^"]+)"\);/g)].map((match) => match[1]).at(-1),
  './components/homepage-continuity.css',
  'Homepage continuity CSS must be the last top-level stylesheet import'
);
assert.ok(
  homepageContinuityCss.includes('homepage-transition--reduced-motion')
    && homepageContinuityCss.includes('--paper-ink: #252719')
    && homepageContinuityCss.includes('z-index: 22')
    && homepageContinuityCss.includes('height: 0 !important')
    && homepageContinuityCss.includes('.canvas-section.homepage-transition-target-gated')
    && homepageContinuityCss.includes('body.is-pattern-bloom-covering .hero-content')
    && homepageContinuityCss.includes('.canvas-section--belief.is-pattern-bloom-pinned')
    && homepageContinuityCss.includes('z-index: 95')
    && homepageContinuityCss.includes('opacity: 1 !important')
    && homepageContinuityCss.includes('background: transparent !important')
    && homepageContinuityCss.includes('.belief-star-field.is-ready')
    && homepageContinuityCss.includes('.canvas-section--belief.is-pattern-bloom-pinned .belief-copy-wrap'),
  'Homepage continuity CSS must define reduced-motion collapse, paper tokens, method-brand collapse, target gates, and pinned belief copy'
);
assert.doesNotMatch(
  homepageContinuityCss,
  /homepage-handoff-preview/,
  'Homepage continuity CSS must not keep clone preview selectors'
);
assert.doesNotMatch(
  homepageContinuityCss,
  /\.long-canvas\s*>\s*\.canvas-section--belief/,
  'Belief continuity overrides must target the actual belief section outside .long-canvas'
);

assert.ok(
  figure2HomepageAdapterSource.includes('startFigureVideoPlayback()')
    && figure2HomepageAdapterSource.includes('finishFigureVideoPlayback()')
    && figure2HomepageAdapterSource.includes('resetFigureVideoPlayback()'),
  'Figure2 homepage transition must use native video playback for the intro stage'
);
assert.doesNotMatch(
  figure2HomepageAdapterSource,
  /renderRawFigureVideoProgress\(introProgress\)/,
  'Figure2 homepage transition must not scrub the intro video every frame'
);
assert.doesNotMatch(
  figure2HomepageAdapterSource,
  /introProgress:\s*1\b/,
  'Figure2 homepage transition must not pin camera intro progress to the final state'
);
assert.ok(
  figure2HomepageAdapterSource.includes('createProofSceneTexture')
    && figure2HomepageAdapterSource.includes('paperGradient')
    && figure2HomepageAdapterSource.includes('nextSceneElement: proofSceneTexture?.canvas'),
  'Figure2 homepage transition must pass a paper-only texture into the ink transition'
);
assert.doesNotMatch(
  figure2HomepageAdapterSource,
  /fillText|drawWrappedText|drawLetterSpacedText|method-proof__lead|method-proof__row/,
  'Figure2 ink texture must not paint proof copy; proof copy has a single DOM owner'
);
assert.ok(
  figure2HomepageAdapterSource.includes('createProofScrollOverlay')
    && figure2HomepageAdapterSource.includes('postProgressSource?.()')
    && figure2HomepageAdapterSource.includes('handoffFade')
    && figure2HomepageAdapterSource.includes('transitionRevealProgress')
    && figure2HomepageAdapterSource.includes('--figure2-proof-reveal-stop'),
  'Figure2 proof copy must be owned by one DOM overlay that reveals during the second stage and keeps scrolling after it'
);
assert.ok(
  !figure2HomepageAdapterSource.includes('createHandoffReceiver')
    && figure2HomepageAdapterSource.includes('timeline?.update')
    && figure2HomepageAdapterSource.includes('phaseTwoComplete')
    && figure2HomepageAdapterSource.includes('handoffProgressSource'),
  'Figure2 homepage transition must report timeline progress without adopting the native Brand grid'
);
assert.doesNotMatch(
  figure2HomepageAdapterSource,
  /controller\.renderStaticState\([\s\S]*?transitionProgress\s*<\s*0\.998[\s\S]*?inkCanvas\.style\.(?:opacity|visibility)\s*=\s*''/,
  'Figure2 ink canvas must not be reset to CSS-hidden defaults after the ink renderer has made it visible'
);
assert.ok(
  figure2HomepageAdapterSource.includes('FIGURE2_PAPER_GROUND')
    && figure2HomepageAdapterSource.includes('paperGradient'),
  'Figure2 homepage proof texture must use the same shallow paper ground instead of a white target'
);
assert.ok(
  figure2ComponentSource.includes('nextSceneElement: options.nextSceneElement || null'),
  'Figure2 component must pass dynamic next-scene textures into the ink scene shader'
);
assert.ok(
  figure2Css.includes('--figure2-paper-ground')
    && figure2Css.includes('.figure2-middle-window-mask::before')
    && figure2Css.includes('.figure2-middle-window-mask::after')
    && figure2Css.includes('.figure2-proof-scroll')
    && figure2Css.includes('mask-image: radial-gradient'),
  'Figure2 cloud/mountain window and single proof overlay must include the shallow paper ground'
);
assert.ok(
  homepageTransitionCss.includes('--figure2-paper-ground: #ece8dc')
    && homepageTransitionCss.includes('--transition-seam-color: var(--figure2-paper-ground)'),
  'Homepage Figure2 host must use the shallow paper ground as its fallback surface'
);
assert.ok(
  indexHtml.includes('<div class="homepage-scene homepage-scene--method-proof" data-scene-id="method-proof" data-transition-source-only="true">')
    && read('css/sections/canvas-stage.css').includes('.homepage-scene--method-proof[data-transition-source-only="true"]'),
  'Figure2 method proof source must be hidden from normal flow so it cannot become a second visible scene'
);
assert.ok(
  homepageContinuityCss.includes('.long-canvas > .chapter-transition[data-transition-id="method-brand"]')
    && homepageContinuityCss.includes('height: 0 !important')
    && homepageContinuityCss.includes('+ .canvas-section--brand'),
  'Method-to-brand divider must collapse to zero in the homepage continuity path'
);
assert.ok(
  !craneHomepageAdapterSource.includes('createHandoffReceiver')
    && craneHomepageAdapterSource.includes('timeline?.update')
    && craneHomepageAdapterSource.includes('playbackComplete')
    && craneHomepageAdapterSource.includes('handoffProgressSource'),
  'Crane homepage transition must report timeline progress without adopting the native Contact endpoint'
);
assert.doesNotMatch(
  `${figure2HomepageAdapterSource}\n${homepageTransitionCss}\n${figure2Css}`,
  /figure2-proof-copy|cloneProofCopyOverlay|proof-copy-progress|createProofCopyTexture/,
  'Figure2 proof scene must not keep obsolete duplicate proof-copy implementations'
);

assert.ok(
  ttgHomepageAdapterSource.includes('startFigureVideoPlayback(1, { driveScene: false })')
    && ttgHomepageAdapterSource.includes('startFigureVideoPlayback(-1, { driveScene: false })')
    && ttgHomepageAdapterSource.includes('finishFigureVideoPlayback()')
    && ttgHomepageAdapterSource.includes('resetFigureVideoPlayback()'),
  'TTG homepage transition must trigger native figure playback from snap progress'
);
assert.ok(
  ttgHomepageAdapterSource.includes('scene.renderRawProgress(progress, { syncVideo: false })')
    && ttgHomepageAdapterSource.includes('scene.enableGsapRendering(gsap)')
    && ttgHomepageAdapterSource.includes('timeline?.update(progress')
    && ttgComponentSource.includes('figurePlaybackDrivesScene'),
  'TTG homepage transition must drive scenery from snap progress instead of video frame time'
);
assert.ok(
  phHomepageAdapterSource.includes('timeline?.update(progress')
    && phHomepageAdapterSource.includes('playbackComplete'),
  'PH visual bridge must present Education through the homepage timeline'
);
assert.doesNotMatch(
  ttgHomepageAdapterSource,
  /waitForMedia\(\)\.finally\(render\)/,
  'TTG homepage transition must start rendering immediately instead of waiting for metadata'
);
assert.doesNotMatch(
  ttgHomepageAdapterSource,
  /progress\s*[<>]=\s*0\.(?:00)?1|progress\s*[<>]=\s*0\.998/,
  'TTG homepage transition must not force endpoint video seeks before snap progress reaches 0 or 1'
);
assert.ok(
  ttgComponentSource.includes('startFigureVideoPlayback')
    && ttgComponentSource.includes('finishFigureVideoPlayback')
    && ttgComponentSource.includes('resetFigureVideoPlayback')
    && ttgComponentSource.includes('figurePlaybackDrivesScene'),
  'TTG component must expose homepage playback controls and decouple video playback from scenery rendering'
);
assert.ok(
  runtimeSource.includes('ttg: 2500'),
  'TTG homepage snap duration must match the 2.5s component video playback'
);

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
