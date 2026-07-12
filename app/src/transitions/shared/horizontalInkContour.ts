export const HORIZONTAL_INK_CONTOUR_SAMPLES = 32;
export const HORIZONTAL_INK_CONTOUR_AMPLITUDE = 0.055;

export type HorizontalInkDirection = 'bottom-to-top' | 'top-to-bottom';
export type HorizontalInkOwnership = 'reveal' | 'conceal';

export type HorizontalInkContour = Readonly<{
  seed: number;
  revision: string;
  samples: Uint8Array;
}>;

type HorizontalInkContourInput = Readonly<{
  authoredSeed: string;
  variationKey: string;
}>;

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function contourSamples(seed: number): Uint8Array {
  let state = seed;
  let value = 128;
  return Uint8Array.from({ length: HORIZONTAL_INK_CONTOUR_SAMPLES }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    value = clamp(value + ((state >>> 24) - 128) * 0.25, 24, 231);
    return Math.round(value);
  });
}

export function createHorizontalInkContour(input: HorizontalInkContourInput): HorizontalInkContour {
  const seed = hashString(`${input.authoredSeed}:${input.variationKey}`);
  const samples = contourSamples(seed);
  return Object.freeze({
    seed,
    revision: `horizontal-ink-contour-v1-${seed.toString(16)}`,
    samples
  });
}

export function horizontalInkOffset(contour: HorizontalInkContour, x: number): number {
  const position = clamp(Number.isFinite(x) ? x : 0) * Math.max(0, contour.samples.length - 1);
  const leftIndex = Math.floor(position);
  const rightIndex = Math.min(contour.samples.length - 1, leftIndex + 1);
  const blend = position - leftIndex;
  const left = ((contour.samples[leftIndex] ?? 128) / 255) * 2 - 1;
  const right = ((contour.samples[rightIndex] ?? 128) / 255) * 2 - 1;
  return clamp(left + (right - left) * blend, -1, 1);
}

function percent(value: number): string {
  return `${(clamp(value) * 100).toFixed(3)}%`;
}

export function horizontalInkPolygon(
  contour: HorizontalInkContour,
  direction: HorizontalInkDirection,
  threshold: number,
  ownership: HorizontalInkOwnership
): string {
  const normalizedThreshold = clamp(Number.isFinite(threshold) ? threshold : 0);
  const envelope = Math.sin(normalizedThreshold * Math.PI);
  const boundary = Array.from({ length: contour.samples.length + 1 }, (_, index) => {
    const x = index / contour.samples.length;
    const offset = horizontalInkOffset(contour, x) * HORIZONTAL_INK_CONTOUR_AMPLITUDE * envelope;
    const y = direction === 'bottom-to-top'
      ? 1 - normalizedThreshold + offset
      : normalizedThreshold - offset;
    return `${percent(x)} ${percent(y)}`;
  });
  const ownsBottom = (direction === 'bottom-to-top') === (ownership === 'reveal');
  const outerY = ownsBottom ? '100.000%' : '0.000%';
  return `polygon(0.000% ${outerY}, ${boundary.join(', ')}, 100.000% ${outerY})`;
}
