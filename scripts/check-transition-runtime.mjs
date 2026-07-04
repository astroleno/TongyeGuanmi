import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const packageJson = JSON.parse(read('package.json'));
const phRouteEntry = read('js/ph-route-entry.js');
const phRouteEntryHtml = read('ph-route-entry.html');
const phTransitionComponent = read('js/components/ph-transition.js');
const figure2Component = read('js/components/figure2-transition.js');
const figure2RouteEntry = read('js/figure2-transition-route.js');
const figure2RouteEntryHtml = read('figure2-transition-route.html');
const loadLibrariesSource = read('js/transitions/load-libraries.js');
const videoScrubSource = read('js/transitions/video-scrub.js');
const scrollSceneSource = read('js/transitions/scroll-scene.js');
const routeEntrySource = read('js/transitions/route-entry.js');
const runtimeSource = read('js/transitions/homepage-transition-runtime.js');
const aodTransitionComponent = read('js/components/aod-transition.js');
const aodTransitionRoute = read('js/aod-transition-route.js');
const aodTransitionRouteHtml = read('aod-transition-route.html');
const ttgTransitionComponent = read('js/components/ttg-transition.js');
const ttgTransitionRoute = read('js/ttg-transition-route.js');
const ttgTransitionRouteHtml = read('ttg-transition-route.html');

class FakeStyle {
  constructor() {
    this.values = new Map();
  }

  getPropertyValue(name) {
    return this.values.get(name) || '';
  }

  setProperty(name, value) {
    this.values.set(name, String(value));
  }

  removeProperty(name) {
    this.values.delete(name);
  }
}

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(...names) {
    names.forEach((name) => this.values.add(name));
  }

  remove(...names) {
    names.forEach((name) => this.values.delete(name));
  }
}

class FakeDocument {
  constructor() {
    this.documentElement = {
      classList: new FakeClassList(),
      style: new FakeStyle(),
      clientHeight: 720
    };
  }

  querySelectorAll() {
    return [];
  }

  querySelector() {
    return null;
  }

  getElementById() {
    return null;
  }
}

function makeFakeWindow() {
  const listeners = new Map();
  let rafId = 1;
  const frames = new Map();

  return {
    innerHeight: 720,
    innerWidth: 1280,
    scrollX: 0,
    scrollY: 0,
    pageYOffset: 0,
    performance: { now: () => 0 },
    gsap: null,
    ScrollTrigger: null,
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(callback);
    },
    removeEventListener(type, callback) {
      listeners.get(type)?.delete(callback);
    },
    requestAnimationFrame(callback) {
      const id = rafId;
      rafId += 1;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
    setTimeout(callback) {
      const id = rafId;
      rafId += 1;
      frames.set(id, callback);
      return id;
    },
    clearTimeout(id) {
      frames.delete(id);
    },
    scrollTo() {},
    listenerCount(type) {
      return listeners.get(type)?.size || 0;
    },
    totalListenerCount() {
      return [...listeners.values()].reduce((total, entries) => total + entries.size, 0);
    }
  };
}

