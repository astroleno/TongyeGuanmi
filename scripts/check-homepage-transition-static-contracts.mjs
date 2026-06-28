import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  chapterTransitions,
  homepageEndpointSpec,
  sceneTransitionContracts
} from '../src/section-manifest.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const captureSource = read('scripts/capture-homepage-checkpoints.mjs');
const gateSource = read('scripts/check-homepage-transition-gates.mjs');
const handoffVerifierSource = read('scripts/check-handoff-ownership.mjs');
const integrationVerifierSource = read('scripts/check-homepage-transition-integration.mjs');
const buildSource = read('scripts/build-index.mjs');

const requiredIssues = Array.from({ length: 19 }, (_, issue) => issue);
for (const issue of requiredIssues) {
  assert.match(captureSource, new RegExp(`issue:\\s*${issue}\\b`), `Capture crosswalk must include user issue #${issue}`);
}

assert.match(gateSource, /EXPECTED_USER_ISSUES\s*=\s*Array\.from\(\{\s*length:\s*19\s*\}/, 'Strict gate must require 19 user issues');
assert.match(gateSource, /previousTopPixelRatio[\s\S]{0,40}>=\s*0\.015/, 'Split gates must require sampled previous top evidence');
assert.match(gateSource, /nextBottomPixelRatio[\s\S]{0,40}>=\s*0\.015/, 'Split gates must require sampled next bottom evidence');
assert.match(captureSource, /claimedTopOwner/, 'Capture must split bridge claims from evidence');
assert.match(captureSource, /previousTopPixelRatioSource/, 'Capture must record sampled split evidence source');
assert.ok(existsSync(new URL('../js/transitions/homepage/split-scene-bridge.js', import.meta.url)), 'Split scene bridge helper must exist');
assert.ok(existsSync(new URL('../js/effects/split-scene-ink-transition.js', import.meta.url)), 'Split scene ink effect helper must exist');
assert.match(handoffVerifierSource, /projection mode|mode\\s\*===\\s\*'projection'/i, 'Handoff verifier must assert projection mode');
assert.match(integrationVerifierSource, /projection/i, 'Homepage integration verifier must mention projection contracts');
assert.match(buildSource, /data-transition-runtime-mode/, 'Build must emit data-transition-runtime-mode');

assert.notEqual(homepageEndpointSpec.mode, 'undecided', 'homepageEndpointSpec.mode must not be undecided');
assert.ok(homepageEndpointSpec.snapTarget, 'homepageEndpointSpec.snapTarget must be declared');
assert.ok(homepageEndpointSpec.approvalSource, 'homepageEndpointSpec.approvalSource must be declared');

const runtimeTransitions = [
  ...chapterTransitions.filter((transition) => transition.runtimeMode === 'progress-window'),
  ...sceneTransitionContracts.filter((transition) => transition.runtimeMode === 'progress-window')
];
assert.ok(runtimeTransitions.length >= 5, 'Progress-window migration must be opt-in and cover migrated slices');
for (const transition of runtimeTransitions) {
  assert.ok(transition.windows?.length, `${transition.id} must declare progress-window semantic windows`);
}

console.log('Homepage transition static contracts look good.');
