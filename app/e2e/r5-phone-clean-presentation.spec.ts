import { expect, test } from '@playwright/test';
import {
  assertSinglePhoneAuthority,
  assertLayerOrderAtPoints,
  assertNoWhiteOrTransparentViewportEdges,
  assertNoIntermediateWhiteOrBlackFrame,
  assertOpaqueViewportEdges,
  assertTargetContentVisible,
  readCommitSequence,
  waitForCommitSequence
} from './r5-phone-clean-assertions';

const FRONT_CONTENT = {
  hero: ['#portrait-spike-home'],
  pattern: ['#portrait-spike-pattern-title'],
  'star-map': ['#portrait-spike-star-title'],
  'aod-animation': ['[data-aod-figure-canvas]']
} as const;

const GRADE_A_CONTENT = {
  'method-top': ['#method #portrait-spike-method-title'],
  'figure2-animation': [
    '[data-r4-scene="figure2-animation"] [data-figure2-packed-alpha-canvas]'
  ],
  'figure2-proof': ['#figure2-proof-opening .r4-proof-opening__title'],
  brand: ['#phone-brand-title', '.phone-brand__definition p']
} as const;

const GRADE_A_HASH = {
  'method-top': '#method-top',
  'figure2-animation': '#figure2-animation',
  'figure2-proof': '#figure2-proof',
  brand: '#brand'
} as const;

const GRADE_A_SEGMENT = {
  'method-top:figure2-animation': 'method-bottom-figure2',
  'figure2-animation:figure2-proof': 'figure2-distance-expand',
  'figure2-proof:brand': 'figure2-proof-brand',
  'brand:figure2-proof': 'figure2-proof-brand',
  'figure2-proof:figure2-animation': 'figure2-distance-expand',
  'figure2-animation:method-top': 'method-bottom-figure2'
} as const;

const FIGURE3_SLICE_CONTENT = {
  brand: ['#phone-brand-title', '.phone-brand__definition p'],
  'figure3-animation': [
    '[data-phone-scene="figure3-animation"] [data-phone-figure3-paper-canvas]'
  ],
  services: ['#phone-services-title', '.phone-services__hero > p:last-child']
} as const;

const FIGURE3_SLICE_HASH = {
  brand: '#brand',
  'figure3-animation': '#figure3-animation',
  services: '#services'
} as const;

const FIGURE3_SLICE_SEGMENT = {
  'brand:figure3-animation': 'brand-figure3',
  'figure3-animation:services': 'figure3-services',
  'services:figure3-animation': 'figure3-services',
  'figure3-animation:brand': 'brand-figure3'
} as const;

async function nextAnimationFrame(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
}

async function sendFrontIntent(
  page: import('@playwright/test').Page,
  direction: 'forward' | 'reverse'
): Promise<void> {
  await page.keyboard.press(direction === 'forward' ? 'ArrowDown' : 'ArrowUp');
}

async function traverseGradeA(
  page: import('@playwright/test').Page,
  source: keyof typeof GRADE_A_CONTENT,
  target: keyof typeof GRADE_A_CONTENT,
  direction: 'forward' | 'reverse'
): Promise<void> {
  const before = await readCommitSequence(page);
  await sendFrontIntent(page, direction);
  const segment = GRADE_A_SEGMENT[`${source}:${target}` as keyof typeof GRADE_A_SEGMENT];
  const effect = page.locator(`[data-phone-plane="effect"] [data-r4-ink-segment="${segment}"]`);
  await expect(effect).toBeAttached({ timeout: 10_000 });
  for (let boundary = 0; boundary < 4; boundary += 1) {
    const handle = await page.waitForFunction(({ from, to, after }) => {
      const shell = document.querySelector<HTMLElement>('.phone-story');
      const state = {
        scene: shell?.dataset.phoneScene,
        status: shell?.dataset.phoneStatus,
        phase: shell?.dataset.phonePhase,
        failure: shell?.dataset.phoneFailure,
        sequence: Number(shell?.dataset.phoneCommitSequence)
      };
      return state.scene === to && state.sequence > after
        || state.status === 'stable' && state.scene === from
        || ['awaiting-media-activation', 'awaiting-leg-intent'].includes(state.phase ?? '')
        ? state : null;
    }, { from: source, to: target, after: before }, { timeout: 20_000 });
    const state = await handle.jsonValue();
    if (state.scene === target && state.sequence > before) break;
    if (state.status === 'stable') {
      throw new Error(`Grade A ${source} → ${target} rolled back: ${JSON.stringify(state)}`);
    }
    if (state.phase === 'awaiting-media-activation') {
      await page.locator('[data-phone-activation]:not([hidden])').click();
    } else if (state.phase === 'awaiting-leg-intent') {
      await sendFrontIntent(page, direction);
    }
  }
  await waitForCommitSequence(page, target, before);
  expect(await readCommitSequence(page)).toBe(before + 1);
  await assertTargetContentVisible(page, GRADE_A_CONTENT[target]);
  await assertNoWhiteOrTransparentViewportEdges(page);
}

