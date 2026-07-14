import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Group6Snapshot = {
  phase: 'hold' | 'preparing' | 'playing' | 'staged-paused' | 'recovering';
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
    __r4Group6?: {
      playForward(options?: { buildTimeout?: boolean }): Promise<void>;
      playReverse(options?: { buildTimeout?: boolean }): Promise<void>;
      seek(scene: 'lab' | 'ph-animation' | 'education'): void;
      idempotentCycle(): Promise<void>;
      snapshot(): Group6Snapshot;
    };
  }
}

async function snapshot(page: Page): Promise<Group6Snapshot> {
  return page.evaluate(() => {
    const api = window.__r4Group6;
    if (!api) {
      throw new Error('R4 group6 harness API is not installed');
    }
    return api.snapshot();
  });
}

type Group6VisualSnapshot = {
  activeInkSegments: readonly string[];
  fieldInkSegments: readonly string[];
  transitions: readonly string[];
  phProgress: number;
  phBgTransform: string;
  phFrontTransform: string;
  phFigureTransform: string;
  phVideos: readonly { loop: boolean; paused: boolean; currentTime: number; playbackRate: number }[];
  phPlaybackActive: string | undefined;
  phPlaybackDirection: string | undefined;
  educationProgress: number;
  educationRows: number;
  educationRootCount: number;
  educationLayerCount: number;
  educationScrollTop: number;
  educationScheme: string;
  educationTop: number;
  educationWideTop: number;
  educationVerticalTop: number;
  viewportHeight: number;
  labReference: boolean;
  revealProgress: number;
  revealClip: string;
  revealMask: string;
  revealMode: string | undefined;
};

async function visualSnapshot(page: Page): Promise<Group6VisualSnapshot> {
  return page.evaluate(() => {
    const phRoot = document.querySelector<HTMLElement>('[data-r4-scene="ph-animation"]');
    const bgLayer = document.querySelector<HTMLElement>('.r4-ph-animation .ph-bg');
    const frontLayer = document.querySelector<HTMLElement>('.r4-ph-animation .ph-layer--front');
    const figureLayer = document.querySelector<HTMLElement>('.r4-ph-animation .ph-layer--figure');
    const educationRoot = document.querySelector<HTMLElement>('[data-r4-scene="education"]');
    const educationWide = document.querySelector<HTMLElement>('.r4-education__wide');
    const educationVertical = document.querySelector<HTMLElement>('.r4-education__vertical');
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
      phProgress: Number.parseFloat(phRoot?.dataset.phProgress ?? '0'),
      phBgTransform: window.getComputedStyle(bgLayer ?? document.body).transform,
      phFrontTransform: window.getComputedStyle(frontLayer ?? document.body).transform,
      phFigureTransform: window.getComputedStyle(figureLayer ?? document.body).transform,
      phVideos: [...document.querySelectorAll<HTMLVideoElement>('[data-ph-alpha-video]')].map((video) => ({
        loop: video.loop,
        paused: video.paused,
        currentTime: video.currentTime,
        playbackRate: video.playbackRate
      })),
      phPlaybackActive: phRoot?.dataset.phPlaybackActive,
      phPlaybackDirection: phRoot?.dataset.phPlaybackDirection,
      educationProgress: Number.parseFloat(educationRoot?.dataset.educationProgress ?? '0'),
      educationRows: document.querySelectorAll('.r4-education__row').length,
      educationRootCount: document.querySelectorAll('[data-r4-scene="education"]').length,
      educationLayerCount: document.querySelectorAll('[data-stage-layer="education"]').length,
      educationScrollTop: educationRoot?.scrollTop ?? Number.NaN,
      educationScheme: window.getComputedStyle(educationRoot ?? document.body).colorScheme,
      educationTop: educationRoot?.getBoundingClientRect().top ?? Number.NaN,
      educationWideTop: educationWide?.getBoundingClientRect().top ?? Number.NaN,
      educationVerticalTop: educationVertical?.getBoundingClientRect().top ?? Number.NaN,
      viewportHeight: window.innerHeight,
      labReference: document.querySelector<HTMLElement>('[data-r4-reference-scene="true"]') !== null,
      revealProgress: Number.parseFloat(revealLayer?.dataset.r4RevealProgress ?? '0'),
      revealClip: revealStyle?.clipPath ?? 'none',
      revealMask: revealStyle?.getPropertyValue('-webkit-mask-image') || revealStyle?.getPropertyValue('mask-image') || 'none',
      revealMode: revealLayer?.dataset.r4RevealMode
    };
  });
}

