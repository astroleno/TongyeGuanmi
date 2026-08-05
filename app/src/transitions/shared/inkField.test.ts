import { describe, expect, it } from 'vitest';
import {
  createInkFieldFrame,
  HORIZONTAL_INK_CORE_ALPHA_MIN,
  HORIZONTAL_INK_CORE_HALF_WIDTH_PX,
  HORIZONTAL_INK_SOFT_EDGE_HALF_WIDTH_PX,
  inkOwnershipGateProgress,
  RADIAL_INK_CONTOUR_AMPLITUDE,
  type InkDepthTransform,
  type InkFieldSpec
} from './inkField';
import {
  createHorizontalInkContour,
  type HorizontalInkContour
} from './horizontalInkContour';

const viewport = { width: 1440, height: 900 } as const;

function parseRadialClipPoint(clipPath: string, index: number): Readonly<{ x: number; y: number }> {
  const points = clipPath.match(/^polygon\((.*)\)$/)?.[1]?.split(', ') ?? [];
  const point = points[index];
  const match = point?.match(/^(-?[0-9.]+)% (-?[0-9.]+)%$/);
  if (!match) throw new Error(`missing radial polygon point ${index}`);
  return {
    x: Number.parseFloat(match[1]!) / 100,
    y: Number.parseFloat(match[2]!) / 100
  };
}

function circularContourOffset(contour: HorizontalInkContour, angleRank: number): number {
  const count = contour.samples.length;
  const position = ((angleRank % 1 + 1) % 1) * count - .5;
  const left = Math.floor(position);
  const blend = position - left;
  const at = (index: number) => {
    const wrapped = (index % count + count) % count;
    return ((contour.samples[wrapped] ?? 128) / 255) * 2 - 1;
  };
  return at(left) + (at(left + 1) - at(left)) * blend;
}

