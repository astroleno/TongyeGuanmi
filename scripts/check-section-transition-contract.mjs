import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chapterTransitions, contentSections, executableTransitionModules } from '../src/section-manifest.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const indexHtml = read('index.html');
const templateHtml = read('src/index.template.html');
const navHtml = read('src/partials/nav.html');
const revealJs = read('js/ui/reveal.js');
const canvasCss = read('css/sections/canvas-stage.css');
const packageJson = JSON.parse(read('package.json'));

function assertIncludes(source, needle, message) {
  assert.ok(source.includes(needle), message);
}

function assertUnique(values, label) {
  const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
  assert.equal(
    duplicates.length,
    0,
    `${label} must be unique; duplicates: ${[...new Set(duplicates)].join(', ')}`
  );
}

function assertNoStaleTransitionIds(source, label) {
  assert.doesNotMatch(
    source,
    /data-transition(?:-id)?="(?:enterprise-scenario|education-contact)"/,
    `${label} must not contain stale transition ids`
  );
}

function parseAttributes(tag) {
  const attrs = new Map();
  const attrPattern = /\s([A-Za-z0-9:_-]+)(?:="([^"]*)")?/g;
  for (const match of tag.matchAll(attrPattern)) {
    attrs.set(match[1], match[2] ?? '');
  }
  return attrs;
}

const sectionTags = [...indexHtml.matchAll(/<section\b[^>]*>/g)]
  .map((match) => ({ tag: match[0], index: match.index ?? -1, attrs: parseAttributes(match[0]) }));

const transitionTags = [...indexHtml.matchAll(/<div\b[^>]*>/g)]
  .map((match) => ({ tag: match[0], index: match.index ?? -1, attrs: parseAttributes(match[0]) }))
  .filter((node) => (node.attrs.get('class') || '').split(/\s+/).includes('chapter-transition'));

const manifestSectionIds = contentSections.map((section) => section.id);
const generatedSectionTags = sectionTags.filter((node) => node.attrs.has('data-section-id'));
const generatedSectionIds = generatedSectionTags.map((node) => node.attrs.get('data-section-id'));

assertUnique(manifestSectionIds, 'Manifest section ids');
assertUnique(generatedSectionIds, 'Generated section ids');
assert.equal(generatedSectionTags.length, contentSections.length, 'Generated section count must match manifest');
assert.deepEqual(generatedSectionIds, manifestSectionIds, 'Generated section order must match manifest');

const sectionPositions = new Map(
  generatedSectionTags.map((node) => [node.attrs.get('data-section-id'), node.index])
);

const homeSection = sectionTags.find((node) => node.attrs.get('id') === 'home');
if (homeSection) {
  sectionPositions.set('home', homeSection.index);
}

const sceneTags = [...indexHtml.matchAll(/<div\b[^>]*>/g)]
  .map((match) => ({ tag: match[0], index: match.index ?? -1, attrs: parseAttributes(match[0]) }))
  .filter((node) => node.attrs.has('data-scene-id'));

for (const scene of sceneTags) {
  sectionPositions.set(scene.attrs.get('data-scene-id'), scene.index);
}

for (const [index, section] of contentSections.entries()) {
  const node = generatedSectionTags.find((candidate) => candidate.attrs.get('data-section-id') === section.id);
  assert.ok(node, `Missing section node for ${section.id}`);
  assert.equal(node.attrs.get('id'), section.id, `Section ${section.id} has incorrect id`);
  assert.equal(node.attrs.get('data-section-index'), String(index), `Section ${section.id} has incorrect data-section-index`);
  assert.equal(node.attrs.get('data-section-theme'), section.theme, `Section ${section.id} has incorrect data-section-theme`);
  assert.equal(node.attrs.get('data-section-nav-bg'), section.navBg, `Section ${section.id} has incorrect data-section-nav-bg`);
  assert.equal(node.attrs.get('data-section-layout'), section.layout, `Section ${section.id} has incorrect data-section-layout`);
}

const sectionIds = new Set([
  'home',
  ...contentSections.map((section) => section.id),
  ...sceneTags.map((node) => node.attrs.get('data-scene-id'))
]);
const manifestTransitionIds = chapterTransitions.map((transition) => transition.id);
const generatedTransitionIds = transitionTags.map((node) => node.attrs.get('data-transition-id'));

assertUnique(manifestTransitionIds, 'Manifest transition ids');
assertUnique(generatedTransitionIds, 'Generated transition ids');
assert.equal(transitionTags.length, chapterTransitions.length, 'Generated transition count must match manifest');
assert.deepEqual(generatedTransitionIds, manifestTransitionIds, 'Generated transition order must match manifest');

for (const [index, transition] of chapterTransitions.entries()) {
  assert.ok(sectionIds.has(transition.from), `Transition ${transition.id} has unknown from section ${transition.from}`);
  assert.ok(sectionIds.has(transition.to), `Transition ${transition.id} has unknown to section ${transition.to}`);
  assert.ok(executableTransitionModules.includes(transition.module), `Transition ${transition.id} uses unknown module ${transition.module}`);
  const node = transitionTags[index];
  assert.ok(node, `Missing transition node for ${transition.id}`);
  assert.equal(node.attrs.get('data-transition-id'), transition.id, `Transition ${transition.id} has incorrect data-transition-id`);
  assert.equal(node.attrs.get('data-transition'), transition.id, `Transition ${transition.id} must keep legacy data-transition value`);
  assert.equal(node.attrs.get('data-transition-from'), transition.from, `Transition ${transition.id} has incorrect from`);
  assert.equal(node.attrs.get('data-transition-to'), transition.to, `Transition ${transition.id} has incorrect to`);
  assert.equal(node.attrs.get('data-transition-module'), transition.module, `Transition ${transition.id} has incorrect module`);
  assert.equal(node.attrs.get('data-transition-variant'), transition.variant, `Transition ${transition.id} has incorrect variant`);

  const fromPosition = sectionPositions.get(transition.from);
  const toPosition = sectionPositions.get(transition.to);
  assert.ok(
    fromPosition < node.index && node.index < toPosition,
    `Transition ${transition.id} must sit between ${transition.from} and ${transition.to} in DOM order`
  );
}

assertIncludes(templateHtml, '{{> sections/method.html}}', 'Phase 1 must keep template section includes for scroll verifier compatibility');
assertIncludes(navHtml, 'href="#services">场景</a>', 'Phase 1 must keep current nav HTML for scroll verifier compatibility');
assertIncludes(revealJs, "const sections = ['method', 'services', 'education', 'contact'];", 'Phase 1 must keep current reveal nav state for scroll verifier compatibility');
assertNoStaleTransitionIds(indexHtml, 'index.html');
assertNoStaleTransitionIds(templateHtml, 'src/index.template.html');
assert.doesNotMatch(canvasCss, /enterprise-scenario|education-contact/, 'canvas-stage.css must not contain stale transition selectors');
assert.equal(packageJson.scripts['verify:section-transitions'], 'node scripts/check-section-transition-contract.mjs');

console.log('Section transition contract looks good.');
