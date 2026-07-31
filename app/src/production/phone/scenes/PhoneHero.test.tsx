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

  it('decodes all static opening layers before priming loader readiness', () => {
    expect(heroSource).toContain('Promise.all([');
    expect(heroSource).toContain('decodeHeroImage(backImage)');
    expect(heroSource).toContain('decodeHeroImage(middleImage)');
    expect(heroSource).toContain('decodeHeroImage(figurePoster)');
    expect(heroSource).toContain("root.dataset.phoneHeroFirstFrame = 'poster-decoded'");
    expect(heroSource).toContain('onFirstFramePrepared?.();');
  });

  it('does not confirm Hero readiness before browser presentation and viewport proof', () => {
    expect(heroSource).toContain('await nextBrowserPresentation();');
    expect(heroSource).toContain('if (!visibleInViewport(root) || !visibleInViewport(figurePoster))');
    expect(heroSource).toContain("root.dataset.phoneHeroFirstFrame = 'presented'");
    expect(heroSource).toContain('onReady?.();');
  });

  it('[Task 5] binds the decoded Hero poster to the active presentation token before reporting', () => {
    const boundPresentation = heroSource.slice(
      heroSource.indexOf('const requestPresentedHeroFrame'),
      heroSource.indexOf('const renderEntrance')
    );
    expect(heroSource).toContain('presentPresentation(token, report)');
    expect(heroSource).toContain('requestPresentedHeroFrame();');
    expect(heroSource).toContain('heroPosterPresentedRef.current = true;');
    expect(heroSource).toContain('next.report({');
    expect(heroSource).toContain('token: next.token');
    expect(heroSource).toContain('disposePresentation(token)');
    expect(boundPresentation).toContain('visibleInViewport(root)');
    expect(boundPresentation).not.toContain('visibleInViewport(figurePoster)');
  });

  it('keeps Loader coverage while allowing the decoded Hero poster to composite beneath it', () => {
    expect(storyShellSource).toContain(
      "data-phone-hero-first-frame={heroFirstFramePrepared ? 'poster-decoded' : 'pending'}"
    );
    expect(stageRailStyles).toContain(
      '[data-phone-hero-first-frame="poster-decoded"] .portrait-scroll-spike__stage'
    );
    expect(stageRailStyles).toContain('Loader may cover, but never replace, the first decoded Hero poster');
  });
});
