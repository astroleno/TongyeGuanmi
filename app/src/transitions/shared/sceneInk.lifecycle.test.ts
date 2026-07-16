import { beforeEach, describe, expect, it, vi } from 'vitest';

const vendor = vi.hoisted(() => ({
  boundaryDestroy: vi.fn(),
  boundaryPrewarm: vi.fn(),
  boundaryRender: vi.fn(),
  createBoundary: vi.fn()
}));

vi.mock('../../vendor/ink-scene-transition.js', () => ({
  createInkBoundaryTransition: (...args: unknown[]) => {
    vendor.createBoundary(...args);
    return {
      destroy: vendor.boundaryDestroy,
      prewarm: vendor.boundaryPrewarm,
      render: vendor.boundaryRender
    };
  }
}));

import { createInkFieldFrame } from './inkField';
import {
  HORIZONTAL_INK_CONTOUR_SAMPLES,
  createHorizontalInkContour
} from './horizontalInkContour';
import {
  createInkFieldRenderer,
  mountTransitionInkCanvas
} from './sceneInk';
import { FakeCanvas, FakeElement } from '../__fixtures__/back-half.fixture';

function canvas() {
  const listeners = new Map<string, EventListener>();
  const surface = {
    dataset: {},
    remove: vi.fn(),
    addEventListener: vi.fn((type: string, listener: EventListener) => listeners.set(type, listener)),
    removeEventListener: vi.fn((type: string, listener: EventListener) => {
      if (listeners.get(type) === listener) {
        listeners.delete(type);
      }
    })
  } as unknown as HTMLCanvasElement;
  return {
    surface,
    dispatch(type: string, event: Pick<Event, 'preventDefault'>) {
      listeners.get(type)?.(event as Event);
    }
  };
}

beforeEach(() => {
  vendor.boundaryDestroy.mockClear();
  vendor.boundaryPrewarm.mockClear();
  vendor.boundaryRender.mockClear();
  vendor.createBoundary.mockClear();
});

