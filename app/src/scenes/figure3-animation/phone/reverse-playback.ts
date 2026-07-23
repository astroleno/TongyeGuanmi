export type PhoneFigure3ReversePlaybackStatus =
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

export type PhoneFigure3ReversePlayback = Readonly<{
  readonly active: boolean;
  start(): void;
  retry(): void;
  stop(): void;
  dispose(): void;
}>;

type PhoneFigure3ReversePlaybackOptions = Readonly<{
  durationMs: number;
  prepare(progress: number): Promise<boolean>;
  render(progress: number): void;
  onComplete(): void;
  onError(): void;
  onStatus?(status: PhoneFigure3ReversePlaybackStatus): void;
  visibilityDocument?: VisibilityDocument;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (frame: number) => void;
}>;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Safari cannot play Figure3 backwards natively and a free-running seek clock
 * can outrun the decoder until no intermediate frame is ever presented. This
 * runner advances the same canonical clock only after each requested frame is
 * physically ready. Slow seeks skip logical samples by elapsed time, but they
 * never replace the visible animation with a frozen terminal canvas.
 */
export function createPhoneFigure3ReversePlayback(
  options: PhoneFigure3ReversePlaybackOptions
): PhoneFigure3ReversePlayback {
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
  let previousFrameTime: number | undefined;

  const publish = (status: PhoneFigure3ReversePlaybackStatus) => {
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
    previousFrameTime = undefined;
    cancelScheduledFrame();
    publish('complete');
    options.onComplete();
  };

  const fail = () => {
    if (!active || disposed) return;
    active = false;
    preparing = false;
    previousFrameTime = undefined;
    cancelScheduledFrame();
    publish('error');
    options.onError();
  };

  function tick(time: number): void {
    frame = 0;
    if (disposed || !active || visibilityDocument?.hidden) return;
    if (previousFrameTime === undefined) {
      previousFrameTime = time;
    } else {
      elapsedMs += Math.max(0, time - previousFrameTime);
      previousFrameTime = time;
    }
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
      if (progress <= .001) {
        complete();
      } else {
        schedule();
      }
    }).catch(fail);
  }

  const stop = () => {
    if (!active && !preparing) return;
    generation += 1;
    active = false;
    preparing = false;
    elapsedMs = 0;
    previousFrameTime = undefined;
    cancelScheduledFrame();
    publish('idle');
  };

  const onVisibilityChange = () => {
    if (!active) return;
    previousFrameTime = undefined;
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
      previousFrameTime = undefined;
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

