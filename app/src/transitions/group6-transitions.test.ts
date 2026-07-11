import { afterEach, describe, expect, it, vi } from 'vitest';
import { storyManifest } from '../story/manifest';
import { verifySegmentTimeline } from '../story/verifySegmentTimeline';
import { createLabPhTransition } from './lab-ph';
import { createPhEducationTransition, PH_EDUCATION_ANIMATION_STOP } from './ph-education';
import { PH_PLAYBACK_MS } from '../scenes/ph-animation';
import type { LayerHandle, LayerVisibilityState, SceneId, SegmentId, SpineSegmentNode, TransitionContext, TransitionModule } from '../story/types';
import { createBackHalfDomContext, FakeCanvas, FakeVideo } from './__fixtures__/back-half.fixture';

afterEach(() => {
  vi.unstubAllGlobals();
});

function layer(scene: SceneId, role: 'current' | 'next'): LayerHandle {
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
      visibility = { mounted: false, visible: false, inert: true, opacity: 0, pointerEvents: 'none' };
    }
  };
}

function segment(id: SegmentId): SpineSegmentNode {
  const found = storyManifest.nodes.find((node): node is SpineSegmentNode => node.kind === 'segment' && node.id === id);
  if (!found) {
    throw new Error(`${id} segment missing`);
  }
  return structuredClone(found);
}

function context(segmentId: SegmentId, from: SceneId, to: SceneId, prefersReducedMotion = false): TransitionContext {
  return {
    segment: segment(segmentId),
    from: layer(from, 'current'),
    to: layer(to, 'next'),
    stage: {
      getLayer: () => undefined,
      ensureLayer: (scene, role) => layer(scene, role === 'current' ? 'current' : 'next'),
      releaseLayer: () => undefined,
      snapshot: () => []
    },
    direction: 1,
    runId: 'r4-g6-test:1',
    prepareToken: 'r4-g6-test:prepare:1',
    prefersReducedMotion,
    reportMilestone: () => undefined
  };
}

const cases: readonly {
  id: SegmentId;
  from: SceneId;
  to: SceneId;
  create: () => TransitionModule;
}[] = [
  {
    id: 'lab-ph',
    from: 'lab',
    to: 'ph-animation',
    create: createLabPhTransition
  },
  {
    id: 'ph-education',
    from: 'ph-animation',
    to: 'education',
    create: createPhEducationTransition
  }
];

