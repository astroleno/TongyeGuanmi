import { describe, expect, it } from 'vitest';
import {
  phonePresentationHostPlaneForLayer,
  phonePresentationHostPlaneOrder,
  phonePresentationLocalLayerOrder,
  phoneTransitionLayerPlan
} from './phone-story/presentation';
import { phoneSegmentPresentationTuple } from './phone-story/manifest';

describe('phone layer ownership contract', () => {
  it('keeps coverage below the content host and orders local content roles', () => {
    const coverage = phonePresentationHostPlaneForLayer('coverage');
    const retained = phonePresentationHostPlaneForLayer('retained');

    expect(phonePresentationHostPlaneOrder(coverage)).toBeLessThan(
      phonePresentationHostPlaneOrder(retained)
    );
    expect(phonePresentationLocalLayerOrder('retained')).toBeLessThan(
      phonePresentationLocalLayerOrder('fixed')
    );
    expect(phonePresentationLocalLayerOrder('fixed')).toBeLessThan(
      phonePresentationLocalLayerOrder('stable')
    );
  });

  it('places a cross-surface ink field above both endpoints', () => {
    const plan = phoneTransitionLayerPlan(
      phoneSegmentPresentationTuple('services-ttg'),
      1,
      .5
    );
    const contract = phoneSegmentPresentationTuple('services-ttg');

    expect(contract[7]).toBe('above-both');
    expect(contract[10]).toBe('route-overlay');
    expect(phonePresentationHostPlaneOrder(contract[10])).toBeGreaterThan(
      phonePresentationHostPlaneOrder(phonePresentationHostPlaneForLayer('transition-source'))
    );
    expect(phonePresentationHostPlaneOrder(contract[10])).toBeGreaterThan(
      phonePresentationHostPlaneOrder(phonePresentationHostPlaneForLayer('transition-receiver'))
    );
    expect(plan[3]).toBe('transition-effect-above');
  });

  it('declares an explicit route-level host for every above-both effect', () => {
    const overlay = phoneTransitionLayerPlan(
      phoneSegmentPresentationTuple('services-ttg'),
      1,
      .5
    );
    const content = phoneTransitionLayerPlan(
      phoneSegmentPresentationTuple('ph-education'),
      1,
      .5
    );

    expect(phoneSegmentPresentationTuple(overlay[0])[10]).toBe('route-overlay');
    expect(phoneSegmentPresentationTuple(content[0])[10]).toBe('content');
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

    const contract = phoneSegmentPresentationTuple(forward[0]);
    expect(contract[6]).toBe(forward[1]);
    expect(contract[10]).toBe(
      phonePresentationHostPlaneForLayer('transition-source')
    );
    expect(forward[3]).toBe('transition-effect-between');
    expect(phonePresentationLocalLayerOrder(forward[3])).toBeGreaterThan(
      phonePresentationLocalLayerOrder('transition-source')
    );
    expect(phonePresentationLocalLayerOrder(forward[3])).toBeLessThan(
      phonePresentationLocalLayerOrder('transition-receiver')
    );
    expect(reverse[1]).toBe(forward[2]);
    expect(reverse[2]).toBe(forward[1]);
  });
});
