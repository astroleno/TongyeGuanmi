// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type {
  PhoneLeafMountRegistration,
  PhoneLeafReportPort
} from '../../../production/phone-story/presentation';

const probe = vi.hoisted(() => ({
  disposeDriver: vi.fn(),
  driveFrame: vi.fn(),
  prepareFrame: vi.fn(async (
    video: HTMLVideoElement,
    input: Readonly<{ progress: number }>
  ) => {
    video.currentTime = input.progress * 2.467;
    Object.defineProperty(video, 'readyState', { configurable: true, value: 2 });
    Object.defineProperty(video, 'seeking', { configurable: true, value: false });
    return {
      status: 'ready' as const,
      runId: 'ttg:test',
      direction: 1 as const,
      generation: 1,
      targetTime: video.currentTime
    };
  })
}));

vi.mock('../../../media/timeline-video-driver', () => ({
  disposeTimelineVideoDriver: probe.disposeDriver,
  driveTimelineVideo: probe.driveFrame,
  prepareTimelineVideoFrame: probe.prepareFrame
}));

import { PhoneTtg } from './PhoneTtg';

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

describe('clean PhoneTtg leaf', () => {
  it('keeps one decoder, proves exact endpoint frames, and hard-retires only on dispose', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneTtg reports={mount.reports} />); });

    expect(mount.registration()?.surfaces.map(({ id, kind }) => [id, kind])).toEqual([
      ['ttg-figure-video', 'video']
    ]);
    expect(host.querySelectorAll('[data-ttg-figure-video]')).toHaveLength(1);

    const current = reportFixture();
    mount.registration()?.commands.rebind({
      reports: current.reports,
      frameToken: 'ttg:frame:2'
    });
    mount.registration()?.commands.render(1);
    const video = host.querySelector('video');
    if (!(video instanceof HTMLVideoElement)) throw new Error('missing TTG video');
    video.currentTime = 0;
    Object.defineProperty(video, 'readyState', { configurable: true, value: 2 });
    Object.defineProperty(video, 'seeking', { configurable: true, value: false });
    expect(current.reports.reportPrepared).not.toHaveBeenCalled();

    await act(async () => {
      mount.registration()?.commands.settle(1);
      await Promise.resolve();
    });
    expect(current.reports.reportPrepared).toHaveBeenCalledWith(
      'ttg-figure-video', expect.objectContaining({
        kind: 'video-decoded', token: 'ttg:frame:2', ready: true
      })
    );

    mount.registration()?.commands.render(.5);
    expect(probe.driveFrame).toHaveBeenCalledWith(video, expect.objectContaining({
      progress: .5,
      runId: expect.stringContaining('ttg:frame:2')
    }));
    const preparationCount = probe.prepareFrame.mock.calls.length;
    mount.registration()?.commands.pause('outside-closure');
    expect(video.querySelector('source')?.getAttribute('src')).not.toBeNull();
    Object.defineProperty(video, 'readyState', { configurable: true, value: 1 });
    const recovered = reportFixture();
    await act(async () => {
      mount.registration()?.commands.rebind({
        reports: recovered.reports,
        frameToken: 'ttg:frame:3'
      });
      await Promise.resolve();
    });
    expect(probe.prepareFrame).toHaveBeenCalledTimes(preparationCount + 1);
    expect(probe.prepareFrame).toHaveBeenLastCalledWith(
      video, expect.objectContaining({ progress: 1 })
    );
    expect(recovered.reports.reportPrepared).toHaveBeenCalledWith(
      'ttg-figure-video', expect.objectContaining({
        kind: 'video-decoded', token: 'ttg:frame:3', ready: true
      })
    );
    mount.registration()?.commands.dispose('closure-retired');
    expect(video.querySelector('source')?.getAttribute('src')).toBeNull();
    expect(probe.disposeDriver).toHaveBeenCalled();
    act(() => root.unmount());
  });
});
