import { describe, expect, it, vi } from 'vitest';
import { createGradientNoiseFrame, createGradientPerlin } from './gradient-noise';
import type { StarNoiseConfig } from './starFieldReveal';

// Frozen pre-optimization implementation: compare numbers, not source spelling.
const OCTAVE_ROTATIONS = Object.freeze([
  Object.freeze({ cosine: 1, sine: 0 }),
  Object.freeze({ cosine: .7314, sine: .6820 }),
  Object.freeze({ cosine: -.2181, sine: .9759 }),
  Object.freeze({ cosine: -.9239, sine: .3827 }),
  Object.freeze({ cosine: -.5736, sine: -.8192 })
]);


function perlin2D(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = smoother(xf);
  const v = smoother(yf);
  const top = lerp(
    gradientDot(xi, yi, xf, yf, seed),
    gradientDot(xi + 1, yi, xf - 1, yf, seed),
    u
  );
  const bottom = lerp(
    gradientDot(xi, yi + 1, xf, yf - 1, seed),
    gradientDot(xi + 1, yi + 1, xf - 1, yf - 1, seed),
    u
  );
  return clamp(.5 + lerp(top, bottom, v) * .72, 0, 1);
}

function gradientDot(
  gridX: number,
  gridY: number,
  offsetX: number,
  offsetY: number,
  seed: number
): number {
  const gradient = hashIndex(gridX, gridY, seed) & 7;
  switch (gradient) {
    case 0: return offsetX;
    case 1: return -offsetX;
    case 2: return offsetY;
    case 3: return -offsetY;
    case 4: return (offsetX + offsetY) * .7071;
    case 5: return (-offsetX + offsetY) * .7071;
    case 6: return (offsetX - offsetY) * .7071;
    default: return (-offsetX - offsetY) * .7071;
  }
}

function fractalPerlin2D(
  x: number,
  y: number,
  seed: number,
  octaves: number,
  lacunarity: number,
  gain: number
): number {
  let frequency = 1;
  let amplitude = 1;
  let sum = 0;
  let normalization = 0;
  const count = Math.max(1, Math.round(octaves));

  for (let octave = 0; octave < count; octave += 1) {
    const rotation = OCTAVE_ROTATIONS[octave % OCTAVE_ROTATIONS.length]!;
    const rotatedX = (x * rotation.cosine - y * rotation.sine) * frequency;
    const rotatedY = (x * rotation.sine + y * rotation.cosine) * frequency;
    sum += perlin2D(rotatedX, rotatedY, seed + octave * 47.17) * amplitude;
    normalization += amplitude;
    frequency *= lacunarity;
    amplitude *= gain;
  }

  return normalization > 0 ? sum / normalization : .5;
}

function hashIndex(x: number, y: number, seed: number): number {
  const seedInt = Math.floor(seed * 4096);
  let hash = Math.imul(x, 374_761_393)
    ^ Math.imul(y, 668_265_263)
    ^ Math.imul(seedInt, 1_442_695_041);
  hash = Math.imul(hash ^ (hash >>> 13), 1_274_126_177);
  return (hash ^ (hash >>> 16)) >>> 0;
}

function smoother(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function originalField(noise: StarNoiseConfig, nx: number, ny: number, timeSeconds: number, aspectRatio: number) {
    // Noise coordinates are source-pixel isotropic before the shared camera
    // rotates them. Normalized x/y alone made the field look like a regular
    // stretched grid on a 16:9 map.
    const px = nx * Math.max(.01, aspectRatio);
    const py = ny;
    const warpX = fractalPerlin2D(
      px * noise.warpScale + timeSeconds * noise.warpSpeedX,
      py * noise.warpScale - timeSeconds * noise.warpSpeedY,
      noise.seed + 17.3,
      2,
      2.03,
      .54
    ) - .5;
    const warpY = fractalPerlin2D(
      px * noise.warpScale - timeSeconds * noise.warpSpeedY,
      py * noise.warpScale + timeSeconds * noise.warpSpeedX,
      noise.seed + 61.7,
      2,
      2.11,
      .52
    ) - .5;
    const x = px * noise.scale + warpX * noise.warpAmount + timeSeconds * noise.driftX;
    const y = py * noise.scale + warpY * noise.warpAmount + timeSeconds * noise.driftY;
    const base = fractalPerlin2D(
      x,
      y,
      noise.seed,
      noise.octaves,
      noise.lacunarity,
      noise.gain
    );
    const broad = fractalPerlin2D(
      x * .43 - timeSeconds * .011,
      y * .43 + timeSeconds * .014,
      noise.seed + 101.9,
      3,
      1.97,
      .56
    );
    const ridgeSource = fractalPerlin2D(
      x * 1.31 + warpY * .38,
      y * 1.31 - warpX * .38,
      noise.seed + 233.1,
      2,
      2.17,
      .48
    );
    const ridge = 1 - Math.abs(ridgeSource * 2 - 1);

    return clamp(
      base * (1 - noise.ridgeMix - .24)
        + broad * .24
        + ridge * noise.ridgeMix,
      0,
      1
    );
}
const noise: StarNoiseConfig = {
  profile: 'gradient-fbm', seed: 42.7, scale: 2.72, warpScale: 1.34,
  warpAmount: .86, phaseSpeed: .46, driftX: .028, driftY: .052,
  warpSpeedX: .031, warpSpeedY: .026, octaves: 4, lacunarity: 2.07,
  gain: .51, ridgeMix: .17, thresholdLow: .41, thresholdHigh: .64
};

describe('desktop gradient noise cache', () => {
  it('preserves the complete authored field exactly across time, aspect and seed', () => {
    for (const time of [-50, 0, 1.17, 43.3, 900, 12000]) {
      for (const aspect of [.5, 192 / 108, 2.8]) {
        const frame = createGradientNoiseFrame(noise, time, aspect);
        for (let row = 0; row < 17; row += 1) {
          for (let col = 0; col < 27; col += 1) {
            const nx = col / 27, ny = row / 17;
            expect(frame(nx, ny)).toBe(originalField(noise, nx, ny, time, aspect));
          }
        }
      }
    }
  });

  it('is exact at tile corners, negative coordinates and after the cache limit', () => {
    for (const seed of [0, -17.3, 42.7, 233.1]) {
      const sample = createGradientPerlin(seed);
      for (let tile = -40; tile <= 40; tile += 1) {
        for (const offset of [-.001, 0, .125, 31.999, 32]) {
          const x = tile * 32 + offset, y = -tile * 32 - offset;
          expect(sample(x, y)).toBe(perlin2D(x, y, seed));
        }
      }
      expect(sample(.1, .2)).toBe(perlin2D(.1, .2, seed));
    }
  });

  it('reuses integer gradients instead of hashing the same lattice for every pixel', () => {
    const sample = createGradientPerlin(42.7);
    sample(1, 1);
    const imul = vi.spyOn(Math, 'imul');
    try {
      for (let row = 0; row < 108; row += 1) {
        for (let col = 0; col < 192; col += 1) sample(col / 10, row / 10);
      }
      expect(imul).not.toHaveBeenCalled();
    } finally { imul.mockRestore(); }
  });
});
