import { describe, expect, it, vi } from 'vitest';
import { createPortraitScrollSnapLock } from './portrait-scroll-snap-lock';

describe('portrait AOD scroll snap lock', () => {
  it('scopes its non-passive input lock to active AOD ownership', () => {
    const scroll = new EventTarget();
    const root = Object.assign(new EventTarget(), { dataset: {} as Record<string, string> });
    const addListener = vi.spyOn(root, 'addEventListener');
    const removeListener = vi.spyOn(root, 'removeEventListener');
    let scrollY = 480;
    const scrollTo = vi.fn((nextY: number) => {
      scrollY = nextY;
    });
    const lock = createPortraitScrollSnapLock({
      root: root as unknown as HTMLElement,
      getScrollY: () => scrollY,
      scrollTo,
      scrollTarget: scroll
    });

    expect(addListener).not.toHaveBeenCalledWith('touchmove', expect.any(Function), { passive: false });

    const beforeLock = new Event('wheel', { cancelable: true });
    root.dispatchEvent(beforeLock);
    expect(beforeLock.defaultPrevented).toBe(false);

    lock.lock(420);
    expect(lock.locked).toBe(true);
    expect(root.dataset.phoneAodSnap).toBe('locked');
    expect(scrollTo).toHaveBeenLastCalledWith(420);
    expect(addListener).toHaveBeenCalledWith('touchmove', expect.any(Function), { passive: false });

    scrollY = 510;
    scroll.dispatchEvent(new Event('scroll'));
    expect(scrollTo).toHaveBeenLastCalledWith(420);

    const wheel = new Event('wheel', { cancelable: true });
    root.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);

    lock.release();
    scrollY = 620;
    scroll.dispatchEvent(new Event('scroll'));
    expect(lock.locked).toBe(false);
    expect(root.dataset.phoneAodSnap).toBe('released');
    expect(scrollTo).toHaveBeenCalledTimes(2);
    expect(removeListener).toHaveBeenCalledWith('touchmove', expect.any(Function));

    const afterRelease = new Event('wheel', { cancelable: true });
    root.dispatchEvent(afterRelease);
    expect(afterRelease.defaultPrevented).toBe(false);

    lock.dispose();
    expect(root.dataset.phoneAodSnap).toBeUndefined();
  });
});
