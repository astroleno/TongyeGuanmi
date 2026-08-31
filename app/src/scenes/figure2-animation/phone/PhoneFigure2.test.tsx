// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  PhoneLeafMountRegistration,
  PhoneLeafReportPort
} from '../../../production/phone-story/presentation';
import type { VideoFrameMap } from '../../../media/frame-timebase';

type SurfaceProbeOptions = Readonly<{
  canvas?: HTMLCanvasElement;
  onCanvasRenewed?(canvas: HTMLCanvasElement): void;
  onFailure?(failure: Readonly<{ code: string; message: string; generation: number }>): void;
  onFrame?(frame: Readonly<{ canvas: HTMLCanvasElement; generation: number }>): void;
}>;

type SurfaceProbeRequest = Readonly<{
  runId: string;
  sequence: number;
  desiredProgress: number;
  frameMap: VideoFrameMap;
}>;

const probe = vi.hoisted(() => ({
  surfaceOptions: null as null | SurfaceProbeOptions,
  activeCanvas: null as HTMLCanvasElement | null,
  activeGeneration: 0,
  activate: vi.fn(() => 1), renderSurface: vi.fn(() => true),
  probeSurface: vi.fn(() => true),
  setMode: vi.fn(),
  presentFrame: vi.fn(async (request: SurfaceProbeRequest) => {
    const { frameMap } = request;
    const progress = Math.min(1, Math.max(0, request.desiredProgress));
    const desiredFrameIndex = progress === 0
      ? frameMap.startFrame
      : progress === 1
        ? frameMap.endFrame
        : Math.round(frameMap.startFrame + progress * (frameMap.endFrame - frameMap.startFrame));
    const canvas = probe.activeCanvas ?? probe.surfaceOptions?.canvas;
    if (canvas) probe.surfaceOptions?.onFrame?.({ canvas, generation: probe.activeGeneration });
    return {
      status: 'presented' as const,
      runId: request.runId,
      sequence: request.sequence,
      desiredFrameIndex,
      presentedFrameIndex: desiredFrameIndex,
      mediaTimeSeconds: desiredFrameIndex / frameMap.fpsNumerator * frameMap.fpsDenominator,
      presentedProgress: progress,
      evidence: 'packed-canvas-draw' as const,
      canvas: canvas!,
      generation: probe.activeGeneration
    };
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
    probe.surfaceOptions = options as unknown as SurfaceProbeOptions;
    return {
      activate: probe.activate, probe: probe.probeSurface, render: probe.renderSurface,
      presentFrame: probe.presentFrame, setMode: probe.setMode,
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
  beforeEach(() => {
    probe.surfaceOptions = null;
    probe.activeCanvas = null;
    probe.activeGeneration = 0;
    probe.activate.mockReset().mockImplementation(() => {
      probe.activeCanvas = probe.surfaceOptions?.canvas ?? null;
      probe.activeGeneration = 1;
      return probe.activeGeneration;
    });
    probe.renderSurface.mockReset().mockReturnValue(true);
    probe.probeSurface.mockReset().mockReturnValue(true);
    probe.setMode.mockReset();
    probe.presentFrame.mockReset().mockImplementation(async (request: SurfaceProbeRequest) => {
      const { frameMap } = request;
      const progress = Math.min(1, Math.max(0, request.desiredProgress));
      const desiredFrameIndex = progress === 0
        ? frameMap.startFrame
        : progress === 1
          ? frameMap.endFrame
          : Math.round(frameMap.startFrame + progress * (frameMap.endFrame - frameMap.startFrame));
      const canvas = probe.activeCanvas ?? probe.surfaceOptions?.canvas;
      if (canvas) probe.surfaceOptions?.onFrame?.({ canvas, generation: probe.activeGeneration });
      return {
        status: 'presented' as const,
        runId: request.runId,
        sequence: request.sequence,
        desiredFrameIndex,
        presentedFrameIndex: desiredFrameIndex,
        mediaTimeSeconds: desiredFrameIndex / frameMap.fpsNumerator * frameMap.fpsDenominator,
        presentedProgress: progress,
        evidence: 'packed-canvas-draw' as const,
        canvas: canvas!,
        generation: probe.activeGeneration
      };
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

  it('leaves the Shell-owned retained arch out of the scene-private mount', async () => {
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
    expect(mount.registration()?.surfaces.map(({ id }) => id))
      .not.toContain('figure2-foreground-arch');
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

  it('keeps staged holds at the endpoint and presents forward/reverse media frames exactly', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause');
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneFigure2 reports={mount.reports} />); });
    const commands = mount.registration()!.commands;
    const video = host.querySelector<HTMLVideoElement>('[data-figure2-combined-video]')!;
    const forwardToken = 'figure2:stage:forward:0';
    const forwardTransaction = 'figure2:forward';
    commands.rebind({
      reports: mount.reports, frameToken: forwardToken, transactionId: forwardTransaction,
      segmentId: 'figure2-distance-expand', stageIndex: 0, direction: 'forward'
    });
    const forward = commands.activate({
      invocationId: 'figure2:stage:forward', surfaceIds: ['figure2-pair-video'],
      credit: 'physical-epoch', playback: true,
      runToken: forwardTransaction, direction: 'forward', stageIndex: 0
    });
    await act(async () => {
      await Promise.all(forward.settlements.flatMap((settlement) => (
        settlement.status === 'pending' ? [settlement.settled] : []
      )));
    });
    const mediaTimeBeforeRender = video.currentTime;
    commands.setMediaPhase?.({ phase: 'playing', runToken: forwardTransaction, direction: 'forward', stageIndex: 0 });
    commands.render(.5);
    expect(video.currentTime).toBe(mediaTimeBeforeRender);
    expect(probe.presentFrame).not.toHaveBeenCalled();
    const forwardReceipt = await commands.presentFrame?.({
      frameToken: forwardToken, transactionId: forwardTransaction, direction: 1,
      sequence: 1, desiredProgress: .5, signal: new AbortController().signal
    });
    expect(forwardReceipt).toMatchObject({
      status: 'presented', frameToken: forwardToken, presentedProgress: expect.closeTo(.5, 5)
    });
    expect(probe.presentFrame).toHaveBeenCalledWith(expect.objectContaining({
      runId: forwardTransaction, direction: 1, desiredProgress: .5,
      frameMap: expect.objectContaining({ startFrame: 0, endFrame: 78 })
    }));
    commands.setMediaPhase?.({ phase: 'held', runToken: forwardTransaction, direction: 'forward', stageIndex: 0 });
    expect(video.paused).toBe(true);

    commands.rebind({
      reports: mount.reports, frameToken: 'figure2:stage:forward:1', transactionId: 'figure2:held',
      segmentId: 'figure2-distance-expand', stageIndex: 1, direction: 'forward'
    });
    commands.setMediaPhase?.({ phase: 'primed', runToken: 'figure2:held', direction: 'forward', stageIndex: 1 });
    expect(video.paused).toBe(true);
    expect(video.currentTime).toBeCloseTo(2.6, 1);

    const reverseToken = 'figure2:stage:reverse:1';
    const reverseTransaction = 'figure2:reverse';
    commands.rebind({
      reports: mount.reports, frameToken: reverseToken, transactionId: reverseTransaction,
      segmentId: 'figure2-distance-expand', stageIndex: 1, direction: 'reverse'
    });
    const reverse = commands.activate({
      invocationId: 'figure2:stage:reverse', surfaceIds: ['figure2-pair-video'],
      credit: 'physical-epoch', playback: true, direction: 'reverse',
      runToken: reverseTransaction, stageIndex: 1
    });
    expect(reverse.settlements).toEqual([{ surfaceId: 'figure2-pair-video', status: 'fulfilled' }]);
    const playsBeforeReverseFrame = play.mock.calls.length;
    const reverseReceipt = await commands.presentFrame?.({
      frameToken: reverseToken, transactionId: reverseTransaction, direction: -1,
      sequence: 1, desiredProgress: .25, signal: new AbortController().signal
    });
    expect(reverseReceipt).toMatchObject({
      status: 'presented', frameToken: reverseToken,
      presentedProgress: expect.closeTo(1 - 58 / 77, 5)
    });
    expect(probe.presentFrame).toHaveBeenLastCalledWith(expect.objectContaining({
      runId: reverseTransaction, direction: -1, desiredProgress: .75,
      frameMap: expect.objectContaining({ startFrame: 78, endFrame: 155 })
    }));
    expect(play.mock.calls.length).toBe(playsBeforeReverseFrame);
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
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
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
      transactionId: 'figure2:reverse-depth',
      segmentId: 'figure2-distance-expand',
      stageIndex: 0,
      direction: 'reverse'
    });

    const activation = commands.activate({
      invocationId: 'figure2:reverse-depth:activation',
      surfaceIds: ['figure2-pair-video'], credit: 'physical-epoch', direction: 'reverse',
      playback: true, runToken: 'figure2:reverse-depth'
    });
    expect(play).not.toHaveBeenCalled();
    expect(activation.settlements).toEqual([
      { surfaceId: 'figure2-pair-video', status: 'fulfilled' }
    ]);
    commands.setMediaPhase?.({ phase: 'primed', runToken: 'figure2:reverse-depth', direction: 'reverse', stageIndex: 0 });
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

    commands.setMediaPhase?.({ phase: 'primed', runToken: 'figure2:reverse-depth', direction: 'reverse', stageIndex: 0 });
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

  it('presents reverse media targets from the retained endpoint without native playback', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneFigure2 reports={mount.reports} />); });
    const commands = mount.registration()!.commands;
    commands.rebind({
      reports: mount.reports,
      frameToken: 'figure2:reverse-resume:media',
      transactionId: 'figure2:reverse-resume',
      segmentId: 'figure2-distance-expand',
      stageIndex: 1,
      direction: 'reverse'
    });
    const activation = commands.activate({
      invocationId: 'figure2:reverse-resume:activation',
      surfaceIds: ['figure2-pair-video'], credit: 'physical-epoch', direction: 'reverse',
      playback: true, runToken: 'figure2:reverse-resume', stageIndex: 1
    });
    expect(activation.settlements).toEqual([
      { surfaceId: 'figure2-pair-video', status: 'fulfilled' }
    ]);
    const playsBeforeReverseMedia = play.mock.calls.length;
    const targets = [1, .5, 0] as const;
    const receipts = await Promise.all(targets.map((desiredProgress, index) => (
      commands.presentFrame?.({
        frameToken: 'figure2:reverse-resume:media',
        transactionId: 'figure2:reverse-resume', direction: -1,
        sequence: index + 1, desiredProgress,
        signal: new AbortController().signal
      })
    )));
    expect(receipts.every((receipt) => receipt?.status === 'presented')).toBe(true);
    expect(probe.presentFrame.mock.calls.map(([request]) => request.desiredProgress))
      .toEqual([0, .5, 1]);
    expect(play.mock.calls.length).toBe(playsBeforeReverseMedia);
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
