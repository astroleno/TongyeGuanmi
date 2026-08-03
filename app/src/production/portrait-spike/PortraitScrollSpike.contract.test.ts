import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { phoneSegmentPresentationContract } from '../phone/phone-story/manifest';
import {
  phoneTransitionPresentationTuple
} from '../phone/phone-story/presentation';
import {
  phonePresentationHostPlaneOrder
} from '../phone/phone-story/presentation';
import { phoneStageScrollBounds } from '../phone/usePhoneStageRuntime';

const source = (relative: string) => readFileSync(
  new URL(relative, import.meta.url),
  'utf8'
);

const spikeSource = source('./PortraitScrollSpike.tsx');
const shellSource = source('../phone/PhoneStoryShell.tsx');
const shellCss = source('../phone/PhoneStoryShell.css');
const railSource = source('../phone/PhoneStageRail.tsx');
const railCss = source('../phone/PhoneStageRail.css');
const runtimeSource = source('../phone/usePhoneStageRuntime.ts');
const storyPresentationSource = source('../phone/phone-story/presentation.ts');
const stageTimelineSource = source('../phone/phone-stage-timeline.ts');
const fixedStageRegistrationSource = source(
  '../phone/usePhoneFixedStageRegistration.ts'
);
const edgeSurfaceSource = storyPresentationSource;
const viewportGeometrySource = source('../phone/usePhoneViewportGeometry.ts');
const frontHalfSource = source('../phone/usePhoneFrontHalfAdapters.ts');
const bootstrapSource = source('../phone/PhoneStoryBootstrap.tsx');
const loaderSource = source('../phone/scenes/PhoneLoader.tsx');
const heroSource = source('../phone/scenes/PhoneHero.tsx');
const heroMotionSource = source('../phone/scenes/PhoneHero.motion.ts');
const heroCss = source('../phone/scenes/PhoneHero.css');
const patternSource = source('../phone/scenes/PhonePattern.tsx');
const patternCss = source('../phone/scenes/PhonePattern.css');
const starSource = source('../phone/scenes/PhoneStarMap.tsx');
const starCss = source('../phone/scenes/PhoneStarMap.css');
const aodSource = source('../phone/scenes/PhoneAod.tsx');
const aodCss = source('../phone/scenes/PhoneAod.css');
const methodSource = source('../phone/scenes/PhoneMethodTop.tsx');
const methodCss = source('../phone/scenes/PhoneMethodTop.css');
const heroPatternSource = source('../phone/transitions/hero-pattern.tsx');
const patternStarSource = source('../phone/transitions/pattern-star-map.tsx');
const starAodSource = source('../phone/transitions/star-map-aod.tsx');
const aodMethodSource = source('../phone/transitions/aod-method-top.ts');
const phoneMediaSource = source('../phone/phone-media.ts');
const gradeAStorySource = source('../phone/PhoneGradeAStory.tsx');
const gradeAStoryCss = source('../phone/PhoneGradeAStory.css');
const gradeAFigureSource = source('../phone/scenes/PhoneFigure2.tsx');
const packedSurfaceSource = source(
  '../phone/scenes/phone-packed-alpha-surface.ts'
);
const gradeAFigureCss = source('../phone/scenes/PhoneFigure2.css');
const gradeAArchSource = source('../phone/scenes/PhoneFigure2Arch.tsx');
const gradeAProofSource = source('../phone/scenes/PhoneFigure2Proof.tsx');
const gradeAProofCss = source('../phone/scenes/PhoneFigure2Proof.css');
const gradeADistanceSource = source(
  '../phone/transitions/figure2-distance-expand.tsx'
);
const gradeADistanceBridgeSource = source(
  '../../transitions/figure2-distance-expand/index.ts'
);
const gradeAGroupSource = source('../phone/adapter-groups/grade-a.ts');
const directEntryPositionSource = source(
  '../phone/phone-direct-entry-position.ts'
);
const storyEntrySource = source('../phone/usePhoneStoryEntry.ts');

