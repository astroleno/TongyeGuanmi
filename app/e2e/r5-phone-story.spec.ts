import { expect, test, type Page } from '@playwright/test';

const PHONE_SHELL = '[data-phone-validation-mode="v23"]';
const GRADE_A_SHELL = '[data-phone-validation-mode="v46"]';
const UNIT7_A_SHELL = '[data-phone-validation-mode="v47"]';
const LIVE_STORY_LOADER = '.story-loader[data-story-loader="true"]';
const WHEEL_QUIET_MS = 1_250;

async function waitForPhoneHold(
  page: Page,
  scene: string,
  timeout = 20_000
) {
  return assertStablePhoneHold(page, scene, { timeout });
}

async function assertStablePhoneHold(
  page: Page,
  scene: string,
  options: Readonly<{ strict?: boolean; timeout?: number }> = {}
) {
  const timeout = options.timeout ?? 20_000;
  const shell = page.locator(UNIT7_A_SHELL);
  await expect(page.locator(LIVE_STORY_LOADER)).toBeHidden({ timeout });
  await expect(shell).toHaveAttribute(
    'data-phone-cursor',
    `hold:${scene}`,
    { timeout }
  );
  if (!options.strict) return shell;
  const snapshot = await shell.evaluate((root) => ({
    authorityId: root.dataset.phoneAuthorityId ?? null,
    revision: root.dataset.phoneRevision ?? null,
    cursor: root.dataset.phoneCursor ?? null,
    session: root.dataset.phoneSession ?? null,
    input: root.dataset.phoneInputState ?? null,
    anchor: root.dataset.phoneAnchorY ?? null,
    projection: root.dataset.phoneProjectionState ?? null,
    stableScene: root.dataset.phoneStableScene ?? null
  }));

  expect(snapshot).toEqual({
    authorityId: expect.any(String),
    revision: expect.any(String),
    cursor: `hold:${scene}`,
    session: null,
    input: 'free',
    anchor: null,
    projection: 'stable',
    stableScene: scene
  });
  return shell;
}

async function wheelPhone(page: Page, deltaY: number): Promise<void> {
  await page.mouse.move(195, 650);
  await page.mouse.wheel(0, deltaY);
}

async function waitForNewWheelEpoch(page: Page): Promise<void> {
  await page.waitForTimeout(WHEEL_QUIET_MS);
}

async function installColdPhoneRuntimeProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type Probe = {
      created: Array<{ id: number; label: string }>;
      contexts: Array<WebGLRenderingContext | WebGL2RenderingContext>;
      lost: Set<number>;
      maxActive: number;
      maxLoaderCount: number;
      wheelEvents: Array<{
        at: number;
        deltaY: number;
        defaultPrevented: boolean;
        beforeY: number;
        afterY: number;
        target: string;
      }>;
      cursorEvents: Array<{
        at: number;
        cursor: string | null;
        lock: string | null;
        retryable: string | null;
      }>;
    };
    const target = window as typeof window & {
      __phoneRuntimeProbe?: Probe;
    };
    const created: Probe['created'] = [];
    const contexts: Probe['contexts'] = [];
    const lost = new Set<number>();
    const canvasIds = new WeakMap<HTMLCanvasElement, number>();
    const probe: Probe = {
      created,
      contexts,
      lost,
      maxActive: 0,
      maxLoaderCount: 0,
      wheelEvents: [],
      cursorEvents: []
    };
    const sampleActive = () => {
      probe.maxActive = Math.max(
        probe.maxActive,
        probe.contexts.filter((context) => !context.isContextLost()).length
      );
    };
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(
      contextId: string,
      ...args: unknown[]
    ) {
      const context = Reflect.apply(originalGetContext, this, [
        contextId,
        ...args
      ]);
      if (
        (contextId === 'webgl' || contextId === 'webgl2')
        && context
        && !canvasIds.has(this)
      ) {
        const id = created.length;
        const label = this.getAttribute('data-portrait-ink')
          || this.getAttribute('data-phone-ink')
          || this.getAttribute('data-r4-scene')
          || this.className
          || 'canvas';
        canvasIds.set(this, id);
        created.push({ id, label });
        contexts.push(
          context as WebGLRenderingContext | WebGL2RenderingContext
        );
        sampleActive();
        this.addEventListener('webglcontextlost', () => {
          lost.add(id);
          sampleActive();
        }, { once: true });
      }
      return context;
    } as typeof HTMLCanvasElement.prototype.getContext;
    const sampleLoaders = () => {
      probe.maxLoaderCount = Math.max(
        probe.maxLoaderCount,
        document.querySelectorAll(
          '.story-loader[data-story-loader="true"]'
        ).length
      );
    };
    new MutationObserver((records) => {
      sampleLoaders();
      if (!records.some((record) => (
        record.type === 'attributes'
        && record.attributeName === 'data-phone-cursor'
      ))) return;
      const shell = document.querySelector<HTMLElement>('[data-phone-cursor]');
      probe.cursorEvents.push({
        at: performance.now(),
        cursor: shell?.dataset.phoneCursor ?? null,
        lock: shell?.dataset.phoneTransitionLock ?? null,
        retryable: shell?.dataset.phoneRetryableRun ?? null
      });
      if (probe.cursorEvents.length > 200) probe.cursorEvents.shift();
    }).observe(document, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-phone-cursor']
    });
    window.addEventListener('wheel', (event) => {
      const record = {
        at: performance.now(),
        deltaY: event.deltaY,
        defaultPrevented: false,
        beforeY: window.scrollY,
        afterY: window.scrollY,
        target: event.target instanceof Element
          ? `${event.target.tagName}.${event.target.className}`
          : String(event.target)
      };
      probe.wheelEvents.push(record);
      if (probe.wheelEvents.length > 200) probe.wheelEvents.shift();
      window.setTimeout(() => {
        record.defaultPrevented = event.defaultPrevented;
        record.afterY = window.scrollY;
      }, 0);
    }, { capture: true, passive: false });
    target.__phoneRuntimeProbe = probe;
  });
}

