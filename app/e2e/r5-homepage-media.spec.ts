import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { bootStory } from './r5-helpers';
import {
  assertSinglePhoneAuthority,
  waitForDirectEntryCommit
} from './r5-phone-clean-assertions';

const repoDir = resolve(process.cwd(), '..');
const inventoryPath = resolve(repoDir, 'dist', 'homepage-media-inventory.json');
const batchCWebpPairs = [
  ['assets/middle1_depth.png', 'assets/middle1_depth.webp', 'semantic'],
  ['assets/back2.png', 'assets/back2.webp', 'presentation'],
  ['assets/figure2-middle-depth.png', 'assets/figure2-middle-depth.webp', 'semantic'],
  ['assets/figure2-middle-window-mask.png', 'assets/figure2-middle-window-mask.webp', 'semantic'],
  ['assets/aod_cloud-alpha.png', 'assets/aod_cloud-alpha.webp', 'presentation'],
  ['assets/aod_sun-alpha.png', 'assets/aod_sun-alpha.webp', 'presentation'],
  ['assets/ph_background.png', 'assets/ph_background.webp', 'presentation'],
  ['assets/ph_front-alpha.png', 'assets/ph_front-alpha.webp', 'presentation'],
  ['assets/crane1_cloud2-alpha.png', 'assets/crane1_cloud2-alpha.webp', 'presentation'],
  ['assets/crane1_arch-alpha.png', 'assets/crane1_arch-alpha.webp', 'presentation'],
  ['assets/crane1_cloud1-alpha.png', 'assets/crane1_cloud1-alpha.webp', 'presentation'],
  ['assets/crane1_cloud-front2-alpha.png', 'assets/crane1_cloud-front2-alpha.webp', 'presentation'],
  ['assets/patterns/alpha-layers/pattern-layer-alpha-02.png', 'assets/patterns/alpha-layers/pattern-layer-alpha-02.webp', 'presentation'],
  ['assets/patterns/alpha-layers/pattern-layer-alpha-03.png', 'assets/patterns/alpha-layers/pattern-layer-alpha-03.webp', 'presentation'],
  ['assets/patterns/alpha-layers/pattern-layer-alpha-04.png', 'assets/patterns/alpha-layers/pattern-layer-alpha-04.webp', 'presentation'],
  ['assets/patterns/alpha-layers/pattern-layer-alpha-05.png', 'assets/patterns/alpha-layers/pattern-layer-alpha-05.webp', 'presentation'],
  ['assets/patterns/alpha-layers/pattern-layer-alpha-06.png', 'assets/patterns/alpha-layers/pattern-layer-alpha-06.webp', 'presentation']
] as const;

type HomepageMediaInventory = Readonly<{
  inventory: readonly Readonly<{
    source: string;
    emittedPath: string;
  }>[];
}>;

let cleanMediaDocumentSequence = 0;

async function fileExists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function webpEmittedPaths(): Promise<ReadonlyMap<string, string>> {
  const inventory = JSON.parse(await readFile(inventoryPath, 'utf8')) as HomepageMediaInventory;
  return new Map(inventory.inventory
    .filter(({ source }) => batchCWebpPairs.some(([, output]) => output === source))
    .map(({ source, emittedPath }) => [source, emittedPath]));
}

async function decodedMask(page: Page, selector: string): Promise<Readonly<{
  maskImage: string;
  maskMode: string;
  naturalWidth: number;
  naturalHeight: number;
}>> {
  return page.locator(selector).evaluate(async (element) => {
    const style = getComputedStyle(element);
    const maskImage = style.getPropertyValue('mask-image')
      || style.getPropertyValue('-webkit-mask-image');
    const resource = maskImage.match(/url\(["']?([^"')]+)["']?\)/)?.[1];
    if (!resource) {
      throw new Error(`CSS mask URL unavailable: ${maskImage}`);
    }
    const image = new Image();
    image.src = resource;
    await image.decode();
    return {
      maskImage,
      maskMode: style.getPropertyValue('mask-mode')
        || style.getPropertyValue('-webkit-mask-mode'),
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight
    };
  });
}