async function traverseFigure3Slice(
  page: import('@playwright/test').Page,
  source: keyof typeof FIGURE3_SLICE_CONTENT,
  target: keyof typeof FIGURE3_SLICE_CONTENT,
  direction: 'forward' | 'reverse'
): Promise<Readonly<{ videos: number; canvases: number }>> {
  const before = await readCommitSequence(page);
  await sendFrontIntent(page, direction);
  await completeFigure3SliceAttempt(page, source, target, direction, before);
  await assertSinglePhoneAuthority(page);
  await assertTargetContentVisible(page, FIGURE3_SLICE_CONTENT[target]);
  await assertNoWhiteOrTransparentViewportEdges(page);
  if (target === 'figure3-animation') {
    await expect(page.locator('[data-phone-figure3-paper-canvas]'))
      .toHaveAttribute('data-phone-figure3-paper-frame', 'ready');
  }
  return page.evaluate(() => ({
    videos: document.querySelectorAll('.phone-story video').length,
    canvases: document.querySelectorAll('.phone-story canvas').length
  }));
}

async function completeFigure3SliceAttempt(
  page: import('@playwright/test').Page,
  source: keyof typeof FIGURE3_SLICE_CONTENT,
  target: keyof typeof FIGURE3_SLICE_CONTENT,
  direction: 'forward' | 'reverse',
  before: number
): Promise<void> {
  const segment = FIGURE3_SLICE_SEGMENT[
    `${source}:${target}` as keyof typeof FIGURE3_SLICE_SEGMENT
  ];
  await page.waitForFunction((expectedSegment) => {
    const shell = document.querySelector<HTMLElement>('.phone-story');
    return Boolean(
      document.querySelector(
        `[data-phone-plane="effect"] [data-r4-ink-segment="${expectedSegment}"], `
          + `[data-phone-plane="effect"] [data-phone-transition="${expectedSegment}"]`
      )
      || document.querySelector('[data-phone-activation]:not([hidden])')
      || shell?.dataset.phonePhase === 'awaiting-leg-intent'
    );
  }, segment, { timeout: 10_000 });
  const initialPhase = await page.locator('.phone-story').getAttribute('data-phone-phase');
  if (await page.locator('[data-phone-activation]:not([hidden])').count()) {
    await page.locator('[data-phone-activation]:not([hidden])').click();
  } else if (initialPhase === 'awaiting-leg-intent') {
    await sendFrontIntent(page, direction);
  }
  await expect(page.locator(
    `[data-phone-plane="effect"] [data-r4-ink-segment="${segment}"], `
      + `[data-phone-plane="effect"] [data-phone-transition="${segment}"]`
  )).toBeAttached({ timeout: 10_000 });
  for (let boundary = 0; boundary < 5; boundary += 1) {
    const handle = await page.waitForFunction(({ from, to, after }) => {
      const shell = document.querySelector<HTMLElement>('.phone-story');
      const state = {
        scene: shell?.dataset.phoneScene,
        status: shell?.dataset.phoneStatus,
        phase: shell?.dataset.phonePhase,
        failure: shell?.dataset.phoneFailure,
        sequence: Number(shell?.dataset.phoneCommitSequence)
      };
      return state.scene === to && state.sequence > after
        || state.status === 'stable' && state.scene === from
        || ['awaiting-media-activation', 'awaiting-leg-intent'].includes(state.phase ?? '')
        ? state : null;
    }, { from: source, to: target, after: before }, { timeout: 25_000 });
    const state = await handle.jsonValue();
    if (state.scene === target && state.sequence > before) break;
    if (state.status === 'stable') {
      throw new Error(`Figure3 slice ${source} → ${target} rolled back: ${JSON.stringify(state)}`);
    }
    if (state.phase === 'awaiting-media-activation') {
      await page.locator('[data-phone-activation]:not([hidden])').click();
    } else if (state.phase === 'awaiting-leg-intent') {
      await sendFrontIntent(page, direction);
    }
  }
  await waitForCommitSequence(page, target, before);
  expect(await readCommitSequence(page)).toBe(before + 1);
}

