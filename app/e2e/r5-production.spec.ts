import { expect, test } from '@playwright/test';
import {
  bootStory,
  canonicalScenes,
  eventTypes,
  expectLayerInvariants,
  moveOneHold,
  navigateStory,
  reachReadingEdge,
  storySnapshot,
  waitForHold
} from './r5-helpers';

test('public root boots the production StoryApp without scaffold or harness code', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      const source = message.location().url;
      errors.push(source ? `${message.text()} (${source})` : message.text());
    }
  });

  const snapshot = await bootStory(page);

  await expect(page.locator('[data-production-story-app="true"]')).toBeVisible();
  await expect(page.locator('[data-testid="r0-scaffold"]')).toHaveCount(0);
  await expect(page.locator('.static-content')).toBeHidden();
  await expect(page.locator('.site-nav')).toBeHidden();
  await expect(page.locator('.scroll-edge-blur')).toBeHidden();
  await expect(page).toHaveTitle('同野观幂｜AI 转型与能力建设');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    /同野观幂是一家面向组织与个人能力建设的 AI 转型咨询公司/
  );
  expect(snapshot.current).toBe('hero');
  expect(new URL(page.url()).hash).toBe('');
  expect(snapshot.loadedScenes).toContain('hero');
  expect(snapshot.loadedScenes.length).toBeLessThanOrEqual(2);
  expect(snapshot).toMatchObject({
    loaderMode: 'cold-hero',
    loaderStatus: 'hidden',
    heroIntroMode: 'complete',
    presentationReady: true
  });
  expect(errors).toEqual([]);
  await expectLayerInvariants(page);
});

test('cold Hero loader gates the 2.7s intro, local stacking, parallax, and progressive nav', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'full presentation timing runs once');
  test.setTimeout(120_000);

  await page.addInitScript(() => {
    const releaseCounter = '__r5LostWebglContexts';
    (window as Window & { __r5LostWebglContexts?: number })[releaseCounter] = 0;
    const prototypes = [
      typeof WebGLRenderingContext === 'undefined' ? null : WebGLRenderingContext.prototype,
      typeof WebGL2RenderingContext === 'undefined' ? null : WebGL2RenderingContext.prototype
    ];
    for (const prototype of new Set(prototypes)) {
      if (!prototype) continue;
      const original = prototype.getExtension;
      if (!original) continue;
      prototype.getExtension = function getExtension(name: string) {
        const extension = original.call(this, name);
        if (name !== 'WEBGL_lose_context' || !extension || typeof extension.loseContext !== 'function') {
          return extension;
        }
        return Object.assign(Object.create(extension), {
          loseContext() {
            (window as Window & { __r5LostWebglContexts?: number })[releaseCounter] = (
              (window as Window & { __r5LostWebglContexts?: number })[releaseCounter] ?? 0
            ) + 1;
            return extension.loseContext();
          }
        });
      };
    }
  });

  await page.goto('/?presentation=cold', { waitUntil: 'domcontentloaded' });
  const loader = page.locator('[data-story-loader="true"]');
  const loaderInk = loader.locator('[data-loader-ink-canvas="true"]');
  const hero = page.locator('[data-r4-scene="hero"]');
  const heroVideo = hero.locator('[data-hero-figure-video]');
  const heroIntroInk = hero.locator('[data-hero-intro-ink-canvas]');
  await expect(loader).toBeVisible();
  await expect(loader).toHaveAttribute('data-loader-mode', 'cold-hero');
  await expect(loader.locator('[aria-live="polite"]')).toHaveCount(1);
  await expect(loaderInk).toHaveCount(1);
  await expect(loaderInk).toHaveAttribute('data-loader-ink-status', 'active', { timeout: 3_000 });
  await expect(loaderInk).toHaveAttribute('data-loader-ink-active', 'true');
  await expect(loader).toHaveAttribute('data-loader-phrase', '1', { timeout: 6_000 });
  await expect(hero).toHaveAttribute('data-hero-intro-state', 'waiting');
  await expect(hero).toHaveAttribute('data-hero-progress', '0.0000');
  await expect.poll(() => heroVideo.evaluate((video: HTMLVideoElement) => ({
    paused: video.paused,
    currentTime: video.currentTime,
    poster: new URL(video.poster).pathname,
    preload: video.preload
  }))).toMatchObject({
    paused: true,
    currentTime: expect.closeTo(0, 2),
    poster: expect.stringMatching(/\/hero-figure-poster-[^/]+\.webp$/),
    preload: 'none'
  });
  await expect(hero.evaluate((root) => {
    const style = getComputedStyle(root);
    return {
      middleIntro: Number.parseFloat(style.getPropertyValue('--r4-hero-middle-intro')),
      figureIntro: Number.parseFloat(style.getPropertyValue('--r4-hero-figure-intro'))
    };
  })).resolves.toEqual({ middleIntro: 0, figureIntro: 0 });

  await expect(loader).toBeHidden({ timeout: 7_000 });
  await expect(loaderInk).toHaveAttribute('data-loader-ink-status', 'disposed');
  await expect.poll(async () => hero.getAttribute('data-hero-intro-state'), { timeout: 2_000 })
    .toBe('running');
  await expect.poll(() => heroIntroInk.getAttribute('data-hero-intro-ink-active'), { timeout: 2_000 })
    .toBe('true');
  await expect(heroIntroInk).toHaveAttribute('data-r4-ink-renderer-status', 'active');
  expect((await storySnapshot(page)).webglCanvases).toBeGreaterThanOrEqual(1);
  await expect(heroIntroInk).toBeVisible();
  await expect.poll(() => heroVideo.evaluate((video: HTMLVideoElement) => ({
    paused: video.paused,
    currentTime: video.currentTime
  }))).toMatchObject({ paused: true, currentTime: expect.closeTo(0, 2) });
  await expect(hero).toHaveAttribute('data-hero-title-active', 'true', { timeout: 4_000 });
  await page.waitForFunction(() => window.__storyApp?.snapshot().presentationReady === true, undefined, {
    timeout: 5_000
  });
  expect(await storySnapshot(page)).toMatchObject({
    loaderStatus: 'hidden',
    heroIntroMode: 'complete',
    presentationReady: true
  });
  await expect(hero).toHaveAttribute('data-hero-progress', '1.0000');
  await expect(heroIntroInk).toHaveAttribute('data-hero-intro-ink-active', 'false');
  await expect.poll(() => heroVideo.evaluate((video: HTMLVideoElement) => ({
    paused: video.paused,
    currentTime: video.currentTime
  }))).toMatchObject({ paused: true, currentTime: expect.closeTo(0, 2) });

  const stacking = await hero.evaluate((root) => {
    const stage = root.querySelector<HTMLElement>('.r4-hero-scene__stage');
    const back = root.querySelector<HTMLElement>('.r4-hero-scene__back');
    const copy = root.querySelector<HTMLElement>('.r4-hero-scene__content');
    const figure = root.querySelector<HTMLElement>('.r4-hero-scene__figure');
    if (!stage || !back || !copy || !figure) throw new Error('Hero stacking nodes missing');
    return {
      copyInsideStage: copy.parentElement === stage,
      backZ: Number.parseInt(getComputedStyle(back).zIndex, 10),
      copyZ: Number.parseInt(getComputedStyle(copy).zIndex, 10),
      figureZ: Number.parseInt(getComputedStyle(figure).zIndex, 10)
    };
  });
  expect(stacking.copyInsideStage).toBe(true);
  expect(stacking.backZ).toBeLessThan(stacking.copyZ);
  expect(stacking.copyZ).toBeLessThan(stacking.figureZ);

  await expect(hero).toHaveAttribute('data-hero-parallax-active', 'true');
  await page.mouse.move(1_280, 720);
  await expect.poll(async () => hero.evaluate((root) => Number.parseFloat(
    getComputedStyle(root).getPropertyValue('--r4-hero-back-parallax-x')
  ))).toBeGreaterThan(0);
  const sampledOffsets = await hero.evaluate((root) => {
    const style = getComputedStyle(root);
    return [
      Number.parseFloat(style.getPropertyValue('--r4-hero-back-parallax-x')),
      Number.parseFloat(style.getPropertyValue('--r4-hero-middle-parallax-x')),
      Number.parseFloat(style.getPropertyValue('--r4-hero-figure-parallax-x'))
    ];
  });
  expect(sampledOffsets[0]).toBeGreaterThan(0);
  expect(sampledOffsets[1]).toBeCloseTo(sampledOffsets[0]! * 2, 1);
  expect(sampledOffsets[2]).toBeCloseTo(sampledOffsets[0]! * 3, 1);
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerleave')));
  await expect.poll(async () => hero.evaluate((root) => Math.abs(Number.parseFloat(
    getComputedStyle(root).getPropertyValue('--r4-hero-figure-parallax-x')
  ))), { timeout: 5_000 }).toBeLessThan(0.1);

  const nav = page.locator('.site-nav');
  const blur = page.locator('.scroll-edge-blur');
  await expect(nav).toBeHidden();
  expect(await nav.getAttribute('inert')).not.toBeNull();
  await expect(blur).toHaveCount(0);
  expect(await nav.locator('a').first().evaluate((link) => {
    link.focus();
    return document.activeElement === link;
  })).toBe(false);

  expect((await moveOneHold(page, 1)).current).toBe('pattern');
  await expect(nav).toBeHidden();
  await expect(blur).toBeHidden();
  expect((await moveOneHold(page, 1)).current).toBe('star-map');
  await expect(nav).toBeVisible();
  await expect(blur).toBeVisible();
  expect(await blur.locator('.scroll-edge-blur__layer').count()).toBe(7);
  expect((await moveOneHold(page, -1)).current).toBe('pattern');
  await expect(nav).toBeHidden();
  await expect(blur).toBeHidden();
  expect((await moveOneHold(page, -1)).current).toBe('hero');
  await expect(nav).toBeHidden();
  await expect(blur).toBeHidden();
  await expect(hero).toHaveAttribute('data-hero-parallax-active', 'true');
  await expect(loader).toHaveCount(1);
  await expect(loader).toBeHidden();

  await navigateStory(page, 'contact');
  await expect.poll(() => page.evaluate(() => (
    (window as Window & { __r5LostWebglContexts?: number }).__r5LostWebglContexts ?? 0
  )), { timeout: 5_000 }).toBeGreaterThan(0);
});

