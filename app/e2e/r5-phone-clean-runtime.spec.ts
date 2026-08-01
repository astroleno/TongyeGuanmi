import { expect, test } from '@playwright/test';
import {
  assertSinglePhoneAuthority,
  readCommitSequence,
  readPlaneRevision
} from './r5-phone-clean-assertions';

test('harness contract keeps one route-local authority under the opaque Loader', async ({
  page
}) => {
  await page.goto('/harness/r5-phone-clean#hero', { waitUntil: 'domcontentloaded' });
  await assertSinglePhoneAuthority(page);
  await expect(page.locator('.phone-story')).toHaveAttribute('data-phone-scope', 'harness');
  await expect(page.locator('[data-story-loader="true"]')).toBeVisible();
  expect(await readPlaneRevision(page)).toBeGreaterThanOrEqual(0);
  expect(await readCommitSequence(page)).toBe(0);
});
