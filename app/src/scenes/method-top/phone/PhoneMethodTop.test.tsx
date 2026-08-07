// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type {
  PhoneLeafMountRegistration,
  PhoneLeafReportPort
} from '../../../production/phone-story/presentation';
import { METHOD_COPY } from '../../../story/copy';
import { PhoneMethodTop, Reading, phoneMethodTopFrame } from './PhoneMethodTop';

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

describe('clean PhoneMethodTop leaf', () => {
  it('registers one static root and proves the current post-paint generation', async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback); return frames.length;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneMethodTop reports={mount.reports} />); });
    expect(mount.registration()?.surfaces.map(({ id, kind }) => [id, kind])).toEqual([
      ['method-root', 'dom']
    ]);
    expect(mount.registration()?.root.querySelector('#method')).not.toBeNull();
    expect(mount.registration()?.root).not.toBe(
      mount.registration()?.surfaces[0]?.element
    );
    expect(Object.keys(mount.registration()?.commands ?? {}).sort()).toEqual([
      'activate', 'dispose', 'pause', 'rebind', 'render', 'settle'
    ]);
    const current = reportFixture();
    mount.registration()?.commands.rebind({
      reports: current.reports, frameToken: 'method:frame:1'
    });
    expect(current.reports.reportPrepared).not.toHaveBeenCalled();
    await act(async () => { frames.shift()?.(16); });
    expect(current.reports.reportPrepared).toHaveBeenCalledWith(
      'method-root', expect.objectContaining({
        kind: 'static-ready', token: 'method:frame:1', ready: true
      })
    );
    expect(host.querySelector('#portrait-spike-method-title')?.textContent)
      .toContain(METHOD_COPY[1]);
  });

  it('keeps the authored reading readable at either transaction endpoint', async () => {
    expect(phoneMethodTopFrame(0)).toEqual({ progress: 0, opacity: 0, y: 30, blur: 8 });
    expect(phoneMethodTopFrame(1)).toEqual({ progress: 1, opacity: 1, y: 0, blur: 0 });
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneMethodTop reports={mount.reports} />); });
    mount.registration()?.commands.settle(0);
    expect(host.querySelector<HTMLElement>('.portrait-scroll-spike__method-bridge')?.style.opacity)
      .toBe('1');
    mount.registration()?.commands.settle(1);
    expect(host.querySelector<HTMLElement>('.portrait-scroll-spike__method-bridge')?.style.opacity)
      .toBe('1');
    await act(async () => { root.render(<Reading sceneId="method-top" />); });
    expect(host.querySelector('[data-phone-reading="method-top"]')
      ?.getAttribute('data-phone-input-owner')).toBe('native-document');
  });

  it('mirrors the native document scroll before the fixed visual copy is exposed', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    Object.defineProperty(document, 'scrollingElement', {
      configurable: true, value: { scrollTop: 963 }
    });
    await act(async () => { root.render(<PhoneMethodTop reports={mount.reports} />); });
    expect(mount.registration()?.root.dataset.phoneMethodNativeScrollY).toBe('963.00');
    expect(mount.registration()?.root.style.getPropertyValue('--phone-method-native-scroll-y'))
      .toBe('963.00px');
    Object.defineProperty(document, 'scrollingElement', { configurable: true, value: null });
  });

  it('freezes the last native scroll sample when reading is disabled', async () => {
    const scrollOwner = { scrollTop: 963 };
    Object.defineProperty(document, 'scrollingElement', {
      configurable: true, value: scrollOwner
    });
    const shell = document.createElement('main');
    shell.className = 'phone-story';
    shell.dataset.phoneReading = 'enabled';
    document.body.append(shell);
    const root = createRoot(shell);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneMethodTop reports={mount.reports} />); });
    const visual = mount.registration()?.root;
    expect(visual?.dataset.phoneMethodNativeScrollY).toBe('963.00');

    shell.dataset.phoneReading = 'disabled';
    scrollOwner.scrollTop = 0;
    await act(async () => { await Promise.resolve(); });
    expect(visual?.dataset.phoneMethodNativeScrollY).toBe('963.00');

    shell.dataset.phoneReading = 'enabled';
    await act(async () => { await Promise.resolve(); });
    expect(visual?.dataset.phoneMethodNativeScrollY).toBe('0.00');
    act(() => root.unmount());
    shell.remove();
    Object.defineProperty(document, 'scrollingElement', { configurable: true, value: null });
  });
});
