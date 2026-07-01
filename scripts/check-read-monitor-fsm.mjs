import assert from 'node:assert/strict';
import { createReadMonitor, READ_EVENTS } from '../js/scenes/runtime/read-monitor.js';

function makeMonitor() {
  const bounds = { top: 100, bottom: 1100 };
  const viewport = { top: 0, height: 800 };
  return {
    bounds,
    viewport,
    monitor: createReadMonitor({
      sceneId: 'method-bottom',
      nextSegmentId: 'method-bottom-to-figure2',
      boundsProvider: () => bounds,
      viewportProvider: () => viewport
    })
  };
}

{
  const { monitor, viewport } = makeMonitor();
  let events = monitor.update();
  assert.deepEqual(events.map((event) => event.type), [READ_EVENTS.ENTERED, READ_EVENTS.ACTIVE]);

  viewport.top = 500;
  events = monitor.update({ forwardIntentVh: 10 });
  assert.deepEqual(
    events.map((event) => event.type),
    [READ_EVENTS.ACTIVE, READ_EVENTS.COMPLETE_LATCHED],
    'fast scroll may latch complete, but may not arm in the same sample'
  );

  events = monitor.update({ forwardIntentVh: 10 });
  assert.deepEqual(events.map((event) => event.type), [READ_EVENTS.ACTIVE, READ_EVENTS.ARM_NEXT_READY]);
  assert.equal(events.at(-1).nextSegmentId, 'method-bottom-to-figure2');
}

{
  const { monitor, viewport } = makeMonitor();
  viewport.top = 500;
  monitor.update();
  assert.equal(monitor.getState().completeLatched, true);
  const beforeVersion = monitor.getState().boundsVersion;
  monitor.refreshBounds();
  assert.equal(monitor.getState().boundsVersion, beforeVersion + 1);
  assert.equal(monitor.getState().completeLatched, true, 'resize must not clear latched complete');
}

{
  const { monitor, viewport } = makeMonitor();
  viewport.top = 500;
  const hashEvents = monitor.hashJump('education');
  assert.deepEqual(hashEvents.map((event) => event.type), [READ_EVENTS.HASH_JUMP]);
  assert.deepEqual(monitor.update({ forwardIntentVh: 10 }), [], 'hash jump must not replay reading history');
  assert.equal(monitor.getState().completeLatched, false);
}

console.log('ReadMonitor FSM checks passed.');
