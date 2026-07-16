import { expect, test, type Page } from '@playwright/test';
import {
  bootStory,
  moveOneHold,
  navigateStory,
  reachReadingEdge,
  storySnapshot,
  waitForHold
} from './r5-helpers';

test.use({ video: 'off', trace: 'off', screenshot: 'off' });

type PerformanceWindow = Window & {
  __r5Lcp?: number;
  __r5LcpElement?: string;
  __r5StopFrames?: () => number[];
};

type InkSamplingMode =
  | 'all'
  | 'figure3-tail'
  | 'hero-pattern'
  | 'pattern-star-map'
  | 'figure2-depth'
  | 'horizontal-ink';

type LiveInkWitness = {
  segment: string;
  rendererStatus: string;
  width: number;
  height: number;
  opacity: number;
  visible: boolean;
  progress: number;
};

type InkPixelWitness = Readonly<{
  segment: string;
  progress: number;
  width: number;
  height: number;
  readbackError: number;
  alphaPixels: number;
  opaquePixels: number;
  brightPixels: number;
  sparseBrightPixels: number;
  compactSquareSpatterComponents?: number;
  compactSquareSpatterPixels?: number;
  maxAlpha: number;
  maxLuminance: number;
  doubleEdgeColumns?: number;
  strongestDoubleEdgeGapPx?: number;
  strongestSecondEdgeAlpha?: number;
}>;

type HeroTextureOrientationWitness = Readonly<{
  progress: number;
  comparedSamples: number;
  minimumAlpha: number;
  matchingOrientationMeanError: number;
  verticallyInvertedMeanError: number;
}>;

function summarizeFrames(frameIntervals: number[]) {
  const sorted = [...frameIntervals].sort((left, right) => left - right);
  const p95FrameIntervalMs = sorted[
    Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))
  ] ?? 0;
  const longFrameIndices = frameIntervals.flatMap((value, index) => value > 50 ? [index] : []);
  const longFramesOver50Ms = longFrameIndices.length;
  return {
    samples: frameIntervals.length,
    p95FrameIntervalMs,
    maxFrameIntervalMs: Math.max(0, ...frameIntervals),
    longFramesOver50Ms,
    longFrameIndices,
    longFrameRatio: longFramesOver50Ms / frameIntervals.length
  };
}

async function waitForLiveInk(
  page: Page,
  segment: string,
  progressRange?: Readonly<{ min: number; max: number }>
): Promise<LiveInkWitness> {
  await page.waitForFunction(({ expectedSegment, range }) => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      `canvas[data-r4-ink-segment="${expectedSegment}"]`
    );
    if (!canvas) return false;
    const style = getComputedStyle(canvas);
    const progress = Number.parseFloat(canvas.dataset.r4InkProgress ?? 'NaN');
    return canvas.dataset.r4InkActive === 'true'
      && canvas.dataset.r4InkRendererActive === 'true'
      && canvas.dataset.r4InkRendererStatus === 'active'
      && canvas.width > 0
      && canvas.height > 0
      && style.visibility === 'visible'
      && Number.parseFloat(style.opacity) > 0.002
      && (!range || (Number.isFinite(progress) && progress >= range.min && progress <= range.max));
  }, { expectedSegment: segment, range: progressRange }, { timeout: 15_000 });
  return page.evaluate((expectedSegment) => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      `canvas[data-r4-ink-segment="${expectedSegment}"]`
    );
    if (!canvas) throw new Error(`Ink canvas ${expectedSegment} disappeared before sampling`);
    const style = getComputedStyle(canvas);
    return {
      segment: expectedSegment,
      rendererStatus: canvas.dataset.r4InkRendererStatus ?? 'missing',
      width: canvas.width,
      height: canvas.height,
      opacity: Number.parseFloat(style.opacity),
      visible: style.visibility === 'visible',
      progress: Number.parseFloat(canvas.dataset.r4InkProgress ?? 'NaN')
    };
  }, segment);
}

