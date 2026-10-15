import { expect, test, type Page } from '@playwright/test';

type ScrollTestWindow = Window & { __r5ScrollStory?: { snapshot(): {
    desired: { rangeId: string; progress: number; scroll: number; readingOffset: number };
    presented: { progress: number } | null; view: { status: string; error: string | null };
  } } };

async function state(page: Page) {
  return page.evaluate(() => (window as ScrollTestWindow).__r5ScrollStory?.snapshot());
}

async function seekRange(page: Page, id: string, progress: number) {
  await page.evaluate(({ id, progress }) => {
    const api = (window as unknown as { __r5ScrollStory: {
      index(): { ranges: Array<{ id: string; start: number; end: number }> }; seek(y: number): void;
    } }).__r5ScrollStory;
    const range = api.index().ranges.find((entry) => entry.id === id)!;
    api.seek(range.start + (range.end - range.start) * progress);
  }, { id, progress });
  // Poll beside the runtime instead of repeatedly serializing snapshots over
  // the browser connection. Preserve both original deadlines and conditions.
  await page.waitForFunction((id) => (window as ScrollTestWindow).__r5ScrollStory?.snapshot().desired.rangeId === id,
    id, { timeout: 10000 });
  await page.waitForFunction(() => {
    const view = (window as ScrollTestWindow).__r5ScrollStory?.snapshot().view;
    if (view?.status === 'failed') throw new Error(view.error ?? 'Scroll preparation failed');
    return view?.status === 'ready' && view.error === null;
  }, undefined, { timeout: 25000 });
}

