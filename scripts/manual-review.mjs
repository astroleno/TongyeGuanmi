#!/usr/bin/env node
import { chromium } from 'playwright';

async function manualReview() {
  console.log('正在启动浏览器进行手动 review...\n');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 500
  });

  const page = await browser.newPage();
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');

  console.log('浏览器已打开，现在进行检查：\n');
  console.log('1. 观察 hero → pattern 转场，pattern 是否闭合？');
  console.log('2. 观察 pattern → star-map 转场，是否有闪烁？star-map 高度是否正常？');
  console.log('3. 继续滚动检查其他转场...\n');

  // 保持浏览器打开，允许手动检查
  console.log('浏览器将保持打开 5 分钟，你可以手动测试...');
  console.log('按 Ctrl+C 提前关闭\n');

  await page.waitForTimeout(300000); // 5 minutes
  await browser.close();
}

manualReview().catch(console.error);
