import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./PortraitScrollSpike.tsx', import.meta.url), 'utf8');
const stylesheet = readFileSync(new URL('./PortraitScrollSpike.css', import.meta.url), 'utf8');
const inkSource = readFileSync(new URL('./portrait-ink.ts', import.meta.url), 'utf8');
const globalStylesheet = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');

function constant(name: string): number {
  const match = source.match(new RegExp(`const ${name} = ([0-9.]+);`));
  if (!match?.[1]) {
    throw new Error(`Missing portrait timeline constant: ${name}`);
  }
  return Number(match[1]);
}

describe('PortraitScrollSpike two-surface timeline', () => {
  it('keeps every internal motion and from/to handoff in a strictly exclusive interval', () => {
    const stops = [
      constant('HERO_MOTION_END'),
      constant('HERO_PATTERN_END'),
      constant('PATTERN_MOTION_START'),
      constant('PATTERN_MOTION_END'),
      constant('PATTERN_STAR_START'),
      constant('PATTERN_STAR_END'),
      constant('STAR_AOD_START'),
      constant('STAR_AOD_END'),
      constant('AOD_AUTOPLAY_START')
    ];

    expect(stops).toEqual([...stops].sort((a, b) => a - b));
    expect(new Set(stops).size).toBe(stops.length);
    expect(source).not.toMatch(/const HERO_PATTERN_START\s*=/);
    expect(source).not.toMatch(/const PATTERN_END\s*=/);
    expect(source).not.toMatch(/const STAR_END\s*=/);
  });

  it('uses authored radial ownership for Hero and Pattern and presents Star copy with its target', () => {
    expect(source).toContain("origin: PORTRAIT_HERO_FIGURE_CENTER");
    expect(source).toContain("origin: PORTRAIT_PATTERN_CENTER");
    expect(source).toContain(
      'const starPresentationProgress = progress >= PATTERN_STAR_START ? 1 : 0'
    );
    expect(source).toContain('const copyProgress = range01(progress, 0, 0.78)');
    expect(source).toContain(
      "setOwnership('handoff-pattern-star', ['pattern', 'star'], ['star', 'pattern'])"
    );
    expect(inkSource).toContain("spec.kind === 'radial'");
    expect(inkSource).not.toContain("options.to.style.visibility = 'visible'");
  });

  it('keeps Hero hidden and scrolling locked until the Loader has fully exited', () => {
    expect(source).toContain('<StoryLoader');
    expect(source).toContain('data-portrait-loader-ready={String(loaderHidden)}');
    expect(source).toContain('portraitLoaderCompletedInDocument');
    expect(source).toContain('markPortraitLoaderCompletedInDocument');
    expect(source).toContain('if (!loaderHidden)');
    expect(source).toContain('dependencies: [loaderHidden, motionEnabled]');
    expect(source).toContain("root.dataset.portraitHeroEntrance = 'playing'");
    expect(source).toContain('startHeroIntro');
    expect(source).toContain('createRadialInkIntroController');
    expect(source).toContain('HERO_RADIAL_INK_FIELD');
    expect(source).not.toContain('heroIntro = gsap.timeline');
    expect(source).not.toContain('sessionStorage');
    expect(stylesheet).toMatch(
      /data-portrait-spike-loader="active"[^}]*overflow-y:\s*hidden/s
    );
    expect(stylesheet).toMatch(
      /data-portrait-loader-ready="false"[^}]*visibility:\s*hidden/s
    );
    expect(globalStylesheet).toMatch(
      /data-loader-ink-status="active"[^}]*story-loader__ink-clear[^}]*visibility:\s*hidden/s
    );
    expect(globalStylesheet).toMatch(
      /story-loader__ink-blur\s*\{[^}]*display:\s*none/s
    );
  });

  it('renders Figure 1 and AOD through packed alpha canvases instead of transparent video layers', () => {
    expect(source).toContain('figure1-rgb-alpha.mp4');
    expect(source).toContain('aod-figure-motion-rgb-alpha.mp4');
    expect(source).toContain('aod-figure-motion-rgb-alpha-reverse.mp4');
    expect(source).toContain('createPackedAlphaVideoCompositor');
    expect(source).toContain('data-portrait-figure-canvas');
    expect(stylesheet).toMatch(
      /aod-transition__figure-video[^}]*opacity:\s*0\s*!important/s
    );
  });

  it('gives AOD reversible native time ownership and brings Method in over its final twenty percent', () => {
    expect(source).toContain('createPortraitAodAutoplay');
    expect(source).toContain('portraitAodMethodProgress(progress)');
    expect(source).toContain('durationSeconds: AOD_FIGURE_END_SECONDS');
    expect(source).not.toContain('renderAodExitProgress');
    expect(source).not.toContain("id: 'portrait-spike-reading-intro'");
    expect(stylesheet).toMatch(
      /portrait-scroll-spike__method-bridge\s*\{[^}]*position:\s*relative[^}]*min-height:\s*var\(--portrait-live-height\)/s
    );
    expect(stylesheet).toMatch(
      /data-portrait-stage-active="true"[^}]*portrait-scroll-spike__method-bridge\s*\{[^}]*position:\s*fixed[^}]*z-index:\s*17/s
    );
    expect(source).toContain('beginAodForward');
    expect(source).toContain('beginAodReverse');
    expect(source).toContain('aodAutoplay?.start(1)');
    expect(source).toContain('aodAutoplay?.start(-1)');
    expect(source).not.toContain('AOD_REVERSE_ARM_START');
    expect(source).toContain('renderMethodBridge(methodProgress)');
    expect(source).toContain('renderMethodBridge(0)');
    expect(source).toContain("root.dataset.portraitAodMethodVisible = String(visible)");
    expect(stylesheet).toMatch(
      /data-portrait-aod-method-visible="false"[^}]*method-bridge[^}]*display:\s*none\s*!important/s
    );
    expect(source).toContain("root.dataset.portraitStageBoundary = 'held-by-aod'");
    expect(source).toContain('createPortraitScrollSnapLock');
    expect(source).toContain('aodScrollSnap.lock(anchorY)');
    expect(source).toContain('beginAodReverse(Math.max(stageScrollStart, stageScrollEnd - 1))');
    expect(source).toContain("root.addEventListener('pointermove', onHeroPointerMove");
    expect(source).toContain('onComplete: completeAodRun');
    expect(source).toContain('aodScrollSnap.release()');
    expect(source).toContain("['aod'], ['aod']");
    expect(source).not.toContain("['aod', 'star']");
    expect(constant('AOD_AUTOPLAY_START')).toBe(0.985);
    expect(stylesheet).toContain(
      '--aod-transition-scene-width: calc(var(--portrait-stage-height) * 1.16)'
    );
    expect(stylesheet).toContain(
      'width: max(100%, calc(var(--portrait-stage-height) * 1.45546))'
    );
    expect(stylesheet).toContain('scale(var(--portrait-aod-figure-cover-scale))');
    expect(stylesheet).not.toContain(
      'calc(-50% + var(--aod-transition-figure-y) + var(--portrait-aod-figure-shift-y))'
    );
    expect(source).toContain('portraitAodPresentation(progress)');
    expect(source).toContain('portraitAodBackdropPresentation(progress)');
    expect(source).toContain("'--aod-transition-sun-y'");
    expect(source).toContain("'--aod-transition-cloud-y'");
    expect(source).toContain('portraitAodBackdropProgress = progress.toFixed(4)');
    expect(stylesheet).not.toMatch(
      /scene--aod\[data-portrait-aod-alpha="transparent"\][^}]*background:\s*transparent/s
    );
  });

  it('ends the fixed stage with Method reading already aligned at the viewport top', () => {
    expect(source).toContain('ref={stageRailRef}');
    expect(source).toContain('trigger: stageRail');
    expect(source).toContain("end: 'bottom top'");
    expect(source).toContain('height * STAGE_SCROLL_VIEWPORTS');
    expect(source).not.toContain('height * (STAGE_SCROLL_VIEWPORTS + 1)');
    expect(source).toContain("root.dataset.portraitStagePin = 'native-fixed'");
    expect(source).toContain('setStageActive(self.progress < 1)');
    expect(source).not.toMatch(/pin:\s*true/);
    expect(stylesheet).toMatch(
      /portrait-scroll-spike__stage\s*\{[^}]*position:\s*fixed[^}]*inset:\s*0/s
    );
    expect(stylesheet).toMatch(
      /data-portrait-stage-active="false"[^}]*portrait-scroll-spike__stage[^}]*display:\s*none/s
    );
    expect(source.indexOf('<section id="method"')).toBeLessThan(
      source.indexOf('ref={readingIntroRef}')
    );
    expect(source.indexOf('ref={readingIntroRef}')).toBeLessThan(
      source.indexOf('ref={readingStepsRef}')
    );
  });

  it('paints the ratio-preserving Star map and aligned Perlin field into one screen canvas', () => {
    expect(source).not.toContain('portrait-scroll-spike__star-map-image');
    expect(source).toContain('window.devicePixelRatio');
    expect(source).toContain('drawSource: true');
    expect(source).toContain('noiseFloor: motionEnabled ? 0.028 : 0.02');
    expect(source).not.toContain('sourceOpacity:');
    expect(source).toContain("profile: 'desktop-r5'");
    expect(source).toContain('noiseMaskWidth: 420');
    expect(source).toContain('driftX: 0.06');
    expect(source).toContain('driftY: 0.34');
    expect(source).toContain('wideBlur: 120');
    expect(source).toContain('mediumBlur: 44');
    expect(source).toContain('coreBlur: 10');
    expect(source).toContain('screenBlur: 3');
    expect(source).toContain('screenAlpha: 0.52');
    expect(source).toContain('zoom: 1');
    expect(stylesheet).toMatch(
      /portrait-scroll-spike__star-perlin\s*\{[^}]*inset:\s*0[^}]*width:\s*100%[^}]*height:\s*100%/s
    );
  });

  it('uses the corrected Hero composition and higher radial origin', () => {
    expect(source).toContain('PORTRAIT_HERO_FIGURE_CENTER = Object.freeze({ x: 0.5, y: 0.44 })');
    expect(source).toContain('HERO_SUBTITLE_LINES.map');
    expect(source).toContain('<TextReveal');
    expect(source).not.toContain('portrait-scroll-spike__brand');
    expect(stylesheet).toMatch(
      /portrait-scroll-spike__hero-subtitle\s*\{[^}]*top:\s*calc\(max\(26px,\s*env\(safe-area-inset-top\)\)\s*\+\s*11dvh/s
    );
    expect(source).toContain("gsap.set(heroBackMotion, { scale: 1.08, yPercent: 0 })");
    expect(stylesheet).toContain('--portrait-stage-height: max(var(--portrait-live-height), 100lvh)');
    expect(source).toContain('root.dataset.portraitTransientViewport = nextViewport');
  });

  it('fills the browser edge and carries the final AOD paper into Method', () => {
    expect(source).toContain("meta[name=\"theme-color\"]");
    expect(source).toContain('PORTRAIT_SURFACE_PAPER');
    expect(stylesheet).toMatch(
      /html\[data-portrait-spike="b"\][^{]*\{[^}]*background:\s*var\(--portrait-document-surface/s
    );
    expect(stylesheet).toMatch(
      /portrait-scroll-spike__reading\s*\{[^}]*#ede4d2/s
    );
    expect(stylesheet).toMatch(
      /data-portrait-spike="b"[^}]*site-nav\s*\{[^}]*padding-top:\s*env\(safe-area-inset-top/s
    );
  });

  it('restores the production progressive-blur navigation after the Pattern handoff', () => {
    expect(source).toContain("import { StoryNav } from '../StoryNav'");
    expect(source).toContain('<StoryNav');
    expect(source).toContain("navigationScene !== 'hero'");
    expect(source).toContain("navigationScene !== 'pattern'");
    expect(source).toContain("setCurrentNavigationScene('method-top')");
  });
});