test('direct entries use the readiness cover and reduced motion renders the Hero endpoint', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'presentation variants run once');

  for (const scene of ['method-top', 'contact'] as const) {
    const snapshot = await bootStory(page, `/?presentation=direct#${scene}`);
    expect(snapshot).toMatchObject({
      current: scene,
      loaderMode: 'direct',
      loaderStatus: 'hidden',
      heroIntroMode: 'endpoint',
      presentationReady: true
    });
    const directLoader = page.locator('[data-story-loader="true"]');
    await expect(directLoader).toHaveAttribute('data-loader-ink-status', 'fallback');
    await expect(directLoader.locator('[data-loader-ink-canvas="true"]')).not.toHaveAttribute(
      'data-loader-ink-active',
      'true'
    );
  }

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reduced = await bootStory(page, '/?presentation=reduced');
  expect(reduced).toMatchObject({
    current: 'hero',
    loaderMode: 'reduced',
    loaderStatus: 'hidden',
    heroIntroMode: 'endpoint',
    presentationReady: true,
    reducedMotion: true
  });
  const reducedLoader = page.locator('[data-story-loader="true"]');
  await expect(reducedLoader).toHaveAttribute('data-loader-ink-status', 'fallback');
  await expect(reducedLoader.locator('[data-loader-ink-canvas="true"]')).not.toHaveAttribute(
    'data-loader-ink-active',
    'true'
  );
  const hero = page.locator('[data-r4-scene="hero"]');
  await expect(hero).toHaveAttribute('data-hero-progress', '1.0000');
  await expect(hero).not.toHaveAttribute('data-hero-parallax-active', 'true');
});

