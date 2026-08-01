// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type {
  PhoneLeafMountRegistration,
  PhoneLeafReportPort
} from '../../production/phone-story/presentation';
import { PhonePhEducationTransition } from './phone';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function fixture() {
  let registration: PhoneLeafMountRegistration | null = null;
  const reports = {
    registerMount(next: PhoneLeafMountRegistration) { registration = next; },
    reportPrepared: vi.fn(), reportFrame: vi.fn(), reportProgress: vi.fn(),
    reportComplete: vi.fn(), reportFailure: vi.fn()
  } satisfies PhoneLeafReportPort;
  return { reports, registration: () => registration };
}

describe('clean PH → Education between-plane leaf', () => {
  it('registers only its declared DOM effect surface', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = fixture();
    await act(async () => {
      root.render(createElement(PhonePhEducationTransition, { reports: mount.reports }));
    });
    expect(mount.registration()?.surfaces.map(({ id, kind }) => [id, kind])).toEqual([
      ['between:ph-education', 'dom']
    ]);
    mount.registration()?.commands.render(.75);
    expect(host.querySelector<HTMLElement>('[data-phone-transition="ph-education"]')
      ?.dataset.phoneTransitionProgress).not.toBeUndefined();
    mount.registration()?.commands.dispose('closure-retired');
    expect(host.querySelector<HTMLElement>('[data-phone-transition="ph-education"]')
      ?.dataset.phoneTransitionProgress).toBeUndefined();
    act(() => root.unmount());
  });
});
