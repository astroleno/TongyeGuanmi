import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Group6Snapshot = {
  phase: 'hold' | 'preparing' | 'playing' | 'recovering';
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
  transitions: readonly string[];
  phProgress: number;
  phBgTransform: string;
  phFrontTransform: string;
  phFigureTransform: string;
  phVideos: readonly { loop: boolean; paused: boolean; currentTime: number }[];
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
    const inkCanvases = [...document.querySelectorAll<HTMLCanvasElement>('[data-r4-ink-segment]')];
    return {
      activeInkSegments: inkCanvases
        .filter((canvas) => canvas.parentElement?.dataset.r4InkActive === 'true')
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
      educationProgress: Number.parseFloat(educationRoot?.dataset.educationProgress ?? '0'),
      educationRows: document.querySelectorAll('.r4-education__row').length,
      educationScheme: window.getComputedStyle(educationRoot ?? document.body).colorScheme,
      educationTop: educationRoot?.getBoundingClientRect().top ?? Number.NaN,
      educationWideTop: educationWide?.getBoundingClientRect().top ?? Number.NaN,
      educationVerticalTop: educationVertical?.getBoundingClientRect().top ?? Number.NaN,
      viewportHeight: window.innerHeight,
      labReference: document.querySelector<HTMLElement>('[data-r4-reference-scene="true"]') !== null,
      revealProgress: Number.parseFloat(revealLayer?.dataset.r4RevealProgress ?? '0'),
      revealClip: revealLayer ? window.getComputedStyle(revealLayer).clipPath : 'none'
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
        && visual.transitions.includes('lab-ph-sun-radial-ink')
        && visual.revealProgress > 0
        && visual.revealProgress < 1
        && visual.revealClip !== 'none';
    }
    expect(sawLabPhReveal).toBe(true);
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('ph-animation');
    const phHold = await visualSnapshot(page);
    expect(phHold.phProgress).toBe(1);
    expect(phHold.phVideos).toHaveLength(1);
    expect(phHold.phVideos.every((video) => video.loop === false && video.paused)).toBe(true);
    expect(phHold.phBgTransform).not.toBe('none');
    expect(phHold.phFrontTransform).not.toBe('none');
    expect(phHold.phFigureTransform).not.toBe('none');

    await page.evaluate(() => {
      void window.__r4Group6?.playForward();
    });
    let sawPhEducationReveal = false;
    for (let index = 0; index < 18; index += 1) {
      await page.waitForTimeout(24);
      frames.push(await snapshot(page));
      const visual = await visualSnapshot(page);
      sawPhEducationReveal ||= visual.activeInkSegments.includes('ph-education')
        && visual.transitions.includes('ph-education-top-ink')
        && visual.revealProgress > 0
        && visual.revealProgress < 1
        && visual.revealClip !== 'none';
    }
    expect(sawPhEducationReveal).toBe(true);
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('education');
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
      await window.__r4Group6?.idempotentCycle();
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
