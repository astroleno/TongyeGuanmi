#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createMvpInkTransitionPlayer } from '../js/scene-runtime/MvpInkTransitionPlayer.js';
import { createSceneRuntimeDomShell } from '../js/scene-runtime/SceneRuntimeDomShell.js';
import { DOM_SHELL_SCENE_IDS } from '../js/scene-runtime/SceneRuntimeSceneIds.js';
import { createSceneRuntimeMvpVisualRegistry } from '../js/scene-runtime/SceneRuntimeMvpVisualRegistry.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFileSync(path.join(rootDir, relativePath), 'utf8');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function dataNameToProperty(name) {
  return name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function dataPropertyToName(name) {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function parseSelector(selector) {
  const dataMatch = selector.match(/^\[data-([a-z0-9-]+)(?:="([^"]*)")?\]$/);
  if (dataMatch) {
    return { kind: 'data', prop: dataNameToProperty(dataMatch[1]), value: dataMatch[2] ?? null };
  }
  const idMatch = selector.match(/^#([a-zA-Z0-9_-]+)$/);
  if (idMatch) return { kind: 'id', value: idMatch[1] };
  const classMatch = selector.match(/^\.([a-zA-Z0-9_-]+)$/);
  if (classMatch) return { kind: 'class', value: classMatch[1] };
  throw new Error(`Unsupported fake selector: ${selector}`);
}

class FakeClassList {
  constructor(element) {
    this.element = element;
    this.values = new Set();
  }

  add(...names) {
    names.forEach((name) => this.values.add(name));
    this.element.className = [...this.values].join(' ');
  }

  remove(...names) {
    names.forEach((name) => this.values.delete(name));
    this.element.className = [...this.values].join(' ');
  }

  contains(name) {
    return this.values.has(name);
  }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.children = [];
    this.attributes = new Map();
    this.dataset = {};
    this.hidden = false;
    this.className = '';
    this.classList = new FakeClassList(this);
    this.textContent = '';
    this.style = {};
    this.listeners = new Map();
    this.scrollTop = 0;
    this.scrollHeight = 1000;
    this.clientHeight = 1000;
  }

  setAttribute(name, value = '') {
    const text = String(value);
    this.attributes.set(name, text);
    if (name === 'id') this.id = text;
    if (name === 'class') {
      this.className = text;
      this.classList.values = new Set(text.split(/\s+/).filter(Boolean));
    }
    if (name.startsWith('data-')) this.dataset[dataNameToProperty(name.slice(5))] = text;
  }

  getAttribute(name) {
    if (this.attributes.has(name)) return this.attributes.get(name);
    if (name === 'id') return this.id || null;
    if (name === 'class') return this.className || null;
    if (name.startsWith('data-')) {
      const value = this.dataset[dataNameToProperty(name.slice(5))];
      return value === undefined ? null : String(value);
    }
    return null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === 'id') this.id = '';
    if (name.startsWith('data-')) delete this.dataset[dataNameToProperty(name.slice(5))];
  }

  appendChild(child) {
    if (child.parentNode) child.remove();
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  append(...nodes) {
    nodes.forEach((node) => this.appendChild(node));
  }

  replaceChildren(...nodes) {
    this.children.forEach((child) => {
      child.parentNode = null;
    });
    this.children = [];
    nodes.forEach((node) => this.appendChild(node));
  }

  remove() {
    if (!this.parentNode) return;
    const siblings = this.parentNode.children;
    const index = siblings.indexOf(this);
    if (index >= 0) siblings.splice(index, 1);
    this.parentNode = null;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  getBoundingClientRect() {
    return {
      left: 0,
      top: 0,
      right: 1280,
      bottom: 720,
      width: 1280,
      height: 720
    };
  }

  getContext() {
    return null;
  }

  cloneNode(deep = false) {
    const clone = new FakeElement(this.tagName, this.ownerDocument);
    for (const [name, value] of this.attributes.entries()) clone.setAttribute(name, value);
    clone.hidden = this.hidden;
    clone.textContent = this.textContent;
    if (deep) this.children.forEach((child) => clone.appendChild(child.cloneNode(true)));
    return clone;
  }

  matches(selector) {
    const parsed = parseSelector(selector);
    if (parsed.kind === 'id') return this.id === parsed.value;
    if (parsed.kind === 'class') return this.classList.contains(parsed.value);
    const value = this.dataset[parsed.prop];
    if (parsed.value === null) return value !== undefined;
    return String(value ?? '') === parsed.value;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const results = [];
    const visit = (element) => {
      for (const child of element.children) {
        if (child.matches(selector)) results.push(child);
        visit(child);
      }
    };
    visit(this);
    return results;
  }

  get outerHTML() {
    const attrs = [
      ...[...this.attributes.entries()].map(([name, value]) => `${name}="${value}"`),
      ...Object.entries(this.dataset)
        .filter(([prop]) => !this.attributes.has(`data-${dataPropertyToName(prop)}`))
        .map(([prop, value]) => `data-${dataPropertyToName(prop)}="${value}"`)
    ].join(' ');
    const body = `${this.textContent}${this.children.map((child) => child.outerHTML).join('')}`;
    return `<${this.tagName.toLowerCase()}${attrs ? ` ${attrs}` : ''}>${body}</${this.tagName.toLowerCase()}>`;
  }
}

class FakeDocument {
  constructor() {
    this.defaultView = {
      performance: { now: () => Date.now() },
      requestAnimationFrame: (callback) => setTimeout(() => callback(Date.now()), 8),
      cancelAnimationFrame: (id) => clearTimeout(id),
      setTimeout,
      clearTimeout,
      addEventListener() {},
      removeEventListener() {},
      innerWidth: 1280,
      innerHeight: 720,
      devicePixelRatio: 1
    };
    this.documentElement = new FakeElement('html', this);
    this.head = new FakeElement('head', this);
    this.body = new FakeElement('body', this);
    this.listeners = new Map();
    this.readyState = 'complete';
    this.documentElement.append(this.head, this.body);
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  querySelector(selector) {
    if (this.documentElement.matches(selector)) return this.documentElement;
    return this.documentElement.querySelector(selector);
  }

  querySelectorAll(selector) {
    const results = [];
    if (this.documentElement.matches(selector)) results.push(this.documentElement);
    return results.concat(this.documentElement.querySelectorAll(selector));
  }
}

function installPrebuiltDomShell(documentRef) {
  const root = documentRef.createElement('div');
  root.setAttribute('data-scene-runtime-shell', '');
  root.setAttribute('data-scene-runtime-artifact', 'true');
  documentRef.body.appendChild(root);

  const source = documentRef.createElement('div');
  source.setAttribute('data-runtime-layer', 'source');
  root.appendChild(source);

  for (const sceneId of DOM_SHELL_SCENE_IDS) {
    const host = documentRef.createElement('section');
    host.setAttribute('data-scene-id', sceneId);
    host.setAttribute('data-scene-visible', 'false');
    host.setAttribute('data-scene-role', 'hidden');
    host.setAttribute('aria-hidden', 'true');
    host.hidden = true;
    source.appendChild(host);
  }

  for (const layerId of ['target', 'transition', 'early-copy', 'debug']) {
    const layer = documentRef.createElement('div');
    layer.setAttribute('data-runtime-layer', layerId);
    root.appendChild(layer);
  }

  return root;
}

function visibleScenes(documentRef) {
  return documentRef.querySelectorAll('[data-scene-id]')
    .filter((host) => host.getAttribute('data-scene-visible') === 'true')
    .map((host) => host.getAttribute('data-scene-id'));
}

function assertOnlyVisible(documentRef, expected, message) {
  assert.deepEqual(visibleScenes(documentRef), expected, message);
}

function sceneHost(documentRef, sceneId) {
  const host = documentRef.querySelector(`[data-scene-id="${sceneId}"]`);
  assert(host, `scene host exists: ${sceneId}`);
  return host;
}

class SpyScenePlayer {
  constructor({
    sceneId,
    playDelayMs = 18,
    milestone = null,
    rejectPlay = false,
    rejectAfterMilestone = false
  } = {}) {
    this.sceneId = sceneId;
    this.playDelayMs = playDelayMs;
    this.milestone = milestone;
    this.rejectPlay = rejectPlay;
    this.rejectAfterMilestone = rejectAfterMilestone;
    this.calls = [];
    this.phase = 'idle';
  }

  remember(methodName, signal) {
    assert(signal instanceof AbortSignal, `${this.sceneId}.${methodName} receives AbortSignal`);
    this.calls.push(methodName);
  }

  async mount({ host, signal } = {}) {
    this.remember('mount', signal);
    this.host = host;
    this.phase = 'mounted';
    host.dataset.spyScene = this.sceneId;
    return { completed: true };
  }

  async showPoster({ signal } = {}) {
    this.remember('showPoster', signal);
    this.phase = 'poster';
    return { completed: true };
  }

  playForward({ signal, onTrace, onProgress } = {}) {
    this.remember('playForward', signal);
    this.phase = 'playing-forward';
    onTrace?.({ type: 'playing-forward', sceneId: this.sceneId });
    if (this.rejectPlay) return Promise.reject(new Error(`${this.sceneId} rejected`));
    return new Promise((resolve, reject) => {
      let settled = false;
      const timers = [];
      const finish = (value) => {
        if (settled) return;
        settled = true;
        timers.forEach(clearTimeout);
        resolve(value);
      };
      const fail = (error) => {
        if (settled) return;
        settled = true;
        timers.forEach(clearTimeout);
        reject(error);
      };
      signal?.addEventListener('abort', () => {
        this.phase = 'poster';
        finish({ completed: false, cancelled: true, reason: 'aborted' });
      }, { once: true });
      if (this.milestone) {
        timers.push(setTimeout(() => {
          onProgress?.(0.8);
          onTrace?.({ type: 'milestone', milestone: this.milestone, progress: 0.8 });
          if (this.rejectAfterMilestone) fail(new Error(`${this.sceneId} rejected after milestone`));
        }, Math.max(1, Math.floor(this.playDelayMs * 0.55))));
      }
      timers.push(setTimeout(() => {
        this.phase = 'stable';
        onProgress?.(1);
        onTrace?.({ type: 'complete', sceneId: this.sceneId });
        onTrace?.({ type: 'stable', sceneId: this.sceneId });
        finish({ completed: true });
      }, this.playDelayMs));
    });
  }

  async cancelToSource({ signal } = {}) {
    this.remember('cancelToSource', signal);
    this.phase = 'poster';
    return { completed: false, cancelled: true };
  }

  async reverseToPoster({ signal } = {}) {
    this.remember('reverseToPoster', signal);
    this.phase = 'poster';
    return { completed: true };
  }

  async destroy({ signal } = {}) {
    this.remember('destroy', signal);
    this.phase = 'destroyed';
    return this.getState();
  }

  getState() {
    return {
      phase: this.phase,
      calls: this.calls.slice()
    };
  }
}

function createSpyShell(options = {}) {
  const documentRef = new FakeDocument();
  installPrebuiltDomShell(documentRef);
  const playerOptions = options.playerOptions || {};
  const { registry, instances } = createSceneRuntimeMvpVisualRegistry({
    playerFactories: {
      hero: () => new SpyScenePlayer({ sceneId: 'hero', ...(playerOptions.hero || {}) }),
      pattern: () => new SpyScenePlayer({ sceneId: 'pattern', ...(playerOptions.pattern || {}) }),
      'star-map': () => new SpyScenePlayer({ sceneId: 'star-map', ...(playerOptions['star-map'] || {}) }),
      'aod-animation': () => new SpyScenePlayer({
        sceneId: 'aod-animation',
        milestone: 'early-copy-ready',
        playDelayMs: 34,
        ...(playerOptions['aod-animation'] || {})
      })
    }
  });
  const transitionLayer = documentRef.querySelector('[data-runtime-layer="transition"]');
  const shell = createSceneRuntimeDomShell({
    documentRef,
    registry,
    transitionPlayer: createMvpInkTransitionPlayer({
      layer: transitionLayer,
      defaultDurationMs: options.transitionDurationMs ?? 24,
      behavior: options.transitionBehavior || {}
    }),
    stableScenePlayers: ['hero', 'pattern', 'star-map'],
    timeouts: {
      transition: 140,
      scene: 140
    },
    clock: { now: () => 0 }
  });
  return { documentRef, shell, instances };
}

async function assertBuildAndEntryContracts() {
  execFileSync(process.execPath, ['scripts/build-index.mjs'], { cwd: rootDir, stdio: 'pipe' });
  const defaultHtml = read('index.html');
  assert(!defaultHtml.includes('data-scene-runtime-shell'), 'default build does not emit runtime shell');
  assert(defaultHtml.includes('src="js/main.js"'), 'default build keeps legacy homepage entry');

  execFileSync(process.execPath, ['scripts/build-index.mjs', '--scene-runtime'], { cwd: rootDir, stdio: 'pipe' });
  const runtimeHtml = read('index.html');
  assert(runtimeHtml.includes('data-scene-runtime-shell'), 'scene-runtime build emits DOM shell');
  assert(runtimeHtml.includes('data-scene-runtime-dom-shell-entry'), 'scene-runtime build loads DOM shell entry');
  assert(!runtimeHtml.includes('src="js/main.js"'), 'scene-runtime build does not load legacy homepage entry');
  assert.equal((runtimeHtml.match(/data-scene-role="hidden"/g) || []).length, 16, 'scene-runtime build emits 16 runtime scene hosts');

  const entry = read('js/scene-runtime/scene-runtime-dom-entry.js');
  assert(entry.includes('createSceneRuntimeMvpVisualRegistry'), 'entry uses MVP visual registry');
  assert(entry.includes('createMvpInkTransitionPlayer'), 'entry uses MVP ink transition player');
  assert(entry.includes('stableScenePlayers'), 'entry delegates stable scene playback to RuntimeCore');
  assert(!entry.includes('createFakeDomSceneRegistry'), 'entry does not use fake provider registry');
  assert(!entry.includes('createFakeDomTransitionPlayer'), 'entry does not use fake transition player');

  const shellSource = read('js/scene-runtime/SceneRuntimeDomShell.js');
  assert(!shellSource.includes('playStableScenes'), 'DOM shell does not own stable scene playback');
  assert(!shellSource.includes('queueStableScenePlayback'), 'DOM shell has no side-channel stable playback queue');

  const registry = read('js/scene-runtime/SceneRuntimeMvpVisualRegistry.js');
  for (const realImport of [
    'hero-scene-player.js',
    'pattern-scene-player.js',
    'starmap-scene-player.js',
    'aod-scene-player.js'
  ]) {
    assert(registry.includes(realImport), `MVP registry imports ${realImport}`);
  }

  execFileSync(process.execPath, ['scripts/build-index.mjs'], { cwd: rootDir, stdio: 'pipe' });
}

async function assertHappyPathWithVisualRegistry() {
  const { documentRef, shell, instances } = createSpyShell();
  await shell.start('hero');
  await wait(28);
  assert(instances.get('hero').calls.includes('mount'), 'hero provider mount called');
  assert(instances.get('hero').calls.includes('showPoster'), 'hero provider showPoster called');
  assert(instances.get('hero').calls.includes('playForward'), 'hero provider playForward called');
  assert(shell.runtime.snapshot().trace.some((entry) => entry.type === 'stable-scene-play-start' && entry.sceneId === 'hero'), 'RuntimeCore owns hero stable playback');
  assertOnlyVisible(documentRef, ['hero'], 'initial scene is hero');

  const heroRun = shell.advance();
  await wait(4);
  assert(documentRef.querySelector('[data-mvp-ink-transition]'), 'center transition owns ink canvas while playing');
  assert.equal(sceneHost(documentRef, 'pattern').getAttribute('data-scene-visible'), 'false', 'pattern is not stable-visible during transition');
  await heroRun;
  assertOnlyVisible(documentRef, ['pattern'], 'center transition presents pattern after ended');
  await wait(28);
  assert(instances.get('pattern').calls.includes('mount'), 'pattern provider mount called');
  assert(instances.get('pattern').calls.includes('showPoster'), 'pattern provider showPoster called');
  assert(instances.get('pattern').calls.includes('playForward'), 'pattern provider playForward called');
  assert(shell.runtime.snapshot().trace.some((entry) => entry.type === 'stable-scene-play-start' && entry.sceneId === 'pattern'), 'RuntimeCore owns pattern stable playback');

  const patternRun = shell.advance();
  await wait(4);
  assert(documentRef.querySelector('[data-mvp-ink-transition]'), 'left rotate transition owns ink canvas while playing');
  assert.equal(sceneHost(documentRef, 'star-map').getAttribute('data-scene-visible'), 'false', 'star-map is not stable-visible during transition');
  await patternRun;
  assertOnlyVisible(documentRef, ['star-map'], 'left rotate transition presents star-map after ended');
  await wait(28);
  assert(instances.get('star-map').calls.includes('mount'), 'star-map provider mount called');
  assert(instances.get('star-map').calls.includes('showPoster'), 'star-map provider showPoster called');
  assert(instances.get('star-map').calls.includes('playForward'), 'star-map provider playForward called');
  assert(shell.runtime.snapshot().trace.some((entry) => entry.type === 'stable-scene-play-start' && entry.sceneId === 'star-map'), 'RuntimeCore owns star-map stable playback');

  await shell.advance();
  assertOnlyVisible(documentRef, ['aod-animation'], 'bottom-to-top transition presents aod after ended');
  assert(instances.get('aod-animation').calls.includes('mount'), 'AOD provider mount called');
  assert(instances.get('aod-animation').calls.includes('showPoster'), 'AOD provider showPoster called');

  const aodRun = shell.advance();
  await wait(22);
  assert.deepEqual(visibleScenes(documentRef).sort(), ['aod-animation', 'method-top'].sort(), 'AOD 80% milestone reveals method-top early copy');
  assert(documentRef.querySelector('[data-reveal-scene-id="method-top"]'), 'early-copy layer shows method-top reveal marker');
  await aodRun;
  assert(instances.get('aod-animation').calls.includes('playForward'), 'AOD provider playForward called by scene-play route');
  assertOnlyVisible(documentRef, ['method-top'], 'AOD ended commits method-top');
  assert.equal(documentRef.querySelectorAll('[data-reveal-scene-id]').length, 0, 'AOD commit clears early copy');

  const methodTopHost = sceneHost(documentRef, 'method-top');
  methodTopHost.scrollTop = 0;
  methodTopHost.scrollHeight = 1200;
  methodTopHost.clientHeight = 700;

  let readResult = await shell.handleWheelEvent({ deltaY: 200 });
  assert.equal(readResult.type, 'reading', 'method-top wheel scrolls readable content first');
  assert.equal(methodTopHost.scrollTop, 200, 'method-top host consumes wheel delta as scrollTop');
  assertOnlyVisible(documentRef, ['method-top'], 'method-top remains stable while reading content');

  readResult = await shell.handleWheelEvent({ deltaY: 300 });
  assert.equal(readResult.type, 'reading', 'reaching DOM bottom alone does not advance');
  assert.equal(methodTopHost.scrollTop, 500, 'method-top host reaches DOM bottom');

  readResult = await shell.handleWheelEvent({ deltaY: 50 });
  assert.equal(readResult.type, 'reading', 'under 10vh after bottom does not advance');

  readResult = await shell.handleWheelEvent({ deltaY: 60 });
  assert.equal(readResult.type, 'next', 'method-top reading boundary advances after bottom plus 10vh');
  assertOnlyVisible(documentRef, ['method-bottom'], 'reading boundary commits method-bottom');
  await shell.advance();
  assertOnlyVisible(documentRef, ['method-bottom'], 'method-bottom transition-only path remains stable');
}

async function assertTransitionPlayerSegments() {
  for (const segmentId of ['center-ink-expand', 'left-rotate-bloom', 'bottom-to-top-ink']) {
    const documentRef = new FakeDocument();
    const layer = documentRef.createElement('div');
    layer.setAttribute('data-runtime-layer', 'transition');
    documentRef.body.appendChild(layer);
    const player = createMvpInkTransitionPlayer({ layer, defaultDurationMs: 24 });
    const pending = player.play({ segmentId, from: 'from-scene', to: 'to-scene', attemptId: 1, epoch: 1 });
    await wait(4);
    assert(layer.querySelector('[data-mvp-ink-transition]'), `${segmentId} renders ink canvas while playing`);
    await pending;
    assert.equal(layer.querySelectorAll('[data-mvp-ink-transition]').length, 0, `${segmentId} clears transition layer after ended`);
  }

  const documentRef = new FakeDocument();
  const layer = documentRef.createElement('div');
  documentRef.body.appendChild(layer);
  const controller = new AbortController();
  const player = createMvpInkTransitionPlayer({ layer, defaultDurationMs: 80 });
  const pending = player.play({
    segmentId: 'bottom-to-top-ink',
    from: 'star-map',
    to: 'aod-animation',
    attemptId: 1,
    epoch: 1,
    signal: controller.signal
  });
  await wait(4);
  controller.abort(new Error('abort-test'));
  await assert.rejects(() => pending, /abort-test/, 'transition abort rejects');
  assert.equal(layer.querySelectorAll('[data-mvp-ink-transition]').length, 0, 'transition abort clears layer');
}

async function assertFailureAndRecovery() {
  {
    const { documentRef, shell } = createSpyShell({
      playerOptions: {
        'aod-animation': {
          rejectAfterMilestone: true
        }
      }
    });
    await shell.start('aod-animation');
    await assert.rejects(() => shell.advance(), /rejected after milestone/, 'AOD reject propagates');
    assertOnlyVisible(documentRef, ['aod-animation'], 'provider reject restores source');
    assert.equal(documentRef.querySelectorAll('[data-reveal-scene-id]').length, 0, 'provider reject clears early copy');
  }

  {
    const { documentRef, shell } = createSpyShell({
      transitionBehavior: {
        'center-ink-expand': {
          reject: true,
          rejectMessage: 'visual transition failed'
        }
      }
    });
    await shell.start('hero');
    await assert.rejects(() => shell.advance(), /visual transition failed/, 'transition reject propagates');
    assertOnlyVisible(documentRef, ['hero'], 'transition reject restores source');
    assert.equal(documentRef.querySelectorAll('[data-mvp-ink-transition]').length, 0, 'transition reject clears layer');
  }

  {
    const { documentRef, shell } = createSpyShell({ transitionDurationMs: 80 });
    await shell.start('hero');
    const pending = shell.advance();
    await wait(5);
    const oldAttempt = shell.runtime.activeAttempt;
    await shell.reverse('reverse-test');
    await assert.rejects(() => pending, /reverse-test|aborted/, 'reverse during transition rejects pending play');
    assertOnlyVisible(documentRef, ['hero'], 'reverse during transition restores source');
    shell.runtime.handleSceneTrace(oldAttempt, {
      type: 'milestone',
      milestone: 'early-copy-ready',
      progress: 0.8
    });
    shell.applyProjection('stale-callback');
    assertOnlyVisible(documentRef, ['hero'], 'stale callback cannot mutate visible DOM');
    assert.equal(documentRef.querySelectorAll('[data-reveal-scene-id]').length, 0, 'stale callback cannot reveal early copy');
  }

  {
    const { shell } = createSpyShell();
    shell.mount();
    shell.runtime.ownership.claim('transition', 'owner-a');
    assert.throws(
      () => shell.runtime.ownership.claim('transition', 'owner-b'),
      /already owned/,
      'layer conflict fails'
    );
  }
}

function assertForbiddenSideEffects() {
  const files = [
    'js/scene-runtime/MvpInkTransitionPlayer.js',
    'js/scene-runtime/SceneRuntimeMvpVisualRegistry.js',
    'js/scene-runtime/scene-runtime-dom-entry.js',
    'js/scene-runtime/SceneRuntimeDomShell.js'
  ];
  const forbidden = [
    'scrollY',
    'window.scrollTo',
    'location.hash',
    'currentSceneId'
  ];
  for (const file of files) {
    const source = read(file);
    for (const pattern of forbidden) {
      assert(!source.includes(pattern), `${file} must not include ${pattern}`);
    }
  }
}

await assertBuildAndEntryContracts();
await assertTransitionPlayerSegments();
await assertHappyPathWithVisualRegistry();
await assertFailureAndRecovery();
assertForbiddenSideEffects();

console.log('SceneRuntime MVP visual checks passed');
