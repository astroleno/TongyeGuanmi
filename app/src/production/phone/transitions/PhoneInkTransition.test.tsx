import { beforeEach, describe, expect, it, vi } from 'vitest';

const inkLifecycle = vi.hoisted(() => ({
  createRenderer: vi.fn(),
  destroyCalls: [] as boolean[]
}));

vi.mock('../../../transitions/shared/sceneInk', () => ({
  mountTransitionInkCanvas: (
    _host: HTMLElement,
    _id: string,
    _options: unknown,
    canvas: HTMLCanvasElement
  ) => canvas,
  createInkFieldRenderer: (
    canvas: HTMLCanvasElement,
    lifecycle: { loseContextOnDestroy?: boolean }
  ) => {
    inkLifecycle.createRenderer(canvas, lifecycle);
    if (canvas.dataset.testInkContextLost === 'true') return null;
    return {
      destroy() {
        const loseContext = lifecycle.loseContextOnDestroy ?? true;
        inkLifecycle.destroyCalls.push(loseContext);
        if (loseContext) canvas.dataset.testInkContextLost = 'true';
      },
      getFailure: () => null,
      isActive: () => true,
      prewarm: vi.fn(),
      rebindGeneration: () => true,
      render: vi.fn()
    };
  }
}));

vi.mock('../../../transitions/shared/inkOwnership', () => ({
  applyConcealBoundary: vi.fn(),
  applyRevealBoundary: vi.fn(),
  clearBoundaryGeometry: vi.fn()
}));

import { createPhoneInkTransition } from '../phone-ink';

function fixture() {
  const style = {
    opacity: '',
    visibility: '',
    removeProperty: vi.fn()
  };
  const canvas = {
    className: 'phone-story-shell__ink',
    clientHeight: 180,
    clientWidth: 320,
    dataset: {},
    remove: vi.fn(),
    style
  } as unknown as HTMLCanvasElement;
  const host = {
    clientHeight: 180,
    clientWidth: 320
  } as HTMLElement;
  const receiver = {
    style: {}
  } as HTMLElement;
  return { canvas, host, receiver };
}

beforeEach(() => {
  inkLifecycle.createRenderer.mockClear();
  inkLifecycle.destroyCalls.length = 0;
});

describe('PhoneInkTransition persistent Canvas lifecycle', () => {
  it('recreates an active renderer on the exact same Canvas after cleanup', () => {
    const { canvas, host, receiver } = fixture();
    const options = {
      host,
      canvas,
      id: 'phone-strict-remount',
      to: receiver,
      field: {
        kind: 'horizontal',
        direction: 'bottom-to-top',
        seed: 'phone-strict-remount'
      } as const
    };

    const first = createPhoneInkTransition(options);
    first.dispose();
    const second = createPhoneInkTransition(options);

    expect(inkLifecycle.createRenderer).toHaveBeenCalledTimes(2);
    expect(inkLifecycle.destroyCalls).toEqual([false]);
    expect(canvas.dataset.testInkContextLost).toBeUndefined();
    expect(canvas.dataset.phoneInkRenderer).toBe('active');

    second.dispose();
    expect(inkLifecycle.destroyCalls).toEqual([false, false]);
  });
});
