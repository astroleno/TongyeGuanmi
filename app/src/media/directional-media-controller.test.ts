import { describe, expect, it, vi } from 'vitest';
import { createDirectionalMediaController } from './directional-media-controller';

type Listener = () => void;

class FakeClassList {
  private readonly values = new Set<string>();

  add(value: string): void { this.values.add(value); }
  remove(value: string): void { this.values.delete(value); }
  contains(value: string): boolean { return this.values.has(value); }
}

class FakeVideo {
  readonly classList = new FakeClassList();
  readonly dataset: Record<string, string> = {};
  duration = 2.5;
  preload = 'metadata';
  paused = true;
  seeking = false;
  loop = false;
  muted = true;
  playsInline = true;
  playbackRate = 1;
  load = vi.fn();
  play = vi.fn(async () => { this.paused = false; });
  pause = vi.fn(() => { this.paused = true; });
  private time = 0;
  private frameCallback: (() => void) | undefined;
  private readonly listeners = new Map<string, Set<Listener>>();

  get currentTime(): number { return this.time; }
  set currentTime(value: number) {
    this.time = value;
    this.seeking = true;
  }

  addEventListener(type: string, listener: Listener): void {
    const listeners = this.listeners.get(type) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  requestVideoFrameCallback(callback: () => void): number {
    this.frameCallback = callback;
    return 1;
  }

  cancelVideoFrameCallback(): void {
    this.frameCallback = undefined;
  }

  presentRequestedFrame(): void {
    this.seeking = false;
    for (const listener of this.listeners.get('seeked') ?? []) {
      listener();
    }
    const callback = this.frameCallback;
    this.frameCallback = undefined;
    callback?.();
  }
}

const element = (video: FakeVideo) => video as unknown as HTMLVideoElement;

function input(surface: string, runId: string, direction: 1 | -1, progress: number) {
  return {
    surface,
    runId,
    direction,
    progress,
    durationFallbackSeconds: 2.5,
    timelineDurationMs: 2500,
    mode: 'native-preferred' as const,
    nativePlaybackDirection: 1 as const
  };
}

describe('directional media controller', () => {
  it('keeps the old surface active until the fixed opposing frame is presented', async () => {
    const forward = new FakeVideo();
    const reverse = new FakeVideo();
    forward.classList.add('is-active');
    const controller = createDirectionalMediaController({
      surfaces: {
        forward: element(forward),
        reverse: element(reverse)
      }
    });
    const request = input('reverse', 'directional:1', -1, 0);
    const preparing = controller.prepare(request);

    expect(controller.snapshot()).toMatchObject({
      activeSurface: 'forward',
      surfaces: { reverse: { status: 'preparing' } }
    });
    expect(forward.classList.contains('is-active')).toBe(true);
    expect(reverse.classList.contains('is-active')).toBe(false);
    expect(reverse.play).not.toHaveBeenCalled();

    reverse.presentRequestedFrame();
    await expect(preparing).resolves.toMatchObject({ status: 'ready' });
    expect(reverse.play).not.toHaveBeenCalled();

    controller.activate(request);
    expect(forward.classList.contains('is-active')).toBe(false);
    expect(reverse.classList.contains('is-active')).toBe(true);
    expect(reverse.play).toHaveBeenCalledOnce();
    expect(controller.snapshot()).toMatchObject({
      activeSurface: 'reverse',
      surfaces: {
        forward: { status: 'parked' },
        reverse: { status: 'active' }
      }
    });
  });

  it('drives only an active surface without reloading or reactivating it per frame', async () => {
    const forward = new FakeVideo();
    const reverse = new FakeVideo();
    forward.classList.add('is-active');
    const controller = createDirectionalMediaController({
      surfaces: { forward: element(forward), reverse: element(reverse) }
    });
    const request = input('forward', 'directional:2', 1, 0);
    const preparing = controller.prepare(request);
    forward.presentRequestedFrame();
    await preparing;
    controller.activate(request);
    const loadCalls = forward.load.mock.calls.length;

    for (const progress of [0.2, 0.4, 0.6]) {
      controller.drive({ ...request, progress });
    }

    expect(forward.load).toHaveBeenCalledTimes(loadCalls);
    expect(forward.classList.contains('is-active')).toBe(true);
    expect(() => controller.drive(input('reverse', 'directional:2', 1, 0.2)))
      .toThrow(/not active/i);
  });

  it('marks superseded preparation stale and cannot activate it', async () => {
    const forward = new FakeVideo();
    const reverse = new FakeVideo();
    forward.classList.add('is-active');
    const controller = createDirectionalMediaController({
      surfaces: { forward: element(forward), reverse: element(reverse) }
    });
    const staleRequest = input('reverse', 'directional:3', -1, 0);
    const stale = controller.prepare(staleRequest);
    const currentRequest = input('reverse', 'directional:4', -1, 0.25);
    const current = controller.prepare(currentRequest);

    reverse.presentRequestedFrame();
    reverse.presentRequestedFrame();

    await expect(stale).resolves.toMatchObject({ status: 'stale' });
    await expect(current).resolves.toMatchObject({ status: 'ready' });
    expect(() => controller.activate(staleRequest)).toThrow(/not ready/i);
    controller.activate(currentRequest);
    expect(controller.snapshot().activeSurface).toBe('reverse');
  });

  it('parks and disposes every surface idempotently', () => {
    const forward = new FakeVideo();
    const reverse = new FakeVideo();
    forward.classList.add('is-active');
    const controller = createDirectionalMediaController({
      surfaces: { forward: element(forward), reverse: element(reverse) }
    });

    controller.park('forward');
    controller.park('forward');
    controller.dispose();
    controller.dispose();

    expect(forward.preload).toBe('metadata');
    expect(forward.classList.contains('is-active')).toBe(false);
    expect(controller.snapshot().disposed).toBe(true);
  });
});
