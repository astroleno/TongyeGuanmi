import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PHONE_CRANE_TUNING,
  formatPhoneCraneTuning,
  PhoneCraneTuningBar
} from './PhoneCraneTuningBar';

describe('PhoneCraneTuningBar', () => {
  it('exposes the three acceptance tuning controls', () => {
    const markup = renderToStaticMarkup(createElement(PhoneCraneTuningBar));

    expect(markup).toContain('aria-label="鹤群缩放"');
    expect(markup).toContain('aria-label="鹤群 Y"');
    expect(markup).toContain('aria-label="建筑 Y"');
    expect(markup.match(/type="range"/g)).toHaveLength(3);
  });

  it('formats a directly shareable parameter string', () => {
    expect(formatPhoneCraneTuning(DEFAULT_PHONE_CRANE_TUNING)).toBe(
      'flockScale=1.000, flockY=0.00vh, buildingY=0.00vh'
    );
  });
});
