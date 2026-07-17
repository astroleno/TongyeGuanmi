import { expect, test } from '@playwright/test';
import {
  bootStory,
  canonicalScenes,
  eventTypes,
  expectLayerInvariants,
  moveOneHold,
  navigateStory,
  storySnapshot,
  waitForHold
} from './r5-helpers';

test('desktop wheel requires a fresh touchpad burst at the Pattern compact checkpoint and reverses', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('desktop-'), 'desktop pointer matrix');
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

test('touchscreen swipe drives the same normalized input contract', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile-'), 'touchscreen matrix');
  await bootStory(page);

  await page.evaluate(() => {
    const target = document.querySelector<HTMLElement>('.story-app');
    if (!target) throw new Error('story app missing');
    const dispatchTouch = (type: string, clientY: number | undefined) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'touches', {
        value: clientY === undefined ? [] : [{ clientX: 180, clientY }]
      });
      target.dispatchEvent(event);
    };
    dispatchTouch('touchstart', 700);
    dispatchTouch('touchmove', 500);
    dispatchTouch('touchend', undefined);
  });

  await waitForHold(page, 'pattern');
  expect((await storySnapshot(page)).visibleLayers).toBe(1);
});

test('portrait phones enter the story without an orientation prompt', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile-'), 'mobile orientation policy');
  await page.setViewportSize({ width: 390, height: 844 });
  const snapshot = await bootStory(page, '/#brand');

  expect(snapshot.current).toBe('brand');
  expect(snapshot.mobileLandscapeState).toBe('bypass');
  expect(snapshot.experienceInteractive).toBe(true);
  await expect(page.locator('[data-mobile-landscape-gate]')).toHaveCount(0);
});

test('iPhone bypasses the orientation prompt and touch still unlocks staged video', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-webkit', 'iPhone WebKit media activation runs once');
  test.setTimeout(120_000);

  await page.addInitScript(() => {
    type MediaUnlockCall = Readonly<{
      gesture: string | undefined;
      key: string;
    }>;
    type InstrumentedWindow = Window & {
      __r5ActiveGesture?: string;
      __r5MediaUnlockCalls?: MediaUnlockCall[];
    };
    const instrumented = window as InstrumentedWindow;
    instrumented.__r5MediaUnlockCalls = [];
    let gestureTimer: number | undefined;
    const markGesture = (event: Event) => {
      instrumented.__r5ActiveGesture = event.type;
      window.clearTimeout(gestureTimer);
      gestureTimer = window.setTimeout(() => {
        if (instrumented.__r5ActiveGesture === event.type) {
          delete instrumented.__r5ActiveGesture;
        }
      }, 0);
    };
    window.addEventListener('click', markGesture, true);
    window.addEventListener('touchstart', markGesture, true);

    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function play() {
      instrumented.__r5MediaUnlockCalls?.push({
        gesture: instrumented.__r5ActiveGesture,
        key: this.dataset.mediaKey
          ?? (this.hasAttribute('data-hero-figure-video') ? 'hero-figure' : 'unknown')
      });
      return originalPlay.call(this);
    };
  });

  await page.setViewportSize({ width: 734, height: 343 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('video[data-hero-figure-video]')).toHaveCount(1);
  await expect(page.locator('[data-mobile-landscape-gate="true"]')).toHaveCount(0);
  await page.waitForFunction(() => {
    const root = document.querySelector<HTMLElement>('.story-app');
    return root?.dataset.mobileLandscapeState === 'bypass'
      && root.dataset.experienceInteractive === 'true';
  }, undefined, { timeout: 30_000 });
  const startCalls = await page.evaluate(() => {
    const calls = (window as Window & {
      __r5MediaUnlockCalls?: readonly {
        gesture?: string;
        key: string;
      }[];
    }).__r5MediaUnlockCalls ?? [];
    return calls;
  });
  expect(startCalls).not.toContainEqual({
    key: 'hero-figure',
    gesture: 'click'
  });

  await waitForHold(page, 'hero');
  expect((await moveOneHold(page, 1)).current).toBe('pattern');
  expect((await moveOneHold(page, 1)).current).toBe('star-map');
  await expect(page.locator(
    '[data-stage-layer="aod-animation"] [data-media-key="aod-figure-motion"]'
  )).toHaveCount(1);

  await page.touchscreen.tap(180, 240);
  await expect.poll(() => page.evaluate(() => {
    const calls = (window as Window & {
      __r5MediaUnlockCalls?: readonly {
        gesture?: string;
        key: string;
      }[];
    }).__r5MediaUnlockCalls ?? [];
    return calls.some((call) =>
      call.key === 'aod-figure-motion'
      && call.gesture === 'touchstart'
    );
  })).toBe(true);

  expect((await moveOneHold(page, 1)).current).toBe('aod-animation');
  expect((await storySnapshot(page)).recovery).toBeUndefined();
});

