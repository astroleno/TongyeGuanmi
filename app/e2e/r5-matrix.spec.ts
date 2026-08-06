import { expect, test, type Page } from '@playwright/test';
import {
  bootStory,
  moveOneHold,
  navigateStory,
  storySnapshot,
  waitForHold
} from './r5-helpers';
import {
  assertSinglePhoneAuthority,
  readCommitSequence,
  waitForCommitSequence
} from './r5-phone-clean-assertions';

let cleanDocumentSequence = 0;

async function bootCleanPhone(page: Page, scene: string): Promise<number> {
  cleanDocumentSequence += 1;
  await page.goto(`/?r5-matrix-entry=${cleanDocumentSequence}#${scene}`, {
    waitUntil: 'domcontentloaded'
  });
  const sequence = await waitForCommitSequence(page, scene, 0);
  await assertSinglePhoneAuthority(page);
  await expect(page.locator('.phone-story')).toHaveAttribute('data-phone-scope', 'formal');
  await expect(page.locator('.phone-story')).toHaveAttribute('data-phone-interaction', 'enabled');
  return sequence;
}

async function dispatchPhonePointerIntent(page: Page, direction: 1 | -1): Promise<void> {
  const start = direction === 1 ? 700 : 300;
  await page.mouse.move(180, start);
  await page.mouse.down();
  await page.mouse.move(180, start - direction * 160, { steps: 4 });
  await page.mouse.up();
}

test('desktop wheel requires a fresh touchpad burst at the Pattern compact checkpoint and reverses', async ({ page }) => {
  await bootStory(page);

  await page.mouse.wheel(0, 120);
  await waitForHold(page, 'pattern');

  const trackpadBurst = () => page.evaluate(() => {
    const target = document.querySelector<HTMLElement>('.story-app');
    if (!target) throw new Error('story app missing');
    for (let index = 0; index < 5; index += 1) {
      target.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        deltaY: 40,
        deltaMode: WheelEvent.DOM_DELTA_PIXEL
      }));
    }
  });
  const waitForPatternCheckpoint = (stageIndex: number) => page.waitForFunction((expected) => {
    const runtime = (window as Window & {
      __story?: {
        getState(): {
          state: unknown;
          context: { pausePoint?: { stageIndex?: number } };
        };
      };
    }).__story?.getState();
    return runtime?.state === 'staged-paused'
      && runtime.context.pausePoint?.stageIndex === expected;
  }, stageIndex);

  await trackpadBurst();
  await waitForPatternCheckpoint(0);
  expect((await storySnapshot(page)).current).toBe('pattern');

  await trackpadBurst();
  await waitForHold(page, 'star-map');

  expect((await moveOneHold(page, -1)).current).toBe('pattern');
});

test('browser pointer swipe drives the clean normalized input contract', async ({ page }) => {
  const before = await bootCleanPhone(page, 'hero');
  await dispatchPhonePointerIntent(page, 1);
  await waitForCommitSequence(page, 'pattern', before);
  await expect(page.locator('.phone-story')).toHaveAttribute('data-phone-scene', 'pattern');
  await expect(page.locator(
    '[data-phone-plane="source"] .portrait-scroll-spike__scene--pattern'
  ))
    .toBeVisible();
});

test('portrait phones enter the clean story without an orientation prompt', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await bootCleanPhone(page, 'brand');

  await expect(page.locator('.phone-story')).toHaveAttribute('data-phone-scene', 'brand');
  await expect(page.locator('[data-mobile-landscape-gate]')).toHaveCount(0);
  await expect(page.locator('[data-phone-plane="source"] [data-phone-scene="brand"]'))
    .toBeVisible();
});

