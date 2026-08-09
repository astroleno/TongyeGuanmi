import { expect, test, type Page, type TestInfo } from '@playwright/test';
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
const phonePageErrors = new WeakMap<Page, string[]>();
const phoneWebGlIssues = new WeakMap<Page, string[]>();
const stableAuthorityIds = new WeakMap<Page, string>();

test.beforeEach(({ page }) => {
  const errors: string[] = [];
  const webGlIssues: string[] = [];
  phonePageErrors.set(page, errors);
  phoneWebGlIssues.set(page, webGlIssues);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    const text = message.text();
    if (
      /too many active webgl contexts/i.test(text)
      || /webgl.*context.*lost/i.test(text)
      || /shader\s+(?:compile|link)\s+failed/i.test(text)
      || /webgl.*invalid_operation.*losecontext/i.test(text)
    ) webGlIssues.push(text);
  });
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) stableAuthorityIds.delete(page);
  });
});

const MAX_PHONE_WEBGL_CONTEXTS = 12;
// Four route-owned contexts is the formal upper bound. AOD and packed media
// are retired outside their admitted lease; increasing this threshold would
// hide a lifecycle leak rather than prove the route is resource-safe.
const MAX_ACTIVE_PHONE_WEBGL_CONTEXTS = 4;

test.afterEach(async ({ page }, testInfo) => {
  const probe = await page.evaluate(() => {
    const runtime = (window as typeof window & {
      __phoneRuntimeProbe?: {
        created?: unknown[];
        contexts?: Array<WebGLRenderingContext | WebGL2RenderingContext>;
        maxActive?: number;
        expectedWebGlIssues?: boolean;
      };
    }).__phoneRuntimeProbe;
    if (!runtime) return null;
    return {
      total: runtime.created?.length ?? 0,
      active: runtime.contexts?.filter((context) => !context.isContextLost()).length ?? 0,
      maxActive: runtime.maxActive ?? 0,
      expectedWebGlIssues: runtime.expectedWebGlIssues === true
    };
  });
  if (probe === null) return;
  if (!probe.expectedWebGlIssues) {
    expect(
      phonePageErrors.get(page) ?? [],
      `page errors in ${testInfo.title}`
    ).toEqual([]);
    expect(
      phoneWebGlIssues.get(page) ?? [],
      `WebGL lifecycle warnings in ${testInfo.title}`
    ).toEqual([]);
  }
  expect(
    probe.active,
    `active WebGL contexts in ${testInfo.title}`
  ).toBeLessThanOrEqual(MAX_ACTIVE_PHONE_WEBGL_CONTEXTS);
  expect(
    probe.maxActive,
    `peak WebGL contexts in ${testInfo.title}`
  ).toBeLessThanOrEqual(MAX_ACTIVE_PHONE_WEBGL_CONTEXTS);
  expect(
    probe.total,
    `cumulative WebGL context count in ${testInfo.title}`
  ).toBeLessThanOrEqual(MAX_PHONE_WEBGL_CONTEXTS);
});

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

type RadialFrontierSample = Readonly<{
  index: number;
  alphaAtClip: number;
  maxAlpha: number;
  errorPx: number;
}>;

type RadialFrontierWitness = Readonly<{
  rank: number;
  samples: readonly RadialFrontierSample[];
}>;

type RadialFrontierProbe = Readonly<{
  closest: readonly (RadialFrontierWitness | null)[];
}>;

const RADIAL_FRONTIER_RANKS = [.2, .5, .8] as const;
const RADIAL_FRONTIER_SAMPLE_INDICES = [0, 32, 64, 96, 128, 160, 192, 224] as const;

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

/**
 * Captures the live WebGL alpha buffer immediately after the production
 * radial shader draws.  Reading later is invalid because browsers are free
 * to discard a non-preserved drawing buffer after composition.  This probe
 * deliberately compares canvas alpha to the actual receiver clip geometry;
 * it does not trust shared data attributes as visual evidence.
 */
async function installRadialFrontierProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type ProbeSample = Readonly<{
      index: number;
      alphaAtClip: number;
      maxAlpha: number;
      errorPx: number;
    }>;
    type ProbeWitness = Readonly<{
      rank: number;
      samples: readonly ProbeSample[];
    }>;
    type Probe = {
      closest: Array<ProbeWitness | null>;
    };
    const target = window as typeof window & {
      __r5RadialFrontierProbe?: Probe;
    };
    const targetRanks = [.2, .5, .8] as const;
    const sampleIndices = [0, 32, 64, 96, 128, 160, 192, 224] as const;
    const originalDrawArrays = WebGLRenderingContext.prototype.drawArrays;
    target.__r5RadialFrontierProbe = { closest: [null, null, null] };

    const parsePoint = (value: string): readonly [number, number] | null => {
      const match = value.match(/^(-?[0-9.]+)% (-?[0-9.]+)%$/);
      return match ? [Number(match[1]) / 100, Number(match[2]) / 100] : null;
    };
    const clamp = (value: number, maximum: number) => Math.max(0, Math.min(maximum, value));

    WebGLRenderingContext.prototype.drawArrays = function drawArrays(
      mode: GLenum,
      first: GLint,
      count: GLsizei
    ): void {
      originalDrawArrays.call(this, mode, first, count);
      const canvas = this.canvas;
      if (
        !(canvas instanceof HTMLCanvasElement)
        || canvas.dataset.r4InkBoundaryKind !== 'radial'
        || canvas.dataset.r4InkSegment !== 'portrait-hero-pattern-ink'
        || canvas.parentElement?.getAttribute('data-phone-presentation-host') !== 'route-overlay'
      ) {
        return;
      }
      const rank = Number(canvas.dataset.r4InkBoundaryRank);
      const probe = target.__r5RadialFrontierProbe;
      if (!probe || !Number.isFinite(rank)) return;
      const closestIndex = targetRanks.reduce((bestIndex, targetRank, index) => (
        Math.abs(rank - targetRank) < Math.abs(rank - targetRanks[bestIndex]!)
          ? index
          : bestIndex
      ), 0);
      const targetRank = targetRanks[closestIndex]!;
      const rankError = Math.abs(rank - targetRank);
      const previous = probe.closest[closestIndex];
      // Avoid expensive readPixels work on every animation frame. The probe
      // only samples a production draw once it is close enough to each
      // required rank, then keeps replacing it only with a closer frame.
      if (rankError > .075 || (
        previous !== null && rankError >= Math.abs(previous.rank - targetRank)
      )) {
        return;
      }
      const receiver = document.querySelector<HTMLElement>(
        '.portrait-scroll-spike__scene--pattern'
      );
      const clipPath = receiver?.style.clipPath
        || receiver?.style.getPropertyValue('-webkit-clip-path')
        || '';
      const rawPoints = clipPath.match(/^polygon\((.*)\)$/)?.[1]?.split(', ') ?? [];
      if (rawPoints.length < 225) return;
      const points = rawPoints.map(parsePoint);
      if (points.some((point) => point === null)) return;

      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      try {
        this.readPixels(0, 0, canvas.width, canvas.height, this.RGBA, this.UNSIGNED_BYTE, pixels);
      } catch {
        return;
      }
      const originX = canvas.width * .5;
      const originY = canvas.height * (1 - .44);
      const alphaAt = (x: number, y: number) => {
        let sum = 0;
        let samples = 0;
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
            const pixelX = clamp(Math.round(x + offsetX), canvas.width - 1);
            const pixelY = clamp(Math.round(y + offsetY), canvas.height - 1);
            sum += pixels[(pixelY * canvas.width + pixelX) * 4 + 3] ?? 0;
            samples += 1;
          }
        }
        return sum / samples;
      };
      const samples: ProbeSample[] = [];
      for (const index of sampleIndices) {
        const point = points[index];
        if (!point) return;
        const pointX = point[0] * canvas.width;
        const pointY = (1 - point[1]) * canvas.height;
        const deltaX = pointX - originX;
        const deltaY = pointY - originY;
        const radius = Math.hypot(deltaX, deltaY);
        if (radius < 1) return;
        const directionX = deltaX / radius;
        const directionY = deltaY / radius;
        const radialSamples: Array<readonly [number, number]> = [];
        let maxAlpha = 0;
        const from = Math.max(0, Math.floor(radius - 120));
        const to = Math.ceil(radius + 120);
        for (let distance = from; distance <= to; distance += 1) {
          const alpha = alphaAt(
            originX + directionX * distance,
            originY + directionY * distance
          );
          radialSamples.push([distance, alpha]);
          maxAlpha = Math.max(maxAlpha, alpha);
        }
        if (maxAlpha < 16) return;
        // The rendered radial core is intentionally textured. A 94% local
        // alpha threshold keeps that texture from masquerading as a shifted
        // frontier while still rejecting the old squared-radius field.
        const threshold = maxAlpha * .94;
        const nearestCore = radialSamples
          .filter(([, alpha]) => alpha >= threshold)
          .reduce<readonly [number, number] | null>((nearest, sample) => (
            nearest === null || Math.abs(sample[0] - radius) < Math.abs(nearest[0] - radius)
              ? sample
              : nearest
          ), null);
        if (!nearestCore) return;
        samples.push({
          index,
          alphaAtClip: alphaAt(pointX, pointY),
          maxAlpha,
          errorPx: nearestCore[0] - radius
        });
      }
      if (samples.length !== sampleIndices.length) return;
      const witness: ProbeWitness = { rank, samples };
      probe.closest[closestIndex] = witness;
    };
  });
}

function assertRadialFrontierAlphaEvidence(probe: RadialFrontierProbe): void {
  expect(probe.closest).toHaveLength(RADIAL_FRONTIER_RANKS.length);
  for (const [index, targetRank] of RADIAL_FRONTIER_RANKS.entries()) {
    const witness = probe.closest[index];
    expect(witness, `missing live radial alpha sample near rank ${targetRank}`).not.toBeNull();
    if (!witness) continue;
    // Production rAF can coalesce an exact timestamp, while the deterministic
    // geometry test owns the exact .2/.5/.8 math. This browser probe samples
    // the nearest live GPU draw for each rank and accepts at most 0.075 rank.
    expect(
      Math.abs(witness.rank - targetRank),
      `missing live frame near rank ${targetRank}: ${JSON.stringify(witness)}`
    ).toBeLessThanOrEqual(.075);
    expect(witness.samples.map((sample) => sample.index)).toEqual(RADIAL_FRONTIER_SAMPLE_INDICES);
    for (const sample of witness.samples) {
      expect(sample.maxAlpha).toBeGreaterThanOrEqual(160);
      expect(
        sample.alphaAtClip,
        `clip point ${sample.index} must land on the live radial alpha core at rank ${targetRank}`
      ).toBeGreaterThanOrEqual(sample.maxAlpha * .94);
      expect(
        Math.abs(sample.errorPx),
        `live alpha core may not drift more than 2px from clip point ${sample.index} at rank ${targetRank}`
      ).toBeLessThanOrEqual(2);
    }
  }
}

/**
 * A full-frame coverage plane can have a different named CSS color while
 * still being a visually empty frame. The opening gate therefore measures
 * actual luminance range in the final compositor image, never an element's
 * declared background or visibility.
 */
function compositedLuminanceRange(
  screenshot: PngScreenshot,
  region: NormalizedScreenshotRegion
): number {
  const bounds = screenshotBounds(screenshot, region);
  let minimum = 255;
  let maximum = 0;
  for (let y = bounds.top; y < bounds.bottom; y += 4) {
    for (let x = bounds.left; x < bounds.right; x += 4) {
      const offset = (y * screenshot.width + x) * screenshot.channels;
      const luminance = Math.round(
        ((screenshot.pixels[offset] ?? 0) * 0.2126)
        + ((screenshot.pixels[offset + 1] ?? 0) * 0.7152)
        + ((screenshot.pixels[offset + 2] ?? 0) * 0.0722)
      );
      minimum = Math.min(minimum, luminance);
      maximum = Math.max(maximum, luminance);
    }
  }
  return maximum - minimum;
}

type ViewportEdgePixelWitness = Readonly<{
  edge: string;
  transparentPixels: number;
  nearWhitePixels: number;
  samples: number;
}>;

/**
 * This is deliberately a compositor-image gate. DOM boxes and CSS custom
 * properties explain the topology below, but cannot prove that Safari did
 * not expose a white/transparent seam at a live viewport edge.
 */
