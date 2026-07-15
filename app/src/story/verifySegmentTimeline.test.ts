import { describe, expect, it } from 'vitest';
import { createSyntheticTransitionModule, SyntheticSegmentTimeline, syntheticCopyCue } from './synthetic-modules';
import { verifySegmentTimeline } from './verifySegmentTimeline';
import type { LayerHandle, LayerVisibilityState, SpineSegmentNode, TransitionContext } from './types';

function layer(scene: 'hero' | 'pattern', role: 'current' | 'next'): LayerHandle {
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
    get visibility() {
      return visibility;
    },
    setVisibility(next) {
      visibility = next;
    },
    dispose() {
      visibility = {
        mounted: false,
        visible: false,
        inert: true,
        opacity: 0,
        pointerEvents: 'none'
      };
    }
  };
}

function segment(policy: SpineSegmentNode['policy'] = { kind: 'snap', chargeThreshold: 0.1 }): SpineSegmentNode {
  return {
    kind: 'segment',
    id: 'hero-pattern',
    from: 'hero',
    to: 'pattern',
    policy,
    virtualDuration: 120,
    copyCue: syntheticCopyCue
  };
}

function context(policy?: SpineSegmentNode['policy']): TransitionContext {
  return {
    segment: segment(policy),
    from: layer('hero', 'current'),
    to: layer('pattern', 'next'),
    stage: {
      getLayer: () => undefined,
      ensureLayer: (scene, role) => layer(scene as 'hero' | 'pattern', role === 'current' ? 'current' : 'next'),
      releaseLayer: () => undefined,
      snapshot: () => []
    },
    direction: 1,
    runId: 'epoch:1',
    prepareToken: 'epoch:prepare:1',
    prefersReducedMotion: false,
    reportMilestone: () => undefined
  };
}

class PresentationStyle {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  item(index: number): string {
    return [...this.values.keys()][index] ?? '';
  }

  getPropertyValue(name: string): string {
    return this.values.get(name) ?? '';
  }

  setProperty(name: string, value: string): void {
    this.values.set(name, value);
  }
}

class PresentationElement {
  readonly style = new PresentationStyle();
  readonly dataset: Record<string, string> = {};
  readonly children: PresentationElement[] = [];
  textContent = '';

  constructor(readonly tagName = 'DIV') {}

  append(child: PresentationElement): void {
    this.children.push(child);
  }

  querySelectorAll(selector: string): PresentationElement[] {
    const nodes = this.children.flatMap((child) => [child, ...child.querySelectorAll('*')]);
    if (selector === '*') {
      return nodes;
    }
    return nodes.filter((node) => node.tagName.toLowerCase() === selector.toLowerCase());
  }
}

class PresentationVideo extends PresentationElement {
  readonly src = '/scene.webm';
  readonly currentSrc = '/scene.webm';
  currentTime = 0;
  paused = true;
  playbackRate = 1;
  loop = false;

  constructor() {
    super('VIDEO');
  }
}

function presentationSample(progress: number) {
  const shown = { mounted: true, visible: true, inert: true, opacity: 1, pointerEvents: 'none' as const };
  const hidden = { mounted: true, visible: false, inert: true, opacity: 0, pointerEvents: 'none' as const };
  if (progress <= 0.001) {
    return { from: shown, to: hidden };
  }
  if (progress >= 0.999) {
    return { from: hidden, to: shown };
  }
  return { from: shown, to: shown };
}

