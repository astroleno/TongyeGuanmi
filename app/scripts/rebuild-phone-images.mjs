import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { frozenHomepageMedia } from './homepage-media-contract.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const archivedArch = 'archive/assets/homepage-media/2026-09-30/figure2-phone-foreground-arch.webp';
const recipes = [
  ['assets/pattern-background.webp', 'assets/phone/pattern-background.webp', 1920, 1080],
  ['assets/hero-figure-poster.webp', 'assets/phone/hero-figure-poster.webp', 720, 1280],
  ['assets/ttg-foreground.webp', 'assets/phone/ttg-foreground.webp', 1008, 1792],
  [archivedArch, 'assets/figure2-phone-foreground-arch.webp', 1008, 1792]
];
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const run = (name, args) => execFileSync(name, args, { encoding: 'utf8' });
const temporary = mkdtempSync(path.join(tmpdir(), 'tongye-phone-images-'));
try {
  assert.match(run('cwebp', ['-version']), /^1\.6\.0(?:\s|$)/);
  for (const [source, output, width, height] of recipes) {
    const input = path.join(root, source);
    const expectedSource = source === archivedArch
      ? 'fdf7cc96d69a0e886493c07c29958bd1be2d2ae107405295313740fc862a94b5'
      : frozenHomepageMedia.find((entry) => entry.source === source)?.sha256;
    assert.equal(sha(readFileSync(input)), expectedSource, `${source} source identity`);
    const candidate = path.join(temporary, path.basename(output));
    run('cwebp', ['-quiet', '-q', '90', '-alpha_q', '100', '-m', '6', '-resize',
      String(width), String(height), '-metadata', 'none', input, '-o', candidate]);
    const expected = frozenHomepageMedia.find((entry) => entry.source === output);
    const bytes = readFileSync(candidate);
    assert.equal(bytes.length, expected.bytes);
    assert.equal(sha(bytes), expected.sha256);
    const stream = JSON.parse(run('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height',
      '-of', 'json', candidate])).streams[0];
    assert.deepEqual([stream.width, stream.height], [width, height]);
    mkdirSync(path.dirname(path.join(root, output)), { recursive: true });
    copyFileSync(candidate, path.join(root, output));
    console.log(JSON.stringify({ output, width, height, bytes: bytes.length, decodedBytes: width * height * 4 }));
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
