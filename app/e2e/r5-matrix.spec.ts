import { expect, test } from '@playwright/test';
import {
  bootStory,
  canonicalScenes,
  eventTypes,
  expectLayerInvariants,
  moveOneHold,
  storySnapshot,
  waitForHold
} from './r5-helpers';

test('desktop wheel requires a fresh touchpad burst at the Pattern compact checkpoint and reverses', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('desktop-'), 'desktop pointer matrix');
  await bootStory(page);

  await page.mouse.wheel(0, 120);
  await waitForHold(page, 'pattern');

  const trackpadBurst = () => page.evaluate(() => {
    const target = document.querySelector<HTMLElement>('.story-app');
    if (!target) throw new Error('story app missing');
    for (let index = 0; index < 5; index += 1) {
      target.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        deltaY: 40,
        deltaMode: WheelEvent.DOM_DELTA_PIXEL
      }));
    }
  });
  const waitForPatternCheckpoint = (stageIndex: number) => page.waitForFunction((expected) => {
    const runtime = (window as Window & {
      __story?: {
        getState(): {
          state: unknown;
          context: { pausePoint?: { stageIndex?: number } };
        };
      };
    }).__story?.getState();
    return runtime?.state === 'staged-paused'
      && runtime.context.pausePoint?.stageIndex === expected;
  }, stageIndex);

  await trackpadBurst();
  await waitForPatternCheckpoint(0);
  expect((await storySnapshot(page)).current).toBe('pattern');

  await trackpadBurst();
  await waitForHold(page, 'star-map');

  expect((await moveOneHold(page, -1)).current).toBe('pattern');
});

test('touchscreen swipe drives the same normalized input contract', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile-'), 'touchscreen matrix');
  await bootStory(page);

  await page.evaluate(() => {
    const target = document.querySelector<HTMLElement>('.story-app');
    if (!target) throw new Error('story app missing');
    const dispatchTouch = (type: string, clientY: number | undefined) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'touches', {
        value: clientY === undefined ? [] : [{ clientX: 180, clientY }]
      });
      target.dispatchEvent(event);
    };
    dispatchTouch('touchstart', 700);
    dispatchTouch('touchmove', 500);
    dispatchTouch('touchend', undefined);
  });

  await waitForHold(page, 'pattern');
  expect((await storySnapshot(page)).visibleLayers).toBe(1);
});

test('iPhone landscape entry and a later touch unlock staged video inside real user gestures', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-webkit', 'iPhone WebKit media activation runs once');
  test.setTimeout(120_000);

  await page.addInitScript(() => {
    type MediaUnlockCall = Readonly<{
      gesture: string | undefined;
      key: string;
    }>;
    type InstrumentedWindow = Window & {
      __r5ActiveGesture?: string;
      __r5MediaUnlockCalls?: MediaUnlockCall[];
    };
    const instrumented = window as InstrumentedWindow;
    instrumented.__r5MediaUnlockCalls = [];
    let gestureTimer: number | undefined;
    const markGesture = (event: Event) => {
      instrumented.__r5ActiveGesture = event.type;
      window.clearTimeout(gestureTimer);
      gestureTimer = window.setTimeout(() => {
        if (instrumented.__r5ActiveGesture === event.type) {
          delete instrumented.__r5ActiveGesture;
        }
      }, 0);
    };
    window.addEventListener('click', markGesture, true);
    window.addEventListener('touchstart', markGesture, true);

    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function play() {
      instrumented.__r5MediaUnlockCalls?.push({
        gesture: instrumented.__r5ActiveGesture,
        key: this.dataset.mediaKey
          ?? (this.hasAttribute('data-hero-figure-video') ? 'hero-figure' : 'unknown')
      });
      return originalPlay.call(this);
    };
  });

  await page.setViewportSize({ width: 734, height: 343 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('video[data-hero-figure-video]')).toHaveCount(1);
  const start = page.getByRole('button', { name: '开始浏览' });
  await expect(start).toBeVisible();
  await start.tap();
  await page.waitForFunction(() => {
    const root = document.querySelector<HTMLElement>('.story-app');
    return root?.dataset.mobileLandscapeState === 'started'
      && root.dataset.experienceInteractive === 'true';
  }, undefined, { timeout: 30_000 });
  const startCalls = await page.evaluate(() => {
    const calls = (window as Window & {
      __r5MediaUnlockCalls?: readonly {
        gesture?: string;
        key: string;
      }[];
    }).__r5MediaUnlockCalls ?? [];
    return calls;
  });
  expect(startCalls).toContainEqual({
    key: 'hero-figure',
    gesture: 'click'
  });

  await waitForHold(page, 'hero');
  expect((await moveOneHold(page, 1)).current).toBe('pattern');
  expect((await moveOneHold(page, 1)).current).toBe('star-map');
  await expect(page.locator(
    '[data-stage-layer="aod-animation"] [data-media-key="aod-figure-motion"]'
  )).toHaveCount(1);

  await page.touchscreen.tap(180, 240);
  await expect.poll(() => page.evaluate(() => {
    const calls = (window as Window & {
      __r5MediaUnlockCalls?: readonly {
        gesture?: string;
        key: string;
      }[];
    }).__r5MediaUnlockCalls ?? [];
    return calls.some((call) =>
      call.key === 'aod-figure-motion'
      && call.gesture === 'touchstart'
    );
  })).toBe(true);

  expect((await moveOneHold(page, 1)).current).toBe('aod-animation');
  expect((await storySnapshot(page)).recovery).toBeUndefined();
});

