import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';
import {
  assertCompositeTargetContentVisible,
  assertInkIntermediateCompositeContribution,
  assertSinglePhoneAuthority,
  assertLayerOrderAtPoints,
  assertNoWhiteOrTransparentViewportEdges,
  assertNoIntermediateWhiteOrBlackFrame,
  assertOpaqueViewportEdges,
  assertTargetContentVisible,
  recordPhoneStoryFrames,
  startFigure3MediaDiagnostic,
  readPhoneStoryDiagnostic,
  readCommitSequence,
  type PhoneStoryFrameSample,
  waitForCommitSequence,
  waitForDirectEntryCommit
} from './r5-phone-clean-assertions';

// Browser acceptance uses keyboard/pointer input; it is not physical iOS touch
// acceptance. Native Simulator/physical-device evidence is recorded separately.
// Motion-dependent acceptance always runs against the explicit normal platform
// preference. Reduced motion has its own static-endpoint contract below.
test.use({ reducedMotion: 'no-preference' });

type ReleaseViteManifest = Readonly<Record<string, Readonly<{ file?: string }>>>;

function releaseAssetPattern(source: string): RegExp {
  const manifest = JSON.parse(readFileSync(
    new URL('../../dist/.vite/manifest.json', import.meta.url), 'utf8'
  )) as ReleaseViteManifest;
  const file = manifest[source]?.file?.replace(/^assets\//, '');
  if (!file) throw new Error(`Missing release asset for ${source}`);
  const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`/assets/${escaped}(?:\\?.*)?$`);
}

const FRONT_CONTENT = {
  hero: ['#portrait-spike-home'],
  pattern: ['[data-portrait-pattern-bloom]'],
  'star-map': ['#portrait-spike-star-title'],
  'aod-animation': ['[data-phone-aod-figure-poster]']
} as const;

const GRADE_A_CONTENT = {
  'method-top': ['#method #portrait-spike-method-title'],
  'figure2-animation': [
    '[data-r4-scene="figure2-animation"] [data-phone-figure2-poster]'
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
    '[data-phone-scene="figure3-animation"] [data-phone-figure3-initial-composite]'
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
    '[data-phone-scene="figure3-animation"] [data-phone-figure3-initial-composite]'
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

const EDUCATION_OPENING_CONTENT = [
  '[data-phone-reading="education"] [data-r4-scene="education"] .r4-education__wide h2',
  '[data-phone-reading="education"] .r4-education__signals span:first-child'
] as const;
const EDUCATION_CLOSING_CONTENT = [
  '[data-phone-reading="education"]',
  '[data-phone-reading="education"] .r4-education__row:last-child'
] as const;
const EDUCATION_FIXED_CLOSING_CONTENT = [
  '[data-phone-plane="source"] #education',
  '[data-phone-plane="source"] #education .r4-education__row:last-child'
] as const;

const PH_SLICE_CONTENT = {
  lab: ['#phone-lab-title', '.phone-lab__hero > p:not(.phone-lab__eyebrow)'],
  'ph-animation': [
    '[data-r4-scene="ph-animation"] [data-phone-packed-alpha-canvas="ph-figure"]'
  ],
  education: EDUCATION_OPENING_CONTENT
} as const;

const PH_SLICE_SEGMENT = {
  'lab:ph-animation': 'lab-ph',
  'ph-animation:education': 'ph-education',
  'education:ph-animation': 'ph-education',
  'ph-animation:lab': 'lab-ph'
} as const;

type PhSliceScene = keyof typeof PH_SLICE_CONTENT;

const CRANE_SLICE_CONTENT = {
  education: EDUCATION_CLOSING_CONTENT,
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
const COMPLETE_STORY_NATIVE_SCENES = new Set<CompleteStoryScene>([
  'method-top', 'figure2-proof', 'brand', 'services', 'lab', 'education', 'contact'
]);

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

function completeStoryContentAtLanding(
  scene: CompleteStoryScene,
  direction: 'forward' | 'reverse'
): readonly string[] {
  if (direction === 'reverse' && scene === 'figure2-proof') {
    return ['[data-r4-proof-panel="closing"]'];
  }
  if (direction === 'reverse' && scene === 'method-top') {
    return [
      '.phone-story__reading-flow [data-phone-reading="method-top"] '
        + '.portrait-scroll-spike__steps li:last-child h3'
    ];
  }
  if (direction === 'reverse' && scene === 'brand') {
    return [
      '.phone-story__reading-flow [data-phone-reading="brand"] '
        + '.phone-brand__definition:last-child h2'
    ];
  }
  if (direction === 'reverse' && scene === 'services') {
    return ['.phone-story__reading-flow [data-phone-reading="services"] .phone-services__row:last-child'];
  }
  if (direction === 'reverse' && scene === 'lab') {
    return ['.phone-story__reading-flow [data-phone-reading="lab"] .phone-lab__row:last-child'];
  }
  if (direction === 'reverse' && scene === 'education') {
    return EDUCATION_CLOSING_CONTENT;
  }
  if (scene === 'education') {
    return EDUCATION_OPENING_CONTENT;
  }
  return COMPLETE_STORY_CONTENT[scene];
}

const BETWEEN_PLANE_SEGMENTS = new Set<CompleteStorySegment>([
  'aod-method-top', 'brand-figure3', 'figure3-services', 'ttg-lab', 'ph-education',
  'crane-contact'
]);

const FORMAL_INK_SEGMENTS = new Set<CompleteStorySegment>([
  'hero-pattern', 'pattern-star-map', 'star-map-aod', 'method-bottom-figure2',
  'figure2-distance-expand', 'figure2-proof-brand', 'brand-figure3', 'services-ttg',
  'lab-ph', 'education-crane'
]);

type SliceResourceSample = Readonly<{
  videos: number;
  decodedVideos: number;
  canvases: number;
  activeDecoders: number;
  owners: readonly string[];
}>;
type StableResourceIdentity = Omit<SliceResourceSample, 'decodedVideos'>;

function stableResourceIdentity(sample: SliceResourceSample): StableResourceIdentity {
  return {
    videos: sample.videos, canvases: sample.canvases,
    activeDecoders: sample.activeDecoders, owners: sample.owners
  };
}

type LifecycleProbeSample = Readonly<{
  listeners: number;
  timeouts: number;
  intervals: number;
  animationFrames: number;
}>;

async function nextAnimationFrame(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
}

async function expectLeafFallbacksVisuallyHidden(
  page: import('@playwright/test').Page
): Promise<void> {
  const covers = page.locator('[data-phone-leaf-cover]');
  expect(await covers.evaluateAll((nodes) => nodes.every((node) => {
    const style = getComputedStyle(node);
    return style.position === 'absolute'
      && style.width === '1px' && style.height === '1px'
      && style.overflow === 'hidden';
  }))).toBe(true);
}

async function scrollNativeReadingToBottom(
  page: import('@playwright/test').Page
): Promise<number> {
  const maximum = await page.evaluate(() => {
    const owner = document.scrollingElement ?? document.documentElement;
    const bottom = Math.max(0, owner.scrollHeight - owner.clientHeight);
    owner.scrollTop = bottom;
    document.documentElement.scrollTop = bottom;
    document.body.scrollTop = bottom;
    return bottom;
  });
  await expect.poll(() => page.evaluate(() => {
    const owner = document.scrollingElement ?? document.documentElement;
    const bottom = Math.max(0, owner.scrollHeight - owner.clientHeight);
    return Math.abs(owner.scrollTop - bottom);
  })).toBeLessThanOrEqual(1);
  return maximum;
}

function mediaTrace(
  samples: readonly PhoneStoryFrameSample[],
  surfaceId: string,
  predicate: (sample: PhoneStoryFrameSample) => boolean
) {
  return samples.flatMap((sample) => {
    if (!predicate(sample)) return [];
    const media = sample.media.find((entry) => entry.surfaceId === surfaceId);
    return media ? [{ time: sample.time, ...media }] : [];
  });
}

function canvasMediaTrace(
  samples: readonly PhoneStoryFrameSample[],
  surfaceId: string,
  predicate: (sample: PhoneStoryFrameSample) => boolean
) {
  return samples.flatMap((sample) => {
    if (!predicate(sample)) return [];
    const canvas = sample.canvases.find((entry) => entry.surfaceId === surfaceId);
    return canvas?.mediaTime === null || canvas?.mediaTime === undefined
      ? [] : [{ time: sample.time, mediaTime: canvas.mediaTime }];
  });
}

function expectComplementaryFigure2ProofDepth(
  samples: readonly PhoneStoryFrameSample[],
  direction: 'forward' | 'reverse'
): void {
  const frames = samples.filter(({ shell, transitionLive, effectProgress }) => (
    shell?.phoneStatus === 'transaction'
    && (direction === 'forward'
      ? shell.phoneSourceScene === 'figure2-animation'
        && shell.phoneCandidateScene === 'figure2-proof'
      : shell.phoneSourceScene === 'figure2-proof'
        && shell.phoneCandidateScene === 'figure2-animation')
    && transitionLive
    && effectProgress !== null && effectProgress > .08 && effectProgress < .92
  ));
  expect(frames.length, `Figure2 ${direction} depth-mask frames`).toBeGreaterThan(2);
  for (const sample of frames) {
    const source = sample.planes.find(({ role }) => role === 'source');
    const receiver = sample.planes.find(({ role }) => role === 'receiver');
    const conceal = sample.figure2Surface;
    const reveal = sample.proofSurface;
    const atlasMask = conceal?.maskImage ?? '';
    const maskSize = conceal?.maskSize ?? '';
    const pixelMaskSize = /^\d+(?:\.\d+)?px\s+\d+(?:\.\d+)?px$/;
    expect(sample.figure2Surface?.role).toBe(direction === 'forward' ? 'source' : 'receiver');
    expect(conceal?.maskImage).toMatch(/figure2-depth-mask-atlas[^#]*\.webp/);
    expect(conceal?.maskImage).not.toContain('#');
    expect(reveal?.maskImage).toBe(atlasMask);
    expect(maskSize).toMatch(pixelMaskSize);
    expect(reveal?.maskSize).toBe(maskSize);
    expect(conceal?.maskPosition).toBeTruthy();
    expect(reveal?.maskPosition).toBeTruthy();
    expect(conceal?.maskPosition).not.toBe(reveal?.maskPosition);
    expect(conceal?.maskPolarity).toBe('conceal');
    expect(reveal?.maskPolarity).toBe('reveal');
    expect(conceal?.maskPolarity).not.toBe(reveal?.maskPolarity);
    expect(conceal?.maskRun).toBeTruthy();
    expect(reveal?.maskRun).toBe(conceal?.maskRun);
    expect(reveal?.maskProgress).toBe(conceal?.maskProgress);
    for (const plane of [source, receiver]) {
      expect(plane?.maskImage).toBe(atlasMask);
      expect(plane?.maskSize).toBe(maskSize);
      expect(plane?.maskRepeat).toBe('no-repeat');
      expect(plane?.maskMode).toBe('alpha');
    }
    expect(source?.rect).toEqual(receiver?.rect);
  }
}

async function expectFigure2ConcealPixels(
  page: import('@playwright/test').Page
): Promise<void> {
  await page.waitForFunction(() => {
    const root = document.querySelector<HTMLElement>(
      '[data-phone-plane][data-r4-depth-mask-polarity="conceal"]'
    );
    const progress = Number(root?.dataset.r4DepthMaskProgress);
    return Number.isFinite(progress) && progress > .25 && progress < .75;
  }, undefined, { timeout: 15_000 });
  await page.evaluate(() => {
    const owner = window as typeof window & {
      __r5DepthMaskFreeze?: {
        request: typeof requestAnimationFrame;
        cancel: typeof cancelAnimationFrame;
        queued: Map<number, FrameRequestCallback>;
        nextId: number;
      };
    };
    const request = window.requestAnimationFrame.bind(window);
    const cancel = window.cancelAnimationFrame.bind(window);
    const queued = new Map<number, FrameRequestCallback>();
    owner.__r5DepthMaskFreeze = { request, cancel, queued, nextId: -1 };
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      const id = owner.__r5DepthMaskFreeze!.nextId--;
      queued.set(id, callback);
      return id;
    }) as typeof requestAnimationFrame;
    window.cancelAnimationFrame = ((id: number) => {
      if (!queued.delete(id)) cancel(id);
    }) as typeof cancelAnimationFrame;
  });
  const root = page.locator(
    '[data-phone-plane][data-r4-depth-mask-polarity="conceal"]'
  );
  const masked = await captureDepthPlaneAlpha(page, 'conceal');
  const saved = await root.evaluate((element) => {
    const properties = ['mask-image', '-webkit-mask-image'] as const;
    const snapshot = properties.map((property) => ({
      property,
      value: (element as HTMLElement).style.getPropertyValue(property),
      priority: (element as HTMLElement).style.getPropertyPriority(property)
    }));
    for (const property of properties) {
      (element as HTMLElement).style.setProperty(property, 'none', 'important');
    }
    return snapshot;
  });
  try {
    const unmasked = await captureDepthPlaneAlpha(page, 'conceal');
    expect(changedScreenshotPixels(masked, unmasked),
      'Figure2 conceal mask must remove physical source pixels').toBeGreaterThan(5_000);
  } finally {
    await root.evaluate((element, snapshot) => {
      for (const { property, value, priority } of snapshot) {
        if (value) (element as HTMLElement).style.setProperty(property, value, priority);
        else (element as HTMLElement).style.removeProperty(property);
      }
    }, saved);
    await page.evaluate(() => {
      const owner = window as typeof window & {
        __r5DepthMaskFreeze?: {
          request: typeof requestAnimationFrame;
          cancel: typeof cancelAnimationFrame;
          queued: Map<number, FrameRequestCallback>;
        };
      };
      const freeze = owner.__r5DepthMaskFreeze;
      if (!freeze) return;
      window.requestAnimationFrame = freeze.request;
      window.cancelAnimationFrame = freeze.cancel;
      delete owner.__r5DepthMaskFreeze;
      for (const callback of freeze.queued.values()) freeze.request(callback);
    });
  }
}

async function expectStableVisualReadingParity(
  page: import('@playwright/test').Page,
  scene: 'lab' | 'education',
  selector: string
): Promise<void> {
  const result = await page.locator('.phone-story').evaluate((shell, request) => {
    const snapshot = (scope: ParentNode) => {
      const element = scope.querySelector<HTMLElement>(request.selector);
      if (!element) return null;
      const bounds = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        text: element.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        rect: [bounds.left, bounds.top, bounds.right, bounds.bottom],
        font: style.font,
        lineHeight: style.lineHeight
      };
    };
    const visual = shell.querySelector<HTMLElement>(
      `[data-phone-plane="source"] [data-phone-scene="${request.scene}"]`
    );
    const reading = shell.querySelector<HTMLElement>(
      `.phone-story__reading-flow [data-phone-reading="${request.scene}"]`
    );
    return {
      visual: visual ? snapshot(visual) : null,
      reading: reading ? snapshot(reading) : null
    };
  }, { scene, selector });
  expect(result.visual, `${scene} visual endpoint`).not.toBeNull();
  expect(result.reading, `${scene} native endpoint`).not.toBeNull();
  expect(result.visual?.text).toBe(result.reading?.text);
  expect(result.visual?.font).toBe(result.reading?.font);
  expect(result.visual?.lineHeight).toBe(result.reading?.lineHeight);
  result.visual?.rect.forEach((value, index) => {
    expect(value, `${scene} endpoint rect[${index}]`)
      .toBeCloseTo(result.reading!.rect[index]!, 0);
  });
}

async function assertDecodedPoster(
  page: import('@playwright/test').Page,
  selector: string
): Promise<void> {
  await page.waitForFunction((imageSelector) => {
    const image = document.querySelector<HTMLImageElement>(imageSelector);
    return image?.complete === true && image.naturalWidth > 0 && image.naturalHeight > 0;
  }, selector, { timeout: 10_000 });
}

async function assertFormalInkCompositeContribution(
  page: import('@playwright/test').Page,
  segment: CompleteStorySegment,
  expectedEffectZIndex?: '20' | '70'
): Promise<void> {
  if (!FORMAL_INK_SEGMENTS.has(segment)) return;
  const selector = `[data-phone-plane="effect"] [data-r4-ink-segment="${segment}"]`;
  try {
    await assertInkIntermediateCompositeContribution(page, selector, expectedEffectZIndex);
  } catch (error) {
    throw new Error(`Formal Ink ${segment} did not contribute a live frame`, { cause: error });
  }
}

async function readStarPerlinLuminance(
  page: import('@playwright/test').Page
): Promise<Readonly<{
  revision: number;
  meanLuminance: number;
  p50: number;
  p90: number;
  p99: number;
  highlightOccupancy: number;
  localPeakDelta: number;
}>> {
  return page.locator<HTMLCanvasElement>('[data-portrait-star-perlin]').evaluate((canvas) => {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context || canvas.width < 1 || canvas.height < 1) {
      throw new Error('Star Map Canvas is not readable for visual motion proof');
    }
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const stride = Math.max(4, Math.floor(pixels.length / 4 / 8_192) * 4);
    const values: number[] = [];
    for (let offset = 0; offset < pixels.length; offset += stride) {
      const alpha = (pixels[offset + 3] ?? 0) / 255;
      values.push(alpha * (
        .2126 * (pixels[offset] ?? 0)
        + .7152 * (pixels[offset + 1] ?? 0)
        + .0722 * (pixels[offset + 2] ?? 0)
      ));
    }
    values.sort((left, right) => left - right);
    const percentile = (fraction: number) => values[
      Math.min(values.length - 1, Math.max(0, Math.round((values.length - 1) * fraction)))
    ] ?? Number.NaN;
    const p50 = percentile(.5);
    const p90 = percentile(.9);
    const p99 = percentile(.99);
    const highlightFloor = Math.max(p90, p50 + 2);
    return {
      revision: Number.parseInt(canvas.dataset.portraitStarPerlinRevision ?? '', 10),
      meanLuminance: values.length === 0
        ? Number.NaN : values.reduce((sum, value) => sum + value, 0) / values.length,
      p50, p90, p99,
      highlightOccupancy: values.length === 0
        ? Number.NaN : values.filter((value) => value >= highlightFloor).length / values.length,
      localPeakDelta: p99 - p50
    };
  });
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
  const key = direction === 'forward' ? 'ArrowDown' : 'ArrowUp';
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press(key);
}

async function sendTouchFrontIntent(
  page: import('@playwright/test').Page,
  direction: 'forward' | 'reverse'
): Promise<void> {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('Touch input requires a fixed viewport');
  const session = await page.context().newCDPSession(page);
  const x = Math.round(viewport.width * .5);
  const startY = Math.round(viewport.height * (direction === 'forward' ? .78 : .22));
  const endY = Math.round(viewport.height * (direction === 'forward' ? .22 : .78));
  const point = (y: number) => [{ x, y, id: 41 }];
  try {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart', touchPoints: point(startY)
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: point(Math.round((startY + endY) / 2))
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: point(endY)
    });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally {
    await session.detach();
  }
}

async function prepareCompleteStoryNativeEdge(
  page: import('@playwright/test').Page,
  scene: CompleteStoryScene,
  direction: 'forward' | 'reverse'
): Promise<void> {
  if (!COMPLETE_STORY_NATIVE_SCENES.has(scene)) return;
  const edge = direction === 'forward' ? 'bottom' : 'top';
  await page.evaluate((nextEdge) => {
    const owner = document.scrollingElement ?? document.documentElement;
    const maximum = Math.max(0, owner.scrollHeight - owner.clientHeight);
    const write = (value: number) => {
      window.scrollTo(0, value);
      owner.scrollTop = value;
      document.documentElement.scrollTop = value;
      document.body.scrollTop = value;
      window.dispatchEvent(new Event('scroll'));
      document.dispatchEvent(new Event('scroll'));
    };
    write(nextEdge === 'bottom' ? Math.max(0, maximum - 2) : Math.min(2, maximum));
    write(nextEdge === 'bottom' ? maximum : 0);
  }, edge);
  await page.waitForFunction((nextEdge) => {
    const owner = document.scrollingElement ?? document.documentElement;
    const maximum = Math.max(0, owner.scrollHeight - owner.clientHeight);
    return nextEdge === 'bottom' ? owner.scrollTop >= maximum - 1 : owner.scrollTop <= 1;
  }, edge, { timeout: 15_000 });
}

function completeStoryExitTarget(
  scene: CompleteStoryScene,
  direction: 'forward' | 'reverse'
): CompleteStoryScene | null {
  const index = COMPLETE_STORY_SCENES.indexOf(scene);
  return COMPLETE_STORY_SCENES[index + (direction === 'forward' ? 1 : -1)] ?? null;
}

async function waitForCompleteStoryNativePrewarm(
  page: import('@playwright/test').Page,
  scene: CompleteStoryScene,
  direction: 'forward' | 'reverse'
): Promise<void> {
  const target = completeStoryExitTarget(scene, direction);
  if (!target || ![
    'figure3-animation', 'ttg-animation', 'ph-animation', 'crane-animation'
  ].includes(target)) return;
  try {
    await expect(page.locator(
      `[data-phone-plane="receiver"] [data-phone-scene="${target}"]`
    )).toBeAttached({ timeout: 15_000 });
  } catch (error) {
    const state = await page.locator('.phone-story').evaluate((shell) => ({
      shell: { ...((shell as HTMLElement).dataset) },
      planes: [...shell.querySelectorAll<HTMLElement>('[data-phone-plane]')].map((plane) => ({
        role: plane.dataset.phonePlane,
        scenes: [...plane.querySelectorAll<HTMLElement>('[data-phone-scene]')]
          .map((sceneRoot) => sceneRoot.dataset.phoneScene),
        html: plane.innerHTML.slice(0, 800)
      }))
    }));
    throw new Error(`Missing ${target} prewarm: ${JSON.stringify(state)}`, { cause: error });
  }
  await expect(page.locator('.phone-story'))
    .toHaveAttribute('data-phone-resource-active-decoders', '0');
  const videos = page.locator<HTMLVideoElement>(
    `[data-phone-plane="receiver"] [data-phone-scene="${target}"] video`
  );
  const before = await videos.evaluateAll((elements) => elements.map((video) => ({
    paused: video.paused, currentTime: video.currentTime
  })));
  expect(before.every(({ paused }) => paused), `${target} prewarm must stay paused`).toBe(true);
  await page.waitForTimeout(120);
  const after = await videos.evaluateAll((elements) => elements.map((video) => ({
    paused: video.paused, currentTime: video.currentTime
  })));
  expect(after).toHaveLength(before.length);
  for (const [index, sample] of after.entries()) {
    expect(sample.paused, `${target} prewarm video ${index}`).toBe(true);
    expect(sample.currentTime, `${target} prewarm video ${index}`)
      .toBeCloseTo(before[index]?.currentTime ?? 0, 3);
  }
}

type ContinuousStoryState = Readonly<{
  scene: string | undefined;
  status: string | undefined;
  phase: string | undefined;
  interaction: string | undefined;
  activation: boolean;
}>;

async function readContinuousStoryState(
  page: import('@playwright/test').Page
): Promise<ContinuousStoryState> {
  return page.locator('.phone-story').evaluate((shell) => ({
    scene: (shell as HTMLElement).dataset.phoneScene,
    status: (shell as HTMLElement).dataset.phoneStatus,
    phase: (shell as HTMLElement).dataset.phonePhase,
    interaction: (shell as HTMLElement).dataset.phoneInteraction,
    activation: Boolean(document.querySelector('[data-phone-activation]:not([hidden])'))
  }));
}

async function failOnContinuousActivation(
  page: import('@playwright/test').Page,
  label: string
): Promise<void> {
  const state = await readContinuousStoryState(page);
  if (state.activation || state.phase === 'awaiting-media-activation') {
    throw new Error(
      `Continuous story ${label} exposed activation fallback: ${JSON.stringify(state)}`
    );
  }
}

async function waitForContinuousStoryReady(
  page: import('@playwright/test').Page
): Promise<void> {
  await expect(page.locator('[data-story-loader="true"]')).toHaveAttribute(
    'data-loader-status', 'hidden', { timeout: 15_000 }
  );
  const shell = page.locator('.phone-story');
  await expect(shell).toHaveAttribute('data-phone-status', 'stable');
  await expect(shell).toHaveAttribute('data-phone-interaction', 'enabled');
  await failOnContinuousActivation(page, 'before first gesture');
}

async function waitForContinuousSourceRestore(
  page: import('@playwright/test').Page,
  source: string,
  sequence: number,
  label: string
): Promise<void> {
  const outcome = await page.waitForFunction(({ expectedSource, expectedSequence }) => {
    const shell = document.querySelector<HTMLElement>('.phone-story');
    const state = {
      scene: shell?.dataset.phoneScene,
      status: shell?.dataset.phoneStatus,
      phase: shell?.dataset.phonePhase,
      activation: Boolean(document.querySelector('[data-phone-activation]:not([hidden])')),
      sequence: Number(shell?.dataset.phoneCommitSequence)
    };
    if (state.activation || state.phase === 'awaiting-media-activation') {
      return { kind: 'activation' as const, state };
    }
    if (state.status === 'stable' && state.scene === expectedSource
      && state.sequence === expectedSequence) {
      return { kind: 'stable' as const, state };
    }
    return null;
  }, { expectedSource: source, expectedSequence: sequence }, { timeout: 15_000 });
  const result = await outcome.jsonValue();
  if (result.kind !== 'stable') {
    throw new Error(`Continuous story ${label} exposed activation fallback: ${JSON.stringify(result.state)}`);
  }
  await failOnContinuousActivation(page, label);
}