async function phoneRuntimeProbe(page: Page) {
  return page.evaluate(() => {
    const probe = (
      window as typeof window & {
        __phoneRuntimeProbe?: {
          created: Array<{ id: number; label: string }>;
          contexts: Array<WebGLRenderingContext | WebGL2RenderingContext>;
          lost: Set<number>;
          maxActive: number;
          maxLoaderCount: number;
          wheelEvents: Array<{
            at: number;
            deltaY: number;
            defaultPrevented: boolean;
            beforeY: number;
            afterY: number;
            target: string;
          }>;
          cursorEvents: Array<{
            at: number;
            cursor: string | null;
            lock: string | null;
            retryable: string | null;
          }>;
        };
      }
    ).__phoneRuntimeProbe;
    if (!probe) throw new Error('Phone runtime probe is unavailable');
    return {
      active: probe.contexts.filter(
        (context) => !context.isContextLost()
      ).length,
      total: probe.created.length,
      maxActive: probe.maxActive,
      maxLoaderCount: probe.maxLoaderCount,
      created: probe.created,
      wheelEvents: probe.wheelEvents,
      cursorEvents: probe.cursorEvents
    };
  });
}

async function cssBooleanContractViolations(page: Page) {
  return page.evaluate(() => {
    const contractNames = new Set<string>();
    const visit = (rules: CSSRuleList) => {
      for (const rule of rules) {
        const selector = 'selectorText' in rule
          ? String(rule.selectorText)
          : '';
        for (const match of selector.matchAll(
          /\[([a-z0-9-]+)=["'](?:true|false)["']\]/gi
        )) {
          if (match[1]) contractNames.add(match[1]);
        }
        if ('cssRules' in rule) {
          visit((rule as CSSGroupingRule).cssRules);
        }
      }
    };
    for (const sheet of document.styleSheets) {
      try {
        visit(sheet.cssRules);
      } catch {
        // Production assets are same-origin; ignore browser extension sheets.
      }
    }
    const violations: Array<{
      name: string;
      value: string;
      tag: string;
    }> = [];
    for (const name of contractNames) {
      for (const element of document.querySelectorAll(`[${name}]`)) {
        const value = element.getAttribute(name);
        if (value === '0' || value === '1') {
          violations.push({ name, value, tag: element.tagName });
        }
      }
    }
    return {
      contractCount: contractNames.size,
      violations
    };
  });
}

async function driveAdjacentPhoneRun(
  page: Page,
  from: string,
  to: string,
  direction: 1 | -1,
  settleTimeout = 45_000
): Promise<void> {
  const shell = page.locator(UNIT7_A_SHELL);
  await expect(shell).toHaveAttribute('data-phone-cursor', `hold:${from}`);
  await waitForNewWheelEpoch(page);
  await page.evaluate(() => {
    const probe = (
      window as typeof window & {
        __phoneRuntimeProbe?: {
          wheelEvents: unknown[];
          cursorEvents: unknown[];
        };
      }
    ).__phoneRuntimeProbe;
    if (probe) {
      probe.wheelEvents.length = 0;
      probe.cursorEvents.length = 0;
    }
  });
  const startY = await page.evaluate(() => window.scrollY);
  let leftSource = false;
  for (let pulse = 0; pulse < 64; pulse += 1) {
    await wheelPhone(page, direction * 250);
    await page.waitForTimeout(100);
    if (await shell.getAttribute('data-phone-cursor') !== `hold:${from}`) {
      leftSource = true;
      break;
    }
  }
  const inputDiagnostics = await page.evaluate(() => {
    const probe = (
      window as typeof window & {
        __phoneRuntimeProbe?: {
          wheelEvents: unknown[];
          cursorEvents: unknown[];
        };
      }
    ).__phoneRuntimeProbe;
    const hit = document.elementFromPoint(195, 650);
    const ancestors: Array<Record<string, unknown>> = [];
    let element = hit;
    while (element && ancestors.length < 10) {
      const style = getComputedStyle(element);
      ancestors.push({
        tag: element.tagName,
        className: element.className,
        position: style.position,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
        overscrollY: style.overscrollBehaviorY,
        touchAction: style.touchAction,
        pointerEvents: style.pointerEvents,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight
      });
      element = element.parentElement;
    }
    const originalY = window.scrollY;
    window.scrollBy(0, 1);
    const programmaticY = window.scrollY;
    window.scrollTo(0, originalY);
    return {
      y: window.scrollY,
      maxY: document.documentElement.scrollHeight - window.innerHeight,
      scrollingElement: {
        tag: document.scrollingElement?.tagName,
        scrollTop: document.scrollingElement?.scrollTop,
        clientHeight: document.scrollingElement?.clientHeight,
        scrollHeight: document.scrollingElement?.scrollHeight
      },
      programmaticY,
      ancestors,
      cursor: document.querySelector('[data-phone-cursor]')
        ?.getAttribute('data-phone-cursor'),
      lock: document.querySelector('[data-phone-cursor]')
        ?.getAttribute('data-phone-transition-lock'),
      anchor: document.querySelector('[data-phone-cursor]')
        ?.getAttribute('data-phone-anchor-y'),
      group45Run: document.querySelector('[data-phone-continuation="brand-lab"]')
        ?.getAttribute('data-phone-group45-run'),
      group45Ttg: document.querySelector('[data-phone-group45-track="ttg"]')
        ?.getBoundingClientRect().toJSON(),
      group67Ph: document.querySelector('#ph-animation')
        ?.getBoundingClientRect().toJSON(),
      wheelEvents: probe?.wheelEvents.slice(-8),
      cursorEvents: probe?.cursorEvents.slice(-12)
    };
  });
  expect(
    leftSource,
    `wheel input did not leave hold:${from} from ${startY}: ${
      JSON.stringify(inputDiagnostics)
    }`
  ).toBe(true);
  await expect(shell).toHaveAttribute('data-phone-cursor', `hold:${to}`, {
    timeout: settleTimeout
  });
  await expect.poll(
    async () => (await phoneRuntimeProbe(page)).active,
    { timeout: 5_000, message: `stable WebGL cap after ${from} → ${to}` }
  ).toBeLessThanOrEqual(2);
  expect((await phoneRuntimeProbe(page)).maxActive).toBeLessThanOrEqual(4);
}

async function scrollPhoneStageTo(page: Page, progress: number): Promise<void> {
  await page.evaluate(async (nextProgress) => {
    const rail = document.querySelector<HTMLElement>('.portrait-scroll-spike__stage-rail');
    const stage = document.querySelector<HTMLElement>('.portrait-scroll-spike__stage-canvas');
    if (!rail || !stage) {
      throw new Error('Phone stage geometry is unavailable');
    }
    const start = rail.getBoundingClientRect().top + window.scrollY;
    const shell = document.querySelector<HTMLElement>('.portrait-scroll-spike');
    const configuredDistance = Number.parseFloat(
      shell?.style.getPropertyValue('--portrait-stage-scroll-distance') ?? ''
    );
    const distance = Number.isFinite(configuredDistance) && configuredDistance > 0
      ? configuredDistance
      : Math.max(1, rail.offsetHeight - stage.offsetHeight);
    window.scrollTo({ top: start + distance * nextProgress, left: 0, behavior: 'auto' });
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
    });
  }, progress);
}

