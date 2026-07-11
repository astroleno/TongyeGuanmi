import { describe, expect, it } from 'vitest';
import { createSyntheticTransitionModule, SyntheticSegmentTimeline, syntheticCopyCue } from './synthetic-modules';
import { verifySegmentTimeline } from './verifySegmentTimeline';
import type { LayerHandle, LayerVisibilityState, SpineSegmentNode, TransitionContext } from './types';
import type { VerifySegmentTimelineOptions } from './verifySegmentTimeline';

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

describe('verifySegmentTimeline', () => {
  it('accepts the synthetic transition labels, endpoints and copyCue threshold', async () => {
    const transition = createSyntheticTransitionModule();
    const timeline = await transition.buildTimeline(context());

    expect(verifySegmentTimeline(timeline, { copyCueAtProgress: syntheticCopyCue.atProgress })).toMatchObject({
      maxVisibleLayers: 2,
      copyCueCrossed: true
    });
  });

  it('verifies stagedSnap pause labels', () => {
    const policy = { kind: 'stagedSnap', stops: [0.5], playMs: [80, 80] } as const;
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

  it('rejects disposal that replaces canonical roots', () => {
    const timeline = new SyntheticSegmentTimeline(context());
    const fromRoot = {} as HTMLElement;
    const toRoot = {} as HTMLElement;
    let disposed = false;
    const disposingTimeline = {
      play: timeline.play.bind(timeline),
      progress: timeline.progress.bind(timeline),
      reverse: timeline.reverse.bind(timeline),
      jumpToEnd: timeline.jumpToEnd.bind(timeline),
      dispose() {
        disposed = true;
        timeline.dispose();
      },
      labels: timeline.labels,
      sample: timeline.sample.bind(timeline),
      rootIdentity: () => ({ from: fromRoot, to: disposed ? ({} as HTMLElement) : toRoot })
    };
    const options = {
      requireStableSceneIdentity: true,
      verifyDisposeInvariance: true
    } as VerifySegmentTimelineOptions & { verifyDisposeInvariance: boolean };

    expect(() => verifySegmentTimeline(disposingTimeline, options)).toThrow(/dispose invariance/);
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
    } as VerifySegmentTimelineOptions & { requireEffectOnlyCanvas: boolean };

    expect(() => verifySegmentTimeline(capturedTimeline, options)).toThrow(/effect-only/);
  });
});
