import { expect, test, type Page } from '@playwright/test';
import { inflateSync } from 'node:zlib';
import {
  phoneRun,
  type PhoneRunId
} from '../src/production/phone/phone-story-runs';
import { phoneScenePresentationContract } from '../src/production/phone/phone-story/manifest';

const LIVE_PHONE_ROOT = 'main[data-phone-authority-id]';
const LIVE_STORY_LOADER = '.story-loader[data-story-loader="true"]';
const WHEEL_QUIET_MS = 1_250;
const PHONE_COVERAGE_RGB = [7, 17, 14] as const;

type PngScreenshot = Readonly<{
  width: number;
  height: number;
  channels: 3 | 4;
  pixels: Uint8Array;
}>;

type NormalizedScreenshotRegion = Readonly<{
  left: number;
  top: number;
  right: number;
  bottom: number;
}>;

type PixelEvidence = Readonly<{
  samples: number;
  nonSurfacePixels: number;
  nonSurfaceRatio: number;
}>;

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function paethPredictor(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  return upDistance <= upLeftDistance ? up : upLeft;
}

/**
 * Decodes the non-interlaced RGB/RGBA PNG emitted by Playwright without adding
 * a test-only image dependency. Pixel evidence is deliberately taken from the
 * final compositor screenshot, never from DOM visibility or CSS z-index text.
 */
function decodePngScreenshot(png: Buffer): PngScreenshot {
  if (png.length < PNG_SIGNATURE.length || !png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error('expected a PNG screenshot');
  }

  let offset = PNG_SIGNATURE.length;
  let width = 0;
  let height = 0;
  let channels: 3 | 4 | undefined;
  const idat: Buffer[] = [];

  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    const typeOffset = offset + 4;
    const dataOffset = offset + 8;
    const dataEnd = dataOffset + length;
    if (dataEnd + 4 > png.length) throw new Error('truncated PNG chunk');
    const type = png.toString('ascii', typeOffset, dataOffset);
    const data = png.subarray(dataOffset, dataEnd);
    if (type === 'IHDR') {
      if (data.length !== 13 || width !== 0 || height !== 0) {
        throw new Error('invalid PNG header');
      }
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8];
      const colorType = data[9];
      const compression = data[10];
      const filter = data[11];
      const interlace = data[12];
      if (
        bitDepth !== 8
        || (colorType !== 2 && colorType !== 6)
        || compression !== 0
        || filter !== 0
        || interlace !== 0
      ) {
        throw new Error('unsupported PNG screenshot encoding');
      }
      channels = colorType === 2 ? 3 : 4;
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset = dataEnd + 4;
  }

  if (!width || !height || !channels || idat.length === 0) {
    throw new Error('incomplete PNG screenshot');
  }
  const rowBytes = width * channels;
  const decoded = inflateSync(Buffer.concat(idat));
  if (decoded.length !== height * (rowBytes + 1)) {
    throw new Error('unexpected PNG screenshot data length');
  }
  const pixels = Buffer.allocUnsafe(width * height * channels);
  for (let y = 0; y < height; y += 1) {
    const encodedOffset = y * (rowBytes + 1);
    const pixelOffset = y * rowBytes;
    const filter = decoded[encodedOffset] ?? 0;
    for (let channel = 0; channel < rowBytes; channel += 1) {
      const encoded = decoded[encodedOffset + 1 + channel] ?? 0;
      const left = channel >= channels ? pixels[pixelOffset + channel - channels] ?? 0 : 0;
      const up = y > 0 ? pixels[pixelOffset + channel - rowBytes] ?? 0 : 0;
      const upLeft = y > 0 && channel >= channels
        ? pixels[pixelOffset + channel - rowBytes - channels] ?? 0
        : 0;
      let value: number;
      switch (filter) {
        case 0:
          value = encoded;
          break;
        case 1:
          value = encoded + left;
          break;
        case 2:
          value = encoded + up;
          break;
        case 3:
          value = encoded + Math.floor((left + up) / 2);
          break;
        case 4:
          value = encoded + paethPredictor(left, up, upLeft);
          break;
        default:
          throw new Error(`unsupported PNG filter ${filter}`);
      }
      pixels[pixelOffset + channel] = value & 0xff;
    }
  }
  return { width, height, channels, pixels };
}

function screenshotBounds(
  screenshot: PngScreenshot,
  region: NormalizedScreenshotRegion
): Readonly<{ left: number; top: number; right: number; bottom: number }> {
  const left = Math.max(0, Math.min(screenshot.width - 1, Math.floor(region.left * screenshot.width)));
  const top = Math.max(0, Math.min(screenshot.height - 1, Math.floor(region.top * screenshot.height)));
  const right = Math.max(left + 1, Math.min(screenshot.width, Math.ceil(region.right * screenshot.width)));
  const bottom = Math.max(top + 1, Math.min(screenshot.height, Math.ceil(region.bottom * screenshot.height)));
  return { left, top, right, bottom };
}

function compositedPixelEvidence(
  screenshot: PngScreenshot,
  region: NormalizedScreenshotRegion,
  surface: readonly [number, number, number],
  tolerance = 14
): PixelEvidence {
  const bounds = screenshotBounds(screenshot, region);
  let nonSurfacePixels = 0;
  const samples = (bounds.right - bounds.left) * (bounds.bottom - bounds.top);
  for (let y = bounds.top; y < bounds.bottom; y += 1) {
    for (let x = bounds.left; x < bounds.right; x += 1) {
      const offset = (y * screenshot.width + x) * screenshot.channels;
      const distance = Math.max(
        Math.abs((screenshot.pixels[offset] ?? 0) - surface[0]),
        Math.abs((screenshot.pixels[offset + 1] ?? 0) - surface[1]),
        Math.abs((screenshot.pixels[offset + 2] ?? 0) - surface[2])
      );
      if (distance > tolerance) nonSurfacePixels += 1;
    }
  }
  return {
    samples,
    nonSurfacePixels,
    nonSurfaceRatio: nonSurfacePixels / samples
  };
}

function compositedPixelDelta(
  before: PngScreenshot,
  after: PngScreenshot,
  region: NormalizedScreenshotRegion,
  tolerance = 14
): number {
  if (
    before.width !== after.width
    || before.height !== after.height
    || before.channels !== after.channels
  ) {
    throw new Error('cannot compare screenshots with different dimensions');
  }
  const bounds = screenshotBounds(before, region);
  const samples = (bounds.right - bounds.left) * (bounds.bottom - bounds.top);
  let changed = 0;
  for (let y = bounds.top; y < bounds.bottom; y += 1) {
    for (let x = bounds.left; x < bounds.right; x += 1) {
      const offset = (y * before.width + x) * before.channels;
      const distance = Math.max(
        Math.abs((before.pixels[offset] ?? 0) - (after.pixels[offset] ?? 0)),
        Math.abs((before.pixels[offset + 1] ?? 0) - (after.pixels[offset + 1] ?? 0)),
        Math.abs((before.pixels[offset + 2] ?? 0) - (after.pixels[offset + 2] ?? 0))
      );
      if (distance > tolerance) changed += 1;
    }
  }
  return changed / samples;
}

const PHONE_HOLD_CONTRACTS = {
  hero: { checkpoint: 'hero-entered', edge: 'hero', edgeSurface: '#07110e', stageOwner: 'front', stageScene: 'hero' },
  pattern: { checkpoint: 'pattern-complete', edge: 'pattern', edgeSurface: '#8f7f61', stageOwner: 'front', stageScene: 'pattern' },
  'star-map': { checkpoint: 'star-map-reading', edge: 'star', edgeSurface: '#06100d', stageOwner: 'front', stageScene: 'star-map' },
  'aod-animation': { checkpoint: 'aod-stage', edge: 'aod', edgeSurface: '#ede4d2', stageOwner: 'front', stageScene: 'aod-animation' },
  'method-top': { checkpoint: 'method-intro', edge: 'method', edgeSurface: '#ede4d2', stageOwner: 'native', stageScene: 'none' },
  'figure2-animation': { checkpoint: 'figure2-stage', edge: 'figure2', edgeSurface: '#e2dac9', stageOwner: 'grade-a', stageScene: 'figure2-animation' },
  'figure2-proof': { checkpoint: 'figure2-proof-opening', edge: 'proof', edgeSurface: '#ede4d2', stageOwner: 'grade-a', stageScene: 'figure2-proof' },
  brand: { checkpoint: 'brand-reading', edge: 'brand', edgeSurface: '#ede4d2', stageOwner: 'native', stageScene: 'none' },
  'figure3-animation': { checkpoint: 'figure3-stage', edge: 'figure3', edgeSurface: '#ede4d2', stageOwner: 'group45', stageScene: 'figure3-animation' },
  services: { checkpoint: 'services-reading', edge: 'services', edgeSurface: '#ede4d2', stageOwner: 'native', stageScene: 'none' },
  'ttg-animation': { checkpoint: 'ttg-stage', edge: 'ttg', edgeSurface: '#080d10', stageOwner: 'group45', stageScene: 'ttg-animation' },
  lab: { checkpoint: 'lab-stable', edge: 'lab', edgeSurface: '#ede4d2', stageOwner: 'native', stageScene: 'none' },
  'ph-animation': { checkpoint: 'ph-stage', edge: 'ph', edgeSurface: '#9889a5', stageOwner: 'group67', stageScene: 'ph-animation' },
  education: { checkpoint: 'education-reading', edge: 'education', edgeSurface: '#ede4d2', stageOwner: 'native', stageScene: 'none' },
  'crane-animation': { checkpoint: 'crane-stage', edge: 'crane', edgeSurface: '#ede4d2', stageOwner: 'group67', stageScene: 'crane-animation' },
  contact: { checkpoint: 'contact-stable', edge: 'contact', edgeSurface: '#ede4d2', stageOwner: 'native', stageScene: 'none' }
} as const;

type PhoneStableScene = keyof typeof PHONE_HOLD_CONTRACTS;
type PhoneRouteScope = 'formal' | 'brand-lab';
type PhoneTransitionTraceState = Readonly<{
  at: number;
  actualY: number;
  authorityId: string | null;
  revision: string | null;
  cursor: string | null;
  session: string | null;
  generation: string | null;
  leg: string | null;
  direction: string | null;
  progress: number | null;
  phase: string | null;
  input: string | null;
  projection: string | null;
  scrollCorridor: string | null;
  scrollProgress: number | null;
  edge: string | null;
  stageOwner: string | null;
  stageScene: string | null;
  checkpoint: string | null;
  viewport: Readonly<{
    left: number;
    top: number;
    right: number;
    bottom: number;
  }>;
  coverageRoot: Readonly<{
    left: number;
    top: number;
    right: number;
    bottom: number;
  }> | null;
  surfaces: ReadonlyArray<Readonly<{
    className: string;
    role: string | null;
    endpoint: string | null;
    session: string | null;
    generation: string | null;
    top: number;
    right: number;
    bottom: number;
    left: number;
  }>>;
}>;

const PHONE_NAV_HASH: Partial<Record<PhoneStableScene, string>> = {
  'method-top': '#method',
  services: '#services',
  education: '#education',
  contact: '#contact'
};

