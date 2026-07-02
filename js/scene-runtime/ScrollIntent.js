const DEFAULT_VIEWPORT_HEIGHT = 1000;

function sign(value) {
  if (value > 0) return 1;
  if (value < 0) return -1;
  return 0;
}

function now(clock = globalThis.performance) {
  return Math.round(clock?.now?.() ?? Date.now());
}

export class ScrollIntent {
  constructor({
    viewportHeight = DEFAULT_VIEWPORT_HEIGHT,
    thresholdVh = 10,
    decayVh = 3,
    touchInertiaMs = 260,
    clock = globalThis.performance
  } = {}) {
    this.viewportHeight = viewportHeight;
    this.thresholdVh = thresholdVh;
    this.decayVh = decayVh;
    this.touchInertiaMs = touchInertiaMs;
    this.clock = clock;
    this.accumulatedPx = 0;
    this.armedAttempt = null;
    this.touchInertiaUntil = 0;
    this.trace = [];
  }

  get thresholdPx() {
    return Math.max(1, (this.viewportHeight * this.thresholdVh) / 100);
  }

  get decayPx() {
    return Math.max(1, (this.viewportHeight * this.decayVh) / 100);
  }

  setArmedAttempt(attemptId, direction) {
    this.armedAttempt = { attemptId, direction };
    this.trace.push({ type: 'armed', attemptId, direction });
  }

  clearArmedAttempt() {
    this.armedAttempt = null;
  }

  reset(reason = 'reset') {
    this.accumulatedPx = 0;
    this.trace.push({ type: 'reset', reason });
  }

  tick({ elapsedMs = 16 } = {}) {
    const decay = this.decayPx * Math.max(1, elapsedMs / 120);
    const before = this.accumulatedPx;
    if (Math.abs(before) <= decay) {
      this.accumulatedPx = 0;
    } else {
      this.accumulatedPx -= Math.sign(before) * decay;
    }
    this.trace.push({
      type: 'decay',
      before,
      after: this.accumulatedPx
    });
    return this.snapshot();
  }

  input({
    type = 'wheel',
    deltaY = 0,
    at = now(this.clock),
    inertia = false
  } = {}) {
    if (type === 'touchend') {
      this.touchInertiaUntil = at + this.touchInertiaMs;
      this.trace.push({ type: 'touchend', at });
      return { type: 'touchend' };
    }

    if (type === 'wheel' && (inertia || at <= this.touchInertiaUntil)) {
      this.trace.push({ type: 'ignored-inertia', at, deltaY });
      return { type: 'ignored-inertia' };
    }

    const direction = sign(deltaY);
    if (!direction) return { type: 'none' };

    if (this.armedAttempt && direction !== this.armedAttempt.direction) {
      const cancelled = {
        type: 'cancel-armed',
        attemptId: this.armedAttempt.attemptId,
        direction,
        previousDirection: this.armedAttempt.direction
      };
      this.trace.push(cancelled);
      this.clearArmedAttempt();
      this.reset('reverse-cancel');
      return cancelled;
    }

    if (sign(this.accumulatedPx) && sign(this.accumulatedPx) !== direction) {
      this.accumulatedPx = 0;
    }

    this.accumulatedPx += deltaY;
    this.trace.push({
      type: 'accumulate',
      direction,
      deltaY,
      accumulatedPx: this.accumulatedPx
    });

    if (Math.abs(this.accumulatedPx) < this.thresholdPx) {
      return {
        type: 'pending',
        direction,
        accumulatedVh: Math.abs(this.accumulatedPx) / this.viewportHeight * 100
      };
    }

    const intent = {
      type: 'intent',
      direction,
      amountVh: Math.abs(this.accumulatedPx) / this.viewportHeight * 100
    };
    this.trace.push(intent);
    this.accumulatedPx = 0;
    return intent;
  }

  snapshot() {
    return {
      accumulatedPx: this.accumulatedPx,
      accumulatedVh: Math.abs(this.accumulatedPx) / this.viewportHeight * 100,
      thresholdVh: this.thresholdVh,
      armedAttempt: this.armedAttempt ? { ...this.armedAttempt } : null,
      trace: this.trace.slice()
    };
  }
}

export function createScrollIntent(options = {}) {
  return new ScrollIntent(options);
}
