import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type BackHalfSnapshot = {
  phase: 'hold' | 'preparing' | 'playing' | 'recovering';
  window: { current: string; retiring: readonly string[] };
  visibleCount: number;
  interactableCount: number;
  mountedCount: number;
  eventLog: readonly string[];
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
    __r4BackHalf?: {
      playForward(): Promise<void>;
      playReverse(): Promise<void>;
      playThroughContact(): Promise<void>;
      playThroughServices(): Promise<void>;
      seek(scene: 'services' | 'ttg-animation' | 'lab' | 'ph-animation' | 'education' | 'crane-animation' | 'contact'): void;
      snapshot(): BackHalfSnapshot;
    };
  }
}

async function snapshot(page: Page): Promise<BackHalfSnapshot> {
  return page.evaluate(() => {
    const api = window.__r4BackHalf;
    if (!api) {
      throw new Error('R4 back-half harness API is not installed');
    }
    return api.snapshot();
  });
}

async function assertFrame(frame: BackHalfSnapshot): Promise<void> {
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

function writeTrace(name: string, frame: BackHalfSnapshot): void {
  const artifactDir = resolve(process.cwd(), '..', 'artifacts', 'react-refactor', 'r4-g4-g7');
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(resolve(artifactDir, name), `${JSON.stringify(frame, null, 2)}\n`);
}

async function playOne(page: Page, direction: 1 | -1, expectedScene: string): Promise<BackHalfSnapshot[]> {
  await page.evaluate((playDirection) => {
    if (playDirection === 1) {
      void window.__r4BackHalf?.playForward();
    } else {
      void window.__r4BackHalf?.playReverse();
    }
  }, direction);

  const frames: BackHalfSnapshot[] = [];
  for (let index = 0; index < 14; index += 1) {
    await page.waitForTimeout(28);
    frames.push(await snapshot(page));
  }
  await expect.poll(async () => (await snapshot(page)).window.current).toBe(expectedScene);
  return frames;
}

test.describe('R4 G4-G7 back-half integration harness', () => {
  test.use({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1
  });

  test('runs services to contact forward and returns by the key reverse path', async ({ page }) => {
    test.setTimeout(100_000);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/harness/r4-back-half');
    await expect(page.getByTestId('r2-stage')).toBeVisible();

    const forwardScenes = ['ttg-animation', 'lab', 'ph-animation', 'education', 'crane-animation', 'contact'];
    const reverseScenes = ['crane-animation', 'education', 'ph-animation', 'lab', 'ttg-animation', 'services'];
    const frames: BackHalfSnapshot[] = [];

    for (const scene of forwardScenes) {
      frames.push(...await playOne(page, 1, scene));
    }
    let finalFrame = await snapshot(page);
    expect(finalFrame.phase).toBe('hold');
    expect(finalFrame.window.current).toBe('contact');
    expect(finalFrame.eventLog).toEqual(expect.arrayContaining([
      'PLAY:services-ttg:1',
      'PLAY:ttg-lab:1',
      'PLAY:lab-ph:1',
      'PLAY:ph-education:1',
      'PLAY:education-crane:1',
      'PLAY:crane-contact:1'
    ]));

    for (const scene of reverseScenes) {
      frames.push(...await playOne(page, -1, scene));
    }
    finalFrame = await snapshot(page);
    writeTrace('back-half-forward-reverse-trace.json', finalFrame);
    expect(finalFrame.phase).toBe('hold');
    expect(finalFrame.window.current).toBe('services');
    expect(finalFrame.eventLog).toContain('PLAY:services-ttg:-1');

    for (const frame of frames) {
      await assertFrame(frame);
    }
  });

  test('supports hash direct entry to contact', async ({ page }) => {
    await page.goto('/harness/r4-back-half#contact');
    await expect(page.getByTestId('r2-stage')).toBeVisible();
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('contact');

    const frame = await snapshot(page);
    writeTrace('back-half-hash-contact-trace.json', frame);
    expect(frame.phase).toBe('hold');
    expect(frame.visibleCount).toBe(1);
    expect(frame.interactableCount).toBe(1);
  });

  test('runs the full services to contact path with reduced motion', async ({ page }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/harness/r4-back-half');
    await expect(page.getByTestId('r2-stage')).toBeVisible();
    await expect(page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)).resolves.toBe(true);

    await page.evaluate(async () => {
      await window.__r4BackHalf?.playThroughContact();
    });

    const frame = await snapshot(page);
    writeTrace('back-half-reduced-motion-trace.json', frame);
    expect(frame.phase).toBe('hold');
    expect(frame.window.current).toBe('contact');
    expect(frame.visibleCount).toBe(1);
    expect(frame.interactableCount).toBe(1);
  });
});