async function assertFrame(frame: Group6Snapshot): Promise<void> {
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

function writeTrace(name: string, frame: Group6Snapshot): void {
  const artifactDir = resolve(process.cwd(), '..', 'artifacts', 'react-refactor', 'r4-g6');
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(resolve(artifactDir, name), `${JSON.stringify(frame, null, 2)}\n`);
}

test.describe('R4 group6 lab ph education harness', () => {
  test.use({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1
  });

  test('runs forward and reverse with nonblank sampled frames', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/harness/r4-g6');
    await expect(page.getByTestId('r2-stage')).toBeVisible();
    expect((await visualSnapshot(page)).labReference).toBe(false);

    await page.evaluate(() => {
      void window.__r4Group6?.playForward();
    });
    const frames: Group6Snapshot[] = [];
    let sawLabPhReveal = false;
    for (let index = 0; index < 18; index += 1) {
      await page.waitForTimeout(24);
      frames.push(await snapshot(page));
      const visual = await visualSnapshot(page);
      sawLabPhReveal ||= visual.activeInkSegments.includes('lab-ph')
        && visual.transitions.includes('lab-ph-top-ink')
        && visual.revealProgress > 0
        && visual.revealProgress < 1
        && visual.revealMode === 'ink-occluded-live-gate'
        && visual.revealClip.startsWith('polygon(')
        && visual.revealMask === 'none'
        && visual.fieldInkSegments.includes('lab-ph')
        && visual.phProgress === 0;
    }
    expect(sawLabPhReveal).toBe(true);
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('ph-animation');
    const phHold = await visualSnapshot(page);
    expect(phHold.phProgress).toBe(0);
    expect(phHold.phVideos).toHaveLength(1);
    expect(phHold.phVideos.every((video) => video.loop === false && video.paused)).toBe(true);
    expect(phHold.phBgTransform).not.toBe('none');
    expect(phHold.phFrontTransform).not.toBe('none');
    expect(phHold.phFigureTransform).not.toBe('none');

    await page.evaluate(() => {
      void window.__r4Group6?.playForward();
    });
    let sawPhTimelinePlayback = false;
    for (let index = 0; index < 18; index += 1) {
      await page.waitForTimeout(24);
      frames.push(await snapshot(page));
      const visual = await visualSnapshot(page);
      sawPhTimelinePlayback ||= visual.activeInkSegments.includes('ph-education') === false
        && visual.phProgress > 0
        && visual.phProgress < 1
        && visual.phPlaybackActive === 'true'
        && visual.phVideos.some((video) => (
          !video.paused
          && video.currentTime > 0.02
          && video.playbackRate > 0.95
          && video.playbackRate < 1.05
        ));
    }
    if (!sawPhTimelinePlayback) {
      await expect.poll(async () => {
        const visual = await visualSnapshot(page);
        return visual.phPlaybackActive === 'true'
          && visual.phProgress > 0
          && visual.phProgress < 1
          && visual.phVideos.some((video) => (
            !video.paused
            && video.currentTime > 0.02
            && video.playbackRate > 0.95
            && video.playbackRate < 1.05
          ));
      }, { timeout: 5_000, intervals: [20] }).toBe(true);
      sawPhTimelinePlayback = true;
    }
    expect(sawPhTimelinePlayback).toBe(true);
    await expect.poll(async () => (await snapshot(page)).phase).toBe('staged-paused');
    const phTerminalPause = await visualSnapshot(page);
    expect(phTerminalPause.phProgress).toBe(1);
    expect(phTerminalPause.activeInkSegments).not.toContain('ph-education');

    await page.evaluate(() => {
      const evidenceWindow = window as Window & {
        __phEducationDissolveEvidence?: {
          sourceOpacity: number;
          receiverOpacity: number;
          sourceVisible: string;
          receiverVisible: string;
          sourceInert: boolean;
          receiverInert: boolean;
          sourcePointerEvents: string;
          receiverPointerEvents: string;
          sourceClip: string;
          receiverClip: string;
          sourceMask: string;
          receiverMask: string;
          sourceTransform: string;
          receiverTransform: string;
          sourceFilter: string;
          receiverFilter: string;
          inkCount: number;
          phProgress: string;
          playbackActive: string;
          educationRootCount: number;
          educationLayerCount: number;
          educationScrollTop: number;
        };
      };
      delete evidenceWindow.__phEducationDissolveEvidence;
      const sampleDissolveFrame = () => {
        const source = document.querySelector<HTMLElement>(
          '[data-stage-layer="ph-animation"][data-r4-handoff="dissolve"]'
        );
        const receiver = document.querySelector<HTMLElement>(
          '[data-stage-layer="education"][data-r4-handoff="dissolve"]'
        );
        const ph = document.querySelector<HTMLElement>('[data-r4-scene="ph-animation"]');
        const progress = Number.parseFloat(receiver?.dataset.r4HandoffProgress ?? '0');
        if (source && receiver && progress > 0 && progress < 1) {
          const sourceStyle = window.getComputedStyle(source);
          const receiverStyle = window.getComputedStyle(receiver);
          evidenceWindow.__phEducationDissolveEvidence = {
            sourceOpacity: Number.parseFloat(sourceStyle.opacity),
            receiverOpacity: Number.parseFloat(receiverStyle.opacity),
            sourceVisible: sourceStyle.visibility,
            receiverVisible: receiverStyle.visibility,
            sourceInert: source.inert,
            receiverInert: receiver.inert,
            sourcePointerEvents: sourceStyle.pointerEvents,
            receiverPointerEvents: receiverStyle.pointerEvents,
            sourceClip: source.style.clipPath,
            receiverClip: receiver.style.clipPath,
            sourceMask: source.style.maskImage,
            receiverMask: receiver.style.maskImage,
            sourceTransform: source.style.transform,
            receiverTransform: receiver.style.transform,
            sourceFilter: source.style.filter,
            receiverFilter: receiver.style.filter,
            inkCount: document.querySelectorAll('[data-r4-ink-segment="ph-education"]').length,
            phProgress: ph?.dataset.phProgress ?? '',
            playbackActive: ph?.dataset.phPlaybackActive ?? '',
            educationRootCount: document.querySelectorAll('[data-r4-scene="education"]').length,
            educationLayerCount: document.querySelectorAll('[data-stage-layer="education"]').length,
            educationScrollTop: document.querySelector<HTMLElement>('[data-r4-scene="education"]')?.scrollTop ?? Number.NaN
          };
          return;
        }
        window.requestAnimationFrame(sampleDissolveFrame);
      };
      window.requestAnimationFrame(sampleDissolveFrame);
      void window.__r4Group6?.playForward();
    });
    for (let index = 0; index < 18; index += 1) {
      await page.waitForTimeout(24);
      frames.push(await snapshot(page));
    }
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('education');
    const phEducationDissolveEvidence = await page.evaluate(() => (
      window as Window & {
        __phEducationDissolveEvidence?: {
          sourceOpacity: number;
          receiverOpacity: number;
          [key: string]: string | number | boolean;
        };
      }
    ).__phEducationDissolveEvidence);
    expect(phEducationDissolveEvidence).toMatchObject({
      sourceVisible: 'visible',
      receiverVisible: 'visible',
      sourceInert: true,
      receiverInert: true,
      sourcePointerEvents: 'none',
      receiverPointerEvents: 'none',
      sourceClip: '',
      receiverClip: '',
      sourceMask: '',
      receiverMask: '',
      sourceTransform: '',
      receiverTransform: '',
      sourceFilter: '',
      receiverFilter: '',
      inkCount: 0,
      phProgress: '1.0000',
      playbackActive: 'false',
      educationRootCount: 1,
      educationLayerCount: 1,
      educationScrollTop: 0
    });
    expect(phEducationDissolveEvidence?.sourceOpacity).toBeGreaterThan(0);
    expect(phEducationDissolveEvidence?.sourceOpacity).toBeLessThan(1);
    expect(phEducationDissolveEvidence?.receiverOpacity).toBeGreaterThan(0);
    expect(phEducationDissolveEvidence?.receiverOpacity).toBeLessThan(1);
    expect(
      (phEducationDissolveEvidence?.sourceOpacity ?? 0)
        + (phEducationDissolveEvidence?.receiverOpacity ?? 0)
    ).toBeCloseTo(1, 3);
    await expect(page.evaluate(() => ({
      ink: document.querySelectorAll('[data-r4-ink-segment="ph-education"]').length,
      handoff: document.querySelectorAll('[data-r4-handoff-segment="ph-education"]').length
    }))).resolves.toEqual({ ink: 0, handoff: 0 });
    const educationHold = await visualSnapshot(page);
    expect(educationHold.educationProgress).toBe(1);
    expect(educationHold.educationRows).toBe(4);
    expect(educationHold.educationRootCount).toBe(1);
    expect(educationHold.educationLayerCount).toBe(1);
    expect(educationHold.educationScrollTop).toBe(0);
    expect(educationHold.educationScheme).toContain('light');
    expect(Math.abs(educationHold.educationTop)).toBeLessThan(1);
    expect(educationHold.educationWideTop).toBeGreaterThanOrEqual(0);
    expect(educationHold.educationWideTop).toBeLessThan(100);
    expect(educationHold.educationVerticalTop).toBeGreaterThan(educationHold.viewportHeight - 16);

    await page.evaluate(() => {
      void window.__r4Group6?.playReverse();
    });
    const reverseFrames: Group6Snapshot[] = [];
    for (let index = 0; index < 18; index += 1) {
      await page.waitForTimeout(24);
      reverseFrames.push(await snapshot(page));
    }
    await expect.poll(async () => (await snapshot(page)).phase).toBe('staged-paused');
    const phReverseStart = await visualSnapshot(page);
    const terminalTime = phReverseStart.phVideos[0]?.currentTime ?? 0;
    await page.evaluate(() => {
      void window.__r4Group6?.playReverse();
    });
    let sawPhReversePlayback = false;
    for (let index = 0; index < 18; index += 1) {
      await page.waitForTimeout(24);
      reverseFrames.push(await snapshot(page));
      const visual = await visualSnapshot(page);
      sawPhReversePlayback ||= visual.phPlaybackDirection === '-1'
        && visual.phProgress > 0
        && visual.phProgress < 1
        && (visual.phVideos[0]?.currentTime ?? terminalTime) < terminalTime - 0.02;
    }
    expect(sawPhReversePlayback).toBe(true);
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('ph-animation');

    for (const frame of [...frames, ...reverseFrames]) {
      await assertFrame(frame);
    }

    const finalFrame = await snapshot(page);
    writeTrace('group6-forward-reverse-trace.json', finalFrame);
    expect(finalFrame.phase).toBe('hold');
    expect(finalFrame.visibleCount).toBe(1);
    expect(finalFrame.interactableCount).toBe(1);
  });

  test('covers reduced motion and 0 to 1 to 0 to 1 replay', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/harness/r4-g6-ph-education');
    await expect(page.getByTestId('r2-stage')).toBeVisible();
    await expect(page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)).resolves.toBe(true);

    await page.evaluate(async () => {
      await window.__r4Group6?.playForward();
      await window.__r4Group6?.playForward();
      await window.__r4Group6?.playReverse();
      await window.__r4Group6?.playReverse();
      await window.__r4Group6?.playForward();
      await window.__r4Group6?.playForward();
    });

    const frame = await snapshot(page);
    writeTrace('group6-reduced-motion-trace.json', frame);
    expect(frame.phase).toBe('hold');
    expect(frame.window.current).toBe('education');
    expect(frame.visibleCount).toBe(1);
    expect(frame.interactableCount).toBe(1);
    await expect(page.evaluate(() => ({
      ink: document.querySelectorAll('[data-r4-ink-segment="ph-education"]').length,
      handoff: document.querySelectorAll('[data-r4-handoff-segment="ph-education"]').length
    }))).resolves.toEqual({ ink: 0, handoff: 0 });
  });

  test('recovers from build timeout and supports seek', async ({ page }) => {
    await page.goto('/harness/r4-g6');
    await expect(page.getByTestId('r2-stage')).toBeVisible();

    await page.evaluate(async () => {
      await window.__r4Group6?.playForward({ buildTimeout: true });
    });

    const recovered = await snapshot(page);
    expect(recovered.phase).toBe('hold');
    expect(recovered.window.current).toBe('lab');
    expect(recovered.recoveryCount).toBe(1);
    expect(recovered.eventLog).toContain('BUILD_TIMEOUT:lab-ph');

    await page.evaluate(() => {
      window.__r4Group6?.seek('education');
    });
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('education');
  });
});
