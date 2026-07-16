import { afterEach, describe, expect, it, vi } from 'vitest';
import { storyManifest } from '../../story/manifest';
import { verifySegmentTimeline } from '../../story/verifySegmentTimeline';
import {
  createMethodBottomFigure2Transition,
  figure2InkProgressForMethodBottom
} from './index';
import { figure2AnimationScene, renderFigure2Hold } from '../../scenes/figure2-animation';
import type { LayerHandle, LayerVisibilityState, SceneId, SpineSegmentNode, TransitionContext } from '../../story/types';
import { createBackHalfDomContext, FakeCanvas, FakeElement, FakeVideo } from '../__fixtures__/back-half.fixture';

afterEach(() => {
  vi.unstubAllGlobals();
});

function layer(scene: SceneId, role: 'current' | 'next', element: HTMLElement | null = null): LayerHandle {
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
    element,
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

function segment(): SpineSegmentNode {
  const found = storyManifest.nodes.find((node): node is SpineSegmentNode => node.kind === 'segment' && node.id === 'method-bottom-figure2');
  if (!found) {
    throw new Error('method-bottom-figure2 segment missing');
  }
  return structuredClone(found);
}

function context(prefersReducedMotion = false, methodElement: HTMLElement | null = null): TransitionContext {
  return {
    segment: segment(),
    from: layer('method-bottom', 'current', methodElement),
    to: layer('figure2-animation', 'next'),
    stage: {
      getLayer: () => undefined,
      ensureLayer: (scene, role) => layer(scene, role === 'current' ? 'current' : 'next'),
      releaseLayer: () => undefined,
      snapshot: () => []
    },
    direction: 1,
    runId: 'r4-g2-test:1',
    prepareToken: 'r4-g2-test:prepare:1',
    prefersReducedMotion,
    reportMilestone: () => undefined
  };
}

describe('method-bottom-figure2 transition', () => {
  it('uses the dedicated Method steps reading scene as its source', () => {
    expect(segment()).toMatchObject({
      from: 'method-bottom',
      to: 'figure2-animation'
    });
  });

  it('keeps figure2 on its opening frame while the bottom ink reveal runs', () => {
    expect(segment().virtualDuration).toBeLessThanOrEqual(1600);
    expect(figure2InkProgressForMethodBottom(0.4)).toBeCloseTo(0.5, 5);
    expect(figure2InkProgressForMethodBottom(0.8)).toBe(1);
    expect(figure2AnimationScene.renderHold).toBe(renderFigure2Hold);
  });

  it('uses the existing posters during ink and defers dual-video seeking until the settled hold', async () => {
    const fixture = createBackHalfDomContext(
      'method-bottom-figure2',
      'method-bottom',
      'figure2-animation'
    );
    const left = new FakeVideo();
    const right = new FakeVideo();
    vi.spyOn(fixture.toRoot, 'querySelectorAll').mockReturnValue([left, right]);
    vi.stubGlobal('document', { createElement: () => new FakeCanvas() });

    const timeline = await createMethodBottomFigure2Transition().buildTimeline(fixture.context);

    expect(left.currentTimeWrites).toBe(0);
    expect(right.currentTimeWrites).toBe(0);
    timeline.dispose();
  });

  it('shares one organic bottom-to-top boundary between Figure2 and the effect canvas', async () => {
    const fixture = createBackHalfDomContext(
      'method-bottom-figure2',
      'method-bottom',
      'figure2-animation'
    );
    const canvas = new FakeCanvas();
    const retainedArch = new FakeElement();
    retainedArch.dataset.stageRetainedFigure2Arch = 'true';
    fixture.stage.append(retainedArch);
    vi.stubGlobal('document', { createElement: () => canvas });
    const timeline = await createMethodBottomFigure2Transition().buildTimeline(fixture.context);
    const receiver = fixture.stage.children[1]!;

    timeline.progress(0.5);

    expect(receiver.style.clipPath).toMatch(/^polygon\(/);
    expect(receiver.style.clipPath).not.toContain('inset(');
    expect(receiver.dataset.r4InkBoundaryKind).toBe('horizontal');
    expect(receiver.dataset.r4InkBoundaryRevision).toMatch(/^horizontal-ink-contour-v2-/);
    expect(canvas.dataset.r4InkBoundaryRevision).toBeUndefined();
    expect(canvas.dataset.r4InkContourThreshold).toBeUndefined();
    expect(retainedArch.dataset.r4InkBoundaryRevision).toBe(receiver.dataset.r4InkBoundaryRevision);
    expect(retainedArch.dataset.r4InkContourThreshold).toBe(receiver.dataset.r4InkContourThreshold);
    expect(retainedArch.style.clipPath).toMatch(/^polygon\(/);
  });

  it('passes timeline verification and exposes reduced motion fallback', async () => {
    const transition = createMethodBottomFigure2Transition();
    const timeline = await transition.buildTimeline(context());

    expect(transition.reducedMotionFallback).toBeTypeOf('function');
    expect(verifySegmentTimeline(timeline, { policy: segment().policy })).toMatchObject({
      maxVisibleLayers: 2
    });
    expect(timeline.sample?.(0.17)).toMatchObject({
      from: { visible: true, opacity: 1 },
      to: { visible: true, opacity: 1 }
    });
    expect(timeline.sample?.(0.5)).toMatchObject({
      from: { visible: true, opacity: 1 },
      to: { visible: true, opacity: 1 }
    });
  });

  it('is idempotent across 0 to 1 to 0 to 1 progress', async () => {
    const timeline = await createMethodBottomFigure2Transition().buildTimeline(context());

    timeline.progress(0);
    const start = timeline.sample?.(0);
    timeline.progress(1);
    const end = timeline.sample?.(1);
    timeline.progress(0);
    expect(timeline.sample?.(0)).toEqual(start);
    timeline.progress(1);
    expect(timeline.sample?.(1)).toEqual(end);
  });

  it('collapses duration in reduced motion', async () => {
    const timeline = await createMethodBottomFigure2Transition().buildTimeline(context(true));

    await expect(timeline.play(1)).resolves.toBeUndefined();
    expect(timeline.sample?.(1).to.visible).toBe(true);
  });

  it('leaves reverse Method entry positioning to Director settlement', async () => {
    const scrollport = {
      scrollTop: 0,
      scrollHeight: 1_640,
      clientHeight: 640,
      dataset: {}
    } as unknown as HTMLElement;
    const inkCanvas = {
      dataset: {},
      getContext: () => null,
      remove: () => undefined
    } as unknown as HTMLCanvasElement;
    const methodLayer = {
      style: {
        opacity: '',
        visibility: '',
        pointerEvents: '',
        setProperty: () => undefined,
        removeProperty: () => undefined
      },
      dataset: {},
      inert: false,
      setAttribute: () => undefined,
      removeAttribute: () => undefined,
      querySelector: (selector: string) => {
        if (selector === '[data-reading-scrollport="true"]') {
          return scrollport;
        }
        return selector.includes('canvas[data-r4-ink-segment=') ? inkCanvas : null;
      }
    } as unknown as HTMLElement;
    const timeline = await createMethodBottomFigure2Transition().buildTimeline(context(true, methodLayer));

    timeline.progress(1);
    await timeline.reverse();

    expect(scrollport.scrollTop).toBe(0);
    expect(scrollport.dataset.readingEdge).toBeUndefined();
  });
});
