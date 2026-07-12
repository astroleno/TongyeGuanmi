import { describe, expect, it } from 'vitest';
import {
  createInkFieldFrame,
  HORIZONTAL_INK_CORE_ALPHA_MIN,
  HORIZONTAL_INK_CORE_HALF_WIDTH_PX,
  inkOwnershipGateProgress,
  type InkDepthTransform,
  type InkFieldSpec
} from './inkField';
import { createHorizontalInkContour } from './horizontalInkContour';

const viewport = { width: 1440, height: 900 } as const;

describe('InkFieldFrame', () => {
  it('keeps Hero and Pattern radial origins as distinct authored contracts', () => {
    const heroField = {
      kind: 'radial',
      origin: { x: 0.5, y: 0.5 },
      seed: 'hero-pattern'
    } satisfies InkFieldSpec;
    const patternStarField = {
      kind: 'radial',
      origin: { x: 0.24, y: 0.55 },
      seed: 'pattern-star-map'
    } satisfies InkFieldSpec;

    expect(heroField).toMatchObject({ kind: 'radial', origin: { x: 0.5, y: 0.5 } });
    expect(patternStarField).toMatchObject({ kind: 'radial', origin: { x: 0.24, y: 0.55 } });
  });

  it.each([
    {
      name: 'top-to-bottom',
      spec: { kind: 'horizontal', direction: 'top-to-bottom', seed: 'method-bottom-figure2' }
    },
    {
      name: 'bottom-to-top',
      spec: { kind: 'horizontal', direction: 'bottom-to-top', seed: 'services-ttg' }
    }
  ] as const)('uses one supplied erosion contour for $name ownership', ({ spec }) => {
    const contour = createHorizontalInkContour({
      authoredSeed: spec.seed,
      variationKey: `epoch:${spec.direction}`
    });
    const frame = createInkFieldFrame(spec, 0.5, viewport, { contour });

    expect(frame.ownership.revealClip).toMatch(/^polygon\(/);
    expect(frame.ownership.concealClip).toMatch(/^polygon\(/);
    expect(frame.ownership.revealClip).not.toContain('inset(');
    expect(frame.contour).toBe(contour);
    expect(frame.revision).toBe(contour.revision);
    expect(frame.threshold).toBe(inkOwnershipGateProgress(0.5));
    expect(frame.occlusion.gateRank).toBe(frame.ownership.edge);
    expect(frame.occlusion.gateRank).toBeGreaterThanOrEqual(frame.occlusion.coreMin);
    expect(frame.occlusion.gateRank).toBeLessThanOrEqual(frame.occlusion.coreMax);
    expect(frame.occlusion.alphaMin).toBe(HORIZONTAL_INK_CORE_ALPHA_MIN);
    expect(frame.occlusion.coreMax - frame.occlusion.coreMin)
      .toBeCloseTo(HORIZONTAL_INK_CORE_HALF_WIDTH_PX * 2 / viewport.height, 8);
    expect(Object.keys(frame.occlusion).sort()).toEqual([
      'alphaMin',
      'coreMax',
      'coreMin',
      'gateRank'
    ]);
  });

  it('uses a hidden circle ownership gate for radial Ink', () => {
    const frame = createInkFieldFrame(
      { kind: 'radial', origin: { x: 0.5, y: 0.5 }, seed: 'hero-pattern' },
      0.5,
      viewport
    );

    expect(frame.ownership.revealClip).toMatch(/^circle\(/);
    expect(frame.ownership.concealClip).toBeNull();
    expect(frame.ownership.revealClip).not.toContain('polygon(');
    expect(frame.occlusion.gateRank).toBe(frame.ownership.edge);
    expect(frame.occlusion.gateRank).toBeGreaterThanOrEqual(frame.occlusion.coreMin);
    expect(frame.occlusion.gateRank).toBeLessThanOrEqual(frame.occlusion.coreMax);
    expect(frame.occlusion.alphaMin).toBe(0.92);
  });

  it('keeps the depth field texture transform in the frame without sampled geometry', () => {
    const transform = {
      viewport: { width: 1440, height: 900 },
      cover: { x: 0, y: -45, width: 1440, height: 990 },
      camera: {
        scale: 1.142,
        translateX: 0,
        translateY: -34,
        originX: 0.5,
        originY: 0.56
      }
    } satisfies InkDepthTransform;
    const frame = createInkFieldFrame(
      {
        kind: 'depth',
        depthSrc: '/images/figure2-middle-depth.png',
        seed: 'figure2-distance-expand',
        transform
      },
      0.5,
      viewport
    );

    expect(frame.spec).toMatchObject({ kind: 'depth', transform });
    expect(frame.ownership.revealClip).toBeNull();
    expect(frame.occlusion.gateRank).toBeCloseTo(0.5, 6);
    expect(Object.keys(frame.occlusion).sort()).toEqual([
      'alphaMin',
      'coreMax',
      'coreMin',
      'gateRank'
    ]);
    expect(frame).not.toHaveProperty('profile');
    expect(frame).not.toHaveProperty('revision');
  });

  it('keeps a depth ownership contour at the viewport edge during canvas fade-in and fade-out', () => {
    const transform = {
      viewport,
      cover: { x: 0, y: 0, width: viewport.width, height: viewport.height },
      camera: { scale: 1, translateX: 0, translateY: 0, originX: 0.5, originY: 0.5 }
    } satisfies InkDepthTransform;
    const spec = {
      kind: 'depth',
      depthSrc: '/images/figure2-middle-depth.png',
      seed: 'figure2-distance-expand',
      transform
    } satisfies InkFieldSpec;

    expect(createInkFieldFrame(spec, 0.03, viewport).occlusion.gateRank).toBe(0);
    expect(createInkFieldFrame(spec, 0.1, viewport).occlusion.gateRank).toBeCloseTo((0.1 - 0.06) / 0.88, 6);
    expect(createInkFieldFrame(spec, 0.9, viewport).occlusion.gateRank).toBeCloseTo((0.9 - 0.06) / 0.88, 6);
    expect(createInkFieldFrame(spec, 0.97, viewport).occlusion.gateRank).toBe(1);
  });

  it('is deterministic for the same seed, progress, and viewport', () => {
    const spec = {
      kind: 'horizontal',
      direction: 'bottom-to-top',
      seed: 'education-crane'
    } satisfies InkFieldSpec;

    expect(createInkFieldFrame(spec, 0.63, viewport)).toEqual(
      createInkFieldFrame(spec, 0.63, viewport)
    );
  });

  it('keeps one contour identity while threshold moves in either playback direction', () => {
    const spec = {
      kind: 'horizontal',
      direction: 'bottom-to-top',
      seed: 'education-crane'
    } satisfies InkFieldSpec;
    const contour = createHorizontalInkContour({
      authoredSeed: spec.seed,
      variationKey: 'epoch:bidirectional'
    });
    const early = createInkFieldFrame(spec, 0.2, viewport, { contour });
    const late = createInkFieldFrame(spec, 0.8, viewport, { contour });

    expect(early.contour).toBe(contour);
    expect(late.contour).toBe(contour);
    expect(early.revision).toBe(late.revision);
    expect(early.threshold).toBeLessThan(late.threshold);
    expect(early.ownership.revealClip).not.toBe(late.ownership.revealClip);
    expect(early.ownership.concealClip).not.toBe(late.ownership.concealClip);
  });
});
