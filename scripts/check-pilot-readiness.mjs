#!/usr/bin/env node
/**
 * Validate pilot scenes meet Phase 2.5-2.6 contracts
 *
 * Pilot paths:
 * 1. hero → pattern-bloom → belief-star
 * 2. belief-star → aod-animation → method-upper/method-lower
 *
 * Checks per plan completion standards (lines 520-525):
 * - ✓ 每段先满屏snapped，再10vh触发（含charge可视反馈）
 * - ✓ AOD转场完成后，AOD动画不会提前播放
 * - ✓ Method文案在AOD动画剩余20%时入场
 * - ✓ 反向滚动能从belief-star回退到pattern-bloom终态
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

const PILOT_SCENES = [
  'hero',
  'pattern-bloom',
  'belief-star',
  'aod-animation',
  'method-upper',
  'method-lower'
];

const PILOT_BLOCKS = [
  'hero-to-pattern',
  'pattern-to-belief',
  'belief-to-aod',
  'aod-to-method'
];

const ANIMATION_SCENES = ['hero', 'pattern-bloom', 'aod-animation'];
const READING_SCENES = ['belief-star', 'method-upper', 'method-lower'];

const errors = [];
const warnings = [];

function validateTimelineScenes() {
  console.log('🔍 Checking homepageTimeline.scenes...');

  const timelineConfigPath = join(ROOT, 'js/homepage-timeline-config.mjs');
  const content = readFileSync(timelineConfigPath, 'utf-8');

  for (const scene of PILOT_SCENES) {
    if (!content.includes(`'${scene}'`) && !content.includes(`"${scene}"`)) {
      errors.push(`Scene '${scene}' not found in homepageTimeline.scenes`);
    }
  }
}

function validateSceneHeights() {
  console.log('🔍 Checking scene height contracts...');

  const cssPath = join(ROOT, 'css/homepage-unified-directed-scene.css');
  const content = readFileSync(cssPath, 'utf-8');

  for (const scene of ANIMATION_SCENES) {
    const heightRegex = new RegExp(`\\.scene-host\\.scene-${scene}[^{]*{[^}]*height:\\s*100dvh`, 's');
    if (!heightRegex.test(content)) {
      errors.push(`Animation scene '${scene}' must have height: 100dvh`);
    }
  }

  for (const scene of READING_SCENES) {
    const minHeightRegex = new RegExp(`\\.scene-host\\.scene-${scene}[^{]*{[^}]*min-height:\\s*100dvh`, 's');
    if (!minHeightRegex.test(content)) {
      errors.push(`Reading scene '${scene}' must have min-height: 100dvh`);
    }
  }
}

function validateTransitionBlocks() {
  console.log('🔍 Checking transition blocks...');

  const configPath = join(ROOT, 'js/homepage-timeline-config.mjs');
  const content = readFileSync(configPath, 'utf-8');

  for (const block of PILOT_BLOCKS) {
    // Check textureSource is declared
    const blockRegex = new RegExp(`['"]${block}['"]\\s*:\\s*{[^}]*textureSource:`, 's');
    if (!blockRegex.test(content)) {
      errors.push(`Block '${block}' missing textureSource declaration`);
    }

    // Check trigger is 10vh
    const triggerRegex = new RegExp(`['"]${block}['"]\\s*:\\s*{[^}]*trigger:\\s*['"]10vh['"]`, 's');
    if (!triggerRegex.test(content)) {
      warnings.push(`Block '${block}' should use trigger: '10vh' for charge indicator`);
    }
  }
}

function validateInkTransitions() {
  console.log('🔍 Checking ink transitions use unified factory...');

  const configPath = join(ROOT, 'js/homepage-timeline-config.mjs');
  const content = readFileSync(configPath, 'utf-8');

  // Check no split-scene-ink-transition usage
  if (content.includes('split-scene-ink-transition')) {
    errors.push('Found split-scene-ink-transition usage - should use unified ink factory');
  }

  // Check unified factory is used
  const unifiedFactoryRegex = /createUnifiedInkTransition|createInkTransition/;
  if (!unifiedFactoryRegex.test(content)) {
    warnings.push('No unified ink transition factory found - verify manual transition setup');
  }
}

function validateChargeIndicator() {
  console.log('🔍 Checking charge indicator CSS...');

  const cssPath = join(ROOT, 'css/homepage-charge-indicator.css');
  try {
    const content = readFileSync(cssPath, 'utf-8');

    if (!content.includes('.charge-indicator')) {
      errors.push('Charge indicator CSS missing .charge-indicator class');
    }

    if (!content.includes('opacity') || !content.includes('transform')) {
      warnings.push('Charge indicator should animate opacity and transform');
    }
  } catch (err) {
    errors.push(`Charge indicator CSS file not found: ${cssPath}`);
  }
}

function validateRuntimeFSM() {
  console.log('🔍 Checking runtime FSM handles pilot transitions...');

  const fsmPath = join(ROOT, 'js/homepage-directed-scene-fsm.mjs');
  try {
    const content = readFileSync(fsmPath, 'utf-8');

    // Check FSM can handle transitions
    if (!content.includes('onEnter') || !content.includes('onLeave')) {
      warnings.push('FSM missing lifecycle hooks for scene transitions');
    }

    // Check reverse scroll handling
    if (!content.includes('reverse') || !content.includes('backward')) {
      warnings.push('FSM may not handle reverse scroll transitions');
    }
  } catch (err) {
    warnings.push(`Runtime FSM file not found: ${fsmPath}`);
  }
}

function validateAODContract() {
  console.log('🔍 Checking AOD animation contract...');

  const configPath = join(ROOT, 'js/homepage-timeline-config.mjs');
  const content = readFileSync(configPath, 'utf-8');

  // Check AOD animation doesn't auto-play
  const aodSceneRegex = /'aod-animation'[^}]*autoPlay:\s*true/s;
  if (aodSceneRegex.test(content)) {
    errors.push('AOD animation must not have autoPlay: true');
  }

  // Check method entry timing
  const methodEntryRegex = /method[^}]*entryTiming[^}]*0\.8|80%/;
  if (!methodEntryRegex.test(content)) {
    warnings.push('Method text should enter at 80% of AOD animation (20% remaining)');
  }
}

function validatePilotPaths() {
  console.log('🔍 Validating pilot transition paths...');

  const configPath = join(ROOT, 'js/homepage-timeline-config.mjs');
  const content = readFileSync(configPath, 'utf-8');

  const expectedTransitions = [
    ['hero', 'pattern-bloom'],
    ['pattern-bloom', 'belief-star'],
    ['belief-star', 'aod-animation'],
    ['aod-animation', 'method-upper'],
    ['method-upper', 'method-lower']
  ];

  for (const [from, to] of expectedTransitions) {
    const transitionRegex = new RegExp(`${from}[^}]*→[^}]*${to}|${from}.*to.*${to}`, 's');
    if (!transitionRegex.test(content)) {
      warnings.push(`Expected transition path '${from}' → '${to}' may be missing`);
    }
  }
}

// Run all validations
try {
  validateTimelineScenes();
  validateSceneHeights();
  validateTransitionBlocks();
  validateInkTransitions();
  validateChargeIndicator();
  validateRuntimeFSM();
  validateAODContract();
  validatePilotPaths();

  console.log('\n' + '='.repeat(60));

  if (errors.length === 0 && warnings.length === 0) {
    console.log('✅ All pilot readiness checks passed!');
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
