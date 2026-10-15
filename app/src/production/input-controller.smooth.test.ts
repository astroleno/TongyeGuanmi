import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachStoryInput } from './input-controller';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function fixture(y = 0) {
  vi.useFakeTimers(); vi.setSystemTime(0);
  let now = 0, id = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const listeners = new Map<string, Set<(event: Event) => void>>();
  const frames = new Map<number, (time: number) => void>();
  const media = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  const port = { clientHeight: 600, scrollHeight: 2600, scrollTop: y, dataset: {} };
  const root = { dataset: { reading: 'true' }, matches: (selector: string) => selector === '[data-reading="true"]', querySelector: () => port };
  vi.stubGlobal('window', {
    innerHeight: 600, matchMedia: () => media,
    requestAnimationFrame: (callback: (time: number) => void) => { frames.set(++id, callback); return id; },
    cancelAnimationFrame: (handle: number) => { frames.delete(handle); },
    addEventListener: (type: string, listener: (event: Event) => void) => {
      const set = listeners.get(type) ?? new Set(); set.add(listener); listeners.set(type, set);
    },
    removeEventListener: (type: string, listener: (event: Event) => void) => listeners.get(type)?.delete(listener)
  });
  let state = 'hold'; let notify = () => {};
  const send = vi.fn();
  const detach = attachStoryInput({
    runtime: { getState: () => ({ state, context: { cursor: { status: 'hold', scene: 'lab' } } }), send,
      subscribe: (callback: () => void) => { notify = callback; return () => {}; }
    } as unknown as Parameters<typeof attachStoryInput>[0]['runtime'],
    getCurrentScene: () => 'lab', getLayerElement: () => root as unknown as HTMLElement
  });
  const emit = (type: string, data = {}) => {
    const event = { cancelable: true, preventDefault: vi.fn(), target: null, ...data } as unknown as Event;
    listeners.get(type)?.forEach((callback) => callback(event)); return event;
  };
  return { port, send, frames, media, detach, emit,
    wheel: (deltaY: number, data = {}) => emit('wheel', { deltaY, deltaMode: 0, ...data }),
    advance: (time: number) => {
      now = time; vi.setSystemTime(time); const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach((callback) => callback(time));
    },
    seek: () => { state = 'seeking'; notify(); }
  };
}

describe('desktop smooth reading ownership', () => {
  it('moves only on frames and allows a long physical stream to read beyond one viewport', () => {
    const f = fixture();
    f.wheel(120); expect(f.port.scrollTop).toBe(0); expect(f.frames.size).toBe(1);
    f.advance(16); expect(f.port.scrollTop).toBeGreaterThan(0); expect(f.port.scrollTop).toBeLessThan(120);
    for (let time = 32; time < 800; time += 16) { f.wheel(20); f.advance(time); }
    expect(f.port.scrollTop).toBeGreaterThan(600); expect(f.send).not.toHaveBeenCalled(); f.detach();
    expect(f.frames.size).toBe(0);
  });
  it('never turns a target or settling frame into a chapter handoff; the next physical gesture can hand off', () => {
    const f = fixture(1900);
    f.wheel(500);
    for (let time = 16; time < 128; time += 16) { f.advance(time); f.wheel(40); }
    expect(f.port.scrollTop).toBeLessThan(2000); expect(f.send).not.toHaveBeenCalled();
    for (let time = 128; time <= 500; time += 16) f.advance(time);
    expect(f.port.scrollTop).toBe(2000); expect(f.send).not.toHaveBeenCalled();
    f.wheel(16); expect(f.send).toHaveBeenCalledOnce();
    expect(f.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'CHARGE_FIRED', direction: 1 })); f.detach();
  });
  it.each(['blur', 'pagehide', 'visibilitychange', 'resize', 'story-reading-entry'])('cancels queued motion on %s', (event) => {
    const f = fixture(); f.wheel(120); f.advance(16); const y = f.port.scrollTop;
    f.emit(event); f.advance(32); expect(f.port.scrollTop).toBe(y); expect(f.frames.size).toBe(0); f.detach();
  });
  it('cancels for navigation and dynamically enabled reduced motion', () => {
    const f = fixture(); f.wheel(120); f.seek(); expect(f.frames.size).toBe(0); f.detach();
    const g = fixture(); g.wheel(120); g.media.matches = true;
    g.media.addEventListener.mock.calls[0]![1](); expect(g.frames.size).toBe(0);
    g.wheel(100); expect(g.port.scrollTop).toBeGreaterThan(0); expect(g.frames.size).toBe(0); g.detach();
  });
  it('leaves browser zoom and already handled wheel events alone', () => {
    const f = fixture(); f.wheel(120, { ctrlKey: true }); f.wheel(120, { defaultPrevented: true });
    expect(f.frames.size).toBe(0); expect(f.port.scrollTop).toBe(0); expect(f.send).not.toHaveBeenCalled(); f.detach();
  });
});