async function bootCleanMediaEntry(page: Page, scene: string): Promise<void> {
  cleanMediaDocumentSequence += 1;
  await page.goto(`/?r5-media-entry=${cleanMediaDocumentSequence}#${scene}`, {
    waitUntil: 'domcontentloaded'
  });
  await waitForDirectEntryCommit(page, scene, 0);
  await assertSinglePhoneAuthority(page);
}

test('Hero clean entry owns one packed-alpha figure surface and a decoded poster', async ({ page }) => {
  await bootCleanMediaEntry(page, 'hero');
  const scene = page.locator('[data-phone-plane="source"] .portrait-scroll-spike__scene--hero');
  await expect(scene.locator('[data-portrait-figure-video]')).toHaveCount(1);
  await expect(scene.locator('[data-portrait-figure-canvas]')).toHaveCount(1);
  await expect(scene.locator('[data-portrait-figure-poster]')).toHaveCount(1);
  await expect(scene).toHaveAttribute('data-phone-hero-images', 'decoded');
  const state = await scene.evaluate((root) => {
    const video = root.querySelector<HTMLVideoElement>('[data-portrait-figure-video]');
    const poster = root.querySelector<HTMLImageElement>('[data-portrait-figure-poster]');
    return {
      preload: video?.preload,
      source: video?.currentSrc || video?.src,
      poster: poster?.currentSrc || poster?.src,
      posterDecoded: Boolean(poster?.complete && poster.naturalWidth > 0)
    };
  });
  expect(state.preload).toBe('auto');
  expect(state.source).toMatch(/figure1-rgb-alpha-[^/]+\.mp4$/);
  expect(state.poster).toMatch(/hero-figure-poster-[^/]+\.webp$/);
  expect(state.posterDecoded).toBe(true);
});

test('clean direct media entries expose exactly the seven canonical physical video keys', async ({ page }) => {
  const cases = [
    { scene: 'figure2-animation', keys: ['figure2-pair-motion'] },
    { scene: 'ttg-animation', keys: ['ttg-figure-motion'] },
    { scene: 'ph-animation', keys: ['ph-figure-motion'] },
    { scene: 'aod-animation', keys: ['aod-figure-motion'] },
    { scene: 'figure3-animation', keys: ['figure3-motion'] },
    { scene: 'crane-animation', keys: ['crane-figure-motion', 'crane-flock-motion'] }
  ] as const;

  for (const entry of cases) {
    await bootCleanMediaEntry(page, entry.scene);
    const videos = await page.locator('.phone-story video[data-media-key]')
      .evaluateAll((elements) => elements.map((element) => {
      const video = element as HTMLVideoElement;
      return { key: video.dataset.mediaKey, source: video.currentSrc || video.src };
      }));
    expect(videos.map(({ key }) => key)).toEqual(entry.keys);
    expect(videos.every(({ source }) => /\.(?:webm|mp4)(?:$|\?)/.test(source))).toBe(true);
  }
});

test('iPhone and iPad WebKit keep decoded HEVC fallbacks and explicit packed policies', async ({ page }) => {
  const cases = [
    { scene: 'ttg-animation', media: ['ttg-figure-motion'], policy: 'decoded' },
    { scene: 'ph-animation', media: ['ph-figure-motion'], policy: 'packed' },
    { scene: 'figure3-animation', media: ['figure3-motion'], policy: 'decoded' },
    {
      scene: 'crane-animation',
      media: ['crane-figure-motion', 'crane-flock-motion'],
      policy: 'packed'
    }
  ] as const;

  for (const entry of cases) {
    await bootCleanMediaEntry(page, entry.scene);
    const videos = page.locator('.phone-story video[data-media-key]');
    await expect(videos).toHaveCount(entry.media.length);
    for (const [index, filename] of entry.media.entries()) {
      const video = videos.nth(index);
      const sources = await video.locator('source').evaluateAll((elements) => elements.map((element) => ({
        format: element.getAttribute('data-alpha-video-format'),
        source: (element as HTMLSourceElement).src,
        type: element.getAttribute('type')
      })));
      if (entry.policy === 'packed') {
        expect(sources.map(({ format }) => format)).toEqual(['packed']);
        expect(sources[0]?.source).toMatch(
          new RegExp(`${filename}-rgb-alpha-[^/]+\\.mp4$`)
        );
        continue;
      }
      expect(sources.map(({ format }) => format)).toEqual(['hevc', 'webm']);
      expect(sources[0]).toMatchObject({
        format: 'hevc',
        type: 'video/mp4; codecs="hvc1"'
      });
      expect(sources[0]?.source).toMatch(new RegExp(`${filename}-hevc-alpha-[^/]+\\.mp4$`));
      expect(sources[1]).toMatchObject({
        format: 'webm',
        type: 'video/webm; codecs="vp9"'
      });
      expect(sources[1]?.source).toMatch(new RegExp(`${filename}-[^/]+\\.webm$`));
      await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentSrc))
        .toMatch(new RegExp(`${filename}-hevc-alpha-[^/]+\\.mp4$`));
    }
  }
});

