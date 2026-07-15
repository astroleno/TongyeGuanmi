import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { storyManifest } from '../story/manifest';
import { verifySegmentTimeline } from '../story/verifySegmentTimeline';
import { createLabPhTransition } from './lab-ph';
import { createPhEducationTransition, PH_EDUCATION_ANIMATION_STOP } from './ph-education';
import { PH_PLAYBACK_MS, TERMINAL_DWELL_MS } from '../story/timings';
import { renderEducationHold } from '../scenes/education';
import type { LayerHandle, LayerVisibilityState, SceneId, SegmentId, SegmentTimelineHandle, SpineSegmentNode, StagedLegPreparation, TransitionContext, TransitionModule } from '../story/types';
import { createBackHalfDomContext, FakeCanvas, FakeVideo } from './__fixtures__/back-half.fixture';

const stylesheet = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

function preparationSignal(): AbortSignal {
  return new AbortController().signal;
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

    expect(receiver.dataset.r4RevealMode).toBe('ink-occluded-live-gate');
    expect(receiver.style.clipPath).toMatch(/^polygon\(/);
    expect(receiver.style.clipPath).not.toContain('inset(');
    expect(receiver.dataset.r4InkBoundaryKind).toBe('horizontal');
    expect(receiver.dataset.r4InkBoundaryOrigin).toBe('0.5000,0.0000');
    expect(receiver.dataset.r4InkBoundaryRevision).toMatch(/^horizontal-ink-contour-v2-/);
    expect(canvas.dataset.r4InkBoundaryRevision).toBe(receiver.dataset.r4InkBoundaryRevision);
    expect(receiver.dataset.r4InkContourThreshold).toBe(canvas.dataset.r4InkContourThreshold);
    expect(receiver.style.getPropertyValue('mask-image')).toBe('');
    expect(canvas.dataset.r4InkTargetReady).toBeUndefined();
    expect(receiver.dataset.r4Transition).toBe('lab-ph-top-ink');
  });

  it('prewarms PH frame zero before the Lab handoff without unloading its media surface', async () => {
    const fixture = createBackHalfDomContext('lab-ph', 'lab', 'ph-animation');
    const video = new FakeVideo();
    fixture.toRoot.connect('[data-ph-alpha-video]', video);
    vi.stubGlobal('document', { createElement: () => new FakeCanvas() });

    const transition = createLabPhTransition();
    const timeline = await transition.buildTimeline(fixture.context);

    expect(transition.requiredMilestones).toEqual(['targetReady', 'mediaReady', 'buildReady']);
    expect(video.preload).toBe('auto');
    expect(video.currentTimeWrites).toBeGreaterThan(0);
    expect(video.currentTime).toBe(0);
    expect(video.loadCalls).toBe(0);
    timeline.dispose();
  });

  it('plays PH to its terminal frame, dwells one second, then dissolves to Education without Ink', async () => {
    const fixture = createBackHalfDomContext('ph-education', 'ph-animation', 'education');
    const video = new FakeVideo();
    video.duration = 1.533;
    const canvas = new FakeCanvas();
    fixture.fromRoot.connect('[data-ph-alpha-video]', video);
    vi.stubGlobal('document', { createElement: () => canvas });

    const phEducation = segment('ph-education');
    expect(phEducation.policy).toMatchObject({
      kind: 'stagedSnap',
      stops: [PH_EDUCATION_ANIMATION_STOP],
      playMs: [1520, 600],
      advance: [{ kind: 'delay', ms: TERMINAL_DWELL_MS }]
    });
    expect(PH_PLAYBACK_MS).toBe(1520);
    expect(PH_EDUCATION_ANIMATION_STOP).toBeCloseTo(1520 / 2120, 6);
    expect(phEducation.mediaPlayback?.[0]?.reverse).toEqual({ mode: 'timeline', required: true });
    if (phEducation.policy.kind !== 'stagedSnap') {
      throw new Error('ph-education must be staged');
    }
    const stop = phEducation.policy.stops[0] ?? 0;
    const timeline = await createPhEducationTransition().buildTimeline(fixture.context);

    expect((timeline as typeof timeline & { prepareLeg?: unknown }).prepareLeg).toBeTypeOf('function');
    expect(timeline.rootIdentity?.()).toEqual({
      from: fixture.stage.children[0],
      to: fixture.stage.children[1]
    });
    expect(fixture.stage.children).toHaveLength(2);
    await prepareAndCommit(timeline, {
      runId: fixture.context.runId,
      segment: 'ph-education',
      direction: 1,
      legIndex: 0,
      from: 0,
      to: stop,
      durationMs: PH_PLAYBACK_MS,
      signal: preparationSignal()
    });

    timeline.progress(stop / 2);
    const forwardMidTime = video.currentTime;
    expect(Number(fixture.fromRoot.dataset.phProgress)).toBeGreaterThan(0);
    expect(Number(fixture.fromRoot.dataset.phProgress)).toBeLessThan(1);
    expect(canvas.dataset.r4InkProgress).toBeUndefined();
    expect(fixture.toLayer.visibility.visible).toBe(false);

    timeline.progress(stop);
    expect(fixture.fromRoot.dataset.phProgress).toBe('1.0000');
    expect(canvas.dataset.r4InkProgress).toBeUndefined();
    expect(timeline.pauses).toEqual([]);
    const writesAtStop = video.currentTimeWrites;

    await prepareAndCommit(timeline, {
      runId: fixture.context.runId,
      segment: 'ph-education',
      direction: 1,
      legIndex: 1,
      from: stop,
      to: 1,
      durationMs: 600,
      resumedStageIndex: 0,
      signal: preparationSignal()
    });

    timeline.progress((stop + 1) / 2);
    expect(fixture.fromRoot.dataset.phProgress).toBe('1.0000');
    expect(fixture.toRoot.dataset.educationProgress).toBe('1.0000');
    expect(fixture.toRoot.style.getPropertyValue('--r4-education-y')).toBe('0.00px');
    expect(fixture.fromLayer.visibility.opacity).toBeCloseTo(0.5, 4);
    expect(fixture.toLayer.visibility.opacity).toBeCloseTo(0.5, 4);
    expect(fixture.fromLayer.visibility.opacity + fixture.toLayer.visibility.opacity).toBeCloseTo(1, 6);
    expect(fixture.stage.children[0]?.dataset.r4Handoff).toBe('dissolve');
    expect(fixture.stage.children[1]?.dataset.r4Handoff).toBe('dissolve');
    expect(canvas.parentElement).toBeNull();
    expect(canvas.dataset.r4InkProgress).toBeUndefined();
    const receiver = fixture.stage.children[1]!;
    expect(receiver.style.clipPath).toBe('');
    expect(receiver.style.getPropertyValue('mask-image')).toBe('');
    expect(receiver.style.getPropertyValue('transform')).toBe('');
    expect(receiver.style.getPropertyValue('filter')).toBe('');
    expect(receiver.dataset.r4InkBoundaryKind).toBeUndefined();
    expect(receiver.dataset.r4InkBoundaryRevision).toBeUndefined();
    expect(canvas.dataset.r4InkBoundaryRevision).toBeUndefined();
    expect(timeline.rootIdentity?.()).toEqual({
      from: fixture.stage.children[0],
      to: fixture.stage.children[1]
    });
    expect(fixture.stage.children).toHaveLength(2);
    for (const progress of [(stop + 2) / 3, (stop + 3) / 4]) {
      timeline.progress(progress);
    }
    expect(video.currentTimeWrites).toBe(writesAtStop);

    expect(video.currentTime).toBeGreaterThanOrEqual(forwardMidTime);
    expect(video.playCalls).toBeGreaterThan(0);
    timeline.dispose();
  });

  it('keeps the Education receiver at its final layout and top edge through p=.99, p=1 and dispose', async () => {
    const fixture = createBackHalfDomContext('ph-education', 'ph-animation', 'education');
    const video = new FakeVideo();
    fixture.fromRoot.connect('[data-ph-alpha-video]', video);
    fixture.toRoot.scrollTop = 360;
    const timeline = await createPhEducationTransition().buildTimeline(fixture.context);
    const targetLayer = fixture.stage.children[1]!;
    const snapshot = () => ({
      progress: fixture.toRoot.dataset.educationProgress,
      copyOpacity: fixture.toRoot.style.getPropertyValue('--r4-education-opacity'),
      copyY: fixture.toRoot.style.getPropertyValue('--r4-education-y'),
      scrollTop: fixture.toRoot.scrollTop,
      edge: fixture.toRoot.dataset.readingEdge,
      backgroundOwner: /\.r4-education\s*\{[^}]*#ede4d2;/s.test(stylesheet)
    });

    timeline.progress(0.99);
    const nearEnd = snapshot();
    timeline.progress(1);
    const endpoint = snapshot();
    expect(targetLayer.dataset.r4Handoff).toBeUndefined();
    timeline.dispose();
    renderEducationHold(fixture.toRoot as unknown as HTMLElement);
    const settled = snapshot();

    expect(nearEnd).toEqual(endpoint);
    expect(settled).toEqual(endpoint);
    expect(endpoint).toEqual({
      progress: '1.0000',
      copyOpacity: '1.0000',
      copyY: '0.00px',
      scrollTop: 0,
      edge: 'top',
      backgroundOwner: true
    });
    expect(fixture.toLayer.visibility.opacity).toBe(1);
  });

  it('reverses PH from its first pause with one fixed preparation and descending presented targets', async () => {
    const fixture = createBackHalfDomContext('ph-education', 'ph-animation', 'education');
    const video = new FakeVideo();
    video.duration = 1.533;
    fixture.fromRoot.connect('[data-ph-alpha-video]', video);
    const timeline = await createPhEducationTransition().buildTimeline(fixture.context);

    await prepareAndCommit(timeline, {
      runId: fixture.context.runId,
      segment: 'ph-education',
      direction: 1,
      legIndex: 0,
      from: 0,
      to: PH_EDUCATION_ANIMATION_STOP,
      durationMs: PH_PLAYBACK_MS,
      signal: preparationSignal()
    });
    timeline.progress(PH_EDUCATION_ANIMATION_STOP);
    expect(video.currentTime).toBeCloseTo(1.5, 3);
    const forwardPlayCalls = video.playCalls;

    await prepareAndCommit(timeline, {
      runId: fixture.context.runId,
      segment: 'ph-education',
      direction: -1,
      legIndex: 0,
      from: PH_EDUCATION_ANIMATION_STOP,
      to: 0,
      durationMs: PH_PLAYBACK_MS,
      resumedStageIndex: 0,
      signal: preparationSignal()
    });
    const samples: number[] = [];
    for (const progress of [0.75, 0.5, 0.25].map((value) => value * PH_EDUCATION_ANIMATION_STOP)) {
      timeline.progress(progress);
      samples.push(video.currentTime);
    }
    expect(samples[0]).toBeGreaterThan(samples[1] ?? 0);
    expect(samples[1]).toBeGreaterThan(samples[2] ?? 0);
    expect(video.playCalls).toBe(forwardPlayCalls);
    timeline.progress(0);
    expect(video.currentTime).toBe(0);
  });

  it('keeps the PH media and milestone contracts equal to the manifest', () => {
    const transition = createPhEducationTransition();
    const manifestSegment = segment('ph-education');

    expect(transition.requiredMilestones).toEqual(['targetReady', 'mediaReady', 'buildReady']);
    expect(transition.mediaPlayback).toEqual(manifestSegment.mediaPlayback);
    expect(transition.mediaPlayback?.[0]?.forward).toEqual({ mode: 'play', required: true });
  });

  it('keeps the PH source hidden until its reverse terminal frame is presented', async () => {
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

    const fixture = createBackHalfDomContext('ph-education', 'ph-animation', 'education');
    const video = new DeferredFrameVideo();
    video.duration = 1.533;
    fixture.fromRoot.connect('[data-ph-alpha-video]', video);
    const reverseContext = {
      ...fixture.context,
      direction: -1,
      runId: 'ph-terminal:1',
      prepareToken: 'ph-terminal:prepare:1'
    } as const;
    const timeline = await createPhEducationTransition().buildTimeline(reverseContext);
    const leg = {
      runId: reverseContext.runId,
      segment: 'ph-education' as const,
      direction: -1 as const,
      legIndex: 1,
      from: 1,
      to: PH_EDUCATION_ANIMATION_STOP,
      durationMs: 600,
      signal: preparationSignal()
    };
    const preparation = Promise.resolve(timeline.prepareLeg?.(leg));
    let frameReady = false;
    void preparation.then(() => {
      frameReady = true;
    });

    await Promise.resolve();
    expect(frameReady).toBe(false);
    expect(fixture.fromLayer.visibility.opacity).toBe(0);
    expect(fixture.toLayer.visibility.opacity).toBe(1);

    video.presentRequestedFrame();
    await preparation;
    timeline.commitLeg?.(leg);
    timeline.progress((PH_EDUCATION_ANIMATION_STOP + 1) / 2);
    expect(fixture.fromLayer.visibility.opacity).toBeGreaterThan(0);
  });

  it('keeps PH re-entrant across twenty explicit alternating runs without reading stale DOM direction', async () => {
    const fixture = createBackHalfDomContext('ph-education', 'ph-animation', 'education');
    const video = new FakeVideo();
    video.duration = 76 / 30;
    fixture.fromRoot.connect('[data-ph-alpha-video]', video);
    vi.stubGlobal('document', { createElement: () => new FakeCanvas() });

    for (let index = 1; index <= 20; index += 1) {
      const direction: 1 | -1 = index % 2 === 1 ? 1 : -1;
      const runContext = {
        ...fixture.context,
        direction,
        runId: `ph-runs:${index}`,
        prepareToken: `ph-runs:prepare:${index}`
      } as const;
      const timeline = await createPhEducationTransition().buildTimeline(runContext);

      if (direction === -1) {
        await prepareAndCommit(timeline, {
          runId: runContext.runId,
          segment: 'ph-education',
          direction,
          legIndex: 1,
          from: 1,
          to: PH_EDUCATION_ANIMATION_STOP,
          durationMs: 600,
          signal: preparationSignal()
        });
        timeline.progress(PH_EDUCATION_ANIMATION_STOP);
      }
      await prepareAndCommit(timeline, {
        runId: runContext.runId,
        segment: 'ph-education',
        direction,
        legIndex: 0,
        from: direction === 1 ? 0 : PH_EDUCATION_ANIMATION_STOP,
        to: direction === 1 ? PH_EDUCATION_ANIMATION_STOP : 0,
        durationMs: PH_PLAYBACK_MS,
        signal: preparationSignal(),
        ...(direction === -1 ? { resumedStageIndex: 0 } : {})
      });
      timeline.progress(PH_EDUCATION_ANIMATION_STOP * 0.5);

      expect(fixture.fromRoot.dataset.phPlaybackDirection).toBe(String(direction));
      expect(video.currentTime).toBeGreaterThan(0);
      expect(video.currentTime).toBeLessThan(video.duration);

      timeline.progress(direction === 1 ? PH_EDUCATION_ANIMATION_STOP : 0);
      expect(video.currentTime).toBeCloseTo(direction === 1 ? 1.5 : 0, 2);
      timeline.dispose();
    }
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
