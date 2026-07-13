import { describe, expect, it } from 'vitest';
import {
  HORIZONTAL_INK_CONTOUR_AMPLITUDE,
  HORIZONTAL_INK_CONTOUR_SAMPLES,
  createHorizontalInkContour,
  horizontalInkBandOffset,
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
    expect(HORIZONTAL_INK_CONTOUR_SAMPLES).toBe(256);
    expect(first.texture).toHaveLength(HORIZONTAL_INK_CONTOUR_SAMPLES * 4);
    expect(first.samples).toEqual(replay.samples);
    expect(first.revision).toBe(replay.revision);
    expect(first.seed).toBe(replay.seed);
    expect(nextRun.revision).not.toBe(first.revision);
    expect(nextRun.seed).not.toBe(first.seed);
    expect(nextRun.samples).not.toEqual(first.samples);
  });

  it('keeps independent macro, meso, micro, and erosion frequency bands', () => {
    const contour = createHorizontalInkContour({
      authoredSeed: 'multiscale-contour',
      variationKey: 'epoch:7'
    });
    const transitions = (samples: Uint8Array) => samples.reduce((count, value, index) => (
      index > 0 && (value >= 128) !== ((samples[index - 1] ?? 128) >= 128)
        ? count + 1
        : count
    ), 0);
    const bandSamples = (band: 'macro' | 'meso' | 'micro' | 'erosion') => {
      const channel = ['macro', 'meso', 'micro', 'erosion'].indexOf(band);
      return Uint8Array.from(contour.samples, (_, index) => contour.texture[index * 4 + channel] ?? 128);
    };
    const macro = bandSamples('macro');
    const meso = bandSamples('meso');
    const micro = bandSamples('micro');
    const erosion = bandSamples('erosion');

    expect(macro).not.toEqual(meso);
    expect(meso).not.toEqual(micro);
    expect(transitions(micro)).toBeGreaterThan(transitions(macro));
    expect(transitions(erosion)).toBeGreaterThan(transitions(meso));
    for (const band of ['macro', 'meso', 'micro', 'erosion'] as const) {
      expect(horizontalInkBandOffset(contour, band, 0.5)).toBeGreaterThanOrEqual(-1);
      expect(horizontalInkBandOffset(contour, band, 0.5)).toBeLessThanOrEqual(1);
    }
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
    expect(reveal.match(/%/g)).toHaveLength((HORIZONTAL_INK_CONTOUR_SAMPLES + 2) * 2);
    expect(conceal.match(/%/g)).toHaveLength((HORIZONTAL_INK_CONTOUR_SAMPLES + 2) * 2);
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
      .toMatch(/^polygon\([^)]*% 100\.000%(?:, [^)]*% 100\.000%)*\)$/);
    expect(horizontalInkPolygon(contour, 'bottom-to-top', 1, 'reveal'))
      .toContain('49.804% 0.000%');
    expect(horizontalInkPolygon(contour, 'top-to-bottom', 0, 'reveal'))
      .toContain('49.804% 0.000%');
    expect(horizontalInkPolygon(contour, 'top-to-bottom', 1, 'reveal'))
      .toContain('49.804% 100.000%');
  });

  it('places CSS vertices on the exact texture sample coordinates', () => {
    const contour = createHorizontalInkContour({
      authoredSeed: 'exact-contour',
      variationKey: 'epoch:41'
    });
    const threshold = 0.5;
    const polygon = horizontalInkPolygon(contour, 'bottom-to-top', threshold, 'reveal');

    for (const index of [0, 1, 64, contour.samples.length - 1]) {
      const x = index / (contour.samples.length - 1);
      const y = 1 - threshold + horizontalInkOffset(contour, x) * HORIZONTAL_INK_CONTOUR_AMPLITUDE;
      expect(polygon).toContain(`${(x * 100).toFixed(3)}% ${(y * 100).toFixed(3)}%`);
    }
  });
});
