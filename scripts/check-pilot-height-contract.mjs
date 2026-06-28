#!/usr/bin/env node
/**
 * Validate pilot scene heights resolve to 100dvh or min-height:100dvh
 *
 * Checks:
 * - Animation scenes (hero, pattern-bloom, aod-animation) have height: 100dvh
 * - Reading scenes (belief-star, method-upper, method-lower) have min-height: 100dvh
 * - No --extra-snap-height in pilot transition hosts
 * - method-lower can extend beyond 100dvh
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

const ANIMATION_SCENES = ['hero', 'pattern-bloom', 'aod-animation'];
const READING_SCENES = ['belief-star', 'method-upper', 'method-lower'];
const PILOT_BLOCKS = [
  'hero-to-pattern',
  'pattern-to-belief',
  'belief-to-aod',
  'aod-to-method'
];

const errors = [];
const warnings = [];

function validateAnimationSceneHeights() {
  console.log('🔍 Checking animation scene heights (must be 100dvh)...');

  const cssPath = join(ROOT, 'css/homepage-unified-directed-scene.css');
  const content = readFileSync(cssPath, 'utf-8');

  for (const scene of ANIMATION_SCENES) {
    // Extract the scene-host rule for this scene
    const sceneRuleRegex = new RegExp(
      `\\.scene-host\\.scene-${scene}[^{]*{([^}]+)}`,
      'gs'
    );
    const match = sceneRuleRegex.exec(content);

    if (!match) {
      errors.push(`Animation scene '${scene}' has no .scene-host rule`);
      continue;
    }

    const ruleContent = match[1];

    // Check for height: 100dvh
    if (!/height:\s*100dvh/.test(ruleContent)) {
      errors.push(`Animation scene '${scene}' must have height: 100dvh (found: ${ruleContent.match(/height:[^;]+/)?.[0] || 'none'})`);
    }

    // Ensure no min-height override
    if (/min-height:\s*(?!100dvh)/.test(ruleContent)) {
      warnings.push(`Animation scene '${scene}' has non-100dvh min-height that may conflict`);
    }
  }
}

function validateReadingSceneHeights() {
  console.log('🔍 Checking reading scene heights (must have min-height: 100dvh)...');

  const cssPath = join(ROOT, 'css/homepage-unified-directed-scene.css');
  const content = readFileSync(cssPath, 'utf-8');

  for (const scene of READING_SCENES) {
    const sceneRuleRegex = new RegExp(
      `\\.scene-host\\.scene-${scene}[^{]*{([^}]+)}`,
      'gs'
    );
    const match = sceneRuleRegex.exec(content);

    if (!match) {
      errors.push(`Reading scene '${scene}' has no .scene-host rule`);
      continue;
    }

    const ruleContent = match[1];

    // Check for min-height: 100dvh
    if (!/min-height:\s*100dvh/.test(ruleContent)) {
      errors.push(`Reading scene '${scene}' must have min-height: 100dvh (found: ${ruleContent.match(/min-height:[^;]+/)?.[0] || 'none'})`);
    }

    // method-lower can extend beyond 100dvh
    if (scene === 'method-lower') {
      if (/height:\s*100dvh(?!\s*\+)/.test(ruleContent)) {
        warnings.push(`method-lower has fixed height: 100dvh - should allow extension via min-height`);
      }
    }
  }
}

function validateNoExtraSnapHeight() {
  console.log('🔍 Checking no --extra-snap-height in pilot transition hosts...');

  const cssPath = join(ROOT, 'css/homepage-unified-directed-scene.css');
  const content = readFileSync(cssPath, 'utf-8');

  for (const block of PILOT_BLOCKS) {
    // Check transition-host rules
    const transitionHostRegex = new RegExp(
      `\\.transition-host\\.transition-${block}[^{]*{([^}]+)}`,
      'gs'
    );
    const match = transitionHostRegex.exec(content);

    if (match) {
      const ruleContent = match[1];
      if (/--extra-snap-height/.test(ruleContent)) {
        errors.push(`Transition block '${block}' must not use --extra-snap-height (breaks 100dvh snap contract)`);
      }
    }
  }

  // Check global --extra-snap-height usage
  const globalExtraSnap = /--extra-snap-height:\s*(?!0)/.test(content);
  if (globalExtraSnap) {
    warnings.push('Found non-zero --extra-snap-height in stylesheet - verify it does not affect pilot scenes');
  }
}

function validateMethodLowerExtension() {
  console.log('🔍 Checking method-lower can extend beyond 100dvh...');

  const cssPath = join(ROOT, 'css/homepage-unified-directed-scene.css');
  const content = readFileSync(cssPath, 'utf-8');

  // method-lower should use min-height, not fixed height
  const methodLowerRegex = /\.scene-host\.scene-method-lower[^{]*{([^}]+)}/gs;
  const match = methodLowerRegex.exec(content);

  if (match) {
    const ruleContent = match[1];

    if (/height:\s*100dvh/.test(ruleContent) && !/min-height/.test(ruleContent)) {
      errors.push('method-lower must use min-height: 100dvh, not fixed height: 100dvh (needs to extend for long content)');
    }

    if (!/min-height:\s*100dvh/.test(ruleContent)) {
      errors.push('method-lower missing min-height: 100dvh baseline');
    }
  } else {
    warnings.push('method-lower scene-host rule not found');
  }
}

function validateHeightConsistency() {
  console.log('🔍 Checking height consistency across scene definitions...');

  const cssPath = join(ROOT, 'css/homepage-unified-directed-scene.css');
  const htmlPath = join(ROOT, 'index.html');

  try {
    const cssContent = readFileSync(cssPath, 'utf-8');
    const htmlContent = readFileSync(htmlPath, 'utf-8');

    // Check no inline height styles on pilot scene hosts
    const allPilotScenes = [...ANIMATION_SCENES, ...READING_SCENES];
    for (const scene of allPilotScenes) {
      const inlineHeightRegex = new RegExp(`scene-${scene}[^>]*style="[^"]*height:`, 'i');
      if (inlineHeightRegex.test(htmlContent)) {
        warnings.push(`Scene '${scene}' has inline height style in HTML - CSS rules may be overridden`);
      }
    }

    // Check no media query overrides for pilot scenes
    const mediaQueryRegex = /@media[^{]*{[^}]*\.scene-host\.scene-(hero|pattern-bloom|belief-star|aod-animation|method-upper|method-lower)[^}]*height:/gs;
    const mediaMatches = cssContent.match(mediaQueryRegex);
    if (mediaMatches && mediaMatches.length > 0) {
      warnings.push(`Found ${mediaMatches.length} media query overrides for pilot scene heights - verify 100dvh contract holds`);
    }

  } catch (err) {
    warnings.push(`Could not check height consistency: ${err.message}`);
  }
}

function validateSnapScrollBehavior() {
  console.log('🔍 Checking snap-scroll behavior for pilot scenes...');

  const cssPath = join(ROOT, 'css/homepage-unified-directed-scene.css');
  const content = readFileSync(cssPath, 'utf-8');

  // Check scroll-snap-align on scene hosts
  const snapAlignRegex = /\.scene-host[^{]*{[^}]*scroll-snap-align:\s*start/s;
  if (!snapAlignRegex.test(content)) {
    warnings.push('Scene hosts may be missing scroll-snap-align: start');
  }

  // Check scroll-snap-stop
  const snapStopRegex = /\.scene-host[^{]*{[^}]*scroll-snap-stop:\s*always/s;
  if (snapStopRegex.test(content)) {
    warnings.push('scroll-snap-stop: always may interfere with 10vh trigger - verify charge indicator timing');
  }
}

// Run all validations
try {
  validateAnimationSceneHeights();
  validateReadingSceneHeights();
  validateNoExtraSnapHeight();
  validateMethodLowerExtension();
  validateHeightConsistency();
  validateSnapScrollBehavior();

  console.log('\n' + '='.repeat(60));

  if (errors.length === 0 && warnings.length === 0) {
    console.log('✅ All pilot height contract checks passed!');
    process.exit(0);
  }

  if (errors.length > 0) {
    console.log('❌ ERRORS:');
    errors.forEach((err, i) => console.log(`  ${i + 1}. ${err}`));
  }

  if (warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    warnings.forEach((warn, i) => console.log(`  ${i + 1}. ${warn}`));
  }

  console.log('='.repeat(60));

  process.exit(errors.length > 0 ? 1 : 0);

} catch (err) {
  console.error('❌ Validation failed:', err.message);
  process.exit(1);
}
