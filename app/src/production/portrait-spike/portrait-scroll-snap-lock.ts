export type PortraitScrollSnapLock = Readonly<{
  readonly locked: boolean;
  lock(anchorY: number): void;
  release(): void;
  dispose(): void;
}>;

type PortraitScrollSnapLockOptions = Readonly<{
  root: HTMLElement;
  getScrollY(): number;
  scrollTo(y: number): void;
  inputTarget?: EventTarget;
  scrollTarget?: EventTarget;
}>;

const BLOCKED_SCROLL_KEYS = new Set([
  'ArrowDown',
  'ArrowUp',
  'End',
  'Home',
  'PageDown',
  'PageUp',
  ' '
]);

/**
 * AOD is time-owned once it starts. This lock snaps native document scroll to
 * the AOD anchor and rejects further scroll input until the media run finishes,
 * so the sticky stage cannot leak into Method while the transition is active.
 */
export function createPortraitScrollSnapLock(
  options: PortraitScrollSnapLockOptions
): PortraitScrollSnapLock {
  const inputTarget = options.inputTarget
    ?? (typeof document === 'undefined' ? undefined : document);
  const scrollTarget = options.scrollTarget
    ?? (typeof window === 'undefined' ? undefined : window);
  let active = false;
  let disposed = false;
  let anchorY = 0;
  let correcting = false;

  const correctScroll = () => {
    if (!active || disposed || correcting) {
      return;
    }
    if (Math.abs(options.getScrollY() - anchorY) <= 1) {
      return;
    }
    correcting = true;
    options.scrollTo(anchorY);
    correcting = false;
  };

  const preventScrollInput: EventListener = (event) => {
    if (!active || disposed) {
      return;
    }
    if (event.cancelable) {
      event.preventDefault();
    }
    correctScroll();
  };

  const preventScrollKey: EventListener = (event) => {
    const key = (event as Event & { key?: string }).key;
    if (!active || !key || !BLOCKED_SCROLL_KEYS.has(key)) {
      return;
    }
    if (event.cancelable) {
      event.preventDefault();
    }
    correctScroll();
  };

  const onScroll: EventListener = () => correctScroll();

  inputTarget?.addEventListener('touchmove', preventScrollInput, { passive: false });
  inputTarget?.addEventListener('wheel', preventScrollInput, { passive: false });
  inputTarget?.addEventListener('keydown', preventScrollKey);
  scrollTarget?.addEventListener('scroll', onScroll, { passive: true });
  options.root.dataset.portraitAodSnap = 'idle';

  return {
    get locked() {
      return active;
    },
    lock(nextAnchorY) {
      if (disposed) {
        return;
      }
      anchorY = Math.max(0, Math.round(nextAnchorY));
      active = true;
      options.root.dataset.portraitAodSnap = 'locked';
      options.scrollTo(anchorY);
    },
    release() {
      if (disposed || !active) {
        return;
      }
      active = false;
      options.root.dataset.portraitAodSnap = 'released';
    },
    dispose() {
      if (disposed) {
        return;
      }
      active = false;
      disposed = true;
      inputTarget?.removeEventListener('touchmove', preventScrollInput);
      inputTarget?.removeEventListener('wheel', preventScrollInput);
      inputTarget?.removeEventListener('keydown', preventScrollKey);
      scrollTarget?.removeEventListener('scroll', onScroll);
      delete options.root.dataset.portraitAodSnap;
    }
  };
}
