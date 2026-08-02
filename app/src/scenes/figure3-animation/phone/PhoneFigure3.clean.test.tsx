// @vitest-environment jsdom

import { act, createElement } from 'react';
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
    input: Readonly<{ progress: number }>
  ) => {
    video.currentTime = input.progress * 2.567;
    Object.defineProperty(video, 'readyState', { configurable: true, value: 2 });
    Object.defineProperty(video, 'seeking', { configurable: true, value: false });
    return {
      status: 'ready' as const,
      runId: 'figure3:test',
      direction: 1 as const,
      generation: 1,
      targetTime: video.currentTime
    };
  }),
  disposeDriver: vi.fn(),
  renderProgress: vi.fn()
}));

vi.mock('..', () => ({
  FIGURE3_END_SECONDS: 2.567,
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
    }))
  },
  renderFigure3AnimationProgress: probe.renderProgress
}));

vi.mock('../../../media/timeline-video-driver', () => ({
  disposeTimelineVideoDriver: probe.disposeDriver,
  prepareTimelineVideoFrame: probe.prepareFrame
}));

vi.mock('./paper-compositor', () => ({
  createPhoneFigure3PaperCompositor: vi.fn((options: Record<string, unknown>) => {
    probe.compositorOptions = options;
    probe.paint.mockImplementation(() => {
      (options.onFrame as (() => void) | undefined)?.();
      (options.onPresentedFrame as (() => void) | undefined)?.();
      return true;
    });
    return { paint: probe.paint, dispose: probe.disposeCompositor };
  }),
  releasePhoneFigure3PaperCanvas: vi.fn()
}));

import { PhoneFigure3, phoneFigure3HasReusableEndpointFrame } from './PhoneFigure3';

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
      ['figure3-paper-canvas', 'canvas-2d']
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
      credit: 'physical-epoch'
    });
    expect(invocation).toMatchObject({ invoked: true, surfaceIds: ['figure3-video'] });
    await act(async () => {
      await Promise.all(invocation?.settlements.flatMap((settlement) => (
        settlement.status === 'pending' ? [settlement.settled] : []
      )) ?? []);
    });
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
      frameToken: 'figure3:frame:4'
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

    mount.registration()?.commands.render(.62);
    const endpointProofCount = retained.reports.reportFrame.mock.calls.length;
    video.currentTime = 1.2;
    probe.paint();
    expect(retained.reports.reportFrame).toHaveBeenCalledTimes(endpointProofCount);
    expect(probe.renderProgress).toHaveBeenCalledWith(
      expect.any(HTMLElement), .62, expect.objectContaining({
        mediaRun: expect.objectContaining({ runId: expect.stringContaining('figure3:frame:4') })
      })
    );
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
      frameToken: 'figure3:retained:1'
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
        frameToken: 'figure3:retained:2'
      });
      await Promise.resolve();
    });

    expect(probe.renderProgress).toHaveBeenLastCalledWith(
      expect.any(HTMLElement), 1, expect.any(Object)
    );
    expect(probe.prepareFrame).toHaveBeenCalledOnce();
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
        credit: 'physical-epoch'
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
    if (!(video instanceof HTMLVideoElement) || !(canvas instanceof HTMLCanvasElement)) {
      throw new Error('missing Figure3 causal surfaces');
    }
    canvas.dataset.phoneFigure3PaperFrame = 'ready';
    canvas.dataset.phoneFigure3PaperEndpoint = 'initial';
    video.currentTime = 0;
    Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
    Object.defineProperty(video, 'seeking', { configurable: true, value: false });
    probe.paint.mockImplementation(() => false);

    const invocation = mount.registration()?.commands.activate({
      invocationId: 'figure3:causal-paint:activation',
      surfaceIds: ['figure3-video'],
      credit: 'physical-epoch'
    });
    const settlement = invocation?.settlements[0];
    if (!settlement || settlement.status !== 'pending') {
      throw new Error('missing Figure3 causal settlement');
    }

    await expect(settlement.settled).rejects.toThrow('Figure3 decoded frame was not painted');
    expect(current.reports.reportFrame).not.toHaveBeenCalled();
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
    await act(async () => { root.render(<PhoneFigure3 reports={mount.reports} />); });
    const current = reportFixture();
    mount.registration()?.commands.rebind({
      reports: current.reports,
      frameToken: 'figure3:stale-activation:1'
    });
    const invocation = mount.registration()?.commands.activate({
      invocationId: 'figure3:stale-activation:invocation',
      surfaceIds: ['figure3-video'],
      credit: 'physical-epoch'
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
    probe.prepareFrame.mockImplementationOnce((video: HTMLVideoElement) => (
      new Promise((resolve) => {
        releaseFrame = () => resolve({
          status: 'ready' as const,
          runId: 'figure3:pending-activation',
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
    await act(async () => { root.render(<PhoneFigure3 reports={mount.reports} />); });
    const current = reportFixture();
    mount.registration()?.commands.rebind({
      reports: current.reports,
      frameToken: 'figure3:pending-activation:1'
    });
    const invocation = mount.registration()?.commands.activate({
      invocationId: 'figure3:pending-activation:invocation',
      surfaceIds: ['figure3-video'],
      credit: 'physical-epoch'
    });
    const settlement = invocation?.settlements[0];
    if (!settlement || settlement.status !== 'pending') {
      throw new Error('missing Figure3 pending activation settlement');
    }
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
    probe.prepareFrame.mockImplementationOnce(async (video: HTMLVideoElement) => {
      video.currentTime = 2.567;
      Object.defineProperty(video, 'readyState', { configurable: true, value: 2 });
      Object.defineProperty(video, 'seeking', { configurable: true, value: true });
      return {
        status: 'ready' as const, runId: 'figure3:causal', direction: 1 as const,
        generation: 1, targetTime: video.currentTime
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

  it('accepts a driver-owned start proof after the physical playhead drifts past the retained boundary', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    probe.prepareFrame.mockImplementationOnce(async (video: HTMLVideoElement) => {
      video.currentTime = .051;
      Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
      Object.defineProperty(video, 'seeking', { configurable: true, value: true });
      return {
        status: 'ready' as const, runId: 'figure3:causal-drift', direction: 1 as const,
        generation: 1, targetTime: 0
      };
    });
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneFigure3 reports={mount.reports} />); });
    const current = reportFixture();
    mount.registration()?.commands.rebind({
      reports: current.reports, frameToken: 'figure3:causal-drift:1'
    });

    await act(async () => {
      mount.registration()?.commands.settle(0);
      await Promise.resolve();
    });

    expect(current.reports.reportFrame).toHaveBeenCalledWith(
      'figure3-paper-canvas', expect.objectContaining({
        kind: 'frame', token: 'figure3:causal-drift:1', presented: true
      })
    );
    const video = host.querySelector('video');
    const canvas = host.querySelector('[data-phone-figure3-paper-canvas]');
    if (!(video instanceof HTMLVideoElement) || !(canvas instanceof HTMLCanvasElement)) {
      throw new Error('missing Figure3 retained surfaces');
    }
    expect(phoneFigure3HasReusableEndpointFrame(video, canvas, 0)).toBe(false);
    act(() => root.unmount());
  });
});
