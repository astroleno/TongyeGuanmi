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
  shaderBodyInkSegments: readonly string[];
  transitions: readonly string[];
  craneProgress: number;
  craneArchTransform: string;
  craneFrontTransform: string;
  craneVideos: readonly { loop: boolean; paused: boolean; currentTime: number; duration: number }[];
  cranePlaybackActive: string | undefined;
  cranePlaybackDirection: string | undefined;
  contactProgress: number;
  contactCopyCue: string | undefined;
  contactScheme: string;
  contactHandoffProgress: number;
  contactPaperAlpha: number;
  contactWashAlpha: number;
  contactElevated: boolean;
  educationReference: boolean;
  revealProgress: number;
  revealClip: string;
  revealMask: string;
  revealMode: string | undefined;
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
    const revealStyle = revealLayer ? window.getComputedStyle(revealLayer) : null;
    const inkCanvases = [...document.querySelectorAll<HTMLCanvasElement>('[data-r4-ink-segment]')];
    return {
      activeInkSegments: inkCanvases
        .filter((canvas) => canvas.dataset.r4InkActive === 'true' || canvas.parentElement?.dataset.r4InkActive === 'true')
        .map((canvas) => canvas.dataset.r4InkSegment ?? ''),
      shaderBodyInkSegments: inkCanvases
        .filter((canvas) => canvas.dataset.r4InkBoundary === 'shader-body' && canvas.dataset.r4InkTargetReady === 'true')
        .map((canvas) => canvas.dataset.r4InkSegment ?? ''),
      transitions: [...document.querySelectorAll<HTMLElement>('[data-r4-transition]')]
        .map((element) => element.dataset.r4Transition ?? ''),
      craneProgress: Number.parseFloat(craneRoot?.dataset.craneProgress ?? '0'),
      craneArchTransform: window.getComputedStyle(archLayer ?? document.body).transform,
      craneFrontTransform: window.getComputedStyle(frontLayer ?? document.body).transform,
      craneVideos: [...document.querySelectorAll<HTMLVideoElement>('[data-crane-figure-video], [data-crane-figure-front-video]')].map((video) => ({
        loop: video.loop,
        paused: video.paused,
        currentTime: video.currentTime,
        duration: video.duration
      })),
      cranePlaybackActive: craneRoot?.dataset.cranePlaybackActive,
      cranePlaybackDirection: craneRoot?.dataset.cranePlaybackDirection,
      contactProgress: Number.parseFloat(contactRoot?.dataset.contactProgress ?? '0'),
      contactCopyCue: contactLayer?.dataset.copyCueActive,
      contactScheme: window.getComputedStyle(contactRoot ?? document.body).colorScheme,
      contactHandoffProgress: Number.parseFloat(contactLayer?.dataset.r4HandoffReceiverProgress ?? '0'),
      contactPaperAlpha: Number.parseFloat(contactLayer?.style.getPropertyValue('--r4-handoff-paper-alpha') || '0'),
      contactWashAlpha: Number.parseFloat(contactLayer?.style.getPropertyValue('--r4-handoff-wash-alpha') || '0'),
      contactElevated: contactLayer?.dataset.r4TransitionElevated === 'true',
      educationReference: document.querySelector<HTMLElement>('[data-r4-reference-scene="true"]') !== null,
      revealProgress: Number.parseFloat(revealLayer?.dataset.r4RevealProgress ?? '0'),
      revealClip: revealStyle?.clipPath ?? 'none',
      revealMask: revealStyle?.getPropertyValue('-webkit-mask-image') || revealStyle?.getPropertyValue('mask-image') || 'none',
      revealMode: revealLayer?.dataset.r4RevealMode
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
      const visual = await visualSnapshot(page);
      sawEducationCraneReveal ||= visual.activeInkSegments.includes('education-crane')
        && visual.transitions.includes('education-crane-bottom-ink')
        && visual.revealProgress > 0
        && visual.revealProgress < 1
        && visual.revealMode === 'ink-body'
        && visual.revealClip === 'none'
        && visual.revealMask === 'none'
        && visual.shaderBodyInkSegments.includes('education-crane')
        && visual.craneProgress === 0
        && visual.cranePlaybackActive !== 'true';
    }
    expect(sawEducationCraneReveal).toBe(true);
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('crane-animation');
    const craneHold = await visualSnapshot(page);
    expect(craneHold.craneProgress).toBe(0);
    expect(craneHold.craneVideos).toHaveLength(2);
    expect(craneHold.craneVideos.every((video) => video.loop === false && video.paused)).toBe(true);
    expect(craneHold.craneArchTransform).not.toBe('none');
    expect(craneHold.craneFrontTransform).not.toBe('none');

    await page.evaluate(() => {
      void window.__r4Group7?.playForward();
    });
    let sawContactHandoff = false;
    let sawCraneTimelinePlayback = false;
    let sawCraneTransitionAttrs = false;
    for (let index = 0; index < 18; index += 1) {
      await page.waitForTimeout(24);
      frames.push(await snapshot(page));
      const visual = await visualSnapshot(page);
      sawCraneTransitionAttrs ||= visual.transitions.includes('crane-contact-media')
        && visual.transitions.includes('crane-contact-copy-cue');
      sawCraneTimelinePlayback ||= visual.cranePlaybackActive === 'true'
        && visual.craneVideos.some((video) => video.paused && video.currentTime > 0.02);
      sawContactHandoff ||= visual.contactHandoffProgress > 0 && visual.contactElevated;
    }
    if (!sawCraneTransitionAttrs) {
      await expect.poll(async () => {
        const visual = await visualSnapshot(page);
        return visual.transitions.includes('crane-contact-media')
          && visual.transitions.includes('crane-contact-copy-cue');
      }, { timeout: 5_000, intervals: [20] }).toBe(true);
      sawCraneTransitionAttrs = true;
    }
    if (!sawCraneTimelinePlayback) {
      await expect.poll(async () => {
        const visual = await visualSnapshot(page);
        return visual.cranePlaybackActive === 'true'
          && visual.craneProgress > 0
          && visual.craneProgress < 1
          && visual.craneVideos.some((video) => video.paused && video.currentTime > 0.02);
      }, { timeout: 5_000, intervals: [20] }).toBe(true);
      sawCraneTimelinePlayback = true;
    }
    expect(sawCraneTransitionAttrs).toBe(true);
    expect(sawCraneTimelinePlayback).toBe(true);
    if (!sawContactHandoff) {
      await expect.poll(async () => {
        const visual = await visualSnapshot(page);
        const fading = visual.contactHandoffProgress > 0 && visual.contactHandoffProgress < 1;
        const backgroundFading = visual.contactPaperAlpha > 0
          && visual.contactPaperAlpha < 1
          && visual.contactWashAlpha > 0
          && visual.contactWashAlpha < 1;
        return visual.contactElevated && fading && backgroundFading;
      }, { timeout: 5_000, intervals: [20] }).toBe(true);
      sawContactHandoff = true;
    }
    expect(sawContactHandoff).toBe(true);
    await expect.poll(async () => {
      const visual = await visualSnapshot(page);
      const backgroundIsLinear = Math.abs(visual.contactPaperAlpha - visual.contactHandoffProgress) < 0.002
        && Math.abs(visual.contactWashAlpha - visual.contactHandoffProgress) < 0.002;
      const craneStillPlaying = visual.cranePlaybackActive === 'true'
        && visual.craneProgress < 0.999
        && visual.craneVideos.length === 2
        && visual.craneVideos.every((video) => video.paused)
        && (visual.craneVideos[0]?.currentTime ?? 0) < (visual.craneVideos[0]?.duration ?? 0) - 0.03;
      return visual.contactCopyCue === 'true'
        && visual.contactHandoffProgress >= 0.23
        && visual.contactHandoffProgress < 0.45
        && backgroundIsLinear
        && craneStillPlaying;
    }, { timeout: 5_000, intervals: [20] }).toBe(true);
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('contact');
    const contactHold = await visualSnapshot(page);
    expect(contactHold.contactProgress).toBe(1);
    expect(contactHold.contactCopyCue).toBe('true');
    expect(contactHold.contactScheme).toContain('light');
    expect(contactHold.craneVideos.every((video) => video.paused && video.currentTime >= video.duration - 0.03)).toBe(true);

    await page.evaluate(() => {
      void window.__r4Group7?.playReverse();
    });
    const reverseFrames: Group7Snapshot[] = [];
    let sawCraneReverse = false;
    const reverseStart = await visualSnapshot(page);
    const reverseStartTimes = reverseStart.craneVideos.map((video) => video.currentTime);
    for (let index = 0; index < 96; index += 1) {
      await page.waitForTimeout(24);
      reverseFrames.push(await snapshot(page));
      const visual = await visualSnapshot(page);
      const currentTimes = visual.craneVideos.map((video) => video.currentTime);
      sawCraneReverse ||= visual.cranePlaybackDirection === '-1'
        && currentTimes.length === 2
        && currentTimes.every((time, videoIndex) => time > 0.02
          && time < (visual.craneVideos[videoIndex]?.duration ?? 0) - 0.04
          && time < (reverseStartTimes[videoIndex] ?? Number.POSITIVE_INFINITY) - 0.02);
    }
    expect(sawCraneReverse).toBe(true);
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
