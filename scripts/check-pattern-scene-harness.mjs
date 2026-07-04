#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLAYER_PATH = join(ROOT, 'js/scene-harness/pattern-scene-player.js');
const PROVIDER_PATH = join(ROOT, 'js/scene-harness/pattern-scene-provider.js');
const CONTROLLER_PATH = join(ROOT, 'js/scene-harness/pattern-scene-controller.js');
const DRIVER_PATH = join(ROOT, 'js/runtime/timed-progress-driver.js');
const PAGE_PATH = join(ROOT, 'scene-harness-pattern.html');
const RENDERER_PATH = join(ROOT, 'js/pattern-mirror-stage.js');

let pass = 0;
let fail = 0;

function assert(condition, message) {
  if (condition) {
    pass += 1;
  } else {
    fail += 1;
    console.error('  x', message);
  }
}

function assertClose(actual, expected, message, epsilon = 1e-9) {
  assert(Math.abs(actual - expected) <= epsilon, `${message} (got ${actual}, expected ${expected})`);
}

const [playerSource, providerSource, controllerSource, driverSource, pageSource, rendererSource] = await Promise.all([
  readFile(PLAYER_PATH, 'utf8'),
  readFile(PROVIDER_PATH, 'utf8'),
  readFile(CONTROLLER_PATH, 'utf8'),
  readFile(DRIVER_PATH, 'utf8'),
  readFile(PAGE_PATH, 'utf8'),
  readFile(RENDERER_PATH, 'utf8')
]);

const timelineBloomInName = ['hero', 'to', 'pattern'].join('-');
const timelineExitName = ['pattern', 'to', 'star', 'map'].join('-');

for (const [label, source] of [
  ['pattern-scene-player.js', playerSource],
  ['pattern-scene-provider.js', providerSource],
  ['pattern-scene-controller.js', controllerSource],
  ['scene-harness-pattern.html', pageSource]
]) {
  const banned = [
    [/\bscrollY\b|\bpageYOffset\b|\bscrollTop\b/, 'reads viewport position'],
    [/\bcurrentSceneId\b|\bcurrentScene\b/, 'touches current scene state'],
    [/location\s*\.\s*hash|history\s*\.\s*(pushState|replaceState)/, 'touches hash/history routing'],
    [/\bScrollTrigger\b|\bgsap\b|\bReact\b/, 'pulls a disallowed runtime'],
    [/document\s*\.\s*body\s*\.\s*style\s*\.\s*overflow/, 'changes page overflow'],
    [/\bPresentation\b/, 'calls presentation plumbing'],
    [/pattern-bloom-adapter/, 'imports homepage pattern transition adapter'],
    [/createInkSceneTransition|createInkCurtainTransition/, 'imports ink transition'],
    [new RegExp(timelineBloomInName), 'leaks timeline bloom-in segment name'],
    [new RegExp(timelineExitName), 'leaks timeline exit segment name'],
    [/\bstar-?map\b/i, 'declares an external target scene']
  ];
  for (const [pattern, reason] of banned) {
    assert(!pattern.test(source), `${label} ${reason}`);
  }
}

assert(playerSource.includes('createPatternSceneController'), 'player facade delegates to createPatternSceneController');
assert(playerSource.includes('createPatternScenePlayer'), 'player facade exports createPatternScenePlayer');
assert(!/PLAYER_STATUS|activeToken/.test(playerSource), 'player facade has no secondary public status/token owner');
assert(!playerSource.includes('createPatternMirrorScene'), 'player facade does not import the renderer');
assert(!playerSource.includes('createPatternSceneProvider'), 'player facade does not import the provider');

assert(providerSource.includes('createPatternMirrorScene'), 'provider reuses the Canvas 2D pattern renderer');
assert(providerSource.includes('createPatternSceneProvider'), 'provider exports createPatternSceneProvider');
assert(providerSource.includes('mount'), 'provider exposes mount');
assert(providerSource.includes('setProgress'), 'provider exposes setProgress');
assert(providerSource.includes('requestRender'), 'provider exposes requestRender');
assert(providerSource.includes('destroy'), 'provider exposes destroy');
assert(providerSource.includes('getSnapshot'), 'provider exposes getSnapshot');
assert(providerSource.includes('progressSource: () => controlledProgress'), 'renderer is driven by controlled progress');
assert(providerSource.includes('scrollStage: null'), 'provider does not pass a scroll-driven stage');
assert(providerSource.includes('center: PATTERN_CENTER'), 'provider pins the main pattern center');
assert(!/activeRun|animateProgress/.test(providerSource), 'provider has no internal business progress run');

