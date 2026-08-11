// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  PhoneLeafMountRegistration,
  PhoneLeafReportPort
} from '../../../production/phone-story/presentation';

const probe = vi.hoisted(() => ({
  surfaceOptions: null as null | Record<string, unknown>,
  activate: vi.fn(() => 1), renderSurface: vi.fn(() => true),
  probeSurface: vi.fn(() => true),
  driveTimelineVideo: vi.fn((video: HTMLVideoElement, input: { progress: number }) => {
    video.currentTime = input.progress * 2.6;
    return {};
  }),
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

vi.mock('../../../media/timeline-video-driver', () => ({
  driveTimelineVideo: probe.driveTimelineVideo
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
  beforeEach(() => {
    probe.surfaceOptions = null;
    probe.activate.mockReset().mockReturnValue(1);
    probe.renderSurface.mockReset().mockReturnValue(true);
    probe.probeSurface.mockReset().mockReturnValue(true);
    probe.driveTimelineVideo.mockReset().mockImplementation((video, input) => {
      video.currentTime = input.progress * 2.6;
      return {};
    });
    probe.release.mockReset();
    probe.disposeSurface.mockReset();
    probe.renderProgress.mockReset();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  });

  it('registers a decoded poster and packed pair while leaving the arch to presentation ownership', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneFigure2 reports={mount.reports} />); });
    expect(mount.registration()?.surfaces.map(({ id, kind }) => [id, kind])).toEqual([
      ['figure2-pair-video', 'video'],
      ['figure2-pair-poster', 'image'],
      ['figure2-pair-canvas', 'canvas-webgl']
    ]);
    expect(host.querySelector('[data-phone-figure2-poster]')).not.toBeNull();
    expect(host.querySelector('[data-stage-retained-figure2-arch="true"]')).toBeNull();
  });

  it('includes the shared presentation arch when the Shell has mounted it', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const story = document.createElement('main');
    story.className = 'phone-story';
    const arch = document.createElement('img');
    arch.setAttribute('data-stage-retained-figure2-arch', 'true');
    story.appendChild(arch);
    const host = document.createElement('div');
    story.appendChild(host);
    document.body.appendChild(story);
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneFigure2 reports={mount.reports} />); });
    expect(mount.registration()?.surfaces.map(({ id }) => id)).toContain('figure2-foreground-arch');
    act(() => root.unmount());
    story.remove();
  });

  it('does not borrow a retained arch from document scope without an owning Shell', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const arch = document.createElement('img');
    arch.setAttribute('data-stage-retained-figure2-arch', 'true');
    document.body.appendChild(arch);
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneFigure2 reports={mount.reports} />); });
    expect(mount.registration()?.surfaces.map(({ id }) => id))
      .not.toContain('figure2-foreground-arch');
    act(() => root.unmount());
    arch.remove();
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
      surfaceIds: ['figure2-pair-video'], credit: 'physical-epoch', playback: false
    });
    expect(invocation?.invoked).toBe(true);
    expect(current.reports.reportFrame).not.toHaveBeenCalled();
    await act(async () => {
      await Promise.all(invocation?.settlements.flatMap((settlement) => (
        settlement.status === 'pending' ? [settlement.settled] : []
      )) ?? []);
    });
    const canvas = host.querySelector<HTMLCanvasElement>('[data-figure2-packed-alpha-canvas]')!;
    (probe.surfaceOptions?.onFrame as (frame: { canvas: HTMLCanvasElement; generation: number }) => void)(
      { canvas, generation: 1 }
    );
    expect(current.reports.reportFrame).toHaveBeenCalledWith(
      'figure2-pair-canvas', expect.objectContaining({
        kind: 'frame', token: 'figure2:frame:1', presented: true
      })
    );
    expect(host.querySelector('.phone-figure2')?.getAttribute('data-phone-figure2-canvas-ready')).toBe('true');
    mount.registration()?.commands.render(.72);
    expect(probe.renderProgress).toHaveBeenCalled();
    mount.registration()?.commands.pause('rollback');
    expect(host.querySelector('.phone-figure2')?.getAttribute('data-phone-figure2-canvas-ready')).toBeNull();
    act(() => root.unmount());
  });

  it('settles the shared Figure2 arch at the requested choreography endpoint', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneFigure2 reports={mount.reports} />); });

    mount.registration()?.commands.settle(1);

    expect(probe.renderProgress).toHaveBeenLastCalledWith(expect.anything(), 1, expect.anything());
    act(() => root.unmount());
  });

  it('proves its static entry from the decoded poster without touching video playback', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneFigure2 reports={mount.reports} />); });
    const current = reportFixture();
    const commands = mount.registration()!.commands;
    commands.rebind({ reports: current.reports, frameToken: 'figure2:static:1' });

    expect(commands).not.toHaveProperty('prepare');
    const poster = host.querySelector<HTMLImageElement>('[data-phone-figure2-poster]');
    expect(poster).not.toBeNull();
    await act(async () => {
      poster?.dispatchEvent(new Event('load'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(current.reports.reportPrepared).toHaveBeenCalledWith(
      'figure2-pair-poster', expect.objectContaining({
        kind: 'image-decoded', ready: true,
        detail: expect.objectContaining({ posterDecoded: true })
      })
    );
    expect(probe.activate).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
  });

  it('pauses at 2.6 seconds for the depth leg and resumes only for the reverse media leg', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause');
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneFigure2 reports={mount.reports} />); });
    const commands = mount.registration()!.commands;
    const video = host.querySelector<HTMLVideoElement>('[data-figure2-combined-video]')!;
    commands.rebind({
      reports: mount.reports, frameToken: 'figure2:stage:forward:0',
      segmentId: 'figure2-distance-expand', stageIndex: 0, direction: 'forward'
    });
    const forward = commands.activate({
      invocationId: 'figure2:stage:forward', surfaceIds: ['figure2-pair-video'],
      credit: 'physical-epoch', playback: true,
      runToken: 'figure2:forward:stage0', direction: 'forward', stageIndex: 0
    });
    await act(async () => {
      await Promise.all(forward.settlements.flatMap((settlement) => (
        settlement.status === 'pending' ? [settlement.settled] : []
      )));
    });
    commands.setMediaPhase?.({ phase: 'playing', runToken: 'figure2:forward:stage0', direction: 'forward', stageIndex: 0 });
    commands.render(.5);
    expect(probe.driveTimelineVideo).toHaveBeenCalledWith(
      video, expect.objectContaining({ progress: .5, direction: 1 })
    );
    commands.render(1);
    commands.setMediaPhase?.({ phase: 'held', runToken: 'figure2:forward:stage0', direction: 'forward', stageIndex: 0 });
    expect(video.paused).toBe(true);
    expect(video.currentTime).toBeCloseTo(2.6, 1);

    commands.rebind({
      reports: mount.reports, frameToken: 'figure2:stage:forward:1',
      segmentId: 'figure2-distance-expand', stageIndex: 1, direction: 'forward'
    });
    commands.setMediaPhase?.({ phase: 'primed', runToken: 'figure2:forward:stage0', direction: 'forward', stageIndex: 1 });
    expect(video.paused).toBe(true);
    expect(video.currentTime).toBeCloseTo(2.6, 1);

    commands.rebind({
      reports: mount.reports, frameToken: 'figure2:stage:reverse:0',
      segmentId: 'figure2-distance-expand', stageIndex: 0, direction: 'reverse'
    });
    const reverse = commands.activate({
      invocationId: 'figure2:stage:reverse', surfaceIds: ['figure2-pair-video'],
      credit: 'physical-epoch', playback: true
    });
    await act(async () => {
      await Promise.all(reverse.settlements.flatMap((settlement) => (
        settlement.status === 'pending' ? [settlement.settled] : []
      )));
    });
    commands.setMediaPhase?.({ phase: 'primed', runToken: 'figure2:reverse:stage0', direction: 'reverse', stageIndex: 0 });
    expect(video.paused).toBe(true);
    expect(video.currentTime).toBeCloseTo(2.6, 1);
    const playsBeforeReverseMedia = play.mock.calls.length;
    commands.rebind({
      reports: mount.reports, frameToken: 'figure2:stage:reverse:1',
      segmentId: 'figure2-distance-expand', stageIndex: 1, direction: 'reverse'
    });
    commands.setMediaPhase?.({ phase: 'primed', runToken: 'figure2:reverse:stage0', direction: 'reverse', stageIndex: 1 });
    commands.setMediaPhase?.({ phase: 'playing', runToken: 'figure2:reverse:stage0', direction: 'reverse', stageIndex: 1 });
    commands.render(0);
    expect(play.mock.calls.length).toBe(playsBeforeReverseMedia);
    expect(probe.driveTimelineVideo).toHaveBeenCalled();
    expect(pause).toHaveBeenCalled();
    act(() => root.unmount());
  });

  it('does not request a second native play when Figure2 formally enters its media phase', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneFigure2 reports={mount.reports} />); });
    const commands = mount.registration()!.commands;
    commands.rebind({
      reports: mount.reports, frameToken: 'figure2:clock-owner:1',
      segmentId: 'figure2-distance-expand', stageIndex: 0, direction: 'forward'
    });
    const invocation = commands.activate({
      invocationId: 'figure2:clock-owner:activation',
      surfaceIds: ['figure2-pair-video'], credit: 'physical-epoch', playback: true,
      runToken: 'figure2:clock-owner:run', direction: 'forward', stageIndex: 0
    });
    await act(async () => {
      await Promise.all(invocation.settlements.flatMap((settlement) => (
        settlement.status === 'pending' ? [settlement.settled] : []
      )));
    });
    const primeCalls = play.mock.calls.length;
    commands.setMediaPhase?.({
      phase: 'playing', runToken: 'figure2:clock-owner:run',
      direction: 'forward', stageIndex: 0
    });
    expect(play.mock.calls.length).toBe(primeCalls);
    act(() => root.unmount());
  });

  it('keeps reverse depth warmup hidden until the paused endpoint is reproved', async () => {
    let resolvePlay: () => void = () => undefined;
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => (
      new Promise<void>((resolve) => { resolvePlay = resolve; })
    ));
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneFigure2 reports={mount.reports} />); });
    const commands = mount.registration()!.commands;
    const scene = host.querySelector<HTMLElement>('.phone-figure2')!;
    const video = host.querySelector<HTMLVideoElement>('[data-figure2-combined-video]')!;
    scene.dataset.phoneFigure2CanvasReady = 'true';
    commands.rebind({
      reports: mount.reports,
      frameToken: 'figure2:reverse-depth:hidden',
      segmentId: 'figure2-distance-expand',
      stageIndex: 0,
      direction: 'reverse'
    });

    const activation = commands.activate({
      invocationId: 'figure2:reverse-depth:activation',
      surfaceIds: ['figure2-pair-video'], credit: 'physical-epoch', direction: 'reverse',
      playback: true
    });
    expect(play).not.toHaveBeenCalled();
    commands.setMediaPhase?.({ phase: 'primed', runToken: 'figure2:reverse-depth:activation', direction: 'reverse', stageIndex: 0 });
    expect(scene.hasAttribute('data-phone-figure2-canvas-ready')).toBe(false);

    video.currentTime = 2.4;
    (probe.surfaceOptions?.onFrame as ((frame: {
      canvas: HTMLCanvasElement;
      generation: number;
    }) => void) | undefined)?.({
      canvas: host.querySelector<HTMLCanvasElement>('[data-figure2-packed-alpha-canvas]')!,
      generation: 1
    });
    expect(scene.hasAttribute('data-phone-figure2-canvas-ready')).toBe(false);
    expect(mount.reports.reportFrame).not.toHaveBeenCalled();

    await act(async () => {
      resolvePlay();
      await Promise.all(activation.settlements.flatMap((settlement) => (
        settlement.status === 'pending' ? [settlement.settled] : []
      )));
    });
    commands.setMediaPhase?.({ phase: 'primed', runToken: 'figure2:reverse-depth:activation', direction: 'reverse', stageIndex: 0 });
    expect(video.currentTime).toBeCloseTo(2.6, 1);

    (probe.surfaceOptions?.onFrame as ((frame: {
      canvas: HTMLCanvasElement;
      generation: number;
    }) => void) | undefined)?.({
      canvas: host.querySelector<HTMLCanvasElement>('[data-figure2-packed-alpha-canvas]')!,
      generation: 1
    });
    expect(scene.dataset.phoneFigure2CanvasReady).toBe('true');
    expect(mount.reports.reportFrame).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it('seeks the reverse media leg from 2.6 seconds to zero without native playback', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneFigure2 reports={mount.reports} />); });
    const commands = mount.registration()!.commands;
    commands.rebind({
      reports: mount.reports,
      frameToken: 'figure2:reverse-resume:hold',
      segmentId: 'figure2-distance-expand',
      stageIndex: 0,
      direction: 'reverse'
    });
    const activation = commands.activate({
      invocationId: 'figure2:reverse-resume:activation',
      surfaceIds: ['figure2-pair-video'], credit: 'physical-epoch', direction: 'reverse',
      playback: true
    });
    await act(async () => {
      await Promise.all(activation.settlements.flatMap((settlement) => (
        settlement.status === 'pending' ? [settlement.settled] : []
      )));
    });
    commands.setMediaPhase?.({ phase: 'primed', runToken: 'figure2:reverse-resume:activation', direction: 'reverse', stageIndex: 0 });
    await act(async () => {
      commands.rebind({
        reports: mount.reports,
        frameToken: 'figure2:reverse-resume:media',
        segmentId: 'figure2-distance-expand',
        stageIndex: 1,
        direction: 'reverse'
      });
      const playsBeforeReverseMedia = play.mock.calls.length;
      commands.setMediaPhase?.({ phase: 'playing', runToken: 'figure2:reverse-resume:media', direction: 'reverse', stageIndex: 1 });
      // The reverse runtime drives the target progress from the closing
      // endpoint back to the opening endpoint.
      commands.render(1);
      commands.render(.5);
      commands.render(0);
      expect(play.mock.calls.length).toBe(playsBeforeReverseMedia);
    });

    expect(probe.driveTimelineVideo).toHaveBeenCalledTimes(3);
    expect(probe.driveTimelineVideo.mock.calls.map(([, input]) => input.progress))
      .toEqual([1, .5, 0]);
    const video = host.querySelector<HTMLVideoElement>('[data-figure2-combined-video]')!;
    expect(video.currentTime).toBeCloseTo(0, 3);
    expect(mount.reports.reportFailure).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it('keeps a transient reactivation repaint miss non-terminal until a causal frame', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    probe.renderSurface.mockReset().mockReturnValue(false);
    probe.probeSurface.mockReset().mockReturnValueOnce(true).mockReturnValue(false);
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
      surfaceIds: ['figure2-pair-video'], credit: 'physical-epoch', playback: false
    });
    const settlement = invocation?.settlements[0];
    expect(settlement?.status).toBe('pending');
    if (settlement?.status === 'pending') await expect(settlement.settled).resolves.toBeUndefined();
    const probesBeforeRender = probe.probeSurface.mock.calls.length;
    mount.registration()?.commands.render(.4);

    expect(probe.probeSurface.mock.calls.length).toBe(probesBeforeRender + 1);
    expect(probe.renderSurface).not.toHaveBeenCalled();
    expect(current.reports.reportFailure).not.toHaveBeenCalled();
  });
});
