import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { promisify } from 'node:util';
import { frozenHomepageMedia } from './homepage-media-contract.mjs';

const execFileAsync = promisify(execFile);
const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoDir = path.dirname(appDir);
const contracts = [
  {
    source: 'assets/ph-figure-motion-rgb-alpha.mp4',
    width: 704,
    height: 396,
    firstFrameRgbaSha256:
      '1ecf7424a6f669b41123d9d0d9e5bcd85f3639c659c641f7cac3c1fdf51f102a'
  },
  {
    source: 'assets/crane-figure-motion-rgb-alpha.mp4',
    width: 704,
    height: 396,
    firstFrameRgbaSha256:
      'bd3934157b65fcb87bb66f5bc2a5ac3c2933270cb9001d06e6aef5de39bca7c2'
  },
  {
    source: 'assets/crane-flock-motion-rgb-alpha.mp4',
    width: 1280,
    height: 720,
    firstFrameRgbaSha256:
      'ea843495a8293c8d1f9bf63627951b9c28cb0d395a007f2b2801f2cb4970a2d0'
  }
];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function decodeFirstComposedFrame(source) {
  const { stdout } = await execFileAsync('ffmpeg', [
    '-v', 'error',
    '-i', path.join(repoDir, source),
    '-filter_complex',
    '[0:v]split=2[color][matte];'
      + '[color]crop=iw/2:ih:0:0,format=rgb24[rgb];'
      + '[matte]crop=iw/2:ih:iw/2:0,format=gray[alpha];'
      + '[rgb][alpha]alphamerge,format=rgba[frame]',
    '-map', '[frame]',
    '-frames:v', '1',
    '-f', 'rawvideo',
    '-pix_fmt', 'rgba',
    'pipe:1'
  ], {
    encoding: null,
    maxBuffer: 5 * 1024 * 1024
  });
  return stdout;
}

const masters = [];
for (const contract of contracts) {
  const frozen = frozenHomepageMedia.find(
    ({ source }) => source === contract.source
  );
  assert(frozen, `${contract.source} is missing from the frozen media contract`);
  const sourceBytes = await readFile(path.join(repoDir, contract.source));
  const sourceSha256 = sha256(sourceBytes);
  assert(sourceBytes.byteLength === frozen.bytes, `${contract.source} bytes changed`);
  assert(sourceSha256 === frozen.sha256, `${contract.source} SHA-256 changed`);

  const firstFrame = await decodeFirstComposedFrame(contract.source);
  const expectedFrameBytes = contract.width * contract.height * 4;
  const firstFrameRgbaSha256 = sha256(firstFrame);
  assert(
    firstFrame.byteLength === expectedFrameBytes,
    `${contract.source} first-frame dimensions changed`
  );
  assert(
    firstFrameRgbaSha256 === contract.firstFrameRgbaSha256,
    `${contract.source} first-frame RGBA SHA-256 changed`
  );
  masters.push({
    source: contract.source,
    bytes: sourceBytes.byteLength,
    sha256: sourceSha256,
    firstFrame: {
      format: 'rgba',
      width: contract.width,
      height: contract.height,
      bytes: firstFrame.byteLength,
      sha256: firstFrameRgbaSha256
    }
  });
}

process.stdout.write(`${JSON.stringify({
  qualification: 'phone-packed-alpha-master-first-frame',
  mode: 'read-only',
  masters,
  pass: true
})}\n`);