assert(controllerSource.includes('createTimedProgressDriver'), 'controller drives progress through createTimedProgressDriver');
assert(controllerSource.includes('PATTERN_SOURCE_PROGRESS = 0'), 'source progress is explicit');
assert(controllerSource.includes('PATTERN_FINAL_PROGRESS = 1'), 'final progress is explicit');
assert(controllerSource.includes('subscribe'), 'controller exposes subscribe');
assert(controllerSource.includes('runId'), 'controller owns run identity');
assert(driverSource.includes('from') && driverSource.includes('to') && driverSource.includes('rampDurationMs'), 'timed driver supports explicit partial ramp endpoints');

assert(!/currentRun/.test(pageSource), 'standalone page does not keep run state');
assert(pageSource.includes('./js/scene-harness/pattern-scene-player.js'), 'standalone page imports the player facade');
assert(pageSource.includes('dispatch(command'), 'standalone page dispatches commands through the facade');
assert(!/providerStatus/.test(pageSource), 'standalone page does not render provider status');
assert(!/reverseToPoster/.test(pageSource), 'standalone page does not dispatch ambiguous poster reverse');
assert(!/placeholder/i.test(playerSource + providerSource + controllerSource + pageSource), 'no placeholder pattern visual');

const requiredAssets = [
  'assets/patterns/backgrounds/aged-mottled-background-16x9-4k.png',
  'assets/patterns/alpha-layers/pattern-layer-alpha-02.png',
  'assets/patterns/alpha-layers/pattern-layer-alpha-03.png',
  'assets/patterns/alpha-layers/pattern-layer-alpha-04.png',
  'assets/patterns/alpha-layers/pattern-layer-alpha-05.png',
  'assets/patterns/alpha-layers/pattern-layer-alpha-06.png'
];
for (const asset of requiredAssets) {
  assert(rendererSource.includes(asset) || pageSource.includes(asset), `asset referenced: ${asset}`);
}

assert(rendererSource.includes('typeof progressSource === \'function\''), 'renderer accepts external progressSource');
assert(rendererSource.includes('listenToScroll = Boolean(scrollStage && typeof progressSource !== \'function\')'), 'renderer can avoid scroll listener when controlled');

class FakeStyle {
  setProperty(name, value) {
    this[name] = value;
  }
  removeProperty(name) {
    delete this[name];
  }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.style = new FakeStyle();
    this.attributes = new Map();
    this.className = '';
    this.textContent = '';
  }
  append(...nodes) {
    for (const node of nodes) {
      node.parentNode = this;
      this.children.push(node);
    }
  }
  appendChild(node) {
    this.append(node);
    return node;
  }
  replaceChildren(...nodes) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this.append(...nodes);
  }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, right: 1280, bottom: 720, width: 1280, height: 720 };
  }
  get childElementCount() {
    return this.children.length;
  }
}

class FakeCanvas extends FakeElement {
  constructor(ownerDocument) {
    super('canvas', ownerDocument);
    this.width = 1280;
    this.height = 720;
  }
  getContext() {
    return null;
  }
}

class FakeDocument {
  constructor() {
    this.defaultView = null;
    this.head = new FakeElement('head', this);
    this.body = new FakeElement('body', this);
  }
  createElement(tagName) {
    return tagName === 'canvas' ? new FakeCanvas(this) : new FakeElement(tagName, this);
  }
  querySelector(selector) {
    if (selector === '[data-pattern-scene-provider-style]') {
      return this.head.children.find((child) => child.dataset.patternSceneProviderStyle === 'true') || null;
    }
    return null;
  }
}

