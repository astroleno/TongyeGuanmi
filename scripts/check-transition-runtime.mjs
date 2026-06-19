import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const packageJson = JSON.parse(read('package.json'));
const phScroll = read('js/ph-scroll.js');
const phHtml = read('ph.html');
const loadLibrariesSource = read('js/transitions/load-libraries.js');
const videoScrubSource = read('js/transitions/video-scrub.js');
const scrollSceneSource = read('js/transitions/scroll-scene.js');

function assertIncludes(source, needle, message) {
  assert.ok(source.includes(needle), message);
}

assertIncludes(loadLibrariesSource, 'export function loadScript', 'load-libraries exports loadScript');
assertIncludes(loadLibrariesSource, 'export async function loadTransitionLibraries', 'load-libraries exports loadTransitionLibraries');
assertIncludes(loadLibrariesSource, 'const scriptPromises = new Map()', 'load-libraries caches script promises');
assertIncludes(videoScrubSource, 'export function prepareScrubVideo', 'video-scrub exports prepareScrubVideo');
assertIncludes(videoScrubSource, 'export function waitForVideoMetadata', 'video-scrub exports waitForVideoMetadata');
assertIncludes(videoScrubSource, 'export function seekVideoToProgress', 'video-scrub exports seekVideoToProgress');
assertIncludes(scrollSceneSource, 'export function createReduceMotionState', 'scroll-scene exports createReduceMotionState');
assertIncludes(scrollSceneSource, 'export function initTransitionScrollRuntime', 'scroll-scene exports initTransitionScrollRuntime');
assertIncludes(scrollSceneSource, 'export function createScrollProgressTrigger', 'scroll-scene exports createScrollProgressTrigger');

assertIncludes(phScroll, "from './transitions/load-libraries.js'", 'ph-scroll imports shared library loader');
assertIncludes(phScroll, "from './transitions/scroll-scene.js'", 'ph-scroll imports shared scroll scene helpers');
assertIncludes(phScroll, "from './transitions/video-scrub.js'", 'ph-scroll imports shared video scrub helpers');
assert.doesNotMatch(phScroll, /function loadScript|async function loadRequiredLibraries/, 'ph-scroll must not keep local script loader');
assert.doesNotMatch(phScroll, /function prepareVideo|function waitForVideoMetadata|function getVideoDuration|function seekVideo\(/, 'ph-scroll must not keep local video helpers');
assert.match(
  phScroll,
  /if \(reduceMotion\) \{\s+playhead\.raw = 1;\s+setProgress\(1\);\s+waitForVideoMetadata\(alphaVideo\)\.then\(\(\) => setProgress\(1\)\);\s+return;\s+\}\s+await waitForVideoMetadata\(alphaVideo\);/s,
  'ph-scroll must not block reduced-motion final state on metadata wait'
);
assertIncludes(phScroll, 'TRANSITION_DURATION_SECONDS = 2', 'ph-scroll keeps current transition duration');
assertIncludes(phScroll, 'VIDEO_DURATION_FALLBACK = 4.04', 'ph-scroll keeps current video fallback duration');
assert.match(
  phHtml,
  /<script\b(?=[^>]*\btype=["']module["'])(?=[^>]*\bsrc=["']js\/ph-scroll\.js["'])[^>]*><\/script>/,
  'ph.html must load js/ph-scroll.js as a module'
);
assert.equal(packageJson.scripts['verify:transition-runtime'], 'node scripts/check-transition-runtime.mjs');

console.log('Transition runtime structure looks good.');
