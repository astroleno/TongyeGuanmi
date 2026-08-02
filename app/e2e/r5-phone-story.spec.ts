import { expect, test } from '@playwright/test';
import {
  assertSinglePhoneAuthority,
  waitForCommitSequence
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
  await waitForCommitSequence(page, scene, 0);
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
  await expect(page.locator(
    '[data-r4-scene="figure2-animation"] [data-figure2-packed-alpha-canvas]'
  )).toBeVisible();
});
