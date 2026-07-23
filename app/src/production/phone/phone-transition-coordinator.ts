import './PhoneTransitionCoordinator.css';

export const PHONE_INK_AUTOPLAY_MS = 600;

export type PhoneTransitionDirection = 1 | -1;

export type PhoneTransitionSession = Readonly<{
  valid(): boolean;
  moveTo(anchorY: number): void;
  complete(anchorY?: number): void;
  abort(anchorY?: number): void;
}>;

export type PhoneTransitionBoundary = Readonly<{
  position(direction: PhoneTransitionDirection): number | null;
  canStart(direction: PhoneTransitionDirection): boolean;
  start(
    direction: PhoneTransitionDirection,
    session: PhoneTransitionSession
  ): boolean | void;
}>;

export type PhoneTransitionBoundaryRegistration = Readonly<{
  trigger(direction: PhoneTransitionDirection): boolean;
  dispose(): void;
}>;

type CoordinatorRegister = (
  boundary: PhoneTransitionBoundary
) => PhoneTransitionBoundaryRegistration;

const coordinators = new WeakMap<HTMLElement, CoordinatorRegister>();

const eventTargetIsInteractive = (event: Event) => (
  (event.target as Element | null)?.closest?.(
    'a,button,input,select,textarea,[role="button"]'
  )
);

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

export function runPhoneTimedTransition(
  session: PhoneTransitionSession,
  direction: PhoneTransitionDirection,
  onProgress: (progress: number) => void,
  onComplete: () => void
): () => void {
  let frame = 0;
  let startedAt = -1;
  const tick = (now: number) => {
    if (!session.valid()) return;
    if (startedAt < 0) startedAt = now;
    const progress = phoneTimedTransitionProgress(now - startedAt);
    onProgress(direction === 1 ? progress : 1 - progress);
    if (progress < 1) frame = window.requestAnimationFrame(tick);
    else onComplete();
  };
  onProgress(direction === 1 ? 0 : 1);
  frame = window.requestAnimationFrame(tick);
  return () => {
    window.cancelAnimationFrame(frame);
    session.abort();
  };
}

function createCoordinator(root: HTMLElement): CoordinatorRegister {
  const boundaries: PhoneTransitionBoundary[] = [];
  let active: { token: number; anchorY: number } | null = null;
  let touch: [number, number, boolean] | null = null;
  let token = 0;
  let observedScrollY = window.scrollY;
  let inputIntentUntil = 0;

  const scrollTo = (value: number) => {
    const y = Math.max(0, Math.round(value));
    if (active) active.anchorY = y;
    observedScrollY = y;
    window.scrollTo(0, y);
  };
  const correctScroll = () => {
    if (active && window.scrollY !== active.anchorY) {
      scrollTo(active.anchorY);
    }
  };
  const finish = (runToken: number, anchorY?: number) => {
    if (active?.token !== runToken) return;
    if (anchorY !== undefined) scrollTo(anchorY);
    active = null;
    inputIntentUntil = 0;
    observedScrollY = window.scrollY;
    delete root.dataset.phoneTransitionLock;
  };
  const begin = (
    boundary: PhoneTransitionBoundary,
    direction: PhoneTransitionDirection,
    position = boundary.position(direction)
  ) => {
    if (active || position === null) return false;
    const runToken = ++token;
    active = { token: runToken, anchorY: position };
    root.dataset.phoneTransitionLock = 'locked';
    scrollTo(position);
    const valid = () => active?.token === runToken;
    const end = (anchorY?: number) => finish(runToken, anchorY);
    const session: PhoneTransitionSession = {
      valid,
      moveTo: (anchorY) => {
        if (valid()) scrollTo(anchorY);
      },
      complete: end,
      abort: end
    };
    if (boundary.start(direction, session) === false) {
      end(position);
      return false;
    }
    return true;
  };
  const tryProjected = (start: number, projected: number) => {
    if (Math.abs(projected - start) < .5) return false;
    const direction: PhoneTransitionDirection = projected > start ? 1 : -1;
    let match: PhoneTransitionBoundary | null = null;
    let matchPosition = direction === 1 ? Infinity : -Infinity;
    for (const boundary of boundaries) {
      const position = boundary.position(direction);
      const canStart = boundary.canStart(direction);
      if (
        position === null
        || !canStart
        || !phoneTransitionCrossesBoundary(
          start,
          projected,
          position,
          direction
        )
        || (direction === 1
          ? position >= matchPosition
          : position <= matchPosition)
      ) continue;
      match = boundary;
      matchPosition = position;
    }
    return match ? begin(match, direction, matchPosition) : false;
  };
  const block = (event: Event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    correctScroll();
  };

  const blockingListener = { passive: false, capture: true } as const;
  root.addEventListener('touchstart', (event) => {
    const first = event.touches[0];
    touch = event.touches.length === 1 && first
      ? [window.scrollY, first.clientY, false]
      : null;
  }, true);
  root.addEventListener('touchmove', (event) => {
    const first = event.touches[0];
    if (
      !touch
      || !first
      || event.touches.length !== 1
    ) return;
    if (touch[2] || active) {
      touch[2] = true;
      block(event);
      return;
    }
    if (eventTargetIsInteractive(event)) return;
    inputIntentUntil = performance.now() + 1200;
    const projected = Math.max(0, touch[0] + touch[1] - first.clientY);
    if (!tryProjected(touch[0], projected)) return;
    touch[2] = true;
    block(event);
  }, blockingListener);
  const endTouch = (event: TouchEvent) => {
    if (!event.touches.length) touch = null;
  };
  root.addEventListener('touchend', endTouch, true);
  root.addEventListener('touchcancel', endTouch, true);
  root.addEventListener('wheel', (event) => {
    if (active) {
      block(event);
      return;
    }
    if (eventTargetIsInteractive(event)) return;
    const start = window.scrollY;
    const projected = Math.max(
      0,
      start + event.deltaY * (event.deltaMode ? 16 : 1)
    );
    if (!tryProjected(start, projected)) return;
    block(event);
  }, blockingListener);
  window.addEventListener('scroll', () => {
    const currentScrollY = window.scrollY;
    if (active) {
      correctScroll();
      observedScrollY = active.anchorY;
      return;
    }
    const previousScrollY = observedScrollY;
    observedScrollY = currentScrollY;
    // `touchmove` is not guaranteed to remain cancelable once Safari has
    // promoted momentum. Reclaim an overshot semantic edge from the native
    // scroll sample so programmatic jumps and fast flings still show the ink.
    if (
      performance.now() <= inputIntentUntil
      && tryProjected(previousScrollY, currentScrollY)
    ) observedScrollY = window.scrollY;
  }, { passive: true });

  return (boundary) => {
    boundaries.push(boundary);
    return {
      trigger: (direction) => (
        boundary.canStart(direction)
        && begin(boundary, direction)
      ),
      dispose: () => {
        const index = boundaries.indexOf(boundary);
        if (index >= 0) boundaries.splice(index, 1);
      }
    };
  };
}

export function registerPhoneTransitionBoundary(
  root: HTMLElement,
  boundary: PhoneTransitionBoundary
): PhoneTransitionBoundaryRegistration {
  let register = coordinators.get(root);
  if (!register) {
    register = createCoordinator(root);
    coordinators.set(root, register);
  }
  return register(boundary);
}
