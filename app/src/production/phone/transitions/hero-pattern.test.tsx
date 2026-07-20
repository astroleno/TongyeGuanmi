import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PhoneHeroPatternTransition } from './hero-pattern';

describe('PhoneHeroPatternTransition Route B adapter', () => {
  it('owns the accepted人物中心扩散 canvas surface', () => {
    const markup = renderToStaticMarkup(
      <PhoneHeroPatternTransition
        host={null}
        from={null}
        to={null}
        reducedMotion={false}
      />
    );

    expect(markup).toContain('class="portrait-scroll-spike__ink"');
    expect(markup).toContain('data-portrait-ink="hero-pattern"');
    expect(markup).toContain('aria-hidden="true"');
  });
});