test('Contact renders the canonical filing footer once in the interactive story', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'global production metadata runs once');

  await bootStory(page, '/?presentation=direct#contact');
  const footer = page.locator('[data-production-story-app="true"] [data-site-footer="true"]');
  await expect(footer).toBeVisible();
  await expect(footer).toHaveCount(1);
  await expect(footer.getByText('© 上海同野观幂科技有限公司', { exact: true })).toHaveCount(1);
  await expect(footer.getByText('AI Transformation & Capability Building', { exact: true })).toHaveCount(1);
  await expect(footer.getByRole('link', { name: '服务备案号 沪ICP备2024086119号-3', exact: true }))
    .toHaveAttribute('href', 'https://beian.miit.gov.cn/');
  await expect(footer.getByRole('link', { name: '沪公网安备 31011502406697号（新窗口打开）', exact: true }))
    .toHaveAttribute('href', 'https://www.beian.gov.cn/portal/registerSystemInfo?recordcode=31011502406697');
  await expect(page.locator('.static-content [data-site-footer="true"]')).toBeHidden();

  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', /\/assets\/favicon-[^/]+\.svg$/);
  await expect(page.locator('link[rel="preload"][as="font"]')).toHaveAttribute(
    'href',
    /\/assets\/qiji-title-subset-[^/]+\.ttf$/
  );
  expect(await page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement);
    return {
      title: styles.getPropertyValue('--font-title'),
      sans: styles.getPropertyValue('--font-sans'),
      traditional: styles.getPropertyValue('--font-traditional')
    };
  })).toMatchObject({
    title: expect.stringContaining('Tongye Title'),
    sans: expect.stringContaining('PingFang SC'),
    traditional: expect.stringContaining('Songti SC')
  });
});

test('Hero boot failure removes the loader and leaves the crawlable static shell', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'boot failure injection runs once');

  const indexResponse = await page.request.get('/');
  const indexHtml = await indexResponse.text();
  const mainSource = indexHtml.match(/<script[^>]+src="([^"]+\.js)"/)?.[1];
  if (!mainSource) throw new Error('release main script missing');

  await page.route('**/assets/*.js', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const filename = pathname.split('/').at(-1) ?? '';
    if (pathname === mainSource || filename.startsWith('StoryNav-')) {
      await route.continue();
      return;
    }
    if (filename.startsWith('index-')) {
      await route.abort('failed');
      return;
    }
    await route.continue();
  });

  await page.goto('/?presentation=boot-failure', { waitUntil: 'domcontentloaded' });
  const loader = page.locator('[data-story-loader="true"]');
  await expect(loader).toBeHidden({ timeout: 3_000 });
  await expect(page.locator('.static-content')).toBeVisible();
  await expect(page.locator('.static-content h1')).toContainText('同');
  await expect(page.locator('[data-production-story-app="true"]')).toBeHidden();
  expect(await page.locator('html').getAttribute('data-story-hydrated')).toBeNull();
});

test('slow next-scene assets do not block the current production hold', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'slow prefetch probe runs once');
  let releasePatternRequest = () => undefined;
  let patternRequestStarted = false;
  const patternGate = new Promise<void>((resolve) => {
    releasePatternRequest = resolve;
  });
  await page.route('**/*pattern-layer-alpha-06*.webp', async (route) => {
    patternRequestStarted = true;
    await patternGate;
    await route.continue();
  });

  try {
    const snapshot = await bootStory(page);
    expect(snapshot.current).toBe('hero');
    await expect(page.locator('[data-stage-layer="hero"]')).toBeVisible();
    await expect.poll(() => patternRequestStarted).toBe(true);
  } finally {
    releasePatternRequest();
  }

  await page.keyboard.press('PageDown');
  await waitForHold(page, 'pattern');
  await expectLayerInvariants(page);
});

test('menu navigation pushes history and browser history restores the prior hold', async ({ page }) => {
  await bootStory(page);
  expect((await moveOneHold(page, 1)).current).toBe('pattern');
  expect((await moveOneHold(page, 1)).current).toBe('star-map');
  await expect(page.locator('.site-nav')).toBeVisible();
  const openMobileMenu = async () => {
    const toggle = page.getByRole('button', { name: '菜单' });
    if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') === 'false') {
      await toggle.click();
    }
  };
  await openMobileMenu();
  await page.getByRole('link', { name: '方法' }).click();
  await waitForHold(page, 'method-top');
  expect(new URL(page.url()).hash).toBe('#method');

  await openMobileMenu();
  await page.getByRole('link', { name: '联系' }).click();
  await waitForHold(page, 'contact');
  await page.goBack();
  await waitForHold(page, 'method-top');

  expect(new URL(page.url()).hash).toBe('#method');
  await expectLayerInvariants(page);
});

test('the latest navigation request wins when an earlier lazy scene loads slowly', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'navigation race runs once');
  await page.route('**/method-top-*.js', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.continue();
  });
  await bootStory(page);

  await page.evaluate(async () => {
    const app = window.__storyApp;
    if (!app) throw new Error('StoryApp API unavailable');
    await Promise.all([
      app.navigate('method-top'),
      app.navigate('contact')
    ]);
  });

  await waitForHold(page, 'contact');
  expect(new URL(page.url()).hash).toBe('#contact');
  await expectLayerInvariants(page);
});

test('every canonical hash boots directly and public aliases remain supported', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'exhaustive hash sweep runs once');

  for (const scene of canonicalScenes.filter((scene) => scene !== 'method-bottom')) {
    const snapshot = await bootStory(page, `/?hash=${scene}#${scene}`);
    expect(snapshot.current, `hash #${scene}`).toBe(scene);
    await expectLayerInvariants(page);
  }

  for (const [hash, scene] of [
    ['home', 'hero'],
    ['method', 'method-top'],
    ['figure2-proof-opening', 'figure2-proof'],
    ['figure2-proof-cards', 'figure2-proof'],
    ['figure2-proof-closing', 'figure2-proof'],
    ['services', 'services'],
    ['education', 'education'],
    ['contact', 'contact']
  ] as const) {
    expect((await bootStory(page, `/?alias=${hash}#${hash}`)).current).toBe(scene);
  }

  expect((await bootStory(page, '/?alias=retired#philosophy')).current).toBe('hero');
});

test('reduced motion keeps the same contract and settles without cinematic delay', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await bootStory(page);
  const startedAt = Date.now();
  await page.keyboard.press('PageDown');
  await waitForHold(page, 'pattern');
  const elapsedMs = Date.now() - startedAt;

  expect(elapsedMs).toBeLessThan(2_000);
  expect((await storySnapshot(page)).reducedMotion).toBe(true);
  await expect(page.locator('[data-r4-ink-segment]')).toHaveCount(0);
  await expectLayerInvariants(page);
});

