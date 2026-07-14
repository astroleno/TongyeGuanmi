import { expect, test } from '@playwright/test';
import {
  bootStory,
  canonicalScenes,
  eventTypes,
  expectLayerInvariants,
  moveOneHold,
  navigateStory,
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
    currentTime: video.currentTime
  }))).toMatchObject({ paused: true, currentTime: expect.closeTo(0.34, 1) });
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
  await expect(heroIntroInk).toBeVisible();
  await expect.poll(() => heroVideo.evaluate((video: HTMLVideoElement) => ({
    paused: video.paused,
    currentTime: video.currentTime
  }))).toMatchObject({ paused: true, currentTime: expect.closeTo(0.34, 1) });
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
  }))).toMatchObject({ paused: true, currentTime: expect.closeTo(0.34, 1) });

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
  expect(await nav.evaluate((element) => element.nextElementSibling?.classList.contains('scroll-edge-blur'))).toBe(true);
  expect(await nav.locator('a').first().evaluate((link) => {
    link.focus();
    return document.activeElement === link;
  })).toBe(false);

  expect((await moveOneHold(page, 1)).current).toBe('pattern');
  await expect(nav).toBeVisible();
  await expect(blur).toBeVisible();
  expect(await blur.locator('.scroll-edge-blur__layer').count()).toBe(7);
  expect((await moveOneHold(page, -1)).current).toBe('hero');
  await expect(nav).toBeHidden();
  await expect(blur).toBeHidden();
  await expect(hero).toHaveAttribute('data-hero-parallax-active', 'true');
  await expect(loader).toHaveCount(1);
  await expect(loader).toBeHidden();
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

  for (const scene of canonicalScenes) {
    const snapshot = await bootStory(page, `/?hash=${scene}#${scene}`);
    expect(snapshot.current, `hash #${scene}`).toBe(scene);
    await expectLayerInvariants(page);
  }

  for (const [hash, scene] of [
    ['home', 'hero'],
    ['method', 'method-top'],
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

test('reading input is content-first, then 10svh commitment, with deterministic entry edges', async ({ page }) => {
  await bootStory(page, '/#method');
  const scrollport = page.locator('[data-stage-layer="method-top"] [data-reading-scrollport="true"]');
  await expect(scrollport).toBeVisible();
  await expect.poll(() => scrollport.evaluate((element) => element.scrollTop)).toBe(0);

  await page.locator('[data-stage-layer="method-top"] .r4-method__lead').dispatchEvent('wheel', {
    bubbles: true,
    cancelable: true,
    deltaMode: 0,
    deltaY: 120
  });
  await expect.poll(() => scrollport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect((await storySnapshot(page)).current).toBe('method-top');

  const preservedScrollTop = await scrollport.evaluate((element) => {
    element.scrollTop = 240;
    return element.scrollTop;
  });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(50);
  expect(await scrollport.evaluate((element) => element.scrollTop)).toBe(preservedScrollTop);

  await scrollport.evaluate((element) => {
    element.scrollTop = element.scrollHeight - element.clientHeight;
  });
  await page.evaluate(() => window.dispatchEvent(new Event('story-reading-entry')));
  const beforeCommit = await page.evaluate(() => {
    const lead = document.querySelector<HTMLElement>('[data-stage-layer="method-top"] .r4-method__lead');
    const height = window.innerHeight;
    lead?.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaMode: 0,
      deltaY: height * 0.099
    }));
    const before = window.__storyApp?.snapshot();
    lead?.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaMode: 0,
      deltaY: height * 0.001
    }));
    return before;
  });
  expect(beforeCommit?.current).toBe('method-top');
  expect(beforeCommit?.phase).toBe('hold');

  await waitForHold(page, 'figure2-animation');
  await expectLayerInvariants(page);

  await page.keyboard.press('PageUp');
  await waitForHold(page, 'method-top');
  await expect.poll(async () => scrollport.evaluate((element) => (
    element.scrollTop + element.clientHeight >= element.scrollHeight - 1
  ))).toBe(true);
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
  for (const expected of [
    'figure2-proof-closing',
    'figure2-proof-cards',
    'figure2-proof-opening',
    'figure2-animation',
    'method-top'
  ]) {
    expect((await moveOneHold(page, -1)).current).toBe(expected);
    await expectLayerInvariants(page);
  }
  const methodEntry = await page.locator(
    '[data-stage-layer="method-top"] [data-reading-scrollport="true"]'
  ).evaluate((element) => ({
    scrollTop: element.scrollTop,
    maxScrollTop: element.scrollHeight - element.clientHeight
  }));
  expect(Math.abs(methodEntry.scrollTop - methodEntry.maxScrollTop)).toBeLessThan(1);
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
  await expect.poll(async () => (await storySnapshot(page)).recovery?.status, { timeout: 30_000 })
    .toBe('failed');
  const failedMedia = await waitForHold(page, 'aod-animation');
  expect(failedMedia.recovery).toMatchObject({
    scope: 'segment',
    status: 'failed',
    segment: 'aod-method-top',
    direction: 1,
    endpoint: 'method-top'
  });
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
    await expect.poll(async () => (await storySnapshot(page)).recovery?.status, { timeout: 30_000 })
      .toBe('failed');
    const offlineFailure = await waitForHold(page, 'aod-animation');
    expect(offlineFailure.recovery).toMatchObject({
      scope: 'segment',
      status: 'failed',
      segment: 'aod-method-top',
      direction: 1,
      endpoint: 'method-top'
    });
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
  await waitForHold(page, 'crane-animation');

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
    return {
      timeout,
      currents: probe.__r5RecoveryCurrents ?? []
    };
  });
  expect(delayedRequests).toBeGreaterThan(0);
  expect(recoveryEvidence.timeout).toMatchObject({
    layerWindow: { current: 'contact' },
    recovery: {
      scope: 'segment',
      status: 'recovering',
      segment: 'crane-contact',
      direction: -1,
      endpoint: 'crane-animation'
    }
  });
  expect(recoveryEvidence.currents).not.toContain('hero');
  await expect(page.locator('[data-stage-layer="hero"][data-visible="true"]')).toHaveCount(0);
  await expectLayerInvariants(page);
  await expect.poll(() => pendingDelayedRequests).toBe(0);

  await navigateStory(page, 'contact');
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
