import { describe, expect, it, vi } from 'vitest';
import {
  createPhoneLabContactSnapLock,
  isPhoneLabContactInteractiveTarget
} from './phone-lab-contact-snap-lock';

type ListenerTarget = EventTarget & {
  listeners: Map<string, EventListener>;
};

function listenerTarget(): ListenerTarget {
  const listeners = new Map<string, EventListener>();
  return {
    listeners,
    addEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject | null
    ) {
      if (typeof listener === 'function') listeners.set(type, listener);
    },
    removeEventListener(type: string) {
      listeners.delete(type);
    },
    dispatchEvent() {
      return true;
    }
  } as unknown as ListenerTarget;
}

describe('phone Lab → Contact snap lock', () => {
  it('identifies native interactive controls before consuming a cinematic gesture', () => {
    const button = {
      closest: vi.fn(() => ({}))
    } as unknown as EventTarget;
    const surface = {
      closest: vi.fn(() => null)
    } as unknown as EventTarget;

    expect(isPhoneLabContactInteractiveTarget(button)).toBe(true);
    expect(isPhoneLabContactInteractiveTarget(surface)).toBe(false);
  });

  it('holds non-interactive scroll while preserving button keyboard activation', () => {
    const input = listenerTarget();
    const scroll = listenerTarget();
    const root = Object.assign(listenerTarget(), {
      dataset: {} as DOMStringMap
    }) as unknown as HTMLElement;
    let scrollY = 12;
    const scrollTo = vi.fn((nextY: number) => {
      scrollY = nextY;
    });
    const lock = createPhoneLabContactSnapLock({
      root,
      inputTarget: input,
      scrollTarget: scroll,
      getScrollY: () => scrollY,
      scrollTo
    });

    const idleTouchMove = {
      cancelable: true,
      preventDefault: vi.fn(),
      target: { closest: () => null }
    } as unknown as Event;
    input.listeners.get('touchmove')?.(idleTouchMove);
    expect(idleTouchMove.preventDefault).not.toHaveBeenCalled();

    lock.lock(160);
    expect(lock.locked).toBe(true);
    expect(root.dataset.phoneLabContactSnap).toBe('locked');
    expect(scrollTo).toHaveBeenLastCalledWith(160);

    const surfaceWheel = {
      cancelable: true,
      preventDefault: vi.fn(),
      target: { closest: () => null }
    } as unknown as Event;
    input.listeners.get('wheel')?.(surfaceWheel);
    expect(surfaceWheel.preventDefault).toHaveBeenCalledOnce();

    const buttonSpace = {
      cancelable: true,
      key: ' ',
      preventDefault: vi.fn(),
      target: { closest: () => ({}) }
    } as unknown as Event;
    input.listeners.get('keydown')?.(buttonSpace);
    expect(buttonSpace.preventDefault).not.toHaveBeenCalled();

    scrollY = 220;
    scroll.listeners.get('scroll')?.(new Event('scroll'));
    expect(scrollTo).toHaveBeenLastCalledWith(160);

    lock.release();
    expect(root.dataset.phoneLabContactSnap).toBe('released');
    lock.dispose();
  });
});
