import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PhoneStarMap } from './PhoneStarMap';

const motionDriver = {
  set: () => undefined,
  quickTo: () => () => undefined,
  revealReadingSteps: () => () => undefined
};

describe('PhoneStarMap Route B adapter', () => {
  it('preserves the fixed Star Map root while its active prop stays resource-only', () => {
    const markup = renderToStaticMarkup(
      <PhoneStarMap active={false} reducedMotion={false} motionDriver={motionDriver} />
    );

    expect(markup).toContain(
      'class="portrait-scroll-spike__scene portrait-scroll-spike__scene--star"'
    );
    expect(markup).toContain('data-portrait-star-perlin="true"');
    expect(markup).toContain('id="portrait-spike-star-title"');
  });
});
