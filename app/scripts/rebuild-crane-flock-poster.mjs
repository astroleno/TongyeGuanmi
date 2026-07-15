import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoDir = path.dirname(appDir);
const WIDTH = 1280;
const HEIGHT = 720;
const SOURCE_BYTES = 1_928_281;
const SOURCE_SHA256 = 'f0e7e56fb83b4ca19d6d8c0bc352d4786d7ab0cff58637482ac2a4c6efd0f079';
const OUTPUT_BYTES = 118_116;
const OUTPUT_SHA256 = 'cc3c35d6bf53ed5155aae22c64f1cd50cfc3b8864cbf23295fc0172a2a4b3ca4';
const CANONICAL_BYTES = 4_429_224;
const CANONICAL_SHA256 = '708f45223f0cea5af23449d947050a86e5ec1ac959385561fa663ff44da5c37a';

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

function assertFrozenFile(bytes, expectedBytes, expectedSha256, label) {
  if (bytes.byteLength !== expectedBytes || sha256(bytes) !== expectedSha256) {
    throw new Error(`${label} identity changed`);
  }
}

const source = argument(
  '--source',
  path.join(repoDir, 'archive/assets/homepage-media/2026-07-15/sources/crane-flock-first-frame-hires.png')
);
const output = argument(
  '--output',
  path.join(repoDir, 'archive/assets/homepage-media/2026-07-15/sources/crane-flock-first-frame-corrected.webp')
);
const evidenceDir = argument(
  '--evidence-dir',
  path.join(repoDir, 'artifacts/react-refactor/r5-flock-hires-frame0')
);

const sourceBytes = await readFile(source);
assertFrozenFile(sourceBytes, SOURCE_BYTES, SOURCE_SHA256, 'Crane flock high-resolution first frame');

const { stdout: ffmpegVersion } = await run('ffmpeg', ['-version'], { encoding: 'utf8' });
if (!/^ffmpeg version 8\.1(?:\s|$)/.test(ffmpegVersion)) {
  throw new Error('Crane flock first-frame rebuild requires frozen FFmpeg 8.1');
}

const workDir = await mkdtemp(path.join(tmpdir(), 'tongye-crane-flock-first-frame-'));
try {
  const correctedPng = path.join(workDir, 'corrected.png');
  await run('ffmpeg', [
    '-y', '-v', 'error', '-i', source,
    '-vf', `scale=${WIDTH}:${HEIGHT}:flags=lanczos,colorchannelmixer=rr=0.890:gg=0.893:bb=0.913:aa=1`,
    '-frames:v', '1', '-pix_fmt', 'rgba', correctedPng
  ]);

  await mkdir(path.dirname(output), { recursive: true });
  await run('cwebp', [
    '-quiet', '-lossless', '-m', '6', '-metadata', 'none', correctedPng, '-o', output
  ]);
  const outputBytes = await readFile(output);
  assertFrozenFile(outputBytes, OUTPUT_BYTES, OUTPUT_SHA256, 'Crane flock corrected first frame');

  await mkdir(evidenceDir, { recursive: true });
  const contactSheets = {
    transparent: path.join(evidenceDir, 'crane-flock-first-frame-transparent.png'),
    paper: path.join(evidenceDir, 'crane-flock-first-frame-paper.png'),
    black: path.join(evidenceDir, 'crane-flock-first-frame-black.png')
  };
  await copyFile(correctedPng, contactSheets.transparent);
  for (const [background, color] of [['paper', '0xede4d2'], ['black', 'black']]) {
    await run('ffmpeg', [
      '-y', '-v', 'error', '-f', 'lavfi', '-i', `color=c=${color}:s=${WIDTH}x${HEIGHT}`,
      '-i', correctedPng, '-filter_complex', '[0:v][1:v]overlay=format=auto,format=rgb24',
      '-frames:v', '1', contactSheets[background]
    ]);
  }

  const report = {
    source: { path: source, bytes: sourceBytes.byteLength, sha256: SOURCE_SHA256, dimensions: '3184x1792' },
    output: { path: output, bytes: outputBytes.byteLength, sha256: OUTPUT_SHA256, dimensions: `${WIDTH}x${HEIGHT}` },
    conversion: {
      kind: 'high-resolution-lanczos-downsample-and-motion-tone-match',
      rgbScale: { red: 0.890, green: 0.893, blue: 0.913 },
      alpha: 'source RGBA retained exactly after lossless WebP encode',
      runtimeSurface: false
    },
    contactSheets,
    downstreamCanonicalContract: {
      script: 'app/scripts/rebuild-crane-flock-media.mjs',
      operation: 'replace-frame-0-with-corrected-still',
      frames: 74,
      appendedFrames: 0,
      outputBytes: CANONICAL_BYTES,
      outputSha256: CANONICAL_SHA256
    }
  };
  await writeFile(
    path.join(evidenceDir, 'crane-flock-first-frame-hires-downsample.json'),
    `${JSON.stringify(report, null, 2)}\n`
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  await rm(workDir, { recursive: true, force: true });
}
