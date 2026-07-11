import { beforeEach, describe, expect, it, vi } from 'vitest';

const vendor = vi.hoisted(() => ({
  curtainDestroy: vi.fn(),
  sceneDestroy: vi.fn()
}));

vi.mock('../../vendor/ink-scene-transition.js', () => ({
  createInkCurtainTransition: () => ({ render() {}, prewarm() {}, destroy: vendor.curtainDestroy }),
  createInkSceneTransition: () => ({ render() {}, prewarm() {}, destroy: vendor.sceneDestroy })
}));

import { createCurtainInkRenderer, createSceneInkRenderer } from './sceneInk';

function canvas(): HTMLCanvasElement {
  return {
    dataset: {},
    remove: vi.fn()
  } as unknown as HTMLCanvasElement;
}

beforeEach(() => {
  vendor.curtainDestroy.mockClear();
  vendor.sceneDestroy.mockClear();
});

describe('shared ink renderer lifecycle', () => {
  it('releases the scene WebGL program, textures, shaders and buffer before removing its canvas', () => {
    const renderer = createSceneInkRenderer(canvas());

    renderer?.destroy();

    expect(vendor.sceneDestroy).toHaveBeenCalledTimes(1);
  });

  it('releases the curtain WebGL program, shaders and buffer before removing its canvas', () => {
    const renderer = createCurtainInkRenderer(canvas());

    renderer?.destroy();

    expect(vendor.curtainDestroy).toHaveBeenCalledTimes(1);
  });
});
