import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const HERO_PATTERN_MOTION_STOP = 1 / 3;
const PATTERN_COLLAPSE_STOP = 1800 / 3600;

type Group1Snapshot = {
  phase: 'hold' | 'preparing' | 'playing' | 'scrubbing' | 'staged-paused' | 'settling' | 'recovering' | 'seeking';
  mode: string;
  window: { current: string; retiring: readonly string[] };
  visibleCount: number;
  interactableCount: number;
  mountedCount: number;
  eventLog: readonly string[];
  lastError: string | null;
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
    __r4Group1?: {
      playForward(options?: { buildTimeout?: boolean }): Promise<void>;
      playReverse(options?: { buildTimeout?: boolean }): Promise<void>;
      step(direction: 1 | -1): Promise<void>;
      seek(scene: 'hero' | 'pattern' | 'star-map'): void;
      scrubHeroPattern(progress: number): Promise<void>;
      scrubPatternStarMap(progress: number): Promise<void>;
      idempotentCycle(): Promise<void>;
      snapshot(): Group1Snapshot;
    };
  }
}

async function snapshot(page: Page): Promise<Group1Snapshot> {
  return page.evaluate(() => {
    const api = window.__r4Group1;
    if (!api) {
      throw new Error('R4 group1 harness API is not installed');
    }
    return api.snapshot();
  });
}

type Group1VisualSnapshot = {
  activeInkSegments: readonly string[];
  transitions: readonly string[];
  inkOrigins: Record<string, { x: number; y: number }>;
  patternProgress: number;
  patternClipProgress: number;
  patternInkProgress: number;
  patternCopyOpacity: number;
  patternFieldRotationDegrees: number;
  largestRingScale: number;
  compactRingScale: number;
  patternCanvasOpacity: number;
  patternCanvasTransform: string;
  patternCanvasArea: number;
  patternCanvasNonBlankSamples: number;
  patternCanvasRevision: number;
  patternCanvasTextureUploads: number;
  starMapProgress: number;
  starMapCopyOpacity: number;
  starMapCanvasOpacity: number;
  starMapCanvasRevision: number;
  starMapCanvasTextureUploads: number;
  starMapSnapshotCaptures: number;
  starMapCanvasMotionActive: boolean;
  starMapCanvasFilter: string;
  starMapTransitionPaused: boolean;
  starMapInkCount: number;
  heroProgress: number;
  heroMotionProgress: number;
  heroLayerZ: number;
  patternLayerZ: number;
  starMapLayerZ: number;
  patternLayerClipPath: string;
  starMapLayerClipPath: string;
  patternLayerElevated: boolean;
  patternLayerVisible: boolean;
  starMapLayerElevated: boolean;
  starMapLayerVisible: boolean;
  heroVideoLoop: boolean | null;
  heroVideoPaused: boolean | null;
  heroVideoAutoplay: boolean | null;
  heroVideoCurrentTime: number | null;
  heroVideoDesiredFrame: number | null;
  heroVideoPresentedFrame: number | null;
  heroVideoFrameEvidence: string | null;
};

