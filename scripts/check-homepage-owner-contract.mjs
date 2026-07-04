#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { timelineJoins, timelineScenes } from '../js/transitions/homepage/scene-timeline-manifest.js';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const KNOWN_OWNER_VIOLATIONS = Object.freeze([
  {
    sceneId: 'method',
    selector: '.method-edition-layout--after-handoff',
    ownerIndex: 0,
    revealIndex: 0,
    revealClass: 'chapter-intro chapter-intro--method edition-vertical-lead reveal',
    removalTaskId: 'T2.2-reveal-owner-suppression'
  },
  {
    sceneId: 'method',
    selector: '.method-edition-layout--after-handoff',
    ownerIndex: 0,
    revealIndex: 1,
    revealClass: 'process-row edition-row reveal',
    removalTaskId: 'T2.2-reveal-owner-suppression'
  },
  {
    sceneId: 'method',
    selector: '.method-edition-layout--after-handoff',
    ownerIndex: 0,
    revealIndex: 2,
    revealClass: 'process-row edition-row reveal',
    removalTaskId: 'T2.2-reveal-owner-suppression'
  },
  {
    sceneId: 'method',
    selector: '.method-edition-layout--after-handoff',
    ownerIndex: 0,
    revealIndex: 3,
    revealClass: 'process-row edition-row reveal',
    removalTaskId: 'T2.2-reveal-owner-suppression'
  },
  {
    sceneId: 'method',
    selector: '.method-edition-layout--after-handoff',
    ownerIndex: 0,
    revealIndex: 4,
    revealClass: 'process-row edition-row reveal',
    removalTaskId: 'T2.2-reveal-owner-suppression'
  },
  {
    sceneId: 'method',
    selector: '.method-edition-layout--after-handoff',
    ownerIndex: 0,
    revealIndex: 5,
    revealClass: 'process-row edition-row reveal',
    removalTaskId: 'T2.2-reveal-owner-suppression'
  },
  {
    sceneId: 'brand',
    selector: '.brand-definition-grid',
    ownerIndex: 0,
    revealIndex: 0,
    revealClass: 'brand-definition-grid reveal',
    removalTaskId: 'T2.2-reveal-owner-suppression'
  },
  {
    sceneId: 'services',
    selector: '.enterprise-vertical-layout',
    ownerIndex: 0,
    revealIndex: 0,
    revealClass: 'enterprise-vertical-lead edition-vertical-lead reveal',
    removalTaskId: 'T2.2-reveal-owner-suppression'
  },
  {
    sceneId: 'services',
    selector: '.enterprise-vertical-layout',
    ownerIndex: 0,
    revealIndex: 1,
    revealClass: 'enterprise-capability-list edition-row-list reveal',
    removalTaskId: 'T2.2-reveal-owner-suppression'
  },
  {
    sceneId: 'lab',
    selector: '.scenario-wide-stage',
    ownerIndex: 0,
    revealIndex: 0,
    revealClass: 'scenario-wide-stage edition-wide-stage reveal',
    removalTaskId: 'T2.2-reveal-owner-suppression'
  },
  {
    sceneId: 'education',
    selector: '.education-wide-stage',
    ownerIndex: 0,
    revealIndex: 0,
    revealClass: 'education-wide-stage edition-wide-stage reveal',
    removalTaskId: 'T2.2-reveal-owner-suppression'
  },
  {
    sceneId: 'philosophy',
    selector: '.philosophy-list',
    ownerIndex: 0,
    revealIndex: 0,
    revealClass: 'scenario-list philosophy-list reveal',
    removalTaskId: 'T2.2-reveal-owner-suppression'
  },
  {
    sceneId: 'contact',
    selector: '.contact-endpoint',
    ownerIndex: 0,
    revealIndex: 0,
    revealClass: 'canvas-track contact-endpoint reveal',
    removalTaskId: 'T2.2-reveal-owner-suppression'
  }
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function assertRange(name, value) {
  assert.ok(Array.isArray(value), `${name} must be an array`);
  assert.equal(value.length, 2, `${name} must have exactly two entries`);
  assert.ok(value.every((entry) => Number.isFinite(entry)), `${name} entries must be finite numbers`);
  assert.ok(value[0] >= 0 && value[1] <= 1, `${name} must stay inside 0..1`);
  assert.ok(value[0] < value[1], `${name} must have start < end`);
}

function resolveTiming(join) {
  const presentAt = Number.isFinite(join.presentAt)
    ? join.presentAt
    : Math.max(join.commitAt || 0, asArray(join.targetIn)[1] || 0);
  const cleanupAt = Number.isFinite(join.cleanupAt) ? join.cleanupAt : presentAt;

  return {
    commitAt: Number.isFinite(join.commitAt) ? join.commitAt : presentAt,
    presentAt,
    cleanupAt
  };
}

function overlapKey(left, right) {
  return [left, right].sort().join('->');
}