function presentationTimeline(options: {
  reverseDrift?: boolean;
  disposeDriftAt?: 0 | 1;
} = {}) {
  const fromRoot = new PresentationElement();
  const toRoot = new PresentationElement();
  const fromVideo = new PresentationVideo();
  const toVideo = new PresentationVideo();
  fromRoot.append(fromVideo);
  toRoot.append(toVideo);
  let previousProgress = 0;
  let reversing = false;
  let currentProgress = 0;

  const render = (progress: number) => {
    const clamped = Math.min(1, Math.max(0, progress));
    reversing ||= clamped < previousProgress;
    previousProgress = clamped;
    currentProgress = clamped;
    for (const [root, video] of [[fromRoot, fromVideo], [toRoot, toVideo]] as const) {
      root.style.setProperty('--scene-brightness', '0.92');
      root.style.setProperty('filter', 'brightness(0.92)');
      root.dataset.sceneProgress = clamped.toFixed(4);
      video.currentTime = clamped;
    }
    if (options.reverseDrift && reversing && clamped === 0.5) {
      toRoot.style.setProperty('--scene-brightness', '0.74');
      toRoot.style.setProperty('filter', 'brightness(0.74)');
      toVideo.currentTime = 0.25;
    }
  };
  render(0);

  return {
    play: async () => undefined,
    progress: render,
    reverse: async () => undefined,
    jumpToEnd: (direction: 1 | -1) => render(direction === 1 ? 1 : 0),
    dispose() {
      if (options.disposeDriftAt === currentProgress) {
        const root = currentProgress === 0 ? fromRoot : toRoot;
        const video = currentProgress === 0 ? fromVideo : toVideo;
        root.style.setProperty('--scene-brightness', '0.74');
        root.style.setProperty('filter', 'brightness(0.74)');
        video.currentTime = 0;
      }
    },
    labels: { start: 0, end: 1 },
    sample: presentationSample,
    rootIdentity: () => ({
      from: fromRoot as unknown as HTMLElement,
      to: toRoot as unknown as HTMLElement
    })
  };
}

