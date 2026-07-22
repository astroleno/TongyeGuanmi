import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, readFile, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { promisify } from 'node:util';
import { frozenHomepageMedia } from './homepage-media-contract.mjs';

const execFileAsync = promisify(execFile);
const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoDir = path.dirname(appDir);
const source = 'assets/aod-figure-motion.webm';
const output = 'assets/aod-figure-motion-rgb-alpha.mp4';
const frozenBySource = new Map(
  frozenHomepageMedia.map((entry) => [entry.source, entry])
);
const CRF = 16;
const MAX_GOP_FRAMES = 8;
const EXPECTED_WIDTH = 3344;
const EXPECTED_HEIGHT = 942;
const EXPECTED_FRAMES = 78;
const HALF_WIDTH = EXPECTED_WIDTH / 2;
const SOURCE_HEIGHT = 941;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function assertFrozenIdentity(name, file) {
  const expected = frozenBySource.get(name);
  assert(expected, `${name} is missing from the frozen media contract`);
  const bytes = await readFile(file);
  const digest = sha256(bytes);
  assert(bytes.byteLength === expected.bytes, `${name} bytes ${bytes.byteLength} != ${expected.bytes}`);
  assert(digest === expected.sha256, `${name} SHA-256 ${digest} != ${expected.sha256}`);
  return { bytes: bytes.byteLength, sha256: digest };
}

async function inspectCandidate(candidate) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-count_frames',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=codec_name,profile,width,height,pix_fmt,r_frame_rate,nb_read_frames:frame=key_frame',
    '-of', 'json',
    candidate
  ], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  const probe = JSON.parse(stdout);
  const stream = probe.streams?.[0];
  const frames = probe.frames ?? [];
  const keyframes = frames.flatMap((frame, index) => (
    Number(frame.key_frame) === 1 ? [index] : []
  ));

  assert(stream?.codec_name === 'h264', 'AOD packed media must use H.264');
  assert(stream?.profile === 'High', 'AOD packed media must use H.264 High profile');
  assert(Number(stream?.width) === EXPECTED_WIDTH, `packed width must be ${EXPECTED_WIDTH}`);
  assert(Number(stream?.height) === EXPECTED_HEIGHT, `packed height must be ${EXPECTED_HEIGHT}`);
  assert(stream?.pix_fmt === 'yuv420p', 'AOD packed media must use Safari-compatible yuv420p');
  assert(stream?.r_frame_rate === '30/1', 'AOD packed media must remain 30 fps');
  assert(Number(stream?.nb_read_frames) === EXPECTED_FRAMES, `packed frame count must be ${EXPECTED_FRAMES}`);
  assert(frames.length === EXPECTED_FRAMES, 'ffprobe frame inventory is incomplete');
  assert(keyframes[0] === 0, 'AOD packed media must begin on a keyframe');
  for (let index = 1; index < keyframes.length; index += 1) {
    assert(
      keyframes[index] - keyframes[index - 1] <= MAX_GOP_FRAMES,
      `AOD packed media GOP exceeds ${MAX_GOP_FRAMES} frames`
    );
  }
  assert(
    frames.length - keyframes.at(-1) <= MAX_GOP_FRAMES,
    `AOD packed media trailing GOP exceeds ${MAX_GOP_FRAMES} frames`
  );
  return { frames: frames.length, keyframes: keyframes.length };
}

async function ssim(sourceFile, candidate, mode) {
  const filter = mode === 'alpha'
    ? `[0:v]format=rgba,alphaextract[src];[1:v]format=gray,crop=${HALF_WIDTH}:${SOURCE_HEIGHT}:${HALF_WIDTH}:0[packed];[src][packed]ssim`
    : `[0:v]format=gbrp[src];[1:v]format=gbrp,crop=${HALF_WIDTH}:${SOURCE_HEIGHT}:0:0[packed];[src][packed]ssim`;
  const { stderr } = await execFileAsync('ffmpeg', [
    '-hide_banner', '-loglevel', 'info',
    '-c:v', 'libvpx-vp9', '-i', sourceFile,
    '-i', candidate,
    '-filter_complex', filter,
    '-an', '-f', 'null', '-'
  ], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const matches = [...stderr.matchAll(/All:([0-9.]+)/g)];
  const value = Number(matches.at(-1)?.[1]);
  assert(Number.isFinite(value), `could not measure ${mode} SSIM`);
  return value;
}

const { stdout: ffmpegVersion } = await execFileAsync('ffmpeg', ['-version'], { encoding: 'utf8' });
assert(/^ffmpeg version 8\.1(?:\s|$)/.test(ffmpegVersion), 'AOD packed rebuild requires frozen FFmpeg 8.1');

const sourceFile = path.join(repoDir, source);
const outputFile = path.join(repoDir, output);
const outputStagingFile = `${outputFile}.tmp`;
const workDir = await mkdtemp(path.join(tmpdir(), 'tongye-aod-packed-alpha-'));
const candidate = path.join(workDir, path.basename(output));

try {
  await assertFrozenIdentity(source, sourceFile);
  await execFileAsync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-c:v', 'libvpx-vp9',
    '-i', sourceFile,
    '-filter_complex',
    '[0:v]format=rgba,pad=iw:ceil(ih/2)*2:0:0:color=black@0,split=2[color][matte];[color]format=rgb24[colorrgb];[matte]alphaextract,format=gray,format=rgb24[alphargb];[colorrgb][alphargb]hstack=inputs=2,format=yuv420p[packed]',
    '-map', '[packed]',
    '-an',
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', String(CRF),
    '-g', String(MAX_GOP_FRAMES),
    '-keyint_min', String(MAX_GOP_FRAMES),
    '-sc_threshold', '0',
    '-map_metadata', '-1',
    '-movflags', '+faststart',
    candidate
  ], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });

  const video = await inspectCandidate(candidate);
  const alphaSsim = await ssim(sourceFile, candidate, 'alpha');
  const colorSsim = await ssim(sourceFile, candidate, 'color');
  assert(alphaSsim >= 0.9858, `AOD alpha SSIM ${alphaSsim} is below 0.9858`);
  assert(colorSsim >= 0.9734, `AOD color SSIM ${colorSsim} is below 0.9734`);
  const identity = await assertFrozenIdentity(output, candidate);

  await copyFile(candidate, outputStagingFile);
  await rename(outputStagingFile, outputFile);
  process.stdout.write(`${JSON.stringify({
    qualification: 'aod-packed-alpha-single-source-rebuild',
    source,
    output,
    crf: CRF,
    maxGopFrames: MAX_GOP_FRAMES,
    alphaSsim,
    colorSsim,
    ...video,
    ...identity,
    pass: true
  })}\n`);
} finally {
  await rm(outputStagingFile, { force: true });
  await rm(workDir, { recursive: true, force: true });
}