test('iPhone WebKit completes the full touch spine in both directions without media timeouts', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-webkit', 'iPhone WebKit stability gate runs once');
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'maxTouchPoints', {
      configurable: true,
      get: () => 5
    });
  });

  await bootStory(page);
  for (const expectedScene of canonicalScenes.slice(1)) {
    const snapshot = await moveOneHold(page, 1);
    expect(snapshot.current).toBe(expectedScene);
    expect(snapshot.recovery).toBeUndefined();
    expect(snapshot.lastError).toBeUndefined();
    await expectLayerInvariants(page);
  }

  for (const expectedScene of [...canonicalScenes].slice(0, -1).reverse()) {
    const snapshot = await moveOneHold(page, -1);
    expect(snapshot.current).toBe(expectedScene);
    expect(snapshot.recovery).toBeUndefined();
    expect(snapshot.lastError).toBeUndefined();
    await expectLayerInvariants(page);
  }

  const events = await eventTypes(page);
  expect(events).not.toContain('PREPARE_TIMEOUT');
  expect(events).not.toContain('PLAYBACK_FAILED');
});

test('mobile menu remains touch reachable and closes after navigation', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile-'), 'mobile navigation matrix');
  await bootStory(page);
  expect((await moveOneHold(page, 1)).current).toBe('pattern');
  expect((await moveOneHold(page, 1)).current).toBe('star-map');
  await expect(page.locator('.site-nav')).toBeVisible();
  const actionStyles = await page.evaluate(() => {
    const menu = document.querySelector<HTMLElement>('.site-nav__toggle');
    const cta = document.querySelector<HTMLElement>('.nav-cta');
    if (!menu || !cta) throw new Error('mobile actions missing');
    const pick = (element: HTMLElement) => {
      const style = getComputedStyle(element);
      return {
        height: style.minHeight,
        radius: style.borderRadius,
        border: style.borderTopWidth,
        background: style.backgroundColor,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight
      };
    };
    return { menu: pick(menu), cta: pick(cta) };
  });
  expect(actionStyles.menu).toEqual(actionStyles.cta);
  await page.getByRole('button', { name: '菜单' }).tap();
  await expect(page.locator('.site-nav')).toHaveAttribute('data-menu-open', 'true');
  await page.getByRole('link', { name: '联系' }).tap();
  await waitForHold(page, 'contact');
  await expect(page.locator('.site-nav')).toHaveAttribute('data-menu-open', 'false');
});

test('mobile rotation and dynamic viewport height keep the active scene stable', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile-'), 'mobile viewport matrix');
  await bootStory(page, '/#services');

  await page.setViewportSize({ width: 740, height: 390 });
  await page.waitForTimeout(100);
  expect((await storySnapshot(page)).current).toBe('services');
  await expect(page.locator('[data-stage-layer="services"]')).toBeVisible();

  await page.setViewportSize({ width: 390, height: 720 });
  await page.waitForTimeout(100);
  expect((await storySnapshot(page)).current).toBe('services');
  await expect(page.locator('[data-stage-layer="services"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