test('iPhone bypasses orientation prompts and keeps a direct AOD entry static until its outgoing gesture', async ({ page }) => {
  await page.addInitScript(() => {
    let calls = 0;
    HTMLMediaElement.prototype.play = function patchedPlay() {
      if (this.matches('[data-aod-figure-video]')) calls += 1;
      return Promise.reject(new DOMException('gesture required', 'NotAllowedError'));
    };
    Object.defineProperty(window, '__r5AodPlayCalls', { configurable: true, get: () => calls });
  });
  await page.setViewportSize({ width: 734, height: 343 });
  await page.goto('/#aod-animation', { waitUntil: 'domcontentloaded' });
  await assertSinglePhoneAuthority(page);
  await expect(page.locator('[data-mobile-landscape-gate]')).toHaveCount(0);
  await waitForCommitSequence(page, 'aod-animation', 0);
  await expect(page.locator('[data-phone-aod-figure-poster]')).toBeVisible();
  await expect(page.locator('[data-phone-activation]:not([hidden])')).toHaveCount(0);
  expect(await page.evaluate(() => (
    window as typeof window & { __r5AodPlayCalls: number }
  ).__r5AodPlayCalls)).toBe(0);
});

test('iPhone WebKit clean direct-entry matrix keeps one authority and no media timeout', async ({ page }) => {
  test.setTimeout(180_000);
  const scenes = [
    'hero', 'aod-animation', 'figure2-animation', 'figure3-animation',
    'ttg-animation', 'ph-animation', 'crane-animation', 'contact'
  ] as const;
  for (const scene of scenes) {
    await bootCleanPhone(page, scene);
    await expect(page.locator('.phone-story')).not.toHaveAttribute('data-phone-status', 'faulted');
    await expect(page.locator('[data-story-loader="true"]'))
      .toHaveAttribute('data-loader-status', 'hidden');
  }
});

test('mobile menu remains touch reachable and closes after clean navigation', async ({ page }) => {
  const before = await bootCleanPhone(page, 'star-map');
  const menu = page.getByRole('button', { name: '菜单' });
  await menu.tap();
  await expect(page.locator('.site-nav')).toHaveAttribute('data-menu-open', 'true');
  await page.getByRole('link', { name: '联系' }).tap();
  await waitForCommitSequence(page, 'contact', before);
  await expect(page.locator('.site-nav')).toHaveAttribute('data-menu-open', 'false');
  await expect(page.locator('.phone-story')).toHaveAttribute('data-phone-scene', 'contact');
});

test('mobile rotation and dynamic viewport height keep the clean active scene stable', async ({ page }) => {
  await bootCleanPhone(page, 'services');
  const sequence = await readCommitSequence(page);

  await page.setViewportSize({ width: 740, height: 390 });
  await expect(page.locator('.phone-story')).toHaveAttribute('data-phone-scene', 'services');
  await expect(page.locator('[data-phone-plane="source"] [data-phone-scene="services"]'))
    .toBeVisible();

  await page.setViewportSize({ width: 390, height: 720 });
  await expect(page.locator('.phone-story')).toHaveAttribute('data-phone-scene', 'services');
  expect(await readCommitSequence(page)).toBe(sequence);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
});

