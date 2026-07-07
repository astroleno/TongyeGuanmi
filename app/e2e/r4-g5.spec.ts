import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Group5Snapshot = {
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
    __r4Group5?: {
      playForward(options?: { buildTimeout?: boolean }): Promise<void>;
      playReverse(options?: { buildTimeout?: boolean }): Promise<void>;
      seek(scene: 'services' | 'ttg-animation' | 'lab'): void;
      idempotentCycle(): Promise<void>;
      snapshot(): Group5Snapshot;
    };
  }
}

async function snapshot(page: Page): Promise<Group5Snapshot> {
  return page.evaluate(() => {
    const api = window.__r4Group5;
    if (!api) {
      throw new Error('R4 group5 harness API is not installed');
    }
    return api.snapshot();
  });
}

type Group5VisualSnapshot = {
  activeInkSegments: readonly string[];
  transitions: readonly string[];
  ttgProgress: number;
  ttgBgTransform: string;
  ttgFigureTransform: string;
  ttgVideos: readonly { loop: boolean; paused: boolean; currentTime: number }[];
  ttgPlaybackDirection: string | undefined;
  labProgress: number;
  labRows: number;
  labTop: number;
  labWideTop: number;
  labPortraitTop: number;
  viewportHeight: number;
  servicesReference: boolean;
  revealProgress: number;
  revealClip: string;
};

async function visualSnapshot(page: Page): Promise<Group5VisualSnapshot> {
  return page.evaluate(() => {
    const ttgRoot = document.querySelector<HTMLElement>('[data-r4-scene="ttg-animation"]');
    const bgLayer = document.querySelector<HTMLElement>('.r4-ttg-animation .ttg-layer--bg');
    const figureLayer = document.querySelector<HTMLElement>('.r4-ttg-animation .ttg-layer--figure.is-active');
    const labRoot = document.querySelector<HTMLElement>('[data-r4-scene="lab"]');
    const labWide = document.querySelector<HTMLElement>('.r4-lab__wide');
    const labPortrait = document.querySelector<HTMLElement>('.r4-lab__portrait');
    const revealLayer = [...document.querySelectorAll<HTMLElement>('[data-r4-reveal-progress]')]
      .find((element) => element.dataset.r4InkActive === 'true') ?? null;
    const inkCanvases = [...document.querySelectorAll<HTMLCanvasElement>('[data-r4-ink-segment]')];
    return {
      activeInkSegments: inkCanvases
        .filter((canvas) => canvas.parentElement?.dataset.r4InkActive === 'true')
        .map((canvas) => canvas.dataset.r4InkSegment ?? ''),
      transitions: [...document.querySelectorAll<HTMLElement>('[data-r4-transition]')]
        .map((element) => element.dataset.r4Transition ?? ''),
      ttgProgress: Number.parseFloat(ttgRoot?.dataset.ttgProgress ?? '0'),
      ttgBgTransform: window.getComputedStyle(bgLayer ?? document.body).transform,
      ttgFigureTransform: window.getComputedStyle(figureLayer ?? document.body).transform,
      ttgVideos: [...document.querySelectorAll<HTMLVideoElement>('[data-ttg-figure-video], [data-ttg-figure-video-reverse]')].map((video) => ({
        loop: video.loop,
        paused: video.paused,
        currentTime: video.currentTime
      })),
      ttgPlaybackDirection: ttgRoot?.dataset.ttgPlaybackDirection,
      labProgress: Number.parseFloat(labRoot?.dataset.labProgress ?? '0'),
      labRows: document.querySelectorAll('.r4-lab__row').length,
      labTop: labRoot?.getBoundingClientRect().top ?? Number.NaN,
      labWideTop: labWide?.getBoundingClientRect().top ?? Number.NaN,
      labPortraitTop: labPortrait?.getBoundingClientRect().top ?? Number.NaN,
      viewportHeight: window.innerHeight,
      servicesReference: document.querySelector<HTMLElement>('[data-r4-reference-scene="true"]') !== null,
      revealProgress: Number.parseFloat(revealLayer?.dataset.r4RevealProgress ?? '0'),
      revealClip: revealLayer ? window.getComputedStyle(revealLayer).clipPath : 'none'
    };
  });
}