async function scrollGradeAProofTo(page: Page, progress: number): Promise<void> {
  await page.evaluate(async (nextProgress) => {
    const track = document.querySelector<HTMLElement>('.phone-grade-a__proof-track');
    const stage = document.querySelector<HTMLElement>('.phone-grade-a__surfaces');
    if (!track || !stage) throw new Error('Grade A Proof geometry is unavailable');
    const start = track.getBoundingClientRect().top + window.scrollY;
    const distance = Math.max(1, track.getBoundingClientRect().height - stage.clientHeight);
    window.scrollTo({ top: start + distance * nextProgress, left: 0, behavior: 'auto' });
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
    });
  }, progress);
}

async function scrollProofBrandTo(page: Page, progress: number): Promise<void> {
  await page.evaluate(async (nextProgress) => {
    const brand = document.querySelector<HTMLElement>('#brand.phone-brand');
    const stage = document.querySelector<HTMLElement>('.phone-grade-a__surfaces');
    if (!brand || !stage) throw new Error('Proof to Brand geometry is unavailable');
    const brandTop = brand.getBoundingClientRect().top + window.scrollY;
    const stageHeight = Math.max(1, stage.clientHeight || window.innerHeight);
    window.scrollTo({
      top: brandTop - stageHeight * (1 - nextProgress),
      left: 0,
      behavior: 'auto'
    });
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
    });
  }, progress);
}

async function scrollBoundaryTo(
  page: Page,
  selector: string,
  offset = 0
): Promise<void> {
  await page.evaluate(async ({ targetSelector, targetOffset }) => {
    const target = document.querySelector<HTMLElement>(targetSelector);
    if (!target) throw new Error(`Phone boundary is unavailable: ${targetSelector}`);
    const documentTop = target.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({
      top: documentTop + targetOffset,
      left: 0,
      behavior: 'auto'
    });
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
    });
  }, { targetSelector: selector, targetOffset: offset });
}

