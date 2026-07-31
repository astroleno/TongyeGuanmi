import { describe, expect, it } from 'vitest';
import { canonicalSegments } from '../../story/canonical-spine';
import {
  canonicalPhoneEffectSegment,
  phoneLayerForSurfaceRole,
  phonePresentationHostPlaneForLayer,
  phonePresentationHostPlaneOrder,
  phonePresentationLocalLayerOrder,
  phoneTransitionLayerPlan
} from './phone-story/presentation';
import { phoneSegmentPresentationTuple } from './phone-story/manifest';

describe('phone presentation layer contract', () => {
  it('keeps endpoint roles ordered inside the content host', () => {
    expect(phonePresentationLocalLayerOrder(phoneLayerForSurfaceRole('retired'))).toBeLessThan(
      phonePresentationLocalLayerOrder(phoneLayerForSurfaceRole('fixed-current'))
    );
    expect(phonePresentationLocalLayerOrder(phoneLayerForSurfaceRole('fixed-current'))).toBeLessThan(
      phonePresentationLocalLayerOrder(phoneLayerForSurfaceRole('stable'))
    );
    expect(phonePresentationLocalLayerOrder(phoneLayerForSurfaceRole('stable'))).toBeLessThan(
      phonePresentationLocalLayerOrder(phoneLayerForSurfaceRole('transition-source'))
    );
    expect(phonePresentationLocalLayerOrder(phoneLayerForSurfaceRole('transition-source'))).toBeLessThan(
      phonePresentationLocalLayerOrder(phoneLayerForSurfaceRole('transition-receiver'))
    );
  });

  it('[R5] resolves every canonical segment at forward/reverse endpoints and midpoint', () => {
    for (const { id } of canonicalSegments) {
      const contract = phoneSegmentPresentationTuple(id);
      for (const direction of [1, -1] as const) {
        for (const progress of [0, .5, 1]) {
          const plan = phoneTransitionLayerPlan(contract, direction, progress);
          const departing = direction === 1
            ? contract[4]
            : contract[5];
          const arriving = direction === 1
            ? contract[5]
            : contract[4];

          expect(plan[0]).toBe(id);
          expect(plan[1]).toBe(departing);
          expect(plan[2]).toBe(arriving);
          expect(phonePresentationLocalLayerOrder('transition-source')).toBeLessThan(
            phonePresentationLocalLayerOrder('transition-receiver')
          );

          if (contract[7] === 'above-both') {
            expect(contract[10]).toBe('route-overlay');
            expect(phonePresentationHostPlaneOrder(contract[10])).toBeGreaterThan(
              phonePresentationHostPlaneOrder(
                phonePresentationHostPlaneForLayer('transition-receiver')
              )
            );
          } else if (contract[7] === 'between') {
            expect(contract[10]).toBe('content');
            expect(phonePresentationLocalLayerOrder(plan[3])).toBeGreaterThan(
              phonePresentationLocalLayerOrder('transition-source')
            );
            expect(phonePresentationLocalLayerOrder(plan[3])).toBeLessThan(
              phonePresentationLocalLayerOrder('transition-receiver')
            );
          }
        }
      }
    }
  });

  it('recognizes every production ink canvas as its canonical segment', () => {
    expect(canonicalPhoneEffectSegment('portrait-hero-pattern-ink')).toBe('hero-pattern');
    expect(canonicalPhoneEffectSegment('portrait-pattern-star-ink')).toBe('pattern-star-map');
    expect(canonicalPhoneEffectSegment('portrait-star-aod-ink')).toBe('star-map-aod');
    expect(canonicalPhoneEffectSegment('phone-method-bottom-figure2')).toBe('method-bottom-figure2');
    expect(canonicalPhoneEffectSegment('figure2-distance-expand')).toBe('figure2-distance-expand');
    expect(canonicalPhoneEffectSegment('phone-figure2-proof-brand')).toBe('figure2-proof-brand');
    expect(canonicalPhoneEffectSegment('phone-brand-figure3')).toBe('brand-figure3');
    expect(canonicalPhoneEffectSegment('phone-services-ttg')).toBe('services-ttg');
    expect(canonicalPhoneEffectSegment('phone-lab-ph-ink')).toBe('lab-ph');
    expect(canonicalPhoneEffectSegment('phone-education-crane-ink')).toBe('education-crane');
    expect(canonicalPhoneEffectSegment('unrelated-canvas')).toBeNull();
  });
});
