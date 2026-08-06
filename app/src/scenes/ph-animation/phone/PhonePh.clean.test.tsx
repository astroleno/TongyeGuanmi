// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  PhoneLeafMountRegistration,
  PhoneLeafReportPort
} from '../../../production/phone-story/presentation';

const surfaceProbe = vi.hoisted(() => ({
  options: null as null | Record<string, unknown>,
  generation: 0,
  activate: vi.fn(() => ++surfaceProbe.generation),
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
    (surfaceProbe.options?.onFrame as ((frame: {
      canvas: HTMLCanvasElement; generation: number;
    }) => void))({ canvas, generation: 1 });
    expect(mount.reports.reportFrame).toHaveBeenCalledWith(
      'ph-figure-canvas',
      expect.objectContaining({ token: 'ph:frame:1', presented: true })
    );

    commands.rebind({ reports: mount.reports, frameToken: 'ph:frame:2' });
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
