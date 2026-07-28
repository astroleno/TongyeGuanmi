import { describe, expect, it } from 'vitest';
import {
  PHONE_BRAND_FIGURE3_DECISION,
  PHONE_BRAND_FIGURE3_FIELD,
  phoneBrandFigure3Frame
} from './phone';

describe('Phone Brand → Figure3 transition', () => {
  it('records the reviewed desktop-parity phone ink decision', () => {
    expect(PHONE_BRAND_FIGURE3_DECISION).toMatchObject({
      strategy: 'validated-phone-ink',
      camera: 'desktop-brand-figure3/star-map-aod-bottom-to-top-field',
      fallback: 'stable-endpoint-dissolve',
      forwardEndpoint: 'figure3-animation:stable-initial-frame',
      reverseEndpoint: 'brand:readable-hold'
    });
    // This crosses independently-minified lazy chunks. Keep the field
    // positional rather than reintroducing a property-name protocol.
    expect(PHONE_BRAND_FIGURE3_FIELD).toEqual([
      'horizontal',
      'brand-figure3',
      'bottom-to-top',
      null,
      null
    ]);
  });

  it('returns exact forward and reverse semantic endpoints', () => {
    expect(phoneBrandFigure3Frame(0)).toEqual({
      progress: 0,
      fromOpacity: 1,
      toOpacity: 0
    });
    expect(phoneBrandFigure3Frame(1)).toEqual({
      progress: 1,
      fromOpacity: 0,
      toOpacity: 1
    });
    expect(phoneBrandFigure3Frame(0, false, false, -1)).toEqual({
      progress: 0,
      fromOpacity: 1,
      toOpacity: 0
    });
  });

  it('uses stable endpoints for media failure and reduced motion', () => {
    expect(phoneBrandFigure3Frame(.3, false, true, 1).progress).toBe(1);
    expect(phoneBrandFigure3Frame(.7, false, true, -1).progress).toBe(0);
    expect(phoneBrandFigure3Frame(0, true).progress).toBe(0);
    expect(phoneBrandFigure3Frame(.3, true).progress).toBe(1);
  });
});