describe('Route B proven front-half migration contract', () => {
  it('keeps v16 thin and mounts the complete Loader → Method adapter group', () => {
    expect(spikeSource).toContain('<PhoneStoryShell validationMode="v16" />');
    expect(shellSource).toContain('usePhoneFrontHalfAdapters');
    expect(bootstrapSource).toContain('<StoryLoader');
    expect(shellSource).not.toContain('<Loader');
    expect(shellSource).toContain('<Hero');
    expect(shellSource).toContain('<Pattern');
    expect(shellSource).toContain('<StarMap');
    expect(shellSource).toContain('<Aod');
    expect(shellSource).toContain('<MethodTop');
    expect(loaderSource).toContain('<StoryLoader');
    expect(frontHalfSource).toContain("'star-map'");
    expect(frontHalfSource).toContain("'aod-animation'");
    expect(frontHalfSource).toContain("'method-top'");
  });

  it('leaves no scene, Method, media, or transition canvas ownership in the shell', () => {
    expect(shellSource).not.toContain('portrait-scroll-spike__scene--');
    expect(shellSource).not.toContain('id="method"');
    expect(shellSource).not.toContain('phoneMediaUrlFor(');
    expect(shellSource).not.toContain('createPackedAlphaVideoCompositor');
    expect(shellSource).not.toContain('createPhoneInkTransition');
    expect(shellCss).not.toContain('portrait-scroll-spike__scene--');
    expect(shellCss).not.toContain('portrait-scroll-spike__reading');
    expect(shellCss).not.toContain('portrait-scroll-spike__star');
  });

  it('preserves one document scroll owner and one stable stage clip boundary', () => {
    expect(railSource).toContain('portrait-scroll-spike__stage-rail');
    expect(railSource).toContain('portrait-scroll-spike__stage');
    expect(railSource).toContain('portrait-scroll-spike__stage-canvas');
    expect(railSource).toContain('data-portrait-stage-host="persistent"');
    expect(railSource).not.toContain('stage-backplate');
    expect(phoneStageScrollBounds(400, 80, 1200)).toEqual([480, 1680]);
    expect(runtimeSource).not.toContain("from 'gsap/ScrollTrigger'");
    expect(runtimeSource).toContain(
      "root.style.getPropertyValue('--portrait-stage-scroll-distance')"
    );
    expect(runtimeSource).toContain(
      "root.dataset.portraitStagePin = 'native-fixed-composite'"
    );
    expect(railCss).toMatch(
      /portrait-scroll-spike__stage\s*\{[^}]*position:\s*fixed/s
    );
    expect(shellSource).toContain(
      "data-portrait-fixed-stage={fixedStageRegistered ? 'registered' : 'priming'}"
    );
    expect(fixedStageRegistrationSource).toMatch(
      /const committedPrimeFrame = window\.requestAnimationFrame\(\(\) => \{\s*registrationFrame = window\.requestAnimationFrame/s
    );
    // Hero starts beneath the Loader during its fade, but the stage still
    // requires the same one readiness gate before it registers as fixed.
    expect(shellSource).toContain(
      'const openingExecutionOpen = loaderHidden || props.startupLoaderExiting === true;'
    );
    expect(shellSource).toContain('usePhoneFixedStageRegistration(\n    openingExecutionOpen && ready\n  )');
    expect(shellSource).toContain('enabled: fixedStageRegistered');
    expect(railCss).toMatch(
      /data-portrait-fixed-stage="priming"[^}]*position:\s*absolute[^}]*bottom:\s*auto[^}]*height:\s*var\(--portrait-stage-height\)/s
    );
    expect(railCss).toMatch(
      /portrait-scroll-spike__stage-rail\s*\{[^}]*margin-bottom:\s*calc\(-1 \* var\(--portrait-stage-height\)\)/s
    );
    expect(railCss).toMatch(
      /portrait-scroll-spike__stage\s*\{[^}]*overflow:\s*visible[^}]*background:\s*transparent/s
    );
    expect(railSource).toContain('data-phone-presentation-host="content"');
    expect(railSource).toContain('data-phone-presentation-host="route-overlay"');
    expect(railCss).toMatch(
      /portrait-scroll-spike__stage-rail::before\s*\{[^}]*position:\s*fixed[^}]*z-index:\s*var\(--phone-host-plane-coverage\)[^}]*background:\s*var\(--portrait-edge-surface\)/s
    );
    expect(phonePresentationHostPlaneOrder('coverage')).toBeLessThan(
      phonePresentationHostPlaneOrder('content')
    );
    expect(railCss).toMatch(
      /portrait-scroll-spike__stage\s*\{[^}]*position:\s*fixed[^}]*inset:\s*0[^}]*overflow:\s*visible/s
    );
    expect(railCss).toMatch(
      /portrait-scroll-spike__route-overlay\s*\{[^}]*position:\s*fixed[^}]*inset:\s*0[^}]*overflow:\s*visible/s
    );
    expect(railCss).toMatch(
      /portrait-scroll-spike__stage-rail::before\s*\{[^}]*inset:\s*0 auto auto 0[^}]*width:\s*max\(100%,\s*var\(--portrait-coverage-right\)\)[^}]*height:\s*max\(100%,\s*var\(--portrait-coverage-bottom\)\)/s
    );
    expect(railCss).not.toContain('.portrait-scroll-spike__stage::after');
    expect(railCss).toMatch(
      /portrait-scroll-spike__stage-canvas\s*\{[^}]*top:\s*0[^}]*right:\s*0[^}]*left:\s*0[^}]*height:\s*max\(100%,\s*var\(--portrait-stage-canvas-height\)\)[^}]*overflow:\s*clip/s
    );
    expect(railCss).toMatch(
      /portrait-scroll-spike__scene\s*\{[^}]*overflow:\s*visible[^}]*contain:\s*layout;/s
    );
    expect(railCss).not.toMatch(
      /portrait-scroll-spike__(?:stage|stage-canvas|scene)\s*\{[^}]*(?:translate3d|translateZ|backface-visibility|isolation:)/s
    );
    expect(railCss).not.toMatch(
      /portrait-scroll-spike__scene\s*\{[^}]*contain:[^;}]*paint/s
    );
    expect(shellCss).toMatch(
      /--portrait-stage-height:\s*max\(\s*var\(--portrait-live-height\),\s*100lvh\s*\)/s
    );
    expect(shellCss).toMatch(
      /--portrait-stage-canvas-height:\s*var\(--portrait-stage-height\)/s
    );
    expect(railCss).toContain('--portrait-readable-height: 100svh');
    expect(railCss).toMatch(
      /--portrait-readable-bottom-offset:\s*max\(\s*0px,\s*calc\(var\(--portrait-stage-height\) - var\(--portrait-readable-height\)\)\s*\)/s
    );
    expect(viewportGeometrySource).toContain(
      "from './phone-story/presentation'"
    );
    expect(viewportGeometrySource).toContain(
      'usePhoneViewportCoverage(rootRef, applyLayout)'
    );
    expect(viewportGeometrySource).toContain('refreshPhoneScrollStage()');
    expect(viewportGeometrySource).not.toContain('phoneStageCoverageHeight');
    expect(viewportGeometrySource).not.toContain('phoneViewportCoverageBottom');
    expect(viewportGeometrySource).not.toContain('--portrait-stage-coverage-height');
    expect(viewportGeometrySource).not.toContain('delete root.dataset.portraitCheckpoint');
    expect(viewportGeometrySource).not.toContain(
      'delete root.dataset.portraitCheckpointTrace'
    );
    expect(viewportGeometrySource).not.toContain(
      'delete documentElement.dataset.portraitCheckpoint'
    );
    expect(shellCss).not.toContain('--portrait-stage-coverage-height');
    expect(shellSource).not.toContain('viewport?.pageTop');
  });

  it('publishes the frozen checkpoint timeline in both rail and AOD clocks', () => {
    expect(runtimeSource).toContain("from './phone-stage-timeline'");
    expect(runtimeSource).toContain('phoneStageFrame(stageProgress, options.reducedMotion)');
    expect(runtimeSource).not.toContain('phoneAodCheckpointForMethodProgress');
    expect(runtimeSource).not.toContain('phoneAodCompletionCheckpoint');
    expect(phoneTransitionPresentationTuple([
      'aod-animation',
      'method-top',
      'aod-method-top',
      1,
      0
    ])[1]).toBe('aod-autoplay');
    expect(storyPresentationSource).toContain(
      "data(routeRoot, 'portraitCheckpoint', projection.checkpoint)"
    );
    expect(storyPresentationSource).toContain(
      "data(routeRoot, 'portraitCheckpointTrace', plan.checkpointTrace.join('>'))"
    );
  });

  it('keeps all authored ink handoffs and exact Route B fields', () => {
    expect(shellSource).toContain('<HeroPatternTransition');
    expect(shellSource).toContain('<PatternStarMapTransition');
    expect(shellSource).toContain('<StarMapAodTransition');
    for (const sourceText of [heroPatternSource, patternStarSource, starAodSource]) {
      expect(sourceText).toContain('createPhoneInkAdapter([');
      expect(sourceText).not.toMatch(/\b(?:id|seed|portraitInk)\s*:/);
    }
    expect(heroPatternSource).toContain(
      "['radial', 'portrait-hero-pattern-r5', null, 0.5, 0.44]"
    );
    expect(patternStarSource).toContain(
      "['radial', 'portrait-pattern-star-r5', null, 0.5, 0.28]"
    );
    expect(patternStarSource).toContain("'pattern-star'");
    expect(starAodSource).toContain(
      "['horizontal', 'portrait-star-aod-r5', 'bottom-to-top', null, null]"
    );
    expect(starAodSource).toContain("'star-aod'");
    expect(aodMethodSource).toContain('phoneAodMethodProgress');
  });

  it('preserves Hero entrance, safe copy anchors, and one edge surface', () => {
    expect(heroSource).toContain(
      'const [titleActive, setTitleActive] = useState(reducedMotion);'
    );
    expect(heroSource).toContain('const startEntrance = useCallback(() => {');
    expect(heroSource).toContain(
      "owner.dataset.portraitHeroTextEntrance = 'playing'"
    );
    expect(heroSource).toContain('const ensureIntroInk = useCallback(() => {');
    expect(heroSource).toContain("ensureIntroInk()?.(['render', sample.progress]);");
    expect(heroSource).toContain("ensureIntroInk()?.(['prewarm']);");
    const heroPostPaintIndex = heroSource.indexOf('const schedulePackedAlphaPostPaint');
    const heroReadyIndex = heroSource.indexOf('onReady?.();', heroPostPaintIndex);
    expect(heroPostPaintIndex).toBeGreaterThan(0);
    expect(heroReadyIndex).toBeGreaterThan(heroPostPaintIndex);
    expect(runtimeSource).toContain('heroAdapter.startEntrance()');
    for (const css of [heroCss, patternCss, starCss]) {
      expect(css).toContain('var(--portrait-readable-bottom-offset)');
    }
    expect(shellCss).toContain('100lvh');
    expect(shellSource).not.toContain('stage-backplate');
    expect(patternSource).not.toContain('toolbar-edge');
    expect(aodSource).not.toContain('toolbar-edge');
    expect(shellCss).not.toContain('toolbar-edge');
    expect(patternCss).not.toContain('portrait-pattern-edge-backdrop');
    expect(patternCss).not.toContain('background-attachment');
    expect(patternCss).not.toContain('data-portrait-edge-scene="pattern"');
    expect(patternCss).not.toContain('portrait-scroll-spike__stage[');
    expect(patternSource.match(/pattern-background/g)).toHaveLength(1);
    expect(patternCss).not.toMatch(
      /portrait-scroll-spike__pattern-motion\s*\{[^}]*will-change:/s
    );
    expect(patternCss).not.toContain('--portrait-browser-edge-reserve');
    expect(patternCss).toMatch(
      /portrait-scroll-spike__pattern-bloom\s*\{[^}]*inset:\s*0[^}]*height:\s*100%/s
    );
    expect(patternCss).not.toContain('stage-backplate');
    expect(patternCss).toContain('background: #d9c08f');
    expect(patternCss).not.toContain('--portrait-pattern-edge-surface');
    expect(patternCss).not.toContain('linear-gradient(180deg');
    expect(patternCss).not.toContain('portrait-scroll-spike__pattern-motion::after');
    expect(patternCss).not.toContain('data-phone-validation-mode="v47"');
    expect(edgeSurfaceSource).toContain(
      "PHONE_PATTERN_TERMINAL_EDGE_SURFACE = '#d9c08f'"
    );
    expect(patternSource).toContain('centerForViewport: () => PATTERN_CENTER');
    expect(aodCss).toContain('--portrait-aod-bottom-mist-background');
    expect(aodCss).not.toContain('--portrait-browser-edge-reserve');
    expect(shellCss).not.toContain('--portrait-browser-edge-reserve');
    expect(aodCss).toMatch(
      /data-portrait-edge-scene="aod"[^}]*stage-rail\s*\{[^}]*background:\s*#ede4d2/s
    );
    expect(aodCss).toContain('html[data-portrait-spike="b"][data-portrait-edge-scene="aod"]');
    expect(runtimeSource).toContain('attachPhoneMediaGestureLease');
    expect(shellCss).toMatch(
      /site-nav\.has-scroll-edge-blur::before\s*\{[^}]*backdrop-filter:\s*blur\(20px\)/s
    );
    expect(heroCss).toContain('r4-text-reveal-enter');
    expect(edgeSurfaceSource).toContain("figure2: '#e2dac9'");
  });

  it('keeps one packed-alpha owner and the phone-only 0.49 → 0.59 mapping', () => {
    expect(heroSource).toContain('createPackedAlphaVideoCompositor');
    expect(aodSource).toContain('createPackedAlphaVideoCompositor');
    expect(heroSource).toContain(
      "phoneMediaUrlFor('hero-figure-packed', 'hero')"
    );
    expect(aodSource).toContain("'aod-figure-packed'");
    expect(aodSource).not.toContain('packed-reverse');
    expect(aodSource).toContain('driveReverseFrame');
    expect(aodSource).toContain('drivePhoneTimelineVideo');
    expect(aodSource).toContain('AOD_PHONE_TIMELINE_ALPHA_START');
    expect(aodSource).toContain('AOD_PHONE_TIMELINE_ALPHA_END');
    expect(aodSource).toContain('alphaEndProgress: PHONE_AOD_ALPHA_END_PROGRESS');
    expect(shellSource).toContain(
      'data-phone-aod-alpha-start={aodAlphaStartProgress?.toFixed(2)}'
    );
    expect(shellSource).toContain(
      'data-phone-aod-alpha-end={aodAlphaEndProgress?.toFixed(2)}'
    );
    expect(phoneMediaSource).toContain('figure1-rgb-alpha.mp4');
    expect(phoneMediaSource).toContain('aod-figure-motion-rgb-alpha.mp4');
    expect(phoneMediaSource).not.toContain('rgb-alpha-reverse');
  });

  it('keeps Star Map and Method presentation inside their adapters', () => {
    expect(starSource).toContain('rotationDegrees: -90');
    expect(starSource).toContain('data-portrait-star-perlin');
    expect(starCss).toContain('portrait-scroll-spike__scene--star');
    expect(aodSource).toContain('phoneAodBackdropPresentation');
    expect(methodSource).toContain('id="method"');
    expect(methodSource).toContain('portrait-scroll-spike__method-bridge');
    expect(methodCss).toContain('data-phone-stage-owner="front"');
    expect(methodCss).toContain('data-phone-stage-owner="grade-a"');
    expect(methodCss).not.toContain('data-portrait-stage-active');
    expect(methodCss).not.toContain('data-portrait-aod-method-visible');
    expect(methodCss).toMatch(
      /portrait-scroll-spike__method-bridge\s*\{[^}]*position:\s*fixed/s
    );
    expect(methodCss).toMatch(
      /portrait-scroll-spike__reading\s*\{[^}]*background:\s*transparent/s
    );
    expect(methodCss).toMatch(
      /portrait-scroll-spike__reading::before\s*\{[^}]*background:\s*transparent/s
    );
    expect(methodCss).toContain('data-phone-surface-role="transition-receiver"');
    expect(methodCss).not.toContain('data-phone-method-figure2-ink-active');
  });

  it('keeps product media helpers presentation-local and imports no spike code', () => {
    expect(heroSource).toContain("from './PhoneHero.motion'");
    expect(heroMotionSource).toContain(
      "from '../../../media/packed-alpha-video'"
    );
    expect(patternSource).toContain(
      "from '../../../scenes/pattern/patternBloomRenderer'"
    );
    expect(starSource).toContain(
      "phoneMediaUrlFor('star-map-source', 'star-map')"
    );
    expect(shellSource).not.toContain("from '../portrait-spike/");
    expect(frontHalfSource).not.toContain("from '../portrait-spike/");
  });
});

