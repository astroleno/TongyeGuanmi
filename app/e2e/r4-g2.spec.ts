import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Group2Snapshot = {
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
    __r4Group2?: {
      playForward(options?: { buildTimeout?: boolean }): Promise<void>;
      playReverse(options?: { buildTimeout?: boolean }): Promise<void>;
      seek(scene: 'method-top' | 'method-bottom' | 'figure2-animation'): void;
      idempotentCycle(): Promise<void>;
      snapshot(): Group2Snapshot;
    };
  }
}

async function snapshot(page: Page): Promise<Group2Snapshot> {
  return page.evaluate(() => {
    const api = window.__r4Group2;
    if (!api) {
      throw new Error('R4 group2 harness API is not installed');
    }
    return api.snapshot();
  });
}

type Group2VisualSnapshot = {
  activeInkSegments: readonly string[];
  transitions: readonly string[];
  inkOrigins: Record<string, { x: number; y: number }>;
  figure2Progress: number;
  cloudScale: number;
  farArcadeScale: number;
  nearArchBlurPx: number;
  figureScale: number;
  figureWidth: number;
  farArcadeImageCount: number;
  cloudCount: number;
  methodContinuationLeadCount: number;
  visibleCaptionCount: number;
  methodBottomLayerZ: number;
  figure2LayerZ: number;
  figure2LayerClipPath: string;
  figure2LayerElevated: boolean;
  videos: readonly { loop: boolean; paused: boolean; currentTime: number }[];
};

async function visualSnapshot(page: Page): Promise<Group2VisualSnapshot> {
  return page.evaluate(() => {
    const figureRoot = document.querySelector<HTMLElement>('[data-r4-scene="figure2-animation"]');
    const methodBottomLayer = document.querySelector<HTMLElement>('[data-stage-layer="method-bottom"]');
    const figure2Layer = figureRoot?.closest<HTMLElement>('[data-stage-layer]');
    const figureStyle = figureRoot ? window.getComputedStyle(figureRoot) : undefined;
    const figure = document.querySelector<HTMLElement>('.r4-figure2__figure');
    const figureRect = figure?.getBoundingClientRect();
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
      figure2Progress: Number.parseFloat(figureRoot?.dataset.figure2Progress ?? '0'),
      cloudScale: Number.parseFloat(figureStyle?.getPropertyValue('--r4-figure2-cloud-scale') ?? '0'),
      farArcadeScale: Number.parseFloat(figureStyle?.getPropertyValue('--r4-figure2-far-arcade-scale') ?? '0'),
      nearArchBlurPx: Number.parseFloat(figureStyle?.getPropertyValue('--r4-figure2-near-arch-blur') ?? '0'),
      figureScale: Number.parseFloat(figureStyle?.getPropertyValue('--r4-figure2-figure-scale') ?? '0'),
      figureWidth: figureRect?.width ?? 0,
      farArcadeImageCount: document.querySelectorAll('.r4-figure2__far-arcade img').length,
      cloudCount: document.querySelectorAll('.r4-figure2__cloud').length,
      methodContinuationLeadCount: document.querySelectorAll('.r4-method-bottom__lead').length,
      visibleCaptionCount: [...document.querySelectorAll<HTMLElement>('.r4-figure2__figure figcaption')]
        .filter((caption) => {
          const rect = caption.getBoundingClientRect();
          const style = window.getComputedStyle(caption);
          return rect.width > 1.5 || rect.height > 1.5 || style.overflow !== 'hidden' || style.clip === 'auto';
        }).length,
      methodBottomLayerZ: Number.parseInt(window.getComputedStyle(methodBottomLayer ?? document.body).zIndex || '0', 10),
      figure2LayerZ: Number.parseInt(window.getComputedStyle(figure2Layer ?? document.body).zIndex || '0', 10),
      figure2LayerClipPath: window.getComputedStyle(figure2Layer ?? document.body).clipPath,
      figure2LayerElevated: figure2Layer?.dataset.r4TransitionElevated === 'true',
      videos: [...document.querySelectorAll<HTMLVideoElement>('[data-figure2-video]')].map((video) => ({
        loop: video.loop,
        paused: video.paused,
        currentTime: video.currentTime
      }))
    };
  });
}

