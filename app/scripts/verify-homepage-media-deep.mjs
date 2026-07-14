import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { promisify } from 'node:util';
import { canonicalVideoContracts } from './homepage-media-contract.mjs';

const execFileAsync = promisify(execFile);
const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoDir = path.dirname(appDir);
const TIMING_TOLERANCE_SECONDS = 0.001;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function ffprobe(source, args) {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      ...args,
      '-of', 'json',
      path.join(repoDir, source)
    ], { encoding: 'utf8' });
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`ffprobe failed for ${source}`, { cause: error });
  }
}

function streamAlphaMode(stream) {
  return stream?.tags?.ALPHA_MODE ?? stream?.tags?.alpha_mode;
}

function assertNear(actual, expected, label) {
  assert(Number.isFinite(actual), `${label} is not finite`);
  assert(
    Math.abs(actual - expected) <= TIMING_TOLERANCE_SECONDS,
    `${label} ${actual} != ${expected}`
  );
}

async function inspectCanonicalVideo(contract) {
  const [containerProbe, alphaProbe] = await Promise.all([
    ffprobe(contract.source, [
      '-count_frames',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=avg_frame_rate,r_frame_rate,nb_read_frames:stream_tags=alpha_mode:format=duration:frame=key_frame,best_effort_timestamp_time'
    ]),
    ffprobe(contract.source, [
      '-c:v', 'libvpx-vp9',
      '-count_frames',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=pix_fmt,nb_read_frames:stream_tags=alpha_mode'
    ])
  ]);
  const stream = containerProbe.streams?.[0];
  const alphaStream = alphaProbe.streams?.[0];
  const frames = containerProbe.frames ?? [];
  const decodedFrames = Number(stream?.nb_read_frames);
  const alphaDecodedFrames = Number(alphaStream?.nb_read_frames);
  const duration = Number(containerProbe.format?.duration);
  const framePts = frames.map((frame) => Number(frame.best_effort_timestamp_time));
  const keyframeIndexes = frames.flatMap((frame, index) => (
    Number(frame.key_frame) === 1 ? [index] : []
  ));

  assert(stream?.avg_frame_rate === contract.fps, `${contract.source} avg fps must be ${contract.fps}`);
  assert(stream?.r_frame_rate === contract.fps, `${contract.source} real fps must be ${contract.fps}`);
  assert(decodedFrames === contract.frames, `${contract.source} frame count ${decodedFrames} != ${contract.frames}`);
  assert(frames.length === contract.frames, `${contract.source} PTS sample count ${frames.length} != ${contract.frames}`);
  assert(alphaDecodedFrames === contract.frames, `${contract.source} alpha decode count ${alphaDecodedFrames} != ${contract.frames}`);
  assertNear(duration, contract.duration, `${contract.source} duration`);
  assertNear(framePts[0], contract.firstPts, `${contract.source} first PTS`);
  assertNear(framePts.at(-1), contract.lastPts, `${contract.source} last PTS`);

  const expectedFrameStep = 1 / 30;
  for (let index = 1; index < framePts.length; index += 1) {
    const cadence = framePts[index] - framePts[index - 1];
    assertNear(cadence, expectedFrameStep, `${contract.source} cadence at frame ${index}`);
  }

  assert(streamAlphaMode(stream) === '1', `${contract.source} alpha_mode tag must be 1`);
  assert(streamAlphaMode(alphaStream) === '1', `${contract.source} decoded alpha_mode tag must be 1`);
  assert(alphaStream?.pix_fmt === 'yuva420p', `${contract.source} decoded pixel format must be yuva420p`);
  assert(keyframeIndexes.length === contract.keyframes, `${contract.source} keyframe count ${keyframeIndexes.length} != ${contract.keyframes}`);
  assert(keyframeIndexes[0] === 0, `${contract.source} must start with a keyframe`);
  for (let index = 1; index < keyframeIndexes.length; index += 1) {
    const gopFrames = keyframeIndexes[index] - keyframeIndexes[index - 1];
    assert(gopFrames <= contract.maxGopFrames, `${contract.source} GOP ${gopFrames} > ${contract.maxGopFrames}`);
  }
  const trailingGopFrames = frames.length - keyframeIndexes.at(-1);
  assert(trailingGopFrames <= contract.maxGopFrames, `${contract.source} trailing GOP ${trailingGopFrames} > ${contract.maxGopFrames}`);

  return {
    source: contract.source,
    fps: stream.avg_frame_rate,
    frames: decodedFrames,
    duration,
    firstPts: framePts[0],
    lastPts: framePts.at(-1),
    alphaMode: streamAlphaMode(alphaStream),
    pixelFormat: alphaStream.pix_fmt,
    keyframes: keyframeIndexes.length,
    maxGopFrames: contract.maxGopFrames
  };
}

const canonicalVideos = [];
for (const contract of canonicalVideoContracts) {
  canonicalVideos.push(await inspectCanonicalVideo(contract));
}

process.stdout.write(`${JSON.stringify({
  qualification: 'homepage-media-deep',
  files: canonicalVideos.length,
  canonicalVideos,
  pass: true
})}\n`);
