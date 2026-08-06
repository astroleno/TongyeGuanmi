// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { BRAND_COPY } from '..';
import type {
  PhoneLeafMountRegistration,
  PhoneLeafReportPort
} from '../../../production/phone-story/presentation';
import { PhoneBrand, Reading, phoneBrandFrame } from './PhoneBrand';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function reportFixture() {
  let registration: PhoneLeafMountRegistration | null = null;
  const reports = {
    registerMount: vi.fn((next: PhoneLeafMountRegistration) => { registration = next; }),
    reportPrepared: vi.fn(), reportFrame: vi.fn(), reportProgress: vi.fn(),
    reportComplete: vi.fn(), reportFailure: vi.fn()
  } satisfies PhoneLeafReportPort;
  return { reports, registration: () => registration };
}

describe('PhoneBrand', () => {
  it('registers one clean static receiver and preserves canonical copy', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneBrand reports={mount.reports} />); });
    expect(mount.registration()?.surfaces.map(({ id, kind }) => [id, kind])).toEqual([
      ['brand-root', 'dom']
    ]);
    expect(host.textContent).toContain(BRAND_COPY[1]);
    expect(host.textContent).toContain(BRAND_COPY[5]);
    expect(host.querySelector('video')).toBeNull();
    await act(async () => { root.render(<Reading sceneId="brand" />); });
    expect(host.querySelector('[data-phone-reading="brand"]')).not.toBeNull();
    expect(host.querySelector('[data-phone-input-owner="native-document"]')).not.toBeNull();
  });

  it('keeps a readable stable receiver at both Proof → Brand endpoints', () => {
    expect(phoneBrandFrame(0)).toEqual({
      progress: 0,
      opacity: 0.96,
      y: 12
    });
    expect(phoneBrandFrame(1)).toEqual({
      progress: 1,
      opacity: 1,
      y: 0
    });
    expect(phoneBrandFrame(0, true)).toEqual(phoneBrandFrame(1));
  });
});
