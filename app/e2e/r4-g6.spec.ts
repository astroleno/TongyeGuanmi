import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Group6Snapshot = {
  phase: 'hold' | 'preparing' | 'playing' | 'staged-paused' | 'recovering';
  mode: string;
  window: { current: string; retiring: readonly string[] };
  visibleCount: number;
  interactableCount: number;
  mountedCount: number;
  eventLog: readonly string[];
  recoveryCount: number;
  staleCompletionIgnored: number;
  layers: readonly {
    scene: string;
    role: string;
    visible: boolean;
    interactable: boolean;
    opacity: number;
  }[];
};

declare global {
  interface Window {
    __r4Group6?: {
      playForward(options?: { buildTimeout?: boolean }): Promise<void>;
      playReverse(options?: { buildTimeout?: boolean }): Promise<void>;
      seek(scene: 'lab' | 'ph-animation' | 'education'): void;
      idempotentCycle(): Promise<void>;
      snapshot(): Group6Snapshot;
    };
  }
}

async function snapshot(page: Page): Promise<Group6Snapshot> {
  return page.evaluate(() => {
    const api = window.__r4Group6;
    if (!api) {
      throw new Error('R4 group6 harness API is not installed');
    }
    return api.snapshot();
  });
}

type Group6VisualSnapshot = {
  activeInkSegments: readonly string[];
  shaderBodyInkSegments: readonly string[];
  transitions: readonly string[];
  phProgress: number;
  phBgTransform: string;
  phFrontTransform: string;
  phFigureTransform: string;
  phVideos: readonly { loop: boolean; paused: boolean; currentTime: number }[];
  phPlaybackActive: string | undefined;
  phPlaybackDirection: string | undefined;
  educationProgress: number;
  educationRows: number;
  educationScheme: string;
  educationTop: number;
  educationWideTop: number;
  educationVerticalTop: number;
  viewportHeight: number;
  labReference: boolean;
  revealProgress: number;
  revealClip: string;
  revealMask: string;
  revealMode: string | undefined;
};

async function visualSnapshot(page: Page): Promise<Group6VisualSnapshot> {
  return page.evaluate(() => {
    const phRoot = document.querySelector<HTMLElement>('[data-r4-scene="ph-animation"]');
    const bgLayer = document.querySelector<HTMLElement>('.r4-ph-animation .ph-bg');
    const frontLayer = document.querySelector<HTMLElement>('.r4-ph-animation .ph-layer--front');
    const figureLayer = document.querySelector<HTMLElement>('.r4-ph-animation .ph-layer--figure');
    const educationRoot = document.querySelector<HTMLElement>('[data-r4-scene="education"]');
    const educationWide = document.querySelector<HTMLElement>('.r4-education__wide');
    const educationVertical = document.querySelector<HTMLElement>('.r4-education__vertical');
    const revealLayer = [...document.querySelectorAll<HTMLElement>('[data-r4-reveal-progress]')]
      .find((element) => element.dataset.r4InkActive === 'true') ?? null;
    const revealStyle = revealLayer ? window.getComputedStyle(revealLayer) : null;
    const inkCanvases = [...document.querySelectorAll<HTMLCanvasElement>('[data-r4-ink-segment]')];
    return {
      activeInkSegments: inkCanvases
        .filter((canvas) => canvas.dataset.r4InkActive === 'true' || canvas.parentElement?.dataset.r4InkActive === 'true')
        .map((canvas) => canvas.dataset.r4InkSegment ?? ''),
      shaderBodyInkSegments: inkCanvases
        .filter((canvas) => canvas.dataset.r4InkBoundary === 'shader-body' && canvas.dataset.r4InkTargetReady === 'true')
        .map((canvas) => canvas.dataset.r4InkSegment ?? ''),
      transitions: [...document.querySelectorAll<HTMLElement>('[data-r4-transition]')]
        .map((element) => element.dataset.r4Transition ?? ''),
      phProgress: Number.parseFloat(phRoot?.dataset.phProgress ?? '0'),
      phBgTransform: window.getComputedStyle(bgLayer ?? document.body).transform,
      phFrontTransform: window.getComputedStyle(frontLayer ?? document.body).transform,
      phFigureTransform: window.getComputedStyle(figureLayer ?? document.body).transform,
      phVideos: [...document.querySelectorAll<HTMLVideoElement>('[data-ph-alpha-video]')].map((video) => ({
        loop: video.loop,
        paused: video.paused,
        currentTime: video.currentTime
      })),
      phPlaybackActive: phRoot?.dataset.phPlaybackActive,
      phPlaybackDirection: phRoot?.dataset.phPlaybackDirection,
      educationProgress: Number.parseFloat(educationRoot?.dataset.educationProgress ?? '0'),
      educationRows: document.querySelectorAll('.r4-education__row').length,
      educationScheme: window.getComputedStyle(educationRoot ?? document.body).colorScheme,
      educationTop: educationRoot?.getBoundingClientRect().top ?? Number.NaN,
      educationWideTop: educationWide?.getBoundingClientRect().top ?? Number.NaN,
      educationVerticalTop: educationVertical?.getBoundingClientRect().top ?? Number.NaN,
      viewportHeight: window.innerHeight,
      labReference: document.querySelector<HTMLElement>('[data-r4-reference-scene="true"]') !== null,
      revealProgress: Number.parseFloat(revealLayer?.dataset.r4RevealProgress ?? '0'),
      revealClip: revealStyle?.clipPath ?? 'none',
      revealMask: revealStyle?.getPropertyValue('-webkit-mask-image') || revealStyle?.getPropertyValue('mask-image') || 'none',
      revealMode: revealLayer?.dataset.r4RevealMode
    };
  });
}

