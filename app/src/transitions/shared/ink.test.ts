import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LayerHandle, LayerVisibilityState, SpineSegmentNode, TransitionContext } from '../../story/types';
import { verifySegmentTimeline } from '../../story/verifySegmentTimeline';
import { createInkSegmentTransition, type InkSegmentOptions } from './ink';

const inkSource = readFileSync(new URL('./ink.ts', import.meta.url), 'utf8');

class FakeStyle {
  [key: string]: unknown;
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  item(index: number): string {
    return [...this.values.keys()][index] ?? '';
  }

  setProperty(name: string, value: string): void {
    this.values.set(name, value);
  }

  removeProperty(name: string): void {
    this.values.delete(name);
  }

  getPropertyValue(name: string): string {
    return this.values.get(name) ?? '';
  }
}

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly style = new FakeStyle();
  parentElement: FakeElement | null = null;
  inert = false;
  className = '';

  append(child: FakeElement): void {
    child.parentElement = this;
    this.children.push(child);
  }

  querySelector(selector: string): FakeElement | null {
    const match = selector.match(/data-r4-ink-segment="([^"]+)"/);
    return match ? this.children.find((child) => child.dataset.r4InkSegment === match[1]) ?? null : null;
  }

  querySelectorAll(): FakeElement[] {
    return [];
  }

  removeAttribute(name: string): void {
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
      delete this.dataset[key];
    }
  }

  setAttribute(name: string, value: string): void {
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
      this.dataset[key] = value;
    }
  }
}

class FakeCanvas extends FakeElement {
  getContext(): null {
    return null;
  }

  remove(): void {
    if (!this.parentElement) {
      return;
    }
    const index = this.parentElement.children.indexOf(this);
    if (index >= 0) {
      this.parentElement.children.splice(index, 1);
    }
    this.parentElement = null;
  }
}

