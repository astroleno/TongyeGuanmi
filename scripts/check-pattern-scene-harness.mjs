#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLAYER_PATH = join(ROOT, 'js/scene-harness/pattern-scene-player.js');
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

const [playerSource, pageSource, rendererSource] = await Promise.all([
  readFile(PLAYER_PATH, 'utf8'),
  readFile(PAGE_PATH, 'utf8'),
  readFile(RENDERER_PATH, 'utf8')
]);

const timelineBloomInName = ['hero', 'to', 'pattern'].join('-');
const timelineExitName = ['pattern', 'to', 'star', 'map'].join('-');

for (const [label, source] of [
  ['pattern-scene-player.js', playerSource],
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
    [/\bplayForward\b/, 'uses scene-player timeline API instead of provider API'],
    [/\bcancelToSource\b/, 'uses upstream/downstream source language'],
    [/\bstar-?map\b/i, 'declares an external target scene']
  ];
  for (const [pattern, reason] of banned) {
    assert(!pattern.test(source), `${label} ${reason}`);
  }
}

assert(playerSource.includes('createPatternMirrorScene'), 'provider reuses the Canvas 2D pattern renderer');
assert(playerSource.includes('createPatternSceneProvider'), 'provider exports createPatternSceneProvider');
assert(playerSource.includes('mount'), 'provider exposes mount');
assert(playerSource.includes('showPoster'), 'provider exposes showPoster');
assert(playerSource.includes('renderBloomProgress'), 'provider exposes renderBloomProgress');
assert(playerSource.includes('playBloomIn'), 'provider exposes playBloomIn');
assert(playerSource.includes('playSteadyLoop'), 'provider exposes playSteadyLoop');
assert(playerSource.includes('playLeftRotatePreview'), 'provider exposes local left-rotate preview');
assert(playerSource.includes('cancelToPoster'), 'provider exposes cancelToPoster');
assert(playerSource.includes('reverseToPoster'), 'provider exposes reverseToPoster');
assert(playerSource.includes('destroy'), 'provider exposes destroy');
assert(playerSource.includes('getState'), 'provider exposes getState');
assert(playerSource.includes('progressSource: () => controlledProgress'), 'renderer is driven by controlled progress');
assert(playerSource.includes('scrollStage: null'), 'provider does not pass a scroll-driven stage');
assert(playerSource.includes('center: PATTERN_CENTER'), 'provider pins the main pattern center');
assert(playerSource.includes('PATTERN_POSTER_PROGRESS = 1'), 'poster progress is explicit');
assert(!/placeholder/i.test(playerSource + pageSource), 'no placeholder pattern visual');
assert(pageSource.includes('data-pattern-harness-host'), 'standalone page has a dedicated host');
assert(pageSource.includes('./js/scene-harness/pattern-scene-player.js'), 'standalone page imports the provider module');
assert(pageSource.includes('renderBloomProgress'), 'standalone page exposes controlled progress');
assert(pageSource.includes('playBloomIn'), 'standalone page exposes local bloom-in preview');

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

async function finishFrames(fakeWindow, ms = 1000, limit = 8) {
  for (let index = 0; index < limit; index += 1) {
    await microtasks(1);
    if (fakeWindow.frameCount() > 0) fakeWindow.flush(ms);
  }
}

const {
  createPatternSceneProvider,
  PATTERN_POSTER_PROGRESS
} = await import(pathToFileURL(PLAYER_PATH).href);

const fakeDocument = new FakeDocument();
const fakeWindow = makeFakeWindow();
fakeDocument.defaultView = fakeWindow;
const host = new FakeElement('section', fakeDocument);

let sceneStartCount = 0;
let sceneDestroyCount = 0;
let sceneRenderCount = 0;
const sceneOptions = [];
function fakeCreateScene(options) {
  sceneOptions.push(options);
  return {
    start: async () => {
      sceneStartCount += 1;
      options.canvas.width = 1280;
      options.canvas.height = 720;
    },
    requestRender: () => {
      sceneRenderCount += 1;
    },
    destroy: () => {
      sceneDestroyCount += 1;
    }
  };
}

const trace = [];
const provider = createPatternSceneProvider({
  createScene: fakeCreateScene,
  durations: {
    bloomIn: 1000,
    leftRotatePreview: 1000,
    reverseToPoster: 1000
  },
  deps: {
    window: fakeWindow,
    now: () => fakeWindow.performance.now(),
    requestFrame: (callback) => fakeWindow.requestAnimationFrame(callback),
    cancelFrame: (id) => fakeWindow.cancelAnimationFrame(id)
  }
});

