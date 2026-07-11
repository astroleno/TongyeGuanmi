import { beforeEach, describe, expect, it, vi } from 'vitest';

const vendor = vi.hoisted(() => ({
  curtainDestroy: vi.fn()
}));

vi.mock('../../vendor/ink-scene-transition.js', () => ({
  createInkCurtainTransition: () => ({ render() {}, prewarm() {}, destroy: vendor.curtainDestroy })
}));

import { createCurtainInkRenderer } from './sceneInk';

function canvas(): HTMLCanvasElement {
  return {
    dataset: {},
    remove: vi.fn()
  } as unknown as HTMLCanvasElement;
}

beforeEach(() => {
  vendor.curtainDestroy.mockClear();
});

describe('shared ink renderer lifecycle', () => {
  it('releases the curtain WebGL program, shaders and buffer before removing its canvas', () => {
    const renderer = createCurtainInkRenderer(canvas());

    renderer?.destroy();

    expect(vendor.curtainDestroy).toHaveBeenCalledTimes(1);
  });
});