function makeFakeWindow() {
  let time = 0;
  let frameId = 1;
  const frames = new Map();
  const listeners = new Map();
  return {
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    performance: { now: () => time },
    addEventListener(type, callback) {
      listeners.set(callback, type);
    },
    removeEventListener(_type, callback) {
      listeners.delete(callback);
    },
    requestAnimationFrame(callback) {
      const id = frameId;
      frameId += 1;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
    flush(ms = 16) {
      time += ms;
      const due = [...frames.entries()];
      frames.clear();
      for (const [, callback] of due) callback(time);
    },
    frameCount: () => frames.size,
    listenerCount: () => listeners.size
  };
}

async function microtasks(count = 4) {
  for (let index = 0; index < count; index += 1) await Promise.resolve();
}

async function pump(fakeWindow, ms, count) {
  for (let index = 0; index < count; index += 1) {
    await microtasks(1);
    if (fakeWindow.frameCount() > 0) fakeWindow.flush(ms);
  }
  await microtasks();
}

const {
  createPatternSceneProvider
} = await import(pathToFileURL(PROVIDER_PATH).href);
const {
  createPatternSceneController,
  PATTERN_SOURCE_PROGRESS,
  PATTERN_FINAL_PROGRESS
} = await import(pathToFileURL(CONTROLLER_PATH).href);
const {
  createPatternScenePlayer,
  PATTERN_INITIAL_PROGRESS,
  PATTERN_POSTER_PROGRESS
} = await import(pathToFileURL(PLAYER_PATH).href);

assert(PATTERN_SOURCE_PROGRESS === 0, 'PATTERN_SOURCE_PROGRESS is 0');
assert(PATTERN_FINAL_PROGRESS === 1, 'PATTERN_FINAL_PROGRESS is 1');
assert(PATTERN_INITIAL_PROGRESS === PATTERN_SOURCE_PROGRESS, 'initial progress aliases source progress');
assert(PATTERN_POSTER_PROGRESS === PATTERN_FINAL_PROGRESS, 'poster progress aliases final progress during migration');

function makeSceneFactory() {
  const options = [];
  let startCount = 0;
  let destroyCount = 0;
  let renderCount = 0;
  function createScene(nextOptions) {
    options.push(nextOptions);
    return {
      start: async () => {
        startCount += 1;
        nextOptions.canvas.width = 1280;
        nextOptions.canvas.height = 720;
      },
      requestRender: () => {
        renderCount += 1;
      },
      destroy: () => {
        destroyCount += 1;
      }
    };
  }
  return {
    createScene,
    options,
    startCount: () => startCount,
    destroyCount: () => destroyCount,
    renderCount: () => renderCount
  };
}

function makeDelayedSceneFactory() {
  const options = [];
  let startCount = 0;
  let destroyCount = 0;
  let resolveStart = () => {};
  function createScene(nextOptions) {
    options.push(nextOptions);
    return {
      start: () => new Promise((resolve) => {
        resolveStart = () => {
          startCount += 1;
          nextOptions.canvas.width = 1280;
          nextOptions.canvas.height = 720;
          resolve();
        };
      }),
      requestRender: () => {},
      destroy: () => {
        destroyCount += 1;
      }
    };
  }
  return {
    createScene,
    options,
    resolveStart: () => resolveStart(),
    startCount: () => startCount,
    destroyCount: () => destroyCount
  };
}

function makeFixture() {
  const fakeDocument = new FakeDocument();
  const fakeWindow = makeFakeWindow();
  fakeDocument.defaultView = fakeWindow;
  const host = new FakeElement('section', fakeDocument);
  const scene = makeSceneFactory();
  return { fakeDocument, fakeWindow, host, scene };
}

function makeControllerWithScene(scene) {
  const fakeDocument = new FakeDocument();
  const fakeWindow = makeFakeWindow();
  fakeDocument.defaultView = fakeWindow;
  const host = new FakeElement('section', fakeDocument);
  const controller = createPatternSceneController({
    createScene: scene.createScene,
    durations: { bloomIn: 1000 },
    easing: (t) => t,
    deps: {
      window: fakeWindow,
      now: () => fakeWindow.performance.now(),
      requestFrame: (callback) => fakeWindow.requestAnimationFrame(callback),
      cancelFrame: (id) => fakeWindow.cancelAnimationFrame(id)
    }
  });
  return { fakeDocument, fakeWindow, host, scene, controller };
}

function makeControllerFixture({ durations = { bloomIn: 1000 } } = {}) {
  const fixture = makeFixture();
  const controller = createPatternSceneController({
    createScene: fixture.scene.createScene,
    durations,
    easing: (t) => t,
    deps: {
      window: fixture.fakeWindow,
      now: () => fixture.fakeWindow.performance.now(),
      requestFrame: (callback) => fixture.fakeWindow.requestAnimationFrame(callback),
      cancelFrame: (id) => fixture.fakeWindow.cancelAnimationFrame(id)
    }
  });
  return { ...fixture, controller };
}

// ---- provider: render resource owner only -----------------------------------
{
  const { fakeWindow, host, scene } = makeFixture();
  const provider = createPatternSceneProvider({
    createScene: scene.createScene,
    deps: { window: fakeWindow },
    initialProgress: PATTERN_SOURCE_PROGRESS
  });

  await provider.mount({ host });
  const mounted = provider.getSnapshot();
  assert(mounted.mounted, 'provider mount() reports mounted');
  assert(mounted.ready, 'provider mount() waits for renderer readiness');
  assert(scene.startCount() === 1, 'provider starts one renderer');
  assert(scene.options[0]?.progressSource?.() === PATTERN_SOURCE_PROGRESS, 'renderer starts from source progress');
  assert(scene.options[0]?.scrollStage === null, 'renderer receives no scroll stage');
  assert(scene.options[0]?.center?.x === 0.28, 'pattern center stays on the main left-side position');
  assert(host.childElementCount === 1, 'mount() creates a single provider root');

  provider.setProgress(0.42);
  const controlled = provider.getSnapshot();
  assertClose(controlled.progress, 0.42, 'provider stores controlled progress');
  assertClose(scene.options[0].progressSource(), 0.42, 'renderer sees controlled progress');
  provider.requestRender();
  assert(scene.renderCount() > 0, 'provider requests renderer refreshes');
  assert(!('status' in controlled), 'provider snapshot has no public status');
  assert(!('mode' in controlled), 'provider snapshot has no public mode');
  assert(!('trace' in controlled), 'provider snapshot has no public trace');

  const destroyed = provider.destroy();
  assert(!destroyed.mounted, 'provider destroy() reports unmounted');
  assert(!destroyed.ready, 'provider destroy() reports not ready');
  assert(scene.destroyCount() === 1, 'provider tears down the renderer');
  assert(fakeWindow.listenerCount() === 0, 'provider removes owned listeners');
  assert(provider.getSnapshot().canvasWidth === 0, 'provider clears owned canvas');
}

// ---- provider/controller: destroy during mounting resolves cleanly -----------
{
  const scene = makeDelayedSceneFactory();
  const { fakeWindow, host, controller } = makeControllerWithScene(scene);
  const mount = controller.mount({ host });
  assert(controller.getState().phase === 'mounting', 'controller enters mounting before async scene readiness');
  const destroyed = controller.destroy();
  assert(destroyed.phase === 'destroyed', 'destroy() is accepted during mounting');
  scene.resolveStart();
  const mountResult = await mount;
  assert(mountResult.reason === 'destroyed', 'mount promise resolves destroyed after destroy during mounting');
  assert(fakeWindow.listenerCount() === 0, 'destroy during mounting removes provider listeners');
  assert(scene.destroyCount() === 1, 'destroy during mounting tears down delayed scene');
}

async function mountController(controller, host) {
  const result = await controller.mount({ host });
  assert(result.accepted && result.completed, 'controller mount() completes');
  assert(controller.getState().phase === 'source', 'controller mount() settles in source phase');
  assert(controller.getState().progress === PATTERN_SOURCE_PROGRESS, 'controller mount() lands on source progress');
}

// ---- controller: double play keeps latest run authoritative -----------------
{
  const { fakeWindow, host, controller } = makeControllerFixture();
  const phases = [];
  controller.subscribe((snapshot) => phases.push(snapshot.phase));
  await mountController(controller, host);

  const first = controller.playForward();
  await pump(fakeWindow, 250, 1);
  assertClose(controller.getState().progress, 0.25, 'first play reaches mid progress');

  const second = controller.playForward();
  const firstResult = await first;
  assert(firstResult.reason === 'superseded', 'first double-play run resolves superseded');

  await pump(fakeWindow, 250, 3);
  const secondResult = await second;
  assert(secondResult.accepted && secondResult.completed, 'second double-play run completes');
  assert(controller.getState().phase === 'final', 'double play settles in final phase');
  assert(controller.getState().progress === PATTERN_FINAL_PROGRESS, 'double play settles at final progress');
  assert(phases.filter((phase) => phase === 'final').length === 1, 'double play emits final once');
}

// ---- controller: play -> cancel -> play cannot be polluted by old resolution -
{
  const { fakeWindow, host, controller } = makeControllerFixture();
  await mountController(controller, host);

  const first = controller.playForward();
  await pump(fakeWindow, 250, 1);
  const cancelResult = controller.cancelToSource();
  assert(cancelResult.reason === 'cancelled', 'cancelToSource() returns cancelled reason');
  assert(controller.getState().phase === 'source', 'cancelToSource() lands in source phase');
  assert(controller.getState().progress === PATTERN_SOURCE_PROGRESS, 'cancelToSource() lands at source progress');

  const second = controller.playForward();
  const firstResult = await first;
  assert(firstResult.reason === 'superseded', 'cancelled play resolves superseded');

  await pump(fakeWindow, 250, 4);
  const secondResult = await second;
  assert(secondResult.completed, 'play after cancel completes');
  assert(controller.getState().phase === 'final', 'play after cancel owns final phase');
  assert(controller.getState().progress === PATTERN_FINAL_PROGRESS, 'play after cancel owns final progress');
}

// ---- controller: reverse uses partial ramp from the current progress ---------
{
  const { fakeWindow, host, controller } = makeControllerFixture();
  await mountController(controller, host);

  const play = controller.playForward();
  await pump(fakeWindow, 600, 1);
  assertClose(controller.getState().progress, 0.6, 'play reaches 0.6 before reverse');

  const reverse = controller.reverseToSource();
  const playResult = await play;
  assert(playResult.reason === 'superseded', 'play resolves superseded after reverse');

  await pump(fakeWindow, 300, 1);
  assertClose(controller.getState().progress, 0.3, 'reverse starts from current progress with scaled duration');
  await pump(fakeWindow, 300, 1);
  const reverseResult = await reverse;
  assert(reverseResult.completed, 'reverse completes');
  assert(controller.getState().phase === 'source', 'reverse settles in source phase');
  assert(controller.getState().progress === PATTERN_SOURCE_PROGRESS, 'reverse settles at source progress');
}

// ---- controller: reverse command is phase-gated -----------------------------
{
  const { fakeWindow, host, controller } = makeControllerFixture();
  await mountController(controller, host);

  const invalid = controller.reverseToSource();
  assert(invalid.accepted === false && invalid.reason === 'invalid_phase', 'source reverse is invalid');

  const showFinal = controller.showFinal();
  assert(showFinal.accepted && showFinal.completed, 'showFinal() is accepted from source');
  assert(controller.getState().phase === 'final', 'showFinal() lands in final');
  assert(controller.getState().progress === PATTERN_FINAL_PROGRESS, 'showFinal() lands at final progress');

  const reverse = controller.reverseToSource();
  await pump(fakeWindow, 250, 4);
  const reverseResult = await reverse;
  assert(reverseResult.completed, 'final reverse is accepted');
  assert(controller.getState().phase === 'source', 'final reverse settles in source');
}

// ---- controller: reverseToSource duration is independently configurable ------
{
  const { fakeWindow, host, controller } = makeControllerFixture({
    durations: { bloomIn: 8000, reverseToSource: 900 }
  });
  await mountController(controller, host);
  controller.showFinal();

  const reverse = controller.reverseToSource();
  await pump(fakeWindow, 900, 1);
  const reverseResult = await reverse;
  assert(reverseResult.completed, 'reverseToSource() honors its own duration');
  assert(controller.getState().phase === 'source', 'configured reverse settles in source');
  assert(controller.getState().progress === PATTERN_SOURCE_PROGRESS, 'configured reverse reaches source progress at 900ms');
}

// ---- controller: cancelToFinal is explicit and distinct from cancelToSource -
{
  const { fakeWindow, host, controller } = makeControllerFixture();
  await mountController(controller, host);

  const play = controller.playForward();
  await pump(fakeWindow, 250, 1);
  const cancelResult = controller.cancelToFinal();
  const playResult = await play;
  assert(cancelResult.reason === 'cancel_to_final', 'cancelToFinal() returns explicit reason');
  assert(playResult.reason === 'superseded', 'cancelToFinal() supersedes the old play run');
  assert(controller.getState().phase === 'final', 'cancelToFinal() lands in final phase');
  assert(controller.getState().progress === PATTERN_FINAL_PROGRESS, 'cancelToFinal() lands at final progress');
}

// ---- controller: abort leaves no running phase ------------------------------
{
  const { fakeWindow, host, controller } = makeControllerFixture();
  await mountController(controller, host);

  const abortController = new AbortController();
  const play = controller.playForward({ signal: abortController.signal });
  await pump(fakeWindow, 250, 1);
  abortController.abort();
  const playResult = await play;
  assert(playResult.reason === 'aborted', 'aborted play resolves aborted');
  assert(controller.getState().phase === 'source', 'aborted play returns to source phase');
  assert(controller.getState().progress === PATTERN_SOURCE_PROGRESS, 'aborted play returns to source progress');
  assert(fakeWindow.frameCount() === 0, 'aborted play clears driver frames');

  await controller.showFinal();
  const reverseAbortController = new AbortController();
  const reverse = controller.reverseToSource({ signal: reverseAbortController.signal });
  await pump(fakeWindow, 250, 1);
  reverseAbortController.abort();
  const reverseResult = await reverse;
  assert(reverseResult.reason === 'aborted', 'aborted reverse resolves aborted');
  assert(controller.getState().phase === 'final', 'aborted reverse returns to final phase');
  assert(controller.getState().progress === PATTERN_FINAL_PROGRESS, 'aborted reverse returns to final progress');
}

// ---- controller: destroy mid-play is one-shot and leaves no async residue ----
{
  const { fakeWindow, host, controller } = makeControllerFixture();
  const emitted = [];
  controller.subscribe((snapshot) => emitted.push(snapshot.phase));
  await mountController(controller, host);

  const play = controller.playForward();
  await pump(fakeWindow, 250, 1);
  const destroyed = controller.destroy();
  assert(destroyed.phase === 'destroyed', 'destroy() returns destroyed snapshot');
  const emitCountAfterDestroy = emitted.length;
  const playResult = await play;
  assert(['destroyed', 'superseded'].includes(playResult.reason), 'destroyed play resolves without completing');
  await pump(fakeWindow, 250, 4);
  assert(emitted.length === emitCountAfterDestroy, 'destroyed controller emits nothing after destroy');
  assert(fakeWindow.frameCount() === 0, 'destroy() clears driver animation frames');
  assert(fakeWindow.listenerCount() === 0, 'destroy() removes provider listeners');
  const afterDestroy = controller.playForward();
  assert(afterDestroy.accepted === false && afterDestroy.reason === 'destroyed', 'commands after destroy are rejected');
}

// ---- controller snapshot is the single public state source ------------------
{
  const { host, controller } = makeControllerFixture();
  await mountController(controller, host);
  const state = controller.getState();
  assert('phase' in state, 'snapshot exposes phase');
  assert(!('status' in state), 'snapshot has no player/provider status');
  assert(!('providerStatus' in state), 'snapshot has no providerStatus');
  assert(!('mode' in state), 'snapshot has no public mode');
  assert(!('trace' in state), 'snapshot has no public trace');
}

// ---- player facade: compatibility names delegate without owning state --------
{
  const { fakeWindow, host, scene } = makeFixture();
  const player = createPatternScenePlayer({
    createScene: scene.createScene,
    durations: { bloomIn: 1000 },
    easing: (t) => t,
    deps: {
      window: fakeWindow,
      now: () => fakeWindow.performance.now(),
      requestFrame: (callback) => fakeWindow.requestAnimationFrame(callback),
      cancelFrame: (id) => fakeWindow.cancelAnimationFrame(id)
    }
  });

  await player.mount({ host });
  assert(player.getState().phase === 'source', 'player mount() returns controller source phase');
  await player.showPoster({});
  assert(player.getState().phase === 'final', 'showPoster() compatibility lands in final');
  assert(player.getState().progress === PATTERN_FINAL_PROGRESS, 'showPoster() compatibility lands at final progress');
  const reversePoster = player.reverseToPoster({});
  assert(reversePoster.deprecated && reversePoster.reason === 'removed_ambiguous_poster', 'reverseToPoster() is explicitly removed');
  assert(typeof player.renderBloomProgress === 'undefined', 'player does not leak provider-only renderBloomProgress');
  assert(typeof player.playBloomIn === 'undefined', 'player does not leak provider-only playBloomIn');
  assert(!('providerStatus' in player.getState()), 'player snapshot has no providerStatus');

  const destroyState = player.destroy();
  const destroyAgainState = player.destroy();
  assert(destroyState.phase === 'destroyed', 'player destroy() returns destroyed controller snapshot');
  assert(destroyAgainState.phase === 'destroyed', 'player destroy() is idempotent');
  assert(fakeWindow.frameCount() === 0, 'player destroy() clears animation frames');
  assert(fakeWindow.listenerCount() === 0, 'player destroy() removes owned listeners');
}

console.log(`pattern-scene-harness: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
