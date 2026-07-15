import { describe, expect, it } from 'vitest';
import { hiddenVisibility, holdVisibility } from '../../pilot/visibility';
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
  const dataset: Record<string, string> = {};
  const element = scene === 'aod-animation'
    ? ({
        dataset,
        matches: (selector: string) => selector === '[data-aod-transition]',
        querySelector: () => null,
        removeAttribute(name: string) {
          if (name.startsWith('data-')) {
            const key = name.slice(5).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
            delete dataset[key];
          }
        },
        setAttribute(name: string, value: string) {
          if (name.startsWith('data-')) {
            const key = name.slice(5).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
            dataset[key] = value;
          }
        },
        style: {
          zIndex: '',
          setProperty() {}
        }
      } as unknown as HTMLElement)
    : null;
  return {
    scene,
    role,
    element,
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

function visibleScenes(context: TransitionContext): string[] {
  return [context.from, context.to]
    .filter((candidate) => candidate.visibility.visible && candidate.visibility.opacity > 0)
    .map((candidate) => candidate.scene);
}

describe('AOD Method transition media contract', () => {
  it('uses the same presented timeline mapping in both directions', () => {
    const contract = createAodMethodTopTransition().mediaPlayback?.[0];

    expect(contract?.forward).toMatchObject({ mode: 'timeline', required: true });
    expect(contract?.reverse).toMatchObject({ mode: 'timeline', required: true });
  });

  it('keeps cold reverse preparation pending until the terminal AOD frame is presented', async () => {
    const video = new DeferredVideo();
    const context = reverseContext();
    const build = Promise.resolve(createAodMethodTopTransition({
      getVideo: () => video as unknown as HTMLVideoElement
    }).buildTimeline(context));
    let resolved = false;
    void build.then(() => { resolved = true; });

    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(video.dataset.timelineVideoDirection).toBe('-1');

    video.presentRequestedFrame();
    const timeline = await build;
    expect(context.from.element?.style.zIndex).toBe('70');
    expect(context.from.element?.dataset.r4TransitionElevated).toBe('true');

    for (const progress of [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0]) {
      timeline.progress(progress);
      video.presentRequestedFrame();
    }

    const presented = video.currentTimeWrites.slice(-11);
    expect(presented[0]).toBeCloseTo(2.567, 3);
    expect(presented.at(-1)).toBe(0);
    expect(new Set(presented).size).toBe(11);
    for (let index = 1; index < presented.length; index += 1) {
      expect(presented[index - 1]).toBeGreaterThan(presented[index] ?? 0);
    }
    timeline.dispose();
    expect(context.from.element?.style.zIndex).toBe('');
    expect(context.from.element?.dataset.r4TransitionElevated).toBeUndefined();
  });

  it('keeps the AOD endpoint visually stable from reverse completion through settle and hold', async () => {
    const context = { ...reverseContext(), prefersReducedMotion: true };
    const timeline = await createAodMethodTopTransition().buildTimeline(context);

    await timeline.reverse();
    expect(visibleScenes(context)).toEqual(['aod-animation']);

    timeline.dispose();
    expect(context.from.element?.style.zIndex).toBe('');
    expect(visibleScenes(context)).toEqual(['aod-animation']);

    context.from.setVisibility(holdVisibility());
    context.to.setVisibility(hiddenVisibility());
    expect(visibleScenes(context)).toEqual(['aod-animation']);
  });

  it('rejects failed reverse endpoint preparation instead of manufacturing an AOD completion', async () => {
    class FailingVideo extends DeferredVideo {
      override get currentTime(): number { return super.currentTime; }
      override set currentTime(_value: number) { throw new Error('seek failed'); }
    }
    const video = new FailingVideo();

    await expect(Promise.resolve(createAodMethodTopTransition({
      getVideo: () => video as unknown as HTMLVideoElement
    }).buildTimeline(reverseContext()))).rejects.toThrow(/seek failed/);
    expect(video.dataset.timelineVideoFrameReady).toBeUndefined();
  });
});
