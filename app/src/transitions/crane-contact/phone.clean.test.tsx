// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type {
  PhoneLeafMountRegistration,
  PhoneLeafReportPort
} from '../../production/phone-story/presentation';
import { PhoneCraneContactTransition } from './phone';

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

describe('clean Crane → Contact between-plane leaf', () => {
  it('registers only its effect surface and never owns either endpoint tree', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = fixture();
    await act(async () => {
      root.render(createElement(PhoneCraneContactTransition, { reports: mount.reports }));
    });

    expect(mount.registration()?.surfaces.map(({ id, kind }) => [id, kind])).toEqual([
      ['between:crane-contact', 'dom']
    ]);
    const commands = mount.registration()?.commands;
    commands?.render(.5);
    const effect = host.querySelector<HTMLElement>('[data-phone-transition="crane-contact"]');
    expect(effect).not.toBeNull();
    expect(host.querySelector('[data-r4-scene]')).toBeNull();

    commands?.settle(1);
    commands?.dispose('closure-retired');
    act(() => root.unmount());
  });
});
