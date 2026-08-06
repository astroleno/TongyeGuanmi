// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  PhoneLeafMountRegistration,
  PhoneLeafReportPort
} from '../../../production/phone-story/presentation';

const packedProbe = vi.hoisted(() => ({
  options: [] as Record<string, unknown>[],
  generations: [0, 0],
  surfaces: [] as Array<{
    activate: ReturnType<typeof vi.fn>;
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
      expect(surface.probe).toHaveBeenCalledOnce();
      expect(surface.render).not.toHaveBeenCalled();
      surface.probe.mockClear();
    }
    commands.settle(1);
    for (const surface of packedProbe.surfaces) {
      expect(surface.probe).toHaveBeenCalledOnce();
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
