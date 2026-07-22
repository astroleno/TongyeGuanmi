export type PhoneLabContactSnapLock = Readonly<{
  readonly locked: boolean;
  lock(anchorY: number): void;
  release(): void;
  dispose(): void;
}>;

type PhoneLabContactSnapLockOptions = Readonly<{
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

const INTERACTIVE_SELECTOR = [
  'a',
  'button',
  'input',
  'select',
  'textarea',
  '[role="button"]',
  '[contenteditable="true"]'
].join(', ');

/**
 * The snap must never steal keyboard activation or touch input from the
 * permanent navigation and Contact CTA. Non-interactive cinematic gestures
 * are the only events the lock is allowed to consume.
 */
export function isPhoneLabContactInteractiveTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const candidate = target as EventTarget & {
    closest?: (selector: string) => Element | null;
  };
  return Boolean(candidate.closest?.(INTERACTIVE_SELECTOR));
}

/**
 * A local variant of the proven AOD snap lock. Its interactive-target guard
 * is deliberate: the Lab → Contact acceptance surface also contains live
 * navigation, reading links, and the Contact form CTA.
 */
export function createPhoneLabContactSnapLock(
  options: PhoneLabContactSnapLockOptions
): PhoneLabContactSnapLock {
  const inputTarget = options.inputTarget ?? options.root;
  const scrollTarget = options.scrollTarget
    ?? (typeof window === 'undefined' ? undefined : window);
  let active = false;
  let disposed = false;
  let anchorY = 0;
  let correcting = false;
  let inputListenersAttached = false;

  const correctScroll = () => {
    if (
      !active
      || disposed
      || correcting
      || Math.abs(options.getScrollY() - anchorY) <= 1
    ) {
      return;
    }
    correcting = true;
    options.scrollTo(anchorY);
    correcting = false;
  };

  const preventScrollInput: EventListener = (event) => {
    if (!active || disposed || isPhoneLabContactInteractiveTarget(event.target)) {
      return;
    }
    if (event.cancelable) event.preventDefault();
    correctScroll();
  };

  const preventScrollKey: EventListener = (event) => {
    const key = (event as Event & { key?: string }).key;
    if (
      !active
      || !key
      || !BLOCKED_SCROLL_KEYS.has(key)
      || isPhoneLabContactInteractiveTarget(event.target)
    ) {
      return;
    }
    if (event.cancelable) event.preventDefault();
    correctScroll();
  };

  const onScroll: EventListener = () => correctScroll();

  const attachInputListeners = () => {
    if (disposed || inputListenersAttached) return;
    inputTarget.addEventListener('touchmove', preventScrollInput, { passive: false });
    inputTarget.addEventListener('wheel', preventScrollInput, { passive: false });
    inputTarget.addEventListener('keydown', preventScrollKey);
    inputListenersAttached = true;
  };

  const detachInputListeners = () => {
    if (!inputListenersAttached) return;
    inputTarget.removeEventListener('touchmove', preventScrollInput);
    inputTarget.removeEventListener('wheel', preventScrollInput);
    inputTarget.removeEventListener('keydown', preventScrollKey);
    inputListenersAttached = false;
  };

  scrollTarget?.addEventListener('scroll', onScroll, { passive: true });
  options.root.dataset.phoneLabContactSnap = 'idle';

  return {
    get locked() {
      return active;
    },
    lock(nextAnchorY) {
      if (disposed) return;
      anchorY = Math.max(0, Math.round(nextAnchorY));
      active = true;
      attachInputListeners();
      options.root.dataset.phoneLabContactSnap = 'locked';
      options.scrollTo(anchorY);
    },
    release() {
      if (disposed || !active) return;
      active = false;
      detachInputListeners();
      options.root.dataset.phoneLabContactSnap = 'released';
    },
    dispose() {
      if (disposed) return;
      active = false;
      disposed = true;
      detachInputListeners();
      scrollTarget?.removeEventListener('scroll', onScroll);
      delete options.root.dataset.phoneLabContactSnap;
    }
  };
}
