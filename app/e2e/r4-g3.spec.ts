import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Group3Snapshot = {
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
    __r4Group3?: {
      playForward(options?: { buildTimeout?: boolean }): Promise<void>;
      playReverse(options?: { buildTimeout?: boolean }): Promise<void>;
      seek(scene: 'figure2-animation' | 'figure2-proof-opening' | 'figure2-proof-cards' | 'figure2-proof-closing' | 'brand'): void;
      idempotentCycle(): Promise<void>;
      snapshot(): Group3Snapshot;
    };
  }
}

async function snapshot(page: Page): Promise<Group3Snapshot> {
  return page.evaluate(() => {
    const api = window.__r4Group3;
    if (!api) {
      throw new Error('R4 group3 harness API is not installed');
    }
    return api.snapshot();
  });
}

type Group3VisualSnapshot = {
  activeInkSegments: readonly string[];
  transitions: readonly string[];
  proofOpeningProgress: number;
  proofArchArea: number;
  proofArchCount: number;
  proofArchOpacity: number;
  proofArchBlurPx: number;
  figure2ProofProgress: number;
  figure2BackgroundOpacity: number;
  figure2FigureOpacity: number;
  figure2NearArchOpacity: number;
  proofOverlayProgress: number;
  retainedArchCount: number;
  figure2LayerZ: number;
  proofLayerZ: number;
  proofLayerClipPath: string;
  proofLayerElevated: boolean;
  proofInkRenderer: string | null;
  depthInkMode: string | null;
  depthReady: boolean;
  figureMaskReady: boolean;
  proofInkVisible: boolean;
  proofTransitionActive: boolean;
  proofBackgroundImage: string;
};

async function visualSnapshot(page: Page): Promise<Group3VisualSnapshot> {
  return page.evaluate(() => {
    const proofRoot = document.querySelector<HTMLElement>('[data-r4-scene="figure2-proof-opening"]');
    const proofLayer = proofRoot?.closest<HTMLElement>('[data-stage-layer]');
    const arch = document.querySelector<HTMLElement>('.stage-proof-retained-arch');
    const archRect = arch?.getBoundingClientRect();
    const archStyle = arch ? window.getComputedStyle(arch) : undefined;
    const proofStyle = proofRoot ? window.getComputedStyle(proofRoot) : undefined;
    const figureRoot = document.querySelector<HTMLElement>('[data-r4-scene="figure2-animation"]');
    const figure2Layer = figureRoot?.closest<HTMLElement>('[data-stage-layer]');
    const figureStyle = figureRoot ? window.getComputedStyle(figureRoot) : undefined;
    const proofInkCanvas = document.querySelector<HTMLCanvasElement>('[data-r4-ink-segment="figure2-distance-expand"]');
    const inkCanvases = [...document.querySelectorAll<HTMLCanvasElement>('[data-r4-ink-segment]')];
    return {
      activeInkSegments: inkCanvases
        .filter((canvas) => canvas.parentElement?.dataset.r4InkActive === 'true')
        .map((canvas) => canvas.dataset.r4InkSegment ?? ''),
      transitions: [...document.querySelectorAll<HTMLElement>('[data-r4-transition]')]
        .map((element) => element.dataset.r4Transition ?? ''),
      proofOpeningProgress: Number.parseFloat(proofRoot?.dataset.proofOpeningProgress ?? '0'),
      proofArchArea: (archRect?.width ?? 0) * (archRect?.height ?? 0),
      proofArchCount: document.querySelectorAll('.stage-proof-retained-arch').length,
      proofArchOpacity: Number.parseFloat(archStyle?.opacity ?? '0'),
      proofArchBlurPx: Number.parseFloat((archStyle?.filter.match(/blur\(([^p]+)px\)/)?.[1]) ?? '0'),
      figure2ProofProgress: Number.parseFloat(figureRoot?.dataset.figure2ProofProgress ?? '0'),
      figure2BackgroundOpacity: Number.parseFloat(figureStyle?.getPropertyValue('--r4-figure2-background-opacity') ?? '1'),
      figure2FigureOpacity: Number.parseFloat(figureStyle?.getPropertyValue('--r4-figure2-figure-opacity') ?? '1'),
      figure2NearArchOpacity: Number.parseFloat(figureStyle?.getPropertyValue('--r4-figure2-near-arch-opacity') ?? '0'),
      proofOverlayProgress: Number.parseFloat(proofRoot?.dataset.figure2ProofOverlayProgress ?? '0'),
      retainedArchCount: document.querySelectorAll('[data-figure2-retained-arch="true"]').length,
      figure2LayerZ: Number.parseInt(window.getComputedStyle(figure2Layer ?? document.body).zIndex || '0', 10),
      proofLayerZ: Number.parseInt(window.getComputedStyle(proofLayer ?? document.body).zIndex || '0', 10),
      proofLayerClipPath: window.getComputedStyle(proofLayer ?? document.body).clipPath,
      proofLayerElevated: proofLayer?.dataset.r4TransitionElevated === 'true',
      proofInkRenderer: proofRoot?.dataset.figure2ProofInkRenderer ?? proofLayer?.dataset.figure2ProofInkRenderer ?? null,
      depthInkMode: proofInkCanvas?.dataset.figure2DepthInkMode ?? null,
      depthReady: proofInkCanvas?.dataset.figure2DepthReady === 'true',
      figureMaskReady: proofInkCanvas?.dataset.figure2FigureMaskReady === 'true',
      proofInkVisible: proofInkCanvas ? window.getComputedStyle(proofInkCanvas).visibility !== 'hidden' : false,
      proofTransitionActive: proofRoot?.dataset.r4ProofTransitionActive === 'true',
      proofBackgroundImage: proofStyle?.backgroundImage ?? ''
    };
  });
}

