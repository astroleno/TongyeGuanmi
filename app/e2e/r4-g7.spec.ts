import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Group7Snapshot = {
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
    __r4Group7?: {
      playForward(options?: { buildTimeout?: boolean }): Promise<void>;
      playReverse(options?: { buildTimeout?: boolean }): Promise<void>;
      seek(scene: 'education' | 'crane-animation' | 'contact'): void;
      idempotentCycle(): Promise<void>;
      snapshot(): Group7Snapshot;
    };
  }
}

async function snapshot(page: Page): Promise<Group7Snapshot> {
  return page.evaluate(() => {
    const api = window.__r4Group7;
    if (!api) {
      throw new Error('R4 group7 harness API is not installed');
    }
    return api.snapshot();
  });
}

type Group7VisualSnapshot = {
  activeInkSegments: readonly string[];
  transitions: readonly string[];
  craneProgress: number;
  craneArchTransform: string;
  craneFrontTransform: string;
  craneVideos: readonly { loop: boolean; paused: boolean; currentTime: number }[];
  cranePlaybackActive: string | undefined;
  contactProgress: number;
  contactCopyCue: string | undefined;
  contactScheme: string;
  contactHandoffProgress: number;
  educationReference: boolean;
  revealProgress: number;
  revealClip: string;
};

async function visualSnapshot(page: Page): Promise<Group7VisualSnapshot> {
  return page.evaluate(() => {
    const craneRoot = document.querySelector<HTMLElement>('[data-r4-scene="crane-animation"]');
    const archLayer = document.querySelector<HTMLElement>('.r4-crane-animation .crane-layer--arch');
    const frontLayer = document.querySelector<HTMLElement>('.r4-crane-animation .crane-layer--cloud-front');
    const contactRoot = document.querySelector<HTMLElement>('[data-r4-scene="contact"]');
    const contactLayer = contactRoot?.closest<HTMLElement>('[data-stage-layer]');
    const revealLayer = [...document.querySelectorAll<HTMLElement>('[data-r4-reveal-progress]')]
      .find((element) => element.dataset.r4InkActive === 'true') ?? null;
    const inkCanvases = [...document.querySelectorAll<HTMLCanvasElement>('[data-r4-ink-segment]')];
    return {
      activeInkSegments: inkCanvases
        .filter((canvas) => canvas.parentElement?.dataset.r4InkActive === 'true')
        .map((canvas) => canvas.dataset.r4InkSegment ?? ''),
      transitions: [...document.querySelectorAll<HTMLElement>('[data-r4-transition]')]
        .map((element) => element.dataset.r4Transition ?? ''),
      craneProgress: Number.parseFloat(craneRoot?.dataset.craneProgress ?? '0'),
      craneArchTransform: window.getComputedStyle(archLayer ?? document.body).transform,
      craneFrontTransform: window.getComputedStyle(frontLayer ?? document.body).transform,
      craneVideos: [...document.querySelectorAll<HTMLVideoElement>('[data-crane-figure-video], [data-crane-figure-front-video]')].map((video) => ({
        loop: video.loop,
        paused: video.paused,
        currentTime: video.currentTime
      })),
      cranePlaybackActive: craneRoot?.dataset.cranePlaybackActive,
      contactProgress: Number.parseFloat(contactRoot?.dataset.contactProgress ?? '0'),
      contactCopyCue: contactLayer?.dataset.copyCueActive,
      contactScheme: window.getComputedStyle(contactRoot ?? document.body).colorScheme,
      contactHandoffProgress: Number.parseFloat(contactLayer?.dataset.r4HandoffReceiverProgress ?? '0'),
      educationReference: document.querySelector<HTMLElement>('[data-r4-reference-scene="true"]') !== null,
      revealProgress: Number.parseFloat(revealLayer?.dataset.r4RevealProgress ?? '0'),
      revealClip: revealLayer ? window.getComputedStyle(revealLayer).clipPath : 'none'
    };
  });
}

