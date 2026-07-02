const SUPPORTED_SEGMENTS = new Set([
  'center-ink-expand',
  'left-rotate-bloom',
  'bottom-to-top-ink'
]);

export class TransitionSegmentError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TransitionSegmentError';
  }
}

export class TransitionSegmentTimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TransitionSegmentTimeoutError';
  }
}

export class TransitionSegmentAbortError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TransitionSegmentAbortError';
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function abortReason(signal, fallback = 'transition aborted') {
  const reason = signal?.reason;
  if (reason instanceof Error) return reason;
  return new TransitionSegmentAbortError(String(reason || fallback));
}

export class TransitionSegmentPlayer {
  constructor({
    defaultDurationMs = 12,
    defaultTimeoutMs = 1000,
    behavior = {}
  } = {}) {
    this.defaultDurationMs = defaultDurationMs;
    this.defaultTimeoutMs = defaultTimeoutMs;
    this.behavior = behavior;
    this.trace = [];
  }

  async play({
    segmentId,
    from,
    to,
    attemptId,
    epoch,
    signal,
    timeoutMs = this.defaultTimeoutMs,
    onTrace,
    onProgress
  } = {}) {
    if (!SUPPORTED_SEGMENTS.has(segmentId)) {
      throw new TransitionSegmentError(`Unsupported transition segment: ${segmentId}`);
    }

    const behavior = this.behavior[segmentId] || {};
    const durationMs = behavior.durationMs ?? this.defaultDurationMs;
    const controller = new AbortController();
    const cleanups = [];
    const abort = (reason) => {
      if (!controller.signal.aborted) controller.abort(reason);
    };

    if (signal?.aborted) {
      abort(abortReason(signal));
    } else if (signal) {
      const onAbort = () => abort(abortReason(signal));
      signal.addEventListener('abort', onAbort, { once: true });
      cleanups.push(() => signal.removeEventListener('abort', onAbort));
    }

    const timer = setTimeout(() => {
      abort(new TransitionSegmentTimeoutError(`${segmentId} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    cleanups.push(() => clearTimeout(timer));

    const emit = (phase, detail = {}) => {
      const entry = {
        type: 'transition',
        phase,
        segmentId,
        from,
        to,
        attemptId,
        epoch,
        ...detail
      };
      this.trace.push(entry);
      onTrace?.(entry);
    };

    const abortPromise = new Promise((_, reject) => {
      if (controller.signal.aborted) {
        reject(abortReason(controller.signal));
        return;
      }
      const onAbort = () => reject(abortReason(controller.signal));
      controller.signal.addEventListener('abort', onAbort, { once: true });
      cleanups.push(() => controller.signal.removeEventListener('abort', onAbort));
    });

    try {
      emit('started');
      const runPromise = Promise.resolve().then(async () => {
        if (behavior.reject) throw new TransitionSegmentError(behavior.rejectMessage || `${segmentId} rejected`);
        if (behavior.neverResolve) return new Promise(() => {});
        await delay(Math.max(0, durationMs / 2));
        onProgress?.({ progress: 0.5, attemptId, epoch, segmentId });
        emit('progress', { progress: 0.5 });
        await delay(Math.max(0, durationMs / 2));
        onProgress?.({ progress: 1, attemptId, epoch, segmentId });
        emit('ended');
        return { completed: true, segmentId, from, to };
      });
      return await Promise.race([runPromise, abortPromise]);
    } finally {
      cleanups.splice(0).forEach((cleanup) => cleanup());
    }
  }

  snapshot() {
    return { trace: this.trace.slice() };
  }
}

export function createTransitionSegmentPlayer(options = {}) {
  return new TransitionSegmentPlayer(options);
}
