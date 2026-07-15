import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoDir = path.dirname(appDir);
const WIDTH = 1280;
const HEIGHT = 720;
const EXTERIOR_ALPHA_THRESHOLD = 7;
const EXTERIOR_RGB_FLOOR = 225;
const EXTERIOR_RGB_CHROMA_MAX = 8;
const INTERIOR_TRANSPARENCY_SEEDS = [
  { x: 1026, y: 242, label: 'upper-right-leg-gap' },
  { x: 825, y: 529, label: 'lower-leg-gap' }
];
const SOURCE_BYTES = 354_266;
const SOURCE_SHA256 = 'f4a1b1572b8743ae2c1a3a187abc7cc6b772f26ff63fbf19093bb10d8849cde3';

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a path`);
  return path.resolve(value);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function exteriorFloodFill(input) {
  const pixelCount = WIDTH * HEIGHT;
  if (input.byteLength !== pixelCount * 4) {
    throw new Error(`raw RGBA bytes ${input.byteLength} != ${pixelCount * 4}`);
  }
  const output = Buffer.from(input);
  const exterior = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;
  const isExteriorBackground = (pixel) => {
    const rgbaIndex = pixel * 4;
    const red = input[rgbaIndex];
    const green = input[rgbaIndex + 1];
    const blue = input[rgbaIndex + 2];
    const alpha = input[rgbaIndex + 3];
    const minimum = Math.min(red, green, blue);
    const maximum = Math.max(red, green, blue);
    return alpha <= EXTERIOR_ALPHA_THRESHOLD
      && minimum >= EXTERIOR_RGB_FLOOR
      && maximum - minimum <= EXTERIOR_RGB_CHROMA_MAX;
  };
  const enqueue = (pixel) => {
    if (exterior[pixel] || !isExteriorBackground(pixel)) return;
    exterior[pixel] = 1;
    queue[tail] = pixel;
    tail += 1;
  };

  for (let x = 0; x < WIDTH; x += 1) {
    enqueue(x);
    enqueue((HEIGHT - 1) * WIDTH + x);
  }
  for (let y = 1; y < HEIGHT - 1; y += 1) {
    enqueue(y * WIDTH);
    enqueue(y * WIDTH + WIDTH - 1);
  }
  while (head < tail) {
    const pixel = queue[head];
    head += 1;
    const x = pixel % WIDTH;
    if (x > 0) enqueue(pixel - 1);
    if (x + 1 < WIDTH) enqueue(pixel + 1);
    if (pixel >= WIDTH) enqueue(pixel - WIDTH);
    if (pixel + WIDTH < pixelCount) enqueue(pixel + WIDTH);
  }

  const restoredTransparentComponents = [];
  for (const seed of INTERIOR_TRANSPARENCY_SEEDS) {
    const seedPixel = seed.y * WIDTH + seed.x;
    if (input[seedPixel * 4 + 3] > EXTERIOR_ALPHA_THRESHOLD) {
      throw new Error(`Crane poster transparency seed ${seed.label} is no longer passable`);
    }
    const componentStart = tail;
    enqueue(seedPixel);
    let minX = WIDTH;
    let minY = HEIGHT;
    let maxX = 0;
    let maxY = 0;
    while (head < tail) {
      const pixel = queue[head];
      head += 1;
      const x = pixel % WIDTH;
      const y = Math.floor(pixel / WIDTH);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      if (x > 0) enqueue(pixel - 1);
      if (x + 1 < WIDTH) enqueue(pixel + 1);
      if (pixel >= WIDTH) enqueue(pixel - WIDTH);
      if (pixel + WIDTH < pixelCount) enqueue(pixel + WIDTH);
    }
    restoredTransparentComponents.push({
      ...seed,
      pixels: tail - componentStart,
      bbox: [minX, minY, maxX, maxY]
    });
  }

  let filledInterior = 0;
  let preservedBoundary = 0;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const alphaIndex = pixel * 4 + 3;
    if (exterior[pixel]) {
      output[alphaIndex] = 0;
      continue;
    }
    const x = pixel % WIDTH;
    const y = Math.floor(pixel / WIDTH);
    let boundary = false;
    for (let offsetY = -1; offsetY <= 1 && !boundary; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        const nextX = x + offsetX;
        const nextY = y + offsetY;
        if (
          nextX < 0
          || nextX >= WIDTH
          || nextY < 0
          || nextY >= HEIGHT
          || exterior[nextY * WIDTH + nextX]
        ) {
          boundary = true;
          break;
        }
      }
    }
    if (boundary) {
      preservedBoundary += 1;
    } else {
      if (output[alphaIndex] !== 255) filledInterior += 1;
      output[alphaIndex] = 255;
    }
  }
  return {
    output,
    exteriorPixels: tail,
    filledInterior,
    preservedBoundary,
    restoredTransparentComponents
  };
}

const source = argument(
  '--source',
  path.join(repoDir, 'archive/assets/homepage-media/2026-07-15/sources/crane-flock-first-frame-flawed.png')
);
const output = argument(
  '--output',
  path.join(repoDir, 'assets/crane-flock-first-frame.webp')
);
const evidenceDir = argument(
  '--evidence-dir',
  path.join(repoDir, 'artifacts/react-refactor/r5-flock-poster')
);

const sourceBytes = await readFile(source);
if (sourceBytes.byteLength !== SOURCE_BYTES || sha256(sourceBytes) !== SOURCE_SHA256) {
  throw new Error('Crane flock first-frame source identity changed');
}

const workDir = await mkdtemp(path.join(tmpdir(), 'tongye-crane-flock-poster-'));
try {
  const rawSource = path.join(workDir, 'source.rgba');
  const rawCorrected = path.join(workDir, 'corrected.rgba');
  const correctedPng = path.join(workDir, 'corrected.png');
  await run('ffmpeg', [
    '-y', '-v', 'error', '-i', source,
    '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', rawSource
  ]);
  const correction = exteriorFloodFill(await readFile(rawSource));
  await writeFile(rawCorrected, correction.output);
  await run('ffmpeg', [
    '-y', '-v', 'error',
    '-f', 'rawvideo', '-pixel_format', 'rgba', '-video_size', `${WIDTH}x${HEIGHT}`,
    '-i', rawCorrected, '-frames:v', '1', correctedPng
  ]);
  await mkdir(path.dirname(output), { recursive: true });
  await run('cwebp', [
    '-quiet', '-lossless', '-m', '6', '-metadata', 'none', correctedPng, '-o', output
  ]);
  await mkdir(evidenceDir, { recursive: true });
  const contactSheets = {
    transparent: path.join(evidenceDir, 'crane-flock-first-frame-transparent.png'),
    paper: path.join(evidenceDir, 'crane-flock-first-frame-paper.png'),
    black: path.join(evidenceDir, 'crane-flock-first-frame-black.png')
  };
  await writeFile(contactSheets.transparent, await readFile(correctedPng));
  for (const [background, color] of [['paper', '0xede4d2'], ['black', 'black']]) {
    await run('ffmpeg', [
      '-y', '-v', 'error', '-f', 'lavfi', '-i', `color=c=${color}:s=${WIDTH}x${HEIGHT}`,
      '-i', correctedPng, '-filter_complex', '[0:v][1:v]overlay=format=auto,format=rgb24',
      '-frames:v', '1', contactSheets[background]
    ]);
  }
  const outputBytes = await readFile(output);
  const report = {
    source: { path: source, bytes: sourceBytes.byteLength, sha256: SOURCE_SHA256 },
    output: { path: output, bytes: outputBytes.byteLength, sha256: sha256(outputBytes) },
    correction: {
      kind: 'exterior-flood-fill',
      alphaThreshold: EXTERIOR_ALPHA_THRESHOLD,
      rgbFloor: EXTERIOR_RGB_FLOOR,
      rgbChromaMax: EXTERIOR_RGB_CHROMA_MAX,
      exteriorPixels: correction.exteriorPixels,
      filledInterior: correction.filledInterior,
      preservedBoundary: correction.preservedBoundary,
      restoredTransparentComponents: correction.restoredTransparentComponents
    },
    contactSheets,
    downstreamCanonicalContract: {
      script: 'app/scripts/rebuild-crane-flock-media.mjs',
      operation: 'replace-frame-0-with-corrected-poster',
      frames: 74,
      appendedFrames: 0,
      outputBytes: 4_416_794,
      outputSha256: 'a3ac363cf7dd37940f3467a1c4e5b1b2df067d4fdc4966e99e17679a32498164'
    }
  };
  await writeFile(
    path.join(evidenceDir, 'crane-flock-first-frame-flood-fill.json'),
    `${JSON.stringify(report, null, 2)}\n`
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  await rm(workDir, { recursive: true, force: true });
}
