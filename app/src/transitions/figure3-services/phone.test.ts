import { describe, expect, it } from 'vitest';
import {
  PHONE_FIGURE3_SERVICES_DECISION,
  phoneFigure3ServicesFrame,
  settlePhoneFigure3ServicesDocumentFlow
} from './phone';

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
        if (name === 'opacity') this.opacity = '';
        const value = properties.get(name) ?? '';
        properties.delete(name);
        return value;
      }
    }
  } as unknown as HTMLElement;
}

describe('Phone Figure3 → Services transition', () => {
  it('records the reviewed endpoint/dissolve decision', () => {
    expect(PHONE_FIGURE3_SERVICES_DECISION).toMatchObject({
      strategy: 'endpoint-dissolve',
      camera: 'none',
      topology: 'persistent-endpoint-opacity',
      copyCueProgress: 0.8,
      receiverOwner: 'services:document-root',
      receiverCopies: 1,
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

  it('keeps the Services endpoint composited while reverse arms', () => {
    const from = fakeEndpoint();
    const to = fakeEndpoint();

    settlePhoneFigure3ServicesDocumentFlow(from, to);

    expect(from.style.opacity).toBe('0.0000');
    expect(from.dataset.phoneDissolve).toBe('figure3-services');
    expect(from.dataset.phoneDissolveOpacity).toBe('0.0000');
    expect(to.style.opacity).toBe('1.0000');
    expect(to.dataset.phoneDissolve).toBe('figure3-services');
    expect(to.dataset.phoneDissolveOpacity).toBe('1.0000');

    settlePhoneFigure3ServicesDocumentFlow(from, to);

    expect(to.style.opacity).toBe('1.0000');
    expect(to.dataset.phoneDissolveOpacity).toBe('1.0000');
  });

  it('[R5] keeps a released endpoint against a late media progress sample', () => {
    expect(phoneFigure3ServicesFrame(0, false, false, 1, 1)).toMatchObject({
      progress: 1,
      fromOpacity: 0,
      toOpacity: 1
    });
    expect(phoneFigure3ServicesFrame(1, false, false, -1, 0)).toMatchObject({
      progress: 0,
      fromOpacity: 1,
      toOpacity: 0
    });
  });

  it('settles media failure and reduced motion without a replay hold', () => {
    expect(phoneFigure3ServicesFrame(.3, false, true, 1).progress).toBe(1);
    expect(phoneFigure3ServicesFrame(.7, false, true, -1).progress).toBe(0);
    expect(phoneFigure3ServicesFrame(.3, true).progress).toBe(1);
  });
});
