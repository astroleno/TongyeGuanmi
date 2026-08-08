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

const surfaceProbe = vi.hoisted(() => ({
  options: null as null | Readonly<{
    onCanvasRenewed?(canvas: HTMLCanvasElement): void;
    onFailure?(failure: Readonly<{ code: string; message: string; generation: number }>): void;
    onFrame?(frame: Readonly<{ canvas: HTMLCanvasElement; generation: number }>): void;
  }>,
  activate: vi.fn(() => 1),
  render: vi.fn(() => true),
  release: vi.fn(),
  dispose: vi.fn()
}));

const timelineProbe = vi.hoisted(() => ({
  prepare: vi.fn(async (
    video: HTMLVideoElement,
    input: Readonly<{ progress: number }>
  ) => {
    try { video.currentTime = input.progress * 2.567; } catch { /* detached media */ }
    return {
      status: 'ready' as const,
      runId: 'aod:test', direction: 1 as const, generation: 1,
      targetTime: input.progress * 2.567
    };
  }),
  dispose: vi.fn()
}));

vi.mock('../../../media/phone-packed-alpha-surface', () => ({
  createPhonePackedAlphaSurface: vi.fn((options) => {
    surfaceProbe.options = options;
    return {
      activate: surfaceProbe.activate,
      render: surfaceProbe.render,
      release: surfaceProbe.release,
      dispose: surfaceProbe.dispose
    };
  })
}));

vi.mock('../../../media/timeline-video-driver', () => ({
  prepareTimelineVideoFrame: timelineProbe.prepare,
  disposeTimelineVideoDriver: timelineProbe.dispose
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
    surfaceProbe.activate.mockReset().mockReturnValue(1);
    surfaceProbe.render.mockReset().mockReturnValue(true);
    surfaceProbe.release.mockReset();
    surfaceProbe.dispose.mockReset();
    timelineProbe.prepare.mockReset().mockImplementation(async (
      video: HTMLVideoElement,
      input: Readonly<{ progress: number }>
    ) => {
      try { video.currentTime = input.progress * 2.567; } catch { /* detached media */ }
      return {
        status: 'ready' as const,
        runId: 'aod:test', direction: 1 as const, generation: 1,
        targetTime: input.progress * 2.567
      };
    });
    timelineProbe.dispose.mockReset();
    host = document.createElement('div');
    document.body.replaceChildren(host);
    root = createRoot(host);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
  });

  it('registers a frozen poster before the packed pair and only plays media through activation', async () => {
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneAod reports={mount.reports} />); });
    expect(mount.registration()?.surfaces.map(({ id, kind }) => [id, kind])).toEqual([
      ['aod-figure-video', 'video'],
      ['aod-figure-poster', 'image'],
      ['aod-figure-canvas', 'canvas-webgl']
    ]);
    expect(Object.keys(mount.registration()?.commands ?? {}).sort()).toEqual([
      'activate', 'dispose', 'pause', 'rebind', 'render', 'settle'
    ]);
    expect(mount.registration()?.root.querySelector(
      '[data-phone-landing="aod-semantic-edge"]'
    )).not.toBeNull();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();

    const current = reportFixture();
    mount.registration()?.commands.rebind({
      reports: current.reports, frameToken: 'aod:frame:1'
    });
    const invocation = mount.registration()?.commands.activate({
      invocationId: 'activation:1',
      surfaceIds: ['aod-figure-video'],
      credit: 'physical-epoch',
      playback: false
    });
    expect(surfaceProbe.activate).toHaveBeenCalledTimes(1);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
    expect(host.querySelector<HTMLElement>('[data-aod-transition]')
      ?.getAttribute('data-aod-exit-active')).toBe('true');
    expect(invocation).toMatchObject({
      invocationId: 'activation:1', invoked: true,
      surfaceIds: ['aod-figure-video']
    });
    await expect(invocation?.settlements[0]?.status === 'pending'
      ? invocation.settlements[0].settled : Promise.reject()).resolves.toBeUndefined();
    expect(surfaceProbe.render).toHaveBeenCalledTimes(1);
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(1);
    mount.registration()?.commands.pause('outside-closure');
    expect(host.querySelector<HTMLElement>('[data-aod-transition]')
      ?.getAttribute('data-aod-exit-active')).toBeNull();
    expect(timelineProbe.prepare).toHaveBeenCalledWith(
      expect.any(HTMLVideoElement), expect.objectContaining({ progress: 0 })
    );
  });

  it('latches the reverse endpoint before the packed surface activates', async () => {
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneAod reports={mount.reports} />); });
    const current = reportFixture();
    const commands = mount.registration()!.commands;
    commands.rebind({ reports: current.reports, frameToken: 'aod:reverse:1' });

    commands.render(1);
    const invocation = commands.activate({
      invocationId: 'activation:reverse',
      surfaceIds: ['aod-figure-video'],
      credit: 'direct-muted-autoplay',
      playback: true
    });
    const settlement = invocation.settlements[0];
    if (settlement?.status !== 'pending') throw new Error('missing activation settlement');

    await expect(settlement.settled).resolves.toBeUndefined();
    expect(timelineProbe.prepare).toHaveBeenCalledWith(
      expect.any(HTMLVideoElement), expect.objectContaining({ progress: 1 })
    );
    expect(surfaceProbe.render).toHaveBeenCalledTimes(1);
  });

  it('rejects activation when frame preparation fails and reports the failure', async () => {
    timelineProbe.prepare.mockRejectedValueOnce(new Error('decode failed'));
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
    const settlement = invocation.settlements[0];
    if (settlement?.status !== 'pending') throw new Error('missing activation settlement');

    await expect(settlement.settled).rejects.toThrow('decode failed');
    expect(current.reports.reportFailure).toHaveBeenCalledWith(expect.objectContaining({
      code: 'aod-frame-preparation-failed',
      message: 'decode failed'
    }));
    expect(surfaceProbe.render).not.toHaveBeenCalled();
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

  it('projects playing progress onto the paused video clock', async () => {
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneAod reports={mount.reports} />); });
    const commands = mount.registration()!.commands;
    const video = host.querySelector<HTMLVideoElement>('[data-aod-figure-video]')!;
    Object.defineProperty(video, 'duration', { configurable: true, value: 2.567 });
    Object.defineProperty(video, 'currentTime', { configurable: true, writable: true, value: 0 });
    commands.rebind({ reports: reportFixture().reports, frameToken: 'aod:clock:1' });
    const invocation = commands.activate({
      invocationId: 'activation:clock', surfaceIds: ['aod-figure-video'],
      credit: 'physical-epoch', playback: true
    });
    const settlement = invocation.settlements[0];
    if (settlement?.status === 'pending') await settlement.settled;
    await act(async () => {
      commands.render(.75);
      await Promise.resolve();
    });
    expect(video.currentTime).toBeGreaterThan(0);
    expect(video.currentTime).toBeLessThan(2.567);
    expect(surfaceProbe.render).toHaveBeenCalled();
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
    expect(HTMLMediaElement.prototype.pause).not.toHaveBeenCalled();
    releasePlayback();
    await expect(completion).resolves.toBeUndefined();
    expect(scene.dataset.portraitAodProgress).toBe('0.0000');
  });
});
