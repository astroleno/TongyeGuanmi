import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const spikeSource = readFileSync(new URL('./PortraitScrollSpike.tsx', import.meta.url), 'utf8');
const shellSource = readFileSync(new URL('../phone/PhoneStoryShell.tsx', import.meta.url), 'utf8');
const heroSource = readFileSync(new URL('../phone/scenes/PhoneHero.tsx', import.meta.url), 'utf8');
const heroMotionSource = readFileSync(new URL('../phone/scenes/PhoneHero.motion.ts', import.meta.url), 'utf8');
const heroCss = readFileSync(new URL('../phone/scenes/PhoneHero.css', import.meta.url), 'utf8');
const heroPatternTransitionSource = readFileSync(
  new URL('../phone/transitions/hero-pattern.tsx', import.meta.url),
  'utf8'
);
const shellCss = readFileSync(new URL('../phone/PhoneStoryShell.css', import.meta.url), 'utf8');
const phoneMediaSource = readFileSync(new URL('../phone/phone-media.ts', import.meta.url), 'utf8');

describe('Route B proven front-half migration contract', () => {
  it('keeps v16 as a thin verification entry while the production phone shell owns the complete spike', () => {
    expect(spikeSource).toContain('<PhoneStoryShell validationMode="v16" />');
    expect(shellSource).toContain('export function PhoneStoryShell');
    expect(shellSource).toContain('<StoryLoader');
    expect(shellSource).toContain('usePhoneInitialAdapter');
    expect(shellSource).toContain('{Hero && <Hero');
    expect(heroSource).toContain('portrait-scroll-spike__scene--hero');
    expect(shellSource).toContain('portrait-scroll-spike__scene--pattern');
    expect(shellSource).toContain('portrait-scroll-spike__scene--star');
    expect(shellSource).toContain('portrait-scroll-spike__scene--aod');
    expect(shellSource).toContain('id="method"');
  });

  it('preserves the spike as one document-scroll owner with a fixed composite visual stage', () => {
    expect(shellSource).toContain("id: 'portrait-spike-stage'");
    expect(shellSource).toContain("root.dataset.portraitStagePin = 'native-fixed-composite'");
    expect(shellSource).toContain('stageRail.offsetHeight - stage.offsetHeight');
    expect(shellCss).toMatch(/portrait-scroll-spike__stage\s*\{[^}]*position:\s*fixed/s);
    expect(shellCss).toMatch(/portrait-scroll-spike__stage\s*\{[^}]*transform:\s*translate3d\(0,\s*0,\s*0\)/s);
    expect(shellCss).toMatch(/portrait-scroll-spike__stage-rail\s*\{[^}]*height:\s*var\(--portrait-stage-rail-height\)/s);
    expect(shellCss).toMatch(/portrait-scroll-spike__stage-rail\s*\{[^}]*margin-bottom:\s*calc\(-1 \* var\(--portrait-stage-height\)\)/s);
    expect(shellSource).not.toContain('portrait-scroll-spike__rail-backdrop');
    expect(shellSource).not.toContain('viewport?.pageTop');
    expect(shellSource).not.toContain("'--portrait-aod-bottom-mist-opacity'");
    expect(shellSource).toContain('portrait-scroll-spike__toolbar-edge--pattern');
    expect(shellSource).toContain('portrait-scroll-spike__toolbar-edge--aod');
    expect(shellSource).toContain('documentElement.dataset.portraitEdgeScene = edgeScene');
    expect(shellCss).toContain('--portrait-toolbar-solid-height');
    expect(shellCss).toContain('--portrait-pattern-edge-backdrop');
    expect(shellCss).toMatch(/data-portrait-edge-scene="pattern"[^}]*background-attachment:\s*fixed/s);
    expect(shellCss).toMatch(/portrait-scroll-spike__toolbar-edge\s*\{[^}]*bottom:\s*-1px/s);
    expect(shellCss).toContain('--portrait-pattern-wash-background');
    expect(shellCss).toContain('--portrait-aod-bottom-mist-background');
    expect(shellCss).toMatch(/data-portrait-stage-active="true"[^}]*portrait-scroll-spike__reading::before\s*\{[^}]*height:\s*var\(--portrait-stage-height\)/s);
    expect(shellCss).toMatch(/touch-action:\s*pan-y/);
  });

  it('publishes shared semantic checkpoints from the active phone timeline', () => {
    expect(shellSource).toContain("from './phone-stage-timeline'");
    expect(shellSource).toContain('phoneStageFrame(progress, !motionEnabled).checkpoint');
    expect(shellSource).toContain('phoneAodCheckpointForMethodProgress');
    expect(shellSource).toContain('phoneAodCompletionCheckpoint');
    expect(shellSource).toContain('root.dataset.portraitCheckpoint = checkpoint');
    expect(shellSource).toContain('root.dataset.portraitCheckpointTrace = trace');
  });

  it('keeps all three authored ink handoffs as one coherent front-half chain', () => {
    expect(shellSource).toContain('createPhoneInkTransition');
    expect(shellSource).toContain('<HeroPatternTransition');
    expect(heroPatternTransitionSource).toContain("id: 'portrait-hero-pattern-ink'");
    expect(heroPatternTransitionSource).toContain("seed: 'portrait-hero-pattern-r5'");
    expect(heroPatternTransitionSource).toContain("portraitInk: 'hero-pattern'");
    expect(shellSource).toContain('data-portrait-ink="pattern-star"');
    expect(shellSource).toContain('data-portrait-ink="star-aod"');
    expect(shellSource).toContain("'handoff-hero-pattern'");
    expect(shellSource).toContain("'handoff-pattern-star'");
    expect(shellSource).toContain("'handoff-star-aod'");
  });

  it('re-arms the Hero title and keeps toolbar travel out of visual-layer geometry', () => {
    expect(heroSource).toContain('const [titleActive, setTitleActive] = useState(reducedMotion);');
    expect(shellSource).not.toContain('loaderCompletedOnMountRef');
    expect(heroSource).toContain('const startEntrance = useCallback(() => {');
    expect(heroSource).toContain("owner.dataset.portraitHeroTextEntrance = 'playing'");
    expect(shellSource).toContain('heroAdapter.startEntrance()');
    expect(shellSource).toContain("'--portrait-stage-coverage-height'");
    expect(shellSource).not.toContain('scheduleStageCoverage');
    expect(shellSource).not.toContain("window.visualViewport?.addEventListener('scroll'");
    expect(shellCss).toContain('--portrait-stage-coverage-height');
    expect(shellCss).toContain('calc(100lvh - 100svh');
    expect(shellCss).toMatch(/portrait-scroll-spike__stage\s*\{[^}]*bottom:\s*auto/s);
    expect(shellCss).toMatch(/site-nav\.has-scroll-edge-blur::before\s*\{[^}]*backdrop-filter:\s*blur\(20px\)/s);
    expect(heroCss).toContain('html[data-portrait-spike-motion="force"] .portrait-scroll-spike [data-text-reveal-item]');
    expect(heroCss).toContain('r4-text-reveal-enter');
  });

  it('keeps Figure 1 and AOD packed-alpha media in the proven ownership path', () => {
    expect(shellSource).toContain('createPackedAlphaVideoCompositor');
    expect(heroSource).toContain('createPackedAlphaVideoCompositor');
    expect(heroSource).toContain("phoneMediaUrlFor('hero-figure-packed', 'hero')");
    expect(shellSource).toContain("phoneMediaUrlFor('aod-figure-packed-forward', 'aod-animation')");
    expect(shellSource).toContain("phoneMediaUrlFor('aod-figure-packed-reverse', 'aod-animation')");
    expect(shellSource).toContain('AOD_PHONE_TIMELINE_ALPHA_END');
    expect(shellSource).toContain('data-phone-aod-alpha-end={aodAlphaEndProgress.toFixed(2)}');
    expect(phoneMediaSource).toContain('figure1-rgb-alpha.mp4');
    expect(phoneMediaSource).toContain('aod-figure-motion-rgb-alpha.mp4');
    expect(phoneMediaSource).toContain('aod-figure-motion-rgb-alpha-reverse.mp4');
    expect(heroSource).toContain('data-portrait-figure-canvas');
  });

  it('keeps the established Star Map camera and AOD-to-Method handoff together', () => {
    expect(shellSource).toContain('rotationDegrees: -90');
    expect(shellSource).toContain('phoneAodBackdropPresentation');
    expect(shellSource).toContain('phoneAodMethodProgress');
    expect(shellSource).toContain('root.dataset.portraitAodMethodVisible');
    expect(shellCss).toMatch(/portrait-scroll-spike__method-bridge\s*\{[^}]*position:\s*relative/s);
    expect(shellCss).toMatch(/data-portrait-stage-active="true"[^}]*portrait-scroll-spike__method-bridge\s*\{[^}]*position:\s*fixed/s);
  });

  it('moves completed helper ownership beside the production phone adapter', () => {
    expect(heroSource).toContain("from './PhoneHero.motion'");
    expect(heroMotionSource).toContain("from '../../../media/packed-alpha-video'");
    expect(shellSource).not.toContain("from './hero-motion'");
    expect(shellSource).toContain("from './phone-ink'");
    expect(shellSource).toContain("from './aod-autoplay'");
    expect(shellSource).not.toContain("from '../portrait-spike/");
  });
});
