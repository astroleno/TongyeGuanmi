#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SceneRuntimeDomShell } from '../js/scene-runtime/SceneRuntimeDomShell.js';
import { createFakeDomSceneRegistry } from '../js/scene-runtime/FakeDomSceneProvider.js';
import { createFakeDomTransitionPlayer } from '../js/scene-runtime/FakeDomTransitionPlayer.js';
import { DOM_SHELL_SCENE_IDS } from '../js/scene-runtime/SceneRuntimeSceneIds.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFileSync(path.join(rootDir, relativePath), 'utf8');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function dataNameToProperty(name) {
  return name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function dataPropertyToName(name) {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function parseDataSelector(selector) {
  const match = selector.match(/^\[data-([a-z0-9-]+)(?:="([^"]*)")?\]$/);
  if (!match) throw new Error(`Unsupported fake selector: ${selector}`);
  return {
    attr: `data-${match[1]}`,
    prop: dataNameToProperty(match[1]),
    value: match[2] ?? null
  };
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
    this.textContent = '';
    this.scrollTop = 0;
    this.scrollHeight = 1000;
    this.clientHeight = 1000;
    this.listeners = new Map();
  }

  setAttribute(name, value = '') {
    const text = String(value);
    this.attributes.set(name, text);
    if (name.startsWith('data-')) {
      this.dataset[dataNameToProperty(name.slice('data-'.length))] = text;
    }
    if (name === 'class') this.className = text;
  }

  getAttribute(name) {
    if (this.attributes.has(name)) return this.attributes.get(name);
    if (name.startsWith('data-')) {
      const value = this.dataset[dataNameToProperty(name.slice('data-'.length))];
      return value === undefined ? null : String(value);
    }
    return null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name.startsWith('data-')) delete this.dataset[dataNameToProperty(name.slice('data-'.length))];
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

  matches(selector) {
    const parsed = parseDataSelector(selector);
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
    this.documentElement = new FakeElement('html', this);
    this.head = new FakeElement('head', this);
    this.body = new FakeElement('body', this);
    this.readyState = 'complete';
    this.listeners = new Map();
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
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

function createShell(options = {}) {
  const documentRef = new FakeDocument();
  installPrebuiltDomShell(documentRef);
  const clock = options.clock || { now: () => 0 };
  const { registry } = createFakeDomSceneRegistry({
    'aod-animation': {
      playDelayMs: 60
    },
    ...(options.providerOverrides || {})
  });
  const shell = new SceneRuntimeDomShell({
    documentRef,
    registry,
    transitionPlayer: createFakeDomTransitionPlayer({
      defaultDurationMs: 28,
      defaultTimeoutMs: 100,
      ...(options.transition || {})
    }),
    timeouts: {
      transition: 100,
      scene: 180,
      ...(options.timeouts || {})
    },
    failureCooldownMs: options.failureCooldownMs ?? 420,
    clock
  });
  return { documentRef, shell };
}

function sceneHost(documentRef, sceneId) {
  const host = documentRef.querySelector(`[data-scene-id="${sceneId}"]`);
  assert(host, `scene host exists: ${sceneId}`);
  return host;
}

function visibleScenes(documentRef) {
  return documentRef.querySelectorAll('[data-scene-id]')
    .filter((host) => host.getAttribute('data-scene-visible') === 'true')
    .map((host) => host.getAttribute('data-scene-id'));
}

function assertOnlyVisible(documentRef, expected, message) {
  assert.deepEqual(visibleScenes(documentRef), expected, message);
}

function assertNoReveal(documentRef, message) {
  assert.equal(documentRef.querySelectorAll('[data-reveal-scene-id]').length, 0, message);
}

async function assertFlaggedBuild() {
  assert.equal(SceneRuntimeDomShell.isEnabledFromUrl('http://localhost:8082/'), false, 'default URL does not enable shell');
  assert.equal(SceneRuntimeDomShell.isEnabledFromUrl('http://localhost:8082/?sceneRuntime=1'), true, 'sceneRuntime=1 enables shell');
  assert.equal(SceneRuntimeDomShell.isEnabledFromUrl('http://localhost:8082/?scene-runtime=1'), true, 'scene-runtime=1 enables shell');

  execFileSync(process.execPath, ['scripts/build-index.mjs'], { cwd: rootDir, stdio: 'pipe' });
  const defaultHtml = read('index.html');
  assert(!defaultHtml.includes('data-scene-runtime-dom-shell-entry'), 'default build does not inject DOM shell entry');
  assert(!defaultHtml.includes('data-scene-runtime-shell'), 'default build does not emit runtime shell hosts');
  assert(defaultHtml.includes('src="js/main.js"'), 'default build keeps homepage main entry');

  execFileSync(process.execPath, ['scripts/build-index.mjs', '--scene-runtime'], { cwd: rootDir, stdio: 'pipe' });
  const flaggedHtml = read('index.html');
  assert(flaggedHtml.includes('data-scene-runtime-dom-shell-entry'), 'scene-runtime build injects gated DOM shell entry');
  assert(!flaggedHtml.includes('src="js/main.js"'), 'scene-runtime build does not load legacy homepage main entry');
  assert(flaggedHtml.includes('data-scene-runtime-shell'), 'scene-runtime build emits runtime shell root');
  assert(flaggedHtml.includes('data-scene-runtime-legacy-disabled'), 'scene-runtime build disables legacy homepage content');
  assert.equal((flaggedHtml.match(/data-scene-role="hidden"/g) || []).length, 16, 'scene-runtime build emits 16 static runtime scene hosts');
  for (const sceneId of ['hero', 'pattern', 'star-map', 'aod-animation', 'method-top', 'method-bottom']) {
    assert(flaggedHtml.includes(`data-scene-id="${sceneId}"`), `scene-runtime build emits MVP host: ${sceneId}`);
  }
  for (const layerId of ['source', 'target', 'transition', 'early-copy', 'debug']) {
    assert(flaggedHtml.includes(`data-runtime-layer="${layerId}"`), `scene-runtime build emits layer: ${layerId}`);
  }

  execFileSync(process.execPath, ['scripts/build-index.mjs'], { cwd: rootDir, stdio: 'pipe' });
}

async function assertHostsAndLayers() {
  const { documentRef, shell } = createShell();
  shell.mount();

  assert(documentRef.querySelector('[data-scene-runtime-shell]'), 'shell root exists');
  for (const layerId of ['source', 'target', 'transition', 'early-copy', 'debug']) {
    assert(documentRef.querySelector(`[data-runtime-layer="${layerId}"]`), `layer exists: ${layerId}`);
  }

  const hosts = documentRef.querySelectorAll('[data-scene-id]');
  assert.equal(hosts.length, 16, 'shell reserves 16 top-level scene hosts');
  for (const sceneId of ['hero', 'pattern', 'star-map', 'aod-animation', 'method-top', 'method-bottom']) {
    assert(sceneHost(documentRef, sceneId), `MVP route host exists: ${sceneId}`);
  }
}

async function assertInputBridgeCoverage() {
  const { documentRef, shell } = createShell();
  await shell.start('hero');

  for (const type of ['wheel', 'touchstart', 'touchmove', 'touchend', 'click']) {
    assert(documentRef.listeners.get(type)?.size > 0, `input bridge binds ${type}`);
  }

  let navResult = shell.requestNavigationIntent('#method');
  assert.equal(navResult.type, 'deferred', 'nav target that is not next route is deferred');
  assert.equal(navResult.targetSceneId, 'method-top', 'method hash resolves to method-top target');
  assert.equal(shell.runtime.current(), 'hero', 'deferred nav does not present target');

  await shell.start('aod-animation');
  navResult = shell.requestNavigationIntent('#method');
  assert.equal(navResult.type, 'armed', 'nav target matching next route arms runtime');
  assert.equal(shell.runtime.current(), 'aod-animation', 'armed nav does not directly present target');
  await shell.runArmed();
  assert.equal(shell.runtime.current(), 'method-top', 'armed nav advances through runtime');

  await shell.start('method-top');
  const touchStart = { touches: [{ clientY: 200 }] };
  shell.handleTouchStart(touchStart);
  sceneHost(documentRef, 'method-top').scrollTop = 500;
  sceneHost(documentRef, 'method-top').scrollHeight = 1200;
  sceneHost(documentRef, 'method-top').clientHeight = 700;
  const touchResult = await shell.handleTouchMove({ touches: [{ clientY: 90 }] });
  assert.equal(touchResult.type, 'next', 'touch movement enters ReadMonitor on reading scene');
  assert.equal(shell.runtime.current(), 'method-bottom', 'touch reading input advances through runtime');
}

async function assertHappyPathDomProjection() {
  const { documentRef, shell } = createShell();
  await shell.start('hero');
  assertOnlyVisible(documentRef, ['hero'], 'initial projection shows only hero');

  const heroRun = shell.advance();
  await wait(1);
  assert(documentRef.querySelector('[data-fake-transition]'), 'transition layer renders marker while playing');
  assert.equal(sceneHost(documentRef, 'pattern').getAttribute('data-scene-visible'), 'false', 'target is not stable-visible during transition');
  await heroRun;
  assertOnlyVisible(documentRef, ['pattern'], 'hero transition commits pattern');
  assertNoReveal(documentRef, 'no reveal after transition commit');

  await shell.advance();
  assertOnlyVisible(documentRef, ['star-map'], 'pattern transition commits star-map');

  await shell.advance();
  assertOnlyVisible(documentRef, ['aod-animation'], 'star-map transition commits aod');

  const aodRun = shell.advance();
  await wait(50);
  assert.deepEqual(visibleScenes(documentRef).sort(), ['aod-animation', 'method-top'].sort(), 'aod milestone shows source and early copy');
  assert(documentRef.querySelector('[data-reveal-scene-id="method-top"]'), 'early-copy layer has method-top reveal marker');
  await aodRun;
  assertOnlyVisible(documentRef, ['method-top'], 'aod complete commits method-top');
  assertNoReveal(documentRef, 'aod commit clears early-copy layer');

  let readResult = await shell.handleReadInput({
    scrollTop: 200,
    scrollHeight: 1200,
    clientHeight: 700,
    deltaY: 500
  });
  assert.equal(readResult.type, 'reading', 'read monitor holds before DOM bottom');
  assertOnlyVisible(documentRef, ['method-top'], 'method-top remains visible before reading boundary');

  readResult = await shell.handleReadInput({
    scrollTop: 500,
    scrollHeight: 1200,
    clientHeight: 700,
    deltaY: 50
  });
  assert.equal(readResult.type, 'reading', 'under 10vh after bottom does not advance');
  assertOnlyVisible(documentRef, ['method-top'], 'method-top remains visible under 10vh after bottom');

  readResult = await shell.handleReadInput({
    scrollTop: 500,
    scrollHeight: 1200,
    clientHeight: 700,
    deltaY: 60
  });
  assert.equal(readResult.type, 'next', 'read monitor advances after additional 10vh');
  assertOnlyVisible(documentRef, ['method-bottom'], 'reading boundary commits method-bottom');

  await shell.advance();
  assertOnlyVisible(documentRef, ['method-bottom'], 'method-bottom transition-only path keeps current stable scene');
}

async function assertScenePlayFailureRollback() {
  const { documentRef, shell } = createShell({
    providerOverrides: {
      'aod-animation': {
        rejectAfterMilestone: true
      }
    }
  });
  await shell.start('aod-animation');
  await assert.rejects(() => shell.advance(), /rejected after milestone/, 'aod failure propagates');
  assertOnlyVisible(documentRef, ['aod-animation'], 'aod failure restores source scene');
  assertNoReveal(documentRef, 'aod failure clears early-copy layer');
  assert.equal(sceneHost(documentRef, 'method-top').getAttribute('data-scene-visible'), 'false', 'failed target is hidden');
}

async function assertTransitionFailureRollback() {
  const { documentRef, shell } = createShell({
    transition: {
      behavior: {
        'center-ink-expand': {
          reject: true,
          rejectMessage: 'center failed'
        }
      }
    }
  });
  await shell.start('hero');
  await assert.rejects(() => shell.advance(), /center failed/, 'transition failure propagates');
  assertOnlyVisible(documentRef, ['hero'], 'transition failure keeps source visible');
  assert.equal(sceneHost(documentRef, 'pattern').getAttribute('data-scene-visible'), 'false', 'failed transition target stays hidden');
  assert.equal(documentRef.querySelectorAll('[data-fake-transition]').length, 0, 'transition layer clears after failure');
}

async function assertReverseDuringTransition() {
  const { documentRef, shell } = createShell({
    transition: {
      defaultDurationMs: 80
    }
  });
  await shell.start('hero');
  const pending = shell.advance();
  await wait(5);
  await shell.reverse('test-reverse');
  await assert.rejects(() => pending, /test-reverse|aborted/, 'pending transition rejects after reverse');
  assertOnlyVisible(documentRef, ['hero'], 'reverse restores source scene');
  assert.equal(documentRef.querySelectorAll('[data-fake-transition]').length, 0, 'reverse clears transition layer');
}

async function assertStaleCallbackCannotProject() {
  const { documentRef, shell } = createShell({
    transition: {
      defaultDurationMs: 80
    }
  });
  await shell.start('hero');
  const pending = shell.advance();
  await wait(5);
  const oldAttempt = shell.runtime.activeAttempt;
  await shell.reverse('stale-test');
  await assert.rejects(() => pending, /stale-test|aborted/, 'pending run rejects after stale-test reverse');
  shell.runtime.handleSceneTrace(oldAttempt, {
    type: 'milestone',
    milestone: 'early-copy-ready',
    progress: 0.8
  });
  shell.applyProjection('stale-callback');
  assertOnlyVisible(documentRef, ['hero'], 'stale milestone cannot change visible DOM');
  assertNoReveal(documentRef, 'stale milestone cannot create reveal DOM');
}

async function assertFailureCooldownSuppressesResidualInput() {
  const { documentRef, shell } = createShell({
    transition: {
      behavior: {
        'center-ink-expand': {
          reject: true,
          rejectMessage: 'cooldown trigger'
        }
      }
    }
  });
  await shell.start('hero');
  await assert.rejects(() => shell.advance(), /cooldown trigger/, 'failure registers cooldown');
  const result = await shell.handleWheel({ type: 'wheel', deltaY: 160, at: 10 });
  assert.equal(result.type, 'retry-suppressed', 'residual wheel is suppressed during failure cooldown');
  assert.equal(shell.runtime.snapshot().activeAttempt, null, 'cooldown does not open a new attempt');
  assertOnlyVisible(documentRef, ['hero'], 'cooldown suppression keeps source DOM');
}

function assertLayerConflictFails() {
  const { shell } = createShell();
  shell.mount();
  shell.runtime.ownership.claim('transition', 'owner-a');
  assert.throws(
    () => shell.runtime.ownership.claim('transition', 'owner-b'),
    /already owned/,
    'layer ownership rejects conflicting owner'
  );
}

function assertNoForbiddenSideEffects() {
  const files = [
    'js/scene-runtime/SceneRuntimeDomShell.js',
    'js/scene-runtime/FakeDomSceneProvider.js',
    'js/scene-runtime/FakeDomTransitionPlayer.js',
    'js/scene-runtime/scene-runtime-dom-entry.js'
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
  assert(!read('js/main.js').includes('SceneRuntimeDomShell'), 'production main entry does not import DOM shell');
}

await assertFlaggedBuild();
await assertHostsAndLayers();
await assertInputBridgeCoverage();
await assertHappyPathDomProjection();
await assertScenePlayFailureRollback();
await assertTransitionFailureRollback();
await assertReverseDuringTransition();
await assertStaleCallbackCannotProject();
await assertFailureCooldownSuppressesResidualInput();
assertLayerConflictFails();
assertNoForbiddenSideEffects();

console.log('SceneRuntime DOM shell contract checks passed');