test('reading input absorbs the gesture that reaches an edge, then accepts one clear outward gesture', async ({ page }) => {
  await bootStory(page, '/#method');
  await expect(page.locator('[data-stage-layer="method-top"] [data-reading-scrollport="true"]')).toHaveCount(0);
  await page.keyboard.press('PageDown');
  await waitForHold(page, 'method-bottom');
  const scrollport = page.locator('[data-stage-layer="method-bottom"] [data-reading-scrollport="true"]');
  await expect(scrollport).toBeVisible();
  await expect.poll(() => scrollport.evaluate((element) => element.scrollTop)).toBe(0);

  await scrollport.dispatchEvent('wheel', {
    bubbles: true,
    cancelable: true,
    deltaMode: 0,
    deltaY: 120
  });
  await expect.poll(() => scrollport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(await storySnapshot(page)).toMatchObject({ current: 'method-bottom', phase: 'hold' });
  await reachReadingEdge(page, 1);
  await expect.poll(() => scrollport.evaluate((element) => (
    Math.abs(element.scrollTop + element.clientHeight - element.scrollHeight)
  ))).toBeLessThan(1);

  await page.keyboard.press('PageDown');
  await waitForHold(page, 'figure2-animation');
  await expectLayerInvariants(page);

  await page.keyboard.press('PageUp');
  await waitForHold(page, 'method-bottom');
  await expect.poll(async () => scrollport.evaluate((element) => (
    element.scrollTop + element.clientHeight >= element.scrollHeight - 1
  ))).toBe(true);
  await expectLayerInvariants(page);

  expect((await moveOneHold(page, -1)).current).toBe('method-top');
  await expect(page.locator('[data-stage-layer="method-top"] [data-reading-scrollport="true"]')).toHaveCount(0);
  await expectLayerInvariants(page);
});

test('Figure2 Proof owns one snap-free scrollport and accepts incremental wheel input across its panels', async ({ page }) => {
  await bootStory(page, '/#figure2-proof');
  const layer = page.locator('[data-stage-layer="figure2-proof"]');
  const scrollport = layer.locator('[data-reading-scrollport="true"]');
  await expect(scrollport).toBeVisible();

  const initial = await layer.evaluate((root) => {
    const scroller = root.querySelector<HTMLElement>('[data-reading-scrollport="true"]');
    if (!scroller) throw new Error('Figure2 Proof scrollport missing');
    return {
      explicitScrollports: root.querySelectorAll('[data-reading-scrollport="true"]').length,
      panels: scroller.querySelectorAll('[data-r4-proof-panel]').length,
      layerScrollTop: root.scrollTop,
      layerOverflowY: getComputedStyle(root).overflowY,
      scrollTop: scroller.scrollTop,
      clientHeight: scroller.clientHeight,
      scrollHeight: scroller.scrollHeight,
      viewportHeight: window.innerHeight,
      overflowY: getComputedStyle(scroller).overflowY,
      snapType: getComputedStyle(scroller).scrollSnapType
    };
  });
  expect(initial).toMatchObject({
    explicitScrollports: 1,
    panels: 3,
    layerScrollTop: 0,
    layerOverflowY: 'hidden',
    scrollTop: 0,
    overflowY: 'auto',
    snapType: 'none'
  });
  expect(Math.abs(initial.clientHeight - initial.viewportHeight)).toBeLessThan(2);
  expect(initial.scrollHeight).toBeGreaterThan(initial.clientHeight * 2.9);

  const samples: number[] = [];
  for (let index = 0; index < 7; index += 1) {
    await scrollport.dispatchEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaMode: 0,
      deltaY: 80
    });
    samples.push(await scrollport.evaluate((element) => element.scrollTop));
    await page.waitForTimeout(24);
  }
  expect(samples.every((value, index) => index === 0 || value > samples[index - 1]!)).toBe(true);
  const burstDisplacement = samples.at(-1) ?? 0;
  expect(burstDisplacement).toBeGreaterThan(initial.viewportHeight * 0.35);
  expect(burstDisplacement).toBeLessThan(initial.viewportHeight * 0.65);
  expect(samples.every((value) => Math.abs(value - initial.viewportHeight) > 20)).toBe(true);

  // The remaining momentum belongs to this physical gesture: it may consume
  // the small budget remainder, but a following tail must be absorbed before
  // it can reach a reading edge or leave Proof.
  await scrollport.dispatchEvent('wheel', {
    bubbles: true,
    cancelable: true,
    deltaMode: 0,
    deltaY: 500
  });
  const budgetExhaustedScrollTop = await scrollport.evaluate((element) => element.scrollTop);
  await scrollport.dispatchEvent('wheel', {
    bubbles: true,
    cancelable: true,
    deltaMode: 0,
    deltaY: 500
  });
  const absorbedTailScrollTop = await scrollport.evaluate((element) => element.scrollTop);
  expect(absorbedTailScrollTop).toBeCloseTo(budgetExhaustedScrollTop, 0);
  expect(absorbedTailScrollTop).toBeLessThanOrEqual(initial.viewportHeight * 0.65);

  // A pause creates a fresh gesture and restores the reading budget without
  // treating the previous momentum tail as a navigation intent.
  await page.waitForTimeout(260);
  await scrollport.dispatchEvent('wheel', {
    bubbles: true,
    cancelable: true,
    deltaMode: 0,
    deltaY: 80
  });
  const freshGestureScrollTop = await scrollport.evaluate((element) => element.scrollTop);
  expect(freshGestureScrollTop).toBeGreaterThan(absorbedTailScrollTop);
  expect((await storySnapshot(page))).toMatchObject({ phase: 'hold', current: 'figure2-proof' });
  expect(await layer.evaluate((element) => element.scrollTop)).toBe(0);
  await expectLayerInvariants(page);
});

