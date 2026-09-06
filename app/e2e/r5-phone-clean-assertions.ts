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
  await expect.poll(() => shells.evaluateAll((nodes) => {
    const authorities = nodes.map((node) => (
      (node as HTMLElement).dataset.phoneAuthority?.trim() ?? ''
    )).filter(Boolean);
    return {
      shells: nodes.length,
      authorities: authorities.length,
      distinctAuthorities: new Set(authorities).size
    };
  }), { message: 'one clean route-local authority' }).toEqual({
    shells: 1,
    authorities: 1,
    distinctAuthorities: 1
  });
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
    // WebKit's PNG capture can quantize a fully composited animated Canvas
    // edge to 254. Real gaps remain far below this one-step encoding variance.
    if (actual[3] < 254 || white) {
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
    const candidates = selector.startsWith('#')
      ? (() => {
        const match = selector.match(/^#([A-Za-z0-9_-]+)([\s\S]*)$/);
        return match
          ? [selector, `#${match[1]}-reading${match[2]}`]
          : [selector, `${selector}-reading`];
      })()
      : [selector];
    const visible = candidates.flatMap((candidate) => root
      ? [...root.querySelectorAll<HTMLElement>(candidate)] : []).some((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0
        && rect.right > 0 && rect.bottom > 0
        && rect.left < window.innerWidth && rect.top < window.innerHeight
        && element.checkVisibility({
          checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true
        })
        && style.display !== 'none' && style.visibility === 'visible'
        && Number.parseFloat(style.opacity || '1') > 0;
    });
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
      const candidateSelectors = selector.startsWith('#')
        ? (() => {
          const match = selector.match(/^#([A-Za-z0-9_-]+)([\s\S]*)$/);
          return match
            ? [selector, `#${match[1]}-reading${match[2]}`]
            : [selector, `${selector}-reading`];
        })()
        : [selector];
      const elements = candidateSelectors.flatMap((candidate) => root
        ? [...root.querySelectorAll<HTMLElement>(candidate)] : []);
      if (elements.length === 0) {
        failures.push(`${selector}:missing`);
        continue;
      }
      const presented = elements.find((element) => {
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
        return intersects && ancestorsVisible;
      });
      if (!presented) {
        failures.push(`${selector}:not-presented`);
        continue;
      }
      const style = getComputedStyle(presented);
      if (presented.checkVisibility({
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

/**
 * Proves that a live Ink canvas changes the composited pixels, not merely that
 * React attached a canvas element. The helper is intentionally test-only: it
 * briefly hides the already-rendered effect and compares the same viewport.
 */
export async function assertInkIntermediateCompositeContribution(
  page: Page,
  selector: string,
  expectedEffectZIndex?: '20' | '70'
): Promise<void> {
  const restoreAnimationFrames = async () => page.evaluate(() => {
    const owner = window as typeof window & {
      __r5InkCompositeFrameFreeze?: {
        requestAnimationFrame: typeof window.requestAnimationFrame;
        cancelAnimationFrame: typeof window.cancelAnimationFrame;
        queued: Map<number, FrameRequestCallback>;
      };
    };
    const freeze = owner.__r5InkCompositeFrameFreeze;
    if (!freeze) return;
    window.requestAnimationFrame = freeze.requestAnimationFrame;
    window.cancelAnimationFrame = freeze.cancelAnimationFrame;
    delete owner.__r5InkCompositeFrameFreeze;
    for (const callback of freeze.queued.values()) freeze.requestAnimationFrame(callback);
  });
  let frozen = false;
  for (let attempt = 0; attempt < 1_000 && !frozen; attempt += 1) {
    frozen = await page.evaluate((inkSelector) => {
      const element = document.querySelector<HTMLElement>(inkSelector);
      const progress = Number(element?.dataset.r4InkBoundaryProgress);
      if (!element || !Number.isFinite(progress) || progress < .2 || progress > .8) {
        return false;
      }
      const owner = window as typeof window & {
        __r5InkCompositeFrameFreeze?: {
          requestAnimationFrame: typeof window.requestAnimationFrame;
          cancelAnimationFrame: typeof window.cancelAnimationFrame;
          queued: Map<number, FrameRequestCallback>;
          nextId: number;
        };
      };
      if (owner.__r5InkCompositeFrameFreeze) return true;
      const requestAnimationFrame = window.requestAnimationFrame.bind(window);
      const cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
      const queued = new Map<number, FrameRequestCallback>();
      const nextId = -1;
      owner.__r5InkCompositeFrameFreeze = {
        requestAnimationFrame, cancelAnimationFrame, queued, nextId
      };
      window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
        const id = owner.__r5InkCompositeFrameFreeze!.nextId--;
        owner.__r5InkCompositeFrameFreeze!.queued.set(id, callback);
        return id;
      }) as typeof window.requestAnimationFrame;
      window.cancelAnimationFrame = ((id: number) => {
        if (!owner.__r5InkCompositeFrameFreeze!.queued.delete(id)) cancelAnimationFrame(id);
      }) as typeof window.cancelAnimationFrame;
      return true;
    }, selector);
    if (!frozen) await page.waitForTimeout(10);
  }
  if (!frozen) throw new Error(`Ink canvas did not reach an intermediate frame: ${selector}`);
  const handle = await page.$(selector);
  if (!handle) {
    await restoreAnimationFrames();
    throw new Error(`Live Ink canvas disappeared before composite proof: ${selector}`);
  }
  if (expectedEffectZIndex) {
    const actualEffectZIndex = await handle.evaluate((element) => {
      const plane = element.closest<HTMLElement>('[data-phone-plane="effect"]');
      return plane ? getComputedStyle(plane).zIndex : null;
    });
    if (actualEffectZIndex !== expectedEffectZIndex) {
      await restoreAnimationFrames();
      await handle.dispose();
      throw new Error(
        `Live Ink effect z-index ${String(actualEffectZIndex)} did not match ${expectedEffectZIndex}`
      );
    }
  }
  const withInk = PNG.sync.read(await page.screenshot());
  const saved = await handle.evaluate((element) => {
    const style = element.style;
    const properties = ['visibility', 'opacity', 'display'] as const;
    const snapshot = properties.map((property) => ({
      property,
      value: style.getPropertyValue(property),
      priority: style.getPropertyPriority(property)
    }));
    style.setProperty('visibility', 'hidden', 'important');
    style.setProperty('display', 'none', 'important');
    return snapshot;
  });
  try {
    await page.evaluate(() => document.documentElement.offsetHeight);
    await page.waitForTimeout(50);
    const withoutInk = PNG.sync.read(await page.screenshot());
    const pixels = Math.min(withInk.width * withInk.height, withoutInk.width * withoutInk.height);
    let changed = 0;
    for (let index = 0; index < pixels; index += 1) {
      const offset = index * 4;
      const distance = Math.abs((withInk.data[offset] ?? 0) - (withoutInk.data[offset] ?? 0))
        + Math.abs((withInk.data[offset + 1] ?? 0) - (withoutInk.data[offset + 1] ?? 0))
        + Math.abs((withInk.data[offset + 2] ?? 0) - (withoutInk.data[offset + 2] ?? 0));
      if (distance >= 36) changed += 1;
    }
    const minimum = Math.max(96, Math.floor(pixels * 0.001));
    if (changed < minimum) {
      throw new Error(
        `Live Ink did not contribute enough composite pixels: ${changed} changed, expected at least ${minimum}`
      );
    }
  } finally {
    await handle.evaluate((element, snapshot) => {
      for (const { property, value, priority } of snapshot) {
        if (value) element.style.setProperty(property, value, priority);
        else element.style.removeProperty(property);
      }
    }, saved);
    await restoreAnimationFrames();
    await handle.dispose();
  }
}

export async function readPhoneStoryDiagnostic(page: Page): Promise<Readonly<{
  url: string;
  shell: Readonly<Record<string, string>> | null;
  loader: Readonly<Record<string, string>> | null;
  activation: Readonly<Record<string, string>> | null;
  media: readonly Readonly<Record<string, unknown>>[];
  canvases: readonly Readonly<Record<string, unknown>>[];
  images: readonly Readonly<Record<string, unknown>>[];
}>> {
  return page.evaluate(() => {
    const describe = (element: HTMLElement | null) => element
      ? Object.freeze({ ...element.dataset })
      : null;
    const media = [...document.querySelectorAll<HTMLVideoElement>('.phone-story video')]
      .map((video) => ({
        dataset: { ...video.dataset },
        currentTime: video.currentTime,
        duration: video.duration,
        readyState: video.readyState,
        paused: video.paused,
        seeking: video.seeking,
        networkState: video.networkState,
        error: video.error?.code ?? null
      }));
    const canvases = [...document.querySelectorAll<HTMLCanvasElement>('.phone-story canvas')]
      .map((canvas) => ({
        dataset: { ...canvas.dataset },
        width: canvas.width,
        height: canvas.height,
        rect: (() => {
          const bounds = canvas.getBoundingClientRect();
          return [bounds.left, bounds.top, bounds.right, bounds.bottom];
        })()
      }));
    const images = [...document.querySelectorAll<HTMLImageElement>('.phone-story img')]
      .map((image) => ({
        dataset: { ...image.dataset },
        src: image.currentSrc || image.src,
        complete: image.complete,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        rect: (() => {
          const bounds = image.getBoundingClientRect();
          return [bounds.left, bounds.top, bounds.right, bounds.bottom];
        })(),
        style: (() => {
          const computed = getComputedStyle(image);
          return {
            display: computed.display,
            visibility: computed.visibility,
            opacity: computed.opacity,
            zIndex: computed.zIndex
          };
        })()
      }));
    return {
      url: location.href,
      shell: describe(document.querySelector<HTMLElement>('.phone-story')),
      loader: describe(document.querySelector<HTMLElement>('[data-story-loader="true"]')),
      activation: describe(document.querySelector<HTMLElement>('[data-phone-activation]:not([hidden])')),
      media,
      canvases,
      images
    };
  });
}

export type Figure3MediaDiagnosticEvent = Readonly<{
  time: number;
  kind: string;
  detail: Readonly<Record<string, unknown>>;
  video: Readonly<{
    currentSrc: string | null;
    src: string | null;
    readyState: number | null;
    networkState: number | null;
    currentTime: number | null;
    seeking: boolean | null;
    paused: boolean | null;
    duration: number | null;
    errorCode: number | null;
    timeline: Readonly<Record<string, string>>;
  }> | null;
  figure3: Readonly<Record<string, string>> | null;
  shell: Readonly<Record<string, string>> | null;
  canvas: Readonly<Record<string, string>> | null;
}>;

export type Figure3MediaDiagnostic = Readonly<{
  marks: readonly Readonly<{
    label: string;
    time: number;
    eventIndex: number;
  }>[];
  events: readonly Figure3MediaDiagnosticEvent[];
}>;

/**
 * Install a test-only recorder for the Figure3 media lifecycle. It patches
 * browser prototypes in the page init script, so the formal activation's
 * play/seek/RVFC order is observed before application code runs.
 */
export async function startFigure3MediaDiagnostic(page: Page): Promise<{
  mark(label: string): Promise<void>;
  stop(): Promise<Figure3MediaDiagnostic>;
}> {
  await page.addInitScript(() => {
    type Recorder = {
      marks: Array<{ label: string; time: number; eventIndex: number }>;
      events: Figure3MediaDiagnosticEvent[];
      interval: number;
      observer: MutationObserver | null;
    };
    const owner = window as typeof window & {
      __r5Figure3MediaDiagnostic?: Recorder;
    };
    if (owner.__r5Figure3MediaDiagnostic) return;

    const recorder: Recorder = { marks: [], events: [], interval: 0, observer: null };
    owner.__r5Figure3MediaDiagnostic = recorder;
    const isFigure3Video = (target: EventTarget | null): target is HTMLVideoElement => {
      if (!(target instanceof HTMLVideoElement)) return false;
      return target.dataset.mediaKey === 'figure3-motion'
        || Boolean(target.closest('.phone-figure3'));
    };
    const errorText = (error: unknown): string => error instanceof Error
      ? `${error.name}: ${error.message}` : String(error);
    const videoSnapshot = (video: HTMLVideoElement | null) => {
      if (!video) return null;
      const figure3 = video.closest<HTMLElement>('.phone-figure3');
      const shell = video.closest<HTMLElement>('.phone-story');
      const canvas = figure3?.querySelector<HTMLElement>(
        '[data-phone-figure3-paper-canvas]'
      ) ?? null;
      const timeline = Object.fromEntries(Object.entries(video.dataset).filter(([key]) => (
        key.startsWith('timelineVideo')
      )));
      return {
        currentSrc: video.currentSrc || null,
        src: video.currentSrc || video.querySelector('source')?.src || null,
        readyState: video.readyState,
        networkState: video.networkState,
        currentTime: video.currentTime,
        seeking: video.seeking,
        paused: video.paused,
        duration: video.duration,
        errorCode: video.error?.code ?? null,
        timeline,
        figure3: figure3 ? { ...figure3.dataset } : null,
        shell: shell ? { ...shell.dataset } : null,
        canvas: canvas ? { ...canvas.dataset } : null
      };
    };
    const record = (
      kind: string,
      video: HTMLVideoElement,
      detail: Readonly<Record<string, unknown>> = {}
    ) => {
      if (recorder.events.length >= 5000) return;
      const snapshot = videoSnapshot(video);
      if (!snapshot) return;
      recorder.events.push({
        time: Number(performance.now().toFixed(3)), kind, detail: { ...detail },
        video: {
          currentSrc: snapshot.currentSrc,
          src: snapshot.src,
          readyState: snapshot.readyState,
          networkState: snapshot.networkState,
          currentTime: snapshot.currentTime,
          seeking: snapshot.seeking,
          paused: snapshot.paused,
          duration: snapshot.duration,
          errorCode: snapshot.errorCode,
          timeline: snapshot.timeline
        },
        figure3: snapshot.figure3,
        shell: snapshot.shell,
        canvas: snapshot.canvas
      });
    };
    const findFigure3Video = (): HTMLVideoElement | null => (
      document.querySelector<HTMLVideoElement>('.phone-figure3 video')
    );

    const originalPlay = HTMLMediaElement.prototype.play;
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true, writable: true,
      value: function patchedPlay(this: HTMLMediaElement) {
        const watched = isFigure3Video(this);
        if (watched) record('play-call', this);
        let result: Promise<void> | undefined;
        try {
          result = originalPlay.call(this);
        } catch (error) {
          if (watched) record('play-throw', this, { error: errorText(error) });
          throw error;
        }
        if (watched && result && typeof result.then === 'function') {
          result.then(
            () => record('play-fulfilled', this),
            (error: unknown) => record('play-rejected', this, { error: errorText(error) })
          );
        }
        return result;
      }
    });
    const originalPause = HTMLMediaElement.prototype.pause;
    Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
      configurable: true, writable: true,
      value: function patchedPause(this: HTMLMediaElement) {
        if (isFigure3Video(this)) record('pause-call', this);
        return originalPause.call(this);
      }
    });
    const originalLoad = HTMLMediaElement.prototype.load;
    Object.defineProperty(HTMLMediaElement.prototype, 'load', {
      configurable: true, writable: true,
      value: function patchedLoad(this: HTMLMediaElement) {
        if (isFigure3Video(this)) record('load-call', this);
        return originalLoad.call(this);
      }
    });

    let installingDiagnosticListener = false;
    const originalAddEventListener = EventTarget.prototype.addEventListener;
    Object.defineProperty(EventTarget.prototype, 'addEventListener', {
      configurable: true, writable: true,
      value: function patchedAddEventListener(
        this: EventTarget,
        type: string,
        listener: EventListenerOrEventListenerObject | null,
        options?: boolean | AddEventListenerOptions
      ) {
        if (type === 'seeked' && isFigure3Video(this)) {
          record('seeked-register', this, {
            source: installingDiagnosticListener ? 'diagnostic' : 'application'
          });
        }
        return originalAddEventListener.call(this, type, listener, options);
      }
    });
    const originalRemoveEventListener = EventTarget.prototype.removeEventListener;
    Object.defineProperty(EventTarget.prototype, 'removeEventListener', {
      configurable: true, writable: true,
      value: function patchedRemoveEventListener(
        this: EventTarget,
        type: string,
        listener: EventListenerOrEventListenerObject | null,
        options?: boolean | EventListenerOptions
      ) {
        if (type === 'seeked' && isFigure3Video(this)) {
          record('seeked-unregister', this, { source: 'application' });
        }
        return originalRemoveEventListener.call(this, type, listener, options);
      }
    });

    const originalRequest = HTMLVideoElement.prototype.requestVideoFrameCallback;
    if (typeof originalRequest === 'function') {
      Object.defineProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback', {
        configurable: true, writable: true,
        value: function patchedRequest(
          this: HTMLVideoElement,
          callback: VideoFrameRequestCallback
        ) {
          const handle = originalRequest.call(this, (now, metadata) => {
            record('rvfc-callback', this, {
              now, mediaTime: metadata.mediaTime,
              presentedFrames: metadata.presentedFrames,
              expectedDisplayTime: metadata.expectedDisplayTime,
              width: metadata.width, height: metadata.height
            });
            return callback(now, metadata);
          });
          if (isFigure3Video(this)) record('rvfc-register', this, { handle });
          return handle;
        }
      });
    }
    const originalCancel = HTMLVideoElement.prototype.cancelVideoFrameCallback;
    if (typeof originalCancel === 'function') {
      Object.defineProperty(HTMLVideoElement.prototype, 'cancelVideoFrameCallback', {
        configurable: true, writable: true,
        value: function patchedCancel(this: HTMLVideoElement, handle: number) {
          if (isFigure3Video(this)) record('rvfc-cancel', this, { handle });
          return originalCancel.call(this, handle);
        }
      });
    }

    const watchedVideos = new WeakSet<HTMLVideoElement>();
    const eventTypes = [
      'loadedmetadata', 'loadeddata', 'canplay', 'playing', 'pause', 'seeking',
      'seeked', 'waiting', 'stalled', 'durationchange', 'emptied', 'error'
    ];
    const attachEventRecorder = (video: HTMLVideoElement) => {
      if (watchedVideos.has(video)) return;
      watchedVideos.add(video);
      installingDiagnosticListener = true;
      for (const type of eventTypes) {
        video.addEventListener(type, () => record(`${type}-callback`, video), true);
      }
      installingDiagnosticListener = false;
    };
    const scan = () => {
      document.querySelectorAll<HTMLVideoElement>('.phone-figure3 video')
        .forEach(attachEventRecorder);
    };
    recorder.observer = new MutationObserver(scan);
    recorder.observer.observe(document, { childList: true, subtree: true });
    scan();
    recorder.interval = window.setInterval(() => {
      const video = findFigure3Video();
      if (video) record('sample', video);
    }, 50);
  });

  let stopped = false;
  let final: Figure3MediaDiagnostic | null = null;
  return {
    mark: async (label: string) => {
      if (stopped) return;
      await page.evaluate((nextLabel) => {
        const owner = window as typeof window & {
          __r5Figure3MediaDiagnostic?: {
            marks: Array<{ label: string; time: number; eventIndex: number }>;
            events: unknown[];
          };
        };
        const recorder = owner.__r5Figure3MediaDiagnostic;
        if (!recorder) return;
        recorder.marks.push({
          label: nextLabel,
          time: Number(performance.now().toFixed(3)),
          eventIndex: recorder.events.length
        });
      }, label);
    },
    stop: async () => {
      if (final) return final;
      stopped = true;
      final = await page.evaluate(() => {
        const owner = window as typeof window & {
          __r5Figure3MediaDiagnostic?: {
            marks: Array<{ label: string; time: number; eventIndex: number }>;
            events: Figure3MediaDiagnosticEvent[];
            interval: number;
            observer: MutationObserver | null;
          };
        };
        const recorder = owner.__r5Figure3MediaDiagnostic;
        if (!recorder) return { marks: [], events: [] };
        window.clearInterval(recorder.interval);
        recorder.observer?.disconnect();
        const result = { marks: recorder.marks, events: recorder.events };
        delete owner.__r5Figure3MediaDiagnostic;
        return result;
      });
      return final;
    }
  };
}

