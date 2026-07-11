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

import { createInkFieldFrame } from './inkField';
import { createInkFieldRenderer } from './sceneInk';

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
    const renderer = createInkFieldRenderer(surface);
    const frame = createInkFieldFrame(
      { kind: 'horizontal', direction: 'bottom-to-top', seed: 'shared-field-frame' },
      0.5,
      { width: 1440, height: 900 }
    );

    renderer?.prewarm(frame);
    renderer?.render(frame);

    renderer?.destroy();

    expect(vendor.boundaryPrewarm).toHaveBeenCalledWith(frame);
    expect(vendor.boundaryRender).toHaveBeenCalledWith(frame, 0, 0);
    expect(vendor.boundaryDestroy).toHaveBeenCalledTimes(1);
    expect(surface.remove).toHaveBeenCalledOnce();
  });
});