async function assertFrame(frame: Group5Snapshot): Promise<void> {
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

function writeTrace(name: string, frame: Group5Snapshot): void {
  const artifactDir = resolve(process.cwd(), '..', 'artifacts', 'react-refactor', 'r4-g5');
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(resolve(artifactDir, name), `${JSON.stringify(frame, null, 2)}\n`);
}

test.describe('R4 group5 services ttg lab harness', () => {
  test.use({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1
  });

  test('runs forward and reverse with nonblank sampled frames', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/harness/r4-g5');
    await expect(page.getByTestId('r2-stage')).toBeVisible();
    expect((await visualSnapshot(page)).servicesReference).toBe(false);

    await page.evaluate(() => {
      void window.__r4Group5?.playForward();
    });
    const frames: Group5Snapshot[] = [];
    let sawServicesTtgReveal = false;
    for (let index = 0; index < 18; index += 1) {
      await page.waitForTimeout(24);
      frames.push(await snapshot(page));
      if (index === 5) {
        const visual = await visualSnapshot(page);
        expect(visual.activeInkSegments).toContain('services-ttg');
        expect(visual.transitions).toContain('services-ttg-bottom-ink');
        expect(visual.revealProgress).toBeGreaterThan(0);
        expect(visual.revealProgress).toBeLessThan(1);
        expect(visual.revealClip).not.toBe('none');
        expect(visual.ttgPlaybackDirection).toBe('1');
      }
      const visual = await visualSnapshot(page);
      sawServicesTtgReveal ||= visual.activeInkSegments.includes('services-ttg')
        && visual.revealProgress > 0
        && visual.revealProgress < 1
        && visual.revealClip !== 'none';
    }
    expect(sawServicesTtgReveal).toBe(true);
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('ttg-animation');
    const ttgHold = await visualSnapshot(page);
    expect(ttgHold.ttgProgress).toBe(1);
    expect(ttgHold.ttgVideos).toHaveLength(2);
    expect(ttgHold.ttgVideos.every((video) => video.loop === false && video.paused)).toBe(true);
    expect(ttgHold.ttgBgTransform).not.toBe('none');
    expect(ttgHold.ttgFigureTransform).not.toBe('none');

    await page.evaluate(() => {
      void window.__r4Group5?.playForward();
    });
    let sawTtgLabReveal = false;
    for (let index = 0; index < 18; index += 1) {
      await page.waitForTimeout(24);
      frames.push(await snapshot(page));
      const visual = await visualSnapshot(page);
      sawTtgLabReveal ||= visual.activeInkSegments.includes('ttg-lab')
        && visual.transitions.includes('ttg-lab-top-ink')
        && visual.revealProgress > 0
        && visual.revealProgress < 1
        && visual.revealClip !== 'none';
    }
    expect(sawTtgLabReveal).toBe(true);
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('lab');
    const labHold = await visualSnapshot(page);
    expect(labHold.labProgress).toBe(1);
    expect(labHold.labRows).toBe(6);
    expect(Math.abs(labHold.labTop)).toBeLessThan(1);
    expect(labHold.labWideTop).toBeGreaterThanOrEqual(0);
    expect(labHold.labWideTop).toBeLessThan(100);
    expect(labHold.labPortraitTop).toBeGreaterThan(labHold.viewportHeight - 16);

    await page.evaluate(() => {
      void window.__r4Group5?.playReverse();
    });
    const reverseFrames: Group5Snapshot[] = [];
    for (let index = 0; index < 18; index += 1) {
      await page.waitForTimeout(24);
      reverseFrames.push(await snapshot(page));
    }
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('ttg-animation');

    for (const frame of [...frames, ...reverseFrames]) {
      await assertFrame(frame);
    }

    const finalFrame = await snapshot(page);
    writeTrace('group5-forward-reverse-trace.json', finalFrame);
    expect(finalFrame.phase).toBe('hold');
    expect(finalFrame.visibleCount).toBe(1);
    expect(finalFrame.interactableCount).toBe(1);
  });

  test('covers reduced motion and 0 to 1 to 0 to 1 replay', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/harness/r4-g5-ttg-lab');
    await expect(page.getByTestId('r2-stage')).toBeVisible();
    await expect(page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)).resolves.toBe(true);

    await page.evaluate(async () => {
      await window.__r4Group5?.idempotentCycle();
    });

    const frame = await snapshot(page);
    writeTrace('group5-reduced-motion-trace.json', frame);
    expect(frame.phase).toBe('hold');
    expect(frame.window.current).toBe('lab');
    expect(frame.visibleCount).toBe(1);
    expect(frame.interactableCount).toBe(1);
  });

  test('recovers from build timeout and supports seek', async ({ page }) => {
    await page.goto('/harness/r4-g5');
    await expect(page.getByTestId('r2-stage')).toBeVisible();

    await page.evaluate(async () => {
      await window.__r4Group5?.playForward({ buildTimeout: true });
    });

    const recovered = await snapshot(page);
    expect(recovered.phase).toBe('hold');
    expect(recovered.window.current).toBe('services');
    expect(recovered.recoveryCount).toBe(1);
    expect(recovered.eventLog).toContain('BUILD_TIMEOUT:services-ttg');

    await page.evaluate(() => {
      window.__r4Group5?.seek('lab');
    });
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('lab');
  });
});
