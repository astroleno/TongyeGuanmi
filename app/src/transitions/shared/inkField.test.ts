import { describe, expect, it } from 'vitest';
import {
  createInkFieldFrame,
  type InkDepthTransform,
  type InkFieldSpec
} from './inkField';

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
  ] as const)('uses a hidden inset ownership gate for $name Ink', ({ spec }) => {
    const frame = createInkFieldFrame(spec, 0.5, viewport);

    expect(frame.ownership.revealClip).toMatch(/^inset\(/);
    expect(frame.ownership.concealClip).toMatch(/^inset\(/);
    expect(frame.ownership.revealClip).not.toContain('polygon(');
    expect(frame.occlusion.gateRank).toBe(frame.ownership.edge);
    expect(frame.occlusion.gateRank).toBeGreaterThanOrEqual(frame.occlusion.coreMin);
    expect(frame.occlusion.gateRank).toBeLessThanOrEqual(frame.occlusion.coreMax);
    expect(frame.occlusion.alphaMin).toBe(0.92);
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
});
