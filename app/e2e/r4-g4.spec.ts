import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Group4Snapshot = {
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
    __r4Group4?: {
      playForward(options?: { buildTimeout?: boolean }): Promise<void>;
      playReverse(options?: { buildTimeout?: boolean }): Promise<void>;
      seek(scene: 'brand' | 'figure3-animation' | 'services'): void;
      idempotentCycle(): Promise<void>;
      snapshot(): Group4Snapshot;
    };
  }
}

async function snapshot(page: Page): Promise<Group4Snapshot> {
  return page.evaluate(() => {
    const api = window.__r4Group4;
    if (!api) {
      throw new Error('R4 group4 harness API is not installed');
    }
    return api.snapshot();
  });
}

type Group4VisualSnapshot = {
  activeInkSegments: readonly string[];
  fieldInkSegments: readonly string[];
  transitions: readonly string[];
  figure3Progress: number;
  figure3VideoOpacity: number;
  figure3FillOpacity: number;
  figure3DesiredFrame: number | null;
  figure3PresentedFrame: number | null;
  figure3FrameEvidence: string | null;
  figure3Videos: readonly { loop: boolean; paused: boolean; currentTime: number }[];
  servicesProgress: number;
  servicesRows: number;
  servicesSmallCount: number;
  copyCueActive: boolean;
  revealProgress: number;
  revealClip: string;
  revealMask: string;
  revealMode: string | undefined;
  servicesPaperAlpha: number;
  servicesElevated: boolean;
  brandY: number;
  brandOpacity: number;
};

async function visualSnapshot(page: Page): Promise<Group4VisualSnapshot> {
  return page.evaluate(() => {
    const figureRoot = document.querySelector<HTMLElement>('[data-r4-scene="figure3-animation"]');
    const figureStyle = figureRoot ? window.getComputedStyle(figureRoot) : undefined;
    const servicesRoot = document.querySelector<HTMLElement>('[data-r4-scene="services"]');
    const servicesLayer = servicesRoot?.closest<HTMLElement>('[data-stage-layer]');
    const brandRoot = document.querySelector<HTMLElement>('[data-r4-scene="brand"]');
    const brandStyle = brandRoot ? window.getComputedStyle(brandRoot) : undefined;
    const revealLayer = [...document.querySelectorAll<HTMLElement>('[data-r4-reveal-progress]')]
      .find((element) => element.dataset.r4InkActive === 'true') ?? null;
    const revealStyle = revealLayer ? window.getComputedStyle(revealLayer) : null;
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
      figure3Progress: Number.parseFloat(figureRoot?.dataset.figure3Progress ?? '0'),
      figure3VideoOpacity: Number.parseFloat(figureStyle?.getPropertyValue('--figure3-video-opacity') ?? '0'),
      figure3FillOpacity: Number.parseFloat(figureStyle?.getPropertyValue('--figure3-fill-opacity') ?? '0'),
      figure3DesiredFrame: figureRoot?.dataset.figure3DesiredFrame
        ? Number.parseInt(figureRoot.dataset.figure3DesiredFrame, 10)
        : null,
      figure3PresentedFrame: figureRoot?.dataset.figure3PresentedFrame
        ? Number.parseInt(figureRoot.dataset.figure3PresentedFrame, 10)
        : null,
      figure3FrameEvidence: figureRoot?.dataset.figure3FrameEvidence ?? null,
      figure3Videos: [...document.querySelectorAll<HTMLVideoElement>('[data-figure3-alpha-video]')].map((video) => ({
        loop: video.loop,
        paused: video.paused,
        currentTime: video.currentTime
      })),
      servicesProgress: Number.parseFloat(servicesRoot?.dataset.servicesProgress ?? '0'),
      servicesRows: document.querySelectorAll('.r4-services__row').length,
      servicesSmallCount: document.querySelectorAll('.r4-services__row small').length,
      copyCueActive: servicesLayer?.dataset.copyCueActive === 'true',
      revealProgress: Number.parseFloat(revealLayer?.dataset.r4RevealProgress ?? '0'),
      revealClip: revealStyle?.clipPath ?? 'none',
      revealMask: revealStyle?.getPropertyValue('-webkit-mask-image') || revealStyle?.getPropertyValue('mask-image') || 'none',
      revealMode: revealLayer?.dataset.r4RevealMode,
      servicesPaperAlpha: Number.parseFloat(servicesRoot?.style.getPropertyValue('--r4-services-paper-alpha') || '0'),
      servicesElevated: servicesLayer?.dataset.r4TransitionElevated === 'true',
      brandY: Number.parseFloat(brandStyle?.getPropertyValue('--r4-brand-y') ?? '0'),
      brandOpacity: Number.parseFloat(brandStyle?.getPropertyValue('--r4-brand-opacity') ?? '0')
    };
  });
}