export type PhoneStoryFrameSample = Readonly<{
  time: number;
  shell: Readonly<Record<string, string>> | null;
  exposedBuffers: readonly string[];
  transitionLive: boolean;
  sourceSceneText: string | null;
  receiverSceneText: string | null;
  scrollTop: number;
  nativeReadingRect: readonly [number, number, number, number] | null;
  sourceMirrorRect: readonly [number, number, number, number] | null;
  sourceMirrorScrollY: string | null;
  effectProgress: number | null;
  contactProgress: number | null;
  craneProgress: number | null;
  craneClock: string | null;
  proofSurface: Readonly<{
    role: string | null;
    maskImage: string;
    maskSize: string;
    maskPosition: string;
    maskRun: string | null;
    maskPolarity: string | null;
    maskProgress: number | null;
  }> | null;
  figure2Surface: Readonly<{
    role: string | null;
    maskImage: string;
    maskSize: string;
    maskPosition: string;
    maskRun: string | null;
    maskPolarity: string | null;
    maskProgress: number | null;
  }> | null;
  proofClosing: Readonly<{
    text: string;
    rect: readonly [number, number, number, number];
  }> | null;
  figure2Arch: Readonly<{
    blur: string;
    scale: string;
    brightness: string;
    rect: readonly [number, number, number, number];
  }> | null;
  figure3: Readonly<{
    initialSurface: string | null;
    mediaState: string | null;
    proofLineage: string | null;
    posterVisible: boolean;
    canvasVisible: boolean;
  }> | null;
  planes: readonly Readonly<{
    role: string;
    visible: boolean;
    rect: readonly [number, number, number, number];
    opacity: number;
    clipPath: string;
    maskImage: string;
    maskSize: string;
    maskPosition: string;
    maskRepeat: string;
    maskMode: string;
  }>[];
  media: readonly Readonly<{
    surfaceId: string | null;
    currentTime: number;
    paused: boolean;
    seeking: boolean;
    readyState: number;
  }>[];
  canvases: readonly Readonly<{
    surfaceId: string | null;
    mediaTime: number | null;
    frame: number | null;
    generation: number | null;
    opacity: number;
    alphaStatus: string | null;
    admittedGeneration: number | null;
  }>[];
}>;

