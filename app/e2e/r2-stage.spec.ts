import { expect, test, type Page } from '@playwright/test';

type StageSnapshot = {
  phase: 'hold' | 'preparing' | 'playing' | 'recovering';
  window: { current: string; retiring: readonly string[] };
  visibleCount: number;
  interactableCount: number;
  mountedCount: number;
  eventLog: readonly string[];
  mediaReadyAccepted: number;
  duplicateMediaReadyIgnored: number;
  staleCompletionIgnored: number;
  recoveryCount: number;
  copyCueActivations: number;
  layers: readonly {
    scene: string;
    role: string;
    visible: boolean;
    interactable: boolean;
    opacity: number;
    copyCueActive: boolean;
    copyCueActivations: number;
  }[];
};

declare global {
  interface Window {
    __r2Stage?: {
      playForward(options?: { slowReady?: boolean; buildTimeout?: boolean }): Promise<void>;
      playReverse(options?: { slowReady?: boolean; buildTimeout?: boolean }): Promise<void>;
      seek(scene: 'hero' | 'pattern'): void;
      duplicateMediaReady(): void;
      copyCueCycle(): Promise<void>;
      actualRetiringPath(): Promise<void>;
      snapshot(): StageSnapshot;
    };
    __r2RetiringObservation?: {
      frame: StageSnapshot;
      layer: StageSnapshot['layers'][number];
    };
  }
}

async function snapshot(page: Page): Promise<StageSnapshot> {
  return page.evaluate(() => {
    const api = window.__r2Stage;
    if (!api) {
      throw new Error('R2 stage harness API is not installed');
    }
    return api.snapshot();
  });
}

async function assertStageFrame(frame: StageSnapshot): Promise<void> {
  expect(frame.visibleCount).toBeGreaterThan(0);
  expect(frame.visibleCount).toBeLessThanOrEqual(2);
  expect(frame.interactableCount).toBeLessThanOrEqual(1);
  expect(frame.mountedCount).toBeLessThanOrEqual(4);
  if (frame.phase === 'playing') {
    expect(frame.interactableCount).toBe(0);
  }
  if (frame.phase === 'hold') {
    expect(frame.interactableCount).toBe(1);
  }
}

