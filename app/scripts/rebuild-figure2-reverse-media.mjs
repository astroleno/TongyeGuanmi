import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoDir = path.dirname(appDir);
const contracts = [
  {
    side: 'left',
    authorityBytes: 4_063_470,
    authoritySha256: '9e58707c959d9111af1f1ea2420855292a0449862dc68c93298efc48866597a4',
    outputBytes: 4_366_640,
    outputSha256: 'cab4465ae951700382d1930dc47ddb39d801b8f38479cf6d8a5a225b91de4f32'
  },
  {
    side: 'right',
    authorityBytes: 3_578_198,
    authoritySha256: '7dbd981ccdda04a2ca0d598fdcc878151ec0c9b6a375249f38cc0ca30d2be737',
    outputBytes: 3_918_503,
    outputSha256: 'fd0c874c1483024c9d446d7339599bde9e0b5e63e36985b7c75240f6933e35d9'
  }
];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertIdentity(bytes, expectedBytes, expectedSha256, label) {
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

function normalizeTrackUid(bytes, authoritySha256) {
  const headerEnd = Math.min(bytes.byteLength, 4096);
  const trackUidIndexes = occurrences(bytes, Buffer.from([0x73, 0xc5, 0x88]), headerEnd);
  if (trackUidIndexes.length !== 1) {
    throw new Error(`expected one WebM TrackUID, found ${trackUidIndexes.length}`);
  }
  const trackUidIndex = trackUidIndexes[0];
  const generatedUid = Buffer.from(bytes.subarray(trackUidIndex + 3, trackUidIndex + 11));
  const tagTarget = Buffer.concat([Buffer.from([0x63, 0xc5, 0x88]), generatedUid]);
  const tagTargetIndexes = occurrences(bytes, tagTarget, headerEnd);
  if (tagTargetIndexes.length !== 1) {
    throw new Error(`expected one WebM TagTrackUID, found ${tagTargetIndexes.length}`);
  }
  const fixedUid = createHash('sha256').update(`${authoritySha256}:reverse`).digest().subarray(0, 8);
  fixedUid.copy(bytes, trackUidIndex + 3);
  fixedUid.copy(bytes, tagTargetIndexes[0] + 3);
}

const { stdout: ffmpegVersion } = await run('ffmpeg', ['-version'], { encoding: 'utf8' });
if (!/^ffmpeg version 8\.1(?:\s|$)/.test(ffmpegVersion)) {
  throw new Error('Figure2 reverse rebuild requires frozen FFmpeg 8.1');
}

const workDir = await mkdtemp(path.join(tmpdir(), 'tongye-figure2-reverse-'));
const report = [];
try {
  for (const contract of contracts) {
    const authority = path.join(repoDir, `assets/figure2-${contract.side}-motion.webm`);
    const output = path.join(repoDir, `assets/figure2-${contract.side}-motion-reverse.webm`);
    const candidate = path.join(workDir, path.basename(output));
    assertIdentity(
      await readFile(authority),
      contract.authorityBytes,
      contract.authoritySha256,
      `Figure2 ${contract.side} forward authority`
    );
    await run('ffmpeg', [
      '-y', '-v', 'error', '-fflags', '+bitexact', '-flags:v', '+bitexact',
      '-c:v', 'libvpx-vp9', '-i', authority,
      '-vf', 'reverse,setpts=N/(30*TB)', '-map', '0:v:0', '-an',
      '-r', '30', '-frames:v', '78', '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p',
      '-metadata:s:v:0', 'alpha_mode=1', '-b:v', '0', '-crf', '24',
      '-g', '8', '-keyint_min', '8', '-row-mt', '1', '-tile-columns', '2',
      '-frame-parallel', '1', '-auto-alt-ref', '0', '-lag-in-frames', '0',
      '-deadline', 'good', '-cpu-used', '2', '-tune', 'ssim',
      '-map_metadata', '-1', '-map_chapters', '-1', '-write_crc32', '0', candidate
    ], { maxBuffer: 4 * 1024 * 1024 });
    const candidateBytes = await readFile(candidate);
    normalizeTrackUid(candidateBytes, contract.authoritySha256);
    assertIdentity(candidateBytes, contract.outputBytes, contract.outputSha256, `Figure2 ${contract.side} reverse output`);
    await writeFile(candidate, candidateBytes);
    await copyFile(candidate, output);
    report.push({
      side: contract.side,
      authority: path.relative(repoDir, authority),
      authoritySha256: contract.authoritySha256,
      output: path.relative(repoDir, output),
      outputBytes: contract.outputBytes,
      outputSha256: contract.outputSha256
    });
  }
} finally {
  await rm(workDir, { recursive: true, force: true });
}

process.stdout.write(`${JSON.stringify({ fps: 30, frames: 78, frameMap: 'reverse 0..77 = forward 77..0', deterministicContainer: true, outputs: report, pass: true })}\n`);
