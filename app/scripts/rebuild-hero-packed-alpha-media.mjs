import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { frozenHomepageMedia } from './homepage-media-contract.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const source = 'assets/figure1.webm';
const output = 'assets/figure1-rgb-alpha.mp4';
const work = mkdtempSync(path.join(tmpdir(), 'tongye-hero-seek-'));
const candidate = path.join(work, 'figure1-rgb-alpha.mp4');
const run = (command, args) => execFileSync(command, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
function verifyIdentity(name, file) {
  const expected = frozenHomepageMedia.find((entry) => entry.source === name);
  const bytes = readFileSync(file);
  assert.equal(bytes.length, expected.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expected.sha256);
}

try {
  assert.match(run('ffmpeg', ['-version']), /^ffmpeg version 8\.1(?:\s|$)/);
  verifyIdentity(source, path.join(root, source));
  run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
    '-c:v', 'libvpx-vp9', '-i', path.join(root, source), '-filter_complex_threads', '2', '-filter_complex',
    '[0:v]format=rgba,split=2[color][matte];[color]format=rgb24[colorrgb];[matte]alphaextract,format=gray,format=rgb24[alphargb];[colorrgb][alphargb]hstack=inputs=2,format=yuv420p[packed]',
    '-map', '[packed]', '-an', '-c:v', 'libx264', '-threads', '2', '-preset', 'slow', '-crf', '22',
    '-g', '4', '-keyint_min', '4', '-sc_threshold', '0', '-bf', '0',
    '-map_metadata', '-1', '-movflags', '+faststart', candidate]);
  const probe = JSON.parse(run('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,nb_frames,r_frame_rate,pix_fmt:frame=key_frame,pict_type', '-of', 'json', candidate]));
  const stream = probe.streams[0];
  assert.deepEqual([stream.width, stream.height, stream.nb_frames, stream.r_frame_rate, stream.pix_fmt],
    [1440, 1280, '49', '24/1', 'yuv420p']);
  let lastKey = -4;
  probe.frames.forEach((frame, index) => {
    if (frame.key_frame) lastKey = index;
    assert.ok(index - lastKey < 4, 'seek dependency exceeds four frames');
    assert.notEqual(frame.pict_type, 'B');
  });
  verifyIdentity(output, candidate);
  copyFileSync(candidate, path.join(root, output));
  console.log('Hero seek media verified: 49 original frames, GOP 4, no B frames, frozen identity.');
} finally {
  rmSync(work, { recursive: true, force: true });
}
