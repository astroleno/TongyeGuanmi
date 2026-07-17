import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  alphaVideoSourcePairs,
  frozenHomepageMedia
} from './homepage-media-contract.mjs';

const execFileAsync = promisify(execFile);
const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoDir = path.dirname(appDir);
const frozenBySource = new Map(
  frozenHomepageMedia.map((entry) => [entry.source, entry])
);
const MAX_GOP_FRAMES = 8;
const SWIFT_ALPHA_CHECK = [
  'import AVFoundation',
  'import Foundation',
  'for path in CommandLine.arguments.dropFirst() {',
  '  let asset = AVURLAsset(url: URL(fileURLWithPath: path))',
  '  guard let track = asset.tracks(withMediaType: .video).first else {',
  '    print("\\(path)\\tmissing")',
  '    continue',
  '  }',
  '  print("\\(path)\\t\\(track.hasMediaCharacteristic(.containsAlphaChannel))")',
  '}'
].join('\n');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function assertFrozenCandidate(source, candidate) {
  const expected = frozenBySource.get(source);
  assert(expected, `${source} is missing from the frozen media contract`);
  const bytes = await readFile(candidate);
  assert(bytes.byteLength === expected.bytes, `${source} bytes ${bytes.byteLength} != ${expected.bytes}`);
  const digest = sha256(bytes);
  assert(digest === expected.sha256, `${source} SHA-256 ${digest} != ${expected.sha256}`);
  return {
    source,
    bytes: bytes.byteLength,
    sha256: digest
  };
}

async function inspectCandidate(source, candidate) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-count_frames',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=codec_name,codec_tag_string,nb_read_frames:frame=key_frame',
    '-of', 'json',
    candidate
  ], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  const probe = JSON.parse(stdout);
  const stream = probe.streams?.[0];
  const frames = probe.frames ?? [];
  const keyframes = frames.flatMap((frame, index) => (
    Number(frame.key_frame) === 1 ? [index] : []
  ));

  assert(stream?.codec_name === 'hevc', `${source} codec must be HEVC`);
  assert(stream?.codec_tag_string === 'hvc1', `${source} codec tag must be hvc1`);
  assert(Number(stream?.nb_read_frames) === frames.length, `${source} frame count changed`);
  assert(keyframes[0] === 0, `${source} must start with a keyframe`);
  for (let index = 1; index < keyframes.length; index += 1) {
    assert(
      keyframes[index] - keyframes[index - 1] <= MAX_GOP_FRAMES,
      `${source} GOP exceeds ${MAX_GOP_FRAMES} frames`
    );
  }
  assert(
    frames.length - keyframes.at(-1) <= MAX_GOP_FRAMES,
    `${source} trailing GOP exceeds ${MAX_GOP_FRAMES} frames`
  );
  return {
    frames: frames.length,
    keyframes: keyframes.length,
    maxGopFrames: MAX_GOP_FRAMES
  };
}

async function assertAlphaCharacteristics(candidates) {
  const { stdout } = await execFileAsync('xcrun', [
    'swift',
    '-e',
    SWIFT_ALPHA_CHECK,
    ...candidates
  ], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  const results = new Map(stdout.trim().split(/\r?\n/).map((line) => {
    const [candidate, result] = line.split('\t');
    return [candidate, result];
  }));
  for (const candidate of candidates) {
    assert(results.get(candidate) === 'true', `${candidate} lacks AVFoundation alpha metadata`);
  }
}

assert(process.platform === 'darwin', 'HEVC alpha rebuild requires macOS VideoToolbox');
const { stdout: ffmpegVersion } = await execFileAsync('ffmpeg', ['-version'], { encoding: 'utf8' });
assert(/^ffmpeg version 8\.1(?:\s|$)/.test(ffmpegVersion), 'HEVC alpha rebuild requires frozen FFmpeg 8.1');

const workDir = await mkdtemp(path.join(tmpdir(), 'tongye-hevc-alpha-rebuild-'));
const candidates = [];

try {
  for (const pair of alphaVideoSourcePairs) {
    const input = path.join(repoDir, pair.webm);
    const candidate = path.join(workDir, path.basename(pair.hevc));
    await execFileAsync('ffmpeg', [
      '-y', '-v', 'error',
      '-c:v', 'libvpx-vp9',
      '-i', input,
      '-map', '0:v:0',
      '-an',
      '-vf', 'format=rgba,pad=ceil(iw/2)*2:ceil(ih/2)*2:0:0:color=black@0',
      '-c:v', 'hevc_videotoolbox',
      '-pix_fmt', 'bgra',
      '-alpha_quality', '1',
      '-q:v', '65',
      '-g', String(MAX_GOP_FRAMES),
      '-tag:v', 'hvc1',
      '-map_metadata', '-1',
      '-movflags', '+faststart',
      candidate
    ], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
    const identity = await assertFrozenCandidate(pair.hevc, candidate);
    const video = await inspectCandidate(pair.hevc, candidate);
    candidates.push({
      ...pair,
      candidate,
      identity,
      video
    });
  }

  await assertAlphaCharacteristics(candidates.map(({ candidate }) => candidate));
  for (const { hevc, candidate } of candidates) {
    await copyFile(candidate, path.join(repoDir, hevc));
  }
} finally {
  await rm(workDir, { recursive: true, force: true });
}

process.stdout.write(`${JSON.stringify({
  qualification: 'homepage-hevc-alpha-rebuild',
  encoder: 'hevc_videotoolbox',
  quality: 65,
  alphaQuality: 1,
  maxGopFrames: MAX_GOP_FRAMES,
  files: candidates.map(({ hevc, identity, video }) => ({
    source: hevc,
    ...identity,
    ...video,
    avFoundationAlpha: true
  })),
  pass: true
})}\n`);