test.describe('R2 synthetic Stage handoff', () => {
  test.use({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce'
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/harness/stage');
    await expect(page.getByTestId('r2-stage')).toBeVisible();
  });

  test('keeps every sampled frame nonblank with at most two visible layers and one interactable layer', async ({ page }) => {
    await page.evaluate(() => {
      void window.__r2Stage?.playForward();
    });

    const frames: StageSnapshot[] = [];
    for (let index = 0; index < 18; index += 1) {
      await page.waitForTimeout(20);
      frames.push(await snapshot(page));
    }

    for (const frame of frames) {
      await assertStageFrame(frame);
    }

    await expect.poll(async () => (await snapshot(page)).window.current).toBe('pattern');
    const finalFrame = await snapshot(page);
    expect(finalFrame.phase).toBe('hold');
    expect(finalFrame.visibleCount).toBe(1);
    expect(finalFrame.interactableCount).toBe(1);
  });

  test('passes the canvas pixel smoke check used for flaky triage', async ({ page }) => {
    const rgba = await page.getByTestId('stage-pixel-smoke').evaluate((canvas) => {
      const context = (canvas as HTMLCanvasElement).getContext('2d');
      if (!context) {
        throw new Error('missing 2d context');
      }
      return [...context.getImageData(0, 0, 1, 1).data];
    });

    expect(rgba[3]).toBe(255);
    expect(rgba[0]! + rgba[1]! + rgba[2]!).toBeGreaterThan(0);
  });

  test('slow-ready enters playing before timeout and build-timeout recovers without locking input', async ({ page }) => {
    await page.evaluate(async () => {
      await window.__r2Stage?.playForward({ slowReady: true });
    });
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('pattern');
    const slowReady = await snapshot(page);
    expect(slowReady.eventLog).toContain('MEDIA_READY:accepted');
    expect(slowReady.eventLog).toContain('BUILD_READY:hero-pattern');
    expect(slowReady.recoveryCount).toBe(0);

    await page.evaluate(() => window.__r2Stage?.seek('hero'));
    await page.evaluate(async () => {
      await window.__r2Stage?.playForward({ buildTimeout: true });
    });
    await expect.poll(async () => (await snapshot(page)).recoveryCount).toBe(1);
    await expect.poll(async () => (await snapshot(page)).interactableCount).toBe(1);
    const timeout = await snapshot(page);
    expect(timeout.window.current).toBe('hero');
    expect(timeout.eventLog).toContain('BUILD_TIMEOUT:hero-pattern');
    expect(timeout.interactableCount).toBe(1);
  });

  test('seek abort ignores stale completion from the old run', async ({ page }) => {
    await page.evaluate(() => {
      void window.__r2Stage?.playForward();
    });
    await page.waitForTimeout(80);
    await page.evaluate(() => window.__r2Stage?.seek('hero'));

    await expect.poll(async () => (await snapshot(page)).staleCompletionIgnored).toBe(1);
    const frame = await snapshot(page);
    expect(frame.window.current).toBe('hero');
    expect(frame.eventLog.some((event) => event.startsWith('SEGMENT_ABORTED:seek'))).toBe(true);
  });

  test('dedupes duplicate mediaReady and keeps copyCue idempotent across 0 to 1 to 0 to 1', async ({ page }) => {
    await page.evaluate(() => window.__r2Stage?.duplicateMediaReady());
    let frame = await snapshot(page);
    expect(frame.mediaReadyAccepted).toBe(1);
    expect(frame.duplicateMediaReadyIgnored).toBe(1);

    await page.evaluate(() => window.__r2Stage?.copyCueCycle());
    frame = await snapshot(page);
    expect(frame.window.current).toBe('pattern');
    expect(frame.copyCueActivations).toBe(1);
  });

  test('releases retiring layers on the real actor settling path', async ({ page }) => {
    const path = page.evaluate(async () => {
      await window.__r2Stage?.actualRetiringPath();
    });
    const frames: StageSnapshot[] = [];
    for (let index = 0; index < 40; index += 1) {
      await page.waitForTimeout(20);
      frames.push(await snapshot(page));
      if (frames.at(-1)?.eventLog.includes('RETIRING_RELEASED')) {
        break;
      }
    }

    await page.waitForFunction(
      () => {
        const frame = window.__r2Stage?.snapshot();
        const layer = frame?.layers.find((candidate) => candidate.role === 'retiring' && candidate.scene === 'hero');
        if (!frame || !layer) {
          return false;
        }
        window.__r2RetiringObservation = { frame, layer };
        return true;
      },
      undefined,
      { polling: 'raf' }
    );
    const observed = await page.evaluate(() => window.__r2RetiringObservation);
    expect(observed?.layer).toMatchObject({
      visible: false,
      interactable: false,
      opacity: 0
    });
    expect(observed?.frame.visibleCount).toBeGreaterThan(0);
    expect(observed?.frame.interactableCount).toBeLessThanOrEqual(1);
    expect(frames.some((frame) => frame.phase === 'playing' && frame.window.current === 'pattern')).toBe(true);
    for (const frame of frames) {
      await assertStageFrame(frame);
    }

    await path;
    await expect.poll(async () => (await snapshot(page)).eventLog.includes('RETIRING_RELEASED')).toBe(true);
    const after = await snapshot(page);
    expect(after.window.current).toBe('star-map');
    expect(after.window.retiring).toEqual([]);
    expect(after.visibleCount).toBeGreaterThan(0);
    expect(after.interactableCount).toBe(1);
    expect(after.eventLog).toContain('RETIRING_RELEASED');
  });
});
