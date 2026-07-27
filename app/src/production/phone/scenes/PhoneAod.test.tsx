import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PhoneAod } from './PhoneAod';

describe('PhoneAod Route B adapter', () => {
  it('keeps its stable root mounted and reserves active for decoder resources', () => {
    const markup = renderToStaticMarkup(
      <PhoneAod active={false} reducedMotion={false} />
    );

    expect(markup).toContain(
      'class="portrait-scroll-spike__scene portrait-scroll-spike__scene--aod"'
    );
    expect(markup).toContain('data-aod-figure-canvas="true"');
    expect(markup).toContain('data-aod-figure-video="true"');
  });
});