test('Proof, Lab, Services, and Education share burst, tail, fresh-input, and reverse-entry reading contracts', async ({ page }) => {
  test.setTimeout(120_000);
  const cases = [
    { scene: 'figure2-proof', reverseFrom: 'brand' },
    { scene: 'services', reverseFrom: 'ttg-animation' },
    { scene: 'lab', reverseFrom: 'ph-animation' },
    { scene: 'education', reverseFrom: 'crane-animation' }
  ] as const;
  const readingMetrics = (scene: string) => page.evaluate((currentScene) => {
    const layer = document.querySelector<HTMLElement>(`[data-stage-layer="${currentScene}"]`);
    const scrollport = layer?.querySelector<HTMLElement>('[data-reading-scrollport="true"]')
      ?? (layer?.dataset.reading === 'true' ? layer : null);
    if (!layer || !scrollport) {
      throw new Error(`Reading scrollport missing for ${currentScene}`);
    }
    return {
      scrollportIsLayer: scrollport === layer,
      scrollTop: scrollport.scrollTop,
      maxScrollTop: Math.max(0, scrollport.scrollHeight - scrollport.clientHeight),
      viewportHeight: window.innerHeight,
      reading: layer.dataset.reading,
      current: window.__storyApp?.snapshot().current,
      phase: window.__storyApp?.snapshot().phase
    };
  }, scene);
  const wheel = (scene: string, deltaY: number) => page.evaluate(({ currentScene, delta }) => {
    const layer = document.querySelector<HTMLElement>(`[data-stage-layer="${currentScene}"]`);
    const scrollport = layer?.querySelector<HTMLElement>('[data-reading-scrollport="true"]')
      ?? (layer?.dataset.reading === 'true' ? layer : null);
    if (!scrollport) throw new Error(`Reading scrollport missing for ${currentScene}`);
    scrollport.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      deltaY: delta
    }));
    return scrollport.scrollTop;
  }, { currentScene: scene, delta: deltaY });

  for (const scenario of cases) {
    await bootStory(page, `/#${scenario.scene}`);
    const initial = await readingMetrics(scenario.scene);
    expect(initial).toMatchObject({
      reading: 'true',
      current: scenario.scene,
      phase: 'hold'
    });
    expect(initial.maxScrollTop, `${scenario.scene} scroll range`).toBeGreaterThan(initial.viewportHeight * 0.7);

    const burstSamples: number[] = [];
    for (let index = 0; index < 7; index += 1) {
      burstSamples.push(await wheel(scenario.scene, 80));
      await page.waitForTimeout(24);
    }
    expect(
      burstSamples.every((value, index) => index === 0 || value > burstSamples[index - 1]!),
      `${scenario.scene} burst must advance monotonically`
    ).toBe(true);
    const burstDisplacement = (burstSamples.at(-1) ?? 0) - initial.scrollTop;
    expect(burstDisplacement, `${scenario.scene} burst displacement`).toBeGreaterThan(initial.viewportHeight * 0.35);
    expect(burstDisplacement, `${scenario.scene} burst displacement`).toBeLessThan(initial.viewportHeight * 0.65);

    const budgetExhaustedScrollTop = await wheel(scenario.scene, 500);
    const absorbedTailScrollTop = await wheel(scenario.scene, 500);
    expect(absorbedTailScrollTop, `${scenario.scene} tail must be absorbed`).toBeCloseTo(budgetExhaustedScrollTop, 0);
    expect(absorbedTailScrollTop, `${scenario.scene} tail must remain inside the gesture budget`)
      .toBeLessThanOrEqual(initial.viewportHeight * 0.65 + 1);

    await page.waitForTimeout(260);
    const freshGestureScrollTop = await wheel(scenario.scene, 80);
    expect(freshGestureScrollTop, `${scenario.scene} fresh gesture must resume reading`)
      .toBeGreaterThan(absorbedTailScrollTop);
    const reverseGestureScrollTop = await wheel(scenario.scene, -80);
    expect(reverseGestureScrollTop, `${scenario.scene} reverse gesture must remain owned by reading`)
      .toBeLessThan(freshGestureScrollTop);
    expect(await storySnapshot(page)).toMatchObject({ phase: 'hold', current: scenario.scene });
    await expectLayerInvariants(page);

    await bootStory(page, `/#${scenario.reverseFrom}`);
    expect((await moveOneHold(page, -1)).current).toBe(scenario.scene);
    const reverseEntry = await readingMetrics(scenario.scene);
    expect(reverseEntry.scrollTop, `${scenario.scene} reverse entry must begin at its reading end`)
      .toBeCloseTo(reverseEntry.maxScrollTop, 0);
    await expectLayerInvariants(page);
  }
});

test('long reading scenes have no residual horizontal rules and Lab omits retired copy', async ({ page }) => {
  const cases = [
    {
      scene: 'lab',
      root: '.r4-lab',
      selectors: ['.r4-lab__wide', '.r4-lab__portrait', '.r4-lab__screen', '.r4-lab__list', '.r4-lab__row'],
      absentCopy: ['FIELD CHECK', '06 SCENES']
    },
    {
      scene: 'services',
      root: '.r4-services',
      selectors: ['.r4-services__layout', '.r4-services__list', '.r4-services__row'],
      absentCopy: []
    },
    {
      scene: 'education',
      root: '.r4-education',
      selectors: ['.r4-education__wide', '.r4-education__vertical', '.r4-education__program', '.r4-education__row'],
      absentCopy: []
    }
  ] as const;

  for (const scenario of cases) {
    await bootStory(page, `/#${scenario.scene}`);
    const evidence = await page.locator(`[data-stage-layer="${scenario.scene}"] ${scenario.root}`).evaluate(
      (root, { selectors, absentCopy }) => ({
        text: root.textContent ?? '',
        nodes: selectors.map((selector) => ({
          selector,
          borders: Array.from(root.querySelectorAll<HTMLElement>(selector)).map((element) => {
            const style = getComputedStyle(element);
            return {
              top: style.borderTopWidth,
              bottom: style.borderBottomWidth,
              left: style.borderLeftWidth,
              right: style.borderRightWidth
            };
          })
        })),
        absentCopy
      }),
      scenario
    );
    for (const node of evidence.nodes) {
      expect(node.borders.length, `${scenario.scene} ${node.selector} rendered`).toBeGreaterThan(0);
      for (const border of node.borders) {
        expect(border, `${scenario.scene} ${node.selector} horizontal rule`).toMatchObject({
          top: '0px',
          bottom: '0px'
        });
      }
    }
    for (const copy of evidence.absentCopy) {
      expect(evidence.text, `${scenario.scene} retired copy ${copy}`).not.toContain(copy);
    }
    await expectLayerInvariants(page);
  }
});

