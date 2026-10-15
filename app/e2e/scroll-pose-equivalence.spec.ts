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
      await page.goto('/brand-lab');
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