async function traverseGradeA(
  page: import('@playwright/test').Page,
  source: keyof typeof GRADE_A_CONTENT,
  target: keyof typeof GRADE_A_CONTENT,
  direction: 'forward' | 'reverse'
): Promise<void> {
  await waitForContinuousStoryReady(page);
  const before = await readCommitSequence(page);
  await prepareCompleteStoryNativeEdge(page, source as CompleteStoryScene, direction);
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
        failure: shell?.dataset.phoneLastFailure,
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
      await failOnContinuousActivation(page, `Grade A ${source} → ${target}`);
      throw new Error(`Grade A ${source} → ${target} entered activation fallback`);
    } else if (state.phase === 'awaiting-leg-intent') {
      await sendFrontIntent(page, direction);
    }
  }
  await waitForCommitSequence(page, target, before);
  expect(await readCommitSequence(page)).toBe(before + 1);
  const targetContent = target === 'figure2-proof' && direction === 'reverse'
    ? ['[data-r4-proof-panel="closing"]']
    : target === 'method-top' && direction === 'reverse'
      ? [
        '.phone-story__reading-flow [data-phone-reading="method-top"] '
          + '.portrait-scroll-spike__steps li:last-child h3'
      ]
      : GRADE_A_CONTENT[target];
  await assertTargetContentVisible(page, targetContent);
  await assertNoWhiteOrTransparentViewportEdges(page);
}

async function traverseFigure3Slice(
  page: import('@playwright/test').Page,
  source: keyof typeof FIGURE3_SLICE_CONTENT,
  target: keyof typeof FIGURE3_SLICE_CONTENT,
  direction: 'forward' | 'reverse'
): Promise<SliceResourceSample> {
  await waitForContinuousStoryReady(page);
  const before = await readCommitSequence(page);
  await sendFrontIntent(page, direction);
  await completeFigure3SliceAttempt(page, source, target, direction, before);
  await assertSinglePhoneAuthority(page);
  await assertTargetContentVisible(page, FIGURE3_SLICE_CONTENT[target]);
  await assertNoWhiteOrTransparentViewportEdges(page);
  if (target === 'figure3-animation') {
    await expect(page.locator('.phone-figure3')).toHaveAttribute(
      'data-phone-figure3-initial-surface', 'video-frame-zero'
    );
    await expect(page.locator('[data-phone-figure3-paper-canvas]'))
      .toHaveAttribute('data-phone-figure3-paper-frame', 'ready');
    await expect(page.locator('[data-phone-figure3-paper-canvas]'))
      .toHaveAttribute('data-phone-figure3-paper-frame-index', '0');
  }
  return readStableSliceResources(page);
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
      || shell?.dataset.phonePhase === 'awaiting-media-activation'
      || shell?.dataset.phonePhase === 'awaiting-leg-intent'
    );
  }, segment, { timeout: 10_000 });
  const initialPhase = await page.locator('.phone-story').getAttribute('data-phone-phase');
  if (initialPhase === 'awaiting-media-activation'
    || await page.locator('[data-phone-activation]:not([hidden])').count()) {
    await failOnContinuousActivation(page, `Figure3 slice ${source} → ${target}`);
    throw new Error(`Figure3 slice ${source} → ${target} entered activation fallback`);
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
        failure: shell?.dataset.phoneLastFailure,
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
      await failOnContinuousActivation(page, `Figure3 slice ${source} → ${target}`);
      throw new Error(`Figure3 slice ${source} → ${target} entered activation fallback`);
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
      || shell?.dataset.phonePhase === 'awaiting-media-activation'
      || shell?.dataset.phonePhase === 'awaiting-leg-intent');
  }, segment, { timeout: 10_000 });
  const initialPhase = await page.locator('.phone-story').getAttribute('data-phone-phase');
  if (initialPhase === 'awaiting-media-activation'
    || await page.locator('[data-phone-activation]:not([hidden])').count()) {
    await failOnContinuousActivation(page, `Group 4-5 ${source} → ${target}`);
    throw new Error(`Group 4-5 ${source} → ${target} entered activation fallback`);
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
        failure: shell?.dataset.phoneLastFailure,
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
      await failOnContinuousActivation(page, `Group 4-5 ${source} → ${target}`);
      throw new Error(`Group 4-5 ${source} → ${target} entered activation fallback`);
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
): Promise<SliceResourceSample> {
  await waitForContinuousStoryReady(page);
  const before = await readCommitSequence(page);
  await prepareCompleteStoryNativeEdge(page, source as CompleteStoryScene, direction);
  await waitForContinuousStoryReady(page);
  await sendFrontIntent(page, direction);
  await completeGroup45Attempt(page, source, target, direction, before);
  await assertSinglePhoneAuthority(page);
  const content = direction === 'reverse' && target === 'services'
    ? ['.phone-story__reading-flow [data-phone-reading="services"] .phone-services__row:last-child']
    : direction === 'reverse' && target === 'lab'
      ? ['.phone-story__reading-flow [data-phone-reading="lab"] .phone-lab__row:last-child']
      : GROUP45_CONTENT[target];
  await assertTargetContentVisible(page, content);
  await assertNoWhiteOrTransparentViewportEdges(page);
  await waitForContinuousStoryReady(page);
  if (target === 'ttg-animation') {
    await expect(page.locator('[data-ttg-figure-video]'))
      .toHaveAttribute('data-phone-ttg-endpoint-ready', /initial|terminal/);
  }
  return readStableSliceResources(page);
}

async function expectGroup45Rollback(
  page: import('@playwright/test').Page,
  source: Group45Scene,
  target: Group45Scene,
  direction: 'forward' | 'reverse',
  before: number
): Promise<void> {
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
    if (state.activation || state.phase === 'awaiting-media-activation') {
      await failOnContinuousActivation(page, `withheld Group 4-5 ${source} → ${target}`);
      throw new Error(`Withheld Group 4-5 ${source} → ${target} entered activation fallback`);
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
    if (state.activation || state.phase === 'awaiting-media-activation') {
      await failOnContinuousActivation(page, `withheld Figure3 ${source} → ${target}`);
      throw new Error(`Withheld Figure3 ${source} → ${target} entered activation fallback`);
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
      || shell?.dataset.phonePhase === 'awaiting-media-activation'
      || shell?.dataset.phonePhase === 'awaiting-leg-intent');
  }, segment, { timeout: 10_000 });
  await failOnContinuousActivation(page, `PH slice ${source} → ${target}`);
  await expect(page.locator(effectSelector)).toBeAttached({ timeout: 10_000 });
  for (let boundary = 0; boundary < 5; boundary += 1) {
    const state = await page.waitForFunction(({ from, to, after }) => {
      const shell = document.querySelector<HTMLElement>('.phone-story');
      const current = {
        scene: shell?.dataset.phoneScene,
        status: shell?.dataset.phoneStatus,
        phase: shell?.dataset.phonePhase,
        failure: shell?.dataset.phoneLastFailure,
        sequence: Number(shell?.dataset.phoneCommitSequence),
        activation: Boolean(document.querySelector('[data-phone-activation]:not([hidden])'))
      };
      return current.scene === to && current.sequence > after
        || current.status === 'stable' && current.scene === from
        || current.activation
        || current.phase === 'awaiting-media-activation'
        || current.phase === 'awaiting-leg-intent'
        ? current : null;
    }, { from: source, to: target, after: before }, { timeout: 25_000 });
    const current = await state.jsonValue();
    if (current.scene === target && current.sequence > before) break;
    if (current.status === 'stable') {
      const dom = await page.evaluate(() => ({
        scenes: [...document.querySelectorAll<HTMLElement>('[data-phone-scene]')].map((node) => ({
          scene: node.dataset.phoneScene, media: node.dataset.phonePhMedia,
          canvases: node.querySelectorAll('canvas').length,
          videos: node.querySelectorAll('video').length
        })),
        covers: document.querySelectorAll('[data-phone-leaf-cover]').length
      }));
      throw new Error(`PH slice ${source} → ${target} rolled back: ${JSON.stringify({ current, dom })}`);
    }
    if (current.activation || current.phase === 'awaiting-media-activation') {
      await failOnContinuousActivation(page, `PH slice ${source} → ${target}`);
      throw new Error(`PH slice ${source} → ${target} entered activation fallback`);
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
): Promise<SliceResourceSample> {
  await waitForContinuousStoryReady(page);
  const before = await readCommitSequence(page);
  await prepareCompleteStoryNativeEdge(page, source as CompleteStoryScene, direction);
  await sendFrontIntent(page, direction);
  await completePhSliceAttempt(page, source, target, direction, before);
  await assertSinglePhoneAuthority(page);
  const content = direction === 'reverse' && target === 'lab'
    ? ['.phone-story__reading-flow [data-phone-reading="lab"] .phone-lab__row:last-child']
    : PH_SLICE_CONTENT[target];
  await assertTargetContentVisible(page, content);
  await assertNoWhiteOrTransparentViewportEdges(page);
  if (target === 'ph-animation') {
    await expect(page.locator('[data-phone-packed-alpha-canvas="ph-figure"]'))
      .toHaveAttribute('data-packed-alpha-frame-ready', 'true');
    const generations = await page.locator('.phone-ph').evaluate((root) => ({
      admitted: Number((root as HTMLElement).dataset.phGen),
      canvas: Number(root.querySelector<HTMLCanvasElement>(
        '[data-phone-packed-alpha-canvas="ph-figure"]'
      )?.dataset.packedAlphaGeneration)
    }));
    expect(generations.admitted).toBeGreaterThan(0);
    expect(generations.admitted).toBe(generations.canvas);
  }
  await waitForContinuousStoryReady(page);
  return readStableSliceResources(page);
}

async function traverseBackHalfTouchEdge(
  page: import('@playwright/test').Page,
  source: CompleteStoryScene,
  target: CompleteStoryScene
): Promise<void> {
  await waitForContinuousStoryReady(page);
  await prepareCompleteStoryNativeEdge(page, source, 'forward');
  const before = await readCommitSequence(page);
  const expectedSegment = completeStorySegment(source, target);
  const phases = new Set<string>();
  let sawExpectedSegment = false;
  let handledLegRevision = -1;
  await sendTouchFrontIntent(page, 'forward');
  for (let sample = 0; sample < 700; sample += 1) {
    const state = await page.locator('.phone-story').evaluate((shell) => ({
      scene: (shell as HTMLElement).dataset.phoneScene,
      segment: (shell as HTMLElement).dataset.phoneSegment,
      status: (shell as HTMLElement).dataset.phoneStatus,
      phase: (shell as HTMLElement).dataset.phonePhase,
      blockedBy: (shell as HTMLElement).dataset.phoneBlockedBy,
      missingProof: (shell as HTMLElement).dataset.phoneMissingProof,
      failure: (shell as HTMLElement).dataset.phoneLastFailure,
      revision: Number((shell as HTMLElement).dataset.phoneRevision),
      sequence: Number((shell as HTMLElement).dataset.phoneCommitSequence),
      activation: Boolean(document.querySelector('[data-phone-activation]:not([hidden])'))
    }));
    if (state.phase) phases.add(state.phase);
    if (state.segment === expectedSegment) sawExpectedSegment = true;
    if (state.scene === target && state.status === 'stable' && state.sequence > before) break;
    if (state.status === 'stable' && state.scene === source && sawExpectedSegment) {
      throw new Error(`Touch chain ${source} → ${target} rolled back: ${JSON.stringify({
        state, phases: [...phases], diagnostic: await readPhoneStoryDiagnostic(page)
      })}`);
    }
    if (state.activation || state.phase === 'awaiting-media-activation') {
      throw new Error(`Touch chain ${source} → ${target} requested fallback activation: ${JSON.stringify({
        state, diagnostic: await readPhoneStoryDiagnostic(page)
      })}`);
    }
    if (state.phase === 'awaiting-leg-intent' && handledLegRevision !== state.revision) {
      handledLegRevision = state.revision;
      await sendTouchFrontIntent(page, 'forward');
    }
    await page.waitForTimeout(50);
  }
  expect(sawExpectedSegment, `${source} → ${target} observed segment`).toBe(true);
  await waitForCommitSequence(page, target, before);
  expect(await readCommitSequence(page), `${source} → ${target} single commit`).toBe(before + 1);
}

async function expectPhSliceRollback(
  page: import('@playwright/test').Page,
  source: PhSliceScene,
  target: PhSliceScene,
  before: number
): Promise<void> {
  for (let sample = 0; sample < 300; sample += 1) {
    const state = await page.locator('.phone-story').evaluate((shell) => ({
      scene: (shell as HTMLElement).dataset.phoneScene,
      status: (shell as HTMLElement).dataset.phoneStatus,
      phase: (shell as HTMLElement).dataset.phonePhase,
      sequence: Number((shell as HTMLElement).dataset.phoneCommitSequence),
      activation: Boolean(document.querySelector('[data-phone-activation]:not([hidden])'))
    }));
    if ((state.status === 'stable' || state.status === 'faulted')
      && state.scene === source && state.sequence === before) return;
    if (state.status === 'stable' && state.scene === target) {
      throw new Error(`Withheld PH proof committed ${target}: ${JSON.stringify(state)}`);
    }
    if (state.activation || state.phase === 'awaiting-media-activation') {
      await failOnContinuousActivation(page, `withheld PH ${source} → ${target}`);
      throw new Error(`Withheld PH ${source} → ${target} entered activation fallback`);
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
      || shell?.dataset.phonePhase === 'awaiting-media-activation'
      || shell?.dataset.phonePhase === 'awaiting-leg-intent');
  }, segment, { timeout: 10_000 });
  await failOnContinuousActivation(page, `Crane slice ${source} → ${target}`);
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
        || current.phase === 'awaiting-media-activation'
        || current.phase === 'awaiting-leg-intent'
        ? current : null;
    }, { from: source, to: target, after: before }, { timeout: 25_000 });
    const current = await state.jsonValue();
    if (current.scene === target && current.sequence > before) break;
    if (current.status === 'stable') {
      throw new Error(`Crane slice ${source} → ${target} rolled back: ${JSON.stringify(current)}`);
    }
    if (current.activation || current.phase === 'awaiting-media-activation') {
      await failOnContinuousActivation(page, `Crane slice ${source} → ${target}`);
      throw new Error(`Crane slice ${source} → ${target} entered activation fallback`);
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
): Promise<SliceResourceSample> {
  await waitForContinuousStoryReady(page);
  const before = await readCommitSequence(page);
  if (source === 'education' && direction === 'forward') {
    await scrollNativeReadingToBottom(page);
  }
  await sendFrontIntent(page, direction);
  await completeCraneSliceAttempt(page, source, target, direction, before);
  await assertSinglePhoneAuthority(page);
  if (target === 'education' && direction === 'reverse') {
    await expect.poll(() => page.evaluate(() => {
      const owner = document.scrollingElement ?? document.documentElement;
      return Math.abs(owner.scrollTop - Math.max(0, owner.scrollHeight - owner.clientHeight));
    })).toBeLessThanOrEqual(1);
  }
  if (target === 'crane-animation') {
    await assertCompositeTargetContentVisible(page, CRANE_SLICE_CONTENT[target]);
  } else {
    await assertTargetContentVisible(page, direction === 'reverse'
      ? EDUCATION_CLOSING_CONTENT : CRANE_SLICE_CONTENT[target]);
  }
  await assertNoWhiteOrTransparentViewportEdges(page);
  if (target === 'crane-animation') {
    for (const layer of ['crane-figure', 'crane-flock']) {
      await expect(page.locator(`[data-phone-packed-alpha-canvas="${layer}"]`))
        .toHaveAttribute('data-packed-alpha-frame-ready', 'true');
    }
  }
  return readStableSliceResources(page);
}

async function expectCraneMediaRollback(
  page: import('@playwright/test').Page,
  source: CraneSliceScene,
  target: CraneSliceScene,
  before: number
): Promise<void> {
  for (let sample = 0; sample < 300; sample += 1) {
    const state = await page.locator('.phone-story').evaluate((shell) => ({
      scene: (shell as HTMLElement).dataset.phoneScene,
      status: (shell as HTMLElement).dataset.phoneStatus,
      phase: (shell as HTMLElement).dataset.phonePhase,
      sequence: Number((shell as HTMLElement).dataset.phoneCommitSequence),
      activation: Boolean(document.querySelector('[data-phone-activation]:not([hidden])'))
    }));
    if (state.status === 'stable' && state.scene === source && state.sequence === before) return;
    if (state.status === 'faulted' && state.scene === source && state.sequence === before) {
      throw new Error(`Crane media failure faulted instead of rolling back: ${JSON.stringify(state)}`);
    }
    if (state.status === 'stable' && state.scene === target) {
      throw new Error(`Withheld Crane proof committed ${target}: ${JSON.stringify(state)}`);
    }
    if (state.activation || state.phase === 'awaiting-media-activation') {
      await failOnContinuousActivation(page, `withheld Crane ${source} → ${target}`);
      throw new Error(`Withheld Crane ${source} → ${target} entered activation fallback`);
    }
    await page.waitForTimeout(100);
  }
  throw new Error(`Crane media failure did not roll back from ${source}`);
}

async function expectCraneModuleFault(
  page: import('@playwright/test').Page,
  source: CraneSliceScene,
  target: CraneSliceScene,
  before: number
): Promise<void> {
  let sawStableRollback = false;
  for (let sample = 0; sample < 300; sample += 1) {
    const state = await page.locator('.phone-story').evaluate((shell) => ({
      scene: (shell as HTMLElement).dataset.phoneScene,
      status: (shell as HTMLElement).dataset.phoneStatus,
      phase: (shell as HTMLElement).dataset.phonePhase,
      sequence: Number((shell as HTMLElement).dataset.phoneCommitSequence),
      activation: Boolean(document.querySelector('[data-phone-activation]:not([hidden])'))
    }));
    if (state.status === 'faulted' && state.scene === source && state.sequence === before) {
      await expect(page.locator('[data-phone-retry="true"]')).toBeVisible();
      return;
    }
    if (state.status === 'stable' && state.scene === source && state.sequence === before) {
      sawStableRollback = true;
    }
    if (state.status === 'stable' && state.scene === target) {
      throw new Error(`Cached Crane module rejection committed ${target}: ${JSON.stringify(state)}`);
    }
    if (state.activation || state.phase === 'awaiting-media-activation') {
      await failOnContinuousActivation(page, `cached Crane module rejection ${source} → ${target}`);
      throw new Error(`Cached Crane module rejection entered activation fallback`);
    }
    await page.waitForTimeout(100);
  }
  throw new Error(`Cached Crane module rejection did not enter a visible fault from ${source}`
    + ` (stable rollback observed: ${sawStableRollback})`);
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

async function readStableSliceResources(
  page: import('@playwright/test').Page
): Promise<SliceResourceSample> {
  const read = () => page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>('.phone-story');
    const root = shell?.querySelector('.phone-story__planes');
    const videos = [...(root?.querySelectorAll<HTMLVideoElement>('video') ?? [])];
    const canvases = [...(root?.querySelectorAll<HTMLCanvasElement>('canvas') ?? [])];
    const owner = (element: Element) => element.closest<HTMLElement>('[data-phone-scene]')
      ?.dataset.phoneScene ?? 'unowned';
    const owners = [
      ...videos.map((video) => `${owner(video)}:video`),
      ...canvases.map((canvas) => `${owner(canvas)}:canvas`)
    ].sort();
    return {
      videos: videos.length,
      decodedVideos: videos.filter((video) => video.readyState >= 2).length,
      canvases: canvases.length,
      activeDecoders: Number(shell?.dataset.phoneResourceActiveDecoders),
      owners
    };
  });

  // A stable commit can publish just before its adjacent module-only prewarm
  // mount lands. Sample only after the normalized owner inventory stops
  // changing, so cold and warm cycles are compared at the same boundary.
  await page.waitForTimeout(200);
  let previous: SliceResourceSample | null = null;
  let repeated = 0;
  for (let sample = 0; sample < 20; sample += 1) {
    const current = await read();
    if (!Number.isFinite(current.activeDecoders)) {
      throw new Error('Runtime decoder diagnostics are unavailable');
    }
    if (previous && JSON.stringify(current) === JSON.stringify(previous)) {
      repeated += 1;
      if (repeated >= 2) {
        // readyState is a volatile buffering signal, not a physical decoder
        // inventory. Runtime decoder leases must still map to retained videos.
        expect(current.activeDecoders).toBeLessThanOrEqual(current.videos);
        return current;
      }
    } else {
      previous = current;
      repeated = 0;
    }
    await page.waitForTimeout(50);
  }
  throw new Error(`Phone resource topology did not settle: ${JSON.stringify(previous)}`);
}