test('iPhone WebKit completes the full touch spine in both directions without media timeouts', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-webkit', 'iPhone WebKit stability gate runs once');
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'maxTouchPoints', {
      configurable: true,
      get: () => 5
    });
  });

  await bootStory(page);
  for (const expectedScene of canonicalScenes.slice(1)) {
    const snapshot = await moveOneHold(page, 1);
    expect(snapshot.current).toBe(expectedScene);
    expect(snapshot.recovery).toBeUndefined();
    expect(snapshot.lastError).toBeUndefined();
    await expectLayerInvariants(page);
  }

  for (const expectedScene of [...canonicalScenes].slice(0, -1).reverse()) {
    const snapshot = await moveOneHold(page, -1);
    expect(snapshot.current).toBe(expectedScene);
    expect(snapshot.recovery).toBeUndefined();
    expect(snapshot.lastError).toBeUndefined();
    await expectLayerInvariants(page);
  }

  const events = await eventTypes(page);
  expect(events).not.toContain('PREPARE_TIMEOUT');
  expect(events).not.toContain('PLAYBACK_FAILED');
});

test('mobile menu remains touch reachable and closes after navigation', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile-'), 'mobile navigation matrix');
  await bootStory(page);
  expect((await moveOneHold(page, 1)).current).toBe('pattern');
  expect((await moveOneHold(page, 1)).current).toBe('star-map');
  await expect(page.locator('.site-nav')).toBeVisible();
  const actionStyles = await page.evaluate(() => {
    const menu = document.querySelector<HTMLElement>('.site-nav__toggle');
    const cta = document.querySelector<HTMLElement>('.nav-cta');
    if (!menu || !cta) throw new Error('mobile actions missing');
    const pick = (element: HTMLElement) => {
      const style = getComputedStyle(element);
      return {
        height: style.minHeight,
        radius: style.borderRadius,
        border: style.borderTopWidth,
        background: style.backgroundColor,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight
      };
    };
    return { menu: pick(menu), cta: pick(cta) };
  });
  expect(actionStyles.menu).toEqual(actionStyles.cta);
  await page.getByRole('button', { name: '菜单' }).tap();
  await expect(page.locator('.site-nav')).toHaveAttribute('data-menu-open', 'true');
  await page.getByRole('link', { name: '联系' }).tap();
  await waitForHold(page, 'contact');
  await expect(page.locator('.site-nav')).toHaveAttribute('data-menu-open', 'false');
});