describe('R4 group6 transitions', () => {
  it('uses one top-down Ink reveal for Lab to PH with no radial receiver clip', async () => {
    const fixture = createBackHalfDomContext('lab-ph', 'lab', 'ph-animation');
    const canvas = new FakeCanvas();
    vi.stubGlobal('document', { createElement: () => canvas });
    const timeline = await createLabPhTransition().buildTimeline(fixture.context);
    const receiver = fixture.stage.children[1]!;

    timeline.progress(0.5);

    expect(receiver.dataset.r4RevealMode).toBe('live-clip');
    expect(receiver.style.clipPath).toMatch(/^polygon\(/);
    expect(receiver.style.clipPath).not.toContain('inset(');
    expect(receiver.dataset.r4InkBoundaryKind).toBe('horizontal');
    expect(receiver.dataset.r4InkBoundaryOrigin).toBe('0.5000,0.0000');
    expect(receiver.dataset.r4InkBoundaryRevision).toBe(canvas.dataset.r4InkBoundaryRevision);
    expect(receiver.style.getPropertyValue('mask-image')).toBe('');
    expect(canvas.dataset.r4InkTargetReady).toBeUndefined();
    expect(receiver.dataset.r4Transition).toBe('lab-ph-top-ink');
  });

  it('plays PH to its terminal frame, pauses, then runs a motionless Ink reveal to Education', async () => {
    const fixture = createBackHalfDomContext('ph-education', 'ph-animation', 'education');
    const video = new FakeVideo();
    video.duration = 76 / 30;
    const canvas = new FakeCanvas();
    fixture.fromRoot.connect('[data-ph-alpha-video]', video);
    vi.stubGlobal('document', { createElement: () => canvas });

    const phEducation = segment('ph-education');
    expect(phEducation.policy).toMatchObject({
      kind: 'stagedSnap',
      stops: [PH_EDUCATION_ANIMATION_STOP],
      playMs: [1520, 1200]
    });
    expect(PH_PLAYBACK_MS).toBe(1520);
    expect(PH_EDUCATION_ANIMATION_STOP).toBeCloseTo(1520 / 2720, 6);
    expect(phEducation.mediaPlayback?.[0]?.reverse).toEqual({ mode: 'timeline', required: true });
    if (phEducation.policy.kind !== 'stagedSnap') {
      throw new Error('ph-education must be staged');
    }
    const stop = phEducation.policy.stops[0] ?? 0;
    const timeline = await createPhEducationTransition().buildTimeline(fixture.context);

    timeline.progress(stop / 2);
    const forwardMidTime = video.currentTime;
    expect(Number(fixture.fromRoot.dataset.phProgress)).toBeGreaterThan(0);
    expect(Number(fixture.fromRoot.dataset.phProgress)).toBeLessThan(1);
    expect(canvas.dataset.r4InkProgress).toBe('0.0000');
    expect(fixture.toLayer.visibility.visible).toBe(false);

    timeline.progress(stop);
    expect(fixture.fromRoot.dataset.phProgress).toBe('1.0000');
    expect(canvas.dataset.r4InkProgress).toBe('0.0000');
    expect(timeline.pauses).toEqual(['stage:0']);

    timeline.progress((stop + 1) / 2);
    expect(fixture.fromRoot.dataset.phProgress).toBe('1.0000');
    expect(fixture.toRoot.dataset.educationProgress).toBe('1.0000');
    expect(fixture.toRoot.style.getPropertyValue('--r4-education-y')).toBe('0.00px');
    expect(canvas.dataset.r4InkProgress).toBe('0.5000');
    const receiver = fixture.stage.children[1]!;
    expect(receiver.style.clipPath).toMatch(/^polygon\(/);
    expect(receiver.style.clipPath).not.toContain('inset(');
    expect(receiver.dataset.r4InkBoundaryRevision).toBe(canvas.dataset.r4InkBoundaryRevision);

    timeline.progress(stop / 2);
    expect(video.currentTime).toBeCloseTo(forwardMidTime, 3);
    expect(video.playCalls).toBe(0);
  });

  it('keeps the PH media and milestone contracts equal to the manifest', () => {
    const transition = createPhEducationTransition();
    const manifestSegment = segment('ph-education');

    expect(transition.requiredMilestones).toEqual(['targetReady', 'mediaReady', 'buildReady']);
    expect(transition.mediaPlayback).toEqual(manifestSegment.mediaPlayback);
    expect(transition.mediaPlayback?.[0]?.forward).toEqual({ mode: 'timeline', required: true });
  });

  for (const item of cases) {
    it(`verifies ${item.id} timeline and reduced-motion fallback`, async () => {
      const transition = item.create();
      const timeline = await transition.buildTimeline(context(item.id, item.from, item.to));

      expect(transition.reducedMotionFallback).toBeTypeOf('function');
      expect(verifySegmentTimeline(timeline, { policy: segment(item.id).policy })).toMatchObject({
        maxVisibleLayers: 2
      });
    });

    it(`keeps ${item.id} idempotent across 0 to 1 to 0 to 1`, async () => {
      const timeline = await item.create().buildTimeline(context(item.id, item.from, item.to));

      timeline.progress(0);
      const start = timeline.sample?.(0);
      timeline.progress(1);
      const end = timeline.sample?.(1);
      timeline.progress(0);
      expect(timeline.sample?.(0)).toEqual(start);
      timeline.progress(1);
      expect(timeline.sample?.(1)).toEqual(end);
    });

    it(`collapses ${item.id} duration in reduced motion`, async () => {
      const timeline = await item.create().buildTimeline(context(item.id, item.from, item.to, true));

      await expect(timeline.play(1)).resolves.toBeUndefined();
      expect(timeline.sample?.(1).to.visible).toBe(true);
    });
  }
});
