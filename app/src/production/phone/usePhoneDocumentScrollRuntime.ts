import type { PhoneStoryEvent, PhoneStorySnapshot } from './phone-story-state';
import type { PhoneScrollCorridorRegistry } from './phone-scroll-corridor-registry';

type EventTargetLike = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

type PhoneDocumentScrollPort = Readonly<{
  getSnapshot(): PhoneStorySnapshot;
  dispatch(event: PhoneStoryEvent): unknown;
}>;

export type PhoneDocumentScrollRuntime = Readonly<{
  sampleNow(): void;
  dispose(): void;
}>;

export type CreatePhoneDocumentScrollRuntimeOptions = Readonly<{
  page: EventTargetLike & Readonly<{
    scrollY: number;
    innerWidth: number;
    innerHeight: number;
  }>;
  document: EventTargetLike;
  visualViewport: (EventTargetLike & Readonly<{ offsetTop: number }>) | null;
  registry: PhoneScrollCorridorRegistry;
  getSnapshot: PhoneDocumentScrollPort['getSnapshot'];
  dispatch: PhoneDocumentScrollPort['dispatch'];
  requestFrame(callback: () => void): number;
  cancelFrame(frame: number): void;
}>;

/**
 * The sole document-level scroll sampler for a phone authority. Scene modules
 * only register geometry; this runtime picks one allowed corridor per frame.
 */
export function createPhoneDocumentScrollRuntime(
  options: CreatePhoneDocumentScrollRuntimeOptions
): PhoneDocumentScrollRuntime {
  const {
    page,
    document: documentTarget,
    visualViewport,
    requestFrame,
    cancelFrame
  } = options;
  let frame = 0;
  let disposed = false;

  const sampleNow = () => {
    if (disposed) return;
    const snapshot = options.getSnapshot();
    const actualY = page.scrollY;
    const selected = options.registry.sample(snapshot, {
      actualY,
      viewportWidth: page.innerWidth,
      viewportHeight: page.innerHeight,
      visualViewportOffsetTop: visualViewport?.offsetTop ?? 0
    });
    const sample = selected?.sample;
    options.dispatch({
      type: 'SCROLL_SAMPLED',
      authorityId: snapshot.authorityId,
      actualY: sample?.actualY ?? actualY,
      corridor: selected?.corridor ?? null,
      ...(sample?.scene ? { scene: sample.scene } : {}),
      ...(sample?.run ? { run: sample.run } : {}),
      progress: sample?.progress,
      direction: sample?.direction
    });
  };
  const schedule = () => {
    if (disposed || frame) return;
    frame = requestFrame(() => {
      frame = 0;
      sampleNow();
    });
  };
  const listenerOptions = false;
  page.addEventListener('scroll', schedule, listenerOptions);
  page.addEventListener('resize', schedule, listenerOptions);
  page.addEventListener('orientationchange', schedule, listenerOptions);
  documentTarget.addEventListener('resize', schedule, listenerOptions);
  visualViewport?.addEventListener('resize', schedule, listenerOptions);
  visualViewport?.addEventListener('scroll', schedule, listenerOptions);

  return {
    sampleNow,
    dispose() {
      if (disposed) return;
      disposed = true;
      page.removeEventListener('scroll', schedule, listenerOptions);
      page.removeEventListener('resize', schedule, listenerOptions);
      page.removeEventListener('orientationchange', schedule, listenerOptions);
      documentTarget.removeEventListener('resize', schedule, listenerOptions);
      visualViewport?.removeEventListener('resize', schedule, listenerOptions);
      visualViewport?.removeEventListener('scroll', schedule, listenerOptions);
      if (frame) cancelFrame(frame);
      frame = 0;
    }
  };
}
