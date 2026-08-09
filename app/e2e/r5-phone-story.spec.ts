import { expect, test } from '@playwright/test';
import {
  assertSinglePhoneAuthority,
  waitForDirectEntryCommit
} from './r5-phone-clean-assertions';

const CLEAN_IMPLEMENTATION = 'clean-v1';
const SCENES = [
  'hero', 'pattern', 'star-map', 'aod-animation', 'method-top',
  'figure2-animation', 'figure2-proof', 'brand', 'figure3-animation',
  'services', 'ttg-animation', 'lab', 'ph-animation', 'education',
  'crane-animation', 'contact'
] as const;

async function expectCleanShell(
  page: import('@playwright/test').Page,
  scope: 'formal' | 'brand-lab',
  scene: string
) {
  await waitForDirectEntryCommit(page, scene);
  await assertSinglePhoneAuthority(page);
  const shell = page.locator('.phone-story');
  await expect(shell).toHaveAttribute('data-phone-scope', scope);
  await expect(shell).toHaveAttribute(
    'data-phone-implementation',
    CLEAN_IMPLEMENTATION
  );
  await expect(shell).toHaveAttribute('data-phone-scene', scene);
  await expect(shell).not.toHaveAttribute('data-phone-validation-mode', /.+/);
}

test('formal phone route boots one clean authority without the QA module', async ({
  page
}) => {
  const scripts: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scripts.push(request.url());
  });
  await page.goto('/#hero', { waitUntil: 'domcontentloaded' });
  await expectCleanShell(page, 'formal', 'hero');
  expect(scripts.some((url) => url.includes('PhoneBrandLabStory'))).toBe(false);
  await expect(page.locator('[data-story-loader="true"]'))
    .toHaveAttribute('data-loader-status', 'hidden');
});

test('all sixteen formal hashes enter through the same implementation', async ({ page }) => {
  for (const [index, scene] of SCENES.entries()) {
    await page.goto(`/?r5-direct-entry=${index}#${scene}`, {
      waitUntil: 'domcontentloaded'
    });
    await expectCleanShell(page, 'formal', scene);
  }
});

test('brand-lab is a separate route instance over the same clean implementation', async ({
  page
}) => {
  const scripts: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scripts.push(request.url());
  });
  await page.goto('/#brand', { waitUntil: 'domcontentloaded' });
  await expectCleanShell(page, 'formal', 'brand');
  const formalAuthority = await page.locator('.phone-story')
    .getAttribute('data-phone-authority');

  await page.goto('/brand-lab#brand', { waitUntil: 'domcontentloaded' });
  await expectCleanShell(page, 'brand-lab', 'brand');
  const qaAuthority = await page.locator('.phone-story')
    .getAttribute('data-phone-authority');
  expect(qaAuthority).not.toBe(formalAuthority);
  await expect(page.locator('.phone-story')).toHaveCount(1);
  expect(scripts.some((url) => url.includes('PhoneBrandLabStory'))).toBe(true);
});

test('real back and forward traversal restores one re-proven route authority', async ({
  page
}, testInfo) => {
  const lifecycleKey = 'r5-e2e-page-lifecycle';
  await page.addInitScript((key) => {
    const append = (type: 'pagehide' | 'pageshow', persisted: boolean) => {
      const previous = JSON.parse(sessionStorage.getItem(key) ?? '[]') as unknown[];
      sessionStorage.setItem(key, JSON.stringify([
        ...previous,
        { type, persisted, url: location.href }
      ]));
    };
    window.addEventListener('pagehide', (event) => {
      append('pagehide', event.persisted);
    });
    window.addEventListener('pageshow', (event) => {
      append('pageshow', event.persisted);
    });
  }, lifecycleKey);

  await page.goto('/#brand', { waitUntil: 'domcontentloaded' });
  await expectCleanShell(page, 'formal', 'brand');
  const formalAuthority = await page.locator('.phone-story')
    .getAttribute('data-phone-authority');
  const formalPlaneRevision = Number(await page.locator('.phone-story')
    .getAttribute('data-phone-plane-revision'));
  await page.evaluate((key) => sessionStorage.removeItem(key), lifecycleKey);

  await page.goto('/brand-lab#brand', { waitUntil: 'domcontentloaded' });
  await expectCleanShell(page, 'brand-lab', 'brand');
  await page.goBack();
  await expect(page).toHaveURL(/\/#brand$/);
  const backShell = page.locator('.phone-story');
  await expect(backShell).toHaveCount(1, { timeout: 20_000 });
  await expect(backShell).toHaveAttribute('data-phone-scope', 'formal');
  await expect(backShell).toHaveAttribute('data-phone-scene', 'brand');
  await expect(backShell).toHaveAttribute('data-phone-status', 'stable');
  const backAuthority = await page.locator('.phone-story')
    .getAttribute('data-phone-authority');
  const lifecycle = await page.evaluate((key) => JSON.parse(
    sessionStorage.getItem(key) ?? '[]'
  ) as Array<{ type: string; persisted: boolean; url: string }>, lifecycleKey);
  const restoredFromBfcache = lifecycle.some(({ type, persisted, url }) => (
    type === 'pageshow' && persisted && url.endsWith('/#brand')
  ));
  const notRestoredReason = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0] as
      PerformanceNavigationTiming & { notRestoredReasons?: { toJSON?(): unknown } | null };
    return navigation?.notRestoredReasons?.toJSON?.() ?? null;
  });
  testInfo.annotations.push({
    type: 'bfcache',
    description: restoredFromBfcache
      ? 'granted'
      : `not granted: ${JSON.stringify(notRestoredReason)}`
  });
  if (restoredFromBfcache) {
    expect(backAuthority).toBe(formalAuthority);
    await page.waitForFunction((before) => {
      const shell = document.querySelector<HTMLElement>('.phone-story');
      return Number(shell?.dataset.phonePlaneRevision) > before;
    }, formalPlaneRevision);
  }
  await assertSinglePhoneAuthority(page);

  await page.goForward();
  await expectCleanShell(page, 'brand-lab', 'brand');
  await assertSinglePhoneAuthority(page);
  await expect(page.locator('#phone-brand-title')).toBeVisible();
});

test('obsolete query compositions cannot select another phone shell', async ({ page }) => {
  await page.goto(
    '/?v=47&scope=brand-lab&portrait-spike=a&portrait-spike-motion=force#lab',
    { waitUntil: 'domcontentloaded' }
  );
  await expectCleanShell(page, 'formal', 'lab');
  await expect(page.locator('[data-phone-validation-scope]')).toHaveCount(0);
  await expect(page.locator('[data-portrait-spike]')).toHaveCount(0);
});

test('platform reduced motion keeps the formal route and proves its direct target', async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#figure2-animation', { waitUntil: 'domcontentloaded' });
  await expectCleanShell(page, 'formal', 'figure2-animation');
  await expect(page.locator('[data-phone-figure2-poster]')).toBeVisible();
  await expect(page.locator('[data-phone-activation]:not([hidden])')).toHaveCount(0);
});