async function readCompleteStoryFaultDiagnostic(
  page: import('@playwright/test').Page
): Promise<Readonly<Record<string, unknown>>> {
  const dom = await readPhoneStoryDiagnostic(page);
  const runtime = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>('.phone-story');
    const root = shell?.querySelector('.phone-story__planes');
    const scene = (element: Element) => element.closest<HTMLElement>('[data-phone-scene]')
      ?.dataset.phoneScene ?? null;
    const plane = (element: Element) => element.closest<HTMLElement>('[data-phone-plane]')
      ?.dataset.phonePlane ?? null;
    const videos = [...(root?.querySelectorAll<HTMLVideoElement>('video') ?? [])];
    const canvases = [...(root?.querySelectorAll<HTMLCanvasElement>('canvas') ?? [])];
    const owners = [
      ...videos.map((video) => `${scene(video)}:${plane(video)}:video`),
      ...canvases.map((canvas) => `${scene(canvas)}:${plane(canvas)}:canvas`)
    ].sort();
    const craneVideos = [...document.querySelectorAll<HTMLVideoElement>(
      '[data-phone-scene="crane-animation"] video'
    )].map((video) => ({
      scene: scene(video), plane: plane(video), dataset: { ...video.dataset },
      currentSrc: video.currentSrc || null,
      currentTime: video.currentTime,
      readyState: video.readyState,
      networkState: video.networkState,
      paused: video.paused,
      seeking: video.seeking,
      errorCode: video.error?.code ?? null
    }));
    const craneCanvases = [...document.querySelectorAll<HTMLCanvasElement>(
      '[data-phone-scene="crane-animation"] canvas'
    )].map((canvas) => ({
      scene: scene(canvas), plane: plane(canvas), dataset: { ...canvas.dataset },
      mediaTime: Number.isFinite(Number(canvas.dataset.packedAlphaMediaTime))
        ? Number(canvas.dataset.packedAlphaMediaTime) : null,
      frame: Number.isFinite(Number(canvas.dataset.packedAlphaFrame))
        ? Number(canvas.dataset.packedAlphaFrame) : null,
      generation: Number.isFinite(Number(canvas.dataset.packedAlphaGeneration))
        ? Number(canvas.dataset.packedAlphaGeneration) : null
    }));
    return {
      runtimeLogTail: ((window as typeof window & {
        __r5PhoneRuntimeLog?: unknown[];
      }).__r5PhoneRuntimeLog ?? []).slice(-40),
      resources: {
        videos: videos.length,
        canvases: canvases.length,
        activeDecoders: Number(shell?.dataset.phoneResourceActiveDecoders),
        owners
      },
      crane: { videos: craneVideos, canvases: craneCanvases }
    };
  });
  return { dom, runtime };
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
    await expect(page.locator('[data-phone-aod-figure-poster]')).toBeVisible();
    await assertDecodedPoster(page, '[data-phone-aod-figure-poster]');
  } else if (scene === 'figure2-animation') {
    await expect(page.locator('[data-phone-figure2-poster]')).toBeVisible();
    await assertDecodedPoster(page, '[data-phone-figure2-poster]');
  } else if (scene === 'figure3-animation') {
    await expect(page.locator('[data-phone-figure3-paper-canvas]'))
      .toHaveAttribute('data-phone-figure3-paper-frame', 'ready');
    await expect(page.locator('[data-phone-figure3-paper-canvas]'))
      .toHaveAttribute('data-phone-figure3-paper-frame-index', '0');
  } else if (scene === 'ttg-animation') {
    await expect(page.locator('[data-ttg-figure-video]'))
      .toHaveAttribute('data-phone-ttg-endpoint-ready', /initial|terminal/);
    await expect(page.locator('[data-ttg-figure-video]'))
      .toHaveAttribute('data-phone-ttg-presented-frame', '0');
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
  direction: 'forward' | 'reverse',
  legLabel = `${source} → ${target} ${direction}`
): Promise<StableResourceIdentity> {
  await waitForContinuousStoryReady(page);
  const segment = completeStorySegment(source, target);
  const beforeState = await page.locator('.phone-story').evaluate((shell) => ({
    revision: Number((shell as HTMLElement).dataset.phoneRevision),
    sequence: Number((shell as HTMLElement).dataset.phoneCommitSequence)
  }));
  const before = beforeState.sequence;
  await assertSinglePhoneAuthority(page);
  if (source === 'crane-animation') {
    await assertCompositeTargetContentVisible(page, completeStoryContentAtLanding(source, direction));
  } else {
    await assertTargetContentVisible(page, completeStoryContentAtLanding(source, direction));
  }
  await prepareCompleteStoryNativeEdge(page, source, direction);
  await waitForContinuousStoryReady(page);
  await waitForCompleteStoryNativePrewarm(page, source, direction);
  await sendFrontIntent(page, direction);
  const startedHandle = await page.waitForFunction(({ from, to, after, revision }) => {
    const shell = document.querySelector<HTMLElement>('.phone-story');
    const state = {
      interaction: shell?.dataset.phoneInteraction,
      revision: Number(shell?.dataset.phoneRevision),
      scene: shell?.dataset.phoneScene,
      sequence: Number(shell?.dataset.phoneCommitSequence),
      status: shell?.dataset.phoneStatus,
      phase: shell?.dataset.phonePhase,
      source: shell?.dataset.phoneSourceScene,
      candidate: shell?.dataset.phoneCandidateScene,
      segment: shell?.dataset.phoneSegment,
      faultCode: shell?.dataset.phoneFaultCode,
      lastFailure: shell?.dataset.phoneLastFailure,
      blockedBy: shell?.dataset.phoneBlockedBy,
      missingProof: shell?.dataset.phoneMissingProof,
    };
    return state.status === 'faulted'
      || state.revision > revision && (state.status === 'transaction'
      || state.status === 'stable' && (state.scene === from
        || state.scene === to && state.sequence > after)) ? state : null;
  }, { from: source, to: target, after: before, revision: beforeState.revision }, {
    timeout: 15_000
  });
  const started = await startedHandle.jsonValue();
  if (started.status === 'faulted') {
    const diagnostic = await readCompleteStoryFaultDiagnostic(page);
    throw new Error(
      `Complete story ${legLabel} faulted before effect proof: ${JSON.stringify({
        leg: legLabel, state: started, diagnostic
      })}`
    );
  }
  if (started.status === 'stable' && started.scene === source) {
    const trace = await page.evaluate(() => (
      window as typeof window & { __r5PhoneRuntimeLog?: unknown[] }
    ).__r5PhoneRuntimeLog?.slice(-12) ?? []);
    throw new Error(
      `Complete story ${source} → ${target} rolled back: ${JSON.stringify({ started, trace })}`
    );
  }
  if (started.status === 'transaction') expect(started.interaction).toBe('disabled');
  const effectSelector = `[data-phone-plane="effect"] [data-r4-ink-segment="${segment}"], `
    + `[data-phone-plane="effect"] [data-phone-transition="${segment}"]`;
  await expect(page.locator(effectSelector)).toBeAttached({ timeout: 15_000 });
  if (source === 'pattern' && target === 'star-map' && direction === 'forward') {
    await page.waitForFunction(() => (
      document.querySelector<HTMLElement>('.phone-story')?.dataset.phonePhase
        === 'awaiting-leg-intent'
    ), undefined, { timeout: 20_000 });
    await sendFrontIntent(page, direction);
  }
  await assertFormalInkCompositeContribution(
    page, segment, BETWEEN_PLANE_SEGMENTS.has(segment) ? '20' : '70'
  );
  await assertSinglePhoneAuthority(page);
  for (let boundary = 0; boundary < 8; boundary += 1) {
    const handle = await page.waitForFunction(({ from, to, after }) => {
      const shell = document.querySelector<HTMLElement>('.phone-story');
      const state = {
        scene: shell?.dataset.phoneScene,
        status: shell?.dataset.phoneStatus,
        phase: shell?.dataset.phonePhase,
        source: shell?.dataset.phoneSourceScene,
        candidate: shell?.dataset.phoneCandidateScene,
        segment: shell?.dataset.phoneSegment,
        failure: shell?.dataset.phoneLastFailure,
        faultCode: shell?.dataset.phoneFaultCode,
        blockedBy: shell?.dataset.phoneBlockedBy,
        missingProof: shell?.dataset.phoneMissingProof,
        revision: Number(shell?.dataset.phoneRevision),
        sequence: Number(shell?.dataset.phoneCommitSequence),
        activation: Boolean(document.querySelector('[data-phone-activation]:not([hidden])'))
      };
      return state.status === 'faulted'
        || state.scene === to && state.sequence > after
        || state.status === 'stable' && state.scene === from
        || state.activation || ['awaiting-media-activation', 'awaiting-leg-intent']
          .includes(state.phase ?? '')
        ? state : null;
    }, { from: source, to: target, after: before }, { timeout: 30_000 });
    const state = await handle.jsonValue();
    if (state.status === 'faulted') {
      const diagnostic = await readCompleteStoryFaultDiagnostic(page);
      throw new Error(
        `Complete story ${legLabel} faulted during presentation: ${JSON.stringify({
          leg: legLabel, boundary, state, diagnostic
        })}`
      );
    }
    if (state.scene === target && state.sequence > before) break;
    if (state.status === 'stable') {
      const diagnostic = await readPhoneStoryDiagnostic(page);
      throw new Error(
        `Complete story ${source} → ${target} rolled back: ${JSON.stringify({ state, diagnostic })}`
      );
    }
    if (state.activation || state.phase === 'awaiting-media-activation') {
      await failOnContinuousActivation(page, `complete story ${source} → ${target}`);
      throw new Error(`Complete story ${source} → ${target} entered activation fallback`);
    } else if (state.phase === 'awaiting-leg-intent') {
      await sendFrontIntent(page, direction);
    }
    await page.waitForTimeout(50);
  }

  await waitForCommitSequence(page, target, before);
  expect(await readCommitSequence(page)).toBe(before + 1);
  await expect(page.locator('.phone-story')).toHaveAttribute('data-phone-status', 'stable');
  await expect(page.locator('.phone-story')).toHaveAttribute(
    'data-phone-interaction', 'enabled'
  );
  await assertSinglePhoneAuthority(page);
  if (target === 'crane-animation') {
    await assertCompositeTargetContentVisible(page, completeStoryContentAtLanding(target, direction));
  } else {
    await assertTargetContentVisible(page, completeStoryContentAtLanding(target, direction));
  }
  await assertCompleteStoryFrame(page, target);
  if (target === 'brand') await waitForCompleteStoryNativePrewarm(page, target, 'forward');
  await assertNoWhiteOrTransparentViewportEdges(page);
  return stableResourceIdentity(await readStableSliceResources(page));
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
      value: () => {
        enabled = true;
        for (const canvas of document.querySelectorAll<HTMLCanvasElement>(
          '[data-phone-figure3-paper-canvas]'
        )) {
          const owner = canvas.closest<HTMLElement>('.phone-figure3');
          const progress = Number(owner?.dataset.phoneFigure3Progress);
          const currentEndpoint = Number.isFinite(progress)
            ? progress >= .999 ? 'terminal' : progress <= .001 ? 'initial' : null
            : null;
          if (currentEndpoint === withheld) {
            delete canvas.dataset.phoneFigure3PaperFrame;
            delete canvas.dataset.phoneFigure3PaperEndpoint;
            delete canvas.dataset.phoneFigure3PaperFrameIndex;
          }
        }
      }
    });
    CanvasRenderingContext2D.prototype.drawImage = function patchedDrawImage(
      image: CanvasImageSource,
      ...coordinates: number[]
    ) {
      const isFigure3 = this.canvas.matches('[data-phone-figure3-paper-canvas]');
      const owner = isFigure3 ? this.canvas.closest<HTMLElement>('.phone-figure3') : null;
      const progress = Number(owner?.dataset.phoneFigure3Progress);
      const video = owner?.querySelector<HTMLVideoElement>('video');
      const endpoint = Number.isFinite(progress)
        ? progress >= .999 ? 'terminal' : progress <= .001 ? 'initial' : null
        : video && Number.isFinite(video.duration) && video.currentTime >= video.duration - .05
          ? 'terminal' : 'initial';
      if (isFigure3 && enabled && (endpoint === withheld || withheld === 'initial')) {
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
  direction: 'forward' | 'reverse',
  observePlaybackEffect = true
): Promise<Buffer[]> {
  await waitForContinuousStoryReady(page);
  const before = await readCommitSequence(page);
  await sendFrontIntent(page, direction);
  await page.waitForFunction(({ from, to }) => {
    const shell = document.querySelector<HTMLElement>('.phone-story');
    return shell?.dataset.phoneScene === to
      || shell?.dataset.phoneScene === from && shell.dataset.phoneStatus === 'transaction';
  }, { from: source, to: target });
  const segment = completeStorySegment(source as CompleteStoryScene, target as CompleteStoryScene);
  const effect = page.locator(
    `[data-phone-plane="effect"] [data-r4-ink-segment="${segment}"]`
  );
  if (observePlaybackEffect && source === 'pattern' && target === 'star-map') {
    const firstLegHandle = await page.waitForFunction(({ from, to }) => {
      const shell = document.querySelector<HTMLElement>('.phone-story');
      const state = {
        scene: shell?.dataset.phoneScene,
        status: shell?.dataset.phoneStatus,
        phase: shell?.dataset.phonePhase,
        faultCode: shell?.dataset.phoneFaultCode
      };
      if (state.status === 'faulted'
        || state.status === 'stable' && state.scene === from
        || state.scene === to
        || ['awaiting-leg-intent', 'awaiting-media-activation'].includes(state.phase ?? '')) {
        return state;
      }
      return null;
    }, { from: source, to: target }, { timeout: 20_000 });
    const firstLeg = await firstLegHandle.jsonValue();
    if (firstLeg.phase !== 'awaiting-leg-intent') {
      throw new Error(
        `Front ${source} → ${target} did not reach the Pattern collapse boundary: ${JSON.stringify(firstLeg)}`
      );
    }
    await sendFrontIntent(page, direction);
  }
  if (observePlaybackEffect) {
    await expect(effect).toBeAttached();
    await expect(effect).toHaveAttribute('data-r4-ink-effect-only', 'true');
    await assertFormalInkCompositeContribution(page, segment);
  }
  const frames: Buffer[] = [await page.screenshot()];
  for (let index = 0; index < 10; index += 1) {
    await nextAnimationFrame(page);
    frames.push(await page.screenshot());
  }
  const boundaryHandle = await page.waitForFunction(({ from, to }) => {
    const shell = document.querySelector<HTMLElement>('.phone-story');
    const state = {
      scene: shell?.dataset.phoneScene,
      status: shell?.dataset.phoneStatus,
      phase: shell?.dataset.phonePhase,
      faultCode: shell?.dataset.phoneFaultCode,
      revision: shell?.dataset.phoneRevision,
      activation: Boolean(document.querySelector('[data-phone-activation]:not([hidden])'))
    };
    return state.scene === to || state.status === 'faulted'
      || state.status === 'stable' && state.scene === from
      || ['awaiting-leg-intent', 'awaiting-media-activation'].includes(state.phase ?? '')
      ? state : null;
  }, { from: source, to: target }, { timeout: 20_000 });
  const boundaryState = await boundaryHandle.jsonValue();
  if (boundaryState.status === 'faulted') {
    throw new Error(`Front ${source} → ${target} faulted: ${JSON.stringify(boundaryState)}`);
  }
  if (boundaryState.status === 'stable' && boundaryState.scene === source) {
    throw new Error(`Front ${source} → ${target} rolled back: ${JSON.stringify(boundaryState)}`);
  }
  const boundary = boundaryState.phase;
  if (boundary === 'awaiting-leg-intent') await sendFrontIntent(page, direction);
  if (boundary === 'awaiting-media-activation') {
    await failOnContinuousActivation(page, `Front ${source} → ${target}`);
    throw new Error(`Front ${source} → ${target} entered activation fallback`);
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

async function startAodAlphaRecorder(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const owner = window as typeof window & {
      __r5AodAlphaSamples?: string[];
      __r5AodAlphaRecorder?: number;
    };
    const samples: string[] = [];
    const sample = () => {
      const alpha = document.querySelector<HTMLElement>('.portrait-scroll-spike__scene--aod')
        ?.dataset.portraitAodAlpha;
      if (alpha) samples.push(alpha);
      owner.__r5AodAlphaSamples = samples;
      owner.__r5AodAlphaRecorder = requestAnimationFrame(sample);
    };
    owner.__r5AodAlphaSamples = samples;
    owner.__r5AodAlphaRecorder = requestAnimationFrame(sample);
  });
}

async function stopAodAlphaRecorder(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(() => {
    const owner = window as typeof window & {
      __r5AodAlphaSamples?: string[];
      __r5AodAlphaRecorder?: number;
    };
    if (owner.__r5AodAlphaRecorder !== undefined) {
      cancelAnimationFrame(owner.__r5AodAlphaRecorder);
      delete owner.__r5AodAlphaRecorder;
    }
    return [...(owner.__r5AodAlphaSamples ?? [])];
  });
}

async function completeAodMethodAttempt(
  page: import('@playwright/test').Page,
  source: 'aod-animation' | 'method-top',
  target: 'aod-animation' | 'method-top',
  direction: 'forward' | 'reverse',
  before: number
): Promise<void> {
  for (let boundary = 0; boundary < 5; boundary += 1) {
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
        || state.status === 'faulted'
        || state.activation
        || ['awaiting-media-activation', 'awaiting-leg-intent'].includes(state.phase ?? '')
        ? state : null;
    }, { from: source, to: target, after: before }, { timeout: 25_000 });
    const state = await handle.jsonValue();
    if (state.scene === target && state.sequence > before) break;
    if (state.status === 'stable') {
      throw new Error(`AOD ${source} → ${target} rolled back: ${JSON.stringify(state)}`);
    }
    if (state.status === 'faulted') {
      throw new Error(`AOD ${source} → ${target} faulted: ${JSON.stringify(state)}`);
    }
    if (state.activation || state.phase === 'awaiting-media-activation') {
      await failOnContinuousActivation(page, `AOD ${source} → ${target}`);
      throw new Error(`AOD ${source} → ${target} entered activation fallback`);
    }
    if (state.phase === 'awaiting-leg-intent') await sendFrontIntent(page, direction);
  }
  await waitForCommitSequence(page, target, before);
  expect(await readCommitSequence(page)).toBe(before + 1);
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

type HeroEdgeSample = Readonly<{
  bottom: readonly [number, number, number, number];
  above: readonly [number, number, number, number];
}>;

async function heroBottomSamples(
  page: import('@playwright/test').Page
): Promise<readonly HeroEdgeSample[]> {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('Hero edge sampling requires a fixed viewport');
  const png = PNG.sync.read(await page.screenshot());
  const pixel = (x: number, y: number): readonly [number, number, number, number] => {
    const px = Math.max(0, Math.min(png.width - 1, Math.floor(x / viewport.width * png.width)));
    const py = Math.max(0, Math.min(png.height - 1, Math.floor(y / viewport.height * png.height)));
    const offset = (py * png.width + px) * 4;
    return [png.data[offset] ?? 0, png.data[offset + 1] ?? 0,
      png.data[offset + 2] ?? 0, png.data[offset + 3] ?? 0];
  };
  return [4, viewport.width / 2, viewport.width - 4].map((x) => ({
    bottom: pixel(x, viewport.height - 2),
    above: pixel(x, viewport.height - 10)
  }));
}

function luma(pixel: readonly [number, number, number, number]): number {
  return .2126 * pixel[0] + .7152 * pixel[1] + .0722 * pixel[2];
}

function changedScreenshotPixels(first: Buffer, second: Buffer): number {
  const left = PNG.sync.read(first);
  const right = PNG.sync.read(second);
  expect([right.width, right.height]).toEqual([left.width, left.height]);
  let changed = 0;
  for (let offset = 0; offset < left.data.length; offset += 4) {
    const delta = Math.abs((left.data[offset] ?? 0) - (right.data[offset] ?? 0))
      + Math.abs((left.data[offset + 1] ?? 0) - (right.data[offset + 1] ?? 0))
      + Math.abs((left.data[offset + 2] ?? 0) - (right.data[offset + 2] ?? 0));
    if (delta >= 24) changed += 1;
  }
  return changed;
}

function complementaryMaskPixelErrors(partition: Buffer) {
  const image = PNG.sync.read(partition);
  let holes = 0; let overlaps = 0;
  for (let offset = 0; offset < image.data.length; offset += 4) {
    const red = image.data[offset] ?? 0;
    const green = image.data[offset + 1] ?? 0;
    if (red < 24 && green < 24) holes += 1;
    if (red > 231 && green > 231) overlaps += 1;
  }
  return { holes, overlaps, pixels: image.width * image.height };
}

async function captureDepthPlanePartition(
  page: import('@playwright/test').Page
): Promise<Buffer> {
  await page.evaluate(() => {
    const owner = window as typeof window & { __r5RestoreDepthPartitionProbe?: () => void };
    owner.__r5RestoreDepthPartitionProbe?.();
    const shell = document.querySelector<HTMLElement>('.phone-story')!;
    const conceal = shell.querySelector<HTMLElement>(
      '[data-phone-plane][data-r4-depth-mask-polarity="conceal"]'
    )!;
    const reveal = shell.querySelector<HTMLElement>(
      '[data-phone-plane][data-r4-depth-mask-polarity="reveal"]'
    )!;
    const nodes = [document.documentElement, document.body, shell,
      shell.querySelector<HTMLElement>('.phone-story__viewport'),
      shell.querySelector<HTMLElement>('.phone-story__coverage'),
      shell.querySelector<HTMLElement>('.phone-story__reading-flow'),
      shell.querySelector<HTMLElement>('[data-phone-loader="true"]'),
      shell.querySelector<HTMLElement>('.phone-story__retained-figure2-arch-layer'),
      ...shell.querySelectorAll<HTMLElement>('[data-phone-plane]'),
      ...conceal.querySelectorAll<HTMLElement>('*'),
      ...reveal.querySelectorAll<HTMLElement>('*')]
      .filter((node): node is HTMLElement => node instanceof HTMLElement);
    const styles = nodes.map((node) => [node, node.getAttribute('style')] as const);
    owner.__r5RestoreDepthPartitionProbe = () => {
      for (const [node, style] of styles) {
        if (style === null) node.removeAttribute('style'); else node.setAttribute('style', style);
      }
      delete owner.__r5RestoreDepthPartitionProbe;
    };
    for (const node of [document.documentElement, document.body, shell,
      shell.querySelector<HTMLElement>('.phone-story__viewport')]) {
      node?.style.setProperty('background', '#000', 'important');
    }
    for (const selector of ['.phone-story__coverage', '.phone-story__reading-flow',
      '[data-phone-loader="true"]', '.phone-story__retained-figure2-arch-layer']) {
      shell.querySelector<HTMLElement>(selector)?.style.setProperty('display', 'none', 'important');
    }
    for (const plane of shell.querySelectorAll<HTMLElement>('[data-phone-plane]')) {
      plane.style.setProperty('display', 'none', 'important');
    }
    for (const [plane, color] of [[conceal, '#f00'], [reveal, '#0f0']] as const) {
      plane.style.setProperty('display', 'block', 'important');
      plane.style.setProperty('visibility', 'visible', 'important');
      plane.style.setProperty('opacity', '1', 'important');
      plane.style.setProperty('clip-path', 'none', 'important');
      plane.style.setProperty('background', color, 'important');
      plane.style.setProperty('mix-blend-mode', 'screen', 'important');
      for (const child of plane.querySelectorAll<HTMLElement>('*')) {
        child.style.setProperty('visibility', 'hidden', 'important');
      }
    }
  });
  try {
    await page.evaluate(() => document.documentElement.offsetHeight);
    return await page.screenshot();
  } finally {
    await page.evaluate(() => {
      const owner = window as typeof window & { __r5RestoreDepthPartitionProbe?: () => void };
      owner.__r5RestoreDepthPartitionProbe?.();
    });
  }
}

async function captureDepthPlaneAlpha(
  page: import('@playwright/test').Page,
  polarity: 'conceal' | 'reveal'
): Promise<Buffer> {
  await page.evaluate((requestedPolarity) => {
    const owner = window as typeof window & { __r5RestoreDepthAlphaProbe?: () => void };
    owner.__r5RestoreDepthAlphaProbe?.();
    const shell = document.querySelector<HTMLElement>('.phone-story')!;
    const active = shell.querySelector<HTMLElement>(
      `[data-phone-plane][data-r4-depth-mask-polarity="${requestedPolarity}"]`
    )!;
    const nodes = [document.documentElement, document.body, shell,
      shell.querySelector<HTMLElement>('.phone-story__viewport'),
      shell.querySelector<HTMLElement>('.phone-story__coverage'),
      shell.querySelector<HTMLElement>('.phone-story__reading-flow'),
      shell.querySelector<HTMLElement>('[data-phone-loader="true"]'),
      shell.querySelector<HTMLElement>('.phone-story__retained-figure2-arch-layer'),
      ...shell.querySelectorAll<HTMLElement>('[data-phone-plane]'),
      ...active.querySelectorAll<HTMLElement>('*')]
      .filter((node): node is HTMLElement => node instanceof HTMLElement);
    const styles = nodes.map((node) => [node, node.getAttribute('style')] as const);
    owner.__r5RestoreDepthAlphaProbe = () => {
      for (const [node, style] of styles) {
        if (style === null) node.removeAttribute('style'); else node.setAttribute('style', style);
      }
      delete owner.__r5RestoreDepthAlphaProbe;
    };
    for (const node of [document.documentElement, document.body, shell,
      shell.querySelector<HTMLElement>('.phone-story__viewport')]) {
      node?.style.setProperty('background', '#000', 'important');
    }
    shell.querySelector<HTMLElement>('.phone-story__coverage')
      ?.style.setProperty('display', 'none', 'important');
    shell.querySelector<HTMLElement>('.phone-story__reading-flow')
      ?.style.setProperty('display', 'none', 'important');
    shell.querySelector<HTMLElement>('[data-phone-loader="true"]')
      ?.style.setProperty('display', 'none', 'important');
    shell.querySelector<HTMLElement>('.phone-story__retained-figure2-arch-layer')
      ?.style.setProperty('display', 'none', 'important');
    for (const plane of shell.querySelectorAll<HTMLElement>('[data-phone-plane]')) {
      plane.style.setProperty('display', 'none', 'important');
    }
    active.style.setProperty('display', 'block', 'important');
    active.style.setProperty('visibility', 'visible', 'important');
    active.style.setProperty('opacity', '1', 'important');
    active.style.setProperty('clip-path', 'none', 'important');
    active.style.setProperty('background', '#fff', 'important');
    for (const child of active.querySelectorAll<HTMLElement>('*')) {
      child.style.setProperty('visibility', 'hidden', 'important');
    }
  }, polarity);
  try {
    const isolation = await page.evaluate((requestedPolarity) => {
      const active = document.querySelector<HTMLElement>(
        `[data-phone-plane][data-r4-depth-mask-polarity="${requestedPolarity}"]`
      )!;
      const style = getComputedStyle(active);
      return {
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        renderedDescendants: [...active.querySelectorAll<HTMLElement>('*')]
          .filter((node) => {
            const computed = getComputedStyle(node);
            if (computed.visibility === 'hidden' || computed.display === 'none'
              || Number.parseFloat(computed.opacity) <= 0) return false;
            return [...node.getClientRects()].some(({ width, height }) => width > 0 && height > 0);
          })
          .slice(0, 5).map((node) => node.outerHTML.slice(0, 120))
      };
    }, polarity);
    expect(isolation).toEqual({
      backgroundColor: 'rgb(255, 255, 255)', backgroundImage: 'none',
      renderedDescendants: []
    });
    await page.evaluate(() => document.documentElement.offsetHeight);
    return await page.screenshot();
  } finally {
    await page.evaluate(() => {
      const owner = window as typeof window & { __r5RestoreDepthAlphaProbe?: () => void };
      owner.__r5RestoreDepthAlphaProbe?.();
    });
  }
}

async function freezeDepthAt(
  page: import('@playwright/test').Page,
  target: number
): Promise<() => Promise<void>> {
  await page.waitForFunction((threshold) => {
    const plane = document.querySelector<HTMLElement>(
      '[data-phone-plane][data-r4-depth-mask-polarity="reveal"]'
    );
    const progress = Number(plane?.dataset.r4DepthMaskProgress);
    return Number.isFinite(progress) && progress >= threshold;
  }, target, { timeout: 15_000 });
  await page.evaluate(() => {
    const owner = window as typeof window & { __r5DepthMaskFreeze?: {
      request: typeof requestAnimationFrame; cancel: typeof cancelAnimationFrame;
      queued: Map<number, FrameRequestCallback>; nextId: number;
    } };
    const request = window.requestAnimationFrame.bind(window);
    const cancel = window.cancelAnimationFrame.bind(window);
    const queued = new Map<number, FrameRequestCallback>();
    owner.__r5DepthMaskFreeze = { request, cancel, queued, nextId: -1 };
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      const id = owner.__r5DepthMaskFreeze!.nextId--;
      queued.set(id, callback); return id;
    }) as typeof requestAnimationFrame;
    window.cancelAnimationFrame = ((id: number) => {
      if (!queued.delete(id)) cancel(id);
    }) as typeof cancelAnimationFrame;
  });
  return async () => page.evaluate(() => {
    const owner = window as typeof window & { __r5DepthMaskFreeze?: {
      request: typeof requestAnimationFrame; cancel: typeof cancelAnimationFrame;
      queued: Map<number, FrameRequestCallback>;
    } };
    const freeze = owner.__r5DepthMaskFreeze;
    if (!freeze) return;
    window.requestAnimationFrame = freeze.request;
    window.cancelAnimationFrame = freeze.cancel;
    delete owner.__r5DepthMaskFreeze;
    for (const callback of freeze.queued.values()) freeze.request(callback);
  });
}