async function expectFigure3SliceRollback(
  page: import('@playwright/test').Page,
  source: keyof typeof FIGURE3_SLICE_CONTENT,
  target: keyof typeof FIGURE3_SLICE_CONTENT,
  direction: 'forward' | 'reverse',
  before: number
): Promise<void> {
  let handledActivation = false;
  let handledLegIntent = false;
  for (let sample = 0; sample < 300; sample += 1) {
    const state = await page.locator('.phone-story').evaluate((shell) => ({
      scene: (shell as HTMLElement).dataset.phoneScene,
      status: (shell as HTMLElement).dataset.phoneStatus,
      phase: (shell as HTMLElement).dataset.phonePhase,
      sequence: Number((shell as HTMLElement).dataset.phoneCommitSequence),
      activation: Boolean(document.querySelector('[data-phone-activation]:not([hidden])'))
    }));
    if (state.status === 'stable' && state.scene === source
      && state.sequence === before) return;
    if (state.status === 'faulted' && state.scene === source
      && state.sequence === before) return;
    if (state.status === 'stable' && state.scene === target) {
      throw new Error(`Withheld Figure3 proof committed ${target}: ${JSON.stringify(state)}`);
    }
    if (state.activation && !handledActivation) {
      handledActivation = true;
      await page.locator('[data-phone-activation]:not([hidden])').click();
    } else if (state.phase === 'awaiting-leg-intent' && !handledLegIntent) {
      handledLegIntent = true;
      await sendFrontIntent(page, direction);
    }
    await page.waitForTimeout(100);
  }
  const state = await page.locator('.phone-story').evaluate((shell) => ({
    ...(shell as HTMLElement).dataset
  }));
  throw new Error(`Figure3 slice did not roll back: ${JSON.stringify(state)}`);
}

async function withholdFigure3Endpoint(
  page: import('@playwright/test').Page,
  endpoint: 'initial' | 'terminal'
): Promise<void> {
  await page.addInitScript((withheld) => {
    const original = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function patchedDrawImage(
      image: CanvasImageSource,
      ...coordinates: number[]
    ) {
      const isFigure3 = this.canvas.matches('[data-phone-figure3-paper-canvas]');
      const video = image instanceof HTMLVideoElement ? image : null;
      const atEndpoint = video && (withheld === 'initial'
        ? video.currentTime <= .05 : video.currentTime >= 2.5);
      if (isFigure3 && atEndpoint) throw new Error(`withheld-${withheld}-figure3-frame`);
      return Reflect.apply(original, this, [image, ...coordinates]);
    };
  }, endpoint);
}

async function traverseFront(
  page: import('@playwright/test').Page,
  source: keyof typeof FRONT_CONTENT,
  target: keyof typeof FRONT_CONTENT,
  direction: 'forward' | 'reverse'
): Promise<Buffer[]> {
  const before = await readCommitSequence(page);
  await sendFrontIntent(page, direction);
  await page.waitForFunction(({ from, to }) => {
    const shell = document.querySelector<HTMLElement>('.phone-story');
    return shell?.dataset.phoneScene === to
      || shell?.dataset.phoneScene === from && shell.dataset.phoneStatus === 'transaction';
  }, { from: source, to: target });
  const effect = page.locator('[data-phone-plane="effect"] [data-r4-ink-segment]');
  await expect(effect).toBeAttached();
  await expect(effect).toHaveAttribute('data-r4-ink-effect-only', 'true');
  const frames: Buffer[] = [await page.screenshot()];
  for (let index = 0; index < 10; index += 1) {
    await nextAnimationFrame(page);
    frames.push(await page.screenshot());
  }
  await page.waitForFunction(({ to }) => {
    const shell = document.querySelector<HTMLElement>('.phone-story');
    return shell?.dataset.phoneScene === to
      || ['awaiting-leg-intent', 'awaiting-media-activation']
        .includes(shell?.dataset.phonePhase ?? '');
  }, { to: target }, { timeout: 20_000 });
  const boundary = await page.locator('.phone-story').getAttribute('data-phone-phase');
  if (boundary === 'awaiting-leg-intent') await sendFrontIntent(page, direction);
  if (boundary === 'awaiting-media-activation') {
    const activation = page.locator('[data-phone-activation]');
    await expect(activation).toBeVisible();
    await activation.click();
  }
  try {
    await page.waitForFunction(({ scene, after }) => {
      const shell = document.querySelector<HTMLElement>('.phone-story');
      return shell?.dataset.phoneScene === scene
        && Number(shell.dataset.phoneCommitSequence) > after;
    }, { scene: target, after: before }, { timeout: 25_000 });
  } catch (error) {
    const state = await page.locator('.phone-story').evaluate((shell) => ({
      ...((shell as HTMLElement).dataset),
      activation: !!document.querySelector('[data-phone-activation]:not([hidden])')
    }));
    throw new Error(
      `Front ${source} → ${target} did not commit: ${JSON.stringify(state)}`,
      { cause: error }
    );
  }
  frames.push(await page.screenshot());
  await assertSinglePhoneAuthority(page);
  await assertTargetContentVisible(page, FRONT_CONTENT[target]);
  await assertNoWhiteOrTransparentViewportEdges(page);
  await assertNoIntermediateWhiteOrBlackFrame(frames, { tolerance: 3 });
  return frames;
}

