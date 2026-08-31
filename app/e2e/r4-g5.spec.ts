import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  captureSettledEndpoint,
  endpointProbe,
  installEndpointProbe
} from './endpoint-parity';

type Group5Snapshot = {
  phase: 'hold' | 'preparing' | 'playing' | 'recovering';
  window: { current: string; retiring: readonly string[] };
  visibleCount: number;
  interactableCount: number;
  mountedCount: number;
  eventLog: readonly string[];
  recoveryCount: number;
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
    if (!window.__r4Group5) throw new Error('R4 group5 harness API is not installed');
    return window.__r4Group5.snapshot();
  });
}

type VisualSnapshot = {
  activeInkSegments: readonly string[];
  fieldInkSegments: readonly string[];
  transitions: readonly string[];
  revealProgress: number;
  revealClip: string;
  revealMask: string;
  revealMode: string;
  ttgProgress: number;
  ttgDirection: string;
  ttgLayerVisible: boolean;
  ttgDesiredFrame: number | null;
  ttgPresentedFrame: number | null;
  ttgFrameEvidence: string | null;
  videos: readonly { currentTime: number; paused: boolean; frameReady: boolean }[];
  labProgress: number;
  labRows: number;
  labRoots: number;
  labLayers: number;
  labScrollTop: number;
};

async function visualSnapshot(page: Page): Promise<VisualSnapshot> {
  return page.evaluate(() => {
    const ttg = document.querySelector<HTMLElement>('[data-r4-scene="ttg-animation"]');
    const lab = document.querySelector<HTMLElement>('[data-r4-scene="lab"]');
    const revealLayer = [...document.querySelectorAll<HTMLElement>('[data-r4-reveal-progress]')]
      .find((element) => element.dataset.r4InkActive === 'true') ?? null;
    const revealStyle = revealLayer ? getComputedStyle(revealLayer) : null;
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
      revealProgress: Number.parseFloat(revealLayer?.dataset.r4RevealProgress ?? '0'),
      revealClip: revealStyle?.clipPath ?? 'none',
      revealMask: revealStyle?.getPropertyValue('-webkit-mask-image')
        || revealStyle?.getPropertyValue('mask-image')
        || 'none',
      revealMode: revealLayer?.dataset.r4RevealMode ?? '',
      ttgProgress: Number.parseFloat(ttg?.dataset.ttgProgress ?? '0'),
      ttgDirection: ttg?.dataset.ttgPlaybackDirection ?? '',
      ttgLayerVisible: ttg?.closest<HTMLElement>('[data-stage-layer]')?.dataset.visible === 'true',
      ttgDesiredFrame: ttg?.dataset.ttgDesiredFrame
        ? Number.parseInt(ttg.dataset.ttgDesiredFrame, 10)
        : null,
      ttgPresentedFrame: ttg?.dataset.ttgPresentedFrame
        ? Number.parseInt(ttg.dataset.ttgPresentedFrame, 10)
        : null,
      ttgFrameEvidence: ttg?.dataset.ttgFrameEvidence ?? null,
      videos: [...document.querySelectorAll<HTMLVideoElement>('[data-ttg-figure-video]')].map((video) => ({
        currentTime: video.currentTime,
        paused: video.paused,
        frameReady: video.dataset.timelineVideoFrameReady === 'true'
      })),
      labProgress: Number.parseFloat(lab?.dataset.labProgress ?? '0'),
      labRows: document.querySelectorAll('.r4-lab__row').length,
      labRoots: document.querySelectorAll('[data-r4-scene="lab"]').length,
      labLayers: document.querySelectorAll('[data-stage-layer="lab"]').length,
      labScrollTop: lab?.scrollTop ?? Number.NaN
    };
  });
}

function writeTrace(name: string, frame: Group5Snapshot): void {
  const directory = resolve(process.cwd(), '..', 'artifacts', 'react-refactor', 'r4-g5');
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, name), `${JSON.stringify(frame, null, 2)}\n`);
}

