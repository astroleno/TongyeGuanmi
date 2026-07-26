import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PhoneHeroPatternTransition } from './hero-pattern';

describe('PhoneHeroPatternTransition Route B adapter', () => {
  it('claims the accepted人物中心扩散 surface from the document pool', () => {
    const source = readFileSync(new URL('./hero-pattern.tsx', import.meta.url), 'utf8');
    const markup = renderToStaticMarkup(
      <PhoneHeroPatternTransition
        host={null}
        from={null}
        to={null}
        reducedMotion={false}
      />
    );

    expect(markup).toBe('');
    expect(source).toContain("canvasClassName: 'portrait-scroll-spike__ink'");
    expect(source).toContain("portraitInk: 'hero-pattern'");
  });
});
