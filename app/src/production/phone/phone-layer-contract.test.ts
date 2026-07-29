import { describe, expect, it } from 'vitest';
import {
  phonePresentationLayer,
  phonePresentationLayerZIndex,
  phoneTransitionLayerPlan
} from './phone-presentation-layers';
import { phoneSegmentPresentationTuple } from './phone-presentation-contract';

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

  it('places a media handoff source below its directional receiver', () => {
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
    expect(forward.effect.role).toBe(forward.source.role);
    expect(reverse.source.surface).toBe(forward.receiver.surface);
    expect(reverse.receiver.surface).toBe(forward.source.surface);
  });
});
