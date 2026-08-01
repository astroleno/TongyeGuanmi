// @vitest-environment jsdom

import { act, createElement, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type {
  PhoneLeafMountRegistration,
  PhoneLeafReportPort
} from '../../../production/phone-story/presentation';
import { EDUCATION_COPY } from '..';
import * as educationModule from './PhoneEducation';

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

describe('clean PhoneEducation leaf', () => {
  it('registers one static surface and keeps the native Reading copy separate', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => {
      root.render(<educationModule.PhoneEducation reports={mount.reports} />);
    });
    expect(mount.registration()?.surfaces.map(({ id, kind }) => [id, kind])).toEqual([
      ['education-root', 'dom']
    ]);
    mount.registration()?.commands.rebind({
      reports: mount.reports, frameToken: 'education:frame:1'
    });
    await act(async () => { await new Promise(requestAnimationFrame); });
    expect(mount.reports.reportPrepared).toHaveBeenCalledWith(
      'education-root',
      expect.objectContaining({
        kind: 'static-ready', token: 'education:frame:1', ready: true
      })
    );
    expect(host.textContent).toContain(EDUCATION_COPY[8]);

    const Reading = (educationModule as typeof educationModule & {
      Reading?: ComponentType<Readonly<{ sceneId: string }>>;
    }).Reading;
    expect(Reading).toBeTypeOf('function');
    await act(async () => {
      root.render(createElement(Reading!, { sceneId: 'education' }));
    });
    expect(host.querySelector('[data-phone-reading="education"]')).not.toBeNull();
    expect(host.querySelector('[data-phone-input-owner="native-document"]')).not.toBeNull();
    act(() => root.unmount());
  });
});