function cssRgb(hex: string): string {
  const normalized = hex.replace('#', '');
  const channels = [0, 2, 4].map((offset) => Number.parseInt(
    normalized.slice(offset, offset + 2),
    16
  ));
  return `rgb(${channels.join(', ')})`;
}

/**
 * Reads every stable-contract field in one synchronous page evaluation so a
 * test never compares cursor, colors, coverage, and scroll from mixed
 * authority revisions.
 */
async function readPhoneEvidence(page: Page) {
  return page.evaluate(() => {
    const rectangle = (element: Element) => {
      const value = element.getBoundingClientRect();
      return {
        top: value.top,
        right: value.right,
        bottom: value.bottom,
        left: value.left,
        width: value.width,
        height: value.height
      };
    };
    const surface = (element: HTMLElement) => {
      const style = getComputedStyle(element);
      return {
        tag: element.tagName,
        id: element.id,
        className: element.className,
        role: element.dataset.phoneSurfaceRole ?? null,
        connected: element.isConnected,
        hidden: element.hidden,
        inert: element.inert || element.hasAttribute('inert'),
        visibility: style.visibility,
        display: style.display,
        opacity: Number.parseFloat(style.opacity || '1'),
        pointerEvents: style.pointerEvents,
        rect: rectangle(element)
      };
    };
    const authorityRoots = Array.from(
      document.querySelectorAll<HTMLElement>('[data-phone-authority-id]')
    ).filter((element) => element.isConnected).map((element) => {
      const style = getComputedStyle(element);
      return {
        authorityId: element.dataset.phoneAuthorityId ?? '',
        data: { ...element.dataset },
        connected: element.isConnected,
        hidden: element.hidden,
        inert: element.inert || element.hasAttribute('inert'),
        visibility: style.visibility,
        display: style.display,
        opacity: Number.parseFloat(style.opacity || '1'),
        pointerEvents: style.pointerEvents,
        rect: rectangle(element)
      };
    });
    const liveAuthorityRoots = authorityRoots.filter((root) => (
      root.authorityId.length > 0
      && !root.hidden
      && !root.inert
      && root.visibility !== 'hidden'
      && root.display !== 'none'
      && root.opacity > 0
    ));
    const rootElement = Array.from(
      document.querySelectorAll<HTMLElement>('[data-phone-authority-id]')
    ).find((element) => element.isConnected
      && element.dataset.phoneAuthorityId === liveAuthorityRoots[0]?.authorityId);
    const stableSurfaceElements = rootElement
      ? [
        ...(rootElement.matches('[data-phone-surface-role]') ? [rootElement] : []),
        ...Array.from(rootElement.querySelectorAll<HTMLElement>('[data-phone-surface-role]'))
      ]
        .filter((element) => (
          element.dataset.phoneSurfaceRole === 'stable'
          || element.dataset.phoneSurfaceRole === 'fixed-current'
        ))
      : [];
    const stableSurfaces = stableSurfaceElements.map(surface);
    const persistentStageCanvases = rootElement
      ? Array.from(
        rootElement.querySelectorAll<HTMLElement>(
          '.portrait-scroll-spike__stage-canvas'
        )
      )
      : [];
    const coverageElement = persistentStageCanvases[0]
      ?? stableSurfaceElements[0]
      ?? null;
    const visualViewport = window.visualViewport;
    const viewport = {
      left: visualViewport?.offsetLeft ?? 0,
      top: visualViewport?.offsetTop ?? 0,
      width: visualViewport?.width ?? window.innerWidth,
      height: visualViewport?.height ?? window.innerHeight
    };
    const appRoot = document.getElementById('root');
    const documentElement = document.documentElement;
    const navigationCurrent = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('nav.site-nav a[aria-current="page"]')
    ).map((link) => link.getAttribute('href')).filter((href): href is string => Boolean(href));
    return {
      authorityRoots,
      liveAuthorityRoots,
      revision: liveAuthorityRoots[0]?.data.phoneRevision ?? null,
      stableSurfaces,
      persistentStageCanvases: persistentStageCanvases.map(surface),
      coverageRoot: coverageElement ? surface(coverageElement) : null,
      actualY: window.scrollY,
      documentScrollTop: document.scrollingElement?.scrollTop ?? window.scrollY,
      viewport,
      navigationCurrent,
      colors: {
        document: getComputedStyle(documentElement).backgroundColor,
        body: getComputedStyle(document.body).backgroundColor,
        appRoot: appRoot ? getComputedStyle(appRoot).backgroundColor : null,
        routeEdgeSurface: rootElement?.style.getPropertyValue('--portrait-edge-surface').trim() ?? null,
        documentEdgeSurface: documentElement.style.getPropertyValue('--portrait-document-surface').trim(),
        documentEdgeScene: documentElement.dataset.portraitEdgeScene ?? null,
        theme: document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content ?? null
      }
    };
  });
}

function expectStablePhoneEvidence(
  evidence: Awaited<ReturnType<typeof readPhoneEvidence>>,
  scene: PhoneStableScene,
  scope: PhoneRouteScope
): void {
  const expected = PHONE_HOLD_CONTRACTS[scene];
  expect(evidence.liveAuthorityRoots).toHaveLength(1);
  const root = evidence.liveAuthorityRoots[0];
  if (!root) throw new Error('Expected exactly one live phone authority root');

  expect(evidence.revision).toBe(root.data.phoneRevision);
  expect(root.authorityId).not.toBe('');
  expect(root.data.phoneRevision).toMatch(/^\d+$/);
  expect(root.data.phoneAuthorityScope).toBe(scope);
  expect(root.data.phoneCursor).toBe(`hold:${scene}`);
  expect(root.data.phoneProjectionState).toBe('stable');
  expect(root.data.phoneStableScene).toBe(scene);
  expect(root.data.phoneSession).toBeUndefined();
  expect(root.data.phoneInputState).toBe('free');
  expect(root.data.phoneAnchorY).toBeUndefined();
  expect(root.connected).toBe(true);
  expect(root.hidden).toBe(false);
  expect(root.inert).toBe(false);
  expect(root.visibility).not.toBe('hidden');
  expect(root.display).not.toBe('none');
  expect(root.opacity).toBeGreaterThan(0);
  expect(root.pointerEvents).not.toBe('none');

  const scrollProgress = Number(root.data.phoneScrollProgress);
  expect(evidence.actualY).toBeCloseTo(evidence.documentScrollTop, 0);
  expect(Number.isFinite(scrollProgress)).toBe(true);
  expect(scrollProgress).toBeGreaterThanOrEqual(0);
  expect(scrollProgress).toBeLessThanOrEqual(1);
  if (root.data.phoneScrollCorridor !== undefined) {
    expect(root.data.phoneScrollCorridor).not.toBe('');
  }

  expect(root.data.phoneStageOwner).toBe(expected.stageOwner);
  expect(root.data.phoneStageScene).toBe(expected.stageScene);
  expect(root.data.portraitCheckpoint).toBe(expected.checkpoint);
  expect(root.data.portraitEdgeScene).toBe(expected.edge);
  expect(evidence.colors.documentEdgeScene).toBe(expected.edge);

  // Every stage-owned surface registers the one persistent canvas as its
  // coverage owner; the semantic root may legitimately land mid-document.
  expect(evidence.stableSurfaces).toHaveLength(1);
  expect(evidence.persistentStageCanvases).toHaveLength(1);
  const coverageRoot = evidence.coverageRoot;
  if (!coverageRoot) throw new Error('Expected one stable coverage root');
  expect(coverageRoot.connected).toBe(true);
  expect(coverageRoot.hidden).toBe(false);
  expect(coverageRoot.inert).toBe(false);
  expect(coverageRoot.visibility).not.toBe('hidden');
  expect(coverageRoot.display).not.toBe('none');
  expect(coverageRoot.opacity).toBeGreaterThan(0);
  expect(coverageRoot.rect.left).toBeLessThanOrEqual(evidence.viewport.left + 1);
  expect(coverageRoot.rect.top).toBeLessThanOrEqual(evidence.viewport.top + 1);
  expect(coverageRoot.rect.right).toBeGreaterThanOrEqual(
    evidence.viewport.left + evidence.viewport.width - 1
  );
  expect(coverageRoot.rect.bottom).toBeGreaterThanOrEqual(
    evidence.viewport.top + evidence.viewport.height - 1
  );

  const expectedColor = cssRgb(expected.edgeSurface);
  expect(root.data.portraitEdgeSurface).toBe(expected.edgeSurface);
  expect(evidence.colors.routeEdgeSurface).toBe(expected.edgeSurface);
  expect(evidence.colors.documentEdgeSurface).toBe(expected.edgeSurface);
  expect(evidence.colors.theme).toBe(expected.edgeSurface);
  expect(evidence.colors.document).toBe(expectedColor);
  expect(evidence.colors.body).toBe(expectedColor);
  expect(evidence.colors.appRoot).toBe(expectedColor);

  const navigationHash = PHONE_NAV_HASH[scene];
  expect(evidence.navigationCurrent).toEqual(
    navigationHash ? [navigationHash] : []
  );
}

async function assertStablePhoneHold(
  page: Page,
  scene: PhoneStableScene,
  options: Readonly<{ scope?: PhoneRouteScope; timeout?: number }> = {}
) {
  const timeout = options.timeout ?? 20_000;
  const scope = options.scope ?? 'formal';
  await expect(page.locator(LIVE_STORY_LOADER)).toBeHidden({ timeout });
  await expect.poll(async () => {
    const evidence = await readPhoneEvidence(page);
    try {
      expectStablePhoneEvidence(evidence, scene, scope);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }, {
    timeout,
    message: `waiting for complete stable hold:${scene} contract`
  }).toBeNull();
  const evidence = await readPhoneEvidence(page);
  expectStablePhoneEvidence(evidence, scene, scope);
  return page.locator(LIVE_PHONE_ROOT);
}

async function touchPhone(page: Page, deltaY: number): Promise<void> {
  await page.evaluate((inputDelta) => {
    const root = document.querySelector<HTMLElement>('[data-phone-authority-id]');
    if (!root) throw new Error('Phone authority root unavailable for touch input');
    const clientX = 195;
    const startY = 650;
    const point = (clientY: number) => ({
      identifier: 1,
      target: root,
      clientX,
      clientY,
      pageX: clientX + window.scrollX,
      pageY: clientY + window.scrollY,
      screenX: clientX,
      screenY: clientY
    });
    const dispatch = (type: 'touchstart' | 'touchmove' | 'touchend', touches: object[]) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        touches: { value: touches },
        targetTouches: { value: touches },
        changedTouches: { value: touches }
      });
      root.dispatchEvent(event);
    };
    dispatch('touchstart', [point(startY)]);
    dispatch('touchmove', [point(startY - inputDelta)]);
    dispatch('touchend', []);
  }, deltaY);
}