function viewportEdgePixelWitnesses(
  screenshot: PngScreenshot
): readonly ViewportEdgePixelWitness[] {
  // Deliberately touch the physical screenshot boundary: a 1px Safari seam
  // is the failure this gate exists to catch, so an inset sample is too weak.
  const insetX = 0;
  const insetY = 0;
  const midX = Math.floor(screenshot.width / 2);
  const midY = Math.floor(screenshot.height / 2);
  const points = [
    ['top-left', insetX, insetY],
    ['top', midX, insetY],
    ['top-right', screenshot.width - insetX - 1, insetY],
    ['right', screenshot.width - insetX - 1, midY],
    ['bottom-right', screenshot.width - insetX - 1, screenshot.height - insetY - 1],
    ['bottom', midX, screenshot.height - insetY - 1],
    ['bottom-left', insetX, screenshot.height - insetY - 1],
    ['left', insetX, midY]
  ] as const;
  const radius = 1;
  return points.map(([edge, x, y]) => {
    let transparentPixels = 0;
    let nearWhitePixels = 0;
    let samples = 0;
    for (let sampleY = Math.max(0, y - radius); sampleY <= Math.min(screenshot.height - 1, y + radius); sampleY += 1) {
      for (let sampleX = Math.max(0, x - radius); sampleX <= Math.min(screenshot.width - 1, x + radius); sampleX += 1) {
        const offset = (sampleY * screenshot.width + sampleX) * screenshot.channels;
        const red = screenshot.pixels[offset] ?? 0;
        const green = screenshot.pixels[offset + 1] ?? 0;
        const blue = screenshot.pixels[offset + 2] ?? 0;
        const alpha = screenshot.channels === 4 ? screenshot.pixels[offset + 3] ?? 0 : 255;
        samples += 1;
        if (alpha < 250) transparentPixels += 1;
        if (red >= 248 && green >= 248 && blue >= 248) nearWhitePixels += 1;
      }
    }
    return { edge, transparentPixels, nearWhitePixels, samples };
  });
}

const PHONE_HOLD_CONTRACTS = {
  hero: { checkpoint: 'hero-entered', edge: 'hero', edgeSurface: '#07110e', stageOwner: 'front', stageScene: 'hero' },
  pattern: { checkpoint: 'pattern-complete', edge: 'pattern', edgeSurface: '#d9c08f', stageOwner: 'front', stageScene: 'pattern' },
  'pattern-compact': { checkpoint: 'pattern-compact', edge: 'pattern', edgeSurface: '#d9c08f', stageOwner: 'front', stageScene: 'pattern' },
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

type PhoneRuntimeResourceSample = Readonly<{
  at: number;
  activeMedia: number;
  activeWebgl: number;
  activeWebglLabels?: ReadonlyArray<string>;
}>;

type PhoneVisualFrameSample = Readonly<{
  at: number;
  cursor: string;
  session: string;
  generation: string;
  signature: string;
}>;

type PhoneLegTimeline = Readonly<{
  run: string;
  authorityId: string;
  sessionId: string;
  generation: string;
  leg: string;
  from: PhoneStableScene;
  to: PhoneStableScene;
  direction: 1 | -1;
  startAt: number;
  firstFrameAt: number;
  commitAt: number;
  releaseAt: number;
  activeMediaAtMax: number;
  activeWebglAtMax: number;
  activeWebglLabelsAtMax?: ReadonlyArray<string>;
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
    const coverageElement = rootElement?.querySelector<HTMLElement>(
      '.portrait-scroll-spike__viewport-coverage'
    ) ?? null;
    const visualViewport = window.visualViewport;
    const viewport = {
      left: visualViewport?.offsetLeft ?? 0,
      top: visualViewport?.offsetTop ?? 0,
      width: visualViewport?.width ?? window.innerWidth,
      height: visualViewport?.height ?? window.innerHeight
    };
    const viewportHit = document.elementFromPoint(
      Math.round(viewport.left + viewport.width / 2),
      Math.round(viewport.top + viewport.height / 2)
    );
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
      documentScrollHeight: Math.max(
        documentElement.scrollHeight,
        document.body.scrollHeight,
        document.scrollingElement?.scrollHeight ?? 0
      ),
      viewport,
      fallback: documentElement.dataset.phoneStoryFallback ?? null,
      staticContentAtViewport: Boolean(viewportHit?.closest('.static-content')),
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
  expect(evidence.authorityRoots).toHaveLength(1);
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
  expect(evidence.fallback).toBeNull();
  expect(evidence.staticContentAtViewport).toBe(false);

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

  // Every front surface registers the one physical DOM viewport backdrop as
  // its coverage owner; the semantic root may legitimately land mid-document.
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

function expectStablePhoneRuntimeGates(
  page: Page,
  evidence: Awaited<ReturnType<typeof readPhoneEvidence>>
): void {
  expect(phonePageErrors.get(page) ?? []).toEqual([]);
  const authorityId = evidence.liveAuthorityRoots[0]?.authorityId;
  if (!authorityId) throw new Error('Expected a live phone authority id');
  const established = stableAuthorityIds.get(page);
  if (established === undefined) {
    stableAuthorityIds.set(page, authorityId);
  } else {
    expect(authorityId).toBe(established);
  }
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
      expectStablePhoneRuntimeGates(page, evidence);
      return null;
    } catch (error) {
      const diagnostics = await page.evaluate(() => {
        const root = document.querySelector<HTMLElement>('.portrait-scroll-spike');
        const hero = document.querySelector<HTMLElement>('.portrait-scroll-spike__scene--hero');
        const canvas = hero?.querySelector<HTMLCanvasElement>(
          '[data-phone-packed-alpha-canvas="hero-figure"]'
        );
        const video = hero?.querySelector<HTMLVideoElement>('[data-portrait-figure-video]');
        return {
          heroActive: hero?.getAttribute('data-phone-scene-active') ?? null,
          heroFirstFrame: hero?.dataset.phoneHeroFirstFrame ?? null,
          heroEntrance: root?.dataset.portraitHeroEntrance ?? null,
          canvasStatus: canvas?.dataset.packedAlphaStatus ?? null,
          canvasReady: canvas?.dataset.packedAlphaFrameReady ?? null,
          canvasSize: canvas ? [canvas.width, canvas.height] : null,
          videoReadyState: video?.readyState ?? null,
          videoCurrentTime: video?.currentTime ?? null,
          videoPaused: video?.paused ?? null,
          videoSource: video?.dataset.phoneFigureSource ?? null,
          videoPlayback: video?.dataset.phoneFigurePlayback ?? null,
          videoTimelineReady: video?.dataset.timelineVideoFrameReady ?? null
        };
      });
      const message = error instanceof Error ? error.message : String(error);
      return `${message}\nhero diagnostics: ${JSON.stringify(diagnostics)}`;
    }
  }, {
    timeout,
    message: `waiting for complete stable hold:${scene} contract`
  }).toBeNull();
  const evidence = await readPhoneEvidence(page);
  expectStablePhoneEvidence(evidence, scene, scope);
  expectStablePhoneRuntimeGates(page, evidence);
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

async function touchPhoneSequence(
  page: Page,
  deltas: readonly number[],
  pace = false
): Promise<void> {
  await page.evaluate(async ({ inputDeltas, pace: shouldPace }) => {
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
    for (const deltaY of inputDeltas) {
      if (shouldPace) {
        await new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => resolve());
        });
      }
      dispatch('touchmove', [point(startY - deltaY)]);
    }
    if (shouldPace) {
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
    }
    dispatch('touchend', []);
  }, { inputDeltas: [...deltas], pace });
}

async function inputPhoneDelta(page: Page, deltaY: number): Promise<void> {
  if (page.context().browser()?.browserType().name() === 'webkit') {
    await touchPhone(page, deltaY);
    return;
  }
  await page.mouse.move(195, 180);
  await page.mouse.wheel(0, deltaY);
}

/**
 * Sends one continuous intent with multiple touch moves. The runtime must
 * claim the boundary during this sequence; tests must not manufacture a
 * transition by repeatedly ending and restarting 50px pulses.
 */
async function inputPhoneIntent(
  page: Page,
  direction: 1 | -1,
  distance = 4_200,
  pace = false
): Promise<void> {
  const deltas = [40, 100, distance].map((delta) => direction * delta);
  await touchPhoneSequence(page, deltas, pace);
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
      visualFrames: PhoneVisualFrameSample[];
      resourceSamples: PhoneRuntimeResourceSample[];
      legTimelines: PhoneLegTimeline[];
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
      stateEvents: [],
      visualFrames: [],
      resourceSamples: [],
      legTimelines: []
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
    const sampleResources = () => {
      probe.resourceSamples.push({
        at: performance.now(),
        activeMedia: Array.from(document.querySelectorAll('video'))
          .filter((video) => !video.paused && !video.ended).length,
        activeWebgl: probe.contexts.filter(
          (context) => !context.isContextLost()
        ).length,
        activeWebglLabels: probe.contexts.flatMap((context, index) => (
          context.isContextLost() ? [] : [probe.created[index]?.label ?? `context-${index}`]
        ))
      });
      if (probe.resourceSamples.length > 2_000) probe.resourceSamples.shift();
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
        '.portrait-scroll-spike__viewport-coverage'
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
      sampleResources();
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
    sampleResources();
    window.setInterval(sampleResources, 50);
    let lastVisualFrameKey = '';
    const sampleVisualFrame = () => {
      const root = document.querySelector<HTMLElement>('[data-phone-authority-id]');
      const cursor = root?.dataset.phoneCursor;
      const session = root?.dataset.phoneSession;
      const generation = root?.dataset.phoneTransitionGeneration;
      if (
        cursor?.startsWith('transition:')
        && session
        && generation
        && root?.dataset.phoneTransitionPhase === 'animating'
      ) {
        const signature = JSON.stringify(Array.from(document.querySelectorAll<HTMLElement>(
          '[data-phone-surface-role="transition-source"],'
          + '[data-phone-surface-role="transition-receiver"]'
        )).map((element) => [
          element.dataset.phoneSurfaceRole ?? null,
          element.className,
          element.style.clipPath,
          element.style.maskImage,
          element.style.opacity,
          element.style.visibility,
          element.style.transform
        ]));
        const key = `${session}:${generation}:${signature}`;
        if (key !== lastVisualFrameKey) {
          lastVisualFrameKey = key;
          probe.visualFrames.push({
            at: performance.now(),
            cursor,
            session,
            generation,
            signature
          });
          if (probe.visualFrames.length > 1_000) probe.visualFrames.shift();
        }
      }
      window.requestAnimationFrame(sampleVisualFrame);
    };
    window.requestAnimationFrame(sampleVisualFrame);
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
          visualFrames: PhoneVisualFrameSample[];
          resourceSamples: PhoneRuntimeResourceSample[];
          legTimelines: PhoneLegTimeline[];
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
      stateEvents: probe.stateEvents,
      visualFrames: probe.visualFrames,
      resourceSamples: probe.resourceSamples,
      legTimelines: probe.legTimelines
    };
  });
}

async function attachPhoneJourneyTelemetry(
  page: Page,
  testInfo: TestInfo,
  label: string
): Promise<void> {
  const probe = await phoneRuntimeProbe(page);
  await testInfo.attach(`phone-journey-${label}`, {
    body: JSON.stringify({
      label,
      activeWebgl: probe.active,
      peakActiveWebgl: probe.maxActive,
      createdWebgl: probe.created,
      legs: probe.legTimelines,
      finalStates: probe.stateEvents.slice(-24),
      finalVisualFrames: probe.visualFrames.slice(-24),
      finalResources: probe.resourceSamples.slice(-24)
    }, null, 2),
    contentType: 'application/json'
  });
}