describe('verifySegmentTimeline', () => {
  it('accepts the synthetic transition labels, endpoints and copyCue threshold', async () => {
    const transition = createSyntheticTransitionModule();
    const timeline = await transition.buildTimeline(context());

    expect(verifySegmentTimeline(timeline, { copyCueAtProgress: syntheticCopyCue.atProgress })).toMatchObject({
      maxVisibleLayers: 2,
      copyCueCrossed: true,
      stableSceneIdentity: false,
      presentationSymmetric: false,
      disposeInvariant: false,
      disposedEndpoints: []
    });
  });

  it('verifies stagedSnap pause labels', () => {
    const policy = {
      kind: 'stagedSnap',
      stops: [0.5],
      playMs: [80, 80],
      advance: [{ kind: 'gesture' }]
    } as const;
    const timeline = new SyntheticSegmentTimeline(context(policy), { stagedStops: policy.stops });

    expect(verifySegmentTimeline(timeline, { policy, copyCueAtProgress: syntheticCopyCue.atProgress }).stagedPauses).toEqual([
      'stage:0'
    ]);
  });

  it('keeps copyCue activation idempotent across 0 to 1 to 0 to 1 progress', () => {
    const timeline = new SyntheticSegmentTimeline(context());

    timeline.progress(0);
    timeline.progress(1);
    expect(timeline.snapshot.copyCueActive).toBe(true);
    timeline.progress(0);
    expect(timeline.snapshot.copyCueActive).toBe(false);
    timeline.progress(1);

    expect(timeline.snapshot.copyCueActive).toBe(true);
    expect(timeline.snapshot.copyCueActivations).toBe(1);
  });

  it('fails blank-frame timelines', () => {
    const timeline = new SyntheticSegmentTimeline(context());
    const blankSample = () => ({
      from: { mounted: true, visible: false, inert: true, opacity: 0, pointerEvents: 'none' as const },
      to: { mounted: true, visible: false, inert: true, opacity: 0, pointerEvents: 'none' as const }
    });
    const blankTimeline = {
      play: timeline.play.bind(timeline),
      progress: timeline.progress.bind(timeline),
      reverse: timeline.reverse.bind(timeline),
      jumpToEnd: timeline.jumpToEnd.bind(timeline),
      dispose: timeline.dispose.bind(timeline),
      labels: { start: 0, end: 1 },
      sample: blankSample
    };

    expect(() => verifySegmentTimeline(blankTimeline)).toThrow(/blank frame/);
  });

  it('rejects a timeline that swaps either canonical Scene root', () => {
    const timeline = new SyntheticSegmentTimeline(context());
    const fromRoot = {} as HTMLElement;
    const toRoot = {} as HTMLElement;
    let sampled = false;
    const replacingTimeline = {
      ...timeline,
      play: timeline.play.bind(timeline),
      progress(value: number) {
        sampled = value > 0;
        timeline.progress(value);
      },
      reverse: timeline.reverse.bind(timeline),
      jumpToEnd: timeline.jumpToEnd.bind(timeline),
      dispose: timeline.dispose.bind(timeline),
      labels: timeline.labels,
      sample: timeline.sample.bind(timeline),
      rootIdentity: () => ({ from: fromRoot, to: sampled ? ({} as HTMLElement) : toRoot })
    };

    expect(() => verifySegmentTimeline(replacingTimeline, { requireStableSceneIdentity: true })).toThrow(
      /replaced a canonical Scene root/
    );
  });

  it('rejects traversal-dependent samples that are not reverse symmetric', () => {
    const timeline = new SyntheticSegmentTimeline(context());
    let previousProgress = 0;
    let reversing = false;
    const asymmetricTimeline = {
      play: timeline.play.bind(timeline),
      progress(value: number) {
        reversing ||= value < previousProgress;
        previousProgress = value;
        timeline.progress(value);
      },
      reverse: timeline.reverse.bind(timeline),
      jumpToEnd: timeline.jumpToEnd.bind(timeline),
      dispose: timeline.dispose.bind(timeline),
      labels: timeline.labels,
      sample(progress: number) {
        const sample = timeline.sample(progress);
        return reversing && progress === 0.5
          ? { ...sample, to: { ...sample.to, opacity: 0.75 } }
          : sample;
      }
    };

    expect(() => verifySegmentTimeline(asymmetricTimeline)).toThrow(/reverse symmetry/);
  });

  it('rejects reverse traversal that changes CSS variables, filter, or media time', () => {
    const timeline = presentationTimeline({ reverseDrift: true });
    const options = {
      requireStableSceneIdentity: true,
      requirePresentation: true
    };

    expect(() => verifySegmentTimeline(timeline, options)).toThrow(/presentation reverse symmetry/);
  });

  it('rejects p=1 disposal that changes the visible endpoint presentation', () => {
    const timeline = presentationTimeline();
    const options = {
      requireStableSceneIdentity: true,
      requirePresentation: true,
      disposeEndpointTimelines: {
        start: presentationTimeline(),
        end: presentationTimeline({ disposeDriftAt: 1 })
      }
    };

    expect(() => verifySegmentTimeline(timeline, options)).toThrow(/p=1 dispose presentation invariance/);
  });

  it('verifies dispose presentation independently at p=0 and p=1', () => {
    const timeline = presentationTimeline();
    const options = {
      requireStableSceneIdentity: true,
      requirePresentation: true,
      disposeEndpointTimelines: {
        start: presentationTimeline(),
        end: presentationTimeline()
      }
    };

    expect(verifySegmentTimeline(timeline, options)).toMatchObject({
      presentationSymmetric: true,
      disposeInvariant: true,
      disposedEndpoints: [0, 1]
    });
  });

  it('requires both dispose probes to be independent from the traversal timeline', () => {
    const timeline = presentationTimeline();

    expect(() => verifySegmentTimeline(timeline, {
      requirePresentation: true,
      disposeEndpointTimelines: {
        start: timeline,
        end: presentationTimeline()
      }
    })).toThrow(/independent from the traversal timeline/);
  });

  it('rejects transition canvases that are not declared effect-only', () => {
    const timeline = new SyntheticSegmentTimeline(context());
    const effectCanvas = {
      dataset: { r4InkEffectOnly: 'false' },
      parentElement: {}
    } as unknown as HTMLCanvasElement;
    const capturedTimeline = {
      play: timeline.play.bind(timeline),
      progress: timeline.progress.bind(timeline),
      reverse: timeline.reverse.bind(timeline),
      jumpToEnd: timeline.jumpToEnd.bind(timeline),
      dispose: timeline.dispose.bind(timeline),
      labels: timeline.labels,
      sample: timeline.sample.bind(timeline),
      effectCanvases: () => [effectCanvas]
    };
    const options = {
      requireEffectOnlyCanvas: true
    };

    expect(() => verifySegmentTimeline(capturedTimeline, options)).toThrow(/effect-only/);
  });
});
