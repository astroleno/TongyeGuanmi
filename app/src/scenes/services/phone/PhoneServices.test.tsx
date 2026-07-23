import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SERVICES_COPY } from '..';
import { PhoneServices, phoneServicesFrame } from './PhoneServices';

describe('PhoneServices', () => {
  it('is directly hash-addressable without earlier visual media', () => {
    const markup = renderToStaticMarkup(createElement(PhoneServices, {
      active: true,
      reducedMotion: false
    }));

    expect(markup).toContain('id="services"');
    expect(markup).toContain('data-phone-reading="native-document"');
    expect(markup).toContain(SERVICES_COPY[3]);
    expect(markup.match(/phone-services__row/g)).toHaveLength(4);
    expect(markup).not.toContain('<video');
    expect(markup).not.toContain('figure3-motion');
  });

  it('has reversible local entrance frames and a reduced-motion endpoint', () => {
    expect(phoneServicesFrame(0)).toEqual({
      progress: 0,
      opacity: 0.98,
      y: 10
    });
    expect(phoneServicesFrame(1)).toEqual({
      progress: 1,
      opacity: 1,
      y: 0
    });
    expect(phoneServicesFrame(0.2, true)).toEqual(phoneServicesFrame(1));
  });
});
