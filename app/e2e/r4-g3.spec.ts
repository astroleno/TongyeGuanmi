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
};

declare global {
  interface Window {
    __r4Group3?: {
      playForward(options?: { buildTimeout?: boolean }): Promise<void>;
      playReverse(options?: { buildTimeout?: boolean }): Promise<void>;
      seek(scene: 'figure2-animation' | 'figure2-proof' | 'brand'): void;
      idempotentCycle(): Promise<void>;
      snapshot(): Group3Snapshot;
    };
  }
}

async function snapshot(page: Page): Promise<Group3Snapshot> {
  return page.evaluate(() => {
    if (!window.__r4Group3) throw new Error('R4 group3 harness API is not installed');
    return window.__r4Group3.snapshot();
  });
}

type Group3VisualSnapshot = {
  activeInkSegments: readonly string[];
  fieldInkSegments: readonly string[];
  transitions: readonly string[];
  proofRootCount: number;
  proofPanelCount: number;
  proofScrollportCount: number;
  proofScrollTop: number;
  proofMaxScrollTop: number;
  proofRevealProgress: number;
  proofOpeningProgress: number;
  proofOpeningY: number;
  proofClosingOpacity: number;
  retainedArchCount: number;
  proofArchCount: number;
  proofLayerElevated: boolean;
  proofLayerMask: string;
  proofBackground: string;
  proofGroundBackground: string;
  figureDepthSurfaceCount: number;
  brandLayerClip: string;
  retainedArchClip: string;
  videos: readonly {
    side: string;
    mediaKey: string;
    direction: string;
    frameReady: boolean;
    paused: boolean;
    currentTime: number;
  }[];
};

