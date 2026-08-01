import { expect, type Page } from '@playwright/test';
import { PNG } from 'pngjs';

export type PhonePixelPoint = Readonly<{ x: number; y: number }>;
export type PhonePixelColor = readonly [red: number, green: number, blue: number];
export type PhonePlaneRole = 'source' | 'effect' | 'receiver';
export type PhoneIntermediateFramePolicy = Readonly<{
  tolerance?: number;
  checkEndpoints?: boolean;
}>;

function parsedDiagnostic(value: string | null, label: string): number {
  const parsed = value === null ? Number.NaN : Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Missing or invalid ${label}: ${String(value)}`);
  }
  return parsed;
}

export async function assertSinglePhoneAuthority(page: Page): Promise<void> {
  const shells = page.locator('.phone-story');
  await expect(shells).toHaveCount(1);
  const authority = await shells.getAttribute('data-phone-authority');
  expect(authority?.trim(), 'clean harness authority identity').toBeTruthy();
  await expect(page.locator(`.phone-story[data-phone-authority="${authority}"]`)).toHaveCount(1);
}

export async function readPlaneRevision(page: Page): Promise<number> {
  return parsedDiagnostic(
    await page.locator('.phone-story').getAttribute('data-phone-plane-revision'),
    'phone plane revision'
  );
}

export async function readCommitSequence(page: Page): Promise<number> {
  return parsedDiagnostic(
    await page.locator('.phone-story').getAttribute('data-phone-commit-sequence'),
    'phone commit sequence'
  );
}

export async function assertLayerOrderAtPoints(
  page: Page,
  points: readonly PhonePixelPoint[],
  expectedRoles: readonly PhonePlaneRole[]
): Promise<void> {
  const stacks = await page.evaluate((samples) => samples.map(({ x, y }) => {
    const planes = [...document.querySelectorAll<HTMLElement>('[data-phone-plane]')];
    const pointerEvents = planes.map((plane) => ({
      plane,
      value: plane.style.getPropertyValue('pointer-events'),
      priority: plane.style.getPropertyPriority('pointer-events')
    }));
    for (const plane of planes) plane.style.setProperty('pointer-events', 'auto', 'important');
    const roles: string[] = [];
    try {
      for (const element of document.elementsFromPoint(x, y)) {
        const plane = element.closest<HTMLElement>('[data-phone-plane]');
        const role = plane?.dataset.phonePlane;
        if (role && !roles.includes(role)) roles.push(role);
      }
    } finally {
      for (const saved of pointerEvents) {
        if (saved.value) saved.plane.style.setProperty(
          'pointer-events', saved.value, saved.priority
        );
        else saved.plane.style.removeProperty('pointer-events');
      }
    }
    return roles;
  }), points);
  for (let index = 0; index < points.length; index += 1) {
    expect(stacks[index], `phone plane stack at ${JSON.stringify(points[index])}`)
      .toEqual(expectedRoles);
  }
}

function edgePoints(width: number, height: number): readonly PhonePixelPoint[] {
  return [
    { x: 2, y: 2 }, { x: width - 2, y: 2 },
    { x: 2, y: height - 2 }, { x: width - 2, y: height - 2 },
    { x: width / 2, y: 1 }, { x: width / 2, y: height - 1 },
    { x: 1, y: height / 2 }, { x: width - 1, y: height / 2 },
    { x: width / 2, y: height }, { x: width, y: height / 2 },
    { x: width - 1, y: height * 0.75 }, { x: width * 0.75, y: height - 1 }
  ];
}

function framePoints(width: number, height: number): readonly PhonePixelPoint[] {
  return [...edgePoints(width, height), { x: width / 2, y: height / 2 }];
}

function pixelAt(
  png: PNG,
  cssWidth: number,
  cssHeight: number,
  point: PhonePixelPoint
): readonly [number, number, number, number] {
  const x = Math.max(0, Math.min(
    png.width - 1,
    Math.floor(point.x / cssWidth * png.width)
  ));
  const y = Math.max(0, Math.min(
    png.height - 1,
    Math.floor(point.y / cssHeight * png.height)
  ));
  const offset = (y * png.width + x) * 4;
  return [png.data[offset] ?? 0, png.data[offset + 1] ?? 0,
    png.data[offset + 2] ?? 0, png.data[offset + 3] ?? 0];
}

function withinColor(
  actual: readonly number[],
  expected: PhonePixelColor,
  tolerance: number
): boolean {
  return actual[3] === 255 && expected.every((channel, index) => (
    Math.abs((actual[index] ?? 0) - channel) <= tolerance
  ));
}

function pixelTolerance(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 32) {
    throw new Error(`Pixel tolerance must be an integer from 0 through 32; received ${value}`);
  }
  return value;
}

export async function assertOpaqueViewportEdges(
  page: Page,
  expectedColor: PhonePixelColor,
  tolerance: number
): Promise<void> {
  const acceptedTolerance = pixelTolerance(tolerance);
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('Opaque viewport assertion requires a fixed viewport');
  const png = PNG.sync.read(await page.screenshot());
  for (const point of edgePoints(viewport.width, viewport.height)) {
    const actual = pixelAt(png, viewport.width, viewport.height, point);
    if (!withinColor(actual, expectedColor, acceptedTolerance)) {
      throw new Error(
        `Opaque viewport edge mismatch at (${point.x}, ${point.y}): `
        + `expected ${expectedColor.join(',')} ±${acceptedTolerance}, received ${actual.join(',')}`
      );
    }
  }
}

export async function assertNoWhiteOrTransparentViewportEdges(page: Page): Promise<void> {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('Viewport edge assertion requires a fixed viewport');
  const png = PNG.sync.read(await page.screenshot());
  for (const point of edgePoints(viewport.width, viewport.height)) {
    const actual = pixelAt(png, viewport.width, viewport.height, point);
    const white = actual[0] >= 250 && actual[1] >= 250 && actual[2] >= 250;
    if (actual[3] !== 255 || white) {
      throw new Error(
        `Pattern viewport exposure at (${point.x}, ${point.y}): ${actual.join(',')}`
      );
    }
  }
}

export async function assertTargetContentVisible(
  page: Page,
  selectors: readonly string[]
): Promise<void> {
  const failures = await page.evaluate((required) => required.flatMap((selector) => {
    const root = document.querySelector<HTMLElement>('.phone-story');
    const element = root?.querySelector<HTMLElement>(selector);
    if (!element) return [`${selector}:missing`];
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const browserVisible = element.checkVisibility({
      checkOpacity: true,
      checkVisibilityCSS: true,
      contentVisibilityAuto: true
    });
    const visible = rect.width > 0 && rect.height > 0
      && rect.right > 0 && rect.bottom > 0
      && rect.left < window.innerWidth && rect.top < window.innerHeight
      && browserVisible
      && style.display !== 'none' && style.visibility === 'visible'
      && Number.parseFloat(style.opacity || '1') > 0;
    return visible ? [] : [`${selector}:not-visible`];
  }), selectors);
  expect(failures, 'required clean target content').toEqual([]);
}

export async function assertCompositeTargetContentVisible(
  page: Page,
  selectors: readonly string[]
): Promise<void> {
  const result = await page.evaluate((required) => {
    const root = document.querySelector<HTMLElement>('.phone-story');
    const failures: string[] = [];
    let visiblyParticipating = 0;
    for (const selector of required) {
      const element = root?.querySelector<HTMLElement>(selector);
      if (!element) {
        failures.push(`${selector}:missing`);
        continue;
      }
      const rect = element.getBoundingClientRect();
      const intersects = rect.width > 0 && rect.height > 0
        && rect.right > 0 && rect.bottom > 0
        && rect.left < window.innerWidth && rect.top < window.innerHeight;
      let ancestorsVisible = true;
      for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        if (style.display === 'none' || style.visibility !== 'visible'
          || Number.parseFloat(style.opacity || '1') <= 0) {
          ancestorsVisible = false;
          break;
        }
        if (ancestor === root) break;
      }
      if (!intersects || !ancestorsVisible) {
        failures.push(`${selector}:not-presented`);
        continue;
      }
      const style = getComputedStyle(element);
      if (element.checkVisibility({
        checkOpacity: true,
        checkVisibilityCSS: true,
        contentVisibilityAuto: true
      }) && style.display !== 'none' && style.visibility === 'visible'
        && Number.parseFloat(style.opacity || '1') > 0) {
        visiblyParticipating += 1;
      }
    }
    return { failures, visiblyParticipating };
  }, selectors);
  expect(result.failures, 'required authored compositor surfaces').toEqual([]);
  expect(result.visiblyParticipating, 'visible authored compositor layer').toBeGreaterThan(0);
}

export async function assertNoIntermediateWhiteOrBlackFrame(
  frameSeries: readonly Buffer[],
  policy: PhoneIntermediateFramePolicy
): Promise<void> {
  const tolerance = pixelTolerance(policy.tolerance ?? 3);
  const start = policy.checkEndpoints ? 0 : 1;
  const end = policy.checkEndpoints ? frameSeries.length : Math.max(1, frameSeries.length - 1);
  for (let index = start; index < end; index += 1) {
    const png = PNG.sync.read(frameSeries[index]);
    const samples = framePoints(png.width, png.height).map((point) => (
      pixelAt(png, png.width, png.height, point)
    ));
    const black = samples.every(([red, green, blue, alpha]) => (
      alpha === 255 && red <= tolerance && green <= tolerance && blue <= tolerance
    ));
    const white = samples.every(([red, green, blue, alpha]) => (
      alpha === 255 && red >= 255 - tolerance
      && green >= 255 - tolerance && blue >= 255 - tolerance
    ));
    if (black || white) {
      throw new Error(`Intermediate frame ${index} is ${black ? 'black' : 'white'}`);
    }
  }
}

export async function waitForCommitSequence(
  page: Page,
  sceneId: string,
  afterSequence: number
): Promise<number> {
  await page.waitForFunction(({ scene, after }) => {
    const shell = document.querySelector<HTMLElement>('.phone-story');
    const sequence = Number.parseInt(shell?.dataset.phoneCommitSequence ?? '', 10);
    return shell?.dataset.phoneScene === scene && sequence > after;
  }, { scene: sceneId, after: afterSequence });
  return readCommitSequence(page);
}