async function verifyHomepageTransitionInitIdempotency() {
  const previousGlobals = {
    window: globalThis.window,
    document: globalThis.document,
    performance: globalThis.performance,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame
  };
  const fakeWindow = makeFakeWindow();
  const rootA = new FakeDocument();
  const rootB = new FakeDocument();
  const originalWarn = console.warn;
  const warnings = [];

  globalThis.window = fakeWindow;
  globalThis.document = rootA;
  globalThis.performance = fakeWindow.performance;
  globalThis.requestAnimationFrame = fakeWindow.requestAnimationFrame;
  globalThis.cancelAnimationFrame = fakeWindow.cancelAnimationFrame;
  console.warn = (...args) => warnings.push(args.join(' '));

  try {
    const { initHomepageTransitions } = await import('../js/transitions/homepage-transition-runtime.js');
    const firstPromise = initHomepageTransitions({ root: rootA, gsap: null, ScrollTrigger: null });
    const secondPromise = initHomepageTransitions({ root: rootA, gsap: null, ScrollTrigger: null });
    assert.strictEqual(secondPromise, firstPromise, 'same root init must return the active cleanup promise');

    const firstCleanup = await firstPromise;
    assert.equal(typeof firstCleanup.destroy, 'function', 'init must resolve to a cleanup object with destroy()');
    assert.equal(fakeWindow.listenerCount('scroll'), 1, 'same root init must not duplicate scroll listeners');

    await assert.rejects(
      () => initHomepageTransitions({ root: rootA, reduceMotion: true, gsap: null, ScrollTrigger: null }),
      /different options/,
      'same root init with different options must reject instead of reusing stale runtime'
    );
    assert.equal(warnings.length, 1, 'different-option reuse must warn once');
    assert.equal(fakeWindow.listenerCount('scroll'), 1, 'rejected different-option init must not add listeners');

    const otherRootPromise = initHomepageTransitions({ root: rootB, gsap: null, ScrollTrigger: null });
    assert.notStrictEqual(otherRootPromise, firstPromise, 'different roots must not reuse the same runtime promise');
    assert.strictEqual(
      initHomepageTransitions({ root: rootA, gsap: null, ScrollTrigger: null }),
      firstPromise,
      'root A must remain cached while root B initializes'
    );

    const otherRootCleanup = await otherRootPromise;
    assert.equal(fakeWindow.listenerCount('scroll'), 2, 'different roots may own separate listeners');

    firstCleanup.destroy();
    assert.equal(fakeWindow.listenerCount('scroll'), 1, 'destroy() must remove the first root listeners');

    const rebuiltPromise = initHomepageTransitions({ root: rootA, reduceMotion: true, gsap: null, ScrollTrigger: null });
    assert.notStrictEqual(rebuiltPromise, firstPromise, 'destroyed root must be able to initialize a fresh runtime');
    const rebuiltCleanup = await rebuiltPromise;

    otherRootCleanup.destroy();
    rebuiltCleanup.destroy();
    assert.equal(fakeWindow.totalListenerCount(), 0, 'destroy() must remove all runtime listeners');
  } finally {
    for (const [key, value] of Object.entries(previousGlobals)) {
      if (value === undefined) {
        delete globalThis[key];
      } else {
        globalThis[key] = value;
      }
    }
    console.warn = originalWarn;
  }
}

function assertIncludes(source, needle, message) {
  assert.ok(source.includes(needle), message);
}

assertIncludes(loadLibrariesSource, 'export function loadScript', 'load-libraries exports loadScript');
assertIncludes(loadLibrariesSource, 'export async function loadTransitionLibraries', 'load-libraries exports loadTransitionLibraries');
assertIncludes(loadLibrariesSource, 'const scriptPromises = new Map()', 'load-libraries caches script promises');
assertIncludes(videoScrubSource, 'export function prepareScrubVideo', 'video-scrub exports prepareScrubVideo');
assertIncludes(videoScrubSource, 'export function waitForVideoMetadata', 'video-scrub exports waitForVideoMetadata');
assertIncludes(videoScrubSource, 'export function seekVideoToProgress', 'video-scrub exports seekVideoToProgress');
assertIncludes(scrollSceneSource, 'export function createReduceMotionState', 'scroll-scene exports createReduceMotionState');
assertIncludes(scrollSceneSource, 'export function initTransitionScrollRuntime', 'scroll-scene exports initTransitionScrollRuntime');
assertIncludes(scrollSceneSource, 'export function createScrollProgressTrigger', 'scroll-scene exports createScrollProgressTrigger');
assertIncludes(routeEntrySource, 'export function createTransitionRoute', 'route-entry exports createTransitionRoute');
assertIncludes(routeEntrySource, "from './load-libraries.js'", 'route-entry owns shared library loading');
assertIncludes(routeEntrySource, "from './scroll-scene.js'", 'route-entry owns scroll runtime initialization');
assertIncludes(routeEntrySource, "window.addEventListener('pagehide'", 'route-entry owns pagehide cleanup');
assertIncludes(routeEntrySource, 'onReducedMotion', 'route-entry supports reduced-motion hook');
assertIncludes(routeEntrySource, 'beforeMount', 'route-entry supports route prerequisite hook');
assertIncludes(routeEntrySource, 'refreshOnMount', 'route-entry owns optional ScrollTrigger refresh');

