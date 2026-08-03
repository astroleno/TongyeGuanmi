// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type {
  PhoneLeafMountRegistration,
  PhoneLeafReportPort
} from '../../../production/phone-story/presentation';

const probe = vi.hoisted(() => ({
  surfaceOptions: null as null | Record<string, unknown>,
  activate: vi.fn(() => 1), renderSurface: vi.fn(() => true),
  probeSurface: vi.fn(() => true),
  release: vi.fn(), disposeSurface: vi.fn(), renderProgress: vi.fn()
}));

vi.mock('../index', () => ({
  figure2AnimationScene: {
    Component: ({ registerHandle }: { registerHandle(name: string, value: HTMLElement | null): void }) =>
      createElement('article', { 'data-r4-scene': 'figure2-animation' },
        createElement('div', { ref: (value: HTMLDivElement | null) => registerHandle('stage', value) },
          createElement('div', { className: 'r4-figure2__media-stack--combined' },
            createElement('video', { 'data-figure2-combined-video': true }),
            createElement('canvas', { 'data-figure2-packed-alpha-canvas': true }))))
  },
  disposeFigure2Media: vi.fn(), parkFigure2Media: vi.fn(),
  renderFigure2AnimationProgress: probe.renderProgress
}));

vi.mock('../../../media/phone-packed-alpha-surface', () => ({
  createPhonePackedAlphaSurface: vi.fn((options: Record<string, unknown>) => {
    probe.surfaceOptions = options;
    return {
      activate: probe.activate, probe: probe.probeSurface, render: probe.renderSurface,
      release: probe.release, dispose: probe.disposeSurface
    };
  })
}));

import { PhoneFigure2 } from './PhoneFigure2';

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

describe('clean PhoneFigure2 leaf', () => {
  it('registers one packed pair plus the retained foreground arch', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneFigure2 reports={mount.reports} />); });
    expect(mount.registration()?.surfaces.map(({ id, kind }) => [id, kind])).toEqual([
      ['figure2-pair-video', 'video'],
      ['figure2-pair-canvas', 'canvas-webgl'],
      ['figure2-foreground-arch', 'image']
    ]);
    expect(host.querySelectorAll('[data-stage-retained-figure2-arch="true"]')).toHaveLength(1);
    expect(host.querySelector('[data-stage-retained-figure2-arch="true"]')
      ?.closest('[data-figure2-depth-ranked-field="true"]')).toBeNull();
  });

  it('accepts only a successful active Canvas draw for the current token', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneFigure2 reports={mount.reports} />); });
    const current = reportFixture();
    mount.registration()?.commands.rebind({
      reports: current.reports, frameToken: 'figure2:frame:1'
    });
    const invocation = mount.registration()?.commands.activate({
      invocationId: 'figure2:activate:1',
      surfaceIds: ['figure2-pair-video'], credit: 'physical-epoch'
    });
    expect(invocation?.invoked).toBe(true);
    expect(current.reports.reportFrame).not.toHaveBeenCalled();
    const canvas = host.querySelector<HTMLCanvasElement>('[data-figure2-packed-alpha-canvas]')!;
    (probe.surfaceOptions?.onFrame as (frame: { canvas: HTMLCanvasElement; generation: number }) => void)(
      { canvas, generation: 1 }
    );
    expect(current.reports.reportFrame).toHaveBeenCalledWith(
      'figure2-pair-canvas', expect.objectContaining({
        kind: 'frame', token: 'figure2:frame:1', presented: true
      })
    );
    mount.registration()?.commands.render(.72);
    expect(probe.renderProgress).toHaveBeenCalled();
  });

  it('keeps a transient reactivation repaint miss non-terminal until a causal frame', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    probe.activate.mockReturnValue(1);
    probe.renderSurface.mockReset().mockReturnValue(false);
    probe.probeSurface.mockReset().mockReturnValue(false);
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneFigure2 reports={mount.reports} />); });
    const current = reportFixture();
    mount.registration()?.commands.rebind({
      reports: current.reports, frameToken: 'figure2:reactivate:1'
    });

    const invocation = mount.registration()?.commands.activate({
      invocationId: 'figure2:reactivate',
      surfaceIds: ['figure2-pair-video'], credit: 'physical-epoch'
    });
    const settlement = invocation?.settlements[0];
    expect(settlement?.status).toBe('pending');
    if (settlement?.status === 'pending') await expect(settlement.settled).resolves.toBeUndefined();
    mount.registration()?.commands.render(.4);

    expect(probe.probeSurface).toHaveBeenCalledOnce();
    expect(probe.renderSurface).not.toHaveBeenCalled();
    expect(current.reports.reportFailure).not.toHaveBeenCalled();
  });
});
