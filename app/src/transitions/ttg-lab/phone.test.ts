import { describe, expect, it } from 'vitest';
import {
  PHONE_TTG_LAB_DECISION,
  phoneTtgLabBridgeY,
  phoneTtgLabFrame,
  settlePhoneTtgLabDocumentFlow
} from './phone';
import { PHONE_TTG_LAB_ANIMATION_STOP } from '../../scenes/ttg-animation/phone/motion';

function fakeEndpoint(): HTMLElement {
  const properties = new Map<string, string>();
  return {
    dataset: {},
    inert: false,
    style: {
      opacity: '',
      setProperty(name: string, value: string) {
        properties.set(name, value);
      },
      getPropertyValue(name: string) {
        return properties.get(name) ?? '';
      },
      removeProperty(name: string) {
        const value = properties.get(name) ?? '';
        properties.delete(name);
        return value;
      }
    }
  } as unknown as HTMLElement;
}

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

  it('anchors the same Lab root at its real viewport position on reverse', () => {
    expect(phoneTtgLabBridgeY(1)).toContain('-1 * var(--portrait-stage-height');
    expect(phoneTtgLabBridgeY(-1)).toBe('0px');
  });

  it('keeps TTG hidden while releasing Lab back to document flow', () => {
    const from = fakeEndpoint();
    const to = fakeEndpoint();
    to.dataset.phoneTtgLabBridge = 'active';
    to.style.setProperty('--phone-ttg-lab-bridge-opacity', '1');

    settlePhoneTtgLabDocumentFlow(from, to);

    expect(from.style.opacity).toBe('0.0000');
    expect(from.dataset.phoneDissolve).toBe('ttg-lab');
    expect(to.dataset.phoneTtgLabBridge).toBeUndefined();
    expect(to.style.getPropertyValue('--phone-ttg-lab-bridge-opacity')).toBe('');
  });

  it('settles media failure and reduced motion without a replay hold', () => {
    expect(phoneTtgLabFrame(.3, false, true, 1).progress).toBe(1);
    expect(phoneTtgLabFrame(.7, false, true, -1).progress).toBe(0);
    expect(phoneTtgLabFrame(.3, true).progress).toBe(1);
  });
});
