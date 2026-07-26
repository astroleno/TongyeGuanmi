import './PhoneTransitionCoordinator.css';

export const PHONE_INK_AUTOPLAY_MS = 600;

export type PhoneTransitionDirection = 1 | -1;

export type PhoneIntent = Readonly<{
  inputEpoch: number;
  direction: PhoneTransitionDirection;
  startY: number;
  projectedY: number;
}>;

export type PhoneIntentCoordinator = Readonly<{
  dispose(): void;
}>;

export type PhoneIntentCoordinatorOptions = Readonly<{
  now?: () => number;
  scrollY?: () => number;
  scrollTo?: (y: number) => void;
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
  onIntent: (intent: PhoneIntent) => boolean,
  options: PhoneIntentCoordinatorOptions = {}
): PhoneIntentCoordinator {
  const now = options.now ?? (() => performance.now());
  const scrollY = options.scrollY ?? (() => window.scrollY);
  const scrollTo = options.scrollTo ?? ((y: number) => window.scrollTo(0, y));
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

  const nextIdentity = () => {
    sequence += 1;
    return { inputEpoch: sequence };
  };
  const blockIfClaimed = (event: Event, claimed: boolean) => {
    if (!claimed) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const emit = (
    identity: Readonly<{ inputEpoch: number }>,
    startY: number,
    projectedY: number
  ) => {
    if (Math.abs(projectedY - startY) < 0.5) return false;
    return onIntent({
      ...identity,
      direction: projectedY > startY ? 1 : -1,
      startY,
      projectedY
    });
  };

  const onTouchStart = (event: TouchEvent) => {
    const first = event.touches[0];
    if (event.touches.length !== 1 || !first) {
      touch = null;
      momentum = null;
      return;
    }
    const identity = nextIdentity();
    touch = {
      ...identity,
      startY: scrollY(),
      clientY: first.clientY
    };
    momentum = null;
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
    momentum = {
      inputEpoch: touch.inputEpoch,
      until: occurredAt + momentumWindowMs
    };
    blockIfClaimed(
      event,
      emit(touch, touch.startY, projectedY)
    );
  };
  const onTouchEnd = (event: TouchEvent) => {
    if (!event.touches.length) touch = null;
  };
  const onWheel = (event: WheelEvent) => {
    if (eventTargetIsInteractive(event)) return;
    const occurredAt = now();
    if (!wheel || occurredAt - wheel.lastAt > wheelQuietMs) {
      wheel = { ...nextIdentity(), lastAt: occurredAt };
    } else {
      wheel = { ...wheel, lastAt: occurredAt };
    }
    const startY = scrollY();
    const projectedY = startY
      + event.deltaY * (event.deltaMode ? 16 : 1);
    const claimed = emit(wheel, startY, projectedY);
    if (claimed) {
      blockIfClaimed(event, true);
      return;
    }
    // WebKit can dispatch an uncancelled wheel event without advancing the
    // root scroller after a fixed-stage handoff. Keep all phone wheel movement
    // under this one coordinator so an unclaimed sample cannot strand a hold.
    event.preventDefault();
    event.stopImmediatePropagation();
    scrollTo(projectedY);
  };
  const onScroll = () => {
    const currentY = scrollY();
    const previousY = observedScrollY;
    observedScrollY = currentY;
    const occurredAt = now();
    if (!momentum || occurredAt > momentum.until) return;
    emit(momentum, previousY, currentY);
  };

  const blocking = { passive: false, capture: true } as const;
  root.addEventListener('touchstart', onTouchStart, true);
  root.addEventListener('touchmove', onTouchMove, blocking);
  root.addEventListener('touchend', onTouchEnd, true);
  root.addEventListener('touchcancel', onTouchEnd, true);
  root.addEventListener('wheel', onWheel, blocking);
  window.addEventListener('scroll', onScroll, { passive: true });

  return {
    dispose() {
      root.removeEventListener('touchstart', onTouchStart, true);
      root.removeEventListener('touchmove', onTouchMove, blocking);
      root.removeEventListener('touchend', onTouchEnd, true);
      root.removeEventListener('touchcancel', onTouchEnd, true);
      root.removeEventListener('wheel', onWheel, blocking);
      window.removeEventListener('scroll', onScroll);
    }
  };
}

export function phoneTransitionCrossesBoundary(
  startScrollY: number,
  projectedScrollY: number,
  boundaryY: number,
  direction: PhoneTransitionDirection
): boolean {
  return direction === 1
    ? startScrollY <= boundaryY + 1 && projectedScrollY >= boundaryY - 1
    : startScrollY >= boundaryY - 1 && projectedScrollY <= boundaryY + 1;
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
