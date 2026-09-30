import { expect, test } from '@playwright/test';

test('production StoryApp replaces the R0 scaffold at the public root', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-production-story-app="true"]')).toBeVisible();
  await expect(page.getByTestId('r0-scaffold')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '同野观幂' })).toBeVisible({ timeout: 12_000 });
  await expect(page).toHaveTitle('同野观幂｜企业 AI 转型咨询、培训与场景落地');
});
