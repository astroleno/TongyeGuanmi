import { describe, expect, it } from 'vitest';
import {
  HORIZONTAL_INK_CONTOUR_SAMPLES,
  createHorizontalInkContour,
  horizontalInkOffset,
  horizontalInkPolygon
} from './horizontalInkContour';

describe('horizontal Ink contour', () => {
  it('is stable for one transition invocation and varies across invocations', () => {
    const first = createHorizontalInkContour({
      authoredSeed: 'services-ttg',
      variationKey: 'epoch:1'
    });
    const replay = createHorizontalInkContour({
      authoredSeed: 'services-ttg',
      variationKey: 'epoch:1'
    });
    const nextRun = createHorizontalInkContour({
      authoredSeed: 'services-ttg',
      variationKey: 'epoch:2'
    });

    expect(first.samples).toHaveLength(HORIZONTAL_INK_CONTOUR_SAMPLES);
    expect(HORIZONTAL_INK_CONTOUR_SAMPLES).toBeGreaterThanOrEqual(128);
    expect(first.samples).toEqual(replay.samples);
    expect(first.revision).toBe(replay.revision);
    expect(first.seed).toBe(replay.seed);
    expect(nextRun.revision).not.toBe(first.revision);
    expect(nextRun.seed).not.toBe(first.seed);
    expect(nextRun.samples).not.toEqual(first.samples);
  });

  it('interpolates bounded signed offsets from smoothed byte samples', () => {
    const contour = createHorizontalInkContour({
      authoredSeed: 'lab-ph',
      variationKey: 'epoch:11'
    });

    for (let index = 1; index < contour.samples.length; index += 1) {
      expect(Math.abs((contour.samples[index] ?? 0) - (contour.samples[index - 1] ?? 0)))
        .toBeLessThanOrEqual(96);
    }
    for (const x of [-1, 0, 0.125, 0.5, 0.875, 1, 2]) {
      expect(horizontalInkOffset(contour, x)).toBeGreaterThanOrEqual(-1);
      expect(horizontalInkOffset(contour, x)).toBeLessThanOrEqual(1);
    }
  });

  it('serializes complementary bottom-to-top reveal and conceal polygons', () => {
    const contour = createHorizontalInkContour({
      authoredSeed: 'education-crane',
      variationKey: 'epoch:21'
    });
    const reveal = horizontalInkPolygon(contour, 'bottom-to-top', 0.5, 'reveal');
    const conceal = horizontalInkPolygon(contour, 'bottom-to-top', 0.5, 'conceal');

    expect(reveal).toMatch(/^polygon\(/);
    expect(conceal).toMatch(/^polygon\(/);
    expect(reveal).not.toBe(conceal);
    expect(reveal).toContain('0.000% 100.000%');
    expect(reveal).toContain('100.000% 100.000%');
    expect(conceal).toContain('0.000% 0.000%');
    expect(conceal).toContain('100.000% 0.000%');
  });

  it('collapses erosion at both endpoints for both field directions', () => {
    const contour = createHorizontalInkContour({
      authoredSeed: 'brand-figure3',
      variationKey: 'epoch:31'
    });

    expect(horizontalInkPolygon(contour, 'bottom-to-top', 0, 'reveal'))
      .toContain('50.000% 100.000%');
    expect(horizontalInkPolygon(contour, 'bottom-to-top', 1, 'reveal'))
      .toContain('50.000% 0.000%');
    expect(horizontalInkPolygon(contour, 'top-to-bottom', 0, 'reveal'))
      .toContain('50.000% 0.000%');
    expect(horizontalInkPolygon(contour, 'top-to-bottom', 1, 'reveal'))
      .toContain('50.000% 100.000%');
  });
});
