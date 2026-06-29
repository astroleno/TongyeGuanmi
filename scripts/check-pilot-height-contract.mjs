#!/usr/bin/env node
/**
 * Validate pilot scene height contract against the REAL stylesheet.
 *
 * Checks css/sections/homepage-snap-heights.css (which targets [data-scene-id]):
 *   - Animation scenes enumerated there resolve to height: 100dvh
 *   - Reading scenes resolve to min-height: 100dvh
 *   - method-lower uses min-height (extends), never fixed height
 *   - No --extra-snap-height inflation in the pilot height rules (plan line 502)
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CSS = readFileSync(join(ROOT, 'css/sections/homepage-snap-heights.css'), 'utf-8');

const errors = [];
const warnings = [];

/** Extract the first rule block whose selector list contains the given scene id. */
function ruleFor(sceneId) {
  const re = new RegExp(`\\[data-scene-id="${sceneId}"\\][^{]*\\{([^}]*)\\}`, 's');
  const m = CSS.match(re);
  return m ? m[1] : null;
}

function checkAnimationHeights() {
  console.log('🔍 animation scenes fixed at 100dvh...');
  for (const id of ['hero', 'aod-animation', 'figure2-animation', 'figure3-animation', 'ttg-animation', 'ph-animation', 'crane-animation']) {
    const rule = ruleFor(id);
    if (!rule) { errors.push(`Animation scene '${id}' has no height rule`); continue; }
    if (!/height:\s*100dvh/.test(rule)) errors.push(`Animation scene '${id}' must set height: 100dvh`);
  }
}

function checkReadingHeights() {
  console.log('🔍 reading scenes use min-height: 100dvh...');
  for (const id of ['method-upper', 'brand', 'philosophy', 'method-lower', 'services']) {
    const rule = ruleFor(id);
    if (!rule) { errors.push(`Reading scene '${id}' has no height rule`); continue; }
    if (!/min-height:\s*100dvh/.test(rule)) errors.push(`Reading scene '${id}' must set min-height: 100dvh`);
  }
}

function checkMethodLowerExtends() {
  console.log('🔍 method-lower extends (min-height, not fixed)...');
  const rule = ruleFor('method-lower');
  if (rule && /(^|[^-])\bheight:\s*100dvh/.test(rule) && /max-height/.test(rule)) {
    errors.push('method-lower must not be clamped to a fixed 100dvh (needs to extend for long content)');
  }
}

function checkNoExtraSnapHeight() {
  console.log('🔍 no --extra-snap-height inflation in pilot height rules...');
  // The new contract drops --extra-snap-height (plan line 24/502). Strip block
  // comments first so explanatory prose mentioning the old variable doesn't
  // false-positive; we only care about real `var(--extra-snap-height)` usage.
  const withoutComments = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  if (/var\(\s*--extra-snap-height/.test(withoutComments)) {
    errors.push('homepage-snap-heights.css must not reintroduce var(--extra-snap-height)');
  }
}

try {
  checkAnimationHeights();
  checkReadingHeights();
  checkMethodLowerExtends();
  checkNoExtraSnapHeight();

  console.log('\n' + '='.repeat(60));
  if (errors.length === 0) {
    console.log('✅ pilot height contract checks passed');
    if (warnings.length) warnings.forEach((w, i) => console.log(`  ⚠️  ${i + 1}. ${w}`));
    process.exit(0);
  }
  console.log('❌ ERRORS:');
  errors.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
  console.log('='.repeat(60));
  process.exit(1);
} catch (err) {
  console.error('❌ Validation failed:', err.message);
  process.exit(1);
}