test('v47 cold root preserves semantic booleans and the full phone lifecycle', async ({
  page
}, testInfo) => {
  test.skip(
    !['desktop-chromium', 'desktop-webkit'].includes(testInfo.project.name),
    'the production cold-root contract runs in Chromium and WebKit'
  );
  test.setTimeout(180_000);

  const webGlWarnings: string[] = [];
  page.on('console', (message) => {
    if (/too many active webgl contexts/i.test(message.text())) {
      webGlWarnings.push(message.text());
    }
  });
  await installColdPhoneRuntimeProbe(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?v=47', { waitUntil: 'domcontentloaded' });
  expect(new URL(page.url()).hash).toBe('');

  const loader = page.locator(LIVE_STORY_LOADER);
  await loader.waitFor({ state: 'attached', timeout: 5_000 });
  await expect(loader).toHaveCount(1);
  const shell = await waitForPhoneHold(page, 'hero', 20_000);
  await expect.poll(
    async () => (await phoneRuntimeProbe(page)).active,
    { timeout: 5_000 }
  ).toBeLessThanOrEqual(2);
  expect((await phoneRuntimeProbe(page)).maxLoaderCount).toBe(1);

  const heroBooleanContract = await cssBooleanContractViolations(page);
  expect(heroBooleanContract.contractCount).toBeGreaterThan(10);
  expect(heroBooleanContract.violations).toEqual([]);

  for (let pulse = 0; pulse < 20; pulse += 1) {
    await wheelPhone(page, 400);
    await page.waitForTimeout(100);
  }
  await expect(shell).toHaveAttribute('data-phone-cursor', 'hold:method-top', {
    timeout: 30_000
  });

  for (const [from, to] of [
    ['method-top', 'figure2-animation'],
    ['figure2-animation', 'figure2-proof'],
    ['figure2-proof', 'brand'],
    ['brand', 'services'],
    ['services', 'lab'],
    ['lab', 'education'],
    ['education', 'contact']
  ] as const) {
    await driveAdjacentPhoneRun(page, from, to, 1);
  }

  for (const [from, to] of [
    ['contact', 'education'],
    ['education', 'lab'],
    ['lab', 'services'],
    ['services', 'brand'],
    ['brand', 'figure2-proof'],
    ['figure2-proof', 'figure2-animation'],
    ['figure2-animation', 'method-top'],
    ['method-top', 'aod-animation']
  ] as const) {
    await driveAdjacentPhoneRun(page, from, to, -1);
  }

  await waitForNewWheelEpoch(page);
  for (let pulse = 0; pulse < 16; pulse += 1) {
    await wheelPhone(page, -400);
    await page.waitForTimeout(100);
  }
  await expect(shell).toHaveAttribute('data-phone-cursor', 'hold:hero', {
    timeout: 15_000
  });
  await expect.poll(
    async () => (await phoneRuntimeProbe(page)).active,
    { timeout: 5_000 }
  ).toBeLessThanOrEqual(2);

  const probe = await phoneRuntimeProbe(page);
  expect(probe.maxActive).toBeLessThanOrEqual(4);
  expect(
    probe.created.filter(({ label }) => label.includes('phone-ph__figure-canvas'))
  ).toHaveLength(2);
  expect(
    probe.created.filter(({ label }) => label.includes('phone-crane__figure-canvas'))
  ).toHaveLength(2);
  expect(
    probe.created.filter(({ label }) => label.includes('phone-crane__flock-canvas'))
  ).toHaveLength(2);
  expect(webGlWarnings).toEqual([]);
  expect((await cssBooleanContractViolations(page)).violations).toEqual([]);

  const trace = await shell.getAttribute('data-portrait-checkpoint-trace');
  for (const checkpoint of [
    'hero-entered',
    'method-intro',
    'figure2-stage',
    'figure2-proof-opening',
    'brand-reading',
    'services-reading',
    'lab-stable',
    'education-reading',
    'contact-stable'
  ]) {
    expect(trace, `missing cold-root checkpoint ${checkpoint}`).toContain(
      checkpoint
    );
  }
});

test('v23 Route B publishes the active phone checkpoint trace', async ({
  page
}, testInfo) => {
  test.skip(
    !['desktop-chromium', 'mobile-webkit'].includes(testInfo.project.name),
    'the formal phone route runs in Chromium and WebKit'
  );
  test.setTimeout(45_000);

  const presentationRequests: string[] = [];
  page.on('response', (response) => {
    const path = new URL(response.url()).pathname;
    if (/\/(?:DesktopStoryShell|Phone(?:StoryShell|Loader|Hero|Pattern|StarMap|Aod|MethodTop)|hero-pattern|pattern-star-map|star-map-aod|aod-method-top)-/.test(path)) {
      presentationRequests.push(path);
    }
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?v=23', { waitUntil: 'domcontentloaded' });

  const shell = page.locator(PHONE_SHELL);
  const loader = shell.locator('[data-story-loader="true"]');
  await expect(shell).toHaveAttribute('data-portrait-checkpoint', 'loader');
  await expect(loader).toBeHidden({ timeout: 10_000 });
  await expect(shell).toHaveAttribute('data-portrait-checkpoint', 'hero-entered');
  await expect(shell).toHaveAttribute('data-phone-aod-alpha-start', '0.49');
  await expect(shell).toHaveAttribute('data-phone-aod-alpha-end', '0.59');
  await expect(page.locator('.portrait-scroll-spike__scene--hero')).toHaveCount(1);
  await expect(page.locator('.portrait-scroll-spike__scene--pattern')).toHaveCount(1);
  await expect(page.locator('.portrait-scroll-spike__scene--star')).toHaveCount(1);
  await expect(page.locator('.portrait-scroll-spike__scene--aod')).toHaveCount(1);
  await expect(page.locator('#method.portrait-scroll-spike__reading')).toHaveCount(1);
  await expect(page.locator('[data-aod-figure-video]')).toHaveCount(1);
  await expect(page.locator('[data-aod-figure-canvas]')).toHaveCount(1);
  await expect(page.locator('[data-aod-figure-canvas]')).toHaveAttribute(
    'data-packed-alpha-compositor-active',
    /^(?:0|false)$/
  );
  const hero = page.locator('.portrait-scroll-spike__scene--hero');
  await expect(hero).toHaveAttribute('data-portrait-hero-title-active', 'true', {
    timeout: 5_000
  });
  await expect(shell).toHaveAttribute('data-portrait-hero-text-entrance', 'complete', {
    timeout: 5_000
  });
  await expect(page.locator('[data-portrait-figure-canvas]')).toHaveAttribute(
    'data-packed-alpha-frame-ready',
    'true',
    { timeout: 10_000 }
  );
  await expect(page.locator('[data-portrait-pattern-bloom]')).toHaveAttribute(
    'data-portrait-pattern-renderer',
    'ready',
    { timeout: 10_000 }
  );

  const forward = [
    [0.18, 'hero-to-pattern'],
    [0.30, 'pattern-complete'],
    [0.54, 'pattern-to-star-map'],
    [0.64, 'star-map-reading'],
    [0.74, 'star-map-to-aod'],
    [0.82, 'aod-stage']
  ] as const;
  const heroPatternInk = page.locator('[data-portrait-ink="hero-pattern"]');
  for (const [progress, checkpoint] of forward) {
    await scrollPhoneStageTo(page, progress);
    await expect(shell).toHaveAttribute('data-portrait-checkpoint', checkpoint);
    if (checkpoint === 'hero-to-pattern') {
      await expect(heroPatternInk).toHaveAttribute(
        'data-r4-ink-segment',
        'portrait-hero-pattern-ink'
      );
      await expect(heroPatternInk).toHaveAttribute(
        'data-phone-ink-progress',
        /^0\.(?!0000)\d{4}$/
      );
      await expect(hero).toHaveCSS('visibility', 'visible');
      await expect(
        page.locator('.portrait-scroll-spike__scene--pattern')
      ).toHaveAttribute('data-r4-ink-ownership', 'reveal');
    } else if (checkpoint === 'pattern-complete') {
      await expect(page.locator('.portrait-scroll-spike__stage')).toHaveCSS(
        'background-color',
        'rgba(0, 0, 0, 0)'
      );
      await expect(page.locator('.portrait-scroll-spike__toolbar-edge')).toHaveCount(0);
    } else if (checkpoint === 'pattern-to-star-map') {
      await expect(page.locator('[data-portrait-ink="pattern-star"]')).toHaveAttribute(
        'data-r4-ink-segment',
        'portrait-pattern-star-ink'
      );
    } else if (checkpoint === 'star-map-reading') {
      await expect(page.locator('[data-portrait-star-perlin]')).toHaveAttribute(
        'data-portrait-star-perlin',
        'ready'
      );
    } else if (checkpoint === 'star-map-to-aod') {
      await expect(page.locator('[data-portrait-ink="star-aod"]')).toHaveAttribute(
        'data-r4-ink-segment',
        'portrait-star-aod-ink'
      );
      await expect(page.locator('[data-aod-figure-canvas]')).toHaveAttribute(
        'data-packed-alpha-compositor-active',
        /^(?:1|true)$/
      );
    }
  }

  await scrollPhoneStageTo(page, 0.99);
  await expect(shell).toHaveAttribute('data-portrait-checkpoint', 'method-intro', {
    timeout: 10_000
  });
  await expect(page.locator('[data-aod-transition]')).toHaveAttribute(
    'data-portrait-aod-backdrop-progress',
    '1.0000'
  );
  await expect(page.locator('.aod-transition__layer--sun')).toHaveCSS('opacity', '0');
  await expect(page.locator('.aod-transition__layer--cloud')).toHaveCSS('opacity', '0');
  await expect(page.locator('[data-aod-figure-canvas]')).toHaveAttribute(
    'data-packed-alpha-compositor-active',
    /^(?:0|false)$/
  );
  await expect(page.locator('[data-aod-figure-canvas]')).not.toHaveAttribute(
    'data-packed-alpha-frame-ready',
    'true'
  );

  const trace = (await shell.getAttribute('data-portrait-checkpoint-trace'))?.split('>') ?? [];
  const expectedTrace = [
    'loader',
    'hero-entered',
    ...forward.map(([, checkpoint]) => checkpoint),
    'aod-autoplay',
    'aod-to-method',
    'method-intro'
  ];
  let traceIndex = -1;
  for (const checkpoint of expectedTrace) {
    traceIndex = trace.indexOf(checkpoint, traceIndex + 1);
    expect(traceIndex, `missing ${checkpoint} after trace index ${traceIndex}`).toBeGreaterThan(-1);
  }
  for (const chunk of [
    'PhoneStoryShell',
    'PhoneLoader',
    'PhoneHero',
    'PhonePattern',
    'PhoneStarMap',
    'PhoneAod',
    'PhoneMethodTop',
    'hero-pattern',
    'pattern-star-map',
    'star-map-aod',
    'aod-method-top'
  ]) {
    expect(
      presentationRequests.some((path) => path.includes(`/${chunk}-`)),
      `missing selected phone chunk ${chunk}`
    ).toBe(true);
  }
  expect(
    presentationRequests.some((path) => path.includes('/DesktopStoryShell-'))
  ).toBe(false);
});

test('v46 keeps one Pattern plate inside the stable visual canvas', async ({
  page
}, testInfo) => {
  test.skip(
    !['desktop-chromium', 'mobile-webkit'].includes(testInfo.project.name),
    'the Pattern regression runs in Chromium and WebKit'
  );
  test.setTimeout(45_000);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?v=46&portrait-spike-motion=reduce', {
    waitUntil: 'domcontentloaded'
  });
  await expect(page.locator('[data-story-loader="true"]')).toBeHidden({
    timeout: 10_000
  });

  const shell = page.locator(GRADE_A_SHELL);
  const stage = page.locator('.portrait-scroll-spike__stage');
  const canvas = page.locator('.portrait-scroll-spike__stage-canvas');
  await expect(stage).toHaveCSS('position', 'fixed');
  await expect(stage).toHaveCSS('overflow', 'visible');
  await expect(stage).toHaveCSS('transform', 'none');
  await expect(stage).toHaveAttribute('data-portrait-stage-host', 'persistent');
  await expect(canvas).toHaveCSS('position', 'absolute');
  await expect(canvas).toHaveCSS('overflow', 'clip');
  await expect(canvas).toHaveCSS('transform', 'none');
  await expect(page.locator('[data-portrait-stage-backplate="true"]')).toHaveCount(0);
  await expect(page.locator('.portrait-scroll-spike__toolbar-edge')).toHaveCount(0);

  for (const sample of [
    { progress: 0.30, edge: 'pattern', color: 'rgb(143, 127, 97)' },
    { progress: 0.82, edge: 'aod', color: 'rgb(237, 228, 210)' }
  ] as const) {
    await scrollPhoneStageTo(page, sample.progress);
    await expect(shell).toHaveAttribute('data-portrait-edge-scene', sample.edge);
    await expect(stage).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    const edge = await page.evaluate(() => {
      const stage = document.querySelector<HTMLElement>('.portrait-scroll-spike__stage');
      const canvas = document.querySelector<HTMLElement>('.portrait-scroll-spike__stage-canvas');
      const rail = document.querySelector<HTMLElement>('.portrait-scroll-spike__stage-rail');
      const patternScene = document.querySelector<HTMLElement>('.portrait-scroll-spike__scene--pattern');
      const patternPlate = document.querySelector<HTMLElement>('.portrait-scroll-spike__pattern-motion');
      const patternImage = document.querySelector<HTMLImageElement>('.portrait-scroll-spike__pattern-image');
      if (!stage || !canvas || !rail) throw new Error('fixed stage edge surface is unavailable');
      const stageRect = stage.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      const documentStyle = getComputedStyle(document.documentElement);
      const bodyStyle = getComputedStyle(document.body);
      const rootStyle = getComputedStyle(document.querySelector<HTMLElement>('#root')!);
      const stageStyle = getComputedStyle(stage);
      const railStyle = getComputedStyle(rail);
      const visualViewport = window.visualViewport;
      return {
        hostToViewportRatio: stageRect.height / window.innerHeight,
        canvasToViewportRatio: canvasRect.height / window.innerHeight,
        documentBackgroundColor: documentStyle.backgroundColor,
        documentBackgroundImage: documentStyle.backgroundImage,
        documentBackgroundAttachment: documentStyle.backgroundAttachment,
        bodyBackgroundColor: bodyStyle.backgroundColor,
        bodyBackgroundImage: bodyStyle.backgroundImage,
        rootBackgroundColor: rootStyle.backgroundColor,
        rootBackgroundImage: rootStyle.backgroundImage,
        stageBackgroundImage: stageStyle.backgroundImage,
        railBackgroundColor: railStyle.backgroundColor,
        patternSceneBackgroundImage: patternScene
          ? getComputedStyle(patternScene).backgroundImage
          : '',
        patternPlateHeight: patternPlate?.getBoundingClientRect().height ?? 0,
        patternImageHeight: patternImage?.getBoundingClientRect().height ?? 0,
        patternImageSource: patternImage?.currentSrc || patternImage?.src || '',
        themeColor: document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content,
        canvasBottom: canvasRect.bottom,
        visualViewportBottom: (visualViewport?.offsetTop ?? 0)
          + (visualViewport?.height ?? window.innerHeight)
      };
    });
    expect(edge.hostToViewportRatio).toBeCloseTo(1, 2);
    expect(edge.canvasToViewportRatio).toBeGreaterThanOrEqual(1);
    expect(edge.canvasBottom).toBeGreaterThanOrEqual(edge.visualViewportBottom);
    expect(edge.documentBackgroundColor).toBe(sample.color);
    expect(edge.bodyBackgroundColor).toBe(sample.color);
    expect(edge.rootBackgroundColor).toBe(sample.color);
    expect(edge.documentBackgroundImage).toBe('none');
    expect(edge.bodyBackgroundImage).toBe('none');
    expect(edge.rootBackgroundImage).toBe('none');
    expect(edge.stageBackgroundImage).toBe('none');
    expect(edge.documentBackgroundAttachment).toBe('scroll');
    expect(edge.railBackgroundColor).toBe(sample.color);
    expect(edge.themeColor).toBe(sample.edge === 'pattern' ? '#8f7f61' : '#ede4d2');
    if (sample.edge === 'pattern') {
      expect(edge.patternSceneBackgroundImage).toBe('none');
      expect(edge.patternPlateHeight).toBeCloseTo(844, 0);
      expect(edge.patternImageHeight).toBeCloseTo(edge.patternPlateHeight, 0);
      expect(edge.patternImageSource).toContain('pattern-background');
      await expect(page.locator(
        '.portrait-scroll-spike__pattern-motion > .portrait-scroll-spike__pattern-image'
      )).toHaveCount(1);
      await expect(page.locator(
        '.portrait-scroll-spike__pattern-motion > [data-portrait-pattern-bloom]'
      )).toHaveCount(1);
      await expect(page.locator(
        '.portrait-scroll-spike__pattern-motion > .portrait-scroll-spike__pattern-wash'
      )).toHaveCount(1);
    }
  }
});

test('v46 Grade A direct entry renders Proof in the persistent host', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'the formal phone route runs once');
  test.setTimeout(45_000);

  const presentationRequests: string[] = [];
  page.on('response', (response) => {
    presentationRequests.push(new URL(response.url()).pathname);
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?v=46&portrait-spike-motion=reduce#figure2-proof-cards', {
    waitUntil: 'domcontentloaded'
  });

  const shell = page.locator(GRADE_A_SHELL);
  await expect(page.locator('[data-story-loader="true"]')).toBeHidden({
    timeout: 10_000
  });
  await expect(shell).toHaveAttribute('data-portrait-checkpoint', 'figure2-proof-opening');
  await expect(page.locator(
    '[data-r4-scene="figure2-animation"]'
  )).toHaveAttribute('data-phone-figure2-ready', 'true');
  await scrollGradeAProofTo(page, 0.5);
  await expect(page.locator('.phone-grade-a__surfaces')).toHaveCSS('overflow', 'visible');
  await expect(page.locator('.phone-grade-a__surfaces')).toHaveCSS('transform', 'none');
  await expect(page.locator('[data-r4-scene="figure2-animation"]')).toHaveCSS(
    'overflow',
    'visible'
  );
  await expect(page.locator('[data-r4-scene="figure2-animation"]')).toHaveCSS(
    'transform',
    'none'
  );
  await expect(page.locator('[data-r4-scene="figure2-animation"]')).toHaveCount(1);
  await expect(page.locator('[data-r4-scene="figure2-animation"]')).toHaveAttribute(
    'data-phone-figure2-alpha',
    /^(?:verified|poster-fallback)$/
  );
  await expect(page.locator('[data-r4-scene="figure2-animation"]')).toHaveAttribute(
    'data-phone-figure2-poster-ready',
    'true'
  );
  const posterBackground = await page.locator('.r4-figure2__media-stack--combined')
    .evaluate((element) => getComputedStyle(element, '::before').backgroundImage);
  expect(posterBackground).toContain('figure2-pair-opening');
  await expect(page.locator('[data-r4-scene="figure2-proof"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="r2-stage"]')).toHaveCount(1);
  const foregroundArch = page.locator('[data-stage-retained-figure2-arch="true"]');
  await expect(foregroundArch).toHaveCount(1);
  await expect(foregroundArch).toHaveAttribute(
    'src',
    /figure2-phone-foreground-arch-[^/]+\.webp/
  );
  await expect(foregroundArch).toHaveAttribute('data-phone-figure2-arch-visible', 'true');
  await expect(foregroundArch).toHaveAttribute('data-figure2-arch-motion', 'fixed');
  const ownership = await page.evaluate(() => {
    const surfaces = document.querySelector<HTMLElement>('.phone-grade-a__surfaces');
    const arch = document.querySelector<HTMLElement>('[data-stage-retained-figure2-arch="true"]');
    const ink = document.querySelector<HTMLElement>('.r4-figure2-proof-ink-canvas');
    const cards = document.querySelector<HTMLElement>('.r4-proof-scroll__content--cards');
    return {
      parentClass: surfaces?.parentElement?.className,
      surfacePosition: surfaces ? getComputedStyle(surfaces).position : '',
      archZ: arch ? Number(getComputedStyle(arch).zIndex) : 0,
      inkZ: ink ? Number(getComputedStyle(ink).zIndex) : 0,
      cardsLeft: cards?.getBoundingClientRect().left ?? 0
    };
  });
  expect(ownership.parentClass).toContain('portrait-scroll-spike__stage-canvas');
  expect(ownership.surfacePosition).toBe('absolute');
  expect(ownership.archZ).toBeGreaterThan(ownership.inkZ);
  expect(ownership.cardsLeft).toBeGreaterThanOrEqual(36);
  const archFrame = await foregroundArch.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      scale: style.getPropertyValue('--phone-figure2-arch-scale').trim(),
      blur: style.getPropertyValue('--phone-figure2-arch-blur').trim()
    };
  });
  expect(archFrame.scale).toBe('1.1350');
  expect(archFrame.blur).toBe('3.60px');
  const proofProgress = Number(await page.locator('[data-r4-scene="figure2-proof"]')
    .getAttribute('data-phone-proof-progress'));
  expect(proofProgress).toBeCloseTo(0.5, 2);
  await expect(page.locator('[data-r4-scene="figure2-proof"]')).toHaveCSS(
    'overflow-y',
    'visible'
  );

  for (const chunk of [
    'PhoneGradeAStory',
    'PhoneFigure2',
    'PhoneFigure2Proof',
    'method-bottom-figure2',
    'figure2-distance-expand'
  ]) {
    expect(
      presentationRequests.some((path) => path.includes(`/${chunk}-`)),
      `missing Grade A phone chunk ${chunk}`
    ).toBe(true);
  }
});

