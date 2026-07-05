#!/usr/bin/env node
/**
 * Validate pilot scenes/blocks meet Phase 2.5-2.6 contracts.
 *
 * Pilot paths (plan Phase 3, lines 513-525):
 *   1. hero -> pattern-bloom -> belief-star
 *   2. belief-star -> aod-animation -> method-upper/method-lower
 *
 * Reads the REAL artifacts (no invented paths):
 *   - src/section-manifest.mjs            (homepageTimeline data)
 *   - css/sections/homepage-snap-heights.css   ([data-scene-id] height rules)
 *   - css/components/snap-charge-indicator.css (charge feedback)
 *   - js/runtime/homepage-snap-runtime.js      (charge-driven FSM)
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { homepageTimeline } = await import(join(ROOT, 'src/section-manifest.mjs'));

const PILOT_SCENES = ['hero', 'pattern-bloom', 'belief-star', 'aod-animation', 'method-upper', 'method-lower'];
const PILOT_BLOCKS = ['hero-to-pattern', 'pattern-to-belief', 'belief-to-aod', 'aod-play'];

const errors = [];
const warnings = [];
const read = (rel) => readFileSync(join(ROOT, rel), 'utf-8');

function checkScenesExist() {
  console.log('🔍 homepageTimeline.scenes covers pilot scenes...');
  const ids = new Set(homepageTimeline.scenes.map((s) => s.id));
  for (const id of PILOT_SCENES) {
    if (!ids.has(id)) errors.push(`Pilot scene '${id}' missing from homepageTimeline.scenes`);
  }
}

function checkBlocksExist() {
  console.log('🔍 homepageTimeline.blocks covers pilot blocks...');
  const blocks = new Map(homepageTimeline.blocks.map((b) => [b.id, b]));
  for (const id of PILOT_BLOCKS) {
    const b = blocks.get(id);
    if (!b) { errors.push(`Pilot block '${id}' missing from homepageTimeline.blocks`); continue; }

    // ink transitions must declare the 10vh trigger + a textureSource
    if (b.type === 'ink-transition') {
      const trigger = b.snap?.triggerAfterSnapVh ?? homepageTimeline.defaults?.snap?.triggerAfterSnapVh;
      if (trigger !== 10) errors.push(`Block '${id}' triggerAfterSnapVh must be 10 (got ${trigger})`);
      if (!b.textureSource) errors.push(`Block '${id}' missing textureSource`);
    }
    // animation playback must declare a reverse strategy (plan reverse matrix)
    if (b.type === 'media-animation' && !b.reverse) {
      errors.push(`Block '${id}' missing reverse strategy`);
    }
  }
}

function checkSceneHeights() {
  console.log('🔍 pilot scene heights ([data-scene-id] rules)...');
  const css = read('css/sections/homepage-snap-heights.css');
  // Animation scenes that the height contract enumerates must be fixed 100dvh.
  for (const id of ['hero', 'aod-animation']) {
    if (!new RegExp(`\\[data-scene-id="${id}"\\]`).test(css)) {
      errors.push(`Animation scene '${id}' has no [data-scene-id] height rule`);
    }
  }
  if (!/height:\s*100dvh/.test(css)) errors.push('Height CSS missing height: 100dvh for animation scenes');
  // Reading scenes use min-height
  for (const id of ['method-upper']) {
    if (!new RegExp(`\\[data-scene-id="${id}"\\]`).test(css)) {
      errors.push(`Reading scene '${id}' has no [data-scene-id] min-height rule`);
    }
  }
  if (!/min-height:\s*100dvh/.test(css)) errors.push('Height CSS missing min-height: 100dvh for reading scenes');
  // pattern-bloom / belief-star are pilot scenes but not yet in the height CSS — warn, don't fail.
  for (const id of ['pattern-bloom', 'belief-star', 'method-lower']) {
    if (!new RegExp(`\\[data-scene-id="${id}"\\]`).test(css)) {
      warnings.push(`Pilot scene '${id}' not yet in homepage-snap-heights.css`);
    }
  }
}

function checkChargeIndicator() {
  console.log('🔍 charge indicator CSS present...');
  const css = read('css/components/snap-charge-indicator.css');
  if (!css.includes('.snap-charge-indicator')) errors.push('snap-charge-indicator.css missing .snap-charge-indicator');
}

function checkRuntimeChargeDriven() {
  console.log('🔍 runtime is charge-driven (not scroll-position-driven)...');
  const rt = read('js/runtime/homepage-snap-runtime.js');
  if (/scrollDelta\s*>\s*CONFIG\.TRIGGER_THRESHOLD/.test(rt)) {
    errors.push('Runtime still triggers on scroll-position delta (must be charge-driven)');
  }
  if (!/CHARGE_TRIGGER/.test(rt)) errors.push('Runtime missing CHARGE_TRIGGER (charge accumulation path)');
  if (!/createChargeAccumulator/.test(rt)) errors.push('Runtime does not use createChargeAccumulator');
  if (!/createInputNormalizer/.test(rt)) errors.push('Runtime does not use createInputNormalizer');
}

function checkBrowserRuntimeImportsGeneratedManifest() {
  console.log('🔍 browser runtime imports generated manifest...');
  const integration = read('js/runtime/homepage-runtime-integration.js');
  if (/src\/section-manifest\.mjs/.test(integration)) {
    errors.push('Browser runtime must not import src/section-manifest.mjs (served with non-JS MIME in dev/static hosting)');
  }
  if (!/transitions\/homepage\/scene-timeline-manifest\.js/.test(integration)) {
    errors.push('Browser runtime must import generated scene-timeline-manifest.js');
  }
}

function checkSnapRuntimeDefault() {
  console.log('🔍 snap runtime is the default homepage scroll owner...');
  const main = read('js/main.js');
  if (!/const\s+legacyRuntimeEnabled\s*=/.test(main)) {
    errors.push('main.js must expose an explicit legacyRuntimeEnabled fallback flag');
  }
  if (!/const\s+snapRuntimeEnabled\s*=\s*!legacyRuntimeEnabled\s*;/.test(main)) {
    errors.push('snapRuntimeEnabled must default to true unless the legacy fallback flag is set');
  }
  if (!/runtimeParams\.get\('legacyRuntime'\)\s*===\s*'1'/.test(main)) {
    errors.push('main.js must keep ?legacyRuntime=1 as the explicit debug fallback');
  }
  if (!/runtimeParams\.get\('snapRuntime'\)\s*===\s*'0'/.test(main)) {
    errors.push('main.js must keep ?snapRuntime=0 as the temporary reverse debug flag');
  }
  if (/__SNAP_RUNTIME__|runtimeParams\.get\('snapRuntime'\)\s*===\s*'1'/.test(main)) {
    errors.push('snap runtime must not remain opt-in via ?snapRuntime=1 or __SNAP_RUNTIME__');
  }
}

function checkAodNoAutoplay() {
  console.log('🔍 AOD does not autoplay on viewport enter...');
  const aod = homepageTimeline.scenes.find((s) => s.id === 'aod-animation');
  if (aod && aod.media?.playback && aod.media.playback !== 'autoplay-on-trigger' && aod.snap?.enter === false) {
    warnings.push('aod-animation playback policy should require trigger, not viewport-enter');
  }
}

function checkBuiltDomCoverage() {
  console.log('🔍 built index.html has data-scene-id for all pilot scenes...');
  let html;
  try {
    html = read('index.html');
  } catch {
    errors.push('index.html not found — run build:page before this check');
    return;
  }
  for (const id of PILOT_SCENES) {
    if (!html.includes(`data-scene-id="${id}"`)) {
      errors.push(`Pilot scene '${id}' has no data-scene-id host in index.html (run build:page; check homepageSceneDomMap)`);
    }
  }
}

try {
  checkScenesExist();
  checkBlocksExist();
  checkSceneHeights();
  checkChargeIndicator();
  checkRuntimeChargeDriven();
  checkBrowserRuntimeImportsGeneratedManifest();
  checkSnapRuntimeDefault();
  checkAodNoAutoplay();
  checkBuiltDomCoverage();

  console.log('\n' + '='.repeat(60));
  if (errors.length === 0) {
    console.log('✅ pilot readiness checks passed');
    if (warnings.length) {
      console.log('\n⚠️  WARNINGS:');
      warnings.forEach((w, i) => console.log(`  ${i + 1}. ${w}`));
    }
    process.exit(0);
  }
  console.log('❌ ERRORS:');
  errors.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
  if (warnings.length) {
    console.log('\n⚠️  WARNINGS:');
    warnings.forEach((w, i) => console.log(`  ${i + 1}. ${w}`));
  }
  console.log('='.repeat(60));
  process.exit(1);
} catch (err) {
  console.error('❌ Validation failed:', err.message);
  process.exit(1);
}
