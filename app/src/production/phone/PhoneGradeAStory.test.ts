import { describe, expect, it } from 'vitest';
import {
  phoneGradeAArchFrame,
  phoneGradeABoundaryCompletedAtScroll,
  phoneGradeAFigureProgress,
  phoneGradeAHandoffProgress,
  phoneGradeAMethodFigure2EdgeScene,
  phoneGradeAProofBrandEdgeScene,
  phoneGradeAProofBrandProgress,
  phoneGradeAProofPanelOffset,
  phoneGradeAProofProgress
} from './PhoneGradeAStory';

describe('phone Grade A document progress', () => {
  it('uses the entering viewport only for the Method → Figure2 handoff', () => {
    expect(phoneGradeAHandoffProgress(844, 844)).toBe(0);
    expect(phoneGradeAHandoffProgress(422, 844)).toBe(0.5);
    expect(phoneGradeAHandoffProgress(0, 844)).toBe(1);
  });

  it('reconciles restored scroll positions only at stable ink endpoints', () => {
    expect(phoneGradeABoundaryCompletedAtScroll(
      false,
      5_886,
      5_040,
      5_884
    )).toBe(true);
    expect(phoneGradeABoundaryCompletedAtScroll(
      true,
      5_039,
      5_040,
      5_884
    )).toBe(false);
    expect(phoneGradeABoundaryCompletedAtScroll(
      true,
      5_420,
      5_040,
      5_884
    )).toBe(true);
    expect(phoneGradeABoundaryCompletedAtScroll(
      false,
      5_420,
      5_040,
      5_884
    )).toBe(false);
    expect(phoneGradeABoundaryCompletedAtScroll(
      false,
      5_886,
      null,
      null
    )).toBe(false);
  });

  it('switches the bottom fallback only when the ink field owns that edge', () => {
    expect(phoneGradeAMethodFigure2EdgeScene(0)).toBe('method');
    expect(phoneGradeAMethodFigure2EdgeScene(0.001)).toBe('method');
    expect(phoneGradeAMethodFigure2EdgeScene(0.0011)).toBe('figure2');
    expect(phoneGradeAMethodFigure2EdgeScene(1)).toBe('figure2');
    expect(phoneGradeAMethodFigure2EdgeScene(0, true)).toBe('figure2');
  });

  it('maps the shortened Figure2 scrub to the pre-ink camera endpoint', () => {
    expect(phoneGradeAFigureProgress(0, 3038)).toBe(0);
    expect(phoneGradeAFigureProgress(-759.5, 3038)).toBe(0.18);
    expect(phoneGradeAFigureProgress(-1519, 3038)).toBe(0.36);
    expect(phoneGradeAFigureProgress(-2278.5, 3038)).toBe(0.54);
    expect(phoneGradeAFigureProgress(-3038, 3038)).toBe(0.72);
    expect(phoneGradeAFigureProgress(-1519, 3038)).toBe(0.36);
    expect(phoneGradeAFigureProgress(0, 3038)).toBe(0);
  });

  it('reveals the phone arch first, then enlarges and blurs it', () => {
    expect(phoneGradeAArchFrame(0, 0)).toEqual({
      opacity: 0,
      scale: 1.025,
      blur: 0,
      motionProgress: 0
    });
    const final = phoneGradeAArchFrame(1, 0.72);
    expect(final.opacity).toBeCloseTo(0.98, 4);
    expect(final.scale).toBeCloseTo(1.135, 4);
    expect(final.blur).toBeCloseTo(3.6, 4);
    expect(final.motionProgress).toBe(1);
  });

  it('moves one Proof article across its three document-owned panels', () => {
    expect(phoneGradeAProofProgress(0, 2532, 844)).toBe(0);
    expect(phoneGradeAProofProgress(-844, 2532, 844)).toBe(0.5);
    expect(phoneGradeAProofProgress(-1688, 2532, 844)).toBe(1);
  });

  it('deep-links panels against the available track range at every aspect ratio', () => {
    expect(phoneGradeAProofPanelOffset(0, 2532, 844)).toBe(0);
    expect(phoneGradeAProofPanelOffset(1, 2532, 844)).toBe(844);
    expect(phoneGradeAProofPanelOffset(2, 2532, 844)).toBe(1688);
    expect(phoneGradeAProofPanelOffset(1, 1092, 390)).toBe(351);
    expect(phoneGradeAProofPanelOffset(2, 1092, 390)).toBe(702);
  });

  it('hands the final Proof viewport to Brand without an uncovered frame', () => {
    expect(phoneGradeAProofBrandProgress(844, 844)).toBe(0);
    expect(phoneGradeAProofBrandProgress(422, 844)).toBe(0.5);
    expect(phoneGradeAProofBrandProgress(0, 844)).toBe(1);
    expect(phoneGradeAProofBrandEdgeScene(0)).toBe('proof');
    expect(phoneGradeAProofBrandEdgeScene(0.001)).toBe('proof');
    expect(phoneGradeAProofBrandEdgeScene(0.0011)).toBe('brand');
    expect(phoneGradeAProofBrandEdgeScene(1)).toBe('brand');
  });
});