test.describe('Task 13 eight-regression closure', () => {
test('Hero coverage matches its bottom vignette through a toolbar-sized resize', async ({ page }) => {
  let releaseVideo = () => undefined;
  const videoGate = new Promise<void>((resolve) => { releaseVideo = resolve; });
  await page.route(/figure1-rgb-alpha.*\.mp4/, async (route) => {
    await videoGate;
    await route.continue();
  });
  await page.goto('/#hero', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.portrait-scroll-spike__scene--hero')).toBeAttached();

  await nextAnimationFrame(page);
  const cold = await heroBottomSamples(page);
  const coldDom = await page.evaluate(() => ({
    html: getComputedStyle(document.documentElement).backgroundColor,
    body: getComputedStyle(document.body).backgroundColor,
    preboot: document.documentElement.style.getPropertyValue('--phone-preboot-surface'),
    coverage: getComputedStyle(document.querySelector('.phone-story__coverage')!).backgroundColor,
    shell: getComputedStyle(document.querySelector('.phone-story')!).backgroundColor
  }));
  expect(cold.every(({ bottom }) => bottom[3] >= 254)).toBe(true);
  expect(coldDom.preboot, `Hero cold surface: ${JSON.stringify({ cold, coldDom })}`)
    .toBe('#040807');
  releaseVideo();
  await waitForCommitSequence(page, 'hero', 0);
  await expect(page.locator('.phone-story')).toHaveAttribute('data-phone-status', 'stable');
  const coverageColor = await page.locator('.phone-story').evaluate((shell) => (
    getComputedStyle(shell).getPropertyValue('--phone-story-coverage').trim()
  ));
  expect(coverageColor).toBe('#040807');

  const beforeToolbar = await heroBottomSamples(page);
  await page.setViewportSize({ width: 390, height: 720 });
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  const toolbar = await heroBottomSamples(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  const afterToolbar = await heroBottomSamples(page);

  for (const samples of [cold, beforeToolbar, toolbar, afterToolbar]) {
    for (const { bottom, above } of samples) {
      expect(bottom[3]).toBeGreaterThanOrEqual(254);
      expect(luma(bottom)).toBeLessThanOrEqual(luma(above) + 32);
    }
  }
});

test('Hero to Pattern keeps the incoming structure drawing and turning after commit', async ({ page }) => {
  await page.goto('/#hero', { waitUntil: 'domcontentloaded' });
  await waitForCommitSequence(page, 'hero', 0);
  await sendFrontIntent(page, 'forward');
  await page.waitForFunction(() => {
    const shell = document.querySelector<HTMLElement>('.phone-story');
    return shell?.dataset.phoneCandidateScene === 'pattern'
      && Boolean(document.querySelector('[data-portrait-pattern-bloom]'));
  }, undefined, { timeout: 20_000 });
  const canvas = page.locator<HTMLCanvasElement>('[data-portrait-pattern-bloom]');
  await expect(canvas).toHaveAttribute('data-ink-texture-ready', 'true', { timeout: 15_000 });
  const incomingRevision = Number(await canvas.getAttribute('data-ink-texture-revision'));
  await page.waitForFunction((previous) => {
    const value = Number(document.querySelector<HTMLCanvasElement>(
      '[data-portrait-pattern-bloom]'
    )?.dataset.inkTextureRevision);
    return Number.isFinite(value) && value > previous;
  }, incomingRevision, { timeout: 5_000 });
  await waitForCommitSequence(page, 'pattern', 0);
  const stableRevision = Number(await canvas.getAttribute('data-ink-texture-revision'));
  await page.waitForTimeout(500);
  expect(Number(await canvas.getAttribute('data-ink-texture-revision')))
    .toBeGreaterThan(stableRevision);
  await assertNoWhiteOrTransparentViewportEdges(page);
});

test('Pattern collapse crosses the former switch points without a blank frame or ambient stall', async ({ page }) => {
  await page.goto('/#pattern', { waitUntil: 'domcontentloaded' });
  await waitForContinuousStoryReady(page);
  const canvas = page.locator<HTMLCanvasElement>('[data-portrait-pattern-bloom]');
  await expect(canvas)
    .toHaveAttribute('data-ink-texture-ready', 'true', { timeout: 15_000 });
  const stableRevision = Number(await canvas.getAttribute('data-ink-texture-revision'));
  await page.waitForTimeout(500);
  expect(Number(await canvas.getAttribute('data-ink-texture-revision')))
    .toBeGreaterThan(stableRevision);
  const frames = await traverseFront(page, 'pattern', 'star-map', 'forward', false);
  expect(frames.length).toBeGreaterThanOrEqual(10);
  await assertNoIntermediateWhiteOrBlackFrame(frames, { tolerance: 3 });
  await expect(page.locator('[data-phone-activation]:not([hidden])')).toHaveCount(0);
});

test('Star Map fidelity uses the canonical reveal input dimensions', async ({ page }) => {
  await page.goto('/#star-map', { waitUntil: 'domcontentloaded' });
  await waitForCommitSequence(page, 'star-map', 0);
  const dimensions = await page.evaluate(() => {
    const source = document.querySelector<HTMLImageElement>('[data-portrait-star-source]');
    const reveal = document.querySelector<HTMLCanvasElement>('[data-portrait-star-perlin]');
    return {
      source: [source?.naturalWidth ?? 0, source?.naturalHeight ?? 0],
      reveal: [
        Number(reveal?.dataset.portraitStarPerlinSourceWidth),
        Number(reveal?.dataset.portraitStarPerlinSourceHeight)
      ],
      input: reveal?.dataset.portraitStarPerlinSource ?? null
    };
  });
  expect(dimensions.source).toEqual([1672, 941]);
  expect(dimensions.reveal).toEqual(dimensions.source);
  expect(dimensions.input).toMatch(/\/back2-[^/]+\.webp$/);
});

test('Star Map keeps a full-resolution extracted, sparse breathing Perlin field', async ({ page }) => {
  await page.goto('/#star-map', { waitUntil: 'domcontentloaded' });
  await waitForCommitSequence(page, 'star-map', 0);
  const requestedMask = await page.evaluate(() => performance.getEntriesByType('resource')
    .some((entry) => entry.name.includes('star-map-highlight-mask')));
  expect(requestedMask).toBe(false);

  const canvas = page.locator<HTMLCanvasElement>('[data-portrait-star-perlin]');
  await expect(canvas).toHaveAttribute('data-portrait-star-perlin', 'ready');
  const samples = [await readStarPerlinLuminance(page)];
  await page.waitForTimeout(500);
  samples.push(await readStarPerlinLuminance(page));
  expect(samples[1]!.revision).toBeGreaterThan(samples[0]!.revision);
  expect(samples.every(({ localPeakDelta }) => localPeakDelta > 3),
    `Star Map local contrast: ${JSON.stringify(samples)}`).toBe(true);
  expect(samples.every(({ highlightOccupancy }) => (
    highlightOccupancy > .001 && highlightOccupancy < .35
  )), `Star Map highlight occupancy: ${JSON.stringify(samples)}`).toBe(true);
  const sparse = await canvas.evaluate((node) => {
    const context = node.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Star Map canvas unavailable');
    const data = context.getImageData(0, 0, node.width, node.height).data;
    let lit = 0;
    for (let index = 3; index < data.length; index += 4) {
      if ((data[index] ?? 0) > 12) lit += 1;
    }
    return lit / (data.length / 4);
  });
  expect(sparse).toBeGreaterThan(.001);
  expect(sparse).toBeLessThan(.85);
  await assertNoWhiteOrTransparentViewportEdges(page);
});

test('Star to AOD keeps the Star Map ambient revision alive inside Ink', async ({ page }) => {
  await page.goto('/#star-map', { waitUntil: 'domcontentloaded' });
  await waitForContinuousStoryReady(page);
  const canvas = page.locator<HTMLCanvasElement>('[data-portrait-star-perlin]');
  const before = Number(await canvas.getAttribute('data-portrait-star-perlin-revision'));
  await sendFrontIntent(page, 'forward');
  await page.waitForFunction(() => {
    const shell = document.querySelector<HTMLElement>('.phone-story');
    return shell?.dataset.phoneSourceScene === 'star-map'
      && shell.dataset.phoneCandidateScene === 'aod-animation';
  }, undefined, { timeout: 20_000 });
  await page.waitForFunction((previous) => Number(
    document.querySelector<HTMLCanvasElement>('[data-portrait-star-perlin]')
      ?.dataset.portraitStarPerlinRevision
  ) > previous, before, { timeout: 5_000 });
  await failOnContinuousActivation(page, 'Star → AOD');
  await waitForCommitSequence(page, 'aod-animation', 0);
  await expect(page.locator('[data-phone-activation]:not([hidden])')).toHaveCount(0);
});

test('AOD forward and reverse preserve transparent alpha and the reverse endpoint', async ({ page }) => {
  await page.goto('/#aod-animation', { waitUntil: 'domcontentloaded' });
  const forwardBefore = await waitForCommitSequence(page, 'aod-animation', 0);
  await sendFrontIntent(page, 'forward');
  await page.waitForFunction(() => {
    const shell = document.querySelector<HTMLElement>('.phone-story');
    return shell?.dataset.phoneSourceScene === 'aod-animation'
      && shell.dataset.phoneCandidateScene === 'method-top';
  }, undefined, { timeout: 20_000 });
  await startAodAlphaRecorder(page);
  await completeAodMethodAttempt(page, 'aod-animation', 'method-top', 'forward', forwardBefore);
  const alphaSamples = await stopAodAlphaRecorder(page);
  expect(alphaSamples).toContain('transparent');
  await expect(page.locator('[data-phone-activation]:not([hidden])')).toHaveCount(0);

  await page.goto('/#method-top', { waitUntil: 'domcontentloaded' });
  const reverseBefore = await waitForCommitSequence(page, 'method-top', 0);
  await waitForContinuousStoryReady(page);
  await sendFrontIntent(page, 'reverse');
  await page.waitForFunction(() => {
    const shell = document.querySelector<HTMLElement>('.phone-story');
    return shell?.dataset.phoneSourceScene === 'method-top'
      && shell.dataset.phoneCandidateScene === 'aod-animation'
      && Boolean(document.querySelector('.portrait-scroll-spike__scene--aod'));
  }, undefined, { timeout: 20_000 });
  await expect(page.locator('.portrait-scroll-spike__scene--aod'))
    .toHaveAttribute('data-portrait-aod-progress', '1.0000');
  await failOnContinuousActivation(page, 'Method → AOD');
  await completeAodMethodAttempt(page, 'method-top', 'aod-animation', 'reverse', reverseBefore);
  await expect(page.locator('[data-phone-activation]:not([hidden])')).toHaveCount(0);
  await assertNoWhiteOrTransparentViewportEdges(page);
});

test('Method keeps its native corridor through toolbar geometry before Figure2 handoff', async ({ page }) => {
  await page.goto('/#method-top', { waitUntil: 'domcontentloaded' });
  await waitForContinuousStoryReady(page);
  const before = await readCommitSequence(page);
  const reading = page.locator('[data-phone-input-owner="native-document"]');
  await expect(reading).toBeAttached();
  const scrollState = await page.evaluate(() => {
    const owner = document.scrollingElement ?? document.documentElement;
    window.scrollTo(0, owner.scrollHeight);
    return { scrollTop: owner.scrollTop, max: owner.scrollHeight - owner.clientHeight };
  });
  expect(Math.abs(scrollState.scrollTop - scrollState.max)).toBeLessThanOrEqual(1);
  await page.setViewportSize({ width: 390, height: 720 });
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  expect(await readCommitSequence(page)).toBe(before);
  await traverseGradeA(page, 'method-top', 'figure2-animation', 'forward');
  await expect(page.locator('[data-phone-activation]:not([hidden])')).toHaveCount(0);
});

test('Method native touch crosses to story ownership after reaching the live edge outside 96px', async ({ page }) => {
  await page.goto('/#method-top', { waitUntil: 'domcontentloaded' });
  await waitForContinuousStoryReady(page);
  const result = await page.locator('[data-phone-input-owner="native-document"]')
    .evaluate((reading) => {
      const owner = document.scrollingElement ?? document.documentElement;
      const maximum = Math.max(0, owner.scrollHeight - owner.clientHeight);
      const dispatch = (type: string, y: number) => {
        const event = new Event(type, { bubbles: true, cancelable: true }) as TouchEvent;
        const point = { identifier: 7, clientY: y };
        Object.defineProperty(event, type === 'touchend' ? 'changedTouches' : 'touches', {
          value: [point]
        });
        reading.dispatchEvent(event);
        return event.defaultPrevented;
      };
      owner.scrollTop = Math.max(0, maximum - 180);
      dispatch('touchstart', 600);
      const interior = dispatch('touchmove', 520);
      owner.scrollTop = Math.max(0, maximum - 80);
      const crossing = dispatch('touchmove', 430);
      const tail = dispatch('touchmove', 400);
      dispatch('touchend', 400);
      return { interior, crossing, tail, scrollTop: owner.scrollTop, maximum };
    });
  expect(result.interior).toBe(false);
  expect(result.crossing).toBe(true);
  expect(result.tail).toBe(true);
  expect(result.scrollTop).toBeCloseTo(result.maximum, 0);
});

});

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
  await page.waitForFunction(() => {
    const loader = document.querySelector<HTMLElement>('[data-story-loader="true"]');
    const hero = document.querySelector<HTMLElement>('.portrait-scroll-spike__scene--hero');
    return loader?.dataset.loaderStatus === 'exiting'
      && Number(hero?.dataset.heroProgress ?? 1) < 1;
  }, undefined, { timeout: 2_000 });
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
  const stableHeroPlayback = page.locator('[data-portrait-figure-video]');
  const stableHeroFigure = page.locator('.portrait-scroll-spike__hero-figure-parallax');
  await expect(stableHeroFigure).toHaveAttribute(
    'data-portrait-figure-frame', 'ready', { timeout: 10_000 }
  );
  await expect(stableHeroFigure).toHaveAttribute('data-portrait-figure-alpha', 'verified');
  const heroTimeBefore = await stableHeroPlayback.evaluate((video) => video.currentTime);
  const visibleHeroBefore = await page.locator('[data-portrait-figure-canvas]').evaluate((canvas) => ({
    mediaTime: Number(canvas.dataset.packedAlphaMediaTime)
  }));
  await page.waitForTimeout(400);
  const heroTimeAfter = await stableHeroPlayback.evaluate((video) => video.currentTime);
  const visibleHeroAfter = await page.locator('[data-portrait-figure-canvas]').evaluate((canvas) => ({
    mediaTime: Number(canvas.dataset.packedAlphaMediaTime)
  }));
  expect(Math.abs(heroTimeAfter - heroTimeBefore)).toBeLessThan(.02);
  expect(Math.abs(visibleHeroAfter.mediaTime - visibleHeroBefore.mediaTime)).toBeLessThan(.02);
  await assertNoWhiteOrTransparentViewportEdges(page);
});