async function assertFrame(frame: Group4Snapshot): Promise<void> {
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

function writeTrace(name: string, frame: Group4Snapshot): void {
  const artifactDir = resolve(process.cwd(), '..', 'artifacts', 'react-refactor', 'r4-g4');
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(resolve(artifactDir, name), `${JSON.stringify(frame, null, 2)}\n`);
}

test.describe('R4 group4 brand figure3 services harness', () => {
  test.use({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1
  });

  test('runs forward and reverse with nonblank sampled frames', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/harness/r4-g4');
    await expect(page.getByTestId('r2-stage')).toBeVisible();

    await page.evaluate(() => {
      void window.__r4Group4?.playForward();
    });
    await expect.poll(async () => {
      const visual = await visualSnapshot(page);
      return visual.activeInkSegments.includes('brand-figure3')
        && visual.transitions.includes('brand-figure3-bottom-ink')
        && visual.revealProgress > 0
        && visual.revealProgress < 1
        && visual.revealMode === 'ink-occluded-live-gate'
        && visual.revealClip.startsWith('polygon(')
        && visual.revealMask === 'none';
    }, { timeout: 7_000, intervals: [20, 20, 40, 80] }).toBe(true);
    const staticBrandInk = await visualSnapshot(page);
    expect(staticBrandInk.brandY).toBe(0);
    expect(staticBrandInk.brandOpacity).toBe(1);
    expect(staticBrandInk.fieldInkSegments).toContain('brand-figure3');
    const frames: Group4Snapshot[] = [];
    for (let index = 0; index < 18; index += 1) {
      await page.waitForTimeout(24);
      const frame = await snapshot(page);
      frames.push(frame);
    }
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('figure3-animation');
    const figureHold = await visualSnapshot(page);
    expect(figureHold.figure3Progress).toBe(0);
    expect(figureHold.figure3VideoOpacity).toBeGreaterThan(0.95);
    expect(figureHold.figure3FillOpacity).toBeLessThan(0.05);
    expect(figureHold.figure3Videos).toHaveLength(1);
    expect(figureHold.figure3Videos.every((video) => video.loop === false && video.paused)).toBe(true);
    expect(figureHold.figure3DesiredFrame).toBe(0);
    expect(figureHold.figure3PresentedFrame).toBe(0);
    expect(figureHold.figure3FrameEvidence).toBe('video-frame-callback');

    await page.evaluate(() => {
      void window.__r4Group4?.playForward();
    });
    await expect.poll(async () => (await snapshot(page)).window.current, { timeout: 7_000 }).toBe('services');
    const figureTerminal = await visualSnapshot(page);
    expect(figureTerminal.servicesProgress).toBe(1);
    expect(figureTerminal.copyCueActive).toBe(true);
    expect(figureTerminal.servicesPaperAlpha).toBe(1);
    expect(figureTerminal.servicesElevated).toBe(false);
    expect(figureTerminal.transitions).not.toContain('figure3-services-copy-cue');
    expect(figureTerminal.figure3VideoOpacity).toBeGreaterThan(0.95);
    expect(figureTerminal.figure3DesiredFrame).toBe(77);
    expect(figureTerminal.figure3PresentedFrame).toBe(77);
    expect(figureTerminal.figure3FrameEvidence).toBe('video-frame-callback');
    const servicesHold = await visualSnapshot(page);
    expect(servicesHold.servicesProgress).toBe(1);
    expect(servicesHold.servicesRows).toBe(4);
    expect(servicesHold.servicesSmallCount).toBe(4);

    await page.evaluate(() => {
      void window.__r4Group4?.playReverse();
    });
    const reverseFrames: Group4Snapshot[] = [];
    for (let index = 0; index < 18; index += 1) {
      await page.waitForTimeout(24);
      reverseFrames.push(await snapshot(page));
    }
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('figure3-animation');

    for (const frame of [...frames, ...reverseFrames]) {
      await assertFrame(frame);
    }

    const finalFrame = await snapshot(page);
    writeTrace('group4-forward-reverse-trace.json', finalFrame);
    expect(finalFrame.phase).toBe('hold');
    expect(finalFrame.visibleCount).toBe(1);
    expect(finalFrame.interactableCount).toBe(1);
  });

  test('covers reduced motion and 0 to 1 to 0 to 1 replay', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/harness/r4-g4-brand-figure3');
    await expect(page.getByTestId('r2-stage')).toBeVisible();
    await expect(page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)).resolves.toBe(true);

    await page.evaluate(async () => {
      await window.__r4Group4?.idempotentCycle();
    });

    const frame = await snapshot(page);
    writeTrace('group4-reduced-motion-trace.json', frame);
    expect(frame.phase).toBe('hold');
    expect(frame.window.current).toBe('figure3-animation');
    expect(frame.visibleCount).toBe(1);
    expect(frame.interactableCount).toBe(1);
  });

  test('recovers from build timeout and supports seek', async ({ page }) => {
    await page.goto('/harness/r4-g4');
    await expect(page.getByTestId('r2-stage')).toBeVisible();

    await page.evaluate(async () => {
      await window.__r4Group4?.playForward({ buildTimeout: true });
    });

    const recovered = await snapshot(page);
    expect(recovered.phase).toBe('hold');
    expect(recovered.window.current).toBe('figure3-animation');
    expect(recovered.recoveryCount).toBe(1);
    expect(recovered.eventLog).toContain('BUILD_TIMEOUT:brand-figure3');

    await page.evaluate(() => {
      window.__r4Group4?.seek('services');
    });
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('services');
  });
});
