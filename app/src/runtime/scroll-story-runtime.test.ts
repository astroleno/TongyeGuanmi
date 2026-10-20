import { describe, expect, it, vi } from 'vitest';
import { createScrollSpine, locateScrollPosition } from '../story/scroll-spine';
import { createScrollStoryRuntime, type PreparedScrollWindow, type ScrollIntent, type ScrollStoryAdapter } from './scroll-story-runtime';

const index = createScrollSpine({ viewportHeight: 800 });
const at = (id: string, progress = .5) => {
  const range = index.ranges.find((range) => range.id === id)!;
  return locateScrollPosition(index, range.start + (range.end - range.start) * progress);
};
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
const window = () => ({
  render: vi.fn((position, intent) => ({ progress: position.progress, epoch: intent.epoch, revision: intent.revision })),
  pause: vi.fn(), dispose: vi.fn()
}) satisfies PreparedScrollWindow;

describe('latest-position story runtime', () => {
  it('retires the previous surface before painting the next position, including pending and failed windows', async () => {
    const order: string[] = [];
    const surface = window();
    surface.dispose.mockImplementation(() => { order.push('retire'); });
    surface.render.mockImplementation((p, i) => {
      order.push('render'); return { progress: p.progress, epoch: i.epoch, revision: i.revision };
    });
    const runtime = createScrollStoryRuntime({ prepare: async () => surface }, at('hero-pattern'),
      p => { order.push(`paint:${p.rangeId}`); });
    runtime.connect(); await flush();
    order.length = 0;
    runtime.sample(at('hold:pattern'));
    expect(order).toEqual(['retire', 'paint:hold:pattern']);
    await flush();
    expect(order.slice(-2)).toEqual(['paint:hold:pattern', 'render']);
    runtime.reject(new Error('decode failed'));
    order.length = 0;
    runtime.sample(at('hold:pattern', .8));
    expect(order).toEqual(['paint:hold:pattern']);
    runtime.dispose();
  });
  it('bounds a decoder stalled after its first valid frame and recovers on retry', async () => {
    vi.useFakeTimers();
    const surface = window();
    const runtime = createScrollStoryRuntime({ prepare: async () => surface }, at('hero-pattern', .2));
    runtime.connect(); await flush();
    surface.render.mockImplementation((_p, intent) => ({ progress: .2, epoch: intent.epoch, revision: intent.revision }));
    runtime.sample(at('hero-pattern', .8));
    for (let i = 0; i < 19; i++) { await vi.advanceTimersByTimeAsync(1000); runtime.refresh(); }
    expect(runtime.getSnapshot().status).toBe('ready');
    await vi.advanceTimersByTimeAsync(1000);
    expect(runtime.getSnapshot().status).toBe('failed');
    surface.render.mockImplementation((p, intent) => ({ progress: p.progress, epoch: intent.epoch, revision: intent.revision }));
    runtime.retry(); await flush();
    expect(runtime.diagnostic().presented?.progress).toBeCloseTo(.8);
    expect(runtime.getSnapshot().status).toBe('ready');
    runtime.dispose(); vi.useRealTimers();
  });
  it('bounds a hung resource request, cancels it, and permits a fresh target', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const surface = window();
    const prepare = vi.fn<ScrollStoryAdapter['prepare']>().mockImplementationOnce((_p, _i, current) => {
      signal = current; return new Promise(() => undefined);
    }).mockResolvedValue(surface);
    const runtime = createScrollStoryRuntime({ prepare }, at('hero-pattern'));
    runtime.connect(); await flush();
    await vi.advanceTimersByTimeAsync(20000);
    expect(signal?.aborted).toBe(true);
    expect(runtime.getSnapshot().status).toBe('failed');
    runtime.sample(at('ph-education')); await flush();
    expect(runtime.getSnapshot().status).toBe('ready');
    runtime.dispose(); vi.useRealTimers();
  });
  it('does not play intervening chapters or prepare on every sample', async () => {
    const surface = window();
    const prepare = vi.fn<ScrollStoryAdapter['prepare']>(async () => surface);
    const runtime = createScrollStoryRuntime({ prepare }, at('hero-pattern'));
    runtime.connect(); await flush();
    for (const p of [.6, .7, .8, .2, .65]) runtime.sample(at('hero-pattern', p));
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(runtime.diagnostic().presented?.progress).toBeCloseTo(.65);
    runtime.sample(at('ph-education', .3)); await flush();
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(prepare.mock.calls[1]?.[0]).toMatchObject({ segment: 'ph-education' });
    runtime.dispose();
  });

  it('retires obsolete preparation and renders the latest sample of the new range', async () => {
    const resolvers: Array<(surface: PreparedScrollWindow) => void> = [];
    const signals: AbortSignal[] = [];
    const runtime = createScrollStoryRuntime({ prepare: (_p, _i, signal) => {
      signals.push(signal);
      return new Promise((resolve) => resolvers.push(resolve));
    } }, at('hero-pattern'));
    runtime.connect(); await flush();
    runtime.sample(at('crane-contact', .2)); await flush();
    runtime.sample(at('crane-contact', .65));
    expect(signals[0]?.aborted).toBe(true);
    const old = window(), current = window();
    resolvers[0]!(old); resolvers[1]!(current); await flush();
    expect(old.dispose).toHaveBeenCalledTimes(1);
    expect(old.render).not.toHaveBeenCalled();
    expect(current.render.mock.calls[0]?.[0].progress).toBeCloseTo(.65);
    runtime.dispose();
  });

  it('invalidates old intent frames on reversal without rebuilding media', async () => {
    let frame: ScrollIntent | null = null;
    const surface = window();
    surface.render.mockImplementation((_p, intent) => {
      const accepted = frame ?? intent;
      frame = accepted;
      return { progress: .4, epoch: accepted.epoch, revision: accepted.revision };
    });
    const prepare = vi.fn(async () => surface);
    const runtime = createScrollStoryRuntime({ prepare }, at('hero-pattern', .4));
    runtime.connect(); await flush();
    runtime.sample(at('hero-pattern', .7));
    runtime.sample(at('hero-pattern', .2));
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(runtime.diagnostic().presented).toBeNull();
    expect(runtime.getSnapshot().status).toBe('preparing');
    frame = null; runtime.refresh();
    expect(runtime.getSnapshot().status).toBe('ready');
    runtime.dispose();
  });

  it('allows same-intent decoded frames to lag without starving presentation', async () => {
    let latest: ScrollIntent | null = null;
    const surface = window();
    surface.render.mockImplementation((p, intent) => {
      const previous = latest ?? intent; latest = intent;
      return { progress: p.progress, epoch: previous.epoch, revision: previous.revision };
    });
    const runtime = createScrollStoryRuntime({ prepare: async () => surface }, at('hero-pattern', .1));
    runtime.connect(); await flush();
    for (const p of [.2, .3, .4, .5]) runtime.sample(at('hero-pattern', p));
    expect(runtime.getSnapshot().status).toBe('ready');
    expect(runtime.diagnostic().presented?.revision).toBe(3);
    runtime.dispose();
  });

  it('continues accepting positions after failure and drops hidden-time progression', async () => {
    const surface = window();
    const prepare = vi.fn().mockRejectedValueOnce(new Error('decode failed')).mockResolvedValue(surface);
    const runtime = createScrollStoryRuntime({ prepare }, at('hero-pattern'));
    runtime.connect(); await flush();
    expect(runtime.getSnapshot()).toMatchObject({ status: 'failed', error: 'decode failed' });
    runtime.sample(at('ph-education', .4)); await flush();
    expect(runtime.getSnapshot().status).toBe('ready');
    runtime.suspend();
    expect(surface.pause).toHaveBeenCalledOnce();
    const position = runtime.diagnostic().desired;
    runtime.resume(); await flush();
    expect(runtime.diagnostic().desired).toEqual(position);
    expect(runtime.getSnapshot().status).toBe('ready');
    runtime.dispose();
  });

  it('publishes structure only, not every animation tick, and cleans up stale callbacks', async () => {
    const surface = window();
    const runtime = createScrollStoryRuntime({ prepare: async () => surface }, at('hero-pattern', .1));
    runtime.connect(); await flush();
    const notify = vi.fn(); runtime.subscribe(notify);
    for (const p of [.2, .3, .4]) runtime.sample(at('hero-pattern', p));
    expect(notify).not.toHaveBeenCalled();
    runtime.sample(at('hero-pattern', .6));
    expect(notify).toHaveBeenCalledTimes(1);
    runtime.dispose(); runtime.refresh();
    expect(surface.dispose).toHaveBeenCalledOnce();
  });
});
