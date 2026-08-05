import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PhoneHero } from './PhoneHero';

const sceneDirectory = dirname(fileURLToPath(import.meta.url));
const heroSource = readFileSync(
  join(sceneDirectory, 'PhoneHero.tsx'),
  'utf8'
);
const storyShellSource = readFileSync(
  join(sceneDirectory, '../PhoneStoryShell.tsx'),
  'utf8'
);
const stageRailStyles = readFileSync(
  join(sceneDirectory, '../PhoneStageRail.css'),
  'utf8'
);
const heroStyles = readFileSync(
  join(sceneDirectory, 'PhoneHero.css'),
  'utf8'
);

const motionDriver = {
  set: () => undefined,
  quickTo: () => () => undefined,
  revealReadingSteps: () => () => undefined
};

describe('PhoneHero Route B adapter', () => {
  it('preserves the accepted Hero DOM and transparent Figure 1 surface', () => {
    const markup = renderToStaticMarkup(
      <PhoneHero active reducedMotion={false} motionDriver={motionDriver} />
    );

    expect(markup).toContain(
      'class="portrait-scroll-spike__scene portrait-scroll-spike__scene--hero"'
    );
    expect(markup).toContain('id="portrait-spike-home"');
    expect(markup).toContain('aria-label="同野观幂"');
    expect(markup).toContain('data-portrait-hero-intro-ink="true"');
    expect(markup).toContain('data-portrait-figure-poster="true"');
    expect(markup).toContain('decoding="async"');
    expect(markup).toContain('data-portrait-figure-canvas="true"');
    expect(markup).toContain('data-portrait-figure-video="true"');
    expect(markup).toContain('data-portrait-gyro-permission="true"');
    expect(markup).toContain('轻触开启体感与全屏');
    expect(markup).toContain('向上滑动');
    expect(markup).not.toContain('phone-scene--hero');
  });

  it('[front-half gate] treats a decoded poster as local warm-up only and hands Loader off from the packed canvas post-paint', () => {
    expect(heroSource).toContain('Promise.all([');
    expect(heroSource).toContain('decodeHeroImage(backImage)');
    expect(heroSource).toContain('decodeHeroImage(middleImage)');
    expect(heroSource).toContain('decodeHeroImage(figurePoster)');
    expect(heroSource).toContain("root.dataset.phoneHeroFirstFrame = 'poster-decoded'");
    expect(heroSource).toContain('const schedulePackedAlphaPostPaint');
    expect(heroSource).toContain("visibleRoot.dataset.phoneHeroFirstFrame = 'packed-alpha-post-paint'");
    const decodedPosterPath = heroSource.slice(
      heroSource.indexOf("root.dataset.phoneHeroFirstFrame = 'poster-decoded'"),
      heroSource.indexOf('}).catch(() => {')
    );
    expect(decodedPosterPath).not.toContain('onReady?.();');
    expect(decodedPosterPath).not.toContain('heroPackedFramePresentedRef.current = true;');
    expect(storyShellSource).toContain("active={activeFrontSurface('front:hero')}");
    expect(storyShellSource).not.toContain(
      "active={loaderHidden && activeFrontSurface('front:hero')}"
    );
  });

  it('[front-half gate] confirms Hero readiness only after a successful packed-alpha draw survives browser presentation', () => {
    const postPaintPath = heroSource.slice(
      heroSource.indexOf('const schedulePackedAlphaPostPaint'),
      heroSource.indexOf('const ensureCompositor')
    );
    expect(postPaintPath).toContain('canvas.dataset.packedAlphaFrameReady !== \'true\'');
    expect(postPaintPath).toContain('void nextBrowserPresentation().then(() => {');
    expect(postPaintPath).toContain('visibleInViewport(visibleCanvas)');
    expect(postPaintPath).toContain('heroPackedFramePresentedRef.current = true;');
    expect(postPaintPath).toContain("visibleRoot.dataset.phoneHeroFirstFrame = 'packed-alpha-post-paint'");
    expect(heroSource).toContain('onReady?.();');
  });

  it('[Task 5] binds the post-painted Hero canvas to the active presentation token before reporting', () => {
    const boundPresentation = heroSource.slice(
      heroSource.indexOf('const requestPresentedHeroFrame'),
      heroSource.indexOf('const renderEntrance')
    );
    expect(heroSource).toContain('presentPresentation(token, report)');
    expect(heroSource).toContain('requestPresentedHeroFrame();');
    expect(heroSource).toContain('heroPackedFramePresentedRef.current = true;');
    expect(heroSource).toContain('next.report({');
    expect(heroSource).toContain('token: next.token');
    expect(heroSource).toContain('disposePresentation(token)');
    expect(boundPresentation).toContain('visibleInViewport(root)');
    expect(boundPresentation).toContain('visibleInViewport(canvas)');
    expect(boundPresentation).toContain("canvas.dataset.packedAlphaFrameReady !== 'true'");
  });

  it('keeps StoryLoader as the only startup visual cover instead of a poster-decoded stage gate', () => {
    expect(storyShellSource).not.toContain('data-phone-hero-first-frame');
    expect(stageRailStyles).not.toContain('data-phone-hero-first-frame');
    expect(stageRailStyles).not.toContain('[data-portrait-loader-ready="false"]');
    expect(stageRailStyles).toContain('The fixed stage warms from mount');
  });

  it('keeps the decoded poster visible until the same packed-alpha canvas has a real frame', () => {
    expect(heroStyles).toContain(
      '[data-portrait-figure-frame="ready"][data-portrait-figure-alpha="verified"] .portrait-scroll-spike__hero-figure[data-packed-alpha-frame-ready="true"]'
    );
    expect(heroStyles).toContain(
      '[data-portrait-figure-frame="ready"][data-portrait-figure-alpha="verified"]:has(.portrait-scroll-spike__hero-figure[data-packed-alpha-frame-ready="true"]) .portrait-scroll-spike__hero-figure-poster'
    );
    expect(heroStyles).toContain('visibility: hidden;');
  });

  it('restores the completed Hero endpoint after a reverse return', () => {
    expect(heroSource).toContain('const heroEntranceCompletedRef = useRef(false);');
    expect(heroSource).toContain('heroEntranceCompletedRef.current = true;');
    expect(heroSource).toContain(
      "rootRef.current?.style.setProperty('--r4-hero-back-ink-opacity', '1');"
    );
    expect(heroSource).toContain('heroEntranceCompletedRef.current = false;');
  });
});
