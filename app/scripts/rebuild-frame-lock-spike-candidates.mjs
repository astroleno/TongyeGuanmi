import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  alphaVideoSourcePairs,
  animationHevcAlphaSources,
  animationWebmSources,
  canonicalVideoContracts,
  frozenHomepageMedia,
  packedAlphaVideoSources
} from './homepage-media-contract.mjs';

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(import.meta.url);
const appDir = path.dirname(path.dirname(scriptPath));
const repoDir = path.dirname(appDir);
const candidateDir = path.join(repoDir, 'tmp', 'frame-lock-spike');
const allowedGops = new Set([8, 1]);
const frozenBySource = new Map(frozenHomepageMedia.map((entry) => [entry.source, entry]));
const contractBySource = new Map(canonicalVideoContracts.map((entry) => [entry.source, entry]));
const hevcToWebm = new Map(alphaVideoSourcePairs.map(({ webm, hevc }) => [hevc, webm]));
const packedToWebm = new Map([
  ['assets/figure1-rgb-alpha.mp4', 'assets/figure1.webm'],
  ['assets/figure2-pair-motion-rgb-alpha.mp4', 'assets/figure2-pair-motion.webm'],
  ['assets/aod-figure-motion-rgb-alpha.mp4', 'assets/aod-figure-motion.webm'],
  ['assets/ph-figure-motion-rgb-alpha.mp4', 'assets/ph-figure-motion.webm'],
  ['assets/crane-figure-motion-rgb-alpha.mp4', 'assets/crane-figure-motion.webm'],
  ['assets/crane-flock-motion-rgb-alpha.mp4', 'assets/crane-flock-motion.webm']
]);
const sourceKeys = new Set([
  ...animationWebmSources,
  ...animationHevcAlphaSources,
  ...packedAlphaVideoSources
]);
const packedCrfBySource = new Map([
  ['assets/figure1-rgb-alpha.mp4', 21],
  ['assets/figure2-pair-motion-rgb-alpha.mp4', 12],
  ['assets/aod-figure-motion-rgb-alpha.mp4', 16],
  ['assets/ph-figure-motion-rgb-alpha.mp4', 21],
  ['assets/crane-figure-motion-rgb-alpha.mp4', 21],
  ['assets/crane-flock-motion-rgb-alpha.mp4', 26]
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function parseOption(argv, name, index) {
  const token = argv[index];
  const prefix = `${name}=`;
  if (token.startsWith(prefix)) return { value: token.slice(prefix.length), nextIndex: index + 1 };
  if (token === name) {
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
    return { value, nextIndex: index + 2 };
  }
  return undefined;
}

export function validateCandidateOutputPath(value) {
  assert(typeof value === 'string' && value.length > 0, 'candidate output requires a path');
  assert(!path.isAbsolute(value), 'candidate output must be under the repository tmp/frame-lock-spike directory');
  const normalized = path.normalize(value).split(path.sep).join('/');
  const absolute = path.resolve(repoDir, normalized);
  const relative = path.relative(candidateDir, absolute);
  assert(
    relative !== ''
      && relative !== '..'
      && !relative.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relative),
    'candidate output must be under the repository tmp/frame-lock-spike directory'
  );
  assert(!normalized.endsWith('/'), 'candidate output must be a file path');
  return normalized;
}

export function parseCandidateArgs(inputArgv = process.argv.slice(2)) {
  const argv = inputArgv.filter((value) => value !== '--');
  let source;
  let gopText;
  let output;
  for (let index = 0; index < argv.length;) {
    const parsedSource = parseOption(argv, '--source', index);
    if (parsedSource) {
      source = parsedSource.value;
      index = parsedSource.nextIndex;
      continue;
    }
    const parsedGop = parseOption(argv, '--gop', index);
    if (parsedGop) {
      gopText = parsedGop.value;
      index = parsedGop.nextIndex;
      continue;
    }
    const parsedOutput = parseOption(argv, '--output', index);
    if (parsedOutput) {
      output = parsedOutput.value;
      index = parsedOutput.nextIndex;
      continue;
    }
    throw new Error(`unknown candidate option: ${argv[index]}`);
  }
  assert(sourceKeys.has(source), `source must be an exact allowlisted source key: ${source ?? '(missing)'}`);
  assert(/^(?:8|1)$/.test(gopText ?? ''), 'GOP must be 8 or 1');
  const gop = Number(gopText);
  assert(allowedGops.has(gop), 'GOP must be 8 or 1');
  const extension = path.extname(source);
  const defaultName = `${path.basename(source, extension)}-gop${gop}${extension}`;
  const normalizedOutput = validateCandidateOutputPath(
    output ?? path.join('tmp', 'frame-lock-spike', defaultName)
  );
  assert(path.extname(normalizedOutput) === extension, `candidate output must keep ${extension} extension`);
  return { source, gop, output: normalizedOutput };
}

function masterSourceFor(source) {
  if (animationWebmSources.includes(source)) return source;
  if (hevcToWebm.has(source)) return hevcToWebm.get(source);
  if (packedToWebm.has(source)) return packedToWebm.get(source);
  throw new Error(`no qualified canonical master is registered for ${source}`);
}

function relativeSourcePath(source) {
  return path.join(repoDir, source);
}

async function frozenIdentity(source) {
  const expected = frozenBySource.get(source);
  assert(expected, `${source} is missing from the frozen media contract`);
  const bytes = await readFile(relativeSourcePath(source));
  const digest = sha256(bytes);
  assert(bytes.byteLength === expected.bytes, `${source} bytes changed before candidate generation`);
  assert(digest === expected.sha256, `${source} SHA-256 changed before candidate generation`);
  return { bytes: bytes.byteLength, sha256: digest };
}

async function ffprobe(file, entries = 'stream=codec_name,profile,width,height,pix_fmt,r_frame_rate,avg_frame_rate,color_space,color_transfer,color_primaries,color_range:frame=key_frame,pts_time,best_effort_timestamp_time') {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-count_frames',
    '-select_streams', 'v:0',
    '-show_entries', entries,
    '-of', 'json',
    file
  ], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  return JSON.parse(stdout);
}

