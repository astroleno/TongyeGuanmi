import assert from 'node:assert/strict';
import { createScrollIntentAccumulator } from '../js/scenes/runtime/scroll-intent.js';

class FakeClock {
  constructor() {
    this.time = 0;
  }

  now() {
    return this.time;
  }

  advance(ms) {
    this.time += ms;
  }
}

const assertOutputShape = (output) => {
  assert.deepEqual(Object.keys(output).sort(), ['direction', 'intentProgress', 'source', 'thresholdReached']);
};

{
  const clock = new FakeClock();
  const intent = createScrollIntentAccumulator({ clock, config: { minArmedMs: 0 } });
  const result = intent.update({ deltaVh: 0.1, source: 'wheel' });
  assertOutputShape(result);
  assert.equal(result.thresholdReached, true);
  assert.equal(result.intentProgress, 0.1);
  assert.equal(result.direction, 'forward');
}

{
  const clock = new FakeClock();
  const intent = createScrollIntentAccumulator({ clock, config: { minArmedMs: 0 } });
  const result = intent.update({ deltaVh: 2, source: 'wheel' });
  assert.equal(result.intentProgress, 0.25, 'single frame input must clamp at 25vh');
  assert.equal(result.thresholdReached, true);
}

{
  const clock = new FakeClock();
  const intent = createScrollIntentAccumulator({ clock, config: { minArmedMs: 0 } });
  intent.update({ deltaVh: 0.05, source: 'wheel' });
  const reversed = intent.update({ deltaVh: -0.06, source: 'wheel' });
  assert.equal(reversed.intentProgress, 0);
  assert.equal(reversed.thresholdReached, false);
  assert.equal(intent.getState().lastCancelReason, 'reverse-cancel');
}

{
  const clock = new FakeClock();
  const intent = createScrollIntentAccumulator({ clock, config: { minArmedMs: 0 } });
  intent.update({ deltaVh: 0.08, source: 'wheel' });
  clock.advance(260);
  const decayed = intent.decay();
  assert.ok(decayed.intentProgress < 0.081 && decayed.intentProgress > 0.035);
  assert.equal(decayed.thresholdReached, false);
}

{
  const clock = new FakeClock();
  const intent = createScrollIntentAccumulator({ clock, config: { minArmedMs: 0 } });
  intent.update({ deltaVh: 0.05, source: 'touchmove' });
  intent.touchEnd();
  const ignored = intent.update({ deltaVh: 0.2, source: 'touch-momentum' });
  assert.equal(ignored.intentProgress, 0.05);
  assert.equal(ignored.thresholdReached, false, 'touch momentum inside grace must not arm');
  clock.advance(181);
  const accepted = intent.update({ deltaVh: 0.05, source: 'touch-momentum' });
  assert.equal(accepted.thresholdReached, true);
}

{
  const clock = new FakeClock();
  const intent = createScrollIntentAccumulator({ clock, config: { minArmedMs: 0 } });
  assert.equal(intent.update({ deltaVh: 0.1, source: 'wheel' }).thresholdReached, true);
  intent.release();
  const duringCooldown = intent.update({ deltaVh: 0.2, source: 'wheel' });
  assert.equal(duringCooldown.intentProgress, 0);
  assert.equal(duringCooldown.thresholdReached, false);
  clock.advance(221);
  const afterCooldown = intent.update({ deltaVh: 0.1, source: 'wheel' });
  assert.equal(afterCooldown.thresholdReached, true);
}

console.log('ScrollIntent checks passed.');
