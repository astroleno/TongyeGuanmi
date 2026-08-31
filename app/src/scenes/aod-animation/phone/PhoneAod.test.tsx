// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

const surfaceProbe = vi.hoisted(() => ({
  options: null as null | SurfaceProbeOptions,
  activeCanvas: null as HTMLCanvasElement | null,
  activeGeneration: 0,
  activate: vi.fn(() => 1),
  setMode: vi.fn(),
  render: vi.fn(() => true),
  probe: vi.fn(() => true),
  presentFrame: vi.fn(async (request: SurfaceProbeRequest) => {
    const { frameMap } = request;
    const progress = Math.min(1, Math.max(0, request.desiredProgress));
    const desiredFrameIndex = progress === 0
      ? frameMap.startFrame
      : progress === 1
        ? frameMap.endFrame
        : Math.round(frameMap.startFrame + progress * (frameMap.endFrame - frameMap.startFrame));
    const canvas = surfaceProbe.activeCanvas ?? surfaceProbe.options?.canvas;
    if (canvas) canvas.dataset.packedAlphaFrameReady = 'true';
    if (canvas) surfaceProbe.options?.onFrame?.({
      canvas, generation: surfaceProbe.activeGeneration
    });
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
      generation: surfaceProbe.activeGeneration
    };
  }),
  release: vi.fn(),
  dispose: vi.fn()
}));

vi.mock('../../../media/phone-packed-alpha-surface', () => ({
  createPhonePackedAlphaSurface: vi.fn((options) => {
    surfaceProbe.options = options;
    return {
      activate: surfaceProbe.activate,
      presentFrame: surfaceProbe.presentFrame,
      setMode: surfaceProbe.setMode,
      probe: surfaceProbe.probe,
      render: surfaceProbe.render,
      release: surfaceProbe.release,
      dispose: surfaceProbe.dispose
    };
  })
}));

import {
  PHONE_AOD_MIGRATION_CONTROL,
  PhoneAod,
  type PhoneAodMigrationCommands
} from './PhoneAod';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function reportFixture() {
  let registration: PhoneLeafMountRegistration | null = null;
  const reports = {
    registerMount: vi.fn((next: PhoneLeafMountRegistration) => { registration = next; }),
    reportPrepared: vi.fn(),
    reportFrame: vi.fn(),
    reportProgress: vi.fn(),
    reportComplete: vi.fn(),
    reportFailure: vi.fn()
  } satisfies PhoneLeafReportPort;
  return { reports, registration: () => registration };
}

