import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { bootStory, waitForHold } from './r5-helpers';

const repoDir = resolve(process.cwd(), '..');
const inventoryPath = resolve(repoDir, 'dist', 'homepage-media-inventory.json');
const batchCLosslessPairs = [
  ['assets/middle1_depth.png', 'assets/middle1_depth.webp'],
  ['assets/back2.png', 'assets/back2.webp'],
  ['assets/figure2-middle-depth.png', 'assets/figure2-middle-depth.webp'],
  ['assets/figure2-middle-window-mask.png', 'assets/figure2-middle-window-mask.webp'],
  ['assets/aod_cloud-alpha.png', 'assets/aod_cloud-alpha.webp'],
  ['assets/aod_sun-alpha.png', 'assets/aod_sun-alpha.webp'],
  ['assets/ph_background.png', 'assets/ph_background.webp'],
  ['assets/ph_front-alpha.png', 'assets/ph_front-alpha.webp'],
  ['assets/crane1_cloud2-alpha.png', 'assets/crane1_cloud2-alpha.webp'],
  ['assets/crane1_arch-alpha.png', 'assets/crane1_arch-alpha.webp'],
  ['assets/crane1_cloud1-alpha.png', 'assets/crane1_cloud1-alpha.webp'],
  ['assets/crane1_cloud-front2-alpha.png', 'assets/crane1_cloud-front2-alpha.webp'],
  ['assets/patterns/alpha-layers/pattern-layer-alpha-02.png', 'assets/patterns/alpha-layers/pattern-layer-alpha-02.webp'],
  ['assets/patterns/alpha-layers/pattern-layer-alpha-03.png', 'assets/patterns/alpha-layers/pattern-layer-alpha-03.webp'],
  ['assets/patterns/alpha-layers/pattern-layer-alpha-04.png', 'assets/patterns/alpha-layers/pattern-layer-alpha-04.webp'],
  ['assets/patterns/alpha-layers/pattern-layer-alpha-05.png', 'assets/patterns/alpha-layers/pattern-layer-alpha-05.webp'],
  ['assets/patterns/alpha-layers/pattern-layer-alpha-06.png', 'assets/patterns/alpha-layers/pattern-layer-alpha-06.webp']
] as const;

type HomepageMediaInventory = Readonly<{
  inventory: readonly Readonly<{
    source: string;
    emittedPath: string;
  }>[];
}>;

async function fileExists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function losslessEmittedPaths(): Promise<ReadonlyMap<string, string>> {
  const inventory = JSON.parse(await readFile(inventoryPath, 'utf8')) as HomepageMediaInventory;
  return new Map(inventory.inventory
    .filter(({ source }) => batchCLosslessPairs.some(([, output]) => output === source))
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

async function pressFromCurrentHold(page: Page, key: 'PageDown' | 'PageUp'): Promise<void> {
  await page.keyboard.press(key);
}

test('Hero keeps the original figure deferred until the Hero to Pattern transition is accepted', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Batch B transfer gate uses mobile Chromium');
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'video') {
      requests.push(new URL(request.url()).pathname);
    }
  });

  await bootStory(page, '/?presentation=direct');
  const initial = await page.locator('[data-r4-scene="hero"] [data-hero-figure-video]').evaluate((video: HTMLVideoElement) => ({
    preload: video.preload,
    source: video.currentSrc || video.src,
    poster: video.poster
  }));
  expect(initial).toMatchObject({ preload: 'none' });
  expect(initial.source).toMatch(/figure1-[^/]+\.webm$/);
  expect(initial.poster).toMatch(/hero-figure-poster-[^/]+\.webp$/);
  expect(initial.source).not.toContain('hero-figure-scrub');
  expect(requests.some((url) => /figure1-[^/]+\.webm$/.test(url))).toBe(false);

  await pressFromCurrentHold(page, 'PageDown');
  await page.waitForFunction(() => document
    .querySelector<HTMLVideoElement>('[data-r4-scene="hero"] [data-hero-figure-video]')
    ?.preload === 'auto');
  await waitForHold(page, 'pattern');
});