async function patternViewportProof(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const visual = window.visualViewport;
    const viewport = document.querySelector<HTMLElement>('.phone-story__viewport');
    const coverage = document.querySelector<HTMLElement>('.phone-story__coverage');
    const active = document.querySelector<HTMLElement>('[data-phone-plane][data-phone-exposed="true"]');
    const pattern = document.querySelector<HTMLElement>('.portrait-scroll-spike__scene--pattern');
    const motion = document.querySelector<HTMLElement>('.portrait-scroll-spike__pattern-motion');
    const bounds = (element: HTMLElement | null) => {
      const rect = element?.getBoundingClientRect();
      return rect ? [rect.left, rect.top, rect.right, rect.bottom] : null;
    };
    return {
      visual: visual
        ? [visual.offsetLeft, visual.offsetTop,
          visual.offsetLeft + visual.width, visual.offsetTop + visual.height]
        : [0, 0, window.innerWidth, window.innerHeight],
      viewport: bounds(viewport),
      coverage: bounds(coverage),
      active: bounds(active),
      pattern: bounds(pattern),
      coverageColor: getComputedStyle(document.querySelector('.phone-story')!)
        .getPropertyValue('--phone-story-coverage').trim(),
      patternAfter: motion ? getComputedStyle(motion, '::after').content : null,
      frame: pattern?.dataset.phonePatternFrame
    };
  });
}

test('Hero Loader handoff starts at zero under one fixed opaque topology', async ({ page }) => {
  let releaseVideo = () => undefined;
  const videoGate = new Promise<void>((resolve) => { releaseVideo = resolve; });
  await page.route(/figure1-rgb-alpha.*\.mp4/, async (route) => {
    await videoGate;
    await route.continue();
  });
  await page.goto('/harness/r5-phone-clean#hero', { waitUntil: 'domcontentloaded' });
  const hero = page.locator('.portrait-scroll-spike__scene--hero');
  await expect(hero).toBeAttached();
  const firstCommit = await hero.evaluate((element) => {
    const root = element as HTMLElement;
    const loader = document.querySelector<HTMLElement>('[data-story-loader="true"]');
    const viewport = root.closest('[data-phone-plane]')
      ?.parentElement?.parentElement as HTMLElement | null;
    return {
      loader: loader?.dataset.loaderStatus,
      loaderVisible: loader?.hidden === false,
      progress: root.style.getPropertyValue('--r4-hero-progress'),
      middle: root.style.getPropertyValue('--r4-hero-middle-intro'),
      figure: root.style.getPropertyValue('--r4-hero-figure-intro'),
      viewportPosition: viewport ? getComputedStyle(viewport).position : null,
      rootPosition: getComputedStyle(root).position
    };
  });
  expect(firstCommit).toEqual({
    loader: 'running', loaderVisible: true,
    progress: '0.0000', middle: '0.0000', figure: '0.0000',
    viewportPosition: 'fixed', rootPosition: 'absolute'
  });

  releaseVideo();
  await waitForCommitSequence(page, 'hero', 0);
  await expect(hero).toHaveAttribute('data-phone-hero-images', 'decoded');
  const loader = page.locator('[data-story-loader="true"]');
  await expect(loader).toHaveAttribute('data-loader-status', 'exiting', { timeout: 10_000 });
  const allExitFrames: Buffer[] = [];
  for (let frame = 0; frame < 12; frame += 1) {
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    allExitFrames.push(await page.screenshot());
  }
  await page.waitForFunction(() => {
    const target = document.querySelector<HTMLElement>('[data-story-loader="true"]');
    return !target || Number.parseFloat(getComputedStyle(target).opacity) < 0.7;
  });
  const provenExitFrames: Buffer[] = [];
  for (let frame = 0; frame < 8; frame += 1) {
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    provenExitFrames.push(await page.screenshot());
  }
  expect(allExitFrames).toHaveLength(12);
  await assertNoIntermediateWhiteOrBlackFrame(provenExitFrames, { tolerance: 3 });
  await expect(loader).toHaveAttribute('data-loader-status', 'hidden');
  await assertTargetContentVisible(page, ['#portrait-spike-home']);
  await assertNoWhiteOrTransparentViewportEdges(page);
});

test('harness contract keeps every real viewport edge opaque', async ({ page }) => {
  let releaseVideo = () => undefined;
  const videoGate = new Promise<void>((resolve) => { releaseVideo = resolve; });
  await page.route(/figure1-rgb-alpha.*\.mp4/, async (route) => {
    await videoGate;
    await route.continue();
  });
  await page.goto('/harness/r5-phone-clean#hero', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-story-loader="true"]')).toBeVisible();
  await assertOpaqueViewportEdges(page, [0, 0, 0], 0);
  releaseVideo();
});

test('harness contract pixel decoder rejects a one-CSS-pixel edge gap', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(`
    <style>
      html, body { margin: 0; min-height: 100%; background: rgb(255 255 255); }
      #cover { position: fixed; inset: 0 0 1px; background: rgb(7 17 14); }
    </style>
    <div id="cover"></div>
  `);
  await expect(assertOpaqueViewportEdges(page, [7, 17, 14], 0)).rejects.toThrow(
    /opaque viewport edge/i
  );
});

