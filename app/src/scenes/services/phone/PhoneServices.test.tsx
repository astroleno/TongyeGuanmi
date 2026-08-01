import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SERVICES_COPY } from '..';
import type { PhoneLeafReportPort } from '../../../production/phone-story/presentation';
import { PhoneServices, Reading, phoneServicesFrame } from './PhoneServices';

describe('PhoneServices', () => {
  it('is directly hash-addressable without earlier visual media', () => {
    const reports = {
      registerMount: vi.fn(), reportPrepared: vi.fn(), reportFrame: vi.fn(),
      reportProgress: vi.fn(), reportComplete: vi.fn(), reportFailure: vi.fn()
    } satisfies PhoneLeafReportPort;
    const markup = renderToStaticMarkup(createElement(PhoneServices, {
      reports
    }));
    const readingMarkup = renderToStaticMarkup(createElement(Reading, {
      sceneId: 'services'
    }));

    expect(markup).toContain('id="services"');
    expect(readingMarkup).toContain('data-phone-reading="services"');
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