function assertReadingFrame(
  frame: Group3Snapshot,
  from: string,
  to: string
): void {
  const fromLayer = frame.layers.find((layer) => layer.scene === from);
  const toLayer = frame.layers.find((layer) => layer.scene === to);
  expect(frame.visibleCount).toBe(2);
  expect(fromLayer).toMatchObject({ visible: true, opacity: 1 });
  expect(toLayer).toMatchObject({ visible: true, opacity: 1 });
}

async function assertFrame(frame: Group3Snapshot): Promise<void> {
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

function writeTrace(name: string, frame: Group3Snapshot): void {
  const artifactDir = resolve(process.cwd(), '..', 'artifacts', 'react-refactor', 'r4-g3');
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(resolve(artifactDir, name), `${JSON.stringify(frame, null, 2)}\n`);
}

test.describe('R4 group3 figure2 proof merge-train harness', () => {
  test.use({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1
  });

  test('runs the figure2 proof chain forward and reverse with nonblank sampled frames', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/harness/r4-g3');
    await expect(page.getByTestId('r2-stage')).toBeVisible();

    const frames: Group3Snapshot[] = [];
    for (const target of ['figure2-proof-opening', 'figure2-proof-cards', 'figure2-proof-closing', 'brand']) {
      await page.evaluate(() => {
        void window.__r4Group3?.playForward();
      });
      if (target === 'figure2-proof-opening') {
        let proofTransitionVisual: Group3VisualSnapshot | undefined;
        await expect.poll(async () => {
          const visual = await visualSnapshot(page);
          proofTransitionVisual = visual;
          return (
            visual.activeInkSegments.includes('figure2-distance-expand')
            && visual.figure2BackgroundOpacity < 1
            && visual.figure2FigureOpacity < 1
            && visual.figure2NearArchOpacity > 0.9
          );
        }, { timeout: 5_000 }).toBe(true);
        expect(proofTransitionVisual?.transitions).toContain('figure2-proof-overlay-scene-ink');
        expect(proofTransitionVisual?.proofLayerElevated).toBe(true);
        expect((proofTransitionVisual?.proofLayerZ ?? 0)).toBeGreaterThan(proofTransitionVisual?.figure2LayerZ ?? 0);
        expect(proofTransitionVisual?.proofLayerClipPath).toBe('none');
        expect(proofTransitionVisual?.proofInkRenderer).toBe('depth-scene');
        expect(proofTransitionVisual?.depthInkMode).toBe('threshold');
        expect(proofTransitionVisual?.depthReady).toBe(true);
        expect(proofTransitionVisual?.figureMaskReady).toBe(true);
        expect(proofTransitionVisual?.proofTransitionActive).toBe(true);
        expect(proofTransitionVisual?.proofBackgroundImage).toBe('none');
        expect(proofTransitionVisual?.proofOpeningProgress).toBeGreaterThan(0);
        expect(proofTransitionVisual?.proofOverlayProgress).toBeGreaterThan(0);
        expect(proofTransitionVisual?.proofArchArea).toBeGreaterThan(100_000);
        expect(proofTransitionVisual?.figure2ProofProgress).toBeGreaterThan(0);
      }
      if (target === 'brand') {
        await expect.poll(async () => {
          const visual = await visualSnapshot(page);
          return visual.transitions.includes('figure2-proof-brand-ink-handoff');
        }, { timeout: 3_000 }).toBe(true);
      }
      for (let index = 0; index < 18; index += 1) {
        await page.waitForTimeout(24);
        const frame = await snapshot(page);
        frames.push(frame);
        if (index === 5 && target === 'figure2-proof-cards') {
          assertReadingFrame(frame, 'figure2-proof-opening', 'figure2-proof-cards');
          const visual = await visualSnapshot(page);
          expect(visual.proofArchCount).toBe(1);
          expect(visual.retainedArchCount).toBe(1);
        }
        if (index === 5 && target === 'figure2-proof-closing') {
          assertReadingFrame(frame, 'figure2-proof-cards', 'figure2-proof-closing');
          const visual = await visualSnapshot(page);
          expect(visual.proofArchCount).toBe(1);
          expect(visual.retainedArchCount).toBe(1);
        }
        if (index === 5 && target === 'brand') {
          expect(frame.visibleCount).toBeLessThanOrEqual(2);
        }
      }
      await expect.poll(async () => (await snapshot(page)).window.current, { timeout: 7_000 }).toBe(target);
      if (target === 'figure2-proof-opening') {
        const visual = await visualSnapshot(page);
        expect(visual.proofOpeningProgress).toBe(1);
        expect(visual.proofInkVisible).toBe(false);
        expect(visual.proofTransitionActive).toBe(false);
        expect(visual.proofBackgroundImage).not.toBe('none');
        expect(visual.proofArchArea).toBeGreaterThan(100_000);
        expect(visual.proofArchOpacity).toBeGreaterThan(0.8);
        expect(visual.proofArchBlurPx).toBeGreaterThan(3);
      }
      if (target === 'figure2-proof-cards' || target === 'figure2-proof-closing') {
        expect((await visualSnapshot(page)).proofArchCount).toBe(1);
      }
    }

    await page.evaluate(() => {
      void window.__r4Group3?.playReverse();
    });
    const reverseFrames: Group3Snapshot[] = [];
    for (let index = 0; index < 18; index += 1) {
      await page.waitForTimeout(24);
      reverseFrames.push(await snapshot(page));
    }
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('figure2-proof-closing');

    for (const frame of [...frames, ...reverseFrames]) {
      await assertFrame(frame);
    }

    const finalFrame = await snapshot(page);
    writeTrace('group3-forward-reverse-trace.json', finalFrame);
    expect(finalFrame.phase).toBe('hold');
    expect(finalFrame.visibleCount).toBe(1);
    expect(finalFrame.interactableCount).toBe(1);
  });

  test('covers reduced motion and 0 to 1 to 0 to 1 replay on the staged segment', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/harness/r4-g3-figure2-distance-expand');
    await expect(page.getByTestId('r2-stage')).toBeVisible();
    await expect(page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)).resolves.toBe(true);

    await page.evaluate(async () => {
      await window.__r4Group3?.idempotentCycle();
    });

    const frame = await snapshot(page);
    writeTrace('group3-reduced-motion-trace.json', frame);
    expect(frame.phase).toBe('hold');
    expect(frame.window.current).toBe('figure2-proof-opening');
    expect(frame.visibleCount).toBe(1);
    expect(frame.interactableCount).toBe(1);
  });

  test('recovers from build timeout to the group static fallback', async ({ page }) => {
    await page.goto('/harness/r4-g3');
    await expect(page.getByTestId('r2-stage')).toBeVisible();

    await page.evaluate(async () => {
      await window.__r4Group3?.playForward({ buildTimeout: true });
    });

    const frame = await snapshot(page);
    expect(frame.phase).toBe('hold');
    expect(frame.window.current).toBe('figure2-proof-opening');
    expect(frame.interactableCount).toBe(1);
    expect(frame.recoveryCount).toBe(1);
    expect(frame.eventLog).toContain('BUILD_TIMEOUT:figure2-distance-expand');
  });
});
