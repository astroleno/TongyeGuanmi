/* global document, HTMLElement, matchMedia, requestAnimationFrame, window */
import { chromium, devices } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoDir = path.dirname(appDir);
const outputDir = path.join(repoDir, 'artifacts/react-refactor/r5-candidate/visual');
const typographyOutputDir = path.join(outputDir, 'typography-responsive');
const baseUrl = process.env.R5_BASE_URL ?? 'http://127.0.0.1:4173';

await mkdir(outputDir, { recursive: true });
await mkdir(typographyOutputDir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });

async function waitForHold(page, scene) {
  await page.waitForFunction((expected) => {
    const snapshot = window.__storyApp?.snapshot();
    return snapshot?.phase === 'hold'
      && snapshot.current === expected
      && snapshot.presentationReady === true
      && snapshot.loaderStatus === 'hidden';
  }, scene, { timeout: 30_000 });
}

async function settle(page) {
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
}

async function openStory(page, scene) {
  const storyUrl = new URL(baseUrl);
  storyUrl.searchParams.set('capture', scene);
  storyUrl.hash = scene;
  await page.goto(storyUrl.href, { waitUntil: 'domcontentloaded' });
  const isLandscape = await page.evaluate(() => matchMedia('(orientation: landscape)').matches);
  await page.waitForFunction((landscape) => {
    const state = document.querySelector('.story-app')?.dataset.mobileLandscapeState;
    return landscape
      ? state === 'bypass' || state === 'landscape-ready' || state === 'started'
      : state === 'bypass' || state === 'portrait-blocked' || state === 'started';
  }, isLandscape);
  const entryState = await page.locator('.story-app').getAttribute('data-mobile-landscape-state');
  if (entryState === 'landscape-ready') {
    await page.getByRole('button', { name: '开始浏览' }).click();
  }
  if (entryState === 'portrait-blocked') {
    await page.waitForFunction((expected) => {
      const snapshot = window.__storyApp?.snapshot();
      return snapshot?.phase === 'hold' && snapshot.current === expected;
    }, scene, { timeout: 30_000 });
    await settle(page);
    return;
  }
  await waitForHold(page, scene);
  await settle(page);
}

async function scrollSceneTo(page, rootSelector, targetSelector) {
  await page.evaluate(({ rootSelector: rootQuery, targetSelector: targetQuery }) => {
    const root = document.querySelector(rootQuery);
    const target = root?.querySelector(targetQuery);
    if (!(root instanceof HTMLElement) || !(target instanceof HTMLElement)) {
      throw new Error(`Unable to scroll ${rootQuery} to ${targetQuery}`);
    }
    root.scrollTop = target.offsetTop;
  }, { rootSelector, targetSelector });
  await settle(page);
}

