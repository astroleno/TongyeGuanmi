import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  PatternBloomRenderer,
  patternFramePhases,
  patternLayerDirections,
  patternLayerIds,
  patternObjectMetricsForCenter,
  patternObjectMetricsForViewport,
  patternSourceFlowerScale
} from './patternBloomRenderer';

class FakeCanvasContext {
  constructor(readonly canvas: FakeCanvas) {}
  private filterValue = 'none';
  clearRectCount = 0;
  filteredDrawCount = 0;
  imageSmoothingEnabled = false;
  imageSmoothingQuality: ImageSmoothingQuality = 'low';
  shadowBlur = 0;
  shadowColor = 'transparent';
  shadowOffsetY = 0;
  rotations: number[] = [];
  draws: unknown[][] = [];

  arc(): void {}
  beginPath(): void {}
  clearRect(): void {
    this.clearRectCount += 1;
  }
  clip(): void {}
  closePath(): void {}
  get filter(): string { return this.filterValue; }
  set filter(value: string) { this.filterValue = value; }
  drawImage(...args: unknown[]): void {
    this.draws.push(args);
    if (this.filterValue !== 'none') {
      this.filteredDrawCount += 1;
    }
  }
  moveTo(): void {}
  restore(): void {}
  rotate(value: number): void { this.rotations.push(value); }
  save(): void {}
  scale(): void {}
  translate(): void {}
}

class FakeCanvas {
  dataset: Record<string, string> = {};
  height = 0;
  width = 0;
  readonly context = new FakeCanvasContext(this);
  readonly contextOptions: Array<CanvasRenderingContext2DSettings | undefined> = [];

  getBoundingClientRect(): DOMRect {
    return {
      bottom: 720,
      height: 720,
      left: 0,
      right: 1280,
      top: 0,
      width: 1280,
      x: 0,
      y: 0,
      toJSON: () => ({})
    } as DOMRect;
  }

  getContext(_type?: string, options?: CanvasRenderingContext2DSettings): CanvasRenderingContext2D {
    this.contextOptions.push(options);
    return this.context as unknown as CanvasRenderingContext2D;
  }
}

class FakeImage {
  static readonly instances: FakeImage[] = [];
  crossOrigin = '';
  decoding: 'async' | 'auto' | 'sync' = 'auto';
  naturalHeight = 900;
  naturalWidth = 1600;
  onerror: (() => void) | null = null;
  onload: (() => void) | null = null;

