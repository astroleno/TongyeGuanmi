import './PhoneTransitionCoordinator.css';

export const PHONE_INK_AUTOPLAY_MS = 600;

export type PhoneTransitionDirection = 1 | -1;

/**
 * Positional input bridge from the DOM gesture coordinator to the authority
 * runtime. This callback can cross independently minified execution chunks,
 * so it must not rely on an object-field protocol.
 */
export type PhoneIntent = readonly [
  inputEpoch: number,
  direction: PhoneTransitionDirection,
  startY: number,
  projectedY: number
];

export type PhoneIntentDisposition =
  | 'pass-native'
  | 'claim-boundary'
  | 'block-active-session'
  | 'consume-completed-epoch-tail';

export type PhoneIntentCoordinator = Readonly<{
  dispose(): void;
}>;

export type PhoneIntentCoordinatorOptions = Readonly<{
  now?: () => number;
  scrollY?: () => number;
  scrollTo?: (y: number) => void;
  requestFrame?: (callback: () => void) => number;
  cancelFrame?: (frame: number) => void;
  scrollState?: () => Readonly<{ revision: number; corridor: string | null }>;
  onNativeScrollCorrection?: () => void;
  /** Publish physical gesture identity before native scroll sampling runs. */
  onInputEpoch?: (inputEpoch: number | null) => void;
  wheelQuietMs?: number;
  momentumWindowMs?: number;
}>;

export type PhoneTransitionSession = Readonly<{
  valid(): boolean;
}>;

const eventTargetIsInteractive = (event: Event) => (
  (event.target as Element | null)?.closest?.(
    'a,button,input,select,textarea,[role="button"]'
  )
);

// A wheel/trackpad burst can contain discrete pulses separated by more than a
// frame. Match the production gesture gate's proven 1.2-second quiet period so
// a momentum tail cannot acquire a new epoch after its first run commits.
const PHONE_WHEEL_GESTURE_QUIET_MS = 1_200;
const PHONE_TOUCH_MOMENTUM_WINDOW_MS = 1200;

/**
 * Captures physical input identity only. Boundary selection, scroll anchoring,
 * and transition completion belong to the shell-scoped orchestrator.
 */