test('desktop typography roles and Proof content fit hold at both audit viewports', async ({ page }) => {
  test.setTimeout(120_000);

  await bootStory(page, '/#method-top');
  const readingScenes = [
    { scene: 'method-top', root: 'method-top', row: '.r4-method__row', body: 'p' },
    { scene: 'services', root: 'services', row: '.r4-services__row', body: 'p' },
    { scene: 'lab', root: 'lab', row: '.r4-lab__row', body: 'p' },
    { scene: 'education', root: 'education', row: '.r4-education__row', body: 'em' }
  ] as const;

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(viewport);
    for (const scene of readingScenes) {
      await navigateStory(page, scene.scene);
      const metrics = await page.evaluate(({ rootName, rowSelector, bodySelector }) => {
        const root = document.querySelector<HTMLElement>(`[data-r4-scene="${rootName}"]`);
        const row = root?.querySelector<HTMLElement>(rowSelector);
        const body = row?.querySelector<HTMLElement>(bodySelector);
        if (!root || !row || !body) throw new Error(`missing desktop geometry for ${rootName}`);
        return {
          bodyFontSize: Number.parseFloat(getComputedStyle(body).fontSize),
          rootOverflow: root.scrollWidth - root.clientWidth
        };
      }, { rootName: scene.root, rowSelector: scene.row, bodySelector: scene.body });

      expect(metrics.bodyFontSize).toBeGreaterThanOrEqual(16);
      expect(metrics.bodyFontSize).toBeLessThanOrEqual(17);
      expect(metrics.rootOverflow, `${scene.scene} at ${viewport.width}×${viewport.height}`)
        .toBeLessThanOrEqual(1);
    }

    await navigateStory(page, 'education');
    await expect(page.locator('.site-nav')).toHaveAttribute('data-tone', 'light');

    await navigateStory(page, 'figure2-proof');
    const proofFit = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>('[data-r4-scene="figure2-proof"]');
      const cards = root?.querySelector<HTMLElement>('[data-r4-proof-panel="cards"]');
      const closing = root?.querySelector<HTMLElement>('[data-r4-proof-panel="closing"]');
      if (!root || !cards || !closing) throw new Error('proof geometry missing');
      root.scrollTop = cards.offsetTop;
      const rows = [...cards.querySelectorAll<HTMLElement>('.r4-proof-cards__row')];
      const cardsRect = cards.getBoundingClientRect();
      const closingRect = closing.getBoundingClientRect();
      return {
        firstTop: rows[0]?.getBoundingClientRect().top ?? Number.NaN,
        lastBottom: rows.at(-1)?.getBoundingClientRect().bottom ?? Number.NaN,
        panelTop: cardsRect.top,
        panelBottom: cardsRect.bottom,
        closingTop: closingRect.top
      };
    });

    expect(proofFit.firstTop).toBeGreaterThanOrEqual(proofFit.panelTop - 1);
    expect(proofFit.lastBottom).toBeLessThanOrEqual(proofFit.panelBottom + 1);
    expect(proofFit.lastBottom).toBeLessThanOrEqual(proofFit.closingTop + 1);
  }
});

test('compact phone landscape keeps clean reading rows and visual roots inside the viewport', async ({ page }) => {
  test.setTimeout(120_000);
  const readingScenes = ['method-top', 'services', 'lab', 'education'] as const;

  for (const viewport of [{ width: 844, height: 390 }, { width: 915, height: 412 }]) {
    await page.setViewportSize(viewport);
    for (const scene of readingScenes) {
      await bootCleanPhone(page, scene);
      const metrics = await page.locator(`[data-phone-reading="${scene}"]`).evaluate((root) => {
        const readableFontSize = Math.max(0, ...[...root.querySelectorAll<HTMLElement>('p, em')]
          .map((element) => Number.parseFloat(getComputedStyle(element).fontSize)));
        const rect = root.getBoundingClientRect();
        return {
          width: rect.width,
          left: rect.left,
          right: rect.right,
          readableFontSize,
          overflow: root.scrollWidth - root.clientWidth
        };
      });
      expect(metrics.left).toBeGreaterThanOrEqual(-1);
      expect(metrics.right).toBeLessThanOrEqual(viewport.width + 1);
      expect(metrics.width).toBeGreaterThan(280);
      expect(metrics.readableFontSize).toBeGreaterThanOrEqual(15);
      expect(metrics.overflow).toBeLessThanOrEqual(1);
    }

    for (const scene of ['brand', 'figure2-proof'] as const) {
      await bootCleanPhone(page, scene);
      const overflow = await page.locator('.phone-story').evaluate((root) => (
        root.scrollWidth - root.clientWidth
      ));
      expect(overflow, `${scene} at ${viewport.width}×${viewport.height}`)
        .toBeLessThanOrEqual(1);
    }
  }
});