async function inputPhoneDelta(page: Page, deltaY: number): Promise<void> {
  if (page.context().browser()?.browserType().name() === 'webkit') {
    await touchPhone(page, deltaY);
    return;
  }
  await page.mouse.move(195, 180);
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
      stateEvents: PhoneTransitionTraceState[];
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
      cursorEvents: [],
      stateEvents: []
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
    let lastStateKey = '';
    const sampleState = () => {
      const root = document.querySelector<HTMLElement>('[data-phone-authority-id]');
      if (!root) return;
      const surfaces = Array.from(
        document.querySelectorAll<HTMLElement>('[data-phone-surface-role]')
      ).map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          className: element.className,
          role: element.dataset.phoneSurfaceRole ?? null,
          endpoint: element.dataset.phoneBoundaryEndpoint ?? null,
          session: element.dataset.phoneBoundarySession ?? null,
          generation: element.dataset.phoneBoundaryGeneration ?? null,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left
        };
      });
      const coverageElement = document.querySelector<HTMLElement>(
        '.portrait-scroll-spike__stage-canvas'
      );
      const coverageRect = coverageElement?.getBoundingClientRect() ?? null;
      const state: PhoneTransitionTraceState = {
        at: performance.now(),
        actualY: window.scrollY,
        authorityId: root.dataset.phoneAuthorityId ?? null,
        revision: root.dataset.phoneRevision ?? null,
        cursor: root.dataset.phoneCursor ?? null,
        session: root.dataset.phoneSession ?? null,
        generation: root.dataset.phoneTransitionGeneration ?? null,
        leg: root.dataset.phoneTransitionLeg ?? null,
        direction: root.dataset.phoneTransitionDirection ?? null,
        progress: root.dataset.phoneTransitionProgress === undefined
          ? null
          : Number(root.dataset.phoneTransitionProgress),
        phase: root.dataset.phoneTransitionPhase ?? null,
        input: root.dataset.phoneInputState ?? null,
        projection: root.dataset.phoneProjectionState ?? null,
        scrollCorridor: root.dataset.phoneScrollCorridor ?? null,
        scrollProgress: root.dataset.phoneScrollProgress === undefined
          ? null
          : Number(root.dataset.phoneScrollProgress),
        edge: root.dataset.portraitEdgeScene ?? null,
        stageOwner: root.dataset.phoneStageOwner ?? null,
        stageScene: root.dataset.phoneStageScene ?? null,
        checkpoint: root.dataset.portraitCheckpoint ?? null,
        viewport: {
          left: window.visualViewport?.offsetLeft ?? 0,
          top: window.visualViewport?.offsetTop ?? 0,
          right: (window.visualViewport?.offsetLeft ?? 0)
            + (window.visualViewport?.width ?? window.innerWidth),
          bottom: (window.visualViewport?.offsetTop ?? 0)
            + (window.visualViewport?.height ?? window.innerHeight)
        },
        coverageRoot: coverageRect ? {
          left: coverageRect.left,
          top: coverageRect.top,
          right: coverageRect.right,
          bottom: coverageRect.bottom
        } : null,
        surfaces
      };
      const key = JSON.stringify([
        state.revision,
        state.cursor,
        state.session,
        state.generation,
        state.leg,
        state.progress,
        state.phase,
        state.input,
        state.scrollCorridor,
        state.scrollProgress,
        state.edge,
        state.projection,
        state.surfaces.map((surface) => [
          surface.role,
          surface.endpoint,
          surface.session,
          surface.generation
        ])
      ]);
      if (key === lastStateKey) return;
      lastStateKey = key;
      probe.stateEvents.push(state);
      if (probe.stateEvents.length > 600) probe.stateEvents.shift();
    };
    new MutationObserver((records) => {
      sampleLoaders();
      if (records.some((record) => (
        record.type === 'attributes'
        && record.attributeName === 'data-phone-cursor'
      ))) {
        const shell = document.querySelector<HTMLElement>('[data-phone-cursor]');
        probe.cursorEvents.push({
          at: performance.now(),
          cursor: shell?.dataset.phoneCursor ?? null,
          lock: shell?.dataset.phoneTransitionLock ?? null,
          retryable: shell?.dataset.phoneRetryableRun ?? null
        });
        if (probe.cursorEvents.length > 200) probe.cursorEvents.shift();
      }
      sampleState();
    }).observe(document, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        'data-phone-cursor',
        'data-phone-revision',
        'data-phone-session',
        'data-phone-transition-generation',
        'data-phone-transition-leg',
        'data-phone-transition-direction',
        'data-phone-transition-progress',
        'data-phone-transition-phase',
        'data-phone-input-state',
        'data-phone-projection-state',
        'data-phone-scroll-corridor',
        'data-phone-scroll-progress',
        'data-phone-surface-role',
        'data-phone-boundary-session',
        'data-phone-boundary-generation',
        'data-phone-boundary-endpoint',
        'data-portrait-edge-scene'
      ]
    });
    sampleState();
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
          stateEvents: PhoneTransitionTraceState[];
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
      cursorEvents: probe.cursorEvents,
      stateEvents: probe.stateEvents
    };
  });
}

type HeroEntranceSample = Readonly<{
  loaderReady: string | null;
  progress: number | null;
}>;

async function installHeroEntranceProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const samples: HeroEntranceSample[] = [];
    const record = () => {
      const root = document.querySelector<HTMLElement>('.portrait-scroll-spike');
      const hero = document.querySelector<HTMLElement>(
        '.portrait-scroll-spike__scene--hero'
      );
      const rawProgress = hero?.dataset.heroProgress
        ?? (hero ? getComputedStyle(hero).getPropertyValue('--r4-hero-progress') : '');
      const parsed = Number.parseFloat(rawProgress);
      const sample: HeroEntranceSample = {
        loaderReady: root?.dataset.portraitLoaderReady ?? null,
        progress: Number.isFinite(parsed) ? parsed : null
      };
      const previous = samples.at(-1);
      if (
        !previous
        || previous.loaderReady !== sample.loaderReady
        || previous.progress === null
        || sample.progress === null
        || Math.abs(previous.progress - sample.progress) >= .001
      ) {
        samples.push(sample);
        if (samples.length > 800) samples.shift();
      }
      window.requestAnimationFrame(record);
    };
    window.requestAnimationFrame(record);
    (window as typeof window & {
      __phoneHeroEntranceProbe?: Readonly<{ samples: HeroEntranceSample[] }>;
    }).__phoneHeroEntranceProbe = { samples };
  });
}

async function heroEntranceSamples(page: Page): Promise<HeroEntranceSample[]> {
  return page.evaluate(() => (
    (window as typeof window & {
      __phoneHeroEntranceProbe?: Readonly<{ samples: HeroEntranceSample[] }>;
    }).__phoneHeroEntranceProbe?.samples ?? []
  ));
}

async function installAodClockWithoutCompositorFrame(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const target = window as typeof window & {
      __phoneAodNoFrameProbe?: {
        clockAdvanced: boolean;
        playCalls: number;
      };
    };
    const probe = { clockAdvanced: false, playCalls: 0 };
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(
      contextId: string,
      ...args: unknown[]
    ) {
      if (
        (contextId === 'webgl' || contextId === 'webgl2')
        && this.hasAttribute('data-aod-figure-canvas')
      ) {
        return null;
      }
      return Reflect.apply(originalGetContext, this, [contextId, ...args]);
    } as typeof HTMLCanvasElement.prototype.getContext;
    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function play() {
      if (!this.matches('[data-aod-figure-video]')) {
        return Reflect.apply(originalPlay, this, []);
      }
      probe.playCalls += 1;
      window.queueMicrotask(() => {
        try {
          this.currentTime = Math.max(.1, this.currentTime);
        } catch {
          // The liveness signal below is still the condition under test.
        }
        probe.clockAdvanced = true;
        this.dispatchEvent(new Event('timeupdate'));
      });
      return Promise.resolve();
    };
    target.__phoneAodNoFrameProbe = probe;
  });
}

async function aodNoFrameProbe(page: Page) {
  return page.evaluate(() => (
    (window as typeof window & {
      __phoneAodNoFrameProbe?: {
        clockAdvanced: boolean;
        playCalls: number;
      };
    }).__phoneAodNoFrameProbe
  ));
}

async function installLiveVisualViewportProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type ViewportState = {
      offsetLeft: number;
      offsetTop: number;
      width: number;
      height: number;
    };
    const state: ViewportState = {
      offsetLeft: 0,
      offsetTop: 0,
      width: window.innerWidth,
      height: window.innerHeight
    };
    const viewport = new EventTarget() as EventTarget & ViewportState;
    for (const key of Object.keys(state) as Array<keyof ViewportState>) {
      Object.defineProperty(viewport, key, {
        configurable: true,
        get: () => state[key]
      });
    }
    Object.defineProperty(viewport, 'scale', {
      configurable: true,
      get: () => 1
    });
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      get: () => viewport
    });
    (window as typeof window & {
      __phoneLiveViewportProbe?: {
        update(next: Partial<ViewportState>): void;
      };
    }).__phoneLiveViewportProbe = {
      update(next) {
        Object.assign(state, next);
        viewport.dispatchEvent(new Event('resize'));
        viewport.dispatchEvent(new Event('scroll'));
      }
    };
  });
}

