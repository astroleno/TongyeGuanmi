import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoDir = path.dirname(appDir);
const AUTHORITY_SHA256 = 'b96e13b85f85a70c0e71d2f9c11ac64aca1830fa6af3c1ee3b7272133cf09457';
const AUTHORITY_BYTES = 2_651_324;
const POSTER_SHA256 = '8c4d47ca59d21c14430c02b2d89605594463a018e28c25c7eeb8fd824f8910b4';
const POSTER_BYTES = 80_116;
const OUTPUT_SHA256 = 'a3ac363cf7dd37940f3467a1c4e5b1b2df067d4fdc4966e99e17679a32498164';
const OUTPUT_BYTES = 4_416_794;
const FRAME_COUNT = 74;
const FIXED_TRACK_UID = createHash('sha256')
  .update(`${AUTHORITY_SHA256}:${POSTER_SHA256}`)
  .digest()
  .subarray(0, 8);

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

function occurrences(bytes, needle, end = bytes.byteLength) {
  const indexes = [];
  for (let index = bytes.indexOf(needle); index >= 0 && index < end; index = bytes.indexOf(needle, index + 1)) {
    indexes.push(index);
  }
  return indexes;
}

function normalizeWebmTrackUid(bytes) {
  const headerEnd = Math.min(bytes.byteLength, 4096);
  const trackUidIndexes = occurrences(bytes, Buffer.from([0x73, 0xc5, 0x88]), headerEnd);
  if (trackUidIndexes.length !== 1) {
    throw new Error(`expected one WebM TrackUID, found ${trackUidIndexes.length}`);
  }
  const trackUidIndex = trackUidIndexes[0];
  const generatedTrackUid = Buffer.from(bytes.subarray(trackUidIndex + 3, trackUidIndex + 11));
  const tagTarget = Buffer.concat([Buffer.from([0x63, 0xc5, 0x88]), generatedTrackUid]);
  const tagTargetIndexes = occurrences(bytes, tagTarget, headerEnd);
  if (tagTargetIndexes.length !== 1) {
    throw new Error(`expected one WebM TagTrackUID, found ${tagTargetIndexes.length}`);
  }
  FIXED_TRACK_UID.copy(bytes, trackUidIndex + 3);
  FIXED_TRACK_UID.copy(bytes, tagTargetIndexes[0] + 3);
}

const authority = argument(
  '--authority',
  path.join(repoDir, 'archive/assets/homepage-media/2026-07-15/sources/crane-flock-74f-authority.webm')
);
const poster = argument('--poster', path.join(repoDir, 'assets/crane-flock-first-frame.webp'));
const output = argument('--output', path.join(repoDir, 'assets/crane-flock-motion.webm'));
assertFrozenFile(await readFile(authority), AUTHORITY_BYTES, AUTHORITY_SHA256, 'Crane flock authority');
assertFrozenFile(await readFile(poster), POSTER_BYTES, POSTER_SHA256, 'Crane flock corrected first frame');

const { stdout: ffmpegVersion } = await run('ffmpeg', ['-version'], { encoding: 'utf8' });
if (!/^ffmpeg version 8\.1(?:\s|$)/.test(ffmpegVersion)) {
  throw new Error('Crane flock canonical rebuild requires frozen FFmpeg 8.1');
}

const workDir = await mkdtemp(path.join(tmpdir(), 'tongye-crane-flock-frame0-'));
const framePattern = path.join(workDir, 'frame-%03d.png');
const firstFrame = path.join(workDir, 'frame-000.png');
const candidate = path.join(workDir, 'crane-flock-motion.webm');

try {
  await run('ffmpeg', [
    '-y', '-v', 'error', '-c:v', 'libvpx-vp9', '-i', authority,
    '-map', '0:v:0', '-fps_mode', 'passthrough', '-frames:v', String(FRAME_COUNT),
    '-pix_fmt', 'rgba', '-start_number', '0', framePattern
  ]);
  const decodedFrames = (await readdir(workDir)).filter((file) => /^frame-\d{3}\.png$/.test(file));
  if (decodedFrames.length !== FRAME_COUNT) {
    throw new Error(`Crane flock authority decoded ${decodedFrames.length} frames`);
  }
  await run('ffmpeg', [
    '-y', '-v', 'error', '-i', poster, '-frames:v', '1', '-pix_fmt', 'rgba', firstFrame
  ]);
  await run('ffmpeg', [
    '-y', '-v', 'error', '-fflags', '+bitexact', '-flags:v', '+bitexact',
    '-framerate', '30', '-start_number', '0', '-i', framePattern,
    '-map', '0:v:0', '-an', '-r', '30', '-frames:v', String(FRAME_COUNT),
    '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p',
    '-metadata:s:v:0', 'alpha_mode=1', '-b:v', '0', '-crf', '18',
    '-g', '8', '-keyint_min', '8', '-row-mt', '1', '-tile-columns', '2',
    '-frame-parallel', '1', '-auto-alt-ref', '0', '-lag-in-frames', '0',
    '-deadline', 'good', '-cpu-used', '2', '-map_metadata', '-1',
    '-map_chapters', '-1', '-write_crc32', '0', candidate
  ], { maxBuffer: 4 * 1024 * 1024 });

  const candidateBytes = await readFile(candidate);
  normalizeWebmTrackUid(candidateBytes);
  assertFrozenFile(candidateBytes, OUTPUT_BYTES, OUTPUT_SHA256, 'Crane flock canonical output');
  await writeFile(candidate, candidateBytes);
  await mkdir(path.dirname(output), { recursive: true });
  await copyFile(candidate, output);
} finally {
  await rm(workDir, { recursive: true, force: true });
}

process.stdout.write(`${JSON.stringify({
  authority,
  authoritySha256: AUTHORITY_SHA256,
  correctedFirstFrame: poster,
  correctedFirstFrameSha256: POSTER_SHA256,
  output,
  outputBytes: OUTPUT_BYTES,
  outputSha256: OUTPUT_SHA256,
  fps: 30,
  frames: FRAME_COUNT,
  replacedFrame: 0,
  appendedFrames: 0,
  alphaMerge: false,
  deterministicContainer: true,
  pass: true
})}\n`);