test('Pattern viewport and coverage stay globally owned through a live resize', async ({ page }) => {
  await page.goto('/harness/r5-phone-clean#pattern', { waitUntil: 'domcontentloaded' });
  await waitForCommitSequence(page, 'pattern', 0);
  await expect(page.locator('.portrait-scroll-spike__scene--pattern'))
    .toHaveAttribute('data-phone-pattern-frame', 'ready');
  await assertTargetContentVisible(page, ['#portrait-spike-pattern-title']);

  for (const size of [{ width: 393, height: 852 }, { width: 390, height: 720 }]) {
    await page.setViewportSize(size);
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
    const proof = await patternViewportProof(page);
    expect(proof.frame).toBe('ready');
    expect(proof.coverageColor).toBe('#8f7f61');
    expect(proof.patternAfter).toBe('none');
    for (const bounds of [proof.viewport, proof.coverage, proof.active, proof.pattern]) {
      expect(bounds).not.toBeNull();
      bounds?.forEach((value, index) => expect(value).toBeCloseTo(proof.visual[index]!, 0));
    }
    await assertNoWhiteOrTransparentViewportEdges(page);
  }
});

test('Front direct Star Map exposes a causal rotated Canvas frame and content', async ({ page }) => {
  await page.goto('/harness/r5-phone-clean#star-map', { waitUntil: 'domcontentloaded' });
  await waitForCommitSequence(page, 'star-map', 0);
  await assertSinglePhoneAuthority(page);
  await expect(page.locator('[data-portrait-star-perlin]'))
    .toHaveAttribute('data-portrait-star-perlin', 'ready');
  await expect(page.locator('[data-portrait-star-perlin]'))
    .toHaveAttribute('data-portrait-star-camera', 'rotate(-90deg) cover');
  await assertTargetContentVisible(page, FRONT_CONTENT['star-map']);
  await assertNoWhiteOrTransparentViewportEdges(page);
});

test('Grade A direct entries expose the requested target before Loader retirement', async ({
  page
}) => {
  for (const scene of Object.keys(GRADE_A_CONTENT) as Array<keyof typeof GRADE_A_CONTENT>) {
    await page.goto(`/harness/r5-phone-clean?direct=${scene}${GRADE_A_HASH[scene]}`, {
      waitUntil: 'domcontentloaded'
    });
    await waitForCommitSequence(page, scene, 0);
    await assertSinglePhoneAuthority(page);
    await assertTargetContentVisible(page, GRADE_A_CONTENT[scene]);
    await assertNoWhiteOrTransparentViewportEdges(page);
    await expect(page.locator('[data-story-loader="true"]'))
      .toHaveAttribute('data-loader-status', 'hidden');
    if (scene === 'figure2-animation') {
      await expect(page.locator('[data-figure2-packed-alpha-canvas]'))
        .toHaveAttribute('data-packed-alpha-frame-ready', 'true');
      await expect(page.locator('[data-stage-retained-figure2-arch="true"]'))
        .toHaveCount(1);
      expect(await page.locator('[data-stage-retained-figure2-arch="true"]')
        .evaluate((arch) => Boolean(arch.closest('[data-figure2-depth-ranked-field="true"]'))))
        .toBe(false);
    }
  }
});

test('Grade A chain commits each hold once and preserves both-direction endpoints', async ({
  page
}) => {
  await page.goto('/harness/r5-phone-clean#method-top', {
    waitUntil: 'domcontentloaded'
  });
  await waitForCommitSequence(page, 'method-top', 0);
  await traverseGradeA(page, 'method-top', 'figure2-animation', 'forward');
  await traverseGradeA(page, 'figure2-animation', 'figure2-proof', 'forward');
  await traverseGradeA(page, 'figure2-proof', 'brand', 'forward');
  await traverseGradeA(page, 'brand', 'figure2-proof', 'reverse');
  await traverseGradeA(page, 'figure2-proof', 'figure2-animation', 'reverse');
  await traverseGradeA(page, 'figure2-animation', 'method-top', 'reverse');
});

test('Figure3 slice direct entries expose accepted Brand, paper, and Services endpoints', async ({
  page
}) => {
  for (const scene of Object.keys(FIGURE3_SLICE_CONTENT) as Array<
    keyof typeof FIGURE3_SLICE_CONTENT
  >) {
    await page.goto(`/harness/r5-phone-clean?direct=${scene}${FIGURE3_SLICE_HASH[scene]}`, {
      waitUntil: 'domcontentloaded'
    });
    await waitForCommitSequence(page, scene, 0);
    await assertSinglePhoneAuthority(page);
    await assertTargetContentVisible(page, FIGURE3_SLICE_CONTENT[scene]);
    await assertNoWhiteOrTransparentViewportEdges(page);
    if (scene === 'figure3-animation') {
      await expect(page.locator('[data-phone-figure3-paper-canvas]'))
        .toHaveAttribute('data-phone-figure3-paper-frame', 'ready');
      await expect(page.locator('.phone-figure3 video')).toHaveCount(1);
      await expect(page.locator('.phone-figure3 canvas')).toHaveCount(1);
    }
  }
});

