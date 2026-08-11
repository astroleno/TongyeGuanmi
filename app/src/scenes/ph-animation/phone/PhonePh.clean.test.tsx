// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  PhoneLeafMountRegistration,
  PhoneLeafReportPort
} from '../../../production/phone-story/presentation';
import { PH_FIGURE_END_SECONDS } from '..';

const surfaceProbe = vi.hoisted(() => ({
  options: null as null | Record<string, unknown>,
  generation: 0,
  activate: vi.fn(() => ++surfaceProbe.generation),
  setMode: vi.fn(),
  probe: vi.fn(() => false),
  render: vi.fn(() => true),
  release: vi.fn(),
  dispose: vi.fn()
}));

vi.mock('../../../media/phone-packed-alpha-surface', () => ({
  createPhonePackedAlphaSurface: vi.fn((options: Record<string, unknown>) => {
    surfaceProbe.options = options;
    return {
      activate: surfaceProbe.activate,
      setMode: surfaceProbe.setMode,
      probe: surfaceProbe.probe,
      render: surfaceProbe.render,
      release: surfaceProbe.release,
      dispose: surfaceProbe.dispose
    };
  })
}));

import { PhonePh } from './PhonePh';

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

describe('clean PhonePh leaf', () => {
  beforeEach(() => {
    surfaceProbe.options = null;
    surfaceProbe.generation = 0;
    surfaceProbe.activate.mockClear();
    surfaceProbe.setMode.mockClear();
    surfaceProbe.probe.mockClear();
    surfaceProbe.render.mockClear();
    surfaceProbe.release.mockClear();
    surfaceProbe.dispose.mockClear();
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
  });

  it('registers exactly one packed video/canvas pair', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhonePh reports={mount.reports} />); });

    expect(mount.registration()?.surfaces.map(({ id, kind }) => [id, kind])).toEqual([
      ['ph-figure-video', 'video'],
      ['ph-figure-canvas', 'canvas-webgl']
    ]);
    expect(host.querySelectorAll('[data-ph-alpha-video]')).toHaveLength(1);
    expect(host.querySelectorAll('[data-phone-packed-alpha-canvas="ph-figure"]'))
      .toHaveLength(1);

    act(() => root.unmount());
  });

  it('reports only a current-generation physical Canvas draw', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhonePh reports={mount.reports} />); });
    const commands = mount.registration()!.commands;
    commands.rebind({ reports: mount.reports, frameToken: 'ph:frame:1' });
    const activation = commands.activate({
      invocationId: 'ph:activate:1',
      surfaceIds: ['ph-figure-video'],
      credit: 'physical-epoch', playback: false
    });
    expect(activation.invoked).toBe(true);
    await Promise.all(activation.settlements.flatMap((settlement) => (
      settlement.status === 'pending' ? [settlement.settled] : []
    )));

    const canvas = host.querySelector<HTMLCanvasElement>(
      '[data-phone-packed-alpha-canvas="ph-figure"]'
    )!;
    canvas.dataset.packedAlphaGeneration = '1';
    canvas.dataset.packedAlphaMediaTime = '0.0000';
    (surfaceProbe.options?.onFrame as ((frame: {
      canvas: HTMLCanvasElement; generation: number;
    }) => void))({ canvas, generation: 1 });
    expect(mount.reports.reportFrame).toHaveBeenCalledWith(
      'ph-figure-canvas',
      expect.objectContaining({ token: 'ph:frame:1', presented: true })
    );

    commands.rebind({ reports: mount.reports, frameToken: 'ph:frame:2' });
    commands.render(.5);
    commands.activate({
      invocationId: 'ph:activate:2',
      surfaceIds: ['ph-figure-video'],
      credit: 'physical-epoch', playback: false
    });
    (surfaceProbe.options?.onFrame as ((frame: {
      canvas: HTMLCanvasElement; generation: number;
    }) => void))({ canvas, generation: 1 });
    expect(mount.reports.reportFrame).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it('primes a paused initial frame on incoming activation and plays only on outgoing activation', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhonePh reports={mount.reports} />); });
    const commands = mount.registration()!.commands;
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    commands.rebind({ reports: mount.reports, frameToken: 'ph:incoming' });

    const incoming = commands.activate({
      invocationId: 'ph:incoming', surfaceIds: ['ph-figure-video'],
      credit: 'direct-muted-autoplay', playback: false
    });
    expect(incoming.invoked).toBe(true);
    expect(surfaceProbe.activate).toHaveBeenLastCalledWith('initial');
    expect(play).toHaveBeenCalledOnce();

    commands.settle(0);
    commands.rebind({ reports: mount.reports, frameToken: 'ph:outgoing' });
    const outgoing = commands.activate({
      invocationId: 'ph:outgoing', surfaceIds: ['ph-figure-video'],
      credit: 'physical-epoch', playback: true
    });
    await Promise.all(outgoing.settlements.flatMap((settlement) => (
      settlement.status === 'pending' ? [settlement.settled] : []
    )));
    expect(surfaceProbe.activate).toHaveBeenLastCalledWith('initial');
    expect(play).toHaveBeenCalledTimes(2);
    commands.setMediaPhase?.({
      phase: 'playing', runToken: 'ph:outgoing', direction: 'forward', stageIndex: 0
    });
    expect(play).toHaveBeenCalledTimes(3);
    const pause = vi.mocked(HTMLMediaElement.prototype.pause);
    pause.mockClear();
    commands.render(0);
    expect(pause).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it('keeps reverse presented-frame playback paused', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhonePh reports={mount.reports} />); });
    const commands = mount.registration()!.commands;
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    commands.rebind({ reports: mount.reports, frameToken: 'ph:reverse' });
    commands.activate({
      invocationId: 'ph:reverse', surfaceIds: ['ph-figure-video'],
      credit: 'physical-epoch', playback: false, direction: 'reverse'
    });

    commands.setMediaPhase?.({
      phase: 'playing', runToken: 'ph:reverse', direction: 'reverse', stageIndex: 0
    });

    expect(play).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it('holds the endpoint supplied by runtime for reverse stable commits', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhonePh reports={mount.reports} />); });
    const commands = mount.registration()!.commands;
    const video = host.querySelector<HTMLVideoElement>('[data-ph-alpha-video]')!;
    commands.rebind({ reports: mount.reports, frameToken: 'ph:reverse:held' });
    commands.activate({
      invocationId: 'ph:reverse:held:activation',
      surfaceIds: ['ph-figure-video'], credit: 'physical-epoch',
      runToken: 'ph:reverse:held', direction: 'reverse'
    });
    commands.setMediaPhase?.({
      phase: 'held', runToken: 'ph:reverse:held', direction: 'reverse',
      stageIndex: 0, endpoint: 0
    });
    expect(video.currentTime).toBe(0);
    act(() => root.unmount());
  });

  it('reproves the initial endpoint when settling after a stale terminal frame', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhonePh reports={mount.reports} />); });
    const commands = mount.registration()!.commands;
    const video = host.querySelector<HTMLVideoElement>('[data-ph-alpha-video]')!;
    commands.rebind({ reports: mount.reports, frameToken: 'ph:settle:initial' });
    commands.activate({
      invocationId: 'ph:settle:activation', surfaceIds: ['ph-figure-video'],
      credit: 'physical-epoch', runToken: 'ph:settle:run', direction: 'forward'
    });
    video.currentTime = PH_FIGURE_END_SECONDS;

    commands.settle(0);

    expect(video.paused).toBe(true);
    expect(video.currentTime).toBe(0);
    act(() => root.unmount());
  });

  it('retains a proved surface across pause/rebind and hard-retires on dispose', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhonePh reports={mount.reports} />); });
    const commands = mount.registration()!.commands;
    commands.rebind({ reports: mount.reports, frameToken: 'ph:retained:1' });
    commands.activate({
      invocationId: 'ph:activate:retained',
      surfaceIds: ['ph-figure-video'],
      credit: 'physical-epoch', playback: false
    });
    surfaceProbe.probe.mockClear();
    surfaceProbe.render.mockClear();
    commands.pause('outside-closure');
    expect(surfaceProbe.release).not.toHaveBeenCalled();
    expect(surfaceProbe.dispose).not.toHaveBeenCalled();
    commands.rebind({ reports: mount.reports, frameToken: 'ph:retained:2' });
    expect(surfaceProbe.probe).toHaveBeenCalledOnce();
    expect(surfaceProbe.render).not.toHaveBeenCalled();
    const canvas = host.querySelector<HTMLCanvasElement>(
      '[data-phone-packed-alpha-canvas="ph-figure"]'
    )!;
    canvas.dataset.packedAlphaGeneration = '1';
    canvas.dataset.packedAlphaMediaTime = '0.0000';
    (surfaceProbe.options?.onFrame as ((frame: {
      canvas: HTMLCanvasElement; generation: number;
    }) => void))({ canvas, generation: 1 });
    expect(mount.reports.reportFrame).toHaveBeenCalledWith(
      'ph-figure-canvas', expect.objectContaining({ token: 'ph:retained:2' })
    );
    commands.dispose('closure-retired');
    commands.dispose('closure-retired');
    expect(surfaceProbe.dispose).toHaveBeenCalledTimes(1);
    expect(surfaceProbe.dispose).toHaveBeenCalledWith('terminal');
    act(() => root.unmount());
  });

  it('reuses the verified initial Canvas generation from stable hold into outgoing playback', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhonePh reports={mount.reports} />); });
    const commands = mount.registration()!.commands;
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    commands.rebind({ reports: mount.reports, frameToken: 'ph:stable:initial' });
    const incoming = commands.activate({
      invocationId: 'ph:stable:activation', surfaceIds: ['ph-figure-video'],
      credit: 'direct-muted-autoplay', runToken: 'ph:stable', direction: 'forward'
    });
    await Promise.all(incoming.settlements.flatMap((settlement) => (
      settlement.status === 'pending' ? [settlement.settled] : []
    )));
    const canvas = host.querySelector<HTMLCanvasElement>(
      '[data-phone-packed-alpha-canvas="ph-figure"]'
    )!;
    canvas.dataset.packedAlphaGeneration = '1';
    canvas.dataset.packedAlphaMediaTime = '0.0000';
    (surfaceProbe.options?.onFrame as ((frame: {
      canvas: HTMLCanvasElement; generation: number;
    }) => void))({ canvas, generation: 1 });
    commands.settle(0);

    surfaceProbe.activate.mockClear();
    surfaceProbe.setMode.mockClear();
    play.mockClear();
    commands.rebind({ reports: mount.reports, frameToken: 'ph:outgoing:retained' });
    const outgoing = commands.activate({
      invocationId: 'ph:outgoing:retained', surfaceIds: ['ph-figure-video'],
      credit: 'physical-epoch', runToken: 'ph:outgoing:retained',
      direction: 'forward', playback: true
    });

    expect(outgoing.invoked).toBe(true);
    expect(outgoing.settlements).toEqual([
      { surfaceId: 'ph-figure-video', status: 'fulfilled' }
    ]);
    expect(surfaceProbe.activate).not.toHaveBeenCalled();
    expect(surfaceProbe.setMode).toHaveBeenCalledWith('initial', true);
    expect(play).not.toHaveBeenCalled();

    commands.setMediaPhase?.({
      phase: 'playing', runToken: 'ph:outgoing:retained',
      direction: 'forward', stageIndex: 0
    });
    expect(surfaceProbe.setMode).toHaveBeenLastCalledWith('forward', true);
    expect(play).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it('settles the active generation without creating a second decoder generation', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => { root.render(<PhonePh reports={mount.reports} />); });
    const commands = mount.registration()!.commands;
    commands.rebind({ reports: mount.reports, frameToken: 'ph:frame:settle' });
    commands.render(1);
    commands.activate({
      invocationId: 'ph:activate:settle',
      surfaceIds: ['ph-figure-video'],
      credit: 'physical-epoch', playback: false
    });
    expect(surfaceProbe.activate).toHaveBeenCalledTimes(1);

    commands.settle(1);

    expect(surfaceProbe.activate).toHaveBeenCalledTimes(1);
    expect(surfaceProbe.probe).toHaveBeenCalled();
    expect(surfaceProbe.render).not.toHaveBeenCalled();
    act(() => root.unmount());
  });
});