function violationKey(violation) {
  return `${violation.sceneId}\0${violation.selector}\0${violation.ownerIndex}\0${violation.revealIndex}\0${violation.revealClass}`;
}

function parseAttributes(tag) {
  const attrs = new Map();
  const attrPattern = /\s([A-Za-z0-9:_-]+)(?:="([^"]*)")?/g;
  for (const match of tag.matchAll(attrPattern)) {
    attrs.set(match[1], match[2] ?? '');
  }
  return attrs;
}

function parseHtmlNodes(html) {
  const roots = [];
  const nodes = [];
  const stack = [];
  const tagPattern = /<\/?([A-Za-z][A-Za-z0-9:-]*)\b[^>]*>/g;
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

  for (const match of html.matchAll(tagPattern)) {
    const raw = match[0];
    const tag = match[1].toLowerCase();
    if (raw.startsWith('</')) {
      while (stack.length) {
        const node = stack.pop();
        node.end = match.index ?? node.index;
        if (node.tag === tag) break;
      }
      continue;
    }

    const node = {
      tag,
      raw,
      attrs: parseAttributes(raw),
      children: [],
      index: match.index ?? -1,
      end: html.length,
      parent: stack.at(-1) || null
    };

    if (node.parent) {
      node.parent.children.push(node);
    } else {
      roots.push(node);
    }
    nodes.push(node);

    if (!raw.endsWith('/>') && !voidTags.has(tag)) {
      stack.push(node);
    }
  }

  return { roots, nodes };
}

function classList(node) {
  return (node.attrs.get('class') || '').split(/\s+/).filter(Boolean);
}

function matchesSelector(node, selector) {
  if (selector.startsWith('.')) {
    return classList(node).includes(selector.slice(1));
  }

  if (selector.startsWith('#')) {
    return node.attrs.get('id') === selector.slice(1);
  }

  const attrMatch = selector.match(/^\[([A-Za-z0-9:_-]+)(?:="([^"]*)")?\]$/);
  if (attrMatch) {
    const [, name, value] = attrMatch;
    return value === undefined ? node.attrs.has(name) : node.attrs.get(name) === value;
  }

  return node.tag === selector.toLowerCase();
}

function descendantsOf(node) {
  return node.children.flatMap((child) => [child, ...descendantsOf(child)]);
}

function lineNumberFor(index) {
  return index < 0 ? 0 : indexHtml.slice(0, index).split('\n').length;
}

function assertPhaseIntervals(join) {
  if (join.phases == null) return;
  assert.equal(typeof join.phases, 'object', `${join.id}.phases must be an object`);
  assert.ok(!Array.isArray(join.phases), `${join.id}.phases must not be an array`);

  const phases = Object.entries(join.phases).map(([name, range]) => {
    assertRange(`${join.id}.phases.${name}`, range);
    return { name, start: range[0], end: range[1] };
  }).sort((left, right) => left.start - right.start);

  const phaseNames = new Set(phases.map((phase) => phase.name));
  const declaredOverlaps = new Set();
  for (const pair of asArray(join.handoffOverlaps)) {
    assert.ok(Array.isArray(pair), `${join.id}.handoffOverlaps entries must be arrays`);
    assert.equal(pair.length, 2, `${join.id}.handoffOverlaps entries must have two phase names`);
    assert.ok(phaseNames.has(pair[0]), `${join.id}.handoffOverlaps references unknown phase ${pair[0]}`);
    assert.ok(phaseNames.has(pair[1]), `${join.id}.handoffOverlaps references unknown phase ${pair[1]}`);
    declaredOverlaps.add(overlapKey(pair[0], pair[1]));
  }

  const actualOverlaps = new Set();
  for (let leftIndex = 0; leftIndex < phases.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < phases.length; rightIndex += 1) {
      const left = phases[leftIndex];
      const right = phases[rightIndex];
      if (Math.min(left.end, right.end) <= Math.max(left.start, right.start)) continue;
      const key = overlapKey(left.name, right.name);
      actualOverlaps.add(key);
      assert.ok(
        declaredOverlaps.has(key),
        `${join.id}.phases ${left.name}/${right.name} overlap must be declared in handoffOverlaps`
      );
    }
  }

  for (const key of declaredOverlaps) {
    assert.ok(actualOverlaps.has(key), `${join.id}.handoffOverlaps declares non-overlapping phases ${key}`);
  }
}

const sceneIds = new Set(timelineScenes.map((scene) => scene.id));
const joinIds = new Set();
const joinPairs = new Set();
const selectorOwners = new Map();
const timelineOwnedSelectors = [];
const parsedHtml = parseHtmlNodes(indexHtml);