async function visualSnapshot(page: Page): Promise<Group1VisualSnapshot> {
  return page.evaluate(() => {
    const patternRoot = document.querySelector<HTMLElement>('[data-r4-scene="pattern"]');
    const heroLayer = document.querySelector<HTMLElement>('[data-stage-layer="hero"]');
    const patternLayer = patternRoot?.closest<HTMLElement>('[data-stage-layer]');
    const starMapLayer = document.querySelector<HTMLElement>('[data-stage-layer="star-map"]');
    const patternStyle = patternRoot ? window.getComputedStyle(patternRoot) : undefined;
    const patternCanvas = document.querySelector<HTMLCanvasElement>('[data-pattern-canvas]');
    const starMapRoot = document.querySelector<HTMLElement>('[data-r3-scene="star-map"]');
    const starMapCopy = document.querySelector<HTMLElement>('.r3-star-map__copy');
    const starMapCanvas = document.querySelector<HTMLCanvasElement>('[data-belief-star-field]');
    const patternCanvasStyle = patternCanvas ? window.getComputedStyle(patternCanvas) : undefined;
    const canvasRect = patternCanvas?.getBoundingClientRect();
    const heroVideo = document.querySelector<HTMLVideoElement>('[data-hero-figure-video]');
    const heroRoot = document.querySelector<HTMLElement>('[data-r4-scene="hero"]');
    let patternCanvasNonBlankSamples = 0;
    const context = patternCanvas?.getContext('2d');
    if (patternCanvas && context && patternCanvas.width > 0 && patternCanvas.height > 0) {
      for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 8; x += 1) {
          const pixel = context.getImageData(
            Math.min(patternCanvas.width - 1, Math.round((x + 0.5) * patternCanvas.width / 8)),
            Math.min(patternCanvas.height - 1, Math.round((y + 0.5) * patternCanvas.height / 8)),
            1,
            1
          ).data;
          if (pixel[3] > 0 && pixel[0] + pixel[1] + pixel[2] > 0) {
            patternCanvasNonBlankSamples += 1;
          }
        }
      }
    }
    const inkCanvases = [...document.querySelectorAll<HTMLCanvasElement>('[data-r4-ink-segment]')];
    return {
      activeInkSegments: inkCanvases
        .filter((canvas) => canvas.dataset.r4InkActive === 'true' || canvas.parentElement?.dataset.r4InkActive === 'true')
        .map((canvas) => canvas.dataset.r4InkSegment ?? ''),
      transitions: [...document.querySelectorAll<HTMLElement>('[data-r4-transition]')]
        .map((element) => element.dataset.r4Transition ?? ''),
      inkOrigins: Object.fromEntries(inkCanvases.map((canvas) => {
        const [x, y] = (canvas.dataset.r4InkBoundaryOrigin ?? '').split(',').map(Number.parseFloat);
        return [canvas.dataset.r4InkSegment ?? '', { x: x ?? Number.NaN, y: y ?? Number.NaN }];
      })),
      patternProgress: Number.parseFloat(patternRoot?.dataset.patternProgress ?? '0'),
      patternClipProgress: Number.parseFloat(patternLayer?.dataset.r4InkBoundaryProgress ?? '0'),
      patternInkProgress: Number.parseFloat(patternLayer?.dataset.r4InkProgress ?? '0'),
      patternCopyOpacity: Number.parseFloat(patternStyle?.getPropertyValue('--r4-pattern-copy-opacity') ?? '0'),
      patternFieldRotationDegrees: Number.parseFloat(patternStyle?.getPropertyValue('--r4-pattern-field-rotation') ?? '0'),
      largestRingScale: Number.parseFloat(patternStyle?.getPropertyValue('--r4-pattern-largest-ring-scale') ?? '0'),
      compactRingScale: Number.parseFloat(patternStyle?.getPropertyValue('--r4-pattern-compact-ring-scale') ?? '0'),
      patternCanvasOpacity: Number.parseFloat(patternCanvasStyle?.opacity ?? '0'),
      patternCanvasTransform: patternCanvasStyle?.transform ?? 'none',
      patternCanvasArea: (canvasRect?.width ?? 0) * (canvasRect?.height ?? 0),
      patternCanvasNonBlankSamples,
      patternCanvasRevision: Number.parseInt(patternCanvas?.dataset.inkTextureRevision ?? '0', 10),
      patternCanvasTextureUploads: Number.parseInt(patternCanvas?.dataset.r4InkTextureUploads ?? '0', 10),
      starMapProgress: Number.parseFloat(starMapRoot?.dataset.starMapProgress ?? '0'),
      starMapCopyOpacity: Number.parseFloat(starMapCopy ? window.getComputedStyle(starMapCopy).opacity : '0'),
      starMapCanvasOpacity: Number.parseFloat(starMapCanvas ? window.getComputedStyle(starMapCanvas).opacity : '0'),
      starMapCanvasRevision: Number.parseInt(starMapCanvas?.dataset.inkTextureRevision ?? '0', 10),
      starMapCanvasTextureUploads: Number.parseInt(starMapCanvas?.dataset.r4InkTextureUploads ?? '0', 10),
      starMapSnapshotCaptures: Number.parseInt(starMapCanvas?.dataset.r4InkSnapshotCaptures ?? '0', 10),
      starMapCanvasMotionActive: starMapCanvas?.dataset.starMapMotionActive === 'true',
      starMapCanvasFilter: starMapCanvas ? window.getComputedStyle(starMapCanvas).filter : 'none',
      starMapTransitionPaused: starMapRoot?.dataset.starMapTransitionMotion === 'paused',
      starMapInkCount: inkCanvases.filter((canvas) => canvas.dataset.r4InkSegment === 'pattern-star-map').length,
      heroProgress: Number.parseFloat(heroRoot?.dataset.heroProgress ?? '0'),
      heroMotionProgress: Number.parseFloat(
        heroRoot?.style.getPropertyValue('--r4-hero-pattern-middle-progress') ?? '0'
      ),
      heroLayerZ: Number.parseInt(window.getComputedStyle(heroLayer ?? document.body).zIndex || '0', 10),
      patternLayerZ: Number.parseInt(window.getComputedStyle(patternLayer ?? document.body).zIndex || '0', 10),
      starMapLayerZ: Number.parseInt(window.getComputedStyle(starMapLayer ?? document.body).zIndex || '0', 10),
      patternLayerClipPath: window.getComputedStyle(patternLayer ?? document.body).clipPath,
      starMapLayerClipPath: window.getComputedStyle(starMapLayer ?? document.body).clipPath,
      patternLayerElevated: patternLayer?.dataset.r4TransitionElevated === 'true',
      patternLayerVisible: patternLayer?.dataset.visible === 'true',
      starMapLayerElevated: starMapLayer?.dataset.r4TransitionElevated === 'true',
      starMapLayerVisible: starMapLayer?.dataset.visible === 'true',
      heroVideoLoop: heroVideo?.loop ?? null,
      heroVideoPaused: heroVideo?.paused ?? null,
      heroVideoAutoplay: heroVideo?.autoplay ?? null,
      heroVideoCurrentTime: heroVideo?.currentTime ?? null,
      heroVideoDesiredFrame: heroRoot?.dataset.heroDesiredFrame === undefined
        ? null
        : Number.parseInt(heroRoot.dataset.heroDesiredFrame, 10),
      heroVideoPresentedFrame: heroRoot?.dataset.heroPresentedFrame === undefined
        ? null
        : Number.parseInt(heroRoot.dataset.heroPresentedFrame, 10),
      heroVideoFrameEvidence: heroVideo?.dataset.timelineVideoFrameEvidence ?? null
    };
  });
}

