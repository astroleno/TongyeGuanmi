type IdleWindow = {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout: number }
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export function scheduleAdjacentPrewarm(
  task: () => Promise<unknown>,
  timeoutMs = 600
): () => void {
  const target = window as unknown as IdleWindow;
  let cancelled = false;
  const run = () => {
    if (!cancelled) {
      void task().catch(() => undefined);
    }
  };
  const requestIdleCallback = target.requestIdleCallback;
  const handle = requestIdleCallback
    ? target.requestIdleCallback!(run, { timeout: timeoutMs })
    : window.setTimeout(run, 32);
  return () => {
    cancelled = true;
    if (requestIdleCallback) {
      target.cancelIdleCallback?.(handle);
    } else {
      window.clearTimeout(handle);
    }
  };
}
