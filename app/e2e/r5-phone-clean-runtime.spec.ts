import { expect, test, type Page } from '@playwright/test';
import {
  assertSinglePhoneAuthority,
  readCommitSequence,
  readPlaneRevision,
  waitForCommitSequence
} from './r5-phone-clean-assertions';

const PHONE_CORE_CHUNK = /\/assets\/PhoneStoryShell-[^/]+\.js$/;
const FIGURE3_SCENE_CHUNK = /\/assets\/PhoneFigure3-[^/]+\.js$/;
const RECOVERY_LINEAGE_KEY = 'r5-phone-chunk-recovery-lineage-v1';

async function expectBootstrapFailClosed(page: Page): Promise<void> {
  const recovery = page.locator('[data-phone-bootstrap="fail-closed"]');
  await expect(recovery).toBeVisible({ timeout: 20_000 });
  await expect(recovery).toHaveAttribute('role', 'alert');
  await expect(recovery.getByRole('button', { name: '重新加载' })).toBeVisible();
  await expect(page.locator('.phone-story')).toHaveCount(0);
}

test('formal contract keeps one route-local authority under the opaque Loader', async ({
  page
}) => {
  let releaseVideo = () => undefined;
  const videoGate = new Promise<void>((resolve) => { releaseVideo = resolve; });
  await page.route(/figure1-rgb-alpha.*\.mp4/, async (route) => {
    await videoGate;
    await route.continue();
  });
  await page.goto('/#hero', { waitUntil: 'domcontentloaded' });
  await assertSinglePhoneAuthority(page);
  await expect(page.locator('.phone-story')).toHaveAttribute('data-phone-scope', 'formal');
  await expect(page.locator('[data-story-loader="true"]')).toBeVisible();
  expect(await readPlaneRevision(page)).toBeGreaterThanOrEqual(0);
  expect(await readCommitSequence(page)).toBe(0);
  releaseVideo();
});

test('initial phone core delay preserves the static Loader until one clean authority mounts', async ({
  page
}) => {
  let releaseCore = () => undefined;
  let observeCore = () => undefined;
  const gate = new Promise<void>((resolve) => { releaseCore = resolve; });
  const requested = new Promise<void>((resolve) => { observeCore = resolve; });
  await page.route(PHONE_CORE_CHUNK, async (route) => {
    observeCore();
    await gate;
    await route.continue();
  });
  try {
    await page.goto('/#hero', { waitUntil: 'domcontentloaded' });
    await requested;
    await expect(page.locator('#story-loader-static')).toBeVisible();
    await expect(page.locator('.phone-story')).toHaveCount(0);
    releaseCore();
    await waitForCommitSequence(page, 'hero', 0);
    await assertSinglePhoneAuthority(page);
  } finally {
    releaseCore();
  }
});

test('offline hint does not block a reachable direct-entry native leaf import', async ({
  page
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => false
    });
  });
  let requests = 0;
  await page.route(FIGURE3_SCENE_CHUNK, async (route) => {
    requests += 1;
    await route.continue();
  });
  await page.goto('/#figure3-animation', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.phone-story')).toBeAttached();
  await expect(page.locator('[data-story-loader="true"]')).toBeVisible();
  await waitForCommitSequence(page, 'figure3-animation', 0);
  expect(requests).toBe(1);
  expect(await page.evaluate(() => performance.getEntriesByType('navigation').length)).toBe(1);
});

test('initial core rejection shares one lineage across one guarded reload and then fails closed', async ({
  page
}) => {
  await page.addInitScript((key) => {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, JSON.stringify({
      lineageId: 'old-deployment-lineage',
      entryUrl: `${location.origin}/#figure3-animation`,
      firstDocumentBuildId: 'old-document-build',
      currentDocumentBuildId: 'old-document-build',
      deployedBuildId: 'old-deployed-build',
      failedModuleUrl: '/assets/PhoneStoryShell-old.js',
      failedModuleClass: 'phone-core',
      automaticReloadCount: 0,
      status: 'classifying'
    }));
  }, RECOVERY_LINEAGE_KEY);
  let coreRequests = 0;
  let manifestRequests = 0;
  await page.route(PHONE_CORE_CHUNK, async (route) => {
    coreRequests += 1;
    await route.abort('failed');
  });
  await page.route(/\/r5-release-manifest\.json(?:\?.*)?$/, async (route) => {
    manifestRequests += 1;
    await route.continue();
  });
  await page.goto('/#figure3-animation', { waitUntil: 'domcontentloaded' });
  await expectBootstrapFailClosed(page);
  expect(coreRequests).toBe(2);
  expect(manifestRequests).toBe(1);
  await page.waitForTimeout(750);
  expect(coreRequests).toBe(2);
  expect(page.url()).toContain('/#figure3-animation');
  const lineage = await page.evaluate((key) => JSON.parse(
    sessionStorage.getItem(key) ?? 'null'
  ) as Record<string, unknown>, RECOVERY_LINEAGE_KEY);
  expect(lineage).toMatchObject({
    lineageId: 'old-deployment-lineage',
    firstDocumentBuildId: 'old-document-build',
    automaticReloadCount: 1,
    status: 'fail-closed'
  });
});

