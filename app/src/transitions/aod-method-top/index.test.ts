import { describe, expect, it } from 'vitest';
import { storyManifest } from '../../story/manifest';
import type { LayerHandle, LayerVisibilityState, SpineSegmentNode, TransitionContext } from '../../story/types';
import { createAodMethodTopTransition } from '.';

type Listener = () => void;

class DeferredVideo {
  readonly dataset: Record<string, string> = {};
  readonly currentTimeWrites: number[] = [];
  duration = 5.03;
  preload = 'auto';
  paused = true;
  seeking = false;
  loop = false;
  muted = true;
  playsInline = true;
  playbackRate = 1;
  private time = 0;
  private frameCallback: (() => void) | undefined;
  private readonly listeners = new Map<string, Set<Listener>>();

  get currentTime(): number { return this.time; }
  set currentTime(value: number) {
    this.time = value;
    this.currentTimeWrites.push(value);
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
  requestVideoFrameCallback(callback: () => void): number { this.frameCallback = callback; return 1; }
  cancelVideoFrameCallback(): void { this.frameCallback = undefined; }
  pause(): void { this.paused = true; }
  play(): Promise<void> { this.paused = false; return Promise.resolve(); }
  load(): void {}
  presentRequestedFrame(): void {
    for (let attempt = 0; attempt < 3 && this.seeking; attempt += 1) {
      this.seeking = false;
      for (const listener of this.listeners.get('seeked') ?? []) listener();
    }
    const callback = this.frameCallback;
    this.frameCallback = undefined;
    callback?.();
  }
}

function layer(scene: 'aod-animation' | 'method-top', role: 'current' | 'next'): LayerHandle {
  let visibility: LayerVisibilityState = {
    mounted: true,
    visible: role === 'current',
    inert: role !== 'current',
    opacity: role === 'current' ? 1 : 0,
    pointerEvents: role === 'current' ? 'auto' : 'none'
  };
  return {
    scene,
    role,
    element: null,
    get visibility() { return visibility; },
    setVisibility(next) { visibility = next; },
    dispose() {}
  };
}

function reverseContext(): TransitionContext {
  const segment = storyManifest.nodes.find(
    (node): node is SpineSegmentNode => node.kind === 'segment' && node.id === 'aod-method-top'
  );
  if (!segment) throw new Error('aod-method-top segment missing');
  const from = layer('aod-animation', 'next');
  const to = layer('method-top', 'current');
  return {
    segment,
    from,
    to,
    stage: { getLayer: () => undefined, ensureLayer: () => from, releaseLayer() {}, snapshot: () => [] },
    direction: -1,
    runId: 'aod-cold-reverse:1',
    prepareToken: 'aod-cold-reverse:prepare:1',
    prefersReducedMotion: false,
    reportMilestone() {}
  };
}

describe('AOD Method transition media contract', () => {
  it('uses native-preferred forward media and presented timeline reverse media', () => {
    const contract = createAodMethodTopTransition().mediaPlayback?.[0];

    expect(contract?.forward).toMatchObject({ mode: 'play', required: true });
    expect(contract?.reverse).toMatchObject({ mode: 'timeline', required: true });
  });

  it('keeps cold reverse preparation pending until the terminal AOD frame is presented', async () => {
    const video = new DeferredVideo();
    const build = Promise.resolve(createAodMethodTopTransition({
      getVideo: () => video as unknown as HTMLVideoElement
    }).buildTimeline(reverseContext()));
    let resolved = false;
    void build.then(() => { resolved = true; });

    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(video.dataset.timelineVideoDirection).toBe('-1');

    video.presentRequestedFrame();
    const timeline = await build;
    timeline.progress(0.8);
    video.presentRequestedFrame();
    timeline.progress(0.6);
    video.presentRequestedFrame();

    expect(video.currentTimeWrites.at(-3)).toBeGreaterThan(video.currentTimeWrites.at(-2) ?? 0);
    expect(video.currentTimeWrites.at(-2)).toBeGreaterThan(video.currentTimeWrites.at(-1) ?? 0);
  });
});