test('direct non-Hero entries expose exactly the seven canonical physical video keys', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Batch B media gate uses mobile Chromium');
  const cases = [
    {
      scene: 'figure2-animation',
      media: [['figure2-pair-motion', 'figure2-pair-motion']]
    },
    { scene: 'ttg-animation', media: [['ttg-figure-motion', 'ttg-figure-motion']] },
    { scene: 'ph-animation', media: [['ph-figure-motion', 'ph-figure-motion']] },
    { scene: 'aod-animation', media: [['aod-figure-motion', 'aod-figure-motion']] },
    { scene: 'figure3-animation', media: [['figure3-motion', 'figure3-motion']] },
    {
      scene: 'crane-animation',
      media: [
        ['crane-figure-motion', 'crane-figure-motion'],
        ['crane-flock-motion', 'crane-flock-motion']
      ]
    }
  ] as const;

  for (const entry of cases) {
    await bootStory(page, `/?presentation=direct#${entry.scene}`);
    const videos = await page.evaluate((scene) => {
      const layer = document.querySelector<HTMLElement>(`[data-stage-layer="${scene}"]`);
      return [...(layer?.querySelectorAll<HTMLVideoElement>('[data-media-key]') ?? [])].map((video) => ({
        key: video.dataset.mediaKey,
        source: video.currentSrc || video.src,
        poster: video.poster,
        playbackRate: video.playbackRate
      }));
    }, entry.scene);
    expect(videos.map((video) => video.key)).toEqual(entry.media.map(([key]) => key));
    for (const [index, [, filename]] of entry.media.entries()) {
      expect(videos[index]?.source).toMatch(new RegExp(`${filename}-[^/]+\\.webm$`));
      expect(videos[index]?.poster).toBe('');
      expect(videos[index]?.playbackRate).toBeGreaterThan(0);
    }
  }
});

test('Batch C WebP browser decode matches retained PNG pixels before source removal', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Batch C lossless gate runs once in desktop Chromium');
  const sourcePresence = await Promise.all(batchCLosslessPairs.map(([source]) => fileExists(resolve(repoDir, source))));
  const retainedPngsPresent = sourcePresence.every(Boolean);
  expect(sourcePresence.every(Boolean) || sourcePresence.every((present) => !present)).toBe(true);

  await page.route('**/__batch-c-lossless/**', async (route) => {
    const match = new URL(route.request().url()).pathname.match(/\/__batch-c-lossless\/(png|webp)\/(\d+)$/);
    const kind = match?.[1];
    const index = Number(match?.[2]);
    const pair = batchCLosslessPairs[index];
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

  for (const [index, [source, output]] of batchCLosslessPairs.entries()) {
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
          mismatchIndex: -1
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
          mismatchIndex: -1
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
      let mismatchIndex = -1;
      for (let offset = 0; offset < sourcePixels.length; offset += 1) {
        if (sourcePixels[offset] !== outputPixels[offset]) {
          mismatchIndex = offset;
          break;
        }
      }
      sourceImage.close();
      outputBitmap.close();
      return {
        naturalWidth: outputImage.naturalWidth,
        naturalHeight: outputImage.naturalHeight,
        rgbaEqual: mismatchIndex === -1,
        mismatchIndex
      };
    }, {
      sourceUrl: retainedPngsPresent ? `/__batch-c-lossless/png/${index}` : '',
      outputUrl: `/__batch-c-lossless/webp/${index}`
    });
    expect(result.naturalWidth, output).toBeGreaterThan(0);
    expect(result.naturalHeight, output).toBeGreaterThan(0);
    if (retainedPngsPresent) {
      expect(result.rgbaEqual, `${source} -> ${output}; mismatch byte ${result.mismatchIndex}`).toBe(true);
    }
  }

  const emittedBySource = await losslessEmittedPaths();
  expect(emittedBySource.size).toBe(batchCLosslessPairs.length);
  const emittedDecode = await page.evaluate(async (urls) => Promise.all(urls.map(async (url) => {
    const image = new Image();
    image.src = url;
    await image.decode();
    return { url, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight };
  })), batchCLosslessPairs.map(([, output]) => `/${emittedBySource.get(output) ?? ''}`));
  for (const decoded of emittedDecode) {
    expect(decoded.naturalWidth, decoded.url).toBeGreaterThan(0);
    expect(decoded.naturalHeight, decoded.url).toBeGreaterThan(0);
  }
});

test('Batch C runtime loads WebP depth, mask, and Pattern layers without PNG requests', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Batch C runtime gate runs once in desktop Chromium');
  const emittedBySource = await losslessEmittedPaths();
  expect(emittedBySource.size).toBe(batchCLosslessPairs.length);
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
