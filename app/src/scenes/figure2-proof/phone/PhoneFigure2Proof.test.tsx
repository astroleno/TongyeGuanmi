// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type {
  PhoneLeafMountRegistration,
  PhoneLeafReportPort
} from '../../../production/phone-story/presentation';

const renderHold = vi.hoisted(() => vi.fn());
vi.mock('../index', () => ({
  renderFigure2ProofHold: renderHold,
  figure2ProofScene: {
    Component: ({ registerHandle }: { registerHandle(name: string, value: HTMLElement | null): void }) =>
      createElement('article', {
        ref: (value: HTMLElement | null) => registerHandle('copy', value),
        'data-r4-scene': 'figure2-proof', 'data-r4-proof-compound': 'true'
      }, createElement('section', { id: 'figure2-proof-opening', 'data-r4-proof-panel': 'opening' },
        createElement('h2', { className: 'r4-proof-opening__title' }, '一套可以持续验证的方法')),
      createElement('section', { 'data-r4-proof-panel': 'cards' }),
      createElement('section', { 'data-r4-proof-panel': 'closing' }))
  }
}));

import { PhoneFigure2Proof, phoneFigure2ProofFrame } from './PhoneFigure2Proof';

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

describe('clean PhoneFigure2Proof leaf', () => {
  it('registers one compound root and proves the visible opening post-paint', async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback); return frames.length;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneFigure2Proof reports={mount.reports} />); });
    expect(mount.registration()?.surfaces.map(({ id, kind }) => [id, kind])).toEqual([
      ['figure2-proof-root', 'dom']
    ]);
    const current = reportFixture();
    mount.registration()?.commands.rebind({
      reports: current.reports, frameToken: 'proof:frame:1'
    });
    await act(async () => { frames.shift()?.(16); });
    expect(current.reports.reportPrepared).toHaveBeenCalledWith(
      'figure2-proof-root', expect.objectContaining({
        kind: 'static-ready', token: 'proof:frame:1', ready: true
      })
    );
    expect(host.querySelector('#figure2-proof-opening .r4-proof-opening__title'))
      .not.toBeNull();
  });

  it('always settles to the authored opening hold', async () => {
    expect(phoneFigure2ProofFrame(1, 800)).toEqual({ progress: 1, translateY: -1600 });
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneFigure2Proof reports={mount.reports} />); });
    mount.registration()?.commands.render(1);
    expect(host.querySelector<HTMLElement>('[data-r4-scene="figure2-proof"]')
      ?.style.getPropertyValue('--phone-proof-translate-y')).toBe('-1536.00px');
    mount.registration()?.commands.settle(1);
    expect(renderHold).toHaveBeenCalled();
  });
});
