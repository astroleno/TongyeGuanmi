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
      forwardFrames.push(await snapshot(page));
    }
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('method-bottom');

    await page.evaluate(() => {
      void window.__r4Group2?.playForward();
    });
    for (let index = 0; index < 18; index += 1) {
      await page.waitForTimeout(24);
      forwardFrames.push(await snapshot(page));
    }
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('figure2-animation');

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
