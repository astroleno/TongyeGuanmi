// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
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

import { PhoneFigure3 } from './PhoneFigure3';

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

    mount.registration()?.commands.render(.62);
    const endpointProofCount = renewed.reports.reportFrame.mock.calls.length;
    video.currentTime = 1.2;
    probe.paint();
    expect(renewed.reports.reportFrame).toHaveBeenCalledTimes(endpointProofCount);
    expect(probe.renderProgress).toHaveBeenCalledWith(
      expect.any(HTMLElement), .62, expect.objectContaining({
        mediaRun: expect.objectContaining({ runId: expect.stringContaining('figure3:frame:3') })
      })
    );
    mount.registration()?.commands.pause('outside-closure');
    expect(probe.disposeCompositor).not.toHaveBeenCalled();
    mount.registration()?.commands.dispose('closure-retired');
    expect(probe.disposeCompositor).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });
});
