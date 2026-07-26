import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  phoneGradeAArchFrame,
  phoneGradeAFigureProgress,
  phoneGradeAHandoffProgress,
  phoneGradeAProofBrandProgress,
  phoneGradeAProofProgress
} from './PhoneGradeAStory';

const source = readFileSync(
  new URL('./PhoneGradeAStory.tsx', import.meta.url),
  'utf8'
);
const figure2Source = readFileSync(
  new URL('./scenes/PhoneFigure2.tsx', import.meta.url),
  'utf8'
);

describe('phone Grade A document progress', () => {
  it('uses the entering viewport only for the Method → Figure2 handoff', () => {
    expect(phoneGradeAHandoffProgress(844, 844)).toBe(0);
    expect(phoneGradeAHandoffProgress(422, 844)).toBe(0.5);
    expect(phoneGradeAHandoffProgress(0, 844)).toBe(1);
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

  it('drives the canonical Figure2 media during the document-owned intro', () => {
    expect(figure2Source).toContain("videoMode: 'seek'");
    expect(figure2Source).toContain('mediaRun:');
    expect(figure2Source).not.toContain("videoMode: 'none'");
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

  it('hands the final Proof viewport to Brand without an uncovered frame', () => {
    expect(phoneGradeAProofBrandProgress(844, 844)).toBe(0);
    expect(phoneGradeAProofBrandProgress(422, 844)).toBe(0.5);
    expect(phoneGradeAProofBrandProgress(0, 844)).toBe(1);
  });
});

describe('phone Grade A orchestration ownership', () => {
  it('registers rendering capabilities through the canonical runner only', () => {
    expect(source).toContain('createPhoneGradeARunner');
    expect(source).not.toContain('let activeRunView');
    expect(source).not.toContain('inkPreparationAbort');
    expect(source).not.toContain('activeInkSession');
    expect(source).not.toContain('startInkRun');
    expect(source).not.toContain('registerRunCapability');
  });

  it('does not publish navigation, checkpoint, or edge state', () => {
    expect(source).not.toContain('orchestrator.reportPresentation');
  });

  it('leaves direct-entry positioning to the shell lifecycle', () => {
    expect(source).not.toContain('window.scrollTo(');
    expect(source).not.toContain('MutationObserver');
    expect(source).toContain('id="figure2-animation"');
    expect(source).toContain('id="figure2-proof"');
  });
});