async function assertFrame(frame: Group7Snapshot): Promise<void> {
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

function writeTrace(name: string, frame: Group7Snapshot): void {
  const artifactDir = resolve(process.cwd(), '..', 'artifacts', 'react-refactor', 'r4-g7');
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(resolve(artifactDir, name), `${JSON.stringify(frame, null, 2)}\n`);
}

test.describe('R4 group7 education crane contact harness', () => {
  test.use({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1
  });

  test('runs forward and reverse with nonblank sampled frames', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/harness/r4-g7');
    await expect(page.getByTestId('r2-stage')).toBeVisible();
    expect((await visualSnapshot(page)).educationReference).toBe(false);

    await page.evaluate(() => {
      void window.__r4Group7?.playForward();
    });
    const frames: Group7Snapshot[] = [];
    let sawEducationCraneReveal = false;
    for (let index = 0; index < 18; index += 1) {
      await page.waitForTimeout(24);
      frames.push(await snapshot(page));
      if (index === 5) {
        const visual = await visualSnapshot(page);
        expect(visual.activeInkSegments).toContain('education-crane');
        expect(visual.transitions).toContain('education-crane-bottom-ink');
        expect(visual.revealProgress).toBeGreaterThan(0);
        expect(visual.revealProgress).toBeLessThan(1);
        expect(visual.revealClip).not.toBe('none');
        expect(visual.cranePlaybackActive).toBe('true');
      }
      const visual = await visualSnapshot(page);
      sawEducationCraneReveal ||= visual.activeInkSegments.includes('education-crane')
        && visual.revealProgress > 0
        && visual.revealProgress < 1
        && visual.revealClip !== 'none';
    }
    expect(sawEducationCraneReveal).toBe(true);
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('crane-animation');
    const craneHold = await visualSnapshot(page);
    expect(craneHold.craneProgress).toBe(1);
    expect(craneHold.craneVideos).toHaveLength(2);
    expect(craneHold.craneVideos.every((video) => video.loop === false && video.paused)).toBe(true);
    expect(craneHold.craneArchTransform).not.toBe('none');
    expect(craneHold.craneFrontTransform).not.toBe('none');

    await page.evaluate(() => {
      void window.__r4Group7?.playForward();
    });
    let sawContactHandoff = false;
    for (let index = 0; index < 18; index += 1) {
      await page.waitForTimeout(24);
      frames.push(await snapshot(page));
      if (index === 12) {
        const visual = await visualSnapshot(page);
        expect(visual.transitions).toContain('crane-contact-media');
        expect(visual.transitions).toContain('crane-contact-copy-cue');
      }
      const visual = await visualSnapshot(page);
      sawContactHandoff ||= visual.contactHandoffProgress > 0;
    }
    if (!sawContactHandoff) {
      await expect.poll(async () => {
        const visual = await visualSnapshot(page);
        return visual.contactHandoffProgress;
      }, { timeout: 5_000 }).toBeGreaterThan(0);
      sawContactHandoff = true;
    }
    expect(sawContactHandoff).toBe(true);
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('contact');
    const contactHold = await visualSnapshot(page);
    expect(contactHold.contactProgress).toBe(1);
    expect(contactHold.contactCopyCue).toBe('true');
    expect(contactHold.contactScheme).toContain('light');

    await page.evaluate(() => {
      void window.__r4Group7?.playReverse();
    });
    const reverseFrames: Group7Snapshot[] = [];
    for (let index = 0; index < 18; index += 1) {
      await page.waitForTimeout(24);
      reverseFrames.push(await snapshot(page));
    }
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('crane-animation');

    for (const frame of [...frames, ...reverseFrames]) {
      await assertFrame(frame);
    }

    const finalFrame = await snapshot(page);
    writeTrace('group7-forward-reverse-trace.json', finalFrame);
    expect(finalFrame.phase).toBe('hold');
    expect(finalFrame.visibleCount).toBe(1);
    expect(finalFrame.interactableCount).toBe(1);
  });

  test('covers reduced motion and 0 to 1 to 0 to 1 replay', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/harness/r4-g7-crane-contact');
    await expect(page.getByTestId('r2-stage')).toBeVisible();
    await expect(page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)).resolves.toBe(true);

    await page.evaluate(async () => {
      await window.__r4Group7?.idempotentCycle();
    });

    const frame = await snapshot(page);
    writeTrace('group7-reduced-motion-trace.json', frame);
    expect(frame.phase).toBe('hold');
    expect(frame.window.current).toBe('contact');
    expect(frame.visibleCount).toBe(1);
    expect(frame.interactableCount).toBe(1);
  });

  test('recovers from build timeout and supports seek', async ({ page }) => {
    await page.goto('/harness/r4-g7');
    await expect(page.getByTestId('r2-stage')).toBeVisible();

    await page.evaluate(async () => {
      await window.__r4Group7?.playForward({ buildTimeout: true });
    });

    const recovered = await snapshot(page);
    expect(recovered.phase).toBe('hold');
    expect(recovered.window.current).toBe('education');
    expect(recovered.recoveryCount).toBe(1);
    expect(recovered.eventLog).toContain('BUILD_TIMEOUT:education-crane');

    await page.evaluate(() => {
      window.__r4Group7?.seek('contact');
    });
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('contact');
  });
});