async function assertFrame(frame: Group6Snapshot): Promise<void> {
  expect(frame.visibleCount).toBeGreaterThan(0);
  expect(frame.visibleCount).toBeLessThanOrEqual(2);
  expect(frame.interactableCount).toBeLessThanOrEqual(1);
  if (frame.phase === 'playing') {
    expect(frame.interactableCount).toBe(0);
  }
  if (frame.phase === 'hold') {
    expect(frame.interactableCount).toBe(1);
  }
}

function writeTrace(name: string, frame: Group6Snapshot): void {
  const artifactDir = resolve(process.cwd(), '..', 'artifacts', 'react-refactor', 'r4-g6');
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(resolve(artifactDir, name), `${JSON.stringify(frame, null, 2)}\n`);
}

test.describe('R4 group6 lab ph education harness', () => {
  test.use({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1
  });

  test('runs forward and reverse with nonblank sampled frames', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/harness/r4-g6');
    await expect(page.getByTestId('r2-stage')).toBeVisible();
    expect((await visualSnapshot(page)).labReference).toBe(false);

    await page.evaluate(() => {
      void window.__r4Group6?.playForward();
    });
    const frames: Group6Snapshot[] = [];
    let sawLabPhReveal = false;
    for (let index = 0; index < 18; index += 1) {
      await page.waitForTimeout(24);
      frames.push(await snapshot(page));
      const visual = await visualSnapshot(page);
      sawLabPhReveal ||= visual.activeInkSegments.includes('lab-ph')
        && visual.transitions.includes('lab-ph-top-ink')
        && visual.revealProgress > 0
        && visual.revealProgress < 1
        && visual.revealMode === 'ink-body'
        && visual.revealClip === 'none'
        && visual.revealMask === 'none'
        && visual.shaderBodyInkSegments.includes('lab-ph')
        && visual.phProgress === 0;
    }
    expect(sawLabPhReveal).toBe(true);
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('ph-animation');
    const phHold = await visualSnapshot(page);
    expect(phHold.phProgress).toBe(0);
    expect(phHold.phVideos).toHaveLength(1);
    expect(phHold.phVideos.every((video) => video.loop === false && video.paused)).toBe(true);
    expect(phHold.phBgTransform).not.toBe('none');
    expect(phHold.phFrontTransform).not.toBe('none');
    expect(phHold.phFigureTransform).not.toBe('none');

    await page.evaluate(() => {
      void window.__r4Group6?.playForward();
    });
    let sawPhTimelinePlayback = false;
    for (let index = 0; index < 18; index += 1) {
      await page.waitForTimeout(24);
      frames.push(await snapshot(page));
      const visual = await visualSnapshot(page);
      sawPhTimelinePlayback ||= visual.activeInkSegments.includes('ph-education') === false
        && visual.phProgress > 0
        && visual.phProgress < 1
        && visual.phPlaybackActive === 'true'
        && visual.phVideos.some((video) => video.paused && video.currentTime > 0.02);
    }
    if (!sawPhTimelinePlayback) {
      await expect.poll(async () => {
        const visual = await visualSnapshot(page);
        return visual.phPlaybackActive === 'true'
          && visual.phProgress > 0
          && visual.phProgress < 1
          && visual.phVideos.some((video) => video.paused && video.currentTime > 0.02);
      }, { timeout: 5_000, intervals: [20] }).toBe(true);
      sawPhTimelinePlayback = true;
    }
    expect(sawPhTimelinePlayback).toBe(true);
    await expect.poll(async () => (await snapshot(page)).phase).toBe('staged-paused');
    const phTerminalPause = await visualSnapshot(page);
    expect(phTerminalPause.phProgress).toBe(1);
    expect(phTerminalPause.activeInkSegments).not.toContain('ph-education');

    await page.evaluate(() => {
      const evidenceWindow = window as Window & {
        __phEducationInkEvidence?: {
          segment: string;
          boundary: string;
          targetReady: string;
          mode: string;
          clip: string;
          mask: string;
          transition: string;
          revealProgress: string;
          phProgress: string;
          playbackActive: string;
        };
      };
      delete evidenceWindow.__phEducationInkEvidence;
      const sampleInkFrame = () => {
        const canvas = document.querySelector<HTMLCanvasElement>('[data-r4-ink-segment="ph-education"]');
        const receiver = document.querySelector<HTMLElement>('[data-stage-layer="education"]');
        const ph = document.querySelector<HTMLElement>('[data-r4-scene="ph-animation"]');
        const revealProgress = Number.parseFloat(receiver?.dataset.r4RevealProgress ?? '0');
        if (
          canvas?.dataset.r4InkActive === 'true'
          && receiver?.dataset.r4RevealMode === 'ink-body'
          && revealProgress > 0
          && revealProgress < 1
        ) {
          const style = window.getComputedStyle(receiver);
          evidenceWindow.__phEducationInkEvidence = {
            segment: canvas.dataset.r4InkSegment ?? '',
            boundary: canvas.dataset.r4InkBoundary ?? '',
            targetReady: canvas.dataset.r4InkTargetReady ?? '',
            mode: receiver.dataset.r4RevealMode ?? '',
            clip: style.clipPath,
            mask: style.maskImage,
            transition: receiver.dataset.r4Transition ?? '',
            revealProgress: receiver.dataset.r4RevealProgress ?? '',
            phProgress: ph?.dataset.phProgress ?? '',
            playbackActive: ph?.dataset.phPlaybackActive ?? ''
          };
          return;
        }
        window.requestAnimationFrame(sampleInkFrame);
      };
      window.requestAnimationFrame(sampleInkFrame);
      void window.__r4Group6?.playForward();
    });
    for (let index = 0; index < 18; index += 1) {
      await page.waitForTimeout(24);
      frames.push(await snapshot(page));
    }
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('education');
    const phEducationInkEvidence = await page.evaluate(() => (
      window as Window & { __phEducationInkEvidence?: Record<string, string> }
    ).__phEducationInkEvidence);
    expect(phEducationInkEvidence).toMatchObject({
      segment: 'ph-education',
      boundary: 'shader-body',
      targetReady: 'true',
      mode: 'ink-body',
      clip: 'none',
      mask: 'none',
      transition: 'ph-education-top-ink',
      phProgress: '1.0000',
      playbackActive: 'false'
    });
    const phEducationRevealProgress = Number.parseFloat(phEducationInkEvidence?.revealProgress ?? '0');
    expect(phEducationRevealProgress).toBeGreaterThan(0);
    expect(phEducationRevealProgress).toBeLessThan(1);
    const educationHold = await visualSnapshot(page);
    expect(educationHold.educationProgress).toBe(1);
    expect(educationHold.educationRows).toBe(4);
    expect(educationHold.educationScheme).toContain('light');
    expect(Math.abs(educationHold.educationTop)).toBeLessThan(1);
    expect(educationHold.educationWideTop).toBeGreaterThanOrEqual(0);
    expect(educationHold.educationWideTop).toBeLessThan(100);
    expect(educationHold.educationVerticalTop).toBeGreaterThan(educationHold.viewportHeight - 16);

    await page.evaluate(() => {
      void window.__r4Group6?.playReverse();
    });
    const reverseFrames: Group6Snapshot[] = [];
    for (let index = 0; index < 18; index += 1) {
      await page.waitForTimeout(24);
      reverseFrames.push(await snapshot(page));
    }
    await expect.poll(async () => (await snapshot(page)).phase).toBe('staged-paused');
    const phReverseStart = await visualSnapshot(page);
    const terminalTime = phReverseStart.phVideos[0]?.currentTime ?? 0;
    await page.evaluate(() => {
      void window.__r4Group6?.playReverse();
    });
    let sawPhReversePlayback = false;
    for (let index = 0; index < 18; index += 1) {
      await page.waitForTimeout(24);
      reverseFrames.push(await snapshot(page));
      const visual = await visualSnapshot(page);
      sawPhReversePlayback ||= visual.phPlaybackDirection === '-1'
        && visual.phProgress > 0
        && visual.phProgress < 1
        && (visual.phVideos[0]?.currentTime ?? terminalTime) < terminalTime - 0.02;
    }
    expect(sawPhReversePlayback).toBe(true);
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('ph-animation');

    for (const frame of [...frames, ...reverseFrames]) {
      await assertFrame(frame);
    }

    const finalFrame = await snapshot(page);
    writeTrace('group6-forward-reverse-trace.json', finalFrame);
    expect(finalFrame.phase).toBe('hold');
    expect(finalFrame.visibleCount).toBe(1);
    expect(finalFrame.interactableCount).toBe(1);
  });

  test('covers reduced motion and 0 to 1 to 0 to 1 replay', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/harness/r4-g6-ph-education');
    await expect(page.getByTestId('r2-stage')).toBeVisible();
    await expect(page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)).resolves.toBe(true);

    await page.evaluate(async () => {
      await window.__r4Group6?.playForward();
      await window.__r4Group6?.playForward();
      await window.__r4Group6?.playReverse();
      await window.__r4Group6?.playReverse();
      await window.__r4Group6?.playForward();
      await window.__r4Group6?.playForward();
    });

    const frame = await snapshot(page);
    writeTrace('group6-reduced-motion-trace.json', frame);
    expect(frame.phase).toBe('hold');
    expect(frame.window.current).toBe('education');
    expect(frame.visibleCount).toBe(1);
    expect(frame.interactableCount).toBe(1);
  });

  test('recovers from build timeout and supports seek', async ({ page }) => {
    await page.goto('/harness/r4-g6');
    await expect(page.getByTestId('r2-stage')).toBeVisible();

    await page.evaluate(async () => {
      await window.__r4Group6?.playForward({ buildTimeout: true });
    });

    const recovered = await snapshot(page);
    expect(recovered.phase).toBe('hold');
    expect(recovered.window.current).toBe('lab');
    expect(recovered.recoveryCount).toBe(1);
    expect(recovered.eventLog).toContain('BUILD_TIMEOUT:lab-ph');

    await page.evaluate(() => {
      window.__r4Group6?.seek('education');
    });
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('education');
  });
});
