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
import type {
  PhonePackedAlphaSurfaceFrameReceipt,
  PhonePackedAlphaSurfaceFrameRequest,
  PhonePackedAlphaSurfaceOptions
} from '../../../media/phone-packed-alpha-surface';

const surfaceProbe = vi.hoisted(() => ({
  options: null as null | PhonePackedAlphaSurfaceOptions,
  activeCanvas: null as HTMLCanvasElement | null,
  activeGeneration: 0,
  activate: vi.fn((() => {
    surfaceProbe.activeCanvas = surfaceProbe.options?.canvas ?? null;
    surfaceProbe.activeGeneration = 1;
    return surfaceProbe.activeGeneration;
  }) as () => number),
  presentFrame: vi.fn(async (
    request: PhonePackedAlphaSurfaceFrameRequest
  ): Promise<PhonePackedAlphaSurfaceFrameReceipt> => {
    const map = request.frameMap;
    const progress = Math.min(1, Math.max(0, request.desiredProgress));
    const desiredFrameIndex = progress === 0
      ? map.startFrame
      : progress === 1
        ? map.endFrame
        : Math.round(map.startFrame + progress * (map.endFrame - map.startFrame));
    const canvas = surfaceProbe.activeCanvas ?? surfaceProbe.options?.canvas;
    if (!canvas) throw new Error('missing Hero packed-alpha canvas');
    surfaceProbe.options?.onFrame?.({
      canvas,
      generation: surfaceProbe.activeGeneration,
      frameIndex: desiredFrameIndex,
      mediaTimeSeconds: map.firstPtsSeconds
        + desiredFrameIndex / map.fpsNumerator * map.fpsDenominator
    });
    return {
      status: 'presented', runId: request.runId, sequence: request.sequence,
      desiredFrameIndex, presentedFrameIndex: desiredFrameIndex,
      mediaTimeSeconds: map.firstPtsSeconds
        + desiredFrameIndex / map.fpsNumerator * map.fpsDenominator,
      presentedProgress: progress, evidence: 'packed-canvas-draw', canvas,
      generation: surfaceProbe.activeGeneration
    };
  }),
  setMode: vi.fn(),
  probe: vi.fn(() => true),
  release: vi.fn(),
  dispose: vi.fn()
}));

