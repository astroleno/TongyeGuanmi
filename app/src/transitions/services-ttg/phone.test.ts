// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type {
  PhoneLeafMountRegistration,
  PhoneLeafReportPort
} from '../../production/phone-story/presentation';

vi.mock('../shared/sceneInk', () => ({
  createInkFieldRenderer: vi.fn(() => ({
    prewarm: vi.fn(), render: vi.fn(), rebindGeneration: vi.fn(() => true),
    destroy: vi.fn()
  }))
}));
import {
  PHONE_SERVICES_TTG_DECISION,
  PHONE_SERVICES_TTG_FIELD,
  PhoneServicesTtgTransition,
  phoneServicesTtgFrame
} from './phone';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function reportFixture() {
  let registration: PhoneLeafMountRegistration | null = null;
  const reports = {
    registerMount(next: PhoneLeafMountRegistration) { registration = next; },
    reportPrepared() {}, reportFrame() {}, reportProgress() {},
    reportComplete() {}, reportFailure() {}
  } satisfies PhoneLeafReportPort;
  return { reports, registration: () => registration };
}

describe('Phone Services → TTG transition', () => {
  it('records the reviewed endpoint/dissolve decision', () => {
    expect(PHONE_SERVICES_TTG_DECISION).toMatchObject({
      strategy: 'validated-phone-ink',
      camera: 'star-map-aod-bottom-to-top-field',
      fallback: 'stable-endpoint-dissolve',
      forwardEndpoint: 'ttg-animation:stable-initial-frame',
      reverseEndpoint: 'services:reading-end'
    });
    expect(PHONE_SERVICES_TTG_FIELD).toMatchObject({
      kind: 'horizontal',
      direction: 'bottom-to-top'
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

  it('registers only the manifest Ink effect through the clean port', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => {
      root.render(createElement(PhoneServicesTtgTransition, { reports: mount.reports }));
    });
    expect(mount.registration()?.surfaces.map(({ id, kind }) => [id, kind])).toEqual([
      ['fx:services-ttg', 'canvas-webgl']
    ]);
    act(() => root.unmount());
  });
});
