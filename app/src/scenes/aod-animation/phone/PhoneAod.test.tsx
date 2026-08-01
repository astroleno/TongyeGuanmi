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

import { PhoneAod } from './PhoneAod';

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
    host = document.createElement('div');
    document.body.replaceChildren(host);
    root = createRoot(host);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
  });

  it('registers the exact video/Canvas pair and invokes media only through activation', async () => {
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneAod reports={mount.reports} />); });
    expect(mount.registration()?.surfaces.map(({ id, kind }) => [id, kind])).toEqual([
      ['aod-figure-video', 'video'],
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
      credit: 'physical-epoch'
    });
    expect(surfaceProbe.activate).toHaveBeenCalledTimes(1);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
    expect(invocation).toMatchObject({
      invocationId: 'activation:1', invoked: true,
      surfaceIds: ['aod-figure-video']
    });
    await expect(invocation?.settlements[0]?.status === 'pending'
      ? invocation.settlements[0].settled : Promise.reject()).resolves.toBeUndefined();
    expect(surfaceProbe.render).toHaveBeenCalledTimes(1);
  });

  it('accepts only the current generation draw and tracks a renewed Canvas', async () => {
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneAod reports={mount.reports} />); });
    const current = reportFixture();
    const commands = mount.registration()!.commands;
    commands.rebind({ reports: current.reports, frameToken: 'aod:frame:1' });
    commands.activate({
      invocationId: 'activation:1', surfaceIds: ['aod-figure-video'],
      credit: 'physical-epoch'
    });
    const initialCanvas = mount.registration()!.surfaces[1]!.element;
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

    const renewed = document.createElement('canvas');
    surfaceProbe.options?.onCanvasRenewed?.(renewed);
    expect(mount.registration()!.surfaces[1]!.element).toBe(renewed);
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
    expect(source).not.toContain('addEventListener(');
  });

  it('settles to the authored AOD hold from either transaction direction', async () => {
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneAod reports={mount.reports} />); });
    const scene = host.querySelector<HTMLElement>('.portrait-scroll-spike__scene--aod')!;
    mount.registration()?.commands.settle(0);
    expect(scene.dataset.portraitAodProgress).toBe('0.0000');
    mount.registration()?.commands.settle(1);
    expect(scene.dataset.portraitAodProgress).toBe('0.0000');
  });
});
