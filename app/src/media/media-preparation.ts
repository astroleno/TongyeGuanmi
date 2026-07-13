export type MediaPreparationFailureCode =
  | 'MEDIA_PREPARATION_ABORTED'
  | 'MEDIA_PREPARATION_TIMEOUT'
  | 'MEDIA_ELEMENT_ERROR'
  | 'MEDIA_SEEK_FAILED'
  | 'MEDIA_FRAME_CALLBACK_UNAVAILABLE';

export class MediaPreparationError extends Error {
  constructor(
    readonly code: MediaPreparationFailureCode,
    message: string,
    options: { cause?: unknown } = {}
  ) {
    super(message, options);
    this.name = 'MediaPreparationError';
  }
}

export function createLinkedAbortController(parent?: AbortSignal): {
  controller: AbortController;
  dispose(): void;
} {
  const controller = new AbortController();
  let disposed = false;
  const propagateAbort = () => {
    if (!controller.signal.aborted) {
      controller.abort(parent?.reason);
    }
  };

  if (parent?.aborted) {
    propagateAbort();
  } else {
    parent?.addEventListener('abort', propagateAbort, { once: true });
  }

  return {
    controller,
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      parent?.removeEventListener('abort', propagateAbort);
    }
  };
}
