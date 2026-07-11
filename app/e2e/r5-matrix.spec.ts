import { expect, test } from '@playwright/test';
import { bootStory, moveOneHold, storySnapshot, waitForHold } from './r5-helpers';

test('desktop mouse wheel and touchpad-sized deltas traverse and reverse', async ({ page }, testInfo) => {
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
  await trackpadBurst();
  await page.waitForFunction(
    () => window.__storyApp?.snapshot().phase === 'staged-paused',
    undefined,
    { timeout: 15_000 }
  );
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

test('mobile menu remains touch reachable and closes after navigation', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile-'), 'mobile navigation matrix');
  await bootStory(page);
  await page.getByRole('button', { name: '菜单' }).tap();
  await expect(page.locator('.story-nav')).toHaveAttribute('data-menu-open', 'true');
  await page.getByRole('link', { name: '联系' }).tap();
  await waitForHold(page, 'contact');
  await expect(page.locator('.story-nav')).toHaveAttribute('data-menu-open', 'false');
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
