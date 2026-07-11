import { beforeEach, describe, expect, it, vi } from 'vitest';

const vendor = vi.hoisted(() => ({
  boundaryDestroy: vi.fn(),
  boundaryPrewarm: vi.fn(),
  boundaryRender: vi.fn()
}));

vi.mock('../../vendor/ink-scene-transition.js', () => ({
  createInkBoundaryTransition: () => ({
    destroy: vendor.boundaryDestroy,
    prewarm: vendor.boundaryPrewarm,
    render: vendor.boundaryRender
  })
}));

import type { InkBoundaryFrame } from './inkBoundary';
import { createBoundaryInkRenderer } from './sceneInk';

function canvas(): HTMLCanvasElement {
  return {
    dataset: {},
    remove: vi.fn()
  } as unknown as HTMLCanvasElement;
}

beforeEach(() => {
  vendor.boundaryDestroy.mockClear();
  vendor.boundaryPrewarm.mockClear();
  vendor.boundaryRender.mockClear();
});

describe('shared ink renderer lifecycle', () => {
  it('forwards one boundary frame and releases WebGL resources before removing its canvas', () => {
    const surface = canvas();
    const renderer = createBoundaryInkRenderer(surface);
    const frame = {
      kind: 'horizontal',
      origin: { x: 0.5, y: 1 },
      progress: 0.5,
      profile: new Uint8Array([0, 127, 255]),
      revealClipPath: 'polygon(0% 50%, 100% 50%, 100% 100%, 0% 100%)',
      concealClipPath: 'polygon(0% 0%, 100% 0%, 100% 50%, 0% 50%)',
      revision: 'shared-boundary-frame'
    } satisfies InkBoundaryFrame;

    renderer?.prewarm(frame);
    renderer?.render(frame);

    renderer?.destroy();

    expect(vendor.boundaryPrewarm).toHaveBeenCalledWith(frame);
    expect(vendor.boundaryRender).toHaveBeenCalledWith(frame, 0, 0);
    expect(vendor.boundaryDestroy).toHaveBeenCalledTimes(1);
    expect(surface.remove).toHaveBeenCalledOnce();
  });
});