function layer(scene: 'services' | 'ttg-animation', role: 'current' | 'next', element: FakeElement): LayerHandle {
  let visibility: LayerVisibilityState = {
    mounted: true,
    visible: role === 'current',
    inert: role !== 'current',
    opacity: role === 'current' ? 1 : 0,
    pointerEvents: role === 'current' ? 'auto' : 'none'
  };
  return {
    scene,
    role,
    element: element as unknown as HTMLElement,
    get visibility() {
      return visibility;
    },
    setVisibility(next) {
      visibility = next;
    },
    dispose() {}
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('shared ink transition surface', () => {
  it('initializes a reverse build at the forward end and prepares endpoint holds only once', async () => {
    const stage = new FakeElement();
    const fromElement = new FakeElement();
    const toElement = new FakeElement();
    stage.append(fromElement);
    stage.append(toElement);
    const canvas = new FakeCanvas();
    vi.stubGlobal('document', { createElement: () => canvas });
    const segment = {
      kind: 'segment',
      id: 'services-ttg',
      from: 'services',
      to: 'ttg-animation',
      policy: { kind: 'snap', chargeThreshold: 0.1 },
      virtualDuration: 1200
    } satisfies SpineSegmentNode;
    const from = layer('services', 'next', fromElement);
    const to = layer('ttg-animation', 'current', toElement);
    const sourceProgress: number[] = [];
    const prepared: Array<{ from: HTMLElement | null; to: HTMLElement | null }> = [];
    const context: TransitionContext = {
      segment,
      from,
      to,
      stage: { getLayer: () => undefined, ensureLayer: () => to, releaseLayer() {}, snapshot: () => [] },
      direction: -1,
      runId: 'ink-reverse-build-test:1',
      prepareToken: 'ink-reverse-build-test:prepare:1',
      prefersReducedMotion: false,
      reportMilestone() {}
    };
    const options = {
      id: 'services-ttg',
      field: { kind: 'horizontal', direction: 'bottom-to-top', seed: 'services-ttg' },
      prepareEndpoints: (roots: { from: HTMLElement | null; to: HTMLElement | null }) => prepared.push(roots),
      renderSource: (_root: HTMLElement | null, progress: number) => sourceProgress.push(progress),
      renderSourceProgress: 'forward'
    } satisfies InkSegmentOptions;

    const timeline = await createInkSegmentTransition(options).buildTimeline(context);

    expect(from.visibility).toMatchObject({ visible: false, opacity: 0 });
    expect(to.visibility).toMatchObject({ visible: true, opacity: 1 });
    expect(sourceProgress).toEqual([1]);
    expect(prepared).toHaveLength(1);
    timeline.progress(0.75);
    timeline.progress(0.25);
    expect(prepared).toHaveLength(1);
  });

  it('does not expose a target progress renderer from the generic Ink API', () => {
    expect(inkSource).toContain('prepareEndpoints(roots: InkEndpointRoots): void;');
    expect(inkSource).not.toContain('renderTo?:');
    expect(inkSource).not.toContain('renderToProgress?:');
    expect(inkSource).not.toContain('function targetClipPath');
    expect(inkSource).not.toContain('return `inset(');
    expect(inkSource).not.toContain('return `circle(');
    expect(inkSource).not.toContain('clipProgress?:');
    expect(inkSource).not.toContain('inkProgress?:');
    expect(inkSource).toContain('fieldProgress?:');
  });

  it('prepares source and receiver holds once instead of rerendering the target per frame', async () => {
    const fromProgress: number[] = [];
    const toProgress: number[] = [];
    const segment = {
      kind: 'segment',
      id: 'services-ttg',
      from: 'services',
      to: 'ttg-animation',
      policy: { kind: 'snap', chargeThreshold: 0.1 },
      virtualDuration: 1200
    } satisfies SpineSegmentNode;
    const fromElement = new FakeElement();
    const toElement = new FakeElement();
    const canvas = new FakeCanvas();
    vi.stubGlobal('document', { createElement: () => canvas });
    const context: TransitionContext = {
      segment,
      from: layer('services', 'current', fromElement),
      to: layer('ttg-animation', 'next', toElement),
      stage: { getLayer: () => undefined, ensureLayer: () => layer('ttg-animation', 'next', toElement), releaseLayer() {}, snapshot: () => [] },
      direction: 1,
      runId: 'ink-static-test:1',
      prepareToken: 'ink-static-test:prepare:1',
      prefersReducedMotion: false,
      reportMilestone() {}
    };
    const transition = createInkSegmentTransition({
      id: 'services-ttg',
      field: { kind: 'horizontal', direction: 'bottom-to-top', seed: 'services-ttg' },
      prepareEndpoints: () => {
        fromProgress.push(1);
        toProgress.push(1);
      }
    });

    const timeline = await transition.buildTimeline(context);
    timeline.progress(0.35);
    timeline.progress(0.72);

    expect(fromProgress).toEqual([1]);
    expect(toProgress).toEqual([1]);
  });

  it('renders a staged source only when its root or mapped progress changes', async () => {
    const fromElement = new FakeElement();
    const toElement = new FakeElement();
    const canvas = new FakeCanvas();
    vi.stubGlobal('document', { createElement: () => canvas });
    const sourceProgress: number[] = [];
    const segment = {
      kind: 'segment',
      id: 'services-ttg',
      from: 'services',
      to: 'ttg-animation',
      policy: { kind: 'snap', chargeThreshold: 0.1 },
      virtualDuration: 1200
    } satisfies SpineSegmentNode;
    const to = layer('ttg-animation', 'next', toElement);
    const transition = createInkSegmentTransition({
      id: 'services-ttg',
      field: { kind: 'horizontal', direction: 'bottom-to-top', seed: 'services-ttg' },
      prepareEndpoints: () => undefined,
      renderSource: (_root, progress) => sourceProgress.push(progress),
      renderSourceProgress: (progress) => Math.min(1, progress / 0.4)
    });
    const timeline = await transition.buildTimeline({
      segment,
      from: layer('services', 'current', fromElement),
      to,
      stage: { getLayer: () => undefined, ensureLayer: () => to, releaseLayer() {}, snapshot: () => [] },
      direction: 1,
      runId: 'ink-source-idempotence:1',
      prepareToken: 'ink-source-idempotence:prepare:1',
      prefersReducedMotion: false,
      reportMilestone() {}
    });

    timeline.progress(0.4);
    timeline.progress(0.6);
    timeline.progress(0.8);

    expect(sourceProgress).toEqual([0, 1]);
    timeline.dispose();
  });

  it('mounts its colored particle canvas beside scene layers so the receiver mask cannot clip it', async () => {
    const stage = new FakeElement();
    const fromElement = new FakeElement();
    const toElement = new FakeElement();
    stage.append(fromElement);
    stage.append(toElement);
    const canvas = new FakeCanvas();
    const revealSurface = new FakeElement();
    const concealSurface = new FakeElement();
    vi.stubGlobal('document', { createElement: () => canvas });
    const segment = {
      kind: 'segment',
      id: 'services-ttg',
      from: 'services',
      to: 'ttg-animation',
      policy: { kind: 'snap', chargeThreshold: 0.1 },
      virtualDuration: 1200
    } satisfies SpineSegmentNode;
    const context: TransitionContext = {
      segment,
      from: layer('services', 'current', fromElement),
      to: layer('ttg-animation', 'next', toElement),
      stage: { getLayer: () => undefined, ensureLayer: () => layer('ttg-animation', 'next', toElement), releaseLayer() {}, snapshot: () => [] },
      direction: 1,
      runId: 'ink-test:1',
      prepareToken: 'ink-test:prepare:1',
      prefersReducedMotion: false,
      reportMilestone() {}
    };
    const transition = createInkSegmentTransition({
      id: 'services-ttg',
      field: { kind: 'horizontal', direction: 'bottom-to-top', seed: 'services-ttg' },
      ownershipSurfaces: () => ({
        conceal: [concealSurface as unknown as HTMLElement],
        reveal: [revealSurface as unknown as HTMLElement]
      }),
      prepareEndpoints: () => undefined
    });

    const timeline = await transition.buildTimeline(context);

    expect(canvas.parentElement).toBe(stage);
    expect(canvas.dataset.r4InkRenderer).toBe('field');
    expect(canvas.dataset.r4InkPreset).toBe('edge-only');
    expect(canvas.dataset.r4InkGrade).toBe('edge-only');
    expect(canvas.dataset.r4InkGeneration).toBe('ink-test:1:ink-test:prepare:1');
    expect(canvas.dataset.r4InkPresetApplied).toBe('true');
    expect(canvas.dataset.r4InkEffectOnly).toBe('true');
    expect(canvas.dataset.r4InkParticleProfile).toBe('jade-gold');
    expect(canvas.dataset.r4InkParticleStrength).toBeUndefined();
    expect(canvas.dataset.r4InkColorLift).toBe('0.920');
    expect(canvas.dataset.r4InkCoverAlpha).toBe('0.000');
    canvas.remove();
    expect(canvas.parentElement).toBeNull();
    timeline.progress(0.25);
    expect(canvas.parentElement).toBe(stage);
    const firstClip = String(toElement.style.clipPath ?? '');
    timeline.progress(0.75);
    const secondClip = String(toElement.style.clipPath ?? '');
    expect(toElement.style.getPropertyValue('mask-image')).toBe('');
    expect(firstClip).toMatch(/^polygon\(/);
    expect(secondClip).toMatch(/^polygon\(/);
    expect(firstClip).not.toContain('inset(');
    expect(secondClip).not.toContain('inset(');
    expect(firstClip).not.toBe(secondClip);
    expect(toElement.style.visibility).not.toBe('hidden');
    expect(toElement.style.opacity).not.toBe('0');
    expect(toElement.dataset.r4RevealMode).toBe('ink-occluded-live-gate');
    expect(toElement.dataset.r4InkBoundaryKind).toBe('horizontal');
    expect(toElement.dataset.r4InkBoundaryProgress).toBe('0.7500');
    expect(canvas.dataset.r4InkContourRevision).toMatch(/^horizontal-ink-contour-v1-/);
    expect(toElement.dataset.r4InkContourRevision).toBe(canvas.dataset.r4InkContourRevision);
    expect(revealSurface.dataset.r4InkContourRevision).toBe(canvas.dataset.r4InkContourRevision);
    expect(concealSurface.dataset.r4InkContourRevision).toBe(canvas.dataset.r4InkContourRevision);
    expect(toElement.dataset.r4InkContourThreshold).toBe(canvas.dataset.r4InkContourThreshold);
    expect(revealSurface.style.clipPath).toMatch(/^polygon\(/);
    expect(concealSurface.style.clipPath).toMatch(/^polygon\(/);
    expect(canvas.dataset.r4InkTargetReady).toBeUndefined();
    expect(timeline.sample?.(0.99)).toMatchObject({
      from: { visible: true, opacity: 1 },
      to: { visible: true, opacity: 1 }
    });
    expect(timeline.sample?.(1)).toMatchObject({
      from: { visible: false, opacity: 0 },
      to: { visible: true, opacity: 1 }
    });
    expect(verifySegmentTimeline(timeline, {
      requireStableSceneIdentity: true,
      requirePresentation: true,
      requireEffectOnlyCanvas: true,
    })).toMatchObject({
      reverseSymmetric: true,
      presentationSymmetric: true,
      effectOnlyCanvas: true
    });
    timeline.progress(1);
    expect(toElement.style.clipPath ?? '').toBe('');
    expect(concealSurface.style.visibility).toBe('hidden');
    expect(concealSurface.style.clipPath ?? '').toBe('');
    timeline.progress(0);
    expect(concealSurface.style.visibility).toBe('visible');
    timeline.dispose();
    expect(canvas.parentElement).toBeNull();
  });

  it('retains only one lightweight run contour without a mask or snapshot compositor', () => {
    expect(inkSource).toContain('createHorizontalInkContour');
    expect(inkSource).toContain('frame.contour');
    expect(inkSource).toContain('frame.revision');
    expect(inkSource).not.toContain('mask-image:');
    expect(inkSource).not.toContain('createElementNS');
    expect(inkSource).not.toContain('snapshotCapture');
  });

  it('varies fresh forward and reverse invocations while keeping each timeline stable', async () => {
    vi.stubGlobal('document', { createElement: () => new FakeCanvas() });
    const segment = {
      kind: 'segment',
      id: 'services-ttg',
      from: 'services',
      to: 'ttg-animation',
      policy: { kind: 'snap', chargeThreshold: 0.1 },
      virtualDuration: 1200
    } satisfies SpineSegmentNode;
    const build = async (direction: 1 | -1, runId: TransitionContext['runId']) => {
      const stage = new FakeElement();
      const fromElement = new FakeElement();
      const toElement = new FakeElement();
      stage.append(fromElement);
      stage.append(toElement);
      const from = layer('services', direction === 1 ? 'current' : 'next', fromElement);
      const to = layer('ttg-animation', direction === 1 ? 'next' : 'current', toElement);
      const timeline = await createInkSegmentTransition({
        id: 'services-ttg',
        field: { kind: 'horizontal', direction: 'bottom-to-top', seed: 'services-ttg' },
        prepareEndpoints: () => undefined
      }).buildTimeline({
        segment,
        from,
        to,
        stage: { getLayer: () => undefined, ensureLayer: () => to, releaseLayer() {}, snapshot: () => [] },
        direction,
        runId,
        prepareToken: 'ink-variation:prepare:1',
        prefersReducedMotion: false,
        reportMilestone() {}
      });
      return { timeline, toElement };
    };

    const forward = await build(1, 'ink-variation-forward:1');
    forward.timeline.progress(0.25);
    const forwardRevision = forward.toElement.dataset.r4InkContourRevision;
    forward.timeline.progress(0.75);
    expect(forward.toElement.dataset.r4InkContourRevision).toBe(forwardRevision);

    const reverse = await build(-1, 'ink-variation-reverse:2');
    reverse.timeline.progress(0.75);
    expect(reverse.toElement.dataset.r4InkContourRevision).not.toBe(forwardRevision);
    expect(reverse.toElement.style.clipPath).toMatch(/^polygon\(/);

    forward.timeline.dispose();
    reverse.timeline.dispose();
    expect(forward.toElement.dataset.r4InkContourRevision).toBeUndefined();
    expect(reverse.toElement.dataset.r4InkContourRevision).toBeUndefined();
  });

  it('verifies generic Ink presentation and effect cleanup independently at p=0 and p=1', async () => {
    vi.stubGlobal('document', { createElement: () => new FakeCanvas() });
    const segment = {
      kind: 'segment',
      id: 'services-ttg',
      from: 'services',
      to: 'ttg-animation',
      policy: { kind: 'snap', chargeThreshold: 0.1 },
      virtualDuration: 1200
    } satisfies SpineSegmentNode;
    const build = async () => {
      const stage = new FakeElement();
      const fromElement = new FakeElement();
      const toElement = new FakeElement();
      stage.append(fromElement);
      stage.append(toElement);
      const to = layer('ttg-animation', 'next', toElement);
      return createInkSegmentTransition({
        id: 'services-ttg',
        field: { kind: 'horizontal', direction: 'bottom-to-top', seed: 'services-ttg' },
        prepareEndpoints: () => undefined
      }).buildTimeline({
        segment,
        from: layer('services', 'current', fromElement),
        to,
        stage: { getLayer: () => undefined, ensureLayer: () => to, releaseLayer() {}, snapshot: () => [] },
        direction: 1,
        runId: 'ink-dispose-contract:1',
        prepareToken: 'ink-dispose-contract:prepare:1',
        prefersReducedMotion: false,
        reportMilestone() {}
      });
    };
    const main = await build();
    const start = await build();
    const end = await build();

    expect(verifySegmentTimeline(main, {
      requireStableSceneIdentity: true,
      requirePresentation: true,
      requireEffectOnlyCanvas: true,
      disposeEndpointTimelines: { start, end }
    })).toMatchObject({
      presentationSymmetric: true,
      disposeInvariant: true,
      disposedEndpoints: [0, 1],
      effectOnlyCanvas: true
    });
    main.dispose();
  });

  it('keeps automatic ink playback inside the transition after one long browser frame', async () => {
    const stage = new FakeElement();
    const fromElement = new FakeElement();
    const toElement = new FakeElement();
    stage.append(fromElement);
    stage.append(toElement);
    const canvas = new FakeCanvas();
    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal('document', { createElement: () => canvas });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const renderedProgress: number[] = [];
    const segment = {
      kind: 'segment',
      id: 'services-ttg',
      from: 'services',
      to: 'ttg-animation',
      policy: { kind: 'snap', chargeThreshold: 0.1 },
      virtualDuration: 1_000
    } satisfies SpineSegmentNode;
    const context: TransitionContext = {
      segment,
      from: layer('services', 'current', fromElement),
      to: layer('ttg-animation', 'next', toElement),
      stage: { getLayer: () => undefined, ensureLayer: () => layer('ttg-animation', 'next', toElement), releaseLayer() {}, snapshot: () => [] },
      direction: 1,
      runId: 'ink-long-frame-test:1',
      prepareToken: 'ink-long-frame-test:prepare:1',
      prefersReducedMotion: false,
      reportMilestone() {}
    };
    const transition = createInkSegmentTransition({
      id: 'services-ttg',
      field: { kind: 'horizontal', direction: 'bottom-to-top', seed: 'services-ttg' },
      prepareEndpoints: () => undefined,
      renderSource: (_root, progress) => renderedProgress.push(progress),
      renderSourceProgress: 'forward'
    });
    const timeline = await transition.buildTimeline(context);
    const playback = timeline.play(1);

    callbacks.shift()?.(5_000);

    expect(renderedProgress.at(-1)).toBeGreaterThan(0);
    expect(renderedProgress.at(-1)).toBeLessThan(1);
    timeline.dispose();
    callbacks.shift()?.(5_016);
    await playback;
  });
});