test('v47 Proof hands off to Brand inside the one persistent stage', async ({
  page
}, testInfo) => {
  test.skip(
    !['desktop-chromium', 'desktop-webkit'].includes(testInfo.project.name),
    'the compositor handoff runs in Chromium and WebKit'
  );
  test.setTimeout(90_000);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?v=47#figure2-proof', {
    waitUntil: 'domcontentloaded'
  });

  const shell = await waitForPhoneHold(page, 'figure2-proof');
  await expect(page.locator('.portrait-scroll-spike__stage')).toHaveCount(1);
  await expect(page.locator('[data-portrait-stage-host="persistent"]')).toHaveCount(1);
  await expect(page.locator('main.portrait-scroll-spike')).toHaveCount(1);
  await expect(page.locator('#brand.phone-brand')).toHaveCount(1);
  await expect(page.locator('#services.phone-services')).toHaveCount(1);

  await scrollProofBrandTo(page, 0);
  await wheelPhone(page, 500);
  await expect(shell).toHaveAttribute(
    'data-phone-cursor',
    /^transition:proof-brand:/
  );
  const forwardGeometry = await page.evaluate(() => {
    const viewportHeight = window.innerHeight;
    const frame = (element: Element | null) => {
      const rect = element?.getBoundingClientRect();
      return rect ? {
        top: rect.top,
        bottom: rect.bottom,
        intersects: rect.top < viewportHeight && rect.bottom > 0
      } : null;
    };
    return {
      proof: frame(document.querySelector('[data-r4-scene="figure2-proof"]')),
      brand: frame(document.querySelector('[data-phone-scene="brand"]'))
    };
  });
  expect(forwardGeometry.proof?.intersects).toBe(true);
  expect(forwardGeometry.brand?.intersects).toBe(true);
  await expect(shell).toHaveAttribute('data-phone-cursor', 'hold:brand');

  // Exercise the Group 4–5 flow alignment before returning through Brand.
  await waitForNewWheelEpoch(page);
  await wheelPhone(page, 500);
  await expect(shell).toHaveAttribute('data-phone-cursor', 'hold:services', {
    timeout: 15_000
  });
  await waitForNewWheelEpoch(page);
  await wheelPhone(page, -500);
  await expect(shell).toHaveAttribute('data-phone-cursor', 'hold:brand', {
    timeout: 15_000
  });
  await expect(page.locator('#brand.phone-brand')).toHaveCSS(
    'transform',
    /matrix/
  );

  await waitForNewWheelEpoch(page);
  await wheelPhone(page, -500);
  await expect(shell).toHaveAttribute(
    'data-phone-cursor',
    /^transition:proof-brand:/
  );
  const reverseGeometry = await page.evaluate(() => {
    const viewportHeight = window.innerHeight;
    const frame = (element: Element | null) => {
      const rect = element?.getBoundingClientRect();
      return rect ? {
        top: rect.top,
        bottom: rect.bottom,
        intersects: rect.top < viewportHeight && rect.bottom > 0
      } : null;
    };
    const brand = document.querySelector<HTMLElement>(
      '[data-phone-scene="brand"]'
    );
    return {
      proof: frame(document.querySelector('[data-r4-scene="figure2-proof"]')),
      brand: frame(brand),
      proofBrandAlign: brand?.style.getPropertyValue(
        '--phone-proof-brand-align-y'
      ) ?? ''
    };
  });
  expect(reverseGeometry.proof?.intersects).toBe(true);
  expect(reverseGeometry.brand?.intersects).toBe(true);
  expect(reverseGeometry.proofBrandAlign).toBe('');
  await expect(shell).toHaveAttribute('data-phone-cursor', 'hold:figure2-proof');
});