function expectedRadialClipPoint(
  contour: HorizontalInkContour,
  boundaryRank: number,
  viewportSize: Readonly<{ width: number; height: number }>,
  origin: Readonly<{ x: number; y: number }>,
  index: number
): Readonly<{ x: number; y: number }> {
  const aspect = viewportSize.width / viewportSize.height;
  const originX = origin.x * aspect;
  const originY = 1 - origin.y;
  const angleRank = (index + .5) / contour.samples.length;
  const angle = angleRank * Math.PI * 2;
  const directionX = Math.cos(angle);
  const directionY = Math.sin(angle);
  const alongX = directionX > 0.000001
    ? (aspect - originX) / directionX
    : directionX < -0.000001 ? -originX / directionX : Number.POSITIVE_INFINITY;
  const alongY = directionY > 0.000001
    ? (1 - originY) / directionY
    : directionY < -0.000001 ? -originY / directionY : Number.POSITIVE_INFINITY;
  const edgeRadius = Math.min(alongX, alongY);
  const envelope = Math.sin(boundaryRank * Math.PI);
  const radius = edgeRadius
    * (1 + circularContourOffset(contour, angleRank) * RADIAL_INK_CONTOUR_AMPLITUDE * envelope)
    * boundaryRank;
  return {
    x: origin.x + Math.cos(angle) * radius / aspect,
    y: origin.y - Math.sin(angle) * radius
  };
}

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
    expect(frame.boundaryRank).toBe(inkOwnershipGateProgress(0.5));
    expect(frame.boundaryRank).toBeGreaterThanOrEqual(frame.occlusion.coreMin);
    expect(frame.boundaryRank).toBeLessThanOrEqual(frame.occlusion.coreMax);
    expect(frame.occlusion.alphaMin).toBe(HORIZONTAL_INK_CORE_ALPHA_MIN);
    expect(frame.occlusion.coreMax - frame.occlusion.coreMin)
      .toBeCloseTo(HORIZONTAL_INK_CORE_HALF_WIDTH_PX * 2 / viewport.height, 8);
    expect(HORIZONTAL_INK_SOFT_EDGE_HALF_WIDTH_PX).toBeGreaterThan(
      HORIZONTAL_INK_CORE_HALF_WIDTH_PX
    );
    expect(Object.keys(frame.occlusion).sort()).toEqual([
      'alphaMin',
      'coreMax',
      'coreMin',
    ]);
  });

  it('derives one deterministic noisy frontier from the radial boundary rank', () => {
    const frame = createInkFieldFrame(
      { kind: 'radial', origin: { x: 0.5, y: 0.5 }, seed: 'hero-pattern' },
      0.5,
      viewport
    );

    expect(frame).toMatchObject({
      boundaryRank: inkOwnershipGateProgress(0.5)
    });
    expect(frame.ownership).not.toHaveProperty('edge');
    expect(frame.ownership.revealClip).toMatch(/^polygon\(/);
    expect(frame.ownership.concealClip).toBeNull();
    expect(frame.ownership.revealClip).not.toContain('circle(');
    expect(frame).toHaveProperty('contour');
    expect((frame as typeof frame & {
      boundaryRank: number;
    }).boundaryRank).toBeGreaterThanOrEqual(frame.occlusion.coreMin);
    expect((frame as typeof frame & {
      boundaryRank: number;
    }).boundaryRank).toBeLessThanOrEqual(frame.occlusion.coreMax);
    expect(frame.occlusion.alphaMin).toBe(0.92);

    const same = createInkFieldFrame(
      { kind: 'radial', origin: { x: 0.5, y: 0.5 }, seed: 'hero-pattern' },
      0.5,
      viewport
    );
    const later = createInkFieldFrame(
      { kind: 'radial', origin: { x: 0.5, y: 0.5 }, seed: 'hero-pattern' },
      0.7,
      viewport
    );
    expect(frame.ownership.revealClip).toBe(same.ownership.revealClip);
    expect(frame.ownership.revealClip).not.toBe(later.ownership.revealClip);
  });

  it.each([.2, .5, .8])(
    'uses WebGL-equivalent circular texel centers for the radial frontier at rank %s',
    (rank) => {
      const contour = {
        seed: 1,
        revision: 'radial-center-contract',
        samples: Uint8Array.from([0, 255, 0, 255, 0, 255, 0, 255]),
        texture: new Uint8Array(8 * 4)
      } satisfies HorizontalInkContour;
      const radialViewport = { width: 393, height: 852 } as const;
      const origin = { x: .5, y: .44 } as const;
      const frame = createInkFieldFrame(
        { kind: 'radial', origin, seed: 'hero-pattern' },
        .06 + rank * .88,
        radialViewport,
        { contour }
      );
      const point = parseRadialClipPoint(frame.ownership.revealClip!, 0);
      const expected = expectedRadialClipPoint(
        contour,
        frame.boundaryRank,
        radialViewport,
        origin,
        0
      );
      const errorPx = Math.hypot(
        (point.x - expected.x) * radialViewport.width,
        (point.y - expected.y) * radialViewport.height
      );

      expect(errorPx).toBeLessThanOrEqual(.1);
    }
  );

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
    expect(frame.boundaryRank).toBeCloseTo(0.5, 6);
    expect(Object.keys(frame.occlusion).sort()).toEqual([
      'alphaMin',
      'coreMax',
      'coreMin',
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

    expect(createInkFieldFrame(spec, 0.03, viewport).boundaryRank).toBe(0);
    expect(createInkFieldFrame(spec, 0.1, viewport).boundaryRank).toBeCloseTo((0.1 - 0.06) / 0.88, 6);
    expect(createInkFieldFrame(spec, 0.9, viewport).boundaryRank).toBeCloseTo((0.9 - 0.06) / 0.88, 6);
    expect(createInkFieldFrame(spec, 0.97, viewport).boundaryRank).toBe(1);
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
    expect(early.boundaryRank).toBeLessThan(late.boundaryRank);
    expect(early.ownership.revealClip).not.toBe(late.ownership.revealClip);
    expect(early.ownership.concealClip).not.toBe(late.ownership.concealClip);
  });
});
