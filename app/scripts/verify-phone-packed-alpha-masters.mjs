import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  frozenHomepageMedia,
  packedAlphaVideoSources
} from './homepage-media-contract.mjs';

const execFileAsync = promisify(execFile);
const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoDir = path.dirname(appDir);

const qualificationBySourceSha256 = new Map([
  [
    '39ed325feaa4afcd2c59f7479e6ad75edbe6f4f063ab2243a04afe2660c4f8e1',
    {
      width: 704,
      height: 396,
      firstFrameRgbaSha256:
        '1ecf7424a6f669b41123d9d0d9e5bcd85f3639c659c641f7cac3c1fdf51f102a'
    }
  ],
  [
    '80e971968a290ab1b4176cc754acdd4aaf85fecf5137a85295ccd9e7152105f5',
    {
      width: 704,
      height: 396,
      firstFrameRgbaSha256:
        'bd3934157b65fcb87bb66f5bc2a5ac3c2933270cb9001d06e6aef5de39bca7c2'
    }
  ],
  [
    '6c82ceeb31ce814e137c880ae41650e5d24df26a202a4af8a3d8a9d60dbeff00',
    {
      width: 1280,
      height: 720,
      firstFrameRgbaSha256:
        'ea843495a8293c8d1f9bf63627951b9c28cb0d395a007f2b2801f2cb4970a2d0'
    }
  ]
]);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
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

const frozenBySource = new Map(
  frozenHomepageMedia.map((entry) => [entry.source, entry])
);
const contracts = packedAlphaVideoSources.flatMap((source) => {
  const frozen = frozenBySource.get(source);
  assert(frozen, `${source} is missing from the frozen media contract`);
  const qualification = qualificationBySourceSha256.get(frozen.sha256);
  return qualification ? [{ ...frozen, ...qualification }] : [];
});

assert(
  contracts.length === qualificationBySourceSha256.size,
  'the canonical packed-alpha inventory no longer contains every qualified phone master'
);
for (const sourceSha256 of qualificationBySourceSha256.keys()) {
  assert(
    contracts.some((contract) => contract.sha256 === sourceSha256),
    `qualified packed-alpha source ${sourceSha256} is missing from the canonical inventory`
  );
}

const masters = [];
for (const contract of contracts) {
  const sourceBytes = await readFile(path.join(repoDir, contract.source));
  const sourceSha256 = sha256(sourceBytes);
  assert(sourceBytes.byteLength === contract.bytes, `${contract.source} bytes changed`);
  assert(sourceSha256 === contract.sha256, `${contract.source} SHA-256 changed`);

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
  inventory: 'scripts/homepage-media-contract.mjs',
  mode: 'read-only',
  masters,
  pass: true
})}\n`);
