import { describe, expect, it, vi } from 'vitest';
import { createPortraitScrollSnapLock } from './portrait-scroll-snap-lock';

describe('portrait AOD scroll snap lock', () => {
  it('snaps to one anchor, blocks drift, and releases only after the media run', () => {
    const input = new EventTarget();
    const scroll = new EventTarget();
    const root = { dataset: {} as Record<string, string> };
    let scrollY = 480;
    const scrollTo = vi.fn((nextY: number) => {
      scrollY = nextY;
    });
    const lock = createPortraitScrollSnapLock({
      root: root as unknown as HTMLElement,
      getScrollY: () => scrollY,
      scrollTo,
      inputTarget: input,
      scrollTarget: scroll
    });

    lock.lock(420);
    expect(lock.locked).toBe(true);
    expect(root.dataset.phoneAodSnap).toBe('locked');
    expect(scrollTo).toHaveBeenLastCalledWith(420);

    scrollY = 510;
    scroll.dispatchEvent(new Event('scroll'));
    expect(scrollTo).toHaveBeenLastCalledWith(420);

    const wheel = new Event('wheel', { cancelable: true });
    input.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);

    lock.release();
    scrollY = 620;
    scroll.dispatchEvent(new Event('scroll'));
    expect(lock.locked).toBe(false);
    expect(root.dataset.phoneAodSnap).toBe('released');
    expect(scrollTo).toHaveBeenCalledTimes(2);

    lock.dispose();
    expect(root.dataset.phoneAodSnap).toBeUndefined();
  });
});
