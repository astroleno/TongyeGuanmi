import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (relative: string) => readFileSync(
  new URL(relative, import.meta.url),
  'utf8'
);

const spikeSource = source('./PortraitScrollSpike.tsx');
const shellSource = source('../phone/PhoneStoryShell.tsx');
const shellCss = source('../phone/PhoneStoryShell.css');
const railSource = source('../phone/PhoneStageRail.tsx');
const runtimeSource = source('../phone/usePhoneStageRuntime.ts');
const frontHalfSource = source('../phone/usePhoneFrontHalfAdapters.ts');
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

describe('Route B proven front-half migration contract', () => {
  it('keeps v16 thin and mounts the complete Loader → Method adapter group', () => {
    expect(spikeSource).toContain('<PhoneStoryShell validationMode="v16" />');
    expect(shellSource).toContain('usePhoneFrontHalfAdapters');
    expect(shellSource).toContain('<Loader');
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

  it('preserves one document scroll owner and the exact fixed-stage geometry', () => {
    expect(railSource).toContain('portrait-scroll-spike__stage-rail');
    expect(railSource).toContain('portrait-scroll-spike__stage');
    expect(runtimeSource).toContain("id: 'portrait-spike-stage'");
    expect(runtimeSource).toContain(
      'stageRail.offsetHeight - stage.offsetHeight'
    );
    expect(runtimeSource).toContain(
      "root.dataset.portraitStagePin = 'native-fixed-composite'"
    );
    expect(shellCss).toMatch(
      /portrait-scroll-spike__stage\s*\{[^}]*position:\s*fixed/s
    );
    expect(shellCss).toMatch(
      /portrait-scroll-spike__stage\s*\{[^}]*transform:\s*translate3d\(0,\s*0,\s*0\)/s
    );
    expect(shellCss).toMatch(
      /portrait-scroll-spike__stage-rail\s*\{[^}]*margin-bottom:\s*calc\(-1 \* var\(--portrait-stage-height\)\)/s
    );
    expect(shellSource).not.toContain('viewport?.pageTop');
    expect(shellSource).not.toContain(
      "window.visualViewport?.addEventListener('scroll'"
    );
  });

  it('publishes the frozen checkpoint timeline in both rail and AOD clocks', () => {
    expect(runtimeSource).toContain("from './phone-stage-timeline'");
    expect(runtimeSource).toContain('phoneStageFrame(progress');
    expect(runtimeSource).toContain('phoneAodCheckpointForMethodProgress');
    expect(runtimeSource).toContain('phoneAodCompletionCheckpoint');
    expect(shellSource).toContain('root.dataset.portraitCheckpoint = checkpoint');
    expect(shellSource).toContain(
      'root.dataset.portraitCheckpointTrace = trace'
    );
  });

  it('keeps all authored ink handoffs and exact Route B fields', () => {
    expect(shellSource).toContain('<HeroPatternTransition');
    expect(shellSource).toContain('<PatternStarMapTransition');
    expect(shellSource).toContain('<StarMapAodTransition');
    expect(heroPatternSource).toContain("id: 'portrait-hero-pattern-ink'");
    expect(heroPatternSource).toContain("seed: 'portrait-hero-pattern-r5'");
    expect(patternStarSource).toContain("id: 'portrait-pattern-star-ink'");
    expect(patternStarSource).toContain("seed: 'portrait-pattern-star-r5'");
    expect(patternStarSource).toContain("portraitInk: 'pattern-star'");
    expect(starAodSource).toContain("id: 'portrait-star-aod-ink'");
    expect(starAodSource).toContain("seed: 'portrait-star-aod-r5'");
    expect(starAodSource).toContain("portraitInk: 'star-aod'");
    expect(aodMethodSource).toContain('phoneAodMethodProgress');
  });

  it('preserves Hero entrance and Safari toolbar surfaces at their owners', () => {
    expect(heroSource).toContain(
      'const [titleActive, setTitleActive] = useState(reducedMotion);'
    );
    expect(heroSource).toContain('const startEntrance = useCallback(() => {');
    expect(heroSource).toContain(
      "owner.dataset.portraitHeroTextEntrance = 'playing'"
    );
    expect(runtimeSource).toContain('heroAdapter.startEntrance()');
    expect(shellSource).toContain("'--portrait-stage-coverage-height'");
    expect(shellCss).toContain('calc(100lvh - 100svh');
    expect(patternSource).toContain('portrait-scroll-spike__toolbar-edge--pattern');
    expect(aodSource).toContain('portrait-scroll-spike__toolbar-edge--aod');
    expect(patternCss).toContain('--portrait-pattern-edge-backdrop');
    expect(aodCss).toContain('--portrait-aod-bottom-mist-background');
    expect(shellCss).toMatch(
      /site-nav\.has-scroll-edge-blur::before\s*\{[^}]*backdrop-filter:\s*blur\(20px\)/s
    );
    expect(heroCss).toContain('r4-text-reveal-enter');
  });

  it('keeps one packed-alpha owner and the phone-only 0.48 → 0.55 mapping', () => {
    expect(heroSource).toContain('createPackedAlphaVideoCompositor');
    expect(aodSource).toContain('createPackedAlphaVideoCompositor');
    expect(heroSource).toContain(
      "phoneMediaUrlFor('hero-figure-packed', 'hero')"
    );
    expect(aodSource).toContain("'aod-figure-packed-forward'");
    expect(aodSource).toContain("'aod-figure-packed-reverse'");
    expect(aodSource).toContain('AOD_PHONE_TIMELINE_ALPHA_END');
    expect(aodSource).toContain('alphaEndProgress: PHONE_AOD_ALPHA_END_PROGRESS');
    expect(shellSource).toContain(
      'data-phone-aod-alpha-end={aodAlphaEndProgress?.toFixed(2)}'
    );
    expect(phoneMediaSource).toContain('figure1-rgb-alpha.mp4');
    expect(phoneMediaSource).toContain(
      'aod-figure-motion-rgb-alpha-reverse.mp4'
    );
  });

  it('keeps Star Map and Method presentation inside their adapters', () => {
    expect(starSource).toContain('rotationDegrees: -90');
    expect(starSource).toContain('data-portrait-star-perlin');
    expect(starCss).toContain('portrait-scroll-spike__scene--star');
    expect(aodSource).toContain('phoneAodBackdropPresentation');
    expect(methodSource).toContain('id="method"');
    expect(methodSource).toContain('portrait-scroll-spike__method-bridge');
    expect(methodCss).toMatch(
      /data-portrait-stage-active="true"[^}]*portrait-scroll-spike__method-bridge\s*\{[^}]*position:\s*fixed/s
    );
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
