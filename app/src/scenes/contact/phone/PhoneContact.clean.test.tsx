// @vitest-environment jsdom

import { act, createElement, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  PhoneLeafMountRegistration,
  PhoneLeafReportPort
} from '../../../production/phone-story/presentation';
import { CONTACT_COPY } from '..';
import * as contactModule from './PhoneContact';

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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('clean PhoneContact leaf', () => {
  it('registers one post-paint surface and rejects stale or disposed proof callbacks', async () => {
    let frameId = 0;
    const frames = new Map<number, FrameRequestCallback>();
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      frames.set(++frameId, callback);
      return frameId;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => frames.delete(id)));

    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => {
      root.render(<contactModule.PhoneContact reports={mount.reports} />);
    });
    expect(mount.registration()?.surfaces.map(({ id, kind }) => [id, kind])).toEqual([
      ['contact-root', 'dom']
    ]);

    mount.registration()?.commands.rebind({
      reports: mount.reports, frameToken: 'contact:frame:stale'
    });
    mount.registration()?.commands.rebind({
      reports: mount.reports, frameToken: 'contact:frame:current'
    });
    for (const callback of frames.values()) callback(performance.now());
    frames.clear();
    expect(mount.reports.reportPrepared).toHaveBeenCalledTimes(1);
    expect(mount.reports.reportPrepared).toHaveBeenCalledWith(
      'contact-root',
      expect.objectContaining({
        kind: 'static-ready', token: 'contact:frame:current', ready: true
      })
    );

    mount.registration()?.commands.rebind({
      reports: mount.reports, frameToken: 'contact:frame:disposed'
    });
    mount.registration()?.commands.dispose('closure-retired');
    for (const callback of frames.values()) callback(performance.now());
    expect(mount.reports.reportPrepared).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it('keeps terminal actions in a separate native, keyboard-reachable reading flow', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const Reading = (contactModule as typeof contactModule & {
      Reading?: ComponentType<Readonly<{ sceneId: string }>>;
    }).Reading;
    expect(Reading).toBeTypeOf('function');
    await act(async () => {
      root.render(createElement(Reading!, { sceneId: 'contact' }));
    });

    expect(host.querySelector('[data-phone-reading="contact"]')).not.toBeNull();
    expect(host.querySelector('[data-phone-input-owner="native-document"]')).not.toBeNull();
    expect(host.textContent).toContain(CONTACT_COPY[3]);
    expect(host.querySelector<HTMLAnchorElement>('a[href^="mailto:"]')?.tabIndex).toBe(0);
    expect(host.querySelector<HTMLAnchorElement>('a[href="#top"]')?.tabIndex).toBe(0);
    expect(host.querySelector('canvas, video')).toBeNull();
    act(() => root.unmount());
  });
});