describe('shared ink renderer lifecycle', () => {
  it('forwards one boundary frame and releases WebGL resources before removing its canvas', () => {
    const { surface } = canvas();
    const renderer = createInkFieldRenderer(surface);
    const contour = createHorizontalInkContour({
      authoredSeed: 'shared-field-frame',
      variationKey: 'run:shared:1'
    });
    const frame = createInkFieldFrame(
      { kind: 'horizontal', direction: 'bottom-to-top', seed: 'shared-field-frame' },
      0.5,
      { width: 1440, height: 900 },
      { contour }
    );

    renderer?.prewarm(frame);
    renderer?.render(frame);

    expect(surface.dataset.r4InkContourRevision).toBe(contour.revision);
    expect(surface.dataset.r4InkContourThreshold).toBe('0.500000');
    expect(surface.dataset.r4InkContourSeed).toBe(String(contour.seed));
    expect(surface.dataset.r4InkContourSamples).toBe(String(HORIZONTAL_INK_CONTOUR_SAMPLES));

    renderer?.destroy();

    expect(vendor.boundaryPrewarm).toHaveBeenCalledWith(frame);
    expect(vendor.boundaryRender).toHaveBeenCalledWith(frame, 0, 0);
    expect(vendor.boundaryDestroy).toHaveBeenCalledTimes(1);
    expect(surface.remove).toHaveBeenCalledOnce();
    expect(vendor.createBoundary).toHaveBeenCalledWith(surface, {
      colorLift: 0.92,
      coverAlpha: 0,
      fadeOutStart: 0.94,
      fadeOutEnd: 0.995,
      dprLimit: 1
    });
    expect(surface.dataset.r4InkGrade).toBe('edge-only');
    expect(surface.dataset.r4InkRendererActive).toBe('false');
    expect(surface.dataset.r4InkContourRevision).toBeUndefined();
    expect(surface.dataset.r4InkContourThreshold).toBeUndefined();
    expect(surface.dataset.r4InkContourSeed).toBeUndefined();
    expect(surface.dataset.r4InkContourSamples).toBeUndefined();
  });

  it('keeps dark as an explicit grade with the same renderer contract', () => {
    const { surface } = canvas();
    const renderer = createInkFieldRenderer(surface, { grade: 'dark', generation: 'dark-run:1' });

    expect(vendor.createBoundary).toHaveBeenCalledWith(surface, {
      colorLift: 0.92,
      coverAlpha: 0.82,
      fadeOutStart: 0.94,
      fadeOutEnd: 0.995,
      dprLimit: 1
    });
    expect(surface.dataset.r4InkGrade).toBe('dark');
    expect(surface.dataset.r4InkGeneration).toBe('dark-run:1');
    expect(renderer?.isActive()).toBe(true);
    renderer?.destroy();
  });

  it('marks and clears the shared horizontal contour lifecycle', () => {
    const { surface } = canvas();
    const renderer = createInkFieldRenderer(surface, {
      generation: 'contour-run:1',
      removeCanvasOnDestroy: false
    });
    const contour = createHorizontalInkContour({
      authoredSeed: 'services-ttg',
      variationKey: 'contour-run:1'
    });
    const frame = createInkFieldFrame(
      { kind: 'horizontal', direction: 'bottom-to-top', seed: 'services-ttg' },
      0.5,
      { width: 1440, height: 900 },
      { contour }
    );

    renderer?.render(frame);

    expect(surface.dataset.r4InkContourRevision).toBe(contour.revision);
    expect(surface.dataset.r4InkContourThreshold).toBe(frame.threshold.toFixed(6));
    expect(surface.dataset.r4InkContourSeed).toBe(String(contour.seed));
    expect(surface.dataset.r4InkContourSamples).toBe(String(HORIZONTAL_INK_CONTOUR_SAMPLES));

    renderer?.destroy();

    expect(surface.dataset.r4InkContourRevision).toBeUndefined();
    expect(surface.dataset.r4InkContourThreshold).toBeUndefined();
    expect(surface.dataset.r4InkContourSeed).toBeUndefined();
    expect(surface.dataset.r4InkContourSamples).toBeUndefined();
  });

  it('invalidates only the matching run generation after context loss', () => {
    const { surface, dispatch } = canvas();
    const invalidated = vi.fn();
    const renderer = createInkFieldRenderer(surface, {
      generation: 'run:lost:1',
      onInvalidated: invalidated
    });
    const replacementCanvas = canvas();
    const replacement = createInkFieldRenderer(replacementCanvas.surface, {
      generation: 'run:replacement:2'
    });
    const frame = createInkFieldFrame(
      { kind: 'horizontal', direction: 'bottom-to-top', seed: 'lost-generation' },
      0.5,
      { width: 1440, height: 900 }
    );
    const preventDefault = vi.fn();

    dispatch('webglcontextlost', { preventDefault });
    renderer?.render(frame);

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(renderer?.isActive()).toBe(false);
    expect(renderer?.getFailure()).toEqual({ generation: 'run:lost:1', reason: 'context-lost' });
    expect(invalidated).toHaveBeenCalledWith({ generation: 'run:lost:1', reason: 'context-lost' });
    expect(invalidated).toHaveBeenCalledOnce();
    expect(surface.dataset.r4InkRendererStatus).toBe('context-lost');
    expect(vendor.boundaryRender).not.toHaveBeenCalled();
    dispatch('webglcontextlost', { preventDefault });
    replacement?.render(frame);
    expect(replacement?.isActive()).toBe(true);
    expect(replacementCanvas.surface.dataset.r4InkRendererStatus).toBe('active');
    expect(vendor.boundaryRender).toHaveBeenCalledOnce();
    renderer?.destroy();
    renderer?.destroy();
    expect(vendor.boundaryDestroy).toHaveBeenCalledOnce();
    replacement?.destroy();
    expect(vendor.boundaryDestroy).toHaveBeenCalledTimes(2);
  });

  it('invalidates and releases a renderer whose run generation is replaced', () => {
    const { surface } = canvas();
    const invalidated = vi.fn();
    const renderer = createInkFieldRenderer(surface, {
      generation: 'run:original:1',
      onInvalidated: invalidated
    });

    surface.dataset.r4InkGeneration = 'run:replacement:2';

    expect(renderer?.isActive()).toBe(false);
    expect(renderer?.getFailure()).toEqual({
      generation: 'run:original:1',
      reason: 'generation-mismatch'
    });
    expect(invalidated).toHaveBeenCalledOnce();
    expect(vendor.boundaryDestroy).toHaveBeenCalledOnce();
    renderer?.destroy();
    expect(vendor.boundaryDestroy).toHaveBeenCalledOnce();
  });

  it('adopts a prepared renderer generation until its context is invalidated', () => {
    const { surface, dispatch } = canvas();
    const renderer = createInkFieldRenderer(surface, { generation: 'prewarm:shared' });
    const preventDefault = vi.fn();

    expect(renderer?.rebindGeneration('live:run:1')).toBe(true);
    expect(surface.dataset.r4InkGeneration).toBe('live:run:1');
    dispatch('webglcontextlost', { preventDefault });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(renderer?.getFailure()).toEqual({ generation: 'live:run:1', reason: 'context-lost' });
    expect(renderer?.rebindGeneration('live:run:2')).toBe(false);
  });

  it('mounts a fresh Stage canvas for every run even with the same segment id', () => {
    const host = new FakeElement();
    const created: FakeCanvas[] = [];
    vi.stubGlobal('document', {
      createElement: () => {
        const next = new FakeCanvas();
        created.push(next);
        return next;
      }
    });

    const first = mountTransitionInkCanvas(host as unknown as HTMLElement, 'star-map-aod', {
      renderer: 'field',
      grade: 'edge-only',
      generation: 'run:1'
    });
    const second = mountTransitionInkCanvas(host as unknown as HTMLElement, 'star-map-aod', {
      renderer: 'field',
      grade: 'edge-only',
      generation: 'run:2'
    });

    expect(first).not.toBe(second);
    expect(created).toHaveLength(2);
    expect(host.children).toHaveLength(2);
    expect(first?.dataset.r4InkGeneration).toBe('run:1');
    expect(second?.dataset.r4InkGeneration).toBe('run:2');
  });
});
