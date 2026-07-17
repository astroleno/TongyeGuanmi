import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  animationHevcAlphaSources,
  animationWebmSources,
  frozenHomepageMedia
} from './homepage-media-contract.mjs';

const KiB = 1024;
const MiB = KiB * KiB;
const HOMEPAGE_RUNTIME_MEDIA_BYTES_MAX = 80 * MiB;
const HERO_BEFORE_FIRST_SCROLL_TRANSFER_MAX = 4 * MiB;
const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoDir = path.dirname(appDir);
const distDir = path.join(repoDir, 'dist');
const assetsDir = path.join(distDir, 'assets');
const inventoryPath = path.join(distDir, 'homepage-media-inventory.json');
const sourceAssetsDir = path.join(repoDir, 'assets');
const nonHomepageAssetSources = new Set([
  'assets/favicon.svg',
  'assets/fonts/OFL-QIJI.txt',
  'assets/fonts/qiji-title-subset.ttf'
]);

const adoptedWebpSources = [
  'assets/hero-back.webp',
  'assets/hero-middle.webp',
  'assets/figure2-far-arch.webp',
  'assets/figure2-middle-building.webp',
  'assets/figure2-cloud.webp',
  'assets/figure2-near-arch.webp',
  'assets/ttg-background.webp',
  'assets/ttg-middle.webp',
  'assets/ttg-foreground.webp',
  'assets/pattern-background.webp',
  'assets/crane-paper.webp'
];

const losslessWebpSources = [
  'assets/middle1_depth.webp',
  'assets/back2.webp',
  'assets/figure2-middle-depth.webp',
  'assets/figure2-depth-mask-atlas.webp',
  'assets/figure2-middle-window-mask.webp',
  'assets/aod_cloud-alpha.webp',
  'assets/aod_sun-alpha.webp',
  'assets/ph_background.webp',
  'assets/ph_front-alpha.webp',
  'assets/crane1_cloud2-alpha.webp',
  'assets/crane1_arch-alpha.webp',
  'assets/crane1_cloud1-alpha.webp',
  'assets/crane1_cloud-front2-alpha.webp',
  'assets/patterns/alpha-layers/pattern-layer-alpha-02.webp',
  'assets/patterns/alpha-layers/pattern-layer-alpha-03.webp',
  'assets/patterns/alpha-layers/pattern-layer-alpha-04.webp',
  'assets/patterns/alpha-layers/pattern-layer-alpha-05.webp',
  'assets/patterns/alpha-layers/pattern-layer-alpha-06.webp',
  'assets/hero-figure-poster.webp'
];

const retainedImageSources = [];

const heroPreScrollSources = new Set([
  'assets/hero-back.webp',
  'assets/hero-middle.webp',
  'assets/middle1_depth.webp',
  'assets/hero-figure-poster.webp'
]);

const forbiddenEmittedNames = [
  /hero-figure-scrub/i,
  /(?:back1|middle1|arch2[bd]-alpha)\.[a-z0-9]+$/i,
  /figure2(?:a|b)-alpha/i,
  /figure2-duel-alpha/i,
  /figure2-(?:left|right)-motion/i,
  /figure2-(?:cloud-source|front-(?:white|color)-source|middle-fresco)/i,
  /ph_figure-alpha/i,
  /ttg_(?:bg|middle-composite|front(?:-alpha|-composite)?|figure-alpha)/i,
  /crane-figure[12]-transition/i,
  /aod(?:-paper-bg|_figure-alpha)/i,
  /figure3-alpha/i,
  /aged-mottled-background-16x9-4k/i
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function relativePath(file) {
  return path.relative(distDir, file).split(path.sep).join('/');
}

function mediaExtension(file) {
  return path.extname(file).toLowerCase();
}

function assertMediaSignature(file, bytes) {
  const extension = mediaExtension(file);
  if (extension === '.webp') {
    assert(
      bytes.subarray(0, 4).toString('ascii') === 'RIFF'
        && bytes.subarray(8, 12).toString('ascii') === 'WEBP',
      `${file} is not a WebP file`
    );
  } else if (extension === '.webm') {
    assert(
      bytes.subarray(0, 4).toString('hex') === '1a45dfa3',
      `${file} is not a WebM file`
    );
  } else if (extension === '.mp4') {
    assert(
      bytes.subarray(4, 8).toString('ascii') === 'ftyp',
      `${file} is not an MP4 file`
    );
  } else if (extension === '.jpg') {
    assert(
      bytes.subarray(0, 3).toString('hex') === 'ffd8ff',
      `${file} is not a JPG file`
    );
  }
}

async function filesBelow(directory) {
  const entries = await readdir(directory);
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry);
    const info = await stat(target);
    if (info.isDirectory()) {
      files.push(...await filesBelow(target));
    } else {
      files.push(target);
    }
  }
  return files;
}

