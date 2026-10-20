import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { writeFile } from 'node:fs/promises';

async function seek(page: Page, id: string, progress: number) {
  const expected = await page.evaluate(({ id, progress }) => {
    const api = (window as unknown as { __r5ScrollStory: {
      index(): { ranges: Array<{ id: string; start: number; end: number }> }; seek(y: number): void;
    } }).__r5ScrollStory;
    const range = api.index().ranges.find((range) => range.id === id)!;
    api.seek(range.start + (range.end - range.start) * progress);
    return range.end > range.start ? progress : 0;
  }, { id, progress });
  await page.waitForFunction(({ id, progress }) => {
    const state = (window as unknown as { __r5ScrollStory: { snapshot(): {
      desired: { rangeId: string; progress: number }; presented: { progress: number } | null; view: { status: string };
    } } }).__r5ScrollStory.snapshot();
    return state.desired.rangeId === id && state.view.status === 'ready'
      && Math.abs((state.presented?.progress ?? -1) - progress) < .002;
  }, { id, progress: expected }, { timeout: 25000 });
  // Allow the accepted canvas batch to reach the screenshot compositor.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

function difference(a: Buffer, b: Buffer) {
  const first = PNG.sync.read(a), second = PNG.sync.read(b);
  expect([second.width, second.height]).toEqual([first.width, first.height]);
  let changed = 0;
  for (let offset = 0; offset < first.data.length; offset += 4) {
    if ([0, 1, 2].some((channel) => Math.abs(first.data[offset + channel]! - second.data[offset + channel]!) > 24)) changed++;
  }
  return changed / (first.width * first.height);
}

for (const platform of ['desktop', 'phone'] as const) {
  test.describe(`pose equivalence ${platform}`, () => {
    test.use(platform === 'phone' ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
      : { viewport: { width: 1440, height: 900 } });
    test.afterEach(async ({ page }, info) => {
      if (info.status === info.expectedStatus) return;
      console.log(JSON.stringify(await page.evaluate(() => ({
        state: (window as unknown as { __r5ScrollStory?: { snapshot(): unknown } }).__r5ScrollStory?.snapshot(),
        media: [...document.querySelectorAll<HTMLVideoElement>('.story-scroll video')].map((v) => ({ data: { ...v.dataset }, time: v.currentTime, seeking: v.seeking }))
        , canvases: [...document.querySelectorAll<HTMLElement>('.story-scroll canvas')].map((c) => ({ data: { ...c.dataset } }))
      }))));
    });
    test('Crane midpoint can be remounted after Contact', async ({ page }) => {
      await page.goto('/#method');
      await page.waitForFunction(() => Boolean((window as unknown as { __r5ScrollStory?: unknown }).__r5ScrollStory));
      await seek(page, 'crane-contact', .5);
      await seek(page, 'hold:contact', .5);
      await seek(page, 'crane-contact', .5);
    });
    if (platform === 'phone') test('Figure3 remount presents its decoded endpoint after an empty initial video draw', async ({ page }) => {
      await page.addInitScript(() => {
        const draw = CanvasRenderingContext2D.prototype.drawImage;
        CanvasRenderingContext2D.prototype.drawImage = function (...args: Parameters<typeof draw>) {
          const source = args[0];
          // Reproduce WebKit's loadeddata-before-drawable-frame timing without
          // changing the decoder, its target, or any readiness/visual threshold.
          if (source instanceof HTMLVideoElement && source.dataset.mediaKey === 'figure3-motion'
            && this.canvas.dataset.phoneFigure3PaperCanvas !== undefined
            && source.dataset.timelineVideoFrameReady !== 'true') return;
          Reflect.apply(draw, this, args);
        };
      });
      await page.goto('/#method');
      await page.waitForFunction(() => Boolean((window as unknown as { __r5ScrollStory?: unknown }).__r5ScrollStory));
      await page.locator('.story-loader').waitFor({ state: 'hidden' });
      let baseline: Buffer | null = null;
      for (let cycle = 0; cycle < 4; cycle++) {
        if (cycle) await seek(page, 'hold:contact', 0);
        await seek(page, 'brand-figure3', .5);
        const darkSamples = await page.evaluate(() => {
          const canvas = document.querySelector<HTMLCanvasElement>('[data-phone-figure3-paper-canvas]')!;
          const sample = document.createElement('canvas'); sample.width = sample.height = 64;
          const context = sample.getContext('2d')!; context.drawImage(canvas, 0, 0, 64, 64);
          const pixels = context.getImageData(0, 0, 64, 64).data;
          let ink = 0;
          for (let i = 0; i < pixels.length; i += 4) if (pixels[i]! < 180 && pixels[i + 3]! > 24) ink++;
          return ink;
        });
        expect(darkSamples, 'ready must contain the real figure, not just its paper background').toBeGreaterThan(100);
        const image = await page.screenshot();
        if (baseline) expect(difference(baseline, image), `remount ${cycle}`).toBeLessThanOrEqual(.005);
        else baseline = image;
      }
    });
    test('Pattern 75% keeps its particle and scene rasters after parking, reverse and remount', async ({ page }) => {
      type Readback = { width: number; height: number; rgba: string; painted: number; time: number };
      type Probe = { __patternReadback: Readback | null; __patternReadbackArmed: boolean };
      await page.addInitScript(() => {
        const probe = window as unknown as Probe;
        const names = new WeakMap<WebGLUniformLocation, string>();
        const progress = new WeakMap<WebGLRenderingContext, number>();
        const times = new WeakMap<WebGLRenderingContext, number>();
        const getLocation = WebGLRenderingContext.prototype.getUniformLocation;
        WebGLRenderingContext.prototype.getUniformLocation = function (program, name) {
          const location = getLocation.call(this, program, name);
          if (location) names.set(location, name);
          return location;
        };
        const setFloat = WebGLRenderingContext.prototype.uniform1f;
        WebGLRenderingContext.prototype.uniform1f = function (location, value) {
          if (location && names.get(location) === 'P') progress.set(this, value);
          if (location && names.get(location) === 'T') times.set(this, value);
          return setFloat.call(this, location, value);
        };
        const draw = WebGLRenderingContext.prototype.drawArrays;
        WebGLRenderingContext.prototype.drawArrays = function (mode, first, count) {
          draw.call(this, mode, first, count);
          if (!probe.__patternReadbackArmed || !(this.canvas instanceof HTMLCanvasElement)
            || this.canvas.dataset.r4InkSegment !== 'pattern-star-map'
            || Math.abs((progress.get(this) ?? -1) - .5) > .0001) return;
          // Window-managed GL deliberately discards its backing buffer after
          // presentation. Read in the draw task, not two compositor frames later.
          const width = this.drawingBufferWidth, height = this.drawingBufferHeight;
          const pixels = new Uint8Array(width * height * 4);
          this.readPixels(0, 0, width, height, this.RGBA, this.UNSIGNED_BYTE, pixels);
          let painted = 0, binary = '';
          for (let offset = 3; offset < pixels.length; offset += 4) if (pixels[offset]! > 24) painted++;
          for (let offset = 0; offset < pixels.length; offset += 16384) {
            binary += String.fromCharCode(...pixels.subarray(offset, offset + 16384));
          }
          probe.__patternReadback = { width, height, rgba: btoa(binary), painted, time: times.get(this) ?? NaN };
          probe.__patternReadbackArmed = false;
        };
      });
      await page.goto('/#method');
      await page.waitForFunction(() => Boolean((window as unknown as { __r5ScrollStory?: unknown }).__r5ScrollStory));
      await page.locator('.story-loader').waitFor({ state: 'hidden' });
      await seek(page, 'pattern-star-map', .25);
      await seek(page, 'pattern-star-map', .75);
      const raster = async () => {
        await page.evaluate(() => {
          const probe = window as unknown as Probe;
          probe.__patternReadback = null;
          probe.__patternReadbackArmed = true;
          const api = (window as unknown as { __r5ScrollStory: {
            snapshot(): { desired: { scroll: number } }; seek(y: number): void;
          } }).__r5ScrollStory;
          api.seek(api.snapshot().desired.scroll);
        });
        await page.waitForFunction(() => Boolean((window as unknown as Probe).__patternReadback), undefined, { timeout: 10000 });
        const image = await page.evaluate(() => (window as unknown as Probe).__patternReadback!);
        expect(image.painted, 'must read a real nonblank draw, not a discarded GL buffer').toBeGreaterThan(100);
        expect(image.time).toBeCloseTo(6, 5);
        return { width: image.width, height: image.height, data: Buffer.from(image.rgba, 'base64') };
      };
      const beforeInk = await raster();
      const before = await page.screenshot();
      await page.waitForTimeout(500);
      for (const approach of ['parked', 'reverse', 'remount']) {
        if (approach !== 'parked') {
          await seek(page, approach === 'reverse' ? 'pattern-star-map' : 'hold:contact', approach === 'reverse' ? .25 : 0);
          await seek(page, 'pattern-star-map', .75);
        }
        expect(difference(before, await page.screenshot()), `${approach} full scene`).toBeLessThanOrEqual(.005);
        const ink = await raster();
        expect([ink.width, ink.height, ink.data.length]).toEqual([beforeInk.width, beforeInk.height, beforeInk.data.length]);
        let changed = 0;
        for (let offset = 0; offset < ink.data.length; offset += 4) {
          if ([0, 1, 2, 3].some(channel => Math.abs(ink.data[offset + channel]! - beforeInk.data[offset + channel]!) > 24)) changed++;
        }
        expect(changed, `${approach} particles must use the same pose clock`).toBe(0);
        expect(difference(before, await page.screenshot()), `${approach} redraw`).toBeLessThanOrEqual(.005);
      }
    });
    if (platform === 'phone') test('Hero entry midpoint preserves both layers after reverse and remount', async ({ page }) => {
      await page.goto('/');
      await page.waitForFunction(() => Boolean((window as unknown as { __r5ScrollStory?: unknown }).__r5ScrollStory));
      await page.locator('.story-loader').waitFor({ state: 'hidden' });
      await seek(page, 'hold:hero', .5);
      const forward = await page.screenshot();
      await seek(page, 'hero-pattern', .5);
      await seek(page, 'hold:hero', .5);
      expect(difference(forward, await page.screenshot())).toBeLessThanOrEqual(.005);
      await seek(page, 'hold:method-top', .5);
      await seek(page, 'hold:hero', .5);
      expect(difference(forward, await page.screenshot())).toBeLessThanOrEqual(.005);
    });
    test('same midpoint from forward, reverse and remount preserves the rendered image', async ({ page }, info) => {
      test.setTimeout(180000);
      await page.goto('/#method');
      await page.waitForFunction(() => Boolean((window as unknown as { __r5ScrollStory?: unknown }).__r5ScrollStory));
      await page.locator('.story-loader').waitFor({ state: 'hidden' });
      const segments = await page.evaluate(() => (window as unknown as { __r5ScrollStory: {
        index(): { ranges: Array<{ id: string; kind: string }> };
      } }).__r5ScrollStory.index().ranges.filter(({ kind }) => kind === 'segment').map(({ id }) => id));
      const mismatches: string[] = [];
      const mediaState = () => page.evaluate(() => ({
        media: [...document.querySelectorAll<HTMLVideoElement>('.story-scroll video')]
          .map((v) => ({ time: v.currentTime, data: { ...v.dataset }, canvases: [...v.closest('[data-scroll-content]')!.querySelectorAll<HTMLElement>('canvas')].map((c) => ({ ...c.dataset })) })),
        surfaces: [...document.querySelectorAll<HTMLElement>('[data-scroll-role="source"], [data-scroll-role="target"], [data-aod-transition], [data-aod-transition] *, [data-scroll-content="method-top"] *')]
          .map((e) => ({ class: e.className, data: { ...e.dataset }, inline: e.getAttribute('style'), background: getComputedStyle(e).backgroundColor, opacity: getComputedStyle(e).opacity, transform: getComputedStyle(e).transform }))
      }));
      for (const segment of segments) {
        console.log(`${platform}: comparing ${segment}`);
        await seek(page, segment, .25);
        await seek(page, segment, .5);
        const baseline = await page.screenshot();
        const baselineMedia = await mediaState();
        await seek(page, segment, .75);
        await seek(page, segment, .5);
        const reverse = await page.screenshot();
        const reverseMedia = await mediaState();
        await seek(page, 'hold:contact', .5);
        await seek(page, segment, .5);
        const remount = await page.screenshot();
        const remountMedia = await mediaState();
        // Ignore tiny edge rasterization differences, not moved layers or frames.
        for (const [name, pixels] of [['reverse', reverse], ['remount', remount]] as const) {
          const ratio = difference(baseline, pixels);
          if (ratio > .005) {
            mismatches.push(`${segment} ${name}: ${(ratio * 100).toFixed(2)}% pixels`);
            const path = `/tmp/tongye-equivalence-${info.project.name}-${platform}-${segment}`;
            await writeFile(`${path}-${name}.png`, pixels);
            await writeFile(`${path}-forward.png`, baseline);
            await writeFile(`${path}-media.json`, JSON.stringify({ baselineMedia, reverseMedia, remountMedia }, null, 2));
          }
        }
      }
      expect(mismatches).toEqual([]);
    });
    test('contact footer remains usable and brand-lab retains its entry', async ({ page }) => {
      await page.goto('/#contact');
      await page.waitForFunction(() => Boolean((window as unknown as { __r5ScrollStory?: unknown }).__r5ScrollStory));
      await seek(page, 'hold:contact', .98);
      await expect(page.locator('[data-scroll-content="contact"]')).not.toHaveAttribute('inert', '');
      await expect(page.locator('[data-scroll-content="contact"] a[href="/services/"]')).toBeVisible();
      // Leave the parked seek, then reach Contact using only the native axis.
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForFunction(() => (window as unknown as { __r5ScrollStory: { snapshot(): { desired: { rangeId: string } } } })
        .__r5ScrollStory.snapshot().desired.rangeId === 'hold:hero');
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForFunction(() => (window as unknown as { __r5ScrollStory: { snapshot(): { desired: { rangeId: string } } } })
        .__r5ScrollStory.snapshot().desired.rangeId === 'hold:contact');
      await page.goto(`${process.env.R5_BASE_PATH || '/'}brand-lab`);
      await expect(page.locator('[data-scroll-platform="phone"]')).toHaveAttribute('data-phone-scope', 'brand-lab');
      await page.waitForFunction(() => (window as unknown as { __r5ScrollStory?: { snapshot(): { view: { status: string } } } })
        .__r5ScrollStory?.snapshot().view.status === 'ready');
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await expect(page.locator('.story-scroll')).toHaveAttribute('data-scroll-scene', 'brand');
      // A short Brand hold is a zero-length landmark; its outgoing pose at 0
      // is the same semantic entry, not evidence of automatic playback.
      await expect(page.locator('.story-scroll')).toHaveAttribute('data-scroll-progress', '0.00000');
      await page.reload();
      await page.waitForFunction(() => (window as unknown as { __r5ScrollStory?: { snapshot(): { view: { status: string } } } })
        .__r5ScrollStory?.snapshot().view.status === 'ready');
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await expect(page.locator('.story-scroll')).toHaveAttribute('data-scroll-scene', 'brand');
      await expect(page.locator('.story-scroll')).toHaveAttribute('data-scroll-progress', '0.00000');
    });
  });
}
