import { readdirSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { storyManifest } from '../../story/manifest';
import { verifySegmentTimeline } from '../../story/verifySegmentTimeline';
import {
  createHeroPatternTransition,
  heroPatternInkProgress,
  heroPatternMotionProgress,
  HERO_PATTERN_INK_ORIGIN,
  HERO_PATTERN_INK_MS,
  HERO_PATTERN_FRAME_PREPARING_TIMEOUT_MS,
  HERO_PATTERN_MOTION_MS,
  HERO_PATTERN_MOTION_STOP,
  renderHeroForHeroPattern,
  renderPatternForHeroPattern,
  waitForHeroPatternCommittedFrame
} from './index';
import { HERO_PATTERN_VIDEO_END_SECONDS } from '../../scenes/hero';
import { patternCenterForViewport } from '../../scenes/pattern';
import { createBackHalfDomContext, FakeCanvas, FakeVideo } from '../__fixtures__/back-half.fixture';
import type { LayerHandle, LayerVisibilityState, SpineSegmentNode, TransitionContext } from '../../story/types';

const transitionSource = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

class FakeStyle {
  values = new Map<string, string>();

  setProperty(name: string, value: string): void {
    this.values.set(name, value);
  }
}

class FakeElement {
  style = new FakeStyle();
  attributes = new Map<string, string>();

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

class DeferredFrameVideo extends FakeVideo {
  private frameCallback: ((now: DOMHighResTimeStamp, metadata: VideoFrameCallbackMetadata) => void) | undefined;

  override requestVideoFrameCallback(
    callback: (now: DOMHighResTimeStamp, metadata: VideoFrameCallbackMetadata) => void
  ): number {
    this.frameCallback = callback;
    return 1;
  }

  override cancelVideoFrameCallback(): void {
    this.frameCallback = undefined;
  }

  presentFrame(): void {
    const callback = this.frameCallback;
    this.frameCallback = undefined;
    callback?.(0, {} as VideoFrameCallbackMetadata);
  }

  hasPendingFrame(): boolean {
    return this.frameCallback !== undefined;
  }
}

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
    dispose() {}
  };
}

function segment(): SpineSegmentNode {
  const found = storyManifest.nodes.find(
    (node): node is SpineSegmentNode => node.kind === 'segment' && node.id === 'hero-pattern'
  );
  if (!found) {
    throw new Error('hero-pattern segment missing');
  }
  return structuredClone(found);
}

function context(prefersReducedMotion = false): TransitionContext {
  return {
    segment: segment(),
    from: layer('hero', 'current'),
    to: layer('pattern', 'next'),
    stage: {
      getLayer: () => undefined,
      ensureLayer: (scene, role) => layer(scene as 'hero' | 'pattern', role === 'current' ? 'current' : 'next'),
      releaseLayer: () => undefined,
      snapshot: () => []
    },
    direction: 1,
    runId: 'r4-g1-test:1',
    prepareToken: 'r4-g1-test:prepare:1',
    prefersReducedMotion,
    reportMilestone: () => undefined
  };
}

