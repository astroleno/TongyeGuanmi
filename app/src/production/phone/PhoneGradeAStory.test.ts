import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as gradeAStory from './PhoneGradeAStory';
import {
  phoneGradeAArchFrame,
  phoneGradeAFigureProgress,
  phoneGradeAHandoffProgress,
  phoneGradeAProofBrandProgress,
  phoneGradeAProofBrandTransitionProgress,
  phoneGradeAProofProgress,
  phoneGradeAProofTransitionProgress
} from './PhoneGradeAStory';

const gradeALanding = gradeAStory as typeof gradeAStory & Readonly<{
  phoneGradeAFigure2LandingBoundary(
    reason: 'forward' | 'reverse' | 'rollback' | 'direct-entry',
    direction: 1 | -1
  ): 0 | 1;
}>;

const source = readFileSync(
  new URL('./PhoneGradeAStory.tsx', import.meta.url),
  'utf8'
);
const figure2Source = readFileSync(
  new URL('./scenes/PhoneFigure2.tsx', import.meta.url),
  'utf8'
);
const tailBundleSource = readFileSync(
  new URL('./PhoneStoryTailBundle.tsx', import.meta.url),
  'utf8'
);
const brandContinuationSource = readFileSync(
  new URL('./PhoneBrandLabContinuation.tsx', import.meta.url),
  'utf8'
);
const gradeARuntimeSource = readFileSync(
  new URL('./phone-grade-a-runtime.ts', import.meta.url),
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

  it('keeps the Proof opening presentable while Figure2 → Proof verifies its target', () => {
    expect(phoneGradeAProofTransitionProgress('preparing', 0.35)).toBe(0.35);
    expect(phoneGradeAProofTransitionProgress('animating', 0.8)).toBe(0.8);
    expect(phoneGradeAProofTransitionProgress('verifying-target', 1)).toBe(0);
    expect(phoneGradeAProofTransitionProgress('measuring-landing', 1)).toBe(0);
    expect(phoneGradeAProofTransitionProgress('rollback-rendering', 0.8)).toBe(0);
  });

  it('keeps the Proof opening presentable when Brand → Proof verifies in reverse', () => {
    expect(phoneGradeAProofBrandTransitionProgress('preparing', -1)).toBe(1);
    expect(phoneGradeAProofBrandTransitionProgress('animating', -1)).toBe(1);
    expect(phoneGradeAProofBrandTransitionProgress('verifying-target', -1)).toBe(0);
    expect(phoneGradeAProofBrandTransitionProgress('measuring-landing', -1)).toBe(0);
    expect(phoneGradeAProofBrandTransitionProgress('verifying-stable', -1)).toBe(0);
    expect(phoneGradeAProofBrandTransitionProgress('rollback-rendering', -1)).toBe(1);
    expect(phoneGradeAProofBrandTransitionProgress('verifying-stable', 1)).toBe(1);
  });

  it('keeps the completed Figure2 endpoint when Proof settles in reverse', () => {
    const boundary = gradeALanding.phoneGradeAFigure2LandingBoundary;
    expect(boundary?.('forward', 1)).toBe(0);
    expect(boundary?.('reverse', -1)).toBe(1);
    expect(boundary?.('rollback', 1)).toBe(1);
    expect(boundary?.('rollback', -1)).toBe(0);
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

  it('derives Grade A render state from the shared snapshot without a local scroll owner', () => {
    expect(source).toContain('usePhoneStorySnapshot');
    expect(source).not.toContain('PhoneGradeARunView');
    expect(source).not.toContain('orchestrator.cursor()');
    expect(source).not.toContain("addEventListener('scroll'");
    expect(source).not.toContain("addEventListener('resize'");
    expect(source).not.toContain("addEventListener('orientationchange'");
    expect(source).not.toContain('data-phone-grade-a-active');
  });

  it('[Method↔Figure2 reduced cutover] has one named static-admission branch with no legacy proof or playback writer', () => {
    const start = gradeARuntimeSource.indexOf('const beginReducedStaticAdmission');
    const end = gradeARuntimeSource.indexOf('const begin =', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const reducedAdmission = gradeARuntimeSource.slice(start, end);
    expect(reducedAdmission).toContain("presentationFrameToken('static-poster'");
    expect(reducedAdmission).toContain('requestReducedTargetLayout');
    expect(reducedAdmission).toContain('reportPresentationFrame(frame)');
    expect(reducedAdmission).not.toContain('reportRenderedBoundaryFrame');
    expect(reducedAdmission).not.toContain('reportRenderedFrame(');
    expect(reducedAdmission).not.toContain('presentationProofToken(');
    expect(reducedAdmission).not.toContain('reportProgress(');
    expect(reducedAdmission).not.toContain('animate(');
    expect(reducedAdmission).not.toContain('complete(');
  });

  it('[Method↔Figure2 reduced cutover] keeps Figure2 static admission outside packed-alpha media startup', () => {
    expect(figure2Source).toContain('requestBoundStaticPresentation');
    expect(figure2Source).toContain("origin: 'leaf-static-poster'");
    expect(figure2Source).toContain("token.kind === 'static-poster'");
    expect(figure2Source).toContain('renderFigure2Hold(root)');
  });

  it('[Method↔Figure2 reduced cutover] gates packed-media suppression by the active static binding, not the global preference', () => {
    expect(figure2Source).toContain('if (staticPresentationBindingRef.current)');
    expect(figure2Source).not.toContain('if (reducedMotion) {');
  });

  it('[Figure2↔Proof reduced cutover] binds Proof as a direct static target instead of routing the candidate through its Ink adapter', () => {
    const boundaryOne = source.slice(source.indexOf('} : id === 1 ? {'));
    expect(boundaryOne).toContain('reducedStaticTarget');
    expect(boundaryOne).toContain('proofRef.current');
    expect(boundaryOne).toContain('reducedTargetPosition');
  });

  it('[Proof↔Brand reduced cutover] hands the canonical Brand leaf directly to boundary 2 without registering a second Brand surface', () => {
    const boundaryTwo = source.slice(source.indexOf('} : id === 2 ? {'));
    expect(boundaryTwo).toContain('reducedStaticSubject');
    expect(boundaryTwo).toContain("'native:brand'");
    expect(boundaryTwo).toContain("'grade-a:proof'");
    expect(boundaryTwo).toContain('reducedStaticTarget');
    expect(boundaryTwo).toContain('brandPresentationRef.current');
    expect(boundaryTwo).toContain('proofRef.current');
    expect(boundaryTwo).toMatch(
      /reducedTargetPosition:\s*\(direction: PhoneTransitionDirection\) => \(\s*direction === 1\s*\? boundaryPosition\(2, direction\)\s*:\s*boundaryPosition\(1, direction\)\s*\)/
    );
    expect(source).toContain('onBrandPresentationChange={bindBrandPresentation}');
    expect(source).not.toContain("registerPhoneRuntimeSurface(\n        orchestrator,\n        'native:brand'");
    expect(tailBundleSource).toContain('onBrandPresentationChange');
    expect(brandContinuationSource).toContain('onBrandPresentationChange?.(');
  });

  it('[Proof↔Brand reduced cutover] projects only stable endpoints before the Brand proof and never starts the Ink adapter', () => {
    const start = source.indexOf("case 'proof-brand':");
    const end = source.indexOf('default:', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const proofBrand = source.slice(start, end);
    expect(proofBrand).toMatch(/if \(reducedMotion\)[\s\S]*?return;/);
    expect(proofBrand).toMatch(
      /if \(targetIsBrand\)[\s\S]*?else \{[\s\S]*?proofRef\.current\?\.enter\?\.\(\);[\s\S]*?proofRef\.current\?\.update\(0\);/
    );
  });

  it('[Proof↔Brand reduced cutover] does not make static admission wait for the normal-motion Ink adapter', () => {
    expect(source).toMatch(
      /const proofBrandBoundaryReady = Boolean\([\s\S]*?reducedMotion \? brandPresentationRef\.current : proofBrandReady/
    );
  });
});