test('stable Hero keeps Figure1 static after visibility and BFCache lifecycle recovery', async ({
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
  await page.goto('/#hero', { waitUntil: 'domcontentloaded' });
  await waitForContinuousStoryReady(page);
  const playback = page.locator('[data-portrait-figure-video]');
  const heroFigure = page.locator('.portrait-scroll-spike__hero-figure-parallax');
  await expect(heroFigure).toHaveAttribute('data-portrait-figure-frame', 'ready', {
    timeout: 10_000
  });

  await page.evaluate(() => {
    const api = window as typeof window & {
      __r5SetVisibility(next: DocumentVisibilityState): void;
    };
    api.__r5SetVisibility('hidden');
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
  });
  await expect.poll(() => playback.evaluate((video) => video.paused)).toBe(true);

  const before = await playback.evaluate((video) => video.currentTime);
  await page.evaluate(() => {
    const api = window as typeof window & {
      __r5SetVisibility(next: DocumentVisibilityState): void;
    };
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    api.__r5SetVisibility('visible');
  });
  await expect(heroFigure).toHaveAttribute('data-portrait-figure-frame', 'ready', {
    timeout: 10_000
  });
  await page.waitForTimeout(400);
  const after = await playback.evaluate((video) => video.currentTime);
  expect(Math.abs(after - before)).toBeLessThan(.02);
});

test('Hero lifecycle recovery completes an in-flight entrance without replaying Loader', async ({
  page
}) => {
  let releaseVideo = () => undefined;
  const videoGate = new Promise<void>((resolve) => { releaseVideo = resolve; });
  await page.addInitScript(() => {
    (window as typeof window & { __r5PhoneRuntimeLog?: unknown[] }).__r5PhoneRuntimeLog = [];
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
  await page.route(/figure1-rgb-alpha.*\.mp4/, async (route) => {
    await videoGate;
    await route.continue();
  });
  await page.goto('/#hero', { waitUntil: 'domcontentloaded' });
  const hero = page.locator('.portrait-scroll-spike__scene--hero');
  await expect(hero).toBeAttached();
  releaseVideo();
  await waitForCommitSequence(page, 'hero', 0);
  await expect(page.locator('[data-story-loader="true"]')).toHaveAttribute(
    'data-loader-status', 'exiting', { timeout: 10_000 }
  );
  await page.waitForFunction(() => {
    const scene = document.querySelector<HTMLElement>('.portrait-scroll-spike__scene--hero');
    const progress = Number(scene?.dataset.heroProgress ?? 0);
    return progress > 0 && progress < 1;
  }, undefined, { timeout: 5_000 });

  await page.evaluate(() => {
    const api = window as typeof window & {
      __r5SetVisibility(next: DocumentVisibilityState): void;
    };
    api.__r5SetVisibility('hidden');
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
  });
  await page.waitForFunction(() => {
    const log = (
      window as typeof window & {
        __r5PhoneRuntimeLog?: Array<{ visibility?: string }>;
      }
    ).__r5PhoneRuntimeLog ?? [];
    return log.some(({ visibility }) => visibility === 'persisted');
  });

  await page.evaluate(() => {
    const api = window as typeof window & {
      __r5SetVisibility(next: DocumentVisibilityState): void;
    };
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    api.__r5SetVisibility('visible');
  });
  await expect(hero).toHaveAttribute('data-hero-progress', '1.0000', { timeout: 10_000 });
  await expect(page.locator('.portrait-scroll-spike__hero-figure-parallax'))
    .toHaveAttribute('data-portrait-figure-frame', 'ready', {
      timeout: 10_000
    });
  await expect(page.locator('[data-story-loader="true"]')).toHaveAttribute(
    'data-loader-status', 'hidden', { timeout: 5_000 }
  );
});

test('Hero to Pattern and back restores the static Figure1 hold without replaying Loader entrance', async ({
  page
}) => {
  await page.goto('/#hero', { waitUntil: 'domcontentloaded' });
  await waitForContinuousStoryReady(page);
  const loader = page.locator('[data-story-loader="true"]');
  await expect(loader).toHaveAttribute('data-loader-status', 'hidden');

  await traverseCompleteStoryLeg(page, 'hero', 'pattern', 'forward');
  await traverseCompleteStoryLeg(page, 'pattern', 'hero', 'reverse');

  const playback = page.locator('[data-portrait-figure-video]');
  await expect(loader).toHaveAttribute('data-loader-status', 'hidden');
  await expect(page.locator('.portrait-scroll-spike__hero-figure-parallax'))
    .toHaveAttribute('data-portrait-figure-frame', 'ready', {
      timeout: 10_000
    });
  const before = await playback.evaluate((video) => video.currentTime);
  await page.waitForTimeout(400);
  const after = await playback.evaluate((video) => video.currentTime);
  expect(Math.abs(after - before)).toBeLessThan(.02);
});

test('Hero to Pattern and reverse use one paused timeline clock for visible Figure1 frames', async ({
  page
}) => {
  await page.goto('/#hero', { waitUntil: 'domcontentloaded' });
  await waitForContinuousStoryReady(page);

  const forwardStop = await recordPhoneStoryFrames(page);
  await nextAnimationFrame(page);
  await traverseCompleteStoryLeg(page, 'hero', 'pattern', 'forward');
  const forward = await forwardStop();

  const reverseStop = await recordPhoneStoryFrames(page);
  await nextAnimationFrame(page);
  await traverseCompleteStoryLeg(page, 'pattern', 'hero', 'reverse');
  const reverse = await reverseStop();

  const assertDirection = (
    samples: readonly PhoneStoryFrameSample[],
    source: 'hero' | 'pattern',
    target: 'pattern' | 'hero',
    direction: 1 | -1
  ) => {
    const active = (sample: PhoneStoryFrameSample) => (
      sample.transitionLive
      && sample.shell?.phoneStatus === 'transaction'
      && sample.shell.phoneSourceScene === source
      && sample.shell.phoneCandidateScene === target
    );
    const video = mediaTrace(samples, 'hero-figure-video', active);
    const canvas = canvasMediaTrace(samples, 'hero-figure-canvas', active);
    expect(video.length, `${source} → ${target} video trace`).toBeGreaterThan(5);
    expect(canvas.length, `${source} → ${target} Canvas trace`).toBeGreaterThan(3);
    expect(video.every(({ paused }) => paused), `${source} → ${target} native clock`).toBe(true);
    const times = canvas.map(({ mediaTime }) => mediaTime);
    expect(Math.max(...times) - Math.min(...times), `${source} → ${target} visible motion`)
      .toBeGreaterThan(.15);
    expect(times.every((time, index) => index === 0 || (direction === 1
      ? time >= times[index - 1]! - .04
      : time <= times[index - 1]! + .04)),
    `${source} → ${target} monotonic Canvas: ${JSON.stringify(times)}`)
      .toBe(true);
  };

  assertDirection(forward, 'hero', 'pattern', 1);
  assertDirection(reverse, 'pattern', 'hero', -1);
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
  await assertTargetContentVisible(page, FRONT_CONTENT.pattern);

  for (const size of [{ width: 393, height: 852 }, { width: 390, height: 720 }]) {
    await page.setViewportSize(size);
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
    const proof = await patternViewportProof(page);
    expect(proof.frame).toBe('ready');
    expect(proof.coverageColor).toBe('#8f7f61');
    expect(proof.patternAfter).toBe('none');
    for (const bounds of [proof.viewport, proof.active, proof.pattern]) {
      expect(bounds).not.toBeNull();
      bounds?.forEach((value, index) => expect(value).toBeCloseTo(proof.visual[index]!, 0));
    }
    expect(proof.coverage).not.toBeNull();
    // The coverage layer overshoots the visual viewport on every edge so a
    // transient toolbar-animation seam stays painted with the edge color.
    expect(proof.coverage![0]).toBeLessThanOrEqual(proof.visual[0]!);
    expect(proof.coverage![1]).toBeLessThanOrEqual(proof.visual[1]!);
    expect(proof.coverage![2]).toBeGreaterThanOrEqual(proof.visual[2]!);
    expect(proof.coverage![3]).toBeGreaterThanOrEqual(proof.visual[3]!);
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
  const noiseDimensions = await page.locator('[data-portrait-star-perlin]').evaluate((canvas) => ({
    maskWidth: Number(canvas.dataset.portraitStarPerlinNoiseMaskWidth),
    sourceWidth: Number(canvas.dataset.portraitStarPerlinSourceWidth),
    sourceHeight: Number(canvas.dataset.portraitStarPerlinSourceHeight)
  }));
  expect(noiseDimensions.maskWidth).toBeGreaterThan(0);
  expect(noiseDimensions.maskWidth).toBeLessThanOrEqual(512);
  expect(noiseDimensions.maskWidth).toBeLessThan(noiseDimensions.sourceWidth);
  expect(noiseDimensions.sourceHeight).toBeGreaterThan(0);
  const samples = [await readStarPerlinLuminance(page)];
  await page.waitForTimeout(1_100);
  samples.push(await readStarPerlinLuminance(page));
  await page.waitForTimeout(1_100);
  samples.push(await readStarPerlinLuminance(page));
  expect(samples.every(({ revision, meanLuminance }) => (
    Number.isFinite(revision) && Number.isFinite(meanLuminance)
  ))).toBe(true);
  expect(samples.at(-1)!.revision).toBeGreaterThan(samples[0]!.revision);
  const luminanceRange = Math.max(...samples.map(({ meanLuminance }) => meanLuminance))
    - Math.min(...samples.map(({ meanLuminance }) => meanLuminance));
  expect(luminanceRange, `Star Map Perlin samples: ${JSON.stringify(samples)}`).toBeGreaterThan(0.5);
  expect(Math.min(...samples.map(({ localPeakDelta }) => localPeakDelta)),
    `Star Map local contrast: ${JSON.stringify(samples)}`).toBeGreaterThan(3);
  expect(Math.max(...samples.map(({ highlightOccupancy }) => highlightOccupancy)),
    `Star Map bounded highlights: ${JSON.stringify(samples)}`).toBeLessThan(.35);
  await assertTargetContentVisible(page, FRONT_CONTENT['star-map']);
  await assertNoWhiteOrTransparentViewportEdges(page);
});

test('AOD only advances its packed-alpha source after its outgoing trusted input', async ({
  page
}) => {
  await page.goto('/#aod-animation', { waitUntil: 'domcontentloaded' });
  const before = await waitForCommitSequence(page, 'aod-animation', 0);
  await expect(page.locator('[data-phone-aod-figure-poster]')).toBeVisible();
  await expect(page.locator('.site-nav')).toHaveAttribute('data-visible', 'false');
  const playback = page.waitForFunction(() => new Promise<readonly {
    currentTime: number;
    duration: number;
    progress: number;
    canvasMediaTime: number;
  }[]>((resolve, reject) => {
    const samples: {
      currentTime: number;
      duration: number;
      progress: number;
      canvasMediaTime: number;
    }[] = [];
    const deadline = window.setTimeout(() => {
      reject(new Error(`AOD source playback did not advance: ${JSON.stringify({
        shell: { ...document.querySelector<HTMLElement>('.phone-story')?.dataset },
        activation: Boolean(document.querySelector('[data-phone-activation]:not([hidden])')),
        video: (() => {
          const node = document.querySelector<HTMLVideoElement>('[data-aod-figure-video]');
          return node ? { currentTime: node.currentTime, paused: node.paused, dataset: { ...node.dataset } } : null;
        })(),
        canvas: (() => {
          const node = document.querySelector<HTMLCanvasElement>('[data-aod-figure-canvas]');
          return node ? { dataset: { ...node.dataset } } : null;
        })()
      })}`));
    }, 10_000);
    const sample = () => {
      const shell = document.querySelector<HTMLElement>('.phone-story');
      const scene = document.querySelector<HTMLElement>('.portrait-scroll-spike__scene--aod');
      const video = document.querySelector<HTMLVideoElement>('[data-aod-figure-video]');
      const canvas = document.querySelector<HTMLCanvasElement>('[data-aod-figure-canvas]');
      const canvasVisible = canvas
        ? getComputedStyle(canvas).visibility !== 'hidden'
          && Number(getComputedStyle(canvas).opacity) > 0
          && canvas.getBoundingClientRect().height > 0
        : false;
      if (shell?.dataset.phoneStatus === 'faulted'
        || document.querySelector('[data-phone-activation]:not([hidden])')) {
        clearTimeout(deadline);
        reject(new Error('AOD playback entered a failure fallback'));
        return;
      }
      const compositorReady = document.querySelector<HTMLElement>(
        '.portrait-scroll-spike__scene--aod'
      )?.dataset.phoneAodPlaybackFrame === 'ready';
      const progress = Number(scene?.dataset.portraitAodProgress);
      const canvasMediaTime = Number(canvas?.dataset.packedAlphaMediaTime);
      if (shell?.dataset.phonePhase === 'playing'
        && video && video.currentTime > .01 && compositorReady
        && canvas?.dataset.packedAlphaFrameReady === 'true' && canvasVisible
        && Number.isFinite(progress) && Number.isFinite(canvasMediaTime)) {
        const previous = samples.at(-1);
        if (!previous || previous.currentTime !== video.currentTime) {
          samples.push({
            currentTime: video.currentTime,
            duration: video.duration,
            progress,
            canvasMediaTime
          });
        }
      }
      const first = samples[0];
      const latest = samples.at(-1);
      if (samples.length >= 3 && first && latest
        && latest.currentTime > first.currentTime
        && latest.canvasMediaTime > first.canvasMediaTime) {
        clearTimeout(deadline);
        resolve(samples);
        return;
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }));
  await sendFrontIntent(page, 'forward');
  const samples = await (await playback).jsonValue();
  expect(samples.at(-1)!.currentTime).toBeGreaterThan(samples[0]!.currentTime);
  expect(samples.at(-1)!.canvasMediaTime).toBeGreaterThan(samples[0]!.canvasMediaTime);
  const mapped = samples.filter((sample) => sample.duration > 0).map((sample) => {
    const alphaEnd = .48;
    const sourceEnd = 16 / 77;
    const expected = sample.progress <= alphaEnd
      ? sample.progress / alphaEnd * sourceEnd
      : sourceEnd + (sample.progress - alphaEnd) / (1 - alphaEnd) * (1 - sourceEnd);
    return Math.abs(sample.canvasMediaTime / sample.duration - expected);
  });
  expect(Math.max(...mapped)).toBeLessThan(.16);
  await waitForCommitSequence(page, 'method-top', before);
  await expect(page.locator('[data-phone-activation]:not([hidden])')).toHaveCount(0);
});

test('Grade A direct entries expose the requested target before Loader retirement', async ({
  page
}) => {
  for (const scene of Object.keys(GRADE_A_CONTENT) as Array<keyof typeof GRADE_A_CONTENT>) {
    await page.goto(`/?r5-direct=${scene}${GRADE_A_HASH[scene]}`, {
      waitUntil: 'domcontentloaded'
    });
    await waitForDirectEntryCommit(page, scene);
    await assertSinglePhoneAuthority(page);
    await assertTargetContentVisible(page, GRADE_A_CONTENT[scene]);
    await assertNoWhiteOrTransparentViewportEdges(page);
    await expect(page.locator('[data-story-loader="true"]'))
      .toHaveAttribute('data-loader-status', 'hidden');
    if (scene === 'figure2-animation') {
      await expect(page.locator('[data-phone-figure2-poster]')).toBeVisible();
      await assertDecodedPoster(page, '[data-phone-figure2-poster]');
      await expect(page.locator('[data-stage-retained-figure2-arch="true"]'))
        .toHaveCount(1);
      expect(await page.locator('[data-stage-retained-figure2-arch="true"]')
        .evaluate((arch) => Boolean(arch.closest('[data-figure2-depth-ranked-field="true"]'))))
        .toBe(false);
    }
  }
});

test('Figure2 staged media holds its midpoint during the real z-depth leg', async ({ page }) => {
  await page.goto('/#method-top', { waitUntil: 'domcontentloaded' });
  await waitForCommitSequence(page, 'method-top', 0);
  await waitForContinuousStoryReady(page);
  await prepareCompleteStoryNativeEdge(page, 'method-top', 'forward');
  const stop = await recordPhoneStoryFrames(page);
  await nextAnimationFrame(page);
  await sendFrontIntent(page, 'forward');
  await waitForCommitSequence(page, 'figure2-animation', 0);
  await waitForContinuousStoryReady(page);
  const video = page.locator('[data-figure2-combined-video]');
  await expect(video).toHaveCount(1);

  const tracePromise = page.evaluate(() => new Promise<Readonly<{
    elapsed: number;
    status: string | undefined;
    phase: string | undefined;
    failure: string | undefined;
    scene: string | undefined;
    progress: string | undefined;
    currentTime: number;
    paused: boolean;
    canvasMediaTime: number;
  }>[]>((resolve) => {
    const startedAt = performance.now();
    const samples: Array<{
      elapsed: number;
      phase: string | undefined;
      scene: string | undefined;
      progress: string | undefined;
      currentTime: number;
      paused: boolean;
      canvasMediaTime: number;
    }> = [];
    const sample = () => {
      const shell = document.querySelector<HTMLElement>('.phone-story');
      const figure = document.querySelector<HTMLElement>('.phone-figure2');
      const media = document.querySelector<HTMLVideoElement>('[data-figure2-combined-video]');
      const canvas = document.querySelector<HTMLCanvasElement>('[data-figure2-packed-alpha-canvas]');
      if (shell && media) samples.push({
        elapsed: performance.now() - startedAt,
        phase: shell.dataset.phonePhase,
        scene: shell.dataset.phoneScene,
        progress: figure?.dataset.figure2Progress,
        currentTime: media.currentTime,
        paused: media.paused,
        canvasMediaTime: Number(canvas?.dataset.packedAlphaMediaTime)
      });
      if (performance.now() - startedAt >= 5_000
        || shell?.dataset.phoneStatus === 'faulted'
        || shell?.dataset.phoneScene === 'figure2-proof') {
        resolve(samples);
        return;
      }
      window.setTimeout(sample, 100);
    };
    sample();
  }));
  await sendFrontIntent(page, 'forward');
  const trace = await tracePromise;
  const held = trace.filter(({ phase, elapsed }) => (
    phase === 'dwelling' || (phase === 'playing' && elapsed >= 3_650)
  ));
  const mediaPlaying = trace.filter(({ phase }) => phase === 'playing');
  expect(held, `Figure2 staged media trace: ${JSON.stringify(trace)}`).not.toHaveLength(0);
  expect(held.every(({ paused }) => paused),
    `Figure2 z-depth media should be paused: ${JSON.stringify(held)}`).toBe(true);
  expect(Math.max(...held.map(({ currentTime }) => currentTime))
    - Math.min(...held.map(({ currentTime }) => currentTime))).toBeLessThan(0.08);
  expect(held.at(-1)!.currentTime).toBeCloseTo(2.6, 1);
  const visibleTimes = mediaPlaying.map(({ canvasMediaTime }) => canvasMediaTime)
    .filter(Number.isFinite);
  expect(Math.max(...visibleTimes) - Math.min(...visibleTimes)).toBeGreaterThan(.12);
  expectComplementaryFigure2ProofDepth(await stop(), 'forward');
});
test('Figure2 conceal mask removes source pixels during the Proof reveal', async ({ page }) => {
  await page.goto('/#figure2-animation', { waitUntil: 'domcontentloaded' });
  const before = await waitForDirectEntryCommit(page, 'figure2-animation');
  await waitForContinuousStoryReady(page);
  await sendFrontIntent(page, 'forward');
  await expectFigure2ConcealPixels(page);
  await waitForCommitSequence(page, 'figure2-proof', before);
});

for (const direction of ['forward', 'reverse'] as const) {
  test(`Figure2 ${direction} fixed-plane masks stay pixel-complementary`, async ({ page }) => {
    const source = direction === 'forward' ? 'figure2-animation' : 'figure2-proof';
    for (const target of [.25, .5, .75]) {
      const hash = direction === 'forward' ? 'figure2-animation' : 'figure2-proof';
      await page.goto(`/?depth-probe=${direction}-${target}#${hash}`, {
        waitUntil: 'domcontentloaded'
      });
      await waitForDirectEntryCommit(page, source);
      await waitForContinuousStoryReady(page);
      await sendFrontIntent(page, direction);
      const release = await freezeDepthAt(page, target);
      try {
        const geometry = await page.locator('.phone-story').evaluate((shell) => {
          const conceal = shell.querySelector<HTMLElement>(
            '[data-phone-plane][data-r4-depth-mask-polarity="conceal"]'
          );
          const reveal = shell.querySelector<HTMLElement>(
            '[data-phone-plane][data-r4-depth-mask-polarity="reveal"]'
          );
          const arch = shell.querySelector<HTMLElement>(
            '[data-stage-retained-figure2-arch="true"]'
          );
          const rect = (node: HTMLElement | null) => node
            ? [node.getBoundingClientRect().left, node.getBoundingClientRect().top,
              node.getBoundingClientRect().right, node.getBoundingClientRect().bottom]
            : null;
          return {
            conceal: rect(conceal), reveal: rect(reveal),
            progress: Number(reveal?.dataset.r4DepthMaskProgress),
            concealMask: conceal ? getComputedStyle(conceal).webkitMaskImage : 'none',
            revealMask: reveal ? getComputedStyle(reveal).webkitMaskImage : 'none',
            concealComposite: conceal ? getComputedStyle(conceal).webkitMaskComposite : 'none',
            runtimeSvgMasks: shell.querySelectorAll('svg mask').length,
            archMask: arch ? getComputedStyle(arch).maskImage
              || getComputedStyle(arch).webkitMaskImage : 'none',
            archZ: Number(getComputedStyle(arch?.parentElement ?? arch!).zIndex),
            effectZ: Number(getComputedStyle(shell.querySelector<HTMLElement>(
              '[data-phone-plane="effect"]'
            )!).zIndex)
          };
        });
        expect(geometry.conceal).toEqual(geometry.reveal);
        expect(geometry.progress).toBeGreaterThanOrEqual(target);
        expect([geometry.concealMask, geometry.revealMask]
          .filter((value) => value !== 'none').every((value) => value.includes('.webp'))).toBe(true);
        expect(geometry.concealMask).not.toContain('#');
        expect(geometry.revealMask).not.toContain('#');
        expect(geometry.runtimeSvgMasks).toBe(0);
        expect(geometry.archMask).toBe('none');
        expect(geometry.archZ).toBeGreaterThan(geometry.effectZ);
        const errors = complementaryMaskPixelErrors(await captureDepthPlanePartition(page));
        expect(errors.holes, `${direction} ${target} holes`).toBeLessThan(errors.pixels * .002);
        expect(errors.overlaps,
          `${direction} ${target} overlaps ${JSON.stringify(geometry)}`)
          .toBeLessThan(errors.pixels * .002);
      } finally {
        await release();
      }
    }
  });
}

test('Figure2 retained arch enters with the target boundary and survives commit', async ({ page }) => {
  await page.goto('/#method-top', { waitUntil: 'domcontentloaded' });
  await waitForCommitSequence(page, 'method-top', 0);
  await waitForContinuousStoryReady(page);
  await prepareCompleteStoryNativeEdge(page, 'method-top', 'forward');
  await sendFrontIntent(page, 'forward');
  const arch = page.locator('[data-stage-retained-figure2-arch="true"]');
  await page.waitForFunction(() => {
    const shell = document.querySelector<HTMLElement>('.phone-story');
    const target = document.querySelector<HTMLElement>(
      '.phone-story__retained-figure2-arch-layer[data-phone-figure2-arch-owner="target"]'
    );
    return shell?.dataset.phoneCandidateScene === 'figure2-animation'
      && shell.dataset.phoneStatus === 'transaction'
      && !shell.hasAttribute('data-phone-transition-live')
      && target !== null;
  }, undefined, { timeout: 15_000 });
  const preparing = await arch.evaluate((element) => ({
    visibility: getComputedStyle(element).visibility,
    opacity: Number(getComputedStyle(element).opacity),
    ready: element.getAttribute('data-phone-figure2-arch-ready')
  }));
  expect(preparing.visibility).toBe('hidden');
  expect(preparing.opacity).toBe(0);

  await page.waitForFunction(() => {
    const shell = document.querySelector<HTMLElement>('.phone-story');
    const arch = document.querySelector<HTMLImageElement>(
      '[data-stage-retained-figure2-arch="true"]'
    );
    return shell?.hasAttribute('data-phone-transition-live')
      && arch?.dataset.phoneFigure2ArchReady === 'true';
  }, undefined, { timeout: 15_000 });
  const live = await arch.evaluate((element) => ({
    visibility: getComputedStyle(element).visibility,
    opacity: Number(getComputedStyle(element).opacity),
    inPlanes: Boolean(element.closest('.phone-story__planes')),
    archZ: Number(getComputedStyle(element.parentElement!).zIndex),
    effectZ: Number(getComputedStyle(document.querySelector<HTMLElement>(
      '[data-phone-plane="effect"]'
    )!).zIndex),
    archClip: getComputedStyle(element.parentElement!).clipPath,
    receiverClip: getComputedStyle(document.querySelector<HTMLElement>(
      '[data-phone-plane="receiver"]'
    )!).clipPath
  }));
  expect(live.visibility).toBe('visible');
  expect(live.opacity).toBeGreaterThan(0);
  expect(live.inPlanes).toBe(false);
  expect(live.archZ).toBeLessThan(live.effectZ);
  expect(live.archClip).toBe(live.receiverClip);

  await waitForCommitSequence(page, 'figure2-animation', 0);
  const stable = await arch.evaluate((element) => ({
    visibility: getComputedStyle(element).visibility,
    opacity: Number(getComputedStyle(element).opacity),
    owner: element.parentElement?.getAttribute('data-phone-figure2-arch-owner')
  }));
  expect(stable.visibility).toBe('visible');
  expect(stable.opacity).toBeGreaterThan(0);
  expect(stable.owner).toBeNull();
});

test('Figure2 reverse z-depth keeps only the paused endpoint Canvas visible', async ({ page }) => {
  await page.goto('/#figure2-proof', { waitUntil: 'domcontentloaded' });
  await waitForDirectEntryCommit(page, 'figure2-proof');
  await waitForContinuousStoryReady(page);

  const tracePromise = page.evaluate(() => new Promise<Readonly<{
    elapsed: number;
    status: string | undefined;
    phase: string | undefined;
    failure: string | undefined;
    progress: number;
    currentTime: number;
    paused: boolean;
    canvasReady: boolean;
    canvasTime: number;
  }>[]>((resolve) => {
    const startedAt = performance.now();
    const samples: Array<{
      elapsed: number;
      status: string | undefined;
      phase: string | undefined;
      failure: string | undefined;
      progress: number;
      currentTime: number;
      paused: boolean;
      canvasReady: boolean;
      canvasTime: number;
    }> = [];
    let enteredDwell = false;
    const sample = () => {
      const shell = document.querySelector<HTMLElement>('.phone-story');
      const figure = document.querySelector<HTMLElement>('.phone-figure2');
      const animation = document.querySelector<HTMLElement>(
        '[data-r4-scene="figure2-animation"]'
      );
      const media = document.querySelector<HTMLVideoElement>('[data-figure2-combined-video]');
      const canvas = document.querySelector<HTMLCanvasElement>(
        '[data-figure2-packed-alpha-canvas]'
      );
      const phase = shell?.dataset.phonePhase;
      const progress = Number(animation?.dataset.figure2Progress);
      if (phase === 'dwelling') enteredDwell = true;
      if (enteredDwell && phase === 'playing') {
        resolve(samples);
        return;
      }
      if (media && Number.isFinite(progress)) {
        samples.push({
          elapsed: performance.now() - startedAt,
          status: shell?.dataset.phoneStatus,
          phase,
          failure: shell?.dataset.phoneLastFailure,
          progress,
          currentTime: media.currentTime,
          paused: media.paused,
          canvasReady: figure?.dataset.phoneFigure2CanvasReady === 'true',
          canvasTime: Number(canvas?.dataset.packedAlphaMediaTime)
        });
      }
      if (performance.now() - startedAt >= 6_000
        || shell?.dataset.phoneStatus === 'faulted') {
        resolve(samples);
        return;
      }
      requestAnimationFrame(sample);
    };
    sample();
  }));

  await sendFrontIntent(page, 'reverse');
  const trace = await tracePromise;
  const depthTrace = trace.filter(({ phase }) => phase === 'playing' || phase === 'dwelling');
  expect(depthTrace, `Figure2 reverse z-depth trace: ${JSON.stringify(trace)}`)
    .not.toHaveLength(0);
  expect(depthTrace.some(({ phase }) => phase === 'playing')).toBe(true);
  expect(depthTrace.some(({ phase }) => phase === 'dwelling')).toBe(true);
  expect(depthTrace.every(({ paused }) => paused),
    `Figure2 reverse z-depth must remain paused: ${JSON.stringify(trace)}`).toBe(true);
  expect(depthTrace.every(({ canvasReady }) => canvasReady),
    `Figure2 reverse endpoint Canvas must be proven: ${JSON.stringify(trace)}`).toBe(true);
  expect(Math.max(...depthTrace.map(({ currentTime }) => currentTime))
    - Math.min(...depthTrace.map(({ currentTime }) => currentTime))).toBeLessThan(0.08);
  expect(depthTrace.at(-1)!.currentTime).toBeCloseTo(2.6, 1);
  const canvasTimes = depthTrace.map(({ canvasTime }) => canvasTime).filter(Number.isFinite);
  expect(canvasTimes, `Figure2 reverse Canvas times: ${JSON.stringify(trace)}`).not.toHaveLength(0);
  expect(Math.max(...canvasTimes) - Math.min(...canvasTimes)).toBeLessThan(0.08);
  expect(canvasTimes.at(-1)!).toBeCloseTo(2.6, 1);
});

test('Figure2 reverse media stage uses the authored reverse half to reach visual frame zero', async ({
  page
}) => {
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    const owner = window as typeof window & { __r5Figure2PlayCount?: number };
    owner.__r5Figure2PlayCount = 0;
    HTMLMediaElement.prototype.play = function patchedPlay() {
      if (this.matches('[data-figure2-combined-video]')) {
        owner.__r5Figure2PlayCount = (owner.__r5Figure2PlayCount ?? 0) + 1;
      }
      return play.call(this);
    };
  });
  await page.goto('/#figure2-proof', { waitUntil: 'domcontentloaded' });
  const before = await waitForDirectEntryCommit(page, 'figure2-proof');
  await waitForContinuousStoryReady(page);

  const stop = await recordPhoneStoryFrames(page);
  await nextAnimationFrame(page);
  await sendFrontIntent(page, 'reverse');
  await waitForCommitSequence(page, 'figure2-animation', before);
  const trace = await stop();
  expectComplementaryFigure2ProofDepth(trace, 'reverse');
  const transaction = trace.filter(({ shell }) => (
    shell?.phoneStatus === 'transaction'
    && shell.phoneSourceScene === 'figure2-proof'
    && shell.phoneCandidateScene === 'figure2-animation'
  ));
  const transactionFrames = transaction.flatMap((sample) => {
    const video = sample.media.find(({ surfaceId }) => surfaceId === 'figure2-pair-video');
    const frame = sample.canvases.find(({ surfaceId }) => surfaceId === 'figure2-pair-canvas');
    return video && frame ? [{ video, frame }] : [];
  });
  const presentedFrames = transactionFrames.filter(({ frame }) => (
    Number.isFinite(frame.mediaTime)
  ));
  const media = presentedFrames.map(({ video }) => video);
  const canvas = presentedFrames.map(({ frame }) => frame);
  expect(media, `Figure2 reverse media trace: ${JSON.stringify(trace)}`).not.toHaveLength(0);
  expect(media.length).toBeGreaterThan(4);
  expect(media.every(({ paused }) => paused),
    `Figure2 reverse media must remain paused: ${JSON.stringify(trace)}`).toBe(true);
  const mediaTimes = media.map(({ currentTime }) => currentTime);
  expect(Math.min(...mediaTimes)).toBeCloseTo(2.6, 1);
  expect(Math.max(...mediaTimes)).toBeGreaterThan(5.0);
  expect(Math.max(...mediaTimes)).toBeCloseTo(5.1667, 1);
  expect(mediaTimes.at(-1)!).toBeCloseTo(5.1667, 1);
  expect(mediaTimes.every((value, index) => index === 0
    || value >= mediaTimes[index - 1]! - .005),
  `Figure2 reverse media was not ascending: ${JSON.stringify(media)}`).toBe(true);
  expect(mediaTimes.some((value, index) => index > 0
    && value > mediaTimes[index - 1]! + .005),
  `Figure2 reverse media did not advance: ${JSON.stringify(media)}`).toBe(true);
  expect(canvas.length).toBeGreaterThan(2);
  const canvasTimes = canvas.map(({ mediaTime }) => mediaTime!);
  expect(canvasTimes).not.toHaveLength(0);
  expect(Math.min(...canvasTimes)).toBeCloseTo(2.6, 1);
  expect(Math.max(...canvasTimes)).toBeGreaterThan(5.0);
  expect(Math.max(...canvasTimes)).toBeCloseTo(5.1667, 1);
  expect(canvasTimes.at(-1)!).toBeCloseTo(5.1667, 1);
  expect(canvasTimes.every((value, index) => index === 0
    || value >= canvasTimes[index - 1]! - .005),
  `Figure2 reverse Canvas was not ascending: ${JSON.stringify(canvas)}`).toBe(true);
  expect(canvasTimes.some((value, index) => index > 0
    && value > canvasTimes[index - 1]! + .005),
  `Figure2 reverse Canvas did not advance: ${JSON.stringify(canvas)}`).toBe(true);
  const playCount = await page.evaluate(() => (
    (window as typeof window & { __r5Figure2PlayCount?: number }).__r5Figure2PlayCount ?? 0
  ));
  expect(playCount).toBe(0);
  await expect(page.locator('[data-phone-activation]:not([hidden])')).toHaveCount(0);
});

test('Figure3 initial surface uses decoded frame zero and fills the visual viewport', async ({ page }) => {
  await page.goto('/#brand', { waitUntil: 'domcontentloaded' });
  const before = await waitForCommitSequence(page, 'brand', 0);
  await waitForContinuousStoryReady(page);
  const scene = page.locator('.phone-figure3');
  await expect(scene).toHaveAttribute(
    'data-phone-figure3-initial-surface', 'poster-fallback'
  );
  const prewarmLineage = await scene.getAttribute('data-phone-figure3-proof-lineage');
  expect(prewarmLineage).toMatch(/^\d+\|prewarm:/);
  const stop = await recordPhoneStoryFrames(page);
  await nextAnimationFrame(page);
  await sendFrontIntent(page, 'forward');
  await waitForCommitSequence(page, 'figure3-animation', before);
  await nextAnimationFrame(page);
  const trace = await stop();
  const transaction = trace.filter((sample) => (
    sample.shell?.phoneStatus === 'transaction'
    && sample.shell.phoneSourceScene === 'brand'
    && sample.shell.phoneCandidateScene === 'figure3-animation'
    && sample.figure3
  ));
  expect(transaction, `Brand → Figure3 surface trace: ${JSON.stringify(trace)}`)
    .not.toHaveLength(0);
  expect(transaction.map(({ figure3 }) => figure3?.initialSurface))
    .not.toContain('poster-fallback');
  const live = transaction.filter(({ transitionLive }) => transitionLive);
  expect(live, `Brand → Figure3 live trace: ${JSON.stringify(trace)}`).not.toHaveLength(0);
  expect(live.every(({ figure3 }) => (
    figure3?.initialSurface === 'video-frame-zero'
    && figure3.canvasVisible && !figure3.posterVisible
  )), `Brand → Figure3 exposed the wrong surface: ${JSON.stringify(trace)}`).toBe(true);
  const formalLineages = transaction.map(({ figure3 }) => (
    figure3?.proofLineage
  )).filter((lineage): lineage is string => Boolean(lineage));
  const formalGenerations = new Set(formalLineages.map((lineage) => lineage.split('|')[0]));
  expect(formalGenerations.size).toBe(1);
  expect(formalLineages.every((lineage) => !lineage.includes('|prewarm:'))).toBe(true);
  expect([...formalGenerations][0]).not.toBe(prewarmLineage?.split('|')[0]);

  const canvas = page.locator<HTMLCanvasElement>('[data-phone-figure3-paper-canvas]');
  const poster = page.locator('[data-phone-figure3-paper-poster]');
  await expect(scene).toHaveAttribute(
    'data-phone-figure3-initial-surface', 'video-frame-zero'
  );
  await expect(canvas).toHaveAttribute('data-phone-figure3-paper-frame', 'ready');
  await expect(canvas).toHaveAttribute('data-phone-figure3-paper-frame-index', '0');
  await expect(canvas).toBeVisible();
  await expect(poster).toBeHidden();
  const geometry = await page.evaluate(() => {
    const selectors = [
      '.phone-figure3__mount', '.phone-figure3',
      '[data-phone-figure3-initial-composite]',
      '.phone-figure3 .figure3-transition__stage',
      '[data-phone-figure3-paper-poster]', '[data-phone-figure3-paper-canvas]'
    ];
    return {
      visualBottom: (visualViewport?.offsetTop ?? 0) + (visualViewport?.height ?? innerHeight),
      rects: selectors.map((selector) => {
        const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
        return { selector, top: rect?.top ?? Number.NaN, bottom: rect?.bottom ?? Number.NaN };
      }),
      media: (() => {
        const video = document.querySelector<HTMLVideoElement>('.phone-figure3 video');
        return video ? {
          currentTime: video.currentTime,
          paused: video.paused,
          readyState: video.readyState,
          seeking: video.seeking
        } : null;
      })()
    };
  });
  expect(geometry.media).toMatchObject({ paused: true, seeking: false });
  expect(geometry.media?.readyState).toBeGreaterThanOrEqual(2);
  expect(geometry.media?.currentTime).toBeLessThanOrEqual(.05);
  for (const rect of geometry.rects) {
    if (rect.selector === '[data-phone-figure3-paper-poster]') {
      expect(rect.top, rect.selector).toBeLessThanOrEqual(0);
      expect(rect.bottom, rect.selector).toBeGreaterThanOrEqual(geometry.visualBottom);
      continue;
    }
    expect(rect.top, rect.selector).toBeCloseTo(0, 0);
    expect(rect.bottom, rect.selector).toBeCloseTo(geometry.visualBottom, 0);
  }
});

test('Brand to Figure3 commits the static initial endpoint on the real leaf', async ({ page }) => {
  await page.goto('/#brand', { waitUntil: 'domcontentloaded' });
  await waitForCommitSequence(page, 'brand', 0);
  await waitForContinuousStoryReady(page);
  const before = await readCommitSequence(page);
  await sendFrontIntent(page, 'forward');
  const outcome = await page.waitForFunction((after) => {
    const shell = document.querySelector<HTMLElement>('.phone-story');
    if (!shell) return null;
    const sequence = Number(shell.dataset.phoneCommitSequence);
    if (shell.dataset.phoneScene === 'figure3-animation' && sequence > after) {
      return { kind: 'committed' as const, dataset: { ...shell.dataset } };
    }
    if (shell.dataset.phoneStatus === 'stable' && shell.dataset.phoneScene === 'brand') {
      return { kind: 'rolled-back' as const, dataset: { ...shell.dataset } };
    }
    return null;
  }, before, { timeout: 15_000 });
  const result = await outcome.jsonValue() as Readonly<{
    kind: 'committed' | 'rolled-back';
    dataset: Readonly<Record<string, string>>;
  }>;
  if (result.kind === 'rolled-back') {
    throw new Error(`Brand → Figure3 rolled back on the real leaf: ${JSON.stringify({
      result,
      diagnostic: await readPhoneStoryDiagnostic(page)
    })}`);
  }
  await expect(page.locator('.phone-figure3')).toHaveAttribute(
    'data-phone-figure3-initial-surface', 'video-frame-zero'
  );
  await expect(page.locator('[data-phone-figure3-paper-canvas]')).toBeVisible();
  await expect(page.locator('[data-phone-figure3-paper-canvas]'))
    .toHaveAttribute('data-phone-figure3-paper-frame', 'ready');
  await expect(page.locator('[data-phone-figure3-paper-canvas]'))
    .toHaveAttribute('data-phone-figure3-paper-frame-index', '0');
  const media = await page.locator('.phone-figure3 video').evaluate((video) => ({
    paused: video.paused,
    currentTime: video.currentTime,
    readyState: video.readyState
  }));
  expect(media.paused).toBe(true);
});

test('Figure2 to Proof, Proof to Brand and Brand to Figure3 commit buffers atomically', async ({ page }) => {
  for (const { source, target, hash } of [
    { source: 'figure2-animation', target: 'figure2-proof', hash: '#figure2-animation' },
    { source: 'figure2-proof', target: 'brand', hash: '#figure2-proof-closing' },
    { source: 'brand', target: 'figure3-animation', hash: '#brand' }
  ] as const) {
    await page.goto(`/?r5-atomic=${source}-${target}${hash}`, {
      waitUntil: 'domcontentloaded'
    });
    const before = await waitForDirectEntryCommit(page, source);
    await waitForContinuousStoryReady(page);
    const stop = await recordPhoneStoryFrames(page);
    await nextAnimationFrame(page);
    await sendFrontIntent(page, 'forward');
    await waitForCommitSequence(page, target, before);
    await nextAnimationFrame(page);
    const samples = await stop();
    const relevant = samples.filter((sample) => (
      sample.shell?.phoneStatus === 'transaction'
      || sample.shell?.phoneScene === target
    ));
    expect(relevant, `${source} → ${target} frame trace`).not.toHaveLength(0);
    for (const sample of relevant) {
      if (sample.transitionLive) {
        expect([...sample.exposedBuffers].sort(), `${source} → ${target} live buffers`)
          .toEqual(['a', 'b']);
      }
      if (sample.shell?.phoneStatus === 'stable' && sample.shell.phoneScene === target) {
        expect(sample.exposedBuffers, `${source} → ${target} stable exposure`)
          .toEqual([sample.shell.phoneStableBuffer]);
      }
    }
    if (source === 'figure2-proof') {
      const stable = samples.filter(({ shell, proofClosing }) => (
        shell?.phoneStatus === 'stable' && shell.phoneScene === source && proofClosing
      )).at(-1);
      const firstTransaction = samples.find(({ shell, proofClosing }) => (
        shell?.phoneStatus === 'transaction'
        && shell.phoneSourceScene === source
        && shell.phoneCandidateScene === target
        && proofClosing
      ));
      expect(stable?.proofClosing?.text)
        .toBe('同野观幂做第四种：先进现场，再定章法，陪你跑到账上有数。');
      expect(firstTransaction?.proofClosing?.text).toBe(stable?.proofClosing?.text);
      stable?.proofClosing?.rect.forEach((value, index) => {
        expect(firstTransaction!.proofClosing!.rect[index], `Proof first-frame rect[${index}]`)
          .toBeCloseTo(value, 0);
      });
      expect(Number.parseFloat(firstTransaction?.figure2Arch?.blur ?? '')).toBeCloseTo(3.6, 3);
      expect(Number.parseFloat(firstTransaction?.figure2Arch?.scale ?? '')).toBeCloseTo(1.135, 3);
      expect(Number.parseFloat(firstTransaction?.figure2Arch?.brightness ?? '')).toBeCloseTo(.76, 3);
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
  const proofArch = await page.locator('[data-stage-retained-figure2-arch="true"]')
    .evaluate((arch) => {
      const style = getComputedStyle(arch);
      return {
        blur: style.getPropertyValue('--r4-figure2-near-arch-blur').trim(),
        scale: style.getPropertyValue('--r4-figure2-near-arch-scale').trim(),
        brightness: style.getPropertyValue('--r4-figure2-near-arch-brightness').trim()
      };
    });
  expect(proofArch).toEqual({ blur: '3.6px', scale: '1.135', brightness: '.76' });
  await traverseGradeA(page, 'figure2-proof', 'brand', 'forward');
  await traverseGradeA(page, 'brand', 'figure2-proof', 'reverse');
  await traverseGradeA(page, 'figure2-proof', 'figure2-animation', 'reverse');
  await traverseGradeA(page, 'figure2-animation', 'method-top', 'reverse');
});

test('stable Proof exposes retained arch pixels above the native copy', async ({ page }) => {
  await page.goto('/#figure2-proof-opening', { waitUntil: 'domcontentloaded' });
  await waitForDirectEntryCommit(page, 'figure2-proof');
  await waitForContinuousStoryReady(page);
  const arch = page.locator('[data-stage-retained-figure2-arch="true"]');
  await expect(arch).toBeVisible();
  await expect(arch).toHaveAttribute('data-phone-figure2-arch-ready', 'true');
  const visible = await page.screenshot();
  await arch.evaluate((element) => { (element as HTMLElement).style.visibility = 'hidden'; });
  await nextAnimationFrame(page);
  const hidden = await page.screenshot();
  await arch.evaluate((element) => { (element as HTMLElement).style.visibility = ''; });
  expect(changedScreenshotPixels(visible, hidden),
    'retained arch contributes stable Proof pixels').toBeGreaterThan(10_000);

  await page.evaluate(() => {
    const marker = document.createElement('div');
    marker.dataset.proofArchOcclusionProbe = 'true';
    Object.assign(marker.style, {
      position: 'fixed', inset: '0', background: '#ff00ff', zIndex: '999999'
    });
    document.querySelector<HTMLElement>('.phone-story__reading-flow')?.append(marker);
  });
  await nextAnimationFrame(page);
  const coveredCopy = await page.screenshot();
  await arch.evaluate((element) => { (element as HTMLElement).style.visibility = 'hidden'; });
  await nextAnimationFrame(page);
  const exposedCopy = await page.screenshot();
  expect(changedScreenshotPixels(coveredCopy, exposedCopy),
    'retained arch physically occludes reading-owned pixels').toBeGreaterThan(10_000);
  await page.evaluate(() => {
    document.querySelector('[data-proof-arch-occlusion-probe]')?.remove();
    const arch = document.querySelector<HTMLElement>('[data-stage-retained-figure2-arch="true"]');
    if (arch) arch.style.visibility = '';
  });
});

test('Proof keeps retained arch pixels while a toolbar reproject owns native reading', async ({ page }) => {
  await page.goto('/#figure2-proof-opening', { waitUntil: 'domcontentloaded' });
  await waitForDirectEntryCommit(page, 'figure2-proof');
  await waitForContinuousStoryReady(page);
  await page.addStyleTag({ content: `
    *, *::before, *::after {
      animation: none !important;
      caret-color: transparent !important;
      transition: none !important;
    }
  ` });
  const shell = page.locator('.phone-story');
  await shell.evaluate((element) => { (element as HTMLElement).dataset.phoneStatus = 'transaction'; });
  await expect(page.locator(
    '.phone-story__reading-flow [data-phone-reading="figure2-proof"]'
  )).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  const arch = page.locator('[data-stage-retained-figure2-arch="true"]');
  const visible = await page.screenshot();
  await arch.evaluate((element) => { (element as HTMLElement).style.visibility = 'hidden'; });
  const hidden = await page.screenshot();
  await arch.evaluate((element) => { (element as HTMLElement).style.visibility = ''; });
  expect(changedScreenshotPixels(visible, hidden),
    'retained arch contributes pixels during Proof reproject').toBeGreaterThan(10_000);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForDirectEntryCommit(page, 'figure2-proof');
  await waitForContinuousStoryReady(page);
  const reprojectShell = page.locator('.phone-story');
  const originalPlaneRevision = await reprojectShell.getAttribute('data-phone-plane-revision');
  await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>('.phone-story');
    if (!shell) return;
    const owner = window as typeof window & {
      __proofReprojectSamples?: string[]; __proofReprojectObserver?: MutationObserver
    };
    owner.__proofReprojectSamples = [];
    owner.__proofReprojectObserver = new MutationObserver(() => {
      if (shell.dataset.phoneStatus !== 'transaction' || shell.dataset.phoneReading !== 'enabled') return;
      const reading = document.querySelector<HTMLElement>(
        '.phone-story__reading-flow [data-phone-reading="figure2-proof"]'
      );
      if (reading) owner.__proofReprojectSamples?.push(getComputedStyle(reading).backgroundColor);
    });
    owner.__proofReprojectObserver.observe(shell, { attributes: true });
  });
  await page.setViewportSize({ width: 390, height: 780 });
  await expect.poll(() => page.evaluate(() => (
    (window as typeof window & { __proofReprojectSamples?: string[] }).__proofReprojectSamples
  ))).toContain('rgba(0, 0, 0, 0)');
  await expect(reprojectShell).toHaveAttribute('data-phone-status', 'stable');
  await expect.poll(() => reprojectShell.getAttribute('data-phone-plane-revision'))
    .not.toBe(originalPlaneRevision);
  await page.evaluate(() => {
    const owner = window as typeof window & {
      __proofReprojectSamples?: string[]; __proofReprojectObserver?: MutationObserver
    };
    owner.__proofReprojectObserver?.disconnect();
    delete owner.__proofReprojectObserver;
  });
});

test('Proof closing keeps exactly three text line boxes across supported phone widths', async ({ page }) => {
  await page.addInitScript(() => {
    (window as typeof window & { __r5PhoneRuntimeLog?: unknown[] }).__r5PhoneRuntimeLog = [];
  });
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`/?proof-width=${width}#figure2-proof-closing`, {
      waitUntil: 'domcontentloaded'
    });
    await waitForDirectEntryCommit(page, 'figure2-proof');
    const lines = page.locator(
      '.phone-story__reading-flow [data-phone-reading="figure2-proof"] '
        + '[data-r4-proof-panel="closing"] .r4-proof-closing__line'
    );
    await expect(lines).toHaveCount(3);
    const layout = await lines.evaluateAll((nodes) => nodes.map((node) => {
      const element = node as HTMLElement;
      const range = document.createRange();
      range.selectNodeContents(element);
      const rects = [...range.getClientRects()].filter(({ width, height }) => width > .5 && height > .5);
      return {
        text: element.textContent?.trim() ?? '',
        lineBoxes: rects.length,
        top: rects[0]?.top ?? Number.NaN,
        noOverflow: element.scrollWidth <= element.clientWidth + 1
      };
    }));
    expect(layout.map(({ text }) => text)).toEqual([
      '同野观幂做第四种：', '先进现场，再定章法，', '陪你跑到账上有数。'
    ]);
    expect(layout.every(({ lineBoxes }) => lineBoxes === 1), `${width}px layout`).toBe(true);
    expect(new Set(layout.map(({ top }) => Math.round(top))).size, `${width}px rows`).toBe(3);
    expect(layout.every(({ noOverflow }) => noOverflow), `${width}px overflow`).toBe(true);
  }
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
    await waitForDirectEntryCommit(page, scene);
    await assertSinglePhoneAuthority(page);
    await assertTargetContentVisible(page, FIGURE3_SLICE_CONTENT[scene]);
    await assertNoWhiteOrTransparentViewportEdges(page);
    if (scene === 'figure3-animation') {
      await expect(page.locator('.phone-figure3')).toHaveAttribute(
        'data-phone-figure3-initial-surface', 'video-frame-zero'
      );
      await expect(page.locator('[data-phone-figure3-paper-canvas]'))
        .toHaveAttribute('data-phone-figure3-paper-frame', 'ready');
      await expect(page.locator('[data-phone-figure3-paper-canvas]'))
        .toHaveAttribute('data-phone-figure3-paper-frame-index', '0');
      await expect(page.locator('.phone-figure3 video')).toHaveCount(1);
      await expect(page.locator('.phone-figure3 canvas')).toHaveCount(1);
    }
  }
});

test('Figure3 slice commits forward and reverse twice without resource growth', async ({ page }) => {
  const diagnostic = await startFigure3MediaDiagnostic(page);
  try {
    await page.goto('/#brand', { waitUntil: 'domcontentloaded' });
    await waitForCommitSequence(page, 'brand', 0);
    const cycle = async () => [
      await traverseFigure3Slice(page, 'brand', 'figure3-animation', 'forward'),
      await traverseFigure3Slice(page, 'figure3-animation', 'services', 'forward'),
      await traverseFigure3Slice(page, 'services', 'figure3-animation', 'reverse'),
      await traverseFigure3Slice(page, 'figure3-animation', 'brand', 'reverse')
    ];
    const first = await cycle();
    await diagnostic.mark('second-cycle-start');
    const second = await cycle();
    expect(second).toEqual(first);
    for (const sample of second) {
      expect(sample.videos).toBeLessThanOrEqual(2);
      expect(sample.canvases).toBeLessThanOrEqual(2);
      expect(sample.activeDecoders).toBeLessThanOrEqual(sample.decodedVideos);
    }
  } catch (error) {
    const trace = await diagnostic.stop();
    const diagnosticPath = test.info().outputPath('figure3-media-diagnostic.json');
    await writeFile(diagnosticPath, JSON.stringify(trace, null, 2), 'utf8');
    await test.info().attach('figure3-media-diagnostic.json', {
      path: diagnosticPath, contentType: 'application/json'
    });
    throw error;
  } finally {
    await diagnostic.stop();
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
    await waitForContinuousStoryReady(page);
    await prepareCompleteStoryNativeEdge(page, 'brand', 'forward');
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

test('Figure3 static Brand handoff ignores a withheld terminal compositor frame', async ({ page }) => {
  const withhold = await withholdFigure3Endpoint(page, 'terminal');
  await page.goto('/#brand', { waitUntil: 'domcontentloaded' });
  const before = await waitForCommitSequence(page, 'brand', 0);
  await waitForContinuousStoryReady(page);
  await withhold();
  await sendFrontIntent(page, 'forward');
  await waitForCommitSequence(page, 'figure3-animation', before);
  await expect(page.locator('[data-phone-activation]:not([hidden])')).toHaveCount(0);
  await assertTargetContentVisible(page, FIGURE3_SLICE_CONTENT['figure3-animation']);
  await expect(page.locator('.phone-figure3'))
    .toHaveAttribute('data-phone-figure3-media-active', 'true');
  await expect(page.locator('.phone-figure3'))
    .toHaveAttribute('data-phone-figure3-initial-surface', 'video-frame-zero');
  await expect.poll(() => page.locator('.phone-figure3 video')
    .evaluate((video) => video.paused)).toBe(true);
});

test('Figure3 reverse media handoff uses the bounded poster fallback when its initial compositor frame is withheld', async ({ page }) => {
  const withhold = await withholdFigure3Endpoint(page, 'initial');
  await page.goto('/#figure3-animation', { waitUntil: 'domcontentloaded' });
  await waitForCommitSequence(page, 'figure3-animation', 0);
  await waitForContinuousStoryReady(page);
  await traverseFigure3Slice(page, 'figure3-animation', 'services', 'forward');
  const before = await readCommitSequence(page);
  await withhold();
  await sendFrontIntent(page, 'reverse');
  await expect(page.locator(
    '[data-phone-plane="effect"] [data-r4-ink-segment="figure3-services"], '
      + '[data-phone-plane="effect"] [data-phone-transition="figure3-services"]'
  )).toBeAttached({ timeout: 10_000 });
  await waitForCommitSequence(page, 'figure3-animation', before);
  await expect(page.locator('[data-phone-activation]:not([hidden])')).toHaveCount(0);
  await expect(page.locator('.phone-figure3'))
    .toHaveAttribute('data-phone-figure3-initial-surface', 'poster-fallback');
  await expect(page.locator('[data-phone-figure3-paper-poster]')).toBeVisible();
  await expect.poll(() => page.locator('.phone-figure3 video')
    .evaluate((video) => video.paused)).toBe(true);
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
  await waitForContinuousStoryReady(page);
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
  await waitForContinuousSourceRestore(
    page, 'figure3-animation', before, 'Figure3 background restore'
  );
  await expect(page.locator('[data-phone-figure3-paper-canvas]'))
    .toHaveAttribute('data-phone-figure3-paper-frame', 'ready');
  await expect(page.locator('[data-phone-figure3-paper-canvas]'))
    .toHaveAttribute('data-phone-figure3-paper-frame-index', '0');
  await traverseFigure3Slice(
    page, 'figure3-animation', 'services', 'forward'
  );
  await traverseFigure3Slice(
    page, 'services', 'figure3-animation', 'reverse'
  );
});

test('native reading handoff freezes the real bottom frame for Services, Lab, and Education', async ({ page }) => {
  for (const { source, target } of [
    { source: 'services', target: 'ttg-animation' },
    { source: 'lab', target: 'ph-animation' },
    { source: 'education', target: 'crane-animation' }
  ] as const) {
    await page.goto(`/#${source}`, { waitUntil: 'domcontentloaded' });
    await waitForDirectEntryCommit(page, source);
    await waitForContinuousStoryReady(page);
    const bottom = await scrollNativeReadingToBottom(page);
    expect(bottom, `${source} must have a native reading tail`).toBeGreaterThan(0);
    const stop = await recordPhoneStoryFrames(page);
    await nextAnimationFrame(page);
    await sendFrontIntent(page, 'forward');
    await page.waitForFunction(({ from, to }) => {
      const shell = document.querySelector<HTMLElement>('.phone-story');
      return shell?.dataset.phoneStatus === 'transaction'
        && shell.dataset.phoneSourceScene === from
        && shell.dataset.phoneCandidateScene === to;
    }, { from: source, to: target }, { timeout: 15_000 });
    await nextAnimationFrame(page);
    const samples = await stop();
    const stable = samples.filter((sample) => (
      sample.shell?.phoneStatus === 'stable' && sample.nativeReadingRect
    )).at(-1);
    const fixed = samples.find((sample) => (
      sample.shell?.phoneStatus === 'transaction'
      && sample.shell.phoneSourceScene === source
      && sample.sourceMirrorRect
    ));
    expect(stable?.nativeReadingRect, `${source} stable native rect`).not.toBeNull();
    expect(fixed?.sourceMirrorRect, `${source} fixed source mirror rect`).not.toBeNull();
    expect(Number.parseFloat(fixed?.sourceMirrorScrollY ?? ''), `${source} mirrored scroll`)
      .toBeCloseTo(bottom, 0);
    expect(fixed!.sourceMirrorRect![1], `${source} fixed top`)
      .toBeCloseTo(stable!.nativeReadingRect![1], 0);
    expect(fixed!.sourceMirrorRect![3], `${source} fixed bottom`)
      .toBeCloseTo(stable!.nativeReadingRect![3], 0);
  }
});

test('Lab and Education visual receivers match their first native reading frame', async ({ page }) => {
  await page.goto('/#ttg-animation', { waitUntil: 'domcontentloaded' });
  await waitForDirectEntryCommit(page, 'ttg-animation');
  await traverseGroup45(page, 'ttg-animation', 'lab', 'forward');
  await expectStableVisualReadingParity(
    page, 'lab', '.phone-lab__screen--intro .phone-lab__hero > p:last-child'
  );

  await page.goto('/?r5-parity=lab-reverse#ph-animation', { waitUntil: 'domcontentloaded' });
  await waitForDirectEntryCommit(page, 'ph-animation');
  await traversePhSlice(page, 'ph-animation', 'lab', 'reverse');
  await expectStableVisualReadingParity(page, 'lab', '.phone-lab__row:last-child h3');

  await page.goto('/?r5-parity=education-forward#ph-animation', { waitUntil: 'domcontentloaded' });
  await waitForDirectEntryCommit(page, 'ph-animation');
  await traversePhSlice(page, 'ph-animation', 'education', 'forward');
  await expectStableVisualReadingParity(page, 'education', '.r4-education__wide h2');

  await page.goto('/#crane-animation', { waitUntil: 'domcontentloaded' });
  await waitForDirectEntryCommit(page, 'crane-animation');
  await traverseCraneSlice(page, 'crane-animation', 'education', 'reverse');
  await expectStableVisualReadingParity(
    page, 'education', '.r4-education__row:last-child strong'
  );
});

test('Services bottom trusted handoff activates a dormant TTG prewarm and commits once', async ({ page }) => {
  await page.goto('/#services', { waitUntil: 'domcontentloaded' });
  const before = await waitForDirectEntryCommit(page, 'services');
  await waitForContinuousStoryReady(page);
  const bottom = await scrollNativeReadingToBottom(page);
  expect(bottom).toBeGreaterThan(0);
  const prewarmedTtg = page.locator('[data-ttg-figure-video]');
  await expect(prewarmedTtg).toHaveCount(1);
  await expect(prewarmedTtg).not.toHaveAttribute(
    'data-phone-ttg-endpoint-ready', /initial|terminal/
  );
  await expect(page.locator('.phone-story')).toHaveAttribute(
    'data-phone-resource-active-decoders', '0'
  );
  const viewport = await page.locator('.phone-story__viewport').boundingBox();
  if (!viewport) throw new Error('Story input surface is missing');
  await page.locator('.phone-story__reading-flow').evaluate((flow) => {
    (flow as HTMLElement).style.pointerEvents = 'none';
  });
  await page.mouse.move(viewport.x + 12, viewport.y + 520);
  await page.mouse.down();
  await page.mouse.move(viewport.x + 12, viewport.y + 80, { steps: 4 });
  await page.mouse.up();
  await waitForCommitSequence(page, 'ttg-animation', before);
  expect(await readCommitSequence(page)).toBe(before + 1);
  const handoff = await page.locator('[data-ttg-figure-video]').evaluate((video) => ({
    currentTime: video.currentTime,
    paused: video.paused,
    endpoint: video.dataset.phoneTtgEndpointReady,
    state: video.closest('.phone-ttg')?.getAttribute('data-phone-media-state')
  }));
  expect(handoff.currentTime).toBeLessThan(.08);
  expect(handoff.paused).toBe(true);
  expect(handoff.endpoint).toBe('initial');
  expect(handoff.state).not.toBe('fallback');
});

test('incoming media stays parked at frame zero for PH and both Crane layers', async ({ page }) => {
  for (const scenario of [
    {
      source: 'lab', target: 'ph-animation',
      videos: ['ph-figure-video'], canvases: ['ph-figure-canvas']
    },
    {
      source: 'education', target: 'crane-animation',
      videos: ['crane-figure-video', 'crane-flock-video'],
      canvases: ['crane-figure-canvas', 'crane-flock-canvas']
    }
  ] as const) {
    await page.goto(`/#${scenario.source}`, { waitUntil: 'domcontentloaded' });
    const before = await waitForDirectEntryCommit(page, scenario.source);
    await waitForContinuousStoryReady(page);
    for (const surfaceId of scenario.canvases) {
      const canvas = page.locator(`[data-phone-packed-alpha-canvas="${
        surfaceId.replace(/-canvas$/, '')
      }"]`);
      await expect(canvas).toBeAttached();
      await expect(canvas).not.toHaveAttribute('data-packed-alpha-frame-ready', 'true');
    }
    await expect(page.locator('.phone-story')).toHaveAttribute(
      'data-phone-resource-active-decoders', '0'
    );
    await scrollNativeReadingToBottom(page);
    const stop = await recordPhoneStoryFrames(page);
    await nextAnimationFrame(page);
    await sendFrontIntent(page, 'forward');
    await waitForCommitSequence(page, scenario.target, before);
    await page.waitForTimeout(250);
    const samples = await stop();
    const incoming = (sample: PhoneStoryFrameSample) => (
      sample.shell?.phoneStatus === 'transaction'
      && sample.shell.phoneSourceScene === scenario.source
      && sample.shell.phoneCandidateScene === scenario.target
    );
    const stable = (sample: PhoneStoryFrameSample) => (
      sample.shell?.phoneStatus === 'stable'
      && sample.shell.phoneScene === scenario.target
    );
    for (const surfaceId of scenario.videos) {
      const during = mediaTrace(samples, surfaceId, incoming);
      const hold = mediaTrace(samples, surfaceId, stable);
      expect(during.length, `${surfaceId} incoming samples`).toBeGreaterThan(2);
      expect(Math.max(...during.map(({ currentTime }) => currentTime)), surfaceId)
        .toBeLessThanOrEqual(.05);
      expect(during.every(({ paused }) => paused), `${surfaceId} incoming paused`).toBe(true);
      expect(hold.length, `${surfaceId} stable samples`).toBeGreaterThan(2);
      expect(Math.max(...hold.map(({ currentTime }) => currentTime)), surfaceId)
        .toBeLessThanOrEqual(.05);
      expect(hold.every(({ paused }) => paused), `${surfaceId} stable paused`).toBe(true);
    }
    for (const surfaceId of scenario.canvases) {
      const during = canvasMediaTrace(samples, surfaceId, incoming);
      expect(during.length, `${surfaceId} incoming Canvas samples`).toBeGreaterThan(0);
      expect(Math.max(...during.map(({ mediaTime }) => mediaTime)), surfaceId)
        .toBeLessThanOrEqual(.05);
    }
  }
});

test('PH presented-frame playback advances only during PH to Education', async ({ page }) => {
  await page.addInitScript(() => {
    (window as typeof window & { __r5PhoneRuntimeLog?: unknown[] }).__r5PhoneRuntimeLog = [];
  });
  await page.goto('/#ph-animation', { waitUntil: 'domcontentloaded' });
  const before = await waitForDirectEntryCommit(page, 'ph-animation');
  const retainedGeneration = Number(await page
    .locator('[data-phone-packed-alpha-canvas="ph-figure"]')
    .getAttribute('data-packed-alpha-generation'));
  const stop = await recordPhoneStoryFrames(page);
  await nextAnimationFrame(page);
  await sendFrontIntent(page, 'forward');
  await expect(page.locator('.phone-ph [data-r4-scene="ph-animation"]')).toHaveAttribute(
    'data-phone-ph-clock', 'presented-frame'
  );
  await waitForCommitSequence(page, 'education', before);
  const samples = await stop();
  const outgoing = (sample: PhoneStoryFrameSample) => (
    sample.shell?.phoneStatus === 'transaction'
    && sample.shell.phoneSourceScene === 'ph-animation'
    && sample.shell.phoneCandidateScene === 'education'
  );
  const video = mediaTrace(samples, 'ph-figure-video', outgoing);
  const canvas = canvasMediaTrace(samples, 'ph-figure-canvas', outgoing);
  expect(video.length).toBeGreaterThan(6);
  expect(video.every(({ paused }) => paused), 'PH strict video stays paused').toBe(true);
  expect(video.at(-1)!.currentTime - video[0]!.currentTime).toBeGreaterThan(.15);
  expect(canvas.length).toBeGreaterThan(3);
  expect(canvas.at(-1)!.mediaTime - canvas[0]!.mediaTime).toBeGreaterThan(.15);
  const quantizedTimes = samples.flatMap((sample) => outgoing(sample)
    ? sample.canvases
      .filter(({ surfaceId, mediaTime }) => surfaceId === 'ph-figure-canvas'
        && mediaTime !== null)
      .map(({ mediaTime }) => mediaTime!)
    : []);
  expect(quantizedTimes.length).toBeGreaterThan(3);
  expect(quantizedTimes.every((mediaTime) => (
    Math.abs(mediaTime * 30 - Math.round(mediaTime * 30)) < .01
  )), 'PH Canvas media times stay on integer frame boundaries').toBe(true);
  const outgoingGenerations = new Set(samples.flatMap((sample) => (
    outgoing(sample)
      ? sample.canvases.filter(({ surfaceId }) => surfaceId === 'ph-figure-canvas')
        .flatMap(({ generation }) => generation === null ? [] : [generation])
      : []
  )));
  expect([...outgoingGenerations]).toEqual([retainedGeneration]);
  const presented = samples.flatMap((sample) => outgoing(sample)
    ? sample.canvases.filter(({ surfaceId }) => surfaceId === 'ph-figure-canvas')
    : []);
  expect(presented.length).toBeGreaterThan(3);
  expect(presented.every(({ alphaStatus, opacity }) => (
    alphaStatus === 'verified' && opacity > 0
  ))).toBe(true);
  const runtimeReceipts = await page.evaluate(() => (
    (window as typeof window & { __r5PhoneRuntimeLog?: Array<{
      status: string;
      transaction?: {
        attempt: { segmentId: string | null; direction: string | null };
        phase: string;
        progress: number;
        presentedSequence: number;
      } | null;
    }> }).__r5PhoneRuntimeLog ?? []
  ).flatMap(({ status, transaction }) => (
    status === 'transaction' && transaction?.attempt.segmentId === 'ph-education'
      && transaction.phase === 'playing' && transaction.presentedSequence >= 0
      ? [{ progress: transaction.progress, sequence: transaction.presentedSequence }]
      : []
  )));
  expect(runtimeReceipts.length).toBeGreaterThan(3);
  expect(runtimeReceipts.every(({ progress }) => progress >= 0 && progress <= 1))
    .toBe(true);
  expect(runtimeReceipts.every(({ sequence }, index) => (
    index === 0 || sequence >= runtimeReceipts[index - 1]!.sequence
  )), 'PH receipts commit in sequence order').toBe(true);
});

test('Crane authored playback advances both videos only during Crane to Contact', async ({ page }) => {
  await page.addInitScript(() => {
    (window as typeof window & { __r5PhoneRuntimeLog?: unknown[] }).__r5PhoneRuntimeLog = [];
  });
  await page.goto('/#crane-animation', { waitUntil: 'domcontentloaded' });
  const before = await waitForDirectEntryCommit(page, 'crane-animation');
  const stop = await recordPhoneStoryFrames(page);
  await nextAnimationFrame(page);
  await sendFrontIntent(page, 'forward');
  await waitForCommitSequence(page, 'contact', before);
  await nextAnimationFrame(page);
  const samples = await stop();
  const outgoing = (sample: PhoneStoryFrameSample) => (
    sample.shell?.phoneStatus === 'transaction'
    && sample.shell.phoneSourceScene === 'crane-animation'
    && sample.shell.phoneCandidateScene === 'contact'
  );
  for (const surfaceId of ['crane-figure-video', 'crane-flock-video']) {
    const trace = mediaTrace(samples, surfaceId, outgoing);
    expect(trace.length, surfaceId).toBeGreaterThan(6);
    expect(Math.max(...trace.map(({ currentTime }) => currentTime))
      - Math.min(...trace.map(({ currentTime }) => currentTime)), surfaceId)
      .toBeGreaterThan(.15);
  }
  for (const surfaceId of ['crane-figure-canvas', 'crane-flock-canvas']) {
    const trace = canvasMediaTrace(samples, surfaceId, outgoing);
    expect(trace.length, surfaceId).toBeGreaterThan(3);
    expect(Math.max(...trace.map(({ mediaTime }) => mediaTime))
      - Math.min(...trace.map(({ mediaTime }) => mediaTime)), surfaceId)
      .toBeGreaterThan(.15);
    expect(Math.max(...trace.map(({ mediaTime }) => mediaTime)), `${surfaceId} terminal`)
      .toBeGreaterThanOrEqual(2.467 - .08);
    const visibleTerminal = samples.some((sample) => outgoing(sample)
      && sample.canvases.some((canvas) => canvas.surfaceId === surfaceId
        && (canvas.mediaTime ?? -1) >= 2.467 - .08)
      && sample.planes.some(({ role, visible }) => role === 'source' && visible));
    expect(visibleTerminal, `${surfaceId} terminal frame stayed source-visible`).toBe(true);
  }
  const transaction = samples.filter(outgoing);
  const clocked = transaction.filter(({ craneProgress }) => craneProgress !== null);
  expect(clocked.length).toBeGreaterThan(6);
  for (const sample of clocked) {
    expect(sample.craneClock).toBe('presented-media');
    const figure = sample.canvases.find(({ surfaceId }) => surfaceId === 'crane-figure-canvas');
    const flock = sample.canvases.find(({ surfaceId }) => surfaceId === 'crane-flock-canvas');
    const camera = sample.craneProgress!;
    if (camera > 1 / 6 && figure?.mediaTime !== null && figure?.mediaTime !== undefined) {
        expect(camera).toBeLessThanOrEqual((.5 + figure.mediaTime / 2.467 * 2.5) / 3 + .04);
    }
    if (flock?.mediaTime !== null && flock?.mediaTime !== undefined) {
      if (flock.mediaTime < 2.467 - .08) {
        expect(camera).toBeLessThanOrEqual(flock.mediaTime / 2.467 * 2.5 / 3 + .041);
        expect(camera, 'Crane camera cannot retire an unproved flock frame')
          .toBeLessThanOrEqual(5 / 6);
      }
    }
  }
  expect(transaction.some(({ contactProgress }) => contactProgress === 0),
    'Contact remains at its pre-cue endpoint').toBe(true);
  expect(transaction.some((sample) => (
    sample.contactProgress !== null
    && sample.contactProgress > 0 && sample.contactProgress < 1
    && sample.planes.some(({ role, visible }) => role === 'source' && visible)
  )), 'Contact enters while Crane still visibly owns the source').toBe(true);
  const stableContact = page.locator(
    '.phone-story__reading-flow [data-r4-scene="contact"]'
  );
  await expect(stableContact).toBeVisible();
  await expect(stableContact).toHaveAttribute('data-contact-progress', '1.0000');
});

test('Group 4-5 direct TTG and Lab entries expose their accepted endpoints', async ({ page }) => {
  for (const scene of ['ttg-animation', 'lab'] as const) {
    await page.goto(`/#${scene}`, {
      waitUntil: 'domcontentloaded'
    });
    await waitForDirectEntryCommit(page, scene);
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
  await page.addInitScript(() => {
    (window as typeof window & { __r5PhoneRuntimeLog?: unknown[] }).__r5PhoneRuntimeLog = [];
  });
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
    expect(sample.videos).toBeLessThanOrEqual(2);
    expect(sample.canvases).toBeLessThanOrEqual(2);
    expect(sample.activeDecoders).toBeLessThanOrEqual(sample.decodedVideos);
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
    await waitForContinuousStoryReady(page);
    await assertTargetContentVisible(page, GROUP45_CONTENT.services);
    const bottom = await scrollNativeReadingToBottom(page);
    expect(bottom).toBeGreaterThan(0);
    await sendFrontIntent(page, 'forward');
    await requested;
    await expect(page.locator('.phone-story')).toHaveAttribute('data-phone-status', 'transaction');
    expect(await readCommitSequence(page)).toBe(before);
    await expectLeafFallbacksVisuallyHidden(page);
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
    await waitForContinuousStoryReady(page);
    const bottom = await scrollNativeReadingToBottom(page);
    expect(bottom).toBeGreaterThan(0);
    await sendFrontIntent(page, 'forward');
    await expect(page.locator('[data-ttg-figure-video]')).toBeAttached();
    await expectGroup45Rollback(page, 'services', 'ttg-animation', 'forward', before);
    await assertTargetContentVisible(page, [
      '.phone-story__reading-flow [data-phone-reading="services"] .phone-services__row:last-child'
    ]);
    const restoredBottom = await page.evaluate(() => {
      const owner = document.scrollingElement ?? document.documentElement;
      const maximum = Math.max(0, owner.scrollHeight - owner.clientHeight);
      return { scrollTop: owner.scrollTop, maximum };
    });
    expect(restoredBottom.scrollTop).toBeCloseTo(restoredBottom.maximum, 0);
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
  const before = await waitForDirectEntryCommit(page, 'ttg-animation');
  await waitForContinuousStoryReady(page);
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
  await waitForContinuousSourceRestore(page, 'ttg-animation', before, 'TTG background restore');
  await expect(page.locator('[data-ttg-figure-video]'))
    .toHaveAttribute('data-phone-ttg-endpoint-ready', /initial|terminal/);
  await traverseGroup45(page, 'ttg-animation', 'lab', 'forward');
  await traverseGroup45(page, 'lab', 'ttg-animation', 'reverse');
});

test('Services → TTG → Lab → PH localizes and commits every edge with touch input', async ({
  page, browserName
}) => {
  test.skip(browserName !== 'chromium', 'Trusted swipe transport is Chromium-only; Safari stays a physical-device gate.');
  await page.goto('/#services', { waitUntil: 'domcontentloaded' });
  await waitForCommitSequence(page, 'services', 0);
  await traverseBackHalfTouchEdge(page, 'services', 'ttg-animation');
  await traverseBackHalfTouchEdge(page, 'ttg-animation', 'lab');
  await traverseBackHalfTouchEdge(page, 'lab', 'ph-animation');
  const admitted = await page.locator('.phone-ph').evaluate((root) => {
    const canvas = root.querySelector<HTMLCanvasElement>(
      '[data-phone-packed-alpha-canvas="ph-figure"]'
    );
    return {
      admitted: Number((root as HTMLElement).dataset.phGen),
      generation: Number(canvas?.dataset.packedAlphaGeneration),
      opacity: Number(canvas ? getComputedStyle(canvas).opacity : 0)
    };
  });
  expect(admitted.admitted).toBeGreaterThan(0);
  expect(admitted.admitted).toBe(admitted.generation);
  expect(admitted.opacity).toBeGreaterThan(0);
});

test('Lab keeps one PH lease through front-half reading and commits the first boundary touch', async ({
  page, browserName
}) => {
  test.skip(browserName !== 'chromium', 'Trusted touch transport requires Chromium CDP; physical Safari remains the device gate.');
  await page.goto('/#lab', { waitUntil: 'domcontentloaded' });
  const before = await waitForDirectEntryCommit(page, 'lab');
  await waitForContinuousStoryReady(page);
  const ph = page.locator('.phone-ph');
  expect(await ph.count(), 'PH must already be dormant-mounted when Lab becomes interactive')
    .toBe(1);
  await ph.evaluate((node) => {
    (window as typeof window & { __r5LabPhLease?: Element }).__r5LabPhLease = node;
  });
  const maximum = await page.evaluate(() => {
    const owner = document.scrollingElement ?? document.documentElement;
    return Math.max(0, owner.scrollHeight - owner.clientHeight);
  });
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('Touch input requires a fixed viewport');
  const session = await page.context().newCDPSession(page);
  await page.evaluate((scrollTop) => {
    const owner = document.scrollingElement ?? document.documentElement;
    owner.scrollTop = scrollTop;
    window.dispatchEvent(new Event('scroll'));
  }, Math.round(maximum * .3));
  await expect.poll(() => page.evaluate(() => (
    document.scrollingElement ?? document.documentElement
  ).scrollTop)).toBeGreaterThan(maximum * .2);
  expect(await page.evaluate(() => {
    const lease = (window as typeof window & { __r5LabPhLease?: Element }).__r5LabPhLease;
    return lease === document.querySelector('.phone-ph');
  })).toBe(true);
  expect((await page.locator('.phone-story').getAttribute('data-phone-handoff'))
    ?.split(',')).toContain('forward:ready');

  const x = Math.round(viewport.width * .5);
  try {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart', touchPoints: [{ x, y: Math.round(viewport.height * .8), id: 81 }]
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x, y: Math.round(viewport.height * .68), id: 81 }]
    });
    await page.evaluate(() => {
      const owner = document.scrollingElement ?? document.documentElement;
      owner.scrollTop = Math.max(0, owner.scrollHeight - owner.clientHeight);
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x, y: Math.round(viewport.height * .24), id: 81 }]
    });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally {
    await session.detach();
  }
  await page.waitForFunction(() => (
    document.querySelector<HTMLElement>('.phone-story')?.dataset.phoneSegment === 'lab-ph'
  ), undefined, { timeout: 15_000 });
  await waitForCommitSequence(page, 'ph-animation', before);
  expect(await readCommitSequence(page)).toBe(before + 1);
});