async function readInkPixels(
  page: Page,
  segment: string,
  includeHorizontalDoubleEdge = false,
  includeParticleMorphology = false
): Promise<InkPixelWitness> {
  return page.evaluate(async ({ expectedSegment, inspectDoubleEdge, inspectParticles }) => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      `canvas[data-r4-ink-segment="${expectedSegment}"]`
    );
    if (!canvas) throw new Error(`Ink canvas ${expectedSegment} disappeared before pixel readback`);
    const gl = canvas.getContext('webgl');
    if (!gl) throw new Error(`Ink canvas ${expectedSegment} has no WebGL context`);

    const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await nextFrame();
    const width = canvas.width;
    const height = canvas.height;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const readbackError = gl.getError();
    let alphaPixels = 0;
    let opaquePixels = 0;
    let brightPixels = 0;
    let sparseBrightPixels = 0;
    let maxAlpha = 0;
    let maxLuminance = 0;
    const particleMask = inspectParticles ? new Uint8Array(width * height) : null;
    const brightnessAt = (offset: number) => Math.max(
      pixels[offset] ?? 0,
      pixels[offset + 1] ?? 0,
      pixels[offset + 2] ?? 0
    );
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const alpha = pixels[offset + 3] ?? 0;
        const brightness = brightnessAt(offset);
        maxAlpha = Math.max(maxAlpha, alpha);
        maxLuminance = Math.max(maxLuminance, brightness);
        if (alpha > 8) alphaPixels += 1;
        if (alpha > 224) opaquePixels += 1;
        if (alpha > 18 && brightness > 72) {
          brightPixels += 1;
          if (x > 0 && x < width - 1 && y > 0 && y < height - 1) {
            let brightNeighbors = 0;
            for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
              for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
                if (offsetX === 0 && offsetY === 0) continue;
                const neighbor = ((y + offsetY) * width + x + offsetX) * 4;
                if ((pixels[neighbor + 3] ?? 0) > 18 && brightnessAt(neighbor) > 72) {
                  brightNeighbors += 1;
                }
              }
            }
            if (brightNeighbors <= 2) sparseBrightPixels += 1;
          }
        }
        if (particleMask && alpha > 18 && brightness > 96) {
          particleMask[y * width + x] = 1;
        }
      }
    }

    const particleMorphology = particleMask ? (() => {
      const visited = new Uint8Array(width * height);
      const queue = new Int32Array(width * height);
      let compactSquareSpatterComponents = 0;
      let compactSquareSpatterPixels = 0;
      for (let start = 0; start < particleMask.length; start += 1) {
        if (particleMask[start] === 0 || visited[start] !== 0) continue;
        let head = 0;
        let tail = 0;
        let area = 0;
        let minX = width;
        let maxX = 0;
        let minY = height;
        let maxY = 0;
        queue[tail++] = start;
        visited[start] = 1;
        while (head < tail) {
          const pixel = queue[head++]!;
          const x = pixel % width;
          const y = (pixel - x) / width;
          area += 1;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
          const enqueue = (neighbor: number) => {
            if (particleMask[neighbor] === 0 || visited[neighbor] !== 0) return;
            visited[neighbor] = 1;
            queue[tail++] = neighbor;
          };
          if (x > 0) enqueue(pixel - 1);
          if (x < width - 1) enqueue(pixel + 1);
          if (y > 0) enqueue(pixel - width);
          if (y < height - 1) enqueue(pixel + width);
        }
        const componentWidth = maxX - minX + 1;
        const componentHeight = maxY - minY + 1;
        const shorterSide = Math.max(1, Math.min(componentWidth, componentHeight));
        const aspectRatio = Math.max(componentWidth, componentHeight) / shorterSide;
        const fillRatio = area / (componentWidth * componentHeight);
        if (
          area >= 4
          && area <= 1024
          && componentWidth >= 2
          && componentHeight >= 2
          && aspectRatio <= 1.8
          && fillRatio >= 0.42
        ) {
          compactSquareSpatterComponents += 1;
          compactSquareSpatterPixels += area;
        }
      }
      return { compactSquareSpatterComponents, compactSquareSpatterPixels };
    })() : {};

    const horizontal = inspectDoubleEdge ? (() => {
      let doubleEdgeColumns = 0;
      let strongestDoubleEdgeGapPx = 0;
      let strongestSecondEdgeAlpha = 0;
      const columns = 48;
      const threshold = Number.parseFloat(canvas.dataset.r4InkProgress ?? '0.5');
      const expectedCenterY = (1 - threshold) * (height - 1);
      const searchStart = Math.max(1, Math.floor(expectedCenterY - height * 0.1));
      const searchEnd = Math.min(height - 2, Math.ceil(expectedCenterY + height * 0.1));
      for (let column = 1; column < columns; column += 1) {
        const x = Math.round(column / columns * (width - 1));
        let primaryY = 0;
        let primaryAlpha = 0;
        for (let y = searchStart; y <= searchEnd; y += 1) {
          const alpha = pixels[(y * width + x) * 4 + 3] ?? 0;
          if (alpha > primaryAlpha || (
            alpha === primaryAlpha
            && Math.abs(y - expectedCenterY) < Math.abs(primaryY - expectedCenterY)
          )) {
            primaryAlpha = alpha;
            primaryY = y;
          }
        }
        let secondaryY = -1;
        let secondaryAlpha = 0;
        for (let y = searchStart; y <= searchEnd; y += 1) {
          const alpha = pixels[(y * width + x) * 4 + 3] ?? 0;
          const previous = pixels[((y - 1) * width + x) * 4 + 3] ?? 0;
          const next = pixels[((y + 1) * width + x) * 4 + 3] ?? 0;
          const gap = Math.abs(y - primaryY);
          if (gap >= 5 && gap <= height * 0.035 && alpha >= previous && alpha > next && alpha > secondaryAlpha) {
            secondaryY = y;
            secondaryAlpha = alpha;
          }
        }
        if (primaryAlpha >= 220 && secondaryY >= 0 && secondaryAlpha >= 64) {
          doubleEdgeColumns += 1;
          strongestDoubleEdgeGapPx = Math.max(strongestDoubleEdgeGapPx, Math.abs(secondaryY - primaryY));
          strongestSecondEdgeAlpha = Math.max(strongestSecondEdgeAlpha, secondaryAlpha);
        }
      }
      return { doubleEdgeColumns, strongestDoubleEdgeGapPx, strongestSecondEdgeAlpha };
    })() : {};

    return {
      segment: expectedSegment,
      progress: Number.parseFloat(canvas.dataset.r4InkProgress ?? 'NaN'),
      width,
      height,
      readbackError,
      alphaPixels,
      opaquePixels,
      brightPixels,
      sparseBrightPixels,
      maxAlpha,
      maxLuminance,
      ...particleMorphology,
      ...horizontal
    };
  }, {
    expectedSegment: segment,
    inspectDoubleEdge: includeHorizontalDoubleEdge,
    inspectParticles: includeParticleMorphology
  });
}