  constructor() {
    FakeImage.instances.push(this);
  }

  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

function installRendererDom(devicePixelRatio = 1) {
  FakeImage.instances.length = 0;
  const rafCallbacks: FrameRequestCallback[] = [];
  const canvas = new FakeCanvas();
  const createElement = vi.fn(() => new FakeCanvas());
  const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
    rafCallbacks.push(callback);
    return rafCallbacks.length;
  });
  const cancelAnimationFrame = vi.fn(() => {
    rafCallbacks.splice(0, rafCallbacks.length);
  });

  vi.stubGlobal('document', {
    createElement
  });
  vi.stubGlobal('Image', FakeImage);
  vi.stubGlobal('window', {
    cancelAnimationFrame,
    devicePixelRatio,
    innerHeight: 720,
    innerWidth: 1280,
    requestAnimationFrame
  });

  return {
    canvas: canvas as unknown as HTMLCanvasElement,
    flushRaf(now = 0) {
      const callback = rafCallbacks.shift();
      callback?.(now);
    },
    rafCount() {
      return rafCallbacks.length;
    },
    requestAnimationFrame,
    cancelAnimationFrame: window.cancelAnimationFrame as ReturnType<typeof vi.fn>,
    createElement
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PatternBloomRenderer', () => {
  it('uses all five authored layers and the compact 010 flower directions', () => {
    expect(patternLayerIds()).toEqual(['06', '05', '04', '03', '02']);
    expect(patternLayerDirections()).toEqual({ '02': -1, '03': 1, '04': -1 });
    expect(patternSourceFlowerScale()).toBeCloseTo(0.702, 3);
  });

  it('keeps Main object metrics at desktop and mobile sizes', () => {
    const desktop = patternObjectMetricsForViewport(1280, 720);
    expect(desktop.centerX).toBeCloseTo(307.2, 4);
    expect(desktop.centerY).toBeCloseTo(396, 4);
    expect(desktop.size).toBeCloseTo(964.8, 4);

    const mobile = patternObjectMetricsForViewport(390, 844);
    expect(mobile.centerX).toBeCloseTo(195, 4);
    expect(mobile.centerY).toBeCloseTo(489.52, 4);
    expect(mobile.size).toBeCloseTo(436.8, 4);
  });

  it('allows a presentation shell to move only its Pattern focal point', () => {
    const portrait = patternObjectMetricsForCenter(390, 844, { x: 0.5, y: 0.36 });

    expect(portrait.centerX).toBeCloseTo(195, 4);
    expect(portrait.centerY).toBeCloseTo(303.84, 4);
    expect(portrait.size).toBeCloseTo(436.8, 4);
  });

  it('does not add collapse phase to decor or source-flower motion', () => {
    expect(patternFramePhases(1, 2)).toEqual({
      ringStructuralPhase: 4.2,
      liveMotionPhase: 2
    });
  });

  it('loads every canvas texture with anonymous CORS enabled', async () => {
    const harness = installRendererDom();
    const renderer = new PatternBloomRenderer(harness.canvas);

    await renderer.start();

    expect(FakeImage.instances.length).toBeGreaterThan(0);
    expect(FakeImage.instances.every((image) => image.crossOrigin === 'anonymous')).toBe(true);
    renderer.destroy();
  });

  it('prewarms six live ring textures while hidden without redrawing the scene during the transition', async () => {
    const harness = installRendererDom();
    const renderer = new PatternBloomRenderer(harness.canvas);

    await renderer.start();

    expect(harness.rafCount()).toBe(1);
    expect(harness.canvas.dataset.inkTextureRevision).toBeUndefined();
    const builtRingCount = () => harness.createElement.mock.results
      .map(({ value }) => value as FakeCanvas)
      .filter((canvas) => canvas.dataset.patternTextureRole === 'ring' && canvas.width > 0)
      .length;
    let previousBuilt = builtRingCount();
    for (let frame = 0; frame < 8 && harness.rafCount(); frame += 1) {
      harness.flushRaf(frame * 16.67);
      const nextBuilt = builtRingCount();
      expect(nextBuilt - previousBuilt).toBeLessThanOrEqual(1);
      previousBuilt = nextBuilt;
      expect(harness.canvas.dataset.inkTextureRevision).toBeUndefined();
    }

    expect(previousBuilt).toBe(6);
    expect(harness.rafCount()).toBe(0);
    renderer.setMotionEnabled(true);
    expect(harness.rafCount()).toBe(1);
    harness.flushRaf(200);
    expect(harness.canvas.dataset.inkTextureReady).toBe('true');
    expect(harness.rafCount()).toBe(1);
    renderer.setMotionEnabled(false);
    expect(harness.rafCount()).toBe(0);
    renderer.destroy();
  });

  it('uses a bounded Retina backing store for the full-screen animated canvas', async () => {
    const harness = installRendererDom(2);
    const renderer = new PatternBloomRenderer(harness.canvas);

    await renderer.start();
    renderer.setMotionEnabled(true);
    harness.flushRaf();

    expect(harness.canvas.width).toBe(2560);
    expect(harness.canvas.height).toBe(1440);
    renderer.destroy();
  });

  it('does not leave a static-frame waiter pending after destruction during startup', async () => {
    const harness = installRendererDom();
    const renderer = new PatternBloomRenderer(harness.canvas);

    const start = renderer.start();
    renderer.destroy();
    await start;

    await expect(renderer.prepareStaticFrame()).resolves.toBeUndefined();
    expect(harness.rafCount()).toBe(0);
  });

  it('renders once for coalesced scroll progress updates', async () => {
    const harness = installRendererDom();
    const renderer = new PatternBloomRenderer(harness.canvas);

    await renderer.start();
    while (harness.rafCount()) {
      harness.flushRaf();
    }
    renderer.setRenderActive(true, false);
    harness.flushRaf();
    harness.requestAnimationFrame.mockClear();
    renderer.setProgress(0.2);
    renderer.setProgress(0.4);

    expect(harness.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(harness.rafCount()).toBe(1);

    harness.flushRaf();
    renderer.setProgress(0.6);

    expect(harness.requestAnimationFrame).toHaveBeenCalledTimes(2);
    renderer.destroy();
  });

  it('reuses its ring canvases instead of allocating a new set on every progress frame', async () => {
    const harness = installRendererDom();
    const renderer = new PatternBloomRenderer(harness.canvas);

    await renderer.start();
    while (harness.rafCount()) {
      harness.flushRaf();
    }
    renderer.setRenderActive(true, false);
    harness.flushRaf();
    const allocationsAfterStart = harness.createElement.mock.calls.length;

    renderer.setProgress(0.2);
    harness.flushRaf();
    renderer.setProgress(0.4);
    harness.flushRaf();
    renderer.setProgress(0.8);
    harness.flushRaf();

    expect(harness.createElement).toHaveBeenCalledTimes(allocationsAfterStart);
    renderer.destroy();
  });

  it('keeps independently rotating petal rings alive at 24fps while Pattern is visible', async () => {
    const harness = installRendererDom();
    const renderer = new PatternBloomRenderer(harness.canvas);

    await renderer.start();
    while (harness.rafCount()) {
      harness.flushRaf();
    }
    renderer.setRenderActive(true, true);
    renderer.setFrameProgress(0, 0);

    expect(harness.rafCount()).toBe(1);
    harness.flushRaf(1_000);
    const firstRevision = Number(harness.canvas.dataset.inkTextureRevision);
    expect(harness.rafCount()).toBe(1);

    harness.flushRaf(1_016);
    expect(harness.rafCount()).toBe(1);
    expect(Number(harness.canvas.dataset.inkTextureRevision)).toBe(firstRevision);

    harness.flushRaf(1_043);
    expect(Number(harness.canvas.dataset.inkTextureRevision)).toBeGreaterThan(firstRevision);
    expect(harness.rafCount()).toBe(1);

    renderer.setRenderActive(false, false);
    expect(harness.rafCount()).toBe(0);
    renderer.destroy();
  });

  it('waits for hidden prewarm, renders one complete reduced-motion frame, then stops RAF', async () => {
    const harness = installRendererDom();
    const renderer = new PatternBloomRenderer(harness.canvas);

    await renderer.start();
    renderer.setRenderActive(true, false);
    for (let frame = 0; frame < 8 && harness.rafCount(); frame += 1) {
      harness.flushRaf(frame * 16.67);
    }

    const builtRingCount = harness.createElement.mock.results
      .map(({ value }) => value as FakeCanvas)
      .filter((canvas) => canvas.dataset.patternTextureRole === 'ring' && canvas.width > 0)
      .length;
    expect(builtRingCount).toBe(6);
    expect(Number(harness.canvas.dataset.inkTextureRevision)).toBe(1);
    expect(harness.canvas.dataset.inkTextureReady).toBe('true');
    expect(harness.rafCount()).toBe(0);
    renderer.destroy();
  });

  it('coalesces 60 structural updates into at most 24 expensive canvas redraws per second', async () => {
    const harness = installRendererDom();
    const renderer = new PatternBloomRenderer(harness.canvas);

    await renderer.start();
    renderer.setRenderActive(true, true);
    for (let frame = 0; frame < 16; frame += 1) {
      renderer.setFrameProgress(frame / 60, frame / 60);
      harness.flushRaf(frame * (1000 / 60));
    }
    const revisionAtStart = Number(harness.canvas.dataset.inkTextureRevision ?? 0);

    for (let frame = 0; frame < 60; frame += 1) {
      renderer.setFrameProgress(frame / 60, frame / 60);
      harness.flushRaf(1_000 + frame * (1000 / 60));
    }

    const renderedFrames = Number(harness.canvas.dataset.inkTextureRevision) - revisionAtStart;
    expect(renderedFrames).toBeGreaterThanOrEqual(20);
    expect(renderedFrames).toBeLessThanOrEqual(25);
    renderer.destroy();
  });

  it('rebuilds the same six ring textures for each structural phase', async () => {
    const harness = installRendererDom();
    const renderer = new PatternBloomRenderer(harness.canvas);
    await renderer.start();
    renderer.setMotionEnabled(true);
    for (let frame = 0; frame < 16 && harness.rafCount(); frame += 1) {
      harness.flushRaf(frame * 48);
    }

    const ringCanvases = () => harness.createElement.mock.results
      .map(({ value }) => value as FakeCanvas)
      .filter((canvas) => canvas.dataset.patternTextureRole === 'ring');
    const ringBuilds = () => ringCanvases()
      .reduce((sum, canvas) => sum + canvas.context.clearRectCount, 0);

    const initial = ringBuilds();
    renderer.setFrameProgress(.45, .45);
    harness.flushRaf(1_000);
    const compact = ringBuilds();
    harness.flushRaf(1_048);

    expect(compact).toBeGreaterThan(initial);
    expect(ringCanvases()).toHaveLength(6);
    renderer.destroy();
  });

  it('keeps one filtered live cache per ring at the compact endpoint', async () => {
    const harness = installRendererDom();
    const renderer = new PatternBloomRenderer(harness.canvas);

    await renderer.start();
    renderer.setMotionEnabled(true);
    for (let frame = 0; frame < 16 && harness.rafCount(); frame += 1) {
      harness.flushRaf(frame * 48);
    }

    renderer.setFrameProgress(1, 1);
    harness.flushRaf(1_000);
    const ringCanvases = harness.createElement.mock.results
      .map(({ value }) => value as FakeCanvas)
      .filter((canvas) => canvas.dataset.patternTextureEndpoint === 'end');
    const outputContext = (harness.canvas as unknown as FakeCanvas).context;

    expect(ringCanvases).toHaveLength(0);
    const liveRingCanvases = harness.createElement.mock.results
      .map(({ value }) => value as FakeCanvas)
      .filter((canvas) => canvas.dataset.patternTextureRole === 'ring');
    expect(liveRingCanvases.map((canvas) => canvas.width)).toEqual([320, 320, 320, 320, 320, 320]);
    expect(liveRingCanvases.every((canvas) => canvas.dataset.patternStructuralPhase === '4.2000')).toBe(true);
    expect(liveRingCanvases.every((canvas) => canvas.context.filteredDrawCount > 0)).toBe(true);
    expect(outputContext.filteredDrawCount).toBe(0);
    expect(outputContext.shadowBlur).toBeGreaterThan(0);
    renderer.destroy();
  });

  it('filters only the source crop needed by each wedge without changing ring resolution or destinations', async () => {
    const harness = installRendererDom();
    const renderer = new PatternBloomRenderer(harness.canvas);
    await renderer.start();
    const rings = harness.createElement.mock.results.map(({ value }) => value as FakeCanvas)
      .filter(canvas => canvas.dataset.patternTextureRole === 'ring');
    for (const progress of [0, .25, .5, .75, 1]) {
      renderer.renderScrollProgress(progress, progress * 12);
      for (const canvas of rings) {
        const draws = canvas.context.draws.slice(-7);
        expect(draws).toHaveLength(7);
        for (const draw of draws.slice(0, 4)) {
          expect(draw).toHaveLength(9);
          const [sx, sy, sw, sh, dx, dy, dw, dh] = draw.slice(1) as number[];
          expect(sx).toBeGreaterThanOrEqual(0);
          expect(sy).toBeGreaterThanOrEqual(0);
          expect(sx! + sw!).toBeLessThanOrEqual(1152);
          expect(sy! + sh!).toBeLessThanOrEqual(1152);
          expect(sw! * sh!).toBeLessThan(1152 * 1152 * .9);
          expect(dw! / sw!).toBeCloseTo(canvas.width / 1152, 10);
          expect(dh! / sh!).toBeCloseTo(canvas.height / 1152, 10);
          expect(dx).toBeGreaterThanOrEqual(-canvas.width / 2);
          expect(dy).toBeGreaterThanOrEqual(-canvas.height / 2);
        }
        for (const draw of draws.slice(4)) {
          expect(draw).toHaveLength(9);
          expect((draw[0] as FakeCanvas).dataset.patternTextureRole).toBe('quarter');
          const [sx, sy, sw, sh, dx, dy, dw, dh] = draw.slice(1) as number[];
          expect([sx, sy, dw, dh]).toEqual([0, 0, sw, sh]);
          expect(dx! + canvas.width / 2).toBe(canvas.width - sw!);
          expect(dy! + canvas.height / 2).toBe(canvas.height - sh!);
          expect(sw! * sh!).toBeLessThan(canvas.width * canvas.height * .34);
        }
      }
      const quarter = harness.createElement.mock.results.map(({ value }) => value as FakeCanvas)
        .find(canvas => canvas.dataset.patternTextureRole === 'quarter')!;
      expect(quarter.width).toBeLessThanOrEqual(592);
      expect(quarter.height).toBeLessThanOrEqual(766);
      expect(quarter.context.draws.at(-1)?.[0]).toBe(rings.at(-1));
    }
    expect(rings.map(canvas => canvas.width)).toEqual([320, 320, 320, 320, 320, 320]);
    const quarters = harness.createElement.mock.results.map(({ value }) => value as FakeCanvas)
      .filter(canvas => canvas.dataset.patternTextureRole === 'quarter');
    expect(quarters).toHaveLength(1);
    expect(quarters[0]?.width).toBe(162);
    expect(quarters[0]?.height).toBe(209);
    renderer.destroy();
    expect(quarters[0]?.width).toBe(0);
  });

  it('falls back to all sixteen filtered wedges if the shared quarter context is unavailable', async () => {
    const harness = installRendererDom();
    let allocations = 0;
    harness.createElement.mockImplementation(() => {
      const canvas = new FakeCanvas();
      if (++allocations === 9) vi.spyOn(canvas, 'getContext').mockReturnValue(null as unknown as CanvasRenderingContext2D);
      return canvas;
    });
    const renderer = new PatternBloomRenderer(harness.canvas);
    await renderer.start();
    renderer.renderScrollProgress(.4, 4.8);
    const rings = harness.createElement.mock.results.map(({ value }) => value as FakeCanvas)
      .filter(canvas => canvas.dataset.patternTextureRole === 'ring');
    expect(rings).toHaveLength(6);
    expect(rings.every(canvas => canvas.context.filteredDrawCount === 16)).toBe(true);
    renderer.destroy();
  });

  it('advances one continuous structural phase through the collapse midpoint', async () => {
    const harness = installRendererDom();
    const renderer = new PatternBloomRenderer(harness.canvas);
    await renderer.start();
    for (let frame = 0; frame < 6 && harness.rafCount(); frame += 1) {
      harness.flushRaf(frame * 48);
    }
    renderer.setRenderActive(true, false);
    harness.flushRaf(1000);
    const ringCanvases = () => harness.createElement.mock.results
      .map(({ value }) => value as FakeCanvas)
      .filter((canvas) => canvas.dataset.patternTextureRole === 'ring');
    let previous = -Infinity;
    for (const [index, progress] of [.45, .49, .50, .51, .55].entries()) {
      renderer.setFrameProgress(progress, progress);
      harness.flushRaf(1_200 + index * 60);
      const phases = ringCanvases().map((canvas) => Number(canvas.dataset.patternStructuralPhase));
      expect(phases.every((phase) => phase > previous)).toBe(true);
      previous = phases[0] ?? previous;
    }
    const source = readFileSync(new URL('./patternBloomRenderer.ts', import.meta.url), 'utf8');
    expect(source).not.toContain('terminalRingCanvases');
    expect(source).not.toContain('switchPoint');
    renderer.destroy();
  });

  it('keeps animated canvases GPU-backed instead of requesting frequent software reads', async () => {
    const harness = installRendererDom();
    const renderer = new PatternBloomRenderer(harness.canvas);

    await renderer.start();

    const canvases = [
      harness.canvas as unknown as FakeCanvas,
      ...harness.createElement.mock.results.map(({ value }) => value as FakeCanvas)
    ];
    expect(canvases.flatMap((canvas) => canvas.contextOptions))
      .not.toContainEqual(expect.objectContaining({ willReadFrequently: true }));
    renderer.destroy();
  });
});
