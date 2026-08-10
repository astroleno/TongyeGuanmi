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

import {
  PHONE_HERO_MIGRATION_CONTROL,
  PhoneHero,
  type PhoneHeroMigrationCommands
} from './PhoneHero';

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
      'activate', 'dispose', 'pause', 'rebind', 'render', 'setMediaPhase', 'settle'
    ]);
  });

  it('has no deprecated static-video preparation seam on Hero', async () => {
    const fixture = reportFixture();
    await act(async () => {
      root.render(<PhoneHero reports={fixture.reports} />);
    });
    const commands = fixture.registration()?.commands as PhoneLeafCommandHandle;
    expect(commands).not.toHaveProperty('prepare');
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it('primes the same native video element during activation before formal playback', async () => {
    const fixture = reportFixture();
    await act(async () => {
      root.render(<PhoneHero reports={fixture.reports} />);
    });
    const commands = fixture.registration()?.commands as PhoneLeafCommandHandle;
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    const pause = vi.mocked(HTMLMediaElement.prototype.pause);
    const invocation = commands.activate({
      invocationId: 'hero:prime:1',
      surfaceIds: ['hero-figure-video'],
      credit: 'physical-epoch',
      runToken: 'hero:run:1',
      direction: 'forward',
      stageIndex: 0
    });

    expect(invocation.invoked).toBe(true);
    expect(play).toHaveBeenCalledOnce();
    expect(pause).toHaveBeenCalled();
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

  it('starts stable-idle Figure1 for a freshly mounted reverse Hero-pattern arrival', async () => {
    const fixture = reportFixture();
    await act(async () => {
      root.render(<PhoneHero reports={fixture.reports} />);
    });
    const video = host.querySelector<HTMLVideoElement>('[data-portrait-figure-video]');
    const scene = host.querySelector<HTMLElement>('.portrait-scroll-spike__scene--hero');
    if (!video || !scene) throw new Error('missing reverse Hero arrival surface');
    Object.defineProperty(video, 'readyState', { configurable: true, value: 2 });
    const commands = fixture.registration()?.commands as PhoneHeroMigrationCommands;
    commands.rebind({
      reports: fixture.reports,
      frameToken: 'hero:pattern:reverse:1',
      segmentId: 'hero-pattern',
      direction: 'reverse'
    });

    await act(async () => {
      commands.settle(0);
    });

    expect(scene.dataset.portraitHeroEntrance).toBe('complete');
    expect(video.dataset.phoneFigurePlayback).toBe('autoplay');
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();

    commands.setMediaPhase?.({
      phase: 'primed', runToken: 'hero:pattern:reverse:1', direction: 'reverse', stageIndex: 0
    });
    commands.setMediaPhase?.({
      phase: 'held', runToken: 'hero:pattern:reverse:1', direction: 'reverse', stageIndex: 0,
      endpoint: 0
    });
    expect(video.dataset.phoneFigurePlayback).toBe('autoplay');
  });

  it('starts the authored Figure1 ambient clock after the visible Hero entrance settles', async () => {
    const fixture = reportFixture();
    await act(async () => {
      root.render(<PhoneHero reports={fixture.reports} />);
    });
    const video = host.querySelector<HTMLVideoElement>('[data-portrait-figure-video]');
    if (!video) throw new Error('missing Hero Figure1 video');
    Object.defineProperty(video, 'readyState', { configurable: true, value: 2 });
    const commands = fixture.registration()?.commands as PhoneHeroMigrationCommands;

    await act(async () => {
      commands.settle(1);
      commands[PHONE_HERO_MIGRATION_CONTROL].completeEntrance();
    });

    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    expect(video.dataset.phoneFigurePlayback).toBe('autoplay');
  });

  it('restarts stable-idle Figure1 playback when a completed Hero returns from lifecycle pause', async () => {
    const fixture = reportFixture();
    await act(async () => {
      root.render(<PhoneHero reports={fixture.reports} />);
    });
    const video = host.querySelector<HTMLVideoElement>('[data-portrait-figure-video]');
    if (!video) throw new Error('missing Hero Figure1 video');
    Object.defineProperty(video, 'readyState', { configurable: true, value: 2 });
    const commands = fixture.registration()?.commands as PhoneHeroMigrationCommands;
    const play = vi.mocked(HTMLMediaElement.prototype.play);

    await act(async () => {
      commands.settle(1);
      commands[PHONE_HERO_MIGRATION_CONTROL].completeEntrance();
    });
    expect(video.dataset.phoneFigurePlayback).toBe('autoplay');

    commands.pause('hidden');
    play.mockClear();
    await act(async () => {
      commands.settle(0);
    });

    expect(play).toHaveBeenCalledOnce();
    expect(video.dataset.phoneFigurePlayback).toBe('autoplay');
  });

  it('completes a running Hero entrance when lifecycle recovery interrupts it', async () => {
    const fixture = reportFixture();
    await act(async () => {
      root.render(<PhoneHero reports={fixture.reports} />);
    });
    const video = host.querySelector<HTMLVideoElement>('[data-portrait-figure-video]');
    const scene = host.querySelector<HTMLElement>('.portrait-scroll-spike__scene--hero');
    if (!video || !scene) throw new Error('missing Hero lifecycle surface');
    Object.defineProperty(video, 'readyState', { configurable: true, value: 2 });
    const commands = fixture.registration()?.commands as PhoneHeroMigrationCommands;

    commands.settle(1);
    expect(scene.dataset.portraitHeroEntrance).toBe('playing');

    commands.pause('hidden');
    await act(async () => {
      commands.settle(0);
    });

    expect(scene.dataset.portraitHeroEntrance).toBe('complete');
    expect(video.dataset.phoneFigurePlayback).toBe('autoplay');
  });

  it('keeps the migration leaf free of legacy authority and adopts the reviewed subtitle font', () => {
    expect(source).not.toMatch(/production\/phone\/(?:types|runtime|usePhone|phone-media)/);
    expect(source).not.toMatch(/addEventListener\(['"](?:pointer|touch|deviceorientation|wheel|keydown)/);
    expect(source).not.toContain('setTimeout(');
    expect(css).toContain('font-family: var(--font-sans)');
    expect(css).not.toContain('font-family: var(--font-traditional)');
  });
});
