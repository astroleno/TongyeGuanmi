import { describe, expect, it } from 'vitest';
import {
  PHONE_BRAND_FIGURE3_DECISION,
  phoneBrandFigure3Frame
} from './phone';

describe('Phone Brand → Figure3 transition', () => {
  it('records the reviewed endpoint/dissolve decision', () => {
    expect(PHONE_BRAND_FIGURE3_DECISION).toMatchObject({
      strategy: 'endpoint-dissolve',
      camera: 'none',
      forwardEndpoint: 'figure3-animation:stable-initial-frame',
      reverseEndpoint: 'brand:readable-hold'
    });
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
    expect(phoneBrandFigure3Frame(.3, true).progress).toBe(1);
  });
});