async function visualSnapshot(page: Page): Promise<Group3VisualSnapshot> {
  return page.evaluate(() => {
    const proofRoot = document.querySelector<HTMLElement>('[data-r4-scene="figure2-proof"]');
    const proofLayer = proofRoot?.closest<HTMLElement>('[data-stage-layer]');
    const proofOpening = proofRoot?.querySelector<HTMLElement>('[data-r4-proof-panel="opening"]');
    const proofClosing = proofRoot?.querySelector<HTMLElement>('[data-r4-proof-panel="closing"]');
    const proofScrollport = proofLayer?.querySelector<HTMLElement>('[data-reading-scrollport="true"]')
      ?? (proofLayer?.dataset.reading === 'true' ? proofLayer : null);
    const retainedArch = document.querySelector<HTMLElement>('[data-stage-retained-figure2-arch="true"]');
    const proofGround = document.querySelector<HTMLElement>('[data-figure2-retained-ground="true"]');
    const brandLayer = document.querySelector<HTMLElement>('[data-stage-layer="brand"]');
    const canvases = [...document.querySelectorAll<HTMLCanvasElement>('[data-r4-ink-segment]')];
    return {
      activeInkSegments: canvases
        .filter((canvas) => canvas.dataset.r4InkActive === 'true' || canvas.parentElement?.dataset.r4InkActive === 'true')
        .map((canvas) => canvas.dataset.r4InkSegment ?? ''),
      fieldInkSegments: canvases
        .filter((canvas) => canvas.dataset.r4InkRenderer === 'field' && canvas.dataset.r4InkEffectOnly === 'true')
        .map((canvas) => canvas.dataset.r4InkSegment ?? ''),
      transitions: [...document.querySelectorAll<HTMLElement>('[data-r4-transition]')]
        .map((element) => element.dataset.r4Transition ?? ''),
      proofRootCount: document.querySelectorAll('[data-r4-scene="figure2-proof"]').length,
      proofPanelCount: proofRoot?.querySelectorAll('[data-r4-proof-panel]').length ?? 0,
      proofScrollportCount: proofScrollport ? 1 : 0,
      proofScrollTop: proofScrollport?.scrollTop ?? Number.NaN,
      proofMaxScrollTop: proofScrollport
        ? proofScrollport.scrollHeight - proofScrollport.clientHeight
        : Number.NaN,
      proofRevealProgress: Number.parseFloat(proofRoot?.dataset.figure2ProofRevealProgress ?? '0'),
      proofOpeningProgress: Number.parseFloat(proofOpening?.dataset.proofOpeningProgress ?? '0'),
      proofOpeningY: Number.parseFloat(
        proofOpening ? getComputedStyle(proofOpening).getPropertyValue('--r4-proof-opening-y') : '0'
      ),
      proofClosingOpacity: Number.parseFloat(
        proofClosing ? getComputedStyle(proofClosing).getPropertyValue('--r4-proof-closing-opacity') : '0'
      ),
      retainedArchCount: document.querySelectorAll('[data-stage-retained-figure2-arch="true"]').length,
      proofArchCount: document.querySelectorAll('.stage-proof-retained-arch').length,
      proofLayerElevated: proofLayer?.dataset.r4TransitionElevated === 'true',
      proofLayerMask: proofLayer ? getComputedStyle(proofLayer).maskImage : 'none',
      proofBackground: proofRoot ? getComputedStyle(proofRoot).backgroundImage : '',
      proofGroundBackground: proofGround ? getComputedStyle(proofGround).backgroundImage : '',
      figureDepthSurfaceCount: document.querySelectorAll('[data-figure2-figure-depth-surface]').length,
      brandLayerClip: brandLayer?.style.clipPath ?? '',
      retainedArchClip: retainedArch?.style.clipPath ?? '',
      videos: [...document.querySelectorAll<HTMLVideoElement>('[data-figure2-video]')]
        .filter((video) => video.dataset.figure2Inactive !== 'true')
        .map((video) => ({
        side: video.dataset.figure2Side ?? '',
        mediaKey: video.dataset.mediaKey ?? '',
        direction: video.dataset.timelineVideoDirection ?? '',
        frameReady: video.dataset.timelineVideoFrameReady === 'true',
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
  if (frame.phase === 'playing') expect(frame.interactableCount).toBe(0);
  if (frame.phase === 'hold') expect(frame.interactableCount).toBe(1);
}

function writeTrace(name: string, frame: Group3Snapshot): void {
  const artifactDir = resolve(process.cwd(), '..', 'artifacts', 'react-refactor', 'r4-g3');
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(resolve(artifactDir, name), `${JSON.stringify(frame, null, 2)}\n`);
}

test.describe('R4 group3 canonical Figure2 and compound Proof harness', () => {
  test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

  test('runs Figure2 media, holds its terminal frame for one second, then reveals the compound Proof hold', async ({ page }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/harness/r4-g3');
    await expect(page.getByTestId('r2-stage')).toBeVisible();

    await page.evaluate(() => { void window.__r4Group3?.playForward(); });
    await expect.poll(async () => (await visualSnapshot(page)).videos.some((video) => (
      video.direction === '1' && video.frameReady && !video.paused && video.currentTime > 0.05
    )), { timeout: 12_000, intervals: [20] }).toBe(true);

    await expect.poll(async () => {
      const frame = await snapshot(page);
      const visual = await visualSnapshot(page);
      return frame.phase === 'playing'
        && visual.videos.length === 2
        && visual.videos.every((video) => video.frameReady && video.paused && video.currentTime > 2)
        && !visual.activeInkSegments.includes('figure2-distance-expand')
        && visual.proofRevealProgress === 0;
    }, { timeout: 8_000, intervals: [20] }).toBe(true);
    const dwellStartedAt = Date.now();
    const terminalVideos = (await visualSnapshot(page)).videos;
    await page.waitForTimeout(650);
    const dwellFrame = await visualSnapshot(page);
    expect((await snapshot(page)).phase).toBe('playing');
    expect(dwellFrame.activeInkSegments).not.toContain('figure2-distance-expand');
    expect(dwellFrame.proofRevealProgress).toBe(0);
    expect(dwellFrame.videos.every((video, index) => (
      video.paused && Math.abs(video.currentTime - (terminalVideos[index]?.currentTime ?? 0)) < 0.03
    ))).toBe(true);

    await expect.poll(async () => {
      const visual = await visualSnapshot(page);
      return visual.transitions.includes('figure2-proof-binary-depth')
        && visual.activeInkSegments.includes('figure2-distance-expand')
        && visual.proofLayerElevated
        && visual.proofRevealProgress > 0
        && visual.proofRevealProgress < 1;
    }, { timeout: 8_000, intervals: [20] }).toBe(true);
    expect(Date.now() - dwellStartedAt).toBeGreaterThanOrEqual(850);
    const depthFrame = await visualSnapshot(page);
    expect(depthFrame.proofLayerMask).not.toBe('none');
    expect(depthFrame.fieldInkSegments).toContain('figure2-distance-expand');
    expect(depthFrame.figureDepthSurfaceCount).toBe(1);
    expect(depthFrame.proofRootCount).toBe(1);
    expect(depthFrame.proofPanelCount).toBe(3);
    expect(depthFrame.proofOpeningProgress).toBe(1);
    expect(depthFrame.proofOpeningY).toBe(0);

    await expect.poll(async () => (await snapshot(page)).window.current, { timeout: 10_000 }).toBe('figure2-proof');
    const proofHold = await visualSnapshot(page);
    expect(proofHold.proofRootCount).toBe(1);
    expect(proofHold.proofPanelCount).toBe(3);
    expect(proofHold.proofScrollportCount).toBe(1);
    expect(proofHold.proofScrollTop).toBeLessThan(1);
    expect(proofHold.proofMaxScrollTop).toBeGreaterThan(1_000);
    expect(proofHold.retainedArchCount).toBe(1);
    expect(proofHold.proofArchCount).toBe(1);
    expect(proofHold.proofGroundBackground).not.toBe('none');
    expect((await snapshot(page)).eventLog).not.toEqual(expect.arrayContaining([
      'STAGE_PAUSED',
      'PLAY:figure2-proof-opening-cards:1',
      'PLAY:figure2-proof-cards-closing:1'
    ]));

    await expect.poll(async () => (await snapshot(page)).eventLog.includes(
      'PLAY:figure2-distance-expand:1'
    )).toBe(true);
    const beforeInternalScroll = (await snapshot(page)).eventLog.length;
    const proofScrollport = page.locator(
      '[data-stage-layer="figure2-proof"] [data-reading-scrollport="true"]'
    );
    await proofScrollport.hover();
    for (let index = 0; index < 4; index += 1) {
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(24);
    }
    expect((await snapshot(page)).window.current).toBe('figure2-proof');
    expect((await visualSnapshot(page)).proofScrollTop).toBeGreaterThan(100);
    expect((await snapshot(page)).eventLog.length).toBe(beforeInternalScroll);

    await page.evaluate(() => { void window.__r4Group3?.playForward(); });
    await expect.poll(async () => {
      const visual = await visualSnapshot(page);
      return visual.activeInkSegments.includes('figure2-proof-brand')
        && visual.transitions.includes('figure2-proof-brand-live-clip');
    }, { timeout: 4_000, intervals: [20] }).toBe(true);
    const brandInk = await visualSnapshot(page);
    expect(brandInk.proofClosingOpacity).toBe(1);
    expect(brandInk.brandLayerClip.startsWith('polygon(')).toBe(true);
    expect(brandInk.retainedArchClip.startsWith('polygon(')).toBe(true);
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('brand');

    await page.evaluate(() => { void window.__r4Group3?.playReverse(); });
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('figure2-proof');
    const reverseProof = await visualSnapshot(page);
    expect(reverseProof.proofRootCount).toBe(1);
    expect(reverseProof.proofPanelCount).toBe(3);
    await assertFrame(await snapshot(page));
    writeTrace('group3-forward-reverse-trace.json', await snapshot(page));
  });

  test('reverses the same depth and media lifecycle across the symmetric timed boundary', async ({ page }) => {
    test.setTimeout(45_000);
    await page.goto('/harness/r4-g3-figure2-distance-expand');
    await expect(page.getByTestId('r2-stage')).toBeVisible();

    await page.evaluate(() => { void window.__r4Group3?.playForward(); });
    await expect.poll(async () => (await snapshot(page)).window.current, { timeout: 10_000 }).toBe('figure2-proof');
    const parked = (await visualSnapshot(page)).videos;
    expect(parked).toHaveLength(2);
    expect(parked.every((video) => video.frameReady && video.paused && video.currentTime > 2)).toBe(true);

    await page.evaluate(() => { void window.__r4Group3?.playReverse(); });
    await expect.poll(async () => {
      const visual = await visualSnapshot(page);
      return visual.transitions.includes('figure2-proof-binary-depth')
        && visual.videos.every((video) => (
          video.direction === '-1'
          && !video.paused
          && video.currentTime > 0.05
          && video.currentTime < 2.3
        ));
    }, { timeout: 5_000, intervals: [20] }).toBe(true);

    const samples: Record<string, number[]> = { left: [], right: [] };
    while ((await snapshot(page)).phase !== 'hold') {
      const visual = await visualSnapshot(page);
      for (const video of visual.videos) samples[video.side]?.push(video.currentTime);
      await page.waitForTimeout(40);
    }
    for (const side of ['left', 'right']) {
      const values = samples[side] ?? [];
      expect(values.length).toBeGreaterThan(4);
      expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.2);
      expect(values.some((value, index) => index > 0 && value > (values[index - 1] ?? 0) + 0.01)).toBe(true);
    }
    expect((await snapshot(page)).window.current).toBe('figure2-animation');
    expect((await snapshot(page)).eventLog).not.toContain('STAGE_PAUSED');
  });

  test('covers reduced motion and 0 to 1 to 0 to 1 replay on the canonical segment', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/harness/r4-g3-figure2-distance-expand');
    await expect(page.getByTestId('r2-stage')).toBeVisible();
    await page.evaluate(async () => { await window.__r4Group3?.idempotentCycle(); });
    const frame = await snapshot(page);
    expect(frame.phase).toBe('hold');
    expect(frame.window.current).toBe('figure2-proof');
    expect((await visualSnapshot(page)).proofPanelCount).toBe(3);
  });

  test('keeps the committed hold when endpoint reconstruction also times out', async ({ page }) => {
    await page.goto('/harness/r4-g3');
    await expect(page.getByTestId('r2-stage')).toBeVisible();
    await page.evaluate(async () => { await window.__r4Group3?.playForward({ buildTimeout: true }); });
    const frame = await snapshot(page);
    expect(frame.phase).toBe('hold');
    expect(frame.window.current).toBe('figure2-animation');
    expect(frame.interactableCount).toBe(1);
    expect(frame.recoveryCount).toBe(1);
    expect(frame.eventLog).toContain('BUILD_TIMEOUT:figure2-distance-expand');
  });
});
