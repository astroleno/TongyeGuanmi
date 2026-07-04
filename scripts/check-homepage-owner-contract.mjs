#!/usr/bin/env node

import assert from 'node:assert/strict';
import { timelineJoins, timelineScenes } from '../js/transitions/homepage/scene-timeline-manifest.js';

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

const sceneIds = new Set(timelineScenes.map((scene) => scene.id));
const joinIds = new Set();
const joinPairs = new Set();
const selectorOwners = new Map();
const timelineOwnedSelectors = [];

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

console.log(`Homepage owner contract OK (${timelineJoins.length} joins, ${selectorOwners.size} copy selectors).`);
