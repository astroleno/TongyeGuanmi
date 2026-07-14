import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeCanvas, FakeElement } from '../__fixtures__/back-half.fixture';

const boundaryRenderer = vi.hoisted(() => ({
  destroy: vi.fn(),
  prewarm: vi.fn(),
  render: vi.fn()
}));

vi.mock('../../vendor/ink-scene-transition.js', () => ({
  createInkBoundaryTransition: vi.fn(() => boundaryRenderer)
}));

import { createRadialInkIntroController } from './radialInkIntro';

beforeEach(() => {
  boundaryRenderer.destroy.mockClear();
  boundaryRenderer.prewarm.mockClear();
  boundaryRenderer.render.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('radial Ink intro controller', () => {
  it('shares the radial ownership boundary and cleans its canvas lifecycle', () => {
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
    expect(revealSurface.style.clipPath).toMatch(/^circle\(/);
    expect(revealSurface.dataset.r4InkOwnership).toBe('reveal');
    expect(canvas.dataset.heroIntroInkActive).toBe('true');

    controller.render(1);
    expect(revealSurface.style.clipPath).toBe('');
    expect(canvas.dataset.heroIntroInkActive).toBe('false');

    controller.dispose();
    expect(boundaryRenderer.destroy).toHaveBeenCalledOnce();
    expect(revealSurface.dataset.r4InkOwnership).toBeUndefined();
    expect(canvas.dataset.heroIntroInkActive).toBeUndefined();
  });
});
