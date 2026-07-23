import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoDir = path.dirname(appDir);
const sourceFile = path.join(repoDir, 'assets/crane-flock-motion.webm');
const outputDir = path.join(appDir, 'qa-media');
const outputFile = path.join(
  outputDir,
  'crane-flock-motion-rgb-alpha-hq-candidate.mp4'
);
const SOURCE_BYTES = 4_429_224;
const SOURCE_SHA256 =
  '708f45223f0cea5af23449d947050a86e5ec1ac959385561fa663ff44da5c37a';
const FRAME_WIDTH = 1280;
const FRAME_HEIGHT = 720;
const FRAME_COUNT = 74;
const CRF = 21;
const MAX_GOP_FRAMES = 30;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function verifySource() {
  const bytes = await readFile(sourceFile);
  assert(
    bytes.byteLength === SOURCE_BYTES,
    `source bytes ${bytes.byteLength} != ${SOURCE_BYTES}`
  );
  assert(
    sha256(bytes) === SOURCE_SHA256,
    'source identity differs from the frozen Crane flock authority'
  );
}

async function inspectCandidate(candidate) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-count_frames',
    '-select_streams', 'v:0',
    '-show_entries',
    'stream=codec_name,profile,width,height,pix_fmt,r_frame_rate,nb_read_frames',
    '-of', 'json',
    candidate
  ]);
  const stream = JSON.parse(stdout).streams?.[0];
  assert(stream?.codec_name === 'h264', 'candidate must use H.264');
  assert(stream?.profile === 'High', 'candidate must use H.264 High profile');
  assert(
    Number(stream?.width) === FRAME_WIDTH * 2,
    `candidate packed width must be ${FRAME_WIDTH * 2}`
  );
  assert(
    Number(stream?.height) === FRAME_HEIGHT,
    `candidate height must be ${FRAME_HEIGHT}`
  );
  assert(stream?.pix_fmt === 'yuv420p', 'candidate must use yuv420p');
  assert(stream?.r_frame_rate === '30/1', 'candidate must remain 30 fps');
  assert(
    Number(stream?.nb_read_frames) === FRAME_COUNT,
    `candidate frame count must be ${FRAME_COUNT}`
  );
}

async function measureSsim(candidate, mode) {
  const filter = mode === 'alpha'
    ? `[0:v]format=rgba,alphaextract[src];[1:v]crop=${FRAME_WIDTH}:${FRAME_HEIGHT}:${FRAME_WIDTH}:0,format=gray[packed];[src][packed]ssim`
    : `[0:v]format=rgba,format=gbrp[src];[1:v]crop=${FRAME_WIDTH}:${FRAME_HEIGHT}:0:0,format=gbrp[packed];[src][packed]ssim`;
  const { stderr } = await execFileAsync('ffmpeg', [
    '-hide_banner', '-loglevel', 'info',
    '-c:v', 'libvpx-vp9', '-i', sourceFile,
    '-i', candidate,
    '-filter_complex', filter,
    '-an', '-f', 'null', '-'
  ], { maxBuffer: 8 * 1024 * 1024 });
  const matches = [...stderr.matchAll(/All:([0-9.]+)/g)];
  const value = Number(matches.at(-1)?.[1]);
  assert(Number.isFinite(value), `could not measure ${mode} SSIM`);
  return value;
}

const { stdout: ffmpegVersion } = await execFileAsync('ffmpeg', ['-version']);
assert(
  /^ffmpeg version 8\.1(?:\s|$)/.test(ffmpegVersion),
  'Crane HQ candidate rebuild requires frozen FFmpeg 8.1'
);
await verifySource();

const workDir = await mkdtemp(path.join(tmpdir(), 'crane-flock-hq-candidate-'));
const candidate = path.join(workDir, path.basename(outputFile));
const stagingFile = `${outputFile}.tmp`;
try {
  await execFileAsync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-c:v', 'libvpx-vp9', '-i', sourceFile,
    '-filter_complex',
    `[0:v]format=rgba,split=2[color][matte];[color]format=rgb24[colorrgb];[matte]alphaextract,format=gray,format=rgb24[alphargb];[colorrgb][alphargb]hstack=inputs=2,format=yuv420p[packed]`,
    '-map', '[packed]', '-an',
    '-c:v', 'libx264', '-preset', 'slow',
    '-crf', String(CRF),
    '-g', String(MAX_GOP_FRAMES),
    '-keyint_min', String(MAX_GOP_FRAMES),
    '-sc_threshold', '0',
    '-map_metadata', '-1',
    '-movflags', '+faststart',
    candidate
  ], { maxBuffer: 8 * 1024 * 1024 });

  await inspectCandidate(candidate);
  const [alphaSsim, colorSsim] = await Promise.all([
    measureSsim(candidate, 'alpha'),
    measureSsim(candidate, 'color')
  ]);
  assert(alphaSsim >= 0.95, `candidate alpha SSIM ${alphaSsim} < 0.95`);
  assert(colorSsim >= 0.95, `candidate color SSIM ${colorSsim} < 0.95`);

  await mkdir(outputDir, { recursive: true });
  await copyFile(candidate, stagingFile);
  await rename(stagingFile, outputFile);
  const bytes = await readFile(outputFile);
  const info = await stat(outputFile);
  process.stdout.write(`${JSON.stringify({
    qualification: 'crane-flock-phone-hq-candidate',
    source: path.relative(repoDir, sourceFile),
    output: path.relative(repoDir, outputFile),
    effectiveFrame: `${FRAME_WIDTH}x${FRAME_HEIGHT}`,
    packedFrame: `${FRAME_WIDTH * 2}x${FRAME_HEIGHT}`,
    frames: FRAME_COUNT,
    crf: CRF,
    alphaSsim,
    colorSsim,
    bytes: info.size,
    sha256: sha256(bytes),
    baselinePreserved: true,
    pass: true
  })}\n`);
} finally {
  await rm(stagingFile, { force: true });
  await rm(workDir, { recursive: true, force: true });
}
