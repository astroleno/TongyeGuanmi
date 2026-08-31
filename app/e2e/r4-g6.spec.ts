import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  captureSettledEndpoint,
  endpointProbe,
  installEndpointProbe
} from './endpoint-parity';

type Group6Snapshot = {
  phase: 'hold' | 'preparing' | 'playing' | 'recovering';
  window: { current: string; retiring: readonly string[] };
  visibleCount: number;
  interactableCount: number;
  mountedCount: number;
  eventLog: readonly string[];
  recoveryCount: number;
};

type PresentedFrameRecord = {
  desiredFrame: number;
  presentedFrame: number;
  evidence: string;
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
    __r4PresentedFrameRecorder?: {
      reset(): void;
      history(): readonly PresentedFrameRecord[];
    };
  }
}

async function snapshot(page: Page): Promise<Group6Snapshot> {
  return page.evaluate(() => {
    if (!window.__r4Group6) throw new Error('R4 group6 harness API is not installed');
    return window.__r4Group6.snapshot();
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
  phProgress: number;
  phDirection: string;
  phLayerVisible: boolean;
  phBgTransform: string;
  phFrontTransform: string;
  phFigureTransform: string;
  videos: readonly {
    loop: boolean;
    paused: boolean;
    currentTime: number;
    playbackRate: number;
    frameReady: boolean;
    desiredFrame: number;
    presentedFrame: number;
    frameEvidence: string;
  }[];
  educationProgress: number;
  educationRows: number;
  educationRoots: number;
  educationLayers: number;
  educationScrollTop: number;
  educationScheme: string;
  educationTop: number;
  educationWideTop: number;
  educationVerticalTop: number;
  viewportHeight: number;
};

async function visualSnapshot(page: Page): Promise<VisualSnapshot> {
  return page.evaluate(() => {
    const ph = document.querySelector<HTMLElement>('[data-r4-scene="ph-animation"]');
    const education = document.querySelector<HTMLElement>('[data-r4-scene="education"]');
    const educationWide = education?.querySelector<HTMLElement>('.r4-education__wide');
    const educationVertical = education?.querySelector<HTMLElement>('.r4-education__vertical');
    const bg = ph?.querySelector<HTMLElement>('.ph-bg');
    const front = ph?.querySelector<HTMLElement>('.ph-layer--front');
    const figure = ph?.querySelector<HTMLElement>('.ph-layer--figure');
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
      phProgress: Number.parseFloat(ph?.dataset.phProgress ?? '0'),
      phDirection: ph?.dataset.phPlaybackDirection ?? '',
      phLayerVisible: ph?.closest<HTMLElement>('[data-stage-layer]')?.dataset.visible === 'true',
      phBgTransform: getComputedStyle(bg ?? document.body).transform,
      phFrontTransform: getComputedStyle(front ?? document.body).transform,
      phFigureTransform: getComputedStyle(figure ?? document.body).transform,
      videos: [...document.querySelectorAll<HTMLVideoElement>('[data-ph-alpha-video]')].map((video) => {
        const section = video.closest<HTMLElement>('[data-r4-scene="ph-animation"]');
        return {
          loop: video.loop,
          paused: video.paused,
          currentTime: video.currentTime,
          playbackRate: video.playbackRate,
          frameReady: video.dataset.timelineVideoFrameReady === 'true',
          desiredFrame: Number.parseInt(section?.dataset.phDesiredFrame ?? '-1', 10),
          presentedFrame: Number.parseInt(section?.dataset.phPresentedFrame ?? '-1', 10),
          frameEvidence: video.dataset.timelineVideoFrameEvidence ?? ''
        };
      }),
      educationProgress: Number.parseFloat(education?.dataset.educationProgress ?? '0'),
      educationRows: education?.querySelectorAll('.r4-education__row').length ?? 0,
      educationRoots: document.querySelectorAll('[data-r4-scene="education"]').length,
      educationLayers: document.querySelectorAll('[data-stage-layer="education"]').length,
      educationScrollTop: education?.scrollTop ?? Number.NaN,
      educationScheme: getComputedStyle(education ?? document.body).colorScheme,
      educationTop: education?.getBoundingClientRect().top ?? Number.NaN,
      educationWideTop: educationWide?.getBoundingClientRect().top ?? Number.NaN,
      educationVerticalTop: educationVertical?.getBoundingClientRect().top ?? Number.NaN,
      viewportHeight: innerHeight
    };
  });
}

async function installPresentedFrameRecorder(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (window.__r4PresentedFrameRecorder) {
      return;
    }
    let desiredFrame = -1;
    let presentedFrame = -1;
    let evidence = '';
    const accepted: PresentedFrameRecord[] = [];
    const recordIfPresented = () => {
      if (desiredFrame < 0 || desiredFrame !== presentedFrame || evidence !== 'video-frame-callback') {
        return;
      }
      const previous = accepted.at(-1);
      if (
        previous?.desiredFrame === desiredFrame
        && previous.presentedFrame === presentedFrame
        && previous.evidence === evidence
      ) {
        return;
      }
      accepted.push({ desiredFrame, presentedFrame, evidence });
    };
    const observer = new MutationObserver((records) => {
      let removedDesired: number | undefined;
      let removedPresented: number | undefined;
      let removedEvidence = false;
      for (const record of records) {
        if (!(record.target instanceof HTMLElement)) {
          continue;
        }
        if (record.target.matches('[data-r4-scene="ph-animation"]')) {
          if (record.attributeName === 'data-ph-desired-frame' && !record.target.hasAttribute(record.attributeName)) {
            removedDesired = Number.parseInt(record.oldValue ?? '', 10);
          }
          if (record.attributeName === 'data-ph-presented-frame' && !record.target.hasAttribute(record.attributeName)) {
            removedPresented = Number.parseInt(record.oldValue ?? '', 10);
          }
        }
        if (
          record.target instanceof HTMLVideoElement
          && record.target.matches('[data-ph-alpha-video]')
          && record.attributeName === 'data-timeline-video-frame-evidence'
          && !record.target.hasAttribute(record.attributeName)
          && record.oldValue === 'video-frame-callback'
        ) {
          removedEvidence = true;
        }
      }
      if (removedDesired !== undefined && removedDesired === removedPresented && removedEvidence) {
        desiredFrame = removedDesired;
        presentedFrame = removedPresented;
        evidence = 'video-frame-callback';
        recordIfPresented();
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeOldValue: true,
      subtree: true,
      attributeFilter: [
        'data-ph-desired-frame',
        'data-ph-presented-frame',
        'data-timeline-video-frame-evidence'
      ]
    });
    window.__r4PresentedFrameRecorder = {
      reset() {
        desiredFrame = -1;
        presentedFrame = -1;
        evidence = '';
        accepted.length = 0;
      },
      history() {
        return accepted.slice();
      }
    };
  });
}

