import { describe, expect, it } from 'vitest';
import {
  PHONE_SERVICES_TTG_DECISION,
  phoneServicesTtgFrame
} from './phone';

describe('Phone Services → TTG transition', () => {
  it('records the reviewed endpoint/dissolve decision', () => {
    expect(PHONE_SERVICES_TTG_DECISION).toMatchObject({
      strategy: 'endpoint-dissolve',
      camera: 'none',
      forwardEndpoint: 'ttg-animation:stable-initial-frame',
      reverseEndpoint: 'services:reading-end'
    });
  });

  it('returns exact forward and reverse semantic endpoints', () => {
    expect(phoneServicesTtgFrame(0)).toEqual({
      progress: 0,
      fromOpacity: 1,
      toOpacity: 0
    });
    expect(phoneServicesTtgFrame(1)).toEqual({
      progress: 1,
      fromOpacity: 0,
      toOpacity: 1
    });
    expect(phoneServicesTtgFrame(0, false, false, -1)).toEqual({
      progress: 0,
      fromOpacity: 1,
      toOpacity: 0
    });
  });

  it('settles media failure and reduced motion without a replay hold', () => {
    expect(phoneServicesTtgFrame(.3, false, true, 1).progress).toBe(1);
    expect(phoneServicesTtgFrame(.7, false, true, -1).progress).toBe(0);
    expect(phoneServicesTtgFrame(.3, true).progress).toBe(1);
  });
});