for (const join of timelineJoins) {
  assert.ok(join.id, 'Each join must declare id');
  assert.ok(!joinIds.has(join.id), `Duplicate join id: ${join.id}`);
  joinIds.add(join.id);

  assert.ok(sceneIds.has(join.fromScene), `${join.id} must reference known fromScene ${join.fromScene}`);
  assert.ok(sceneIds.has(join.toScene), `${join.id} must reference known toScene ${join.toScene}`);
  assert.equal(typeof join.progressPolicy, 'string', `${join.id} must declare progressPolicy`);
  assert.ok(join.progressPolicy.length > 0, `${join.id} progressPolicy must not be empty`);

  const pairKey = `${join.fromScene}->${join.toScene}`;
  assert.ok(!joinPairs.has(pairKey), `Duplicate timeline join pair: ${pairKey}`);
  joinPairs.add(pairKey);

  const timing = resolveTiming(join);
  assert.ok(timing.commitAt <= timing.presentAt, `${join.id} must satisfy commitAt <= presentAt`);
  assert.ok(timing.presentAt <= timing.cleanupAt, `${join.id} must satisfy presentAt <= cleanupAt`);

  assertRange(`${join.id}.sourceOut`, join.sourceOut);
  assertRange(`${join.id}.targetIn`, join.targetIn);
  assertPhaseIntervals(join);
}

for (const scene of timelineScenes) {
  assert.ok(scene.id, 'Each timeline scene must declare id');

  for (const copy of asArray(scene.copySelectors)) {
    assert.ok(copy.selector, `${scene.id} copy selector must declare selector`);
    const existingOwner = selectorOwners.get(copy.selector);
    assert.ok(
      !existingOwner,
      `copy selector ${copy.selector} must have one owner; found ${existingOwner} and ${scene.id}`
    );
    selectorOwners.set(copy.selector, scene.id);

    if (copy.entryOwner === 'timeline') {
      timelineOwnedSelectors.push({
        sceneId: scene.id,
        selector: copy.selector
      });
    }
  }
}

console.log('timeline-owned copy selectors:');
for (const entry of timelineOwnedSelectors) {
  console.log(`  - ${entry.sceneId}: ${entry.selector}`);
}

const ownerViolations = [];
for (const entry of timelineOwnedSelectors) {
  const ownerNodes = parsedHtml.nodes.filter((node) => matchesSelector(node, entry.selector));
  assert.ok(ownerNodes.length >= 1, `${entry.sceneId} timeline-owned selector ${entry.selector} must resolve in index.html`);
  ownerNodes.forEach((ownerNode, ownerIndex) => {
    const revealNodes = [ownerNode, ...descendantsOf(ownerNode)]
      .filter((node) => classList(node).includes('reveal'));
    revealNodes.forEach((revealNode, revealIndex) => {
      ownerViolations.push({
        sceneId: entry.sceneId,
        selector: entry.selector,
        ownerIndex,
        revealIndex,
        revealClass: revealNode.attrs.get('class') || '',
        line: lineNumberFor(revealNode.index)
      });
    });
  });
}

const knownByKey = new Map(KNOWN_OWNER_VIOLATIONS.map((violation) => [violationKey(violation), violation]));
const actualKeys = new Set(ownerViolations.map(violationKey));
const newOwnerViolations = ownerViolations.filter((violation) => !knownByKey.has(violationKey(violation)));
const staleOwnerViolations = KNOWN_OWNER_VIOLATIONS.filter((violation) => !actualKeys.has(violationKey(violation)));

for (const violation of KNOWN_OWNER_VIOLATIONS) {
  assert.ok(violation.removalTaskId, `Known owner violation missing removalTaskId: ${violation.selector}`);
}

if (KNOWN_OWNER_VIOLATIONS.length > 0) {
  console.warn('homepage-owner-contract known reveal owner violations:');
  for (const violation of ownerViolations.filter((entry) => knownByKey.has(violationKey(entry)))) {
    const known = knownByKey.get(violationKey(violation));
    console.warn(`  - index.html:${violation.line} ${violation.sceneId} ${violation.revealClass} -> remove in ${known.removalTaskId}`);
  }
}

if (newOwnerViolations.length > 0) {
  console.error('\nNew timeline-owned reveal owner violations:');
  for (const violation of newOwnerViolations) {
    console.error(`  x index.html:${violation.line} ${violation.sceneId} ${violation.selector}`);
    console.error(`    ${violation.revealClass}`);
  }
}

if (staleOwnerViolations.length > 0) {
  console.error('\nStale KNOWN_OWNER_VIOLATIONS entries; remove them from the baseline:');
  for (const violation of staleOwnerViolations) {
    console.error(`  x ${violation.sceneId} ${violation.selector}: ${violation.revealClass}`);
  }
}

assert.equal(newOwnerViolations.length, 0, 'new timeline-owned reveal owner violations must fail');
assert.equal(staleOwnerViolations.length, 0, 'stale KNOWN_OWNER_VIOLATIONS entries must be removed');

console.log(`Homepage owner contract OK (${timelineJoins.length} joins, ${selectorOwners.size} copy selectors).`);