test('Services native touch tolerates a 2px Safari reversal and publishes once', async ({
  page, browserName
}) => {
  test.skip(browserName !== 'webkit', 'WebKit touch-event transport contract.');
  await page.goto('/#services', { waitUntil: 'domcontentloaded' });
  await waitForCommitSequence(page, 'services', 0);
  await waitForContinuousStoryReady(page);
  const result = await page.locator(
    '.phone-story__reading-flow [data-phone-input-owner="native-document"]'
  ).evaluate((reading) => {
    const owner = document.scrollingElement ?? document.documentElement;
    const emitted: Array<{ type: string; prevented: boolean }> = [];
    const dispatch = (type: 'touchstart' | 'touchmove' | 'touchend', y: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true }) as TouchEvent;
      Object.defineProperty(event, type === 'touchend' ? 'changedTouches' : 'touches', {
        value: [{ identifier: 19, clientY: y }]
      });
      reading.dispatchEvent(event);
      emitted.push({ type, prevented: event.defaultPrevented });
    };
    owner.scrollTop = Math.max(0, owner.scrollHeight - owner.clientHeight - 160);
    dispatch('touchstart', 600);
    dispatch('touchmove', 500);
    dispatch('touchmove', 502);
    owner.scrollTop = Math.max(0, owner.scrollHeight - owner.clientHeight);
    dispatch('touchmove', 400);
    dispatch('touchmove', 360);
    dispatch('touchend', 360);
    const mirror = document.querySelector<HTMLElement>(
      '[data-phone-native-mirror="services"]'
    );
    const shell = document.querySelector<HTMLElement>('.phone-story');
    return {
      emitted,
      handoff: mirror?.dataset.phoneNativeHandoff,
      reading: shell?.dataset.phoneReading,
      scrollTop: owner.scrollTop,
      maximum: Math.max(0, owner.scrollHeight - owner.clientHeight)
    };
  });
  expect(result.emitted.filter(({ prevented }) => prevented), JSON.stringify(result)).toHaveLength(2);
  expect(result.handoff).toBe('active');
});