test('scene leaf rejection reloads once and reconstructs the direct target from its URL', async ({
  page
}) => {
  let leafRequests = 0;
  let manifestRequests = 0;
  await page.route(FIGURE3_SCENE_CHUNK, async (route) => {
    leafRequests += 1;
    if (leafRequests === 1) await route.abort('failed');
    else await route.continue();
  });
  await page.route(/\/r5-release-manifest\.json(?:\?.*)?$/, async (route) => {
    manifestRequests += 1;
    await route.continue();
  });
  await page.goto('/#figure3-animation', { waitUntil: 'domcontentloaded' });
  await waitForCommitSequence(page, 'figure3-animation', 0);
  await assertSinglePhoneAuthority(page);
  expect(leafRequests).toBe(2);
  expect(manifestRequests).toBe(1);
  expect(page.url()).toContain('/#figure3-animation');
  expect(await page.evaluate((key) => sessionStorage.getItem(key), RECOVERY_LINEAGE_KEY))
    .toBeNull();
});

test('a second post-reload leaf rejection stays fail-closed with an accessible retry', async ({
  page
}) => {
  await page.addInitScript((key) => {
    sessionStorage.setItem(key, JSON.stringify({
      lineageId: 'spent-lineage',
      entryUrl: `${location.origin}/#figure3-animation`,
      firstDocumentBuildId: 'first-build',
      currentDocumentBuildId: 'current-build',
      deployedBuildId: 'deployed-build',
      failedModuleUrl: '/assets/PhoneFigure3-first.js',
      failedModuleClass: 'scene-leaf',
      automaticReloadCount: 1,
      status: 'reloaded'
    }));
  }, RECOVERY_LINEAGE_KEY);
  let leafRequests = 0;
  let manifestRequests = 0;
  await page.route(FIGURE3_SCENE_CHUNK, async (route) => {
    leafRequests += 1;
    await route.abort('failed');
  });
  await page.route(/\/r5-release-manifest\.json(?:\?.*)?$/, async (route) => {
    manifestRequests += 1;
    await route.continue();
  });
  await page.goto('/#figure3-animation', { waitUntil: 'domcontentloaded' });
  const shell = page.locator('.phone-story');
  await expect(shell).toHaveAttribute('data-phone-status', 'faulted', {
    timeout: 20_000
  });
  await expect(shell).toHaveAttribute('data-phone-commit-sequence', '0');
  await expect(page.locator('[data-phone-retry="true"]')).toBeVisible();
  await expect(page.locator('[data-phone-plane="receiver"] > *')).toHaveCount(0);
  expect(leafRequests).toBe(1);
  expect(manifestRequests).toBe(0);
  await page.waitForTimeout(750);
  expect(leafRequests).toBe(1);
  expect(page.url()).toContain('/#figure3-animation');
});

for (const manifestFailure of [
  'http-failure', 'malformed-json', 'missing-identity', 'active-timeout'
] as const) {
  test(`initial core rejection reaches fail-closed on release manifest ${manifestFailure}`, async ({
    page
  }) => {
    await page.route(PHONE_CORE_CHUNK, (route) => route.abort('failed'));
    let manifestRequests = 0;
    await page.route(/\/r5-release-manifest\.json(?:\?.*)?$/, async (route) => {
      manifestRequests += 1;
      if (manifestFailure === 'http-failure') {
        await route.fulfill({ status: 503, body: 'unavailable' });
      } else if (manifestFailure === 'malformed-json') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{' });
      } else if (manifestFailure === 'missing-identity') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      } else {
        await new Promise((resolve) => setTimeout(resolve, 3_500));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ sourceCommit: 'too-late' })
        }).catch(() => undefined);
      }
    });
    await page.goto('/#hero', { waitUntil: 'domcontentloaded' });
    await expectBootstrapFailClosed(page);
    expect(manifestRequests).toBe(1);
  });
}

