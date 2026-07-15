import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

const execFileAsync = promisify(execFile);
const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoDir = path.dirname(appDir);
const AUTHORITY_SHA256 = '995c0737bda965643175ac4a83aa2fa92cdcffddfa7c69a0c59b884fefabbdec';
const AUTHORITY_BYTES = 5_637_648;
const OUTPUT_SHA256 = 'a66a6778bda2a6c2e3fb5241a69ba4f1e4422a1638608f6cc5eba57e8f53c2b9';
const OUTPUT_BYTES = 3_218_940;
const FIXED_TRACK_UID = Buffer.from(AUTHORITY_SHA256.slice(0, 16), 'hex');

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a path`);
  }
  return path.resolve(value);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertFrozenFile(bytes, expectedBytes, expectedSha256, label) {
  if (bytes.byteLength !== expectedBytes) {
    throw new Error(`${label} bytes ${bytes.byteLength} != ${expectedBytes}`);
  }
  const actualSha256 = sha256(bytes);
  if (actualSha256 !== expectedSha256) {
    throw new Error(`${label} SHA-256 ${actualSha256} != ${expectedSha256}`);
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
  // FFmpeg's WebM muxer writes a random TrackUID even with bitexact flags.
  // Normalize the TrackUID and its tag target to the authority SHA prefix so
  // the frozen FFmpeg/libvpx toolchain produces a byte-identical container.
  const headerEnd = Math.min(bytes.byteLength, 4096);
  const trackUidHeader = Buffer.from([0x73, 0xc5, 0x88]);
  const trackUidIndexes = occurrences(bytes, trackUidHeader, headerEnd);
  if (trackUidIndexes.length !== 1) {
    throw new Error(`expected one WebM TrackUID in header, found ${trackUidIndexes.length}`);
  }
  const trackUidIndex = trackUidIndexes[0];
  const generatedTrackUid = Buffer.from(bytes.subarray(trackUidIndex + 3, trackUidIndex + 11));
  const tagTarget = Buffer.concat([Buffer.from([0x63, 0xc5, 0x88]), generatedTrackUid]);
  const tagTargetIndexes = occurrences(bytes, tagTarget, headerEnd);
  if (tagTargetIndexes.length !== 1) {
    throw new Error(`expected one WebM TagTrackUID in header, found ${tagTargetIndexes.length}`);
  }
  FIXED_TRACK_UID.copy(bytes, trackUidIndex + 3);
  FIXED_TRACK_UID.copy(bytes, tagTargetIndexes[0] + 3);
}

const authority = argument(
  '--authority',
  path.resolve(repoDir, '..', 'TongyeGuanmi', 'assets/crane-figure1-transition.webm')
);
const output = argument('--output', path.join(repoDir, 'assets/crane-figure-motion.webm'));
const authorityBytes = await readFile(authority);
assertFrozenFile(authorityBytes, AUTHORITY_BYTES, AUTHORITY_SHA256, 'Crane RGBA authority');

const { stdout: ffmpegVersion } = await execFileAsync('ffmpeg', ['-version'], { encoding: 'utf8' });
if (!/^ffmpeg version 8\.1(?:\s|$)/.test(ffmpegVersion)) {
  throw new Error('Crane canonical rebuild requires frozen FFmpeg 8.1');
}

const workDir = await mkdtemp(path.join(tmpdir(), 'tongye-crane-rgba-rebuild-'));
const candidate = path.join(workDir, 'crane-figure-motion.webm');

try {
  await execFileAsync('ffmpeg', [
    '-y', '-v', 'error',
    '-fflags', '+bitexact',
    '-flags:v', '+bitexact',
    '-c:v', 'libvpx-vp9',
    '-i', authority,
    '-vf', 'fps=30,setpts=N/(30*TB)',
    '-map', '0:v:0',
    '-an',
    '-r', '30',
    '-frames:v', '75',
    '-c:v', 'libvpx-vp9',
    '-pix_fmt', 'yuva420p',
    '-metadata:s:v:0', 'alpha_mode=1',
    '-b:v', '0',
    '-crf', '26',
    '-g', '8',
    '-keyint_min', '8',
    '-row-mt', '1',
    '-tile-columns', '2',
    '-frame-parallel', '1',
    '-auto-alt-ref', '0',
    '-lag-in-frames', '0',
    '-deadline', 'good',
    '-cpu-used', '2',
    '-tune', 'ssim',
    '-map_metadata', '-1',
    '-map_chapters', '-1',
    '-write_crc32', '0',
    candidate
  ], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });

  const candidateBytes = await readFile(candidate);
  normalizeWebmTrackUid(candidateBytes);
  assertFrozenFile(candidateBytes, OUTPUT_BYTES, OUTPUT_SHA256, 'Crane canonical output');
  await writeFile(candidate, candidateBytes);
  await copyFile(candidate, output);
} finally {
  await rm(workDir, { recursive: true, force: true });
}

process.stdout.write(`${JSON.stringify({
  authority,
  authoritySha256: AUTHORITY_SHA256,
  output,
  outputSha256: OUTPUT_SHA256,
  outputBytes: OUTPUT_BYTES,
  fps: 30,
  frames: 75,
  rgbaResampling: 'whole-frame',
  encoding: 'vp9-crf26',
  alphaMerge: false,
  deterministicContainer: true,
  pass: true
})}\n`);
