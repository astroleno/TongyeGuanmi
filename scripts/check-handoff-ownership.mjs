import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  chapterTransitions,
  contentSections,
  handoffs,
  sectionEntryPolicies
} from '../src/section-manifest.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const packageJson = JSON.parse(read('package.json'));
const handoffPreviewSource = read('js/transitions/homepage/handoff-preview.js');
const handoffReceiverSource = read('js/transitions/homepage/handoff-receiver.js');
const aodHomepageAdapterSource = read('js/transitions/homepage/aod-homepage-adapter.js');
const figure2HomepageAdapterSource = read('js/transitions/homepage/figure2-homepage-adapter.js');
const craneHomepageAdapterSource = read('js/transitions/homepage/crane-homepage-adapter.js');
const figure3HomepageAdapterSource = read('js/transitions/homepage/figure3-homepage-adapter.js');
const patternBloomAdapterSource = read('js/transitions/pattern-bloom-adapter.js');

const sectionIds = new Set(['home', ...contentSections.map((section) => section.id)]);
const transitionIds = new Set(chapterTransitions.map((transition) => transition.id));
const allowedOwners = new Set(['target-section', 'shared-continuation', 'visual-bridge']);
const allowedPolicies = new Set(['replay', 'continue', 'skip']);
const allowedReducedMotion = new Set(['jump-to-presented', 'keep-visual-only']);

assert.ok(Array.isArray(handoffs), 'section-manifest.mjs must export handoffs');
assert.ok(handoffs.length >= 4, 'handoffs must cover home-belief, belief-method, method-proof-brand, and philosophy-contact');
assert.ok(sectionEntryPolicies && typeof sectionEntryPolicies === 'object', 'section-manifest.mjs must export sectionEntryPolicies');
assert.equal(
  packageJson.scripts['verify:handoff-ownership'],
  'node scripts/check-handoff-ownership.mjs',
  'package.json must expose verify:handoff-ownership'
);

for (const section of contentSections) {
  const policy = sectionEntryPolicies[section.id];
  assert.ok(policy, `Section ${section.id} must declare an entry policy`);
  assert.ok(allowedPolicies.has(policy.directVisit), `Section ${section.id} has invalid directVisit policy`);
  assert.ok(allowedPolicies.has(policy.afterHandoff), `Section ${section.id} has invalid afterHandoff policy`);
}

const ids = handoffs.map((handoff) => handoff.id);
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
assert.deepEqual([...new Set(duplicates)], [], `Handoff ids must be unique; duplicates: ${duplicates.join(', ')}`);

for (const handoff of handoffs) {
  assert.ok(handoff.id, 'Every handoff must have an id');
  assert.ok(sectionIds.has(handoff.from) || handoff.from.includes('-'), `Handoff ${handoff.id} has unknown from ${handoff.from}`);
  assert.ok(sectionIds.has(handoff.to), `Handoff ${handoff.id} has unknown to ${handoff.to}`);
  assert.ok(allowedOwners.has(handoff.owner), `Handoff ${handoff.id} has invalid owner ${handoff.owner}`);
  assert.ok(handoff.targetEntry, `Handoff ${handoff.id} must declare targetEntry`);
  assert.ok(allowedPolicies.has(handoff.targetEntry.policy), `Handoff ${handoff.id} has invalid targetEntry policy`);
  assert.equal(handoff.targetEntry.suppressOnceAfterHandoff, true, `Handoff ${handoff.id} must suppress target entry once`);
  assert.ok(handoff.afterComplete, `Handoff ${handoff.id} must declare afterComplete`);
  assert.equal(handoff.afterComplete.markTargetPresented, true, `Handoff ${handoff.id} must mark target presented`);
  assert.ok(handoff.afterComplete.scrollTo, `Handoff ${handoff.id} must declare afterComplete.scrollTo`);
  assert.equal(handoff.afterComplete.cleanupGhosts, true, `Handoff ${handoff.id} must clean up ghosts`);
  assert.ok(handoff.reducedMotion, `Handoff ${handoff.id} must declare reducedMotion`);
  assert.ok(allowedReducedMotion.has(handoff.reducedMotion.policy), `Handoff ${handoff.id} has invalid reduced-motion policy`);

  if (handoff.transitionId && transitionIds.has(handoff.transitionId)) {
    const transition = chapterTransitions.find((candidate) => candidate.id === handoff.transitionId);
    assert.equal(transition.from, handoff.from, `Handoff ${handoff.id} must match transition from`);
    assert.ok(
      transition.to === handoff.to || transition.handoffTarget === handoff.afterComplete.scrollTo,
      `Handoff ${handoff.id} must match transition to or handoff target`
    );
  }

  if ((handoff.transition?.targetSelector || handoff.transition?.ghostScenes?.length) && handoff.targetEntry.policy === 'replay') {
    throw new Error(`Handoff ${handoff.id} exposes target content but would replay target entry`);
  }
}

assert.doesNotMatch(
  `${handoffPreviewSource}\n${handoffReceiverSource}\n${aodHomepageAdapterSource}\n${figure2HomepageAdapterSource}\n${craneHomepageAdapterSource}`,
  /cloneNode\s*\(\s*true\s*\)/,
  'Homepage handoff code must not clone real target content'
);

assert.doesNotMatch(
  figure3HomepageAdapterSource,
  /SERVICE_TITLE|figure3-transition__service-copy|真正的 AI 转型/,
  'Figure3 homepage transition must not own Services presentation copy'
);

assert.doesNotMatch(
  patternBloomAdapterSource,
  /pattern-bloom-transition__copy|一句话讲清我们干什么|让 AI 从一场培训/,
  'Pattern Bloom transition must not own Belief presentation copy'
);

console.log('Homepage handoff ownership contract looks good.');