test('iPhone WebKit decodes a clean HEVC alpha frame with a live alpha plane', async ({ page }) => {
  await bootCleanMediaEntry(page, 'ttg-animation');
  const result = await page.locator(
    '[data-phone-plane="source"] [data-r4-scene="ttg-animation"] [data-ttg-figure-video]'
  )
    .evaluate(async (video: HTMLVideoElement) => {
      const waitFor = (event: keyof HTMLMediaElementEventMap, timeoutMs = 15_000) => new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          video.removeEventListener(event, onEvent);
          reject(new Error(`video ${event} timed out`));
        }, timeoutMs);
        const onEvent = () => {
          window.clearTimeout(timeout);
          resolve();
        };
        video.addEventListener(event, onEvent, { once: true });
      });

      video.preload = 'auto';
      video.load();
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        await waitFor('loadeddata');
      }
      const targetTime = Math.min(0.5, Math.max(0, video.duration - 0.05));
      if (Math.abs(video.currentTime - targetTime) > 0.001) {
        video.currentTime = targetTime;
        await waitFor('seeked');
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

      const canvas = document.createElement('canvas');
      canvas.width = 180;
      canvas.height = 320;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) {
        throw new Error('2D canvas unavailable');
      }
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let minAlpha = 255;
      let maxAlpha = 0;
      let transparentPixels = 0;
      let partialPixels = 0;
      for (let offset = 3; offset < pixels.length; offset += 4) {
        const alpha = pixels[offset] ?? 0;
        minAlpha = Math.min(minAlpha, alpha);
        maxAlpha = Math.max(maxAlpha, alpha);
        if (alpha <= 16) transparentPixels += 1;
        if (alpha > 16 && alpha < 240) partialPixels += 1;
      }
      const totalPixels = canvas.width * canvas.height;
      return {
        currentSrc: video.currentSrc,
        readyState: video.readyState,
        minAlpha,
        maxAlpha,
        transparentRatio: transparentPixels / totalPixels,
        partialRatio: partialPixels / totalPixels
      };
    });

  expect(result.currentSrc).toMatch(/ttg-figure-motion-hevc-alpha-[^/]+\.mp4$/);
  expect(result.readyState).toBeGreaterThanOrEqual(2);
  expect(result.minAlpha).toBeLessThanOrEqual(16);
  expect(result.maxAlpha).toBeGreaterThanOrEqual(240);
  expect(result.transparentRatio).toBeGreaterThan(0.05);
  expect(result.partialRatio).toBeGreaterThan(0);
});

