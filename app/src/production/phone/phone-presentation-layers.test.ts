import { describe, expect, it } from 'vitest';
import { canonicalSegments } from '../../story/canonical-spine';
import {
  canonicalPhoneEffectSegment,
  phoneLayerForSurfaceRole,
  phonePresentationLayerZIndex,
  phoneTransitionLayerPlan
} from './phone-story/presentation';
import { phoneSegmentPresentationTuple } from './phone-story/manifest';

describe('phone presentation layer contract', () => {
  it('keeps stable, retained, and endpoint planes in one global order', () => {
    expect(phonePresentationLayerZIndex(phoneLayerForSurfaceRole('retired'))).toBeLessThan(
      phonePresentationLayerZIndex(phoneLayerForSurfaceRole('fixed-current'))
    );
    expect(phonePresentationLayerZIndex(phoneLayerForSurfaceRole('fixed-current'))).toBeLessThan(
      phonePresentationLayerZIndex(phoneLayerForSurfaceRole('stable'))
    );
    expect(phonePresentationLayerZIndex(phoneLayerForSurfaceRole('stable'))).toBeLessThan(
      phonePresentationLayerZIndex(phoneLayerForSurfaceRole('transition-source'))
    );
    expect(phonePresentationLayerZIndex(phoneLayerForSurfaceRole('transition-source'))).toBeLessThan(
      phonePresentationLayerZIndex(phoneLayerForSurfaceRole('transition-receiver'))
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

          expect(plan.segment).toBe(id);
          expect(plan.source.surface).toBe(departing);
          expect(plan.receiver.surface).toBe(arriving);
          expect(phonePresentationLayerZIndex(plan.source.role)).toBeLessThan(
            phonePresentationLayerZIndex(plan.receiver.role)
          );

          if (contract[7] === 'above-both') {
            expect(phonePresentationLayerZIndex(plan.effect.role)).toBeGreaterThan(
              phonePresentationLayerZIndex(plan.receiver.role)
            );
          } else if (contract[7] === 'between') {
            expect(phonePresentationLayerZIndex(plan.effect.role)).toBeGreaterThan(
              phonePresentationLayerZIndex(plan.source.role)
            );
            expect(phonePresentationLayerZIndex(plan.effect.role)).toBeLessThan(
              phonePresentationLayerZIndex(plan.receiver.role)
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
