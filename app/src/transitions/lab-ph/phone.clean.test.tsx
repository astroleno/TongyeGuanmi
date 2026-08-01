// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type {
  PhoneLeafMountRegistration,
  PhoneLeafReportPort
} from '../../production/phone-story/presentation';
import { PhoneLabPhTransition } from './phone';

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

describe('clean Lab → PH effect leaf', () => {
  it('registers only the declared above-both Ink surface', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const mount = fixture();
    await act(async () => {
      root.render(createElement(PhoneLabPhTransition, { reports: mount.reports }));
    });
    expect(mount.registration()?.surfaces.map(({ id, kind }) => [id, kind])).toEqual([
      ['fx:lab-ph', 'canvas-webgl']
    ]);
    expect(host.querySelector('canvas')?.dataset.r4InkSegment).toBe('lab-ph');
    mount.registration()?.commands.render(.5);
    expect(host.querySelector('canvas')?.style.visibility).toBe('visible');
    mount.registration()?.commands.settle(1);
    expect(host.querySelector('canvas')?.style.visibility).toBe('hidden');
    act(() => root.unmount());
    host.remove();
  });
});