describe('hero-pattern transition', () => {
  it('shares the release-safe frame preparation timeout with the Hero build gate', () => {
    expect(HERO_PATTERN_FRAME_PREPARING_TIMEOUT_MS).toBe(8000);
    expect(segment().buildTimeoutMs).toBe(HERO_PATTERN_FRAME_PREPARING_TIMEOUT_MS);
  });

  it('bounds and cancels phase-boundary presentation confirmation', async () => {
    vi.useFakeTimers();
    const requestFrame = vi.fn(() => 1);
    vi.stubGlobal('requestAnimationFrame', requestFrame);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const controller = new AbortController();
    const aborted = waitForHeroPatternCommittedFrame(controller.signal, 20);
    controller.abort(new Error('superseded'));
    await expect(aborted).rejects.toMatchObject({ code: 'MEDIA_PREPARATION_ABORTED' });

    const timeout = waitForHeroPatternCommittedFrame(undefined, 20);
    const timeoutExpectation = expect(timeout).rejects.toMatchObject({ code: 'MEDIA_PREPARATION_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(20);
    await timeoutExpectation;
    expect(requestFrame).toHaveBeenCalledTimes(2);
  });

  it('reveals the canonical expanded Pattern at its authored left-side center', () => {
    const patternRoot = new FakeElement();
    const heroRoot = new FakeElement();

    renderPatternForHeroPattern(patternRoot as unknown as HTMLElement);
    renderHeroForHeroPattern(heroRoot as unknown as HTMLElement);

    expect(patternCenterForViewport(1440)).toEqual({ x: 0.24, y: 0.55 });
    expect(patternRoot.attributes.get('data-pattern-progress')).toBe('0.0000');
    expect(patternRoot.style.values.get('--r4-pattern-opacity')).toBe('1.0000');
    expect(patternRoot.style.values.get('--r4-pattern-field-rotation')).toBe('120.00deg');
    expect(heroRoot.attributes.get('data-hero-progress')).toBe('1.0000');
  });

  it('uses the screen center without a transition-only Pattern target or second collapse phase', () => {
    expect(transitionSource).toContain('renderPatternHold');
    expect(transitionSource).not.toContain('HERO_PATTERN_INK_TARGET_IMAGE');
    expect(transitionSource).not.toContain('pattern-bloom-initial-no-stars.png');
    expect(transitionSource).not.toContain('patternBloomProgressForHeroPattern');
    expect(HERO_PATTERN_INK_ORIGIN).toEqual({ x: 0.5, y: 0.5 });
    expect(transitionSource).toContain('HERO_PATTERN_INK_ORIGIN');
    expect(transitionSource).toContain("kind: 'radial'");
    expect(transitionSource).not.toContain('readPatternCenter(to)');
  });

  it('shares one screen-center radial field with the effect canvas', async () => {
    const fixture = createBackHalfDomContext('hero-pattern', 'hero', 'pattern');
    const canvas = new FakeCanvas();
    Object.assign(fixture.toRoot, { clientWidth: 1440 });
    vi.stubGlobal('document', { createElement: () => canvas });
    const timeline = await createHeroPatternTransition().buildTimeline(fixture.context);
    const receiver = fixture.stage.children[1]!;

    timeline.progress(0.5);

    expect(receiver.style.clipPath).toMatch(/^circle\(/);
    expect(receiver.style.clipPath).not.toContain('polygon(');
    expect(receiver.dataset.r4InkBoundaryKind).toBe('radial');
    expect(receiver.dataset.r4InkBoundaryOrigin).toBe('0.5000,0.5000');
    expect(receiver.dataset.r4InkBoundaryRevision).toBeUndefined();
    expect(canvas.dataset.r4InkBoundaryRevision).toBeUndefined();
    expect(fixture.toRoot.dataset.patternProgress).toBe('0.0000');
  });

  it.each([1, -1] as const)(
    'prepares Hero media with timeline seeks before %s playback starts',
    async (direction) => {
      const fixture = createBackHalfDomContext('hero-pattern', 'hero', 'pattern');
      const canvas = new FakeCanvas();
      const video = new FakeVideo();
      fixture.fromRoot.connect('[data-hero-figure-video]', video);
      if (direction === -1 && fixture.context.from.element) {
        fixture.context.from.element.style.visibility = 'hidden';
      }
      vi.stubGlobal('document', { createElement: () => canvas });

      const timeline = await createHeroPatternTransition().buildTimeline({
        ...fixture.context,
        direction
      });

      // buildTimeline primes the exact endpoint, but only SegmentPlayer's
      // play/reverse call may advance Hero media.
      expect(video.playCalls).toBe(0);
      expect(video.paused).toBe(true);
      expect(fixture.context.from.element?.style.visibility).toBe(direction === -1 ? 'hidden' : 'visible');
      timeline.dispose();
    }
  );

  it('warms Hero media and Ink before input, then reuses the presented start frame', async () => {
    const fixture = createBackHalfDomContext('hero-pattern', 'hero', 'pattern');
    const canvas = new FakeCanvas();
    const video = new FakeVideo();
    fixture.fromRoot.connect('[data-hero-figure-video]', video);
    vi.stubGlobal('document', { createElement: () => canvas });
    const transition = createHeroPatternTransition();
    const stageChildrenBeforePrewarm = fixture.stage.children.length;

    if (!transition.prewarm) {
      throw new Error('hero-pattern prewarm is required');
    }
    await transition.prewarm(fixture.context);

    expect(fixture.stage.children).toHaveLength(stageChildrenBeforePrewarm);
    expect(video.preload).toBe('auto');
    expect(video.dataset.timelineVideoFrameReady).toBe('true');
    expect(video.currentTime).toBe(0);
    expect(video.playCalls).toBe(0);

    const warmSeekWrites = video.currentTimeWrites;
    const timeline = await transition.buildTimeline(fixture.context);

    expect(video.currentTimeWrites).toBe(warmSeekWrites);
    expect(fixture.stage.children).toHaveLength(stageChildrenBeforePrewarm + 1);
    timeline.dispose();
  });

  it('waits for the reverse Hero endpoint after timeline construction resets its surfaces', async () => {
    vi.useFakeTimers();
    const fixture = createBackHalfDomContext('hero-pattern', 'hero', 'pattern');
    const canvas = new FakeCanvas();
    const video = new DeferredFrameVideo();
    fixture.fromRoot.connect('[data-hero-figure-video]', video);
    if (fixture.context.from.element) {
      fixture.context.from.element.style.visibility = 'hidden';
      fixture.context.from.element.style.opacity = '0';
    }
    const setFromVisibility = fixture.fromLayer.setVisibility.bind(fixture.fromLayer);
    fixture.fromLayer.setVisibility = (state) => {
      setFromVisibility(state);
      if (fixture.context.from.element) {
        fixture.context.from.element.style.visibility = state.visible ? 'visible' : 'hidden';
        fixture.context.from.element.style.opacity = String(state.opacity);
      }
    };
    vi.stubGlobal('document', { createElement: () => canvas });

    const build = Promise.resolve(createHeroPatternTransition().buildTimeline({
      ...fixture.context,
      direction: -1
    }));
    await Promise.resolve();
    await Promise.resolve();

    expect(video.hasPendingFrame()).toBe(true);
    expect(fixture.context.from.element?.style.visibility).toBe('visible');
    expect(fixture.context.from.element?.style.opacity).toBe('0.001');
    expect(fixture.context.from.element?.style.zIndex).toBe('31');
    await vi.advanceTimersByTimeAsync(50);
    video.presentFrame();
    const timeline = await build;
    expect(video.hasPendingFrame()).toBe(false);
    expect(video.currentTime).toBeCloseTo(HERO_PATTERN_VIDEO_END_SECONDS);
    expect(fixture.context.from.element?.style.visibility).toBe('hidden');
    expect(fixture.context.from.element?.style.opacity).toBe('0');
    expect(fixture.context.from.element?.style.zIndex).toBe('');
    timeline.dispose();
  });

  it.each([1, -1] as const)(
    'nudges a stalled %s compositor but still requires its causal frame callback',
    async (direction) => {
      vi.useFakeTimers();
      const fixture = createBackHalfDomContext('hero-pattern', 'hero', 'pattern');
      const canvas = new FakeCanvas();
      const video = new DeferredFrameVideo();
      fixture.fromRoot.connect('[data-hero-figure-video]', video);
      vi.stubGlobal('document', { createElement: () => canvas });

      const build = Promise.resolve(createHeroPatternTransition().buildTimeline({
        ...fixture.context,
        direction
      }));
      await vi.advanceTimersByTimeAsync(249);

      expect(video.hasPendingFrame()).toBe(true);
      expect(video.playCalls).toBe(0);

      await vi.advanceTimersByTimeAsync(1);
      expect(video.playCalls).toBe(1);
      expect(video.paused).toBe(false);

      let settled = false;
      void build.then(() => { settled = true; });
      await Promise.resolve();
      expect(settled).toBe(false);

      video.presentFrame();
      const timeline = await build;
      expect(video.dataset.timelineVideoFrameEvidence).toBe('video-frame-callback');
      expect(video.paused).toBe(true);
      timeline.dispose();
    }
  );

  it('reactivates a stale hidden Hero layer before a forward replay', async () => {
    const fixture = createBackHalfDomContext('hero-pattern', 'hero', 'pattern');
    const canvas = new FakeCanvas();
    const video = new FakeVideo();
    fixture.fromRoot.connect('[data-hero-figure-video]', video);
    if (fixture.context.from.element) {
      fixture.context.from.element.style.visibility = 'hidden';
    }
    vi.stubGlobal('document', { createElement: () => canvas });

    const timeline = await createHeroPatternTransition().buildTimeline(fixture.context);

    expect(fixture.context.from.element?.style.visibility).toBe('visible');
    timeline.dispose();
  });

  it('leases both Hero and Pattern motion only while the Ink handoff is visible', async () => {
    const fixture = createBackHalfDomContext('hero-pattern', 'hero', 'pattern');
    const canvas = new FakeCanvas();
    vi.stubGlobal('document', { createElement: () => canvas });
    const timeline = await createHeroPatternTransition().buildTimeline(fixture.context);

    expect(fixture.toRoot.dataset.sceneMotionActive).toBe('false');
    expect(fixture.toRoot.dataset.sceneMotionLeaseCount).toBe('0');
    expect(fixture.fromRoot.dataset.sceneMotionActive).toBe('true');
    expect(fixture.fromRoot.dataset.sceneMotionLeaseCount).toBe('1');

    timeline.progress(0.5);
    expect(fixture.toRoot.dataset.sceneMotionActive).toBe('true');
    expect(fixture.toRoot.dataset.sceneMotionLeaseCount).toBe('1');
    expect(fixture.fromRoot.dataset.sceneMotionActive).toBe('true');
    expect(fixture.fromRoot.dataset.sceneMotionLeaseCount).toBe('1');

    timeline.progress(0);
    expect(fixture.toRoot.dataset.sceneMotionActive).toBe('false');
    expect(fixture.toRoot.dataset.sceneMotionLeaseCount).toBe('0');
    expect(fixture.fromRoot.dataset.sceneMotionActive).toBe('true');
    expect(fixture.fromRoot.dataset.sceneMotionLeaseCount).toBe('1');

    timeline.progress(0.5);
    timeline.dispose();
    timeline.dispose();
    expect(fixture.toRoot.dataset.sceneMotionActive).toBe('false');
    expect(fixture.toRoot.dataset.sceneMotionLeaseCount).toBe('0');
    expect(fixture.fromRoot.dataset.sceneMotionActive).toBe('false');
  });

  it('keeps exactly Hero → Pattern and Pattern → Star Map as radial consumers', () => {
    const transitionsRoot = new URL('../', import.meta.url);
    const radialConsumers = readdirSync(transitionsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => {
        try {
          return readFileSync(new URL(`${entry.name}/index.ts`, transitionsRoot), 'utf8')
            .includes("kind: 'radial'");
        } catch {
          return false;
        }
      })
      .map((entry) => entry.name)
      .sort();

    expect(radialConsumers).toEqual(['hero-pattern', 'pattern-star-map']);
  });

  it('finishes 900ms of Hero motion before starting the complete 1800ms Ink handoff', async () => {
    const transition = createHeroPatternTransition();
    const timeline = await transition.buildTimeline(context());

    expect(HERO_PATTERN_MOTION_MS).toBe(900);
    expect(HERO_PATTERN_INK_MS).toBe(1800);
    expect(heroPatternMotionProgress(HERO_PATTERN_MOTION_STOP)).toBe(1);
    expect(heroPatternMotionProgress(1)).toBe(1);
    expect(heroPatternInkProgress(HERO_PATTERN_MOTION_STOP)).toBe(0);
    expect(heroPatternInkProgress(1)).toBe(1);
    expect(segment()).toMatchObject({
      policy: { kind: 'snap' },
      virtualDuration: HERO_PATTERN_MOTION_MS + HERO_PATTERN_INK_MS
    });
    expect(verifySegmentTimeline(timeline, { policy: segment().policy })).toMatchObject({ maxVisibleLayers: 2 });
    expect(timeline.sample?.(HERO_PATTERN_MOTION_STOP / 2)).toMatchObject({
      from: { visible: true, opacity: 1 },
      to: { visible: false, opacity: 0 }
    });
    expect(timeline.sample?.(0.5)).toMatchObject({
      from: { visible: true, opacity: 1 },
      to: { visible: true, opacity: 1 }
    });
  });

  it('uses independent 900ms/1800ms wall clocks in both directions', async () => {
    const fixture = createBackHalfDomContext('hero-pattern', 'hero', 'pattern');
    const canvas = new FakeCanvas();
    const video = new FakeVideo();
    const frames: Array<(time: number) => void> = [];
    let now = 0;
    vi.stubGlobal('document', { createElement: () => canvas });
    vi.stubGlobal('performance', { now: () => now });
    vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    fixture.fromRoot.connect('[data-hero-figure-video]', video);

    const timeline = await createHeroPatternTransition().buildTimeline(fixture.context);
    const flushMicrotasks = async () => {
      for (let index = 0; index < 20; index += 1) await Promise.resolve();
    };
    const present = async (time: number) => {
      now = time;
      const callback = frames.shift();
      expect(callback, `missing animation frame at ${time}ms`).toBeTypeOf('function');
      callback?.(time);
      await flushMicrotasks();
    };

    let forwardDone = false;
    void timeline.play(1).then(() => { forwardDone = true; });
    await present(899);
    expect(forwardDone).toBe(false);
    expect(canvas.dataset.r4InkProgress).toBeUndefined();
    await present(900);
    expect(forwardDone).toBe(false);
    expect(fixture.fromRoot.style.getPropertyValue('--r4-hero-pattern-figure-progress')).toBe('1.0000');
    expect(canvas.dataset.r4InkProgress).toBeUndefined();

    // The committed phase boundary is a bounded double-rAF, not part of either clock.
    await present(901);
    await present(902);
    await present(2_701);
    expect(forwardDone).toBe(false);
    expect(fixture.fromRoot.style.getPropertyValue('--r4-hero-pattern-figure-progress')).toBe('1.0000');
    await present(2_703);
    expect(forwardDone).toBe(true);

    let reverseDone = false;
    void timeline.reverse().then(() => { reverseDone = true; });
    await present(4_502);
    expect(reverseDone).toBe(false);
    expect(fixture.fromRoot.style.getPropertyValue('--r4-hero-pattern-figure-progress')).toBe('1.0000');
    await present(4_504);
    expect(reverseDone).toBe(false);
    await present(4_505);
    await present(4_506);
    await present(5_405);
    expect(reverseDone).toBe(false);
    await present(5_407);
    expect({
      reverseDone,
      sourceProgress: fixture.fromRoot.style.getPropertyValue('--r4-hero-pattern-figure-progress'),
      queuedFrames: frames.length
    }).toEqual({ reverseDone: true, sourceProgress: '0.0000', queuedFrames: 0 });
    timeline.dispose();
  });

  it('is idempotent in both directions and collapses reduced motion to the endpoint', async () => {
    const transition = createHeroPatternTransition();
    const timeline = await transition.buildTimeline(context(true));
    const start = timeline.sample?.(0);
    const end = timeline.sample?.(1);

    timeline.progress(1);
    timeline.progress(0);
    expect(timeline.sample?.(0)).toEqual(start);
    timeline.progress(1);
    expect(timeline.sample?.(1)).toEqual(end);
    await expect(timeline.play(1)).resolves.toBeUndefined();
  });
});
