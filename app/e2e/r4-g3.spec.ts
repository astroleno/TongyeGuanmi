import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Group3Snapshot = {
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
  fieldInkSegments: readonly string[];
  transitions: readonly string[];
  proofOpeningProgress: number;
  proofRevealProgress: number;
  proofInkCanvasOpacity: number;
  proofArchArea: number;
  proofArchCount: number;
  proofArchOpacity: number;
  proofArchBlurPx: number;
  figure2ProofProgress: number;
  figure2BackgroundOpacity: number;
  figure2FigureOpacity: number;
  figure2NearArchOpacity: number;
  retainedArchCount: number;
  figure2LayerZ: number;
  proofLayerZ: number;
  proofLayerClipPath: string;
  proofLayerMask: string;
  proofLayerElevated: boolean;
  proofInkRenderer: string | null;
  proofInkEffectOnly: boolean;
  proofInkBoundaryKind: string | null;
  proofInkVisible: boolean;
  depthFieldMask: string;
  figureDepthSurfaceMask: string;
  figureClip: string;
  depthMaskValues: string;
  proofBackgroundImage: string;
  proofGroundBackgroundImage: string;
  proofOpeningY: number;
  proofClosingY: number;
  proofClosingOpacity: number;
  proofClosingLayerOpacity: number;
  brandY: number;
  brandOpacity: number;
  brandLayerMask: string;
  retainedArchMask: string;
  brandLayerClip: string;
  retainedArchClip: string;
  videos: readonly { loop: boolean; paused: boolean; currentTime: number }[];
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
    const depthField = figureRoot?.querySelector<HTMLElement>('[data-figure2-depth-ranked-field="true"]');
    const figureDepthSurface = figureRoot?.querySelector<HTMLElement>(
      '[data-figure2-figure-depth-surface="true"]'
    );
    const figureField = figureRoot?.querySelector<HTMLElement>('[data-figure2-figure-field="true"]');
    const proofInkCanvas = document.querySelector<HTMLCanvasElement>('[data-r4-ink-segment="figure2-distance-expand"]');
    const proofGround = document.querySelector<HTMLElement>('[data-figure2-retained-ground="true"]');
    const proofGroundStyle = proofGround ? window.getComputedStyle(proofGround) : undefined;
    const proofClosing = document.querySelector<HTMLElement>('[data-r4-scene="figure2-proof-closing"]');
    const brand = document.querySelector<HTMLElement>('[data-r4-scene="brand"]');
    const proofClosingStyle = proofClosing ? window.getComputedStyle(proofClosing) : undefined;
    const proofClosingLayer = proofClosing?.closest<HTMLElement>('[data-stage-layer]');
    const brandStyle = brand ? window.getComputedStyle(brand) : undefined;
    const brandLayer = brand?.closest<HTMLElement>('[data-stage-layer]');
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
      proofOpeningProgress: Number.parseFloat(proofRoot?.dataset.proofOpeningProgress ?? '0'),
      proofRevealProgress: Number.parseFloat(proofRoot?.dataset.figure2ProofRevealProgress ?? '0'),
      proofInkCanvasOpacity: Number.parseFloat(proofInkCanvas ? window.getComputedStyle(proofInkCanvas).opacity : '0'),
      proofArchArea: (archRect?.width ?? 0) * (archRect?.height ?? 0),
      proofArchCount: document.querySelectorAll('.stage-proof-retained-arch').length,
      proofArchOpacity: Number.parseFloat(archStyle?.opacity ?? '0'),
      proofArchBlurPx: Number.parseFloat((archStyle?.filter.match(/blur\(([^p]+)px\)/)?.[1]) ?? '0'),
      figure2ProofProgress: Number.parseFloat(figureRoot?.dataset.figure2ProofProgress ?? '0'),
      figure2BackgroundOpacity: Number.parseFloat(figureStyle?.getPropertyValue('--r4-figure2-background-opacity') ?? '1'),
      figure2FigureOpacity: Number.parseFloat(figureStyle?.getPropertyValue('--r4-figure2-figure-opacity') ?? '1'),
      figure2NearArchOpacity: Number.parseFloat(figureStyle?.getPropertyValue('--r4-figure2-near-arch-opacity') ?? '0'),
      retainedArchCount: document.querySelectorAll('[data-stage-retained-figure2-arch="true"]').length,
      figure2LayerZ: Number.parseInt(window.getComputedStyle(figure2Layer ?? document.body).zIndex || '0', 10),
      proofLayerZ: Number.parseInt(window.getComputedStyle(proofLayer ?? document.body).zIndex || '0', 10),
      proofLayerClipPath: window.getComputedStyle(proofLayer ?? document.body).clipPath,
      proofLayerMask: proofLayer ? window.getComputedStyle(proofLayer).maskImage : 'none',
      proofLayerElevated: proofLayer?.dataset.r4TransitionElevated === 'true',
      proofInkRenderer: proofInkCanvas?.dataset.r4InkRenderer ?? null,
      proofInkEffectOnly: proofInkCanvas?.dataset.r4InkEffectOnly === 'true',
      proofInkBoundaryKind: proofInkCanvas?.dataset.r4InkBoundaryKind ?? null,
      proofInkVisible: proofInkCanvas ? window.getComputedStyle(proofInkCanvas).visibility !== 'hidden' : false,
      depthFieldMask: depthField ? window.getComputedStyle(depthField).maskImage : 'none',
      figureDepthSurfaceMask: figureDepthSurface
        ? window.getComputedStyle(figureDepthSurface).maskImage
        : 'none',
      figureClip: figureField
        ? window.getComputedStyle(figureField).clipPath
        : 'none',
      depthMaskValues: proofLayer?.dataset.r4DepthMaskValues ?? '',
      proofBackgroundImage: proofStyle?.backgroundImage ?? '',
      proofGroundBackgroundImage: proofGroundStyle?.backgroundImage ?? '',
      proofOpeningY: Number.parseFloat(proofStyle?.getPropertyValue('--r4-proof-opening-y') ?? '0'),
      proofClosingY: Number.parseFloat(proofClosingStyle?.getPropertyValue('--r4-proof-closing-y') ?? '0'),
      proofClosingOpacity: Number.parseFloat(proofClosingStyle?.getPropertyValue('--r4-proof-closing-opacity') ?? '0'),
      proofClosingLayerOpacity: Number.parseFloat(proofClosingLayer ? window.getComputedStyle(proofClosingLayer).opacity : '0'),
      brandY: Number.parseFloat(brandStyle?.getPropertyValue('--r4-brand-y') ?? '0'),
      brandOpacity: Number.parseFloat(brandStyle?.getPropertyValue('--r4-brand-opacity') ?? '0'),
      brandLayerMask: brandLayer?.style.getPropertyValue('mask-image') ?? '',
      retainedArchMask: arch?.style.getPropertyValue('mask-image') ?? '',
      brandLayerClip: brandLayer?.style.clipPath ?? '',
      retainedArchClip: arch?.style.clipPath ?? '',
      videos: [...document.querySelectorAll<HTMLVideoElement>('[data-figure2-video]')].map((video) => ({
        loop: video.loop,
        paused: video.paused,
        currentTime: video.currentTime
      }))
    };
  });
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
        await expect.poll(async () => {
          const visual = await visualSnapshot(page);
          return visual.videos.some((video) => !video.paused && video.currentTime > 0.05 && video.currentTime < 2.4);
        }, { timeout: 3_000 }).toBe(true);
        await expect.poll(async () => (await snapshot(page)).phase, { timeout: 7_000 }).toBe('staged-paused');
        const stagedFigure = await visualSnapshot(page);
        expect(stagedFigure.videos).toHaveLength(2);
        expect(stagedFigure.videos.every((video) => video.loop === false && video.paused && video.currentTime > 2)).toBe(true);
        expect(stagedFigure.depthFieldMask).toBe('none');
        expect(stagedFigure.figureDepthSurfaceMask).toBe('none');
        expect(stagedFigure.figureClip).toBe('none');
        expect(stagedFigure.activeInkSegments).not.toContain('figure2-distance-expand');
        await page.evaluate(() => {
          void window.__r4Group3?.playForward();
        });
        let proofTransitionVisual: Group3VisualSnapshot | undefined;
        let proofTransitionSeen = false;
        const deadline = Date.now() + 12_000;
        while (Date.now() < deadline && !proofTransitionSeen) {
          const visual = await visualSnapshot(page);
          const hasDepthInk = visual.activeInkSegments.includes('figure2-distance-expand')
            && visual.fieldInkSegments.includes('figure2-distance-expand')
            && visual.transitions.includes('figure2-proof-binary-depth')
            && visual.proofLayerElevated
            && visual.proofInkRenderer === 'field'
            && visual.proofInkEffectOnly
            && visual.proofInkBoundaryKind === 'depth'
            && visual.proofBackgroundImage === 'none'
            && visual.proofRevealProgress > 0
            && visual.proofRevealProgress < 1
            && visual.proofLayerMask !== 'none'
            && visual.depthFieldMask !== 'none'
            && visual.figureDepthSurfaceMask !== 'none'
            && visual.figureClip === 'none'
            && visual.depthMaskValues === '1,0';
          if (hasDepthInk) {
            proofTransitionVisual = visual;
            proofTransitionSeen = true;
          } else {
            await page.waitForTimeout(20);
          }
        }
        expect(proofTransitionSeen).toBe(true);
        expect(proofTransitionVisual?.transitions).toContain('figure2-proof-binary-depth');
        expect(proofTransitionVisual?.proofLayerElevated).toBe(true);
        expect((proofTransitionVisual?.proofLayerZ ?? 0)).toBeGreaterThan(proofTransitionVisual?.figure2LayerZ ?? 0);
        expect(proofTransitionVisual?.proofLayerClipPath).toBe('none');
        expect(proofTransitionVisual?.proofInkRenderer).toBe('field');
        expect(proofTransitionVisual?.proofInkEffectOnly).toBe(true);
        expect(proofTransitionVisual?.proofInkBoundaryKind).toBe('depth');
        expect(proofTransitionVisual?.proofLayerMask).not.toBe('none');
        expect(proofTransitionVisual?.depthFieldMask).not.toBe('none');
        expect(proofTransitionVisual?.figureDepthSurfaceMask).not.toBe('none');
        expect(proofTransitionVisual?.figureClip).toBe('none');
        expect(proofTransitionVisual?.depthMaskValues).toBe('1,0');
        expect(proofTransitionVisual?.proofBackgroundImage).toBe('none');
        expect(proofTransitionVisual?.proofRevealProgress).toBeGreaterThan(0);
        expect(proofTransitionVisual?.proofOpeningProgress).toBe(1);
        expect(proofTransitionVisual?.proofOpeningY).toBe(0);
        expect(proofTransitionVisual?.figure2BackgroundOpacity).toBe(1);
        expect(proofTransitionVisual?.figure2FigureOpacity).toBe(1);
        expect(proofTransitionVisual?.proofInkCanvasOpacity ?? 0).toBeGreaterThan(0);
        expect(proofTransitionVisual?.proofArchArea).toBeGreaterThan(100_000);
      }
      if (target === 'brand') {
        await expect.poll(async () => {
          const visual = await visualSnapshot(page);
          return visual.transitions.includes('figure2-proof-brand-live-clip');
        }, { timeout: 3_000 }).toBe(true);
        const staticInkCopy = await visualSnapshot(page);
        expect(staticInkCopy.proofClosingY).toBe(0);
        expect(staticInkCopy.proofClosingOpacity).toBe(1);
        expect(staticInkCopy.brandY).toBe(0);
        expect(staticInkCopy.brandOpacity).toBe(1);
        expect(staticInkCopy.brandLayerMask).toBe('');
        expect(staticInkCopy.retainedArchMask).toBe('');
        expect(staticInkCopy.brandLayerClip.startsWith('inset(')).toBe(true);
        expect(staticInkCopy.retainedArchClip.startsWith('inset(')).toBe(true);
        expect(staticInkCopy.fieldInkSegments).toContain('figure2-proof-brand');
      }
      for (let index = 0; index < 18; index += 1) {
        await page.waitForTimeout(24);
        const frame = await snapshot(page);
        frames.push(frame);
        if (index === 5 && target === 'figure2-proof-cards') {
          expect(frame.visibleCount).toBe(2);
          const visual = await visualSnapshot(page);
          expect(visual.proofArchCount).toBe(1);
          expect(visual.retainedArchCount).toBe(1);
        }
        if (index === 5 && target === 'figure2-proof-closing') {
          expect(frame.visibleCount).toBe(2);
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
        expect(visual.proofOpeningY).toBe(0);
        expect(visual.proofInkCanvasOpacity).toBe(0);
        expect(visual.proofInkVisible).toBe(false);
        expect(visual.proofBackgroundImage).toBe('none');
        expect(visual.proofGroundBackgroundImage).not.toBe('none');
        expect(visual.proofArchArea).toBeGreaterThan(100_000);
        expect(visual.proofArchOpacity).toBeGreaterThan(0.8);
        expect(visual.proofArchBlurPx).toBeGreaterThan(3);
      }
      if (target === 'figure2-proof-cards' || target === 'figure2-proof-closing') {
        expect((await visualSnapshot(page)).proofArchCount).toBe(1);
      }
      if (target === 'brand') {
        const terminal = await visualSnapshot(page);
        expect(terminal.proofClosingLayerOpacity).toBe(0);
        expect(terminal.brandLayerMask).toBe('');
        expect(terminal.brandLayerClip).toBe('');
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

  test('holds Figure2 through reverse Ink, then animates every reverse intro frame', async ({ page }) => {
    test.setTimeout(45_000);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/harness/r4-g3-figure2-distance-expand');
    await expect(page.getByTestId('r2-stage')).toBeVisible();

    await page.evaluate(() => { void window.__r4Group3?.playForward(); });
    await expect.poll(async () => (await snapshot(page)).phase, { timeout: 8_000 }).toBe('staged-paused');
    await page.evaluate(() => { void window.__r4Group3?.playForward(); });
    await expect.poll(async () => (await snapshot(page)).window.current, { timeout: 8_000 }).toBe('figure2-proof-opening');

    const terminalTimes = (await visualSnapshot(page)).videos.map((video) => video.currentTime);
    expect(terminalTimes).toHaveLength(2);

    const sampleReverseLeg = async () => {
      const samples: number[][] = [];
      for (let index = 0; index < 18; index += 1) {
        await page.waitForTimeout(50);
        const frame = await snapshot(page);
        if (frame.phase === 'hold') {
          break;
        }
        samples.push((await visualSnapshot(page)).videos.map((video) => video.currentTime));
      }
      return samples;
    };

    await page.evaluate(() => { void window.__r4Group3?.playReverse(); });
    const inkLegSamples = await sampleReverseLeg();
    expect(inkLegSamples.length).toBeGreaterThan(2);
    await expect.poll(async () => (await snapshot(page)).phase, { timeout: 8_000 }).toBe('staged-paused');

    await page.evaluate(() => { void window.__r4Group3?.playReverse(); });
    const introLegSamples = await sampleReverseLeg();
    expect(introLegSamples.length).toBeGreaterThan(2);

    for (let videoIndex = 0; videoIndex < terminalTimes.length; videoIndex += 1) {
      const inkValues = inkLegSamples.map((times) => times[videoIndex] ?? 0);
      expect(Math.max(...inkValues) - Math.min(...inkValues)).toBeLessThan(0.03);
      expect(inkValues[0]).toBeCloseTo(terminalTimes[videoIndex] ?? 0, 1);

      const introValues = introLegSamples.map((times) => times[videoIndex] ?? 0);
      expect(Math.max(...introValues) - Math.min(...introValues)).toBeGreaterThan(0.2);
      expect(introValues.some((value, index) => index > 0 && value < (introValues[index - 1] ?? 0) - 0.01)).toBe(true);
      expect(introValues.at(-1) ?? Number.POSITIVE_INFINITY).toBeLessThan((introValues[0] ?? 0) - 0.2);
    }
    await expect.poll(async () => (await snapshot(page)).window.current, { timeout: 8_000 }).toBe('figure2-animation');
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

  test('keeps the committed hold when endpoint reconstruction also times out', async ({ page }) => {
    await page.goto('/harness/r4-g3');
    await expect(page.getByTestId('r2-stage')).toBeVisible();

    await page.evaluate(async () => {
      await window.__r4Group3?.playForward({ buildTimeout: true });
    });

    const frame = await snapshot(page);
    expect(frame.phase).toBe('hold');
    expect(frame.window.current).toBe('figure2-animation');
    expect(frame.interactableCount).toBe(1);
    expect(frame.recoveryCount).toBe(1);
    expect(frame.eventLog).toContain('BUILD_TIMEOUT:figure2-distance-expand');
  });
});