test('sessionStorage failure disables automatic core reload and exposes a manual action', async ({
  page
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get: () => { throw new DOMException('storage blocked', 'SecurityError'); }
    });
  });
  let coreRequests = 0;
  await page.route(PHONE_CORE_CHUNK, async (route) => {
    coreRequests += 1;
    await route.abort('failed');
  });
  await page.goto('/#hero', { waitUntil: 'domcontentloaded' });
  await expectBootstrapFailClosed(page);
  expect(coreRequests).toBe(1);
});

test('a superseded late scene response cannot satisfy or replace the newer direct entry', async ({
  page
}) => {
  let releaseFigure3 = () => undefined;
  let observeFigure3 = () => undefined;
  const gate = new Promise<void>((resolve) => { releaseFigure3 = resolve; });
  const requested = new Promise<void>((resolve) => { observeFigure3 = resolve; });
  await page.route(FIGURE3_SCENE_CHUNK, async (route) => {
    observeFigure3();
    await gate;
    await route.continue();
  });
  try {
    await page.goto('/#brand', { waitUntil: 'domcontentloaded' });
    const before = await waitForCommitSequence(page, 'brand', 0);
    await page.keyboard.press('ArrowDown');
    await requested;
    await page.evaluate(() => { window.location.hash = '#services'; });
    await waitForCommitSequence(page, 'services', before);
    const committed = await readCommitSequence(page);
    releaseFigure3();
    await page.waitForTimeout(750);
    await expect(page.locator('.phone-story')).toHaveAttribute('data-phone-scene', 'services');
    expect(await readCommitSequence(page)).toBe(committed);
  } finally {
    releaseFigure3();
  }
});

test('AOD direct entry proves its immutable poster without invoking video playback', async ({ page }) => {
  await page.goto('/#aod-animation', {
    waitUntil: 'domcontentloaded'
  });
  await waitForCommitSequence(page, 'aod-animation', 0);
  await assertSinglePhoneAuthority(page);
  const video = page.locator('[data-aod-figure-video]');
  const poster = page.locator('[data-phone-aod-figure-poster]');
  await expect(video).toHaveJSProperty('muted', true);
  await expect(video).toHaveJSProperty('playsInline', true);
  await expect(poster).toBeVisible();
  await page.waitForFunction(() => {
    const image = document.querySelector<HTMLImageElement>('[data-phone-aod-figure-poster]');
    return image?.complete === true && image.naturalWidth > 0 && image.naturalHeight > 0;
  });
  expect(await video.evaluate((element) => ({
    currentTime: element.currentTime,
    paused: element.paused,
    playbackFrame: element.closest<HTMLElement>('[data-r4-scene="aod-animation"]')
      ?.dataset.phoneAodPlaybackFrame
  }))).toEqual({ currentTime: 0, paused: true, playbackFrame: undefined });
  await expect(page.locator('[data-phone-activation]:not([hidden])')).toHaveCount(0);
  await expect(page.locator('[data-story-loader="true"]'))
    .toHaveAttribute('data-loader-status', 'hidden');
});

test('AOD direct entry never invokes a rejected autoplay before a physical outgoing gesture', async ({ page }) => {
  await page.addInitScript(() => {
    let calls = 0;
    HTMLMediaElement.prototype.play = function patchedPlay() {
      if (this.matches('[data-aod-figure-video]')) calls += 1;
      return Promise.reject(new DOMException('gesture required', 'NotAllowedError'));
    };
    Object.defineProperty(window, '__r5AodPlayCalls', { configurable: true, get: () => calls });
  });
  await page.goto('/#aod-animation', {
    waitUntil: 'domcontentloaded'
  });
  await waitForCommitSequence(page, 'aod-animation', 0);
  expect(await page.evaluate(() => (
    window as typeof window & { __r5AodPlayCalls: number }
  ).__r5AodPlayCalls)).toBe(0);
  await expect(page.locator('[data-phone-activation]:not([hidden])')).toHaveCount(0);
  await expect(page.locator('.phone-story')).toHaveAttribute('data-phone-status', 'stable');
});

test('formal phone route survives a same-entry retry without duplicate target registration', async ({ page }) => {
  await page.goto('/#education', { waitUntil: 'domcontentloaded' });
  await waitForCommitSequence(page, 'education', 0);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForCommitSequence(page, 'education', 0);
  await assertSinglePhoneAuthority(page);
  await expect(page.locator('.phone-story')).toHaveAttribute('data-phone-status', 'stable');
  await expect(page.locator('.phone-story')).not.toHaveAttribute(
    'data-phone-last-failure', /already registered/
  );
});
