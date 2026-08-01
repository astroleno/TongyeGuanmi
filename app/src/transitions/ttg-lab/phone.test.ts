// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import type {
  PhoneLeafMountRegistration,
  PhoneLeafReportPort
} from '../../production/phone-story/presentation';
import {
  PHONE_TTG_LAB_DECISION,
  PhoneTtgLabTransition,
  phoneTtgLabFrame,
  settlePhoneTtgLabDocumentFlow
} from './phone';
import { PHONE_TTG_LAB_ANIMATION_STOP } from '../../scenes/ttg-animation/phone/motion';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

function reportFixture() {
  let registration: PhoneLeafMountRegistration | null = null;
  const reports = {
    registerMount(next: PhoneLeafMountRegistration) { registration = next; },
    reportPrepared() {}, reportFrame() {}, reportProgress() {},
    reportComplete() {}, reportFailure() {}
  } satisfies PhoneLeafReportPort;
  return { reports, registration: () => registration };
}

describe('Phone TTG → Lab transition', () => {
  it('records the reviewed endpoint/dissolve decision', () => {
    expect(PHONE_TTG_LAB_DECISION).toMatchObject({
      strategy: 'desktop-overlay-dissolve',
      camera: 'stable-ttg-terminal-frame',
      topology: 'lab-receiver-over-retained-ttg-source',
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
      fromOpacity: 1,
      toOpacity: 1
    });
    expect(phoneTtgLabFrame(0, false, false, -1)).toEqual({
      progress: 0,
      fromOpacity: 1,
      toOpacity: 0
    });
  });

  it('keeps the retained TTG figure fully presented under the Lab overlay', () => {
    const frame = phoneTtgLabFrame(
      (1 + PHONE_TTG_LAB_ANIMATION_STOP) / 2,
      false,
      false,
      -1
    );

    expect(frame.fromOpacity).toBe(1);
    expect(frame.toOpacity).toBeCloseTo(.5);
  });

  it('keeps TTG hidden while committing Lab at the shared boundary', () => {
    const from = fakeEndpoint();
    const to = fakeEndpoint();
    to.style.opacity = '1.0000';

    settlePhoneTtgLabDocumentFlow(from, to);

    expect(from.style.opacity).toBe('0.0000');
    expect(from.dataset.phoneDissolve).toBe('ttg-lab');
    expect(to.style.opacity).toBe('');
  });

  it('settles media failure and reduced motion without a replay hold', () => {
    expect(phoneTtgLabFrame(.3, false, true, 1).progress).toBe(1);
    expect(phoneTtgLabFrame(.7, false, true, -1).progress).toBe(0);
    expect(phoneTtgLabFrame(.3, true).progress).toBe(1);
  });

  it('registers one clean between-plane surface without owning endpoints', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => {
      root.render(createElement(PhoneTtgLabTransition, { reports: mount.reports }));
    });
    expect(mount.registration()?.surfaces.map(({ id, kind }) => [id, kind])).toEqual([
      ['between:ttg-lab', 'dom']
    ]);
    mount.registration()?.commands.render((1 + PHONE_TTG_LAB_ANIMATION_STOP) / 2);
    expect(host.querySelector<HTMLElement>('[data-phone-transition="ttg-lab"]')
      ?.dataset.phoneTransitionProgress).toBe('0.5000');
    act(() => root.unmount());
  });
});