/**
 * Install one requestAnimationFrame diagnostic recorder before an input edge.
 * The returned stop function preserves the exact native/fixed-plane and media
 * sequence instead of sampling only the eventual committed scene.
 */
export async function recordPhoneStoryFrames(
  page: Page
): Promise<() => Promise<readonly PhoneStoryFrameSample[]>> {
  await page.evaluate(() => {
    type Recorder = {
      animationFrame: number;
      samples: PhoneStoryFrameSample[];
    };
    const owner = window as typeof window & { __r5PhoneFrameRecorder?: Recorder };
    if (owner.__r5PhoneFrameRecorder) {
      cancelAnimationFrame(owner.__r5PhoneFrameRecorder.animationFrame);
    }
    const rect = (element: Element | null): readonly [number, number, number, number] | null => {
      if (!element) return null;
      const bounds = element.getBoundingClientRect();
      return [bounds.left, bounds.top, bounds.right, bounds.bottom];
    };
    const visible = (element: HTMLElement): boolean => {
      const bounds = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return bounds.width > 0 && bounds.height > 0
        && bounds.right > 0 && bounds.bottom > 0
        && bounds.left < innerWidth && bounds.top < innerHeight
        && style.display !== 'none' && style.visibility === 'visible'
        && Number.parseFloat(style.opacity || '1') > 0;
    };
    const sceneText = (role: 'source' | 'receiver'): string | null => {
      const plane = document.querySelector<HTMLElement>(
        `[data-phone-plane="${role}"]`
      );
      const scene = plane?.querySelector<HTMLElement>(
        '[data-r4-scene], [data-phone-scene-leaf]'
      );
      const text = scene?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      return text ? text.slice(0, 240) : null;
    };
    const recorder: Recorder = { animationFrame: 0, samples: [] };
    const sample = (time: number) => {
      const shell = document.querySelector<HTMLElement>('.phone-story');
      const nativeReading = shell?.querySelector<HTMLElement>(
        '.phone-story__reading-flow [data-phone-input-owner="native-document"]'
      ) ?? null;
      const sourceMirror = shell?.querySelector<HTMLElement>(
        '[data-phone-plane="source"] [data-phone-native-mirror]'
      ) ?? null;
      const figure3 = document.querySelector<HTMLElement>('.phone-figure3');
      const figure3Poster = figure3?.querySelector<HTMLElement>(
        '[data-phone-figure3-paper-poster]'
      ) ?? null;
      const figure3Canvas = figure3?.querySelector<HTMLElement>(
        '[data-phone-figure3-paper-canvas]'
      ) ?? null;
      const activeInk = shell?.querySelector<HTMLElement>(
        '[data-phone-plane="effect"] [data-r4-ink-boundary-progress]'
      ) ?? null;
      const contact = shell?.querySelector<HTMLElement>(
        '[data-phone-plane="receiver"] [data-r4-scene="contact"]'
      ) ?? null;
      const crane = shell?.querySelector<HTMLElement>(
        '[data-r4-scene="crane-animation"]'
      ) ?? null;
      const proofSurface = shell?.querySelector<HTMLElement>(
        '[data-phone-plane][data-r4-depth-mask-polarity="reveal"]'
      ) ?? null;
      const figure2Surface = shell?.querySelector<HTMLElement>(
        '[data-phone-plane][data-r4-depth-mask-polarity="conceal"]'
      ) ?? null;
      const proofClosing = shell?.dataset.phoneReading === 'enabled'
        ? shell.querySelector<HTMLElement>(
            '.phone-story__reading-flow [data-r4-proof-panel="closing"] .r4-proof-closing__copy'
          )
        : shell?.querySelector<HTMLElement>(
            '[data-phone-plane="source"] [data-r4-proof-panel="closing"] .r4-proof-closing__copy'
          ) ?? null;
      const figure2Arch = shell?.querySelector<HTMLElement>(
        '[data-stage-retained-figure2-arch="true"]'
      ) ?? null;
      recorder.samples.push({
        time,
        shell: shell ? { ...shell.dataset } : null,
        exposedBuffers: [...document.querySelectorAll<HTMLElement>(
          '[data-phone-plane][data-phone-exposed="true"]'
        )].map((plane) => plane.dataset.phoneBuffer ?? '').filter(Boolean),
        transitionLive: shell?.hasAttribute('data-phone-transition-live') ?? false,
        sourceSceneText: sceneText('source'),
        receiverSceneText: sceneText('receiver'),
        scrollTop: document.scrollingElement?.scrollTop ?? document.documentElement.scrollTop,
        nativeReadingRect: rect(nativeReading),
        sourceMirrorRect: rect(sourceMirror),
        sourceMirrorScrollY: sourceMirror
          ? getComputedStyle(sourceMirror).getPropertyValue('--phone-native-scroll-y').trim()
          : null,
        effectProgress: Number.isFinite(Number(activeInk?.dataset.r4InkBoundaryProgress))
          ? Number(activeInk?.dataset.r4InkBoundaryProgress) : null,
        contactProgress: Number.isFinite(Number(contact?.dataset.contactProgress))
          ? Number(contact?.dataset.contactProgress) : null,
        craneProgress: Number.isFinite(Number(crane?.dataset.phoneCraneProgress))
          ? Number(crane?.dataset.phoneCraneProgress) : null,
        craneClock: crane?.dataset.phoneCraneClock ?? null,
        proofSurface: proofSurface ? {
          role: proofSurface.closest<HTMLElement>('[data-phone-plane]')?.dataset.phonePlane ?? null,
          maskImage: getComputedStyle(proofSurface).webkitMaskImage
            || getComputedStyle(proofSurface).maskImage,
          maskSize: getComputedStyle(proofSurface).webkitMaskSize
            || getComputedStyle(proofSurface).maskSize,
          maskPosition: getComputedStyle(proofSurface).webkitMaskPosition
            || getComputedStyle(proofSurface).maskPosition,
          maskRun: proofSurface.dataset.r4DepthMaskRun ?? null,
          maskPolarity: proofSurface.dataset.r4DepthMaskPolarity ?? null,
          maskProgress: Number.isFinite(Number(proofSurface.dataset.r4DepthMaskProgress))
            ? Number(proofSurface.dataset.r4DepthMaskProgress) : null
        } : null,
        figure2Surface: figure2Surface ? {
          role: figure2Surface.closest<HTMLElement>('[data-phone-plane]')?.dataset.phonePlane ?? null,
          maskImage: getComputedStyle(figure2Surface).webkitMaskImage
            || getComputedStyle(figure2Surface).maskImage,
          maskSize: getComputedStyle(figure2Surface).webkitMaskSize
            || getComputedStyle(figure2Surface).maskSize,
          maskPosition: getComputedStyle(figure2Surface).webkitMaskPosition
            || getComputedStyle(figure2Surface).maskPosition,
          maskRun: figure2Surface.dataset.r4DepthMaskRun ?? null,
          maskPolarity: figure2Surface.dataset.r4DepthMaskPolarity ?? null,
          maskProgress: Number.isFinite(Number(figure2Surface.dataset.r4DepthMaskProgress))
            ? Number(figure2Surface.dataset.r4DepthMaskProgress) : null
        } : null,
        proofClosing: proofClosing ? {
          text: proofClosing.textContent?.replace(/\s+/g, ' ').trim() ?? '',
          rect: rect(proofClosing) ?? [0, 0, 0, 0]
        } : null,
        figure2Arch: figure2Arch ? {
          blur: getComputedStyle(figure2Arch)
            .getPropertyValue('--r4-figure2-near-arch-blur').trim(),
          scale: getComputedStyle(figure2Arch)
            .getPropertyValue('--r4-figure2-near-arch-scale').trim(),
          brightness: getComputedStyle(figure2Arch).getPropertyValue(
            '--r4-figure2-near-arch-brightness'
          ).trim(),
          rect: rect(figure2Arch) ?? [0, 0, 0, 0]
        } : null,
        figure3: figure3 ? {
          initialSurface: figure3.dataset.phoneFigure3InitialSurface ?? null,
          mediaState: figure3.dataset.phoneMediaState ?? null,
          proofLineage: figure3.dataset.phoneFigure3ProofLineage ?? null,
          posterVisible: figure3Poster ? visible(figure3Poster) : false,
          canvasVisible: figure3Canvas ? visible(figure3Canvas) : false
        } : null,
        planes: [...document.querySelectorAll<HTMLElement>('[data-phone-plane]')].map((plane) => {
          const style = getComputedStyle(plane);
          return {
            role: plane.dataset.phonePlane ?? '',
            visible: visible(plane),
            rect: rect(plane) ?? [0, 0, 0, 0],
            opacity: Number.parseFloat(style.opacity || '1'),
            clipPath: style.clipPath,
            maskImage: style.maskImage || style.webkitMaskImage,
            maskSize: style.maskSize || style.webkitMaskSize,
            maskPosition: style.maskPosition || style.webkitMaskPosition,
            maskRepeat: style.maskRepeat || style.webkitMaskRepeat,
            maskMode: style.maskMode
          };
        }),
        media: [...document.querySelectorAll<HTMLVideoElement>('.phone-story video')].map((video) => ({
          surfaceId: video.getAttribute('data-phone-surface'),
          currentTime: video.currentTime,
          paused: video.paused,
          seeking: video.seeking,
          readyState: video.readyState
        })),
        canvases: [...document.querySelectorAll<HTMLCanvasElement>('.phone-story canvas')]
          .map((canvas) => {
            const ph = canvas.closest<HTMLElement>('.phone-ph');
            return {
              surfaceId: canvas.getAttribute('data-phone-surface'),
              mediaTime: Number.isFinite(Number(canvas.dataset.packedAlphaMediaTime))
                ? Number(canvas.dataset.packedAlphaMediaTime) : null,
              frame: Number.isFinite(Number(canvas.dataset.packedAlphaFrame))
                ? Number(canvas.dataset.packedAlphaFrame) : null,
              generation: Number.isFinite(Number(canvas.dataset.packedAlphaGeneration))
                ? Number(canvas.dataset.packedAlphaGeneration) : null,
              opacity: Number.parseFloat(getComputedStyle(canvas).opacity || '1'),
              alphaStatus: ph?.dataset.phonePhAlpha ?? null,
              admittedGeneration: Number.isFinite(Number(ph?.dataset.phGen))
                ? Number(ph?.dataset.phGen) : null
            };
          })
      });
      recorder.animationFrame = requestAnimationFrame(sample);
    };
    owner.__r5PhoneFrameRecorder = recorder;
    recorder.animationFrame = requestAnimationFrame(sample);
  });
  return async () => page.evaluate(() => {
    const owner = window as typeof window & {
      __r5PhoneFrameRecorder?: {
        animationFrame: number;
        samples: PhoneStoryFrameSample[];
      };
    };
    const recorder = owner.__r5PhoneFrameRecorder;
    if (!recorder) return [];
    cancelAnimationFrame(recorder.animationFrame);
    delete owner.__r5PhoneFrameRecorder;
    return recorder.samples;
  });
}