async function assertFrame(frame: Group1Snapshot): Promise<void> {
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

function writeTrace(name: string, frame: Group1Snapshot): void {
  const artifactDir = resolve(process.cwd(), '..', 'artifacts', 'react-refactor', 'r4-g1');
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(resolve(artifactDir, name), `${JSON.stringify(frame, null, 2)}\n`);
}

test.describe('R4 group1 canonical spine harness', () => {
  test.use({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1
  });

  test('runs forward and reverse with nonblank sampled frames', async ({ page }) => {
    test.setTimeout(90_000);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/harness/r4-g1');
    await expect(page.getByTestId('r2-stage')).toBeVisible();
    const initialVisual = await visualSnapshot(page);
    expect(initialVisual.heroVideoLoop).toBe(false);
    expect(initialVisual.heroVideoAutoplay).toBe(false);
    expect(initialVisual.heroVideoPaused).toBe(true);
    expect(initialVisual.heroVideoCurrentTime ?? 0).toBeLessThan(0.5);

    await page.evaluate(async () => {
      await window.__r4Group1?.scrubHeroPattern(0.2);
    });
    const earlyHeroPattern = await visualSnapshot(page);
    expect(earlyHeroPattern.transitions).not.toContain('hero-pattern-live-circle');
    expect(earlyHeroPattern.activeInkSegments).not.toContain('hero-pattern');
    expect(earlyHeroPattern.patternLayerElevated).toBe(true);
    expect(earlyHeroPattern.patternLayerZ).toBeGreaterThan(earlyHeroPattern.heroLayerZ);
    expect(earlyHeroPattern.patternLayerClipPath).toContain('circle(');
    expect(earlyHeroPattern.heroProgress).toBe(1);
    expect(earlyHeroPattern.patternProgress).toBe(0);
    expect(earlyHeroPattern.patternCanvasOpacity).toBe(1);
    expect(earlyHeroPattern.heroMotionProgress).toBeCloseTo(0.6, 2);
    expect(earlyHeroPattern.patternClipProgress).toBe(0);
    expect(earlyHeroPattern.patternInkProgress).toBe(0);
    expect(earlyHeroPattern.patternLayerVisible).toBe(false);
    await page.evaluate(async () => {
      await window.__r4Group1?.scrubHeroPattern(0.79);
    });
    const revealedBloomingPattern = await visualSnapshot(page);
    expect(revealedBloomingPattern.heroMotionProgress).toBe(1);
    expect(revealedBloomingPattern.patternClipProgress).toBeCloseTo(
      (0.79 - HERO_PATTERN_MOTION_STOP) / (1 - HERO_PATTERN_MOTION_STOP),
      2
    );
    expect(revealedBloomingPattern.patternInkProgress).toBeCloseTo(
      (0.79 - HERO_PATTERN_MOTION_STOP) / (1 - HERO_PATTERN_MOTION_STOP),
      2
    );
    expect(revealedBloomingPattern.patternProgress).toBe(0);
    await page.evaluate(async () => {
      await window.__r4Group1?.scrubHeroPattern(0);
    });

    await page.evaluate(async () => {
      await window.__r4Group1?.playForward();
    });
    const forwardFrames: Group1Snapshot[] = [];
    expect((await snapshot(page)).phase).toBe('hold');
    expect((await snapshot(page)).window.current).toBe('pattern');
    const canonicalPattern = await visualSnapshot(page);
    expect(canonicalPattern.patternProgress).toBe(0);
    expect(canonicalPattern.patternCopyOpacity).toBe(0);
    expect(canonicalPattern.patternFieldRotationDegrees).toBeCloseTo(120, 3);
    expect(canonicalPattern.largestRingScale).toBeGreaterThan(4);
    expect(canonicalPattern.compactRingScale).toBeGreaterThan(1);
    expect(canonicalPattern.patternCanvasNonBlankSamples).toBeGreaterThan(0);
    expect(canonicalPattern.patternCanvasRevision).toBeGreaterThan(0);
    const canonicalPatternRevision = canonicalPattern.patternCanvasRevision;
    await page.waitForTimeout(180);
    const animatedPattern = await visualSnapshot(page);
    expect(animatedPattern.patternCanvasRevision).toBeGreaterThan(canonicalPatternRevision);
    expect(animatedPattern.patternCanvasRevision - canonicalPatternRevision).toBeLessThanOrEqual(6);
    expect(animatedPattern.patternCanvasTransform).toBe('none');

    await page.evaluate(async (stop) => {
      await window.__r4Group1?.scrubPatternStarMap(stop);
    }, PATTERN_COLLAPSE_STOP);
    const compactPattern = await visualSnapshot(page);
    expect(compactPattern.patternProgress).toBe(1);
    expect(compactPattern.patternFieldRotationDegrees).toBeCloseTo(0, 3);
    expect(compactPattern.largestRingScale).toBeCloseTo(0.08, 3);
    expect(compactPattern.compactRingScale).toBeCloseTo(0.28, 3);
    expect(compactPattern.patternCopyOpacity).toBeCloseTo(0.96, 3);
    expect(compactPattern.starMapLayerVisible).toBe(false);
    await page.waitForTimeout(180);
    const compactPatternLater = await visualSnapshot(page);
    expect(compactPatternLater.patternCanvasRevision).toBeGreaterThan(compactPattern.patternCanvasRevision);

    await page.evaluate(async () => {
      await window.__r4Group1?.scrubPatternStarMap(0.96);
    });
    const canonicalStarHandoff = await visualSnapshot(page);
    expect(canonicalStarHandoff.starMapInkCount).toBe(1);
    expect(canonicalStarHandoff.starMapCanvasOpacity).toBeGreaterThan(0.8);
    expect(canonicalStarHandoff.starMapTransitionPaused).toBe(false);
    expect(canonicalStarHandoff.starMapCanvasFilter).toContain('brightness(0.92)');
    expect(canonicalStarHandoff.starMapCanvasMotionActive).toBe(true);
    await page.waitForTimeout(180);
    const starHandoffLater = await visualSnapshot(page);
    expect(starHandoffLater.starMapCanvasRevision).toBeGreaterThan(canonicalStarHandoff.starMapCanvasRevision);
    await page.evaluate(async () => {
      await window.__r4Group1?.scrubPatternStarMap(0);
    });

    await page.evaluate(async () => { await window.__r4Group1?.step(1); });
    expect((await snapshot(page)).phase).toBe('staged-paused');
    const forwardP1 = await visualSnapshot(page);
    expect(forwardP1.patternProgress).toBe(1);
    expect(forwardP1.patternCopyOpacity).toBeCloseTo(0.96, 3);
    expect(forwardP1.starMapLayerVisible).toBe(false);

    await page.evaluate(() => { void window.__r4Group1?.step(1); });
    let patternStarMapInk: Group1VisualSnapshot | undefined;
    const starMapInkDeadline = Date.now() + 12_000;
    while (Date.now() < starMapInkDeadline && !patternStarMapInk) {
      const visual = await visualSnapshot(page);
      if (visual.activeInkSegments.includes('pattern-star-map')) {
        patternStarMapInk = visual;
        break;
      }
      await page.waitForTimeout(20);
    }
    expect(patternStarMapInk).toBeDefined();
    expect(patternStarMapInk?.transitions).toContain('pattern-star-map-live-circle');
    expect(patternStarMapInk?.patternLayerElevated).toBe(false);
    expect(patternStarMapInk?.starMapLayerElevated).toBe(true);
    expect(patternStarMapInk?.starMapLayerVisible).toBe(true);
    expect(patternStarMapInk?.starMapLayerZ ?? 0).toBeGreaterThan(patternStarMapInk?.patternLayerZ ?? 0);
    expect(patternStarMapInk?.starMapLayerClipPath).toContain('circle(');
    expect(patternStarMapInk?.starMapCanvasTextureUploads ?? 99).toBeLessThanOrEqual(3);
    expect(patternStarMapInk?.starMapSnapshotCaptures).toBe(0);
    expect(patternStarMapInk?.starMapCanvasMotionActive).toBe(true);
    expect(patternStarMapInk?.inkOrigins['pattern-star-map']?.x).toBeCloseTo(0.24, 2);
    expect(patternStarMapInk?.inkOrigins['pattern-star-map']?.y).toBeCloseTo(0.55, 2);
    expect(patternStarMapInk?.patternProgress).toBe(1);
    expect(patternStarMapInk?.starMapCopyOpacity).toBeGreaterThan(0.95);
    expect(patternStarMapInk?.starMapCanvasOpacity).toBeGreaterThan(0.8);

    for (let index = 0; index < 18; index += 1) {
      await page.waitForTimeout(24);
      forwardFrames.push(await snapshot(page));
    }
    await expect.poll(async () => (await snapshot(page)).window.current, { timeout: 12_000 }).toBe('star-map');
    const starHold = await visualSnapshot(page);
    await page.waitForTimeout(300);
    const starHoldLater = await visualSnapshot(page);
    expect(starHoldLater.starMapCanvasRevision).toBeGreaterThan(starHold.starMapCanvasRevision);
    expect(starHoldLater.starMapCanvasMotionActive).toBe(true);

    await page.evaluate(() => { void window.__r4Group1?.step(-1); });
    let reversePatternStarMapInk: Group1VisualSnapshot | undefined;
    const reverseInkDeadline = Date.now() + 12_000;
    while (Date.now() < reverseInkDeadline && !reversePatternStarMapInk) {
      const visual = await visualSnapshot(page);
      if (visual.activeInkSegments.includes('pattern-star-map')) {
        reversePatternStarMapInk = visual;
        break;
      }
      await page.waitForTimeout(20);
    }
    expect(reversePatternStarMapInk?.starMapCanvasMotionActive).toBe(true);
    await page.waitForTimeout(180);
    const reversePatternStarMapInkLater = await visualSnapshot(page);
    expect(reversePatternStarMapInkLater.starMapCanvasRevision).toBeGreaterThan(
      reversePatternStarMapInk?.starMapCanvasRevision ?? 0
    );
    await expect.poll(async () => (await snapshot(page)).phase, { timeout: 12_000 }).toBe('staged-paused');
    const reverseP1 = await visualSnapshot(page);
    expect(reverseP1.patternProgress).toBe(1);
    expect(reverseP1.patternCopyOpacity).toBeCloseTo(0.96, 3);

    const reverseFrames: Group1Snapshot[] = [];
    await page.evaluate(() => { void window.__r4Group1?.step(-1); });
    for (let index = 0; index < 18; index += 1) {
      await page.waitForTimeout(24);
      reverseFrames.push(await snapshot(page));
    }
    await expect.poll(async () => (await snapshot(page)).window.current, { timeout: 12_000 }).toBe('pattern');
    expect((await visualSnapshot(page)).patternProgress).toBe(0);
    expect((await snapshot(page)).eventLog).toContain('STAGE_PAUSED');

    for (const frame of [...forwardFrames, ...reverseFrames]) {
      await assertFrame(frame);
    }

    const finalFrame = await snapshot(page);
    writeTrace('group1-forward-reverse-trace.json', finalFrame);
    expect(finalFrame.phase).toBe('hold');
    expect(finalFrame.visibleCount).toBe(1);
    expect(finalFrame.interactableCount).toBe(1);
  });

  test('covers reduced motion and 0 to 1 to 0 to 1 replay', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/harness/r4-g1-hero-pattern');
    await expect(page.getByTestId('r2-stage')).toBeVisible();
    await expect(page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)).resolves.toBe(true);

    await page.evaluate(async () => {
      await window.__r4Group1?.idempotentCycle();
    });

    const frame = await snapshot(page);
    writeTrace('group1-reduced-motion-trace.json', frame);
    expect(frame.phase).toBe('hold');
    expect(frame.window.current).toBe('pattern');
    expect(frame.visibleCount).toBe(1);
    expect(frame.interactableCount).toBe(1);
  });

  test('prepositions the hidden prev Hero terminal before Pattern reverses into it', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/harness/r4-g1-hero-pattern');
    await expect(page.getByTestId('r2-stage')).toBeVisible();

    await page.evaluate(() => { void window.__r4Group1?.playForward(); });
    await expect.poll(async () => (await snapshot(page)).window.current, { timeout: 10_000 }).toBe('pattern');
    await expect.poll(async () => (await snapshot(page)).phase, { timeout: 10_000 }).toBe('hold');
    const prepared = await page.evaluate(() => {
      const layer = document.querySelector<HTMLElement>('[data-stage-layer="hero"]');
      const root = layer?.querySelector<HTMLElement>('[data-r4-scene="hero"]');
      const video = layer?.querySelector<HTMLVideoElement>('[data-hero-figure-video]');
      return {
        role: layer?.dataset.role,
        visible: layer?.dataset.visible,
        paused: video?.paused,
        desiredFrame: Number.parseInt(root?.dataset.heroDesiredFrame ?? '-1', 10),
        presentedFrame: Number.parseInt(root?.dataset.heroPresentedFrame ?? '-1', 10),
        evidence: video?.dataset.timelineVideoFrameEvidence,
        currentTime: video?.currentTime ?? 0
      };
    });
    expect(prepared.role).toBe('prev');
    expect(prepared.visible).toBe('false');
    expect(prepared.paused).toBe(true);
    expect(prepared.desiredFrame).toBe(prepared.presentedFrame);
    expect(prepared.evidence).toBe('video-frame-callback');
    expect(prepared.currentTime).toBeGreaterThan(0.85);

    await page.evaluate(() => {
      const playbackWindow = window as Window & { __r4HeroReversePlayback?: Promise<void> };
      playbackWindow.__r4HeroReversePlayback = window.__r4Group1?.playReverse();
    });
    for (let index = 0; index < 8; index += 1) {
      await page.waitForTimeout(30);
      const video = await visualSnapshot(page);
      expect(video.heroVideoPaused).toBe(true);
      expect(video.heroVideoCurrentTime ?? 0).toBeGreaterThan(0.85);
      expect(video.heroVideoDesiredFrame).toBe(video.heroVideoPresentedFrame);
    }
    await page.evaluate(async () => {
      const playbackWindow = window as Window & { __r4HeroReversePlayback?: Promise<void> };
      await playbackWindow.__r4HeroReversePlayback;
      delete playbackWindow.__r4HeroReversePlayback;
    });
    expect((await snapshot(page)).window.current).toBe('hero');
    const landed = await visualSnapshot(page);
    expect(landed.heroVideoPaused).toBe(true);
    expect(landed.heroVideoCurrentTime ?? 1).toBeLessThan(0.1);
  });

  test('keeps Pattern and Star hold motion active and prevents overscroll pixel exposure', async ({ page }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/harness/r4-g1-pattern-star-map');
    await expect(page.getByTestId('r2-stage')).toBeVisible();
    await expect.poll(() => page.locator('[data-pattern-canvas]').getAttribute('data-ink-texture-ready')).toBe('true');

    const patternBefore = await visualSnapshot(page);
    await page.waitForTimeout(1_000);
    const patternAfter = await visualSnapshot(page);
    expect(patternAfter.patternCanvasRevision).toBeGreaterThan(patternBefore.patternCanvasRevision);
    expect(patternAfter.patternCanvasRevision - patternBefore.patternCanvasRevision).toBeLessThanOrEqual(26);
    expect(patternAfter.patternCanvasTransform).toBe('none');

    await page.evaluate(() => window.__r4Group1?.seek('star-map'));
    await expect.poll(() => page.locator('[data-belief-star-field]').getAttribute('data-ink-texture-ready')).toBe('true');
    const starBefore = await visualSnapshot(page);
    await page.waitForTimeout(1_000);
    const starAfter = await visualSnapshot(page);
    expect(starAfter.starMapCanvasRevision).toBeGreaterThan(starBefore.starMapCanvasRevision);
    expect(starAfter.starMapCanvasMotionActive).toBe(true);

    await page.evaluate(() => {
      window.scrollTo(0, 10_000);
      window.scrollBy(10_000, 10_000);
    });
    await page.mouse.wheel(0, 4_000);
    const viewport = await page.evaluate(() => ({
      documentHeight: document.documentElement.scrollHeight,
      documentWidth: document.documentElement.scrollWidth,
      innerHeight: window.innerHeight,
      innerWidth: window.innerWidth,
      scrollX: window.scrollX,
      scrollY: window.scrollY
    }));
    expect(viewport.documentWidth).toBe(viewport.innerWidth);
    expect(viewport.scrollX).toBe(0);
    expect(viewport.documentHeight).toBeGreaterThanOrEqual(viewport.innerHeight);
    expect(viewport.scrollY).toBeLessThanOrEqual(viewport.documentHeight - viewport.innerHeight);
  });

  test('recovers from build timeout without locking the current hold', async ({ page }) => {
    test.setTimeout(30_000);
    await page.goto('/harness/r4-g1');
    await expect(page.getByTestId('r2-stage')).toBeVisible();

    await page.evaluate(async () => {
      await window.__r4Group1?.playForward({ buildTimeout: true });
    });

    await expect.poll(async () => {
      const frame = await snapshot(page);
      return frame.phase === 'hold' && frame.window.current === 'hero' && frame.interactableCount === 1;
    }).toBe(true);
    const frame = await snapshot(page);
    expect(frame.phase).toBe('hold');
    expect(frame.window.current).toBe('hero');
    expect(frame.interactableCount).toBe(1);
    expect(frame.recoveryCount).toBe(1);
    expect(frame.lastError ?? '').toMatch(/timeout/i);
  });
});
