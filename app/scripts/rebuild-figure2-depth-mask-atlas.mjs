import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoDir = path.dirname(appDir);
const source = path.join(repoDir, 'assets/figure2-middle-depth.webp');
const output = path.join(repoDir, 'assets/figure2-depth-mask-atlas.webp');
const contract = {
  sourceBytes: 791_940,
  sourceSha256: '2a836e5139184d3f54bb095d8bcb4761092f277477856caf02e80378ec2c5c20',
  outputBytes: 10_402,
  outputSha256: '39f7e3b9d00de8340b842f818cda0c4eb824618f141e9f8185f81a6ec2413005'
};

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertIdentity(bytes, expectedBytes, expectedSha256, label) {
  if (bytes.byteLength !== expectedBytes || sha256(bytes) !== expectedSha256) {
    throw new Error(`${label} identity changed`);
  }
}

const [{ stdout: ffmpegVersion }, { stdout: cwebpVersion }] = await Promise.all([
  run('ffmpeg', ['-version'], { encoding: 'utf8' }),
  run('cwebp', ['-version'], { encoding: 'utf8' })
]);
if (!/^ffmpeg version 8\.1(?:\s|$)/.test(ffmpegVersion)) {
  throw new Error('Figure2 depth-mask rebuild requires frozen FFmpeg 8.1');
}
if (!/^1\.6\.0(?:\s|$)/.test(cwebpVersion)) {
  throw new Error('Figure2 depth-mask rebuild requires frozen cwebp 1.6.0');
}

assertIdentity(
  await readFile(source),
  contract.sourceBytes,
  contract.sourceSha256,
  'Figure2 depth authority'
);

const workDir = await mkdtemp(path.join(tmpdir(), 'tongye-figure2-depth-mask-'));
try {
  const png = path.join(workDir, 'figure2-depth-mask-atlas.png');
  const candidate = path.join(workDir, 'figure2-depth-mask-atlas.webp');
  await run('ffmpeg', [
    '-y', '-v', 'error', '-loop', '1', '-framerate', '30', '-i', source,
    '-filter_complex', [
      '[0:v]scale=384:216:flags=lanczos,format=rgba,split=2[revealbase][concealbase]',
      "[revealbase]geq=r='255':g='255':b='255':a='if(eq(N,0),0,if(eq(N,31),255,if(lte(r(X,Y),255*N/31),255,0)))'[reveal]",
      "[concealbase]geq=r='255':g='255':b='255':a='if(eq(N,0),255,if(eq(N,31),0,if(lte(r(X,Y),255*N/31),0,255)))'[conceal]",
      '[reveal][conceal]interleave=nb_inputs=2,tile=8x8:nb_frames=64:margin=0:padding=0[out]'
    ].join(';'),
    '-map', '[out]', '-frames:v', '1', '-c:v', 'png', '-pix_fmt', 'rgba', png
  ], { maxBuffer: 4 * 1024 * 1024 });
  await run('cwebp', [
    '-quiet', '-lossless', '-z', '9', '-alpha_q', '100', '-metadata', 'none',
    png, '-o', candidate
  ], { maxBuffer: 4 * 1024 * 1024 });

  const candidateBytes = await readFile(candidate);
  assertIdentity(
    candidateBytes,
    contract.outputBytes,
    contract.outputSha256,
    'Figure2 depth-mask atlas'
  );
  await copyFile(candidate, output);
} finally {
  await rm(workDir, { recursive: true, force: true });
}

process.stdout.write(`${JSON.stringify({
  source: path.relative(repoDir, source),
  output: path.relative(repoDir, output),
  columns: 8,
  rows: 8,
  framesPerPolarity: 32,
  tile: '384x216',
  bytes: contract.outputBytes,
  sha256: contract.outputSha256,
  pass: true
})}\n`);
