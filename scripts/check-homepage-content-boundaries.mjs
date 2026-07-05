#!/usr/bin/env node

import { homepageTimeline } from '../src/section-manifest.mjs';

const errors = [];
const warnings = [];

console.log('🔍 Checking homepage content boundaries...\n');

// Define content boundary rules from plan lines 96-115
const contentRules = {
  'method-upper': {
    description: 'Method upper section (77行观点文案)',
    expectedSource: 'fixture',
    expectedRef: 'method-upper-77'
  },
  'figure2-proof-opening': {
    description: 'Figure2 proof opening',
    expectedSource: 'fixture',
    expectedRef: 'proof-opening-121',
    mustNotBe: ['brand', 'figure2-proof-cards', 'figure2-proof-closing']
  },
  'figure2-proof-cards': {
    description: 'Figure2 proof cards (122-126)',
    expectedSource: 'fixture',
    expectedRef: 'proof-cards-122-126',
    mustNotBe: ['brand', 'figure2-proof-opening', 'figure2-proof-closing']
  },
  'figure2-proof-closing': {
    description: 'Figure2 proof closing (128)',
    expectedSource: 'fixture',
    expectedRef: 'proof-closing-128',
    mustNotBe: ['brand', 'figure2-proof-cards']
  },
  'brand': {
    description: 'Brand section (135-136 品牌宣称)',
    expectedSource: 'fixture',
    expectedRef: 'brand-135-136',
    mustNotBe: ['philosophy', 'figure2-proof-cards', 'figure2-proof-closing']
  },
  'philosophy': {
    description: 'Philosophy section (separate from brand)',
    mustNotBe: ['brand']
  }
};

// Check that required scenes exist
for (const [sceneId, rule] of Object.entries(contentRules)) {
  const scene = homepageTimeline.scenes.find(s => s.id === sceneId);

  if (!scene) {
    errors.push(`Missing required scene: ${sceneId} (${rule.description})`);
    continue;
  }

  // Check content source if specified
  if (rule.expectedSource && scene.content) {
    if (scene.content.source !== rule.expectedSource) {
      errors.push(`Scene ${sceneId}: content.source must be '${rule.expectedSource}', got '${scene.content.source}'`);
    }
    if (rule.expectedRef && scene.content.ref !== rule.expectedRef) {
      errors.push(`Scene ${sceneId}: content.ref must be '${rule.expectedRef}', got '${scene.content.ref}'`);
    }
  } else if (rule.expectedSource && !scene.content) {
    warnings.push(`Scene ${sceneId}: should have content.source='${rule.expectedSource}' and content.ref='${rule.expectedRef}'`);
  }
}

console.log('✓ Checked required scene existence');

// Verify brand and philosophy are separate scenes
const brand = homepageTimeline.scenes.find(s => s.id === 'brand');
const philosophy = homepageTimeline.scenes.find(s => s.id === 'philosophy');

if (brand && philosophy) {
  if (brand.publicSectionId === philosophy.publicSectionId) {
    errors.push('Brand and philosophy must be different scenes (not shared DOM node)');
  }
  console.log('✓ Brand and philosophy are separate scenes');
} else {
  if (!brand) errors.push('Missing brand scene');
  if (!philosophy) errors.push('Missing philosophy scene');
}

// Verify philosophy position: education -> philosophy -> crane-animation -> contact
const sceneOrder = homepageTimeline.scenes.map(s => s.id);
const educationIdx = sceneOrder.indexOf('education');
const philosophyIdx = sceneOrder.indexOf('philosophy');
const craneIdx = sceneOrder.indexOf('crane-animation');
const contactIdx = sceneOrder.indexOf('contact');

if (educationIdx === -1 || philosophyIdx === -1 || craneIdx === -1 || contactIdx === -1) {
  errors.push('Missing one of: education, philosophy, crane-animation, contact');
} else {
  if (!(educationIdx < philosophyIdx && philosophyIdx < craneIdx && craneIdx < contactIdx)) {
    errors.push(`Scene order must be: education -> philosophy -> crane-animation -> contact. Got indices: ${educationIdx} -> ${philosophyIdx} -> ${craneIdx} -> ${contactIdx}`);
  } else {
    console.log('✓ Philosophy positioned correctly between education and crane-animation');
  }
}

// Check method upper/lower boundary
const methodUpper = homepageTimeline.scenes.find(s => s.id === 'method-upper');
const methodLower = homepageTimeline.scenes.find(s => s.id === 'method-lower');