test('PH slice direct PH and Education entries expose accepted endpoints', async ({ page }) => {
  for (const scene of ['ph-animation', 'education'] as const) {
    await page.goto(`/#${scene}`, {
      waitUntil: 'domcontentloaded'
    });
    await waitForDirectEntryCommit(page, scene);
    if (scene === 'education') await waitForContinuousStoryReady(page);
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
    expect(sample.videos).toBeLessThanOrEqual(3);
    expect(sample.canvases).toBeLessThanOrEqual(4);
    expect(sample.activeDecoders).toBeLessThanOrEqual(sample.decodedVideos);
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
    await waitForContinuousStoryReady(page);
    await prepareCompleteStoryNativeEdge(page, 'lab', 'forward');
    await sendFrontIntent(page, 'forward');
    await requested;
    expect(await readCommitSequence(page)).toBe(before);
    await expectLeafFallbacksVisuallyHidden(page);
    await assertTargetContentVisible(page, [
      '[data-phone-plane="source"] .phone-lab__row:last-child'
    ]);
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
    await waitForContinuousStoryReady(page);
    await prepareCompleteStoryNativeEdge(page, 'lab', 'forward');
    await sendFrontIntent(page, 'forward');
    await expect(page.locator('[data-phone-packed-alpha-canvas="ph-figure"]'))
      .toBeAttached();
    await expectPhSliceRollback(page, 'lab', 'ph-animation', before);
    await assertTargetContentVisible(page, [
      '.phone-story__reading-flow [data-phone-reading="lab"] .phone-lab__row:last-child'
    ]);
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
    await waitForContinuousStoryReady(page);
    await prepareCompleteStoryNativeEdge(page, 'lab', 'forward');
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
  await waitForDirectEntryCommit(page, 'ph-animation');
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
  try {
    await page.waitForFunction((before) => {
      const shell = document.querySelector<HTMLElement>('.phone-story');
      return shell?.dataset.phoneStatus === 'stable'
        && shell.dataset.phoneScene === 'ph-animation'
        && Number(shell.dataset.phonePlaneRevision) > before;
    }, beforePlaneRevision, { timeout: 15_000 });
  } catch (error) {
    const diagnostic = await readPhoneStoryDiagnostic(page);
    const trace = await page.evaluate(() => (
      window as typeof window & { __r5PhoneRuntimeLog?: unknown[] }
    ).__r5PhoneRuntimeLog?.slice(-30) ?? []);
    throw new Error(`PH lifecycle reproof failed: ${JSON.stringify({ diagnostic, trace })}`, {
      cause: error
    });
  }
  await expect(page.locator('[data-phone-packed-alpha-canvas="ph-figure"]'))
    .toHaveAttribute('data-packed-alpha-frame-ready', 'true');
  await traversePhSlice(page, 'ph-animation', 'education', 'forward');
  await traversePhSlice(page, 'education', 'ph-animation', 'reverse');
});

test('Crane slice direct entry proves both authored packed surfaces', async ({ page }) => {
  await page.goto('/#crane-animation', {
    waitUntil: 'domcontentloaded'
  });
  await waitForDirectEntryCommit(page, 'crane-animation');
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
  expect(first).toEqual([
    {
      videos: 2,
      decodedVideos: 2,
      canvases: 2,
      activeDecoders: 2,
      owners: [
        'crane-animation:canvas', 'crane-animation:canvas',
        'crane-animation:video', 'crane-animation:video'
      ]
    },
    {
      videos: 3,
      decodedVideos: 3,
      canvases: 3,
      activeDecoders: 0,
      owners: [
        'crane-animation:canvas', 'crane-animation:canvas',
        'crane-animation:video', 'crane-animation:video',
        'ph-animation:canvas', 'ph-animation:video'
      ]
    }
  ]);
});

test('Crane primes once, then uses the presented timeline without another native play', async ({ page }) => {
  await page.goto('/#crane-animation', {
    waitUntil: 'domcontentloaded'
  });
  const before = await waitForDirectEntryCommit(page, 'crane-animation');
  await expect(page.locator('[data-phone-activation]:not([hidden])')).toHaveCount(0);
  await page.evaluate(() => {
    const originalPlay = HTMLMediaElement.prototype.play;
    let frontPlayAttempts = 0;
    Object.defineProperty(window, '__r5CranePlayAttempts', {
      configurable: true, get: () => frontPlayAttempts
    });
    HTMLMediaElement.prototype.play = function patchedPlay() {
      const role = this.matches('[data-crane-figure-front-video]')
        ? 'front' : this.matches('[data-crane-figure-video]') ? 'figure' : 'other';
      if (role === 'front') frontPlayAttempts += 1;
      return originalPlay.call(this);
    };
  });
  const initialFrontPlayAttempts = await page.evaluate(() => (
    window as typeof window & { __r5CranePlayAttempts: number }
  ).__r5CranePlayAttempts);
  expect(initialFrontPlayAttempts).toBe(0);
  for (const layer of ['crane-figure', 'crane-flock']) {
    await expect(page.locator(`[data-phone-packed-alpha-canvas="${layer}"]`))
      .toHaveAttribute('data-packed-alpha-frame-ready', 'true');
  }
  await sendFrontIntent(page, 'forward');
  await waitForCommitSequence(page, 'contact', before);
  expect(await page.evaluate(() => (
    window as typeof window & { __r5CranePlayAttempts: number }
  ).__r5CranePlayAttempts)).toBe(initialFrontPlayAttempts);
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
    await waitForContinuousStoryReady(page);
    await scrollNativeReadingToBottom(page);
    await sendFrontIntent(page, 'forward');
    await requested;
    expect(await readCommitSequence(page)).toBe(before);
    await assertTargetContentVisible(page, [EDUCATION_FIXED_CLOSING_CONTENT[0]]);
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
    await waitForContinuousStoryReady(page);
    await scrollNativeReadingToBottom(page);
    await sendFrontIntent(page, 'forward');
    await requested;
    await expectCraneModuleFault(page, 'education', 'crane-animation', before);
    await assertTargetContentVisible(page, [EDUCATION_FIXED_CLOSING_CONTENT[0]]);
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
    await waitForContinuousStoryReady(page);
    await scrollNativeReadingToBottom(page);
    await sendFrontIntent(page, 'forward');
    await expect(page.locator('[data-phone-packed-alpha-canvas="crane-flock"]'))
      .toBeAttached();
    await expectCraneMediaRollback(page, 'education', 'crane-animation', before);
    await waitForContinuousStoryReady(page);
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
    await waitForContinuousStoryReady(page);
    await scrollNativeReadingToBottom(page);
    await sendFrontIntent(page, 'forward');
    const canvas = page.locator('[data-phone-packed-alpha-canvas="crane-figure"]');
    await expect(canvas).toBeAttached();
    await canvas.dispatchEvent('webglcontextlost', { cancelable: true });
    await expectCraneMediaRollback(page, 'education', 'crane-animation', before);
  } finally {
    releaseMedia();
  }
});

