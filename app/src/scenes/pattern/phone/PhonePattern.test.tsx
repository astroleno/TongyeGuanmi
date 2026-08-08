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

const rendererProbe = vi.hoisted(() => ({
  instances: [] as Array<{
    destroy: ReturnType<typeof vi.fn>;
    prepareStaticFrame: ReturnType<typeof vi.fn>;
    setFrameProgress: ReturnType<typeof vi.fn>;
    setRenderActive: ReturnType<typeof vi.fn>;
    renderProgress: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
  }>
}));

vi.mock('../patternBloomRenderer', async () => {
  const actual = await vi.importActual<typeof import('../patternBloomRenderer')>(
    '../patternBloomRenderer'
  );
  return {
    ...actual,
    PatternBloomRenderer: vi.fn(() => {
      const instance = {
        destroy: vi.fn(),
        prepareStaticFrame: vi.fn().mockResolvedValue(undefined),
        setFrameProgress: vi.fn(),
        setRenderActive: vi.fn(),
        renderProgress: vi.fn(),
        start: vi.fn().mockResolvedValue(undefined)
      };
      rendererProbe.instances.push(instance);
      return instance;
    })
  };
});

import { PhonePattern, phonePatternFrame } from './PhonePattern';

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

describe('clean PhonePattern leaf', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    rendererProbe.instances = [];
    host = document.createElement('div');
    document.body.replaceChildren(host);
    root = createRoot(host);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  it('registers one image surface and reports decode only after the accepted composite draw', async () => {
    const mount = reportFixture();
    await act(async () => { root.render(<PhonePattern reports={mount.reports} />); });

    expect(mount.registration()?.surfaces.map(({ id, kind }) => [id, kind])).toEqual([
      ['pattern-image', 'image']
    ]);
    expect(Object.keys(mount.registration()?.commands ?? {}).sort()).toEqual([
      'activate', 'dispose', 'pause', 'rebind', 'render', 'settle'
    ]);
    const current = reportFixture();
    const renderActiveCalls = rendererProbe.instances[0]?.setRenderActive.mock.calls.length ?? 0;
    mount.registration()?.commands.rebind({
      reports: current.reports,
      frameToken: 'pattern:frame:1'
    });
    expect(rendererProbe.instances[0]?.setRenderActive.mock.calls.length)
      .toBe(renderActiveCalls);
    expect(current.reports.reportPrepared).not.toHaveBeenCalled();

    await act(async () => {
      host.querySelector('img')?.dispatchEvent(new Event('load'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(rendererProbe.instances[0]?.prepareStaticFrame).toHaveBeenCalledTimes(1);
    expect(current.reports.reportPrepared).toHaveBeenCalledWith(
      'pattern-image',
      expect.objectContaining({
        kind: 'image-decoded', ready: true,
        detail: { imageDecoded: true, rendererCompositeDrawn: true }
      })
    );
  });

  it('lets the Bloom field and copy share one structural-collapse progress while base illumination stays', async () => {
    const mount = reportFixture();
    await act(async () => { root.render(<PhonePattern reports={mount.reports} />); });
    mount.registration()?.commands.render(0.78);
    const frame = phonePatternFrame(0.78);
    expect(frame.copyProgress).toBe(0.78);
    expect(host.querySelector<HTMLElement>('.portrait-scroll-spike__pattern-copy')?.style.opacity)
      .toBe('0.78');
    expect(frame.textureOpacity).toBeCloseTo(0.22, 6);
    expect(frame.washOpacity).toBe(0.54);
    expect(host.querySelector<HTMLElement>('.portrait-scroll-spike__pattern-plate')?.style.opacity)
      .toBe('');
    expect(host.querySelector<HTMLImageElement>('.portrait-scroll-spike__pattern-image')?.style.opacity)
      .toBe('0.22');
    expect(host.querySelector<HTMLElement>('.portrait-scroll-spike__pattern-motion')?.style.transform)
      .toBe('');
    expect(rendererProbe.instances[0]?.setFrameProgress).toHaveBeenLastCalledWith(0.78, 0.78);
  });

  it('settles to the same readable Pattern hold from either direction', async () => {
    const mount = reportFixture();
    await act(async () => { root.render(<PhonePattern reports={mount.reports} />); });
    mount.registration()?.commands.settle(0);
    expect(host.querySelector<HTMLElement>('.portrait-scroll-spike__pattern-copy')?.style.opacity)
      .toBe('0');
    expect(rendererProbe.instances[0]?.setFrameProgress).toHaveBeenLastCalledWith(0, 0);
    expect(rendererProbe.instances[0]?.renderProgress).toHaveBeenLastCalledWith(0);
    expect(rendererProbe.instances[0]?.setRenderActive).toHaveBeenLastCalledWith(true, true);
    mount.registration()?.commands.settle(1);
    expect(host.querySelector<HTMLElement>('.portrait-scroll-spike__pattern-copy')?.style.opacity)
      .toBe('1');
    expect(rendererProbe.instances[0]?.setFrameProgress).toHaveBeenLastCalledWith(1, 1);
    expect(rendererProbe.instances[0]?.renderProgress).toHaveBeenLastCalledWith(1);
    expect(rendererProbe.instances[0]?.setRenderActive).toHaveBeenLastCalledWith(true, true);
  });

  it('keeps ambient motion active for incoming, collapsed, and stable Pattern commands', async () => {
    const mount = reportFixture();
    await act(async () => { root.render(<PhonePattern reports={mount.reports} />); });
    const commands = mount.registration()!.commands;
    commands.render(0);
    commands.settle(0);
    expect(rendererProbe.instances[0]?.setRenderActive).toHaveBeenLastCalledWith(true, true);
    commands.render(1);
    expect(rendererProbe.instances[0]?.setRenderActive).toHaveBeenLastCalledWith(true, true);
    commands.pause('outside-closure');
    expect(rendererProbe.instances[0]?.setRenderActive).toHaveBeenLastCalledWith(false, false);
  });

  it('renders the reducer-owned structural frame once and stops RAF for reduced motion', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true })
    });
    const mount = reportFixture();
    await act(async () => { root.render(<PhonePattern reports={mount.reports} />); });
    mount.registration()?.commands.render(.5);
    expect(rendererProbe.instances[0]?.setRenderActive).toHaveBeenCalledWith(true, false);
    expect(rendererProbe.instances[0]?.renderProgress).toHaveBeenLastCalledWith(.5);
    expect(rendererProbe.instances[0]?.setRenderActive).toHaveBeenLastCalledWith(false, false);
  });

  it('keeps edge ownership global and contains no scene-specific concealment', () => {
    const css = readFileSync(resolve(
      process.cwd(), 'src/scenes/pattern/phone/PhonePattern.css'
    ), 'utf8');
    expect(css).not.toMatch(/pattern-motion::(?:before|after)/);
    expect(css).not.toMatch(/bottom:\s*-\d/);
    expect(css).not.toMatch(/overscan|toolbar-edge/);
    expect(css).toMatch(/\.portrait-scroll-spike__pattern-plate\s*\{[^}]*background:\s*#d9c08f/s);
    expect(css).not.toMatch(/\.portrait-scroll-spike__pattern-plate\s*\{[^}]*will-change:\s*opacity/s);
    expect(css).toMatch(/\.portrait-scroll-spike__pattern-image\s*\{[^}]*will-change:\s*opacity/s);
    expect(css).not.toMatch(/pattern-motion\s*\{[^}]*transform-origin/s);
  });
});
