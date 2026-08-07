import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeCanvas, FakeElement } from '../__fixtures__/back-half.fixture';

const boundaryRenderer = vi.hoisted(() => ({
  canvas: null as HTMLCanvasElement | null,
  destroy: vi.fn(),
  prewarm: vi.fn(),
  render: vi.fn()
}));

vi.mock('../../vendor/ink-scene-transition.js', () => ({
  createInkBoundaryTransition: vi.fn((canvas: HTMLCanvasElement) => {
    boundaryRenderer.canvas = canvas;
    return boundaryRenderer;
  })
}));

import { createRadialInkIntroController } from './radialInkIntro';

beforeEach(() => {
  boundaryRenderer.destroy.mockClear();
  boundaryRenderer.prewarm.mockClear();
  boundaryRenderer.render.mockReset();
  boundaryRenderer.canvas = null;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('radial Ink intro controller', () => {
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
});