test('Method split keeps an opaque receiver paper beneath the outgoing layout', async ({ page }) => {
  await bootStory(page, '/#method');
  const samples = page.evaluate(() => new Promise<readonly {
    sourceOpacity: number;
    receiverOpacity: number;
    receiverVisible: boolean;
    receiverPaper: string;
  }[]>((resolve, reject) => {
    const values: {
      sourceOpacity: number;
      receiverOpacity: number;
      receiverVisible: boolean;
      receiverPaper: string;
    }[] = [];
    const timeout = window.setTimeout(() => reject(new Error('Method split witness timed out')), 5_000);
    const sample = () => {
      const snapshot = window.__storyApp?.snapshot();
      const source = document.querySelector<HTMLElement>('[data-stage-layer="method-top"]');
      const receiver = document.querySelector<HTMLElement>('[data-stage-layer="method-bottom"]');
      const paper = receiver?.querySelector<HTMLElement>('[data-r4-scene="method-bottom"]');
      if (snapshot?.phase === 'playing' && source && receiver && paper) {
        values.push({
          sourceOpacity: Number.parseFloat(getComputedStyle(source).opacity),
          receiverOpacity: Number.parseFloat(getComputedStyle(receiver).opacity),
          receiverVisible: getComputedStyle(receiver).visibility === 'visible',
          receiverPaper: getComputedStyle(paper).backgroundColor
        });
      }
      if (snapshot?.phase === 'hold' && snapshot.current === 'method-bottom' && values.length > 0) {
        window.clearTimeout(timeout);
        resolve(values);
        return;
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }));

  await page.keyboard.press('PageDown');
  const handoff = await samples;
  expect(handoff.some((sample) => sample.sourceOpacity > 0.05 && sample.sourceOpacity < 0.95)).toBe(true);
  expect(handoff.every((sample) => sample.receiverOpacity === 1 && sample.receiverVisible)).toBe(true);
  expect(handoff.every((sample) => sample.receiverPaper !== 'rgba(0, 0, 0, 0)')).toBe(true);
  await waitForHold(page, 'method-bottom');
  await expectLayerInvariants(page);
});

test('AOD first presented alpha frame stays composited over Method paper from p=0', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'presented alpha-frame readback runs once');
  test.setTimeout(45_000);
  await bootStory(page, '/#aod-animation');

  const firstPresentedFrame = page.evaluate(() => new Promise<{
    progress: number;
    sourceOpacity: number;
    receiverOpacity: number;
    receiverPaper: string;
    frameReady: boolean;
    presentedFrames: number;
    visiblePixels: number;
    transparentPixels: number;
    videoMeanLuminance: number;
    compositedMeanLuminance: number;
  }>((resolve, reject) => {
    let animationFrame = 0;
    const timeout = window.setTimeout(() => {
      cancelAnimationFrame(animationFrame);
      reject(new Error('AOD first presented-frame witness timed out'));
    }, 15_000);
    const sample = () => {
      const aodLayer = document.querySelector<HTMLElement>('[data-stage-layer="aod-animation"]');
      const receiverLayer = document.querySelector<HTMLElement>('[data-stage-layer="method-top"]');
      const root = aodLayer?.querySelector<HTMLElement>('[data-aod-transition]');
      const receiver = receiverLayer?.querySelector<HTMLElement>('[data-r4-scene="method-top"]');
      const video = root?.querySelector<HTMLVideoElement>('[data-aod-figure-video]');
      const progress = Number.parseFloat(root?.style.getPropertyValue('--aod-transition-progress') ?? 'NaN');
      const frameReady = video?.dataset.timelineVideoFrameReady === 'true';
      if (
        root?.dataset.aodExitActive !== 'true'
        || root.dataset.aodAlphaComposite !== 'true'
        || !Number.isFinite(progress)
        || progress < 0
        || progress > 0.02
        || !frameReady
        || !video
        || !receiver
      ) {
        animationFrame = requestAnimationFrame(sample);
        return;
      }
      const receiverPaper = getComputedStyle(receiver).backgroundColor;
      const paperChannels = receiverPaper.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number) ?? [237, 228, 210];
      const paperLuminance = 0.2126 * (paperChannels[0] ?? 237)
        + 0.7152 * (paperChannels[1] ?? 228)
        + 0.0722 * (paperChannels[2] ?? 210);
      const sampleCanvas = document.createElement('canvas');
      sampleCanvas.width = 48;
      sampleCanvas.height = 48;
      const context = sampleCanvas.getContext('2d', { willReadFrequently: true });
      if (!context || video.videoWidth <= 0 || video.videoHeight <= 0) {
        animationFrame = requestAnimationFrame(sample);
        return;
      }
      context.drawImage(video, 0, 0, sampleCanvas.width, sampleCanvas.height);
      const pixels = context.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height).data;
      let visiblePixels = 0;
      let transparentPixels = 0;
      let videoLuminanceTotal = 0;
      let compositedLuminanceTotal = 0;
      for (let offset = 0; offset < pixels.length; offset += 4) {
        const alpha = (pixels[offset + 3] ?? 0) / 255;
        const luminance = 0.2126 * (pixels[offset] ?? 0)
          + 0.7152 * (pixels[offset + 1] ?? 0)
          + 0.0722 * (pixels[offset + 2] ?? 0);
        if (alpha > 0.03) visiblePixels += 1;
        if (alpha < 0.97) transparentPixels += 1;
        videoLuminanceTotal += luminance;
        compositedLuminanceTotal += luminance * alpha + paperLuminance * (1 - alpha);
      }
      window.clearTimeout(timeout);
      resolve({
        progress,
        sourceOpacity: Number.parseFloat(getComputedStyle(aodLayer).opacity),
        receiverOpacity: Number.parseFloat(getComputedStyle(receiverLayer).opacity),
        receiverPaper,
        frameReady,
        presentedFrames: video.getVideoPlaybackQuality?.().totalVideoFrames ?? 0,
        visiblePixels,
        transparentPixels,
        videoMeanLuminance: videoLuminanceTotal / (sampleCanvas.width * sampleCanvas.height),
        compositedMeanLuminance: compositedLuminanceTotal / (sampleCanvas.width * sampleCanvas.height)
      });
    };
    animationFrame = requestAnimationFrame(sample);
  }));

  await page.keyboard.press('PageDown');
  const witness = await firstPresentedFrame;
  expect(witness.progress).toBeGreaterThanOrEqual(0);
  expect(witness.progress).toBeLessThanOrEqual(0.02);
  expect(witness.sourceOpacity).toBe(1);
  expect(witness.receiverOpacity).toBe(1);
  expect(witness.receiverPaper).not.toBe('rgba(0, 0, 0, 0)');
  expect(witness.frameReady).toBe(true);
  expect(witness.presentedFrames).toBeGreaterThan(0);
  expect(witness.visiblePixels).toBeGreaterThan(0);
  expect(witness.transparentPixels).toBeGreaterThan(0);
  expect(witness.videoMeanLuminance).toBeGreaterThan(0);
  expect(witness.compositedMeanLuminance).toBeGreaterThan(80);
  console.info(`R5 AOD first-presented-frame witness ${JSON.stringify(witness)}`);
  await testInfo.attach('r5-aod-first-presented-frame.json', {
    body: JSON.stringify(witness, null, 2),
    contentType: 'application/json'
  });
  await waitForHold(page, 'method-top');
  await expectLayerInvariants(page);
});