test('Figure3 slice commits forward and reverse twice without resource growth', async ({ page }) => {
  await page.goto('/harness/r5-phone-clean#brand', { waitUntil: 'domcontentloaded' });
  await waitForCommitSequence(page, 'brand', 0);
  const firstCycle: Array<Readonly<{ videos: number; canvases: number }>> = [];
  const secondCycle: Array<Readonly<{ videos: number; canvases: number }>> = [];
  for (const samples of [firstCycle, secondCycle]) {
    samples.push(await traverseFigure3Slice(
      page, 'brand', 'figure3-animation', 'forward'
    ));
    samples.push(await traverseFigure3Slice(
      page, 'figure3-animation', 'services', 'forward'
    ));
    samples.push(await traverseFigure3Slice(
      page, 'services', 'figure3-animation', 'reverse'
    ));
    samples.push(await traverseFigure3Slice(
      page, 'figure3-animation', 'brand', 'reverse'
    ));
  }
  expect(secondCycle).toEqual(firstCycle);
  for (const sample of secondCycle) {
    expect(sample.videos).toBeLessThanOrEqual(1);
    expect(sample.canvases).toBeLessThanOrEqual(2);
  }
});

test('Figure3 slice keeps Brand proved while its lazy scene chunk is delayed', async ({ page }) => {
  let releaseChunk = () => undefined;
  let observeRequest = () => undefined;
  const chunkGate = new Promise<void>((resolve) => { releaseChunk = resolve; });
  const chunkRequested = new Promise<void>((resolve) => { observeRequest = resolve; });
  await page.route(/\/assets\/PhoneFigure3-[^/]+\.js$/, async (route) => {
    observeRequest();
    await chunkGate;
    await route.continue();
  });
  try {
    await page.goto('/harness/r5-phone-clean#brand', { waitUntil: 'domcontentloaded' });
    const before = await waitForCommitSequence(page, 'brand', 0);
    await sendFrontIntent(page, 'forward');
    await chunkRequested;
    await expect(page.locator('.phone-story')).toHaveAttribute('data-phone-status', 'transaction');
    expect(await readCommitSequence(page)).toBe(before);
    await assertTargetContentVisible(page, FIGURE3_SLICE_CONTENT.brand);
    releaseChunk();
    await completeFigure3SliceAttempt(
      page, 'brand', 'figure3-animation', 'forward', before
    );
  } finally {
    releaseChunk();
  }
});

test('Figure3 slice rejects one native chunk URL without retrying it in the Document', async ({
  page
}) => {
  let requests = 0;
  let observeRequest = () => undefined;
  const chunkRequested = new Promise<void>((resolve) => { observeRequest = resolve; });
  await page.route(/\/assets\/PhoneFigure3-[^/]+\.js$/, async (route) => {
    requests += 1;
    observeRequest();
    await route.abort('failed');
  });
  await page.goto('/harness/r5-phone-clean#brand', { waitUntil: 'domcontentloaded' });
  const before = await waitForCommitSequence(page, 'brand', 0);
  await sendFrontIntent(page, 'forward');
  await chunkRequested;
  await expectFigure3SliceRollback(
    page, 'brand', 'figure3-animation', 'forward', before
  );
  await assertTargetContentVisible(page, FIGURE3_SLICE_CONTENT.brand);
  expect(requests).toBe(1);

  await sendFrontIntent(page, 'forward');
  await page.waitForTimeout(750);
  expect(requests).toBe(1);
  expect(await readCommitSequence(page)).toBe(before);
  await expect(page.locator('.phone-story')).toHaveAttribute('data-phone-scene', 'brand');
});

test('Figure3 slice refuses a withheld terminal compositor frame', async ({ page }) => {
  await withholdFigure3Endpoint(page, 'terminal');
  await page.goto('/harness/r5-phone-clean#brand', { waitUntil: 'domcontentloaded' });
  const before = await waitForCommitSequence(page, 'brand', 0);
  await sendFrontIntent(page, 'forward');
  await expect(page.locator('[data-phone-figure3-paper-canvas]')).toBeAttached();
  await expectFigure3SliceRollback(
    page, 'brand', 'figure3-animation', 'forward', before
  );
  await assertTargetContentVisible(page, FIGURE3_SLICE_CONTENT.brand);
});

