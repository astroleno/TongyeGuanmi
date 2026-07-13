import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ttgAnimationScene, ttgMediaSnapshot } from '../scenes/ttg-animation';
import { storyManifest } from '../story/manifest';
import { verifySegmentTimeline } from '../story/verifySegmentTimeline';
import { createServicesTtgTransition } from './services-ttg';
import { createTtgLabTransition, TTG_LAB_ANIMATION_STOP } from './ttg-lab';
import type { LayerHandle, LayerVisibilityState, SceneId, SegmentId, SegmentTimelineHandle, SpineSegmentNode, StagedLegPreparation, TransitionContext, TransitionModule } from '../story/types';
import { createBackHalfDomContext, FakeCanvas, FakeElement, FakeVideo } from './__fixtures__/back-half.fixture';

const stylesheet = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

function preparationSignal(): AbortSignal {
  return new AbortController().signal;
}

function connectTtgMedia(
  root: ReturnType<typeof createBackHalfDomContext>['fromRoot'],
  forward: FakeVideo,
  reverse: FakeVideo
): FakeElement {
  const terminal = new FakeElement();
  Object.assign(terminal, { complete: true, naturalWidth: 720 });
  root.connect('[data-ttg-figure-video]', forward);
  root.connect('[data-ttg-figure-video-reverse]', reverse);
  root.connect('[data-ttg-figure-terminal]', terminal);
  return terminal;
}