assertIncludes(phRouteEntry, "from './transitions/route-entry.js'", 'ph-route-entry imports shared route entry');
assertIncludes(phRouteEntry, "from './transitions/scroll-scene.js'", 'ph-route-entry imports shared scroll scene helpers');
assertIncludes(phRouteEntry, "from './components/ph-transition.js'", 'ph-route-entry imports PH component helpers');
assertIncludes(phRouteEntry, 'createTransitionRoute({', 'ph-route-entry enters through createTransitionRoute');
assertIncludes(phRouteEntry, "name: 'PH transition'", 'ph-route-entry names the transition route');
assertIncludes(phRouteEntry, 'smoothOptions:', 'ph-route-entry passes route smooth scroll options through the contract');
assertIncludes(phRouteEntry, 'beforeMount: () => waitForPhTransitionMetadata(stage)', 'ph-route-entry waits for metadata before normal mount through component helpers');
assertIncludes(phRouteEntry, 'renderPhTransitionProgress(stage, playhead.raw', 'ph-route-entry renders progress through component helpers');
assert.doesNotMatch(phRouteEntry, /function loadScript|async function loadRequiredLibraries/, 'ph-route-entry must not keep local script loader');
assert.doesNotMatch(phRouteEntry, /loadTransitionLibraries|initTransitionScrollRuntime|window\.addEventListener\('pagehide'/, 'ph-route-entry must not own shared route lifecycle');
assert.doesNotMatch(phRouteEntry, /data-ph-alpha-video-reverse|nextVideo\.play\(|requestVideoFrameCallback|playbackRate|switchToken|activeVideo/, 'ph-route-entry must not swap between separate forward and reverse videos');
assert.match(
  phRouteEntry,
  /onReducedMotion: \(\) => \{\s+let active = true;\s+renderRawProgress\(1\);\s+waitForPhTransitionMetadata\(stage\)\.then\(\(\) => \{\s+if \(active\) renderRawProgress\(1\);/s,
  'ph-route-entry must not block reduced-motion final state on metadata wait'
);
assertIncludes(phRouteEntry, 'TRANSITION_DURATION_SECONDS = 2.5', 'ph-route-entry keeps current transition duration');
assertIncludes(phRouteEntry, 'SCROLL_TRIGGER_VH = 20', 'ph-route-entry keeps current short route trigger distance');
assertIncludes(phTransitionComponent, "from '../transitions/video-scrub.js'", 'ph component imports shared video helpers');
assertIncludes(phTransitionComponent, 'export function preparePhTransition', 'ph component exports prepare helper');
assertIncludes(phTransitionComponent, 'export function renderPhTransitionProgress', 'ph component exports progress renderer');
assertIncludes(phTransitionComponent, 'export function waitForPhTransitionMetadata', 'ph component exports metadata helper');
assertIncludes(phTransitionComponent, 'VIDEO_DURATION_FALLBACK = 76 / 30', 'ph component matches the same-source PH video fallback duration');
assertIncludes(phTransitionComponent, 'seekVideoToProgress(options.alphaVideo ?? alphaVideo', 'ph component uses the same single-video scrub model as figure3');
assert.doesNotMatch(phRouteEntryHtml, /data-ph-alpha-video-reverse|assets\/ph_figure-alpha-reverse\.webm/, 'ph-route-entry.html must use one PH alpha video');
assert.match(
  phRouteEntryHtml,
  /<script\b(?=[^>]*\btype=["']module["'])(?=[^>]*\bsrc=["']js\/ph-route-entry\.js["'])[^>]*><\/script>/,
  'ph-route-entry.html must load js/ph-route-entry.js as a module'
);

assertIncludes(figure2Component, 'export function createFigure2TransitionController', 'figure2 component exports controller factory');
assertIncludes(figure2Component, 'export async function initFigure2Transition', 'figure2 component exports standalone init helper');
assertIncludes(figure2Component, 'export async function mountFigure2Transitions', 'figure2 component exports mount helper');
assertIncludes(figure2Component, "from '../transitions/load-libraries.js'", 'figure2 component can use shared library loading when mounted outside route-entry');
assertIncludes(figure2Component, "from '../effects/ink-scene-transition.js'", 'figure2 component owns ink scene rendering');
assert.doesNotMatch(figure2Component, /function loadScript|async function loadRequiredLibraries/, 'figure2 component must not keep local script loader');
assertIncludes(figure2RouteEntry, "from './transitions/route-entry.js'", 'figure2 route-entry imports shared route entry');
assertIncludes(figure2RouteEntry, "from './components/figure2-transition.js'", 'figure2 route-entry imports component module');
assertIncludes(figure2RouteEntry, 'createTransitionRoute({', 'figure2 route-entry enters through createTransitionRoute');
assertIncludes(figure2RouteEntry, "name: 'Figure 2 route-entry transition'", 'figure2 route-entry names the transition route');
assertIncludes(figure2RouteEntry, 'smoothOptions:', 'figure2 route-entry passes smooth scroll options through contract');
assertIncludes(figure2RouteEntry, 'beforeMount: () => waitForFigure2TransitionMedia(stage)', 'figure2 route-entry waits for media before normal mount');
assert.doesNotMatch(figure2RouteEntry, /function loadScript|async function loadRequiredLibraries|initTransitionScrollRuntime/, 'figure2 route-entry must not own shared route lifecycle');
assert.match(
  figure2RouteEntryHtml,
  /<script\b(?=[^>]*\btype=["']module["'])(?=[^>]*\bsrc=["']js\/figure2-transition-route\.js\?v=routeentry1["'])[^>]*><\/script>/,
  'figure2-transition-route.html must load js/figure2-transition-route.js as a module'
);
assertIncludes(figure2RouteEntryHtml, 'data-figure2-route-stage', 'figure2 route-entry html declares the route stage');
assertIncludes(figure2RouteEntryHtml, 'data-figure2-transition', 'figure2 route-entry html declares component hook');
assert.equal(packageJson.scripts['verify:transition-runtime'], 'node scripts/check-transition-runtime.mjs');

assertIncludes(aodTransitionComponent, "from '../transitions/load-libraries.js'", 'aod component can load shared transition libraries for component mounting');
assertIncludes(aodTransitionComponent, "from '../transitions/scroll-scene.js'", 'aod component imports shared scroll helpers');
assertIncludes(aodTransitionComponent, "from '../transitions/video-scrub.js'", 'aod component imports shared video scrub helpers');
assertIncludes(aodTransitionComponent, 'export function prepareAodTransition', 'aod component exports prepare hook');
assertIncludes(aodTransitionComponent, 'export function waitForAodTransitionMetadata', 'aod component exports metadata hook');
assertIncludes(aodTransitionComponent, 'export function renderAodTransitionProgress', 'aod component exports reduced-motion/fallback renderer');
assertIncludes(aodTransitionComponent, 'export async function initAodTransition', 'aod component exports transition initializer');
assertIncludes(aodTransitionComponent, 'createScrollProgressTrigger({', 'aod component uses shared ScrollTrigger wrapper');
assertIncludes(aodTransitionComponent, 'seekVideoToProgress(video, visualProgress', 'aod component scrubs the single figure video');
assertIncludes(aodTransitionComponent, 'const playhead = { raw: 0 }', 'aod component follows the figure3 single-playhead scrub model');
assertIncludes(aodTransitionComponent, 'let progressTween = null', 'aod component follows the figure3 single progress tween model');
assertIncludes(aodTransitionComponent, 'onUpdate: (self) => tweenToRawProgress(self.progress)', 'aod component follows figure3 ScrollTrigger progress updates');
assert.doesNotMatch(aodTransitionComponent, /activeTarget|fullscreenTween|backdropTween|addEventListener\('wheel'|video\.play\(|playbackRate/, 'aod component must not keep the custom direction/native-video playback experiment');
assert.doesNotMatch(aodTransitionComponent, /function loadScript|async function loadRequiredLibraries/, 'aod component must not keep local script loader');

assertIncludes(aodTransitionRoute, "from './transitions/route-entry.js'", 'aod route imports shared route entry');
assertIncludes(aodTransitionRoute, "from './components/aod-transition.js'", 'aod route imports component API');
assertIncludes(aodTransitionRoute, 'createTransitionRoute({', 'aod route enters through createTransitionRoute');
assertIncludes(aodTransitionRoute, "name: 'AOD route-entry transition'", 'aod route names the transition');
assertIncludes(aodTransitionRoute, 'smoothOptions:', 'aod route passes smooth scroll options through the contract');
assertIncludes(aodTransitionRoute, 'prepareAodTransition(stage, { progress: 0 })', 'aod route prepares initial component state');
assertIncludes(aodTransitionRoute, 'beforeMount: () => waitForAodTransitionMetadata(stage)', 'aod route waits for metadata before normal mount');
assert.match(
  aodTransitionRoute,
  /onReducedMotion: \(\) => \{\s+let active = true;\s+renderAodTransitionProgress\(stage, 1\);\s+waitForAodTransitionMetadata\(stage\)\.then\(\(\) => \{\s+if \(active\) renderAodTransitionProgress\(stage, 1\);/s,
  'aod route must not block reduced-motion final state on metadata wait'
);
assert.doesNotMatch(aodTransitionRoute, /loadTransitionLibraries|initTransitionScrollRuntime|window\.addEventListener\('pagehide'/, 'aod route must not own shared route lifecycle');
assert.match(
  aodTransitionRouteHtml,
  /<script\b(?=[^>]*\btype=["']module["'])(?=[^>]*\bsrc=["']js\/aod-transition-route\.js["'])[^>]*><\/script>/,
  'aod-transition-route.html must load js/aod-transition-route.js as a module'
);
assertIncludes(aodTransitionRouteHtml, 'data-aod-transition', 'aod-transition-route.html includes the component mount marker');
assertIncludes(aodTransitionRouteHtml, 'data-aod-route-stage', 'aod-transition-route.html includes the route stage marker');
assertIncludes(aodTransitionRouteHtml, 'data-aod-figure-video', 'aod-transition-route.html includes the single figure video layer');
assertIncludes(aodTransitionRouteHtml, 'data-aod-figure-start-scale="1"', 'aod transition route keeps the figure video canvas full size');
assert.doesNotMatch(aodTransitionRouteHtml, /data-aod-figure-layer|aod_figure-alpha\.png/, 'aod transition route must not add a separate figure image layer');

assertIncludes(ttgTransitionComponent, 'export function createTtgTransitionScene', 'ttg component exports scene factory');
assertIncludes(ttgTransitionComponent, "from '../transitions/scroll-scene.js'", 'ttg component imports shared scroll helpers');
assertIncludes(ttgTransitionComponent, "from '../transitions/video-scrub.js'", 'ttg component imports shared video scrub helpers');
assertIncludes(ttgTransitionComponent, 'createScrollProgressTrigger({', 'ttg component uses shared ScrollTrigger wrapper');
assertIncludes(ttgTransitionComponent, 'prepareScrubVideo(video)', 'ttg component prepares route videos');
assertIncludes(ttgTransitionComponent, 'waitForVideoMetadata(video, { timeoutMs: 1300 })', 'ttg component waits for route media metadata');
assertIncludes(ttgTransitionComponent, 'renderRawProgress', 'ttg component exposes raw progress rendering for future adapters');
assertIncludes(ttgTransitionComponent, 'enableGsapRendering', 'ttg component exposes quickSetter rendering for homepage adapters');
assertIncludes(ttgTransitionComponent, 'startFigureVideoPlayback', 'ttg component exposes homepage forward/reverse video playback');
assertIncludes(ttgTransitionComponent, 'finishFigureVideoPlayback', 'ttg component exposes homepage video completion');
assertIncludes(ttgTransitionComponent, 'resetFigureVideoPlayback', 'ttg component exposes homepage video reset');
assertIncludes(ttgTransitionComponent, "stage?.querySelector('.ttg-layer--bg')", 'ttg component queries inside the passed stage');
assertIncludes(ttgTransitionComponent, "stage?.querySelector('[data-ttg-figure-video]')", 'ttg component queries figure video inside the passed stage');
assert.doesNotMatch(ttgTransitionComponent, /document\.querySelector|localStorage|data-ttg-tune-panel|ttg-tune/, 'ttg component must not keep route-global queries or tuning panel state');
assert.doesNotMatch(ttgTransitionComponent, /loadTransitionLibraries|initTransitionScrollRuntime|function loadScript/, 'ttg component must not own shared route lifecycle');

assertIncludes(ttgTransitionRoute, "from './transitions/route-entry.js'", 'ttg route imports shared route entry');
assertIncludes(ttgTransitionRoute, "from './components/ttg-transition.js'", 'ttg route imports component API');
assertIncludes(ttgTransitionRoute, 'createTransitionRoute({', 'ttg route enters through createTransitionRoute');
assertIncludes(ttgTransitionRoute, "name: 'TTG route-entry transition'", 'ttg route names the transition');
assertIncludes(ttgTransitionRoute, 'smoothOptions:', 'ttg route passes smooth scroll options through the contract');
assertIncludes(ttgTransitionRoute, 'sceneState.prepare()', 'ttg route prepares the component');
assertIncludes(ttgTransitionRoute, 'beforeMount: () => sceneState.waitForMedia()', 'ttg route waits for media before normal mount');
assertIncludes(ttgTransitionRoute, 'mount: (context) => sceneState.mountGsap(context)', 'ttg route mounts GSAP through the component');
assertIncludes(ttgTransitionRoute, 'sceneState.mountNativeFallback(context.reduceMotion)', 'ttg route preserves native fallback through onError');
assert.doesNotMatch(ttgTransitionRoute, /loadTransitionLibraries|initTransitionScrollRuntime|data-ttg-tune-panel/, 'ttg route must not own shared lifecycle or tuning panel state');
assert.match(
  ttgTransitionRouteHtml,
  /<script\b(?=[^>]*\btype=["']module["'])(?=[^>]*\bsrc=["']js\/ttg-transition-route\.js["'])[^>]*><\/script>/,
  'ttg-transition-route.html must load js/ttg-transition-route.js as a module'
);
assertIncludes(ttgTransitionRouteHtml, 'data-ttg-transition', 'ttg-transition-route.html includes the component mount marker');
assertIncludes(ttgTransitionRouteHtml, 'data-ttg-route-stage', 'ttg-transition-route.html includes the route stage marker');
assertIncludes(ttgTransitionRouteHtml, 'data-ttg-figure-video', 'ttg-transition-route.html includes the forward figure video');
assertIncludes(ttgTransitionRouteHtml, 'data-ttg-figure-video-reverse', 'ttg-transition-route.html includes the reverse figure video');
assertIncludes(ttgTransitionRouteHtml, 'data-ttg-scroll-vh="153"', 'ttg-transition-route.html keeps the fixed route scroll height');
assert.doesNotMatch(ttgTransitionRouteHtml, /data-ttg-tune-panel|ttg-tune-panel|js\/ttg-scroll\.js/, 'ttg-transition-route.html must not load the tuning panel route');

assertIncludes(runtimeSource, 'const activeHomepageTransitionRuntimes = new Map()', 'homepage runtime tracks active runtimes by root');
assertIncludes(runtimeSource, 'function createInitOptionsSignature(options = {})', 'homepage runtime records root init option signatures');
assertIncludes(runtimeSource, 'function initHomepageTransitions(options = {})', 'initHomepageTransitions keeps the public init function contract');
assertIncludes(runtimeSource, 'return activeRuntime.promise', 'same-root init returns the active cleanup promise');
assertIncludes(runtimeSource, 'hasSameInitOptionsSignature(activeRuntime.signature, signature)', 'same-root init must compare option signatures');
assertIncludes(runtimeSource, 'Call cleanup.destroy() before reinitializing.', 'different same-root options must require explicit destroy');
assertIncludes(runtimeSource, 'activeHomepageTransitionRuntimes.delete(root)', 'destroy/failure clears the root-bound active runtime');
assert.doesNotMatch(runtimeSource, /export async function initHomepageTransitions/, 'initHomepageTransitions must not own the runtime body directly');

await verifyHomepageTransitionInitIdempotency();

console.log('Transition runtime structure looks good.');
