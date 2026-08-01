// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  PhoneLeafCommandHandle,
  PhoneLeafMountRegistration,
  PhoneLeafReportPort
} from '../../../production/phone-story/presentation';

const compositorProbe = vi.hoisted(() => ({
  callbacks: [] as Array<() => void>
}));

vi.mock('../../../media/packed-alpha-video', async () => {
  const actual = await vi.importActual<typeof import('../../../media/packed-alpha-video')>(
    '../../../media/packed-alpha-video'
  );
  return {
    ...actual,
    createPackedAlphaVideoCompositor: vi.fn((options: { onFrame?: () => void }) => {
      if (options.onFrame) compositorProbe.callbacks.push(options.onFrame);
      return {
        render: () => true,
        setActive: () => undefined,
        dispose: () => undefined
      };
    })
  };
});

import { PhoneHero } from './PhoneHero';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const source = readFileSync(resolve(process.cwd(), 'src/scenes/hero/phone/PhoneHero.tsx'), 'utf8');
const css = readFileSync(resolve(process.cwd(), 'src/scenes/hero/phone/PhoneHero.css'), 'utf8');

function reportFixture() {
  let registration: PhoneLeafMountRegistration | null = null;
  const reports = {
    registerMount: vi.fn((next: PhoneLeafMountRegistration) => {
      registration = next;
    }),
    reportPrepared: vi.fn(),
    reportFrame: vi.fn(),
    reportProgress: vi.fn(),
    reportComplete: vi.fn(),
    reportFailure: vi.fn()
  } satisfies PhoneLeafReportPort;
  return {
    reports,
    registration: () => registration as PhoneLeafMountRegistration | null
  };
}

describe('clean PhoneHero leaf', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    compositorProbe.callbacks = [];
    host = document.createElement('div');
    document.body.replaceChildren(host);
    root = createRoot(host);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  it('commits the canonical fixed Hero topology at progress zero before layout effects', async () => {
    const fixture = reportFixture();
    await act(async () => {
      root.render(<PhoneHero reports={fixture.reports} />);
    });

    const hero = host.querySelector<HTMLElement>('.portrait-scroll-spike__scene--hero');
    expect(hero).not.toBeNull();
    expect(hero?.style.getPropertyValue('--r4-hero-progress')).toBe('0.0000');
    expect(hero?.style.getPropertyValue('--r4-hero-middle-intro')).toBe('0.0000');
    expect(hero?.style.getPropertyValue('--r4-hero-figure-intro')).toBe('0.0000');
    expect(hero?.querySelector('#portrait-spike-home')).not.toBeNull();
    expect(hero?.querySelector('[data-portrait-figure-video]')).not.toBeNull();
    expect(hero?.querySelector('[data-portrait-figure-canvas]')).not.toBeNull();
    expect(hero?.querySelector('[data-portrait-hero-intro-ink]')).not.toBeNull();
    expect(fixture.reports.registerMount).toHaveBeenCalledTimes(1);
  });

  it('registers the exact manifest surfaces and exposes only the closed command seam', async () => {
    const fixture = reportFixture();
    await act(async () => {
      root.render(<PhoneHero reports={fixture.reports} />);
    });

    const registration = fixture.registration();
    expect(registration).not.toBeNull();
    expect(registration?.surfaces.map(({ id, kind }) => [id, kind])).toEqual([
      ['hero-back-image', 'image'],
      ['hero-middle-image', 'image'],
      ['hero-figure-poster', 'image'],
      ['hero-figure-video', 'video'],
      ['hero-figure-canvas', 'canvas-webgl'],
      ['hero-intro-ink', 'canvas-2d']
    ]);
    expect(Object.keys(registration?.commands ?? {}).sort()).toEqual([
      'activate', 'dispose', 'pause', 'rebind', 'render', 'settle'
    ]);
  });

  it('uses the current generation token and never lets a retired token prove a frame', async () => {
    const fixture = reportFixture();
    await act(async () => {
      root.render(<PhoneHero reports={fixture.reports} />);
    });
    const commands = fixture.registration()?.commands as PhoneLeafCommandHandle;
    const firstReports = reportFixture().reports;
    const secondReports = reportFixture().reports;
    commands.rebind({ reports: firstReports, frameToken: 'hero:frame:1' });
    commands.rebind({ reports: secondReports, frameToken: 'hero:frame:2' });

    await act(async () => {
      for (const image of host.querySelectorAll('img')) image.dispatchEvent(new Event('load'));
      await Promise.resolve();
    });
    expect(compositorProbe.callbacks).toHaveLength(2);
    compositorProbe.callbacks[0]?.();

    expect(firstReports.reportFrame).not.toHaveBeenCalled();
    expect(secondReports.reportFrame).not.toHaveBeenCalled();
    compositorProbe.callbacks[1]?.();
    expect(secondReports.reportFrame).toHaveBeenCalledWith(
      'hero-figure-canvas',
      expect.objectContaining({ kind: 'frame', token: 'hero:frame:2', presented: true })
    );
  });

  it('keeps a boot projection at zero visible when the forward hold settles', async () => {
    const fixture = reportFixture();
    await act(async () => {
      root.render(<PhoneHero reports={fixture.reports} />);
    });
    const commands = fixture.registration()?.commands as PhoneLeafCommandHandle;
    const copy = host.querySelector<HTMLElement>('.portrait-scroll-spike__hero-copy')!;

    commands.render(0);
    expect(Number(copy.style.opacity)).toBe(1);
    commands.settle(1);

    expect(Number(copy.style.opacity)).toBe(1);
  });

  it('keeps the migration leaf free of legacy authority and adopts the reviewed subtitle font', () => {
    expect(source).not.toMatch(/production\/phone\/(?:types|runtime|usePhone|phone-media)/);
    expect(source).not.toMatch(/addEventListener\(['"](?:pointer|touch|deviceorientation|wheel|keydown)/);
    expect(source).not.toContain('setTimeout(');
    expect(css).toContain('font-family: var(--font-sans)');
    expect(css).not.toContain('font-family: var(--font-traditional)');
  });
});