async function prepareAndCommit(
  timeline: SegmentTimelineHandle,
  leg: StagedLegPreparation
): Promise<void> {
  await timeline.prepareLeg?.(leg);
  timeline.commitLeg?.(leg);
}

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
  it('keeps the chapter-entry Ink on Services to TTG', async () => {
    const fixture = createBackHalfDomContext('services-ttg', 'services', 'ttg-animation');
    const canvas = new FakeCanvas();
    vi.stubGlobal('document', { createElement: () => canvas });
    const timeline = await createServicesTtgTransition().buildTimeline(fixture.context);
    const receiver = fixture.stage.children[1]!;

    timeline.progress(0.5);

    expect(receiver.style.clipPath).toMatch(/^polygon\(/);
    expect(receiver.style.clipPath).not.toContain('inset(');
    expect(receiver.dataset.r4InkBoundaryKind).toBe('horizontal');
    expect(receiver.dataset.r4InkBoundaryRevision).toBe(canvas.dataset.r4InkBoundaryRevision);
    expect(receiver.dataset.r4InkContourThreshold).toBe(canvas.dataset.r4InkContourThreshold);
    timeline.dispose();
  });

  it('removes the TTG scene vignette instead of compensating for it in the transition', () => {
    expect(stylesheet).not.toContain('.r4-ttg-animation .ttg-field::after');
  });

  it('plays TTG to its terminal frame, pauses, then dissolves to Lab without Ink', async () => {
    const fixture = createBackHalfDomContext('ttg-lab', 'ttg-animation', 'lab');
    const forwardVideo = new FakeVideo();
    const reverseVideo = new FakeVideo();
    const canvas = new FakeCanvas();
    connectTtgMedia(fixture.fromRoot, forwardVideo, reverseVideo);
    vi.stubGlobal('document', { createElement: () => canvas });

    const ttgLab = segment('ttg-lab');
    expect(ttgLab.policy).toMatchObject({
      kind: 'stagedSnap',
      stops: [2500 / 3100],
      playMs: [2500, 600]
    });
    expect(ttgLab.mediaPlayback?.[0]?.reverse).toMatchObject({ mode: 'play', required: true });
    if (ttgLab.policy.kind !== 'stagedSnap') {
      throw new Error('ttg-lab must be staged');
    }
    const stop = ttgLab.policy.stops[0] ?? 0;
    const timeline = await createTtgLabTransition().buildTimeline(fixture.context);

    expect((timeline as typeof timeline & { prepareLeg?: unknown }).prepareLeg).toBeTypeOf('function');
    await prepareAndCommit(timeline, {
      runId: fixture.context.runId,
      segment: 'ttg-lab',
      direction: 1,
      legIndex: 0,
      from: 0,
      to: stop,
      durationMs: 2500,
      signal: preparationSignal()
    });

    timeline.progress(stop / 2);
    expect(Number(fixture.fromRoot.dataset.ttgProgress)).toBeGreaterThan(0);
    expect(Number(fixture.fromRoot.dataset.ttgProgress)).toBeLessThan(1);
    expect(canvas.dataset.r4InkProgress).toBeUndefined();
    expect(fixture.toLayer.visibility.visible).toBe(false);

    timeline.progress(stop);
    expect(fixture.fromRoot.dataset.ttgProgress).toBe('1.0000');
    expect(canvas.dataset.r4InkProgress).toBeUndefined();
    expect(timeline.pauses).toEqual(['stage:0']);
    const forwardWritesAtStop = forwardVideo.currentTimeWrites;
    const reverseWritesAtStop = reverseVideo.currentTimeWrites;

    await prepareAndCommit(timeline, {
      runId: fixture.context.runId,
      segment: 'ttg-lab',
      direction: 1,
      legIndex: 1,
      from: stop,
      to: 1,
      durationMs: 600,
      resumedStageIndex: 0,
      signal: preparationSignal()
    });

    timeline.progress((stop + 1) / 2);
    expect(fixture.fromRoot.dataset.ttgProgress).toBe('1.0000');
    expect(fixture.toRoot.dataset.labProgress).toBe('1.0000');
    expect(fixture.toRoot.style.getPropertyValue('--r4-lab-y')).toBe('0.00px');
    expect(fixture.fromLayer.visibility.opacity).toBeCloseTo(0.5, 4);
    expect(fixture.toLayer.visibility.opacity).toBeCloseTo(0.5, 4);
    expect(fixture.fromLayer.visibility.opacity + fixture.toLayer.visibility.opacity).toBeCloseTo(1, 6);
    expect(fixture.stage.children[0]?.dataset.r4Handoff).toBe('dissolve');
    expect(fixture.stage.children[1]?.dataset.r4Handoff).toBe('dissolve');
    expect(canvas.parentElement).toBeNull();
    expect(canvas.dataset.r4InkProgress).toBeUndefined();
    for (const layer of fixture.stage.children) {
      expect(layer.style.clipPath).toBe('');
      expect(layer.style.getPropertyValue('mask-image')).toBe('');
      expect(layer.style.getPropertyValue('transform')).toBe('');
      expect(layer.style.getPropertyValue('filter')).toBe('');
    }
    for (const progress of [(stop + 2) / 3, (stop + 3) / 4]) {
      timeline.progress(progress);
    }
    expect(forwardVideo.currentTimeWrites).toBe(forwardWritesAtStop);
    expect(reverseVideo.currentTimeWrites).toBe(reverseWritesAtStop);

    timeline.progress(1);
    expect(fixture.stage.children[0]?.dataset.r4Handoff).toBeUndefined();
    expect(fixture.stage.children[1]?.dataset.r4Handoff).toBeUndefined();
    timeline.dispose();
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
    connectTtgMedia(fixture.fromRoot, forwardVideo, reverseVideo);
    vi.stubGlobal('document', { createElement: () => canvas });
    const policy = segment('ttg-lab').policy;
    const stop = policy.kind === 'stagedSnap'
      ? policy.stops[0] ?? 0
      : 0;
    const timeline = await createTtgLabTransition().buildTimeline(fixture.context);
    await prepareAndCommit(timeline, {
      runId: fixture.context.runId,
      segment: 'ttg-lab',
      direction: 1,
      legIndex: 0,
      from: 0,
      to: stop,
      durationMs: 2500,
      signal: preparationSignal()
    });

    timeline.progress(stop * 0.2);
    await Promise.resolve();
    await Promise.resolve();
    timeline.progress(stop * 0.4);

    expect(forwardVideo.currentTime).toBeCloseTo((forwardVideo.duration - 0.02) * 0.4, 3);
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
    expect(transition.mediaPlayback?.[0]?.forward.media).toEqual([
      'ttg_figure-alpha-scrub'
    ]);
    expect(transition.mediaPlayback?.[0]?.reverse.media).toEqual([
      'ttg_figure-alpha-scrub-reverse'
    ]);
  });

  it('prepares a cold reverse dissolve and same-run reverse leg without zero-active intervals', async () => {
    class DeferredFrameVideo extends FakeVideo {
      seeking = false;
      private frameCallback: ((now: DOMHighResTimeStamp, metadata: VideoFrameCallbackMetadata) => void) | undefined;
      private readonly listeners = new Map<string, Set<() => void>>();

      override get currentTime(): number {
        return super.currentTime;
      }

      override set currentTime(value: number) {
        super.currentTime = value;
        this.seeking = true;
      }

      override addEventListener(type: string, listener: () => void): void {
        const listeners = this.listeners.get(type) ?? new Set<() => void>();
        listeners.add(listener);
        this.listeners.set(type, listeners);
      }

      override removeEventListener(type: string, listener: () => void): void {
        this.listeners.get(type)?.delete(listener);
      }

      override requestVideoFrameCallback(
        callback: (now: DOMHighResTimeStamp, metadata: VideoFrameCallbackMetadata) => void
      ): number {
        this.frameCallback = callback;
        return 1;
      }

      cancelVideoFrameCallback(): void {
        this.frameCallback = undefined;
      }

      presentRequestedFrame(): void {
        for (let attempt = 0; attempt < 3 && this.seeking; attempt += 1) {
          this.seeking = false;
          for (const listener of this.listeners.get('seeked') ?? []) {
            listener();
          }
        }
        const callback = this.frameCallback;
        this.frameCallback = undefined;
        callback?.(0, {} as VideoFrameCallbackMetadata);
      }
    }

    const fixture = createBackHalfDomContext('ttg-lab', 'ttg-animation', 'lab');
    const forwardVideo = new DeferredFrameVideo();
    const reverseVideo = new DeferredFrameVideo();
    const canvas = new FakeCanvas();
    forwardVideo.classList.add('is-active');
    const terminal = connectTtgMedia(fixture.fromRoot, forwardVideo, reverseVideo);
    vi.stubGlobal('document', { createElement: () => canvas });
    const reverseContext = {
      ...fixture.context,
      direction: -1,
      runId: 'ttg-atomic:1',
      prepareToken: 'ttg-atomic:prepare:1'
    } as const;
    const timeline = await createTtgLabTransition().buildTimeline(reverseContext);
    expect(fixture.fromLayer.visibility.opacity).toBe(0);
    expect(fixture.toLayer.visibility.opacity).toBe(1);
    expect(forwardVideo.classList.contains('is-active')).toBe(true);
    expect(reverseVideo.classList.contains('is-active')).toBe(false);

    const terminalLeg = {
      runId: reverseContext.runId,
      segment: 'ttg-lab' as const,
      direction: -1 as const,
      legIndex: 1,
      from: 1,
      to: TTG_LAB_ANIMATION_STOP,
      durationMs: 600,
      signal: preparationSignal()
    };
    const terminalPreparation = Promise.resolve(timeline.prepareLeg?.(terminalLeg));
    await terminalPreparation;
    expect(forwardVideo.classList.contains('is-active')).toBe(true);
    expect(reverseVideo.classList.contains('is-active')).toBe(false);
    expect(terminal.classList.contains('is-active')).toBe(false);
    timeline.commitLeg?.(terminalLeg);
    expect(forwardVideo.classList.contains('is-active')).toBe(false);
    expect(reverseVideo.classList.contains('is-active')).toBe(false);
    expect(terminal.classList.contains('is-active')).toBe(true);
    expect(forwardVideo.loadCalls).toBeGreaterThan(0);
    timeline.progress((TTG_LAB_ANIMATION_STOP + 1) / 2);
    expect(fixture.fromLayer.visibility.opacity).toBeGreaterThan(0);
    timeline.progress(TTG_LAB_ANIMATION_STOP);

    const reverseLeg = {
      runId: reverseContext.runId,
      segment: 'ttg-lab' as const,
      direction: -1 as const,
      legIndex: 0,
      from: TTG_LAB_ANIMATION_STOP,
      to: 0,
      durationMs: 2500,
      resumedStageIndex: 0,
      signal: preparationSignal()
    };
    const reversePreparation = Promise.resolve(timeline.prepareLeg?.(reverseLeg));
    reverseVideo.presentRequestedFrame();
    for (let index = 0; index < 6; index += 1) {
      await Promise.resolve();
    }
    expect(reverseVideo.classList.contains('is-active')).toBe(false);
    expect(forwardVideo.classList.contains('is-active')).toBe(false);
    expect(terminal.classList.contains('is-active')).toBe(true);
    expect(reverseVideo.playCalls).toBe(0);

    await reversePreparation;
    timeline.commitLeg?.(reverseLeg);
    expect(reverseVideo.playCalls).toBe(1);
    expect(terminal.classList.contains('is-active')).toBe(false);
    expect(ttgMediaSnapshot(fixture.fromRoot as unknown as HTMLElement)).toMatchObject({
      activeSurface: 'reverse',
      activeRunId: reverseContext.runId,
      preparedForwardStart: false
    });

    timeline.progress(TTG_LAB_ANIMATION_STOP / 2);
    expect(reverseVideo.classList.contains('is-active')).toBe(true);
    expect(forwardVideo.classList.contains('is-active')).toBe(false);
    timeline.progress(0);
    expect(forwardVideo.classList.contains('is-active')).toBe(true);
    expect(reverseVideo.classList.contains('is-active')).toBe(false);
    expect(forwardVideo.currentTime).toBe(0);
    expect(ttgMediaSnapshot(fixture.fromRoot as unknown as HTMLElement)).toMatchObject({
      activeSurface: undefined,
      preparedForwardStart: false
    });
  });

  it('reverses at the first TTG pause inside one active run before Lab is visited', async () => {
    const fixture = createBackHalfDomContext('ttg-lab', 'ttg-animation', 'lab');
    const forwardVideo = new FakeVideo();
    const reverseVideo = new FakeVideo();
    forwardVideo.classList.add('is-active');
    const terminal = connectTtgMedia(fixture.fromRoot, forwardVideo, reverseVideo);
    const timeline = await createTtgLabTransition().buildTimeline(fixture.context);

    await prepareAndCommit(timeline, {
      runId: fixture.context.runId,
      segment: 'ttg-lab',
      direction: 1,
      legIndex: 0,
      from: 0,
      to: TTG_LAB_ANIMATION_STOP,
      durationMs: 2500,
      signal: preparationSignal()
    });
    timeline.progress(TTG_LAB_ANIMATION_STOP);
    expect(forwardVideo.classList.contains('is-active')).toBe(false);
    expect(reverseVideo.classList.contains('is-active')).toBe(false);
    expect(terminal.classList.contains('is-active')).toBe(true);

    await prepareAndCommit(timeline, {
      runId: fixture.context.runId,
      segment: 'ttg-lab',
      direction: -1,
      legIndex: 0,
      from: TTG_LAB_ANIMATION_STOP,
      to: 0,
      durationMs: 2500,
      resumedStageIndex: 0,
      signal: preparationSignal()
    });
    expect(forwardVideo.classList.contains('is-active')).toBe(false);
    expect(reverseVideo.classList.contains('is-active')).toBe(true);
    expect(terminal.classList.contains('is-active')).toBe(false);
    expect(reverseVideo.playCalls).toBe(1);

    timeline.progress(TTG_LAB_ANIMATION_STOP * 0.6);
    timeline.progress(TTG_LAB_ANIMATION_STOP * 0.3);
    expect(reverseVideo.classList.contains('is-active')).toBe(true);
    timeline.progress(0);
    expect(forwardVideo.classList.contains('is-active')).toBe(true);
    expect(reverseVideo.classList.contains('is-active')).toBe(false);
    expect(forwardVideo.currentTime).toBe(0);
  });

  it('keeps TTG re-entrant across twenty explicit alternating runs and settles each endpoint', async () => {
    const fixture = createBackHalfDomContext('ttg-lab', 'ttg-animation', 'lab');
    const forwardVideo = new FakeVideo();
    const reverseVideo = new FakeVideo();
    forwardVideo.classList.add('is-active');
    const terminal = connectTtgMedia(fixture.fromRoot, forwardVideo, reverseVideo);
    vi.stubGlobal('document', { createElement: () => new FakeCanvas() });

    for (let index = 1; index <= 20; index += 1) {
      const direction: 1 | -1 = index % 2 === 1 ? 1 : -1;
      const runContext = {
        ...fixture.context,
        direction,
        runId: `ttg-runs:${index}`,
        prepareToken: `ttg-runs:prepare:${index}`
      } as const;
      const timeline = await createTtgLabTransition().buildTimeline(runContext);

      if (direction === 1) {
        await prepareAndCommit(timeline, {
          runId: runContext.runId,
          segment: 'ttg-lab',
          direction,
          legIndex: 0,
          from: 0,
          to: TTG_LAB_ANIMATION_STOP,
          durationMs: 2500,
          signal: preparationSignal()
        });
        timeline.progress(TTG_LAB_ANIMATION_STOP * 0.5);
        timeline.progress(TTG_LAB_ANIMATION_STOP);
        await prepareAndCommit(timeline, {
          runId: runContext.runId,
          segment: 'ttg-lab',
          direction,
          legIndex: 1,
          from: TTG_LAB_ANIMATION_STOP,
          to: 1,
          durationMs: 600,
          resumedStageIndex: 0,
          signal: preparationSignal()
        });
        timeline.progress(1);
      } else {
        await prepareAndCommit(timeline, {
          runId: runContext.runId,
          segment: 'ttg-lab',
          direction,
          legIndex: 1,
          from: 1,
          to: TTG_LAB_ANIMATION_STOP,
          durationMs: 600,
          signal: preparationSignal()
        });
        timeline.progress((1 + TTG_LAB_ANIMATION_STOP) / 2);
        timeline.progress(TTG_LAB_ANIMATION_STOP);
        await prepareAndCommit(timeline, {
          runId: runContext.runId,
          segment: 'ttg-lab',
          direction,
          legIndex: 0,
          from: TTG_LAB_ANIMATION_STOP,
          to: 0,
          durationMs: 2500,
          resumedStageIndex: 0,
          signal: preparationSignal()
        });
        timeline.progress(TTG_LAB_ANIMATION_STOP * 0.5);
        timeline.progress(0);
      }

      expect(fixture.fromRoot.dataset.ttgPlaybackDirection).toBe(String(direction));
      expect(forwardVideo.classList.contains('is-active')).toBe(direction === -1);
      expect(reverseVideo.classList.contains('is-active')).toBe(false);
      expect(terminal.classList.contains('is-active')).toBe(direction === 1);
      expect(forwardVideo.currentTime).toBeCloseTo(
        direction === 1 ? forwardVideo.duration - 0.02 : 0,
        2
      );
      timeline.dispose();
    }
  });

  it('keys and registers both TTG playback directions for the readiness gate', () => {
    const markup = renderToStaticMarkup(createElement(ttgAnimationScene.Component, {
      scene: 'ttg-animation',
      hidden: false
    }));

    expect(ttgAnimationScene.requiredHandles).toEqual([
      'field',
      'figure-terminal',
      'figure-video',
      'figure-video-reverse'
    ]);
    expect(markup).toContain('data-ttg-figure-terminal="true"');
    expect(markup).toContain('ttg_middle-composite.png');
    expect(markup).toContain('ttg_front-composite.png');
    expect(markup).not.toContain('ttg-layer--middle-overlay');
    expect(markup).not.toContain('ttg-layer--front-overlay');
    expect(markup).toContain('data-media-key="ttg_figure-alpha-scrub"');
    expect(markup).toContain('data-media-key="ttg_figure-alpha-scrub-reverse"');
    expect(markup).toMatch(/data-ttg-figure-video="true"[^>]*preload="metadata"/);
    expect(markup).toMatch(/data-ttg-figure-video-reverse="true"[^>]*preload="metadata"/);
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
