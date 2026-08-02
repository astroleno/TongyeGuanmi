import { expect, test } from '@playwright/test';
import {
  assertCompositeTargetContentVisible,
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

const GROUP45_CONTENT = {
  brand: ['#phone-brand-title', '.phone-brand__definition p'],
  'figure3-animation': [
    '[data-phone-scene="figure3-animation"] [data-phone-figure3-paper-canvas]'
  ],
  services: ['#phone-services-title', '.phone-services__hero > p:last-child'],
  'ttg-animation': ['[data-r4-scene="ttg-animation"] [data-ttg-figure-video]'],
  lab: ['#phone-lab-title', '.phone-lab__hero > p:not(.phone-lab__eyebrow)']
} as const;

const GROUP45_SEGMENT = {
  'brand:figure3-animation': 'brand-figure3',
  'figure3-animation:services': 'figure3-services',
  'services:ttg-animation': 'services-ttg',
  'ttg-animation:lab': 'ttg-lab',
  'lab:ttg-animation': 'ttg-lab',
  'ttg-animation:services': 'services-ttg',
  'services:figure3-animation': 'figure3-services',
  'figure3-animation:brand': 'brand-figure3'
} as const;

type Group45Scene = keyof typeof GROUP45_CONTENT;

const PH_SLICE_CONTENT = {
  lab: ['#phone-lab-title', '.phone-lab__hero > p:not(.phone-lab__eyebrow)'],
  'ph-animation': [
    '[data-r4-scene="ph-animation"] [data-phone-packed-alpha-canvas="ph-figure"]'
  ],
  education: [
    '#education [data-r4-scene="education"] .r4-education__vertical h2',
    '#education .r4-education__lead p'
  ]
} as const;

const PH_SLICE_SEGMENT = {
  'lab:ph-animation': 'lab-ph',
  'ph-animation:education': 'ph-education',
  'education:ph-animation': 'ph-education',
  'ph-animation:lab': 'lab-ph'
} as const;

type PhSliceScene = keyof typeof PH_SLICE_CONTENT;

const CRANE_SLICE_CONTENT = {
  education: [
    '#education [data-r4-scene="education"] .r4-education__vertical h2',
    '#education .r4-education__lead p'
  ],
  'crane-animation': [
    '[data-r4-scene="crane-animation"] [data-phone-packed-alpha-canvas="crane-figure"]',
    '[data-r4-scene="crane-animation"] [data-phone-packed-alpha-canvas="crane-flock"]'
  ]
} as const;

const CRANE_SLICE_SEGMENT = {
  'education:crane-animation': 'education-crane',
  'crane-animation:education': 'education-crane'
} as const;

type CraneSliceScene = keyof typeof CRANE_SLICE_CONTENT;

const COMPLETE_STORY_SCENES = [
  'hero', 'pattern', 'star-map', 'aod-animation', 'method-top',
  'figure2-animation', 'figure2-proof', 'brand', 'figure3-animation',
  'services', 'ttg-animation', 'lab', 'ph-animation', 'education',
  'crane-animation', 'contact'
] as const;

type CompleteStoryScene = (typeof COMPLETE_STORY_SCENES)[number];

const COMPLETE_STORY_SEGMENTS = [
  'hero-pattern', 'pattern-star-map', 'star-map-aod', 'aod-method-top',
  'method-bottom-figure2', 'figure2-distance-expand', 'figure2-proof-brand',
  'brand-figure3', 'figure3-services', 'services-ttg', 'ttg-lab', 'lab-ph',
  'ph-education', 'education-crane', 'crane-contact'
] as const;

type CompleteStorySegment = (typeof COMPLETE_STORY_SEGMENTS)[number];

const COMPLETE_STORY_CONTENT: Readonly<Record<CompleteStoryScene, readonly string[]>> = {
  ...FRONT_CONTENT,
  ...GRADE_A_CONTENT,
  ...GROUP45_CONTENT,
  ...PH_SLICE_CONTENT,
  ...CRANE_SLICE_CONTENT,
  contact: [
    '#contact [data-r4-scene="contact"] h2',
    '#contact [data-r4-scene="contact"] p'
  ]
};

const BETWEEN_PLANE_SEGMENTS = new Set<CompleteStorySegment>([
  'aod-method-top', 'figure3-services', 'ttg-lab', 'ph-education',
  'crane-contact'
]);

type RuntimeResourceSample = Readonly<{
  videos: number;
  decoders: number;
  canvases: number;
  webgl: number;
}>;

type LifecycleProbeSample = Readonly<{
  listeners: number;
  timeouts: number;
  intervals: number;
  animationFrames: number;
}>;

async function nextAnimationFrame(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
}

async function withholdRecoveryManifest(
  page: import('@playwright/test').Page
): Promise<() => void> {
  let release = () => undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(/\/r5-release-manifest\.json(?:\?.*)?$/, async (route) => {
    await gate;
    await route.continue();
  });
  return release;
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

async function completeGroup45Attempt(
  page: import('@playwright/test').Page,
  source: Group45Scene,
  target: Group45Scene,
  direction: 'forward' | 'reverse',
  before: number
): Promise<void> {
  const segment = GROUP45_SEGMENT[`${source}:${target}` as keyof typeof GROUP45_SEGMENT];
  await page.waitForFunction((expectedSegment) => {
    const shell = document.querySelector<HTMLElement>('.phone-story');
    return Boolean(document.querySelector(
      `[data-phone-plane="effect"] [data-r4-ink-segment="${expectedSegment}"], `
        + `[data-phone-plane="effect"] [data-phone-transition="${expectedSegment}"]`
    ) || document.querySelector('[data-phone-activation]:not([hidden])')
      || shell?.dataset.phonePhase === 'awaiting-leg-intent');
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
    const state = await page.waitForFunction(({ from, to, after }) => {
      const shell = document.querySelector<HTMLElement>('.phone-story');
      const current = {
        scene: shell?.dataset.phoneScene,
        status: shell?.dataset.phoneStatus,
        phase: shell?.dataset.phonePhase,
        failure: shell?.dataset.phoneFailure,
        sequence: Number(shell?.dataset.phoneCommitSequence)
      };
      return current.scene === to && current.sequence > after
        || current.status === 'stable' && current.scene === from
        || ['awaiting-media-activation', 'awaiting-leg-intent'].includes(current.phase ?? '')
        ? current : null;
    }, { from: source, to: target, after: before }, { timeout: 25_000 });
    const current = await state.jsonValue();
    if (current.scene === target && current.sequence > before) break;
    if (current.status === 'stable') {
      throw new Error(`Group 4-5 ${source} → ${target} rolled back: ${JSON.stringify(current)}`);
    }
    if (current.phase === 'awaiting-media-activation') {
      await page.locator('[data-phone-activation]:not([hidden])').click();
    } else if (current.phase === 'awaiting-leg-intent') {
      await sendFrontIntent(page, direction);
    }
  }
  await waitForCommitSequence(page, target, before);
  expect(await readCommitSequence(page)).toBe(before + 1);
}

async function traverseGroup45(
  page: import('@playwright/test').Page,
  source: Group45Scene,
  target: Group45Scene,
  direction: 'forward' | 'reverse'
): Promise<Readonly<{ videos: number; canvases: number }>> {
  const before = await readCommitSequence(page);
  await sendFrontIntent(page, direction);
  await completeGroup45Attempt(page, source, target, direction, before);
  await assertSinglePhoneAuthority(page);
  await assertTargetContentVisible(page, GROUP45_CONTENT[target]);
  await assertNoWhiteOrTransparentViewportEdges(page);
  if (target === 'ttg-animation') {
    await expect(page.locator('[data-ttg-figure-video]'))
      .toHaveAttribute('data-phone-ttg-endpoint-ready', /initial|terminal/);
  }
  return page.evaluate(() => ({
    videos: document.querySelectorAll('.phone-story video').length,
    canvases: document.querySelectorAll('.phone-story canvas').length
  }));
}

async function expectGroup45Rollback(
  page: import('@playwright/test').Page,
  source: Group45Scene,
  target: Group45Scene,
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
      throw new Error(`Withheld Group 4-5 proof committed ${target}: ${JSON.stringify(state)}`);
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
  throw new Error(`Group 4-5 did not roll back: ${JSON.stringify(state)}`);
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

async function completePhSliceAttempt(
  page: import('@playwright/test').Page,
  source: PhSliceScene,
  target: PhSliceScene,
  direction: 'forward' | 'reverse',
  before: number
): Promise<void> {
  const segment = PH_SLICE_SEGMENT[`${source}:${target}` as keyof typeof PH_SLICE_SEGMENT];
  const effectSelector = `[data-phone-plane="effect"] [data-r4-ink-segment="${segment}"], `
    + `[data-phone-plane="effect"] [data-phone-transition="${segment}"]`;
  await page.waitForFunction((expectedSegment) => {
    const shell = document.querySelector<HTMLElement>('.phone-story');
    return Boolean(document.querySelector(
      `[data-phone-plane="effect"] [data-r4-ink-segment="${expectedSegment}"], `
        + `[data-phone-plane="effect"] [data-phone-transition="${expectedSegment}"]`
    ) || document.querySelector('[data-phone-activation]:not([hidden])')
      || shell?.dataset.phonePhase === 'awaiting-leg-intent');
  }, segment, { timeout: 10_000 });
  await expect(page.locator(effectSelector)).toBeAttached({ timeout: 10_000 });
  for (let boundary = 0; boundary < 5; boundary += 1) {
    const state = await page.waitForFunction(({ from, to, after }) => {
      const shell = document.querySelector<HTMLElement>('.phone-story');
      const current = {
        scene: shell?.dataset.phoneScene,
        status: shell?.dataset.phoneStatus,
        phase: shell?.dataset.phonePhase,
        failure: shell?.dataset.phoneFailure,
        sequence: Number(shell?.dataset.phoneCommitSequence),
        activation: Boolean(document.querySelector('[data-phone-activation]:not([hidden])'))
      };
      return current.scene === to && current.sequence > after
        || current.status === 'stable' && current.scene === from
        || current.activation
        || current.phase === 'awaiting-leg-intent'
        ? current : null;
    }, { from: source, to: target, after: before }, { timeout: 25_000 });
    const current = await state.jsonValue();
    if (current.scene === target && current.sequence > before) break;
    if (current.status === 'stable') {
      throw new Error(`PH slice ${source} → ${target} rolled back: ${JSON.stringify(current)}`);
    }
    if (current.activation) {
      await page.locator('[data-phone-activation]:not([hidden])').click();
    } else if (current.phase === 'awaiting-leg-intent') {
      await sendFrontIntent(page, direction);
    }
  }
  await waitForCommitSequence(page, target, before);
  expect(await readCommitSequence(page)).toBe(before + 1);
}

async function traversePhSlice(
  page: import('@playwright/test').Page,
  source: PhSliceScene,
  target: PhSliceScene,
  direction: 'forward' | 'reverse'
): Promise<Readonly<{ videos: number; canvases: number }>> {
  const before = await readCommitSequence(page);
  await sendFrontIntent(page, direction);
  await completePhSliceAttempt(page, source, target, direction, before);
  await assertSinglePhoneAuthority(page);
  await assertTargetContentVisible(page, PH_SLICE_CONTENT[target]);
  await assertNoWhiteOrTransparentViewportEdges(page);
  if (target === 'ph-animation') {
    await expect(page.locator('[data-phone-packed-alpha-canvas="ph-figure"]'))
      .toHaveAttribute('data-packed-alpha-frame-ready', 'true');
  }
  return page.evaluate(() => ({
    videos: document.querySelectorAll('.phone-story video').length,
    canvases: document.querySelectorAll('.phone-story canvas').length
  }));
}

async function expectPhSliceRollback(
  page: import('@playwright/test').Page,
  source: PhSliceScene,
  target: PhSliceScene,
  before: number
): Promise<void> {
  let handledActivation = false;
  for (let sample = 0; sample < 300; sample += 1) {
    const state = await page.locator('.phone-story').evaluate((shell) => ({
      scene: (shell as HTMLElement).dataset.phoneScene,
      status: (shell as HTMLElement).dataset.phoneStatus,
      sequence: Number((shell as HTMLElement).dataset.phoneCommitSequence),
      activation: Boolean(document.querySelector('[data-phone-activation]:not([hidden])'))
    }));
    if ((state.status === 'stable' || state.status === 'faulted')
      && state.scene === source && state.sequence === before) return;
    if (state.status === 'stable' && state.scene === target) {
      throw new Error(`Withheld PH proof committed ${target}: ${JSON.stringify(state)}`);
    }
    if (state.activation && !handledActivation) {
      handledActivation = true;
      await page.locator('[data-phone-activation]:not([hidden])').click();
    }
    await page.waitForTimeout(100);
  }
  throw new Error(`PH slice did not roll back from ${source}`);
}

async function completeCraneSliceAttempt(
  page: import('@playwright/test').Page,
  source: CraneSliceScene,
  target: CraneSliceScene,
  direction: 'forward' | 'reverse',
  before: number
): Promise<void> {
  const segment = CRANE_SLICE_SEGMENT[
    `${source}:${target}` as keyof typeof CRANE_SLICE_SEGMENT
  ];
  const effectSelector = `[data-phone-plane="effect"] [data-r4-ink-segment="${segment}"]`;
  await page.waitForFunction((expectedSegment) => {
    const shell = document.querySelector<HTMLElement>('.phone-story');
    return Boolean(document.querySelector(
      `[data-phone-plane="effect"] [data-r4-ink-segment="${expectedSegment}"]`
    ) || document.querySelector('[data-phone-activation]:not([hidden])')
      || shell?.dataset.phonePhase === 'awaiting-leg-intent');
  }, segment, { timeout: 10_000 });
  await expect(page.locator(effectSelector)).toBeAttached({ timeout: 10_000 });
  await expect(page.locator('.phone-story')).toHaveAttribute(
    'data-phone-interaction', 'disabled'
  );
  for (let boundary = 0; boundary < 5; boundary += 1) {
    const state = await page.waitForFunction(({ from, to, after }) => {
      const shell = document.querySelector<HTMLElement>('.phone-story');
      const current = {
        scene: shell?.dataset.phoneScene,
        status: shell?.dataset.phoneStatus,
        phase: shell?.dataset.phonePhase,
        sequence: Number(shell?.dataset.phoneCommitSequence),
        activation: Boolean(document.querySelector('[data-phone-activation]:not([hidden])'))
      };
      return current.scene === to && current.sequence > after
        || current.status === 'stable' && current.scene === from
        || current.activation
        || current.phase === 'awaiting-leg-intent'
        ? current : null;
    }, { from: source, to: target, after: before }, { timeout: 25_000 });
    const current = await state.jsonValue();
    if (current.scene === target && current.sequence > before) break;
    if (current.status === 'stable') {
      throw new Error(`Crane slice ${source} → ${target} rolled back: ${JSON.stringify(current)}`);
    }
    if (current.activation) {
      await page.locator('[data-phone-activation]:not([hidden])').click();
    } else if (current.phase === 'awaiting-leg-intent') {
      await sendFrontIntent(page, direction);
    }
  }
  await waitForCommitSequence(page, target, before);
  expect(await readCommitSequence(page)).toBe(before + 1);
  await expect(page.locator('.phone-story')).toHaveAttribute(
    'data-phone-interaction', 'enabled'
  );
}

async function traverseCraneSlice(
  page: import('@playwright/test').Page,
  source: CraneSliceScene,
  target: CraneSliceScene,
  direction: 'forward' | 'reverse'
): Promise<Readonly<{ videos: number; canvases: number }>> {
  const before = await readCommitSequence(page);
  await sendFrontIntent(page, direction);
  await completeCraneSliceAttempt(page, source, target, direction, before);
  await assertSinglePhoneAuthority(page);
  if (target === 'crane-animation') {
    await assertCompositeTargetContentVisible(page, CRANE_SLICE_CONTENT[target]);
  } else {
    await assertTargetContentVisible(page, CRANE_SLICE_CONTENT[target]);
  }
  await assertNoWhiteOrTransparentViewportEdges(page);
  if (target === 'crane-animation') {
    for (const layer of ['crane-figure', 'crane-flock']) {
      await expect(page.locator(`[data-phone-packed-alpha-canvas="${layer}"]`))
        .toHaveAttribute('data-packed-alpha-frame-ready', 'true');
    }
  }
  return page.evaluate(() => ({
    videos: document.querySelectorAll('.phone-story video').length,
    canvases: document.querySelectorAll('.phone-story canvas').length
  }));
}

async function expectCraneSliceRollback(
  page: import('@playwright/test').Page,
  source: CraneSliceScene,
  target: CraneSliceScene,
  before: number
): Promise<void> {
  let handledActivation = false;
  for (let sample = 0; sample < 300; sample += 1) {
    const state = await page.locator('.phone-story').evaluate((shell) => ({
      scene: (shell as HTMLElement).dataset.phoneScene,
      status: (shell as HTMLElement).dataset.phoneStatus,
      sequence: Number((shell as HTMLElement).dataset.phoneCommitSequence),
      activation: Boolean(document.querySelector('[data-phone-activation]:not([hidden])'))
    }));
    if ((state.status === 'stable' || state.status === 'faulted')
      && state.scene === source && state.sequence === before) return;
    if (state.status === 'stable' && state.scene === target) {
      throw new Error(`Withheld Crane proof committed ${target}: ${JSON.stringify(state)}`);
    }
    if (state.activation && !handledActivation) {
      handledActivation = true;
      await page.locator('[data-phone-activation]:not([hidden])').click();
    }
    await page.waitForTimeout(100);
  }
  throw new Error(`Crane slice did not roll back from ${source}`);
}

function completeStorySegment(
  source: CompleteStoryScene,
  target: CompleteStoryScene
): CompleteStorySegment {
  const sourceIndex = COMPLETE_STORY_SCENES.indexOf(source);
  const targetIndex = COMPLETE_STORY_SCENES.indexOf(target);
  const segmentIndex = Math.min(sourceIndex, targetIndex);
  if (Math.abs(sourceIndex - targetIndex) !== 1) {
    throw new Error(`Non-adjacent complete-story edge: ${source} → ${target}`);
  }
  const segment = COMPLETE_STORY_SEGMENTS[segmentIndex];
  if (!segment) throw new Error(`Missing complete-story segment at ${segmentIndex}`);
  return segment;
}

async function readRuntimeResources(
  page: import('@playwright/test').Page
): Promise<RuntimeResourceSample> {
  return page.evaluate(() => {
    const root = document.querySelector('.phone-story__planes');
    const videos = root?.querySelectorAll('video') ?? [];
    const canvases = root?.querySelectorAll('canvas') ?? [];
    const webgl = root?.querySelectorAll([
      'canvas[data-portrait-figure-canvas]',
      'canvas[data-aod-figure-canvas]',
      'canvas[data-figure2-packed-alpha-canvas]',
      'canvas[data-phone-packed-alpha-canvas]'
    ].join(',')) ?? [];
    return {
      videos: videos.length,
      decoders: [...videos].filter((video) => video.readyState >= 2).length,
      canvases: canvases.length,
      webgl: webgl.length
    };
  });
}

async function assertCompleteStoryFrame(
  page: import('@playwright/test').Page,
  scene: CompleteStoryScene
): Promise<void> {
  if (scene === 'hero') {
    await expect(page.locator('[data-portrait-figure-frame]'))
      .toHaveAttribute('data-portrait-figure-frame', 'ready');
  } else if (scene === 'pattern') {
    await expect(page.locator('.portrait-scroll-spike__scene--pattern'))
      .toHaveAttribute('data-phone-pattern-frame', 'ready');
  } else if (scene === 'star-map') {
    await expect(page.locator('[data-portrait-star-perlin]'))
      .toHaveAttribute('data-portrait-star-perlin', 'ready');
  } else if (scene === 'aod-animation') {
    await expect(page.locator('[data-aod-figure-canvas]'))
      .toHaveAttribute('data-packed-alpha-frame-ready', 'true');
  } else if (scene === 'figure2-animation') {
    await expect(page.locator('[data-figure2-packed-alpha-canvas]'))
      .toHaveAttribute('data-packed-alpha-frame-ready', 'true');
  } else if (scene === 'figure3-animation') {
    await expect(page.locator('[data-phone-figure3-paper-canvas]'))
      .toHaveAttribute('data-phone-figure3-paper-frame', 'ready');
  } else if (scene === 'ttg-animation') {
    await expect(page.locator('[data-ttg-figure-video]'))
      .toHaveAttribute('data-phone-ttg-endpoint-ready', /initial|terminal/);
  } else if (scene === 'ph-animation') {
    await expect(page.locator('[data-phone-packed-alpha-canvas="ph-figure"]'))
      .toHaveAttribute('data-packed-alpha-frame-ready', 'true');
  } else if (scene === 'crane-animation') {
    for (const layer of ['crane-figure', 'crane-flock']) {
      await expect(page.locator(`[data-phone-packed-alpha-canvas="${layer}"]`))
        .toHaveAttribute('data-packed-alpha-frame-ready', 'true');
    }
  }
}

async function traverseCompleteStoryLeg(
  page: import('@playwright/test').Page,
  source: CompleteStoryScene,
  target: CompleteStoryScene,
  direction: 'forward' | 'reverse'
): Promise<RuntimeResourceSample> {
  const segment = completeStorySegment(source, target);
  const beforeState = await page.locator('.phone-story').evaluate((shell) => ({
    revision: Number((shell as HTMLElement).dataset.phoneRevision),
    sequence: Number((shell as HTMLElement).dataset.phoneCommitSequence)
  }));
  const before = beforeState.sequence;
  await assertSinglePhoneAuthority(page);
  if (source === 'crane-animation') {
    await assertCompositeTargetContentVisible(page, COMPLETE_STORY_CONTENT[source]);
  } else {
    await assertTargetContentVisible(page, COMPLETE_STORY_CONTENT[source]);
  }
  await sendFrontIntent(page, direction);
  const startedHandle = await page.waitForFunction(({ from, to, after, revision }) => {
    const shell = document.querySelector<HTMLElement>('.phone-story');
    const state = {
      interaction: shell?.dataset.phoneInteraction,
      revision: Number(shell?.dataset.phoneRevision),
      scene: shell?.dataset.phoneScene,
      sequence: Number(shell?.dataset.phoneCommitSequence),
      status: shell?.dataset.phoneStatus
    };
    return state.revision > revision && (state.status === 'transaction'
      || state.status === 'stable' && (state.scene === from
        || state.scene === to && state.sequence > after)) ? state : null;
  }, { from: source, to: target, after: before, revision: beforeState.revision }, {
    timeout: 15_000
  });
  const started = await startedHandle.jsonValue();
  if (started.status === 'stable' && started.scene === source) {
    throw new Error(
      `Complete story ${source} → ${target} rolled back: ${JSON.stringify(started)}`
    );
  }
  if (started.status === 'transaction') expect(started.interaction).toBe('disabled');
  const effectSelector = `[data-phone-plane="effect"] [data-r4-ink-segment="${segment}"], `
    + `[data-phone-plane="effect"] [data-phone-transition="${segment}"]`;
  await expect(page.locator(effectSelector)).toBeAttached({ timeout: 15_000 });
  await expect(page.locator(effectSelector)).toHaveCount(1);
  await assertSinglePhoneAuthority(page);

  for (let boundary = 0; boundary < 8; boundary += 1) {
    const handle = await page.waitForFunction(({ from, to, after }) => {
      const shell = document.querySelector<HTMLElement>('.phone-story');
      const state = {
        scene: shell?.dataset.phoneScene,
        status: shell?.dataset.phoneStatus,
        phase: shell?.dataset.phonePhase,
        sequence: Number(shell?.dataset.phoneCommitSequence),
        activation: Boolean(document.querySelector('[data-phone-activation]:not([hidden])'))
      };
      return state.scene === to && state.sequence > after
        || state.status === 'stable' && state.scene === from
        || state.activation || state.phase === 'awaiting-leg-intent'
        ? state : null;
    }, { from: source, to: target, after: before }, { timeout: 30_000 });
    const state = await handle.jsonValue();
    if (state.scene === target && state.sequence > before) break;
    if (state.status === 'stable') {
      throw new Error(
        `Complete story ${source} → ${target} rolled back: ${JSON.stringify(state)}`
      );
    }
    if (state.activation) {
      await page.locator('[data-phone-activation]:not([hidden])').click();
    } else if (state.phase === 'awaiting-leg-intent') {
      await sendFrontIntent(page, direction);
    }
    await page.waitForTimeout(50);
  }

  await waitForCommitSequence(page, target, before);
  expect(await readCommitSequence(page)).toBe(before + 1);
  await expect(page.locator('[data-phone-plane="effect"]')).toHaveCSS(
    'z-index', BETWEEN_PLANE_SEGMENTS.has(segment) ? '20' : '40'
  );
  await expect(page.locator('.phone-story')).toHaveAttribute('data-phone-status', 'stable');
  await expect(page.locator('.phone-story')).toHaveAttribute(
    'data-phone-interaction', 'enabled'
  );
  await assertSinglePhoneAuthority(page);
  if (target === 'crane-animation') {
    await assertCompositeTargetContentVisible(page, COMPLETE_STORY_CONTENT[target]);
  } else {
    await assertTargetContentVisible(page, COMPLETE_STORY_CONTENT[target]);
  }
  await assertCompleteStoryFrame(page, target);
  await assertNoWhiteOrTransparentViewportEdges(page);
  return readRuntimeResources(page);
}

async function installLifecycleProbe(
  page: import('@playwright/test').Page
): Promise<void> {
  await page.evaluate(() => {
    type ListenerRecord = Readonly<{
      target: EventTarget;
      type: string;
      listener: EventListenerOrEventListenerObject;
      capture: boolean;
    }>;
    const listeners: ListenerRecord[] = [];
    const originalAdd = EventTarget.prototype.addEventListener;
    const originalRemove = EventTarget.prototype.removeEventListener;
    const captureFor = (options?: boolean | AddEventListenerOptions) => (
      typeof options === 'boolean' ? options : Boolean(options?.capture)
    );
    EventTarget.prototype.addEventListener = function patchedAdd(
      type,
      listener,
      options
    ) {
      if (listener && !(typeof options === 'object' && options.once)) {
        const capture = captureFor(options);
        if (!listeners.some((record) => record.target === this
          && record.type === type && record.listener === listener
          && record.capture === capture)) {
          const record = { target: this, type, listener, capture };
          listeners.push(record);
          if (typeof options === 'object' && options.signal) {
            originalAdd.call(options.signal, 'abort', () => {
              const index = listeners.indexOf(record);
              if (index >= 0) listeners.splice(index, 1);
            }, { once: true });
          }
        }
      }
      return originalAdd.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function patchedRemove(
      type,
      listener,
      options
    ) {
      const capture = captureFor(options);
      const index = listeners.findIndex((record) => record.target === this
        && record.type === type && record.listener === listener
        && record.capture === capture);
      if (index >= 0) listeners.splice(index, 1);
      return originalRemove.call(this, type, listener, options);
    };

    const timeouts = new Set<number>();
    const intervals = new Set<number>();
    const animationFrames = new Set<number>();
    const originalSetTimeout = window.setTimeout.bind(window);
    const originalClearTimeout = window.clearTimeout.bind(window);
    const originalSetInterval = window.setInterval.bind(window);
    const originalClearInterval = window.clearInterval.bind(window);
    const originalRequestFrame = window.requestAnimationFrame.bind(window);
    const originalCancelFrame = window.cancelAnimationFrame.bind(window);
    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      let id = 0;
      id = originalSetTimeout(() => {
        timeouts.delete(id);
        if (typeof handler === 'function') handler(...args);
      }, timeout);
      timeouts.add(id);
      return id;
    }) as typeof window.setTimeout;
    window.clearTimeout = ((id?: number) => {
      if (id !== undefined) timeouts.delete(id);
      originalClearTimeout(id);
    }) as typeof window.clearTimeout;
    window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      const id = originalSetInterval(handler, timeout, ...args);
      intervals.add(id);
      return id;
    }) as typeof window.setInterval;
    window.clearInterval = ((id?: number) => {
      if (id !== undefined) intervals.delete(id);
      originalClearInterval(id);
    }) as typeof window.clearInterval;
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      let id = 0;
      id = originalRequestFrame((time) => {
        animationFrames.delete(id);
        callback(time);
      });
      animationFrames.add(id);
      return id;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = ((id: number) => {
      animationFrames.delete(id);
      originalCancelFrame(id);
    }) as typeof window.cancelAnimationFrame;
    Object.defineProperty(window, '__r5LifecycleProbe', {
      configurable: true,
      value: () => {
        for (let index = listeners.length - 1; index >= 0; index -= 1) {
          const target = listeners[index]?.target;
          if (target instanceof Node && !target.isConnected) listeners.splice(index, 1);
        }
        return {
          listeners: listeners.length,
          timeouts: timeouts.size,
          intervals: intervals.size,
          animationFrames: animationFrames.size
        };
      }
    });
  });
}

async function readLifecycleProbe(
  page: import('@playwright/test').Page
): Promise<LifecycleProbeSample> {
  await nextAnimationFrame(page);
  return page.evaluate(() => (
    window as typeof window & { __r5LifecycleProbe(): LifecycleProbeSample }
  ).__r5LifecycleProbe());
}

async function withholdFigure3Endpoint(
  page: import('@playwright/test').Page,
  endpoint: 'initial' | 'terminal'
): Promise<() => Promise<void>> {
  await page.addInitScript((withheld) => {
    const original = CanvasRenderingContext2D.prototype.drawImage;
    let enabled = false;
    Object.defineProperty(window, '__r5WithholdFigure3Endpoint', {
      configurable: true,
      value: () => { enabled = true; }
    });
    CanvasRenderingContext2D.prototype.drawImage = function patchedDrawImage(
      image: CanvasImageSource,
      ...coordinates: number[]
    ) {
      const isFigure3 = this.canvas.matches('[data-phone-figure3-paper-canvas]');
      if (isFigure3 && enabled) {
        throw new Error(`withheld-${withheld}-figure3-frame`);
      }
      return Reflect.apply(original, this, [image, ...coordinates]);
    };
  }, endpoint);
  return () => page.evaluate(() => (
    window as typeof window & { __r5WithholdFigure3Endpoint(): void }
  ).__r5WithholdFigure3Endpoint());
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
  await page.goto('/#hero', { waitUntil: 'domcontentloaded' });
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

test('formal contract keeps every real viewport edge opaque', async ({ page }) => {
  let releaseVideo = () => undefined;
  const videoGate = new Promise<void>((resolve) => { releaseVideo = resolve; });
  await page.route(/figure1-rgb-alpha.*\.mp4/, async (route) => {
    await videoGate;
    await route.continue();
  });
  await page.goto('/#hero', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-story-loader="true"]')).toBeVisible();
  await assertNoWhiteOrTransparentViewportEdges(page);
  releaseVideo();
});

test('formal contract pixel decoder rejects a one-CSS-pixel edge gap', async ({ page }) => {
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
  await page.goto('/#pattern', { waitUntil: 'domcontentloaded' });
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
  await page.goto('/#star-map', { waitUntil: 'domcontentloaded' });
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
    await page.goto(`/${GRADE_A_HASH[scene]}`, {
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
  await page.goto('/#method-top', {
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
    await page.goto(`/${FIGURE3_SLICE_HASH[scene]}`, {
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
  await page.goto('/#brand', { waitUntil: 'domcontentloaded' });
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
    await page.goto('/#brand', { waitUntil: 'domcontentloaded' });
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
  const releaseManifest = await withholdRecoveryManifest(page);
  let requests = 0;
  let observeRequest = () => undefined;
  const chunkRequested = new Promise<void>((resolve) => { observeRequest = resolve; });
  await page.route(/\/assets\/PhoneFigure3-[^/]+\.js$/, async (route) => {
    requests += 1;
    observeRequest();
    await route.abort('failed');
  });
  try {
    await page.goto('/#brand', { waitUntil: 'domcontentloaded' });
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
  } finally {
    releaseManifest();
  }
});

test('Figure3 slice refuses a withheld terminal compositor frame', async ({ page }) => {
  const withhold = await withholdFigure3Endpoint(page, 'terminal');
  await page.goto('/#brand', { waitUntil: 'domcontentloaded' });
  const before = await waitForCommitSequence(page, 'brand', 0);
  await withhold();
  await sendFrontIntent(page, 'forward');
  await expect(page.locator('[data-phone-figure3-paper-canvas]')).toBeAttached();
  const activation = page.locator('[data-phone-activation]:not([hidden])');
  await expect(activation).toBeVisible();
  await activation.click();
  await expect(activation).toBeVisible();
  await expect(page.locator('.phone-story'))
    .toHaveAttribute('data-phone-phase', 'awaiting-media-activation');
  expect(await readCommitSequence(page)).toBe(before);
  await assertTargetContentVisible(page, FIGURE3_SLICE_CONTENT.brand);
});

test('Figure3 slice refuses a withheld initial compositor frame on reverse', async ({ page }) => {
  const withhold = await withholdFigure3Endpoint(page, 'initial');
  await page.goto('/#services', { waitUntil: 'domcontentloaded' });
  const before = await waitForCommitSequence(page, 'services', 0);
  await withhold();
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
  await page.goto('/#figure3-animation', {
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
  await page.goto('/#figure3-animation', {
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

test('Group 4-5 direct TTG and Lab entries expose their accepted endpoints', async ({ page }) => {
  for (const scene of ['ttg-animation', 'lab'] as const) {
    await page.goto(`/#${scene}`, {
      waitUntil: 'domcontentloaded'
    });
    await waitForCommitSequence(page, scene, 0);
    await assertSinglePhoneAuthority(page);
    await assertTargetContentVisible(page, GROUP45_CONTENT[scene]);
    await assertNoWhiteOrTransparentViewportEdges(page);
    if (scene === 'ttg-animation') {
      await expect(page.locator('[data-ttg-figure-video]'))
        .toHaveAttribute('data-phone-ttg-endpoint-ready', /initial|terminal/);
      await expect(page.locator('.phone-ttg video')).toHaveCount(1);
    }
  }
});

test('Group 4-5 completes two full forward/reverse cycles without resource growth', async ({
  page
}) => {
  await page.goto('/#brand', { waitUntil: 'domcontentloaded' });
  await waitForCommitSequence(page, 'brand', 0);
  const cycle = async () => {
    const samples = [];
    samples.push(await traverseGroup45(page, 'brand', 'figure3-animation', 'forward'));
    samples.push(await traverseGroup45(page, 'figure3-animation', 'services', 'forward'));
    samples.push(await traverseGroup45(page, 'services', 'ttg-animation', 'forward'));
    samples.push(await traverseGroup45(page, 'ttg-animation', 'lab', 'forward'));
    samples.push(await traverseGroup45(page, 'lab', 'ttg-animation', 'reverse'));
    samples.push(await traverseGroup45(page, 'ttg-animation', 'services', 'reverse'));
    samples.push(await traverseGroup45(page, 'services', 'figure3-animation', 'reverse'));
    samples.push(await traverseGroup45(page, 'figure3-animation', 'brand', 'reverse'));
    return samples;
  };
  const first = await cycle();
  const second = await cycle();
  expect(second).toEqual(first);
  for (const sample of second) {
    expect(sample.videos).toBeLessThanOrEqual(1);
    expect(sample.canvases).toBeLessThanOrEqual(2);
  }
});

test('Group 4-5 keeps Services proved while the TTG leaf chunk is delayed', async ({ page }) => {
  let releaseChunk = () => undefined;
  let observeRequest = () => undefined;
  const gate = new Promise<void>((resolve) => { releaseChunk = resolve; });
  const requested = new Promise<void>((resolve) => { observeRequest = resolve; });
  await page.route(/\/assets\/PhoneTtg-[^/]+\.js$/, async (route) => {
    observeRequest();
    await gate;
    await route.continue();
  });
  try {
    await page.goto('/#services', { waitUntil: 'domcontentloaded' });
    const before = await waitForCommitSequence(page, 'services', 0);
    await sendFrontIntent(page, 'forward');
    await requested;
    await expect(page.locator('.phone-story')).toHaveAttribute('data-phone-status', 'transaction');
    expect(await readCommitSequence(page)).toBe(before);
    await assertTargetContentVisible(page, GROUP45_CONTENT.services);
    releaseChunk();
    await completeGroup45Attempt(page, 'services', 'ttg-animation', 'forward', before);
  } finally {
    releaseChunk();
  }
});

test('Group 4-5 caches a rejected TTG chunk without same-Document retry', async ({ page }) => {
  const releaseManifest = await withholdRecoveryManifest(page);
  let requests = 0;
  let observeRequest = () => undefined;
  const requested = new Promise<void>((resolve) => { observeRequest = resolve; });
  await page.route(/\/assets\/PhoneTtg-[^/]+\.js$/, async (route) => {
    requests += 1;
    observeRequest();
    await route.abort('failed');
  });
  try {
    await page.goto('/#services', { waitUntil: 'domcontentloaded' });
    const before = await waitForCommitSequence(page, 'services', 0);
    await sendFrontIntent(page, 'forward');
    await requested;
    await expectGroup45Rollback(page, 'services', 'ttg-animation', 'forward', before);
    await assertTargetContentVisible(page, GROUP45_CONTENT.services);
    expect(requests).toBe(1);
    await sendFrontIntent(page, 'forward');
    await page.waitForTimeout(750);
    expect(requests).toBe(1);
    expect(await readCommitSequence(page)).toBe(before);
  } finally {
    releaseManifest();
  }
});

test('Group 4-5 refuses to expose TTG while its decoded frame is withheld', async ({ page }) => {
  let releaseMedia = () => undefined;
  const gate = new Promise<void>((resolve) => { releaseMedia = resolve; });
  await page.route(/ttg-figure-motion.*\.(?:webm|mp4)$/, async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto('/#services', { waitUntil: 'domcontentloaded' });
    const before = await waitForCommitSequence(page, 'services', 0);
    await sendFrontIntent(page, 'forward');
    await expect(page.locator('[data-ttg-figure-video]')).toBeAttached();
    await expectGroup45Rollback(page, 'services', 'ttg-animation', 'forward', before);
    await assertTargetContentVisible(page, GROUP45_CONTENT.services);
  } finally {
    releaseMedia();
  }
});

test('Group 4-5 restores proved TTG after visibility and BFCache lifecycle events', async ({
  page
}) => {
  await page.addInitScript(() => {
    const visibility = { current: 'visible' as DocumentVisibilityState };
    Object.defineProperty(document, 'visibilityState', {
      configurable: true, get: () => visibility.current
    });
    Object.defineProperty(window, '__r5SetVisibility', {
      configurable: true,
      value: (next: DocumentVisibilityState) => {
        visibility.current = next;
        document.dispatchEvent(new Event('visibilitychange'));
      }
    });
  });
  await page.goto('/#ttg-animation', { waitUntil: 'domcontentloaded' });
  const before = await waitForCommitSequence(page, 'ttg-animation', 0);
  await sendFrontIntent(page, 'forward');
  await expect(page.locator('[data-phone-transition="ttg-lab"]')).toBeAttached();
  await page.evaluate(() => {
    const api = window as typeof window & {
      __r5SetVisibility(next: DocumentVisibilityState): void;
    };
    api.__r5SetVisibility('hidden');
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    api.__r5SetVisibility('visible');
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const state = await page.waitForFunction(({ sequence }) => {
      const shell = document.querySelector<HTMLElement>('.phone-story');
      if (shell?.dataset.phoneStatus === 'stable'
        && shell.dataset.phoneScene === 'ttg-animation'
        && Number(shell.dataset.phoneCommitSequence) === sequence) return 'stable';
      if (document.querySelector('[data-phone-activation]:not([hidden])')) return 'activation';
      return null;
    }, { sequence: before }, { timeout: 15_000 });
    if (await state.jsonValue() === 'stable') break;
    await page.locator('[data-phone-activation]:not([hidden])').click();
  }
  await expect(page.locator('[data-ttg-figure-video]'))
    .toHaveAttribute('data-phone-ttg-endpoint-ready', /initial|terminal/);
  await traverseGroup45(page, 'ttg-animation', 'lab', 'forward');
  await traverseGroup45(page, 'lab', 'ttg-animation', 'reverse');
});

test('PH slice direct PH and Education entries expose accepted endpoints', async ({ page }) => {
  for (const scene of ['ph-animation', 'education'] as const) {
    await page.goto(`/#${scene}`, {
      waitUntil: 'domcontentloaded'
    });
    await waitForCommitSequence(page, scene, 0);
    await assertSinglePhoneAuthority(page);
    await assertTargetContentVisible(page, PH_SLICE_CONTENT[scene]);
    await assertNoWhiteOrTransparentViewportEdges(page);
    if (scene === 'ph-animation') {
      await expect(page.locator('[data-phone-packed-alpha-canvas="ph-figure"]'))
        .toHaveAttribute('data-packed-alpha-frame-ready', 'true');
      await expect(page.locator('.phone-ph video')).toHaveCount(1);
      await expect(page.locator('.phone-ph canvas')).toHaveCount(1);
    }
  }
});

test('PH slice completes Lab → PH → Education forward/reverse twice without growth', async ({
  page
}) => {
  await page.goto('/#lab', { waitUntil: 'domcontentloaded' });
  await waitForCommitSequence(page, 'lab', 0);
  const cycle = async () => [
    await traversePhSlice(page, 'lab', 'ph-animation', 'forward'),
    await traversePhSlice(page, 'ph-animation', 'education', 'forward'),
    await traversePhSlice(page, 'education', 'ph-animation', 'reverse'),
    await traversePhSlice(page, 'ph-animation', 'lab', 'reverse')
  ];
  const first = await cycle();
  const second = await cycle();
  expect(second).toEqual(first);
  for (const sample of second) {
    expect(sample.videos).toBeLessThanOrEqual(1);
    expect(sample.canvases).toBeLessThanOrEqual(2);
  }
});

test('PH slice keeps Lab proved while the PH leaf chunk is delayed', async ({ page }) => {
  let releaseChunk = () => undefined;
  let observeRequest = () => undefined;
  const gate = new Promise<void>((resolve) => { releaseChunk = resolve; });
  const requested = new Promise<void>((resolve) => { observeRequest = resolve; });
  await page.route(/\/assets\/PhonePh-[^/]+\.js$/, async (route) => {
    observeRequest();
    await gate;
    await route.continue();
  });
  try {
    await page.goto('/#lab', { waitUntil: 'domcontentloaded' });
    const before = await waitForCommitSequence(page, 'lab', 0);
    await sendFrontIntent(page, 'forward');
    await requested;
    expect(await readCommitSequence(page)).toBe(before);
    await assertTargetContentVisible(page, PH_SLICE_CONTENT.lab);
    releaseChunk();
    await completePhSliceAttempt(page, 'lab', 'ph-animation', 'forward', before);
  } finally {
    releaseChunk();
  }
});

test('PH slice refuses a withheld packed draw and keeps Lab stable', async ({ page }) => {
  let releaseMedia = () => undefined;
  const gate = new Promise<void>((resolve) => { releaseMedia = resolve; });
  await page.route(/ph-figure-motion-rgb-alpha.*\.mp4$/, async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto('/#lab', { waitUntil: 'domcontentloaded' });
    const before = await waitForCommitSequence(page, 'lab', 0);
    await sendFrontIntent(page, 'forward');
    await expect(page.locator('[data-phone-packed-alpha-canvas="ph-figure"]'))
      .toBeAttached();
    await expectPhSliceRollback(page, 'lab', 'ph-animation', before);
    await assertTargetContentVisible(page, PH_SLICE_CONTENT.lab);
  } finally {
    releaseMedia();
  }
});

test('PH slice context loss cannot commit a false PH frame', async ({ page }) => {
  let releaseMedia = () => undefined;
  const gate = new Promise<void>((resolve) => { releaseMedia = resolve; });
  await page.route(/ph-figure-motion-rgb-alpha.*\.mp4$/, async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto('/#lab', { waitUntil: 'domcontentloaded' });
    const before = await waitForCommitSequence(page, 'lab', 0);
    await sendFrontIntent(page, 'forward');
    const canvas = page.locator('[data-phone-packed-alpha-canvas="ph-figure"]');
    await expect(canvas).toBeAttached();
    await canvas.dispatchEvent('webglcontextlost', { cancelable: true });
    await expectPhSliceRollback(page, 'lab', 'ph-animation', before);
  } finally {
    releaseMedia();
  }
});

test('PH slice re-proves its retained compositor after visibility and BFCache events', async ({
  page
}) => {
  await page.addInitScript(() => {
    const visibility = { current: 'visible' as DocumentVisibilityState };
    Object.defineProperty(document, 'visibilityState', {
      configurable: true, get: () => visibility.current
    });
    Object.defineProperty(window, '__r5SetVisibility', {
      configurable: true,
      value: (next: DocumentVisibilityState) => {
        visibility.current = next;
        document.dispatchEvent(new Event('visibilitychange'));
      }
    });
  });
  await page.goto('/#ph-animation', { waitUntil: 'domcontentloaded' });
  await waitForCommitSequence(page, 'ph-animation', 0);
  const beforePlaneRevision = Number(await page.locator('.phone-story')
    .getAttribute('data-phone-plane-revision'));
  await page.evaluate(() => {
    const api = window as typeof window & {
      __r5SetVisibility(next: DocumentVisibilityState): void;
    };
    api.__r5SetVisibility('hidden');
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    api.__r5SetVisibility('visible');
  });
  await page.waitForFunction((before) => {
    const shell = document.querySelector<HTMLElement>('.phone-story');
    return shell?.dataset.phoneStatus === 'stable'
      && shell.dataset.phoneScene === 'ph-animation'
      && Number(shell.dataset.phonePlaneRevision) > before;
  }, beforePlaneRevision, { timeout: 15_000 });
  await expect(page.locator('[data-phone-packed-alpha-canvas="ph-figure"]'))
    .toHaveAttribute('data-packed-alpha-frame-ready', 'true');
  await traversePhSlice(page, 'ph-animation', 'education', 'forward');
  await traversePhSlice(page, 'education', 'ph-animation', 'reverse');
});

test('Crane slice direct entry proves both authored packed surfaces', async ({ page }) => {
  await page.goto('/#crane-animation', {
    waitUntil: 'domcontentloaded'
  });
  await waitForCommitSequence(page, 'crane-animation', 0);
  await assertSinglePhoneAuthority(page);
  await assertCompositeTargetContentVisible(
    page, CRANE_SLICE_CONTENT['crane-animation']
  );
  await assertNoWhiteOrTransparentViewportEdges(page);
  await expect(page.locator('.phone-crane video')).toHaveCount(2);
  await expect(page.locator('.phone-crane canvas')).toHaveCount(2);
  for (const layer of ['crane-figure', 'crane-flock']) {
    await expect(page.locator(`[data-phone-packed-alpha-canvas="${layer}"]`))
      .toHaveAttribute('data-packed-alpha-frame-ready', 'true');
  }
});

test('Crane slice completes Education ↔ Crane twice without resource growth', async ({
  page
}) => {
  await page.goto('/#education', { waitUntil: 'domcontentloaded' });
  await waitForCommitSequence(page, 'education', 0);
  const cycle = async () => [
    await traverseCraneSlice(page, 'education', 'crane-animation', 'forward'),
    await traverseCraneSlice(page, 'crane-animation', 'education', 'reverse')
  ];
  const first = await cycle();
  const second = await cycle();
  expect(second).toEqual(first);
  for (const sample of second) {
    expect(sample.videos).toBeLessThanOrEqual(2);
    expect(sample.canvases).toBeLessThanOrEqual(3);
  }
});

test('Crane slice retries both decoder activations only after a real gesture', async ({ page }) => {
  await page.addInitScript(() => {
    const originalPlay = HTMLMediaElement.prototype.play;
    let rejected = false;
    HTMLMediaElement.prototype.play = function patchedPlay() {
      if (!rejected && this.matches('[data-crane-figure-front-video]')) {
        rejected = true;
        return Promise.reject(new DOMException('gesture required', 'NotAllowedError'));
      }
      return originalPlay.call(this);
    };
  });
  await page.goto('/#crane-animation', {
    waitUntil: 'domcontentloaded'
  });
  await expect(page.locator('[data-phone-activation]')).toBeVisible();
  expect(await readCommitSequence(page)).toBe(0);
  await page.locator('[data-phone-activation]').click();
  await waitForCommitSequence(page, 'crane-animation', 0);
  for (const layer of ['crane-figure', 'crane-flock']) {
    await expect(page.locator(`[data-phone-packed-alpha-canvas="${layer}"]`))
      .toHaveAttribute('data-packed-alpha-frame-ready', 'true');
  }
});

test('Crane slice keeps Education proved while the Crane chunk is delayed', async ({ page }) => {
  let releaseChunk = () => undefined;
  let observeRequest = () => undefined;
  const gate = new Promise<void>((resolve) => { releaseChunk = resolve; });
  const requested = new Promise<void>((resolve) => { observeRequest = resolve; });
  await page.route(/\/assets\/PhoneCrane-[^/]+\.js$/, async (route) => {
    observeRequest();
    await gate;
    await route.continue();
  });
  try {
    await page.goto('/#education', { waitUntil: 'domcontentloaded' });
    const before = await waitForCommitSequence(page, 'education', 0);
    await sendFrontIntent(page, 'forward');
    await requested;
    expect(await readCommitSequence(page)).toBe(before);
    await assertTargetContentVisible(page, CRANE_SLICE_CONTENT.education);
    releaseChunk();
    await completeCraneSliceAttempt(
      page, 'education', 'crane-animation', 'forward', before
    );
  } finally {
    releaseChunk();
  }
});

test('Crane slice caches a rejected Crane chunk without same-Document retry', async ({ page }) => {
  const releaseManifest = await withholdRecoveryManifest(page);
  let requests = 0;
  let observeRequest = () => undefined;
  const requested = new Promise<void>((resolve) => { observeRequest = resolve; });
  await page.route(/\/assets\/PhoneCrane-[^/]+\.js$/, async (route) => {
    requests += 1;
    observeRequest();
    await route.abort('failed');
  });
  try {
    await page.goto('/#education', { waitUntil: 'domcontentloaded' });
    const before = await waitForCommitSequence(page, 'education', 0);
    await sendFrontIntent(page, 'forward');
    await requested;
    await expectCraneSliceRollback(page, 'education', 'crane-animation', before);
    await assertTargetContentVisible(page, CRANE_SLICE_CONTENT.education);
    expect(requests).toBe(1);
    await sendFrontIntent(page, 'forward');
    await page.waitForTimeout(750);
    expect(requests).toBe(1);
    expect(await readCommitSequence(page)).toBe(before);
  } finally {
    releaseManifest();
  }
});

test('Crane slice refuses one withheld packed frame and keeps Education stable', async ({
  page
}) => {
  let releaseMedia = () => undefined;
  const gate = new Promise<void>((resolve) => { releaseMedia = resolve; });
  await page.route(/crane-flock-motion-rgb-alpha.*\.mp4$/, async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto('/#education', { waitUntil: 'domcontentloaded' });
    const before = await waitForCommitSequence(page, 'education', 0);
    await sendFrontIntent(page, 'forward');
    await expect(page.locator('[data-phone-packed-alpha-canvas="crane-flock"]'))
      .toBeAttached();
    await expectCraneSliceRollback(page, 'education', 'crane-animation', before);
    await assertTargetContentVisible(page, CRANE_SLICE_CONTENT.education);
  } finally {
    releaseMedia();
  }
});

test('Crane slice context loss cannot commit a partial two-surface proof', async ({ page }) => {
  let releaseMedia = () => undefined;
  const gate = new Promise<void>((resolve) => { releaseMedia = resolve; });
  await page.route(/crane-(?:figure|flock)-motion-rgb-alpha.*\.mp4$/, async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto('/#education', { waitUntil: 'domcontentloaded' });
    const before = await waitForCommitSequence(page, 'education', 0);
    await sendFrontIntent(page, 'forward');
    const canvas = page.locator('[data-phone-packed-alpha-canvas="crane-figure"]');
    await expect(canvas).toBeAttached();
    await canvas.dispatchEvent('webglcontextlost', { cancelable: true });
    await expectCraneSliceRollback(page, 'education', 'crane-animation', before);
  } finally {
    releaseMedia();
  }
});

test('Crane slice re-proves both surfaces across visibility, BFCache, and orientation', async ({
  page
}) => {
  await page.addInitScript(() => {
    const visibility = { current: 'visible' as DocumentVisibilityState };
    Object.defineProperty(document, 'visibilityState', {
      configurable: true, get: () => visibility.current
    });
    Object.defineProperty(window, '__r5SetVisibility', {
      configurable: true,
      value: (next: DocumentVisibilityState) => {
        visibility.current = next;
        document.dispatchEvent(new Event('visibilitychange'));
      }
    });
  });
  await page.goto('/#crane-animation', { waitUntil: 'domcontentloaded' });
  await waitForCommitSequence(page, 'crane-animation', 0);
  const beforePlaneRevision = Number(await page.locator('.phone-story')
    .getAttribute('data-phone-plane-revision'));
  await page.evaluate(() => {
    const api = window as typeof window & {
      __r5SetVisibility(next: DocumentVisibilityState): void;
    };
    api.__r5SetVisibility('hidden');
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    window.dispatchEvent(new Event('orientationchange'));
    window.dispatchEvent(new Event('resize'));
    api.__r5SetVisibility('visible');
  });
  try {
    await page.waitForFunction((before) => {
      const shell = document.querySelector<HTMLElement>('.phone-story');
      return shell?.dataset.phoneStatus === 'stable'
        && shell.dataset.phoneScene === 'crane-animation'
        && Number(shell.dataset.phonePlaneRevision) > before;
    }, beforePlaneRevision, { timeout: 15_000 });
  } catch (error) {
    const state = await page.locator('.phone-story').evaluate((shell) => ({
      shell: { ...(shell as HTMLElement).dataset },
      layers: [...document.querySelectorAll<HTMLElement>(
        '[data-phone-packed-alpha-canvas^="crane-"]'
      )].map((layer) => ({ dataset: { ...layer.dataset }, style: getComputedStyle(layer).cssText }))
    }));
    throw new Error(`Crane reproof did not settle: ${JSON.stringify(state)}`, { cause: error });
  }
  for (const layer of ['crane-figure', 'crane-flock']) {
    await expect(page.locator(`[data-phone-packed-alpha-canvas="${layer}"]`))
      .toHaveAttribute('data-packed-alpha-frame-ready', 'true');
  }
  await traverseCraneSlice(page, 'crane-animation', 'education', 'reverse');
  await traverseCraneSlice(page, 'education', 'crane-animation', 'forward');
});

test('Group 6-7 direct Contact is minimal, post-paint visible, and natively interactive', async ({
  page
}) => {
  await page.goto('/#contact', {
    waitUntil: 'domcontentloaded'
  });
  await waitForCommitSequence(page, 'contact', 0);
  await assertSinglePhoneAuthority(page);
  await assertTargetContentVisible(page, COMPLETE_STORY_CONTENT.contact);
  await assertNoWhiteOrTransparentViewportEdges(page);
  await expect(page.locator('[data-phone-reading="contact"]')).toBeVisible();
  await expect(page.locator('.phone-story__reading-flow')).not.toHaveAttribute('inert', '');
  const mail = page.locator('[data-phone-reading="contact"] a[href^="mailto:"]');
  const top = page.locator('[data-phone-reading="contact"] a[href="#top"]');
  await expect(mail).toBeVisible();
  await mail.focus();
  await expect(mail).toBeFocused();
  await top.focus();
  await expect(top).toBeFocused();
  const nativeCopy = page.locator('[data-phone-reading="contact"] p').first();
  expect(await nativeCopy.evaluate((element) => element.dispatchEvent(new WheelEvent(
    'wheel', { bubbles: true, cancelable: true, deltaY: 120 }
  )))).toBe(true);
  expect(await nativeCopy.evaluate((element) => element.dispatchEvent(new KeyboardEvent(
    'keydown', { bubbles: true, cancelable: true, key: 'ArrowUp' }
  )))).toBe(true);
  expect(await top.evaluate((element) => element.dispatchEvent(new WheelEvent(
    'wheel', { bubbles: true, cancelable: true, deltaY: 120 }
  )))).toBe(true);
  await expect(page.locator(
    '.phone-story__planes video, .phone-story__planes canvas'
  )).toHaveCount(0);
  expect(await readRuntimeResources(page)).toEqual({
    videos: 0, decoders: 0, canvases: 0, webgl: 0
  });
  const chunks = await page.evaluate(() => performance.getEntriesByType('resource')
    .map(({ name }) => name).filter((name) => /\/assets\/[^/]+\.js(?:$|\?)/.test(name)));
  expect(chunks.some((name) => /\/PhoneContact-[^/]+\.js/.test(name))).toBe(true);
  expect(chunks.some((name) => /\/(?:PhoneCrane|crane-contact)-[^/]+\.js/.test(name)))
    .toBe(false);
});

test('Group 6-7 Crane ↔ Contact commits twice with native input release and no growth', async ({
  page
}) => {
  await page.goto('/#crane-animation', {
    waitUntil: 'domcontentloaded'
  });
  await waitForCommitSequence(page, 'crane-animation', 0);
  const cycle = async () => {
    const contact = await traverseCompleteStoryLeg(
      page, 'crane-animation', 'contact', 'forward'
    );
    await expect(page.locator('[data-phone-reading="contact"] a[href^="mailto:"]'))
      .toBeVisible();
    const crane = await traverseCompleteStoryLeg(
      page, 'contact', 'crane-animation', 'reverse'
    );
    return [contact, crane] as const;
  };
  const first = await cycle();
  const second = await cycle();
  expect(second).toEqual(first);
});

test('complete story proves all 60 segment traversals through one authority without growth', async ({
  page
}) => {
  test.setTimeout(480_000);
  await page.goto('/#hero', { waitUntil: 'domcontentloaded' });
  const bootHandle = await page.waitForFunction(() => {
    const shell = document.querySelector<HTMLElement>('.phone-story');
    const state = {
      status: shell?.dataset.phoneStatus,
      scene: shell?.dataset.phoneScene,
      sequence: Number(shell?.dataset.phoneCommitSequence),
      failure: shell?.dataset.phoneFailure,
      message: shell?.dataset.phoneFailureMessage
    };
    return state.status === 'faulted'
      || state.status === 'stable' && state.scene === 'hero' && state.sequence > 0
      ? state : null;
  }, null, { timeout: 30_000 });
  const boot = await bootHandle.jsonValue();
  if (boot.status === 'faulted') {
    throw new Error(`Complete-story boot faulted: ${JSON.stringify(boot)}`);
  }
  const initialSequence = boot.sequence;
  await installLifecycleProbe(page);
  const authority = await page.locator('.phone-story').getAttribute('data-phone-authority');

  const cycle = async () => {
    const samples: RuntimeResourceSample[] = [];
    for (let index = 0; index < COMPLETE_STORY_SCENES.length - 1; index += 1) {
      samples.push(await traverseCompleteStoryLeg(
        page,
        COMPLETE_STORY_SCENES[index]!,
        COMPLETE_STORY_SCENES[index + 1]!,
        'forward'
      ));
    }
    for (let index = COMPLETE_STORY_SCENES.length - 1; index > 0; index -= 1) {
      samples.push(await traverseCompleteStoryLeg(
        page,
        COMPLETE_STORY_SCENES[index]!,
        COMPLETE_STORY_SCENES[index - 1]!,
        'reverse'
      ));
    }
    return {
      samples,
      boundaryResources: await readRuntimeResources(page),
      boundaryLifecycle: await readLifecycleProbe(page)
    };
  };

  const first = await cycle();
  const second = await cycle();
  expect(second.samples).toEqual(first.samples);
  expect(second.boundaryResources).toEqual(first.boundaryResources);
  expect(second.boundaryLifecycle).toEqual(first.boundaryLifecycle);
  expect(await readCommitSequence(page)).toBe(initialSequence + 60);
  expect(await page.locator('.phone-story').getAttribute('data-phone-authority'))
    .toBe(authority);
});

test('Front first three segments preserve effect semantics and endpoints both ways', async ({ page }) => {
  await page.goto('/#hero', { waitUntil: 'domcontentloaded' });
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
  await page.goto('/#hero', { waitUntil: 'domcontentloaded' });
  await waitForCommitSequence(page, 'hero', 0);
  await traverseFront(page, 'hero', 'pattern', 'forward');
  await expect(page.locator('.portrait-scroll-spike__pattern-copy')).toHaveCSS('opacity', '1');
});

test('Front Ink failure rolls back to the fully proved source without committing target', async ({ page }) => {
  await page.goto('/#hero', { waitUntil: 'domcontentloaded' });
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

test('formal contract edge decoder permits distinct visible scene content', async ({ page }) => {
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

test('formal contract helpers inspect rendered layers, content, frames, and commits', async ({
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