if (methodUpper && methodLower) {
  const upperIdx = sceneOrder.indexOf('method-upper');
  const lowerIdx = sceneOrder.indexOf('method-lower');

  if (upperIdx >= lowerIdx) {
    errors.push('method-upper must come before method-lower');
  } else {
    console.log('✓ Method upper/lower boundary correct');
  }

  // Method-lower should allow overflow for 5-step content
  if (!methodLower.reading || !methodLower.reading.overflow) {
    warnings.push('method-lower should have reading.overflow="extend" for long content');
  }
}

// Check figure2 proof stages are in order
const figure2Animation = homepageTimeline.scenes.find(s => s.id === 'figure2-animation');
const figure2ProofOpening = homepageTimeline.scenes.find(s => s.id === 'figure2-proof-opening');
const figure2ProofCards = homepageTimeline.scenes.find(s => s.id === 'figure2-proof-cards');
const figure2ProofClosing = homepageTimeline.scenes.find(s => s.id === 'figure2-proof-closing');

if (figure2Animation && figure2ProofOpening && figure2ProofCards && figure2ProofClosing) {
  const animIdx = sceneOrder.indexOf('figure2-animation');
  const openingIdx = sceneOrder.indexOf('figure2-proof-opening');
  const cardsIdx = sceneOrder.indexOf('figure2-proof-cards');
  const closingIdx = sceneOrder.indexOf('figure2-proof-closing');
  const brandIdx = sceneOrder.indexOf('brand');

  if (!(animIdx < openingIdx && openingIdx < cardsIdx && cardsIdx < closingIdx && closingIdx < brandIdx)) {
    errors.push(`Figure2 order must be: animation -> proof-opening -> proof-cards -> proof-closing -> brand. Got indices: ${animIdx} -> ${openingIdx} -> ${cardsIdx} -> ${closingIdx} -> ${brandIdx}`);
  } else {
    console.log('✓ Figure2 proof stages in correct order');
  }
}

// Check content sources don't reference Downloads path
const downloadsPathPattern = /\/Users\/.*\/Downloads/i;
for (const scene of homepageTimeline.scenes) {
  if (scene.content && scene.content.source) {
    if (downloadsPathPattern.test(scene.content.source)) {
      errors.push(`Scene ${scene.id}: content.source must not reference Downloads path, use fixture instead`);
    }
    if (scene.content.ref && downloadsPathPattern.test(scene.content.ref)) {
      errors.push(`Scene ${scene.id}: content.ref must not reference Downloads path, use fixture instead`);
    }
  }
}

console.log('✓ No Downloads path references in content sources');

// Verify proof cards and closing content references match fixture expectations
const proofCardsScene = homepageTimeline.scenes.find(s => s.id === 'figure2-proof-cards');
const proofClosingScene = homepageTimeline.scenes.find(s => s.id === 'figure2-proof-closing');
const proofOpeningScene = homepageTimeline.scenes.find(s => s.id === 'figure2-proof-opening');
const brandScene = homepageTimeline.scenes.find(s => s.id === 'brand');

if (proofOpeningScene && proofOpeningScene.content) {
  if (proofOpeningScene.content.ref !== 'proof-opening-121') {
    errors.push(`figure2-proof-opening: content.ref must be 'proof-opening-121' (opening proof statement)`);
  }
}

if (proofCardsScene && proofCardsScene.content) {
  if (proofCardsScene.content.ref !== 'proof-cards-122-126') {
    errors.push(`figure2-proof-cards: content.ref must be 'proof-cards-122-126' (lines 122-126 proof cards)`);
  }
}

if (proofClosingScene && proofClosingScene.content) {
  if (proofClosingScene.content.ref !== 'proof-closing-128') {
    errors.push(`figure2-proof-closing: content.ref must be 'proof-closing-128' (line 128 closing)`);
  }
}

if (brandScene && brandScene.content) {
  if (brandScene.content.ref !== 'brand-135-136') {
    errors.push(`brand: content.ref must be 'brand-135-136' (lines 135-136 品牌宣称)`);
  }
}

console.log('✓ Checked content reference correctness');

// Print results
console.log('');
if (errors.length > 0) {
  console.error('❌ Content boundaries validation failed:\n');
  errors.forEach(err => console.error(`  ✗ ${err}`));
  console.error('');
}

if (warnings.length > 0) {
  console.warn('⚠️  Warnings:\n');
  warnings.forEach(warn => console.warn(`  ⚠ ${warn}`));
  console.warn('');
}

if (errors.length === 0) {
  console.log('✅ Homepage content boundaries validation passed');
  process.exit(0);
} else {
  process.exit(1);
}
