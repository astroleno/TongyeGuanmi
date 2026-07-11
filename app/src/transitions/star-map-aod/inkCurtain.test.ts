import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InkFieldFrame } from '../shared/inkField';
import { createBackHalfDomContext, FakeCanvas, FakeElement } from '../__fixtures__/back-half.fixture';

const boundaryRenderer = vi.hoisted(() => ({
  destroy: vi.fn(),
  prewarm: vi.fn(),
  render: vi.fn()
}));

vi.mock('../shared/sceneInk', () => ({
  createInkFieldRenderer: vi.fn(() => boundaryRenderer)
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
    expect(transitionSource).toContain('createInkFieldFrame');
    expect(transitionSource).toContain('createInkFieldRenderer');
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
    receiver.connect('[data-aod-ink-canvas]', canvas);
    const timeline = await createStarMapAodTransition().buildTimeline(fixture.context);

    timeline.progress(0.5);

    const frame = boundaryRenderer.render.mock.lastCall?.[0] as InkFieldFrame;
    expect(frame.spec.kind).toBe('horizontal');
    expect(revealSurface.style.clipPath).toMatch(/^inset\(/);
    expect(revealSurface.style.clipPath).not.toContain('polygon(');
    expect(revealSurface.dataset.r4InkBoundaryRevision).toBeUndefined();
    expect(canvas.dataset.r4InkBoundaryRevision).toBeUndefined();
    expect(canvas.dataset.r4InkEffectOnly).toBe('true');
    expect(canvas.dataset.r4InkRenderer).toBe('field');

    timeline.dispose();
    timeline.dispose();

    expect(boundaryRenderer.destroy).toHaveBeenCalledOnce();
  });
});
