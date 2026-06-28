#!/usr/bin/env node

import { homepageTimeline } from '../src/section-manifest.mjs';

const errors = [];
const warnings = [];

console.log('🔍 Checking homepage media policy...\n');

// Check defaults media policy
const { media } = homepageTimeline.defaults;
if (media.seekPolicy !== 'reset-only') {
  errors.push(`defaults.media.seekPolicy must be 'reset-only', got '${media.seekPolicy}'`);
}
if (media.playback !== 'autoplay') {
  errors.push(`defaults.media.playback must be 'autoplay', got '${media.playback}'`);
}

console.log('✓ Checked default media policy');

// Check all media-animation blocks
const mediaBlocks = homepageTimeline.blocks.filter(b => b.type === 'media-animation');

for (const block of mediaBlocks) {
  // Media array must exist and be non-empty
  if (!Array.isArray(block.media) || block.media.length === 0) {
    errors.push(`Block ${block.id}: media array must be non-empty`);
  }

  // Must have reverse strategy
  if (!block.reverse || !block.reverse.strategy) {
    errors.push(`Block ${block.id}: must declare reverse.strategy`);
  } else {
    const validStrategies = ['reverse-media', 'terminal-state-fallback'];
    if (!validStrategies.includes(block.reverse.strategy)) {
      errors.push(`Block ${block.id}: reverse.strategy must be one of [${validStrategies.join(', ')}], got '${block.reverse.strategy}'`);
    }

    // If reverse-media, must provide reverse media array
    if (block.reverse.strategy === 'reverse-media') {
      if (!Array.isArray(block.reverse.media) || block.reverse.media.length === 0) {
        errors.push(`Block ${block.id}: reverse-media strategy requires reverse.media array`);
      }
    }

    // If terminal-state-fallback, must provide targetScene
    if (block.reverse.strategy === 'terminal-state-fallback') {
      if (!block.reverse.targetScene) {
        errors.push(`Block ${block.id}: terminal-state-fallback strategy requires reverse.targetScene`);
      }
    }
  }

  // Check copy entry timing if present
  if (block.copy) {
    if (typeof block.copy.enterAtRemaining !== 'number') {
      errors.push(`Block ${block.id}: copy.enterAtRemaining must be a number`);
    } else if (block.copy.enterAtRemaining !== 0.2) {
      warnings.push(`Block ${block.id}: copy.enterAtRemaining=${block.copy.enterAtRemaining}, expected 0.2 (last 20%)`);
    }

    if (!block.copy.targetScene) {
      errors.push(`Block ${block.id}: copy config requires targetScene`);
    }
  }
}

console.log(`✓ Checked ${mediaBlocks.length} media-animation blocks`);

// Verify that seekPolicy='reset-only' is enforced (no scrub allowed)
// This is a contract check - runtime must not use seek for progress driving
const seekPolicyWarning = `
⚠️  CRITICAL CONTRACT: seekPolicy='reset-only' means:
  - seek() and currentTime only for reset, first frame prep, or recovery
  - NO per-frame progress-driven seeking
  - Use video.play() + ended/timeupdate events for animation
  - Scrubbing is FORBIDDEN in main playback flow
`;

console.log(seekPolicyWarning);

// Check animation scenes have corresponding media blocks
const animationScenes = homepageTimeline.scenes.filter(s => s.kind === 'animation');
for (const scene of animationScenes) {
  const hasMediaBlock = mediaBlocks.some(b => b.scene === scene.id);
  if (!hasMediaBlock && !['pattern-bloom', 'belief-star'].includes(scene.id)) {
    // pattern-bloom is special (uses adapter layers, not video)
    warnings.push(`Animation scene ${scene.id}: no corresponding media-animation block found`);
  }
}

console.log(`✓ Checked animation scenes for media block mapping`);

// Check timeouts are reasonable
const { timeouts } = homepageTimeline.defaults;
if (timeouts.mediaReadyMs < 500) {
  warnings.push(`mediaReadyMs=${timeouts.mediaReadyMs} seems too short`);
}
if (timeouts.mediaPlayMs < 500) {
  warnings.push(`mediaPlayMs=${timeouts.mediaPlayMs} seems too short`);
}
if (timeouts.mediaEndGraceMs < 500) {
  warnings.push(`mediaEndGraceMs=${timeouts.mediaEndGraceMs} seems too short`);
}

console.log('✓ Checked timeout values');

// Print results
console.log('');
if (errors.length > 0) {
  console.error('❌ Media policy validation failed:\n');
  errors.forEach(err => console.error(`  ✗ ${err}`));
  console.error('');
}

if (warnings.length > 0) {
  console.warn('⚠️  Warnings:\n');
  warnings.forEach(warn => console.warn(`  ⚠ ${warn}`));
  console.warn('');
}

if (errors.length === 0) {
  console.log('✅ Homepage media policy validation passed');
  process.exit(0);
} else {
  process.exit(1);
}
