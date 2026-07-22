import { describe, expect, it } from 'vitest';
import {
  PHONE_TTG_LAB_DECISION,
  phoneTtgLabFrame
} from './phone';
import { PHONE_TTG_LAB_ANIMATION_STOP } from '../../scenes/ttg-animation/phone/motion';

describe('Phone TTG → Lab transition', () => {
  it('records the reviewed endpoint/dissolve decision', () => {
    expect(PHONE_TTG_LAB_DECISION).toMatchObject({
      strategy: 'desktop-timed-dissolve',
      camera: 'stable-ttg-terminal-frame',
      dissolveStart: PHONE_TTG_LAB_ANIMATION_STOP,
      forwardEndpoint: 'lab:reading-top',
      reverseEndpoint: 'ttg-animation:stable-terminal-then-reverse'
    });
  });

  it('starts only after desktop TTG media reaches its terminal frame', () => {
    expect(phoneTtgLabFrame(PHONE_TTG_LAB_ANIMATION_STOP).progress).toBe(0);
    expect(phoneTtgLabFrame(
      (1 + PHONE_TTG_LAB_ANIMATION_STOP) / 2
    ).progress).toBeCloseTo(.5);
  });

  it('returns exact forward and reverse semantic endpoints', () => {
    expect(phoneTtgLabFrame(0)).toEqual({
      progress: 0,
      fromOpacity: 1,
      toOpacity: 0
    });
    expect(phoneTtgLabFrame(1)).toEqual({
      progress: 1,
      fromOpacity: 0,
      toOpacity: 1
    });
    expect(phoneTtgLabFrame(0, false, false, -1)).toEqual({
      progress: 0,
      fromOpacity: 1,
      toOpacity: 0
    });
  });

  it('settles media failure and reduced motion without a replay hold', () => {
    expect(phoneTtgLabFrame(.3, false, true, 1).progress).toBe(1);
    expect(phoneTtgLabFrame(.7, false, true, -1).progress).toBe(0);
    expect(phoneTtgLabFrame(.3, true).progress).toBe(1);
  });
});
