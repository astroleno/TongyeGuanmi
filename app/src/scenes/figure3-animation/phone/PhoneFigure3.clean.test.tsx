// @vitest-environment jsdom

import { act, createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  PhoneLeafMountRegistration,
  PhoneLeafReportPort
} from '../../../production/phone-story/presentation';

const probe = vi.hoisted(() => ({
  compositorOptions: null as null | Record<string, unknown>,
  paint: vi.fn(() => true),
  disposeCompositor: vi.fn(),
  prepareFrame: vi.fn(async (
    video: HTMLVideoElement,
    input: Readonly<{ progress: number; runId: string; direction: 1 | -1 }>
  ) => {
    const presentedFrameIndex = Math.round(
      Math.min(1, Math.max(0, input.progress)) * 77
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
  disposeDriver: vi.fn(),
  createClock: vi.fn(),
  renderProgress: vi.fn()
}));

vi.mock('..', () => ({
  FIGURE3_END_SECONDS: 2.567,
  FIGURE3_FRAME_MAP: {
    fpsNumerator: 30, fpsDenominator: 1, firstPtsSeconds: 0,
    frameCount: 78, startFrame: 0, endFrame: 77
  },
  FIGURE3_MEDIA_KEY: 'figure3-motion',
  figure3MediaProgressForRawProgress: (progress: number) => (
    .78 * progress + .22 * progress * progress
  ),
  figure3MediaProgressForFrame: (frameIndex: number) => frameIndex / 77,
  figure3AnimationScene: {
    Component: ({ registerHandle }: {
      registerHandle(name: string, element: HTMLElement | null): void;
    }) => createElement('article', {
      ref: (element: HTMLElement | null) => registerHandle('field', element),
      'data-r4-scene': 'figure3-animation'
    }, createElement('video', {
      ref: (element: HTMLVideoElement | null) => registerHandle('figure3-video', element),
      'data-figure3-alpha-video': true,
      'data-media-key': 'figure3-motion',
      muted: true,
      playsInline: true
    }, createElement('source', {
      src: '/assets/figure3-motion.webm',
      type: 'video/webm'
    })))
  },
  renderFigure3AnimationProgress: probe.renderProgress
}));

vi.mock('../../../media/strict-timeline-video-driver', () => ({
  clampProgress: (value: number) => Math.min(1, Math.max(0, value)),
  disposeStrictTimelineVideoDriver: probe.disposeDriver,
  disposeTimelineVideoDriver: probe.disposeDriver,
  prepareTimelineVideoFrame: probe.prepareFrame,
  createVideoPresentedFrameClock: probe.createClock
}));

vi.mock('./paper-compositor', () => ({
  createPhoneFigure3PaperCompositor: vi.fn((options: Record<string, unknown>) => {
    probe.compositorOptions = options;
    probe.paint.mockImplementation(() => {
      const canvas = options.canvas as HTMLCanvasElement | undefined;
      if (canvas) canvas.dataset.phoneFigure3PaperFrame = 'ready';
      (options.onFrame as (() => void) | undefined)?.();
      (options.onPresentedFrame as (() => void) | undefined)?.();
      return true;
    });
    return { paint: probe.paint, dispose: probe.disposeCompositor };
  }),
  releasePhoneFigure3PaperCanvas: vi.fn()
}));

import {
  PHONE_FIGURE3_ENDPOINT_POSTER_FALLBACK_MS,
  PhoneFigure3,
  phoneFigure3HasReusableEndpointFrame,
  releasePhoneFigure3Video
} from './PhoneFigure3';

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

describe('clean PhoneFigure3 leaf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    probe.createClock.mockImplementation((video: HTMLVideoElement) => {
      let disposed = false;
      const request = vi.fn(async (input: Readonly<{
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
          Math.min(1, Math.max(0, input.desiredProgress)) * 77
        );
        if (disposed) {
          return {
            status: 'stale' as const,
            runId: input.runId,
            sequence: input.sequence,
            desiredFrameIndex,
            presentedFrameIndex: -1,
            mediaTimeSeconds: Number.NaN,
            presentedProgress: input.desiredProgress,
            evidence: 'runtime' as const
          };
        }
        return {
          status: frame.status === 'ready' && frame.presentedFrameIndex === desiredFrameIndex
            ? 'presented' as const : 'stale' as const,
          runId: input.runId,
          sequence: input.sequence,
          desiredFrameIndex,
          presentedFrameIndex: frame.presentedFrameIndex,
          mediaTimeSeconds: frame.mediaTimeSeconds,
          presentedProgress: frame.presentedFrameIndex / 77,
          evidence: 'video-frame-callback' as const
        };
      });
      return {
        request,
        snapshot: vi.fn(() => ({})),
        dispose: () => {
          disposed = true;
          probe.disposeDriver();
        }
      };
    });
  });

  it('keeps the Figure3 media source usable through StrictMode effect replay', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();

    await act(async () => {
      root.render(<StrictMode><PhoneFigure3 reports={mount.reports} /></StrictMode>);
    });

    const source = host.querySelector('video source');
    expect(source?.getAttribute('src')).toBe('/assets/figure3-motion.webm');
    const current = reportFixture();
    mount.registration()?.commands.rebind({
      reports: current.reports,
      frameToken: 'figure3:strict-mode:1',
      segmentId: 'figure3-services'
    });
    const invocation = mount.registration()?.commands.activate({
      invocationId: 'figure3:strict-mode:activation',
      surfaceIds: ['figure3-video'],
      credit: 'physical-epoch',
      playback: true
    });
    await act(async () => {
      await Promise.all(invocation?.settlements.flatMap((settlement) => (
        settlement.status === 'pending' ? [settlement.settled] : []
      )) ?? []);
    });

    expect(invocation?.invoked).toBe(true);
    expect(probe.prepareFrame).toHaveBeenCalledOnce();
    expect(current.reports.reportFailure).not.toHaveBeenCalled();
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    expect(source?.getAttribute('src')).toBeNull();
  });

  it('restores sources after a retired generation leaves the retained video node parked', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneFigure3 reports={mount.reports} />); });

    const video = host.querySelector<HTMLVideoElement>('video');
    const source = host.querySelector<HTMLSourceElement>('video source');
    if (!video || !source) throw new Error('missing Figure3 media source');
    releasePhoneFigure3Video(video);
    mount.registration()?.commands.rebind({
      reports: mount.reports,
      frameToken: 'figure3:restored-source:1'
    });

    expect(source.getAttribute('src')).toBe('/assets/figure3-motion.webm');
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalled();
    act(() => root.unmount());
  });

  it('keeps a hidden prewarm binding on the static fallback without decoding video', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneFigure3 reports={mount.reports} />); });

    mount.registration()?.commands.rebind({
      reports: mount.reports,
      frameToken: 'prewarm:figure3-animation:frame:1'
    });
    mount.registration()?.commands.settle(0);
    await act(async () => { await Promise.resolve(); });

    expect(probe.prepareFrame).not.toHaveBeenCalled();
    const video = host.querySelector<HTMLVideoElement>('video');
    const canvas = host.querySelector<HTMLCanvasElement>(
      '[data-phone-figure3-paper-canvas]'
    );
    if (!video || !canvas) throw new Error('missing hidden Figure3 prewarm surfaces');
    video.currentTime = 0;
    Object.defineProperty(video, 'readyState', { configurable: true, value: 2 });
    Object.defineProperty(video, 'seeking', { configurable: true, value: false });
    canvas.dataset.phoneFigure3PaperFrame = 'ready';
    canvas.dataset.phoneFigure3PaperEndpoint = 'initial';
    (probe.compositorOptions?.onPresentedFrame as (() => void) | undefined)?.();
    expect(mount.reports.reportPrepared).not.toHaveBeenCalled();
    expect(host.querySelector('.phone-figure3')
      ?.getAttribute('data-phone-figure3-initial-surface')).toBe('preparing');
    act(() => root.unmount());
  });

  it('characterizes repeated prewarm ownership after a decoded frame-zero proof', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneFigure3 reports={mount.reports} />); });

    const first = reportFixture();
    mount.registration()?.commands.rebind({
      reports: first.reports,
      frameToken: 'figure3:prewarm-characterization:first',
      segmentId: 'brand-figure3'
    });
    const firstActivation = mount.registration()?.commands.activate({
      invocationId: 'figure3:prewarm-characterization:first-activation',
      surfaceIds: ['figure3-video'],
      credit: 'physical-epoch', playback: false
    });
    await act(async () => {
      await Promise.all(firstActivation?.settlements.flatMap((settlement) => (
        settlement.status === 'pending' ? [settlement.settled] : []
      )) ?? []);
    });
    expect(host.querySelector<HTMLElement>('.phone-figure3')?.dataset.phoneFigure3InitialSurface)
      .toBe('video-frame-zero');

    probe.prepareFrame.mockClear();
    play.mockClear();
    const prewarm = reportFixture();
    mount.registration()?.commands.rebind({
      reports: prewarm.reports,
      frameToken: 'prewarm:figure3-animation:frame:2',
      segmentId: 'brand-figure3'
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(probe.prepareFrame).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
    expect(prewarm.reports.reportPrepared).not.toHaveBeenCalled();

    probe.prepareFrame.mockClear();
    const formal = reportFixture();
    mount.registration()?.commands.rebind({
      reports: formal.reports,
      frameToken: 'figure3:prewarm-characterization:formal',
      segmentId: 'brand-figure3'
    });
    const formalActivation = mount.registration()?.commands.activate({
      invocationId: 'figure3:prewarm-characterization:formal-activation',
      surfaceIds: ['figure3-video'],
      credit: 'physical-epoch', playback: false
    });
    await act(async () => {
      await Promise.all(formalActivation?.settlements.flatMap((settlement) => (
        settlement.status === 'pending' ? [settlement.settled] : []
      )) ?? []);
    });

    expect(probe.prepareFrame).toHaveBeenCalledOnce();
    expect(formal.reports.reportPrepared).toHaveBeenCalledWith(
      'figure3-initial-composite', expect.objectContaining({
        token: expect.stringContaining('figure3:prewarm-characterization:formal'),
        detail: expect.objectContaining({ winner: 'video-frame-zero' })
      })
    );
    expect(host.querySelector<HTMLElement>('.phone-figure3')?.dataset.phoneFigure3InitialSurface)
      .toBe('video-frame-zero');
    act(() => root.unmount());
  });

  it('requires a fresh video-frame-zero proof after a prewarm poster fallback', async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
      vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
      vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
      const host = document.createElement('div');
      const root = createRoot(host);
      const mount = reportFixture();
      await act(async () => { root.render(<PhoneFigure3 reports={mount.reports} />); });

      const prewarm = reportFixture();
      mount.registration()?.commands.rebind({
        reports: prewarm.reports,
        frameToken: 'prewarm:figure3-animation:frame:1'
      });
      host.querySelector('[data-phone-figure3-paper-poster]')
        ?.dispatchEvent(new Event('load'));
      await act(async () => {
        await Promise.resolve();
        vi.advanceTimersByTime(PHONE_FIGURE3_ENDPOINT_POSTER_FALLBACK_MS);
        await Promise.resolve();
      });
      expect(prewarm.reports.reportPrepared).toHaveBeenCalledWith(
        'figure3-initial-composite', expect.objectContaining({
          detail: expect.objectContaining({ winner: 'poster-fallback' })
        })
      );

      const video = host.querySelector<HTMLVideoElement>('video');
      if (!video) throw new Error('missing Figure3 activation video');
      let releaseFrame: (() => void) | null = null;
      probe.prepareFrame.mockImplementationOnce(() => new Promise((resolve) => {
        releaseFrame = () => {
          video.currentTime = 0;
          Object.defineProperty(video, 'readyState', { configurable: true, value: 2 });
          Object.defineProperty(video, 'seeking', { configurable: true, value: false });
          resolve({
            status: 'ready', runId: 'figure3:formal', direction: 1,
            generation: 2, targetTime: 0,
            targetFrameIndex: 0, presentedFrameIndex: 0,
            mediaTimeSeconds: 0, evidence: 'video-frame-callback'
          });
        };
      }));
      const formal = reportFixture();
      mount.registration()?.commands.rebind({
        reports: formal.reports,
        frameToken: 'figure3:formal:frame:2',
        segmentId: 'brand-figure3'
      });
      const invocation = mount.registration()?.commands.activate({
        invocationId: 'figure3:formal:activation',
        surfaceIds: ['figure3-video'],
        credit: 'physical-epoch', playback: false
      });
      const settlement = invocation?.settlements[0];
      if (!settlement || settlement.status !== 'pending') {
        throw new Error('missing Figure3 formal activation settlement');
      }
      let settled = false;
      void settlement.settled.then(() => { settled = true; });
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });

      expect(settled).toBe(false);
      expect(probe.prepareFrame).toHaveBeenCalledOnce();
      expect(formal.reports.reportPrepared).not.toHaveBeenCalled();

      await act(async () => {
        releaseFrame?.();
        await settlement.settled;
      });
      expect(formal.reports.reportPrepared).toHaveBeenCalledWith(
        'figure3-initial-composite', expect.objectContaining({
          token: expect.stringContaining('figure3:formal:frame:2'),
          detail: expect.objectContaining({ winner: 'video-frame-zero' })
        })
      );
      act(() => root.unmount());
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the stable decoded initial Canvas visible after a late compositor callback', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();

    await act(async () => { root.render(<PhoneFigure3 reports={mount.reports} />); });
    const current = reportFixture();
    const commands = mount.registration()?.commands;
    commands?.rebind({
      reports: current.reports,
      frameToken: 'figure3:late-frame:1',
      segmentId: 'figure3-services'
    });
    const invocation = commands?.activate({
      invocationId: 'figure3:late-frame:activation',
      surfaceIds: ['figure3-video'],
      credit: 'physical-epoch',
      playback: true
    });
    await act(async () => {
      await Promise.all(invocation?.settlements.flatMap((settlement) => (
        settlement.status === 'pending' ? [settlement.settled] : []
      )) ?? []);
    });

    commands?.settle(0);
    (probe.compositorOptions?.onPresentedFrame as (() => void) | undefined)?.();

    const scene = host.querySelector<HTMLElement>('.phone-figure3');
    expect(scene?.hasAttribute('data-phone-figure3-media-active')).toBe(true);
    expect(scene?.dataset.phoneFigure3InitialSurface).toBe('video-frame-zero');

    await act(async () => { root.unmount(); });
  });

  it('owns one persistent decoder/Canvas and proves only the current physical draw', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneFigure3 reports={mount.reports} />); });

    expect(mount.registration()?.surfaces.map(({ id, kind }) => [id, kind])).toEqual([
      ['figure3-video', 'video'],
      ['figure3-paper-canvas', 'canvas-2d'],
      ['figure3-initial-poster', 'image'],
      ['figure3-initial-composite', 'dom']
    ]);
    expect(host.querySelectorAll('[data-figure3-alpha-video]')).toHaveLength(1);
    expect(host.querySelectorAll('[data-phone-figure3-paper-canvas]')).toHaveLength(1);

    const current = reportFixture();
    mount.registration()?.commands.rebind({
      reports: current.reports,
      frameToken: 'figure3:frame:2'
    });
    mount.registration()?.commands.render(1);
    const video = host.querySelector('video');
    if (!(video instanceof HTMLVideoElement)) throw new Error('missing Figure3 video');
    video.currentTime = 0;
    Object.defineProperty(video, 'readyState', { configurable: true, value: 2 });
    Object.defineProperty(video, 'seeking', { configurable: true, value: false });
    probe.paint();
    expect(current.reports.reportFrame).not.toHaveBeenCalled();
    const invocation = mount.registration()?.commands.activate({
      invocationId: 'figure3:activate:2',
      surfaceIds: ['figure3-video'],
      credit: 'physical-epoch', playback: false
    });
    expect(invocation).toMatchObject({ invoked: true, surfaceIds: ['figure3-video'] });
    await act(async () => {
      await Promise.all(invocation?.settlements.flatMap((settlement) => (
        settlement.status === 'pending' ? [settlement.settled] : []
      )) ?? []);
    });
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
    expect(current.reports.reportFrame).toHaveBeenCalledWith(
      'figure3-paper-canvas', expect.objectContaining({
        kind: 'frame', token: 'figure3:frame:2', presented: true
      })
    );

    const renewed = reportFixture();
    video.currentTime = 0;
    mount.registration()?.commands.rebind({
      reports: renewed.reports,
      frameToken: 'figure3:frame:3'
    });
    expect(renewed.reports.reportFrame).not.toHaveBeenCalled();
    await act(async () => {
      mount.registration()?.commands.settle(1);
      await Promise.resolve();
    });
    expect(renewed.reports.reportFrame).toHaveBeenCalledWith(
      'figure3-paper-canvas', expect.objectContaining({
        kind: 'frame', token: 'figure3:frame:3', presented: true
      })
    );
    expect(renewed.reports.reportPrepared).toHaveBeenCalledWith(
      'figure3-initial-composite', expect.objectContaining({
        kind: 'image-decoded', ready: true,
        detail: expect.objectContaining({ winner: 'video-terminal-frame', endpoint: 1 })
      })
    );

    const canvas = host.querySelector('[data-phone-figure3-paper-canvas]');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('missing Figure3 Canvas');
    canvas.dataset.phoneFigure3PaperFrame = 'ready';
    canvas.dataset.phoneFigure3PaperEndpoint = 'terminal';
    video.currentTime = 2.567;
    const prepareCount = probe.prepareFrame.mock.calls.length;
    probe.paint.mockImplementation(() => false);
    const retained = reportFixture();
    mount.registration()?.commands.rebind({
      reports: retained.reports,
      frameToken: 'figure3:frame:4',
      segmentId: 'figure3-services'
    });
    await act(async () => {
      mount.registration()?.commands.settle(1);
      await Promise.resolve();
    });
    expect(probe.prepareFrame).toHaveBeenCalledTimes(prepareCount);
    expect(retained.reports.reportFailure).not.toHaveBeenCalled();
    expect(retained.reports.reportFrame).toHaveBeenCalledWith(
      'figure3-paper-canvas', expect.objectContaining({
        kind: 'frame', token: 'figure3:frame:4', presented: true
      })
    );

    mount.registration()?.commands.setMediaPhase?.({
      phase: 'playing',
      runToken: 'figure3:frame:4',
      direction: 'forward',
      stageIndex: 0
    });
    mount.registration()?.commands.render(.62);
    const endpointProofCount = retained.reports.reportFrame.mock.calls.length;
    video.currentTime = 1.2;
    probe.paint();
    expect(retained.reports.reportFrame).toHaveBeenCalledTimes(endpointProofCount);
    expect(probe.renderProgress).toHaveBeenCalledWith(expect.any(HTMLElement), .62);
    mount.registration()?.commands.pause('outside-closure');
    expect(probe.disposeCompositor).not.toHaveBeenCalled();
    mount.registration()?.commands.dispose('closure-retired');
    expect(probe.disposeCompositor).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it('reprepares the last settled frame when a paused retained leaf is rebound', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneFigure3 reports={mount.reports} />); });

    const first = reportFixture();
    mount.registration()?.commands.rebind({
      reports: first.reports,
      frameToken: 'figure3:retained:1',
      segmentId: 'figure3-services'
    });
    await act(async () => {
      mount.registration()?.commands.settle(1);
      await Promise.resolve();
    });
    mount.registration()?.commands.render(.4);
    mount.registration()?.commands.pause('hidden');
    probe.prepareFrame.mockClear();

    const recovered = reportFixture();
    await act(async () => {
      mount.registration()?.commands.rebind({
        reports: recovered.reports,
        frameToken: 'figure3:retained:2',
        segmentId: 'figure3-services'
      });
      await Promise.resolve();
    });

    expect(probe.renderProgress).toHaveBeenLastCalledWith(
      expect.any(HTMLElement), 1
    );
    expect(probe.prepareFrame).not.toHaveBeenCalled();
    expect(recovered.reports.reportFrame).toHaveBeenCalledWith(
      'figure3-paper-canvas', expect.objectContaining({
        kind: 'frame', token: 'figure3:retained:2', presented: true
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
    await act(async () => { root.render(<PhoneFigure3 reports={mount.reports} />); });

    const first = reportFixture();
    mount.registration()?.commands.rebind({
      reports: first.reports,
      frameToken: 'figure3:activation-owner:1'
    });
    mount.registration()?.commands.render(1);
    mount.registration()?.commands.pause('superseded');
    const canvas = host.querySelector('[data-phone-figure3-paper-canvas]');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('missing Figure3 Canvas');
    delete canvas.dataset.phoneFigure3PaperFrame;
    delete canvas.dataset.phoneFigure3PaperEndpoint;
    probe.prepareFrame.mockClear();

    const renewed = reportFixture();
    let invocation: ReturnType<PhoneLeafMountRegistration['commands']['activate']> | undefined;
    await act(async () => {
      mount.registration()?.commands.rebind({
        reports: renewed.reports,
        frameToken: 'figure3:activation-owner:2'
      });
      invocation = mount.registration()?.commands.activate({
        invocationId: 'figure3:activation-owner:invocation',
        surfaceIds: ['figure3-video'],
        credit: 'physical-epoch', playback: false
      });
      await Promise.all(invocation?.settlements.flatMap((settlement) => (
        settlement.status === 'pending' ? [settlement.settled] : []
      )) ?? []);
    });

    expect(probe.prepareFrame).toHaveBeenCalledOnce();
    expect(renewed.reports.reportFrame).toHaveBeenCalledWith(
      'figure3-paper-canvas', expect.objectContaining({
        kind: 'frame', token: 'figure3:activation-owner:2', presented: true
      })
    );
    act(() => root.unmount());
  });

  it('reprepares a new target binding after activation has claimed the decoder', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneFigure3 reports={mount.reports} />); });

    const first = reportFixture();
    mount.registration()?.commands.rebind({
      reports: first.reports,
      frameToken: 'figure3:activation-rebind:1',
      segmentId: 'brand-figure3',
      direction: 'forward',
      leg: 'target'
    });
    const invocation = mount.registration()?.commands.activate({
      invocationId: 'figure3:activation-rebind:activation',
      surfaceIds: ['figure3-video'],
      credit: 'physical-epoch', playback: false
    });
    await act(async () => {
      await Promise.all(invocation?.settlements.flatMap((settlement) => (
        settlement.status === 'pending' ? [settlement.settled] : []
      )) ?? []);
    });

    const video = host.querySelector<HTMLVideoElement>('video');
    if (!video) throw new Error('missing Figure3 activation video');
    video.currentTime = .05;
    probe.prepareFrame.mockClear();
    const renewed = reportFixture();
    mount.registration()?.commands.rebind({
      reports: renewed.reports,
      frameToken: 'figure3:activation-rebind:2',
      segmentId: 'brand-figure3',
      direction: 'forward',
      leg: 'target'
    });

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    expect(probe.prepareFrame).toHaveBeenCalledOnce();
    expect(renewed.reports.reportPrepared).toHaveBeenCalledWith(
      'figure3-initial-composite', expect.objectContaining({
        detail: expect.objectContaining({ winner: 'video-frame-zero' })
      })
    );
    act(() => root.unmount());
  });

  it('does not let a retained Canvas mask a failed causal repaint', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneFigure3 reports={mount.reports} />); });
    const current = reportFixture();
    mount.registration()?.commands.rebind({
      reports: current.reports,
      frameToken: 'figure3:causal-paint:1'
    });
    const video = host.querySelector('video');
    const canvas = host.querySelector('[data-phone-figure3-paper-canvas]');
    const poster = host.querySelector('[data-phone-figure3-paper-poster]');
    if (!(video instanceof HTMLVideoElement) || !(canvas instanceof HTMLCanvasElement)) {
      throw new Error('missing Figure3 causal surfaces');
    }
    poster?.dispatchEvent(new Event('load'));
    await Promise.resolve();
    canvas.dataset.phoneFigure3PaperFrame = 'ready';
    canvas.dataset.phoneFigure3PaperEndpoint = 'initial';
    video.currentTime = 0;
    Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
    Object.defineProperty(video, 'seeking', { configurable: true, value: false });
    probe.paint.mockImplementation(() => false);

    const invocation = mount.registration()?.commands.activate({
      invocationId: 'figure3:causal-paint:activation',
      surfaceIds: ['figure3-video'],
      credit: 'physical-epoch', playback: false
    });
    const settlement = invocation?.settlements[0];
    if (!settlement || settlement.status !== 'pending') {
      throw new Error('missing Figure3 causal settlement');
    }

    await expect(settlement.settled).resolves.toBeUndefined();
    expect(current.reports.reportPrepared).toHaveBeenCalledWith(
      'figure3-initial-composite', expect.objectContaining({
        detail: expect.objectContaining({ winner: 'poster-fallback' })
      })
    );
    expect(current.reports.reportFrame).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it('settles activation from the poster winner while video frame preparation remains pending', async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
      vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
      vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
      probe.prepareFrame.mockImplementationOnce(() => new Promise(() => undefined));
      const host = document.createElement('div');
      const root = createRoot(host);
      const mount = reportFixture();
      await act(async () => { root.render(<PhoneFigure3 reports={mount.reports} />); });
      const current = reportFixture();
      mount.registration()?.commands.rebind({
        reports: current.reports,
        frameToken: 'figure3:poster-wins:1',
        segmentId: 'brand-figure3'
      });
      const invocation = mount.registration()?.commands.activate({
        invocationId: 'figure3:poster-wins:activation',
        surfaceIds: ['figure3-video'],
        credit: 'physical-epoch', playback: false
      });
      const settlement = invocation?.settlements[0];
      if (!settlement || settlement.status !== 'pending') {
        throw new Error('missing Figure3 poster-winner settlement');
      }
      const poster = host.querySelector('[data-phone-figure3-paper-poster]');
      poster?.dispatchEvent(new Event('load'));
      let settled = false;
      void settlement.settled.then(() => { settled = true; });

      await act(async () => {
        await Promise.resolve();
        vi.advanceTimersByTime(PHONE_FIGURE3_ENDPOINT_POSTER_FALLBACK_MS);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(settled).toBe(true);
      expect(current.reports.reportPrepared).toHaveBeenCalledWith(
        'figure3-initial-composite', expect.objectContaining({
          detail: expect.objectContaining({ winner: 'poster-fallback' })
        })
      );
      act(() => root.unmount());
    } finally {
      vi.useRealTimers();
    }
  });

  it('settles the poster fallback when the activation prime throws synchronously', async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => {
        throw new Error('activation denied synchronously');
      });
      vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
      vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
      const host = document.createElement('div');
      const root = createRoot(host);
      const mount = reportFixture();
      await act(async () => { root.render(<PhoneFigure3 reports={mount.reports} />); });
      const current = reportFixture();
      mount.registration()?.commands.rebind({
        reports: current.reports,
        frameToken: 'figure3:prime-throws:1',
        segmentId: 'brand-figure3'
      });
      const invocation = mount.registration()?.commands.activate({
        invocationId: 'figure3:prime-throws:activation',
        surfaceIds: ['figure3-video'],
        credit: 'physical-epoch', playback: false
      });
      const settlement = invocation?.settlements[0];
      if (!settlement || settlement.status !== 'pending') {
        throw new Error('missing Figure3 sync-prime settlement');
      }
      host.querySelector('[data-phone-figure3-paper-poster]')?.dispatchEvent(new Event('load'));
      let settled = false;
      void settlement.settled.then(() => { settled = true; });

      await act(async () => {
        await Promise.resolve();
        vi.advanceTimersByTime(PHONE_FIGURE3_ENDPOINT_POSTER_FALLBACK_MS);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(settled).toBe(true);
      expect(current.reports.reportPrepared).toHaveBeenCalledWith(
        'figure3-initial-composite', expect.objectContaining({
          detail: expect.objectContaining({ winner: 'poster-fallback' })
        })
      );
      act(() => root.unmount());
    } finally {
      vi.useRealTimers();
    }
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
    await act(async () => { root.render(<PhoneFigure3 reports={mount.reports} />); });
    const current = reportFixture();
    mount.registration()?.commands.rebind({
      reports: current.reports,
      frameToken: 'figure3:stale-activation:1'
    });
    const invocation = mount.registration()?.commands.activate({
      invocationId: 'figure3:stale-activation:invocation',
      surfaceIds: ['figure3-video'],
      credit: 'physical-epoch', playback: false
    });
    const settlement = invocation?.settlements[0];
    if (!settlement || settlement.status !== 'pending') {
      throw new Error('missing Figure3 stale activation settlement');
    }

    mount.registration()?.commands.pause('outside-closure');
    releasePlayback();

    await expect(settlement.settled).rejects.toThrow(
      'Figure3 activation was superseded before frame preparation'
    );
    expect(current.reports.reportFrame).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it('rejects activation replaced while its causal frame promise is pending', async () => {
    let releaseFrame: () => void = () => undefined;
    probe.prepareFrame.mockImplementationOnce((
      _video: HTMLVideoElement,
      input: Readonly<{ runId: string; direction: 1 | -1 }>
    ) => (
      new Promise((resolve) => {
        releaseFrame = () => resolve({
          status: 'ready' as const,
          runId: input.runId,
          direction: input.direction,
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
    await act(async () => { root.render(<PhoneFigure3 reports={mount.reports} />); });
    const current = reportFixture();
    mount.registration()?.commands.rebind({
      reports: current.reports,
      frameToken: 'figure3:pending-activation:1'
    });
    const invocation = mount.registration()?.commands.activate({
      invocationId: 'figure3:pending-activation:invocation',
      surfaceIds: ['figure3-video'],
      credit: 'physical-epoch', playback: false
    });
    const settlement = invocation?.settlements[0];
    if (!settlement || settlement.status !== 'pending') {
      throw new Error('missing Figure3 pending activation settlement');
    }
    await Promise.resolve();
    await Promise.resolve();
    expect(probe.prepareFrame).toHaveBeenCalledOnce();

    mount.registration()?.commands.pause('outside-closure');
    releaseFrame();

    await expect(settlement.settled).rejects.toThrow(
      'Figure3 activation was superseded before frame preparation'
    );
    expect(current.reports.reportFrame).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it('accepts the driver-owned causal frame before Chromium clears seeking', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    probe.prepareFrame.mockImplementationOnce(async (
      video: HTMLVideoElement,
      input: Readonly<{ runId: string; direction: 1 | -1 }>
    ) => {
      video.currentTime = 77 / 30;
      Object.defineProperty(video, 'readyState', { configurable: true, value: 2 });
      Object.defineProperty(video, 'seeking', { configurable: true, value: true });
      return {
        status: 'ready' as const, runId: input.runId, direction: input.direction,
        generation: 1, targetTime: video.currentTime,
        targetFrameIndex: 77, presentedFrameIndex: 77,
        mediaTimeSeconds: video.currentTime,
        evidence: 'video-frame-callback' as const
      };
    });
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneFigure3 reports={mount.reports} />); });
    const current = reportFixture();
    mount.registration()?.commands.rebind({
      reports: current.reports, frameToken: 'figure3:causal:1'
    });

    await act(async () => {
      mount.registration()?.commands.settle(1);
      await Promise.resolve();
    });

    expect(current.reports.reportFrame).toHaveBeenCalledWith(
      'figure3-paper-canvas', expect.objectContaining({
        kind: 'frame', token: 'figure3:causal:1', presented: true
      })
    );
    act(() => root.unmount());
  });

  it('settles the initial hold from decoded video frame zero and reports the winning composite', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    probe.prepareFrame.mockImplementationOnce(async (
      video: HTMLVideoElement,
      input: Readonly<{ runId: string; direction: 1 | -1 }>
    ) => {
      video.currentTime = 0;
      Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
      Object.defineProperty(video, 'seeking', { configurable: true, value: false });
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
    await act(async () => { root.render(<PhoneFigure3 reports={mount.reports} />); });
    const current = reportFixture();
    mount.registration()?.commands.rebind({
      reports: current.reports, frameToken: 'figure3:causal-drift:1',
      segmentId: 'brand-figure3'
    });

    await act(async () => {
      mount.registration()?.commands.settle(0);
      await Promise.resolve();
    });

    expect(probe.prepareFrame).toHaveBeenCalledOnce();
    expect(current.reports.reportPrepared).toHaveBeenCalledWith(
      'figure3-initial-composite', expect.objectContaining({
        kind: 'image-decoded', ready: true,
        detail: expect.objectContaining({ winner: 'video-frame-zero' })
      })
    );
    const video = host.querySelector('video');
    const canvas = host.querySelector('[data-phone-figure3-paper-canvas]');
    if (!(video instanceof HTMLVideoElement) || !(canvas instanceof HTMLCanvasElement)) {
      throw new Error('missing Figure3 retained surfaces');
    }
    expect(phoneFigure3HasReusableEndpointFrame(video, canvas, 0)).toBe(true);
    expect(host.querySelector('.phone-figure3')?.getAttribute(
      'data-phone-figure3-initial-surface'
    )).toBe('video-frame-zero');
    video.currentTime = .75;
    probe.prepareFrame.mockClear();
    await act(async () => {
      mount.registration()?.commands.settle(0);
      await Promise.resolve();
    });
    expect(probe.prepareFrame).toHaveBeenCalledOnce();
    expect(video.currentTime).toBe(0);
    act(() => root.unmount());
  });

  it('uses the reverse binding direction when preparing an initial frame', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneFigure3 reports={mount.reports} />); });
    const current = reportFixture();
    probe.prepareFrame.mockClear();

    mount.registration()?.commands.rebind({
      reports: current.reports,
      frameToken: 'figure3:reverse-initial:1',
      segmentId: 'figure3-services',
      direction: 'reverse',
      leg: 'target'
    });

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    expect(probe.prepareFrame).toHaveBeenCalledOnce();
    expect(probe.prepareFrame.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      direction: -1
    }));
    expect(current.reports.reportPrepared).toHaveBeenCalledWith(
      'figure3-initial-composite', expect.objectContaining({
        detail: expect.objectContaining({ winner: 'video-frame-zero' })
      })
    );
    act(() => root.unmount());
  });

  it('returns master progress while the terminal media frame is held through the fade tail', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneFigure3 reports={mount.reports} />); });
    const commands = mount.registration()!.commands;
    commands.render(.99);
    commands.rebind({
      reports: mount.reports,
      frameToken: 'figure3:services-tail:1',
      transactionId: 'figure3:services-tail',
      segmentId: 'figure3-services',
      direction: 'forward',
      leg: 'source'
    });
    commands.setMediaPhase?.({
      phase: 'playing', runToken: 'figure3:services-tail', direction: 'forward', stageIndex: 0
    });

    const receipt = await commands.presentFrame?.({
      frameToken: 'figure3:services-tail:1',
      transactionId: 'figure3:services-tail',
      direction: 1,
      sequence: 1,
      desiredProgress: .99,
      signal: new AbortController().signal
    });

    expect(receipt).toMatchObject({
      status: 'presented', presentedProgress: .99, presentedFrameIndex: 77
    });
    act(() => root.unmount());
  });
});
