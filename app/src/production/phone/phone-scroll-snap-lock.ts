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

/** AOD owns time during native playback and temporarily pins document scroll. */
export function createPhoneScrollSnapLock(options: PhoneScrollSnapLockOptions): PhoneScrollSnapLock {
  // Never install a document-level non-passive touch listener for Route B.
  // AOD is the only time-owned stage, so its temporary input lock is scoped to
  // the phone shell and exists only while its media owns the story clock.
  const inputTarget = options.inputTarget ?? options.root;
  const scrollTarget = options.scrollTarget ?? (typeof window === 'undefined' ? undefined : window);
  let active = false;
  let disposed = false;
  let anchorY = 0;
  let correcting = false;
  let inputListenersAttached = false;
  const correctScroll = () => {
    if (!active || disposed || correcting || Math.abs(options.getScrollY() - anchorY) <= 1) return;
    correcting = true;
    options.scrollTo(anchorY);
    correcting = false;
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
  const onScroll: EventListener = () => correctScroll();

  const attachInputListeners = () => {
    if (disposed || inputListenersAttached) return;
    inputTarget?.addEventListener('touchmove', preventScrollInput, { passive: false });
    inputTarget?.addEventListener('wheel', preventScrollInput, { passive: false });
    inputTarget?.addEventListener('keydown', preventScrollKey);
    inputListenersAttached = true;
  };
  const detachInputListeners = () => {
    if (!inputListenersAttached) return;
    inputTarget?.removeEventListener('touchmove', preventScrollInput);
    inputTarget?.removeEventListener('wheel', preventScrollInput);
    inputTarget?.removeEventListener('keydown', preventScrollKey);
    inputListenersAttached = false;
  };

  scrollTarget?.addEventListener('scroll', onScroll, { passive: true });
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
      scrollTarget?.removeEventListener('scroll', onScroll);
      delete options.root.dataset.phoneAodSnap;
    }
  };
}
