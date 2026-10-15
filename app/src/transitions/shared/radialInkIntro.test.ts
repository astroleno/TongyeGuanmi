import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeCanvas, FakeElement } from '../__fixtures__/back-half.fixture';

const boundaryRenderer = vi.hoisted(() => ({
  canvas: null as HTMLCanvasElement | null,
  destroy: vi.fn(),
  prewarm: vi.fn(),
  render: vi.fn()
}));
const boundaryState = vi.hoisted(() => ({
  creations: 0,
  lostCanvases: new WeakSet<object>()
}));

vi.mock('../../vendor/ink-scene-transition.js', () => ({
  createInkBoundaryTransition: vi.fn((canvas: HTMLCanvasElement) => {
    if (boundaryState.lostCanvases.has(canvas)) {
      throw new Error('WebGL context was permanently lost');
    }
    boundaryState.creations += 1;
    boundaryRenderer.canvas = canvas;
    return boundaryRenderer;
  })
}));

import { createRadialInkIntroController } from './radialInkIntro';

beforeEach(() => {
  boundaryState.creations = 0;
  boundaryState.lostCanvases = new WeakSet<object>();
  boundaryRenderer.destroy.mockReset().mockImplementation((loseContext = true) => {
    if (loseContext && boundaryRenderer.canvas) {
      boundaryState.lostCanvases.add(boundaryRenderer.canvas);
    }
  });
  boundaryRenderer.prewarm.mockClear();
  boundaryRenderer.render.mockReset();
  boundaryRenderer.canvas = null;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('radial Ink intro controller', () => {
  it('retains shared shaders across request, held and presented endpoint samples until window disposal', () => {
    const controller = createRadialInkIntroController({
      canvas: new FakeCanvas() as unknown as HTMLCanvasElement,
      sharedCanvas: new FakeCanvas() as unknown as HTMLCanvasElement,
      restoreSharedCanvas: vi.fn(), revealSurface: new FakeElement() as unknown as HTMLElement,
      field: { kind: 'radial', origin: { x: .5, y: .5 }, seed: 'hero-pattern' },
      generation: 'shared-endpoint', deferUntilVisible: true,
      viewport: () => ({ width: 390, height: 844 })
    });
    // A single coherent RAF may sample desired terminal, previous held pose,
    // and then accepted terminal. Visual endpoints must not churn resources.
    for (const progress of [.998, 1, .998, 1, .5, 1, 1]) controller.render(progress);
    expect(boundaryState.creations).toBe(1);
    expect(boundaryRenderer.render).toHaveBeenCalledTimes(6);
    expect(boundaryRenderer.destroy).not.toHaveBeenCalled();
    controller.dispose();
    expect(boundaryRenderer.destroy).toHaveBeenCalledOnce();
    expect(boundaryRenderer.destroy).toHaveBeenCalledWith(false);
  });
  it('restores the lender after every ink draw and never probes an output for WebGL on disposal', async () => {
    const canvas = new FakeCanvas();
    const shared = new FakeCanvas();
    const restore = vi.fn();
    const getContext = vi.fn();
    Object.assign(canvas, { getContext, isConnected: false });
    boundaryRenderer.render.mockImplementation(() => expect(restore).toHaveBeenCalledTimes(1));
    const controller = createRadialInkIntroController({
      canvas: canvas as unknown as HTMLCanvasElement, sharedCanvas: shared as unknown as HTMLCanvasElement,
      restoreSharedCanvas: restore, revealSurface: new FakeElement() as unknown as HTMLElement,
      field: { kind: 'radial', origin: { x: .5, y: .5 }, seed: 'hero-pattern' },
      generation: 'shared-entry', viewport: () => ({ width: 390, height: 844 })
    });
    controller.prewarm(); controller.render(.5);
    expect(restore).toHaveBeenCalledTimes(2);
    controller.dispose(); await Promise.resolve();
    expect(getContext).not.toHaveBeenCalled();
    expect(boundaryRenderer.destroy).toHaveBeenCalledWith(false);
  });
  it('does not allocate a scroll intro for endpoint-only visits but still renders a reversed middle pose', () => {
    const canvas = new FakeCanvas();
    const controller = createRadialInkIntroController({
      canvas: canvas as unknown as HTMLCanvasElement, revealSurface: new FakeElement() as unknown as HTMLElement,
      field: { kind: 'radial', origin: { x: .5, y: .5 }, seed: 'hero-pattern' },
      generation: 'scroll-entry', deferUntilVisible: true, viewport: () => ({ width: 390, height: 844 })
    });
    controller.prewarm(); controller.render(0); controller.render(1);
    expect(boundaryState.creations).toBe(0);
    controller.render(.5);
    expect(boundaryState.creations).toBe(1);
    expect(canvas.dataset.heroIntroInkActive).toBe('true');
  });
  it('retires only used, detached contexts after the terminal frame', async () => {
    for (const used of [false, true]) for (const connected of [false, true]) {
      const canvas = new FakeCanvas();
      const loseContext = vi.fn();
      const getContext = vi.fn(() => ({ isContextLost: () => false, getExtension: () => ({ loseContext }) }));
      Object.assign(canvas, { getContext, isConnected: connected });
      const controller = createRadialInkIntroController({
        canvas: canvas as unknown as HTMLCanvasElement,
        revealSurface: new FakeElement() as unknown as HTMLElement,
        field: { kind: 'radial', origin: { x: .5, y: .5 }, seed: 'hero-pattern' },
        generation: 'retirement', viewport: () => ({ width: 1440, height: 900 })
      });
      if (used) { controller.render(.5); controller.render(1); }
      controller.dispose(); controller.dispose();
      await Promise.resolve();
      expect(getContext).toHaveBeenCalledTimes(used && !connected ? 1 : 0);
      expect(loseContext).toHaveBeenCalledTimes(used && !connected ? 1 : 0);
    }
  });
  it('keeps Hero radial reveal shader-owned and cleans its canvas lifecycle', () => {
    const canvas = new FakeCanvas();
    const revealSurface = new FakeElement();
    const controller = createRadialInkIntroController({
      canvas: canvas as unknown as HTMLCanvasElement,
      revealSurface: revealSurface as unknown as HTMLElement,
      field: {
        kind: 'radial',
        origin: { x: 0.5, y: 0.5 },
        seed: 'hero-pattern'
      },
      generation: 'hero-intro:test',
      viewport: () => ({ width: 1440, height: 900 })
    });

    controller.prewarm();
    controller.render(0.5);

    expect(boundaryRenderer.prewarm).toHaveBeenCalledOnce();
    expect(boundaryRenderer.render).toHaveBeenCalledOnce();
    expect(revealSurface.style.clipPath).toBe('');
    expect(revealSurface.dataset.r4InkOwnership).toBeUndefined();
    expect(canvas.dataset.heroIntroInkActive).toBe('true');

    controller.render(1);
    expect(revealSurface.style.clipPath).toBe('');
    expect(canvas.dataset.heroIntroInkActive).toBe('false');
    expect(boundaryRenderer.destroy).toHaveBeenCalledWith(false);

    controller.dispose();
    expect(boundaryRenderer.destroy).toHaveBeenCalledOnce();
    expect(revealSurface.dataset.r4InkOwnership).toBeUndefined();
    expect(canvas.dataset.heroIntroInkActive).toBeUndefined();
  });

  it('keeps terminal Hero luminance covered through the canvas-to-DOM handoff', () => {
    const canvas = new FakeCanvas();
    const revealSurface = new FakeElement();
    const targetImage = Object.assign(new FakeElement(), {
      complete: true,
      naturalWidth: 1440,
      naturalHeight: 900,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    });
    boundaryRenderer.render.mockImplementation((frame: { progress: number }) => {
      const fadeOut = 1 - ((value: number) => value * value * (3 - 2 * value))(
        Math.min(1, Math.max(0, (frame.progress - 0.995) / 0.005))
      );
      if (boundaryRenderer.canvas) {
        boundaryRenderer.canvas.style.opacity = fadeOut.toFixed(4);
      }
    });
    const controller = createRadialInkIntroController({
      canvas: canvas as unknown as HTMLCanvasElement,
      revealSurface: revealSurface as unknown as HTMLElement,
      targetImage: targetImage as unknown as HTMLImageElement,
      field: {
        kind: 'radial',
        origin: { x: 0.5, y: 0.5 },
        seed: 'hero-pattern'
      },
      generation: 'hero-intro:handoff',
      viewport: () => ({ width: 1440, height: 900 })
    });
    const sourceLuminance = 0.62;
    const stageLuminance = 0.04;
    const samples = [0.94, 0.9675, 0.995, 1].map((progress) => {
      controller.render(progress);
      const canvasOpacity = Number.parseFloat(canvas.style.opacity || '0');
      const domOpacity = Number.parseFloat(
        revealSurface.style.getPropertyValue('--r4-hero-back-ink-opacity') || '0'
      );
      // Both visible owners carry the same target texture. This is the
      // composited luminance above the dark Hero stage at each terminal point.
      const compositedLuminance = canvasOpacity * sourceLuminance
        + (1 - canvasOpacity) * (
          domOpacity * sourceLuminance + (1 - domOpacity) * stageLuminance
        );
      return { progress, canvasOpacity, domOpacity, compositedLuminance };
    });

    expect(samples).toEqual([
      expect.objectContaining({ progress: 0.94, canvasOpacity: 1, domOpacity: 0 }),
      expect.objectContaining({ progress: 0.9675, canvasOpacity: 1, domOpacity: 0.5 }),
      expect.objectContaining({ progress: 0.995, canvasOpacity: 1, domOpacity: 1 }),
      expect.objectContaining({ progress: 1, canvasOpacity: 0, domOpacity: 1 })
    ]);
    for (const sample of samples) {
      expect(sample.compositedLuminance, `Hero luminance at p=${sample.progress}`).toBeCloseTo(
        sourceLuminance,
        4
      );
    }
  });

  it('recreates an active renderer on the same persistent Canvas after cleanup', () => {
    const canvas = new FakeCanvas();
    const revealSurface = new FakeElement();
    const createController = (generation: string) => createRadialInkIntroController({
      canvas: canvas as unknown as HTMLCanvasElement,
      revealSurface: revealSurface as unknown as HTMLElement,
      field: {
        kind: 'radial',
        origin: { x: 0.5, y: 0.5 },
        seed: 'hero-pattern'
      },
      generation,
      viewport: () => ({ width: 1440, height: 900 })
    });

    const discarded = createController('hero-intro:strict-discarded');
    discarded.render(0.5);
    expect(canvas.dataset.r4InkRendererStatus).toBe('active');
    discarded.dispose();
    expect(boundaryRenderer.destroy).toHaveBeenLastCalledWith(false);

    const live = createController('hero-intro:strict-live');
    live.render(0.5);

    expect(boundaryState.creations).toBe(2);
    expect(canvas.dataset.r4InkRendererStatus).toBe('active');
    expect(canvas.dataset.heroIntroInkActive).toBe('true');
    live.dispose();
  });
});