test.describe('R4 group5 Services, TTG, and Lab lifecycle', () => {
  test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

  test('keeps TTG as a semantic hold, dwells on its terminal frame, then hands off to Lab', async ({ page }) => {
    test.setTimeout(45_000);
    await page.goto('/harness/r4-g5');
    await expect(page.getByTestId('r2-stage')).toBeVisible();

    await page.evaluate(() => { void window.__r4Group5?.playForward(); });
    await expect.poll(async () => {
      const visual = await visualSnapshot(page);
      return visual.activeInkSegments.includes('services-ttg')
        && visual.fieldInkSegments.includes('services-ttg')
        && visual.transitions.includes('services-ttg-bottom-ink')
        && visual.revealProgress > 0
        && visual.revealProgress < 1
        && visual.revealMode === 'ink-occluded-live-gate'
        && visual.revealClip.startsWith('polygon(')
        && visual.revealMask === 'none';
    }, {
      timeout: 4_000,
      intervals: [20]
    }).toBe(true);
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('ttg-animation');
    const ttgHold = await visualSnapshot(page);
    expect(ttgHold.ttgProgress).toBe(0);
    expect(ttgHold.videos).toHaveLength(1);
    expect(ttgHold.videos[0]).toMatchObject({ paused: true, frameReady: true });
    expect(ttgHold.ttgDesiredFrame).toBe(0);
    expect(ttgHold.ttgPresentedFrame).toBe(0);
    expect(ttgHold.ttgFrameEvidence).toBe('video-frame-callback');

    await installEndpointProbe(page, 'lab', '.r4-lab');
    await page.evaluate(() => { void window.__r4Group5?.playForward(); });
    await expect.poll(async () => {
      const visual = await visualSnapshot(page);
      return visual.ttgDirection === '1'
        && visual.ttgProgress > 0
        && visual.ttgProgress < 1
        && visual.videos.some((video) => video.frameReady && video.paused)
        && visual.ttgDesiredFrame !== null
        && visual.ttgDesiredFrame === visual.ttgPresentedFrame
        && visual.ttgFrameEvidence === 'video-frame-callback';
    }, { timeout: 5_000, intervals: [20] }).toBe(true);
    await expect.poll(async () => {
      const visual = await visualSnapshot(page);
      const handoff = Number.parseFloat(
        await page.locator('[data-stage-layer="lab"]').getAttribute('data-r4-handoff-progress') ?? '0'
      );
      return (await snapshot(page)).phase === 'playing'
        && visual.ttgProgress === 1
        && visual.videos.length === 1
        && visual.videos[0]!.paused
        && visual.videos[0]!.currentTime > 2.4
        && handoff === 0;
    }, { timeout: 6_000, intervals: [20] }).toBe(true);
    const dwellStartedAt = Date.now();
    const terminalTime = (await visualSnapshot(page)).videos[0]!.currentTime;
    const terminalVisual = await visualSnapshot(page);
    expect(terminalVisual.ttgDesiredFrame).toBe(74);
    expect(terminalVisual.ttgPresentedFrame).toBe(74);
    expect(terminalVisual.ttgFrameEvidence).toBe('video-frame-callback');
    await page.waitForTimeout(650);
    const dwellFrame = await visualSnapshot(page);
    expect((await snapshot(page)).phase).toBe('playing');
    expect(dwellFrame.videos[0]).toMatchObject({ paused: true, frameReady: true });
    expect(Math.abs(dwellFrame.videos[0]!.currentTime - terminalTime)).toBeLessThan(0.03);
    expect(Number.parseFloat(
      await page.locator('[data-stage-layer="lab"]').getAttribute('data-r4-handoff-progress') ?? '0'
    )).toBe(0);
    await expect.poll(async () => {
      const layer = page.locator('[data-stage-layer="lab"]');
      return Number.parseFloat(await layer.getAttribute('data-r4-handoff-progress') ?? '0');
    }, { timeout: 8_000, intervals: [20] }).toBeGreaterThan(0);
    expect(Date.now() - dwellStartedAt).toBeGreaterThanOrEqual(850);
    await expect.poll(async () => (await snapshot(page)).window.current, { timeout: 10_000 }).toBe('lab');

    const probe = await endpointProbe(page);
    const settled = await captureSettledEndpoint(page);
    expect(probe.near).not.toBeNull();
    expect(probe.endpoint).not.toBeNull();
    expect(probe.near?.handoffProgress).toBeGreaterThan(0.95);
    expect(probe.near?.layerOpacity).toBeGreaterThan(0.95);
    expect(probe.near?.visual).toEqual(probe.endpoint?.visual);
    expect(probe.endpoint?.layerOpacity).toBe(1);
    expect(probe.endpoint?.role).not.toBe('current');
    expect(probe.endpoint?.visual).toEqual(settled.visual);
    expect(settled.role).toBe('current');
    expect(settled.layerOpacity).toBe(1);
    expect(settled.transitionAttrs).toEqual([]);

    const labHold = await visualSnapshot(page);
    expect(labHold).toMatchObject({ labProgress: 1, labRows: 6, labRoots: 1, labLayers: 1, labScrollTop: 0 });
    const log = (await snapshot(page)).eventLog;
    expect(log).not.toContain('STAGE_PAUSED');
    expect(log.filter((event) => event === 'PLAY:ttg-lab:1')).toHaveLength(1);

    await page.evaluate(() => { void window.__r4Group5?.playReverse(); });
    await expect.poll(async () => {
      const visual = await visualSnapshot(page);
      return (await snapshot(page)).phase === 'playing'
        && visual.ttgLayerVisible
        && visual.ttgProgress === 1
        && visual.videos[0]?.paused === true
        && visual.ttgDesiredFrame === 74
        && visual.ttgPresentedFrame === 74
        && visual.ttgFrameEvidence === 'video-frame-callback'
        && (visual.videos[0]?.currentTime ?? 0) > 2.4;
    }, { timeout: 5_000, intervals: [20] }).toBe(true);
    const reverseDwellStartedAt = Date.now();
    await page.waitForTimeout(650);
    const reverseDwellFrame = await visualSnapshot(page);
    expect(reverseDwellFrame.ttgProgress).toBe(1);
    expect(reverseDwellFrame.videos[0]?.paused).toBe(true);
    await expect.poll(async () => (await visualSnapshot(page)).ttgDirection, {
      timeout: 5_000,
      intervals: [20]
    }).toBe('-1');
    let previousTime: number | undefined;
    let descendingFrames = 0;
    for (let index = 0; index < 80 && (await snapshot(page)).phase !== 'hold'; index += 1) {
      await page.waitForTimeout(40);
      const video = (await visualSnapshot(page)).videos[0];
      if (video && previousTime !== undefined && video.currentTime < previousTime - 0.01) descendingFrames += 1;
      previousTime = video?.currentTime ?? previousTime;
    }
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('ttg-animation');
    expect(Date.now() - reverseDwellStartedAt).toBeGreaterThanOrEqual(850);
    expect(descendingFrames).toBeGreaterThan(2);
    writeTrace('group5-forward-reverse-trace.json', await snapshot(page));
  });

  test('reverses TTG from the canonical terminal frame on the same media surface', async ({ page }) => {
    await page.goto('/harness/r4-g5-ttg-lab');
    await expect(page.getByTestId('r2-stage')).toBeVisible();
    await page.evaluate(() => { void window.__r4Group5?.playForward(); });
    await expect.poll(async () => (await snapshot(page)).window.current, { timeout: 10_000 }).toBe('lab');
    const terminal = await visualSnapshot(page);
    expect(terminal.videos).toHaveLength(1);
    expect(terminal.videos[0]?.currentTime).toBeGreaterThan(2.4);

    await page.evaluate(() => { void window.__r4Group5?.playReverse(); });
    await expect.poll(async () => {
      const visual = await visualSnapshot(page);
      return visual.ttgDirection === '-1'
        && visual.ttgProgress > 0
        && visual.ttgProgress < 1
        && visual.ttgDesiredFrame !== null
        && visual.ttgDesiredFrame === visual.ttgPresentedFrame
        && visual.ttgFrameEvidence === 'video-frame-callback'
        && (visual.videos[0]?.currentTime ?? 2.5) < 2.4;
    }, { timeout: 8_000, intervals: [20] }).toBe(true);
    await expect.poll(async () => (await snapshot(page)).window.current, { timeout: 10_000 }).toBe('ttg-animation');
    const restored = await visualSnapshot(page);
    expect(restored.videos).toHaveLength(1);
    expect(restored.videos[0]?.currentTime).toBeLessThan(0.05);
    expect(restored.ttgDesiredFrame).toBe(0);
    expect(restored.ttgPresentedFrame).toBe(0);
    expect(restored.ttgFrameEvidence).toBe('video-frame-callback');
  });

  test('covers reduced motion and idempotent 0 to 1 to 0 to 1 replay', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/harness/r4-g5-ttg-lab');
    await expect(page.getByTestId('r2-stage')).toBeVisible();
    await page.evaluate(async () => { await window.__r4Group5?.idempotentCycle(); });
    const frame = await snapshot(page);
    expect(frame.phase).toBe('hold');
    expect(frame.window.current).toBe('lab');
    expect(frame.visibleCount).toBe(1);
    expect(frame.interactableCount).toBe(1);
    expect(frame.eventLog).not.toContain('STAGE_PAUSED');
  });

  test('recovers from build timeout and supports seek', async ({ page }) => {
    await page.goto('/harness/r4-g5');
    await expect(page.getByTestId('r2-stage')).toBeVisible();
    await page.evaluate(async () => { await window.__r4Group5?.playForward({ buildTimeout: true }); });
    const recovered = await snapshot(page);
    expect(recovered.phase).toBe('hold');
    expect(recovered.window.current).toBe('ttg-animation');
    expect(recovered.recoveryCount).toBe(1);
    expect(recovered.eventLog).toContain('BUILD_TIMEOUT:services-ttg');
    await page.evaluate(() => { window.__r4Group5?.seek('lab'); });
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('lab');
  });
});