await provider.mount({ host, onTrace: (entry) => trace.push(entry.status) });
assert(provider.getState().status === 'mounted', 'mount() reports mounted');
assert(provider.getState().ready, 'mount() waits for renderer readiness');
assert(sceneStartCount === 1, 'mount() starts one renderer');
assert(sceneOptions[0]?.progressSource?.() === PATTERN_POSTER_PROGRESS, 'renderer starts at explicit poster progress');
assert(sceneOptions[0]?.scrollStage === null, 'renderer receives no scroll stage');
assert(sceneOptions[0]?.center?.x === 0.28, 'pattern center stays on the main left-side position');
assert(host.childElementCount === 1, 'mount() creates a single provider root');

await provider.showPoster({});
assert(provider.getState().status === 'poster', 'showPoster() reports poster');
assert(provider.getState().progress === PATTERN_POSTER_PROGRESS, 'showPoster() uses poster progress');
assert(provider.getState().transientCount === 0, 'showPoster() has no transient layers');

provider.renderBloomProgress(0.58);
assert(provider.getState().status === 'bloom-progress', 'renderBloomProgress() reports controlled progress');
assert(Math.abs(provider.getState().progress - 0.58) < 0.0001, 'renderBloomProgress() stores external progress');
assert(Math.abs(sceneOptions[0].progressSource() - 0.58) < 0.0001, 'renderer sees external progress');

const bloomSamples = [];
const bloomPlay = provider.playBloomIn({
  onProgress: (progress) => bloomSamples.push(progress)
});
await finishFrames(fakeWindow, 1000);
const bloomResult = await bloomPlay;
assert(bloomResult.completed, 'playBloomIn() completes');
assert(provider.getState().status === 'stable', 'playBloomIn() settles stable');
assert(provider.getState().mode === 'steady-loop', 'playBloomIn() returns to steady-loop mode');
assert(provider.getState().progress === PATTERN_POSTER_PROGRESS, 'playBloomIn() reaches poster progress');
assert(bloomSamples.some((progress) => progress === PATTERN_POSTER_PROGRESS), 'playBloomIn() reports terminal progress');

const cancelPlay = provider.playBloomIn({});
await microtasks();
fakeWindow.flush(250);
const cancelResult = await provider.cancelToPoster({});
const cancelledPlayResult = await cancelPlay;
assert(cancelResult.reason === 'cancelled', 'cancelToPoster() returns cancelled reason');
assert(!cancelledPlayResult.completed, 'cancelToPoster() resolves active preview as incomplete');
assert(provider.getState().status === 'poster', 'cancelToPoster() reports poster');
assert(provider.getState().progress === PATTERN_POSTER_PROGRESS, 'cancelToPoster() restores poster progress');
assert(provider.getState().transientCount === 0, 'cancelToPoster() leaves no transient layers');

const leftPlay = provider.playLeftRotatePreview({});
await finishFrames(fakeWindow, 1000);
const leftResult = await leftPlay;
assert(leftResult.completed, 'playLeftRotatePreview() completes');
assert(provider.getState().status === 'left-rotate-preview', 'playLeftRotatePreview() uses provider-local status');
assert(provider.getState().mode === 'left-rotate-preview', 'playLeftRotatePreview() uses provider-local mode');
assert(provider.getState().progress === 0, 'playLeftRotatePreview() previews back to initial bloom progress');

const reversePlay = provider.reverseToPoster({});
await finishFrames(fakeWindow, 1000);
await reversePlay;
assert(provider.getState().status === 'poster', 'reverseToPoster() reports poster');
assert(provider.getState().progress === PATTERN_POSTER_PROGRESS, 'reverseToPoster() restores poster progress');

await provider.playSteadyLoop({});
assert(provider.getState().status === 'steady-loop', 'playSteadyLoop() reports steady loop');
assert(provider.getState().progress === PATTERN_POSTER_PROGRESS, 'playSteadyLoop() holds poster progress');

provider.destroy();
assert(provider.getState().status === 'destroyed', 'destroy() reports destroyed');
assert(sceneDestroyCount === sceneStartCount, 'destroy() tears down the renderer');
assert(fakeWindow.frameCount() === 0, 'destroy() clears animation frames');
assert(fakeWindow.listenerCount() === 0, 'destroy() removes owned listeners');
assert(provider.getState().canvasWidth === 0, 'destroy() clears owned canvas');
assert(trace.includes('mounted') && trace.includes('poster') && trace.includes('bloom-in') && trace.includes('stable') && trace.includes('destroyed'), 'trace includes provider lifecycle states');
assert(sceneRenderCount > 0, 'provider requests renderer refreshes');

console.log(`pattern-scene-harness: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
