#!/usr/bin/env node

import { readdirSync, readFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const HOMEPAGE_ADAPTER_DIR = new URL('../js/transitions/homepage/', import.meta.url);

const SCAN_FILES = [
  ...readdirSync(HOMEPAGE_ADAPTER_DIR)
    .filter((file) => file.endsWith('-homepage-adapter.js'))
    .map((file) => `js/transitions/homepage/${file}`)
    .sort(),
  'js/transitions/pattern-bloom-adapter.js'
];

const KNOWN_VIOLATIONS = Object.freeze([
  {
    file: 'js/transitions/homepage/aod-homepage-adapter.js',
    ruleId: 'timeline-update',
    text: 'timeline?.update(Math.max(progress, handoffProgress), {',
    removalTaskId: 'P4.2-aod-adapter'
  },
  {
    file: 'js/transitions/homepage/crane-homepage-adapter.js',
    ruleId: 'timeline-update',
    text: 'timeline?.update(Math.max(progress, handoffProgress), {',
    removalTaskId: 'P4.5-crane-adapter'
  },
  {
    file: 'js/transitions/homepage/figure2-homepage-adapter.js',
    ruleId: 'move-real-copy-dom',
    text: 'overlay.append(sourceProof);',
    removalTaskId: 'P4.3-figure2-adapter'
  },
  {
    file: 'js/transitions/homepage/figure2-homepage-adapter.js',
    ruleId: 'move-real-copy-dom',
    text: 'marker.parentNode.insertBefore(sourceProof, marker);',
    removalTaskId: 'P4.3-figure2-adapter'
  },
  {
    file: 'js/transitions/homepage/figure2-homepage-adapter.js',
    ruleId: 'move-real-copy-dom',
    text: 'originalParent.insertBefore(sourceProof, originalNextSibling);',
    removalTaskId: 'P4.3-figure2-adapter'
  },
  {
    file: 'js/transitions/homepage/figure2-homepage-adapter.js',
    ruleId: 'move-real-copy-dom',
    text: 'originalParent.append(sourceProof);',
    removalTaskId: 'P4.3-figure2-adapter'
  },
  {
    file: 'js/transitions/homepage/figure2-homepage-adapter.js',
    ruleId: 'timeline-update',
    text: 'timeline?.update(Math.max(transitionProgress, postProgress, handoffProgress), {',
    removalTaskId: 'P4.3-figure2-adapter'
  },
  {
    file: 'js/transitions/homepage/figure3-homepage-adapter.js',
    ruleId: 'timeline-update',
    text: 'timeline?.update(progress, {',
    removalTaskId: 'P4.4-figure3-adapter'
  },
  {
    file: 'js/transitions/homepage/ph-homepage-adapter.js',
    ruleId: 'timeline-update',
    text: 'timeline?.update(progress, {',
    removalTaskId: 'P4.7-ph-adapter'
  },
  {
    file: 'js/transitions/homepage/ttg-homepage-adapter.js',
    ruleId: 'timeline-update',
    text: 'timeline?.update(progress, {',
    removalTaskId: 'P4.6-ttg-adapter'
  },
  {
    file: 'js/transitions/pattern-bloom-adapter.js',
    ruleId: 'module-progress-threshold',
    text: 'const REVEAL_END = 0.46;',
    removalTaskId: 'P4.1-pattern-bloom-adapter'
  },
  {
    file: 'js/transitions/pattern-bloom-adapter.js',
    ruleId: 'module-progress-threshold',
    text: 'const BLOOM_START = 0.42;',
    removalTaskId: 'P4.1-pattern-bloom-adapter'
  },
  {
    file: 'js/transitions/pattern-bloom-adapter.js',
    ruleId: 'module-progress-threshold',
    text: 'const BLOOM_END = 0.70;',
    removalTaskId: 'P4.1-pattern-bloom-adapter'
  },
  {
    file: 'js/transitions/pattern-bloom-adapter.js',
    ruleId: 'module-progress-threshold',
    text: 'const SECOND_REVEAL_START = 0.50;',
    removalTaskId: 'P4.1-pattern-bloom-adapter'
  },
  {
    file: 'js/transitions/pattern-bloom-adapter.js',
    ruleId: 'module-progress-threshold',
    text: 'const SECOND_REVEAL_END = 0.86;',
    removalTaskId: 'P4.1-pattern-bloom-adapter'
  },
  {
    file: 'js/transitions/pattern-bloom-adapter.js',
    ruleId: 'timeline-update',
    text: 'const timelineState = timeline?.update(progress, {',
    removalTaskId: 'P4.1-pattern-bloom-adapter'
  }
]);

const RULES = Object.freeze([
  {
    id: 'window-scroll-to',
    message: 'adapters must not call window.scrollTo',
    pattern: /\bwindow\s*\.\s*scrollTo\s*\(/
  },
  {
    id: 'scroll-into-view',
    message: 'adapters must not call scrollIntoView',
    pattern: /\bscrollIntoView\s*\(/
  },
  {
    id: 'lenis-scroll-to',
    message: 'adapters must not call lenis.scrollTo',
    pattern: /\blenis\s*\.\s*scrollTo\s*\(/
  },
  {
    id: 'body-overflow',
    message: 'adapters must not modify body.style.overflow',
    pattern: /\bbody\s*\.\s*style\s*\.\s*overflow\b/
  },
  {
    id: 'present-reveal',
    message: 'adapters must not call presentRevealWithin',
    pattern: /\bpresentRevealWithin\s*\(/
  },
  {
    id: 'claim-reveal',
    message: 'adapters must not call claimRevealWithin',
    pattern: /\bclaimRevealWithin\s*\(/
  },
  {
    id: 'complete-handoff',
    message: 'adapters must not call completeHandoff',
    pattern: /\bcompleteHandoff\s*\(/
  },
  {
    id: 'write-handoff-state',
    message: 'adapters must not write data-section-handoff-state',
    pattern: /(?:setAttribute\s*\(\s*['"]data-section-handoff-state['"]|dataset\s*\.\s*sectionHandoffState\s*=)/
  },
  {
    id: 'read-handoff-state',
    message: 'adapters must not read data-section-handoff-state',
    pattern: /(?:getAttribute\s*\(\s*['"]data-section-handoff-state['"]|dataset\s*\.\s*sectionHandoffState\b(?!\s*=))/
  },
  {
    id: 'read-timeline-phase',
    message: 'adapters must not read data-timeline-phase',
    pattern: /(?:getAttribute\s*\(\s*['"]data-timeline-phase['"]|dataset\s*\.\s*timelinePhase\b)/
  },
  {
    id: 'timeline-update',
    message: 'adapters must not push progress back into timeline.update',
    pattern: /\btimeline\s*\??\.\s*update\s*\(/
  },
  {
    id: 'module-progress-threshold',
    message: 'adapter progress thresholds must come from manifest data',
    pattern: /^\s*const\s+[A-Z_]*(?:START|END|AT|PROGRESS)[A-Z_]*\s*=\s*0?\.\d+\s*;/
  },
  {
    id: 'move-real-copy-dom',
    message: 'adapters must not move real target copy DOM into transition overlays',
    pattern: /\b(?:append|appendChild|insertBefore)\s*\(\s*sourceProof\b/
  }
]);

function relativeUrl(path) {
  return new URL(path, ROOT);
}

function keyFor(issue) {
  return `${issue.file}\0${issue.ruleId}\0${issue.text}`;
}

function scanFile(file) {
  const source = readFileSync(relativeUrl(file), 'utf8');
  const lines = source.split(/\r?\n/);
  const issues = [];

  lines.forEach((line, index) => {
    for (const rule of RULES) {
      if (rule.pattern.test(line)) {
        issues.push({
          file,
          line: index + 1,
          ruleId: rule.id,
          message: rule.message,
          text: line.trim()
        });
      }
    }
  });

  return issues;
}

const issues = SCAN_FILES.flatMap(scanFile);
const knownByKey = new Map(KNOWN_VIOLATIONS.map((entry) => [keyFor(entry), entry]));
const issueKeys = new Set(issues.map(keyFor));
const newViolations = issues.filter((issue) => !knownByKey.has(keyFor(issue)));
const staleViolations = KNOWN_VIOLATIONS.filter((entry) => !issueKeys.has(keyFor(entry)));

for (const entry of KNOWN_VIOLATIONS) {
  if (!entry.removalTaskId) {
    throw new Error(`Known violation missing removalTaskId: ${entry.file} ${entry.ruleId}`);
  }
}

if (KNOWN_VIOLATIONS.length > 0) {
  console.warn('adapter-contract known violations:');
  for (const issue of issues.filter((entry) => knownByKey.has(keyFor(entry)))) {
    const known = knownByKey.get(keyFor(issue));
    console.warn(`  - ${issue.file}:${issue.line} ${issue.ruleId} -> remove in ${known.removalTaskId}`);
  }
}

if (newViolations.length > 0) {
  console.error('\nNew adapter contract violations:');
  for (const issue of newViolations) {
    console.error(`  x ${issue.file}:${issue.line} ${issue.ruleId}: ${issue.message}`);
    console.error(`    ${issue.text}`);
  }
}

if (staleViolations.length > 0) {
  console.error('\nStale KNOWN_VIOLATIONS entries; remove them from the baseline:');
  for (const entry of staleViolations) {
    console.error(`  x ${entry.file} ${entry.ruleId}: ${entry.text}`);
  }
}

if (newViolations.length > 0 || staleViolations.length > 0) {
  process.exit(1);
}

console.log(`Adapter contract OK (${issues.length} known violations locked).`);
