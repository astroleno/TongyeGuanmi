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
  fieldInkSegments: readonly string[];
  transitions: readonly string[];
  craneProgress: number;
  craneArchTransform: string;
  craneFrontTransform: string;
  craneVideos: readonly {
    role: 'figure' | 'flock';
    mediaKey: string;
    loop: boolean;
    paused: boolean;
    ended: boolean;
    currentTime: number;
    duration: number;
    playbackRate: number;
    frameReady: boolean;
    desiredFrame: number;
    presentedFrame: number;
    frameLag: number;
    sequence: number;
    evidence: string | undefined;
    clockPending: boolean;
  }[];
  craneDesiredFrame: number;
  cranePresentedFrame: number;
  craneFrameEvidence: string | undefined;
  cranePlaybackActive: string | undefined;
  cranePlaybackDirection: string | undefined;
  contactProgress: number;
  contactCopyCue: string | undefined;
  contactScheme: string;
  contactEntranceProgress: number;
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
      fieldInkSegments: inkCanvases
        .filter((canvas) => canvas.dataset.r4InkRenderer === 'field' && canvas.dataset.r4InkEffectOnly === 'true')
        .map((canvas) => canvas.dataset.r4InkSegment ?? ''),
      transitions: [...document.querySelectorAll<HTMLElement>('[data-r4-transition]')]
        .map((element) => element.dataset.r4Transition ?? ''),
      craneProgress: Number.parseFloat(craneRoot?.dataset.craneProgress ?? '0'),
      craneArchTransform: window.getComputedStyle(archLayer ?? document.body).transform,
      craneFrontTransform: window.getComputedStyle(frontLayer ?? document.body).transform,
      craneVideos: [...document.querySelectorAll<HTMLVideoElement>('[data-crane-figure-video], [data-crane-figure-front-video]')].map((video) => ({
        role: video.hasAttribute('data-crane-figure-front-video') ? 'flock' as const : 'figure' as const,
        mediaKey: video.dataset.mediaKey ?? '',
        loop: video.loop,
        paused: video.paused,
        ended: video.ended,
        currentTime: video.currentTime,
        duration: video.duration,
        playbackRate: video.playbackRate,
        frameReady: video.dataset.timelineVideoFrameReady === 'true',
        desiredFrame: Number.parseInt(video.dataset.timelineVideoDesiredFrame ?? '-1', 10),
        presentedFrame: Number.parseInt(video.dataset.timelineVideoPresentedFrame ?? '-1', 10),
        frameLag: Number.parseInt(video.dataset.timelineVideoFrameLag ?? '999', 10),
        sequence: Number.parseInt(video.dataset.timelineVideoSequence ?? '-1', 10),
        evidence: video.dataset.timelineVideoEvidence,
        clockPending: video.dataset.timelineVideoClockPending === 'true'
      })),
      craneDesiredFrame: Number.parseInt(craneRoot?.dataset.craneDesiredFrame ?? '-1', 10),
      cranePresentedFrame: Number.parseInt(craneRoot?.dataset.cranePresentedFrame ?? '-1', 10),
      craneFrameEvidence: craneRoot?.dataset.craneFrameEvidence,
      cranePlaybackActive: craneRoot?.dataset.cranePlaybackActive,
      cranePlaybackDirection: craneRoot?.dataset.cranePlaybackDirection,
      contactProgress: Number.parseFloat(contactRoot?.dataset.contactProgress ?? '0'),
      contactCopyCue: contactLayer?.dataset.copyCueActive,
      contactScheme: window.getComputedStyle(contactRoot ?? document.body).colorScheme,
      contactEntranceProgress: Number.parseFloat(contactRoot?.style.getPropertyValue('--r4-contact-paper-alpha') || '0'),
      contactPaperAlpha: Number.parseFloat(contactRoot?.style.getPropertyValue('--r4-contact-paper-alpha') || '0'),
      contactWashAlpha: Number.parseFloat(contactRoot?.style.getPropertyValue('--r4-contact-wash-alpha') || '0'),
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
        && visual.revealMode === 'ink-occluded-live-gate'
        && visual.revealClip.startsWith('polygon(')
        && visual.revealMask === 'none'
        && visual.fieldInkSegments.includes('education-crane')
        && visual.craneProgress === 0
        && visual.cranePlaybackActive !== 'true';
    }
    expect(sawEducationCraneReveal).toBe(true);
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('crane-animation');
    const craneHold = await visualSnapshot(page);
    expect(craneHold.craneProgress).toBe(0);
    expect(craneHold.craneVideos).toHaveLength(2);
    expect(new Set(craneHold.craneVideos.map((video) => video.mediaKey))).toEqual(new Set([
      'crane-figure-motion',
      'crane-flock-motion'
    ]));
    expect(craneHold.craneVideos.every((video) => video.loop === false && video.paused)).toBe(true);
    expect(craneHold.craneVideos.every((video) => video.currentTime < 0.05)).toBe(true);
    expect(craneHold.craneVideos.every((video) => (
      video.frameReady
      && video.desiredFrame === 0
      && video.presentedFrame === 0
      && video.frameLag === 0
      && video.evidence === 'video-frame-callback'
      && !video.clockPending
    ))).toBe(true);
    expect(craneHold.craneArchTransform).not.toBe('none');
    expect(craneHold.craneFrontTransform).not.toBe('none');

    await page.evaluate(() => {
      void window.__r4Group7?.playForward();
    });
    let sawContactHandoff = false;
    let sawCraneStrictReceipt = false;
    let sawCraneTransitionAttrs = false;
    for (let index = 0; index < 18; index += 1) {
      await page.waitForTimeout(24);
      frames.push(await snapshot(page));
      const visual = await visualSnapshot(page);
      sawCraneTransitionAttrs ||= visual.transitions.includes('crane-contact-media')
        && visual.transitions.includes('crane-contact-copy-cue');
      sawCraneStrictReceipt ||= visual.cranePlaybackActive === 'true'
        && visual.craneProgress > 0
        && visual.craneProgress < 1
        && visual.craneDesiredFrame === visual.cranePresentedFrame
        && visual.cranePresentedFrame >= 0
        && visual.craneFrameEvidence === 'video-frame-callback'
        && visual.craneVideos.length === 2
        && visual.craneVideos.every((video) => (
          video.frameReady
          && video.desiredFrame >= 0
          && video.presentedFrame >= 0
          && video.frameLag === 0
          && video.evidence === 'video-frame-callback'
        ));
      sawContactHandoff ||= visual.contactEntranceProgress > 0 && visual.contactElevated;
    }
    if (!sawCraneTransitionAttrs) {
      await expect.poll(async () => {
        const visual = await visualSnapshot(page);
        return visual.transitions.includes('crane-contact-media')
          && visual.transitions.includes('crane-contact-copy-cue');
      }, { timeout: 5_000, intervals: [20] }).toBe(true);
      sawCraneTransitionAttrs = true;
    }
    if (!sawCraneStrictReceipt) {
      await expect.poll(async () => {
        const visual = await visualSnapshot(page);
        return visual.cranePlaybackActive === 'true'
          && visual.craneProgress > 0
          && visual.craneProgress < 1
          && visual.craneDesiredFrame === visual.cranePresentedFrame
          && visual.cranePresentedFrame >= 0
          && visual.craneFrameEvidence === 'video-frame-callback'
          && visual.craneVideos.length === 2
          && visual.craneVideos.every((video) => (
            video.frameReady
            && video.desiredFrame >= 0
            && video.desiredFrame === video.presentedFrame
            && video.frameLag === 0
            && video.evidence === 'video-frame-callback'
            && !video.clockPending
          ));
      }, { timeout: 5_000, intervals: [20] }).toBe(true);
      sawCraneStrictReceipt = true;
    }
    expect(sawCraneTransitionAttrs).toBe(true);
    expect(sawCraneStrictReceipt).toBe(true);
    if (!sawContactHandoff) {
      await expect.poll(async () => {
        const visual = await visualSnapshot(page);
        const fading = visual.contactEntranceProgress > 0 && visual.contactEntranceProgress < 1;
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
      const backgroundIsLinear = Math.abs(visual.contactPaperAlpha - visual.contactEntranceProgress) < 0.002
        && Math.abs(visual.contactWashAlpha - visual.contactEntranceProgress) < 0.002;
      const craneStillPresenting = visual.cranePlaybackActive === 'true'
        && visual.craneProgress < 0.999
        && visual.craneDesiredFrame === visual.cranePresentedFrame
        && visual.cranePresentedFrame >= 0
        && visual.craneFrameEvidence === 'video-frame-callback'
        && visual.craneVideos.length === 2
        && visual.craneVideos.every((video) => (
          video.frameReady
          && video.presentedFrame >= 0
          && video.frameLag === 0
          && video.evidence === 'video-frame-callback'
        ));
      return visual.contactCopyCue === 'true'
        && visual.contactEntranceProgress > 0
        && visual.contactEntranceProgress < 1
        && backgroundIsLinear
        && craneStillPresenting;
    }, { timeout: 5_000, intervals: [20] }).toBe(true);
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('contact');
    const contactHold = await visualSnapshot(page);
    expect(contactHold.contactProgress).toBe(1);
    expect(contactHold.contactCopyCue).toBe('true');
    expect(contactHold.contactScheme).toContain('light');
    expect(contactHold.contactElevated).toBe(false);
    expect(contactHold.transitions).not.toContain('crane-contact-copy-cue');
    expect(contactHold.craneVideos.every((video) => (
      video.paused && video.currentTime >= video.duration - 0.05
    ))).toBe(true);

    await page.evaluate(() => {
      void window.__r4Group7?.playReverse();
    });
    const reverseFrames: Group7Snapshot[] = [];
    let sawCraneReverse = false;
    const reverseStart = await visualSnapshot(page);
    const reverseStartFrame = reverseStart.cranePresentedFrame;
    for (let index = 0; index < 96; index += 1) {
      await page.waitForTimeout(24);
      reverseFrames.push(await snapshot(page));
      const visual = await visualSnapshot(page);
      sawCraneReverse ||= visual.cranePlaybackDirection === '-1'
        && visual.craneDesiredFrame === visual.cranePresentedFrame
        && visual.cranePresentedFrame >= 0
        && visual.cranePresentedFrame < reverseStartFrame
        && visual.craneFrameEvidence === 'video-frame-callback'
        && visual.craneVideos.length === 2
        && visual.craneVideos.every((video) => (
          video.frameReady
          && video.presentedFrame >= 0
          && video.frameLag === 0
          && video.evidence === 'video-frame-callback'
        ));
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
    expect(recovered.window.current).toBe('crane-animation');
    expect(recovered.recoveryCount).toBe(1);
    expect(recovered.eventLog).toContain('BUILD_TIMEOUT:education-crane');

    await page.evaluate(() => {
      window.__r4Group7?.seek('contact');
    });
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('contact');
  });
});
