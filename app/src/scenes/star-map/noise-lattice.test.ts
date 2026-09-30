import { describe, expect, it, vi } from 'vitest';
import { createDesktopNoiseFrame, createNoiseLattice, desktopNoise2D } from './noise-lattice';
import type { StarNoiseConfig } from './starFieldReveal';

describe('cached star noise', () => {
  it('preserves the portrait field after separating the two rendering kernels', () => {
    const n: StarNoiseConfig = { profile: 'desktop-r5', seed: 42.7, scale: 3.8,
      warpScale: 2.1, warpAmount: .42, phaseSpeed: .66, driftX: .10, driftY: .46,
      warpSpeedX: .14, warpSpeedY: .12, octaves: 4, lacunarity: 2.07,
      gain: .51, ridgeMix: .17, thresholdLow: .45, thresholdHigh: .55 };
    const smooth = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
    for (const t of [-70, 0, 1.17, 21, 1000]) {
      const frame = createDesktopNoiseFrame(n, t, 16 / 9);
      for (let row = 0; row < 24; row += 1) {
        for (let col = 0; col < 36; col += 1) {
          const nx = col / 36, ny = row / 24;
          const wx = desktopNoise2D(nx * n.warpScale + t * n.warpSpeedX,
            ny * n.warpScale - t * n.warpSpeedY, 8.3) - .5;
          const wy = desktopNoise2D(nx * n.warpScale - t * n.warpSpeedY,
            ny * n.warpScale + t * n.warpSpeedX, 14.9) - .5;
          const phase = t * n.phaseSpeed, seedIndex = Math.floor(phase);
          const x = nx * n.scale + wx * n.warpAmount + t * n.driftX;
          const y = ny * n.scale + wy * n.warpAmount + t * n.driftY;
          const a = desktopNoise2D(x, y, n.seed + seedIndex * 19.31);
          const b = desktopNoise2D(x, y, n.seed + (seedIndex + 1) * 19.31);
          expect(frame(nx, ny)).toBe(a + (b - a) * smooth(phase - seedIndex));
        }
      }
    }
  });
  it('preserves the exact field across negative coordinates, seeds and lattice boundaries', () => {
    for (const seed of [8.3, 14.9, 42.7, 42.7 + 37 * 19.31]) {
      const sample = createNoiseLattice(-4.1, -2.4, 7.7, 6.2, seed);
      for (let y = -2.4; y <= 6.2; y += .137) {
        for (let x = -4.1; x <= 7.7; x += .173) {
          expect(sample(x, y, seed)).toBe(desktopNoise2D(x, y, seed));
        }
      }
      expect(sample(2, 3, seed)).toBe(desktopNoise2D(2, 3, seed));
      expect(sample(30, -10, seed)).toBe(desktopNoise2D(30, -10, seed));
      expect(sample(1, 1, seed + 1)).toBe(desktopNoise2D(1, 1, seed + 1));
    }
  });

  it('does not repeat transcendental work for pixels sharing the same lattice', () => {
    const sin = vi.spyOn(Math, 'sin');
    try {
      const sample = createNoiseLattice(0, 0, 4, 4, 42.7);
      const preparedCalls = sin.mock.calls.length;
      for (let i = 0; i < 10_000; i += 1) sample((i % 100) / 25, Math.floor(i / 100) / 25, 42.7);
      expect(sin).toHaveBeenCalledTimes(preparedCalls);
      expect(preparedCalls).toBe(36);
    } finally { sin.mockRestore(); }
  });

  it('bounds cache allocation for unexpected noise configurations', () => {
    expect(createNoiseLattice(0, 0, 100_000, 100_000, 1)).toBe(desktopNoise2D);
  });
});