async function resetPresentedFrameRecorder(page: Page): Promise<void> {
  await page.evaluate(() => window.__r4PresentedFrameRecorder?.reset());
}

async function presentedFrameHistory(page: Page): Promise<readonly PresentedFrameRecord[]> {
  return page.evaluate(() => window.__r4PresentedFrameRecorder?.history() ?? []);
}

function writeTrace(name: string, frame: Group6Snapshot): void {
  const directory = resolve(process.cwd(), '..', 'artifacts', 'react-refactor', 'r4-g6');
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, name), `${JSON.stringify(frame, null, 2)}\n`);
}

test.describe('R4 group6 Lab, PH, and Education lifecycle', () => {
  test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

  test('keeps PH as a semantic hold, dwells on its terminal frame, then hands off to Education', async ({ page }) => {
    test.setTimeout(45_000);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/harness/r4-g6');
    await expect(page.getByTestId('r2-stage')).toBeVisible();
    await installPresentedFrameRecorder(page);

    await page.evaluate(() => { void window.__r4Group6?.playForward(); });
    await expect.poll(async () => {
      const visual = await visualSnapshot(page);
      return visual.activeInkSegments.includes('lab-ph')
        && visual.fieldInkSegments.includes('lab-ph')
        && visual.transitions.includes('lab-ph-top-ink')
        && visual.revealProgress > 0
        && visual.revealProgress < 1
        && visual.revealMode === 'ink-occluded-live-gate'
        && visual.revealClip.startsWith('polygon(')
        && visual.revealMask === 'none'
        && visual.phProgress === 0;
    }, { timeout: 5_000, intervals: [20] }).toBe(true);
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('ph-animation');

    const phHold = await visualSnapshot(page);
    expect(phHold.phProgress).toBe(0);
    expect(phHold.videos).toHaveLength(1);
    expect(phHold.videos[0]).toMatchObject({
      loop: false,
      paused: true,
      frameReady: true,
      desiredFrame: 0,
      presentedFrame: 0,
      frameEvidence: 'video-frame-callback'
    });
    expect(phHold.phBgTransform).not.toBe('none');
    expect(phHold.phFrontTransform).not.toBe('none');
    expect(phHold.phFigureTransform).not.toBe('none');

    await installEndpointProbe(page, 'education', '.r4-education');
    await page.evaluate(() => { void window.__r4Group6?.playForward(); });
    await expect.poll(async () => {
      const visual = await visualSnapshot(page);
      return visual.phDirection === '1'
        && visual.phProgress > 0
        && visual.phProgress < 1
        && visual.videos.some((video) => (
          video.frameReady
          && video.paused
          && video.currentTime > 0.02
          && video.desiredFrame >= 0
          && video.desiredFrame === video.presentedFrame
          && video.frameEvidence === 'video-frame-callback'
        ));
    }, { timeout: 5_000, intervals: [20] }).toBe(true);
    await expect.poll(async () => {
      const visual = await visualSnapshot(page);
      const handoff = Number.parseFloat(
        await page.locator('[data-stage-layer="education"]').getAttribute('data-r4-handoff-progress') ?? '0'
      );
      return (await snapshot(page)).phase === 'playing'
        && visual.phProgress === 1
        && visual.videos.length === 1
        && visual.videos[0]!.paused
        && visual.videos[0]!.currentTime > 1.4
        && visual.videos[0]!.desiredFrame === 45
        && visual.videos[0]!.presentedFrame === 45
        && visual.videos[0]!.frameEvidence === 'video-frame-callback'
        && handoff === 0;
    }, { timeout: 5_000, intervals: [20] }).toBe(true);
    const dwellStartedAt = Date.now();
    const terminalTime = (await visualSnapshot(page)).videos[0]!.currentTime;
    await page.waitForTimeout(650);
    const dwellFrame = await visualSnapshot(page);
    expect((await snapshot(page)).phase).toBe('playing');
    expect(dwellFrame.videos[0]).toMatchObject({ paused: true, frameReady: true });
    expect(Math.abs(dwellFrame.videos[0]!.currentTime - terminalTime)).toBeLessThan(0.03);
    expect(Number.parseFloat(
      await page.locator('[data-stage-layer="education"]').getAttribute('data-r4-handoff-progress') ?? '0'
    )).toBe(0);
    await expect.poll(async () => {
      const layer = page.locator('[data-stage-layer="education"]');
      return Number.parseFloat(await layer.getAttribute('data-r4-handoff-progress') ?? '0');
    }, { timeout: 8_000, intervals: [20] }).toBeGreaterThan(0);
    expect(Date.now() - dwellStartedAt).toBeGreaterThanOrEqual(850);
    await expect.poll(async () => (await snapshot(page)).window.current, { timeout: 10_000 }).toBe('education');

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

    const educationHold = await visualSnapshot(page);
    expect(educationHold).toMatchObject({
      educationProgress: 1,
      educationRows: 4,
      educationRoots: 1,
      educationLayers: 1,
      educationScrollTop: 0
    });
    expect(educationHold.educationScheme).toContain('light');
    expect(Math.abs(educationHold.educationTop)).toBeLessThan(1);
    expect(educationHold.educationWideTop).toBeGreaterThanOrEqual(0);
    expect(educationHold.educationWideTop).toBeLessThan(100);
    expect(educationHold.educationVerticalTop).toBeGreaterThan(educationHold.viewportHeight - 16);
    const log = (await snapshot(page)).eventLog;
    expect(log).not.toContain('STAGE_PAUSED');
    expect(log.filter((event) => event === 'PLAY:ph-education:1')).toHaveLength(1);

    await resetPresentedFrameRecorder(page);
    await page.evaluate(() => { void window.__r4Group6?.playReverse(); });
    await expect.poll(async () => {
      const visual = await visualSnapshot(page);
      return (await snapshot(page)).phase === 'playing'
        && visual.phDirection === '-1'
        && visual.phLayerVisible
        && visual.phProgress === 1
        && visual.videos[0]?.paused === true
        && (visual.videos[0]?.currentTime ?? 0) > 1.4
        && visual.videos[0]?.desiredFrame === 45
        && visual.videos[0]?.presentedFrame === 45
        && visual.videos[0]?.frameEvidence === 'video-frame-callback';
    }, { timeout: 5_000, intervals: [20] }).toBe(true);
    const reverseDwellStartedAt = Date.now();
    await page.waitForTimeout(650);
    const reverseDwellFrame = await visualSnapshot(page);
    expect(reverseDwellFrame.phProgress).toBe(1);
    expect(reverseDwellFrame.videos[0]?.paused).toBe(true);
    let previousTime: number | undefined;
    let descendingFrames = 0;
    for (let index = 0; index < 220 && (await snapshot(page)).phase !== 'hold'; index += 1) {
      await page.waitForTimeout(40);
      const video = (await visualSnapshot(page)).videos[0];
      if (video && previousTime !== undefined && video.currentTime < previousTime - 0.01) descendingFrames += 1;
      previousTime = video?.currentTime ?? previousTime;
    }
    await expect.poll(async () => {
      const frames = await presentedFrameHistory(page);
      return frames.at(-1)?.desiredFrame === 0
        && frames.at(-1)?.presentedFrame === 0
        && frames.at(-1)?.evidence === 'video-frame-callback';
    }, { timeout: 10_000, intervals: [20] }).toBe(true);
    await expect.poll(async () => (await snapshot(page)).window.current, { timeout: 10_000 }).toBe('ph-animation');
    expect(Date.now() - reverseDwellStartedAt).toBeGreaterThanOrEqual(850);
    expect(descendingFrames).toBeGreaterThan(2);
    writeTrace('group6-forward-reverse-trace.json', await snapshot(page));
  });

  test('reverses PH from the canonical terminal frame on the same media surface', async ({ page }) => {
    await page.goto('/harness/r4-g6-ph-education');
    await expect(page.getByTestId('r2-stage')).toBeVisible();
    await installPresentedFrameRecorder(page);
    await page.evaluate(() => { void window.__r4Group6?.playForward(); });
    await expect.poll(async () => {
      const visual = await visualSnapshot(page);
      return (await snapshot(page)).phase === 'playing'
        && visual.phProgress === 1
        && visual.videos[0]?.paused === true
        && visual.videos[0]?.currentTime > 1.4
        && visual.videos[0]?.desiredFrame === 45
        && visual.videos[0]?.presentedFrame === 45
        && visual.videos[0]?.frameEvidence === 'video-frame-callback';
    }, { timeout: 10_000, intervals: [20] }).toBe(true);
    const terminal = await visualSnapshot(page);
    expect(terminal.videos).toHaveLength(1);
    expect(terminal.videos[0]?.currentTime).toBeGreaterThan(1.4);
    expect(terminal.videos[0]).toMatchObject({
      desiredFrame: 45,
      presentedFrame: 45,
      frameEvidence: 'video-frame-callback'
    });
    await expect.poll(async () => (await snapshot(page)).window.current, { timeout: 10_000 }).toBe('education');

    await resetPresentedFrameRecorder(page);
    await page.evaluate(() => { void window.__r4Group6?.playReverse(); });
    await expect.poll(async () => {
      const visual = await visualSnapshot(page);
      return visual.phDirection === '-1'
        && visual.phLayerVisible
        && visual.phProgress > 0
        && visual.phProgress < 1
        && (visual.videos[0]?.currentTime ?? 1.5) < 1.4
        && visual.videos[0]?.paused === true
        && visual.videos[0]?.desiredFrame === visual.videos[0]?.presentedFrame
        && visual.videos[0]?.desiredFrame >= 0
        && visual.videos[0]?.frameEvidence === 'video-frame-callback';
    }, { timeout: 8_000, intervals: [20] }).toBe(true);
    await expect.poll(async () => {
      const frames = await presentedFrameHistory(page);
      return frames.at(-1)?.desiredFrame === 0
        && frames.at(-1)?.presentedFrame === 0
        && frames.at(-1)?.evidence === 'video-frame-callback';
    }, { timeout: 10_000, intervals: [20] }).toBe(true);
    const restoredProof = (await presentedFrameHistory(page)).at(-1);
    expect(restoredProof).toMatchObject({
      desiredFrame: 0,
      presentedFrame: 0,
      evidence: 'video-frame-callback'
    });
    await expect.poll(async () => (await snapshot(page)).window.current, { timeout: 10_000 }).toBe('ph-animation');
    const restored = await visualSnapshot(page);
    expect(restored.videos).toHaveLength(1);
    expect(restored.videos[0]?.currentTime).toBeLessThan(0.05);
    expect(restored.videos[0]).toMatchObject({
      desiredFrame: -1,
      presentedFrame: -1,
      frameEvidence: ''
    });
  });

  test('covers reduced motion and idempotent 0 to 1 to 0 to 1 replay', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/harness/r4-g6-ph-education');
    await expect(page.getByTestId('r2-stage')).toBeVisible();
    await page.evaluate(async () => { await window.__r4Group6?.idempotentCycle(); });
    const frame = await snapshot(page);
    expect(frame.phase).toBe('hold');
    expect(frame.window.current).toBe('education');
    expect(frame.visibleCount).toBe(1);
    expect(frame.interactableCount).toBe(1);
    expect(frame.eventLog).not.toContain('STAGE_PAUSED');
  });

  test('recovers from build timeout and supports seek', async ({ page }) => {
    await page.goto('/harness/r4-g6');
    await expect(page.getByTestId('r2-stage')).toBeVisible();
    await page.evaluate(async () => { await window.__r4Group6?.playForward({ buildTimeout: true }); });
    const recovered = await snapshot(page);
    expect(recovered.phase).toBe('hold');
    expect(recovered.window.current).toBe('ph-animation');
    expect(recovered.recoveryCount).toBe(1);
    expect(recovered.eventLog).toContain('BUILD_TIMEOUT:lab-ph');
    await page.evaluate(() => { window.__r4Group6?.seek('education'); });
    await expect.poll(async () => (await snapshot(page)).window.current).toBe('education');
  });
});