test('v47 one wheel epoch cannot skip beyond Method → Figure2', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'wheel input runs once');
  test.setTimeout(60_000);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?v=47#method-top', {
    waitUntil: 'domcontentloaded'
  });

  const shell = await waitForPhoneHold(page, 'method-top');
  await expect(page.locator(
    '[data-r4-scene="figure2-animation"]'
  )).toHaveAttribute('data-phone-figure2-ready', 'true', {
    timeout: 15_000
  });
  const samples: Array<{ cursor: string | null; y: number }> = [];
  for (let pulse = 0; pulse < 18; pulse += 1) {
    await wheelPhone(page, 300);
    await page.waitForTimeout(100);
    samples.push(await page.evaluate(() => ({
      cursor: document.querySelector('[data-phone-cursor]')
        ?.getAttribute('data-phone-cursor') ?? null,
      y: window.scrollY
    })));
  }
  await expect(shell).toHaveAttribute(
    'data-phone-cursor',
    'hold:figure2-animation'
  );
  const figure2Samples = samples.filter(
    ({ cursor }) => cursor === 'hold:figure2-animation'
  );
  expect(figure2Samples.length).toBeGreaterThan(3);
  expect(new Set(figure2Samples.map(({ y }) => y)).size).toBe(1);
  expect(samples.some(({ cursor }) => (
    cursor?.includes('figure2-proof')
    || cursor?.includes('brand')
    || cursor?.includes('services')
  ))).toBe(false);

  await waitForNewWheelEpoch(page);
  const beforeNewEpoch = await page.evaluate(() => window.scrollY);
  await wheelPhone(page, 300);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(
    beforeNewEpoch
  );
});

