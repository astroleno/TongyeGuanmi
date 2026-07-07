import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Group1Snapshot = {
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
    __r4Group1?: {
      playForward(options?: { buildTimeout?: boolean }): Promise<void>;
      playReverse(options?: { buildTimeout?: boolean }): Promise<void>;
      seek(scene: 'hero' | 'pattern' | 'star-map'): void;
      scrubHeroPattern(progress: number): Promise<void>;
      idempotentCycle(): Promise<void>;
      snapshot(): Group1Snapshot;
    };
  }
}

async function snapshot(page: Page): Promise<Group1Snapshot> {
  return page.evaluate(() => {
    const api = window.__r4Group1;
    if (!api) {
      throw new Error('R4 group1 harness API is not installed');
    }
    return api.snapshot();
  });
}

type Group1VisualSnapshot = {
  activeInkSegments: readonly string[];
  transitions: readonly string[];
  inkOrigins: Record<string, { x: number; y: number }>;
  patternProgress: number;
  patternClipProgress: number;
  patternInkProgress: number;
  largestRingScale: number;
  compactRingScale: number;
  patternCanvasOpacity: number;
  patternCanvasArea: number;
  patternCanvasNonBlankSamples: number;
  patternInkRenderer: string | null;
  heroVideoLoop: boolean | null;
  heroVideoPaused: boolean | null;
  heroVideoAutoplay: boolean | null;
};

async function visualSnapshot(page: Page): Promise<Group1VisualSnapshot> {
  return page.evaluate(() => {
    const patternRoot = document.querySelector<HTMLElement>('[data-r4-scene="pattern"]');
    const patternLayer = patternRoot?.closest<HTMLElement>('[data-stage-layer]');
    const patternStyle = patternRoot ? window.getComputedStyle(patternRoot) : undefined;
    const patternCanvas = document.querySelector<HTMLCanvasElement>('[data-pattern-canvas]');
    const patternCanvasStyle = patternCanvas ? window.getComputedStyle(patternCanvas) : undefined;
    const canvasRect = patternCanvas?.getBoundingClientRect();
    const heroVideo = document.querySelector<HTMLVideoElement>('[data-hero-figure-video]');
    let patternCanvasNonBlankSamples = 0;
    const context = patternCanvas?.getContext('2d');
    if (patternCanvas && context && patternCanvas.width > 0 && patternCanvas.height > 0) {
      for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 8; x += 1) {
          const pixel = context.getImageData(
            Math.min(patternCanvas.width - 1, Math.round((x + 0.5) * patternCanvas.width / 8)),
            Math.min(patternCanvas.height - 1, Math.round((y + 0.5) * patternCanvas.height / 8)),
            1,
            1
          ).data;
          if (pixel[3] > 0 && pixel[0] + pixel[1] + pixel[2] > 0) {
            patternCanvasNonBlankSamples += 1;
          }
        }
      }
    }
    const inkCanvases = [...document.querySelectorAll<HTMLCanvasElement>('[data-r4-ink-segment]')];
    return {
      activeInkSegments: inkCanvases
        .filter((canvas) => canvas.parentElement?.dataset.r4InkActive === 'true')
        .map((canvas) => canvas.dataset.r4InkSegment ?? ''),
      transitions: [...document.querySelectorAll<HTMLElement>('[data-r4-transition]')]
        .map((element) => element.dataset.r4Transition ?? ''),
      inkOrigins: Object.fromEntries(inkCanvases.map((canvas) => [
        canvas.dataset.r4InkSegment ?? '',
        {
          x: Number.parseFloat(canvas.dataset.inkOriginX ?? 'NaN'),
          y: Number.parseFloat(canvas.dataset.inkOriginY ?? 'NaN')
        }
      ])),
      patternProgress: Number.parseFloat(patternRoot?.dataset.patternProgress ?? '0'),
      patternClipProgress: Number.parseFloat(patternLayer?.dataset.r4ClipProgress ?? '0'),
      patternInkProgress: Number.parseFloat(patternLayer?.dataset.r4InkProgress ?? '0'),
      largestRingScale: Number.parseFloat(patternStyle?.getPropertyValue('--r4-pattern-largest-ring-scale') ?? '0'),
      compactRingScale: Number.parseFloat(patternStyle?.getPropertyValue('--r4-pattern-compact-ring-scale') ?? '0'),
      patternCanvasOpacity: Number.parseFloat(patternCanvasStyle?.opacity ?? '0'),
      patternCanvasArea: (canvasRect?.width ?? 0) * (canvasRect?.height ?? 0),
      patternCanvasNonBlankSamples,
      patternInkRenderer: patternRoot?.dataset.patternInkRenderer ?? patternLayer?.dataset.patternInkRenderer ?? null,
      heroVideoLoop: heroVideo?.loop ?? null,
      heroVideoPaused: heroVideo?.paused ?? null,
      heroVideoAutoplay: heroVideo?.autoplay ?? null
    };
  });
}