async function recordPhoneLegTimeline(
  page: Page,
  from: PhoneStableScene,
  to: PhoneStableScene,
  direction: 1 | -1
): Promise<PhoneLegTimeline> {
  const probe = await phoneRuntimeProbe(page);
  const previousReleaseAt = Math.max(
    0,
    ...probe.legTimelines.map((timeline) => timeline.releaseAt)
  );
  const startIndex = probe.stateEvents.findIndex((state) => (
    state.at > previousReleaseAt
    && state.cursor?.startsWith('transition:')
    && state.direction === String(direction)
  ));
  const startState = startIndex >= 0
    ? probe.stateEvents[startIndex]
    : undefined;
  const startCursor = startState?.cursor ?? null;
  if (!startCursor) {
    throw new Error(`Missing transition cursor in ${from} → ${to} leg timeline`);
  }
  const run = startCursor.split(':')[1];
  if (!run) throw new Error(`Missing run id in ${startCursor}`);
  const commitIndex = probe.stateEvents.findIndex((state, index) => (
    index >= startIndex && state.cursor === `hold:${to}`
  ));
  if (commitIndex < 0) {
    throw new Error(`Missing hold:${to} commit in ${startCursor} timeline`);
  }
  const releaseIndex = probe.stateEvents.findIndex((state, index) => (
    index >= commitIndex
    && state.session === null
    && state.input === 'free'
  ));
  if (releaseIndex < 0) {
    throw new Error(`Missing input release after hold:${to} commit`);
  }
  const firstFrameIndex = probe.stateEvents.findIndex((state, index) => (
    index >= startIndex
    && index <= commitIndex
    && (
      state.phase === 'presented-frame-ready'
      || state.phase === 'animating'
      || (state.projection === 'candidate' && state.session !== null)
    )
  ));
  if (firstFrameIndex < 0) {
    throw new Error(`Missing presented-frame evidence in ${startCursor} timeline`);
  }
  const startAt = probe.stateEvents[startIndex]!.at;
  const commitAt = probe.stateEvents[commitIndex]!.at;
  const releaseAt = probe.stateEvents[releaseIndex]!.at;
  const start = probe.stateEvents[startIndex]!;
  if (
    !start.authorityId
    || !start.session
    || !start.generation
    || !start.leg
  ) {
    throw new Error(
      `Incomplete execution identity in ${startCursor}: `
      + `${JSON.stringify({
        authorityId: start.authorityId,
        session: start.session,
        generation: start.generation,
        leg: start.leg
      })}`
    );
  }
  const terminal = probe.stateEvents[commitIndex]!;
  if (
    terminal.authorityId !== start.authorityId
    || terminal.session !== null
    || terminal.input !== 'free'
  ) {
    throw new Error(
      `Invalid execution handoff for ${startCursor}: `
      + `${JSON.stringify({
        start: {
          authorityId: start.authorityId,
          session: start.session,
          generation: start.generation,
          leg: start.leg
        },
        terminal: {
          authorityId: terminal.authorityId,
          session: terminal.session,
          input: terminal.input
        }
      })}`
    );
  }
  const samples = probe.resourceSamples.filter((sample) => (
    sample.at >= startAt && sample.at <= releaseAt
  ));
  const timeline: PhoneLegTimeline = {
    run,
    authorityId: start.authorityId,
    sessionId: start.session,
    generation: start.generation,
    leg: start.leg,
    from,
    to,
    direction,
    startAt,
    firstFrameAt: probe.stateEvents[firstFrameIndex]!.at,
    commitAt,
    releaseAt,
    activeMediaAtMax: Math.max(0, ...samples.map((sample) => sample.activeMedia)),
    activeWebglAtMax: Math.max(0, ...samples.map((sample) => sample.activeWebgl)),
    activeWebglLabelsAtMax: samples.reduce<ReadonlyArray<string>>(
      (labels, sample) => sample.activeWebgl > labels.length
        ? sample.activeWebglLabels ?? labels
        : labels,
      []
    )
  };
  expect(timeline.firstFrameAt).toBeGreaterThanOrEqual(timeline.startAt);
  expect(timeline.commitAt).toBeGreaterThanOrEqual(timeline.firstFrameAt);
  expect(timeline.releaseAt).toBeGreaterThanOrEqual(timeline.commitAt);
  expect(timeline.authorityId).toBe(start.authorityId);
  expect(timeline.sessionId).toBe(start.session);
  expect(timeline.generation).toBe(start.generation);
  expect(timeline.leg).toBe(start.leg);
  await page.evaluate((nextTimeline) => {
    const probe = (window as typeof window & {
      __phoneRuntimeProbe?: { legTimelines: PhoneLegTimeline[] };
    }).__phoneRuntimeProbe;
    if (!probe) throw new Error('Phone runtime probe is unavailable');
    probe.legTimelines.push(nextTimeline);
  }, timeline);
  return timeline;
}

