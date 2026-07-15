import { expect, test } from '@playwright/test';

test.use({ javaScriptEnabled: false });

test('no-JS HTML exposes core正文, metadata, navigation, and scrollable anchors', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expect(page).toHaveTitle('同野观幂｜AI 转型与能力建设');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', '/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.locator('#root')).toBeEmpty();
  await expect(page.locator('[data-static-story-content="true"]')).toBeVisible();
  await expect(page.locator('[data-static-story-content="true"] h1')).toHaveCount(1);
  await expect(page.locator('#home')).toContainText('你的同行不是更聪明');
  await expect(page.locator('#method')).toContainText('先识场，再立法');
  await expect(page.locator('#services')).toContainText('先跑通');
  await expect(page.locator('#education')).toContainText('先会用');
  await expect(page.locator('#contact')).toContainText('约一次 AI 现场诊断');
  await expect(page.locator('a[href="#method"]')).toBeVisible();
  await expect(page.locator('a[href="#contact"]')).toBeVisible();
  const footer = page.locator('[data-site-footer="true"]');
  await expect(footer).toBeVisible();
  await expect(footer).toHaveCount(1);
  await expect(footer.getByText('© 上海同野观幂科技有限公司', { exact: true })).toHaveCount(1);
  await expect(footer.getByText('AI Transformation & Capability Building', { exact: true })).toHaveCount(1);
  await expect(footer.getByRole('link', { name: '服务备案号 沪ICP备2024086119号-3', exact: true }))
    .toHaveAttribute('href', 'https://beian.miit.gov.cn/');
  await expect(footer.getByRole('link', { name: '沪公网安备 31011502406697号（新窗口打开）', exact: true }))
    .toHaveAttribute('href', 'https://www.beian.gov.cn/portal/registerSystemInfo?recordcode=31011502406697');
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', /\/assets\/favicon-[^/]+\.svg$/);
  await expect(page.locator('link[rel="preload"][as="font"]')).toHaveAttribute(
    'href',
    /\/assets\/qiji-title-subset-[^/]+\.ttf$/
  );
  expect(await page.evaluate(() => document.body.scrollHeight > window.innerHeight)).toBe(true);
  expect(await page.locator('[inert], [style*="visibility: hidden"], [style*="opacity: 0"]').count()).toBe(0);
});
