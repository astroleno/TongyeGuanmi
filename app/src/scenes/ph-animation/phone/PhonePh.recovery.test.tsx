// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { PhoneLeafMountRegistration, PhoneLeafReportPort } from '../../../production/phone-story/presentation';

const probe = vi.hoisted(() => ({
  onFrame: null as null | ((frame: { canvas: HTMLCanvasElement; generation: number }) => void),
  activate: vi.fn(() => 1)
}));
vi.mock('../../../media/phone-packed-alpha-surface', () => ({
  createPhonePackedAlphaSurface: vi.fn((options) => {
    probe.onFrame = options.onFrame;
    return { activate: probe.activate, probe: vi.fn(), setMode: vi.fn(), dispose: vi.fn() };
  })
}));
import { PhonePh } from './PhonePh';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it.each([true, false])('rollback reuses only a physically drawn PH generation (drawn: %s)', async (drawn) => {
  probe.activate.mockClear();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
  const host = document.createElement('div');
  const root = createRoot(host);
  let mount: PhoneLeafMountRegistration | undefined;
  const reports = {
    registerMount: vi.fn((registration: PhoneLeafMountRegistration) => { mount = registration; }),
    reportPrepared: vi.fn(), reportFrame: vi.fn(), reportProgress: vi.fn(),
    reportComplete: vi.fn(), reportFailure: vi.fn()
  } satisfies PhoneLeafReportPort;
  try {
    await act(async () => root.render(<PhonePh reports={reports} />));
    const commands = mount!.commands;
    commands.rebind({ reports, frameToken: 'source', transactionId: 'departing', segmentId: 'ph-education', leg: 'source' });
    const invocation = commands.activate({ invocationId: 'activate', surfaceIds: ['ph-figure-video'], credit: 'physical-epoch', playback: false });
    await act(async () => { await Promise.all(invocation.settlements.flatMap(s => s.status === 'pending' ? [s.settled] : [])); });
    const canvas = host.querySelector<HTMLCanvasElement>('canvas')!;
    if (drawn) probe.onFrame!({ canvas, generation: 1 });
    commands.pause('rollback');
    reports.reportFrame.mockClear();
    commands.rebind({ reports, frameToken: 'rollback', transactionId: 'rollback', segmentId: 'ph-education', leg: 'rollback' });
    if (drawn) expect(reports.reportFrame).toHaveBeenCalledWith('ph-figure-canvas', expect.objectContaining({ token: 'rollback', presented: true }));
    else expect(reports.reportFrame).not.toHaveBeenCalled();
    expect(probe.activate).toHaveBeenCalledTimes(1);
  } finally {
    act(() => root.unmount());
    vi.restoreAllMocks();
  }
});