type HeroEntranceSample = Readonly<{
  at: number;
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
        at: performance.now(),
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

async function blockFirstAodPlay(page: Page): Promise<void> {
  await page.evaluate(() => {
    const target = window as typeof window & {
      __phoneAodFirstPlayBlockProbe?: {
        playCalls: number;
        rejected: boolean;
      };
    };
    const probe = { playCalls: 0, rejected: false };
    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function play() {
      if (!this.matches('[data-aod-figure-video]')) {
        return Reflect.apply(originalPlay, this, []);
      }
      probe.playCalls += 1;
      if (probe.playCalls !== 1) {
        return Reflect.apply(originalPlay, this, []);
      }
      // Keep the first promise pending long enough for the warmed canvas to
      // produce its frame-zero callback. The runner must retain that fact in
      // admission, rather than accepting it as playback evidence.
      return new Promise<void>((_resolve, reject) => {
        window.setTimeout(() => {
          probe.rejected = true;
          reject(new DOMException('Synthetic AOD autoplay rejection', 'NotAllowedError'));
        }, 160);
      });
    };
    target.__phoneAodFirstPlayBlockProbe = probe;
  });
}

async function firstAodPlayBlockProbe(page: Page) {
  return page.evaluate(() => (
    (window as typeof window & {
      __phoneAodFirstPlayBlockProbe?: {
        playCalls: number;
        rejected: boolean;
      };
    }).__phoneAodFirstPlayBlockProbe
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
    // addInitScript runs before WebKit settles the viewport meta. Convert the
    // temporary desktop-width dimensions by the emulated screen scale so App
    // still selects PhoneStoryShell and the initial fake bounds match the
    // post-meta layout camera used for first-frame admission.
    const screenWidth = window.screen.width || window.innerWidth;
    const scale = Math.min(1, screenWidth / Math.max(1, window.innerWidth));
    const state: ViewportState = {
      offsetLeft: 0,
      offsetTop: 0,
      width: Math.round(window.innerWidth * scale),
      height: Math.round(window.innerHeight * scale)
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
  options: Readonly<{ reducedMotion?: boolean }> = {},
  visualFrames: readonly PhoneVisualFrameSample[] = []
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
      const projectedIntermediate = progresses.some((progress) => (
        progress > 0.05 && progress < 0.95
      ));
      const renderedFrames = visualFrames.filter((frame) => (
        frame.session === first.session
        && frame.generation === first.generation
        && frame.cursor === first.cursor
      ));
      const renderedIntermediate = new Set(
        renderedFrames.map((frame) => frame.signature)
      ).size >= 3;
      expect(
        projectedIntermediate || renderedIntermediate,
        `missing intermediate machine or rendered frame for ${runId} leg ${leg}: ${JSON.stringify({
          progresses,
          renderedFrames
        })}`
      ).toBe(true);
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

/**
 * Hero/Pattern no longer borrow document progress as an animation clock. A
 * single input starts one machine run, and that run owns every intermediate
 * frame until its stable checkpoint. The front rail supplies only the
 * boundary/landing sample; Star→AOD is an ordinary timed-ink transaction.
 */
const FRONT_MACHINE_RUNS = [
  {
    from: 'hero',
    to: 'pattern',
    id: 'hero-pattern',
    kind: 'machine'
  },
  {
    from: 'pattern',
    to: 'pattern-compact',
    id: 'pattern-collapse',
    kind: 'machine'
  },
  {
    from: 'pattern-compact',
    to: 'star-map',
    id: 'pattern-star-map',
    kind: 'machine'
  },
  {
    from: 'star-map',
    to: 'aod-animation',
    id: 'star-map-aod',
    kind: 'machine'
  }
] as const satisfies ReadonlyArray<Readonly<{
  from: PhoneStableScene;
  to: PhoneStableScene;
  id: PhoneRunId;
  kind: 'machine';
}>>;

const FRONT_RUNS = FRONT_MACHINE_RUNS;

type FrontRun = (typeof FRONT_RUNS)[number];

function frontRun(
  from: PhoneStableScene,
  to: PhoneStableScene
): FrontRun {
  const match = FRONT_RUNS.find((candidate) => (
    (candidate.from === from && candidate.to === to)
    || (candidate.from === to && candidate.to === from)
  ));
  if (!match) throw new Error(`Unknown front run: ${from} → ${to}`);
  return match;
}

function assertFrontTransitionCoverage(state: PhoneTransitionTraceState): void {
  const source = state.surfaces.filter((surface) => surface.role === 'transition-source');
  const receiver = state.surfaces.filter((surface) => surface.role === 'transition-receiver');
  const stateSummary = JSON.stringify({
    cursor: state.cursor,
    actualY: state.actualY,
    progress: state.progress,
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
  if (!coverageRoot) return;
  expect(coverageRoot.left).toBeLessThanOrEqual(state.viewport.left + 1);
  expect(coverageRoot.top).toBeLessThanOrEqual(state.viewport.top + 1);
  expect(coverageRoot.right).toBeGreaterThanOrEqual(state.viewport.right - 1);
  expect(coverageRoot.bottom).toBeGreaterThanOrEqual(state.viewport.bottom - 1);
}

function assertMachineFrontRunTrace(
  states: readonly PhoneTransitionTraceState[],
  run: Extract<FrontRun, Readonly<{ kind: 'machine' }>>,
  target: PhoneStableScene,
  direction: 1 | -1
): void {
  const transitionStartIndex = states.findIndex(
    (state) => state.cursor === `transition:${run.id}:0`
  );
  expect(transitionStartIndex, `missing machine front trace for ${run.id}`)
    .toBeGreaterThanOrEqual(0);
  const finalStableIndex = states.findIndex((state, index) => (
    index >= transitionStartIndex && state.cursor === `hold:${target}`
  ));
  expect(finalStableIndex, `missing Front terminal hold:${target}`).toBeGreaterThanOrEqual(0);
  const runTrace = states.slice(transitionStartIndex, finalStableIndex + 1);
  const trace = runTrace.filter((state) => state.cursor === `transition:${run.id}:0`);
  expect(trace, `missing machine front trace for ${run.id}`).not.toEqual([]);
  expect(new Set(trace.map((state) => state.authorityId)).size).toBe(1);
  expect(trace.every((state) => state.session !== null && state.input === 'locked')).toBe(true);
  expect(new Set(trace.map((state) => state.session)).size).toBe(1);
  expect(new Set(trace.map((state) => state.generation)).size).toBe(1);
  const prematureHolds = runTrace.slice(0, -1).filter((state) => (
    state.cursor?.startsWith('hold:')
  ));
  expect(prematureHolds).toEqual([]);
  const progresses = trace.flatMap((state) => (
    state.progress === null || !Number.isFinite(state.progress)
      ? []
      : [state.progress]
  ));
  expect(progresses.some((progress) => progress > .05 && progress < .95)).toBe(true);
  for (let index = 1; index < progresses.length; index += 1) {
    if (direction === 1) {
      expect(progresses[index]).toBeGreaterThanOrEqual(progresses[index - 1]! - .0001);
    } else {
      expect(progresses[index]).toBeLessThanOrEqual(progresses[index - 1]! + .0001);
    }
  }
  const animated = trace.filter((state) => (
    state.phase === 'animating' && state.projection === 'transition'
  ));
  expect(animated, `machine run ${run.id} must own an animated playback phase`)
    .not.toEqual([]);
  if (run.id !== 'pattern-collapse') {
    const endpointFrames = animated.filter((state) => (
      state.surfaces.some((surface) => surface.role === 'transition-source')
      || state.surfaces.some((surface) => surface.role === 'transition-receiver')
    ));
    expect(endpointFrames, `${run.id} must expose route-hosted Ink endpoints`)
      .not.toEqual([]);
    for (const state of endpointFrames) assertFrontTransitionCoverage(state);
  }
}

function assertFrontRunTrace(
  states: readonly PhoneTransitionTraceState[],
  from: PhoneStableScene,
  to: PhoneStableScene,
  direction: 1 | -1
): void {
  const run = frontRun(from, to);
  assertMachineFrontRunTrace(states, run, to, direction);
}

async function driveFrontRun(
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
  const run = frontRun(from, to);
  const expectedDirection = run.from === from ? 1 : -1;
  expect(direction).toBe(expectedDirection);

  // This is the regression gate: one large intent may start exactly one front
  // transaction, but document scroll can never clock or skip its authored run.
  if (run.id === 'star-map-aod') {
    await inputPhoneIntent(page, direction, direction === 1 ? 700 : 4_200);
  } else {
    await inputPhoneDelta(page, direction * 180);
  }
  await expect.poll(
    async () => shell.getAttribute('data-phone-cursor'),
    { timeout: 2_500, message: `one intent must start ${run.id}` }
  ).toBe(`transition:${run.id}:0`);
  await assertStablePhoneHold(page, to, { timeout: 15_000 });
  await recordPhoneLegTimeline(page, from, to, direction);
  assertFrontRunTrace((await phoneRuntimeProbe(page)).stateEvents, from, to, direction);
}

function assertReducedFrontHoldTrace(
  states: readonly PhoneTransitionTraceState[],
  from: PhoneStableScene,
  to: PhoneStableScene,
  direction: 1 | -1
): void {
  const run = frontRun(from, to);
  const terminal = states.findIndex((state) => state.cursor === `hold:${to}`);
  expect(terminal, `missing reduced front terminal hold:${to}`).toBeGreaterThanOrEqual(0);
  const trace = states.slice(0, terminal + 1);
  const candidates = trace.filter((state) => (
    state.session !== null
    && state.cursor === `transition:${run.id}:0`
  ));
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
  expect(trace.some((state) => state.cursor === `transition:${run.id}:0`)).toBe(true);
  expect(trace.every((state) => (
    state.session === null ? state.input === 'free' : state.input === 'locked'
  ))).toBe(true);
  expect(trace.some((state) => state.session !== null && state.projection === 'transition')).toBe(false);
  expect(new Set(trace.map((state) => state.authorityId)).size).toBe(1);
}

async function driveReducedFrontHold(
  page: Page,
  from: PhoneStableScene,
  to: PhoneStableScene,
  direction: 1 | -1
): Promise<void> {
  await assertStablePhoneHold(page, from);
  await waitForNewWheelEpoch(page);
  await page.evaluate(() => {
    const probe = (window as typeof window & {
      __phoneRuntimeProbe?: { stateEvents: unknown[] };
    }).__phoneRuntimeProbe;
    if (probe) probe.stateEvents.length = 0;
  });
  const startY = await page.evaluate(() => window.scrollY);
  await inputPhoneDelta(page, direction * 180);
  const targetY = await page.evaluate(() => window.scrollY);
  expect(direction === 1 ? targetY > startY : targetY < startY).toBe(true);
  await assertStablePhoneHold(page, to, { timeout: 15_000 });
  await recordPhoneLegTimeline(page, from, to, direction);
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
  await inputPhoneIntent(page, direction);
  await page.waitForTimeout(100);
  const leftSource = await shell.getAttribute('data-phone-cursor') !== `hold:${from}`;
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
    const aodVideo = document.querySelector<HTMLVideoElement>('[data-aod-figure-video]');
    const aodCanvas = document.querySelector<HTMLCanvasElement>('[data-aod-figure-canvas]');
    return {
      y: window.scrollY,
      cursor: document.querySelector('[data-phone-cursor]')
        ?.getAttribute('data-phone-cursor'),
      input: document.querySelector('[data-phone-cursor]')
        ?.getAttribute('data-phone-input-state'),
      wheelEvents: probe?.wheelEvents.slice(-8),
      cursorEvents: probe?.cursorEvents.slice(-12),
      stateEvents: probe?.stateEvents.slice(-24),
      aod: aodVideo ? {
        readyState: aodVideo.readyState,
        networkState: aodVideo.networkState,
        currentTime: aodVideo.currentTime,
        paused: aodVideo.paused,
        dataset: { ...aodVideo.dataset },
        canvasStatus: aodCanvas?.dataset.packedAlphaStatus ?? null,
        canvasFrameReady: aodCanvas?.dataset.packedAlphaFrameReady ?? null,
        canvasCount: document.querySelectorAll('[data-aod-figure-canvas]').length
      } : null,
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
    const failedAod = await page.evaluate(() => {
      const video = document.querySelector<HTMLVideoElement>('[data-aod-figure-video]');
      const canvas = document.querySelector<HTMLCanvasElement>('[data-aod-figure-canvas]');
      const root = document.querySelector<HTMLElement>('.portrait-scroll-spike__scene--aod');
      return video ? {
        video: {
          readyState: video.readyState,
          networkState: video.networkState,
          currentTime: video.currentTime,
          paused: video.paused,
          duration: video.duration,
          error: video.error ? {
            code: video.error.code,
            message: video.error.message
          } : null,
          dataset: { ...video.dataset }
        },
        canvas: canvas ? {
          width: canvas.width,
          height: canvas.height,
          status: canvas.dataset.packedAlphaStatus ?? null,
          frameReady: canvas.dataset.packedAlphaFrameReady ?? null,
          frame: canvas.dataset.packedAlphaFrame ?? null,
          mediaTime: canvas.dataset.packedAlphaMediaTime ?? null,
          active: canvas.dataset.packedAlphaCompositorActive ?? null
        } : null,
        rootDataset: root ? { ...root.dataset } : null
      } : null;
    });
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\n`
      + `transition trace: ${JSON.stringify({
        wheels: failedProbe.wheelEvents.slice(-8),
        cursors: failedProbe.cursorEvents.slice(-12),
        states: failedProbe.stateEvents.slice(-32),
        aod: failedAod
      })}`
    );
  }
  await page.waitForTimeout(50);
  await recordPhoneLegTimeline(page, from, to, direction);
  const probe = await phoneRuntimeProbe(page);
  assertTransitionTrace(
    probe.stateEvents,
    from,
    to,
    direction,
    options,
    probe.visualFrames
  );
  const runtime = await phoneRuntimeProbe(page);
  // Figure2 legitimately owns its packed-alpha canvas alongside the shared
  // stage resources. The production invariant is the global hard ceiling,
  // not an obsolete two-context steady-state assumption.
  expect(runtime.active, `stable WebGL cap after ${from} → ${to}: ${JSON.stringify({
    active: runtime.active,
    maxActive: runtime.maxActive,
    created: runtime.created
  })}`).toBeLessThanOrEqual(MAX_ACTIVE_PHONE_WEBGL_CONTEXTS);
  expect(runtime.maxActive).toBeLessThanOrEqual(MAX_ACTIVE_PHONE_WEBGL_CONTEXTS);
}

const FORMAL_FORWARD_JOURNEY = [
  ['hero', 'pattern'],
  ['pattern', 'pattern-compact'],
  ['pattern-compact', 'star-map'],
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
  ['star-map', 'pattern-compact'],
  ['pattern-compact', 'pattern'],
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
  return FRONT_RUNS.some((run) => (
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
    try {
      if (isFrontJourneyLeg(from, to)) {
        if (options.reducedMotion) {
          await driveReducedFrontHold(page, from, to, direction);
        } else {
          await driveFrontRun(page, from, to, direction);
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
    } catch (error) {
      const probe = await phoneRuntimeProbe(page);
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}\n`
        + `leg telemetry (${from} → ${to}): ${JSON.stringify({
          completed: probe.legTimelines,
          resources: probe.resourceSamples.slice(-20),
          states: probe.stateEvents.slice(-32)
        })}`
      );
    }
  }
}

/**
 * A release gate for the real interaction shape: one continuous intent per
 * authored boundary, with no pulse loop used to manufacture intermediate
 * states. The stable checkpoint is still the handoff between gestures, but
 * every gesture itself contains multiple touch moves on WebKit.
 */
async function driveContinuousJourney(
  page: Page,
  legs: ReadonlyArray<readonly [PhoneStableScene, PhoneStableScene]>
): Promise<void> {
  for (const [from, to] of legs) {
    const direction: 1 | -1 = FORMAL_FORWARD_JOURNEY.some(([source, target]) => (
      source === from && target === to
    )) ? 1 : -1;
    const shell = await assertStablePhoneHold(page, from);
    await waitForNewWheelEpoch(page);
    await page.evaluate(() => {
      const probe = (window as typeof window & {
        __phoneRuntimeProbe?: {
          cursorEvents: unknown[];
          stateEvents: unknown[];
          visualFrames: unknown[];
        };
      }).__phoneRuntimeProbe;
      if (!probe) return;
      probe.cursorEvents.length = 0;
      probe.stateEvents.length = 0;
      probe.visualFrames.length = 0;
    });

    const starAodLeg = (from === 'star-map' && to === 'aod-animation')
      || (from === 'aod-animation' && to === 'star-map');
    const frontDistance = starAodLeg
      ? (direction === 1 ? 700 : 4_200)
      : 180;
    const aodMethodLeg = (from === 'aod-animation' && to === 'method-top')
      || (from === 'method-top' && to === 'aod-animation');
    await inputPhoneIntent(
      page,
      direction,
      isFrontJourneyLeg(from, to) ? frontDistance : 4_200,
      aodMethodLeg
    );
    await expect.poll(
      async () => shell.getAttribute('data-phone-cursor'),
      { timeout: 2_500, message: `continuous intent did not claim ${from} → ${to}` }
    ).toMatch(/^transition:/);
    await assertStablePhoneHold(page, to, { timeout: 15_000 });
    const timeline = await recordPhoneLegTimeline(page, from, to, direction);
    expect(
      timeline.commitAt - timeline.startAt,
      `${from} → ${to} must settle within one bounded preparation/playback lease`
    ).toBeLessThanOrEqual(8_000);
    const probe = await phoneRuntimeProbe(page);
    const states = probe.stateEvents;
    if (isFrontJourneyLeg(from, to)) {
      assertFrontRunTrace(states, from, to, direction);
    } else {
      assertTransitionTrace(states, from, to, direction, {}, probe.visualFrames);
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

type TailPrefetchEvidence = Readonly<{
  authorityIds: readonly string[];
  fallback: string | null;
  scrollHeight: number;
  staticContentAtViewport: boolean;
  phLeaves: number;
  craneLeaves: number;
  coverage: Readonly<{
    viewport: Readonly<{ left: number; top: number; right: number; bottom: number }>;
    host: Readonly<{ left: number; top: number; right: number; bottom: number }> | null;
  }>;
}>;

async function readTailPrefetchEvidence(page: Page): Promise<TailPrefetchEvidence> {
  return page.evaluate(() => {
    const viewport = window.visualViewport;
    const viewportBounds = {
      left: viewport?.offsetLeft ?? 0,
      top: viewport?.offsetTop ?? 0,
      right: (viewport?.offsetLeft ?? 0) + (viewport?.width ?? window.innerWidth),
      bottom: (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight)
    };
    const coverageHost = document.querySelector<HTMLElement>(
      '.portrait-scroll-spike__viewport-coverage'
    );
    const coverageRect = coverageHost?.getBoundingClientRect() ?? null;
    const viewportHit = document.elementFromPoint(
      Math.round((viewportBounds.left + viewportBounds.right) / 2),
      Math.round((viewportBounds.top + viewportBounds.bottom) / 2)
    );
    return {
      authorityIds: Array.from(
        document.querySelectorAll<HTMLElement>('[data-phone-authority-id]')
      ).filter((element) => element.isConnected).map((element) => (
        element.dataset.phoneAuthorityId ?? ''
      )),
      fallback: document.documentElement.dataset.phoneStoryFallback ?? null,
      scrollHeight: Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
        document.scrollingElement?.scrollHeight ?? 0
      ),
      staticContentAtViewport: Boolean(viewportHit?.closest('.static-content')),
      phLeaves: document.querySelectorAll('[data-phone-scene="ph-animation"]').length,
      craneLeaves: document.querySelectorAll('[data-phone-scene="crane-animation"]').length,
      coverage: {
        viewport: viewportBounds,
        host: coverageRect ? {
          left: coverageRect.left,
          top: coverageRect.top,
          right: coverageRect.right,
          bottom: coverageRect.bottom
        } : null
      }
    };
  });
}

async function requestGradeATailPrefetch(page: Page): Promise<void> {
  const slot = page.locator('[data-phone-grade-a-requested]');
  for (let pulse = 0; pulse < 64; pulse += 1) {
    if (await slot.getAttribute('data-phone-grade-a-requested') === 'true') return;
    await inputPhoneDelta(page, 120);
    await page.waitForTimeout(80);
  }
  await expect(slot).toHaveAttribute('data-phone-grade-a-requested', 'true');
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
  await driveFrontRun(page, 'hero', 'pattern', 1);
  await driveFrontRun(page, 'pattern', 'pattern-compact', 1);
  await driveFrontRun(page, 'pattern-compact', 'star-map', 1);
  await driveFrontRun(page, 'star-map', 'aod-animation', 1);
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

test('[P0 AOD admission] a rejected play rolls back through the session owner before a new forward intent reaches Method', async ({
  page
}) => {
  test.setTimeout(120_000);
  await installColdPhoneRuntimeProbe(page);
  await visitFormal(page, '/', 'hero');
  await driveFrontRun(page, 'hero', 'pattern', 1);
  await driveFrontRun(page, 'pattern', 'pattern-compact', 1);
  await driveFrontRun(page, 'pattern-compact', 'star-map', 1);
  await driveFrontRun(page, 'star-map', 'aod-animation', 1);
  await assertStablePhoneHold(page, 'aod-animation');
  await blockFirstAodPlay(page);
  await waitForNewWheelEpoch(page);

  await inputPhoneDelta(page, 50);
  await expect.poll(async () => (
    (await firstAodPlayBlockProbe(page))?.rejected ?? false
  )).toBe(true);
  const rejected = await firstAodPlayBlockProbe(page);
  expect(rejected?.playCalls).toBe(1);

  // A rejected `play()` must enter the one session-owned rollback path. It
  // cannot remain an input-locked preparing candidate waiting for watchdog.
  await assertStablePhoneHold(page, 'aod-animation', { timeout: 15_000 });
  const failedState = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-phone-authority-id]');
    const video = document.querySelector<HTMLVideoElement>('[data-aod-figure-video]');
    return {
      cursor: root?.dataset.phoneCursor ?? null,
      phase: root?.dataset.phoneTransitionPhase ?? null,
      input: root?.dataset.phoneInputState ?? null,
      retryable: root?.dataset.phoneRetryableRun ?? null,
      paused: video?.paused ?? null
    };
  });
  expect(failedState).toMatchObject({
    cursor: 'hold:aod-animation',
    phase: null,
    input: 'free',
    paused: true
  });
  const blockedTrace = await phoneRuntimeProbe(page);
  const aodAttempt = blockedTrace.stateEvents.filter((state) => (
    state.cursor === 'transition:aod-method:0'
  ));
  expect(aodAttempt).not.toEqual([]);
  expect(aodAttempt.some((state) => state.phase === 'animating')).toBe(false);

  // The next real forward intent owns retry. A pointer listener may not
  // resurrect the discarded session or create a private media lifecycle.
  await waitForNewWheelEpoch(page);
  await inputPhoneDelta(page, 50);
  await assertStablePhoneHold(page, 'method-top', { timeout: 70_000 });
  const recovered = await firstAodPlayBlockProbe(page);
  expect(recovered?.playCalls).toBeGreaterThanOrEqual(2);
  expect((await page.locator(LIVE_PHONE_ROOT).getAttribute(
    'data-phone-input-state'
  ))).toBe('free');
});

test('[P0 Safari viewport pixels] freezes content hosts and proves a real DOM viewport backdrop at every live edge', async ({
  page
}) => {
  test.setTimeout(45_000);
  await installLiveVisualViewportProbe(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator(LIVE_STORY_LOADER)).toBeHidden();
  await expect.poll(async () => page.locator(LIVE_PHONE_ROOT).getAttribute(
    'data-phone-cursor'
  )).toBe('hold:hero');
  await expect(page.locator(LIVE_PHONE_ROOT)).toHaveAttribute(
    'data-portrait-hero-entrance',
    'complete'
  );

  const inspectViewportHosts = () => page.evaluate(() => {
    const viewport = window.visualViewport;
    const stage = document.querySelector<HTMLElement>('.portrait-scroll-spike__stage');
    const overlay = document.querySelector<HTMLElement>(
      '.portrait-scroll-spike__route-overlay'
    );
    const coverage = document.querySelector<HTMLElement>(
      '.portrait-scroll-spike__viewport-coverage'
    );
    if (!viewport || !stage || !overlay || !coverage) {
      throw new Error('Missing live viewport presentation hosts');
    }
    return {
      viewport: {
        left: viewport.offsetLeft,
        top: viewport.offsetTop,
        right: viewport.offsetLeft + viewport.width,
        bottom: viewport.offsetTop + viewport.height
      },
      stage: stage.getBoundingClientRect().toJSON(),
      overlay: overlay.getBoundingClientRect().toJSON(),
      coverage: coverage.getBoundingClientRect().toJSON(),
      coverageHost: coverage.dataset.phonePresentationHost ?? null,
      coverageEdge: coverage.dataset.portraitEdgeScene ?? null
    };
  });
  const before = await inspectViewportHosts();
  await setLiveVisualViewport(page, {
    offsetTop: 160,
    height: 844
  });
  await page.waitForTimeout(300);

  const extended = await inspectViewportHosts();
  for (const host of ['stage', 'overlay'] as const) {
    expect(extended[host].left).toBeCloseTo(before[host].left, 0);
    expect(extended[host].top).toBeCloseTo(before[host].top, 0);
    expect(extended[host].right).toBeCloseTo(before[host].right, 0);
    expect(extended[host].bottom).toBeCloseTo(before[host].bottom, 0);
  }
  expect(extended.coverage.left).toBeCloseTo(0, 0);
  expect(extended.coverage.top).toBeCloseTo(0, 0);
  expect(extended.coverage.width).toBeGreaterThanOrEqual(extended.viewport.right - 1);
  expect(extended.coverage.height).toBeGreaterThanOrEqual(extended.viewport.bottom - 1);
  expect(extended.coverageHost).toBe('coverage');
  expect(extended.coverageEdge).toBe('hero');
  for (const sample of viewportEdgePixelWitnesses(
    decodePngScreenshot(await page.screenshot())
  )) {
    expect(sample.transparentPixels, `${sample.edge} edge exposed transparent compositor pixels`).toBe(0);
    expect(sample.nearWhitePixels, `${sample.edge} edge exposed a white seam`).toBe(0);
  }

  await setLiveVisualViewport(page, { offsetTop: 0, height: 700 });
  await page.waitForTimeout(300);
  const retracted = await inspectViewportHosts();
  expect(retracted.coverage.left).toBeCloseTo(0, 0);
  expect(retracted.coverage.top).toBeCloseTo(0, 0);
  expect(retracted.coverage.height).toBeGreaterThanOrEqual(extended.coverage.height - 1);
  for (const sample of viewportEdgePixelWitnesses(
    decodePngScreenshot(await page.screenshot())
  )) {
    expect(sample.transparentPixels, `${sample.edge} edge exposed transparent compositor pixels after retraction`).toBe(0);
    expect(sample.nearWhitePixels, `${sample.edge} edge exposed a white seam after retraction`).toBe(0);
  }
});

test('tail prefetch keeps one formal phone authority when PH mounts', async ({ page }) => {
  test.setTimeout(75_000);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await installColdPhoneRuntimeProbe(page);
  await visitFormal(page, '/', 'hero');
  const before = await readTailPrefetchEvidence(page);
  expect(before.authorityIds).toHaveLength(1);
  const authorityId = before.authorityIds[0];
  if (!authorityId) throw new Error('Cold formal route did not publish an authority id');

  await requestGradeATailPrefetch(page);
  // The lazy import and its ref-commit occur after the observer publishes the
  // request flag; sample only after that commit boundary has had time to run.
  await page.waitForTimeout(750);
  const after = await readTailPrefetchEvidence(page);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(after.authorityIds).toEqual([authorityId]);
  expect(after.scrollHeight).toBeGreaterThanOrEqual(before.scrollHeight);
  expect(after.fallback).toBeNull();
  expect(after.staticContentAtViewport).toBe(false);
  await expect(page.locator('[data-phone-scene="ph-animation"]')).toHaveCount(1);
  await expect(page.locator('[data-phone-packed-alpha-canvas="ph-figure"]')).toHaveCount(1);
  expect(after.phLeaves).toBe(1);
  expect(after.coverage.host).not.toBeNull();
  const coverageHost = after.coverage.host;
  if (!coverageHost) throw new Error('Tail prefetch unmounted the DOM viewport coverage host');
  expect(coverageHost.left).toBeLessThanOrEqual(after.coverage.viewport.left + 1);
  expect(coverageHost.top).toBeLessThanOrEqual(after.coverage.viewport.top + 1);
  expect(coverageHost.right).toBeGreaterThanOrEqual(after.coverage.viewport.right - 1);
  expect(coverageHost.bottom).toBeGreaterThanOrEqual(after.coverage.viewport.bottom - 1);
});

test('tail prefetch direct Crane mount keeps its two packed hosts inside one authority', async ({
  page
}) => {
  test.setTimeout(60_000);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await installColdPhoneRuntimeProbe(page);
  await visitFormal(page, '/#crane-animation', 'crane-animation');
  const before = await readTailPrefetchEvidence(page);
  expect(before.authorityIds).toHaveLength(1);
  const authorityId = before.authorityIds[0];
  if (!authorityId) throw new Error('Direct Crane route did not publish an authority id');

  await page.waitForTimeout(750);
  const after = await readTailPrefetchEvidence(page);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(after.authorityIds).toEqual([authorityId]);
  expect(after.scrollHeight).toBeGreaterThanOrEqual(before.scrollHeight);
  expect(after.fallback).toBeNull();
  expect(after.staticContentAtViewport).toBe(false);
  await expect(page.locator('[data-phone-scene="crane-animation"]')).toHaveCount(1);
  await expect(page.locator('[data-phone-packed-alpha-canvas="crane-figure"]')).toHaveCount(1);
  await expect(page.locator('[data-phone-packed-alpha-canvas="crane-flock"]')).toHaveCount(1);
  expect(after.craneLeaves).toBe(1);
  expect(after.coverage.host).not.toBeNull();
  const coverageHost = after.coverage.host;
  if (!coverageHost) throw new Error('Direct Crane mount unmounted the DOM viewport coverage host');
  expect(coverageHost.left).toBeLessThanOrEqual(after.coverage.viewport.left + 1);
  expect(coverageHost.top).toBeLessThanOrEqual(after.coverage.viewport.top + 1);
  expect(coverageHost.right).toBeGreaterThanOrEqual(after.coverage.viewport.right - 1);
  expect(coverageHost.bottom).toBeGreaterThanOrEqual(after.coverage.viewport.bottom - 1);
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
  expect(probe.maxActive).toBeLessThanOrEqual(MAX_ACTIVE_PHONE_WEBGL_CONTEXTS);
  expect(webGlWarnings).toEqual([]);
  const booleanContract = await cssBooleanContractViolations(page);
  expect(booleanContract.contractCount).toBeGreaterThan(10);
  expect(booleanContract.violations).toEqual([]);
});

test('[P0 unsegmented journey] one continuous intent per boundary completes the full route in both directions', async ({
  page,
  browserName
}) => {
  test.setTimeout(browserName === 'webkit' ? 240_000 : 180_000);
  await installColdPhoneRuntimeProbe(page);
  await visitFormal(page, '/', 'hero');

  await driveContinuousJourney(page, FORMAL_FORWARD_JOURNEY);
  await assertStablePhoneHold(page, 'contact');
  await driveContinuousJourney(page, FORMAL_REVERSE_JOURNEY);
  await assertStablePhoneHold(page, 'hero');

  const probe = await phoneRuntimeProbe(page);
  expect(probe.legTimelines).toHaveLength(
    FORMAL_FORWARD_JOURNEY.length + FORMAL_REVERSE_JOURNEY.length
  );
  expect(probe.legTimelines.every((timeline) => (
    timeline.startAt <= timeline.firstFrameAt
    && timeline.firstFrameAt <= timeline.commitAt
    && timeline.commitAt <= timeline.releaseAt
    && timeline.commitAt - timeline.startAt <= 8_000
  ))).toBe(true);
  expect(new Set(probe.legTimelines.map((timeline) => timeline.authorityId)).size).toBe(1);
  expect(probe.maxActive).toBeLessThanOrEqual(MAX_ACTIVE_PHONE_WEBGL_CONTEXTS);
});

test('Task 10 gates a production Contact → Hero reverse journey', async ({ page }) => {
  test.setTimeout(120_000);
  await installColdPhoneRuntimeProbe(page);
  await visitFormal(page, '/#contact', 'contact');
  const directContactProbe = await phoneRuntimeProbe(page);
  expect(
    directContactProbe.created.filter(({ label }) => /hero/i.test(label)),
    'direct Contact must not create Hero WebGL owners before reverse admission'
  ).toEqual([]);
  const authorityId = await page.locator(LIVE_PHONE_ROOT).getAttribute(
    'data-phone-authority-id'
  );

  await driveJourney(page, FORMAL_REVERSE_JOURNEY);
  const hero = await assertStablePhoneHold(page, 'hero');
  await expect(hero).toHaveAttribute('data-phone-authority-id', authorityId!);
  await expect(hero).toHaveAttribute('data-portrait-hero-entrance', 'complete');
  await expect(hero).toHaveAttribute('data-portrait-hero-text-entrance', 'complete');
  const heroScene = page.locator('.portrait-scroll-spike__scene--hero');
  await expect(heroScene).toHaveAttribute('data-phone-scene-active', 'true');
  await expect(heroScene).toHaveAttribute('data-portrait-hero-title-active', 'true');
  await expect(hero.locator('#portrait-spike-home')).toBeVisible();
  await expect(hero.locator('.portrait-scroll-spike__hero-subtitle p')).toBeVisible();
  const glyphOpacities = await hero.locator('[data-text-reveal-item]').evaluateAll((nodes) => (
    nodes.map((node) => Number(window.getComputedStyle(node).opacity))
  ));
  expect(glyphOpacities.length).toBeGreaterThan(0);
  expect(Math.min(...glyphOpacities)).toBeGreaterThanOrEqual(.99);
  await expect(
    hero.locator('[data-phone-packed-alpha-canvas="hero-figure"]')
  ).toHaveAttribute('data-packed-alpha-frame-ready', 'true');
  const reverseProbe = await phoneRuntimeProbe(page);
  expect(
    reverseProbe.maxActive,
    `reverse WebGL contexts: ${JSON.stringify({
      maxActive: reverseProbe.maxActive,
      active: reverseProbe.active,
      created: reverseProbe.created,
      samples: reverseProbe.resourceSamples.slice(-8)
    })}`
  ).toBeLessThanOrEqual(MAX_ACTIVE_PHONE_WEBGL_CONTEXTS);
});

test('Task 10 completes two full-motion formal round trips in one authority', async ({
  page
}, testInfo) => {
  // The measured full run completed all 48 leg assertions at ~480s; the old
  // budget expired before afterEach could finish its resource audit. Retain a
  // bounded 12.5% margin and attach every half-round so a future timeout still
  // distinguishes a lifecycle stall from the cost of the exhaustive gate.
  test.setTimeout(540_000);
  await installColdPhoneRuntimeProbe(page);
  await visitFormal(page, '/?round-trip=two', 'hero');
  const authorityId = await page.locator(LIVE_PHONE_ROOT).getAttribute(
    'data-phone-authority-id'
  );

  for (let round = 0; round < 2; round += 1) {
    await driveJourney(page, FORMAL_FORWARD_JOURNEY);
    await attachPhoneJourneyTelemetry(page, testInfo, `round-${round + 1}-forward`);
    await driveJourney(page, FORMAL_REVERSE_JOURNEY);
    await attachPhoneJourneyTelemetry(page, testInfo, `round-${round + 1}-reverse`);
    const hero = page.locator(LIVE_PHONE_ROOT);
    await expect(hero).toHaveAttribute('data-phone-authority-id', authorityId!);
  }

  const probe = await phoneRuntimeProbe(page);
  const expectedLegCount = 2 * (
    FORMAL_FORWARD_JOURNEY.length + FORMAL_REVERSE_JOURNEY.length
  );
  expect(
    probe.legTimelines,
    `two-round leg telemetry: ${JSON.stringify(probe.legTimelines)}`
  ).toHaveLength(expectedLegCount);
  expect(probe.legTimelines.every((timeline) => (
    timeline.startAt <= timeline.firstFrameAt
    && timeline.firstFrameAt <= timeline.commitAt
    && timeline.commitAt <= timeline.releaseAt
    && timeline.activeWebglAtMax <= MAX_ACTIVE_PHONE_WEBGL_CONTEXTS
  ))).toBe(true);
  expect(new Set(probe.legTimelines.map((timeline) => timeline.authorityId))).toEqual(
    new Set([authorityId])
  );
  expect(new Set(probe.legTimelines.map((timeline) => (
    [
      timeline.sessionId,
      timeline.generation,
      timeline.leg,
      timeline.direction,
      timeline.run
    ].join(':')
  ))).size).toBe(expectedLegCount);
  expect(probe.legTimelines.every((timeline) => (
    timeline.sessionId.length > 0
    && timeline.generation.length > 0
    && timeline.leg.length > 0
  ))).toBe(true);
  expect(probe.maxActive).toBeLessThanOrEqual(MAX_ACTIVE_PHONE_WEBGL_CONTEXTS);
});

test('Task 10 lets a direct Contact hold claim its Group67 reverse boundary', async ({ page }) => {
  test.setTimeout(60_000);
  await installColdPhoneRuntimeProbe(page);
  await visitFormal(page, '/#contact', 'contact');
  const directContactProbe = await phoneRuntimeProbe(page);
  expect(directContactProbe.created.filter(({ label }) => /hero/i.test(label))).toEqual([]);
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
  expect((await phoneRuntimeProbe(page)).maxActive).toBeLessThanOrEqual(MAX_ACTIVE_PHONE_WEBGL_CONTEXTS);
});

test('[AOD↔Method reduced cutover] commits both target static endpoints without media playback', async ({ page }) => {
  test.setTimeout(120_000);
  await installColdPhoneRuntimeProbe(page);
  await visitFormal(page, '/?portrait-spike-motion=reduce', 'hero');
  await driveReducedFrontHold(page, 'hero', 'pattern', 1);
  await driveReducedFrontHold(page, 'pattern', 'pattern-compact', 1);
  await driveReducedFrontHold(page, 'pattern-compact', 'star-map', 1);
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
  expect((await phoneRuntimeProbe(page)).maxActive).toBeLessThanOrEqual(MAX_ACTIVE_PHONE_WEBGL_CONTEXTS);
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
  expect((await phoneRuntimeProbe(page)).maxActive).toBeLessThanOrEqual(MAX_ACTIVE_PHONE_WEBGL_CONTEXTS);
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

test('[Pattern collapse + StarMap reduced cutover] repeats two static-proof cycles in one authority', async ({ page }) => {
  test.setTimeout(120_000);
  await installColdPhoneRuntimeProbe(page);
  await visitFormal(page, '/?portrait-spike-motion=reduce', 'hero');
  await driveReducedFrontHold(page, 'hero', 'pattern', 1);
  const authorityId = await (await assertStablePhoneHold(page, 'pattern'))
    .getAttribute('data-phone-authority-id');
  expect(authorityId).toBeTruthy();

  for (let cycle = 0; cycle < 2; cycle += 1) {
    await driveReducedFrontHold(page, 'pattern', 'pattern-compact', 1);
    await expect(await assertStablePhoneHold(page, 'pattern-compact'))
      .toHaveAttribute('data-phone-authority-id', authorityId!);
    await driveReducedFrontHold(page, 'pattern-compact', 'star-map', 1);
    await expect(await assertStablePhoneHold(page, 'star-map'))
      .toHaveAttribute('data-phone-authority-id', authorityId!);
    await driveReducedFrontHold(page, 'star-map', 'pattern-compact', -1);
    await expect(await assertStablePhoneHold(page, 'pattern-compact'))
      .toHaveAttribute('data-phone-authority-id', authorityId!);
    await driveReducedFrontHold(page, 'pattern-compact', 'pattern', -1);
    await expect(await assertStablePhoneHold(page, 'pattern'))
      .toHaveAttribute('data-phone-authority-id', authorityId!);
  }

  expect((await phoneRuntimeProbe(page)).maxActive).toBeLessThanOrEqual(MAX_ACTIVE_PHONE_WEBGL_CONTEXTS);
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

test('[front-half gate] a manual root reload begins a new visible cold Loader run', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/', { waitUntil: 'commit' });
  const loader = page.locator(LIVE_STORY_LOADER);
  await expect(loader).toBeVisible();
  await expect.poll(async () => loader.count()).toBe(0);

  await page.reload({ waitUntil: 'commit' });
  await expect(
    loader,
    'a user refresh is a new document: it must not infer resume=skip from the previous document becoming hidden'
  ).toBeVisible();
  await expect(loader).toHaveAttribute('data-loader-status', 'running');
  await expect(page.locator(LIVE_PHONE_ROOT)).toHaveAttribute(
    'data-portrait-loader-ready',
    'false'
  );
  await expect.poll(async () => page.evaluate(() => (
    document.documentElement.dataset.portraitLoaderResume ?? null
  ))).not.toBe('skip');
});

test('[front-half gate] continuous WebKit gestures run Hero ↔ Pattern without skipping its checkpoint', async ({ page }) => {
  test.setTimeout(60_000);
  await installColdPhoneRuntimeProbe(page);
  await visitFormal(page, '/', 'hero');

  await touchPhoneSequence(page, [40, 100, 160]);
  await expect.poll(
    async () => page.locator(LIVE_PHONE_ROOT).getAttribute('data-phone-cursor'),
    { timeout: 2_500, message: 'the first continuous gesture must enter Hero → Pattern' }
  ).toBe('transition:hero-pattern:0');
  await assertStablePhoneHold(page, 'pattern', { timeout: 15_000 });

  const states = (await phoneRuntimeProbe(page)).stateEvents;
  assertMachineFrontRunTrace(
    states,
    frontRun('hero', 'pattern') as Extract<FrontRun, Readonly<{ kind: 'machine' }>>,
    'pattern',
    1
  );
  const frontRuns = [...new Set(states.flatMap((state) => (
    state.cursor?.startsWith('transition:hero-pattern:')
      ? ['hero-pattern']
      : []
  )))];
  expect(frontRuns).toEqual(['hero-pattern']);

  await page.evaluate(() => {
    const probe = (window as typeof window & {
      __phoneRuntimeProbe?: { stateEvents: unknown[] };
    }).__phoneRuntimeProbe;
    if (probe) probe.stateEvents.length = 0;
  });
  await touchPhoneSequence(page, [-40, -100, -160]);
  await expect.poll(
    async () => page.locator(LIVE_PHONE_ROOT).getAttribute('data-phone-cursor'),
    { timeout: 2_500, message: 'the reverse gesture must enter Pattern → Hero' }
  ).toBe('transition:hero-pattern:0');
  await assertStablePhoneHold(page, 'hero', { timeout: 15_000 });
  assertMachineFrontRunTrace(
    (await phoneRuntimeProbe(page)).stateEvents,
    frontRun('hero', 'pattern') as Extract<FrontRun, Readonly<{ kind: 'machine' }>>,
    'hero',
    -1
  );
});

test('[execution topology] Loader covers an already-warming Hero stage before poster readiness', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/', { waitUntil: 'commit' });
  let warming: unknown = null;
  for (let index = 0; index < 80; index += 1) {
    const sample = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>('.portrait-scroll-spike');
      const hero = document.querySelector<HTMLElement>(
        '.portrait-scroll-spike__scene--hero'
      );
      const stage = document.querySelector<HTMLElement>('.portrait-scroll-spike__stage');
      const loader = document.querySelector<HTMLElement>(
        '.story-loader[data-story-loader="true"]'
      );
      const style = stage ? getComputedStyle(stage) : null;
      const loaderStyle = loader ? getComputedStyle(loader) : null;
      const stageRect = stage?.getBoundingClientRect();
      const loaderRect = loader?.getBoundingClientRect();
      return {
        loaderReady: root?.dataset.portraitLoaderReady ?? null,
        firstFrame: hero?.dataset.phoneHeroFirstFrame ?? null,
        stageVisible: Boolean(
          style
          && style.visibility !== 'hidden'
          && Number.parseFloat(style.opacity || '1') > .01
        ),
        loaderCoversStage: Boolean(
          loaderStyle
          && stageRect
          && loaderRect
          && loaderStyle.display !== 'none'
          && loaderStyle.visibility !== 'hidden'
          && Number.parseFloat(loaderStyle.opacity || '1') > .01
          && Number.parseInt(loaderStyle.zIndex || '0', 10)
            > Number.parseInt(style?.zIndex || '0', 10)
          && loaderRect.left <= stageRect.left
          && loaderRect.top <= stageRect.top
          && loaderRect.right >= stageRect.right
          && loaderRect.bottom >= stageRect.bottom
        )
      };
    });
    if (
      sample.loaderReady === 'false'
      && sample.firstFrame === 'decoding'
      && sample.stageVisible
      && sample.loaderCoversStage
    ) {
      warming = sample;
      break;
    }
    await page.waitForTimeout(50);
  }

  expect(
    warming,
    'Hero must prewarm behind Loader before poster decoding; Loader is the only top-level visual cover'
  ).not.toBeNull();
});

test('[execution regression] Loader handoff starts one authored Hero entrance', async ({ page }) => {
  test.setTimeout(45_000);
  await installHeroEntranceProbe(page);
  await page.goto('/', { waitUntil: 'commit' });

  const loader = page.locator(LIVE_STORY_LOADER);
  await expect.poll(async () => loader.getAttribute('data-loader-status')).toBe('exiting');
  await expect(
    page.locator(LIVE_PHONE_ROOT),
    'Loader owns the opening clock until its visual plane is released'
  ).toHaveAttribute('data-portrait-hero-entrance', 'primed');
  await expect.poll(async () => loader.count()).toBe(0);
  await expect(page.locator(LIVE_PHONE_ROOT)).toHaveAttribute('data-portrait-loader-ready', 'true');
  await expect(page.locator(LIVE_PHONE_ROOT)).toHaveAttribute(
    'data-portrait-hero-entrance',
    'playing'
  );

  const openingFrames: PngScreenshot[] = [];
  for (let index = 0; index < 12; index += 1) {
    openingFrames.push(decodePngScreenshot(await page.screenshot()));
    await page.waitForTimeout(50);
  }
  const openingRegion = { left: .08, top: .08, right: .92, bottom: .92 } as const;
  for (const frame of openingFrames) {
    expect(
      compositedLuminanceRange(frame, openingRegion),
      'after Loader fade begins, Hero must never expose a uniform black or coverage frame'
    ).toBeGreaterThan(18);
  }

  await expect.poll(async () => page.locator(LIVE_PHONE_ROOT).getAttribute(
    'data-portrait-hero-entrance'
  )).toBe('complete');
  const exposed = (await heroEntranceSamples(page)).filter((sample) => (
    sample.loaderReady === 'true' && sample.progress !== null
  ));
  expect(exposed.length).toBeGreaterThan(20);
  expect(exposed[0]?.progress).toBeLessThanOrEqual(.01);
  expect(exposed.at(-1)?.progress).toBeGreaterThanOrEqual(.999);
  expect(
    (exposed.at(-1)?.at ?? 0) - (exposed[0]?.at ?? 0),
    'cold Hero must retain its authored 2700ms clock instead of being completed by stable projection'
  ).toBeGreaterThanOrEqual(2_500);
  expect(exposed.every((sample, index) => (
    index === 0
    || sample.progress! + .002 >= exposed[index - 1]!.progress!
  ))).toBe(true);
  const entranceSamples = (await heroEntranceSamples(page)).filter((sample) => (
    sample.progress !== null
  ));
  const resetIndex = entranceSamples.findIndex((sample, index) => (
    index > 0
    && sample.progress !== null
    && sample.progress <= .001
    && entranceSamples.slice(0, index).some((prior) => (
      prior.progress !== null && prior.progress >= .05
    ))
  ));
  expect(resetIndex, 'the opening surface may progress once, but never reset').toBe(-1);
});

test('[execution regression] Star Map advances real Perlin frames while its stable leaf is active', async ({ page }) => {
  test.setTimeout(75_000);
  await installColdPhoneRuntimeProbe(page);
  await visitFormal(page, '/', 'hero');
  await driveFrontRun(page, 'hero', 'pattern', 1);
  await driveFrontRun(page, 'pattern', 'pattern-compact', 1);
  await driveFrontRun(page, 'pattern-compact', 'star-map', 1);
  await assertStablePhoneHold(page, 'star-map');

  const canvas = page.locator('[data-portrait-star-perlin]');
  await expect(canvas).toHaveCount(1);
  const firstRevision = Number.parseInt(
    await canvas.getAttribute('data-portrait-star-perlin-revision') ?? '0',
    10
  );
  const firstFrame = decodePngScreenshot(await canvas.screenshot());
  await page.waitForTimeout(1_000);
  const lastRevision = Number.parseInt(
    await canvas.getAttribute('data-portrait-star-perlin-revision') ?? '0',
    10
  );
  const lastFrame = decodePngScreenshot(await canvas.screenshot());

  expect(
    lastRevision - firstRevision,
    `stable Star Map did not advance its leaf-owned Perlin renderer: ${firstRevision} → ${lastRevision}`
  ).toBeGreaterThanOrEqual(8);
  expect(
    compositedPixelDelta(firstFrame, lastFrame, { left: 0, top: 0, right: 1, bottom: 1 }, 4),
    'stable Star Map must change final canvas pixels while its renderer is active'
  ).toBeGreaterThan(0);

  await page.evaluate(() => {
    const target = window as typeof window & {
      __starAodAdmissionProbe?: {
        samples: Array<{
          cursor: string | null;
          sourceVisible: boolean;
          targetCanvasProof: boolean;
        }>;
        stop(): void;
      };
    };
    let sampling = true;
    const samples: Array<{
      cursor: string | null;
      sourceVisible: boolean;
      targetCanvasProof: boolean;
    }> = [];
    const sample = () => {
      const root = document.querySelector<HTMLElement>('[data-phone-authority-id]');
      const source = document.querySelector<HTMLElement>(
        '.portrait-scroll-spike__scene--star'
      );
      const targetSurface = document.querySelector<HTMLElement>(
        '[data-aod-reveal-surface]'
      );
      const cursor = root?.dataset.phoneCursor ?? null;
      const phase = root?.dataset.phoneTransitionPhase ?? null;
      if (
        cursor === 'transition:star-map-aod:0'
        || phase === 'verifying-target'
      ) {
        const style = source ? getComputedStyle(source) : null;
        samples.push({
          cursor,
          sourceVisible: Boolean(
            source
            && source.dataset.phoneSurfaceRole === 'transition-source'
            && style?.visibility !== 'hidden'
            && Number.parseFloat(style?.opacity ?? '0') > .01
          ),
          targetCanvasProof: Boolean(targetSurface?.dataset.aodStaticPoster)
        });
      }
      if (sampling) window.requestAnimationFrame(sample);
    };
    target.__starAodAdmissionProbe = {
      samples,
      stop() {
        sampling = false;
      }
    };
    window.requestAnimationFrame(sample);
  });
  await driveFrontRun(page, 'star-map', 'aod-animation', 1);
  await assertStablePhoneHold(page, 'aod-animation');
  const aodAdmission = await page.evaluate(() => {
    const target = window as typeof window & {
      __starAodAdmissionProbe?: {
        samples: Array<{
          cursor: string | null;
          sourceVisible: boolean;
          targetCanvasProof: boolean;
        }>;
        stop(): void;
      };
    };
    const probe = target.__starAodAdmissionProbe;
    probe?.stop();
    const transition = document.querySelector<HTMLElement>('[data-aod-transition]');
    return {
      samples: probe?.samples ?? [],
      holdProgress: transition?.dataset.portraitAodBackdropProgress ?? null
    };
  });
  expect(aodAdmission.holdProgress).toBe('0.0000');
  expect(aodAdmission.samples).not.toEqual([]);
  expect(
    aodAdmission.samples.every((sample) => (
      sample.targetCanvasProof || sample.sourceVisible
    )),
    `Star source retired before AOD's exact canvas proof: ${JSON.stringify(aodAdmission.samples)}`
  ).toBe(true);
  const aodFrame = decodePngScreenshot(await page.screenshot());
  const aodRegion = { left: .08, top: .08, right: .92, bottom: .92 } as const;
  expect(
    compositedLuminanceRange(aodFrame, aodRegion),
    'AOD hold must expose its authored packed canvas/cloud/sun content, not an empty paper endpoint'
  ).toBeGreaterThan(12);
  const inactiveRevision = Number.parseInt(
    await canvas.getAttribute('data-portrait-star-perlin-revision') ?? '0',
    10
  );
  await page.waitForTimeout(700);
  expect(
    Number.parseInt(
      await canvas.getAttribute('data-portrait-star-perlin-revision') ?? '0',
      10
    ),
    'leaving Star Map must stop its leaf-owned Perlin frame loop'
  ).toBe(inactiveRevision);
});

test('[execution regression] first AOD forward input locks the runner before the rail can advance', async ({ page }) => {
  test.setTimeout(90_000);
  await installColdPhoneRuntimeProbe(page);
  await visitFormal(page, '/', 'hero');
  await driveFrontRun(page, 'hero', 'pattern', 1);
  await driveFrontRun(page, 'pattern', 'pattern-compact', 1);
  await driveFrontRun(page, 'pattern-compact', 'star-map', 1);
  await driveFrontRun(page, 'star-map', 'aod-animation', 1);
  await assertStablePhoneHold(page, 'aod-animation');
  await waitForNewWheelEpoch(page);

  const before = await page.evaluate(() => ({
    scrollY: window.scrollY,
    aodTime: document.querySelector<HTMLVideoElement>('[data-aod-figure-video]')?.currentTime ?? null
  }));
  await inputPhoneDelta(page, 50);
  await page.evaluate(() => new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  }));
  const after = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-phone-authority-id]');
    const video = document.querySelector<HTMLVideoElement>('[data-aod-figure-video]');
    const method = document.getElementById('method');
    const style = method ? getComputedStyle(method) : null;
    const rect = method?.getBoundingClientRect();
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    return {
      cursor: root?.dataset.phoneCursor ?? null,
      input: root?.dataset.phoneInputState ?? null,
      scrollY: window.scrollY,
      aodTime: video?.currentTime ?? null,
      playbackOwner: video?.dataset.timelineVideoRun ?? null,
      methodVisible: Boolean(
        method
        && style
        && rect
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number.parseFloat(style.opacity || '1') > .01
        && rect.bottom > 0
        && rect.top < viewportHeight
      )
    };
  });

  expect(after.cursor).toBe('transition:aod-method:0');
  expect(after.input).toBe('locked');
  expect(after.playbackOwner).toMatch(/^phone-aod-forward:/);
  expect(Math.abs(after.scrollY - before.scrollY)).toBeLessThanOrEqual(2);
  expect(after.methodVisible).toBe(false);
});