async function setLiveVisualViewport(
  page: Page,
  next: Readonly<{ offsetLeft?: number; offsetTop?: number; width?: number; height?: number }>
): Promise<void> {
  await page.evaluate((value) => {
    const probe = (window as typeof window & {
      __phoneLiveViewportProbe?: {
        update(next: typeof value): void;
      };
    }).__phoneLiveViewportProbe;
    if (!probe) throw new Error('Live visual viewport probe is unavailable');
    probe.update(value);
  }, next);
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

function assertTransitionTrace(
  states: readonly PhoneTransitionTraceState[],
  from: PhoneStableScene,
  to: PhoneStableScene,
  direction: 1 | -1,
  options: Readonly<{ reducedMotion?: boolean }> = {}
): void {
  const transactionStates = states.filter((state) => (
    state.cursor?.startsWith('transition:')
    && state.session !== null
    && state.generation !== null
    && state.leg !== null
    && state.direction === String(direction)
  ));
  const first = transactionStates[0];
  expect(first, `missing transaction trace for ${from} → ${to}`).toBeTruthy();
  if (!first?.session || !first.generation) return;
  const runStates = transactionStates.filter((state) => (
    state.session === first.session && state.generation === first.generation
  ));
  expect(new Set(runStates.map((state) => state.authorityId))).toEqual(
    new Set([first.authorityId])
  );
  expect(new Set(runStates.map((state) => state.cursor?.split(':')[1])).size)
    .toBe(1);
  const runId = first.cursor?.split(':')[1] as PhoneRunId | undefined;
  if (!runId) throw new Error(`Missing run id for ${from} → ${to}`);
  const definition = phoneRun(runId);
  expect(definition.from).toBe(direction === 1 ? from : to);
  expect(definition.to).toBe(direction === 1 ? to : from);

  const legOrder: number[] = [];
  for (const state of runStates) {
    const leg = Number(state.leg);
    if (!Number.isInteger(leg)) continue;
    if (legOrder.at(-1) !== leg) legOrder.push(leg);
  }
  expect(legOrder.length).toBeGreaterThan(0);
  for (let index = 1; index < legOrder.length; index += 1) {
    expect(legOrder[index]).toBe(legOrder[index - 1]! + direction);
  }

  const targetEdge = PHONE_HOLD_CONTRACTS[to].edge;
  for (const leg of legOrder) {
    const definitionLeg = definition.legs[leg];
    if (!definitionLeg) throw new Error(`Missing ${runId} leg ${leg}`);
    const legStates = runStates.filter((state) => Number(state.leg) === leg);
    const progresses = legStates.flatMap((state) => (
      state.progress === null || !Number.isFinite(state.progress)
        ? []
        : [state.progress]
    ));
    expect(progresses.length, `missing progress trace for leg ${leg}`).toBeGreaterThan(0);
    const start = direction === 1 ? 0 : 1;
    const terminal = direction === 1 ? 1 : 0;
    if (options.reducedMotion) {
      expect(progresses.every((progress) => (
        Math.abs(progress - start) <= 0.05
        || Math.abs(progress - terminal) <= 0.05
      ))).toBe(true);
    } else {
      expect(progresses.some((progress) => Math.abs(progress - start) <= 0.05)).toBe(true);
      expect(progresses.some((progress) => Math.abs(progress - terminal) <= 0.05)).toBe(true);
      expect(progresses.some((progress) => progress > 0.05 && progress < 0.95)).toBe(true);
    }
    for (let index = 1; index < progresses.length; index += 1) {
      if (direction === 1) {
        expect(progresses[index]).toBeGreaterThanOrEqual(progresses[index - 1]! - 0.0001);
      } else {
        expect(progresses[index]).toBeLessThanOrEqual(progresses[index - 1]! + 0.0001);
      }
    }
    for (const state of legStates) {
      if (state.progress === null) continue;
      const legSource = direction === 1 ? definitionLeg.from : definitionLeg.to;
      const legTarget = direction === 1 ? definitionLeg.to : definitionLeg.from;
      if (state.projection === 'candidate') {
        expect(state.edge).toBe(targetEdge);
      } else {
        // A token-bound physical first frame can hand edge authority to the
        // receiver before its scalar playback sample advances. During an
        // active leg, either rendered endpoint is valid; a third scene is not.
        const allowedEdges = new Set([
          phoneScenePresentationContract(legSource).edge,
          phoneScenePresentationContract(legTarget).edge
        ]);
        expect(allowedEdges).toContain(state.edge);
      }
    }
    if (options.reducedMotion) continue;
    const endpointStates = legStates.filter((state) => state.surfaces.filter((surface) => (
      surface.role === 'transition-source' || surface.role === 'transition-receiver'
    )).length === 2);
    expect(
      endpointStates.length,
      `missing endpoints for leg ${leg}: ${JSON.stringify(legStates.map((state) => ({
        cursor: state.cursor,
        progress: state.progress,
        surfaces: state.surfaces.map((surface) => ({
          role: surface.role,
          endpoint: surface.endpoint,
          session: surface.session,
          generation: surface.generation
        }))
      })))}`
    ).toBeGreaterThan(0);
    for (const state of endpointStates) {
      const endpoints = state.surfaces.filter((surface) => (
        surface.role === 'transition-source' || surface.role === 'transition-receiver'
      ));
      expect(endpoints.filter((surface) => surface.role === 'transition-source')).toHaveLength(1);
      expect(endpoints.filter((surface) => surface.role === 'transition-receiver')).toHaveLength(1);
      const coverageRoot = state.coverageRoot;
      expect(coverageRoot, `missing coverage root for leg ${leg}`).toBeTruthy();
      if (coverageRoot) {
        expect(coverageRoot.left).toBeLessThanOrEqual(state.viewport.left + 1);
        expect(coverageRoot.top).toBeLessThanOrEqual(state.viewport.top + 1);
        expect(coverageRoot.right).toBeGreaterThanOrEqual(state.viewport.right - 1);
        expect(coverageRoot.bottom).toBeGreaterThanOrEqual(state.viewport.bottom - 1);
      }
    }
  }

  if (options.reducedMotion) {
    expect(runStates.some((state) => (
      state.projection === 'candidate'
      || state.surfaces.some((surface) => surface.role === 'candidate-stable')
    ))).toBe(true);
  }

  const transactionStartIndex = states.findIndex((state) => (
    state.session === first.session && state.generation === first.generation
  ));
  expect(transactionStartIndex, `missing transaction start for ${from} → ${to}`)
    .toBeGreaterThanOrEqual(0);
  const runTrace = states.slice(transactionStartIndex);
  const finalStableIndex = runTrace.findIndex((state) => state.cursor === `hold:${to}`);
  expect(finalStableIndex, `missing terminal hold:${to}`).toBeGreaterThanOrEqual(0);
  const beforeFinal = runTrace.slice(0, Math.max(0, finalStableIndex));
  const prematureHolds = beforeFinal.filter((state) => state.cursor?.startsWith('hold:'));
  const prematureUnlocks = beforeFinal.filter((state) => state.input === 'free');
  const traceSummary = JSON.stringify(runTrace.map((state) => ({
    cursor: state.cursor,
    session: state.session,
    generation: state.generation,
    leg: state.leg,
    progress: state.progress,
    input: state.input
  })));
  expect(prematureHolds, traceSummary).toEqual([]);
  expect(prematureUnlocks, traceSummary).toEqual([]);
}

/**
 * AOD reduced motion still owns one machine candidate. It may not enter the
 * media playback phase: only the target leaf's exact post-paint static frame
 * can release this locked candidate into its stable hold.
 */
function assertAodReducedStaticAdmissionTrace(
  states: readonly PhoneTransitionTraceState[],
  direction: 1 | -1
): void {
  const candidates = states.filter((state) => (
    state.cursor === 'transition:aod-method:0'
    && state.session !== null
 ));
  expect(candidates, 'missing AOD reduced candidate').not.toEqual([]);
  expect(new Set(candidates.map((state) => state.session)).size).toBe(1);
  expect(candidates.every((state) => (
    state.direction === String(direction)
    && state.phase === 'preparing'
    && state.projection === 'candidate'
    && state.input === 'locked'
    && state.progress !== null
    && Math.abs(state.progress - (direction === 1 ? 0 : 1)) <= .05
  ))).toBe(true);
  expect(candidates.some((state) => state.phase === 'animating')).toBe(false);
  expect(candidates.some((state) => state.projection === 'transition')).toBe(false);
}

/**
 * Method ↔ Figure2 uses the same reduced candidate protocol: one immutable
 * static token reaches the target leaf, and no rendered transition can start
 * before that target fact is accepted by the authority.
 */
function assertMethodFigure2ReducedStaticAdmissionTrace(
  states: readonly PhoneTransitionTraceState[],
  direction: 1 | -1
): void {
  const candidates = states.filter((state) => (
    state.cursor === 'transition:method-figure2:0'
    && state.session !== null
  ));
  expect(candidates, 'missing Method↔Figure2 reduced candidate').not.toEqual([]);
  expect(new Set(candidates.map((state) => state.session)).size).toBe(1);
  expect(candidates.every((state) => (
    state.direction === String(direction)
    && state.phase === 'preparing'
    && state.projection === 'candidate'
    && state.input === 'locked'
    && state.progress !== null
    && Math.abs(state.progress - (direction === 1 ? 0 : 1)) <= .05
  ))).toBe(true);
  expect(candidates.some((state) => state.phase === 'animating')).toBe(false);
  expect(candidates.some((state) => state.projection === 'transition')).toBe(false);
}

/**
 * Figure2 ↔ Proof is likewise an admission-only reduced edge: no ink
 * playback may bridge the static target leaf's raw token-bound poster proof.
 */
function assertFigure2ProofReducedStaticAdmissionTrace(
  states: readonly PhoneTransitionTraceState[],
  direction: 1 | -1
): void {
  const candidates = states.filter((state) => (
    state.cursor === 'transition:figure2-proof:0'
    && state.session !== null
  ));
  expect(candidates, 'missing Figure2↔Proof reduced candidate').not.toEqual([]);
  expect(new Set(candidates.map((state) => state.session)).size).toBe(1);
  expect(candidates.every((state) => (
    state.direction === String(direction)
    && state.phase === 'preparing'
    && state.projection === 'candidate'
    && state.input === 'locked'
    && state.progress !== null
    && Math.abs(state.progress - (direction === 1 ? 0 : 1)) <= .05
  ))).toBe(true);
  expect(candidates.some((state) => state.phase === 'animating')).toBe(false);
  expect(candidates.some((state) => state.projection === 'transition')).toBe(false);
}

/**
 * Proof ↔ Brand follows the same reduced admission contract, but its forward
 * leaf is the canonical native Brand document surface rather than the Ink
 * transition. The authority must remain a locked candidate until that leaf
 * reports its exact post-paint static frame.
 */
function assertProofBrandReducedStaticAdmissionTrace(
  states: readonly PhoneTransitionTraceState[],
  direction: 1 | -1
): void {
  const candidates = states.filter((state) => (
    state.cursor === 'transition:proof-brand:0'
    && state.session !== null
  ));
  expect(candidates, 'missing Proof↔Brand reduced candidate').not.toEqual([]);
  expect(new Set(candidates.map((state) => state.session)).size).toBe(1);
  expect(candidates.every((state) => (
    state.direction === String(direction)
    && state.phase === 'preparing'
    && state.projection === 'candidate'
    && state.input === 'locked'
    && state.progress !== null
    && Math.abs(state.progress - (direction === 1 ? 0 : 1)) <= .05
  ))).toBe(true);
  expect(candidates.some((state) => state.phase === 'animating')).toBe(false);
  expect(candidates.some((state) => state.projection === 'transition')).toBe(false);
}

/**
 * Lab ↔ Education keeps PH as a capability dependency only in reduced motion.
 * The candidate must settle through the native leaf's exact static fact, with
 * no compositor playback phase or compatibility endpoint writer in between.
 */
function assertLabEducationReducedStaticAdmissionTrace(
  states: readonly PhoneTransitionTraceState[],
  direction: 1 | -1
): void {
  const admissionLeg = direction === 1 ? 0 : 1;
  const candidates = states.filter((state) => (
    state.cursor === `transition:lab-education:${admissionLeg}`
    && state.session !== null
  ));
  expect(candidates, `missing Lab↔Education reduced candidate on leg ${admissionLeg}`)
    .not.toEqual([]);
  expect(new Set(candidates.map((state) => state.session)).size).toBe(1);
  expect(candidates.every((state) => (
    state.direction === String(direction)
    && state.phase === 'preparing'
    && state.projection === 'candidate'
    && state.input === 'locked'
    && state.progress !== null
    && Math.abs(state.progress - (direction === 1 ? 0 : 1)) <= .05
  ))).toBe(true);
  expect(candidates.some((state) => state.phase === 'animating')).toBe(false);
  expect(candidates.some((state) => state.projection === 'transition')).toBe(false);
}

const FRONT_SCROLL_RUNS = [
  {
    from: 'hero',
    to: 'pattern',
    id: 'hero-pattern-scroll'
  },
  {
    from: 'pattern',
    to: 'star-map',
    id: 'pattern-star-scroll'
  },
  {
    from: 'star-map',
    to: 'aod-animation',
    id: 'star-aod-scroll'
  }
] as const;

type FrontScrollRun = (typeof FRONT_SCROLL_RUNS)[number];

function frontScrollRun(
  from: PhoneStableScene,
  to: PhoneStableScene
): FrontScrollRun {
  const match = FRONT_SCROLL_RUNS.find((candidate) => (
    (candidate.from === from && candidate.to === to)
    || (candidate.from === to && candidate.to === from)
  ));
  if (!match) throw new Error(`Unknown front scroll run: ${from} → ${to}`);
  return match;
}

function assertFrontScrollTrace(
  states: readonly PhoneTransitionTraceState[],
  from: PhoneStableScene,
  to: PhoneStableScene,
  direction: 1 | -1
): void {
  const run = frontScrollRun(from, to).id;
  const transitionStartIndex = states.findIndex(
    (state) => state.cursor === `transition:${run}:0`
  );
  expect(transitionStartIndex, `missing front scroll trace for ${from} → ${to}`)
    .toBeGreaterThanOrEqual(0);
  const finalStableIndex = states.findIndex((state, index) => (
    index >= transitionStartIndex && state.cursor === `hold:${to}`
  ));
  expect(finalStableIndex, `missing Front terminal hold:${to}`).toBeGreaterThanOrEqual(0);
  const runTrace = states.slice(transitionStartIndex, finalStableIndex + 1);
  const trace = runTrace.filter((state) => state.cursor === `transition:${run}:0`);
  expect(trace, `missing front scroll trace for ${from} → ${to}`).not.toEqual([]);
  expect(new Set(trace.map((state) => state.authorityId)).size).toBe(1);
  expect(trace.every((state) => state.session === null && state.input === 'free')).toBe(true);
  expect(new Set(trace.map((state) => state.scrollCorridor))).toEqual(new Set(['front-rail']));
  const prematureHolds = runTrace.slice(0, -1).filter((state) => (
    state.cursor?.startsWith('hold:')
  ));
  expect(prematureHolds).toEqual([]);
  const progresses = trace.flatMap((state) => (
    state.scrollProgress === null || !Number.isFinite(state.scrollProgress)
      ? []
      : [state.scrollProgress]
  ));
  expect(progresses.some((progress) => progress > .05 && progress < .95)).toBe(true);
  for (let index = 1; index < progresses.length; index += 1) {
    if (direction === 1) {
      expect(progresses[index]).toBeGreaterThanOrEqual(progresses[index - 1]! - .0001);
    } else {
      expect(progresses[index]).toBeLessThanOrEqual(progresses[index - 1]! + .0001);
    }
  }
  for (const state of trace) {
    const source = state.surfaces.filter((surface) => surface.role === 'transition-source');
    const receiver = state.surfaces.filter((surface) => surface.role === 'transition-receiver');
    const stateSummary = JSON.stringify({
      cursor: state.cursor,
      actualY: state.actualY,
      scrollProgress: state.scrollProgress,
      surfaces: state.surfaces.map((surface) => ({
        className: surface.className,
        role: surface.role,
        endpoint: surface.endpoint
      }))
    });
    expect(source, stateSummary).toHaveLength(1);
    expect(receiver, stateSummary).toHaveLength(1);
    const coverageRoot = state.coverageRoot;
    expect(coverageRoot).toBeTruthy();
    if (!coverageRoot) continue;
    expect(coverageRoot.left).toBeLessThanOrEqual(state.viewport.left + 1);
    expect(coverageRoot.top).toBeLessThanOrEqual(state.viewport.top + 1);
    expect(coverageRoot.right).toBeGreaterThanOrEqual(state.viewport.right - 1);
    expect(coverageRoot.bottom).toBeGreaterThanOrEqual(state.viewport.bottom - 1);
  }
}

async function driveFrontScrollRun(
  page: Page,
  from: PhoneStableScene,
  to: PhoneStableScene,
  direction: 1 | -1
): Promise<void> {
  const shell = await assertStablePhoneHold(page, from);
  await waitForNewWheelEpoch(page);
  await page.evaluate(() => {
    const probe = (window as typeof window & {
      __phoneRuntimeProbe?: { stateEvents: unknown[] };
    }).__phoneRuntimeProbe;
    if (probe) probe.stateEvents.length = 0;
  });
  const run = frontScrollRun(from, to);
  const expectedDirection = run.from === from ? 1 : -1;
  expect(direction).toBe(expectedDirection);
  let sawTransition = false;
  let reachedTarget = false;
  for (let pulse = 0; pulse < 64; pulse += 1) {
    // Keep every synthetic input below the narrowest Front handoff span.
    // The contract must observe an actual transition sample, not merely land
    // in the following hold after a browser-coalesced wheel jump.
    await inputPhoneDelta(page, direction * 50);
    await page.waitForTimeout(100);
    const cursor = await shell.getAttribute('data-phone-cursor');
    sawTransition ||= cursor === `transition:${run.id}:0`;
    if (cursor === `hold:${to}`) {
      reachedTarget = true;
      break;
    }
  }
  const inputDiagnostics = await page.evaluate(() => {
    const probe = (window as typeof window & {
      __phoneRuntimeProbe?: {
        wheelEvents: unknown[];
        cursorEvents: unknown[];
        stateEvents: unknown[];
      };
    }).__phoneRuntimeProbe;
    const root = document.querySelector<HTMLElement>('[data-phone-authority-id]');
    const rail = document.querySelector<HTMLElement>('.portrait-scroll-spike__stage-rail');
    const stage = document.querySelector<HTMLElement>('.portrait-scroll-spike__stage-canvas');
    const railRect = rail?.getBoundingClientRect() ?? null;
    const stageRect = stage?.getBoundingClientRect() ?? null;
    return {
      y: window.scrollY,
      cursor: root?.dataset.phoneCursor ?? null,
      scrollProgress: root?.dataset.phoneScrollProgress ?? null,
      scrollCorridor: root?.dataset.phoneScrollCorridor ?? null,
      geometry: {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
        visualViewport: window.visualViewport ? {
          width: window.visualViewport.width,
          height: window.visualViewport.height,
          scale: window.visualViewport.scale
        } : null,
        railTop: railRect ? railRect.top + window.scrollY : null,
        railHeight: railRect?.height ?? null,
        stageHeight: stageRect?.height ?? null,
        configuredDistance: root?.style.getPropertyValue('--portrait-stage-scroll-distance') ?? null
      },
      wheelEvents: probe?.wheelEvents.slice(-8),
      cursorEvents: probe?.cursorEvents.slice(-12),
      stateEventsHead: probe?.stateEvents.slice(0, 12),
      stateEvents: probe?.stateEvents.slice(-24)
    };
  });
  expect(
    sawTransition,
    `front wheel input did not enter ${run.id}: ${JSON.stringify(inputDiagnostics)}`
  ).toBe(true);
  expect(
    reachedTarget,
    `front wheel input did not settle hold:${to}: ${JSON.stringify(inputDiagnostics)}`
  ).toBe(true);
  await assertStablePhoneHold(page, to, { timeout: 30_000 });
  assertFrontScrollTrace((await phoneRuntimeProbe(page)).stateEvents, from, to, direction);
}

function assertReducedFrontHoldTrace(
  states: readonly PhoneTransitionTraceState[],
  from: PhoneStableScene,
  to: PhoneStableScene,
  direction: 1 | -1
): void {
  const run = frontScrollRun(from, to).id;
  const terminal = states.findIndex((state) => state.cursor === `hold:${to}`);
  expect(terminal, `missing reduced front terminal hold:${to}`).toBeGreaterThanOrEqual(0);
  const trace = states.slice(0, terminal + 1);
  expect(trace.some((state) => state.cursor === `transition:${run}:0`)).toBe(false);
  expect(trace.some((state) => state.scrollCorridor === 'front-rail')).toBe(true);
  const candidates = trace.filter((state) => state.session !== null);
  expect(candidates, `missing reduced candidate for ${from} → ${to}`).not.toEqual([]);
  const candidateSession = candidates[0]!.session;
  const candidateProgress = direction === 1 ? 0 : 1;
  expect(candidates.every((state) => (
    state.input === 'locked'
    && state.projection === 'candidate'
    && state.phase === 'preparing'
    && state.session === candidateSession
    && state.progress !== null
    && Math.abs(state.progress - candidateProgress) <= .05
  ))).toBe(true);
  expect(candidates.at(-1)!.at - candidates[0]!.at).toBeLessThan(2_000);
  expect(trace.every((state) => (
    state.session === null ? state.input === 'free' : state.input === 'locked'
  ))).toBe(true);
  expect(trace.some((state) => state.projection === 'transition')).toBe(false);
  expect(new Set(trace.map((state) => state.authorityId)).size).toBe(1);
}

async function driveReducedFrontHold(
  page: Page,
  from: PhoneStableScene,
  to: PhoneStableScene,
  direction: 1 | -1
): Promise<void> {
  const shell = await assertStablePhoneHold(page, from);
  await waitForNewWheelEpoch(page);
  await page.evaluate(() => {
    const probe = (window as typeof window & {
      __phoneRuntimeProbe?: { stateEvents: unknown[] };
    }).__phoneRuntimeProbe;
    if (probe) probe.stateEvents.length = 0;
  });
  const startY = await page.evaluate(() => window.scrollY);
  let reachedTarget = false;
  for (let pulse = 0; pulse < 64; pulse += 1) {
    await inputPhoneDelta(page, direction * 250);
    await page.waitForTimeout(100);
    if (await shell.getAttribute('data-phone-cursor') === `hold:${to}`) {
      reachedTarget = true;
      break;
    }
  }
  const targetY = await page.evaluate(() => window.scrollY);
  expect(reachedTarget, `reduced front input did not settle hold:${to}`).toBe(true);
  expect(direction === 1 ? targetY > startY : targetY < startY).toBe(true);
  await assertStablePhoneHold(page, to, { timeout: 30_000 });
  assertReducedFrontHoldTrace(
    (await phoneRuntimeProbe(page)).stateEvents,
    from,
    to,
    direction
  );
}

async function driveAdjacentPhoneRun(
  page: Page,
  from: PhoneStableScene,
  to: PhoneStableScene,
  direction: 1 | -1,
  settleTimeout = 45_000,
  scope: PhoneRouteScope = 'formal',
  options: Readonly<{ reducedMotion?: boolean }> = {}
): Promise<void> {
  const shell = await assertStablePhoneHold(page, from, { scope });
  const probeInstalled = await page.evaluate(() => Boolean(
    (window as typeof window & { __phoneRuntimeProbe?: unknown })
      .__phoneRuntimeProbe
  ));
  expect(probeInstalled, 'installColdPhoneRuntimeProbe() must run before navigation').toBe(true);
  await waitForNewWheelEpoch(page);
  await page.evaluate(() => {
    const probe = (
      window as typeof window & {
        __phoneRuntimeProbe?: {
          wheelEvents: unknown[];
          cursorEvents: unknown[];
          stateEvents: unknown[];
        };
      }
    ).__phoneRuntimeProbe;
    if (!probe) return;
    probe.wheelEvents.length = 0;
    probe.cursorEvents.length = 0;
    probe.stateEvents.length = 0;
  });
  const startY = await page.evaluate(() => window.scrollY);
  let leftSource = false;
  for (let pulse = 0; pulse < 64; pulse += 1) {
    await inputPhoneDelta(page, direction * 250);
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
          stateEvents: unknown[];
        };
      }
    ).__phoneRuntimeProbe;
    const landmarks = [
      '#figure3-animation',
      '#ttg-animation',
      '#ph-animation',
      '#crane-animation',
      '[data-phone-acceptance-chapter="contact"]'
    ].map((selector) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) return { selector, documentTop: null };
      return {
        selector,
        documentTop: window.scrollY + element.getBoundingClientRect().top
      };
    });
    return {
      y: window.scrollY,
      cursor: document.querySelector('[data-phone-cursor]')
        ?.getAttribute('data-phone-cursor'),
      input: document.querySelector('[data-phone-cursor]')
        ?.getAttribute('data-phone-input-state'),
      wheelEvents: probe?.wheelEvents.slice(-8),
      cursorEvents: probe?.cursorEvents.slice(-12),
      stateEvents: probe?.stateEvents.slice(-24),
      landmarks
    };
  });
  expect(
    leftSource,
    `wheel input did not leave hold:${from} from ${startY}: ${
      JSON.stringify(inputDiagnostics)
    }`
  ).toBe(true);
  try {
    await assertStablePhoneHold(page, to, { timeout: settleTimeout, scope });
  } catch (error) {
    const failedProbe = await phoneRuntimeProbe(page);
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\n`
      + `transition trace: ${JSON.stringify({
        wheels: failedProbe.wheelEvents.slice(-8),
        cursors: failedProbe.cursorEvents.slice(-12),
        states: failedProbe.stateEvents.slice(-32)
      })}`
    );
  }
  await page.waitForTimeout(50);
  const probe = await phoneRuntimeProbe(page);
  assertTransitionTrace(probe.stateEvents, from, to, direction, options);
  const runtime = await phoneRuntimeProbe(page);
  // Figure2 legitimately owns its packed-alpha canvas alongside the shared
  // stage resources. The production invariant is the global hard ceiling,
  // not an obsolete two-context steady-state assumption.
  expect(runtime.active, `stable WebGL cap after ${from} → ${to}: ${JSON.stringify({
    active: runtime.active,
    maxActive: runtime.maxActive,
    created: runtime.created
  })}`).toBeLessThanOrEqual(4);
  expect(runtime.maxActive).toBeLessThanOrEqual(4);
}

const FORMAL_FORWARD_JOURNEY = [
  ['hero', 'pattern'],
  ['pattern', 'star-map'],
  ['star-map', 'aod-animation'],
  ['aod-animation', 'method-top'],
  ['method-top', 'figure2-animation'],
  ['figure2-animation', 'figure2-proof'],
  ['figure2-proof', 'brand'],
  ['brand', 'services'],
  ['services', 'lab'],
  ['lab', 'education'],
  ['education', 'contact']
] as const satisfies ReadonlyArray<readonly [PhoneStableScene, PhoneStableScene]>;

const FORMAL_REVERSE_JOURNEY = [
  ['contact', 'education'],
  ['education', 'lab'],
  ['lab', 'services'],
  ['services', 'brand'],
  ['brand', 'figure2-proof'],
  ['figure2-proof', 'figure2-animation'],
  ['figure2-animation', 'method-top'],
  ['method-top', 'aod-animation'],
  ['aod-animation', 'star-map'],
  ['star-map', 'pattern'],
  ['pattern', 'hero']
] as const satisfies ReadonlyArray<readonly [PhoneStableScene, PhoneStableScene]>;

const FORMAL_DIRECT_ENTRIES = [
  ['#method', 'method-top'],
  ['#figure2-animation', 'figure2-animation'],
  ['#figure2-proof', 'figure2-proof'],
  ['#brand', 'brand'],
  ['#figure3-animation', 'figure3-animation'],
  ['#services', 'services'],
  ['#ttg-animation', 'ttg-animation'],
  ['#lab', 'lab'],
  ['#ph-animation', 'ph-animation'],
  ['#education', 'education'],
  ['#crane-animation', 'crane-animation'],
  ['#contact', 'contact']
] as const satisfies ReadonlyArray<readonly [string, PhoneStableScene]>;

function isFrontJourneyLeg(from: PhoneStableScene, to: PhoneStableScene): boolean {
  return FRONT_SCROLL_RUNS.some((run) => (
    (run.from === from && run.to === to)
    || (run.from === to && run.to === from)
  ));
}

async function driveJourney(
  page: Page,
  legs: ReadonlyArray<readonly [PhoneStableScene, PhoneStableScene]>,
  options: Readonly<{ reducedMotion?: boolean }> = {}
): Promise<void> {
  for (const [from, to] of legs) {
    const direction: 1 | -1 = FORMAL_FORWARD_JOURNEY.some(([source, target]) => (
      source === from && target === to
    )) ? 1 : -1;
    if (isFrontJourneyLeg(from, to)) {
      if (options.reducedMotion) {
        await driveReducedFrontHold(page, from, to, direction);
      } else {
        await driveFrontScrollRun(page, from, to, direction);
      }
    } else {
      await driveAdjacentPhoneRun(
        page,
        from,
        to,
        direction,
        45_000,
        'formal',
        options
      );
    }
  }
}

async function visitFormal(
  page: Page,
  path: string,
  scene: PhoneStableScene
): Promise<void> {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await assertStablePhoneHold(page, scene);
}

/**
 * A stable cursor alone is not evidence that a cold deep link rendered its
 * selected hold. Verify the manifest's own copy/frame probes are visible in
 * the live visual viewport after every direct navigation form.
 */
async function assertDirectEntryPresentation(
  page: Page,
  scene: PhoneStableScene
): Promise<void> {
  const probe = phoneScenePresentationContract(scene).contentProbe;
  const result = await page.evaluate(({ contentProbe }) => {
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft ?? 0;
    const top = viewport?.offsetTop ?? 0;
    const right = left + (viewport?.width ?? window.innerWidth);
    const bottom = top + (viewport?.height ?? window.innerHeight);
    const visible = (element: HTMLElement) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return element.isConnected
        && !element.hidden
        && !element.inert
        && !element.hasAttribute('inert')
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && style.visibility !== 'collapse'
        && Number.parseFloat(style.opacity || '1') > .01
        && rect.width > 0
        && rect.height > 0
        && rect.right > left
        && rect.left < right
        && rect.bottom > top
        && rect.top < bottom;
    };
    const inspect = (selector: string, requireText: boolean) => {
      const candidate = Array.from(
        document.querySelectorAll<HTMLElement>(selector)
      ).find((element) => visible(element));
      return {
        selector,
        visible: Boolean(candidate),
        text: candidate?.textContent?.trim() ?? '',
        satisfied: Boolean(candidate) && (!requireText || Boolean(candidate.textContent?.trim()))
      };
    };
    const text = contentProbe.textSelectors.map((selector) => inspect(selector, true));
    const frame = contentProbe.frameSelectors.map((selector) => inspect(selector, false));
    return {
      text,
      frame,
      missing: [...text, ...frame]
        .filter((entry) => !entry.satisfied)
        .map((entry) => entry.selector)
    };
  }, { contentProbe: probe });
  expect(result.missing, `direct ${scene} content/frame proof`).toEqual([]);
}

test('Task 0 rejects a visible Hero completed-to-zero reset on cold WebKit load', async ({
  page,
  browserName
}) => {
  test.skip(browserName !== 'webkit', 'the confirmed flash is sampled on WebKit');
  test.setTimeout(45_000);
  await installHeroEntranceProbe(page);
  await visitFormal(page, '/', 'hero');
  await expect.poll(async () => page.locator(LIVE_PHONE_ROOT).getAttribute(
    'data-portrait-hero-entrance'
  )).toBe('complete');

  const exposed = (await heroEntranceSamples(page)).filter((sample) => (
    sample.loaderReady === 'true' && sample.progress !== null
  ));
  expect(exposed.length).toBeGreaterThan(1);
  expect(exposed[0]?.progress).toBeLessThanOrEqual(.001);

  const resetIndex = exposed.findIndex((sample, index) => (
    index > 0
    && sample.progress !== null
    && sample.progress <= .001
    && exposed.slice(0, index).some((prior) => (
      prior.progress !== null && prior.progress >= .999
    ))
  ));
  expect(resetIndex).toBe(-1);
});

test('Task 0 does not animate AOD when media liveness has no compositor frame', async ({
  page
}) => {
  test.setTimeout(90_000);
  await installAodClockWithoutCompositorFrame(page);
  await installColdPhoneRuntimeProbe(page);
  await visitFormal(page, '/', 'hero');
  await driveFrontScrollRun(page, 'hero', 'pattern', 1);
  await driveFrontScrollRun(page, 'pattern', 'star-map', 1);
  await driveFrontScrollRun(page, 'star-map', 'aod-animation', 1);
  await waitForNewWheelEpoch(page);

  for (let pulse = 0; pulse < 8; pulse += 1) {
    await inputPhoneDelta(page, 250);
    await page.waitForTimeout(100);
    const trace = await phoneRuntimeProbe(page);
    if (trace.stateEvents.some((state) => (
      state.cursor === 'transition:aod-method:0'
    ))) break;
  }

  await expect.poll(async () => (
    (await phoneRuntimeProbe(page)).stateEvents.some((state) => (
      state.cursor === 'transition:aod-method:0'
    ))
  )).toBe(true);
  await page.waitForTimeout(500);

  const liveness = await aodNoFrameProbe(page);
  expect(liveness?.playCalls).toBeGreaterThan(0);
  expect(liveness?.clockAdvanced).toBe(true);
  const trace = await phoneRuntimeProbe(page);
  expect(trace.stateEvents.some((state) => (
    state.cursor === 'transition:aod-method:0'
    && state.phase === 'animating'
  ))).toBe(false);
});

test('Task 0 keeps the coverage plane over a non-zero live visual viewport offset', async ({
  page
}) => {
  test.setTimeout(30_000);
  await installLiveVisualViewportProbe(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator(LIVE_STORY_LOADER)).toBeHidden();
  await expect.poll(async () => page.locator(LIVE_PHONE_ROOT).getAttribute(
    'data-phone-cursor'
  )).toBe('hold:hero');
  await setLiveVisualViewport(page, {
    offsetTop: 160,
    height: 844
  });
  await page.waitForTimeout(300);

  const coverage = await page.evaluate(() => {
    const viewport = window.visualViewport;
    const stage = document.querySelector<HTMLElement>(
      '.portrait-scroll-spike__stage-canvas'
    );
    if (!viewport || !stage) throw new Error('Missing live viewport or coverage plane');
    const rect = stage.getBoundingClientRect();
    return {
      viewport: {
        left: viewport.offsetLeft,
        top: viewport.offsetTop,
        right: viewport.offsetLeft + viewport.width,
        bottom: viewport.offsetTop + viewport.height
      },
      coverage: {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom
      }
    };
  });
  expect(coverage.coverage.left).toBeLessThanOrEqual(coverage.viewport.left + 1);
  expect(coverage.coverage.top).toBeLessThanOrEqual(coverage.viewport.top + 1);
  expect(coverage.coverage.right).toBeGreaterThanOrEqual(coverage.viewport.right - 1);
  expect(coverage.coverage.bottom).toBeGreaterThanOrEqual(
    coverage.viewport.bottom - 1
  );
});

test('Task 10 gates a cold production formal Hero → Contact journey', async ({ page }) => {
  test.setTimeout(120_000);
  const webGlWarnings: string[] = [];
  page.on('console', (message) => {
    if (/too many active webgl contexts/i.test(message.text())) {
      webGlWarnings.push(message.text());
    }
  });

  await installColdPhoneRuntimeProbe(page);
  await visitFormal(page, '/', 'hero');
  await driveJourney(page, FORMAL_FORWARD_JOURNEY);
  await assertStablePhoneHold(page, 'contact');

  const probe = await phoneRuntimeProbe(page);
  expect(probe.maxLoaderCount).toBe(1);
  expect(probe.maxActive).toBeLessThanOrEqual(4);
  expect(webGlWarnings).toEqual([]);
  const booleanContract = await cssBooleanContractViolations(page);
  expect(booleanContract.contractCount).toBeGreaterThan(10);
  expect(booleanContract.violations).toEqual([]);
});

test('Task 10 gates a production Contact → Hero reverse journey', async ({ page }) => {
  test.setTimeout(120_000);
  await installColdPhoneRuntimeProbe(page);
  await visitFormal(page, '/#contact', 'contact');
  const authorityId = await page.locator(LIVE_PHONE_ROOT).getAttribute(
    'data-phone-authority-id'
  );

  await driveJourney(page, FORMAL_REVERSE_JOURNEY);
  const hero = await assertStablePhoneHold(page, 'hero');
  await expect(hero).toHaveAttribute('data-phone-authority-id', authorityId!);
  expect((await phoneRuntimeProbe(page)).maxActive).toBeLessThanOrEqual(4);
});

test('Task 10 completes two full-motion formal round trips in one authority', async ({ page }) => {
  // Retain the real inter-epoch quiet window on every leg. Two complete
  // production round trips therefore exceed the ordinary per-spec budget;
  // shortening the cadence would stop exercising momentum separation.
  test.setTimeout(300_000);
  await installColdPhoneRuntimeProbe(page);
  await visitFormal(page, '/?round-trip=two', 'hero');
  const authorityId = await page.locator(LIVE_PHONE_ROOT).getAttribute(
    'data-phone-authority-id'
  );

  for (let round = 0; round < 2; round += 1) {
    await driveJourney(page, FORMAL_FORWARD_JOURNEY);
    await assertStablePhoneHold(page, 'contact');
    await driveJourney(page, FORMAL_REVERSE_JOURNEY);
    const hero = await assertStablePhoneHold(page, 'hero');
    await expect(hero).toHaveAttribute('data-phone-authority-id', authorityId!);
  }

  const probe = await phoneRuntimeProbe(page);
  expect(probe.maxActive).toBeLessThanOrEqual(4);
});

test('Task 10 lets a direct Contact hold claim its Group67 reverse boundary', async ({ page }) => {
  test.setTimeout(60_000);
  await installColdPhoneRuntimeProbe(page);
  await visitFormal(page, '/#contact', 'contact');
  await driveAdjacentPhoneRun(page, 'contact', 'education', -1);
});

test('Task 10 repeats the complete reduced-motion production round trip', async ({ page }) => {
  test.setTimeout(120_000);
  await installColdPhoneRuntimeProbe(page);
  await visitFormal(
    page,
    '/?portrait-spike-motion=reduce',
    'hero'
  );
  await driveJourney(page, FORMAL_FORWARD_JOURNEY, { reducedMotion: true });
  await driveJourney(page, FORMAL_REVERSE_JOURNEY, { reducedMotion: true });
  await assertStablePhoneHold(page, 'hero');
  expect((await phoneRuntimeProbe(page)).maxActive).toBeLessThanOrEqual(4);
});

test('[AOD↔Method reduced cutover] commits both target static endpoints without media playback', async ({ page }) => {
  test.setTimeout(120_000);
  await installColdPhoneRuntimeProbe(page);
  await visitFormal(page, '/?portrait-spike-motion=reduce', 'hero');
  await driveReducedFrontHold(page, 'hero', 'pattern', 1);
  await driveReducedFrontHold(page, 'pattern', 'star-map', 1);
  await driveReducedFrontHold(page, 'star-map', 'aod-animation', 1);
  const authorityId = await (await assertStablePhoneHold(page, 'aod-animation'))
    .getAttribute('data-phone-authority-id');

  await driveAdjacentPhoneRun(
    page,
    'aod-animation',
    'method-top',
    1,
    45_000,
    'formal',
    { reducedMotion: true }
  );
  assertAodReducedStaticAdmissionTrace(
    (await phoneRuntimeProbe(page)).stateEvents,
    1
  );

  await driveAdjacentPhoneRun(
    page,
    'method-top',
    'aod-animation',
    -1,
    45_000,
    'formal',
    { reducedMotion: true }
  );
  assertAodReducedStaticAdmissionTrace(
    (await phoneRuntimeProbe(page)).stateEvents,
    -1
  );
  await expect(await assertStablePhoneHold(page, 'aod-animation'))
    .toHaveAttribute('data-phone-authority-id', authorityId!);
  expect((await phoneRuntimeProbe(page)).maxActive).toBeLessThanOrEqual(4);
});

test('[Method↔Figure2↔Proof↔Brand reduced cutover] commits all static endpoints without playback', async ({ page }) => {
  test.setTimeout(180_000);
  await installColdPhoneRuntimeProbe(page);
  await visitFormal(
    page,
    '/?portrait-spike-motion=reduce#method',
    'method-top'
  );
  const authorityId = await (await assertStablePhoneHold(page, 'method-top'))
    .getAttribute('data-phone-authority-id');

  await driveAdjacentPhoneRun(
    page,
    'method-top',
    'figure2-animation',
    1,
    45_000,
    'formal',
    { reducedMotion: true }
  );
  assertMethodFigure2ReducedStaticAdmissionTrace(
    (await phoneRuntimeProbe(page)).stateEvents,
    1
  );

  await driveAdjacentPhoneRun(
    page,
    'figure2-animation',
    'figure2-proof',
    1,
    45_000,
    'formal',
    { reducedMotion: true }
  );
  assertFigure2ProofReducedStaticAdmissionTrace(
    (await phoneRuntimeProbe(page)).stateEvents,
    1
  );

  await driveAdjacentPhoneRun(
    page,
    'figure2-proof',
    'brand',
    1,
    45_000,
    'formal',
    { reducedMotion: true }
  );
  assertProofBrandReducedStaticAdmissionTrace(
    (await phoneRuntimeProbe(page)).stateEvents,
    1
  );

  await driveAdjacentPhoneRun(
    page,
    'brand',
    'figure2-proof',
    -1,
    45_000,
    'formal',
    { reducedMotion: true }
  );
  assertProofBrandReducedStaticAdmissionTrace(
    (await phoneRuntimeProbe(page)).stateEvents,
    -1
  );

  await driveAdjacentPhoneRun(
    page,
    'figure2-proof',
    'figure2-animation',
    -1,
    45_000,
    'formal',
    { reducedMotion: true }
  );
  assertFigure2ProofReducedStaticAdmissionTrace(
    (await phoneRuntimeProbe(page)).stateEvents,
    -1
  );

  await driveAdjacentPhoneRun(
    page,
    'figure2-animation',
    'method-top',
    -1,
    45_000,
    'formal',
    { reducedMotion: true }
  );
  assertMethodFigure2ReducedStaticAdmissionTrace(
    (await phoneRuntimeProbe(page)).stateEvents,
    -1
  );
  await expect(await assertStablePhoneHold(page, 'method-top'))
    .toHaveAttribute('data-phone-authority-id', authorityId!);
  expect((await phoneRuntimeProbe(page)).maxActive).toBeLessThanOrEqual(4);
});

test('[Lab↔PH↔Education reduced/direct cutover] commits native leaves without PH playback and renders #education directly', async ({ page }) => {
  test.setTimeout(120_000);
  await installColdPhoneRuntimeProbe(page);
  await visitFormal(
    page,
    '/?portrait-spike-motion=reduce#lab',
    'lab'
  );
  const authorityId = await (await assertStablePhoneHold(page, 'lab'))
    .getAttribute('data-phone-authority-id');
  expect(authorityId).toBeTruthy();

  await driveAdjacentPhoneRun(
    page,
    'lab',
    'education',
    1,
    45_000,
    'formal',
    { reducedMotion: true }
  );
  assertLabEducationReducedStaticAdmissionTrace(
    (await phoneRuntimeProbe(page)).stateEvents,
    1
  );

  await driveAdjacentPhoneRun(
    page,
    'education',
    'lab',
    -1,
    45_000,
    'formal',
    { reducedMotion: true }
  );
  assertLabEducationReducedStaticAdmissionTrace(
    (await phoneRuntimeProbe(page)).stateEvents,
    -1
  );
  await expect(await assertStablePhoneHold(page, 'lab'))
    .toHaveAttribute('data-phone-authority-id', authorityId!);

  await visitFormal(page, '/#education', 'education');
  await assertDirectEntryPresentation(page, 'education');
});

test('[Pattern↔StarMap reduced cutover] repeats two static-proof cycles in one authority', async ({ page }) => {
  test.setTimeout(120_000);
  await installColdPhoneRuntimeProbe(page);
  await visitFormal(page, '/?portrait-spike-motion=reduce', 'hero');
  await driveReducedFrontHold(page, 'hero', 'pattern', 1);
  const authorityId = await (await assertStablePhoneHold(page, 'pattern'))
    .getAttribute('data-phone-authority-id');
  expect(authorityId).toBeTruthy();

  for (let cycle = 0; cycle < 2; cycle += 1) {
    await driveReducedFrontHold(page, 'pattern', 'star-map', 1);
    await expect(await assertStablePhoneHold(page, 'star-map'))
      .toHaveAttribute('data-phone-authority-id', authorityId!);
    await driveReducedFrontHold(page, 'star-map', 'pattern', -1);
    await expect(await assertStablePhoneHold(page, 'pattern'))
      .toHaveAttribute('data-phone-authority-id', authorityId!);
  }

  expect((await phoneRuntimeProbe(page)).maxActive).toBeLessThanOrEqual(4);
});

test('Task 10 verifies every formal direct entry plus hash, menu, and history', async ({ page }) => {
  test.setTimeout(180_000);
  await installColdPhoneRuntimeProbe(page);
  for (const [hash, scene] of FORMAL_DIRECT_ENTRIES) {
    await visitFormal(page, '/' + hash, scene);
    await assertDirectEntryPresentation(page, scene);
  }

  await visitFormal(page, '/#method', 'method-top');
  await page.getByRole('button', { name: '菜单' }).click();
  const services = page.locator('nav.site-nav a[href="#services"]');
  await expect(services).toBeVisible();
  await services.click();
  await assertStablePhoneHold(page, 'services');
  await assertDirectEntryPresentation(page, 'services');
  await page.goBack({ waitUntil: 'domcontentloaded' });
  await assertStablePhoneHold(page, 'method-top');
  await assertDirectEntryPresentation(page, 'method-top');
  await page.goForward({ waitUntil: 'domcontentloaded' });
  await assertStablePhoneHold(page, 'services');
  await assertDirectEntryPresentation(page, 'services');
});

test('Task 10 preserves formal scope and validates two Brand–Lab reduced-motion cycles', async ({ page }) => {
  test.setTimeout(120_000);
  await installColdPhoneRuntimeProbe(page);
  await visitFormal(page, '/?scope=brand-lab#brand', 'brand');

  await page.goto('/brand-lab?portrait-spike-motion=reduce#lab', {
    waitUntil: 'domcontentloaded'
  });
  const firstLab = await assertStablePhoneHold(page, 'lab', { scope: 'brand-lab' });
  const authorityId = await firstLab.getAttribute('data-phone-authority-id');

  for (let cycle = 0; cycle < 2; cycle += 1) {
    await driveAdjacentPhoneRun(
      page,
      'lab',
      'services',
      -1,
      45_000,
      'brand-lab',
      { reducedMotion: true }
    );
    await driveAdjacentPhoneRun(
      page,
      'services',
      'lab',
      1,
      45_000,
      'brand-lab',
      { reducedMotion: true }
    );
    const lab = await assertStablePhoneHold(page, 'lab', { scope: 'brand-lab' });
    await expect(lab).toHaveAttribute('data-phone-authority-id', authorityId!);
  }
});

test('TTG hard cutover repeats two full-motion Brand–Lab cycles in one authority', async ({ page }) => {
  test.setTimeout(240_000);
  await installColdPhoneRuntimeProbe(page);
  await page.goto('/brand-lab#lab', { waitUntil: 'domcontentloaded' });

  const firstLab = await assertStablePhoneHold(page, 'lab', { scope: 'brand-lab' });
  const authorityId = await firstLab.getAttribute('data-phone-authority-id');
  expect(authorityId).toBeTruthy();

  for (let cycle = 0; cycle < 2; cycle += 1) {
    await driveAdjacentPhoneRun(
      page,
      'lab',
      'services',
      -1,
      45_000,
      'brand-lab'
    );
    await driveAdjacentPhoneRun(
      page,
      'services',
      'lab',
      1,
      45_000,
      'brand-lab'
    );
    const lab = await assertStablePhoneHold(page, 'lab', { scope: 'brand-lab' });
    await expect(lab).toHaveAttribute('data-phone-authority-id', authorityId!);

    // A retired decoder callback must not recreate a session after stable
    // commit. The next complete same-authority cycle starts only after this
    // post-settle quiescence check.
    await page.waitForTimeout(150);
    await assertStablePhoneHold(page, 'lab', { scope: 'brand-lab' });
  }
});

test('[P0 real root] a cold physical-phone root mounts only the phone authority', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expect.poll(async () => page.evaluate(() => ({
    phoneAuthorities: Array.from(
      document.querySelectorAll<HTMLElement>('[data-phone-authority-id]')
    ).filter((root) => (
      root.isConnected
      && !root.hidden
      && getComputedStyle(root).display !== 'none'
      && getComputedStyle(root).visibility !== 'hidden'
    )).length,
    desktopShellPresent: Boolean(document.querySelector('.story-app')),
    desktopHeroRunning: document.querySelector('[data-hero-intro="running"]') !== null
  })), {
    timeout: 10_000,
    message: 'production mobile / must mount the one phone authority, not DesktopStoryShell'
  }).toEqual({
    phoneAuthorities: 1,
    desktopShellPresent: false,
    desktopHeroRunning: false
  });
});

test('[P0 real root pixels] cold Loader paints and changes compositor pixels', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const loader = page.locator(`${LIVE_STORY_LOADER}[data-loader-status="running"]`);
  await expect(loader).toBeVisible();
  await expect.poll(async () => loader.getAttribute('data-loader-phase')).toBe('revealing');

  // The start of the phrase may legitimately be empty; sample after it has
  // entered the authored reveal interval, then prove that interval changes.
  await page.waitForTimeout(320);
  const first = decodePngScreenshot(await page.screenshot());
  await page.waitForTimeout(520);
  const second = decodePngScreenshot(await page.screenshot());
  const loaderWord = {
    left: .08,
    top: .12,
    right: .92,
    bottom: .56
  } as const;

  expect(
    compositedPixelEvidence(first, loaderWord, [0, 0, 0]).nonSurfaceRatio,
    'cold Loader must paint visual ink above its black plane'
  ).toBeGreaterThan(.0005);
  expect(
    compositedPixelDelta(first, second, loaderWord),
    'cold Loader must produce an authored pixel timeline, not a static black cover'
  ).toBeGreaterThan(.0001);
  await expect(page.locator(LIVE_PHONE_ROOT)).toHaveCount(1);
});

test('[P0 real root pixels] post-Loader Hero title and subtitle paint a changing visual', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const root = page.locator(LIVE_PHONE_ROOT);
  await expect(root).toHaveCount(1);
  await expect.poll(async () => page.locator(LIVE_STORY_LOADER).count()).toBe(0);
  await expect(root).toHaveAttribute('data-portrait-loader-ready', 'true');
  await expect(root).toHaveAttribute('data-portrait-hero-entrance', 'playing');

  const first = decodePngScreenshot(await page.screenshot());
  await page.waitForTimeout(680);
  const second = decodePngScreenshot(await page.screenshot());
  const copy = {
    left: .08,
    top: .06,
    right: .92,
    bottom: .43
  } as const;
  const title = {
    left: .14,
    top: .10,
    right: .86,
    bottom: .28
  } as const;
  const subtitle = {
    left: .12,
    top: .22,
    right: .88,
    bottom: .43
  } as const;

  expect(
    compositedPixelEvidence(first, copy, PHONE_COVERAGE_RGB).nonSurfaceRatio,
    'post-Loader Hero cannot be an opaque coverage-color frame'
  ).toBeGreaterThan(.002);
  expect(
    compositedPixelEvidence(second, title, PHONE_COVERAGE_RGB).nonSurfaceRatio,
    'Hero title must be visible in the final compositor'
  ).toBeGreaterThan(.001);
  expect(
    compositedPixelEvidence(second, subtitle, PHONE_COVERAGE_RGB).nonSurfaceRatio,
    'Hero subtitle must be visible in the final compositor'
  ).toBeGreaterThan(.0005);
  expect(
    compositedPixelDelta(first, second, copy),
    'Hero title/subtitle must show their authored temporal change in pixels'
  ).toBeGreaterThan(.0001);
});

test('[P0 real root pixels] Figure1 alpha proof has matching non-edge compositor pixels', async ({ page }) => {
  test.setTimeout(35_000);
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const root = page.locator(LIVE_PHONE_ROOT);
  const figureCanvas = page.locator('[data-portrait-figure-canvas]');
  const figureParallax = page.locator('.portrait-scroll-spike__hero-figure-parallax');
  await expect(root).toHaveCount(1);
  await expect.poll(async () => page.locator(LIVE_STORY_LOADER).count()).toBe(0);
  await expect(root).toHaveAttribute('data-portrait-loader-ready', 'true');
  await expect(figureCanvas).toHaveCount(1);
  await expect.poll(async () => page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-portrait-figure-canvas]');
    const parallax = document.querySelector<HTMLElement>(
      '.portrait-scroll-spike__hero-figure-parallax'
    );
    return {
      canvasWidth: canvas?.width ?? 0,
      canvasHeight: canvas?.height ?? 0,
      frameReady: canvas?.dataset.packedAlphaFrameReady ?? null,
      alpha: parallax?.dataset.portraitFigureAlpha ?? null,
      frame: parallax?.dataset.portraitFigureFrame ?? null
    };
  }), {
    message: 'Figure1 needs a decoded canvas, verified alpha, and a rendered frame before pixel evidence'
  }).toEqual({
    canvasWidth: expect.any(Number),
    canvasHeight: expect.any(Number),
    frameReady: 'true',
    alpha: 'verified',
    frame: 'ready'
  });
  const canvasGeometry = await figureCanvas.evaluate((canvas) => ({
    width: canvas.width,
    height: canvas.height,
    rect: canvas.getBoundingClientRect().toJSON()
  }));
  expect(canvasGeometry.width).toBeGreaterThan(0);
  expect(canvasGeometry.height).toBeGreaterThan(0);
  await expect(figureParallax).toHaveAttribute('data-portrait-figure-alpha', 'verified');

  const frame = decodePngScreenshot(await page.screenshot());
  const figure = {
    left: .12,
    top: .30,
    right: .88,
    bottom: .97
  } as const;
  expect(
    compositedPixelEvidence(frame, figure, PHONE_COVERAGE_RGB).nonSurfaceRatio,
    'verified Figure1 alpha must be observable as non-edge pixels, not hidden behind coverage'
  ).toBeGreaterThan(.01);
});

test('[P0 route-overlay pixels] an above-both ink transition is painted by the route host', async ({ page }) => {
  test.setTimeout(45_000);
  await installColdPhoneRuntimeProbe(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const root = await assertStablePhoneHold(page, 'hero');
  await expect(root).toHaveAttribute('data-portrait-hero-entrance', 'complete', {
    timeout: 15_000
  });
  await waitForNewWheelEpoch(page);

  const before = decodePngScreenshot(await page.screenshot());
  let transitionFrame: PngScreenshot | null = null;
  let routeHostEvidence: unknown = null;
  for (let pulse = 0; pulse < 64; pulse += 1) {
    await inputPhoneDelta(page, 50);
    await page.waitForTimeout(80);
    if (await root.getAttribute('data-phone-cursor') !== 'transition:hero-pattern-scroll:0') {
      continue;
    }
    const ink = page.locator(
      '[data-phone-presentation-host="route-overlay"] > canvas'
    );
    if (await ink.count() !== 1) continue;
    if (await ink.getAttribute('data-phone-presentation-effect-frame') !== 'ready') {
      continue;
    }
    routeHostEvidence = await page.evaluate(() => {
      const content = document.querySelector<HTMLElement>(
        '[data-phone-presentation-host="content"]'
      );
      const route = document.querySelector<HTMLElement>(
        '[data-phone-presentation-host="route-overlay"]'
      );
      const canvas = route?.querySelector<HTMLCanvasElement>(':scope > canvas');
      const routeRect = route?.getBoundingClientRect();
      const contentRect = content?.getBoundingClientRect();
      return {
        directRouteChild: canvas?.parentElement === route,
        routeCoversContent: Boolean(
          routeRect
          && contentRect
          && routeRect.left <= contentRect.left + 1
          && routeRect.top <= contentRect.top + 1
          && routeRect.right >= contentRect.right - 1
          && routeRect.bottom >= contentRect.bottom - 1
        )
      };
    });
    transitionFrame = decodePngScreenshot(await page.screenshot());
    break;
  }

  expect(routeHostEvidence).toEqual({
    directRouteChild: true,
    routeCoversContent: true
  });
  expect(transitionFrame, 'hero→Pattern must expose a real route-overlay ink frame').not.toBeNull();
  if (!transitionFrame) return;
  expect(
    compositedPixelDelta(before, transitionFrame, {
      left: .04,
      top: .04,
      right: .96,
      bottom: .96
    }),
    'route-overlay ink must alter final compositor pixels above its endpoints'
  ).toBeGreaterThan(.005);

  let settled = false;
  for (let pulse = 0; pulse < 64; pulse += 1) {
    await inputPhoneDelta(page, 50);
    await page.waitForTimeout(80);
    if (await root.getAttribute('data-phone-cursor') === 'hold:pattern') {
      settled = true;
      break;
    }
  }
  expect(settled).toBe(true);
  await assertStablePhoneHold(page, 'pattern');
});