test('v47 cold Figure2 round trip keeps one media owner', async ({
  page
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop-webkit',
    'the regression is specific to WebKit media reacquisition'
  );
  test.setTimeout(90_000);

  await installColdPhoneRuntimeProbe(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?v=47', { waitUntil: 'domcontentloaded' });
  const shell = await waitForPhoneHold(page, 'hero', 20_000);
  await expect(shell).toHaveAttribute(
    'data-portrait-fixed-stage',
    'registered',
    { timeout: 20_000 }
  );
  await page.waitForTimeout(1_000);
  for (let pulse = 0; pulse < 20; pulse += 1) {
    await wheelPhone(page, 400);
    await page.waitForTimeout(100);
  }
  await expect(shell).toHaveAttribute('data-phone-cursor', 'hold:method-top', {
    timeout: 30_000
  });
  await driveAdjacentPhoneRun(
    page,
    'method-top',
    'figure2-animation',
    1
  );
  await driveAdjacentPhoneRun(
    page,
    'figure2-animation',
    'figure2-proof',
    1
  );
  await driveAdjacentPhoneRun(
    page,
    'figure2-proof',
    'figure2-animation',
    -1,
    15_000
  );
});

test('v47 full motion runs Figure3 and TTG forward and reverse on the shared host', async ({
  page
}, testInfo) => {
  test.skip(
    !['desktop-chromium', 'desktop-webkit'].includes(testInfo.project.name),
    'the media route runs in Chromium and WebKit'
  );
  test.setTimeout(90_000);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?v=47#brand', { waitUntil: 'domcontentloaded' });

  const shell = await waitForPhoneHold(page, 'brand', 30_000);

  await wheelPhone(page, 500);
  await expect(shell).toHaveAttribute(
    'data-phone-cursor',
    'transition:brand-services:1',
    { timeout: 5_000 }
  );
  const figure3Video = page.locator('[data-r4-scene="figure3-animation"] video');
  const figure3Start = await figure3Video.evaluate(
    (video: HTMLVideoElement) => video.currentTime
  );
  await page.waitForTimeout(300);
  expect(await figure3Video.evaluate(
    (video: HTMLVideoElement) => video.currentTime
  )).toBeGreaterThan(figure3Start);
  await expect(shell).toHaveAttribute('data-phone-cursor', 'hold:services', {
    timeout: 15_000
  });
  await expect(page.locator('#services.phone-services')).toHaveCSS('opacity', '1');
  await expect(page.locator('#services.phone-services')).toHaveCSS('z-index', '11');

  await waitForNewWheelEpoch(page);
  await scrollBoundaryTo(
    page,
    '[data-phone-group45-track="ttg"]',
    -844
  );
  await wheelPhone(page, 500);
  await expect(shell).toHaveAttribute(
    'data-phone-cursor',
    'transition:services-lab:1',
    { timeout: 5_000 }
  );
  const ttgVideo = page.locator('[data-r4-scene="ttg-animation"] video');
  const ttgStart = await ttgVideo.evaluate(
    (video: HTMLVideoElement) => video.currentTime
  );
  await page.waitForTimeout(300);
  expect(await ttgVideo.evaluate(
    (video: HTMLVideoElement) => video.currentTime
  )).toBeGreaterThan(ttgStart);
  await expect(shell).toHaveAttribute('data-phone-cursor', 'hold:lab', {
    timeout: 15_000
  });
  await expect(page.locator('#lab.phone-lab')).toHaveCSS('opacity', '1');
  await expect(page.locator('#lab.phone-lab')).toHaveCSS('z-index', '11');
  await expect(page.locator('.portrait-scroll-spike__stage')).toHaveCount(1);

  await waitForNewWheelEpoch(page);
  await wheelPhone(page, -500);
  await expect(shell).toHaveAttribute('data-phone-cursor', 'hold:services', {
    timeout: 15_000
  });
  await waitForNewWheelEpoch(page);
  await wheelPhone(page, -500);
  await expect(shell).toHaveAttribute('data-phone-cursor', 'hold:brand', {
    timeout: 15_000
  });
  await expect(page.locator('.portrait-scroll-spike__stage')).toHaveCount(1);
});

test('v47 full-motion downstream deep links expose native readings without Figure1', async ({
  page
}, testInfo) => {
  test.skip(
    !['desktop-chromium', 'mobile-webkit'].includes(testInfo.project.name),
    'the downstream compositor regression runs in Chromium and WebKit'
  );
  test.setTimeout(90_000);

  await page.setViewportSize({ width: 390, height: 844 });
  for (const target of [
    {
      scene: 'services',
      checkpoint: 'services-reading',
      selector: '#services.phone-services'
    },
    {
      scene: 'lab',
      checkpoint: 'lab-stable',
      selector: '#lab.phone-lab'
    }
  ] as const) {
    await page.goto(`/?v=47#${target.scene}`, {
      waitUntil: 'domcontentloaded'
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    const shell = page.locator(UNIT7_A_SHELL);
    const reading = page.locator(target.selector);
    await expect(page.locator('[data-story-loader="true"]')).toBeHidden({
      timeout: 15_000
    });
    await expect(shell).toHaveAttribute(
      'data-portrait-checkpoint',
      target.checkpoint,
      { timeout: 20_000 }
    );
    await expect(reading).toBeVisible();
    await expect(reading).toHaveCSS('opacity', '1');
    await expect(reading).toHaveCSS('z-index', '11');
    await expect(page.locator('[data-portrait-figure-canvas]')).toHaveCount(0);
    await expect(page.locator('[data-aod-figure-canvas]')).toHaveCount(0);
  }
});

test('brand-lab QA route keeps one independent shell at the stable Lab boundary', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'the QA route runs once');
  test.setTimeout(45_000);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/brand-lab?portrait-spike-motion=reduce#lab', {
    waitUntil: 'domcontentloaded'
  });

  const qaShell = page.locator('[data-phone-validation-scope="brand-lab"]');
  await expect(qaShell).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('main.portrait-scroll-spike')).toHaveCount(1);
  await expect(page.locator('.portrait-scroll-spike__stage')).toHaveCount(1);
  await expect(page.locator('[data-portrait-stage-host="persistent"]')).toHaveCount(1);
  await expect(page.locator('[data-phone-continuation="brand-lab"]')).toHaveAttribute(
    'data-phone-group45-state',
    'ready'
  );
  await expect(page.locator('#lab.phone-lab')).toHaveAttribute(
    'data-phone-lab-stable-input',
    'lab-ph'
  );
  await expect(page.locator('.phone-grade-a')).toHaveCount(0);
});