describe('Route B Grade A migration contract', () => {
  it('keeps one fixed stage, one Figure2 root, and one Proof article', () => {
    expect(gradeAStorySource.match(/data-testid="r2-stage"/g)).toHaveLength(1);
    expect(gradeAStorySource).toContain('<Figure2');
    expect(gradeAStorySource).toContain('<Proof');
    expect(gradeAStorySource).toContain('onReady={markFigure2Ready}');
    expect(gradeAStorySource).toContain(
      'figure2Ready && methodCopySource && MethodFigure2'
    );
    expect(gradeAStorySource).toContain(
      'methodCopySource && figure2Ready && methodFigure2Ready'
    );
    expect(gradeAStorySource).toMatch(
      /proofReady\s*&& brandRoot\s*&& \(reducedMotion \? brandPresentationRef\.current : proofBrandReady\)/
    );
    expect(gradeAStorySource).toContain(
      'boundaryReadyRef.current = (methodBoundaryReady ? 1 : 0)'
    );
    expect(gradeAStorySource).toContain('createPortal(surfaces, stageHost)');
    expect(methodSource).toContain('stageHost={stageHost}');
    expect(methodSource).toContain('ref={setSteps}');
    expect(methodSource).toContain('methodCopySource={steps}');
    expect(methodSource).not.toContain('stepsRef.current');
    expect(gradeAFigureSource).toContain('figure2AnimationScene.Component');
    expect(gradeAProofSource).toContain('figure2ProofScene.Component');
    expect(shellSource).not.toContain('data-r4-scene="figure2-animation"');
    expect(shellSource).not.toContain('data-r4-scene="figure2-proof"');
    expect(gradeAStoryCss).toMatch(
      /phone-grade-a__surfaces\s*\{[^}]*overflow:\s*visible/s
    );
    expect(gradeAStoryCss).not.toMatch(
      /phone-grade-a__surfaces\s*\{[^}]*(?:translate3d|backface-visibility|isolation:)/s
    );
    expect(gradeAFigureCss).toMatch(
      /phone-grade-a__surfaces > \.r4-figure2\s*\{[^}]*overflow:\s*visible[^}]*isolation:\s*auto/s
    );
    expect(gradeAFigureCss).not.toMatch(
      /phone-grade-a__surfaces > \.r4-figure2\s*\{[^}]*(?:translateZ|translate3d|backface-visibility)/s
    );
  });

  it('uses document progress without creating a nested Proof scroll owner', () => {
    expect(gradeAStorySource).toContain('phoneGradeAProofProgress');
    expect(gradeAStorySource).not.toContain('window.scrollTo(');
    expect(directEntryPositionSource).toContain('rectTop + panelOffset');
    expect(directEntryPositionSource).not.toContain('window.scrollTo(');
    expect(gradeAProofSource).toContain("'--phone-proof-translate-y'");
    expect(gradeAProofCss).toMatch(
      /r4-proof-compound\s*\{[^}]*overflow:\s*visible/s
    );
    expect(gradeAProofCss).toMatch(
      /r4-proof-scroll__content\s*\{[^}]*top:\s*50%/s
    );
  });

  it('reuses the canonical depth timeline with deterministic phone seeking', () => {
    expect(gradeADistanceSource).toContain(
      'createPhoneFigure2DistanceExpandBridge(['
    );
    expect(gradeADistanceSource).not.toContain('createFigure2DistanceExpandTransition');
    expect(gradeADistanceSource).toContain('lease.canvas');
    expect(gradeADistanceSource).toContain('phoneFigure2ProofTimelineProgress');
    expect(gradeADistanceSource).toContain("await timeline(['prepare', ...leg]);");
    expect(gradeADistanceSource).toContain("timeline(['commit', ...leg]);");
    expect(gradeADistanceBridgeSource).toContain(
      'createFigure2DistanceExpandTransition({'
    );
    expect(gradeADistanceBridgeSource).toContain('ownsMedia: false');
    expect(gradeADistanceBridgeSource).toContain('inkCanvas');
    expect(gradeAGroupSource).toContain("'method-bottom-figure2'");
    expect(gradeAGroupSource).toContain("'figure2-distance-expand'");
    expect(gradeAGroupSource).toContain("'figure2-proof-brand'");
  });

  it('keeps Figure2 on one canonical video owner and composites phone alpha through Canvas', () => {
    expect(gradeAFigureSource).toContain('createPhonePackedAlphaSurface');
    expect(packedSurfaceSource).toContain('createPackedAlphaVideoCompositor');
    expect(packedSurfaceSource).toContain('setPackedAlphaVideoSource');
    expect(gradeAFigureSource).toContain(
      "phoneMediaUrlFor(\n  'figure2-pair-packed',\n  'figure2-animation'"
    );
    expect(phoneMediaSource).toContain('figure2-pair-motion-rgb-alpha.mp4');
    expect(phoneMediaSource).toContain('figure2-pair-opening.webp');
    expect(gradeAFigureCss).toContain('data-phone-figure2-alpha="verified"');
    expect(gradeAFigureCss).toContain('data-packed-alpha-frame-ready="true"');
    expect(gradeAFigureCss).toContain('data-phone-figure2-alpha="probing"');
    expect(gradeAFigureCss).toContain('data-phone-figure2-alpha="poster-fallback"');
    expect(gradeAFigureCss).toContain('--phone-figure2-poster-image');
    expect(gradeAFigureSource).toContain("root.dataset.phoneFigure2Ready = 'true'");
    expect(gradeAFigureSource).not.toContain('Promise.all([');
    expect(gradeAStorySource).toContain('<PhoneFigure2Arch />');
    expect(gradeAStorySource).toContain('data-phone-grade-a-method-paper="true"');
    expect(gradeAStorySource).toContain('from={methodPaperRef.current}');
    expect(gradeAStoryCss).toContain('--phone-content-layer-transition-source');
    expect(gradeAStoryCss).toContain('--phone-route-overlay-layer-effect');
    expect(phonePresentationHostPlaneOrder('content')).toBeLessThan(
      phonePresentationHostPlaneOrder('route-overlay')
    );
    expect(gradeAStoryCss).toMatch(
      /phone-grade-a__surfaces\s*\{[^}]*overflow:\s*visible[^}]*pointer-events:\s*none/s
    );
    expect(gradeAStoryCss).not.toContain('data-phone-grade-a-active');
    expect(gradeAArchSource).toContain("'figure2-foreground-arch'");
    expect(gradeAArchSource).toContain('RetainedFigure2Arch');
    expect(gradeAArchSource).toContain('motion="fixed"');
    expect(phoneSegmentPresentationContract('method-bottom-figure2')).toMatchObject({
      checkpoint: 'method-to-figure2',
      sourceSurface: 'native:method',
      receiverSurface: 'grade-a:figure2'
    });
    expect(gradeAFigureCss).not.toContain('--portrait-browser-edge-reserve');
    expect(gradeAStoryCss).toContain('--phone-figure2-arch-scale');
    expect(gradeAStoryCss).toContain('--phone-figure2-arch-blur');
    expect(phoneMediaSource).toContain('figure2-phone-foreground-arch.webp');
  });

  it('settles the upstream AOD before a direct Figure2 or Proof entry', () => {
    expect(storyEntrySource).toContain('directStoryEntry');
    expect(shellSource).toContain("usePhoneStoryRuntime(\n    'formal'");
    expect(shellSource).toContain(
      'usePhoneStoryEntryLifecycle(\n    entryScene,\n    loaderHidden,\n    orchestrator,\n    directAdmissionOpen\n  )'
    );
    expect(shellSource).not.toContain('window.scrollTo(');
    expect(methodSource).toContain('phoneDirectEntryCompletesAod');
    expect(stageTimelineSource).toContain("'figure2-animation'");
    expect(stageTimelineSource).toContain("'figure2-proof'");
    expect(runtimeSource).not.toContain('aodCompleted');
    expect(gradeAStorySource).toContain('id="figure2-animation"');
    expect(gradeAStorySource).toContain('id="figure2-proof"');
    expect(gradeAFigureCss).toMatch(
      /orientation:\s*landscape[^}]*[\s\S]*figure--combined\s*\{[^}]*width:\s*min\(48vw,\s*400px\)/
    );
  });
});
