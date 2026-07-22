import { describe, expect, it } from 'vitest';
import {
  PHONE_FIGURE3_SERVICES_DECISION,
  phoneFigure3ServicesFrame
} from './phone';

describe('Phone Figure3 → Services transition', () => {
  it('records the reviewed endpoint/dissolve decision', () => {
    expect(PHONE_FIGURE3_SERVICES_DECISION).toMatchObject({
      strategy: 'endpoint-dissolve',
      camera: 'none',
      copyCueProgress: 0.8,
      forwardEndpoint: 'services:reading-top',
      reverseEndpoint: 'figure3-animation:stable-initial-frame'
    });
  });

  it('returns exact forward and reverse semantic endpoints', () => {
    expect(phoneFigure3ServicesFrame(0)).toEqual({
      progress: 0,
      fromOpacity: 1,
      toOpacity: 0
    });
    expect(phoneFigure3ServicesFrame(1)).toEqual({
      progress: 1,
      fromOpacity: 0,
      toOpacity: 1
    });
    expect(phoneFigure3ServicesFrame(0, false, false, -1)).toEqual({
      progress: 0,
      fromOpacity: 1,
      toOpacity: 0
    });
  });

  it('starts Services during Figure3 final 20% like AOD → Method', () => {
    expect(phoneFigure3ServicesFrame(.8).progress).toBe(0);
    expect(phoneFigure3ServicesFrame(.9).progress).toBeCloseTo(.5);
    expect(phoneFigure3ServicesFrame(1).progress).toBe(1);
    expect(phoneFigure3ServicesFrame(.9, false, false, -1).progress)
      .toBeCloseTo(.5);
  });

  it('settles media failure and reduced motion without a replay hold', () => {
    expect(phoneFigure3ServicesFrame(.3, false, true, 1).progress).toBe(1);
    expect(phoneFigure3ServicesFrame(.7, false, true, -1).progress).toBe(0);
    expect(phoneFigure3ServicesFrame(.3, true).progress).toBe(1);
  });
});