test('Method reverse presents descending AOD frames and rejects the arriving wheel tail until a fresh gesture', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'presented-frame and physical wheel envelope run once');
  test.setTimeout(45_000);
  await bootStory(page, '/#method-top');

  const dispatchReverseWheel = (deltaY: number) => page.evaluate((delta) => {
    window.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaMode: 0,
      deltaY: delta
    }));
  }, deltaY);
  await dispatchReverseWheel(-64);
  const samples: number[] = [];
  for (let index = 0; index < 120; index += 1) {
    await page.waitForTimeout(35);
    await dispatchReverseWheel(-24);
    const frame = await page.evaluate(() => {
      const snapshot = window.__storyApp?.snapshot();
      const layer = document.querySelector<HTMLElement>('[data-stage-layer="aod-animation"]');
      const video = layer?.querySelector<HTMLVideoElement>('[data-aod-figure-video]');
      return {
        phase: snapshot?.phase,
        current: snapshot?.current,
        visible: layer?.dataset.visible === 'true',
        frameReady: video?.dataset.timelineVideoFrameReady === 'true',
        direction: video?.dataset.timelineVideoDirection,
        currentTime: video?.currentTime
      };
    });
    if (
      frame.visible
      && frame.frameReady
      && frame.direction === '-1'
      && Number.isFinite(frame.currentTime)
    ) {
      samples.push(frame.currentTime!);
    }
    if (frame.phase === 'hold' && frame.current === 'aod-animation') break;
  }
  await waitForHold(page, 'aod-animation');
  const descendingSteps = samples.filter((value, index) => (
    index > 0 && value < samples[index - 1]! - 0.01
  )).length;
  expect(samples.length).toBeGreaterThanOrEqual(8);
  expect(descendingSteps).toBeGreaterThanOrEqual(8);
  expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(1.5);

  for (let index = 0; index < 3; index += 1) {
    await dispatchReverseWheel(-20);
    await page.waitForTimeout(35);
  }
  expect((await storySnapshot(page))).toMatchObject({ phase: 'hold', current: 'aod-animation' });

  await page.waitForTimeout(260);
  await dispatchReverseWheel(-240);
  await waitForHold(page, 'star-map');
  await expectLayerInvariants(page);
});

test('full canonical spine completes forward with bounded layers', async ({ page }) => {
  test.setTimeout(120_000);
  await bootStory(page);

  for (const expectedScene of canonicalScenes.slice(1)) {
    const snapshot = await moveOneHold(page, 1);
    expect(snapshot.current).toBe(expectedScene);
    await expectLayerInvariants(page);
  }

  expect((await storySnapshot(page)).current).toBe('contact');
});

test('critical reverse chains return through hero, pilot, and figure2 proof holds', async ({ page }) => {
  test.setTimeout(120_000);

  await bootStory(page, '/#star-map');
  expect((await moveOneHold(page, -1)).current).toBe('pattern');
  expect((await moveOneHold(page, -1)).current).toBe('hero');

  await navigateStory(page, 'method-top');
  expect((await moveOneHold(page, -1)).current).toBe('aod-animation');
  expect((await moveOneHold(page, -1)).current).toBe('star-map');

  await navigateStory(page, 'brand');
  expect((await moveOneHold(page, -1)).current).toBe('figure2-proof');
  const proofEntry = await page.locator(
    '[data-stage-layer="figure2-proof"] [data-reading-scrollport="true"]'
  ).evaluate((element) => ({
    scrollTop: element.scrollTop,
    maxScrollTop: element.scrollHeight - element.clientHeight,
    panels: element.querySelectorAll('[data-r4-proof-panel]').length
  }));
  expect(proofEntry.panels).toBe(3);
  expect(Math.abs(proofEntry.scrollTop - proofEntry.maxScrollTop)).toBeLessThan(1);
  await expectLayerInvariants(page);

  expect((await moveOneHold(page, -1)).current).toBe('figure2-animation');
  await expectLayerInvariants(page);
  expect((await moveOneHold(page, -1)).current).toBe('method-bottom');
  await expectLayerInvariants(page);
  const methodEntry = await page.locator(
    '[data-stage-layer="method-bottom"] [data-reading-scrollport="true"]'
  ).evaluate((element) => ({
    scrollTop: element.scrollTop,
    maxScrollTop: element.scrollHeight - element.clientHeight
  }));
  expect(Math.abs(methodEntry.scrollTop - methodEntry.maxScrollTop)).toBeLessThan(1);
  expect((await moveOneHold(page, -1)).current).toBe('method-top');
  await expect(page.locator('[data-stage-layer="method-top"] [data-reading-scrollport="true"]')).toHaveCount(0);
});

