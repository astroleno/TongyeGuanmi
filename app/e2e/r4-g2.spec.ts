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
  fieldInkSegments: readonly string[];
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
  methodSceneCount: number;
  methodLeadCount: number;
  methodRowCount: number;
  methodLayerScrollHeight: number;
  methodLayerClientHeight: number;
  methodScrollTop: number;
  methodScrollHeight: number;
  methodScrollClientHeight: number;
  visibleCaptionCount: number;
  methodLayerZ: number;
  figure2LayerZ: number;
  figure2LayerClipPath: string;
  figure2LayerRevealMode: string | null;
  figure2LayerElevated: boolean;
  visiblePosterCount: number;
  videos: readonly {
    side: string;
    mediaKey: string;
    direction: string;
    frameReady: boolean;
    loop: boolean;
    paused: boolean;
    currentTime: number;
    preload: string;
  }[];
};

async function visualSnapshot(page: Page): Promise<Group2VisualSnapshot> {
  return page.evaluate(() => {
    const figureRoot = document.querySelector<HTMLElement>('[data-r4-scene="figure2-animation"]');
    const retainedArch = document.querySelector<HTMLElement>('.stage-proof-retained-arch');
    const methodLayers = [...document.querySelectorAll<HTMLElement>(
      '[data-stage-layer="method-top"], [data-stage-layer="method-bottom"]'
    )];
    const methodLayer = methodLayers.find((layer) => layer.dataset.visible === 'true')
      ?? methodLayers.find((layer) => layer.dataset.stageLayer === 'method-top')
      ?? null;
    const methodScrollport = methodLayer?.querySelector<HTMLElement>('[data-reading-scrollport="true"]');
    const figure2Layer = figureRoot?.closest<HTMLElement>('[data-stage-layer]');
    const figureStyle = figureRoot ? window.getComputedStyle(figureRoot) : undefined;
    const figure = document.querySelector<HTMLElement>('.r4-figure2__figure');
    const figureRect = figure?.getBoundingClientRect();
    const inkCanvases = [...document.querySelectorAll<HTMLCanvasElement>('[data-r4-ink-segment]')];
    return {
      activeInkSegments: inkCanvases
        .filter((canvas) => canvas.dataset.r4InkActive === 'true' || canvas.parentElement?.dataset.r4InkActive === 'true')
        .map((canvas) => canvas.dataset.r4InkSegment ?? ''),
      fieldInkSegments: inkCanvases
        .filter((canvas) => canvas.dataset.r4InkRenderer === 'field' && canvas.dataset.r4InkEffectOnly === 'true')
        .map((canvas) => canvas.dataset.r4InkSegment ?? ''),
      transitions: [...document.querySelectorAll<HTMLElement>('[data-r4-transition]')]
        .map((element) => element.dataset.r4Transition ?? ''),
      inkOrigins: Object.fromEntries(inkCanvases.map((canvas) => {
        const [x, y] = (canvas.dataset.r4InkBoundaryOrigin ?? '').split(',').map(Number.parseFloat);
        return [canvas.dataset.r4InkSegment ?? '', { x: x ?? Number.NaN, y: y ?? Number.NaN }];
      })),
      figure2Progress: Number.parseFloat(figureRoot?.dataset.figure2Progress ?? '0'),
      cloudScale: Number.parseFloat(figureStyle?.getPropertyValue('--r4-figure2-cloud-scale') ?? '0'),
      farArcadeScale: Number.parseFloat(figureStyle?.getPropertyValue('--r4-figure2-far-arcade-scale') ?? '0'),
      nearArchBlurPx: Number.parseFloat(
        retainedArch ? window.getComputedStyle(retainedArch).getPropertyValue('--r4-figure2-near-arch-blur') : '0'
      ),
      figureScale: Number.parseFloat(figureStyle?.getPropertyValue('--r4-figure2-figure-scale') ?? '0'),
      figureWidth: figureRect?.width ?? 0,
      farArcadeImageCount: document.querySelectorAll('.r4-figure2__far-arcade img').length,
      cloudCount: document.querySelectorAll('.r4-figure2__cloud').length,
      methodSceneCount: document.querySelectorAll('[data-r4-scene="method-top"]').length,
      methodLeadCount: document.querySelectorAll('.r4-method__lead').length,
      methodRowCount: methodLayer?.querySelectorAll('[data-r4-scene="method-bottom"] .r4-method__row').length ?? 0,
      methodLayerScrollHeight: methodLayer?.scrollHeight ?? 0,
      methodLayerClientHeight: methodLayer?.clientHeight ?? 0,
      methodScrollTop: methodScrollport?.scrollTop ?? 0,
      methodScrollHeight: methodScrollport?.scrollHeight ?? 0,
      methodScrollClientHeight: methodScrollport?.clientHeight ?? 0,
      visibleCaptionCount: [...document.querySelectorAll<HTMLElement>('.r4-figure2__figure figcaption')]
        .filter((caption) => {
          const rect = caption.getBoundingClientRect();
          const style = window.getComputedStyle(caption);
          return rect.width > 1.5 || rect.height > 1.5 || style.overflow !== 'hidden' || style.clip === 'auto';
        }).length,
      methodLayerZ: Number.parseInt(window.getComputedStyle(methodLayer ?? document.body).zIndex || '0', 10),
      figure2LayerZ: Number.parseInt(window.getComputedStyle(figure2Layer ?? document.body).zIndex || '0', 10),
      figure2LayerClipPath: window.getComputedStyle(figure2Layer ?? document.body).clipPath,
      figure2LayerRevealMode: figure2Layer?.dataset.r4RevealMode ?? null,
      figure2LayerElevated: figure2Layer?.dataset.r4TransitionElevated === 'true',
      visiblePosterCount: [...document.querySelectorAll<HTMLElement>('[data-figure2-poster]')]
        .filter((poster) => Number.parseFloat(getComputedStyle(poster).opacity) > 0.99).length,
      videos: [...document.querySelectorAll<HTMLVideoElement>('[data-figure2-video]')]
        .filter((video) => video.dataset.figure2Inactive !== 'true')
        .map((video) => ({
        side: video.dataset.figure2Side ?? '',
        mediaKey: video.dataset.mediaKey ?? '',
        direction: video.dataset.timelineVideoDirection ?? '',
        frameReady: video.dataset.timelineVideoFrameReady === 'true',
        loop: video.loop,
        paused: video.paused,
        currentTime: video.currentTime,
        preload: video.preload
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

    const forwardFrames: Group2Snapshot[] = [];
    const methodHold = await visualSnapshot(page);
    expect((await snapshot(page)).window.current).toBe('method-top');
    expect(methodHold.methodSceneCount).toBe(1);
    expect(methodHold.methodLeadCount).toBe(1);
    expect(methodHold.methodRowCount).toBe(0);
    expect(methodHold.methodLayerScrollHeight).toBe(methodHold.methodLayerClientHeight);
    expect(methodHold.methodScrollHeight).toBe(0);
    expect(await page.locator('[data-stage-layer="method-bottom"][data-visible="true"]').count()).toBe(0);

    await page.evaluate(() => {
      void window.__r4Group2?.playForward();
    });
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('method-bottom');
    const methodStepsHold = await visualSnapshot(page);
    expect(methodStepsHold.methodRowCount).toBe(5);
    expect(methodStepsHold.methodScrollHeight).toBeGreaterThan(methodStepsHold.methodScrollClientHeight);
    await page.evaluate(() => {
      const scrollport = document.querySelector<HTMLElement>('[data-stage-layer="method-bottom"] [data-reading-scrollport="true"]');
      if (scrollport) scrollport.scrollTop = scrollport.scrollHeight;
    });
    await expect.poll(async () => {
      const visual = await visualSnapshot(page);
      return visual.methodScrollTop + visual.methodScrollClientHeight >= visual.methodScrollHeight - 1;
    }).toBe(true);

    await page.evaluate(() => {
      void window.__r4Group2?.playForward();
    });
    let methodFigureInk: Group2VisualSnapshot | null = null;
    await expect.poll(async () => {
      const visual = await visualSnapshot(page);
      const matches = visual.activeInkSegments.includes('method-bottom-figure2')
        && visual.fieldInkSegments.includes('method-bottom-figure2')
        && visual.figure2LayerRevealMode === 'ink-occluded-live-gate'
        && visual.figure2LayerClipPath.startsWith('polygon(')
        && visual.figure2Progress === 0
        && visual.videos.length === 2
        && visual.videos.every((video) => video.frameReady);
      if (matches) methodFigureInk = visual;
      return matches;
    }, { timeout: 3_000 }).toBe(true);
    if (!methodFigureInk) throw new Error('Method to Figure2 Ink frame was not captured');
    expect(methodFigureInk.activeInkSegments).toContain('method-bottom-figure2');
    expect(methodFigureInk.figure2LayerElevated).toBe(true);
    expect(methodFigureInk.figure2LayerZ).toBeGreaterThan(methodFigureInk.methodLayerZ);
    expect(methodFigureInk.figure2LayerClipPath.startsWith('polygon(')).toBe(true);
    expect(methodFigureInk.figure2LayerRevealMode).toBe('ink-occluded-live-gate');
    expect(methodFigureInk.fieldInkSegments).toContain('method-bottom-figure2');
    expect(methodFigureInk.inkOrigins['method-bottom-figure2']?.x).toBeCloseTo(0.5, 2);
    expect(methodFigureInk.inkOrigins['method-bottom-figure2']?.y).toBeCloseTo(1, 2);
    expect(methodFigureInk.figure2Progress).toBe(0);
    expect(methodFigureInk.videos).toHaveLength(2);
    expect(new Set(methodFigureInk.videos.map((video) => video.mediaKey))).toEqual(new Set([
      'figure2-left-motion',
      'figure2-right-motion'
    ]));
    expect(methodFigureInk.visiblePosterCount).toBe(0);
    expect(methodFigureInk.videos.every((video) => video.loop === false)).toBe(true);
    expect(methodFigureInk.videos.every((video) => (
      video.direction === '1'
      && video.frameReady
      && video.paused
      && video.currentTime < 0.1
      && video.preload === 'auto'
    ))).toBe(true);

    for (let index = 0; index < 18; index += 1) {
      await page.waitForTimeout(24);
      forwardFrames.push(await snapshot(page));
    }
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('figure2-animation');
    const figure2Hold = await visualSnapshot(page);
    expect(figure2Hold.figure2Progress).toBe(0);
    expect(figure2Hold.farArcadeImageCount).toBe(1);
    expect(figure2Hold.cloudCount).toBe(1);
    expect(figure2Hold.cloudScale).toBe(1);
    expect(figure2Hold.farArcadeScale).toBe(1);
    expect(figure2Hold.nearArchBlurPx).toBe(0);
    expect(figure2Hold.figureScale).toBe(1);
    expect(figure2Hold.figureWidth).toBeGreaterThan(153);
    expect(figure2Hold.figureWidth).toBeLessThan(261);
    expect(figure2Hold.visibleCaptionCount).toBe(0);
    expect(figure2Hold.videos).toHaveLength(2);
    expect(figure2Hold.visiblePosterCount).toBe(0);
    expect(figure2Hold.videos.every((video) => (
      video.loop === false && video.frameReady && video.paused && video.currentTime < 0.1
    ))).toBe(true);

    await page.evaluate(() => {
      void window.__r4Group2?.playReverse();
    });
    const reverseFrames: Group2Snapshot[] = [];
    for (let index = 0; index < 18; index += 1) {
      await page.waitForTimeout(24);
      reverseFrames.push(await snapshot(page));
    }
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('method-bottom');
    const reversedMethod = await visualSnapshot(page);
    expect(reversedMethod.methodScrollTop + reversedMethod.methodScrollClientHeight).toBeGreaterThanOrEqual(
      reversedMethod.methodScrollHeight - 1
    );
    await page.evaluate(() => {
      void window.__r4Group2?.playReverse();
    });
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('method-top');

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
    await page.goto('/harness/r4-g2-method-bottom-figure2');
    await expect(page.getByTestId('r2-stage')).toBeVisible();
    await expect(page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)).resolves.toBe(true);

    await page.evaluate(async () => {
      await window.__r4Group2?.idempotentCycle();
    });

    const frame = await snapshot(page);
    writeTrace('group2-reduced-motion-trace.json', frame);
    expect(frame.phase).toBe('hold');
    expect(frame.window.current).toBe('figure2-animation');
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
