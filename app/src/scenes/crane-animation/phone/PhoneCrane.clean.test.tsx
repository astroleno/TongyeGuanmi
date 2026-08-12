// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  PhoneLeafMountRegistration,
  PhoneLeafReportPort
} from '../../../production/phone-story/presentation';
import { CRANE_VIDEO_END_SECONDS } from '..';

const packedProbe = vi.hoisted(() => ({
  options: [] as Record<string, unknown>[],
  generations: [0, 0],
  surfaces: [] as Array<{
    activate: ReturnType<typeof vi.fn>;
    setMode: ReturnType<typeof vi.fn>;
    probe: ReturnType<typeof vi.fn>;
    render: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }>
}));

vi.mock('../../../media/phone-packed-alpha-surface', () => ({
  createPhonePackedAlphaSurface: vi.fn((options: Record<string, unknown>) => {
    const index = packedProbe.options.length;
    packedProbe.options.push(options);
    const surface = {
      activate: vi.fn(() => ++packedProbe.generations[index]!),
      setMode: vi.fn(),
      probe: vi.fn(() => false),
      render: vi.fn(() => true),
      release: vi.fn(),
      dispose: vi.fn()
    };
    packedProbe.surfaces.push(surface);
    return surface;
  })
}));

import { PhoneCrane } from './PhoneCrane';

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

