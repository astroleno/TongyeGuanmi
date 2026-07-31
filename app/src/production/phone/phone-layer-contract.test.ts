import { describe, expect, it } from 'vitest';
import {
  phonePresentationLayer,
  phonePresentationLayerZIndex,
  phoneTransitionLayerPlan
} from './phone-story/presentation';
import { phoneSegmentPresentationTuple } from './phone-story/manifest';

describe('phone layer ownership contract', () => {
  it('keeps the coverage plane below every projector-owned surface', () => {
    expect(phonePresentationLayerZIndex(phonePresentationLayer('coverage').role)).toBeLessThan(
      phonePresentationLayerZIndex(phonePresentationLayer('retained').role)
    );
    expect(phonePresentationLayerZIndex(phonePresentationLayer('retained').role)).toBeLessThan(
      phonePresentationLayerZIndex(phonePresentationLayer('fixed').role)
    );
    expect(phonePresentationLayerZIndex(phonePresentationLayer('fixed').role)).toBeLessThan(
      phonePresentationLayerZIndex(phonePresentationLayer('stable').role)
    );
  });

  it('places a cross-surface ink field above both endpoints', () => {
    const plan = phoneTransitionLayerPlan(
      phoneSegmentPresentationTuple('services-ttg'),
      1,
      .5
    );

    expect(plan.effect.placement).toBe('above-both');
    expect(phonePresentationLayerZIndex(plan.effect.role)).toBeGreaterThan(
      phonePresentationLayerZIndex(plan.source.role)
    );
    expect(phonePresentationLayerZIndex(plan.effect.role)).toBeGreaterThan(
      phonePresentationLayerZIndex(plan.receiver.role)
    );
  });

  it('keeps a media handoff effect on its declared plane even when hosted by source', () => {
    const forward = phoneTransitionLayerPlan(
      phoneSegmentPresentationTuple('ph-education'),
      1,
      .5
    );
    const reverse = phoneTransitionLayerPlan(
      phoneSegmentPresentationTuple('ph-education'),
      -1,
      .5
    );

    expect(forward.effect.host).toBe(forward.source.surface);
    expect(forward.effect.role).toBe('transition-effect-between');
    expect(phonePresentationLayerZIndex(forward.effect.role)).toBeGreaterThan(
      phonePresentationLayerZIndex(forward.source.role)
    );
    expect(phonePresentationLayerZIndex(forward.effect.role)).toBeLessThan(
      phonePresentationLayerZIndex(forward.receiver.role)
    );
    expect(reverse.source.surface).toBe(forward.receiver.surface);
    expect(reverse.receiver.surface).toBe(forward.source.surface);
  });
});