async function sourceEntry(source, category) {
  const expected = frozenMediaBySource.get(source);
  assert(expected, `${source} is missing from the frozen homepage media contract`);
  assert(expected.category === category, `${source} category must be ${expected.category}`);
  const sourcePath = path.join(repoDir, source);
  const bytes = await readFile(sourcePath);
  assertMediaSignature(source, bytes);
  const sourceSha256 = sha256(bytes);
  assert(
    bytes.byteLength === expected.bytes,
    `${source} bytes ${bytes.byteLength} != frozen ${expected.bytes}`
  );
  assert(
    sourceSha256 === expected.sha256,
    `${source} SHA-256 ${sourceSha256} != frozen ${expected.sha256}`
  );
  return {
    source,
    category,
    bytes: bytes.byteLength,
    sha256: sourceSha256
  };
}

const inventorySources = [
  ...animationWebmSources.map((source) => ({ source, category: source === 'assets/figure1.webm' ? 'hero-animation' : 'animation-webm' })),
  ...animationHevcAlphaSources.map((source) => ({ source, category: source === 'assets/figure1-hevc-alpha.mp4' ? 'hero-animation-hevc' : 'animation-hevc-alpha' })),
  ...adoptedWebpSources.map((source) => ({ source, category: 'adopted-webp' })),
  ...losslessWebpSources.map((source) => ({ source, category: 'lossless-webp' })),
  ...retainedImageSources.map((source) => ({ source, category: 'retained-image' }))
];
const frozenMediaBySource = new Map(
  frozenHomepageMedia.map((entry) => [entry.source, entry])
);
assert(inventorySources.length === 46, `expected 46 homepage source entries, found ${inventorySources.length}`);
assert(frozenHomepageMedia.length === 46, `expected 46 frozen homepage media entries, found ${frozenHomepageMedia.length}`);
assert(frozenMediaBySource.size === frozenHomepageMedia.length, 'frozen homepage media sources must be unique');
assert(frozenMediaBySource.size === inventorySources.length, 'frozen homepage media contract must cover the full inventory');
assert(adoptedWebpSources.length === 11, `expected 11 adopted WebP sources, found ${adoptedWebpSources.length}`);
assert(losslessWebpSources.length === 19, `expected 19 lossless WebP sources, found ${losslessWebpSources.length}`);
assert(animationWebmSources.length === 8, `expected 8 animation WebM sources, found ${animationWebmSources.length}`);
assert(animationHevcAlphaSources.length === 8, `expected 8 animation HEVC alpha sources, found ${animationHevcAlphaSources.length}`);

const [sourceEntries, emittedFiles, sourceAssetFiles] = await Promise.all([
  Promise.all(inventorySources.map(({ source, category }) => sourceEntry(source, category))),
  filesBelow(assetsDir),
  filesBelow(sourceAssetsDir)
]);
const allowedSourceAssets = new Set([
  ...inventorySources.map(({ source }) => source),
  ...nonHomepageAssetSources
]);
const unexpectedSourceAssets = sourceAssetFiles
  .map((file) => path.relative(repoDir, file).split(path.sep).join('/'))
  .filter((source) => !allowedSourceAssets.has(source));
assert(
  unexpectedSourceAssets.length === 0,
  `unowned files remain in production assets/: ${unexpectedSourceAssets.join(', ')}`
);
assert(
  sourceAssetFiles.length === allowedSourceAssets.size,
  `expected ${allowedSourceAssets.size} owned source assets, found ${sourceAssetFiles.length}`
);
const emittedEntries = await Promise.all(emittedFiles.map(async (file) => {
  const bytes = await readFile(file);
  assertMediaSignature(file, bytes);
  return {
    file,
    path: relativePath(file),
    bytes: bytes.byteLength,
    sha256: sha256(bytes)
  };
}));
const emittedByHash = new Map();
for (const entry of emittedEntries) {
  const matches = emittedByHash.get(entry.sha256) ?? [];
  matches.push(entry);
  emittedByHash.set(entry.sha256, matches);
}