export async function waitForCommitSequence(
  page: Page,
  sceneId: string,
  afterSequence: number,
  timeoutMs = 30_000
): Promise<number> {
  try {
    await page.waitForFunction(({ scene, after }) => {
      const shell = document.querySelector<HTMLElement>('.phone-story');
      const sequence = Number.parseInt(shell?.dataset.phoneCommitSequence ?? '', 10);
      return shell?.dataset.phoneScene === scene && sequence > after;
    }, { scene: sceneId, after: afterSequence }, { timeout: timeoutMs });
  } catch (error) {
    const diagnostic = await readPhoneStoryDiagnostic(page);
    const runtime = await page.evaluate(() => (
      ((window as typeof window & { __r5PhoneRuntimeLog?: Array<{
        stateRevision: number; status: string; transaction?: {
          mode: string; phase: string; attempt: { transactionGeneration: number };
          failure?: { code: string } | null;
          evidence: Array<{ slot: { leg: string; kind: string; surfaceId?: string | null } }>;
        } | null
      }> }).__r5PhoneRuntimeLog ?? []).flatMap((snapshot) => snapshot.transaction ? [{
        revision: snapshot.stateRevision, status: snapshot.status,
        generation: snapshot.transaction.attempt.transactionGeneration,
        mode: snapshot.transaction.mode, phase: snapshot.transaction.phase,
        failure: snapshot.transaction.failure?.code ?? null,
        evidence: snapshot.transaction.evidence.map(({ slot }) => (
          `${slot.leg}:${slot.kind}:${slot.surfaceId ?? ''}`
        ))
      }] : [])
    ));
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n`
      + `Phone story diagnostic: ${JSON.stringify(diagnostic)}\n`
      + `Phone runtime tail: ${JSON.stringify(runtime)}`);
  }
  return readCommitSequence(page);
}

export async function waitForDirectEntryCommit(
  page: Page,
  sceneId: string,
  afterSequence = 0
): Promise<number> {
  let boundary;
  try {
    boundary = await page.waitForFunction(({ scene, after }) => {
      const shell = document.querySelector<HTMLElement>('.phone-story');
      const sequence = Number.parseInt(shell?.dataset.phoneCommitSequence ?? '', 10);
      if (shell?.dataset.phoneScene === scene && sequence > after) return 'committed';
      return shell?.dataset.phonePhase === 'awaiting-media-activation'
        || document.querySelector('[data-phone-activation]:not([hidden])')
        ? 'activation' : null;
    }, { scene: sceneId, after: afterSequence }, { timeout: 30_000 });
  } catch (error) {
    const diagnostic = await readPhoneStoryDiagnostic(page);
    const runtime = await page.evaluate(() => (
      (window as typeof window & { __r5PhoneRuntimeLog?: unknown[] })
        .__r5PhoneRuntimeLog?.slice(-12) ?? []
    ));
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n`
      + `Phone story diagnostic: ${JSON.stringify(diagnostic)}\n`
      + `Phone runtime tail: ${JSON.stringify(runtime)}`);
  }
  if (await boundary.jsonValue() === 'activation') {
    await page.locator('[data-phone-activation]:not([hidden])').click();
  }
  return waitForCommitSequence(page, sceneId, afterSequence);
}