function streamFrameCount(probe) {
  const stream = probe.streams?.[0];
  const value = Number(stream?.nb_read_frames);
  return Number.isInteger(value) && value > 0 ? value : (probe.frames?.length ?? 0);
}

function frameTimestamps(probe) {
  return (probe.frames ?? []).map((frame) => Number(
    frame.pts_time ?? frame.best_effort_timestamp_time
  ));
}

function keyframeIndexes(probe) {
  return (probe.frames ?? []).flatMap((frame, index) => (
    Number(frame.key_frame) === 1 ? [index] : []
  ));
}

function maxGop(probe) {
  const keyframes = keyframeIndexes(probe);
  assert(keyframes.length > 0 && keyframes[0] === 0, 'candidate must start with a keyframe');
  const lengths = keyframes.slice(1).map((index, position) => index - keyframes[position]);
  lengths.push((probe.frames?.length ?? 0) - keyframes.at(-1));
  return Math.max(...lengths);
}

function contractFor(source, masterProbe) {
  const contract = contractBySource.get(masterSourceFor(source));
  if (contract) return contract;
  const stream = masterProbe.streams?.[0];
  const timestamps = frameTimestamps(masterProbe);
  const fps = String(stream?.r_frame_rate ?? '');
  const [fpsNumerator, fpsDenominator] = fps.split('/').map(Number);
  assert(Number.isInteger(fpsNumerator) && Number.isInteger(fpsDenominator), `${source} has no rational frame-rate contract`);
  return {
    fps,
    frames: streamFrameCount(masterProbe),
    firstPts: timestamps[0],
    lastPts: timestamps.at(-1)
  };
}

function colorArgs(stream) {
  const args = [];
  for (const [flag, value] of [
    ['-colorspace', stream?.color_space],
    ['-color_trc', stream?.color_transfer],
    ['-color_primaries', stream?.color_primaries],
    ['-color_range', stream?.color_range]
  ]) {
    if (value && value !== 'unknown') args.push(flag, value);
  }
  return args;
}

function packedFilter(width, height) {
  const halfWidth = width / 2;
  assert(Number.isInteger(halfWidth) && halfWidth > 0, 'packed candidate width must be an even positive number');
  return `[0:v]format=rgba,scale=${halfWidth}:${height}:flags=lanczos,format=rgba,split=2[color][matte];`
    + '[color]format=rgb24[colorrgb];'
    + '[matte]alphaextract,format=gray,format=rgb24[alphargb];'
    + '[colorrgb][alphargb]hstack=inputs=2,format=yuv420p[packed]';
}

