export function desktopHash2(x: number, y: number, seed: number): number {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return value - Math.floor(value);
}

const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function desktopNoise2D(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const u = smoother(x - xi), v = smoother(y - yi);
  return lerp(
    lerp(desktopHash2(xi, yi, seed), desktopHash2(xi + 1, yi, seed), u),
    lerp(desktopHash2(xi, yi + 1, seed), desktopHash2(xi + 1, yi + 1, seed), u), v
  );
}

/** Cache the handful of lattice corners, not the full-resolution noise image.
 * Float64 keeps the existing field exact; millions of repeated sin() calls
 * become array reads. Each frame owns four small, bounded lattices.
 */
export function createNoiseLattice(
  minX: number, minY: number, maxX: number, maxY: number, seed: number
): typeof desktopNoise2D {
  const left = Math.floor(minX), top = Math.floor(minY);
  const width = Math.floor(maxX) - left + 2;
  const height = Math.floor(maxY) - top + 2;
  if (![left, top, width, height, seed].every(Number.isFinite)
    || width < 2 || height < 2 || width * height > 16_384) return desktopNoise2D;
  const values = new Float64Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      values[y * width + x] = desktopHash2(left + x, top + y, seed);
    }
  }
  return (x, y, requestedSeed) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const column = xi - left, row = yi - top;
    if (requestedSeed !== seed || column < 0 || row < 0
      || column >= width - 1 || row >= height - 1) return desktopNoise2D(x, y, requestedSeed);
    const index = row * width + column;
    const u = smoother(x - xi), v = smoother(y - yi);
    return lerp(
      lerp(values[index]!, values[index + 1]!, u),
      lerp(values[index + width]!, values[index + width + 1]!, u), v
    );
  };
}

/** The portrait treatment retains its authored R5 value-noise field. */
export const createDesktopNoiseFrame: StarNoiseFrameFactory = (n, t) => {
  const wx = t * n.warpSpeedX, wy = t * n.warpSpeedY;
  const dx = t * n.driftX, dy = t * n.driftY, margin = Math.abs(n.warpAmount) * .5;
  const phase = t * n.phaseSpeed, seedIndex = Math.floor(phase);
  const seed = n.seed + seedIndex * 19.31, nextSeed = n.seed + (seedIndex + 1) * 19.31;
  const mix = smoother(phase - seedIndex);
  const warpX = createNoiseLattice(wx, -wy, wx + n.warpScale, -wy + n.warpScale, 8.3);
  const warpY = createNoiseLattice(-wy, wx, -wy + n.warpScale, wx + n.warpScale, 14.9);
  const a = createNoiseLattice(dx - margin, dy - margin, dx + n.scale + margin, dy + n.scale + margin, seed);
  const b = createNoiseLattice(dx - margin, dy - margin, dx + n.scale + margin, dy + n.scale + margin, nextSeed);
  return (nx, ny) => {
    const x = nx * n.scale + (warpX(nx * n.warpScale + wx, ny * n.warpScale - wy, 8.3) - .5) * n.warpAmount + dx;
    const y = ny * n.scale + (warpY(nx * n.warpScale - wy, ny * n.warpScale + wx, 14.9) - .5) * n.warpAmount + dy;
    return lerp(a(x, y, seed), b(x, y, nextSeed), mix);
  };
};
import type { StarNoiseFrameFactory } from './starFieldReveal';
