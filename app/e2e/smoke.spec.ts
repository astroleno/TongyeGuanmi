import { expect, test } from '@playwright/test';

test('R0 app shell loads without a real renderer', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('r0-scaffold')).toBeVisible();
  await expect(page.getByRole('heading', { name: '同野观幂 Story Runtime' })).toBeVisible();
  await expect(page.getByText('segments')).toBeVisible();
});