export function createPhoneIntentCoordinator(
  root: HTMLElement,
  onIntent: (intent: PhoneIntent) => PhoneIntentDisposition,
  options: PhoneIntentCoordinatorOptions = {}
): PhoneIntentCoordinator {
  const now = options.now ?? (() => performance.now());
  const scrollY = options.scrollY ?? (() => window.scrollY);
  const scrollTo = options.scrollTo ?? ((y: number) => window.scrollTo(0, y));
  const requestFrame = options.requestFrame
    ?? (typeof window !== 'undefined'
      && typeof window.requestAnimationFrame === 'function'
      ? (callback: () => void) => window.requestAnimationFrame(callback)
      : undefined);
  const cancelFrame = options.cancelFrame
    ?? (typeof window !== 'undefined'
      && typeof window.cancelAnimationFrame === 'function'
      ? (frame: number) => window.cancelAnimationFrame(frame)
      : undefined);
  const wheelQuietMs = options.wheelQuietMs ?? PHONE_WHEEL_GESTURE_QUIET_MS;
  const momentumWindowMs = options.momentumWindowMs
    ?? PHONE_TOUCH_MOMENTUM_WINDOW_MS;
  let sequence = 0;
  let observedScrollY = scrollY();
  let wheel: Readonly<{
    inputEpoch: number;
    lastAt: number;
  }> | null = null;
  let touch: Readonly<{
    inputEpoch: number;
    startY: number;
    clientY: number;
  }> | null = null;
  let momentum: Readonly<{
    inputEpoch: number;
    until: number;
  }> | null = null;
  let momentumExpiryTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
  let publishedEpoch: number | null = null;
  const nativeProbeFrames = new Map<number, {
    expected: Readonly<{ revision: number; corridor: string | null }>;
    frame: number;
    projectedY: number;
    startY: number;
  }>();

  const nextIdentity = () => {
    sequence += 1;
    return { inputEpoch: sequence };
  };
  const publishInputEpoch = (inputEpoch: number | null) => {
    publishedEpoch = inputEpoch;
    options.onInputEpoch?.(inputEpoch);
  };
  const clearMomentumExpiryTimer = () => {
    if (momentumExpiryTimer !== undefined) {
      globalThis.clearTimeout(momentumExpiryTimer);
      momentumExpiryTimer = undefined;
    }
  };
  const expireMomentum = (inputEpoch?: number) => {
    if (inputEpoch !== undefined && momentum?.inputEpoch !== inputEpoch) return;
    momentum = null;
    wheel = null;
    clearMomentumExpiryTimer();
    if (publishedEpoch !== null && (inputEpoch === undefined || publishedEpoch === inputEpoch)) {
      publishInputEpoch(null);
    }
  };
  const scheduleMomentumExpiry = (inputEpoch: number, until: number) => {
    clearMomentumExpiryTimer();
    momentumExpiryTimer = globalThis.setTimeout(() => {
      if (momentum?.inputEpoch !== inputEpoch) return;
      expireMomentum(inputEpoch);
    }, Math.max(0, until - now()));
  };
  const block = (event: Event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const emit = (
    identity: Readonly<{ inputEpoch: number }>,
    startY: number,
    projectedY: number
  ) => {
    if (Math.abs(projectedY - startY) < 0.5) return 'pass-native';
    return onIntent([
      identity.inputEpoch,
      projectedY > startY ? 1 : -1,
      startY,
      projectedY
    ]);
  };
  const scheduleNativeScrollProbe = (
    identity: Readonly<{ inputEpoch: number }>,
    startY: number,
    projectedY: number
  ) => {
    if (
      !requestFrame
      || !options.scrollState
    ) return;
    const retained = nativeProbeFrames.get(identity.inputEpoch);
    if (retained) {
      // Safari delivers several touchmove samples before the first animation
      // frame. The one same-epoch recovery must use the latest projected
      // target rather than silently retaining the first 40px sample.
      retained.projectedY = projectedY;
      return;
    }
    const expected = options.scrollState();
    const probe = {
      expected,
      frame: 0,
      projectedY,
      startY
    };
    nativeProbeFrames.set(identity.inputEpoch, probe);
    const frame = requestFrame(() => {
      nativeProbeFrames.delete(identity.inputEpoch);
      const current = options.scrollState?.();
      if (
        !current
        || current.revision !== probe.expected.revision
        || current.corridor !== probe.expected.corridor
        || Math.abs(scrollY() - probe.startY) >= .5
      ) return;
      const correctedY = Math.max(0, probe.projectedY);
      if (Math.abs(correctedY - probe.startY) < .5) return;
      scrollTo(correctedY);
      options.onNativeScrollCorrection?.();
    });
    probe.frame = frame;
  };

  const onTouchStart = (event: TouchEvent) => {
    if (eventTargetIsInteractive(event)) {
      touch = null;
      expireMomentum();
      return;
    }
    const first = event.touches[0];
    if (event.touches.length !== 1 || !first) {
      touch = null;
      expireMomentum();
      return;
    }
    // A touchstart is always a new physical gesture. Only native scroll
    // events after touchend retain the prior epoch as momentum tail; a second
    // touch must never inherit it merely because it arrived within the quiet
    // window.
    expireMomentum();
    const inputEpoch = nextIdentity().inputEpoch;
    touch = {
      inputEpoch,
      startY: scrollY(),
      clientY: first.clientY
    };
    publishInputEpoch(inputEpoch);
  };
  const onTouchMove = (event: TouchEvent) => {
    const first = event.touches[0];
    if (
      !touch
      || event.touches.length !== 1
      || !first
      || eventTargetIsInteractive(event)
    ) return;
    const occurredAt = now();
    const projectedY = touch.startY + touch.clientY - first.clientY;
    if (Math.abs(projectedY - touch.startY) < 0.5) return;
    momentum = {
      inputEpoch: touch.inputEpoch,
      until: occurredAt + momentumWindowMs
    };
    scheduleMomentumExpiry(touch.inputEpoch, momentum.until);
    const disposition = emit(touch, touch.startY, projectedY);
    if (disposition === 'pass-native') {
      scheduleNativeScrollProbe(touch, touch.startY, projectedY);
    } else {
      block(event);
    }
  };
  const onTouchEnd = (event: TouchEvent) => {
    if (!event.touches.length) {
      const inputEpoch = touch?.inputEpoch;
      touch = null;
      if (
        inputEpoch !== undefined
        && momentum?.inputEpoch !== inputEpoch
        && publishedEpoch === inputEpoch
      ) {
        publishInputEpoch(null);
      }
    }
  };
  const onTouchCancel = () => {
    touch = null;
    expireMomentum();
  };
  const onWheel = (event: WheelEvent) => {
    if (eventTargetIsInteractive(event)) {
      expireMomentum();
      return;
    }
    const occurredAt = now();
    if (!wheel || occurredAt - wheel.lastAt > wheelQuietMs) {
      wheel = { ...nextIdentity(), lastAt: occurredAt };
    } else {
      wheel = { ...wheel, lastAt: occurredAt };
    }
    publishInputEpoch(wheel.inputEpoch);
    clearMomentumExpiryTimer();
    momentumExpiryTimer = globalThis.setTimeout(
      expireMomentum,
      wheelQuietMs
    );
    const startY = scrollY();
    const projectedY = startY
      + event.deltaY * (event.deltaMode ? 16 : 1);
    const disposition = emit(wheel, startY, projectedY);
    if (disposition === 'pass-native') {
      // A native wheel remains entirely native. The one-frame WebKit probe is
      // asynchronous and only corrects a proven stalled native scroll.
      scheduleNativeScrollProbe(wheel, startY, projectedY);
      return;
    }
    block(event);
  };
  const onScroll = () => {
    const currentY = scrollY();
    const previousY = observedScrollY;
    observedScrollY = currentY;
    const occurredAt = now();
    if (!momentum) return;
    if (occurredAt > momentum.until) {
      expireMomentum(momentum.inputEpoch);
      return;
    }
    emit(momentum, previousY, currentY);
  };

  const blocking = { passive: false, capture: true } as const;
  root.addEventListener('touchstart', onTouchStart, true);
  root.addEventListener('touchmove', onTouchMove, blocking);
  root.addEventListener('touchend', onTouchEnd, true);
  root.addEventListener('touchcancel', onTouchCancel, true);
  root.addEventListener('wheel', onWheel, blocking);
  window.addEventListener('scroll', onScroll, { passive: true });

  return {
    dispose() {
      root.removeEventListener('touchstart', onTouchStart, true);
      root.removeEventListener('touchmove', onTouchMove, blocking);
      root.removeEventListener('touchend', onTouchEnd, true);
      root.removeEventListener('touchcancel', onTouchCancel, true);
      root.removeEventListener('wheel', onWheel, blocking);
      window.removeEventListener('scroll', onScroll);
      if (cancelFrame) {
        for (const { frame } of nativeProbeFrames.values()) cancelFrame(frame);
      }
      nativeProbeFrames.clear();
      expireMomentum();
      if (publishedEpoch !== null) publishInputEpoch(null);
    }
  };
}

export function phoneTransitionCrossesBoundary(
  startScrollY: number,
  projectedScrollY: number,
  boundaryY: number,
  direction: PhoneTransitionDirection
): boolean {
  const crossed = direction === 1
    ? startScrollY <= boundaryY + 1 && projectedScrollY >= boundaryY - 1
    : startScrollY >= boundaryY - 1 && projectedScrollY <= boundaryY + 1;
  if (crossed) return true;

  // Browser wheel/touch momentum may move the document farther than its
  // originating event's delta. The following same-direction input must still
  // claim a boundary that native momentum has already crossed; otherwise a
  // stable source surface can remain active beyond its authored marker.
  return direction === 1
    ? startScrollY >= boundaryY - 1 && projectedScrollY > startScrollY + .5
    : startScrollY <= boundaryY + 1 && projectedScrollY < startScrollY - .5;
}

export function phoneTimedTransitionProgress(
  elapsedMs: number
): number {
  const linear = Math.min(1, Math.max(0, elapsedMs / PHONE_INK_AUTOPLAY_MS));
  return linear * linear * (3 - 2 * linear);
}

export function runPhoneProgressClock(
  session: PhoneTransitionSession,
  start: number,
  end: number,
  durationMs: number | undefined,
  onProgress: (progress: number) => void,
  onComplete: () => void
): () => void {
  let frame = 0;
  let startedAt = -1;
  let active = true;
  const tick = (now: number) => {
    frame = 0;
    if (!active || !session.valid()) return;
    if (startedAt < 0) startedAt = now;
    const unit = durationMs === undefined
      ? phoneTimedTransitionProgress(now - startedAt)
      : Math.min(1, Math.max(0, (now - startedAt) / Math.max(1, durationMs)));
    onProgress(start + (end - start) * unit);
    if (unit < 1) frame = window.requestAnimationFrame(tick);
    else onComplete();
  };
  onProgress(start);
  frame = window.requestAnimationFrame(tick);
  return () => {
    active = false;
    if (frame) window.cancelAnimationFrame(frame);
  };
}