async function runFfmpeg(source, target, gop, masterProbe, targetProbe) {
  const masterFile = relativeSourcePath(masterSourceFor(source));
  const targetStream = targetProbe.streams?.[0];
  const masterStream = masterProbe.streams?.[0];
  const contract = contractFor(source, masterProbe);
  const [fpsNumerator, fpsDenominator] = contract.fps.split('/').map(Number);
  const frameCount = contract.frames;
  const isWebm = source.endsWith('.webm');
  const isHevc = animationHevcAlphaSources.includes(source);
  const isPacked = packedAlphaVideoSources.includes(source);
  const common = [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-c:v', 'libvpx-vp9', '-i', masterFile,
    '-map', '0:v:0', '-an',
    '-r', `${fpsNumerator}/${fpsDenominator}`,
    '-frames:v', String(frameCount),
    '-map_metadata', '-1', '-map_chapters', '-1',
    ...colorArgs(masterStream),
    '-g', String(gop), '-keyint_min', String(gop), '-sc_threshold', '0',
    '-movflags', '+faststart'
  ];
  if (isWebm) {
    await execFileAsync('ffmpeg', [
      ...common,
      '-c:v', 'libvpx-vp9',
      '-pix_fmt', masterStream?.pix_fmt ?? 'yuva420p',
      '-metadata:s:v:0', 'alpha_mode=1',
      '-b:v', '0', '-crf', '26',
      '-row-mt', '1', '-tile-columns', '2', '-frame-parallel', '1',
      '-auto-alt-ref', '0', '-lag-in-frames', '0', '-deadline', 'good',
      '-cpu-used', '2', '-tune', 'ssim',
      target
    ], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    return;
  }
  if (isHevc) {
    assert(process.platform === 'darwin', 'HEVC candidate generation requires macOS VideoToolbox');
    await execFileAsync('ffmpeg', [
      ...common,
      '-vf', 'format=rgba,pad=ceil(iw/2)*2:ceil(ih/2)*2:0:0:color=black@0',
      '-c:v', 'hevc_videotoolbox', '-pix_fmt', 'bgra',
      '-alpha_quality', '1', '-q:v', '65', '-tag:v', 'hvc1',
      target
    ], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    return;
  }
  assert(isPacked, `candidate source has no supported encoder path: ${source}`);
  const width = Number(targetStream?.width);
  const height = Number(targetStream?.height);
  const crf = packedCrfBySource.get(source) ?? 21;
  await execFileAsync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-c:v', 'libvpx-vp9', '-i', masterFile,
    '-filter_complex', packedFilter(width, height),
    '-map', '[packed]', '-an', '-c:v', 'libx264', '-preset', 'slow',
    '-crf', String(crf), '-g', String(gop), '-keyint_min', String(gop),
    '-sc_threshold', '0', '-pix_fmt', 'yuv420p',
    '-map_metadata', '-1', '-movflags', '+faststart',
    ...colorArgs(targetStream),
    target
  ], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
}

function assertCandidateShape(source, candidateProbe, targetProbe, gop) {
  const candidateStream = candidateProbe.streams?.[0];
  const targetStream = targetProbe.streams?.[0];
  assert(candidateStream, `${source} candidate has no video stream`);
  assert(Number(candidateStream.width) === Number(targetStream.width), `${source} candidate width changed`);
  assert(Number(candidateStream.height) === Number(targetStream.height), `${source} candidate height changed`);
  assert(streamFrameCount(candidateProbe) === streamFrameCount(targetProbe), `${source} candidate frame count changed`);
  assert(String(candidateStream.r_frame_rate) === String(targetStream.r_frame_rate), `${source} candidate frame rate changed`);
  assert(maxGop(candidateProbe) <= gop, `${source} candidate GOP exceeds ${gop}`);
  const timestamps = frameTimestamps(candidateProbe);
  assert(Number.isFinite(timestamps[0]), `${source} candidate first PTS is missing`);
  return {
    width: Number(candidateStream.width),
    height: Number(candidateStream.height),
    frameCount: streamFrameCount(candidateProbe),
    fps: String(candidateStream.r_frame_rate),
    firstPtsSeconds: timestamps[0],
    lastPtsSeconds: timestamps.at(-1),
    keyframeCount: keyframeIndexes(candidateProbe).length,
    maxGopFrames: maxGop(candidateProbe),
    codecName: candidateStream.codec_name,
    pixFmt: candidateStream.pix_fmt ?? null
  };
}

export async function rebuildCandidate(options) {
  const { source, gop } = options;
  assert(sourceKeys.has(source), `source must be an exact allowlisted source key: ${source ?? '(missing)'}`);
  assert(allowedGops.has(gop), 'GOP must be 8 or 1');
  const output = validateCandidateOutputPath(options.output);
  assert(path.extname(output) === path.extname(source), `candidate output must keep ${path.extname(source)} extension`);
  const master = masterSourceFor(source);
  await frozenIdentity(master);
  const targetIdentity = await frozenIdentity(source);
  const masterProbe = await ffprobe(relativeSourcePath(master));
  const targetProbe = await ffprobe(relativeSourcePath(source));
  const outputPath = path.join(repoDir, output);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await runFfmpeg(source, outputPath, gop, masterProbe, targetProbe);
  const candidateProbe = await ffprobe(outputPath);
  const shape = assertCandidateShape(source, candidateProbe, targetProbe, gop);
  const bytes = await readFile(outputPath);
  const outputStat = await stat(outputPath);
  assert(outputStat.isFile(), `candidate output is not a file: ${output}`);
  return {
    source,
    masterSource: master,
    output,
    gop,
    frozen: targetIdentity,
    candidate: { bytes: bytes.byteLength, sha256: sha256(bytes), ...shape }
  };
}

if (path.resolve(process.argv[1] ?? '') === scriptPath) {
  try {
    const options = parseCandidateArgs();
    const result = await rebuildCandidate(options);
    process.stdout.write(`${JSON.stringify({ qualification: 'frame-lock-spike-candidate', pass: true, ...result })}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