test('late Crane → Contact failure re-proves Crane at its stable endpoint', async ({ page }) => {
  await page.goto('/#crane-animation', { waitUntil: 'domcontentloaded' });
  const before = await waitForDirectEntryCommit(page, 'crane-animation');
  await waitForContinuousStoryReady(page);
  await sendFrontIntent(page, 'forward');
  await page.waitForFunction(() => {
    const shell = document.querySelector<HTMLElement>('.phone-story');
    const crane = document.querySelector<HTMLElement>('[data-r4-scene="crane-animation"]');
    return shell?.dataset.phoneStatus === 'transaction'
      && shell.dataset.phoneSourceScene === 'crane-animation'
      && shell.dataset.phoneCandidateScene === 'contact'
      && shell.dataset.phonePhase === 'playing'
      && Number(crane?.dataset.phoneCraneProgress) >= .55;
  }, null, { timeout: 20_000 });

  await page.locator('[data-phone-packed-alpha-canvas="crane-figure"]')
    .dispatchEvent('webglcontextlost', { cancelable: true });
  await page.waitForFunction(({ source, sequence }) => {
    const shell = document.querySelector<HTMLElement>('.phone-story');
    return shell?.dataset.phoneStatus === 'stable'
      && shell.dataset.phoneScene === source
      && Number(shell.dataset.phoneCommitSequence) === sequence;
  }, { source: 'crane-animation', sequence: before }, { timeout: 20_000 });

  const rollback = await page.evaluate(() => ({
    shell: { ...(document.querySelector<HTMLElement>('.phone-story')?.dataset ?? {}) },
    videos: [...document.querySelectorAll<HTMLVideoElement>(
      '[data-phone-scene="crane-animation"] video'
    )].map((video) => ({ currentTime: video.currentTime, paused: video.paused })),
    canvases: [...document.querySelectorAll<HTMLCanvasElement>(
      '[data-phone-scene="crane-animation"] [data-phone-packed-alpha-canvas]'
    )].map((canvas) => ({
      mediaTime: Number(canvas.dataset.packedAlphaMediaTime),
      frameReady: canvas.dataset.packedAlphaFrameReady,
      generation: canvas.dataset.packedAlphaGeneration
    }))
  }));
  expect(rollback.shell.phoneStatus).toBe('stable');
  expect(rollback.videos.every(({ currentTime, paused }) => paused && currentTime <= .04)).toBe(true);
  expect(rollback.canvases.every(({ mediaTime, frameReady }) => (
    frameReady === 'true' && Number.isFinite(mediaTime) && mediaTime <= .04
  ))).toBe(true);
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
  await waitForDirectEntryCommit(page, 'crane-animation');
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

test('Group 6-7 direct Contact is resource-minimal, adjacent-prewarmed, and natively interactive', async ({
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
  const beforeReverseBoundary = await page.locator('.phone-story').evaluate((shell) => {
    const owner = document.scrollingElement ?? document.documentElement;
    return {
      scrollTop: owner.scrollTop,
      status: shell.dataset.phoneStatus,
      scene: shell.dataset.phoneScene,
      sequence: Number(shell.dataset.phoneCommitSequence),
      faultCode: shell.dataset.phoneFaultCode ?? null,
      activation: Boolean(document.querySelector('[data-phone-activation]:not([hidden])'))
    };
  });
  expect(beforeReverseBoundary.scrollTop).toBeLessThanOrEqual(1);
  expect(beforeReverseBoundary).toMatchObject({
    status: 'stable', scene: 'contact', faultCode: null, activation: false
  });
  expect(await nativeCopy.evaluate((element) => element.dispatchEvent(new KeyboardEvent(
    'keydown', { bubbles: true, cancelable: true, key: 'ArrowUp' }
  )))).toBe(false);
  await nextAnimationFrame(page);
  await expect.poll(() => page.locator('.phone-story').evaluate((shell) => ({
    status: shell.dataset.phoneStatus,
    scene: shell.dataset.phoneScene,
    sequence: Number(shell.dataset.phoneCommitSequence),
    faultCode: shell.dataset.phoneFaultCode ?? null,
    activation: Boolean(document.querySelector('[data-phone-activation]:not([hidden])'))
  }))).toEqual({
    status: 'stable',
    scene: 'contact',
    sequence: beforeReverseBoundary.sequence,
    faultCode: null,
    activation: false
  });
  expect(await top.evaluate((element) => element.dispatchEvent(new WheelEvent(
    'wheel', { bubbles: true, cancelable: true, deltaY: 120 }
  )))).toBe(true);
  await expect(page.locator('.phone-story__planes video')).toHaveCount(2);
  await expect(page.locator('.phone-story__planes canvas')).toHaveCount(2);
  expect(stableResourceIdentity(await readStableSliceResources(page))).toEqual({
    videos: 2, canvases: 2, activeDecoders: 0,
    owners: [
      'crane-animation:canvas', 'crane-animation:canvas',
      'crane-animation:video', 'crane-animation:video'
    ]
  });
  expect(await page.locator('.phone-story__planes video')
    .evaluateAll((videos) => videos.every((video) => video.paused))).toBe(true);
  const chunks = await page.evaluate(() => performance.getEntriesByType('resource')
    .map(({ name }) => name).filter((name) => /\/assets\/[^/]+\.js(?:$|\?)/.test(name)));
  expect(chunks.some((name) => /\/PhoneContact-[^/]+\.js/.test(name))).toBe(true);
  expect(chunks.some((name) => /\/(?:PhoneCrane|crane-contact)-[^/]+\.js/.test(name)))
    .toBe(true);
});

test('Group 6-7 Crane ↔ Contact commits twice with native input release and no growth', async ({
  page
}) => {
  await page.addInitScript(() => {
    (window as typeof window & { __r5PhoneRuntimeLog?: unknown[] }).__r5PhoneRuntimeLog = [];
  });
  await page.goto('/#crane-animation', {
    waitUntil: 'domcontentloaded'
  });
  await waitForDirectEntryCommit(page, 'crane-animation');
  const cycle = async (cycleNumber: 1 | 2) => {
    const contact = await traverseCompleteStoryLeg(
      page, 'crane-animation', 'contact', 'forward', `cycle ${cycleNumber} forward`
    );
    await expect(page.locator('[data-phone-reading="contact"] a[href^="mailto:"]'))
      .toBeVisible();
    const crane = await traverseCompleteStoryLeg(
      page, 'contact', 'crane-animation', 'reverse', `cycle ${cycleNumber} reverse`
    );
    return [contact, crane] as const;
  };
  const first = await cycle(1);
  const second = await cycle(2);
  expect(second).toEqual(first);
});

test('complete story proves all 60 segment traversals through one authority without growth', async ({
  page
}) => {
  test.setTimeout(480_000);
  await page.addInitScript(() => {
    (window as typeof window & { __r5PhoneRuntimeLog?: unknown[] }).__r5PhoneRuntimeLog = [];
  });
  await page.goto('/#hero', { waitUntil: 'domcontentloaded' });
  const bootHandle = await page.waitForFunction(() => {
    const shell = document.querySelector<HTMLElement>('.phone-story');
    const state = {
      status: shell?.dataset.phoneStatus,
      scene: shell?.dataset.phoneScene,
      sequence: Number(shell?.dataset.phoneCommitSequence),
      failure: shell?.dataset.phoneLastFailure
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
    const samples: StableResourceIdentity[] = [];
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
      boundaryResources: stableResourceIdentity(await readStableSliceResources(page)),
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

test('transition leaf delay keeps the committed source opaque until the ordinary ESM edge resolves', async ({
  page
}) => {
  let releaseTransition = () => undefined;
  let observeTransition = () => undefined;
  const gate = new Promise<void>((resolve) => { releaseTransition = resolve; });
  const requested = new Promise<void>((resolve) => { observeTransition = resolve; });
  await page.route(
    releaseAssetPattern('src/transitions/hero-pattern/phone.tsx'),
    async (route) => {
      observeTransition();
      await gate;
      await route.continue();
    }
  );
  try {
    await page.goto('/#hero', { waitUntil: 'domcontentloaded' });
    const before = await waitForCommitSequence(page, 'hero', 0);
    await sendFrontIntent(page, 'forward');
    await requested;
    await expect(page.locator('.phone-story')).toHaveAttribute('data-phone-status', 'transaction');
    expect(await readCommitSequence(page)).toBe(before);
    await assertTargetContentVisible(page, FRONT_CONTENT.hero);
    await expect(page.locator('[data-phone-plane="receiver"] > *')).toHaveCount(0);
    releaseTransition();
    await waitForCommitSequence(page, 'pattern', before);
    await assertTargetContentVisible(page, FRONT_CONTENT.pattern);
  } finally {
    releaseTransition();
  }
});

test('rejected transition URL is not retried in-document and source retry remains accessible', async ({
  page
}) => {
  let requests = 0;
  const requestUrls: string[] = [];
  let releaseRequest = () => undefined;
  let observeRequest = () => undefined;
  const requestGate = new Promise<void>((resolve) => { releaseRequest = resolve; });
  const requested = new Promise<void>((resolve) => { observeRequest = resolve; });
  await page.route(
    releaseAssetPattern('src/transitions/hero-pattern/phone.tsx'),
    async (route) => {
      requests += 1;
      requestUrls.push(route.request().url());
      observeRequest();
      await requestGate;
      await route.abort('failed');
    }
  );
  try {
    await page.goto('/#hero', { waitUntil: 'domcontentloaded' });
    const before = await waitForCommitSequence(page, 'hero', 0);
    await requested;
    await page.evaluate(() => sessionStorage.setItem(
      'r5-phone-chunk-recovery-lineage-v1',
      JSON.stringify({
        lineageId: 'spent-transition-lineage', entryUrl: location.href,
        firstDocumentBuildId: 'first', currentDocumentBuildId: 'current',
        deployedBuildId: 'deployed', failedModuleUrl: '/assets/phone-old.js',
        failedModuleClass: 'transition-leaf', automaticReloadCount: 1,
        status: 'reloaded'
      })
    ));
    releaseRequest();
    await sendFrontIntent(page, 'forward');
    const shell = page.locator('.phone-story');
    await expect(shell).toHaveAttribute('data-phone-status', 'faulted');
    await expect(shell).toHaveAttribute('data-phone-scene', 'hero');
    expect(await readCommitSequence(page)).toBe(before);
    await assertTargetContentVisible(page, FRONT_CONTENT.hero);
    const retry = page.locator('[data-phone-retry="true"]');
    await expect(retry).toBeVisible();
    expect(requests).toBe(1);
    expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem(
      'r5-phone-chunk-recovery-lineage-v1'
    ) ?? 'null'))).toMatchObject({
      automaticReloadCount: 1,
      failedModuleClass: 'transition-leaf',
      status: 'fail-closed'
    });
    await retry.click();
    await expect.poll(() => requests).toBe(2);
    await expect(shell).toHaveAttribute('data-phone-status', 'stable');
    expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem(
      'r5-phone-chunk-recovery-lineage-v1'
    ) ?? 'null'))).toMatchObject({
      automaticReloadCount: 1,
      failedModuleClass: 'transition-leaf'
    });
    await page.waitForTimeout(750);
    expect(requests, JSON.stringify(requestUrls)).toBe(2);
    await sendFrontIntent(page, 'forward');
    await expect(shell).toHaveAttribute('data-phone-status', 'faulted');
    expect(requests, JSON.stringify(requestUrls)).toBe(2);
  } finally {
    releaseRequest();
  }
});

test('Hero image decode rejection reaches a bounded Loader fault with retry', async ({ page }) => {
  await page.addInitScript(() => {
    const image = HTMLImageElement.prototype;
    const originalComplete = Object.getOwnPropertyDescriptor(image, 'complete')?.get;
    const originalDecode = image.decode;
    Object.defineProperty(image, 'complete', {
      configurable: true,
      get() {
        if (this.className.includes('portrait-scroll-spike__hero-')) return false;
        return originalComplete?.call(this) ?? false;
      }
    });
    image.decode = async function patchedDecode() {
      if (this.className.includes('portrait-scroll-spike__hero-')) {
        throw new DOMException('image decode rejected', 'EncodingError');
      }
      return originalDecode.call(this);
    };
  });
  await page.goto('/#hero', { waitUntil: 'domcontentloaded' });
  const shell = page.locator('.phone-story');
  await expect(shell).toHaveAttribute('data-phone-status', 'faulted', {
    timeout: 20_000
  });
  await expect(shell).toHaveAttribute('data-phone-commit-sequence', '0');
  await expect(page.locator('[data-phone-retry="true"]')).toBeVisible();
  await expect(page.locator('[data-story-loader="true"]')).toBeVisible();
});

test('WebGL unavailable on an Ink leg rolls back over the committed source', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function patchedGetContext(
      contextId: string,
      ...options: unknown[]
    ) {
      if (['webgl', 'webgl2', 'experimental-webgl'].includes(contextId)) return null;
      return Reflect.apply(original, this, [contextId, ...options]);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  await page.goto('/#brand', { waitUntil: 'domcontentloaded' });
  const before = await waitForCommitSequence(page, 'brand', 0);
  await sendFrontIntent(page, 'forward');
  const shell = page.locator('.phone-story');
  await expectFigure3SliceRollback(
    page, 'brand', 'figure3-animation', 'forward', before
  );
  await expect(shell).toHaveAttribute('data-phone-scene', 'brand');
  expect(await readCommitSequence(page)).toBe(before);
  await assertTargetContentVisible(page, GRADE_A_CONTENT.brand);
  const status = await shell.getAttribute('data-phone-status');
  if (status === 'faulted') {
    await expect(page.locator('[data-phone-retry="true"]')).toBeVisible();
  } else {
    await expect(shell).toHaveAttribute('data-phone-interaction', 'enabled');
  }
});

test('withheld requestVideoFrameCallback uses Figure3 bounded poster fallback', async ({
  page
}) => {
  await page.addInitScript(() => {
    const requestFrame = HTMLVideoElement.prototype.requestVideoFrameCallback;
    const cancelFrame = HTMLVideoElement.prototype.cancelVideoFrameCallback;
    Object.defineProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback', {
      configurable: true,
      value(this: HTMLVideoElement, callback: VideoFrameRequestCallback) {
        if (this.closest('.phone-figure3')) return 0x3f3f;
        return requestFrame.call(this, callback);
      }
    });
    Object.defineProperty(HTMLVideoElement.prototype, 'cancelVideoFrameCallback', {
      configurable: true,
      value(this: HTMLVideoElement, handle: number) {
        if (this.closest('.phone-figure3') && handle === 0x3f3f) return;
        cancelFrame.call(this, handle);
      }
    });
  });
  await page.goto('/#brand', { waitUntil: 'domcontentloaded' });
  const before = await waitForCommitSequence(page, 'brand', 0);
  await waitForContinuousStoryReady(page);
  await nextAnimationFrame(page);
  await sendFrontIntent(page, 'forward');
  await waitForCommitSequence(page, 'figure3-animation', before);
  await assertTargetContentVisible(page, FIGURE3_SLICE_CONTENT['figure3-animation']);
  await expect(page.locator('.phone-figure3')).toHaveAttribute(
    'data-phone-figure3-initial-surface', 'poster-fallback'
  );
  await expect(page.locator('.phone-figure3'))
    .not.toHaveAttribute('data-phone-figure3-media-active', 'true');
  await expect(page.locator('[data-phone-figure3-paper-poster]')).toBeVisible();
  await expect(page.locator('[data-phone-figure3-paper-canvas]'))
    .not.toHaveAttribute('data-phone-figure3-paper-frame-index');
  await expect.poll(() => page.locator('.phone-figure3 video')
    .evaluate((video) => video.paused)).toBe(true);
});

test('Pattern advances its collapse leg before its radial Ink leg contributes pixels', async ({ page }) => {
  await page.goto('/#pattern', { waitUntil: 'domcontentloaded' });
  const before = await waitForCommitSequence(page, 'pattern', 0);
  const effect = page.locator(
    '[data-phone-plane="effect"] [data-r4-ink-segment="pattern-star-map"]'
  );

  await sendFrontIntent(page, 'forward');
  const firstLegHandle = await page.waitForFunction(() => {
    const shell = document.querySelector<HTMLElement>('.phone-story');
    const state = {
      scene: shell?.dataset.phoneScene,
      status: shell?.dataset.phoneStatus,
      phase: shell?.dataset.phonePhase,
      faultCode: shell?.dataset.phoneFaultCode
    };
    return state.phase === 'awaiting-leg-intent' || state.status === 'faulted'
      || (state.status === 'stable' && state.scene !== 'pattern') ? state : null;
  }, undefined, { timeout: 20_000 });
  const firstLeg = await firstLegHandle.jsonValue();
  expect(firstLeg).toMatchObject({
    scene: 'pattern', status: 'transaction', phase: 'awaiting-leg-intent'
  });
  await expect(effect).toBeAttached();
  await expect(effect).toBeHidden();

  await sendFrontIntent(page, 'forward');
  await expect(effect).toBeVisible({ timeout: 10_000 });
  await assertFormalInkCompositeContribution(page, 'pattern-star-map');
  await waitForCommitSequence(page, 'star-map', before);
  await expect(page.locator('[data-phone-activation]:not([hidden])')).toHaveCount(0);
});

for (const direction of ['forward', 'reverse'] as const) {
  test(`Hero ↔ Pattern ${direction} keeps the lower plane unmasked during radial reveal`, async ({
    page
  }) => {
    await page.goto(direction === 'forward' ? '/#hero' : '/#pattern', {
      waitUntil: 'domcontentloaded'
    });
    await waitForContinuousStoryReady(page);
    await sendFrontIntent(page, direction);
    await page.waitForFunction(() => {
      const effect = document.querySelector<HTMLElement>(
        '[data-r4-ink-segment="hero-pattern"]'
      );
      const progress = Number(effect?.dataset.r4InkBoundaryProgress);
      return Number.isFinite(progress) && progress > .2 && progress < .8;
    });
    const ownership = await page.locator('.phone-story').evaluate((shell) => {
      const source = shell.querySelector<HTMLElement>('[data-phone-plane="source"]');
      const receiver = shell.querySelector<HTMLElement>('[data-phone-plane="receiver"]');
      const sourceStyle = source ? getComputedStyle(source) : null;
      const receiverStyle = receiver ? getComputedStyle(receiver) : null;
      return {
        sourceMask: sourceStyle?.webkitMaskImage ?? 'none',
        targetMask: receiverStyle?.webkitMaskImage ?? 'none',
        sourceClip: sourceStyle?.webkitClipPath ?? 'none',
        targetClip: receiverStyle?.webkitClipPath ?? 'none',
        foreground: (shell as HTMLElement).dataset.phoneTransitionForeground
      };
    });
    expect(ownership.sourceMask).toBe('none');
    expect(ownership.targetMask).toBe('none');
    expect(direction === 'forward' ? ownership.sourceClip : ownership.targetClip).toBe('none');
    expect(direction === 'forward' ? ownership.targetClip : ownership.sourceClip)
      .toContain('circle(');
    expect(ownership.foreground).toBe(direction === 'forward' ? 'target' : 'source');
  });
}

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

test('Hero → Pattern radial Ink keeps WebKit frame pacing within the device-test gate', async ({
  page, browserName
}) => {
  test.skip(browserName !== 'webkit', 'WebKit compositor pacing gate.');
  await page.goto('/#hero', { waitUntil: 'domcontentloaded' });
  await waitForContinuousStoryReady(page);
  await page.evaluate(() => {
    const owner = window as typeof window & { __r5HeroInkPacing?: Promise<number[]> };
    owner.__r5HeroInkPacing = new Promise<number[]>((resolve) => {
      const samples: number[] = [];
      let previous: number | null = null;
      const started = performance.now();
      const sample = (now: number) => {
        const effect = document.querySelector<HTMLElement>(
          '[data-r4-ink-segment="hero-pattern"]'
        );
        const progress = Number(effect?.dataset.r4InkBoundaryProgress);
        if (Number.isFinite(progress) && progress > .08 && progress < .98) {
          if (previous !== null) samples.push(now - previous);
          previous = now;
        } else if (samples.length > 0 && (progress >= .98 || !effect)) {
          resolve(samples);
          return;
        }
        if (now - started > 10_000) {
          resolve(samples);
          return;
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
  });
  await sendFrontIntent(page, 'forward');
  const intervals = await page.evaluate(() => (
    window as typeof window & { __r5HeroInkPacing: Promise<number[]> }
  ).__r5HeroInkPacing);
  expect(intervals.length).toBeGreaterThan(20);
  const sorted = [...intervals].sort((left, right) => left - right);
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .95))]!;
  expect(p95).toBeLessThanOrEqual(25);
  const longFrameIndices = intervals.flatMap((interval, index) => interval > 40 ? [index] : []);
  expect(longFrameIndices.length, JSON.stringify({ intervals, longFrameIndices }))
    .toBeLessThanOrEqual(4);
});

test('Front reduced motion still reaches one fully proven target hold', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#hero', { waitUntil: 'domcontentloaded' });
  await waitForCommitSequence(page, 'hero', 0);
  await expect(page.locator('.phone-story')).toHaveAttribute('data-phone-reduced-motion', 'true');
  await traverseFront(page, 'hero', 'pattern', 'forward', false);
  await expect(page.locator('.portrait-scroll-spike__pattern-copy')).toHaveCSS('opacity', '1');
  await expect(page.locator('[data-phone-activation]:not([hidden])')).toHaveCount(0);
  await expect(page.locator('.phone-story')).toHaveAttribute('data-phone-status', 'stable');
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