async function readHeroTargetTextureOrientation(page: Page): Promise<HeroTextureOrientationWitness> {
  await page.waitForFunction(() => {
    const hero = document.querySelector<HTMLElement>('[data-r4-scene="hero"]');
    const canvas = hero?.querySelector<HTMLCanvasElement>('[data-hero-intro-ink-canvas]');
    const progress = Number.parseFloat(hero?.dataset.heroProgress ?? 'NaN');
    return canvas?.dataset.heroIntroInkActive === 'true'
      && canvas.dataset.r4InkRendererStatus === 'active'
      && progress >= 0.68
      && progress <= 0.82;
  }, undefined, { timeout: 15_000 });
  return page.evaluate(async () => {
    const hero = document.querySelector<HTMLElement>('[data-r4-scene="hero"]');
    const canvas = hero?.querySelector<HTMLCanvasElement>('[data-hero-intro-ink-canvas]');
    const image = hero?.querySelector<HTMLImageElement>('.r4-hero-scene__back');
    const gl = canvas?.getContext('webgl');
    if (!hero || !canvas || !image || !gl || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
      throw new Error('Hero target texture witness is unavailable');
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const source = document.createElement('canvas');
    source.width = image.naturalWidth;
    source.height = image.naturalHeight;
    const context = source.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Hero source image context is unavailable');
    context.drawImage(image, 0, 0);
    const sourcePixels = context.getImageData(0, 0, source.width, source.height).data;
    const mapUv = (x: number, y: number) => {
      const sceneAspect = canvas.width / Math.max(canvas.height, 1);
      const imageAspect = image.naturalWidth / Math.max(image.naturalHeight, 1);
      const uv = { x, y };
      if (sceneAspect > imageAspect) {
        uv.y = (uv.y - 0.5) * (imageAspect / sceneAspect) + 0.5;
      } else {
        uv.x = (uv.x - 0.5) * (sceneAspect / imageAspect) + 0.5;
      }
      return uv;
    };
    const sourceColor = (uv: { x: number; y: number }, verticallyInverted: boolean) => {
      const x = Math.max(0, Math.min(source.width - 1, Math.round(uv.x * (source.width - 1))));
      const sourceY = verticallyInverted ? uv.y : 1 - uv.y;
      const y = Math.max(0, Math.min(source.height - 1, Math.round(sourceY * (source.height - 1))));
      const offset = (y * source.width + x) * 4;
      return [sourcePixels[offset] ?? 0, sourcePixels[offset + 1] ?? 0, sourcePixels[offset + 2] ?? 0] as const;
    };
    const candidates = [0.3, 0.4, 0.5, 0.6, 0.7].flatMap((x) => (
      [0.3, 0.4, 0.5, 0.6, 0.7].map((y) => ({ x, y, uv: mapUv(x, y) }))
    ));
    const anchors = candidates
      .map((candidate) => {
        const matching = sourceColor(candidate.uv, false);
        const inverted = sourceColor(candidate.uv, true);
        const contrast = matching.reduce((sum, channel, index) => sum + Math.abs(channel - inverted[index]!), 0);
        return { ...candidate, matching, inverted, contrast };
      })
      .sort((left, right) => right.contrast - left.contrast)
      .slice(0, 12);
    let comparedSamples = 0;
    let minimumAlpha = 255;
    let matchingError = 0;
    let invertedError = 0;
    for (const anchor of anchors) {
      const pixel = new Uint8Array(4);
      gl.readPixels(
        Math.round(anchor.x * (canvas.width - 1)),
        Math.round(anchor.y * (canvas.height - 1)),
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixel
      );
      if ((pixel[3] ?? 0) < 245) continue;
      minimumAlpha = Math.min(minimumAlpha, pixel[3] ?? 0);
      matchingError += anchor.matching.reduce(
        (sum, channel, index) => sum + Math.abs(channel - (pixel[index] ?? 0)),
        0
      ) / 3;
      invertedError += anchor.inverted.reduce(
        (sum, channel, index) => sum + Math.abs(channel - (pixel[index] ?? 0)),
        0
      ) / 3;
      comparedSamples += 1;
    }
    return {
      progress: Number.parseFloat(hero.dataset.heroProgress ?? 'NaN'),
      comparedSamples,
      minimumAlpha,
      matchingOrientationMeanError: comparedSamples > 0 ? matchingError / comparedSamples : Number.POSITIVE_INFINITY,
      verticallyInvertedMeanError: comparedSamples > 0 ? invertedError / comparedSamples : Number.POSITIVE_INFINITY
    };
  });
}

async function startFrameSampling(page: Page, mode: InkSamplingMode = 'all'): Promise<void> {
  await page.evaluate((sampleMode) => {
    const intervals: number[] = [];
    let active = true;
    let previous: number | undefined = performance.now();
    const tick = (now: number) => {
      if (!active) return;
      const activeInk = (segment: string) => {
        const canvas = document.querySelector<HTMLCanvasElement>(
          `canvas[data-r4-ink-segment="${segment}"]`
        );
        return canvas?.dataset.r4InkActive === 'true'
          && canvas.dataset.r4InkRendererActive === 'true'
          && canvas.dataset.r4InkRendererStatus === 'active'
          && canvas.width > 0
          && canvas.height > 0;
      };
      // Cold-path samplers start immediately before their first gesture so the
      // first compositor interval is part of the evidence, not a blind spot
      // before the Ink canvas becomes active.
      const shouldSample = sampleMode === 'all'
        || sampleMode === 'hero-pattern'
        || (sampleMode === 'figure3-tail' && (() => {
          const source = document.querySelector<HTMLElement>('[data-r4-scene="figure3-animation"]');
          const layer = source?.closest<HTMLElement>('[data-stage-layer]');
          return layer?.dataset.r4Transition === 'figure3-services-media'
            && Number(source?.dataset.figure3Progress ?? 0) >= 0.9;
        })())
        || (sampleMode === 'pattern-star-map' && activeInk('pattern-star-map'))
        || (sampleMode === 'figure2-depth' && activeInk('figure2-distance-expand'))
        || sampleMode === 'horizontal-ink';
      if (shouldSample) {
        if (previous !== undefined) intervals.push(now - previous);
        previous = now;
      } else {
        previous = undefined;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    (window as PerformanceWindow).__r5StopFrames = () => {
      active = false;
      return intervals;
    };
  }, mode);
}

async function stopFrameSampling(page: Page): Promise<number[]> {
  return page.evaluate(() => (window as PerformanceWindow).__r5StopFrames?.() ?? []);
}

async function pressFromCurrentHold(page: Page, key: 'PageDown' | 'PageUp'): Promise<void> {
  await page.keyboard.press(key);
}

test('LCP, frame pacing, memory, GPU surfaces, and dispose stay inside R5 budgets', async ({ page }, testInfo) => {
  test.skip(
    !['desktop-chromium', 'mobile-chromium'].includes(testInfo.project.name),
    'performance sampling is Chromium-only'
  );
  test.setTimeout(60_000);

  await page.addInitScript(() => {
    (window as PerformanceWindow).__r5Lcp = 0;
    new PerformanceObserver((list) => {
      const last = list.getEntries().at(-1);
      if (last) {
        const entry = last as PerformanceEntry & { element?: Element | null };
        (window as PerformanceWindow).__r5Lcp = last.startTime;
        (window as PerformanceWindow).__r5LcpElement = entry.element
          ? `${entry.element.tagName.toLowerCase()}.${entry.element.className}`
          : 'unknown';
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__storyApp?.snapshot().phase === 'hold');
  const runtimeReadyMs = await page.evaluate(() => performance.now());
  const heroTextureOrientation = await readHeroTargetTextureOrientation(page);
  await page.waitForFunction(() => window.__storyApp?.snapshot().presentationReady === true, undefined, {
    timeout: 15_000
  });
  const presentationReadyMs = await page.evaluate(() => performance.now());
  await page.waitForTimeout(1_200);
  const observedBootMetrics = await page.evaluate(() => {
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const memory = performance as Performance & { memory?: { usedJSHeapSize: number } };
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl');
    const rendererInfo = gl?.getExtension('WEBGL_debug_renderer_info');
    const gpuRenderer = gl
      ? String(rendererInfo
        ? gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER))
      : 'unavailable';
    return {
      lcpMs: (window as PerformanceWindow).__r5Lcp ?? 0,
      lcpElement: (window as PerformanceWindow).__r5LcpElement ?? 'unknown',
      initialResourceBytes: resources.reduce(
        (sum, entry) => sum + (entry.transferSize || entry.encodedBodySize || 0),
        0
      ),
      usedJsHeapBytes: memory.memory?.usedJSHeapSize,
      gpuRenderer
    };
  });
  const bootMetrics = {
    ...observedBootMetrics,
    runtimeReadyMs,
    presentationReadyMs
  };
  const idleFrameIntervals = await page.evaluate(() => new Promise<number[]>((resolve) => {
    const intervals: number[] = [];
    const startedAt = performance.now();
    let previous = startedAt;
    const tick = (now: number) => {
      intervals.push(now - previous);
      previous = now;
      if (now - startedAt >= 1_000) {
        resolve(intervals);
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
  const idlePlayback = summarizeFrames(idleFrameIntervals);

  await startFrameSampling(page, 'hero-pattern');
  const heroStartedAt = Date.now();
  await pressFromCurrentHold(page, 'PageDown');
  await page.waitForFunction(() => {
    const hero = document.querySelector<HTMLElement>('[data-r4-scene="hero"]');
    return Number.parseFloat(
      hero?.style.getPropertyValue('--r4-hero-pattern-figure-progress') ?? '0'
    ) > 0.01;
  });
  const heroFirstVisualMs = Date.now() - heroStartedAt;
  const heroPatternWitness = await waitForLiveInk(page, 'hero-pattern', { min: 0.46, max: 0.56 });
  const heroPatternPixels = await readInkPixels(page, 'hero-pattern', false, true);
  await waitForHold(page, 'pattern');
  const heroPatternIntervals = await stopFrameSampling(page);

  await pressFromCurrentHold(page, 'PageDown');
  await page.waitForFunction(() => window.__storyApp?.snapshot().phase === 'staged-paused');
  await pressFromCurrentHold(page, 'PageDown');
  const patternStarMapWitness = await waitForLiveInk(page, 'pattern-star-map', { min: 0.46, max: 0.56 });
  await startFrameSampling(page, 'pattern-star-map');
  await waitForHold(page, 'star-map');
  const patternStarMapIntervals = await stopFrameSampling(page);
  const inkWitnesses = {
    heroPattern: heroPatternWitness,
    patternStarMap: patternStarMapWitness
  };
  const frameIntervals = [...heroPatternIntervals, ...patternStarMapIntervals];
  const playback = summarizeFrames(frameIntervals);

  await navigateStory(page, 'figure3-animation');
  await startFrameSampling(page, 'figure3-tail');
  expect((await moveOneHold(page, 1)).current).toBe('services');
  const figure3TailIntervals = await stopFrameSampling(page);
  const figure3Tail = summarizeFrames(figure3TailIntervals);

  await bootStory(page, '/#method');
  await pressFromCurrentHold(page, 'PageDown');
  await waitForHold(page, 'method-bottom');
  await reachReadingEdge(page, 1);
  const figure2OpeningFrame = page.locator('[data-r4-scene="figure2-animation"]');
  await expect(figure2OpeningFrame).toHaveAttribute('data-figure2-hold-frame-ready', 'true');
  await startFrameSampling(page, 'horizontal-ink');
  const methodStartedAt = Date.now();
  await pressFromCurrentHold(page, 'PageDown');
  const methodFigure2Witness = await waitForLiveInk(page, 'method-bottom-figure2', { min: 0.03, max: 0.20 });
  const methodFirstVisualMs = Date.now() - methodStartedAt;
  await waitForHold(page, 'figure2-animation');
  const methodFigure2Intervals = await stopFrameSampling(page);

  await navigateStory(page, 'contact');
  await page.waitForTimeout(250);
  const disposed = await storySnapshot(page);
  const finalHeap = await page.evaluate(() => {
    const memory = performance as Performance & { memory?: { usedJSHeapSize: number } };
    return memory.memory?.usedJSHeapSize;
  });

  const report = {
    boot: bootMetrics,
    idlePlayback,
    playback,
    playbackSegments: {
      heroPattern: summarizeFrames(heroPatternIntervals),
      patternStarMap: summarizeFrames(patternStarMapIntervals),
      figure3Tail
    },
    coldStart: {
      heroPattern: {
        firstVisualMs: heroFirstVisualMs,
        frames: summarizeFrames(heroPatternIntervals)
      },
      methodFigure2: {
        firstVisualMs: methodFirstVisualMs,
        frames: summarizeFrames(methodFigure2Intervals)
      }
    },
    inkWitnesses,
    coldStartWitnesses: {
      methodFigure2: methodFigure2Witness
    },
    visualPixels: {
      heroTextureOrientation,
      heroPatternParticles: heroPatternPixels
    },
    dispose: disposed,
    finalHeapBytes: finalHeap
  };
  console.log(`R5_RUNTIME_PERFORMANCE ${JSON.stringify(report)}`);
  await testInfo.attach('r5-runtime-performance.json', {
    body: Buffer.from(JSON.stringify(report, null, 2)),
    contentType: 'application/json'
  });

  expect(bootMetrics.lcpMs).toBeGreaterThan(0);
  expect(bootMetrics.lcpMs).toBeLessThanOrEqual(2_500);
  expect(runtimeReadyMs).toBeLessThanOrEqual(
    testInfo.project.name.startsWith('mobile-') ? 4_000 : 2_500
  );
  expect(presentationReadyMs).toBeLessThanOrEqual(
    testInfo.project.name.startsWith('mobile-') ? 11_000 : 9_500
  );
  expect(bootMetrics.initialResourceBytes).toBeLessThanOrEqual(40 * 1024 * 1024);
  for (const witness of Object.values(inkWitnesses)) {
    expect(witness.rendererStatus).toBe('active');
    expect(witness.width).toBeGreaterThan(0);
    expect(witness.height).toBeGreaterThan(0);
    expect(witness.opacity).toBeGreaterThan(0.002);
    expect(witness.visible).toBe(true);
    expect(witness.progress).toBeGreaterThan(0.45);
    expect(witness.progress).toBeLessThan(0.57);
  }
  expect(heroTextureOrientation.comparedSamples).toBeGreaterThanOrEqual(8);
  expect(heroTextureOrientation.minimumAlpha).toBeGreaterThanOrEqual(245);
  expect(heroTextureOrientation.matchingOrientationMeanError).toBeLessThan(32);
  expect(heroTextureOrientation.verticallyInvertedMeanError).toBeGreaterThan(
    heroTextureOrientation.matchingOrientationMeanError + 8
  );
  expect(heroPatternPixels.readbackError).toBe(0);
  expect(heroPatternPixels.alphaPixels).toBeGreaterThan(0);
  expect(heroPatternPixels.brightPixels).toBeGreaterThan(0);
  expect(
    heroPatternPixels.sparseBrightPixels / (heroPatternPixels.width * heroPatternPixels.height),
    'hero particle-density pixels'
  ).toBeGreaterThan(0.000_01);
  expect(
    heroPatternPixels.brightPixels / (heroPatternPixels.width * heroPatternPixels.height),
    'hero particle-density ceiling'
  ).toBeLessThan(0.04);
  expect(
    heroPatternPixels.compactSquareSpatterComponents,
    'hero compact square-spatter components'
  ).toBeGreaterThanOrEqual(4);
  expect(
    heroPatternPixels.compactSquareSpatterPixels,
    'hero compact square-spatter pixels'
  ).toBeGreaterThanOrEqual(16);
  if (bootMetrics.usedJsHeapBytes !== undefined) {
    expect(bootMetrics.usedJsHeapBytes).toBeLessThanOrEqual(160 * 1024 * 1024);
  }
  const softwareRenderer = /swiftshader|llvmpipe|software/i.test(bootMetrics.gpuRenderer);
  const hardwareP95BudgetMs = testInfo.project.name.startsWith('mobile-') ? 34 : 20;
  const coldFirstVisualBudgetMs = testInfo.project.name.startsWith('mobile-') ? 120 : 80;
  expect(frameIntervals.length).toBeGreaterThan(30);
  for (const [name, intervals] of Object.entries({
    heroPattern: heroPatternIntervals,
    patternStarMap: patternStarMapIntervals,
    figure3Tail: figure3TailIntervals
  })) {
    const sample = summarizeFrames(intervals);
    expect(sample.samples, `${name} sample count`).toBeGreaterThan(15);
    expect(sample.p95FrameIntervalMs, `${name} p95`).toBeLessThanOrEqual(
      softwareRenderer ? 300 : hardwareP95BudgetMs
    );
    expect(sample.longFrameRatio, `${name} long-frame ratio`).toBeLessThan(
      softwareRenderer ? 0.25 : 0.01
    );
    expect(
      sample.longFrameIndices.some((index) => sample.longFrameIndices.includes(index + 1)),
      `${name} consecutive long frames`
    ).toBe(false);
  }
  for (const [name, path] of Object.entries(report.coldStart)) {
    expect(path.frames.samples, `${name} cold sample count`).toBeGreaterThan(15);
    if (!softwareRenderer) {
      expect(path.firstVisualMs, `${name} cold first visual`).toBeLessThanOrEqual(coldFirstVisualBudgetMs);
      expect(path.frames.longFrameRatio, `${name} cold long-frame ratio`).toBeLessThan(0.01);
      expect(
        path.frames.longFrameIndices.some((index) => path.frames.longFrameIndices.includes(index + 1)),
        `${name} cold consecutive long frames`
      ).toBe(false);
    }
  }
  expect(methodFigure2Witness.rendererStatus, 'method Figure2 cold renderer').toBe('active');
  expect(methodFigure2Witness.visible, 'method Figure2 cold Ink visibility').toBe(true);
  expect(methodFigure2Witness.progress, 'method Figure2 cold Ink progress').toBeGreaterThanOrEqual(0.03);
  expect(methodFigure2Witness.progress, 'method Figure2 cold Ink progress').toBeLessThanOrEqual(0.20);
  expect(disposed.mountedLayers).toBeLessThanOrEqual(3);
  expect(disposed.webglCanvases).toBeLessThanOrEqual(1);
  expect(disposed.videos).toBeLessThanOrEqual(4);
  expect(disposed.lifecycle.releasedCanvases).toBeGreaterThanOrEqual(1);
  expect(disposed.lifecycle.releasedVideos).toBeGreaterThanOrEqual(1);
  if (finalHeap !== undefined) {
    expect(finalHeap).toBeLessThanOrEqual(192 * 1024 * 1024);
  }
  expect(disposed.lastError).toBeUndefined();
});

test('focused media and horizontal Ink paths separate first decode from steady frame pacing', async ({ page }, testInfo) => {
  test.skip(
    !['desktop-chromium', 'mobile-chromium'].includes(testInfo.project.name),
    'focused frame sampling is Chromium-only'
  );
  test.setTimeout(120_000);

  await bootStory(page, '/#ttg-animation');
  let startedAt = Date.now();
  await pressFromCurrentHold(page, 'PageDown');
  await page.waitForFunction(() => {
    const scene = document.querySelector<HTMLElement>('[data-r4-scene="ttg-animation"]');
    const video = scene?.querySelector<HTMLVideoElement>('[data-ttg-figure-video]');
    return scene?.dataset.ttgPlaybackDirection === '1'
      && video?.dataset.timelineVideoFrameReady === 'true'
      && !video.paused
      && video.currentTime > 0.05;
  });
  const ttgForwardFirstDecodeMs = Date.now() - startedAt;
  await startFrameSampling(page);
  await waitForHold(page, 'lab');
  const ttgForwardFrames = await stopFrameSampling(page);

  startedAt = Date.now();
  await pressFromCurrentHold(page, 'PageUp');
  await page.waitForFunction(() => {
    const scene = document.querySelector<HTMLElement>('[data-r4-scene="ttg-animation"]');
    const video = scene?.querySelector<HTMLVideoElement>('[data-ttg-figure-video]');
    return scene?.dataset.ttgPlaybackDirection === '-1'
      && video?.dataset.timelineVideoFrameReady === 'true'
      && video.currentTime > 0.05;
  });
  const ttgSameRunReverseFirstDecodeMs = Date.now() - startedAt;
  await startFrameSampling(page);
  await waitForHold(page, 'ttg-animation');
  const ttgSameRunReverseFrames = await stopFrameSampling(page);

  await bootStory(page, '/#figure2-proof-opening');
  startedAt = Date.now();
  await pressFromCurrentHold(page, 'PageUp');
  await page.waitForFunction(() => {
    const reverse = document.querySelector<HTMLVideoElement>('[data-figure2-combined-video]');
    return reverse?.dataset.timelineVideoDirection === '-1'
      && reverse.dataset.timelineVideoFrameReady === 'true'
      && reverse.currentTime >= 2.6
      && reverse.currentTime <= 5.2;
  });
  const figure2ReverseFirstDecodeMs = Date.now() - startedAt;
  await waitForHold(page, 'figure2-animation');
  // The first reverse is only the direction-specific media preparation
  // measurement. Re-arm the same path with warm surfaces so the interval
  // window describes steady Ink pacing, not a cold decoder hitch.
  await pressFromCurrentHold(page, 'PageDown');
  await waitForHold(page, 'figure2-proof');
  const figure2DepthWitness = waitForLiveInk(page, 'figure2-distance-expand');
  await startFrameSampling(page, 'figure2-depth');
  await pressFromCurrentHold(page, 'PageUp');
  await waitForHold(page, 'figure2-animation');
  const figure2ReverseFrames = await stopFrameSampling(page);

  await bootStory(page, '/#method');
  startedAt = Date.now();
  await pressFromCurrentHold(page, 'PageUp');
  await page.waitForFunction(() => {
    const video = document.querySelector<HTMLVideoElement>('[data-aod-figure-video]');
    return window.__storyApp?.snapshot().phase === 'playing'
      && Boolean(video)
      && Number.isFinite(video?.duration)
      && (video?.currentTime ?? 0) > 0.05
      && (video?.currentTime ?? 0) < (video?.duration ?? 0) - 0.05;
  });
  const aodReverseFirstDecodeMs = Date.now() - startedAt;
  await startFrameSampling(page);
  await waitForHold(page, 'aod-animation');
  const aodReverseFrames = await stopFrameSampling(page);

  await bootStory(page, '/#services');
  await reachReadingEdge(page, 1);
  startedAt = Date.now();
  await pressFromCurrentHold(page, 'PageDown');
  const firstHorizontalInkWitness = await waitForLiveInk(page, 'services-ttg', { min: 0.46, max: 0.56 });
  const horizontalInkActivationMs = Date.now() - startedAt;
  await waitForHold(page, 'ttg-animation');
  // As with Figure2, activation remains a separate cold-path measurement.
  // Measure the re-armed Services→TTG Ink path after the receiver media and
  // horizontal renderer have both completed one presentation.
  await pressFromCurrentHold(page, 'PageUp');
  await page.waitForFunction(() => {
    const snapshot = window.__storyApp?.snapshot();
    return snapshot?.phase === 'hold' && snapshot.current === 'services';
  });
  await reachReadingEdge(page, 1);
  await pressFromCurrentHold(page, 'PageDown');
  const horizontalInkWitness = await waitForLiveInk(page, 'services-ttg', { min: 0.46, max: 0.56 });
  const horizontalInkPixels = await readInkPixels(page, 'services-ttg', true);
  await startFrameSampling(page, 'horizontal-ink');
  await waitForHold(page, 'ttg-animation');
  const horizontalInkFrames = await stopFrameSampling(page);

  const paths = {
    ttgFirstForward: {
      firstDecodeMs: ttgForwardFirstDecodeMs,
      steady: summarizeFrames(ttgForwardFrames)
    },
    ttgSameRunReverse: {
      firstDecodeMs: ttgSameRunReverseFirstDecodeMs,
      steady: summarizeFrames(ttgSameRunReverseFrames)
    },
    figure2TimelineReverse: {
      firstDecodeMs: figure2ReverseFirstDecodeMs,
      steady: summarizeFrames(figure2ReverseFrames),
      inkWitness: await figure2DepthWitness
    },
    aodReverse: {
      firstDecodeMs: aodReverseFirstDecodeMs,
      steady: summarizeFrames(aodReverseFrames)
    },
    horizontalInk: {
      activationMs: horizontalInkActivationMs,
      steady: summarizeFrames(horizontalInkFrames),
      inkWitness: horizontalInkWitness,
      pixelWitness: horizontalInkPixels
    }
  };
  const report = {
    ...paths,
    aggregate: summarizeFrames([
      ...ttgForwardFrames,
      ...ttgSameRunReverseFrames,
      ...figure2ReverseFrames,
      ...aodReverseFrames,
      ...horizontalInkFrames
    ])
  };
  console.log(`R5_FOCUSED_FRAME_PERFORMANCE ${JSON.stringify(report)}`);
  await testInfo.attach('r5-focused-frame-performance.json', {
    body: Buffer.from(JSON.stringify(report, null, 2)),
    contentType: 'application/json'
  });

  const p95BudgetMs = testInfo.project.name.startsWith('mobile-') ? 34 : 20;
  for (const [name, sample] of Object.entries(paths)) {
    const delay = 'firstDecodeMs' in sample ? sample.firstDecodeMs : sample.activationMs;
    expect(delay, `${name} preparation/activation delay`).toBeLessThan(10_000);
    expect(sample.steady.samples, `${name} steady sample count`).toBeGreaterThan(15);
    expect(sample.steady.p95FrameIntervalMs, `${name} steady p95`).toBeLessThanOrEqual(p95BudgetMs);
    if ('inkWitness' in sample) {
      expect(sample.inkWitness.rendererStatus, `${name} renderer`).toBe('active');
      expect(sample.inkWitness.opacity, `${name} visible ink`).toBeGreaterThan(0.002);
    }
    if ('pixelWitness' in sample) {
      expect(sample.pixelWitness.progress, `${name} fixed progress`).toBeGreaterThan(0.45);
      expect(sample.pixelWitness.progress, `${name} fixed progress`).toBeLessThan(0.57);
    }
    expect(sample.steady.longFrameRatio, `${name} steady long-frame ratio`).toBeLessThan(
      0.01
    );
    expect(
      sample.steady.longFrameIndices.some((index) => sample.steady.longFrameIndices.includes(index + 1)),
      `${name} consecutive steady long frames`
    ).toBe(false);
  }
  expect(firstHorizontalInkWitness.rendererStatus, 'first horizontal renderer').toBe('active');
  expect(horizontalInkPixels.readbackError, 'horizontal pixel readback').toBe(0);
  expect(horizontalInkPixels.alphaPixels, 'horizontal alpha coverage').toBeGreaterThan(0);
  expect(horizontalInkPixels.brightPixels, 'horizontal bright coverage').toBeGreaterThan(0);
  // The secondary crest is read from the presented WebGL framebuffer while the
  // handoff is near its midpoint, rather than inferred from shader attributes.
  expect(horizontalInkPixels.doubleEdgeColumns, 'horizontal secondary-edge columns').toBeGreaterThanOrEqual(8);
  expect(horizontalInkPixels.strongestDoubleEdgeGapPx, 'horizontal secondary-edge gap').toBeGreaterThanOrEqual(5);
  expect(horizontalInkPixels.strongestDoubleEdgeGapPx, 'horizontal secondary-edge gap bound').toBeLessThanOrEqual(
    Math.ceil(horizontalInkPixels.height * 0.035)
  );
  expect(horizontalInkPixels.strongestSecondEdgeAlpha, 'horizontal secondary-edge alpha').toBeGreaterThanOrEqual(64);
  expect(report.aggregate.longFrameRatio, 'focused aggregate long-frame ratio').toBeLessThan(
    0.01
  );
  expect((await storySnapshot(page)).lastError).toBeUndefined();
});
