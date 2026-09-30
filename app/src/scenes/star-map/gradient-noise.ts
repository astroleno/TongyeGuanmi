import type { StarNoiseFrameFactory } from './starFieldReveal';

const OCTAVE_ROTATIONS = [
  { cosine: 1, sine: 0 },
  { cosine: .7314, sine: .6820 },
  { cosine: -.2181, sine: .9759 },
  { cosine: -.9239, sine: .3827 },
  { cosine: -.5736, sine: -.8192 }
];
const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (value: number) => Math.min(1, Math.max(0, value));

function gradientIndex(x: number, y: number, seedInt: number): number {
  let hash = Math.imul(x, 374_761_393) ^ Math.imul(y, 668_265_263)
    ^ Math.imul(seedInt, 1_442_695_041);
  hash = Math.imul(hash ^ (hash >>> 13), 1_274_126_177);
  return (hash ^ (hash >>> 16)) & 7;
}

function dot(gradient: number, x: number, y: number): number {
  switch (gradient) {
    case 0: return x;
    case 1: return -x;
    case 2: return y;
    case 3: return -y;
    case 4: return (x + y) * .7071;
    case 5: return (-x + y) * .7071;
    case 6: return (x - y) * .7071;
    default: return (-x - y) * .7071;
  }
}

/** Cache integer gradients, preserving the hash and floating-point operation order.
 * Each 32×32 tile includes its right/bottom corner. A frame owns at most 32 tiles
 * per octave (34 KiB); unusual configurations fall back to the same exact hash.
 */
export function createGradientPerlin(seed: number): (x: number, y: number) => number {
  const seedInt = Math.floor(seed * 4096);
  const tiles = new Map<string, Uint8Array>();
  let left = Infinity, top = Infinity, tile: Uint8Array | undefined;
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    if (xi < left || xi >= left + 32 || yi < top || yi >= top + 32) {
      left = Math.floor(xi / 32) * 32;
      top = Math.floor(yi / 32) * 32;
      const key = `${left}:${top}`;
      tile = tiles.get(key);
      if (!tile && tiles.size < 32 && Number.isFinite(left + top)) {
        tile = new Uint8Array(33 * 33);
        for (let row = 0; row <= 32; row += 1) {
          for (let col = 0; col <= 32; col += 1) {
            tile[row * 33 + col] = gradientIndex(left + col, top + row, seedInt);
          }
        }
        tiles.set(key, tile);
      }
    }
    const index = (yi - top) * 33 + xi - left;
    const xf = x - xi, yf = y - yi, u = smoother(xf), v = smoother(yf);
    const a = tile?.[index] ?? gradientIndex(xi, yi, seedInt);
    const b = tile?.[index + 1] ?? gradientIndex(xi + 1, yi, seedInt);
    const c = tile?.[index + 33] ?? gradientIndex(xi, yi + 1, seedInt);
    const d = tile?.[index + 34] ?? gradientIndex(xi + 1, yi + 1, seedInt);
    return clamp(.5 + lerp(
      lerp(dot(a, xf, yf), dot(b, xf - 1, yf), u),
      lerp(dot(c, xf, yf - 1), dot(d, xf - 1, yf - 1), u), v
    ) * .72);
  };
}

function createFractalPerlin(seed: number, octaves: number, lacunarity: number, gain: number) {
  const count = Math.max(1, Math.round(octaves));
  const layers: Array<{ cosine: number; sine: number; frequency: number; amplitude: number; sample: ReturnType<typeof createGradientPerlin> }> = [];
  let frequency = 1, amplitude = 1, normalization = 0;
  for (let octave = 0; octave < count; octave += 1) {
    layers.push({ ...OCTAVE_ROTATIONS[octave % OCTAVE_ROTATIONS.length]!, frequency, amplitude,
      sample: createGradientPerlin(seed + octave * 47.17) });
    normalization += amplitude;
    frequency *= lacunarity;
    amplitude *= gain;
  }
  return (x: number, y: number) => {
    let sum = 0;
    for (const layer of layers) {
      sum += layer.sample(
        (x * layer.cosine - y * layer.sine) * layer.frequency,
        (x * layer.sine + y * layer.cosine) * layer.frequency
      ) * layer.amplitude;
    }
    return normalization > 0 ? sum / normalization : .5;
  };
}

/** Desktop-only gradient-fBm kernel; portrait does not load this algorithm. */
export const createGradientNoiseFrame: StarNoiseFrameFactory = (noise, time, aspectRatio) => {
  const warpX = createFractalPerlin(noise.seed + 17.3, 2, 2.03, .54);
  const warpY = createFractalPerlin(noise.seed + 61.7, 2, 2.11, .52);
  const base = createFractalPerlin(noise.seed, noise.octaves, noise.lacunarity, noise.gain);
  const broad = createFractalPerlin(noise.seed + 101.9, 3, 1.97, .56);
  const ridge = createFractalPerlin(noise.seed + 233.1, 2, 2.17, .48);
  return (nx, ny) => {
    const px = nx * Math.max(.01, aspectRatio), py = ny;
    const wx = warpX(px * noise.warpScale + time * noise.warpSpeedX,
      py * noise.warpScale - time * noise.warpSpeedY) - .5;
    const wy = warpY(px * noise.warpScale - time * noise.warpSpeedY,
      py * noise.warpScale + time * noise.warpSpeedX) - .5;
    const x = px * noise.scale + wx * noise.warpAmount + time * noise.driftX;
    const y = py * noise.scale + wy * noise.warpAmount + time * noise.driftY;
    const ridgeValue = 1 - Math.abs(ridge(x * 1.31 + wy * .38, y * 1.31 - wx * .38) * 2 - 1);
    return clamp(base(x, y) * (1 - noise.ridgeMix - .24)
      + broad(x * .43 - time * .011, y * .43 + time * .014) * .24
      + ridgeValue * noise.ridgeMix);
  };
};
