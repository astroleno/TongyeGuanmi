import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InkBoundaryFrame } from '../shared/inkBoundary';
import { createBackHalfDomContext, FakeCanvas, FakeElement } from '../__fixtures__/back-half.fixture';

const boundaryRenderer = vi.hoisted(() => ({
  destroy: vi.fn(),
  prewarm: vi.fn(),
  render: vi.fn()
}));

vi.mock('../shared/sceneInk', () => ({
  createBoundaryInkRenderer: vi.fn(() => boundaryRenderer)
}));

import { createStarMapAodTransition } from './index';

const transitionSource = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

beforeEach(() => {
  boundaryRenderer.destroy.mockClear();
  boundaryRenderer.prewarm.mockClear();
  boundaryRenderer.render.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('star-map AOD one-boundary integration', () => {
  it('uses the shared boundary frame instead of a local clip or vendor alias', () => {
    expect(transitionSource).toContain('createInkBoundaryFrame');
    expect(transitionSource).toContain('createBoundaryInkRenderer');
    expect(transitionSource).not.toContain('renderLiveRevealClip');
    expect(transitionSource).not.toContain("from './inkCurtain'");
    expect(transitionSource).not.toContain('sourceCanvas');
    expect(transitionSource).not.toContain('renderAodSourceCanvas');
    expect(transitionSource).not.toContain('targetElement:');
  });

  it('applies one revision to the live AOD surface and effect canvas, then destroys once', async () => {
    const fixture = createBackHalfDomContext('star-map-aod', 'star-map', 'aod-animation');
    const revealSurface = new FakeElement();
    const canvas = new FakeCanvas();
    const receiver = fixture.stage.children[1]!;
    receiver.connect('[data-aod-reveal-surface]', revealSurface);
    receiver.connect('[data-aod-ink-canvas]', canvas);
    const timeline = await createStarMapAodTransition().buildTimeline(fixture.context);

    timeline.progress(0.5);

    const frame = boundaryRenderer.render.mock.lastCall?.[0] as InkBoundaryFrame;
    expect(frame.kind).toBe('horizontal');
    expect(revealSurface.style.clipPath).toMatch(/^polygon\(/);
    expect(revealSurface.style.clipPath).not.toContain('inset(');
    expect(revealSurface.dataset.r4InkBoundaryRevision).toBe(frame.revision);
    expect(canvas.dataset.r4InkBoundaryRevision).toBe(frame.revision);
    expect(canvas.dataset.r4InkEffectOnly).toBe('true');
    expect(canvas.dataset.r4InkRenderer).toBe('boundary');

    timeline.dispose();
    timeline.dispose();

    expect(boundaryRenderer.destroy).toHaveBeenCalledOnce();
  });
});