test('[AOD↔Method execution cutover] completes one exact forward and reverse playback cycle', async ({ page }) => {
  test.setTimeout(150_000);
  await installColdPhoneRuntimeProbe(page);
  await visitFormal(page, '/', 'hero');
  await driveFrontRun(page, 'hero', 'pattern', 1);
  await driveFrontRun(page, 'pattern', 'pattern-compact', 1);
  await driveFrontRun(page, 'pattern-compact', 'star-map', 1);
  await driveFrontRun(page, 'star-map', 'aod-animation', 1);
  const authorityId = await (await assertStablePhoneHold(page, 'aod-animation'))
    .getAttribute('data-phone-authority-id');

  await driveAdjacentPhoneRun(page, 'aod-animation', 'method-top', 1, 70_000);
  await driveAdjacentPhoneRun(page, 'method-top', 'aod-animation', -1, 70_000);

  await expect(await assertStablePhoneHold(page, 'aod-animation'))
    .toHaveAttribute('data-phone-authority-id', authorityId!);
  const probe = await phoneRuntimeProbe(page);
  expect(probe.maxActive).toBeLessThanOrEqual(MAX_ACTIVE_PHONE_WEBGL_CONTEXTS);
});

test('[execution regression] Method landing starts Figure2 playback before the Proof boundary', async ({ page }) => {
  test.setTimeout(90_000);
  await installColdPhoneRuntimeProbe(page);
  await visitFormal(page, '/#method', 'method-top');
  await driveAdjacentPhoneRun(page, 'method-top', 'figure2-animation', 1);
  await assertStablePhoneHold(page, 'figure2-animation');
  await waitForNewWheelEpoch(page);

  const before = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-phone-authority-id]');
    const track = document.getElementById('figure2-animation');
    const video = document.querySelector<HTMLVideoElement>('[data-figure2-combined-video]');
    return {
      trackTop: track?.getBoundingClientRect().top ?? null,
      viewportHeight: window.visualViewport?.height ?? window.innerHeight,
      scrollProgress: root?.dataset.phoneScrollProgress ?? null,
      playhead: video?.currentTime ?? null
    };
  });
  await page.evaluate(() => {
    const target = window as typeof window & {
      __figure2PlayheadProbe?: {
        samples: Array<{
          time: number;
          cursor: string | null;
          progress: string | null;
          mediaRun: string | null;
          owner: string | null;
          role: string | null;
          ariaHidden: string | null;
          sourceVisible: boolean;
          timelineRun: string | null;
          timelineDirection: string | null;
          timelineProgress: string | null;
          timelineTarget: string | null;
          packedOwner: string | null;
        }>;
        stop(): void;
      };
    };
    let sampling = true;
    const samples: Array<{
      time: number;
      cursor: string | null;
      progress: string | null;
      mediaRun: string | null;
      owner: string | null;
      role: string | null;
      ariaHidden: string | null;
      sourceVisible: boolean;
      timelineRun: string | null;
      timelineDirection: string | null;
      timelineProgress: string | null;
      timelineTarget: string | null;
      packedOwner: string | null;
    }> = [];
    const sample = () => {
      const root = document.querySelector<HTMLElement>('[data-phone-authority-id]');
      const figure2 = document.querySelector<HTMLElement>('[data-r4-scene="figure2-animation"]');
      const video = document.querySelector<HTMLVideoElement>('[data-figure2-combined-video]');
      const cursor = root?.dataset.phoneCursor;
      if (
        video
        && (cursor === 'hold:figure2-animation' || cursor === 'transition:figure2-proof:0')
      ) {
        const style = figure2 ? window.getComputedStyle(figure2) : null;
        const role = figure2?.dataset.phoneSurfaceRole ?? null;
        const sourceVisible = Boolean(
          figure2
          && figure2.getAttribute('aria-hidden') !== 'true'
          && role !== 'retired'
          && style?.visibility !== 'hidden'
          && Number(style?.opacity ?? 0) > .001
        );
        const next = {
          time: Number(video.currentTime.toFixed(4)),
          cursor: cursor ?? null,
          progress: figure2?.dataset.figure2Progress ?? null,
          mediaRun: figure2?.dataset.figure2MediaRun ?? null,
          owner: figure2?.dataset.phoneFigure2MediaOwner ?? null,
          role,
          ariaHidden: figure2?.getAttribute('aria-hidden') ?? null,
          sourceVisible,
          timelineRun: video.dataset.timelineVideoRun ?? null,
          timelineDirection: video.dataset.timelineVideoDirection ?? null,
          timelineProgress: video.dataset.timelineVideoProgress ?? null,
          timelineTarget: video.dataset.timelineVideoTarget ?? null,
          packedOwner: video.dataset.phonePackedAlphaOwner ?? null
        };
        const previous = samples.at(-1);
        if (
          !previous
          || Math.abs(previous.time - next.time) > .01
          || previous.cursor !== next.cursor
          || previous.timelineRun !== next.timelineRun
          || previous.timelineTarget !== next.timelineTarget
          || previous.packedOwner !== next.packedOwner
        ) samples.push(next);
      }
      if (sampling) window.requestAnimationFrame(sample);
    };
    target.__figure2PlayheadProbe = {
      samples,
      stop() {
        sampling = false;
      }
    };
    window.requestAnimationFrame(sample);
  });
  await inputPhoneDelta(page, 50);
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-phone-authority-id]');
    const video = document.querySelector<HTMLVideoElement>('[data-figure2-combined-video]');
    return {
      cursor: root?.dataset.phoneCursor ?? null,
      scrollProgress: root?.dataset.phoneScrollProgress ?? null,
      playhead: video?.currentTime ?? null
    };
  });

  expect(before.trackTop).not.toBeNull();
  expect(before.trackTop!).toBeLessThanOrEqual(before.viewportHeight * .25);
  expect(after.cursor).toBe('hold:figure2-animation');
  expect(Number(after.scrollProgress)).toBeGreaterThan(Number(before.scrollProgress));
  expect(after.playhead).not.toBeNull();
  expect(before.playhead).not.toBeNull();
  expect(after.playhead! - before.playhead!).toBeGreaterThan(.05);
  await driveAdjacentPhoneRun(page, 'figure2-animation', 'figure2-proof', 1);
  const playheads = await page.evaluate(() => {
    const target = window as typeof window & {
      __figure2PlayheadProbe?: {
        samples: Array<{ time: number }>;
        stop(): void;
      };
    };
    const probe = target.__figure2PlayheadProbe;
    probe?.stop();
    return probe?.samples ?? [];
  });
  const visiblePlayheads = playheads.filter((sample) => sample.sourceVisible);
  expect(visiblePlayheads.some((sample) => sample.time > 1)).toBe(true);
  expect(visiblePlayheads.at(-1)?.time).toBeGreaterThanOrEqual(2.59);
  for (let index = 1; index < visiblePlayheads.length; index += 1) {
    expect(
      visiblePlayheads[index]!.time,
      JSON.stringify(playheads, null, 2)
    ).toBeGreaterThanOrEqual(visiblePlayheads[index - 1]!.time - .01);
  }
  for (const sample of playheads.filter((entry) => !entry.sourceVisible)) {
    expect(sample.ariaHidden, JSON.stringify(playheads, null, 2)).toBe('true');
    expect(
      sample.role,
      JSON.stringify(playheads, null, 2)
    ).toMatch(/^(retained-under-stage|retired)$/);
  }
});

