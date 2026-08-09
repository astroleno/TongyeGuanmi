export type PhonePresentedReversePlaybackStatus =
  | 'idle'
  | 'starting'
  | 'playing'
  | 'suspended'
  | 'complete'
  | 'error';

type VisibilityDocument = Pick<
  Document,
  'hidden' | 'addEventListener' | 'removeEventListener'
>;

export type PhonePresentedReversePlayback = Readonly<{
  readonly active: boolean;
  start(): void;
  retry(): void;
  stop(): void;
  dispose(): void;
}>;

export type PhonePresentedReversePlaybackRequest = readonly [
  durationMs: number,
  prepare: (progress: number) => Promise<boolean>,
  render: (progress: number) => void,
  onComplete: () => void,
  onError: () => void,
  onStatus: ((status: PhonePresentedReversePlaybackStatus) => void) | null,
  visibilityDocument: VisibilityDocument | null,
  requestFrame: ((callback: FrameRequestCallback) => number) | null,
  cancelFrame: ((frame: number) => void) | null
];

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

const PRESENTED_FRAME_STEP_MS = 1000 / 30;

/**
 * Port of d208a86's Figure3 reverse runner for Unit 6 packed-alpha surfaces.
 * Safari cannot play these sources backwards, and a free-running seek clock
 * outruns the decoder. Advance canonical time only after the requested frame
 * is physically ready. Canonical time advances by one authored 30 fps sample
 * only after that presentation, so a slow decoder cannot skip the visible
 * reverse sequence to catch up with wall time.
 */
export function createPhonePresentedReversePlayback(
  [
    requestDurationMs,
    requestPrepare,
    requestRender,
    requestOnComplete,
    requestOnError,
    requestOnStatus,
    requestVisibilityDocument,
    requestScheduleFrame,
    requestCancelFrame
  ]: PhonePresentedReversePlaybackRequest
): PhonePresentedReversePlayback {
  const options = {
    durationMs: requestDurationMs,
    prepare: requestPrepare,
    render: requestRender,
    onComplete: requestOnComplete,
    onError: requestOnError,
    onStatus: requestOnStatus ?? undefined,
    visibilityDocument: requestVisibilityDocument ?? undefined,
    requestFrame: requestScheduleFrame ?? undefined,
    cancelFrame: requestCancelFrame ?? undefined
  };
  const durationMs = Math.max(1, options.durationMs);
  const visibilityDocument = options.visibilityDocument
    ?? (typeof document === 'undefined' ? undefined : document);
  const requestFrame = options.requestFrame
    ?? ((callback: FrameRequestCallback) => window.requestAnimationFrame(callback));
  const cancelFrame = options.cancelFrame
    ?? ((frame: number) => window.cancelAnimationFrame(frame));
  let active = false;
  let disposed = false;
  let preparing = false;
  let frame = 0;
  let generation = 0;
  let elapsedMs = 0;

  const publish = (status: PhonePresentedReversePlaybackStatus) => {
    options.onStatus?.(status);
  };

  const cancelScheduledFrame = () => {
    if (!frame) return;
    cancelFrame(frame);
    frame = 0;
  };

  const schedule = () => {
    if (
      disposed
      || !active
      || preparing
      || frame
      || visibilityDocument?.hidden
    ) return;
    frame = requestFrame(tick);
  };

  const complete = () => {
    if (!active || disposed) return;
    active = false;
    preparing = false;
    cancelScheduledFrame();
    publish('complete');
    options.onComplete();
  };

  const fail = () => {
    if (!active || disposed) return;
    active = false;
    preparing = false;
    cancelScheduledFrame();
    publish('error');
    options.onError();
  };

  function tick(): void {
    frame = 0;
    if (disposed || !active || visibilityDocument?.hidden) return;
    const progress = clamp(1 - elapsedMs / durationMs);
    const preparationGeneration = generation;
    preparing = true;
    void options.prepare(progress).then((ready) => {
      if (
        disposed
        || !active
        || preparationGeneration !== generation
      ) return;
      preparing = false;
      if (!ready) {
        schedule();
        return;
      }
      options.render(progress);
      publish('playing');
      if (progress <= 0.001) {
        complete();
      } else {
        elapsedMs = Math.min(durationMs, elapsedMs + PRESENTED_FRAME_STEP_MS);
        schedule();
      }
    }).catch(() => {
      if (
        disposed
        || !active
        || preparationGeneration !== generation
      ) return;
      fail();
    });
  }

  const stop = () => {
    if (!active && !preparing) return;
    generation += 1;
    active = false;
    preparing = false;
    elapsedMs = 0;
    cancelScheduledFrame();
    publish('idle');
  };

  const onVisibilityChange = () => {
    if (!active) return;
    if (visibilityDocument?.hidden) {
      cancelScheduledFrame();
      publish('suspended');
    } else {
      publish('starting');
      schedule();
    }
  };
  visibilityDocument?.addEventListener('visibilitychange', onVisibilityChange);

  return {
    get active() {
      return active;
    },
    start() {
      if (disposed) return;
      stop();
      generation += 1;
      active = true;
      preparing = false;
      elapsedMs = 0;
      publish('starting');
      schedule();
    },
    retry() {
      if (!active || disposed) return;
      publish('starting');
      schedule();
    },
    stop,
    dispose() {
      if (disposed) return;
      stop();
      disposed = true;
      generation += 1;
      visibilityDocument?.removeEventListener(
        'visibilitychange',
        onVisibilityChange
      );
    }
  };
}
