import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { promisify } from 'node:util';
import { frozenHomepageMedia } from './homepage-media-contract.mjs';

const execFileAsync = promisify(execFile);
const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoDir = path.dirname(appDir);
const source = 'assets/figure1.webm';
const output = 'assets/figure1-rgb-alpha.mp4';
const sourceFile = path.join(repoDir, source);
const frozenFile = path.join(repoDir, output);
const frozenBySource = new Map(frozenHomepageMedia.map((entry) => [entry.source, entry]));
const expected = frozenBySource.get(output);
const expectedWidth = 1440;
const expectedHeight = 1280;
const expectedFrames = 49;
const expectedFps = '24/1';
const gop = 8;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function parseOption(argv, name, index) {
  const token = argv[index];
  if (token.startsWith(`${name}=`)) return { value: token.slice(name.length + 1), nextIndex: index + 1 };
  if (token === name) {
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
    return { value, nextIndex: index + 2 };
  }
  return undefined;
}

export function validateStagePath(value) {
  assert(typeof value === 'string' && value.length > 0, 'stage output requires a path');
  assert(!path.isAbsolute(value), 'stage output must be relative to the repository');
  const normalized = path.normalize(value).split(path.sep).join('/');
  const absolute = path.resolve(repoDir, normalized);
  const allowed = path.join(repoDir, 'tmp', 'frame-lock-spike');
  const relative = path.relative(allowed, absolute);
  assert(relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative),
    'stage output must be under repository tmp/frame-lock-spike');
  assert(path.extname(normalized) === '.mp4', 'stage output must retain the .mp4 extension');
  return normalized;
}

export function parseHeroPackedArgs(inputArgv = process.argv.slice(2)) {
  const argv = inputArgv.filter((value) => value !== '--');
  let stage;
  for (let index = 0; index < argv.length;) {
    const parsed = parseOption(argv, '--stage', index);
    if (parsed) {
      stage = parsed.value;
      index = parsed.nextIndex;
      continue;
    }
    throw new Error(`unknown hero packed option: ${argv[index]}`);
  }
  return {
    stage: validateStagePath(stage ?? 'tmp/frame-lock-spike/figure1-rgb-alpha-promoted.mp4')
  };
}

async function probe(file) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error', '-count_frames', '-select_streams', 'v:0',
    '-show_entries', 'stream=codec_name,profile,width,height,pix_fmt,r_frame_rate,nb_read_frames',
    '-of', 'json', file
  ], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  const stream = JSON.parse(stdout).streams?.[0];
  assert(stream?.codec_name === 'h264', 'Hero packed media must use H.264');
  assert(stream?.profile === 'High', 'Hero packed media must use H.264 High profile');
  assert(Number(stream?.width) === expectedWidth && Number(stream?.height) === expectedHeight,
    'Hero packed dimensions drifted');
  assert(stream?.pix_fmt === 'yuv420p', 'Hero packed media must use yuv420p');
  assert(stream?.r_frame_rate === expectedFps, 'Hero packed frame rate drifted');
  assert(Number(stream?.nb_read_frames) === expectedFrames, 'Hero packed frame count drifted');
  return { frames: Number(stream.nb_read_frames), width: Number(stream.width), height: Number(stream.height), fps: stream.r_frame_rate };
}

async function ssim(sourcePath, candidate, mode) {
  const filter = mode === 'alpha'
    ? '[0:v]format=rgba,alphaextract[src];[1:v]format=gray,crop=720:1280:720:0[packed];[src][packed]ssim'
    : '[0:v]format=gbrp[src];[1:v]format=gbrp,crop=720:1280:0:0[packed];[src][packed]ssim';
  const { stderr } = await execFileAsync('ffmpeg', [
    '-hide_banner', '-loglevel', 'info', '-c:v', 'libvpx-vp9', '-i', sourcePath,
    '-i', candidate, '-filter_complex', filter, '-an', '-f', 'null', '-'
  ], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const match = [...stderr.matchAll(/All:([0-9.]+)/g)].at(-1);
  const value = Number(match?.[1]);
  assert(Number.isFinite(value), `could not measure Hero ${mode} SSIM`);
  return value;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseHeroPackedArgs();
  const stageFile = path.join(repoDir, args.stage);
  const workDir = await mkdtemp(path.join(tmpdir(), 'tongye-hero-packed-alpha-'));
  const candidate = path.join(workDir, 'figure1-rgb-alpha.mp4');
  try {
    assert(expected, `${output} is missing from the frozen media contract`);
    const frozenBytes = await readFile(frozenFile);
    assert(frozenBytes.byteLength === expected.bytes && sha256(frozenBytes) === expected.sha256,
      'Hero packed frozen identity changed before rebuild');
    await execFileAsync('ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'error', '-c:v', 'libvpx-vp9', '-i', sourceFile,
      '-filter_complex',
      '[0:v]format=rgba,split=2[color][matte];[color]format=rgb24[colorrgb];'
        + '[matte]alphaextract,format=gray,format=rgb24[alphargb];'
        + '[colorrgb][alphargb]hstack=inputs=2,format=yuv420p[packed]',
      '-map', '[packed]', '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '19',
      '-g', String(gop), '-keyint_min', String(gop), '-sc_threshold', '0',
      '-map_metadata', '-1', '-movflags', '+faststart', candidate
    ], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    const video = await probe(candidate);
    const colorSsim = await ssim(sourceFile, candidate, 'color');
    const alphaSsim = await ssim(sourceFile, candidate, 'alpha');
    const frozenColorSsim = await ssim(sourceFile, frozenFile, 'color');
    const frozenAlphaSsim = await ssim(sourceFile, frozenFile, 'alpha');
    assert(colorSsim >= frozenColorSsim - 0.001, `Hero color SSIM ${colorSsim} is below frozen baseline`);
    assert(alphaSsim >= frozenAlphaSsim - 0.001, `Hero alpha SSIM ${alphaSsim} is below frozen baseline`);
    await mkdir(path.dirname(stageFile), { recursive: true });
    await copyFile(candidate, stageFile);
    const stagedBytes = await readFile(stageFile);
    process.stdout.write(`${JSON.stringify({
      qualification: 'hero-packed-alpha-staged-rebuild', source, output, stage: args.stage,
      gop, frozen: { bytes: frozenBytes.byteLength, sha256: sha256(frozenBytes), colorSsim: frozenColorSsim, alphaSsim: frozenAlphaSsim },
      candidate: { ...video, bytes: stagedBytes.byteLength, sha256: sha256(stagedBytes), colorSsim, alphaSsim },
      replacement: 'not-performed', pass: true
    })}\n`);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