test('Batch C WebP browser decode remains valid after presentation recompression', async ({ page }) => {
  const sourcePresence = await Promise.all(batchCWebpPairs.map(([source]) => fileExists(resolve(repoDir, source))));
  const retainedPngsPresent = sourcePresence.every(Boolean);
  expect(sourcePresence.every(Boolean) || sourcePresence.every((present) => !present)).toBe(true);

  await page.route('**/__batch-c-webp/**', async (route) => {
    const match = new URL(route.request().url()).pathname.match(/\/__batch-c-webp\/(png|webp)\/(\d+)$/);
    const kind = match?.[1];
    const index = Number(match?.[2]);
    const pair = batchCWebpPairs[index];
    if (!pair || (kind !== 'png' && kind !== 'webp')) {
      await route.abort('failed');
      return;
    }
    const asset = kind === 'png' ? pair[0] : pair[1];
    await route.fulfill({
      status: 200,
      contentType: kind === 'png' ? 'image/png' : 'image/webp',
      body: await readFile(resolve(repoDir, asset))
    });
  });
  await page.goto('/?presentation=direct', { waitUntil: 'domcontentloaded' });

  for (const [index, [source, output, fidelity]] of batchCWebpPairs.entries()) {
    const result = await page.evaluate(async ({ sourceUrl, outputUrl }) => {
      const decodeElement = async (url: string) => {
        const image = new Image();
        image.src = url;
        await image.decode();
        return image;
      };
      const decodeBitmap = async (url: string) => createImageBitmap(
        await (await fetch(url)).blob(),
        { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }
      );
      const outputImage = await decodeElement(outputUrl);
      if (!sourceUrl) {
        return {
          naturalWidth: outputImage.naturalWidth,
          naturalHeight: outputImage.naturalHeight,
          rgbaEqual: null,
          rgbaMismatchIndex: -1,
          alphaEqual: null,
          alphaMismatchIndex: -1
        };
      }
      const [sourceImage, outputBitmap] = await Promise.all([
        decodeBitmap(sourceUrl),
        decodeBitmap(outputUrl)
      ]);
      if (
        sourceImage.width !== outputBitmap.width
        || sourceImage.height !== outputBitmap.height
      ) {
        sourceImage.close();
        outputBitmap.close();
        return {
          naturalWidth: outputImage.naturalWidth,
          naturalHeight: outputImage.naturalHeight,
          rgbaEqual: false,
          rgbaMismatchIndex: -1,
          alphaEqual: false,
          alphaMismatchIndex: -1
        };
      }
      const canvas = document.createElement('canvas');
      canvas.width = sourceImage.width;
      canvas.height = sourceImage.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) {
        throw new Error('2D canvas unavailable');
      }
      context.drawImage(sourceImage, 0, 0);
      const sourcePixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(outputBitmap, 0, 0);
      const outputPixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let rgbaMismatchIndex = -1;
      for (let offset = 0; offset < sourcePixels.length; offset += 1) {
        if (sourcePixels[offset] !== outputPixels[offset]) {
          rgbaMismatchIndex = offset;
          break;
        }
      }
      let alphaMismatchIndex = -1;
      for (let offset = 3; offset < sourcePixels.length; offset += 4) {
        if (sourcePixels[offset] !== outputPixels[offset]) {
          alphaMismatchIndex = offset;
          break;
        }
      }
      sourceImage.close();
      outputBitmap.close();
      return {
        naturalWidth: outputImage.naturalWidth,
        naturalHeight: outputImage.naturalHeight,
        rgbaEqual: rgbaMismatchIndex === -1,
        rgbaMismatchIndex,
        alphaEqual: alphaMismatchIndex === -1,
        alphaMismatchIndex
      };
    }, {
      sourceUrl: retainedPngsPresent ? `/__batch-c-webp/png/${index}` : '',
      outputUrl: `/__batch-c-webp/webp/${index}`
    });
    expect(result.naturalWidth, output).toBeGreaterThan(0);
    expect(result.naturalHeight, output).toBeGreaterThan(0);
    if (retainedPngsPresent) {
      if (fidelity === 'semantic') {
        expect(
          result.rgbaEqual,
          `${source} -> ${output}; RGBA mismatch byte ${result.rgbaMismatchIndex}`
        ).toBe(true);
      } else {
        expect(
          result.alphaEqual,
          `${source} -> ${output}; Alpha mismatch byte ${result.alphaMismatchIndex}`
        ).toBe(true);
      }
    }
  }

  const emittedBySource = await webpEmittedPaths();
  expect(emittedBySource.size).toBe(batchCWebpPairs.length);
  const emittedDecode = await page.evaluate(async (urls) => Promise.all(urls.map(async (url) => {
    const image = new Image();
    image.src = url;
    await image.decode();
    return { url, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight };
  })), batchCWebpPairs.map(([, output]) => `/${emittedBySource.get(output) ?? ''}`));
  for (const decoded of emittedDecode) {
    expect(decoded.naturalWidth, decoded.url).toBeGreaterThan(0);
    expect(decoded.naturalHeight, decoded.url).toBeGreaterThan(0);
  }
});