const inventory = sourceEntries.map((entry) => {
  const matches = emittedByHash.get(entry.sha256) ?? [];
  assert(matches.length === 1, `${entry.source} must emit exactly once, found ${matches.length}`);
  const emitted = matches[0];
  assert(emitted.path.startsWith('assets/'), `${entry.source} emitted outside dist/assets: ${emitted.path}`);
  assert(emitted.bytes === entry.bytes, `${entry.source} emitted bytes differ from source`);
  return {
    ...entry,
    emittedPath: emitted.path
  };
});

const mediaExtensions = new Set(['.png', '.jpg', '.webp', '.webm', '.mp4']);
const emittedMedia = emittedEntries.filter((entry) => mediaExtensions.has(mediaExtension(entry.path)));
const emittedWebm = emittedEntries.filter((entry) => mediaExtension(entry.path) === '.webm');
const emittedMp4 = emittedEntries.filter((entry) => mediaExtension(entry.path) === '.mp4');
const emittedWebp = emittedEntries.filter((entry) => mediaExtension(entry.path) === '.webp');
const emittedJpg = emittedEntries.filter((entry) => mediaExtension(entry.path) === '.jpg');
const emittedPng = emittedEntries.filter((entry) => mediaExtension(entry.path) === '.png');
assert(emittedMedia.length === 46, `expected exactly 46 emitted homepage media files, found ${emittedMedia.length}`);
assert(emittedWebm.length === 8, `expected exactly 8 emitted animation WebM files, found ${emittedWebm.length}`);
assert(emittedMp4.length === 8, `expected exactly 8 emitted animation HEVC alpha MP4 files, found ${emittedMp4.length}`);
assert(emittedWebp.length === 30, `expected exactly 30 emitted WebP files, found ${emittedWebp.length}`);
assert(emittedJpg.length === 0, `production JPG emit is forbidden, found ${emittedJpg.length}`);
assert(emittedPng.length === 0, `production PNG emit is forbidden, found ${emittedPng.length}`);
for (const entry of emittedEntries) {
  assert(
    !forbiddenEmittedNames.some((pattern) => pattern.test(path.basename(entry.path))),
    `forbidden replaced media emitted: ${entry.path}`
  );
}

const homepageRuntimeBytes = inventory.reduce((sum, entry) => sum + entry.bytes, 0);
const heroPreScrollInventory = inventory.filter((entry) => heroPreScrollSources.has(entry.source));
const heroBeforeFirstScrollBytes = heroPreScrollInventory.reduce((sum, entry) => sum + entry.bytes, 0);
assert(
  homepageRuntimeBytes <= HOMEPAGE_RUNTIME_MEDIA_BYTES_MAX,
  `homepage runtime media exceeded: ${homepageRuntimeBytes} > ${HOMEPAGE_RUNTIME_MEDIA_BYTES_MAX}`
);
assert(
  heroBeforeFirstScrollBytes <= HERO_BEFORE_FIRST_SCROLL_TRANSFER_MAX,
  `Hero pre-scroll media exceeded: ${heroBeforeFirstScrollBytes} > ${HERO_BEFORE_FIRST_SCROLL_TRANSFER_MAX}`
);

const report = {
  schemaVersion: 3,
  pass: true,
  verificationScope: 'static-frozen-build',
  budgets: {
    homepageRuntimeMediaBytesMax: HOMEPAGE_RUNTIME_MEDIA_BYTES_MAX,
    heroBeforeFirstScrollTransferMax: HERO_BEFORE_FIRST_SCROLL_TRANSFER_MAX
  },
  actual: {
    homepageRuntimeMediaBytes: homepageRuntimeBytes,
    heroBeforeFirstScrollBytes,
    inventoryFileCount: inventory.length,
    animationWebmCount: emittedWebm.length,
    animationHevcAlphaCount: emittedMp4.length,
    webpCount: emittedWebp.length,
    jpgCount: emittedJpg.length,
    pngCount: emittedPng.length,
    sourceAssetFileCount: sourceAssetFiles.length
  },
  heroPreScrollInventory,
  inventory
};
await writeFile(inventoryPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({
  inventory: path.basename(inventoryPath),
  files: inventory.length,
  homepageRuntimeMediaBytes: homepageRuntimeBytes,
  heroBeforeFirstScrollBytes,
  animationWebm: emittedWebm.length,
  animationHevcAlpha: emittedMp4.length,
  webp: emittedWebp.length,
  jpg: emittedJpg.length,
  png: emittedPng.length,
  sourceAssets: sourceAssetFiles.length,
  pass: true
})}\n`);
