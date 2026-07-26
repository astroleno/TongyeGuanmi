import { describe, expect, it, vi } from 'vitest';
import {
  createPhoneDirectEntryPositioner
} from './phone-direct-entry-position';

function scheduler() {
  const frames = new Map<number, () => void>();
  let sequence = 0;
  return {
    request(callback: () => void) {
      const id = ++sequence;
      frames.set(id, callback);
      return id;
    },
    cancel(id: number) {
      frames.delete(id);
    },
    step() {
      const next = frames.entries().next().value as
        | [number, () => void]
        | undefined;
      if (!next) throw new Error('no direct-entry frame queued');
      frames.delete(next[0]);
      next[1]();
    }
  };
}

describe('shell-owned phone direct-entry positioning', () => {
  it('positions the lazy document target before activating its run', () => {
    const frames = scheduler();
    let target: { getBoundingClientRect(): { top: number } } | null = null;
    let top = 120;
    let scrollY = 40;
    const scrollTo = vi.fn((next: number) => {
      scrollY = next;
      top = 0;
    });
    const ready = vi.fn();
    createPhoneDirectEntryPositioner({
      target: () => target as HTMLElement | null,
      scrollY: () => scrollY,
      scrollTo,
      requestFrame: frames.request,
      cancelFrame: frames.cancel,
      onReady: ready,
      maxFrames: 12
    });

    frames.step();
    expect(ready).not.toHaveBeenCalled();
    target = { getBoundingClientRect: () => ({ top }) };
    frames.step();
    expect(scrollTo).toHaveBeenCalledWith(160);
    expect(ready).not.toHaveBeenCalled();
    frames.step();
    frames.step();

    expect(ready).toHaveBeenCalledTimes(1);
  });

  it('is bounded and releases the pending run to its retryable lifecycle', () => {
    const frames = scheduler();
    const ready = vi.fn();
    createPhoneDirectEntryPositioner({
      target: () => null,
      scrollY: () => 0,
      scrollTo: vi.fn(),
      requestFrame: frames.request,
      cancelFrame: frames.cancel,
      onReady: ready,
      maxFrames: 2
    });

    frames.step();
    frames.step();

    expect(ready).toHaveBeenCalledTimes(1);
  });

  it('positions a shell-owned offset inside a long document target', () => {
    const frames = scheduler();
    let scrollY = 0;
    let top = 120;
    const target = {
      getBoundingClientRect: () => ({ top, height: 300 })
    } as HTMLElement;
    const scrollTo = vi.fn((next: number) => {
      scrollY = next;
      top = -200;
    });
    const ready = vi.fn();
    createPhoneDirectEntryPositioner({
      target: () => target,
      targetOffset: () => 200,
      scrollY: () => scrollY,
      scrollTo,
      requestFrame: frames.request,
      cancelFrame: frames.cancel,
      onReady: ready
    });

    frames.step();
    expect(scrollTo).toHaveBeenCalledWith(320);
    frames.step();
    frames.step();
    expect(ready).toHaveBeenCalledTimes(1);
  });
});