test('[P0 Figure2 scroll] reverse jitter stays on the canonical forward half and Proof return keeps its endpoint', async ({ page }) => {
  test.setTimeout(180_000);
  await installColdPhoneRuntimeProbe(page);
  await visitFormal(page, '/', 'hero');
  await driveFrontRun(page, 'hero', 'pattern', 1);
  await driveFrontRun(page, 'pattern', 'pattern-compact', 1);
  await driveFrontRun(page, 'pattern-compact', 'star-map', 1);
  await driveFrontRun(page, 'star-map', 'aod-animation', 1);
  await driveAdjacentPhoneRun(page, 'aod-animation', 'method-top', 1, 70_000);
  await driveAdjacentPhoneRun(page, 'method-top', 'figure2-animation', 1, 70_000);
  await assertStablePhoneHold(page, 'figure2-animation');
  await waitForNewWheelEpoch(page);

  const scrollSamples: Array<{
    direction: string | null;
    generation: string | null;
    target: number | null;
    run: string | null;
  }> = [];
  for (const deltaY of [150, -2, 2]) {
    await inputPhoneDelta(page, deltaY);
    await page.waitForTimeout(100);
    scrollSamples.push(await page.evaluate(() => {
      const video = document.querySelector<HTMLVideoElement>(
        '[data-figure2-combined-video]'
      );
      const target = Number.parseFloat(video?.dataset.timelineVideoTarget ?? '');
      return {
        direction: video?.dataset.timelineVideoDirection ?? null,
        generation: video?.dataset.timelineVideoGeneration ?? null,
        target: Number.isFinite(target) ? target : null,
        run: video?.dataset.timelineVideoRun ?? null
      };
    }));
  }
  expect(scrollSamples.every((sample) => sample.direction === '1')).toBe(true);
  expect(scrollSamples.every((sample) => sample.run === 'figure2-scroll')).toBe(true);
  expect([...new Set(scrollSamples.map((sample) => sample.generation))]).toHaveLength(1);
  expect(scrollSamples.every((sample) => (
    sample.target !== null && sample.target >= 0 && sample.target < 2.6
  ))).toBe(true);

  await driveAdjacentPhoneRun(page, 'figure2-animation', 'figure2-proof', 1, 70_000);
  await page.evaluate(() => {
    const target = window as typeof window & {
      __proofFigure2EndpointProbe?: {
        samples: Array<{
          currentTime: number | null;
          cursor: string | null;
          direction: string | null;
        }>;
        stop(): void;
      };
    };
    let sampling = true;
    const samples: Array<{
      currentTime: number | null;
      cursor: string | null;
      direction: string | null;
    }> = [];
    const sample = () => {
      const root = document.querySelector<HTMLElement>('[data-phone-authority-id]');
      const video = document.querySelector<HTMLVideoElement>(
        '[data-figure2-combined-video]'
      );
      if (
        root?.dataset.phoneCursor === 'transition:figure2-proof:0'
        && root.dataset.phoneTransitionDirection === '-1'
      ) {
        samples.push({
          currentTime: video ? video.currentTime : null,
          cursor: root.dataset.phoneCursor,
          direction: root.dataset.phoneTransitionDirection
        });
      }
      if (sampling) window.requestAnimationFrame(sample);
    };
    target.__proofFigure2EndpointProbe = {
      samples,
      stop() {
        sampling = false;
      }
    };
    window.requestAnimationFrame(sample);
  });
  await driveAdjacentPhoneRun(page, 'figure2-proof', 'figure2-animation', -1, 70_000);
  const endpointSamples = await page.evaluate(() => {
    const target = window as typeof window & {
      __proofFigure2EndpointProbe?: {
        samples: Array<{
          currentTime: number | null;
          cursor: string | null;
          direction: string | null;
        }>;
        stop(): void;
      };
    };
    const probe = target.__proofFigure2EndpointProbe;
    probe?.stop();
    return probe?.samples ?? [];
  });
  expect(endpointSamples).not.toEqual([]);
  expect(
    endpointSamples.some((sample) => sample.currentTime !== null && sample.currentTime >= 2.5),
    `Proof → Figure2 must retain its packed endpoint preparation: ${JSON.stringify(endpointSamples)}`
  ).toBe(true);
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
  const figureCanvas = page.locator(
    '[data-phone-packed-alpha-canvas="hero-figure"]'
  );
  const figureParallax = page.locator('.portrait-scroll-spike__hero-figure-parallax');
  await expect(root).toHaveCount(1);
  await expect.poll(async () => page.locator(LIVE_STORY_LOADER).count()).toBe(0);
  await expect(root).toHaveAttribute('data-portrait-loader-ready', 'true');
  await expect(figureCanvas).toHaveCount(1);
  await expect.poll(async () => page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      '[data-phone-packed-alpha-canvas="hero-figure"]'
    );
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
  await installRadialFrontierProbe(page);
  await installColdPhoneRuntimeProbe(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const root = await assertStablePhoneHold(page, 'hero');
  await expect(root).toHaveAttribute('data-portrait-hero-entrance', 'complete', {
    timeout: 15_000
  });
  await waitForNewWheelEpoch(page);

  const before = decodePngScreenshot(await page.screenshot());
  // One input must initiate the whole Hero motion + Ink run. Sampling is
  // allowed to observe its compositor frame; sending another intent is not.
  await inputPhoneDelta(page, 180);
  await expect.poll(
    async () => root.getAttribute('data-phone-cursor'),
    { timeout: 2_500, message: 'one input must start Hero→Pattern' }
  ).toBe('transition:hero-pattern:0');
  const ink = page.locator(
    '[data-phone-presentation-host="route-overlay"] > canvas'
  );
  await expect.poll(async () => (
    await ink.count() === 1
    && await ink.getAttribute('data-phone-presentation-effect-frame') === 'ready'
  ), {
    timeout: 5_000,
    message: 'Hero→Pattern must expose a route-overlay ink frame during its one owned run'
  }).toBe(true);
  await expect.poll(async () => page.evaluate(() => {
    const receiver = document.querySelector<HTMLElement>(
      '.portrait-scroll-spike__scene--pattern'
    );
    const canvas = document.querySelector<HTMLCanvasElement>(
      '[data-phone-presentation-host="route-overlay"] > canvas'
    );
    const receiverRank = Number(receiver?.dataset.r4InkBoundaryRank);
    return Boolean(
      receiver?.dataset.r4InkBoundaryKind === 'radial'
      && receiver?.dataset.r4InkBoundaryRank
      && receiverRank > .01
      && receiver.style.clipPath.startsWith('polygon(')
      && canvas?.dataset.r4InkBoundaryKind === 'radial'
      && canvas.dataset.r4InkBoundaryRank === receiver.dataset.r4InkBoundaryRank
    );
  }), {
    timeout: 5_000,
    message: 'the Pattern DOM mask and route ink field must expose one shared radial boundary rank'
  }).toBe(true);
  const routeHostEvidence = await page.evaluate(() => {
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
  const transitionFrame = decodePngScreenshot(await page.screenshot());

  expect(routeHostEvidence).toEqual({
    directRouteChild: true,
    routeCoversContent: true
  });
  expect(
    compositedPixelDelta(before, transitionFrame, {
      left: .04,
      top: .04,
      right: .96,
      bottom: .96
    }),
    'route-overlay ink must alter final compositor pixels above its endpoints'
  ).toBeGreaterThan(.005);

  await assertStablePhoneHold(page, 'pattern', { timeout: 15_000 });
  const radialFrontierProbe = await page.evaluate(() => {
    const target = window as typeof window & {
      __r5RadialFrontierProbe?: RadialFrontierProbe;
    };
    return target.__r5RadialFrontierProbe ?? { closest: [] };
  });
  assertRadialFrontierAlphaEvidence(radialFrontierProbe);
});
