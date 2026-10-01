import { expect, test } from '@playwright/test';

test.use({ javaScriptEnabled: false });

test('no-JS HTML exposes core正文, metadata, navigation, and scrollable anchors', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expect(page).toHaveTitle('同野观幂｜企业 AI 转型咨询、培训与场景落地');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://tongye.me/');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1'
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    'https://tongye.me/og-image.webp'
  );
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.locator('#root')).toBeEmpty();
  await expect(page.locator('[data-static-story-content="true"]')).toBeVisible();
  await expect(page.locator('[data-static-story-content="true"] h1')).toHaveCount(1);
  await expect(page.locator('[data-static-story-content="true"] h1')).toHaveText(
    '同野观幂｜企业 AI 转型咨询与场景落地'
  );
  await expect(page.locator('#home')).toContainText('你的同行不是更聪明');
  await expect(page.locator('#method')).toContainText('先识场，再立法');
  await expect(page.locator('#services')).toContainText('先跑通');
  await expect(page.locator('#education')).toContainText('先会用');
  await expect(page.locator('#contact')).toContainText('约一次 AI 现场诊断');
  await expect(page.locator('#contact a[href^="mailto:aitoshuu@gmail.com"]')).toBeVisible();
  await expect(page.locator('a[href="#method"]')).toBeVisible();
  await expect(page.locator('a[href="#contact"]')).toBeVisible();
  const staticText = await page.locator('[data-static-story-content="true"]').innerText();
  expect(staticText).not.toContain('FIELD CHECK');
  expect(staticText).not.toContain('06 SCENES');
  const footer = page.locator('[data-site-footer="true"]');
  await expect(footer).toBeVisible();
  await expect(footer).toHaveCount(1);
  await expect(footer.getByText('© 上海同野观幂科技有限公司', { exact: true })).toHaveCount(1);
  await expect(footer.getByText('AI Transformation & Capability Building', { exact: true })).toHaveCount(1);
  await expect(footer.getByRole('link', { name: '服务备案号 沪ICP备2024086119号-3', exact: true }))
    .toHaveAttribute('href', 'https://beian.miit.gov.cn/');
  await expect(footer.getByRole('link', { name: '沪公网安备 31011502406697号（新窗口打开）', exact: true }))
    .toHaveAttribute('href', 'https://www.beian.gov.cn/portal/registerSystemInfo?recordcode=31011502406697');
  await expect(page.locator('link[rel="icon"][type="image/svg+xml"]'))
    .toHaveAttribute('href', /\/assets\/favicon-[^/]+\.svg$/);
  await expect(page.locator('link[rel="preload"][as="font"]')).toHaveAttribute(
    'href',
    /\/assets\/qiji-title-subset-[^/]+\.ttf$/
  );
  expect(await page.evaluate(() => document.body.scrollHeight > window.innerHeight)).toBe(true);
  expect(await page.locator('[inert], [style*="visibility: hidden"], [style*="opacity: 0"]').count()).toBe(0);
});

test('crawler endpoints are real machine-readable resources rather than SPA fallbacks', async ({ request }) => {
  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  expect(robots.headers()['content-type']).toContain('text/plain');
  expect(await robots.text()).toContain('Sitemap: https://tongye.me/sitemap.xml');

  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  expect(sitemap.headers()['content-type']).toMatch(/(?:application|text)\/xml/);
  expect(await sitemap.text()).toContain('<loc>https://tongye.me/</loc>');

  const llms = await request.get('/llms.txt');
  expect(llms.status()).toBe(200);
  expect(llms.headers()['content-type']).toContain('text/plain');
  expect(await llms.text()).toContain('# 同野观幂');
  expect(await llms.text()).toContain('aitoshuu@gmail.com');
});

test('public service and FAQ pages are complete without JavaScript or cinematic assets', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  for (const route of ['/services/', '/faq/']) {
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://tongye.me${route}`);
    await expect(page.locator('nav[aria-label="主导航"] a[aria-current="page"]')).toHaveAttribute('href', route);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.locator('a[href^="mailto:aitoshuu@gmail.com"]').first()).toBeVisible();
  }
  await expect(page.locator('.answer')).toHaveCount(6);
  await page.locator('.question-index a[href="#after-delivery"]').click();
  await expect(page.locator('#after-delivery')).toBeInViewport();
  expect(requests.some((url) => /\.(?:js|mp4|webm)(?:[?#]|$)/.test(url))).toBe(false);
});

test('public content routes canonicalize while unknown paths return a real 404', async ({ request }) => {
  for (const [source, target] of [['/services', '/services/'], ['/faq/index.html', '/faq/']]) {
    const response = await request.get(`${source}?from=check`, {maxRedirects: 0});
    expect(response.status()).toBe(301);
    expect(response.headers().location).toBe(`${target}?from=check`);
  }
  expect((await request.get('/seo-audit-not-a-real-page')).status()).toBe(404);
  expect((await request.get('/missing-seo-image.webp')).status()).toBe(404);
});
