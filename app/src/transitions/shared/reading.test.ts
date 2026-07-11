import { describe, expect, it } from 'vitest';
import type {
  LayerHandle,
  LayerVisibilityState,
  SpineSegmentNode,
  TransitionContext
} from '../../story/types';
import { createReadingSegmentTransition } from './reading';

class FakeStyle {
  transform = '';
  willChange = '';
}

class FakeElement {
  readonly style = new FakeStyle();

  querySelector(): null {
    return null;
  }
}

function layer(
  scene: 'services' | 'ttg-animation',
  role: 'current' | 'next',
  element: FakeElement
): LayerHandle {
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
    element: element as unknown as HTMLElement,
    get visibility() {
      return visibility;
    },
    setVisibility(next) {
      visibility = next;
    },
    dispose() {}
  };
}

function reverseContext(): TransitionContext {
  const segment = {
    kind: 'segment',
    id: 'services-ttg',
    from: 'services',
    to: 'ttg-animation',
    policy: { kind: 'snap', chargeThreshold: 0.1 },
    virtualDuration: 1200
  } satisfies SpineSegmentNode;
  const from = layer('services', 'next', new FakeElement());
  const to = layer('ttg-animation', 'current', new FakeElement());
  return {
    segment,
    from,
    to,
    stage: {
      getLayer: () => undefined,
      ensureLayer: () => to,
      releaseLayer() {},
      snapshot: () => []
    },
    direction: -1,
    runId: 'reading-reverse:1',
    prepareToken: 'reading-reverse:prepare:1',
    prefersReducedMotion: false,
    reportMilestone() {}
  };
}

describe('shared reading transition direction contract', () => {
  it('builds reverse directly at p=1 without writing the forward start', async () => {
    const context = reverseContext();
    const fromVisibilityWrites: LayerVisibilityState[] = [];
    const toVisibilityWrites: LayerVisibilityState[] = [];
    const setFromVisibility = context.from.setVisibility.bind(context.from);
    const setToVisibility = context.to.setVisibility.bind(context.to);
    context.from.setVisibility = (state) => {
      fromVisibilityWrites.push(state);
      setFromVisibility(state);
    };
    context.to.setVisibility = (state) => {
      toVisibilityWrites.push(state);
      setToVisibility(state);
    };

    await createReadingSegmentTransition({ id: 'services-ttg' }).buildTimeline(context);

    expect(context.from.visibility).toMatchObject({ visible: false, opacity: 0 });
    expect(context.to.visibility).toMatchObject({ visible: true, opacity: 1 });
    expect(fromVisibilityWrites.some((state) => state.visible)).toBe(false);
    expect(toVisibilityWrites.some((state) => !state.visible)).toBe(false);
  });

  it('settles reverse reduced motion at p=0', async () => {
    const context = reverseContext();
    context.prefersReducedMotion = true;
    const renderedProgress: number[] = [];

    await createReadingSegmentTransition({
      id: 'services-ttg',
      renderProgress: 'current',
      renderFrom: (_root, progress) => renderedProgress.push(progress),
      renderTo: (_root, progress) => renderedProgress.push(progress)
    }).reducedMotionFallback?.(context);

    expect(context.from.visibility).toMatchObject({ visible: true, opacity: 1 });
    expect(context.to.visibility).toMatchObject({ visible: false, opacity: 0 });
    expect(renderedProgress).toEqual([0, 0]);
  });
});
