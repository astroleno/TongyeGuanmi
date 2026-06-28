#!/usr/bin/env node

import { homepageTimeline } from '../src/section-manifest.mjs';

const errors = [];
const warnings = [];

console.log('🔍 Checking homepage snap contract...\n');

// Check that all animation scenes are full-screen snapped
const animationScenes = homepageTimeline.scenes.filter(s => s.kind === 'animation');
for (const scene of animationScenes) {
  if (!scene.fullScreen) {
    errors.push(`Animation scene ${scene.id}: must have fullScreen=true`);
  }
  if (!scene.snap || !scene.snap.enter) {
    errors.push(`Animation scene ${scene.id}: must have snap.enter=true`);
  }
}

console.log(`✓ Checked ${animationScenes.length} animation scenes for full-screen snap`);

// Check that reading scenes have proper snap and reading config
const readingScenes = homepageTimeline.scenes.filter(s => s.kind === 'reading');
for (const scene of readingScenes) {
  if (!scene.fullScreen) {
    errors.push(`Reading scene ${scene.id}: must have fullScreen=true (min-height:100dvh)`);
  }
  if (!scene.snap || !scene.snap.enter) {
    errors.push(`Reading scene ${scene.id}: must have snap.enter=true`);
  }
  if (!scene.reading) {
    errors.push(`Reading scene ${scene.id}: must have reading config`);
  } else {
    if (typeof scene.reading.allowNativeScroll !== 'boolean') {
      errors.push(`Reading scene ${scene.id}: must specify reading.allowNativeScroll`);
    }

    // Long reading sections must declare armNextAt
    if (scene.reading.overflow === 'extend' && scene.reading.armNextAt !== 'scrolled-past-bottom') {
      errors.push(`Reading scene ${scene.id}: overflow='extend' requires armNextAt='scrolled-past-bottom'`);
    }
  }
}

console.log(`✓ Checked ${readingScenes.length} reading scenes for snap contract`);

// Check that all non-reading blocks have 10vh trigger
const nonReadingBlocks = homepageTimeline.blocks.filter(b => {
  // Reading sections don't require 10vh charge, they snap and release
  // Only transition and animation blocks need 10vh trigger
  return b.type === 'ink-transition' || b.type === 'media-animation';
});

for (const block of nonReadingBlocks) {
  if (!block.snap || typeof block.snap.triggerAfterSnapVh !== 'number') {
    errors.push(`Block ${block.id}: must have snap.triggerAfterSnapVh (10vh trigger)`);
  } else if (block.snap.triggerAfterSnapVh !== 10) {
    warnings.push(`Block ${block.id}: triggerAfterSnapVh=${block.snap.triggerAfterSnapVh}, expected 10vh`);
  }
}

console.log(`✓ Checked ${nonReadingBlocks.length} blocks for 10vh trigger requirement`);

// Check that transitions have lock/release config
const transitions = homepageTimeline.blocks.filter(b => b.type === 'ink-transition');
for (const block of transitions) {
  if (!block.lock) {
    errors.push(`Transition ${block.id}: must have lock config`);
  } else {
    if (!Array.isArray(block.lock.during) || !block.lock.during.includes('playback')) {
      errors.push(`Transition ${block.id}: must lock during=['playback']`);
    }
    if (block.lock.release !== 'complete') {
      errors.push(`Transition ${block.id}: must release='complete'`);
    }
  }
}

console.log(`✓ Checked ${transitions.length} transitions for lock/release contract`);

// Verify scene linkage (all blocks reference valid scenes)
const sceneIds = new Set(homepageTimeline.scenes.map(s => s.id));
for (const block of homepageTimeline.blocks) {
  if (block.fromScene && !sceneIds.has(block.fromScene)) {
    errors.push(`Block ${block.id}: fromScene='${block.fromScene}' does not exist`);
  }
  if (block.toScene && !sceneIds.has(block.toScene)) {
    errors.push(`Block ${block.id}: toScene='${block.toScene}' does not exist`);
  }
  if (block.scene && !sceneIds.has(block.scene)) {
    errors.push(`Block ${block.id}: scene='${block.scene}' does not exist`);
  }

  // Check copy.targetScene if present
  if (block.copy && block.copy.targetScene && !sceneIds.has(block.copy.targetScene)) {
    errors.push(`Block ${block.id}: copy.targetScene='${block.copy.targetScene}' does not exist`);
  }
}

console.log(`✓ Verified scene linkage for all blocks`);

// Print results
console.log('');
if (errors.length > 0) {
  console.error('❌ Snap contract validation failed:\n');
  errors.forEach(err => console.error(`  ✗ ${err}`));
  console.error('');
}

if (warnings.length > 0) {
  console.warn('⚠️  Warnings:\n');
  warnings.forEach(warn => console.warn(`  ⚠ ${warn}`));
  console.warn('');
}

if (errors.length === 0) {
  console.log('✅ Homepage snap contract validation passed');
  process.exit(0);
} else {
  process.exit(1);
}
