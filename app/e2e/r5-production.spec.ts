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
  await expect(page.locator('.story-nav')).toBeVisible();
  await expect(page).toHaveTitle('同野观幂｜AI 转型与能力建设');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    /同野观幂是一家面向组织与个人能力建设的 AI 转型咨询公司/
  );
  expect(snapshot.current).toBe('hero');
  expect(new URL(page.url()).hash).toBe('');
  expect(snapshot.loadedScenes).toContain('hero');
  expect(snapshot.loadedScenes.length).toBeLessThanOrEqual(2);
  expect(errors).toEqual([]);
  await expectLayerInvariants(page);
});

test('slow next-scene assets do not block the current production hold', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'slow prefetch probe runs once');
  let releasePatternRequest = () => undefined;
  let patternRequestStarted = false;
  const patternGate = new Promise<void>((resolve) => {
    releasePatternRequest = resolve;
  });
  await page.route('**/*pattern-layer-alpha-06*.png', async (route) => {
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

test('reading scroll stays inside the scene and hands off only at the edge', async ({ page }) => {
  await bootStory(page, '/#method');
  const scrollport = page.locator('[data-stage-layer="method-top"] [data-reading-scrollport="true"]');
  await expect(scrollport).toBeVisible();

  await page.keyboard.press('PageDown');
  await expect.poll(() => scrollport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect((await storySnapshot(page)).current).toBe('method-top');

  await scrollport.evaluate((element) => {
    element.scrollTop = element.scrollHeight - element.clientHeight;
  });
  await page.keyboard.press('PageDown');
  await waitForHold(page, 'figure2-animation');
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
});

test('slow media succeeds before timeout and failed media recovers to a static endpoint', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'network recovery runs once');
  test.setTimeout(120_000);

  await page.route('**/*aod_figure-alpha-front-scrub*.webm', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.continue();
  });
  await bootStory(page, '/?media=slow#aod-animation');
  await page.keyboard.press('PageDown');
  await waitForHold(page, 'method-top');
  expect(await eventTypes(page)).not.toContain('PREPARE_TIMEOUT');

  await page.unroute('**/*aod_figure-alpha-front-scrub*.webm');
  await page.route('**/*aod_figure-alpha-front-scrub*.webm', (route) => route.abort('failed'));
  await bootStory(page, '/?media=failed#aod-animation');
  await page.keyboard.press('PageDown');
  await waitForHold(page, 'method-top');
  expect(await eventTypes(page)).toContain('PREPARE_TIMEOUT');

  await page.keyboard.press('PageUp');
  await waitForHold(page, 'aod-animation');
  await expectLayerInvariants(page);

  await page.unroute('**/*aod_figure-alpha-front-scrub*.webm');
  await page.keyboard.press('PageDown');
  await waitForHold(page, 'method-top');
  await expectLayerInvariants(page);

  await page.keyboard.press('PageUp');
  await waitForHold(page, 'aod-animation');
  const timeoutCountBeforeOffline = (await eventTypes(page))
    .filter((type) => type === 'PREPARE_TIMEOUT').length;
  await page.context().setOffline(true);
  try {
    await page.evaluate(() => {
      const video = document.querySelector<HTMLVideoElement>(
        '[data-stage-layer="aod-animation"] [data-media-key="aod_figure-alpha-front-scrub"]'
      );
      if (!video) throw new Error('AOD media missing before offline probe');
      const source = video.currentSrc || video.src;
      video.src = `${source}?r5-offline=${Date.now()}`;
      video.load();
    });
    await page.keyboard.press('PageDown');
    await waitForHold(page, 'method-top');
    const timeoutCountAfterOffline = (await eventTypes(page))
      .filter((type) => type === 'PREPARE_TIMEOUT').length;
    expect(timeoutCountAfterOffline).toBeGreaterThan(timeoutCountBeforeOffline);
    await expectLayerInvariants(page);
  } finally {
    await page.context().setOffline(false);
  }

  await page.keyboard.press('PageUp');
  await waitForHold(page, 'aod-animation');
  await page.keyboard.press('PageDown');
  await waitForHold(page, 'method-top');
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
