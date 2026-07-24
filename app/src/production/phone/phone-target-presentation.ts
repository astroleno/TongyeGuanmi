import type {
  ScenePresentationAdapterHandle,
  TargetPresentationRequest
} from '../../story/presentation';

export type PhoneTargetPresentationProbe =
  () => boolean | 'retryable-failure' | null;

let preparationSequence = 0;

type FrameScheduler = Readonly<{
  request(callback: FrameRequestCallback): number;
  cancel(frame: number): void;
}>;

const defaultFrameScheduler: FrameScheduler = {
  request: (callback) => window.requestAnimationFrame(callback),
  cancel: (frame) => window.cancelAnimationFrame(frame)
};

export function phoneTargetPresentationAbortError(): DOMException {
  return new DOMException('Target presentation preparation aborted', 'AbortError');
}

/**
 * Waits for rendered evidence, not merely metadata/canplay. The caller owns
 * cancellation so a retired scroll run cannot publish a stale ready result.
 */
export function waitForPhoneTargetPresentation(
  probe: PhoneTargetPresentationProbe,
  signal: AbortSignal,
  scheduler: FrameScheduler = defaultFrameScheduler
): Promise<void> {
  return new Promise((resolve, reject) => {
    let frame = 0;
    let settled = false;
    const finish = (
      error?: Error | DOMException
    ) => {
      if (settled) return;
      settled = true;
      if (frame) scheduler.cancel(frame);
      signal.removeEventListener('abort', onAbort);
      if (error) reject(error);
      else resolve();
    };
    const onAbort = () => finish(phoneTargetPresentationAbortError());
    const inspect = () => {
      frame = 0;
      if (signal.aborted) {
        onAbort();
        return;
      }
      const result = probe();
      if (result === 'retryable-failure') {
        finish(new Error('Target presentation is retryable'));
        return;
      }
      if (result) {
        finish();
        return;
      }
      frame = scheduler.request(inspect);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    inspect();
  });
}

export async function preparePhoneTargetPresentation(
  handle: ScenePresentationAdapterHandle | null,
  request: TargetPresentationRequest
): Promise<void> {
  if (!handle?.prepareTargetPresentation) {
    throw new Error('Target scene has no presentation preparation contract');
  }
  await handle.prepareTargetPresentation(request);
  if (request.signal.aborted) throw phoneTargetPresentationAbortError();
}

export function runPhoneTargetPreparation(
  valid: () => boolean,
  ready: () => boolean,
  target: () => ScenePresentationAdapterHandle | null,
  progress: number,
  direction: 1 | -1,
  runIdPrefix: string,
  onReady: () => void,
  onFailure: () => void
): () => void {
  let frame = 0;
  let controller: AbortController | undefined;
  let cancelled = false;
  const wait = () => {
    frame = 0;
    if (cancelled || !valid()) return;
    const handle = target();
    if (!ready() || !handle) {
      frame = window.requestAnimationFrame(wait);
      return;
    }
    controller = new AbortController();
    void preparePhoneTargetPresentation(handle, {
      progress,
      direction,
      runId: `${runIdPrefix}-${++preparationSequence}`,
      signal: controller.signal
    }).then(() => {
      if (!cancelled && valid()) onReady();
    }).catch(() => {
      if (!cancelled && valid()) onFailure();
    });
  };
  wait();
  return () => {
    cancelled = true;
    if (frame) window.cancelAnimationFrame(frame);
    controller?.abort();
  };
}
