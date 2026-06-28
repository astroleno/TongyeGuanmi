#!/usr/bin/env node

import { homepageTimeline } from '../src/section-manifest.mjs';

const errors = [];
const warnings = [];

console.log('🔍 Checking homepage timeline schema...\n');

// Check version
if (!homepageTimeline.version) {
  errors.push('Missing version field');
} else if (homepageTimeline.version !== 1) {
  warnings.push(`Expected version 1, got ${homepageTimeline.version}`);
}

// Check defaults structure
if (!homepageTimeline.defaults) {
  errors.push('Missing defaults object');
} else {
  const { snap, media, timeouts } = homepageTimeline.defaults;

  if (!snap) {
    errors.push('Missing defaults.snap');
  } else {
    if (snap.mode !== 'full-screen') {
      errors.push(`Expected snap.mode='full-screen', got '${snap.mode}'`);
    }
    if (typeof snap.triggerAfterSnapVh !== 'number') {
      errors.push('snap.triggerAfterSnapVh must be a number');
    }
    if (typeof snap.releaseCooldownMs !== 'number') {
      errors.push('snap.releaseCooldownMs must be a number');
    }
  }

  if (!media) {
    errors.push('Missing defaults.media');
  } else {
    if (media.playback !== 'autoplay') {
      errors.push(`Expected media.playback='autoplay', got '${media.playback}'`);
    }
    if (media.seekPolicy !== 'reset-only') {
      errors.push(`Expected media.seekPolicy='reset-only', got '${media.seekPolicy}'`);
    }
    if (media.muted !== true) {
      errors.push('media.muted must be true');
    }
    if (media.playsInline !== true) {
      errors.push('media.playsInline must be true');
    }
  }

  if (!timeouts) {
    errors.push('Missing defaults.timeouts');
  } else {
    const requiredTimeouts = ['mediaReadyMs', 'mediaPlayMs', 'mediaEndGraceMs', 'textureReadyMs'];
    for (const timeout of requiredTimeouts) {
      if (typeof timeouts[timeout] !== 'number') {
        errors.push(`timeouts.${timeout} must be a number`);
      }
    }
  }
}

// Check scenes array
if (!Array.isArray(homepageTimeline.scenes)) {
  errors.push('scenes must be an array');
} else {
  const sceneIds = new Set();

  for (const scene of homepageTimeline.scenes) {
    if (!scene.id) {
      errors.push(`Scene missing id: ${JSON.stringify(scene)}`);
      continue;
    }

    if (sceneIds.has(scene.id)) {
      errors.push(`Duplicate scene id: ${scene.id}`);
    }
    sceneIds.add(scene.id);

    if (!scene.kind) {
      errors.push(`Scene ${scene.id}: missing kind`);
    } else if (!['animation', 'reading'].includes(scene.kind)) {
      errors.push(`Scene ${scene.id}: kind must be 'animation' or 'reading', got '${scene.kind}'`);
    }

    if (typeof scene.fullScreen !== 'boolean') {
      errors.push(`Scene ${scene.id}: fullScreen must be boolean`);
    }

    if (!scene.snap || typeof scene.snap.enter !== 'boolean') {
      errors.push(`Scene ${scene.id}: snap.enter must be boolean`);
    }

    // Animation scenes should have visual
    if (scene.kind === 'animation' && !scene.visual) {
      errors.push(`Animation scene ${scene.id}: missing visual property`);
    }

    // Reading scenes should have reading config
    if (scene.kind === 'reading' && !scene.reading) {
      errors.push(`Reading scene ${scene.id}: missing reading property`);
    }
  }

  console.log(`✓ Found ${homepageTimeline.scenes.length} scenes`);
}

// Check blocks array
if (!Array.isArray(homepageTimeline.blocks)) {
  errors.push('blocks must be an array');
} else {
  const blockIds = new Set();

  for (const block of homepageTimeline.blocks) {
    if (!block.id) {
      errors.push(`Block missing id: ${JSON.stringify(block).substring(0, 80)}...`);
      continue;
    }

    if (blockIds.has(block.id)) {
      errors.push(`Duplicate block id: ${block.id}`);
    }
    blockIds.add(block.id);

    if (!block.type) {
      errors.push(`Block ${block.id}: missing type`);
    } else if (!['ink-transition', 'media-animation'].includes(block.type)) {
      errors.push(`Block ${block.id}: type must be 'ink-transition' or 'media-animation', got '${block.type}'`);
    }

    // Check snap configuration
    if (block.snap) {
      if (typeof block.snap.triggerAfterSnapVh !== 'number') {
        errors.push(`Block ${block.id}: snap.triggerAfterSnapVh must be a number`);
      }
      if (block.snap.triggerAfterSnapVh !== 10) {
        warnings.push(`Block ${block.id}: triggerAfterSnapVh is ${block.snap.triggerAfterSnapVh}, expected 10`);
      }
    }

    // Check ink-transition specific fields
    if (block.type === 'ink-transition') {
      if (!block.fromScene) {
        errors.push(`Block ${block.id}: ink-transition must have fromScene`);
      }
      if (!block.toScene) {
        errors.push(`Block ${block.id}: ink-transition must have toScene`);
      }
      if (!block.ink || !block.ink.type) {
        errors.push(`Block ${block.id}: ink-transition must have ink.type`);
      }
      if (!block.textureSource || !block.textureSource.type) {
        errors.push(`Block ${block.id}: ink-transition must have textureSource.type`);
      }
      if (!block.reverse || !block.reverse.strategy) {
        errors.push(`Block ${block.id}: ink-transition must have reverse.strategy`);
      }
    }

    // Check media-animation specific fields
    if (block.type === 'media-animation') {
      if (!block.scene) {
        errors.push(`Block ${block.id}: media-animation must have scene`);
      }
      if (!Array.isArray(block.media) || block.media.length === 0) {
        errors.push(`Block ${block.id}: media-animation must have non-empty media array`);
      }
      if (!block.reverse || !block.reverse.strategy) {
        errors.push(`Block ${block.id}: media-animation must have reverse.strategy`);
      }
    }
  }

  console.log(`✓ Found ${homepageTimeline.blocks.length} blocks`);
}

// Print results
console.log('');
if (errors.length > 0) {
  console.error('❌ Schema validation failed:\n');
  errors.forEach(err => console.error(`  ✗ ${err}`));
  console.error('');
}

if (warnings.length > 0) {
  console.warn('⚠️  Warnings:\n');
  warnings.forEach(warn => console.warn(`  ⚠ ${warn}`));
  console.warn('');
}

if (errors.length === 0) {
  console.log('✅ Homepage timeline schema validation passed');
  process.exit(0);
} else {
  process.exit(1);
}