test('Figure3 slice refuses a withheld initial compositor frame on reverse', async ({ page }) => {
  await withholdFigure3Endpoint(page, 'initial');
  await page.goto('/harness/r5-phone-clean#services', { waitUntil: 'domcontentloaded' });
  const before = await waitForCommitSequence(page, 'services', 0);
  await sendFrontIntent(page, 'reverse');
  await expect(page.locator('[data-phone-figure3-paper-canvas]')).toBeAttached();
  const activation = page.locator('[data-phone-activation]:not([hidden])');
  await expect(activation).toBeVisible();
  await activation.click();
  await expect(activation).toBeVisible();
  await expect(page.locator('.phone-story'))
    .toHaveAttribute('data-phone-phase', 'awaiting-media-activation');
  expect(await readCommitSequence(page)).toBe(before);
  await assertTargetContentVisible(page, FIGURE3_SLICE_CONTENT.services);
});

test('Figure3 slice refuses hidden Services content and preserves the compositor source', async ({
  page
}) => {
  await page.goto('/harness/r5-phone-clean#figure3-animation', {
    waitUntil: 'domcontentloaded'
  });
  const before = await waitForCommitSequence(page, 'figure3-animation', 0);
  await page.addStyleTag({ content: '#services { visibility: hidden !important; }' });
  await sendFrontIntent(page, 'forward');
  await expect(page.locator('[data-phone-transition="figure3-services"]')).toBeAttached();
  await expectFigure3SliceRollback(
    page, 'figure3-animation', 'services', 'forward', before
  );
  await expect(page.locator('.phone-figure3 video')).toHaveCount(1);
  await expect(page.locator('.phone-figure3 canvas')).toHaveCount(1);
});

test('Figure3 slice restores its proved source after background and foreground', async ({ page }) => {
  await page.addInitScript(() => {
    const visibility = { current: 'visible' as DocumentVisibilityState };
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility.current
    });
    Object.defineProperty(window, '__r5SetVisibility', {
      configurable: true,
      value: (next: DocumentVisibilityState) => {
        visibility.current = next;
        document.dispatchEvent(new Event('visibilitychange'));
      }
    });
  });
  await page.goto('/harness/r5-phone-clean#figure3-animation', {
    waitUntil: 'domcontentloaded'
  });
  const before = await waitForCommitSequence(page, 'figure3-animation', 0);
  await sendFrontIntent(page, 'forward');
  await expect(page.locator('[data-phone-transition="figure3-services"]')).toBeAttached();
  await page.evaluate(() => (
    window as typeof window & {
      __r5SetVisibility(next: DocumentVisibilityState): void;
    }
  ).__r5SetVisibility('hidden'));
  await page.waitForTimeout(150);
  expect(await readCommitSequence(page)).toBe(before);
  await page.evaluate(() => (
    window as typeof window & {
      __r5SetVisibility(next: DocumentVisibilityState): void;
    }
  ).__r5SetVisibility('visible'));
  for (let activationAttempt = 0; activationAttempt < 3; activationAttempt += 1) {
    const state = await page.waitForFunction(({ sequence }) => {
      const shell = document.querySelector<HTMLElement>('.phone-story');
      if (shell?.dataset.phoneStatus === 'stable'
        && Number(shell.dataset.phoneCommitSequence) === sequence) return 'stable';
      if (document.querySelector('[data-phone-activation]:not([hidden])')) return 'activation';
      return null;
    }, { sequence: before }, { timeout: 15_000 });
    if (await state.jsonValue() === 'stable') break;
    await page.locator('[data-phone-activation]:not([hidden])').click();
  }
  await page.waitForFunction(({ sequence }) => {
    const shell = document.querySelector<HTMLElement>('.phone-story');
    return shell?.dataset.phoneStatus === 'stable'
      && shell.dataset.phoneScene === 'figure3-animation'
      && Number(shell.dataset.phoneCommitSequence) === sequence;
  }, { sequence: before });
  await expect(page.locator('[data-phone-figure3-paper-canvas]'))
    .toHaveAttribute('data-phone-figure3-paper-frame', 'ready');
  await traverseFigure3Slice(
    page, 'figure3-animation', 'services', 'forward'
  );
  await traverseFigure3Slice(
    page, 'services', 'figure3-animation', 'reverse'
  );
});

test('Front first three segments preserve effect semantics and endpoints both ways', async ({ page }) => {
  await page.goto('/harness/r5-phone-clean#hero', { waitUntil: 'domcontentloaded' });
  await waitForCommitSequence(page, 'hero', 0);
  await traverseFront(page, 'hero', 'pattern', 'forward');
  await traverseFront(page, 'pattern', 'star-map', 'forward');
  await traverseFront(page, 'star-map', 'aod-animation', 'forward');
  await traverseFront(page, 'aod-animation', 'star-map', 'reverse');
  await traverseFront(page, 'star-map', 'pattern', 'reverse');
  await traverseFront(page, 'pattern', 'hero', 'reverse');
});

test('Front reduced motion still reaches one fully proven target hold', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/harness/r5-phone-clean#hero', { waitUntil: 'domcontentloaded' });
  await waitForCommitSequence(page, 'hero', 0);
  await traverseFront(page, 'hero', 'pattern', 'forward');
  await expect(page.locator('.portrait-scroll-spike__pattern-copy')).toHaveCSS('opacity', '1');
});