test('Batch C runtime loads WebP depth, mask, and Pattern layers without PNG requests', async ({ page }) => {
  const emittedBySource = await webpEmittedPaths();
  expect(emittedBySource.size).toBe(batchCWebpPairs.length);
  const expectedPaths = new Set([...emittedBySource.values()].map((entry) => `/${entry}`));
  const requestedPaths: string[] = [];
  const responseStatuses = new Map<string, number>();
  const runtimeErrors: string[] = [];
  page.on('request', (request) => {
    requestedPaths.push(new URL(request.url()).pathname);
  });
  page.on('response', (response) => {
    responseStatuses.set(new URL(response.url()).pathname, response.status());
  });
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  await page.route('**/*', (route) => route.continue());

  await bootStory(page, '/?presentation=direct');
  const heroDepth = await decodedMask(page, '.r4-hero-scene__middle--depth');
  expect(heroDepth.maskImage).toMatch(/middle1_depth-[^/]+\.webp/);
  expect(heroDepth.maskMode).toContain('luminance');
  expect(heroDepth).toMatchObject({ naturalWidth: 1672, naturalHeight: 941 });

  await bootStory(page, '/?presentation=direct#pattern');
  const patternCanvas = page.locator('[data-r4-scene="pattern"] [data-pattern-canvas]');
  await expect(patternCanvas).toHaveAttribute('data-ink-texture-ready', 'true');
  await expect.poll(async () => Number(await patternCanvas.getAttribute('data-ink-texture-revision'))).toBeGreaterThan(0);
  const patternPaths = [...expectedPaths].filter((entry) => entry.includes('pattern-layer-alpha-'));
  await expect.poll(() => patternPaths.filter((entry) => requestedPaths.includes(entry)).length).toBe(5);
  expect(runtimeErrors).toEqual([]);

  for (const scene of ['star-map', 'aod-animation', 'ph-animation', 'crane-animation'] as const) {
    await bootStory(page, `/?presentation=direct#${scene}`);
    const sceneImages = page.locator(`[data-r4-scene="${scene}"] img`);
    await expect.poll(async () => sceneImages.evaluateAll((images) => images.every((image) => (
      (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0
    )))).toBe(true);
  }
  await bootStory(page, '/?presentation=direct#figure2-animation');
  const figure2Mask = await decodedMask(page, '.r4-figure2__window-mask');
  expect(figure2Mask.maskImage).toMatch(/figure2-middle-window-mask-[^/]+\.webp/);
  expect(figure2Mask.maskMode).toContain('alpha');
  expect(figure2Mask).toMatchObject({ naturalWidth: 3840, naturalHeight: 2160 });
  await page.keyboard.press('PageDown');

  const figure2DepthPath = `/${emittedBySource.get('assets/figure2-middle-depth.webp') ?? ''}`;
  await expect.poll(() => requestedPaths.includes(figure2DepthPath)).toBe(true);
  await expect.poll(() => [...expectedPaths]
    .filter((entry) => !requestedPaths.includes(entry))
    .sort()
    .join('\n')).toBe('');
  await expect.poll(() => [...expectedPaths]
    .filter((entry) => !responseStatuses.has(entry))
    .sort()
    .join('\n')).toBe('');
  for (const expectedPath of expectedPaths) {
    expect(responseStatuses.get(expectedPath), expectedPath).toBe(200);
  }
  expect(requestedPaths.filter((entry) => entry.toLowerCase().endsWith('.png'))).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});
