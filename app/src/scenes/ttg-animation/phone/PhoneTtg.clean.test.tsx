// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  TIMELINE_VIDEO_PRESENTATION_TOLERANCE_SECONDS: .05,
  disposeTimelineVideoDriver: probe.disposeDriver,
  driveTimelineVideo: probe.driveFrame,
  prepareTimelineVideoFrame: probe.prepareFrame
}));

import { PhoneTtg, phoneTtgHasReusableEndpointFrame } from './PhoneTtg';

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
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

    mount.registration()?.commands.setMediaPhase?.({
      phase: 'playing', runToken: 'ttg:frame:2', direction: 'forward', stageIndex: 0
    });
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
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

  it('accepts the driver-owned causal endpoint before Chromium clears seeking', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    probe.prepareFrame.mockImplementationOnce(async (video: HTMLVideoElement) => {
      video.currentTime = 2.467;
      Object.defineProperty(video, 'readyState', { configurable: true, value: 2 });
      Object.defineProperty(video, 'seeking', { configurable: true, value: true });
      return {
        status: 'ready' as const, runId: 'ttg:causal', direction: 1 as const,
        generation: 1, targetTime: video.currentTime
      };
    });
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneTtg reports={mount.reports} />); });
    const current = reportFixture();
    mount.registration()?.commands.rebind({
      reports: current.reports, frameToken: 'ttg:causal:1'
    });

    await act(async () => {
      mount.registration()?.commands.settle(1);
      await Promise.resolve();
    });

    expect(current.reports.reportPrepared).toHaveBeenCalledWith(
      'ttg-figure-video', expect.objectContaining({
        kind: 'video-decoded', token: 'ttg:causal:1', ready: true
      })
    );
    act(() => root.unmount());
  });

  it('gives synchronous activation sole ownership of paused rebind preparation', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneTtg reports={mount.reports} />); });

    const first = reportFixture();
    mount.registration()?.commands.rebind({
      reports: first.reports,
      frameToken: 'ttg:activation-owner:1'
    });
    mount.registration()?.commands.render(1);
    mount.registration()?.commands.pause('superseded');
    const video = host.querySelector('video');
    if (!(video instanceof HTMLVideoElement)) throw new Error('missing TTG video');
    delete video.dataset.phoneTtgEndpointReady;
    delete video.dataset.phoneGroup45FrameReady;
    probe.prepareFrame.mockClear();

    const renewed = reportFixture();
    let invocation: ReturnType<PhoneLeafMountRegistration['commands']['activate']> | undefined;
    await act(async () => {
      mount.registration()?.commands.rebind({
        reports: renewed.reports,
        frameToken: 'ttg:activation-owner:2'
      });
      invocation = mount.registration()?.commands.activate({
        invocationId: 'ttg:activation-owner:invocation',
        surfaceIds: ['ttg-figure-video'],
        credit: 'physical-epoch', playback: false
      });
      await Promise.all(invocation?.settlements.flatMap((settlement) => (
        settlement.status === 'pending' ? [settlement.settled] : []
      )) ?? []);
    });

    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
    expect(probe.prepareFrame).toHaveBeenCalledOnce();
    expect(renewed.reports.reportPrepared).toHaveBeenCalledWith(
      'ttg-figure-video', expect.objectContaining({
        kind: 'video-decoded', token: 'ttg:activation-owner:2', ready: true
      })
    );
    act(() => root.unmount());
  });

  it('rejects a stale activation settlement instead of fulfilling it', async () => {
    let releasePlayback: () => void = () => undefined;
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => (
      new Promise<void>((resolve) => { releasePlayback = resolve; })
    ));
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneTtg reports={mount.reports} />); });
    const current = reportFixture();
    mount.registration()?.commands.rebind({
      reports: current.reports,
      frameToken: 'ttg:stale-activation:1'
    });
    const invocation = mount.registration()?.commands.activate({
      invocationId: 'ttg:stale-activation:invocation',
      surfaceIds: ['ttg-figure-video'],
      credit: 'physical-epoch', playback: false
    });
    const settlement = invocation?.settlements[0];
    if (!settlement || settlement.status !== 'pending') {
      throw new Error('missing TTG stale activation settlement');
    }

    mount.registration()?.commands.pause('outside-closure');
    releasePlayback();

    await expect(settlement.settled).rejects.toThrow(
      'TTG activation was superseded before frame preparation'
    );
    expect(current.reports.reportPrepared).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it('rejects activation replaced while its causal frame promise is pending', async () => {
    let releaseFrame: () => void = () => undefined;
    probe.prepareFrame.mockImplementationOnce((video: HTMLVideoElement) => (
      new Promise((resolve) => {
        releaseFrame = () => resolve({
          status: 'ready' as const,
          runId: 'ttg:pending-activation',
          direction: 1 as const,
          generation: 1,
          targetTime: video.currentTime
        });
      })
    ));
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneTtg reports={mount.reports} />); });
    const current = reportFixture();
    mount.registration()?.commands.rebind({
      reports: current.reports,
      frameToken: 'ttg:pending-activation:1'
    });
    const invocation = mount.registration()?.commands.activate({
      invocationId: 'ttg:pending-activation:invocation',
      surfaceIds: ['ttg-figure-video'],
      credit: 'physical-epoch', playback: false
    });
    const settlement = invocation?.settlements[0];
    if (!settlement || settlement.status !== 'pending') {
      throw new Error('missing TTG pending activation settlement');
    }
    await Promise.resolve();
    expect(probe.prepareFrame).toHaveBeenCalledOnce();

    mount.registration()?.commands.pause('outside-closure');
    releaseFrame();

    await expect(settlement.settled).rejects.toThrow(
      'TTG activation was superseded before frame preparation'
    );
    expect(current.reports.reportPrepared).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it('accepts a driver-owned start proof after the physical playhead drifts past the retained boundary', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    probe.prepareFrame.mockImplementationOnce(async (video: HTMLVideoElement) => {
      video.currentTime = .051;
      Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
      Object.defineProperty(video, 'seeking', { configurable: true, value: true });
      return {
        status: 'ready' as const, runId: 'ttg:webkit-start', direction: 1 as const,
        generation: 1, targetTime: 0
      };
    });
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneTtg reports={mount.reports} />); });
    const current = reportFixture();
    mount.registration()?.commands.rebind({
      reports: current.reports, frameToken: 'ttg:webkit-start:1'
    });

    const invocation = mount.registration()?.commands.activate({
      invocationId: 'ttg:webkit-start:activate:1',
      surfaceIds: ['ttg-figure-video'], credit: 'physical-epoch', playback: false
    });
    await act(async () => {
      await Promise.all(invocation?.settlements.flatMap((settlement) => (
        settlement.status === 'pending' ? [settlement.settled] : []
      )) ?? []);
    });

    expect(current.reports.reportPrepared).toHaveBeenCalledWith(
      'ttg-figure-video', expect.objectContaining({
        kind: 'video-decoded', token: 'ttg:webkit-start:1', ready: true
      })
    );
    const video = host.querySelector('video');
    if (!(video instanceof HTMLVideoElement)) throw new Error('missing TTG video');
    expect(phoneTtgHasReusableEndpointFrame(video, 0)).toBe(false);
    act(() => root.unmount());
  });
});