async function assertFrame(frame: Group2Snapshot): Promise<void> {
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

function writeTrace(name: string, frame: Group2Snapshot): void {
  const artifactDir = resolve(process.cwd(), '..', 'artifacts', 'react-refactor', 'r4-g2');
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(resolve(artifactDir, name), `${JSON.stringify(frame, null, 2)}\n`);
}

test.describe('R4 group2 canonical spine harness', () => {
  test.use({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1
  });

  test('runs forward and reverse with nonblank sampled frames', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/harness/r4-g2');
    await expect(page.getByTestId('r2-stage')).toBeVisible();

    await page.evaluate(() => {
      void window.__r4Group2?.playForward();
    });
    const forwardFrames: Group2Snapshot[] = [];
    for (let index = 0; index < 18; index += 1) {
      await page.waitForTimeout(24);
      const frame = await snapshot(page);
      forwardFrames.push(frame);
      if (index === 5) {
        const methodTop = frame.layers.find((layer) => layer.scene === 'method-top');
        const methodBottom = frame.layers.find((layer) => layer.scene === 'method-bottom');
        expect(methodTop).toMatchObject({ visible: true, opacity: 1 });
        expect(methodBottom).toMatchObject({ visible: true, opacity: 1 });
      }
    }
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('method-bottom');
    const methodBottomHold = await visualSnapshot(page);
    expect(methodBottomHold.methodContinuationLeadCount).toBe(1);

    await page.evaluate(() => {
      void window.__r4Group2?.playForward();
    });
    await expect.poll(async () => {
      const visual = await visualSnapshot(page);
      return visual.activeInkSegments.includes('method-bottom-figure2');
    }, { timeout: 3_000 }).toBe(true);
    const methodFigureInk = await visualSnapshot(page);
    expect(methodFigureInk.activeInkSegments).toContain('method-bottom-figure2');
    expect(methodFigureInk.figure2LayerElevated).toBe(false);
    expect(methodFigureInk.figure2LayerZ).toBeLessThan(methodFigureInk.methodBottomLayerZ);
    expect(methodFigureInk.figure2LayerClipPath).toBe('none');
    expect(methodFigureInk.inkOrigins['method-bottom-figure2']?.x).toBeCloseTo(0.5, 2);
    expect(methodFigureInk.inkOrigins['method-bottom-figure2']?.y).toBeCloseTo(1.04, 2);
    expect(methodFigureInk.figure2Progress).toBe(0);
    expect(methodFigureInk.videos).toHaveLength(2);
    expect(methodFigureInk.videos.every((video) => video.loop === false)).toBe(true);

    for (let index = 0; index < 18; index += 1) {
      await page.waitForTimeout(24);
      forwardFrames.push(await snapshot(page));
    }
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('figure2-animation');
    const figure2Hold = await visualSnapshot(page);
    expect(figure2Hold.figure2Progress).toBe(1);
    expect(figure2Hold.farArcadeImageCount).toBe(3);
    expect(figure2Hold.cloudCount).toBe(1);
    expect(figure2Hold.cloudScale).toBeGreaterThan(1.08);
    expect(figure2Hold.farArcadeScale).toBeGreaterThan(1.18);
    expect(figure2Hold.nearArchBlurPx).toBeGreaterThan(3);
    expect(figure2Hold.figureScale).toBeGreaterThan(1.02);
    expect(figure2Hold.figureWidth).toBeGreaterThan(153);
    expect(figure2Hold.figureWidth).toBeLessThan(261);
    expect(figure2Hold.visibleCaptionCount).toBe(0);
    expect(figure2Hold.videos.every((video) => video.loop === false && video.paused && video.currentTime > 0)).toBe(true);

    await page.evaluate(() => {
      void window.__r4Group2?.playReverse();
    });
    const reverseFrames: Group2Snapshot[] = [];
    for (let index = 0; index < 18; index += 1) {
      await page.waitForTimeout(24);
      reverseFrames.push(await snapshot(page));
    }
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('method-bottom');

    for (const frame of [...forwardFrames, ...reverseFrames]) {
      await assertFrame(frame);
    }

    const finalFrame = await snapshot(page);
    writeTrace('group2-forward-reverse-trace.json', finalFrame);
    expect(finalFrame.phase).toBe('hold');
    expect(finalFrame.visibleCount).toBe(1);
    expect(finalFrame.interactableCount).toBe(1);
  });

  test('covers reduced motion and 0 to 1 to 0 to 1 replay', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/harness/r4-g2-method-top-method-bottom');
    await expect(page.getByTestId('r2-stage')).toBeVisible();
    await expect(page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)).resolves.toBe(true);

    await page.evaluate(async () => {
      await window.__r4Group2?.idempotentCycle();
    });

    const frame = await snapshot(page);
    writeTrace('group2-reduced-motion-trace.json', frame);
    expect(frame.phase).toBe('hold');
    expect(frame.window.current).toBe('method-bottom');
    expect(frame.visibleCount).toBe(1);
    expect(frame.interactableCount).toBe(1);
  });

  test('recovers from build timeout without locking the current hold', async ({ page }) => {
    await page.goto('/harness/r4-g2');
    await expect(page.getByTestId('r2-stage')).toBeVisible();

    await page.evaluate(async () => {
      await window.__r4Group2?.playForward({ buildTimeout: true });
    });

    const frame = await snapshot(page);
    expect(frame.phase).toBe('hold');
    expect(frame.window.current).toBe('method-top');
    expect(frame.interactableCount).toBe(1);
    expect(frame.recoveryCount).toBe(1);
    expect(frame.eventLog).toContain('BUILD_TIMEOUT:method-top-method-bottom');
  });
});