describe('clean PhoneCrane leaf', () => {
  beforeEach(() => {
    packedProbe.options = [];
    packedProbe.generations = [0, 0];
    packedProbe.surfaces = [];
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
  });

  it('registers the two authored packed video/Canvas pairs', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneCrane reports={mount.reports} />); });

    expect(mount.registration()?.surfaces.map(({ id, kind }) => [id, kind])).toEqual([
      ['crane-figure-video', 'video'],
      ['crane-figure-canvas', 'canvas-webgl'],
      ['crane-flock-video', 'video'],
      ['crane-flock-canvas', 'canvas-webgl']
    ]);
    expect(host.querySelectorAll('[data-crane-figure-video]')).toHaveLength(1);
    expect(host.querySelectorAll('[data-crane-figure-front-video]')).toHaveLength(1);
    expect(host.querySelectorAll('[data-phone-packed-alpha-canvas]')).toHaveLength(2);
    act(() => root.unmount());
  });

  it('proves both current-generation physical draws and rejects stale callbacks', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneCrane reports={mount.reports} />); });
    const commands = mount.registration()!.commands;
    commands.rebind({ reports: mount.reports, frameToken: 'crane:frame:1' });
    const activation = commands.activate({
      invocationId: 'crane:activate:1',
      surfaceIds: ['crane-figure-video', 'crane-flock-video'],
      credit: 'physical-epoch', playback: false
    });
    expect(activation.invoked).toBe(true);
    expect(activation.settlements).toHaveLength(2);
    await Promise.all(activation.settlements.flatMap((settlement) => (
      settlement.status === 'pending' ? [settlement.settled] : []
    )));

    const canvases = host.querySelectorAll<HTMLCanvasElement>(
      '[data-phone-packed-alpha-canvas]'
    );
    for (const [index, surfaceId] of [
      [0, 'crane-figure-canvas'],
      [1, 'crane-flock-canvas']
    ] as const) {
      (packedProbe.options[index]?.onFrame as ((frame: {
        canvas: HTMLCanvasElement; generation: number;
      }) => void))({ canvas: canvases[index]!, generation: 1 });
      expect(mount.reports.reportFrame).toHaveBeenCalledWith(
        surfaceId,
        expect.objectContaining({ token: 'crane:frame:1', presented: true })
      );
    }

    commands.activate({
      invocationId: 'crane:activate:2',
      surfaceIds: ['crane-figure-video', 'crane-flock-video'],
      credit: 'physical-epoch', playback: false
    });
    (packedProbe.options[0]?.onFrame as ((frame: {
      canvas: HTMLCanvasElement; generation: number;
    }) => void))({ canvas: canvases[0]!, generation: 1 });
    expect(mount.reports.reportFrame).toHaveBeenCalledTimes(2);
    act(() => root.unmount());
  });

  it('admits only the post-activation generation and reveals both lanes together', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneCrane reports={mount.reports} />); });
    const commands = mount.registration()!.commands;
    const canvases = host.querySelectorAll<HTMLCanvasElement>('[data-phone-packed-alpha-canvas]');
    const frames = packedProbe.options.map(({ onFrame }) => onFrame as (frame: {
      canvas: HTMLCanvasElement; generation: number;
    }) => void);
    commands.rebind({ reports: mount.reports, frameToken: 'crane:prewarm' });
    commands.activate({
      invocationId: 'crane:prewarm',
      surfaceIds: ['crane-figure-video', 'crane-flock-video'],
      credit: 'direct-muted-autoplay', playback: false
    });
    for (const [index, frame] of frames.entries()) {
      canvases[index]!.dataset.packedAlphaGeneration = '1';
      canvases[index]!.dataset.packedAlphaMediaTime = '0.5000';
      frame({ canvas: canvases[index]!, generation: 1 });
    }
    mount.reports.reportFrame.mockClear();

    commands.rebind({
      reports: mount.reports, frameToken: 'crane:transaction', segmentId: 'education-crane'
    });
    frames[0]!({ canvas: canvases[0]!, generation: 1 });
    expect(mount.reports.reportFrame).not.toHaveBeenCalled();
    commands.activate({
      invocationId: 'crane:transaction',
      surfaceIds: ['crane-figure-video', 'crane-flock-video'],
      credit: 'physical-epoch', playback: false
    });
    canvases[0]!.dataset.packedAlphaGeneration = '2';
    canvases[0]!.dataset.packedAlphaMediaTime = '0.0000';
    frames[0]!({ canvas: canvases[0]!, generation: 2 });
    const scene = host.querySelector('[data-r4-scene="crane-animation"]');
    expect(scene?.hasAttribute('data-phone-crane-pair-ready')).toBe(false);
    canvases[1]!.dataset.packedAlphaGeneration = '2';
    canvases[1]!.dataset.packedAlphaMediaTime = '0.0000';
    frames[1]!({ canvas: canvases[1]!, generation: 2 });
    expect(scene?.hasAttribute('data-phone-crane-pair-ready')).toBe(true);
    expect(mount.reports.reportFrame).toHaveBeenCalledTimes(2);
    act(() => root.unmount());
  });

  it('re-proves the accepted pair for a same-scene lifecycle projection', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneCrane reports={mount.reports} />); });
    const commands = mount.registration()!.commands;
    const canvases = host.querySelectorAll<HTMLCanvasElement>('[data-phone-packed-alpha-canvas]');
    commands.rebind({ reports: mount.reports, frameToken: 'crane:entry' });
    commands.activate({
      invocationId: 'crane:entry',
      surfaceIds: ['crane-figure-video', 'crane-flock-video'],
      credit: 'direct-muted-autoplay', playback: false
    });
    packedProbe.options.forEach(({ onFrame }, index) => {
      canvases[index]!.dataset.packedAlphaGeneration = '1';
      canvases[index]!.dataset.packedAlphaMediaTime = '0.0000';
      (onFrame as (frame: { canvas: HTMLCanvasElement; generation: number }) => void)(
        { canvas: canvases[index]!, generation: 1 }
      );
    });
    mount.reports.reportFrame.mockClear();

    commands.rebind({
      reports: mount.reports, frameToken: 'crane:lifecycle', segmentId: null
    });

    expect(mount.reports.reportFrame).toHaveBeenCalledTimes(2);
    expect(mount.reports.reportFrame).toHaveBeenNthCalledWith(
      1, 'crane-figure-canvas', expect.objectContaining({ token: 'crane:lifecycle' })
    );
    expect(mount.reports.reportFrame).toHaveBeenNthCalledWith(
      2, 'crane-flock-canvas', expect.objectContaining({ token: 'crane:lifecycle' })
    );
    expect(packedProbe.surfaces.every(({ activate }) => activate.mock.calls.length === 1)).toBe(true);
    act(() => root.unmount());
  });

  it('primes both paused initial frames once and enters timeline playback without native clocks', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneCrane reports={mount.reports} />); });
    const commands = mount.registration()!.commands;
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    commands.rebind({ reports: mount.reports, frameToken: 'crane:incoming' });

    const incoming = commands.activate({
      invocationId: 'crane:incoming',
      surfaceIds: ['crane-figure-video', 'crane-flock-video'],
      credit: 'direct-muted-autoplay', playback: false
    });
    expect(incoming.invoked).toBe(true);
    for (const surface of packedProbe.surfaces) {
      expect(surface.activate).toHaveBeenLastCalledWith('initial');
    }
    expect(play).toHaveBeenCalledTimes(2);

    commands.settle(0);
    commands.rebind({ reports: mount.reports, frameToken: 'crane:outgoing' });
    const outgoing = commands.activate({
      invocationId: 'crane:outgoing',
      surfaceIds: ['crane-figure-video', 'crane-flock-video'],
      credit: 'physical-epoch', playback: true
    });
    await Promise.all(outgoing.settlements.flatMap((settlement) => (
      settlement.status === 'pending' ? [settlement.settled] : []
    )));
    for (const surface of packedProbe.surfaces) {
      expect(surface.activate).toHaveBeenLastCalledWith('initial');
    }
    expect(play).toHaveBeenCalledTimes(4);
    commands.setMediaPhase?.({
      phase: 'playing', runToken: 'crane:outgoing', direction: 'forward', stageIndex: 0
    });
    expect(play).toHaveBeenCalledTimes(4);
    for (const surface of packedProbe.surfaces) {
      expect(surface.setMode).toHaveBeenCalledWith('forward', true);
    }
    commands.render(0);
    expect(play).toHaveBeenCalledTimes(4);
    act(() => root.unmount());
  });

  it('keeps reverse presented-frame playback paused', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneCrane reports={mount.reports} />); });
    const commands = mount.registration()!.commands;
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    commands.rebind({ reports: mount.reports, frameToken: 'crane:reverse' });
    commands.activate({
      invocationId: 'crane:reverse',
      surfaceIds: ['crane-figure-video', 'crane-flock-video'],
      credit: 'physical-epoch', playback: false, direction: 'reverse'
    });

    commands.setMediaPhase?.({
      phase: 'playing', runToken: 'crane:reverse', direction: 'reverse', stageIndex: 0
    });

    expect(play).toHaveBeenCalledTimes(2);
    act(() => root.unmount());
  });

  it('keeps the authored half-second stagger on one timeline without extra play calls', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneCrane reports={mount.reports} />); });
    const commands = mount.registration()!.commands;
    const figure = host.querySelector<HTMLVideoElement>('[data-crane-figure-video]')!;
    const flock = host.querySelector<HTMLVideoElement>('[data-crane-figure-front-video]')!;
    const figurePlay = vi.spyOn(figure, 'play').mockResolvedValue();
    const flockPlay = vi.spyOn(flock, 'play').mockResolvedValue();
    commands.rebind({
      reports: mount.reports,
      frameToken: 'crane:contact:1',
      segmentId: 'crane-contact',
      direction: 'forward'
    });
    const invocation = commands.activate({
      invocationId: 'crane:contact:activation',
      surfaceIds: ['crane-figure-video', 'crane-flock-video'],
      credit: 'physical-epoch', playback: false,
      runToken: 'crane:contact:run', direction: 'forward'
    });
    await Promise.all(invocation.settlements.flatMap((settlement) => (
      settlement.status === 'pending' ? [settlement.settled] : []
    )));

    commands.setMediaPhase?.({
      phase: 'playing', runToken: 'crane:contact:run', direction: 'forward', stageIndex: 0
    });
    commands.render(0);
    expect(figurePlay).toHaveBeenCalledOnce();
    expect(flockPlay).toHaveBeenCalledOnce();

    commands.render(.1);
    expect(figurePlay).toHaveBeenCalledOnce();
    commands.render(1 / 6);
    expect(figurePlay).toHaveBeenCalledOnce();
    expect(figure.currentTime).toBe(0);
    expect(flockPlay).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it('rejects a forced terminal seek and requires both current-generation terminal Canvas draws', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneCrane reports={mount.reports} />); });
    const commands = mount.registration()!.commands;
    const videos = host.querySelectorAll<HTMLVideoElement>('video');
    commands.rebind({
      reports: mount.reports, frameToken: 'crane:terminal:missing',
      segmentId: 'crane-contact', direction: 'forward'
    });
    const invocation = commands.activate({
      invocationId: 'crane:terminal:activation',
      surfaceIds: ['crane-figure-video', 'crane-flock-video'],
      credit: 'physical-epoch', runToken: 'crane:terminal:run', direction: 'forward'
    });
    await Promise.all(invocation.settlements.flatMap((settlement) => (
      settlement.status === 'pending' ? [settlement.settled] : []
    )));
    commands.setMediaPhase?.({
      phase: 'playing', runToken: 'crane:terminal:run', direction: 'forward', stageIndex: 0
    });
    for (const video of videos) video.currentTime = 2.2;

    commands.setMediaPhase?.({
      phase: 'held', runToken: 'crane:terminal:run', direction: 'forward',
      stageIndex: 0, endpoint: 1
    });

    expect([...videos].map((video) => video.currentTime)).toEqual([
      CRANE_VIDEO_END_SECONDS, CRANE_VIDEO_END_SECONDS
    ]);
    expect(mount.reports.reportFailure).toHaveBeenCalledWith(expect.objectContaining({
      code: 'crane-terminal-frame-missing', recoverable: true
    }));
    act(() => root.unmount());
  });

  it('accepts Contact completion only after both terminal frames draw in the active generation', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneCrane reports={mount.reports} />); });
    const commands = mount.registration()!.commands;
    const videos = host.querySelectorAll<HTMLVideoElement>('video');
    const canvases = host.querySelectorAll<HTMLCanvasElement>('[data-phone-packed-alpha-canvas]');
    commands.rebind({
      reports: mount.reports, frameToken: 'crane:terminal:ready',
      segmentId: 'crane-contact', direction: 'forward'
    });
    const invocation = commands.activate({
      invocationId: 'crane:terminal:ready:activation',
      surfaceIds: ['crane-figure-video', 'crane-flock-video'],
      credit: 'physical-epoch', runToken: 'crane:terminal:ready:run', direction: 'forward'
    });
    await Promise.all(invocation.settlements.flatMap((settlement) => (
      settlement.status === 'pending' ? [settlement.settled] : []
    )));
    commands.setMediaPhase?.({
      phase: 'playing', runToken: 'crane:terminal:ready:run',
      direction: 'forward', stageIndex: 0
    });
    for (const [index, video] of [...videos].entries()) {
      video.currentTime = CRANE_VIDEO_END_SECONDS;
      canvases[index]!.dataset.packedAlphaGeneration = '1';
      canvases[index]!.dataset.packedAlphaMediaTime = CRANE_VIDEO_END_SECONDS.toFixed(4);
      (packedProbe.options[index]?.onFrame as ((frame: {
        canvas: HTMLCanvasElement; generation: number;
      }) => void))({ canvas: canvases[index]!, generation: 1 });
    }
    mount.reports.reportFailure.mockClear();

    commands.setMediaPhase?.({
      phase: 'held', runToken: 'crane:terminal:ready:run', direction: 'forward',
      stageIndex: 0, endpoint: 1
    });

    expect(mount.reports.reportFailure).not.toHaveBeenCalled();
    expect([...videos].map((video) => video.currentTime)).toEqual([
      CRANE_VIDEO_END_SECONDS, CRANE_VIDEO_END_SECONDS
    ]);
    act(() => root.unmount());
  });

  it('holds the endpoint supplied by runtime for reverse stable commits', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneCrane reports={mount.reports} />); });
    const commands = mount.registration()!.commands;
    const videos = host.querySelectorAll<HTMLVideoElement>('video');
    commands.rebind({ reports: mount.reports, frameToken: 'crane:reverse:held' });
    commands.activate({
      invocationId: 'crane:reverse:held:activation',
      surfaceIds: ['crane-figure-video', 'crane-flock-video'],
      credit: 'physical-epoch', runToken: 'crane:reverse:held', direction: 'reverse'
    });
    commands.setMediaPhase?.({
      phase: 'held', runToken: 'crane:reverse:held', direction: 'reverse',
      stageIndex: 0, endpoint: 0
    });
    expect(videos[0]?.currentTime).toBe(0);
    expect(videos[1]?.currentTime).toBe(0);
    act(() => root.unmount());
  });

  it('reproves the initial endpoint when settling after a stale terminal frame', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneCrane reports={mount.reports} />); });
    const commands = mount.registration()!.commands;
    const videos = host.querySelectorAll<HTMLVideoElement>('video');
    commands.rebind({ reports: mount.reports, frameToken: 'crane:settle:initial' });
    commands.activate({
      invocationId: 'crane:settle:activation',
      surfaceIds: ['crane-figure-video', 'crane-flock-video'],
      credit: 'physical-epoch', runToken: 'crane:settle:run', direction: 'forward'
    });
    for (const video of videos) video.currentTime = CRANE_VIDEO_END_SECONDS;

    commands.settle(0);

    expect([...videos].every((video) => video.paused)).toBe(true);
    expect([...videos].every((video) => video.currentTime === 0)).toBe(true);
    act(() => root.unmount());
  });

  it('retains both surfaces across pause/rebind and hard-retires them once', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneCrane reports={mount.reports} />); });
    const commands = mount.registration()!.commands;
    commands.rebind({ reports: mount.reports, frameToken: 'crane:retained:1' });
    commands.activate({
      invocationId: 'crane:activate:retained',
      surfaceIds: ['crane-figure-video', 'crane-flock-video'],
      credit: 'physical-epoch', playback: false
    });
    commands.pause('outside-closure');
    for (const surface of packedProbe.surfaces) {
      expect(surface.release).not.toHaveBeenCalled();
      expect(surface.dispose).not.toHaveBeenCalled();
      surface.probe.mockClear();
      surface.render.mockClear();
    }
    commands.rebind({ reports: mount.reports, frameToken: 'crane:retained:2' });
    for (const surface of packedProbe.surfaces) {
      expect(surface.probe).not.toHaveBeenCalled();
      expect(surface.render).not.toHaveBeenCalled();
      surface.probe.mockClear();
    }
    commands.settle(1);
    for (const surface of packedProbe.surfaces) {
      expect(surface.probe).not.toHaveBeenCalled();
      expect(surface.render).not.toHaveBeenCalled();
    }

    commands.dispose('closure-retired');
    commands.dispose('closure-retired');
    for (const surface of packedProbe.surfaces) {
      expect(surface.dispose).toHaveBeenCalledTimes(1);
      expect(surface.dispose).toHaveBeenCalledWith('terminal');
    }
    act(() => root.unmount());
  });
});
