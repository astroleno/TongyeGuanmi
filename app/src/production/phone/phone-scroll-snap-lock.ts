export type PhoneScrollSnapLock = Readonly<{
  readonly locked: boolean;
  lock(anchorY: number): void;
  release(): void;
  dispose(): void;
}>;

type PhoneScrollSnapLockOptions = Readonly<{
  root: HTMLElement;
  getScrollY(): number;
  scrollTo(y: number): void;
  inputTarget?: EventTarget;
  scrollTarget?: EventTarget;
}>;

const BLOCKED_SCROLL_KEYS = new Set(['ArrowDown', 'ArrowUp', 'End', 'Home', 'PageDown', 'PageUp', ' ']);

export function phoneForwardInputCrossesBoundary(
  startScrollY: number,
  projectedScrollY: number,
  boundaryY: number
): boolean {
  const boundary = boundaryY - 1;
  return startScrollY < boundary && projectedScrollY >= boundary;
}

type PhoneForwardInputGateOptions<Value> = Readonly<{
  target: EventTarget;
  resolve(
    startScrollY: number,
    projectedScrollY: number,
    event: TouchEvent | WheelEvent
  ): Value | null | undefined;
  onCross(value: Value): void;
}>;

/** Claims the entering touch/wheel event before native momentum crosses a time-owned boundary. */
export function attachPhoneForwardInputGate<Value>(
  options: PhoneForwardInputGateOptions<Value>
): () => void {
  let gesture: readonly [identifier: number, scrollY: number, clientY: number]
    | undefined;
  const start = (event: TouchEvent) => {
    const touch = event.touches.item(0);
    gesture = event.touches.length === 1 && touch
      ? [touch.identifier, window.scrollY, touch.clientY]
      : undefined;
  };
  const move = (event: TouchEvent) => {
    if (!gesture) return;
    const touch = event.touches.item(0);
    if (
      event.touches.length !== 1
      || !touch
      || touch.identifier !== gesture[0]
    ) return;
    const value = options.resolve(
      gesture[1],
      Math.max(0, gesture[1] + gesture[2] - touch.clientY),
      event
    );
    if (value === undefined) return;
    if (event.cancelable) event.preventDefault();
    if (value !== null) options.onCross(value);
  };
  const wheel = (event: WheelEvent) => {
    if (event.deltaY <= 0) return;
    const distance = event.deltaY * (event.deltaMode ? 16 : 1);
    const startScrollY = window.scrollY;
    const value = options.resolve(
      startScrollY,
      startScrollY + distance,
      event
    );
    if (value === undefined) return;
    if (event.cancelable) event.preventDefault();
    if (value !== null) options.onCross(value);
  };
  options.target.addEventListener('touchstart', start as EventListener, {
    passive: true,
    capture: true
  });
  options.target.addEventListener('touchmove', move as EventListener, {
    passive: false,
    capture: true
  });
  options.target.addEventListener('wheel', wheel as EventListener, {
    passive: false,
    capture: true
  });
  return () => {
    options.target.removeEventListener('touchstart', start as EventListener, true);
    options.target.removeEventListener('touchmove', move as EventListener, true);
    options.target.removeEventListener('wheel', wheel as EventListener, true);
  };
}

/** A time-owned phone scene temporarily pins the one document scroll owner. */
export function createPhoneScrollSnapLock(options: PhoneScrollSnapLockOptions): PhoneScrollSnapLock {
  const inputTarget = options.inputTarget ?? options.root;
  const scrollTarget = options.scrollTarget ?? (typeof window === 'undefined' ? undefined : window);
  let active = false;
  let disposed = false;
  let anchorY = 0;
  const correctScroll = () => {
    if (!active || disposed || Math.abs(options.getScrollY() - anchorY) <= 1) return;
    options.scrollTo(anchorY);
  };
  const preventScrollInput: EventListener = (event) => {
    if (!active || disposed) return;
    if (event.cancelable) event.preventDefault();
    correctScroll();
  };
  const preventScrollKey: EventListener = (event) => {
    const key = (event as Event & { key?: string }).key;
    if (!active || !key || !BLOCKED_SCROLL_KEYS.has(key)) return;
    if (event.cancelable) event.preventDefault();
    correctScroll();
  };
  const attachInputListeners = () => {
    if (disposed) return;
    inputTarget.addEventListener('touchmove', preventScrollInput, {
      passive: false
    });
    inputTarget.addEventListener('wheel', preventScrollInput, {
      passive: false
    });
    inputTarget.addEventListener('keydown', preventScrollKey);
  };
  const detachInputListeners = () => {
    inputTarget.removeEventListener('touchmove', preventScrollInput);
    inputTarget.removeEventListener('wheel', preventScrollInput);
    inputTarget.removeEventListener('keydown', preventScrollKey);
  };

  scrollTarget?.addEventListener('scroll', correctScroll, { passive: true });
  options.root.dataset.phoneAodSnap = 'idle';
  return {
    get locked() { return active; },
    lock(nextAnchorY) {
      if (disposed) return;
      anchorY = Math.max(0, Math.round(nextAnchorY));
      active = true;
      attachInputListeners();
      options.root.dataset.phoneAodSnap = 'locked';
      options.scrollTo(anchorY);
    },
    release() {
      if (disposed || !active) return;
      active = false;
      detachInputListeners();
      options.root.dataset.phoneAodSnap = 'released';
    },
    dispose() {
      if (disposed) return;
      active = false;
      disposed = true;
      detachInputListeners();
      scrollTarget?.removeEventListener('scroll', correctScroll);
      delete options.root.dataset.phoneAodSnap;
    }
  };
}