test('v46 keeps Figure2 visible when Safari never produces a packed video frame', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'the formal phone route runs once');
  test.setTimeout(45_000);

  await page.route('**/*figure2-pair-motion-rgb-alpha*.mp4', (route) => route.abort());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?v=46&portrait-spike-motion=reduce#figure2-animation', {
    waitUntil: 'domcontentloaded'
  });

  const shell = page.locator(GRADE_A_SHELL);
  const gradeA = page.locator('.phone-grade-a');
  const figure2 = page.locator('[data-r4-scene="figure2-animation"]');
  await expect(page.locator('[data-story-loader="true"]')).toBeHidden({
    timeout: 10_000
  });
  await expect(figure2).toHaveAttribute('data-phone-figure2-ready', 'true');
  await expect(shell).toHaveAttribute('data-portrait-checkpoint', 'figure2-stage');
  await expect(gradeA).toHaveAttribute('data-phone-grade-a-active', 'true');
  await expect(figure2).toHaveAttribute(
    'data-phone-figure2-alpha',
    'poster-fallback',
    { timeout: 6_000 }
  );
  await expect(page.locator('.phone-grade-a__surfaces')).toHaveCSS('visibility', 'visible');
  const poster = await page.locator('.r4-figure2__media-stack--combined').evaluate((element) => {
    const style = getComputedStyle(element, '::before');
    return { backgroundImage: style.backgroundImage, opacity: style.opacity };
  });
  expect(poster.backgroundImage).toContain('figure2-pair-opening');
  expect(poster.opacity).toBe('1');
});