test('mobile rotation and dynamic viewport height keep the active scene stable', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile-'), 'mobile viewport matrix');
  await bootStory(page, '/#services');

  await page.setViewportSize({ width: 740, height: 390 });
  await page.waitForTimeout(100);
  expect((await storySnapshot(page)).current).toBe('services');
  await expect(page.locator('[data-stage-layer="services"]')).toBeVisible();

  await page.setViewportSize({ width: 390, height: 720 });
  await page.waitForTimeout(100);
  expect((await storySnapshot(page)).current).toBe('services');
  await expect(page.locator('[data-stage-layer="services"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('desktop typography roles and Proof content fit hold at both audit viewports', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop typography geometry runs once');
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
      expect(metrics.rootOverflow, `${scene.scene} at ${viewport.width}×${viewport.height}`).toBeLessThanOrEqual(1);
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

test('compact phone landscape keeps reading rows, Brand, and Proof inside their contracts', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'compact landscape geometry runs once');
  test.setTimeout(120_000);

  await page.setViewportSize({ width: 844, height: 390 });
  await bootStory(page, '/#method-top');
  const readingScenes = [
    { scene: 'method-top', root: 'method-top', row: '.r4-method__row', body: 'p' },
    { scene: 'services', root: 'services', row: '.r4-services__row', body: 'p' },
    { scene: 'lab', root: 'lab', row: '.r4-lab__row', body: 'p' },
    { scene: 'education', root: 'education', row: '.r4-education__row', body: 'em' }
  ] as const;

  for (const viewport of [{ width: 844, height: 390 }, { width: 915, height: 412 }]) {
    await page.setViewportSize(viewport);
    for (const scene of readingScenes) {
      await navigateStory(page, scene.scene);
      const metrics = await page.evaluate(({ rootName, rowSelector, bodySelector }) => {
        const root = document.querySelector<HTMLElement>(`[data-r4-scene="${rootName}"]`);
        const nav = document.querySelector<HTMLElement>('.site-nav');
        const row = root?.querySelector<HTMLElement>(rowSelector);
        const title = row?.children[1] as HTMLElement | undefined;
        const body = row?.querySelector<HTMLElement>(bodySelector);
        if (!root || !nav || !row || !title || !body) {
          throw new Error(`missing compact geometry for ${rootName}`);
        }
        const titleRect = title.getBoundingClientRect();
        const bodyRect = body.getBoundingClientRect();
        return {
          compact: window.matchMedia('(orientation: landscape) and (max-height: 500px) and (hover: none) and (pointer: coarse)').matches,
          paddingTop: Number.parseFloat(getComputedStyle(root).paddingTop),
          navBottom: nav.getBoundingClientRect().bottom,
          titleLeft: titleRect.left,
          titleBottom: titleRect.bottom,
          bodyLeft: bodyRect.left,
          bodyTop: bodyRect.top,
          bodyWidth: bodyRect.width,
          bodyFontSize: Number.parseFloat(getComputedStyle(body).fontSize),
          rootOverflow: root.scrollWidth - root.clientWidth
        };
      }, { rootName: scene.root, rowSelector: scene.row, bodySelector: scene.body });

      expect(metrics.compact).toBe(true);
      expect(metrics.paddingTop).toBeGreaterThanOrEqual(metrics.navBottom);
      expect(Math.abs(metrics.titleLeft - metrics.bodyLeft)).toBeLessThanOrEqual(1);
      expect(metrics.bodyTop).toBeGreaterThanOrEqual(metrics.titleBottom - 1);
      expect(metrics.bodyWidth).toBeGreaterThanOrEqual(280);
      expect(metrics.bodyFontSize).toBeGreaterThanOrEqual(15);
      expect(metrics.rootOverflow).toBeLessThanOrEqual(1);
    }

    await navigateStory(page, 'brand');
    const brandFit = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>('[data-r4-scene="brand"]');
      const nav = document.querySelector<HTMLElement>('.site-nav');
      const definitions = [...(root?.querySelectorAll<HTMLElement>('.r4-brand__definition') ?? [])];
      if (!root || !nav || definitions.length !== 2) throw new Error('brand geometry missing');
      const [left, right] = definitions.map((definition) => definition.getBoundingClientRect());
      return {
        navBottom: nav.getBoundingClientRect().bottom,
        leftTop: left?.top ?? Number.NaN,
        leftBottom: left?.bottom ?? Number.NaN,
        leftRight: left?.right ?? Number.NaN,
        rightTop: right?.top ?? Number.NaN,
        rightBottom: right?.bottom ?? Number.NaN,
        rightLeft: right?.left ?? Number.NaN,
        viewportBottom: window.innerHeight,
        scrollOverflow: root.scrollHeight - root.clientHeight
      };
    });

    expect(brandFit.leftTop).toBeGreaterThanOrEqual(brandFit.navBottom - 1);
    expect(brandFit.rightTop).toBeGreaterThanOrEqual(brandFit.navBottom - 1);
    expect(brandFit.leftBottom).toBeLessThanOrEqual(brandFit.viewportBottom + 1);
    expect(brandFit.rightBottom).toBeLessThanOrEqual(brandFit.viewportBottom + 1);
    expect(brandFit.rightLeft).toBeGreaterThan(brandFit.leftRight);
    expect(brandFit.scrollOverflow).toBeLessThanOrEqual(1);

    await navigateStory(page, 'figure2-proof');
    const proofFit = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>('[data-r4-scene="figure2-proof"]');
      const nav = document.querySelector<HTMLElement>('.site-nav');
      const cards = root?.querySelector<HTMLElement>('[data-r4-proof-panel="cards"]');
      const closing = root?.querySelector<HTMLElement>('[data-r4-proof-panel="closing"]');
      if (!root || !nav || !cards || !closing) throw new Error('compact proof geometry missing');
      root.scrollTop = cards.offsetTop;
      const rows = [...cards.querySelectorAll<HTMLElement>('.r4-proof-cards__row')];
      const body = rows[0]?.querySelector<HTMLElement>('p');
      const cardsRect = cards.getBoundingClientRect();
      const closingRect = closing.getBoundingClientRect();
      return {
        navBottom: nav.getBoundingClientRect().bottom,
        firstTop: rows[0]?.getBoundingClientRect().top ?? Number.NaN,
        lastBottom: rows.at(-1)?.getBoundingClientRect().bottom ?? Number.NaN,
        panelBottom: cardsRect.bottom,
        closingTop: closingRect.top,
        bodyFontSize: Number.parseFloat(body ? getComputedStyle(body).fontSize : '0'),
        semanticHeight: root.scrollHeight / root.clientHeight
      };
    });

    expect(proofFit.firstTop).toBeGreaterThanOrEqual(proofFit.navBottom - 1);
    expect(proofFit.lastBottom).toBeLessThanOrEqual(proofFit.panelBottom + 1);
    expect(proofFit.lastBottom).toBeLessThanOrEqual(proofFit.closingTop + 1);
    expect(proofFit.bodyFontSize).toBeGreaterThanOrEqual(15);
    expect(proofFit.semanticHeight).toBeCloseTo(3, 1);
  }
});
