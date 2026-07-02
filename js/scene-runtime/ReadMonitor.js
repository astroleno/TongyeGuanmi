function sign(value) {
  if (value > 0) return 1;
  if (value < 0) return -1;
  return 0;
}

export class ReadMonitor {
  constructor({
    viewportHeight = 1000,
    thresholdVh = 10,
    bottomTolerancePx = 2
  } = {}) {
    this.viewportHeight = viewportHeight;
    this.thresholdVh = thresholdVh;
    this.bottomTolerancePx = bottomTolerancePx;
    this.position = {
      top: 0,
      height: viewportHeight,
      viewport: viewportHeight
    };
    this.afterBottomPx = 0;
    this.trace = [];
  }

  get thresholdPx() {
    return Math.max(1, (this.viewportHeight * this.thresholdVh) / 100);
  }

  updatePosition({
    scrollTop = this.position.top,
    scrollHeight = this.position.height,
    clientHeight = this.position.viewport
  } = {}) {
    this.position = {
      top: scrollTop,
      height: scrollHeight,
      viewport: clientHeight
    };
    if (!this.isAtBottom()) this.afterBottomPx = 0;
    return this.snapshot();
  }

  isAtBottom() {
    return this.position.top + this.position.viewport >= this.position.height - this.bottomTolerancePx;
  }

  input({
    deltaY = 0,
    scrollTop,
    scrollHeight,
    clientHeight
  } = {}) {
    if ([scrollTop, scrollHeight, clientHeight].some((value) => value !== undefined)) {
      this.updatePosition({ scrollTop, scrollHeight, clientHeight });
    }

    if (!this.isAtBottom()) {
      this.afterBottomPx = 0;
      this.trace.push({ type: 'reading', atBottom: false });
      return { type: 'reading' };
    }

    const direction = sign(deltaY);
    if (direction < 0) {
      this.afterBottomPx = 0;
      this.trace.push({ type: 'reverse-reset' });
      return { type: 'reading' };
    }
    if (!direction) return { type: 'reading' };

    this.afterBottomPx += deltaY;
    this.trace.push({
      type: 'after-bottom',
      afterBottomVh: this.afterBottomPx / this.viewportHeight * 100
    });

    if (this.afterBottomPx < this.thresholdPx) {
      return {
        type: 'reading',
        afterBottomVh: this.afterBottomPx / this.viewportHeight * 100
      };
    }

    this.afterBottomPx = 0;
    return { type: 'next', source: 'read-boundary' };
  }

  snapshot() {
    return {
      position: { ...this.position },
      atBottom: this.isAtBottom(),
      afterBottomPx: this.afterBottomPx,
      afterBottomVh: this.afterBottomPx / this.viewportHeight * 100,
      thresholdVh: this.thresholdVh,
      trace: this.trace.slice()
    };
  }
}

export function createReadMonitor(options = {}) {
  return new ReadMonitor(options);
}