try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await desktop.newPage();

  await openStory(page, 'hero');
  await page.screenshot({ path: path.join(outputDir, 'desktop-home.png') });

  await openStory(page, 'pattern');
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(outputDir, 'desktop-pattern.png') });

  await openStory(page, 'method-top');
  await scrollSceneTo(page, '[data-r4-scene="method-top"]', '.r4-method__vertical');
  await page.screenshot({ path: path.join(typographyOutputDir, 'desktop-1440-method-detail.png') });

  await openStory(page, 'figure2-proof');
  await scrollSceneTo(page, '[data-r4-scene="figure2-proof"]', '[data-r4-proof-panel="cards"]');
  await page.screenshot({ path: path.join(typographyOutputDir, 'desktop-1440-proof-cards.png') });

  await openStory(page, 'brand');
  await page.screenshot({ path: path.join(typographyOutputDir, 'desktop-1440-brand.png') });

  await desktop.close();

  const compactDesktop = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const compactDesktopPage = await compactDesktop.newPage();
  await openStory(compactDesktopPage, 'method-top');
  await scrollSceneTo(compactDesktopPage, '[data-r4-scene="method-top"]', '.r4-method__vertical');
  await compactDesktopPage.screenshot({ path: path.join(typographyOutputDir, 'desktop-1280-method-detail.png') });
  await openStory(compactDesktopPage, 'figure2-proof');
  await scrollSceneTo(compactDesktopPage, '[data-r4-scene="figure2-proof"]', '[data-r4-proof-panel="cards"]');
  await compactDesktopPage.screenshot({ path: path.join(typographyOutputDir, 'desktop-1280-proof-cards.png') });
  await compactDesktop.close();

  const phone844 = await browser.newContext({
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true
  });
  const phone844Page = await phone844.newPage();
  await openStory(phone844Page, 'method-top');
  await scrollSceneTo(phone844Page, '[data-r4-scene="method-top"]', '.r4-method__vertical');
  await phone844Page.screenshot({ path: path.join(typographyOutputDir, 'phone-844-method-detail.png') });
  await openStory(phone844Page, 'lab');
  await scrollSceneTo(phone844Page, '[data-r4-scene="lab"]', '.r4-lab__portrait');
  await phone844Page.screenshot({ path: path.join(typographyOutputDir, 'phone-844-lab-detail.png') });
  await openStory(phone844Page, 'brand');
  await phone844Page.screenshot({ path: path.join(typographyOutputDir, 'phone-844-brand.png') });
  await openStory(phone844Page, 'figure2-proof');
  await scrollSceneTo(phone844Page, '[data-r4-scene="figure2-proof"]', '[data-r4-proof-panel="cards"]');
  await phone844Page.screenshot({ path: path.join(typographyOutputDir, 'phone-844-proof-cards.png') });
  await phone844.close();

  const phone915 = await browser.newContext({
    viewport: { width: 915, height: 412 },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true
  });
  const phone915Page = await phone915.newPage();
  await openStory(phone915Page, 'services');
  await scrollSceneTo(phone915Page, '[data-r4-scene="services"]', '.r4-services__vertical');
  await phone915Page.screenshot({ path: path.join(typographyOutputDir, 'phone-915-services-detail.png') });
  await openStory(phone915Page, 'education');
  await scrollSceneTo(phone915Page, '[data-r4-scene="education"]', '.r4-education__vertical');
  await phone915Page.screenshot({ path: path.join(typographyOutputDir, 'phone-915-education-detail.png') });
  await openStory(phone915Page, 'contact');
  await phone915Page.screenshot({ path: path.join(typographyOutputDir, 'phone-915-contact.png') });
  await phone915.close();

  const mobile = await browser.newContext({ ...devices['Pixel 7'] });
  const mobilePage = await mobile.newPage();
  await openStory(mobilePage, 'hero');
  await mobilePage.screenshot({ path: path.join(typographyOutputDir, 'phone-portrait-hero.png') });
  await openStory(mobilePage, 'pattern');
  await mobilePage.screenshot({ path: path.join(typographyOutputDir, 'phone-portrait-pattern.png') });
  await openStory(mobilePage, 'star-map');
  await mobilePage.screenshot({ path: path.join(typographyOutputDir, 'phone-portrait-star-map.png') });
  await openStory(mobilePage, 'method-top');
  await scrollSceneTo(mobilePage, '[data-r4-scene="method-top"]', '.r4-method__vertical');
  await mobilePage.screenshot({ path: path.join(typographyOutputDir, 'phone-portrait-method-detail.png') });
  await openStory(mobilePage, 'figure2-proof');
  await mobilePage.screenshot({ path: path.join(typographyOutputDir, 'phone-portrait-proof-opening.png') });
  await scrollSceneTo(mobilePage, '[data-r4-scene="figure2-proof"]', '[data-r4-proof-panel="cards"]');
  await mobilePage.screenshot({ path: path.join(typographyOutputDir, 'phone-portrait-proof-cards.png') });
  await scrollSceneTo(mobilePage, '[data-r4-scene="figure2-proof"]', '[data-r4-proof-panel="closing"]');
  await mobilePage.screenshot({ path: path.join(typographyOutputDir, 'phone-portrait-proof-closing.png') });
  await openStory(mobilePage, 'brand');
  await mobilePage.screenshot({ path: path.join(typographyOutputDir, 'phone-portrait-brand.png') });
  await openStory(mobilePage, 'services');
  await scrollSceneTo(mobilePage, '[data-r4-scene="services"]', '.r4-services__vertical');
  await mobilePage.screenshot({ path: path.join(typographyOutputDir, 'phone-portrait-services-detail.png') });
  await openStory(mobilePage, 'education');
  await scrollSceneTo(mobilePage, '[data-r4-scene="education"]', '.r4-education__vertical');
  await mobilePage.screenshot({ path: path.join(typographyOutputDir, 'phone-portrait-education-detail.png') });
  await openStory(mobilePage, 'lab');
  await scrollSceneTo(mobilePage, '[data-r4-scene="lab"]', '.r4-lab__portrait');
  await mobilePage.screenshot({ path: path.join(typographyOutputDir, 'phone-portrait-lab-detail.png') });
  await openStory(mobilePage, 'contact');
  await mobilePage.screenshot({ path: path.join(typographyOutputDir, 'phone-portrait-contact.png') });
  await openStory(mobilePage, 'services');
  await mobilePage.screenshot({ path: path.join(outputDir, 'mobile-services.png') });
  await mobile.close();
} finally {
  await browser.close();
}

process.stdout.write(`${outputDir}\n`);
