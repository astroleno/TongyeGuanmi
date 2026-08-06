// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  PhoneLeafMountRegistration,
  PhoneLeafReportPort
} from '../../../production/phone-story/presentation';

const revealProbe = vi.hoisted(() => ({
  instance: null as null | {
    ready: boolean;
    dispose: ReturnType<typeof vi.fn>;
    renderBackground: ReturnType<typeof vi.fn>;
  }
}));

vi.mock('../starFieldReveal', () => ({
  initStarFieldReveal: vi.fn(() => {
    const instance = {
      ready: false,
      dispose: vi.fn(),
      renderBackground: vi.fn()
    };
    revealProbe.instance = instance;
    return instance;
  })
}));

import {
  PhoneStarMap,
  phoneStarMapAmbientLayer,
  phoneStarMapFrame
} from './PhoneStarMap';

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

describe('clean PhoneStarMap leaf', () => {
  let host: HTMLDivElement;
  let root: Root;
  let frames: FrameRequestCallback[];

  beforeEach(() => {
    revealProbe.instance = null;
    frames = [];
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    host = document.createElement('div');
    Object.defineProperties(host, {
      clientWidth: { value: 390 }, clientHeight: { value: 844 }
    });
    document.body.replaceChildren(host);
    root = createRoot(host);
  });

  it('registers one 2D Canvas and proves only a real current-generation draw', async () => {
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneStarMap reports={mount.reports} />); });
    expect(mount.registration()?.surfaces.map(({ id, kind }) => [id, kind])).toEqual([
      ['star-map-canvas', 'canvas-2d']
    ]);
    expect(Object.keys(mount.registration()?.commands ?? {}).sort()).toEqual([
      'activate', 'dispose', 'pause', 'rebind', 'render', 'settle'
    ]);
    const current = reportFixture();
    mount.registration()?.commands.rebind({
      reports: current.reports, frameToken: 'star:frame:1'
    });
    expect(current.reports.reportFrame).not.toHaveBeenCalled();

    revealProbe.instance!.ready = true;
    await act(async () => { frames.shift()?.(16); });
    expect(revealProbe.instance?.renderBackground).toHaveBeenCalledWith(
      expect.objectContaining({
        camera: { rotationDegrees: -90, zoom: 1 }, drawSource: true
      })
    );
    expect(current.reports.reportFrame).toHaveBeenCalledWith(
      'star-map-canvas',
      expect.objectContaining({ token: 'star:frame:1', presented: true })
    );
  });

  it('uses one fully readable stable hold at either transaction endpoint', async () => {
    expect(phoneStarMapFrame(0)).toMatchObject({ progress: 0, opacity: 0 });
    expect(phoneStarMapFrame(1)).toMatchObject({ progress: 1, opacity: 1 });
    const mount = reportFixture();
    await act(async () => { root.render(<PhoneStarMap reports={mount.reports} />); });
    mount.registration()?.commands.settle(0);
    expect(host.querySelector<HTMLElement>('.portrait-scroll-spike__star-copy')?.style.opacity)
      .toBe('1');
    mount.registration()?.commands.settle(1);
    expect(host.querySelector<HTMLElement>('.portrait-scroll-spike__star-copy')?.style.opacity)
      .toBe('1');
  });

  it('gives only the ambient Perlin layer a visible breathing range over its 4.4s cycle', () => {
    const layers = [0, 1.1, 2.2].map((seconds) => (
      phoneStarMapAmbientLayer(seconds, false)
    ));
    const strengths = layers.map(({ strength }) => strength);
    const noiseFloors = layers.map(({ noiseFloor }) => noiseFloor);

    expect(Math.max(...strengths) - Math.min(...strengths)).toBeGreaterThan(0.4);
    expect(Math.max(...noiseFloors) - Math.min(...noiseFloors)).toBeGreaterThan(0.1);
    expect(phoneStarMapAmbientLayer(2.2, true)).toEqual({ strength: .72, noiseFloor: .02 });
  });
});
