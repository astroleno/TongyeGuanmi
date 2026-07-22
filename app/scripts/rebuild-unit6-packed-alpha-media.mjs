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
const CRF = 21;
const MAX_GOP_FRAMES = 30;
const specs = [
  {
    source: 'assets/ph-figure-motion.webm',
    output: 'assets/ph-figure-motion-rgb-alpha.mp4',
    width: 704,
    height: 396,
    frames: 46,
    minAlphaSsim: 0.978,
    minColorSsim: 0.976
  },
  {
    source: 'assets/crane-figure-motion.webm',
    output: 'assets/crane-figure-motion-rgb-alpha.mp4',
    width: 704,
    height: 396,
    frames: 75,
    minAlphaSsim: 0.956,
    minColorSsim: 0.937
  },
  {
    source: 'assets/crane-flock-motion.webm',
    output: 'assets/crane-flock-motion-rgb-alpha.mp4',
    width: 704,
    height: 396,
    frames: 74,
    minAlphaSsim: 0.937,
    minColorSsim: 0.944
  }
];
const frozenBySource = new Map(
  frozenHomepageMedia.map((entry) => [entry.source, entry])
);

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

async function inspectCandidate(spec, candidate) {
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

  assert(stream?.codec_name === 'h264', `${spec.output} must use H.264`);
  assert(stream?.profile === 'High', `${spec.output} must use H.264 High profile`);
  assert(Number(stream?.width) === spec.width * 2, `${spec.output} has the wrong packed width`);
  assert(Number(stream?.height) === spec.height, `${spec.output} has the wrong height`);
  assert(stream?.pix_fmt === 'yuv420p', `${spec.output} must use Safari-compatible yuv420p`);
  assert(stream?.r_frame_rate === '30/1', `${spec.output} must remain 30 fps`);
  assert(Number(stream?.nb_read_frames) === spec.frames, `${spec.output} frame count changed`);
  assert(keyframes[0] === 0, `${spec.output} must begin on a keyframe`);
  for (let index = 1; index < keyframes.length; index += 1) {
    assert(
      keyframes[index] - keyframes[index - 1] <= MAX_GOP_FRAMES,
      `${spec.output} GOP exceeds ${MAX_GOP_FRAMES} frames`
    );
  }
  assert(
    frames.length - keyframes.at(-1) <= MAX_GOP_FRAMES,
    `${spec.output} trailing GOP exceeds ${MAX_GOP_FRAMES} frames`
  );
  return { frames: frames.length, keyframes: keyframes.length };
}

async function ssim(sourceFile, candidate, spec, mode) {
  const filter = mode === 'alpha'
    ? `[0:v]format=rgba,scale=${spec.width}:${spec.height}:flags=lanczos,format=rgba,alphaextract[src];[1:v]crop=${spec.width}:${spec.height}:${spec.width}:0,format=gray[packed];[src][packed]ssim`
    : `[0:v]format=rgba,scale=${spec.width}:${spec.height}:flags=lanczos,format=gbrp[src];[1:v]crop=${spec.width}:${spec.height}:0:0,format=gbrp[packed];[src][packed]ssim`;
  const { stderr } = await execFileAsync('ffmpeg', [
    '-hide_banner', '-loglevel', 'info',
    '-c:v', 'libvpx-vp9', '-i', sourceFile,
    '-i', candidate,
    '-filter_complex', filter,
    '-an', '-f', 'null', '-'
  ], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const matches = [...stderr.matchAll(/All:([0-9.]+)/g)];
  const value = Number(matches.at(-1)?.[1]);
  assert(Number.isFinite(value), `could not measure ${mode} SSIM for ${spec.output}`);
  return value;
}

async function rebuild(spec, workDir) {
  const sourceFile = path.join(repoDir, spec.source);
  const outputFile = path.join(repoDir, spec.output);
  const outputStagingFile = `${outputFile}.tmp`;
  const candidate = path.join(workDir, path.basename(spec.output));

  try {
    await assertFrozenIdentity(spec.source, sourceFile);
    await execFileAsync('ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-c:v', 'libvpx-vp9', '-i', sourceFile,
      '-filter_complex',
      `[0:v]format=rgba,scale=${spec.width}:${spec.height}:flags=lanczos,format=rgba,split=2[color][matte];[color]format=rgb24[colorrgb];[matte]alphaextract,format=gray,format=rgb24[alphargb];[colorrgb][alphargb]hstack=inputs=2,format=yuv420p[packed]`,
      '-map', '[packed]', '-an', '-c:v', 'libx264', '-preset', 'slow',
      '-crf', String(CRF), '-g', String(MAX_GOP_FRAMES),
      '-keyint_min', String(MAX_GOP_FRAMES), '-sc_threshold', '0',
      '-map_metadata', '-1', '-movflags', '+faststart', candidate
    ], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });

    const video = await inspectCandidate(spec, candidate);
    const alphaSsim = await ssim(sourceFile, candidate, spec, 'alpha');
    const colorSsim = await ssim(sourceFile, candidate, spec, 'color');
    assert(
      alphaSsim >= spec.minAlphaSsim,
      `${spec.output} alpha SSIM ${alphaSsim} is below ${spec.minAlphaSsim}`
    );
    assert(
      colorSsim >= spec.minColorSsim,
      `${spec.output} color SSIM ${colorSsim} is below ${spec.minColorSsim}`
    );
    const identity = await assertFrozenIdentity(spec.output, candidate);

    await copyFile(candidate, outputStagingFile);
    await rename(outputStagingFile, outputFile);
    return {
      source: spec.source,
      output: spec.output,
      alphaSsim,
      colorSsim,
      ...video,
      ...identity
    };
  } finally {
    await rm(outputStagingFile, { force: true });
  }
}

const { stdout: ffmpegVersion } = await execFileAsync('ffmpeg', ['-version'], { encoding: 'utf8' });
assert(/^ffmpeg version 8\.1(?:\s|$)/.test(ffmpegVersion), 'Unit 6 packed rebuild requires frozen FFmpeg 8.1');

const workDir = await mkdtemp(path.join(tmpdir(), 'tongye-unit6-packed-alpha-'));
try {
  const media = [];
  for (const spec of specs) media.push(await rebuild(spec, workDir));
  process.stdout.write(`${JSON.stringify({
    qualification: 'unit6-packed-alpha-rebuild',
    crf: CRF,
    maxGopFrames: MAX_GOP_FRAMES,
    media,
    pass: true
  })}\n`);
} finally {
  await rm(workDir, { recursive: true, force: true });
}
