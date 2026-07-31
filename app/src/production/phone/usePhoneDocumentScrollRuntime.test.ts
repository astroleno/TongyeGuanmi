import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPhoneScrollCorridorRegistry } from './phone-scroll-corridor-registry';
import { createPhoneStorySnapshot } from './phone-story/machine';
import { createPhoneDocumentScrollRuntime } from './usePhoneDocumentScrollRuntime';

type Listener = () => void;

class EventTargetStub {
  private readonly listeners = new Map<string, Listener[]>();

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((candidate) => candidate !== listener)
    );
  }

  emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
}

describe('authority-scoped document scroll runtime', () => {
  afterEach(() => vi.restoreAllMocks());

  it('samples only one selected corridor once per animation frame', () => {
    const page = Object.assign(new EventTargetStub(), {
      scrollY: 240,
      innerWidth: 390,
      innerHeight: 844
    });
    const documentTarget = new EventTargetStub();
    const visualViewport = Object.assign(new EventTargetStub(), { offsetTop: 0 });
    const frames = new Map<number, () => void>();
    const registry = createPhoneScrollCorridorRegistry();
    const heroSample = vi.fn(() => ({
      actualY: 240,
      run: 'hero-pattern-scroll' as const,
      progress: .4,
      direction: 1 as const
    }));
    const brandSample = vi.fn(() => ({ actualY: 240, progress: .8, direction: 1 as const }));
    registry.register({
      id: 'front',
      scenes: ['hero'],
      sample: heroSample,
      boundary: () => 100,
      landing: () => 100
    });
    registry.register({
      id: 'brand',
      scenes: ['brand'],
      sample: brandSample,
      boundary: () => 200,
      landing: () => 200
    });
    const snapshot = createPhoneStorySnapshot({ authorityId: 'a', scene: 'hero' });
    const reportSample = vi.fn();
    let nextFrame = 0;
    const runtime = createPhoneDocumentScrollRuntime({
      page: page as unknown as Window,
      document: documentTarget as unknown as Document,
      visualViewport: visualViewport as unknown as VisualViewport,
      registry,
      getSnapshot: () => snapshot,
      reportSample,
      requestFrame: (callback) => {
        const id = ++nextFrame;
        frames.set(id, callback);
        return id;
      },
      cancelFrame: (id) => frames.delete(id)
    });

    page.emit('scroll');
    page.emit('scroll');
    documentTarget.emit('resize');
    visualViewport.emit('scroll');
    expect(frames).toHaveLength(1);

    const queued = frames.entries().next().value as [number, () => void];
    frames.delete(queued[0]);
    queued[1]();

    expect(heroSample).toHaveBeenCalledOnce();
    expect(brandSample).not.toHaveBeenCalled();
    expect(reportSample).toHaveBeenCalledWith([
      240,
      'front',
      null,
      'hero-pattern-scroll',
      .4,
      1
    ]);
    runtime.dispose();
  });

  it('can synchronously sample a bounded WebKit correction without creating input intent', () => {
    const page = Object.assign(new EventTargetStub(), {
      scrollY: 88,
      innerWidth: 390,
      innerHeight: 844
    });
    const registry = createPhoneScrollCorridorRegistry();
    registry.register({
      id: 'front',
      scenes: ['hero'],
      sample: () => ({ actualY: 88, progress: .1, direction: 1 as const }),
      boundary: () => 100,
      landing: () => 100
    });
    const reportSample = vi.fn();
    const runtime = createPhoneDocumentScrollRuntime({
      page: page as unknown as Window,
      document: new EventTargetStub() as unknown as Document,
      visualViewport: null,
      registry,
      getSnapshot: () => createPhoneStorySnapshot({ authorityId: 'a', scene: 'hero' }),
      reportSample,
      requestFrame: () => 1,
      cancelFrame: () => undefined
    });

    runtime.sampleNow();

    expect(reportSample).toHaveBeenCalledTimes(1);
    expect(reportSample.mock.calls[0]?.[0]).toEqual([
      88,
      'front',
      null,
      null,
      .1,
      1
    ]);
    runtime.dispose();
  });
});