test('Front Ink failure rolls back to the fully proved source without committing target', async ({ page }) => {
  await page.goto('/harness/r5-phone-clean#hero', { waitUntil: 'domcontentloaded' });
  const before = await waitForCommitSequence(page, 'hero', 0);
  await sendFrontIntent(page, 'forward');
  const canvas = page.locator('[data-r4-ink-segment="hero-pattern"]');
  await expect(canvas).toBeAttached();
  await canvas.dispatchEvent('webglcontextlost', { cancelable: true });
  try {
    await page.waitForFunction(({ sequence }) => {
      const shell = document.querySelector<HTMLElement>('.phone-story');
      return shell?.dataset.phoneStatus === 'stable'
        && shell.dataset.phoneScene === 'hero'
        && Number(shell.dataset.phoneCommitSequence) === sequence;
    }, { sequence: before }, { timeout: 20_000 });
  } catch (error) {
    const state = await page.locator('.phone-story').evaluate((shell) => ({
      ...((shell as HTMLElement).dataset),
      retry: !!document.querySelector('[data-phone-retry]:not([hidden])'),
      activation: !!document.querySelector('[data-phone-activation]:not([hidden])'),
      heroCanvas: document.querySelector<HTMLElement>('[data-portrait-figure-canvas]')
        ? { ...document.querySelector<HTMLElement>('[data-portrait-figure-canvas]')!.dataset }
        : null,
      heroRoot: document.querySelector<HTMLElement>('.portrait-scroll-spike__scene--hero')
        ? { ...document.querySelector<HTMLElement>('.portrait-scroll-spike__scene--hero')!.dataset }
        : null
    }));
    throw new Error(`Front rollback did not settle: ${JSON.stringify(state)}`, {
      cause: error
    });
  }
  await assertTargetContentVisible(page, FRONT_CONTENT.hero);
  await assertNoWhiteOrTransparentViewportEdges(page);
});

test('harness contract edge decoder permits distinct visible scene content', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(`
    <style>
      html, body { margin: 0; min-height: 100%; background: rgb(7 17 14); }
      #content { position: fixed; inset: 300px 120px; background: rgb(180 20 30); }
    </style>
    <div id="content"></div>
  `);
  await assertOpaqueViewportEdges(page, [7, 17, 14], 0);
  await expect(assertOpaqueViewportEdges(page, [255, 255, 255], 255)).rejects.toThrow(
    /pixel tolerance/i
  );
});

test('harness contract helpers inspect rendered layers, content, frames, and commits', async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(`
    <style>
      html, body { margin: 0; background: rgb(24 32 28); }
      [data-phone-plane] { position: fixed; inset: 0; }
      [data-phone-plane="source"] { z-index: 10; }
      [data-phone-plane="receiver"] { z-index: 30; pointer-events: none; }
      #content { position: fixed; left: 120px; top: 280px; width: 120px; height: 80px; }
    </style>
    <main class="phone-story" data-phone-scene="hero" data-phone-commit-sequence="1">
      <div data-phone-plane="source"><h1 id="content">Hero</h1></div>
      <div data-phone-plane="receiver"></div>
    </main>
  `);
  await assertLayerOrderAtPoints(page, [{ x: 180, y: 320 }], ['receiver', 'source']);
  await assertTargetContentVisible(page, ['#content']);
  await page.locator('[data-phone-plane="source"]').evaluate((plane) => {
    (plane as HTMLElement).style.opacity = '0';
  });
  await expect(assertTargetContentVisible(page, ['#content'])).rejects.toThrow(
    /required clean target content/i
  );
  await page.locator('[data-phone-plane="source"]').evaluate((plane) => {
    (plane as HTMLElement).style.opacity = '1';
  });
  const neutral = await page.screenshot();
  await assertNoIntermediateWhiteOrBlackFrame([neutral, neutral, neutral], {});
  await page.evaluate(() => {
    document.documentElement.style.background = '#000';
    document.body.replaceChildren();
    document.body.style.background = '#000';
  });
  const blackEndpoint = await page.screenshot();
  await assertNoIntermediateWhiteOrBlackFrame([blackEndpoint, neutral], {});
  await expect(
    assertNoIntermediateWhiteOrBlackFrame([neutral, blackEndpoint, neutral], {})
  ).rejects.toThrow(/Intermediate frame 1 is black/);
  await page.setContent(`
    <main class="phone-story" data-phone-scene="hero" data-phone-commit-sequence="1"></main>
  `);
  await page.evaluate(() => {
    window.setTimeout(() => {
      const root = document.querySelector<HTMLElement>('.phone-story');
      if (root) {
        root.dataset.phoneScene = 'pattern';
        root.dataset.phoneCommitSequence = '2';
      }
    }, 0);
  });
  await waitForCommitSequence(page, 'pattern', 1);
});
