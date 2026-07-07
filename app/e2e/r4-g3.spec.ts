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
      for (let index = 0; index < 18; index += 1) {
        await page.waitForTimeout(24);
        frames.push(await snapshot(page));
      }
      await expect.poll(async () => (await snapshot(page)).window.current, { timeout: 7_000 }).toBe(target);
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