async function assertFrame(frame: Group1Snapshot): Promise<void> {
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

function writeTrace(name: string, frame: Group1Snapshot): void {
  const artifactDir = resolve(process.cwd(), '..', 'artifacts', 'react-refactor', 'r4-g1');
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(resolve(artifactDir, name), `${JSON.stringify(frame, null, 2)}\n`);
}

test.describe('R4 group1 canonical spine harness', () => {
  test.use({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1
  });

  test('runs forward and reverse with nonblank sampled frames', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/harness/r4-g1');
    await expect(page.getByTestId('r2-stage')).toBeVisible();
    const initialVisual = await visualSnapshot(page);
    expect(initialVisual.heroVideoLoop).toBe(false);
    expect(initialVisual.heroVideoAutoplay).toBe(false);
    expect(initialVisual.heroVideoPaused).toBe(true);

    await page.evaluate(async () => {
      await window.__r4Group1?.scrubHeroPattern(0.2);
    });
    const earlyHeroPattern = await visualSnapshot(page);
    expect(earlyHeroPattern.transitions).toContain('pattern-bloom-hero-scene-ink');
    expect(earlyHeroPattern.patternInkRenderer).toBe('scene');
    expect(earlyHeroPattern.patternProgress).toBe(0);
    expect(earlyHeroPattern.patternCanvasOpacity).toBe(1);
    expect(earlyHeroPattern.patternClipProgress).toBeGreaterThan(0.35);
    expect(earlyHeroPattern.patternClipProgress).toBeLessThan(0.5);
    await page.evaluate(async () => {
      await window.__r4Group1?.scrubHeroPattern(0.5);
    });
    const revealedBloomingPattern = await visualSnapshot(page);
    expect(revealedBloomingPattern.patternClipProgress).toBe(1);
    expect(revealedBloomingPattern.patternInkProgress).toBe(1);
    expect(revealedBloomingPattern.patternProgress).toBeGreaterThan(0.25);
    expect(revealedBloomingPattern.patternProgress).toBeLessThan(0.35);
    await page.evaluate(async () => {
      await window.__r4Group1?.scrubHeroPattern(0);
    });

    await page.evaluate(() => {
      void window.__r4Group1?.playForward();
    });
    await expect.poll(async () => {
      const visual = await visualSnapshot(page);
      return visual.activeInkSegments.includes('hero-pattern');
    }, { timeout: 3_000 }).toBe(true);
    const heroPatternInk = await visualSnapshot(page);
    expect(heroPatternInk.transitions).toContain('pattern-bloom-hero-scene-ink');
    expect(heroPatternInk.patternInkRenderer).toBe('scene');
    expect(heroPatternInk.patternCanvasOpacity).toBe(1);
    expect(heroPatternInk.patternCanvasArea).toBeGreaterThan(100_000);

    const forwardFrames: Group1Snapshot[] = [];
    for (let index = 0; index < 18; index += 1) {
      await page.waitForTimeout(24);
      forwardFrames.push(await snapshot(page));
    }
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('pattern');
    await expect.poll(async () => (await visualSnapshot(page)).patternProgress).toBe(1);
    const compactPattern = await visualSnapshot(page);
    expect(compactPattern.largestRingScale).toBeLessThan(0.12);
    expect(compactPattern.compactRingScale).toBeGreaterThan(0.2);
    expect(compactPattern.patternCanvasNonBlankSamples).toBeGreaterThan(0);

    await page.evaluate(() => {
      void window.__r4Group1?.playForward();
    });
    await expect.poll(async () => {
      const visual = await visualSnapshot(page);
      return visual.activeInkSegments.includes('pattern-star-map');
    }, { timeout: 3_000 }).toBe(true);
    const patternStarMapInk = await visualSnapshot(page);
    expect(patternStarMapInk.transitions).toContain('pattern-bloom-star-map-scene-ink');
    expect(patternStarMapInk.patternInkRenderer).toBe('scene');
    expect(patternStarMapInk.inkOrigins['pattern-star-map']?.x).toBeCloseTo(0.24, 2);
    expect(patternStarMapInk.inkOrigins['pattern-star-map']?.y).toBeCloseTo(0.55, 2);
    expect(patternStarMapInk.patternProgress).toBe(1);

    for (let index = 0; index < 18; index += 1) {
      await page.waitForTimeout(24);
      forwardFrames.push(await snapshot(page));
    }
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('star-map');

    await page.evaluate(() => {
      void window.__r4Group1?.playReverse();
    });
    const reverseFrames: Group1Snapshot[] = [];
    for (let index = 0; index < 18; index += 1) {
      await page.waitForTimeout(24);
      reverseFrames.push(await snapshot(page));
    }
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('pattern');

    for (const frame of [...forwardFrames, ...reverseFrames]) {
      await assertFrame(frame);
    }

    const finalFrame = await snapshot(page);
    writeTrace('group1-forward-reverse-trace.json', finalFrame);
    expect(finalFrame.phase).toBe('hold');
    expect(finalFrame.visibleCount).toBe(1);
    expect(finalFrame.interactableCount).toBe(1);
  });

  test('covers reduced motion and 0 to 1 to 0 to 1 replay', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/harness/r4-g1-hero-pattern');
    await expect(page.getByTestId('r2-stage')).toBeVisible();
    await expect(page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)).resolves.toBe(true);

    await page.evaluate(async () => {
      await window.__r4Group1?.idempotentCycle();
    });

    const frame = await snapshot(page);
    writeTrace('group1-reduced-motion-trace.json', frame);
    expect(frame.phase).toBe('hold');
    expect(frame.window.current).toBe('pattern');
    expect(frame.visibleCount).toBe(1);
    expect(frame.interactableCount).toBe(1);
  });

  test('recovers from build timeout without locking the current hold', async ({ page }) => {
    await page.goto('/harness/r4-g1');
    await expect(page.getByTestId('r2-stage')).toBeVisible();

    await page.evaluate(async () => {
      await window.__r4Group1?.playForward({ buildTimeout: true });
    });

    const frame = await snapshot(page);
    expect(frame.phase).toBe('hold');
    expect(frame.window.current).toBe('hero');
    expect(frame.interactableCount).toBe(1);
    expect(frame.recoveryCount).toBe(1);
    expect(frame.eventLog).toContain('BUILD_TIMEOUT:hero-pattern');
  });
});
