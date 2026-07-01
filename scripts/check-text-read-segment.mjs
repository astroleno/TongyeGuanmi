import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { homepageSegments } from '../src/homepage/homepage.segments.mjs';
import { createReadIntentAccumulator, createReadMonitor, READ_EVENTS } from '../js/scenes/runtime/read-monitor.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeSource = readFileSync(path.join(rootDir, 'js/scenes/runtime/SceneRuntime.js'), 'utf8');
const methodRead = homepageSegments.find((segment) => segment.id === 'method-read');

assert(methodRead, 'method-read segment is missing');
assert.equal(methodRead.type, 'text-read', 'method-read must remain a text-read segment');
assert.equal(methodRead.lockScroll, false, 'method reading must not lock natural scroll');
assert.equal(methodRead.completion, 'read-complete', 'method-read must be DOM/read-complete driven');
assert.equal(methodRead.read.driver, 'ReadMonitor', 'method-read must be driven by ReadMonitor');
assert.equal(methodRead.read.nextArm, 'after-bottom-plus-intent', 'method-read must require extra intent after bottom');

assert(runtimeSource.includes("this.readMonitors.set('method-top'"), 'runtime must wire a real method-top ReadMonitor');
assert(runtimeSource.includes("this.readMonitors.set('method-bottom'"), 'runtime must wire a real method-bottom ReadMonitor');
assert(runtimeSource.includes('getBoundingClientRect()'), 'runtime ReadMonitor must use real DOM bounds');
assert(runtimeSource.includes('window.addEventListener(\'scroll\', onScroll'), 'runtime must update read monitors from real scroll');
assert(runtimeSource.includes("this.stateMachine.presentScene('method-bottom', { reason: 'read-complete' })"), 'method-top read-complete must present method-bottom through the state machine');
assert(runtimeSource.includes('createReadIntentAccumulator'), 'runtime must accumulate post-complete read intent');
assert(runtimeSource.includes('this.readIntentAccumulators'), 'runtime must keep per-scene read intent accumulators');
assert(runtimeSource.includes('READ_COMPLETE_MIN_DWELL_MS = 1200'), 'method read-complete must keep a short dwell before post-complete intent can advance');
assert(runtimeSource.includes('this.readCompleteTimestamps'), 'runtime must track read-complete timestamps for dwell timing');
assert(runtimeSource.includes('const sceneId = this.currentSceneId'), 'runtime must update only the current reading scene monitor');
assert(runtimeSource.includes('this.resetReadIntent(this.currentSceneId)'), 'runtime must reset read intent on reverse input');
assert(runtimeSource.includes('this.resetReadIntent();'), 'runtime must reset read intent on scene change/recovery');
assert(!runtimeSource.includes("this.stateMachine.arm({ segmentId: 'method-read'"), 'method-read must not use snap-lock/player arming');

const bounds = { top: 100, bottom: 1100 };
const viewport = { top: 0, height: 800 };
const monitor = createReadMonitor({
  sceneId: 'method-bottom',
  nextSegmentId: 'method-bottom-terminal',
  boundsProvider: () => bounds,
  viewportProvider: () => viewport
});

let events = monitor.update({ forwardIntentVh: 20 });
assert.deepEqual(events.map((event) => event.type), [READ_EVENTS.ENTERED, READ_EVENTS.ACTIVE], 'fast scroll must not arm before bottom');
viewport.top = 500;
events = monitor.update({ forwardIntentVh: 20 });
assert.deepEqual(events.map((event) => event.type), [READ_EVENTS.ACTIVE, READ_EVENTS.COMPLETE_LATCHED], 'fast scroll may latch complete but cannot arm in the same sample');
events = monitor.update({ forwardIntentVh: 9.9 });
assert.deepEqual(events.map((event) => event.type), [READ_EVENTS.ACTIVE], 'under-10vh intent must not arm after read complete');
events = monitor.update({ forwardIntentVh: 10 });
assert.deepEqual(events.map((event) => event.type), [READ_EVENTS.ACTIVE, READ_EVENTS.ARM_NEXT_READY], '10vh intent after read complete must arm next');

const readIntent = createReadIntentAccumulator({ thresholdVh: 10 });
assert.equal(readIntent.update({ completeLatched: false, deltaVh: 30 }).thresholdReached, false, 'intent before read-complete must not count');
assert.equal(readIntent.update({ completeLatched: true, deltaVh: 5.5 }).thresholdReached, false, 'first trackpad-like delta must not arm alone');
assert.equal(readIntent.update({ completeLatched: true, deltaVh: 5.5 }).thresholdReached, true, 'small trackpad-like deltas must accumulate past 10vh');
readIntent.reset({ reason: 'reverse' });
assert.equal(readIntent.getState().forwardIntentVh, 0, 'reverse/reset must clear accumulated read intent');

console.log('Text read segment checks passed.');
