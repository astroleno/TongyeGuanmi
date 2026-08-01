// @vitest-environment jsdom

import { act, createElement, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type {
  PhoneLeafMountRegistration,
  PhoneLeafReportPort
} from '../../../production/phone-story/presentation';
import { LAB_COPY } from '..';
import * as labModule from './PhoneLab';

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

describe('clean PhoneLab leaf', () => {
  it('registers one static receiver and keeps the native reading copy separate', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<labModule.PhoneLab reports={mount.reports} />); });
    expect(mount.registration()?.surfaces.map(({ id, kind }) => [id, kind])).toEqual([
      ['lab-root', 'dom']
    ]);
    mount.registration()?.commands.rebind({
      reports: mount.reports, frameToken: 'lab:frame:1'
    });
    mount.registration()?.commands.render(0);
    expect(host.querySelector<HTMLElement>('#lab')?.dataset.phoneLabProgress)
      .toBe('0.0000');
    expect(host.textContent).toContain(LAB_COPY[10]);

    const Reading = (labModule as typeof labModule & {
      Reading?: ComponentType<Readonly<{ sceneId: string }>>;
    }).Reading;
    expect(Reading).toBeTypeOf('function');
    await act(async () => { root.render(createElement(Reading!, { sceneId: 'lab' })); });
    expect(host.querySelector('[data-phone-reading="lab"]')).not.toBeNull();
    act(() => root.unmount());
  });
});