for (const platform of ['desktop', 'phone'] as const) {
  const scroll = async (page: Page, delta: number) => {
    if (platform === 'phone' && test.info().project.name === 'webkit') {
      // WebKit automation cannot inject a mobile wheel/swipe. This proves the
      // document axis only; native touch has a separate Chromium/device check.
      await page.evaluate((dy) => window.scrollBy(0, dy), delta);
    } else { await page.mouse.move(100, 400); await page.mouse.wheel(0, delta); }
  };
  test.describe(`continuous ${platform}`, () => {
    test.beforeEach(async ({ page }) => {
      page.on('response', (response) => { if (response.status() >= 400) console.log(`HTTP ${response.status()}: ${response.url()}`); });
    });
    test.afterEach(async ({ page }, result) => {
      if (result.status === result.expectedStatus) return;
      console.log(JSON.stringify(await state(page)));
      console.log(await page.evaluate(() => ({ y: scrollY, hidden: document.hidden, visibility: document.visibilityState,
        height: document.documentElement.scrollHeight, viewport: [innerWidth, innerHeight], classes: document.documentElement.className })));
      console.log(JSON.stringify(await page.locator('.story-scroll').evaluate((root) => ({
        surfaces: [...root.querySelectorAll('[data-scroll-content]')].map((element) => ({ id: element.getAttribute('data-scroll-content'), children: element.childElementCount })),
        media: [...root.querySelectorAll('video,canvas')].map((element) => ({ tag: element.tagName, data: { ...(element as HTMLElement).dataset },
          ...(element instanceof HTMLVideoElement ? { time: element.currentTime, seeking: element.seeking, readyState: element.readyState, source: element.currentSrc } : {}) }))
      }))));
    });
    test.use(platform === 'phone' ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
      : { viewport: { width: 1440, height: 900 } });
    test('preserves active-time distances and Figure2 / Crane phase boundaries', async ({ page }) => {
      await page.goto('/#method');
      await expect.poll(async () => (await state(page))?.view.status).toBe('ready');
      const lengths = await page.evaluate(() => {
        const index = (window as unknown as { __r5ScrollStory: { index(): {
          viewportHeight: number; ranges: Array<{ id: string; start: number; end: number; kind: string }>;
        } } }).__r5ScrollStory.index();
        return Object.fromEntries(index.ranges.filter(r => r.kind === 'segment')
          .map(r => [r.id, (r.end - r.start) / index.viewportHeight]));
      });
      expect(lengths['aod-method-top']).toBeCloseTo(2600 / 1200);
      expect(lengths['figure3-services']).toBeCloseTo(lengths['aod-method-top']!);
      expect(lengths['figure2-distance-expand']).toBeCloseTo(4100 / 1200);
      expect(lengths['crane-contact']).toBeCloseTo((platform === 'phone' ? 3400 : 3000) / 1200);
      for (const progress of [2600 / 4100, 3350 / 4100, 2600 / 4100]) {
        await seekRange(page, 'figure2-distance-expand', progress);
        await expect.poll(async () => (await state(page))?.presented?.progress).toBeCloseTo(progress, 3);
        await expect.poll(() => page.locator('[data-scroll-content="figure2-animation"] video').evaluateAll(videos =>
          videos.every(v => Math.abs((v as HTMLVideoElement).currentTime - 2.6) < .002 && (v as HTMLVideoElement).paused)
          && videos.length > 0)).toBe(true);
      }
      await page.screenshot({ path: `/tmp/tongye-timing-${test.info().project.name}-${platform}-figure2-boundary.png` });
      if (platform === 'phone') {
        for (const progress of [.8, 3000 / 3400, .8]) {
          await seekRange(page, 'crane-contact', progress);
          await expect.poll(async () => (await state(page))?.presented?.progress).toBeCloseTo(progress, 3);
          await expect.poll(async () => Number(await page.locator('[data-phone-crane-progress]').getAttribute('data-phone-crane-progress')))
            .toBeCloseTo(Math.min(1, progress / (3000 / 3400)), 3);
        }
        await page.screenshot({ path: `/tmp/tongye-timing-${test.info().project.name}-phone-crane-80.png` });
      }
    });
    test('preserves v55 reading composition and viewport-sized outgoing masks', async ({ page }) => {
      await page.goto('/#method');
      await expect.poll(async () => (await state(page))?.view.status).toBe('ready');
      if (platform === 'desktop') {
        await seekRange(page, 'aod-method-top', .85);
        const copy = await page.locator('.r4-method__wide-copy').boundingBox();
        expect(copy!.x).toBeCloseTo(100, 0);
        expect(copy!.y).toBeCloseTo(330.56, 0);
        expect(copy!.width).toBeCloseTo(805.52, 0);
        await seekRange(page, 'figure2-proof-brand', .25);
        await expect(page.locator('[data-scroll-content="figure2-proof"]')).toHaveCSS('background-color', 'rgb(237, 228, 210)');
      }
      for (const [segment, scene] of [['services-ttg', 'services'], ['lab-ph', 'lab'], ['education-crane', 'education']]) {
        await seekRange(page, segment!, .5);
        const shape = await page.locator(`[data-scroll-content="${scene}"]`).evaluate((node) => {
          const r = node.getBoundingClientRect();
          return { y: r.y, height: r.height, viewport: innerHeight, offset: node.scrollTop,
            max: node.scrollHeight - node.clientHeight, overflow: getComputedStyle(node).overflow };
        });
        expect(shape.y).toBe(0); expect(shape.height).toBe(shape.viewport);
        expect(shape.overflow).toBe('hidden'); expect(Math.abs(shape.offset - shape.max)).toBeLessThanOrEqual(1);
      }
      await seekRange(page, 'ttg-lab', .85);
      if (platform === 'desktop') {
        const layers = await page.evaluate(() => ['ttg-animation', 'lab'].map(id =>
          Number(getComputedStyle(document.querySelector(`[data-scroll-content="${id}"]`)!).zIndex)));
        expect(layers).toEqual([30, 20]);
        const copy = await page.locator('.r4-lab__wide-copy').boundingBox();
        expect(copy!.x).toBeCloseTo(100, 0); expect(copy!.width).toBeCloseTo(805.52, 0);
      } else {
        expect(await page.locator('main.story-scroll').evaluate(node => getComputedStyle(node).getPropertyValue('--r4-part-content-width'))).toBe('');
        await seekRange(page, 'figure2-proof-brand', .25);
        expect((await page.locator('.r4-proof-scroll__content--closing').boundingBox())!.width).toBe(390);
        await seekRange(page, 'ttg-lab', .85);
        await expect(page.locator('main.story-scroll')).toHaveCSS('background-color', 'rgb(8, 13, 16)');
        await seekRange(page, 'ph-education', .85);
        await expect(page.locator('main.story-scroll')).toHaveCSS('background-color', 'rgb(152, 137, 165)');
      }
    });
    test('cold load, direct target, reverse and stationary video', async ({ page }) => {
      test.setTimeout(120000);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('/');
      await expect(page.locator('[data-scroll-platform]')).toHaveAttribute('data-scroll-platform', platform);
      await expect.poll(async () => (await state(page))?.view, { timeout: 25000 }).toMatchObject({ status: 'ready', error: null });
      await seekRange(page, 'hero-pattern', .25);
      await expect.poll(async () => (await state(page))?.presented?.progress).toBeCloseTo(.25, 2);
      await seekRange(page, 'hero-pattern', .15);
      const videos = () => page.locator('.story-scroll video').evaluateAll((elements) => elements.map((element) => {
        // WebKit may normalize an assigned rational time to its media clock
        // precision after seek; compare microseconds, not binary float bits.
        const video = element as HTMLVideoElement; return { paused: video.paused, time: Number(video.currentTime.toFixed(6)) };
      }));
      const parked = await videos();
      expect(parked.every(({ paused }) => paused)).toBe(true);
      // This is a stationary-pose check, not a load wait.
      await page.waitForTimeout(2000);
      expect(await videos()).toEqual(parked);
      await seekRange(page, 'hold:method-top', .6);
      await page.screenshot({ path: `/tmp/tongye-continuous-${platform}-method.png` });
      await seekRange(page, 'method-bottom-figure2', .5);
      await page.screenshot({ path: `/tmp/tongye-continuous-${platform}-figure2-entry.png` });
      await seekRange(page, 'hold:method-top', .9);
      expect(errors).toEqual([]);
    });

    test('cold loader shows its phrases and Hero enters before any scroll', async ({ page }) => {
      await page.goto('/');
      const loader = page.locator('[data-story-loader]');
      await expect(loader).toHaveAttribute('data-loader-mode', 'cold-hero');
      await expect(loader.locator('.story-loader__ink-clear')).toHaveText('同人于野');
      await expect(loader.locator('.story-loader__ink-clear')).toHaveText('观象知幂');
      await expect(loader).toBeHidden({ timeout: 15000 });
      const stage = page.locator('.story-scroll');
      await expect.poll(async () => Number(await stage.getAttribute('data-scroll-entry-progress'))).toBeGreaterThan(0);
      await expect.poll(async () => Number(await stage.getAttribute('data-scroll-entry-progress'))).toBe(1);
      expect(await page.evaluate(() => scrollY)).toBe(0);
      await page.screenshot({ path: `/tmp/tongye-cold-entry-${test.info().project.name}-${platform}.png` });
    });

    if (platform === 'phone') test('Hero layers share one actual WebGL context across entry, reverse and remount', async ({ page }) => {
      test.setTimeout(90000);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => { if (['warn', 'error'].includes(message.type())) errors.push(message.text()); });
      await page.addInitScript(() => {
        const contexts: Array<WeakRef<WebGLRenderingContext>> = [];
        const getContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (...args: Parameters<typeof getContext>) {
          const context = getContext.apply(this, args);
          if (context && String(args[0]).includes('webgl') && !contexts.some((entry) => entry.deref() === context)) {
            contexts.push(new WeakRef(context as WebGLRenderingContext));
          }
          return context;
        } as typeof getContext;
        Object.assign(window, { heroLiveContexts: () => contexts.filter((entry) => {
          const gl = entry.deref();
          return gl && !gl.isContextLost() && (gl.canvas as HTMLCanvasElement).closest('.story-scroll');
        }).length });
      });
      await page.goto('/');
      await expect.poll(async () => (await state(page))?.view.status).toBe('ready');
      for (const [id, progress, expected] of [
        ['hold:hero', .5, 1], ['hero-pattern', .5, 2], ['hold:hero', .5, 1],
        ['hold:method-top', .5, 0], ['hold:hero', .5, 1]
      ] as const) {
        await seekRange(page, id, progress);
        await expect.poll(async () => (await state(page))?.presented?.progress).toBeCloseTo(progress, 2);
        await expect.poll(() => page.evaluate(() => (window as unknown as { heroLiveContexts(): number }).heroLiveContexts())).toBe(expected);
        if (id === 'hold:hero') {
          await expect(page.locator('.story-scroll canvas')).toHaveCount(2);
          expect(await page.locator('[data-portrait-hero-intro-ink]').evaluate((canvas) => Boolean((canvas as HTMLCanvasElement).getContext('2d')))).toBe(true);
          await expect(page.locator('[data-portrait-figure-canvas]')).toHaveAttribute('data-packed-alpha-frame-ready', 'true');
        }
      }
      expect(errors).toEqual([]);
    });

    test('cold reading anchor is not replaced by the outgoing transition', async ({ page }) => {
      await page.goto('/#method');
      await expect.poll(async () => (await state(page))?.desired.rangeId, { timeout: 15000 }).toBe('hold:method-top');
      await expect.poll(async () => (await state(page))?.view.status).toBe('ready');
      expect((await state(page))?.desired.readingOffset).toBeLessThan(2);
      await expect(page.locator('.story-scroll #method')).toHaveCount(platform === 'phone' ? 1 : 0);
    });

    test('all authored transitions accept direct and reverse samples', async ({ page }) => {
      test.setTimeout(300000);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => { if (message.type() === 'error' || /GL_INVALID|WebGL.*(lost|failed)/i.test(message.text())) errors.push(message.text()); });
      await page.goto('/#method');
      await expect.poll(async () => (await state(page))?.view.status, { timeout: 25000 }).toBe('ready');
      const segments = await page.evaluate(() => (window as unknown as { __r5ScrollStory: {
        index(): { ranges: Array<{ id: string; kind: string }> };
      } }).__r5ScrollStory.index().ranges.filter(({ kind }) => kind === 'segment').map(({ id }) => id));
      expect(segments).toHaveLength(15);
      for (const segment of segments) {
        console.log(`${platform}: ${segment}`);
        for (const progress of [.02, .25, .5, .75, .98, .5, .02]) {
          await seekRange(page, segment, progress);
          await expect.poll(async () => (await state(page))?.presented?.progress).toBeCloseTo(progress, 2);
          expect(await page.locator('.story-scroll video').evaluateAll((videos) => videos.every((video) => (video as HTMLVideoElement).paused))).toBe(true);
          const composites = await page.locator('.story-scroll canvas[data-packed-alpha-media-time]').evaluateAll((canvases) => canvases.map((canvas) => {
            const element = canvas as HTMLCanvasElement;
            const owner = element.dataset.phonePackedAlphaCanvas;
            const video = [...document.querySelectorAll<HTMLVideoElement>('.story-scroll video')].find((video) => video.dataset.phonePackedAlphaOwner === owner);
            return { canvas: Number(element.dataset.packedAlphaMediaTime), presented: Number(video?.dataset.timelineVideoPresentedTime) };
          }));
          for (const composite of composites) expect(Math.abs(composite.canvas - composite.presented)).toBeLessThanOrEqual(.04);
          if ([.25, .5, .75].includes(progress)) {
            const parked = await page.locator('.story-scroll video').evaluateAll((videos) => videos.map((video) => Number((video as HTMLVideoElement).currentTime.toFixed(6))));
            await page.waitForTimeout(2000);
            expect(await page.locator('.story-scroll video').evaluateAll((videos) => videos.map((video) => Number((video as HTMLVideoElement).currentTime.toFixed(6))))).toEqual(parked);
            expect((await state(page))?.presented?.progress).toBeCloseTo(progress, 2);
          }
          if (progress === .75) await page.screenshot({ path: `/tmp/tongye-continuous-${platform}-${segment}.png` });
        }
      }
      const footprint = new Map<string, number>();
      for (let round = 0; round < 2; round++) {
        for (const id of [...segments, ...[...segments].reverse()]) {
          await seekRange(page, id, .5);
          await expect.poll(async () => (await state(page))?.presented?.progress).toBeCloseTo(.5, 2);
          const videos = await page.locator('.story-scroll video').count();
          expect(videos).toBeLessThanOrEqual(2);
          if (footprint.has(id)) expect(videos).toBe(footprint.get(id));
          else footprint.set(id, videos);
        }
      }
      expect(errors).toEqual([]);
    });

    test('authored TTG, PH and Crane frames advance and reverse at the intended times', async ({ page }) => {
      test.setTimeout(120000);
      // A wide viewport reproduces the intrinsic-video grid overflow; the
      // standard 1440x900 viewport is taller than the plate and hides that bug.
      if (platform === 'desktop') await page.setViewportSize({ width: 1470, height: 723 });
      await page.goto('/#method');
      await expect.poll(async () => (await state(page))?.view.status).toBe('ready');
      for (const progress of [.2, .5, .85, .5, .2]) {
        for (const id of ['ttg-lab', 'ph-education', 'crane-contact']) {
          await seekRange(page, id, progress);
          await expect.poll(async () => (await state(page))?.presented?.progress).toBeCloseTo(progress, 2);
          const times = await page.locator('.story-scroll video').evaluateAll((videos) => videos.map((v) => ({
            key: (v as HTMLVideoElement).dataset.mediaKey, time: (v as HTMLVideoElement).currentTime,
            paused: (v as HTMLVideoElement).paused
          })));
          const clamp = (p: number) => Math.min(1, Math.max(0, p));
          const ttg = clamp(progress * 3100 / 2500);
          const ph = clamp(progress * 2120 / 1520);
          // Phone retains its authored 3.4s Contact reveal; the paired motion
          // finishes at 3s. Keep this expectation independent of the sampler.
          const craneSeconds = progress * (platform === 'phone' ? 3.4 : 3);
          const expected: Record<string, number> = {
            'ttg-figure-motion': ttg * 2.467,
            'ph-figure-motion': (.78 * ph + .22 * ph * ph) * 1.5,
            'crane-figure-motion': clamp((craneSeconds - .5) / 2.5) * 2.467,
            'crane-flock-motion': clamp(craneSeconds / 2.5) * 2.467
          };
          expect(times.length).toBe(id === 'crane-contact' ? 2 : 1);
          for (const media of times) {
            expect(media.paused).toBe(true);
            expect(Math.abs(media.time - expected[media.key!]!)).toBeLessThan(.04);
          }
          if (id === 'crane-contact' && progress === .5 && platform === 'desktop') {
            const size = await page.locator('[data-crane-figure-video]').evaluate((video) => ({
              height: video.getBoundingClientRect().height, viewport: innerHeight
            }));
            expect(size.height).toBeCloseTo(size.viewport, 0);
          }
        }
      }
    });

    test('Proof keeps its arch fixed while all three reading panels cross the viewport', async ({ page }) => {
      await page.goto('/#method');
      await expect.poll(async () => (await state(page))?.view.status).toBe('ready');
      await page.locator('[data-story-loader]').waitFor({ state: 'hidden' });
      const positions: number[] = [];
      for (const progress of [.01, .5, .99]) {
        await seekRange(page, 'hold:figure2-proof', progress);
        await expect.poll(async () => (await state(page))?.presented?.progress).toBeCloseTo(progress, 2);
        await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        const arch = page.locator('[data-stage-retained-figure2-arch], [data-phone-retained-figure2-arch]');
        if (platform === 'desktop') positions.push((await arch.boundingBox())!.y);
        await page.screenshot({ path: `/tmp/tongye-proof-${test.info().project.name}-${platform}-${progress}.png` });
        await expect(page.locator('.story-scroll')).toHaveAttribute('data-scroll-status', 'ready');
      }
      if (platform === 'desktop') expect(Math.max(...positions) - Math.min(...positions)).toBeLessThan(1);
    });

    test('Crane paired decoders converge after cold and reverse positioning', async ({ page }) => {
      test.setTimeout(90000);
      await page.goto('/#method');
      await expect.poll(async () => (await state(page))?.view.status).toBe('ready');
      for (const progress of [.02, .25, .75, .5, .02, .98]) {
        await seekRange(page, 'crane-contact', progress);
        await expect.poll(async () => (await state(page))?.presented?.progress).toBeCloseTo(progress, 2);
      }
    });

    test('cold late target prepares without preceding chapters', async ({ page }) => {
      page.on('console', (message) => { if (message.type() === 'error') console.log(message.text()); });
      await page.goto('/#method');
      await expect.poll(async () => (await state(page))?.view.status, { timeout: 25000 }).toBe('ready');
      await seekRange(page, 'figure2-proof-brand', .5);
      await expect.poll(async () => (await state(page))?.presented?.progress).toBeCloseTo(.5, 2);
    });

    test('random Figure2 depth pose commits its mask and viewport canvas', async ({ page }) => {
      await page.goto('/#method');
      await expect.poll(async () => (await state(page))?.view.status, { timeout: 25000 }).toBe('ready');
      await seekRange(page, 'figure2-distance-expand', .85);
      await expect.poll(async () => (await state(page))?.presented?.progress).toBeCloseTo(.85, 2);
      if (platform === 'desktop') {
        await expect(page.locator('[data-r4-depth-mask-run]')).not.toHaveCount(0);
        const box = await page.locator('[data-scroll-effect] canvas').first().boundingBox();
        expect(box?.height).toBeLessThanOrEqual(900);
      }
      await page.screenshot({ path: `/tmp/tongye-depth-${platform}.png` });
    });

    test('rapid supersession, two round trips, keyboard and lifecycle restoration', async ({ page }) => {
      test.setTimeout(120000);
      await page.goto('/#method');
      await expect.poll(async () => (await state(page))?.view.status, { timeout: 25000 }).toBe('ready');
      const counts: number[] = [];
      for (let round = 0; round < 2; round++) {
        await page.evaluate(() => {
          const api = (window as unknown as { __r5ScrollStory: {
            index(): { ranges: Array<{ id: string; start: number; end: number }> }; seek(y: number): void;
          } }).__r5ScrollStory;
          for (const id of ['hero-pattern', 'figure3-services', 'crane-contact', 'ph-education']) {
            const r = api.index().ranges.find((r) => r.id === id)!; api.seek(r.start + (r.end - r.start) * .65);
          }
        });
        await expect.poll(async () => (await state(page))?.desired.rangeId).toBe('ph-education');
        await expect.poll(async () => (await state(page))?.presented?.progress, { timeout: 25000 }).toBeCloseTo(.65, 2);
        counts.push(await page.locator('.story-scroll video').count());
        await seekRange(page, 'crane-contact', .65);
        expect(await page.locator('.story-scroll video').count()).toBe(2);
        await seekRange(page, 'hero-pattern', .65);
      }
      expect(counts[1]).toBe(counts[0]);
      await page.keyboard.press('End');
      await expect.poll(async () => (await state(page))?.desired.rangeId).toBe('hold:contact');
      await page.keyboard.press('Home');
      await expect.poll(async () => (await state(page))?.desired.rangeId).toBe('hold:hero');
      await seekRange(page, 'hold:services', .55);
      const saved = (await state(page))!.desired.readingOffset;
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
      await expect.poll(async () => (await state(page))?.view.status).toBe('suspended');
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
      await expect.poll(async () => (await state(page))?.view.status, { timeout: 25000 }).toBe('ready');
      expect((await state(page))!.desired.readingOffset).toBeCloseTo(saved, 0);
      await scroll(page, 140);
      await expect.poll(async () => (await state(page))?.desired.readingOffset).toBeGreaterThan(saved + 50);
    });

    test('rotation retains the reading block and animation progress', async ({ page }) => {
      await page.goto('/#method');
      await expect.poll(async () => (await state(page))?.view.status, { timeout: 25000 }).toBe('ready');
      await seekRange(page, 'hold:method-top', .5);
      const bookmark = await page.locator('[data-scroll-content="method-top"]').evaluate((surface) => {
        const nodes = [...surface.querySelectorAll('h1,h2,h3,p,li,blockquote')];
        const node = nodes.find((node) => { const r = node.getBoundingClientRect(); return r.height > 0 && r.bottom > 100 && r.top < innerHeight; })!;
        node.setAttribute('data-test-bookmark', 'true'); return node.getBoundingClientRect().top;
      });
      await page.setViewportSize(platform === 'phone' ? { width: 844, height: 390 } : { width: 1200, height: 800 });
      await expect.poll(async () => (await state(page))?.view.status, { timeout: 25000 }).toBe('ready');
      // Preserve the same block/offset; native WebKit scroll/layout rounds by up
      // to a few CSS pixels during portrait-to-landscape viewport rescaling.
      await expect.poll(async () => Math.abs(await page.locator('[data-test-bookmark]').evaluate((node) => node.getBoundingClientRect().top) - bookmark)).toBeLessThan(4);
      await seekRange(page, 'figure2-distance-expand', .65);
      await page.setViewportSize(platform === 'phone' ? { width: 390, height: 844 } : { width: 1440, height: 900 });
      await expect.poll(async () => (await state(page))?.presented?.progress, { timeout: 25000 }).toBeCloseTo(.65, 2);
    });

    test('native wheel crosses a reading seam without a second gesture', async ({ page }) => {
      test.skip(platform === 'phone' && test.info().project.name === 'webkit', 'Mobile WebKit automation cannot inject wheel or touch-drag; physical touch remains unverified.');
      await page.goto('/#method');
      await expect.poll(async () => (await state(page))?.view.status, { timeout: 25000 }).toBe('ready');
      await seekRange(page, 'hold:method-top', .98);
      await page.locator('[data-story-loader]').waitFor({ state: 'hidden' });
      await page.evaluate(() => {
        const probe = window as unknown as { __scrollCoverSeen: boolean; __scrollCoverObserver: MutationObserver };
        probe.__scrollCoverSeen = false;
        probe.__scrollCoverObserver = new MutationObserver(() => {
          if (document.querySelector('.story-scroll__cover')) probe.__scrollCoverSeen = true;
        });
        probe.__scrollCoverObserver.observe(document.querySelector('.story-scroll')!, { subtree: true, childList: true });
      });
      await page.mouse.move(100, 400);
      await page.mouse.wheel(0, 500);
      await expect.poll(async () => (await state(page))?.desired.rangeId).toBe('method-bottom-figure2');
      await expect.poll(async () => (await state(page))?.presented?.progress, { timeout: 25000 }).toBeGreaterThan(.1);
      await page.mouse.wheel(0, -550);
      await expect.poll(async () => (await state(page))?.desired.rangeId).toBe('hold:method-top');
      expect(await page.evaluate(() => {
        const probe = window as unknown as { __scrollCoverSeen: boolean; __scrollCoverObserver: MutationObserver };
        probe.__scrollCoverObserver.disconnect();
        return probe.__scrollCoverSeen;
      })).toBe(false);
    });

    test('navigation, history, refresh and Proof aliases preserve semantic positions', async ({ page }) => {
      test.setTimeout(120000);
      await page.goto('/#figure2-proof-cards');
      await expect.poll(async () => (await state(page))?.desired.rangeId, { timeout: 25000 }).toBe('hold:figure2-proof');
      await expect.poll(async () => (await state(page))?.desired.readingOffset).toBeGreaterThan(700);
      const navigate = (hash: string) => page.evaluate((hash) => (window as unknown as { __r5ScrollStory: { navigate(hash: string): void } }).__r5ScrollStory.navigate(hash), hash);
      await navigate('#services'); await seekRange(page, 'hold:services', .6);
      const saved = (await state(page))!.desired.readingOffset;
      await navigate('#education');
      await expect.poll(async () => (await state(page))?.desired.rangeId).toBe('hold:education');
      await page.goBack();
      await expect.poll(async () => (await state(page))?.desired.rangeId).toBe('hold:services');
      await expect.poll(async () => (await state(page))?.desired.readingOffset).toBeCloseTo(saved, 0);
      await page.reload();
      await expect.poll(async () => (await state(page))?.desired.rangeId, { timeout: 25000 }).toBe('hold:services');
      await expect.poll(async () => (await state(page))?.desired.readingOffset).toBeCloseTo(saved, 0);
    });

    test('reduced motion changes preserve the visible chapter and remove transition distances', async ({ page }) => {
      await page.goto('/#education');
      await expect.poll(async () => (await state(page))?.view.status, { timeout: 25000 }).toBe('ready');
      await seekRange(page, 'ph-education', .9);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expect.poll(async () => (await state(page))?.desired.rangeId).toBe('hold:education');
      await expect(page.locator('.story-scroll')).toHaveAttribute('data-scroll-reduced-motion', 'true');
      expect(await page.evaluate(() => (window as unknown as { __r5ScrollStory: { index(): { ranges: Array<{ kind: string }> } } }).__r5ScrollStory.index().ranges.every(({ kind }) => kind === 'hold'))).toBe(true);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await expect.poll(async () => (await state(page))?.desired.rangeId).toBe('hold:education');
    });

    test('visible menu destinations remain independently scrollable', async ({ page }) => {
      test.setTimeout(60000);
      await page.goto('/#method');
      await expect.poll(async () => (await state(page))?.view.status, { timeout: 25000 }).toBe('ready');
      for (const [label, scene] of [['场景', 'services'], ['留学', 'education'], ['方法', 'method-top'], ['留学', 'education']]) {
        if (platform === 'phone') await page.getByRole('button', { name: '菜单', exact: true }).click();
        await page.locator('#story-menu').getByRole('link', { name: label, exact: true }).click();
        await expect.poll(async () => (await state(page))?.desired.rangeId).toBe(`hold:${scene}`);
        await expect.poll(async () => (await state(page))?.view.status).toBe('ready');
        await scroll(page, 120);
        await expect.poll(async () => (await state(page))?.desired.readingOffset).toBeGreaterThan(50);
        expect(await page.locator(`[data-scroll-content="${scene}"]`).evaluate((node) => (node as HTMLElement).inert)).toBe(false);
      }
    });

    test('failed depth resource does not lock navigation or the reading axis', async ({ page }) => {
      await page.route('**/figure2-depth-mask-atlas*', (route) => route.abort());
      await page.goto('/#method');
      await expect.poll(async () => (await state(page))?.view.status, { timeout: 25000 }).toBe('ready');
      await page.evaluate(() => {
        const api = (window as unknown as { __r5ScrollStory: { index(): { ranges: Array<{ id: string; start: number; end: number }> }; seek(y: number): void } }).__r5ScrollStory;
        const range = api.index().ranges.find((r) => r.id === 'figure2-distance-expand')!;
        api.seek(range.start + (range.end - range.start) * .85);
      });
      await expect.poll(async () => (await state(page))?.view.status, { timeout: 25000 }).toBe('failed');
      if (platform === 'phone') await page.getByRole('button', { name: '菜单', exact: true }).click();
      await page.locator('#story-menu').getByRole('link', { name: '留学', exact: true }).click();
      await expect.poll(async () => (await state(page))?.view.status).toBe('ready');
      await scroll(page, 140);
      await expect.poll(async () => (await state(page))?.desired.readingOffset).toBeGreaterThan(50);
    });

    if (platform === 'phone') test('Lenis touch follows drag, coasts, stops on contact, reverses and cancels', async ({ page, browserName }) => {
      test.skip(browserName !== 'chromium', 'Trusted touch drag injection requires Chromium CDP; physical iPhone remains required.');
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      await page.goto('/#method');
      await expect(page).toHaveTitle(/同野观幂/);
      await expect(page.locator('vite-error-overlay')).toHaveCount(0);
      await expect.poll(async () => (await state(page))?.view.status, { timeout: 25000 }).toBe('ready');
      await seekRange(page, 'hold:method-top', .15);
      await page.evaluate(() => {
        const moves: boolean[] = [];
        Object.assign(window, { touchMovesPrevented: moves });
        window.addEventListener('touchmove', (event) => moves.push(event.defaultPrevented), { passive: true });
        window.addEventListener('touchend', () => Object.assign(window, { touchReleaseY: scrollY }), { capture: true, passive: true });
      });
      const session = await page.context().newCDPSession(page);
      const touch = (type: string, y = 650) => session.send('Input.dispatchTouchEvent', {
        type, touchPoints: ['touchEnd', 'touchCancel'].includes(type) ? [] : [{ x: 180, y }]
      });
      const position = () => page.evaluate(() => scrollY);
      const frames = (count: number) => page.evaluate(async (n) => {
        for (let i = 0; i < n; i++) await new Promise(requestAnimationFrame);
      }, count);
      const start = await position();
      await touch('touchStart');
      for (const y of [630, 610, 590, 570, 550, 530]) { await touch('touchMove', y); await frames(2); }
      const dragged = await position();
      expect(dragged - start).toBeGreaterThan(90);
      expect(dragged - start).toBeLessThan(145);
      const prevented = await page.evaluate(() => (window as unknown as { touchMovesPrevented: boolean[] }).touchMovesPrevented);
      expect(prevented.length).toBeGreaterThan(0); expect(prevented.every(Boolean)).toBe(true);
      // Do not pause for diagnostic round trips between the last move and lift:
      // Lenis correctly removes inertia when the finger has already stopped.
      await touch('touchMove', 490);
      await touch('touchMove', 350);
      await touch('touchEnd'); await frames(5);
      const released = await page.evaluate(() => (window as unknown as { touchReleaseY: number }).touchReleaseY);
      expect(await position()).toBeGreaterThan(released + 3);
      await touch('touchStart', 550); await frames(2);
      const stopped = await position(); await frames(12);
      expect(Math.abs(await position() - stopped)).toBeLessThanOrEqual(1);
      for (const y of [575, 600, 625]) { await touch('touchMove', y); await frames(2); }
      expect(await position()).toBeLessThan(stopped - 45);
      await touch('touchCancel'); await frames(2);
      const cancelled = await position(); await frames(12);
      expect(Math.abs(await position() - cancelled)).toBeLessThanOrEqual(1);
      // A fresh single-finger gesture must recover after cancellation.
      await touch('touchStart');
      for (const y of [625, 600, 575]) { await touch('touchMove', y); await frames(2); }
      await touch('touchEnd');
      await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('lenis-smooth'))).toBe(false);
      const settled = await position(); await frames(12);
      expect(Math.abs(await position() - settled)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: '/tmp/tongye-phone-lenis-touch.png' });
      expect(errors).toEqual([]);
      await session.detach();
    });

    if (platform === 'phone') test('touch remains native for pinch and reduced motion, and menu navigation cancels inertia', async ({ page, browserName }) => {
      test.skip(browserName !== 'chromium', 'Trusted touch drag injection requires Chromium CDP; physical iPhone remains required.');
      await page.goto('/#method');
      await expect.poll(async () => (await state(page))?.view.status, { timeout: 25000 }).toBe('ready');
      await seekRange(page, 'hold:method-top', .15);
      await page.evaluate(() => {
        const moves: boolean[] = [];
        Object.assign(window, { touchMovesPrevented: moves });
        window.addEventListener('touchmove', (event) => moves.push(event.defaultPrevented), { passive: true });
      });
      const session = await page.context().newCDPSession(page);
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 140, y: 550 }, { x: 240, y: 550 }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 130, y: 540 }, { x: 250, y: 540 }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      expect(await page.evaluate(() => (window as unknown as { touchMovesPrevented: boolean[] }).touchMovesPrevented)).toContain(false);
      // Reload clears any viewport pinch scale before testing reduced motion.
      await page.reload();
      await expect.poll(async () => (await state(page))?.view.status, { timeout: 25000 }).toBe('ready');
      expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
      await seekRange(page, 'hold:method-top', .15);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expect(page.locator('.story-scroll')).toHaveAttribute('data-scroll-reduced-motion', 'true');
      await seekRange(page, 'hold:method-top', .15);
      const flick = async () => {
        await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 180, y: 650 }] });
        for (const y of [620, 590, 560, 530]) {
          await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 180, y }] });
          await page.evaluate(() => new Promise(requestAnimationFrame));
        }
        await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 180, y: 350 }] });
        await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      };
      const before = await page.evaluate(() => scrollY);
      await flick();
      await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before + 30);
      expect(await page.evaluate(() => document.documentElement.classList.contains('lenis-smooth'))).toBe(false);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await expect(page.locator('.story-scroll')).toHaveAttribute('data-scroll-reduced-motion', 'false');
      await seekRange(page, 'hold:method-top', .15);
      await flick();
      expect(await page.evaluate(() => document.documentElement.classList.contains('lenis-smooth'))).toBe(true);
      await page.getByRole('button', { name: '菜单', exact: true }).click();
      await page.locator('#story-menu').getByRole('link', { name: '留学', exact: true }).click();
      await expect.poll(async () => (await state(page))?.desired.rangeId).toBe('hold:education');
      await expect.poll(async () => (await state(page))?.view.status).toBe('ready');
      const anchor = await page.evaluate(() => scrollY);
      await page.waitForTimeout(500);
      expect(Math.abs(await page.evaluate(() => scrollY) - anchor)).toBeLessThanOrEqual(1);
      await session.detach();
    });

    if (platform === 'phone') test('native touch crosses a seam at narrow and wide phone sizes', async ({ page, browserName }) => {
      test.skip(browserName !== 'chromium', 'WebKit automation exposes taps, not a native touch-drag API; physical iPhone remains required.');
      test.setTimeout(60000);
      const session = await page.context().newCDPSession(page);
      for (const viewport of [{ width: 360, height: 800 }, { width: 430, height: 932 }]) {
        await page.setViewportSize(viewport); await page.goto('/#method');
        await expect.poll(async () => (await state(page))?.view.status, { timeout: 25000 }).toBe('ready');
        await seekRange(page, 'hold:method-top', .98);
        await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 180, y: 650 }] });
        for (const y of [570, 490, 410, 330, 250]) {
          await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 180, y }] });
          await page.evaluate(() => new Promise(requestAnimationFrame));
        }
        await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await expect.poll(async () => (await state(page))?.desired.rangeId).not.toBe('hold:method-top');
        await expect.poll(async () => (await state(page))?.view.status, { timeout: 25000 }).toBe('ready');
      }
      await session.detach();
    });
  });
}
