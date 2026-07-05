#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createSceneTimelineController } from '../js/transitions/homepage/scene-timeline-controller.js';

class FakeClassList {
  constructor(initial = []) {
    this.classes = new Set(initial);
  }

  add(...names) {
    names.filter(Boolean).forEach((name) => this.classes.add(name));
  }

  remove(...names) {
    names.filter(Boolean).forEach((name) => this.classes.delete(name));
  }

  contains(name) {
    return this.classes.has(name);
  }

  toString() {
    return [...this.classes].join(' ');
  }
}

class FakeStyle {
  constructor() {
    this.values = new Map();
  }

  setProperty(name, value) {
    this.values.set(name, String(value));
  }

  removeProperty(name) {
    this.values.delete(name);
  }

  getPropertyValue(name) {
    return this.values.get(name) || '';
  }
}

function datasetKey(name) {
  return name.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

class FakeElement {
  constructor({ tag = 'div', id = '', classes = [], dataset = {}, rect = null } = {}) {
    this.tagName = tag.toUpperCase();
    this.id = id;
    this.children = [];
    this.parentNode = null;
    this.ownerDocument = null;
    this.attributes = new Map();
    this.dataset = { ...dataset };
    this.classList = new FakeClassList(classes);
    this.style = new FakeStyle();
    this.rect = rect || { top: 0, bottom: 900 };

    if (id) this.attributes.set('id', id);
    if (classes.length) this.attributes.set('class', classes.join(' '));
    Object.entries(dataset).forEach(([key, value]) => {
      const attr = key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
      this.attributes.set(`data-${attr}`, String(value));
    });
  }

  append(child) {
    child.parentNode = this;
    child.ownerDocument = this.ownerDocument || (this.defaultView ? this : null);
    this.children.push(child);
    child.children.forEach((grandchild) => {
      grandchild.ownerDocument = child.ownerDocument;
    });
  }

  setAttribute(name, value) {
    const stringValue = String(value);
    this.attributes.set(name, stringValue);
    if (name === 'id') this.id = stringValue;
    if (name === 'class') this.classList = new FakeClassList(stringValue.split(/\s+/).filter(Boolean));
    if (name.startsWith('data-')) this.dataset[datasetKey(name)] = stringValue;
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name.startsWith('data-')) delete this.dataset[datasetKey(name)];
  }

  matches(selector) {
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    const attrMatch = selector.match(/^\[([A-Za-z0-9:_-]+)(?:="([^"]*)")?\]$/);
    if (attrMatch) {
      const [, name, value] = attrMatch;
      return value === undefined ? this.hasAttribute(name) : this.getAttribute(name) === value;
    }
    return this.tagName.toLowerCase() === selector.toLowerCase();
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (node) => {
      node.children.forEach((child) => {
        if (child.matches(selector)) matches.push(child);
        visit(child);
      });
    };
    visit(this);
    return matches;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  getElementById(id) {
    if (this.id === id) return this;
    for (const child of this.children) {
      const match = child.getElementById(id);
      if (match) return match;
    }
    return null;
  }

  getBoundingClientRect() {
    return this.rect;
  }
}

class FakeDocument extends FakeElement {
  constructor() {
    super({ tag: 'document' });
    this.events = [];
    this.defaultView = {
      CustomEvent: class CustomEvent {
        constructor(type, init = {}) {
          this.type = type;
          this.detail = init.detail || {};
        }
      },
      innerHeight: 1000,
      gsap: null,
      ScrollTrigger: null,
      requestAnimationFrame: (callback) => callback(0)
    };
    this.documentElement = new FakeElement({ tag: 'html' });
    this.documentElement.ownerDocument = this;
    this.append(this.documentElement);
  }

  dispatchEvent(event) {
    this.events.push(event);
    return true;
  }
}

function addSection(document, { id, copyClass }) {
  const section = new FakeElement({
    tag: 'section',
    id,
    dataset: { sectionId: id },
    rect: { top: 100, bottom: 900 }
  });
  const copy = new FakeElement({
    tag: 'div',
    classes: [copyClass, 'reveal'],
    dataset: {
      sceneCopy: id,
      sceneTarget: id,
      entryOwner: 'timeline',
      entryState: 'pending'
    }
  });
  section.ownerDocument = document;
  copy.ownerDocument = document;
  section.append(copy);
  document.documentElement.append(section);
  return { section, copy };
}

function createDom() {
  const document = new FakeDocument();
  const sections = {
    belief: addSection(document, { id: 'belief', copyClass: 'belief-copy-wrap' }),
    method: addSection(document, { id: 'method', copyClass: 'method-edition-layout--after-handoff' }),
    brand: addSection(document, { id: 'brand', copyClass: 'brand-definition-grid' }),
    contact: addSection(document, { id: 'contact', copyClass: 'contact-endpoint' })
  };
  return { document, sections };
}

function withFakeGlobals(document, callback) {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  globalThis.window = document.defaultView;
  globalThis.document = document;
  try {
    return callback();
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }
}

{
  const { document, sections } = createDom();
  withFakeGlobals(document, () => {
    const timeline = createSceneTimelineController({ root: document });
    const firstFrame = timeline.presentTarget('home-belief', 'unit-present');
    const secondFrame = timeline.presentTarget('home-belief', 'unit-present-again');

    assert.equal(firstFrame, secondFrame, 'presentTarget must be idempotent for one join');
    assert.equal(
      document.events.filter((event) => event.type === 'scene-timeline:presented').length,
      1,
      'presentTarget must dispatch one presented event'
    );
    assert.equal(sections.belief.section.getAttribute('data-scene-state'), 'presented', 'target section is presented');
    assert.equal(sections.belief.section.getAttribute('data-section-handoff-state'), 'presented', 'handoff state is presented');
    assert.equal(sections.belief.copy.getAttribute('data-entry-state'), 'presented', 'copy is marked presented');
    assert.ok(sections.belief.copy.classList.contains('is-visible'), 'copy reveal is claimed visible');
    assert.ok(Object.isFrozen(timeline.getFrame('home-belief')), 'getFrame must return a frozen frame');

    const shallowReverseFrame = timeline.updateFrame('home-belief', 0.99, { reason: 'unit-scroll-shallow-reverse' });
    assert.equal(shallowReverseFrame.phase, 'released', 'scroll-driven shallow rollback past cleanup releases the presented join');
    assert.equal(shallowReverseFrame.copyOwner, 'native', 'released presented scroll join keeps native ownership');
    assert.equal(
      document.events.filter((event) => event.type === 'scene-timeline:presented' && event.detail.joinId === 'home-belief').length,
      1,
      'scroll-driven shallow rollback must not dispatch a second presented event'
    );

    const reverseScrollFrame = timeline.updateFrame('home-belief', 0.4, { reason: 'unit-scroll-reverse' });
    assert.equal(reverseScrollFrame.phase, 'playing', 'scroll-driven progress rollback reopens presented joins');
    assert.equal(reverseScrollFrame.direction, -1, 'scroll-driven progress rollback infers reverse direction');
    assert.equal(reverseScrollFrame.progress, 0.4, 'scroll-driven reverse update advances to the requested progress');
    assert.notEqual(reverseScrollFrame, firstFrame, 'scroll-driven reverse update must not return the terminal presented frame');

    const forwardScrollFrame = timeline.updateFrame('home-belief', 0.5, { reason: 'unit-scroll-forward-again' });
    assert.equal(forwardScrollFrame.phase, 'playing', 'scroll-driven forward replay can advance after rollback');
    assert.equal(forwardScrollFrame.direction, 1, 'scroll-driven forward replay infers forward direction');
    assert.equal(forwardScrollFrame.progress, 0.5, 'scroll-driven forward replay advances to the requested progress');
    assert.notEqual(forwardScrollFrame, reverseScrollFrame, 'scroll-driven forward replay must not return the reverse frame');
  });
}

{
  const { document, sections } = createDom();
  withFakeGlobals(document, () => {
    const timeline = createSceneTimelineController({ root: document });
    timeline.beginJoin('belief-method', { direction: 1 });
    timeline.updateFrame('belief-method', 0.84, {
      reason: 'unit-midframe',
      milestones: { targetReady: true }
    });
    assert.equal(sections.method.copy.getAttribute('data-timeline-fixed'), 'true', 'mid-playback copy is fixed');

    const presentedFrame = timeline.presentTarget('belief-method', 'unit-present');
    assert.equal(sections.method.copy.hasAttribute('data-timeline-fixed'), false, 'present clears fixed copy');
    assert.equal(
      document.documentElement.classList.contains('homepage-timeline-target-active'),
      false,
      'present clears root fixed-copy class'
    );
    assert.equal(sections.method.copy.getAttribute('data-entry-state'), 'presented', 'present claims copy');
    assert.equal(presentedFrame.phase, 'presented', 'present returns a presented frame');
    assert.equal(presentedFrame.sourceOpacity, 0, 'forced present recomputes terminal source opacity');
    assert.equal(presentedFrame.targetOpacity, 1, 'forced present recomputes terminal target opacity');

    const lateUpdateFrame = timeline.updateFrame('belief-method', 0.84, { reason: 'unit-late-update' });
    const repeatedPresentFrame = timeline.presentTarget('belief-method', 'unit-present-again');
    assert.equal(lateUpdateFrame, presentedFrame, 'late adapter updates must not rewrite a presented join frame');
    assert.equal(repeatedPresentFrame, presentedFrame, 'presentTarget stays idempotent after late adapter updates');
    assert.equal(timeline.getFrame('belief-method').phase, 'presented', 'presented join frame remains authoritative');
    assert.equal(sections.method.copy.hasAttribute('data-timeline-fixed'), false, 'late update must not restore fixed copy');
    assert.equal(
      document.events.filter((event) => event.type === 'scene-timeline:presented' && event.detail.joinId === 'belief-method').length,
      1,
      'late update and repeated present must not dispatch a second presented event'
    );

    timeline.beginJoin('belief-method', { direction: -1, reason: 'unit-reverse' });
    const reverseFrame = timeline.updateFrame('belief-method', 0.84, {
      reason: 'unit-reverse-update',
      milestones: { targetReady: true }
    });
    assert.notEqual(reverseFrame.phase, 'presented', 'explicit reverse lifecycle allows updates after present');
    assert.equal(reverseFrame.direction, -1, 'adapter updates inherit reverse direction from beginJoin');

    const releasedFrame = timeline.cleanupJoin('belief-method', 'unit-reverse-complete');
    const staleAfterReleaseFrame = timeline.updateFrame('belief-method', 0.84, { reason: 'unit-stale-after-release' });
    assert.equal(releasedFrame.phase, 'released', 'reverse cleanup releases the join');
    assert.equal(staleAfterReleaseFrame, releasedFrame, 'cleanup resets reverse direction so stale updates stay blocked');

    timeline.beginJoin('belief-method', { direction: 1, reason: 'unit-forward-replay' });
    const replayFrame = timeline.updateFrame('belief-method', 0.84, {
      reason: 'unit-forward-replay-update',
      milestones: { targetReady: true }
    });
    assert.notEqual(replayFrame.phase, 'released', 'forward replay after reverse cleanup can advance again');
    assert.equal(replayFrame.direction, 1, 'forward replay restores forward direction');
    assert.equal(sections.method.copy.getAttribute('data-timeline-fixed'), 'true', 'forward replay can restore fixed copy');
  });
}

{
  const { document, sections } = createDom();
  withFakeGlobals(document, () => {
    const timeline = createSceneTimelineController({ root: document });
    const originalWarn = console.warn;
    let warned = false;
    console.warn = () => {
      warned = true;
    };
    try {
      timeline.beginJoin('belief-method', { direction: 1 });
      timeline.updateFrame('belief-method', 0.84, {
        reason: 'unit-midframe',
        milestones: { targetReady: true }
      });
      timeline.beginJoin('method-proof-brand', { direction: 1 });
    } finally {
      console.warn = originalWarn;
    }

    assert.ok(warned, 'beginJoin must warn when it cleans an unreleased active join');
    assert.equal(sections.method.copy.hasAttribute('data-timeline-fixed'), false, 'beginJoin switch cleans previous fixed copy');
    assert.equal(timeline.getFrame('belief-method').phase, 'released', 'beginJoin switch releases previous frame');
  });
}

{
  const { document, sections } = createDom();
  withFakeGlobals(document, () => {
    const timeline = createSceneTimelineController({ root: document });
    const host = new FakeElement({
      dataset: { transitionId: 'belief-method' }
    });
    const context = timeline.createAdapterContext(host);
    timeline.beginJoin('belief-method', { direction: 1, reason: 'unit-runtime-owned' });
    const frame = context.update(0.96, {
      reason: 'unit-adapter-update',
      milestones: { targetReady: true }
    });

    assert.equal(frame.phase, 'committed', 'early adapter updates wait for runtime present even after presentAt');
    assert.equal(frame.copyOwner, 'timeline-fixed', 'early adapter updates keep fixed copy until runtime present');
    assert.equal(sections.method.copy.getAttribute('data-timeline-fixed'), 'true', 'early adapter update keeps fixed DOM copy');
    assert.equal(
      document.events.filter((event) => event.type === 'scene-timeline:presented' && event.detail.joinId === 'belief-method').length,
      0,
      'early adapter update must not dispatch present before runtime complete'
    );

    const completedFrame = context.complete('unit-runtime-complete');
    assert.equal(completedFrame.phase, 'presented', 'runtime complete presents early-copy target');
    assert.equal(sections.method.copy.hasAttribute('data-timeline-fixed'), false, 'runtime complete clears fixed copy');
    assert.equal(sections.method.copy.getAttribute('data-entry-state'), 'presented', 'runtime complete claims native copy');
    assert.equal(sections.method.copy.hasAttribute('data-entry-count'), false, 'runtime complete must not count a second reveal entry');
    assert.equal(
      document.events.filter((event) => event.type === 'scene-timeline:presented' && event.detail.joinId === 'belief-method').length,
      1,
      'runtime complete dispatches one present event for early-copy target'
    );
  });
}

{
  const { document, sections } = createDom();
  withFakeGlobals(document, () => {
    const timeline = createSceneTimelineController({ root: document });
    timeline.beginJoin('method-proof-brand', { direction: 1 });
    const frame = timeline.updateFrame('method-proof-brand', 0.84, {
      reason: 'unit-terminal-copy',
      milestones: { targetReady: true }
    });

    assert.equal(frame.copyOwner, 'hidden', 'terminal-only joins must not claim timeline fixed copy mid-playback');
    assert.equal(sections.brand.copy.hasAttribute('data-timeline-fixed'), false, 'terminal-only target copy is not fixed early');
    assert.equal(sections.brand.copy.getAttribute('data-entry-state'), 'pending', 'terminal-only target copy stays pending before runtime present');
  });
}

{
  const { document, sections } = createDom();
  withFakeGlobals(document, () => {
    const timeline = createSceneTimelineController({ root: document });
    const frame = timeline.presentTarget('philosophy-contact', 'unit-direct');

    assert.equal(frame.phase, 'presented', 'presentTarget without prior frame presents target');
    assert.equal(sections.contact.copy.getAttribute('data-entry-state'), 'presented', 'direct present claims target copy');
    assert.equal(
      document.events.filter((event) => event.type === 'scene-timeline:presented')[0]?.detail.joinId,
      'philosophy-contact',
      'presented event includes join id'
    );
  });
}

console.log('SceneTimeline controller contract OK.');
