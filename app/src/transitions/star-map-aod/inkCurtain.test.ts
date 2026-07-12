import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HorizontalInkFieldFrame } from '../shared/inkField';
import { createBackHalfDomContext, FakeCanvas, FakeElement } from '../__fixtures__/back-half.fixture';

const boundaryRenderer = vi.hoisted(() => ({
  destroy: vi.fn(),
  prewarm: vi.fn(),
  render: vi.fn()
}));

const rendererFactory = vi.hoisted(() => vi.fn(() => boundaryRenderer));

vi.mock('../../vendor/ink-scene-transition.js', () => ({
  createInkBoundaryTransition: rendererFactory
}));

import { createStarMapAodTransition } from './index';

const transitionSource = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

beforeEach(() => {
  boundaryRenderer.destroy.mockClear();
  boundaryRenderer.prewarm.mockClear();
  boundaryRenderer.render.mockClear();
  rendererFactory.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('star-map AOD one-boundary integration', () => {
  it('uses the shared boundary frame instead of a local clip or vendor alias', () => {
    expect(transitionSource).toContain('createInkFieldFrame');
    expect(transitionSource).toContain('createInkFieldRenderer');
    expect(transitionSource).toContain('createHorizontalInkContour');
    expect(transitionSource).not.toContain('renderLiveRevealClip');
    expect(transitionSource).not.toContain("from './inkCurtain'");
    expect(transitionSource).not.toContain('sourceCanvas');
    expect(transitionSource).not.toContain('renderAodSourceCanvas');
    expect(transitionSource).not.toContain('targetElement:');
    expect(transitionSource).not.toContain('colorLift:');
    expect(transitionSource).not.toContain('coverAlpha:');
  });

  it('applies one hidden ownership gate to the live AOD surface, then destroys once', async () => {
    const fixture = createBackHalfDomContext('star-map-aod', 'star-map', 'aod-animation');
    const revealSurface = new FakeElement();
    const canvas = new FakeCanvas();
    const receiver = fixture.stage.children[1]!;
    receiver.connect('[data-aod-reveal-surface]', revealSurface);
    const created: FakeCanvas[] = [];
    vi.stubGlobal('document', {
      createElement: () => {
        const next = created.length === 0 ? canvas : new FakeCanvas();
        created.push(next);
        return next;
      }
    });
    const timeline = await createStarMapAodTransition().buildTimeline(fixture.context);

    timeline.progress(0.5);

    const frame = boundaryRenderer.render.mock.lastCall?.[0] as HorizontalInkFieldFrame;
    expect(frame.spec.kind).toBe('horizontal');
    expect(revealSurface.style.clipPath).toMatch(/^polygon\(/);
    expect(revealSurface.style.clipPath).not.toContain('inset(');
    expect(revealSurface.dataset.r4InkContourRevision).toBe(frame.revision);
    expect(canvas.dataset.r4InkContourRevision).toBe(frame.revision);
    expect(revealSurface.dataset.r4InkContourThreshold).toBe(frame.threshold.toFixed(6));
    expect(canvas.dataset.r4InkEffectOnly).toBe('true');
    expect(canvas.dataset.r4InkRenderer).toBe('field');
    expect(canvas.dataset.r4InkGrade).toBe('edge-only');
    expect(canvas.dataset.r4InkGeneration).toBe(
      `${fixture.context.runId}:${fixture.context.prepareToken}`
    );
    expect(canvas.parentElement).toBe(fixture.stage);

    timeline.dispose();
    timeline.dispose();

    expect(boundaryRenderer.destroy).toHaveBeenCalledOnce();
    expect(canvas.parentElement).toBeNull();
    expect(revealSurface.dataset.r4InkContourRevision).toBeUndefined();
  });

  it('uses ten fresh renderers and canvases across alternating directions', async () => {
    const fixture = createBackHalfDomContext('star-map-aod', 'star-map', 'aod-animation');
    const revealSurface = new FakeElement();
    const receiver = fixture.stage.children[1]!;
    const created: FakeCanvas[] = [];
    receiver.connect('[data-aod-reveal-surface]', revealSurface);
    vi.stubGlobal('document', {
      createElement: () => {
        const canvas = new FakeCanvas();
        created.push(canvas);
        return canvas;
      }
    });
    const revisions = new Set<string>();

    for (let index = 0; index < 10; index += 1) {
      const runId = `star-map-aod:${index}` as const;
      const timeline = await createStarMapAodTransition().buildTimeline({
        ...fixture.context,
        direction: index % 2 === 0 ? 1 : -1,
        runId
      });
      timeline.progress(0.5);
      const canvas = created[index];
      const frame = boundaryRenderer.render.mock.lastCall?.[0] as HorizontalInkFieldFrame;
      revisions.add(frame.revision);

      expect(canvas?.parentElement).toBe(fixture.stage);
      expect(canvas?.dataset.r4InkGeneration).toBe(`${runId}:${fixture.context.prepareToken}`);
      expect(canvas?.dataset.r4InkRendererActive).toBe('true');
      expect(canvas?.dataset.r4InkActive).toBe('true');
      expect(canvas?.dataset.r4InkBoundaryKind).toBe('horizontal');
      expect(canvas?.dataset.r4InkContourRevision).toBe(frame.revision);
      timeline.dispose();
      expect(canvas?.parentElement).toBeNull();
    }

    expect(new Set(created).size).toBe(10);
    expect(revisions.size).toBe(10);
    expect(rendererFactory).toHaveBeenCalledTimes(10);
    expect(boundaryRenderer.destroy).toHaveBeenCalledTimes(10);
  });

  it('keeps dark as an explicit harness-only grade', async () => {
    const fixture = createBackHalfDomContext('star-map-aod', 'star-map', 'aod-animation');
    const revealSurface = new FakeElement();
    const canvas = new FakeCanvas();
    fixture.stage.children[1]!.connect('[data-aod-reveal-surface]', revealSurface);
    vi.stubGlobal('document', { createElement: () => canvas });

    const timeline = await createStarMapAodTransition({ grade: 'dark' }).buildTimeline(fixture.context);
    timeline.progress(0.5);

    expect(canvas.dataset.r4InkGrade).toBe('dark');
    expect(rendererFactory).toHaveBeenCalledWith(canvas, expect.objectContaining({ coverAlpha: 0.82 }));
    timeline.dispose();
  });
});
