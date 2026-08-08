import type { SceneId } from '../../story/types';
import type { PhoneRunId } from './phone-story-runs';
import type {
  PhoneScrollCorridorId,
  PhoneStorySnapshot
} from './phone-story/machine';
import type {
  PhoneScrollCorridorRegistry
} from './phone-scroll-corridor-registry';

type EventTargetLike = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

type PhoneDocumentScrollPort = Readonly<{
  getSnapshot(): PhoneStorySnapshot;
  reportSample(sample: PhoneDocumentScrollSample): unknown;
}>;

/**
 * The document sampler may be split from the reducer by Vite. It therefore
 * reports positional facts only; the runtime bridge owns the named reducer
 * event object and derives the current authority identity locally.
 */
export type PhoneDocumentScrollSample = readonly [
  actualY: number,
  corridor: PhoneScrollCorridorId | null,
  scene: SceneId | null,
  run: PhoneRunId | null,
  progress: number | undefined,
  direction: -1 | 0 | 1 | undefined,
  /** Optional for frozen corridors that do not select a motion strategy. */
  reducedMotion?: boolean,
  /** Physical touch/wheel epoch retained through native momentum tail. */
  inputEpoch?: number
];

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
  getInputEpoch?: () => number | null;
  reportSample: PhoneDocumentScrollPort['reportSample'];
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
    const report = sample?.reducedMotion === undefined
      ? [
        sample?.actualY ?? actualY,
        selected?.corridor ?? null,
        sample?.scene ?? null,
        sample?.run ?? null,
        sample?.progress,
        sample?.direction
      ] as const satisfies PhoneDocumentScrollSample
      : [
        sample.actualY ?? actualY,
        selected?.corridor ?? null,
        sample.scene ?? null,
        sample.run ?? null,
        sample.progress,
        sample.direction,
        sample.reducedMotion
      ] as const satisfies PhoneDocumentScrollSample;
    const inputEpoch = options.getInputEpoch?.() ?? null;
    const reportWithEpoch: PhoneDocumentScrollSample = inputEpoch === null
      ? report
      : [
        ...report,
        ...(sample?.reducedMotion === undefined ? [undefined] : []),
        inputEpoch
      ] as unknown as PhoneDocumentScrollSample;
    options.reportSample(reportWithEpoch);
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