vi.mock('../../../media/phone-packed-alpha-surface', () => ({
  createPhonePackedAlphaSurface: vi.fn((options: PhonePackedAlphaSurfaceOptions) => {
    surfaceProbe.options = options;
    return {
      activate: surfaceProbe.activate,
      presentFrame: surfaceProbe.presentFrame,
      setMode: surfaceProbe.setMode,
      probe: surfaceProbe.probe,
      render: vi.fn(() => true),
      release: surfaceProbe.release,
      dispose: surfaceProbe.dispose
    };
  })
}));

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
    surfaceProbe.options = null;
    surfaceProbe.activeCanvas = null;
    surfaceProbe.activeGeneration = 0;
    surfaceProbe.activate.mockReset().mockImplementation(() => {
      surfaceProbe.activeCanvas = surfaceProbe.options?.canvas ?? null;
      surfaceProbe.activeGeneration = 1;
      return surfaceProbe.activeGeneration;
    });
    surfaceProbe.presentFrame.mockReset().mockImplementation(async (
      request: PhonePackedAlphaSurfaceFrameRequest
    ): Promise<PhonePackedAlphaSurfaceFrameReceipt> => {
      const map = request.frameMap;
      const progress = Math.min(1, Math.max(0, request.desiredProgress));
      const desiredFrameIndex = progress === 0
        ? map.startFrame
        : progress === 1
          ? map.endFrame
          : Math.round(map.startFrame + progress * (map.endFrame - map.startFrame));
      const canvas = surfaceProbe.activeCanvas ?? surfaceProbe.options?.canvas;
      if (!canvas) throw new Error('missing Hero packed-alpha canvas');
      if (canvas) canvas.dataset.packedAlphaFrameReady = 'true';
      surfaceProbe.options?.onFrame?.({
        canvas,
        generation: surfaceProbe.activeGeneration,
        frameIndex: desiredFrameIndex,
        mediaTimeSeconds: map.firstPtsSeconds
          + desiredFrameIndex / map.fpsNumerator * map.fpsDenominator
      });
      return {
        status: 'presented', runId: request.runId, sequence: request.sequence,
        desiredFrameIndex, presentedFrameIndex: desiredFrameIndex,
        mediaTimeSeconds: map.firstPtsSeconds
          + desiredFrameIndex / map.fpsNumerator * map.fpsDenominator,
        presentedProgress: progress, evidence: 'packed-canvas-draw', canvas,
        generation: surfaceProbe.activeGeneration
      };
    });
    surfaceProbe.setMode.mockReset();
    surfaceProbe.probe.mockReset().mockReturnValue(true);
    surfaceProbe.release.mockReset();
    surfaceProbe.dispose.mockReset();
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
      'activate', 'dispose', 'pause', 'presentFrame', 'rebind', 'render',
      'setMediaPhase', 'settle'
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

  it('activates the reverse endpoint and presents an exact mapped Figure1 frame', async () => {
    const fixture = reportFixture();
    await act(async () => {
      root.render(<PhoneHero reports={fixture.reports} />);
    });
    const commands = fixture.registration()?.commands as PhoneLeafCommandHandle;
    const frameToken = 'hero:pattern:reverse:prime';
    commands.rebind({
      reports: fixture.reports,
      frameToken,
      transactionId: 'hero:pattern:reverse',
      segmentId: 'hero-pattern',
      direction: 'reverse'
    });

    const invocation = commands.activate({
      invocationId: 'hero:reverse:prime',
      surfaceIds: ['hero-figure-video'],
      credit: 'physical-epoch',
      runToken: 'hero:pattern:reverse',
      direction: 'reverse',
      stageIndex: 0
    });
    expect(invocation.invoked).toBe(true);
    expect(surfaceProbe.activate).toHaveBeenCalledWith('endpoint');
    const receipt = await commands.presentFrame?.({
      frameToken,
      transactionId: 'hero:pattern:reverse',
      direction: -1,
      sequence: 1,
      desiredProgress: .8,
      signal: new AbortController().signal
    });
    expect(receipt).toMatchObject({
      status: 'presented', frameToken, sequence: 1,
      desiredProgress: .8, presentedProgress: expect.closeTo(38 / 48, 5),
      evidence: 'packed-canvas-draw'
    });
    expect(surfaceProbe.presentFrame).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'hero:pattern:reverse', direction: -1, sequence: 1,
      desiredProgress: .8, frameMap: expect.objectContaining({ frameCount: 49 })
    }));
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
    commands.activate({
      invocationId: 'hero:frame:activation', surfaceIds: ['hero-figure-video'],
      credit: 'physical-epoch', playback: false
    });
    commands.rebind({ reports: secondReports, frameToken: 'hero:frame:2' });

    await act(async () => {
      for (const image of host.querySelectorAll('img')) image.dispatchEvent(new Event('load'));
      await Promise.resolve();
    });
    expect(firstReports.reportFrame).not.toHaveBeenCalled();
    expect(secondReports.reportFrame).not.toHaveBeenCalled();
    const canvas = host.querySelector<HTMLCanvasElement>('[data-portrait-figure-canvas]')!;
    canvas.dataset.packedAlphaFrameReady = 'true';
    surfaceProbe.options?.onFrame?.({
      canvas, generation: 0, frameIndex: 0, mediaTimeSeconds: 0
    });
    expect(secondReports.reportFrame).not.toHaveBeenCalled();
    surfaceProbe.options?.onFrame?.({
      canvas, generation: 1, frameIndex: 0, mediaTimeSeconds: 0
    });
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

  it('keeps Figure1 static for a freshly mounted reverse Hero-pattern arrival', async () => {
    const fixture = reportFixture();
    await act(async () => {
      root.render(<PhoneHero reports={fixture.reports} />);
    });
    const video = host.querySelector<HTMLVideoElement>('[data-portrait-figure-video]');
    const scene = host.querySelector<HTMLElement>('.portrait-scroll-spike__scene--hero');
    if (!video || !scene) throw new Error('missing reverse Hero arrival surface');
    const commands = fixture.registration()?.commands as PhoneHeroMigrationCommands;
    commands.rebind({
      reports: fixture.reports,
      frameToken: 'hero:pattern:reverse:1',
      transactionId: 'hero:pattern:reverse',
      segmentId: 'hero-pattern',
      direction: 'reverse'
    });

    await act(async () => {
      commands.settle(0);
    });

    expect(scene.dataset.portraitHeroEntrance).toBe('complete');
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();

    commands.setMediaPhase?.({
      phase: 'primed', runToken: 'hero:pattern:reverse:1', direction: 'reverse', stageIndex: 0
    });
    commands.setMediaPhase?.({
      phase: 'held', runToken: 'hero:pattern:reverse:1', direction: 'reverse', stageIndex: 0,
      endpoint: 0
    });
    expect(surfaceProbe.presentFrame).not.toHaveBeenCalled();
  });

  it('does not activate or seek the media surface for a static Hero entrance', async () => {
    const fixture = reportFixture();
    await act(async () => {
      root.render(<PhoneHero reports={fixture.reports} />);
    });
    const video = host.querySelector<HTMLVideoElement>('[data-portrait-figure-video]');
    if (!video) throw new Error('missing Hero Figure1 video');
    const commands = fixture.registration()?.commands as PhoneHeroMigrationCommands;

    await act(async () => {
      commands.settle(1);
      commands[PHONE_HERO_MIGRATION_CONTROL].completeEntrance();
    });

    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(surfaceProbe.activate).not.toHaveBeenCalled();
    expect(surfaceProbe.presentFrame).not.toHaveBeenCalled();
  });

  it('keeps Hero render visual-only while exact media frames use the presenter command', async () => {
    const fixture = reportFixture();
    await act(async () => {
      root.render(<PhoneHero reports={fixture.reports} />);
    });
    const video = host.querySelector<HTMLVideoElement>('[data-portrait-figure-video]');
    if (!video) throw new Error('missing Hero Figure1 video');
    const commands = fixture.registration()?.commands as PhoneHeroMigrationCommands;
    const frameToken = 'hero:pattern:frame-lock:1';
    commands.rebind({
      reports: fixture.reports,
      frameToken,
      transactionId: 'hero:pattern:frame-lock',
      segmentId: 'hero-pattern',
      direction: 'forward'
    });

    commands.render(.3);
    commands.render(.8);
    commands.render(1);

    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(surfaceProbe.presentFrame).not.toHaveBeenCalled();
    expect(surfaceProbe.probe).not.toHaveBeenCalled();

    const invocation = commands.activate({
      invocationId: 'hero:pattern:frame-lock:activation',
      surfaceIds: ['hero-figure-video'], credit: 'physical-epoch', playback: false,
      runToken: 'hero:pattern:frame-lock', direction: 'forward'
    });
    expect(invocation.invoked).toBe(true);
    const receipt = await commands.presentFrame?.({
      frameToken,
      transactionId: 'hero:pattern:frame-lock',
      direction: 1, sequence: 1, desiredProgress: .3,
      signal: new AbortController().signal
    });
    expect(receipt?.status).toBe('presented');
    expect(surfaceProbe.presentFrame).toHaveBeenCalledTimes(1);
  });

  it('reports a frame only from the active Canvas generation after activation', async () => {
    const fixture = reportFixture();
    await act(async () => {
      root.render(<PhoneHero reports={fixture.reports} />);
    });
    const scene = host.querySelector<HTMLElement>('.portrait-scroll-spike__scene--hero');
    if (!scene) throw new Error('missing Hero scene');
    const commands = fixture.registration()?.commands as PhoneHeroMigrationCommands;
    commands.rebind({
      reports: fixture.reports, frameToken: 'hero:cold:visible:1',
      transactionId: 'hero:cold:visible'
    });

    commands.activate({
      invocationId: 'hero:cold:visible:activation',
      surfaceIds: ['hero-figure-video'], credit: 'physical-epoch', playback: false
    });
    const canvas = host.querySelector<HTMLCanvasElement>('[data-portrait-figure-canvas]')!;
    canvas.dataset.packedAlphaFrameReady = 'true';
    surfaceProbe.options?.onFrame?.({
      canvas, generation: 1, frameIndex: 0, mediaTimeSeconds: 0
    });

    expect(surfaceProbe.activate).toHaveBeenCalledWith('initial');
    expect(scene.querySelector('.portrait-scroll-spike__hero-figure-parallax')
      ?.getAttribute('data-portrait-figure-frame')).toBe('ready');
  });

  it('keeps Figure1 static when a completed Hero returns from lifecycle pause', async () => {
    const fixture = reportFixture();
    await act(async () => {
      root.render(<PhoneHero reports={fixture.reports} />);
    });
    const video = host.querySelector<HTMLVideoElement>('[data-portrait-figure-video]');
    if (!video) throw new Error('missing Hero Figure1 video');
    const commands = fixture.registration()?.commands as PhoneHeroMigrationCommands;
    const play = vi.mocked(HTMLMediaElement.prototype.play);

    await act(async () => {
      commands.settle(1);
      commands[PHONE_HERO_MIGRATION_CONTROL].completeEntrance();
    });
    expect(surfaceProbe.activate).not.toHaveBeenCalled();

    commands.pause('hidden');
    play.mockClear();
    await act(async () => {
      commands.settle(0);
    });

    expect(play).not.toHaveBeenCalled();
    expect(surfaceProbe.activate).not.toHaveBeenCalled();
  });

  it('completes a running Hero entrance when lifecycle recovery interrupts it', async () => {
    const fixture = reportFixture();
    await act(async () => {
      root.render(<PhoneHero reports={fixture.reports} />);
    });
    const video = host.querySelector<HTMLVideoElement>('[data-portrait-figure-video]');
    const scene = host.querySelector<HTMLElement>('.portrait-scroll-spike__scene--hero');
    if (!video || !scene) throw new Error('missing Hero lifecycle surface');
    const commands = fixture.registration()?.commands as PhoneHeroMigrationCommands;

    commands.settle(1);
    expect(scene.dataset.portraitHeroEntrance).toBe('playing');

    commands.pause('hidden');
    await act(async () => {
      commands.settle(0);
    });

    expect(scene.dataset.portraitHeroEntrance).toBe('complete');
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it('keeps the migration leaf free of legacy authority and adopts the reviewed subtitle font', () => {
    expect(source).not.toMatch(/production\/phone\/(?:types|runtime|usePhone|phone-media)/);
    expect(source).not.toMatch(/addEventListener\(['"](?:pointer|touch|deviceorientation|wheel|keydown)/);
    expect(source).not.toContain('setTimeout(');
    expect(css).toContain('font-family: var(--font-sans)');
    expect(css).not.toContain('font-family: var(--font-traditional)');
  });
});
