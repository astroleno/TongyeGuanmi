import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ttgAnimationScene } from '../scenes/ttg-animation';
import { storyManifest } from '../story/manifest';
import { verifySegmentTimeline } from '../story/verifySegmentTimeline';
import { createServicesTtgTransition } from './services-ttg';
import { createTtgLabTransition } from './ttg-lab';
import type { LayerHandle, LayerVisibilityState, SceneId, SegmentId, SpineSegmentNode, TransitionContext, TransitionModule } from '../story/types';
import { createBackHalfDomContext, FakeCanvas, FakeVideo } from './__fixtures__/back-half.fixture';

const stylesheet = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

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
    runId: 'r4-g5-test:1',
    prepareToken: 'r4-g5-test:prepare:1',
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
    id: 'services-ttg',
    from: 'services',
    to: 'ttg-animation',
    create: createServicesTtgTransition
  },
  {
    id: 'ttg-lab',
    from: 'ttg-animation',
    to: 'lab',
    create: createTtgLabTransition
  }
];

describe('R4 group5 transitions', () => {
  it('removes the TTG scene vignette instead of compensating for it in the transition', () => {
    expect(stylesheet).not.toContain('.r4-ttg-animation .ttg-field::after');
  });

  it('plays TTG to its terminal frame, pauses, then runs a motionless Ink reveal to Lab', async () => {
    const fixture = createBackHalfDomContext('ttg-lab', 'ttg-animation', 'lab');
    const forwardVideo = new FakeVideo();
    const reverseVideo = new FakeVideo();
    const canvas = new FakeCanvas();
    fixture.fromRoot.connect('[data-ttg-figure-video]', forwardVideo);
    fixture.fromRoot.connect('[data-ttg-figure-video-reverse]', reverseVideo);
    vi.stubGlobal('document', { createElement: () => canvas });

    const ttgLab = segment('ttg-lab');
    expect(ttgLab.policy).toMatchObject({
      kind: 'stagedSnap',
      stops: [0.676],
      playMs: [2500, 1200]
    });
    expect(ttgLab.mediaPlayback?.[0]?.reverse).toEqual({ mode: 'play', required: true });
    if (ttgLab.policy.kind !== 'stagedSnap') {
      throw new Error('ttg-lab must be staged');
    }
    const stop = ttgLab.policy.stops[0] ?? 0;
    const timeline = await createTtgLabTransition().buildTimeline(fixture.context);

    timeline.progress(stop / 2);
    expect(Number(fixture.fromRoot.dataset.ttgProgress)).toBeGreaterThan(0);
    expect(Number(fixture.fromRoot.dataset.ttgProgress)).toBeLessThan(1);
    expect(canvas.dataset.r4InkProgress).toBe('0.0000');
    expect(fixture.toLayer.visibility.visible).toBe(false);

    timeline.progress(stop);
    expect(fixture.fromRoot.dataset.ttgProgress).toBe('1.0000');
    expect(canvas.dataset.r4InkProgress).toBe('0.0000');
    expect(timeline.pauses).toEqual(['stage:0']);

    timeline.progress((stop + 1) / 2);
    expect(fixture.fromRoot.dataset.ttgProgress).toBe('1.0000');
    expect(fixture.toRoot.dataset.labProgress).toBe('1.0000');
    expect(fixture.toRoot.style.getPropertyValue('--r4-lab-y')).toBe('0.00px');
    expect(canvas.dataset.r4InkProgress).toBe('0.5000');

    timeline.progress(stop / 2);
    expect(fixture.fromRoot.dataset.ttgPlaybackDirection).toBe('-1');
    expect(reverseVideo.playCalls).toBeGreaterThan(0);
    expect(reverseVideo.currentTime).toBeCloseTo(reverseVideo.duration * 0.5, 3);
    expect(reverseVideo.playbackRate).toBeCloseTo(1, 3);
  });

  it('falls back to timeline-aligned TTG frames when native playback is rejected', async () => {
    class RejectingVideo extends FakeVideo {
      override play(): Promise<void> {
        this.playCalls += 1;
        this.paused = true;
        return Promise.reject(new Error('autoplay denied'));
      }
    }
    const fixture = createBackHalfDomContext('ttg-lab', 'ttg-animation', 'lab');
    const forwardVideo = new RejectingVideo();
    const reverseVideo = new RejectingVideo();
    const canvas = new FakeCanvas();
    fixture.fromRoot.connect('[data-ttg-figure-video]', forwardVideo);
    fixture.fromRoot.connect('[data-ttg-figure-video-reverse]', reverseVideo);
    vi.stubGlobal('document', { createElement: () => canvas });
    const policy = segment('ttg-lab').policy;
    const stop = policy.kind === 'stagedSnap'
      ? policy.stops[0] ?? 0
      : 0;
    const timeline = await createTtgLabTransition().buildTimeline(fixture.context);

    timeline.progress(stop * 0.2);
    await Promise.resolve();
    timeline.progress(stop * 0.4);

    expect(forwardVideo.currentTime).toBeCloseTo(forwardVideo.duration * 0.4, 3);
    expect(fixture.fromRoot.dataset.ttgPlaybackFallback).toBe('true');
  });

  it('keeps the TTG media and milestone contracts equal to the manifest', () => {
    const transition = createTtgLabTransition();
    const manifestSegment = segment('ttg-lab');

    expect(transition.requiredMilestones).toEqual(['targetReady', 'mediaReady', 'buildReady']);
    expect(transition.mediaPlayback).toEqual(manifestSegment.mediaPlayback);
    expect(transition.mediaPlayback?.[0]?.media).toEqual([
      'ttg_figure-alpha-scrub',
      'ttg_figure-alpha-scrub-reverse'
    ]);
  });

  it('keys and registers both TTG playback directions for the readiness gate', () => {
    const markup = renderToStaticMarkup(createElement(ttgAnimationScene.Component, {
      scene: 'ttg-animation',
      hidden: false
    }));

    expect(ttgAnimationScene.requiredHandles).toEqual(['field', 'figure-video', 'figure-video-reverse']);
    expect(markup).toContain('data-media-key="ttg_figure-alpha-scrub"');
    expect(markup).toContain('data-media-key="ttg_figure-alpha-scrub-reverse"');
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
