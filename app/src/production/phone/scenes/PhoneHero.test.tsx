import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PhoneHero } from './PhoneHero';

describe('PhoneHero Route B adapter', () => {
  it('preserves the accepted Hero DOM and transparent Figure 1 surface', () => {
    const markup = renderToStaticMarkup(
      <PhoneHero active reducedMotion={false} />
    );

    expect(markup).toContain(
      'class="portrait-scroll-spike__scene portrait-scroll-spike__scene--hero"'
    );
    expect(markup).toContain('id="portrait-spike-home"');
    expect(markup).toContain('aria-label="同野观幂"');
    expect(markup).toContain('data-portrait-hero-intro-ink="true"');
    expect(markup).toContain('data-portrait-figure-poster="true"');
    expect(markup).toContain('data-portrait-figure-canvas="true"');
    expect(markup).toContain('data-portrait-figure-video="true"');
    expect(markup).toContain('data-portrait-gyro-permission="true"');
    expect(markup).toContain('轻触开启体感与全屏');
    expect(markup).toContain('向上滑动');
    expect(markup).not.toContain('phone-scene--hero');
  });
});