test('slow media succeeds before timeout and failed endpoint recovery leaves an interactive static hold', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'network recovery runs once');
  test.setTimeout(120_000);

  await page.route('**/*aod-figure-motion*.webm', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.continue();
  });
  await bootStory(page, '/?media=slow#aod-animation');
  await page.keyboard.press('PageDown');
  await waitForHold(page, 'method-top');
  expect(await eventTypes(page)).not.toContain('PREPARE_TIMEOUT');

  await page.unroute('**/*aod-figure-motion*.webm');
  await page.route('**/*aod-figure-motion*.webm', (route) => route.abort('failed'));
  await bootStory(page, '/?media=failed#aod-animation');
  const timeoutCountBeforeFailure = (await eventTypes(page))
    .filter((type) => type === 'PREPARE_TIMEOUT').length;
  await page.keyboard.press('PageDown');
  await expect.poll(async () => (await eventTypes(page))
    .filter((type) => type === 'PREPARE_TIMEOUT').length).toBeGreaterThan(timeoutCountBeforeFailure);
  const failedMedia = await waitForHold(page, 'aod-animation');
  expect(failedMedia.recovery).toBeUndefined();
  expect(await eventTypes(page)).toContain('RECOVERY_CANCELLED');
  await expectLayerInvariants(page);

  await page.unroute('**/*aod-figure-motion*.webm');
  await page.evaluate(() => {
    const video = document.querySelector<HTMLVideoElement>(
      '[data-stage-layer="aod-animation"] [data-media-key="aod-figure-motion"]'
    );
    if (!video) throw new Error('AOD media missing before route retry');
    video.load();
  });
  await page.keyboard.press('PageDown');
  await waitForHold(page, 'method-top');
  await expectLayerInvariants(page);

  expect((await moveOneHold(page, -1)).current).toBe('aod-animation');
  const timeoutCountBeforeOffline = (await eventTypes(page))
    .filter((type) => type === 'PREPARE_TIMEOUT').length;
  await page.context().setOffline(true);
  try {
    await page.evaluate(() => {
      const video = document.querySelector<HTMLVideoElement>(
        '[data-stage-layer="aod-animation"] [data-media-key="aod-figure-motion"]'
      );
      if (!video) throw new Error('AOD media missing before offline probe');
      const source = video.currentSrc || video.src;
      video.src = `${source}?r5-offline=${Date.now()}`;
      video.load();
    });
    await page.keyboard.press('PageDown');
    await expect.poll(async () => (await eventTypes(page))
      .filter((type) => type === 'PREPARE_TIMEOUT').length).toBeGreaterThan(timeoutCountBeforeOffline);
    const offlineFailure = await waitForHold(page, 'aod-animation');
    expect(offlineFailure.recovery).toBeUndefined();
    expect(await eventTypes(page)).toContain('RECOVERY_CANCELLED');
    await expectLayerInvariants(page);
  } finally {
    await page.context().setOffline(false);
  }

  await page.evaluate(() => {
    const video = document.querySelector<HTMLVideoElement>(
      '[data-stage-layer="aod-animation"] [data-media-key="aod-figure-motion"]'
    );
    if (!video) throw new Error('AOD media missing before online retry');
    video.load();
  });
  await page.keyboard.press('PageDown');
  await waitForHold(page, 'method-top');
  await expectLayerInvariants(page);
});

test('Contact reverse recovery stays local while only its explicit link may return to Hero', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'network recovery runs once');
  test.setTimeout(120_000);

  const craneMedia = /crane-(?:figure|flock)-motion[^/]*\.webm(?:\?.*)?$/;
  let delayedRequests = 0;
  let pendingDelayedRequests = 0;
  let releaseDelayedRequests: () => void = () => undefined;
  const delayedRequestGate = new Promise<void>((resolve) => {
    releaseDelayedRequests = resolve;
  });
  await page.route(craneMedia, async (route) => {
    delayedRequests += 1;
    pendingDelayedRequests += 1;
    try {
      await delayedRequestGate;
      await route.continue();
    } finally {
      pendingDelayedRequests -= 1;
    }
  });

  await bootStory(page, '/?recovery=contact-reverse#contact');
  await page.evaluate(() => {
    type RecoveryProbe = Window & {
      __story?: {
        getState(): { context: { layerWindow: { current: string } } };
        subscribe(listener: () => void): () => void;
      };
      __r5RecoveryCurrents?: string[];
    };
    const probe = window as RecoveryProbe;
    const runtime = probe.__story;
    if (!runtime) {
      throw new Error('runtime unavailable for Contact recovery probe');
    }
    probe.__r5RecoveryCurrents = [runtime.getState().context.layerWindow.current];
    runtime.subscribe(() => {
      probe.__r5RecoveryCurrents?.push(runtime.getState().context.layerWindow.current);
    });
  });

  await page.keyboard.press('PageUp');
  try {
    await page.waitForFunction(() => window.__story?.getState().eventLog
      .some((record) => record.event.type === 'PREPARE_TIMEOUT'), undefined, { timeout: 8_000 });
  } finally {
    releaseDelayedRequests();
  }
  await waitForHold(page, 'contact');

  const recoveryEvidence = await page.evaluate(() => {
    type RecoveryRecord = {
      event: { type: string; source?: string };
      layerWindow: { current: string };
      recovery?: {
        scope: string;
        status: string;
        segment?: string;
        direction?: number;
        endpoint?: string;
      };
    };
    type RecoveryProbe = Window & {
      __story?: { getState(): { eventLog: readonly RecoveryRecord[] } };
      __r5RecoveryCurrents?: string[];
    };
    const probe = window as RecoveryProbe;
    const records = probe.__story?.getState().eventLog ?? [];
    const timeout = [...records].reverse().find((record) => record.event.type === 'PREPARE_TIMEOUT');
    const recovery = [...records].reverse().find((record) => record.recovery?.status === 'recovering');
    return {
      timeout,
      recovery,
      currents: probe.__r5RecoveryCurrents ?? []
    };
  });
  expect(delayedRequests).toBeGreaterThan(0);
  expect(recoveryEvidence.timeout).toMatchObject({
    layerWindow: { current: 'contact' }
  });
  expect(recoveryEvidence.recovery).toMatchObject({
    recovery: {
      scope: 'segment',
      status: 'recovering',
      segment: 'crane-contact',
      direction: -1,
      endpoint: 'contact'
    }
  });
  expect(recoveryEvidence.currents).not.toContain('hero');
  await expect(page.locator('[data-stage-layer="hero"][data-visible="true"]')).toHaveCount(0);
  await expectLayerInvariants(page);
  await expect.poll(() => pendingDelayedRequests).toBe(0);

  await page.getByRole('link', { name: '回到首屏', exact: true }).click();
  await waitForHold(page, 'hero');
  const latestSeekSource = await page.evaluate(() => {
    const records = window.__story?.getState().eventLog ?? [];
    return [...records]
      .reverse()
      .find((record) => record.event.type === 'SEEK')?.event.source;
  });
  expect(latestSeekSource).toBe('history');
  await expectLayerInvariants(page);
});

test('legacy and harness URLs cannot reach an old/default runtime in release output', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'release routing scan runs once');

  await page.goto('/aod.html');
  await expect(page.getByRole('heading', { name: '页面不存在' })).toBeVisible();
  expect(await page.locator('script[src*="js/main.js"]').count()).toBe(0);

  await page.goto('/harness/r4-g1');
  await expect(page.getByRole('heading', { name: '页面不存在' })).toBeVisible();
  expect(await page.evaluate(() => '__r4Group1' in window)).toBe(false);
});
