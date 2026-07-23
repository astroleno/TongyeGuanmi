import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PHONE_CRANE_TUNING,
  formatPhoneCraneTuning,
  PhoneCraneTuningBar
} from './PhoneCraneTuningBar';

describe('PhoneCraneTuningBar', () => {
  it('exposes all eight acceptance tuning controls', () => {
    const markup = renderToStaticMarkup(createElement(PhoneCraneTuningBar));

    expect(markup).toContain('aria-label="鹤群缩放"');
    expect(markup).toContain('aria-label="鹤群 X"');
    expect(markup).toContain('aria-label="鹤群 Y"');
    expect(markup).toContain('aria-label="建筑 Y"');
    expect(markup).toContain('aria-label="底部云 Y"');
    expect(markup).toContain('aria-label="扑翼机起始缩放"');
    expect(markup).toContain('aria-label="扑翼机起始 X"');
    expect(markup).toContain('aria-label="扑翼机起始 Y"');
    expect(markup.match(/type="range"/g)).toHaveLength(8);
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('收起');
  });

  it('formats a directly shareable parameter string', () => {
    expect(formatPhoneCraneTuning(DEFAULT_PHONE_CRANE_TUNING)).toBe(
      'flockScale=0.570, flockX=-1.00vh, flockY=10.75vh, buildingY=3.25vh, bottomCloudY=3.25vh, figureScale=0.500, figureX=-3.75vh, figureY=8.75vh'
    );
  });
});