describe('clean PhoneAod leaf', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    surfaceProbe.options = null;
    surfaceProbe.activeCanvas = null;
    surfaceProbe.activeGeneration = 0;
    surfaceProbe.activate.mockReset().mockImplementation(() => {
      surfaceProbe.activeCanvas = surfaceProbe.options?.canvas ?? null;
      surfaceProbe.activeGeneration = 1;
      return surfaceProbe.activeGeneration;
    });
    surfaceProbe.setMode.mockReset();
    surfaceProbe.render.mockReset().mockReturnValue(true);
    surfaceProbe.probe.mockReset().mockReturnValue(true);
    surfaceProbe.presentFrame.mockReset().mockImplementation(async (request: SurfaceProbeRequest) => {
      const { frameMap } = request;
      const progress = Math.min(1, Math.max(0, request.desiredProgress));
      const desiredFrameIndex = progress === 0
        ? frameMap.startFrame
        : progress === 1
          ? frameMap.endFrame
          : Math.round(frameMap.startFrame + progress * (frameMap.endFrame - frameMap.startFrame));
      const canvas = surfaceProbe.activeCanvas ?? surfaceProbe.options?.canvas;
      if (canvas) canvas.dataset.packedAlphaFrameReady = 'true';
      if (canvas) surfaceProbe.options?.onFrame?.({
        canvas, generation: surfaceProbe.activeGeneration
      });
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
        generation: surfaceProbe.activeGeneration
      };
    });
    surfaceProbe.release.mockReset();
    surfaceProbe.dispose.mockReset();
    host = document.createElement('div');
    document.body.replaceChildren(host);
    root = createRoot(host);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
  });

  it('registers a frozen poster before the packed pair and spends one prime play before the explicit phase', async () => {
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneAod reports={mount.reports} />); });
    expect(mount.registration()?.surfaces.map(({ id, kind }) => [id, kind])).toEqual([
      ['aod-figure-video', 'video'],
      ['aod-figure-poster', 'image'],
      ['aod-figure-canvas', 'canvas-webgl']
    ]);
    expect(Object.keys(mount.registration()?.commands ?? {}).sort()).toEqual([
      'activate', 'dispose', 'pause', 'presentFrame', 'rebind', 'render',
      'setMediaPhase', 'settle'
    ]);
    expect(mount.registration()?.root.querySelector(
      '[data-phone-landing="aod-semantic-edge"]'
    )).not.toBeNull();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();

    const current = reportFixture();
    mount.registration()?.commands.rebind({
      reports: current.reports, frameToken: 'aod:frame:1', transactionId: 'aod:transaction:1'
    });
    const invocation = mount.registration()?.commands.activate({
      invocationId: 'activation:1',
      surfaceIds: ['aod-figure-video'],
      credit: 'physical-epoch',
      playback: false
    });
    expect(surfaceProbe.activate).toHaveBeenCalledTimes(1);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
    expect(host.querySelector<HTMLElement>('[data-aod-transition]')
      ?.getAttribute('data-aod-exit-active')).toBe('true');
    expect(invocation).toMatchObject({
      invocationId: 'activation:1', invoked: true,
      surfaceIds: ['aod-figure-video']
    });
    await expect(invocation?.settlements[0]?.status === 'pending'
      ? invocation.settlements[0].settled : Promise.reject()).resolves.toBeUndefined();
    const receipt = await mount.registration()?.commands.presentFrame?.({
      frameToken: 'aod:frame:1', transactionId: 'aod:transaction:1', direction: 1,
      sequence: 1, desiredProgress: .48, signal: new AbortController().signal
    });
    expect(receipt).toMatchObject({
      status: 'presented', frameToken: 'aod:frame:1', sequence: 1,
      desiredProgress: .48, presentedProgress: expect.closeTo(.48, 5),
      evidence: 'packed-canvas-draw'
    });
    expect(surfaceProbe.presentFrame).toHaveBeenCalledTimes(1);
    mount.registration()?.commands.pause('outside-closure');
    expect(host.querySelector<HTMLElement>('[data-aod-transition]')
      ?.getAttribute('data-aod-exit-active')).toBeNull();
  });

  it('does not let a late prime resolve pause AOD after formal playback starts', async () => {
    let releasePrime!: () => void;
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(() => (
      new Promise<void>((resolve) => { releasePrime = resolve; })
    ));
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneAod reports={mount.reports} />); });
    const current = reportFixture();
    const commands = mount.registration()!.commands;
    const runToken = 'aod:prime-race:1';
    commands.rebind({ reports: current.reports, frameToken: runToken });
    const invocation = commands.activate({
      invocationId: 'activation:prime-race',
      surfaceIds: ['aod-figure-video'],
      credit: 'physical-epoch', playback: true,
      direction: 'forward', runToken
    });
    const settlement = invocation.settlements[0];
    if (settlement?.status !== 'pending') throw new Error('missing activation settlement');
    await expect(settlement.settled).resolves.toBeUndefined();

    const setMediaPhase = commands.setMediaPhase;
    if (!setMediaPhase) throw new Error('missing media phase command');
    setMediaPhase({
      phase: 'playing', runToken, direction: 'forward', stageIndex: 0
    });
    const pause = vi.mocked(HTMLMediaElement.prototype.pause);
    const pauseCount = pause.mock.calls.length;
    releasePrime();
    await Promise.resolve();
    await Promise.resolve();
    expect(pause).toHaveBeenCalledTimes(pauseCount);
    expect(current.reports.reportFailure).not.toHaveBeenCalledWith(
      expect.objectContaining({ code: 'aod-activation-playback-rejected' })
    );
  });

  it('switches the packed surface to forward before formal AOD playback', async () => {
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneAod reports={mount.reports} />); });
    const current = reportFixture();
    const commands = mount.registration()!.commands;
    const runToken = 'aod:forward-mode:1';
    commands.rebind({ reports: current.reports, frameToken: runToken });
    commands.activate({
      invocationId: 'activation:forward-mode',
      surfaceIds: ['aod-figure-video'],
      credit: 'physical-epoch', playback: true,
      direction: 'forward', runToken
    });
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    const primeCalls = play.mock.calls.length;
    commands.setMediaPhase?.({
      phase: 'playing', runToken, direction: 'forward', stageIndex: 0
    });

    expect(surfaceProbe.setMode).toHaveBeenCalledWith('forward', true);
    expect(play.mock.calls.length).toBe(primeCalls);
  });

  it('reports an active AOD prime rejection while it is still primed', async () => {
    let rejectPrime!: (error: unknown) => void;
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(() => (
      new Promise<void>((_resolve, reject) => { rejectPrime = reject; })
    ));
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneAod reports={mount.reports} />); });
    const current = reportFixture();
    const commands = mount.registration()!.commands;
    const runToken = 'aod:prime-reject:1';
    commands.rebind({ reports: current.reports, frameToken: runToken });
    const invocation = commands.activate({
      invocationId: 'activation:prime-reject',
      surfaceIds: ['aod-figure-video'],
      credit: 'physical-epoch', playback: true,
      direction: 'forward', runToken
    });
    const settlement = invocation.settlements[0];
    if (settlement?.status !== 'pending') throw new Error('missing activation settlement');
    await expect(settlement.settled).resolves.toBeUndefined();

    const error = new DOMException('autoplay blocked', 'NotAllowedError');
    if (!rejectPrime) throw new Error('missing prime rejection callback');
    rejectPrime(error);
    await Promise.resolve();
    await Promise.resolve();
    expect(current.reports.reportFailure).toHaveBeenCalledWith(expect.objectContaining({
      code: 'aod-activation-playback-rejected',
      message: String(error),
      detail: { runToken, generation: 1 }
    }));
  });

  it('does not surface a stale prime rejection after formal AOD playback starts', async () => {
    let rejectPrime!: (error: unknown) => void;
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(() => (
      new Promise<void>((_resolve, reject) => { rejectPrime = reject; })
    ));
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneAod reports={mount.reports} />); });
    const current = reportFixture();
    const commands = mount.registration()!.commands;
    const runToken = 'aod:prime-stale-reject:1';
    commands.rebind({ reports: current.reports, frameToken: runToken });
    const invocation = commands.activate({
      invocationId: 'activation:prime-stale-reject',
      surfaceIds: ['aod-figure-video'],
      credit: 'physical-epoch', playback: true,
      direction: 'forward', runToken
    });
    const settlement = invocation.settlements[0];
    if (settlement?.status !== 'pending') throw new Error('missing activation settlement');
    await expect(settlement.settled).resolves.toBeUndefined();

    const setMediaPhase = commands.setMediaPhase;
    if (!setMediaPhase) throw new Error('missing media phase command');
    setMediaPhase({
      phase: 'playing', runToken, direction: 'forward', stageIndex: 0
    });
    const error = new DOMException('late prime rejection', 'NotAllowedError');
    if (!rejectPrime) throw new Error('missing prime rejection callback');
    rejectPrime(error);
    await Promise.resolve();
    await Promise.resolve();
    expect(current.reports.reportFailure).not.toHaveBeenCalledWith(
      expect.objectContaining({ code: 'aod-activation-playback-rejected' })
    );
  });

  it('activates the reverse endpoint without using a second timeline clock', async () => {
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneAod reports={mount.reports} />); });
    const current = reportFixture();
    const commands = mount.registration()!.commands;
    commands.rebind({
      reports: current.reports, frameToken: 'aod:reverse:1', transactionId: 'aod:reverse'
    });

    commands.render(1);
    const invocation = commands.activate({
      invocationId: 'activation:reverse',
      surfaceIds: ['aod-figure-video'],
      credit: 'direct-muted-autoplay',
      playback: true,
      direction: 'reverse',
      runToken: 'aod:reverse:1'
    });
    const settlement = invocation.settlements[0];
    if (settlement?.status !== 'pending') throw new Error('missing activation settlement');

    await expect(settlement.settled).resolves.toBeUndefined();
    expect(surfaceProbe.activate).toHaveBeenCalledWith('endpoint');
    expect(surfaceProbe.presentFrame).not.toHaveBeenCalled();
  });

  it('rejects activation when the packed surface cannot allocate a generation', async () => {
    surfaceProbe.activate.mockReturnValueOnce(0);
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneAod reports={mount.reports} />); });
    const current = reportFixture();
    const commands = mount.registration()!.commands;
    commands.rebind({ reports: current.reports, frameToken: 'aod:reject:1' });
    const invocation = commands.activate({
      invocationId: 'activation:reject',
      surfaceIds: ['aod-figure-video'],
      credit: 'direct-muted-autoplay',
      playback: true
    });
    expect(invocation).toMatchObject({ invoked: false, settlements: [] });
    expect(current.reports.reportFailure).not.toHaveBeenCalled();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it('accepts only the current generation draw and tracks a renewed Canvas', async () => {
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneAod reports={mount.reports} />); });
    const current = reportFixture();
    const commands = mount.registration()!.commands;
    commands.rebind({ reports: current.reports, frameToken: 'aod:frame:1' });
    commands.activate({
      invocationId: 'activation:1', surfaceIds: ['aod-figure-video'],
      credit: 'physical-epoch', playback: false
    });
    expect(mount.registration()!.root.dataset.phoneAodPlaybackFrame).toBe('awaiting');
    const initialCanvas = mount.registration()!.surfaces[2]!.element;
    (initialCanvas as HTMLCanvasElement).dataset.packedAlphaFrameReady = 'true';
    surfaceProbe.options?.onFrame?.({
      canvas: initialCanvas as HTMLCanvasElement, generation: 0
    });
    expect(current.reports.reportFrame).not.toHaveBeenCalled();
    surfaceProbe.options?.onFrame?.({
      canvas: initialCanvas as HTMLCanvasElement, generation: 1
    });
    expect(current.reports.reportFrame).toHaveBeenCalledWith(
      'aod-figure-canvas',
      expect.objectContaining({ token: 'aod:frame:1', presented: true })
    );
    expect(mount.registration()!.root.dataset.phoneAodPlaybackFrame).toBe('ready');

    const renewed = document.createElement('canvas');
    surfaceProbe.options?.onCanvasRenewed?.(renewed);
    expect(mount.registration()!.surfaces[2]!.element).toBe(renewed);
  });

  it('uses the decoded frozen poster for a static arrival without touching the decoder', async () => {
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneAod reports={mount.reports} />); });
    const current = reportFixture();
    const commands = mount.registration()!.commands;
    commands.rebind({ reports: current.reports, frameToken: 'aod:static:1' });

    const poster = host.querySelector<HTMLImageElement>('[data-phone-aod-figure-poster]');
    expect(poster).not.toBeNull();
    await act(async () => {
      poster?.dispatchEvent(new Event('load'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(current.reports.reportPrepared).toHaveBeenCalledWith(
      'aod-figure-poster', expect.objectContaining({
        kind: 'image-decoded', ready: true,
        detail: expect.objectContaining({ posterDecoded: true })
      })
    );
    expect(surfaceProbe.activate).not.toHaveBeenCalled();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it('reports compositor failure and contains no legacy autoplay authority', async () => {
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneAod reports={mount.reports} />); });
    const current = reportFixture();
    mount.registration()?.commands.rebind({
      reports: current.reports, frameToken: 'aod:frame:1'
    });
    surfaceProbe.options?.onFailure?.({
      code: 'context-lost', message: 'lost', generation: 1
    });
    expect(current.reports.reportFailure).toHaveBeenCalledWith({
      code: 'aod-context-lost', message: 'lost', recoverable: true,
      detail: { generation: 1 }
    });
    const source = readFileSync(resolve(
      process.cwd(), 'src/scenes/aod-animation/phone/PhoneAod.tsx'
    ), 'utf8');
    expect(source).not.toMatch(/production\/phone\/(?:aod-autoplay|types|runtime)/);
    expect(source).not.toContain('setTimeout(');
    expect(source).not.toMatch(/(?:window|document)\.addEventListener\(/);
    expect(readFileSync(resolve(
      process.cwd(), 'src/scenes/aod-animation/phone/PhoneAod.css'
    ), 'utf8')).toContain('[data-phone-aod-playback-frame="ready"]');
  });

  it('settles to the authored AOD hold from either transaction direction', async () => {
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneAod reports={mount.reports} />); });
    const scene = host.querySelector<HTMLElement>('.portrait-scroll-spike__scene--aod')!;
    scene.dataset.phoneAodPlaybackFrame = 'ready';
    mount.registration()?.commands.settle(0);
    expect(scene.dataset.portraitAodProgress).toBe('0.0000');
    expect(scene.dataset.phoneAodPlaybackFrame).toBeUndefined();
    mount.registration()?.commands.settle(1);
    expect(scene.dataset.portraitAodProgress).toBe('1.0000');
  });

  it('keeps render visual-only and maps exact AOD frames to master progress', async () => {
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneAod reports={mount.reports} />); });
    const commands = mount.registration()!.commands;
    const video = host.querySelector<HTMLVideoElement>('[data-aod-figure-video]')!;
    const frameToken = 'aod:frame-lock:1';
    const transactionId = 'aod:frame-lock';
    commands.rebind({ reports: reportFixture().reports, frameToken, transactionId });
    const invocation = commands.activate({
      invocationId: 'activation:frame-lock', surfaceIds: ['aod-figure-video'],
      credit: 'physical-epoch', playback: true, direction: 'forward',
      runToken: transactionId
    });
    const settlement = invocation.settlements[0];
    if (settlement?.status === 'pending') await settlement.settled;
    const beforeTime = video.currentTime;
    commands.setMediaPhase?.({
      phase: 'playing', runToken: transactionId, direction: 'forward', stageIndex: 0
    });
    commands.render(.75);
    expect(video.currentTime).toBe(beforeTime);
    expect(surfaceProbe.presentFrame).not.toHaveBeenCalled();

    const receipt = await commands.presentFrame?.({
      frameToken, transactionId, direction: 1, sequence: 1,
      desiredProgress: .48, signal: new AbortController().signal
    });
    expect(receipt).toMatchObject({
      status: 'presented', frameToken, sequence: 1,
      desiredProgress: .48, presentedProgress: expect.closeTo(.48, 5),
      evidence: 'packed-canvas-draw'
    });
    expect(surfaceProbe.presentFrame).toHaveBeenCalledWith(expect.objectContaining({
      runId: transactionId,
      desiredProgress: expect.closeTo(.2077922, 4),
      frameMap: expect.objectContaining({ frameCount: 78 })
    }));
  });

  it('keeps the canonical figure geometry and makes the first Canvas frame own the live surface', async () => {
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneAod reports={mount.reports} />); });
    const commands = mount.registration()!.commands;
    const scene = host.querySelector<HTMLElement>('.portrait-scroll-spike__scene--aod')!;
    const transition = scene.querySelector<HTMLElement>('[data-aod-transition]')!;
    commands.render(0.5735);

    expect(transition.style.getPropertyValue('--portrait-aod-figure-cover-scale')).toBe('');
    expect(transition.style.getPropertyValue('--portrait-aod-figure-shift-y')).toBe('');
    expect(transition.style.getPropertyValue('--aod-transition-figure-scale')).toBe('1.0000');

    const css = readFileSync(resolve(
      process.cwd(), 'src/scenes/aod-animation/phone/PhoneAod.css'
    ), 'utf8');
    expect(css).toMatch(/\[data-aod-alpha-composite="true"\][\s\S]*?\.aod-transition__reveal-surface::before[\s\S]*?opacity:\s*0\s*!important/s);
    expect(css).toMatch(/\[data-aod-alpha-composite="true"\][\s\S]*?\.aod-transition__reveal-surface::after[\s\S]*?opacity:\s*0\s*!important/s);
    expect(css).toMatch(/\[data-aod-alpha-composite="true"\][\s\S]*?\.aod-transition__paper-solid[\s\S]*?opacity:\s*0\s*!important/s);
  });

  it('lets the stateless formal bridge await a real forward activation', async () => {
    let releasePlayback!: () => void;
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(() => (
      new Promise<void>((resolve) => { releasePlayback = resolve; })
    ));
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneAod reports={mount.reports} />); });
    const commands = mount.registration()!.commands as PhoneAodMigrationCommands;
    const scene = host.querySelector<HTMLElement>('.portrait-scroll-spike__scene--aod')!;
    const completion = commands[PHONE_AOD_MIGRATION_CONTROL].startAutoplay(1);

    expect(completion).toBeInstanceOf(Promise);
    expect(scene.dataset.portraitAodProgress).toBe('0.0000');
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledOnce();
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
    releasePlayback();
    await expect(completion).resolves.toBeUndefined();
    expect(scene.dataset.portraitAodProgress).toBe('0.0000');
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });
});
