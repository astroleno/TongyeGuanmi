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
    input: Readonly<{ progress: number; runId: string; direction: 1 | -1 }>
  ) => {
    const presentedFrameIndex = Math.round(
      Math.min(1, Math.max(0, input.progress)) * 74
    );
    const mediaTimeSeconds = presentedFrameIndex / 30;
    video.currentTime = mediaTimeSeconds;
    Object.defineProperty(video, 'readyState', { configurable: true, value: 2 });
    Object.defineProperty(video, 'seeking', { configurable: true, value: false });
    return {
      status: 'ready' as const,
      runId: input.runId,
      direction: input.direction,
      generation: 1,
      targetTime: mediaTimeSeconds,
      targetFrameIndex: presentedFrameIndex,
      presentedFrameIndex,
      mediaTimeSeconds,
      evidence: 'video-frame-callback' as const
    };
  }),
  createClock: vi.fn()
}));

vi.mock('../../../media/timeline-video-driver', () => ({
  TIMELINE_VIDEO_PRESENTATION_TOLERANCE_SECONDS: .05,
}));

vi.mock('../../../media/strict-timeline-video-driver', () => ({
  clampProgress: (value: number) => Math.min(1, Math.max(0, value)),
  disposeStrictTimelineVideoDriver: probe.disposeDriver,
  disposeTimelineVideoDriver: probe.disposeDriver,
  prepareTimelineVideoFrame: probe.prepareFrame,
  createVideoPresentedFrameClock: probe.createClock
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
    probe.createClock.mockImplementation((video: HTMLVideoElement) => ({
      request: vi.fn(async (input: Readonly<{
        runId: string;
        direction: 1 | -1;
        sequence: number;
        desiredProgress: number;
      }>) => {
        const frame = await probe.prepareFrame(video, {
          progress: input.desiredProgress,
          runId: input.runId,
          direction: input.direction
        });
        const desiredFrameIndex = Math.round(
          Math.min(1, Math.max(0, input.desiredProgress)) * 74
        );
        return {
          status: frame.status === 'ready' && frame.presentedFrameIndex === desiredFrameIndex
            ? 'presented' as const : 'stale' as const,
          runId: input.runId,
          sequence: input.sequence,
          desiredFrameIndex,
          presentedFrameIndex: frame.presentedFrameIndex,
          mediaTimeSeconds: frame.mediaTimeSeconds,
          presentedProgress: frame.presentedFrameIndex / 74,
          evidence: 'video-frame-callback' as const
        };
      }),
      snapshot: vi.fn(() => ({})),
      dispose: probe.disposeDriver
    }));
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
    expect(probe.driveFrame).not.toHaveBeenCalled();
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

  it('keeps the live presenter reusable across held and playing phases', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneTtg reports={mount.reports} />); });

    const commands = mount.registration()!.commands;
    commands.rebind({ reports: mount.reports, frameToken: 'ttg:held-playing:1' });
    commands.setMediaPhase?.({
      phase: 'held', runToken: 'ttg:held-playing', direction: 'forward', stageIndex: 0
    });

    expect(probe.disposeDriver).not.toHaveBeenCalled();
    commands.setMediaPhase?.({
      phase: 'playing', runToken: 'ttg:held-playing', direction: 'forward', stageIndex: 0
    });
    const receipt = await commands.presentFrame?.({
      frameToken: 'ttg:held-playing:1',
      transactionId: 'ttg:held-playing:transaction',
      direction: 1,
      sequence: 1,
      desiredProgress: 0,
      signal: new AbortController().signal
    });
    expect(receipt).toMatchObject({
      status: 'presented', frameToken: 'ttg:held-playing:1', sequence: 1,
      evidence: 'video-frame-callback'
    });
    act(() => root.unmount());
  });

  it('returns master progress while the terminal media frame is held through the dissolve tail', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneTtg reports={mount.reports} />); });
    const commands = mount.registration()!.commands;
    commands.render(.95);
    commands.rebind({
      reports: mount.reports,
      frameToken: 'ttg:lab-tail:1',
      transactionId: 'ttg:lab-tail',
      segmentId: 'ttg-lab',
      direction: 'forward',
      leg: 'source'
    });
    commands.setMediaPhase?.({
      phase: 'playing', runToken: 'ttg:lab-tail', direction: 'forward', stageIndex: 0
    });

    const receipt = await commands.presentFrame?.({
      frameToken: 'ttg:lab-tail:1',
      transactionId: 'ttg:lab-tail',
      direction: 1,
      sequence: 1,
      desiredProgress: .95,
      signal: new AbortController().signal
    });

    expect(receipt).toMatchObject({
      status: 'presented', presentedProgress: .95, presentedFrameIndex: 74
    });
    act(() => root.unmount());
  });

  it('accepts an exact RVFC endpoint proof even while the element is still seeking', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    probe.prepareFrame.mockImplementationOnce(async (
      video: HTMLVideoElement,
      input: Readonly<{ runId: string; direction: 1 | -1 }>
    ) => {
      video.currentTime = 74 / 30;
      Object.defineProperty(video, 'readyState', { configurable: true, value: 2 });
      Object.defineProperty(video, 'seeking', { configurable: true, value: true });
      return {
        status: 'ready' as const, runId: input.runId, direction: input.direction,
        generation: 1, targetTime: video.currentTime,
        targetFrameIndex: 74, presentedFrameIndex: 74,
        mediaTimeSeconds: video.currentTime,
        evidence: 'video-frame-callback' as const
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

  it('reuses a verified stable endpoint without another prime or preparation generation', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneTtg reports={mount.reports} />); });
    const commands = mount.registration()!.commands;
    commands.rebind({ reports: mount.reports, frameToken: 'ttg:stable:initial' });
    const incoming = commands.activate({
      invocationId: 'ttg:stable:activation', surfaceIds: ['ttg-figure-video'],
      credit: 'direct-muted-autoplay', runToken: 'ttg:stable', direction: 'forward'
    });
    await Promise.all(incoming.settlements.flatMap((settlement) => (
      settlement.status === 'pending' ? [settlement.settled] : []
    )));
    const video = host.querySelector<HTMLVideoElement>('[data-ttg-figure-video]')!;
    expect(phoneTtgHasReusableEndpointFrame(video, 0)).toBe(true);

    const play = vi.mocked(HTMLMediaElement.prototype.play);
    play.mockClear();
    probe.prepareFrame.mockClear();
    commands.rebind({ reports: mount.reports, frameToken: 'ttg:outgoing:retained' });
    const outgoing = commands.activate({
      invocationId: 'ttg:outgoing:retained', surfaceIds: ['ttg-figure-video'],
      credit: 'physical-epoch', runToken: 'ttg:outgoing:retained',
      direction: 'forward', playback: true
    });

    expect(outgoing.invoked).toBe(true);
    expect(outgoing.settlements).toEqual([
      { surfaceId: 'ttg-figure-video', status: 'fulfilled' }
    ]);
    expect(play).not.toHaveBeenCalled();
    expect(probe.prepareFrame).not.toHaveBeenCalled();
    expect(phoneTtgHasReusableEndpointFrame(video, 0)).toBe(true);
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
    probe.prepareFrame.mockImplementationOnce(() => (
      new Promise((resolve) => {
        releaseFrame = () => resolve({
          status: 'ready' as const,
          runId: 'ttg:pending-activation:invocation',
          direction: 1 as const,
          generation: 1,
          targetTime: 0,
          targetFrameIndex: 0,
          presentedFrameIndex: 0,
          mediaTimeSeconds: 0,
          evidence: 'video-frame-callback' as const
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
    probe.prepareFrame.mockImplementationOnce(async (
      video: HTMLVideoElement,
      input: Readonly<{ runId: string; direction: 1 | -1 }>
    ) => {
      video.currentTime = .051;
      Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
      Object.defineProperty(video, 'seeking', { configurable: true, value: true });
      return {
        status: 'ready' as const, runId: input.runId, direction: input.direction,
        generation: 1, targetTime: 0,
        targetFrameIndex: 0, presentedFrameIndex: 0,
        mediaTimeSeconds: 0,
        evidence: 'video-frame-callback' as const
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
