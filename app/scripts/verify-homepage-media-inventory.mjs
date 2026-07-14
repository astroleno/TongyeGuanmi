import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { promisify } from 'node:util';

const KiB = 1024;
const MiB = KiB * KiB;
const HOMEPAGE_RUNTIME_MEDIA_BYTES_MAX = 80 * MiB;
const HERO_BEFORE_FIRST_SCROLL_TRANSFER_MAX = 4 * MiB;
const execFileAsync = promisify(execFile);
const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoDir = path.dirname(appDir);
const distDir = path.join(repoDir, 'dist');
const assetsDir = path.join(distDir, 'assets');
const inventoryPath = path.join(distDir, 'homepage-media-inventory.json');

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
  'assets/patterns/alpha-layers/pattern-layer-alpha-06.webp'
];

const animationWebmSources = [
  'assets/figure1.webm',
  'assets/figure2-left-motion.webm',
  'assets/figure2-right-motion.webm',
  'assets/ph-figure-motion.webm',
  'assets/ttg-figure-motion.webm',
  'assets/crane-figure-motion.webm',
  'assets/crane-flock-motion.webm',
  'assets/aod-figure-motion.webm',
  'assets/figure3-motion.webm'
];

const retainedImageSources = [
  'assets/figure-poster.jpg'
];

const heroPreScrollSources = new Set([
  'assets/hero-back.webp',
  'assets/hero-middle.webp',
  'assets/middle1_depth.webp',
  'assets/figure-poster.jpg'
]);

const canonicalVideoContracts = [
  { source: 'assets/figure2-left-motion.webm', frames: 78, lastPts: 2.567 },
  { source: 'assets/figure2-right-motion.webm', frames: 78, lastPts: 2.567 },
  { source: 'assets/ph-figure-motion.webm', frames: 46, lastPts: 1.5 },
  { source: 'assets/ttg-figure-motion.webm', frames: 75, lastPts: 2.467 },
  { source: 'assets/crane-figure-motion.webm', frames: 75, lastPts: 2.467 },
  { source: 'assets/crane-flock-motion.webm', frames: 75, lastPts: 2.467 },
  { source: 'assets/aod-figure-motion.webm', frames: 78, lastPts: 2.567 },
  { source: 'assets/figure3-motion.webm', frames: 78, lastPts: 2.567 }
];

const forbiddenEmittedNames = [
  /hero-figure-scrub/i,
  /(?:back1|middle1|arch2[bd]-alpha)\.[a-z0-9]+$/i,
  /figure2(?:a|b)-alpha/i,
  /figure2-duel-alpha/i,
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
  const sourcePath = path.join(repoDir, source);
  const bytes = await readFile(sourcePath);
  return {
    source,
    category,
    bytes: bytes.byteLength,
    sha256: sha256(bytes)
  };
}

async function inspectCanonicalVideo(contract) {
  const sourcePath = path.join(repoDir, contract.source);
  let parsed;
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-count_frames',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=avg_frame_rate,nb_read_frames:frame=best_effort_timestamp_time',
      '-of', 'json',
      sourcePath
    ], { encoding: 'utf8' });
    parsed = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`ffprobe failed for ${contract.source}`, { cause: error });
  }
  const stream = parsed.streams?.[0];
  const frames = parsed.frames ?? [];
  const firstPts = Number(frames[0]?.best_effort_timestamp_time);
  const lastPts = Number(frames.at(-1)?.best_effort_timestamp_time);
  const decodedFrames = Number(stream?.nb_read_frames);
  assert(stream?.avg_frame_rate === '30/1', `${contract.source} must be 30fps`);
  assert(decodedFrames === contract.frames, `${contract.source} frame count ${decodedFrames} != ${contract.frames}`);
  assert(frames.length === contract.frames, `${contract.source} PTS sample count ${frames.length} != ${contract.frames}`);
  assert(Math.abs(firstPts) < 0.0005, `${contract.source} first PTS ${firstPts} is not 0`);
  assert(
    Math.abs(lastPts - contract.lastPts) < 0.0005,
    `${contract.source} last PTS ${lastPts} != ${contract.lastPts}`
  );
  return {
    source: contract.source,
    fps: stream.avg_frame_rate,
    frames: decodedFrames,
    firstPts,
    lastPts
  };
}

const inventorySources = [
  ...animationWebmSources.map((source) => ({ source, category: source === 'assets/figure1.webm' ? 'hero-animation' : 'animation-webm' })),
  ...adoptedWebpSources.map((source) => ({ source, category: 'adopted-webp' })),
  ...losslessWebpSources.map((source) => ({ source, category: 'lossless-webp' })),
  ...retainedImageSources.map((source) => ({ source, category: 'retained-image' }))
];
assert(inventorySources.length === 38, `expected 38 homepage source entries, found ${inventorySources.length}`);
assert(adoptedWebpSources.length === 11, `expected 11 adopted WebP sources, found ${adoptedWebpSources.length}`);
assert(losslessWebpSources.length === 17, `expected 17 lossless WebP sources, found ${losslessWebpSources.length}`);
assert(animationWebmSources.length === 9, `expected 9 animation WebM sources, found ${animationWebmSources.length}`);

const [sourceEntries, emittedFiles, canonicalVideos] = await Promise.all([
  Promise.all(inventorySources.map(({ source, category }) => sourceEntry(source, category))),
  filesBelow(assetsDir),
  Promise.all(canonicalVideoContracts.map(inspectCanonicalVideo))
]);
const emittedEntries = await Promise.all(emittedFiles.map(async (file) => {
  const bytes = await readFile(file);
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

const mediaExtensions = new Set(['.png', '.jpg', '.webp', '.webm']);
const emittedMedia = emittedEntries.filter((entry) => mediaExtensions.has(mediaExtension(entry.path)));
const emittedWebm = emittedEntries.filter((entry) => mediaExtension(entry.path) === '.webm');
const emittedWebp = emittedEntries.filter((entry) => mediaExtension(entry.path) === '.webp');
const emittedJpg = emittedEntries.filter((entry) => mediaExtension(entry.path) === '.jpg');
const emittedPng = emittedEntries.filter((entry) => mediaExtension(entry.path) === '.png');
assert(emittedMedia.length === 38, `expected exactly 38 emitted homepage media files, found ${emittedMedia.length}`);
assert(emittedWebm.length === 9, `expected exactly 9 emitted animation WebM files, found ${emittedWebm.length}`);
assert(emittedWebp.length === 28, `expected exactly 28 emitted WebP files, found ${emittedWebp.length}`);
assert(emittedJpg.length === 1, `expected exactly 1 emitted JPG file, found ${emittedJpg.length}`);
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
  schemaVersion: 1,
  pass: true,
  budgets: {
    homepageRuntimeMediaBytesMax: HOMEPAGE_RUNTIME_MEDIA_BYTES_MAX,
    heroBeforeFirstScrollTransferMax: HERO_BEFORE_FIRST_SCROLL_TRANSFER_MAX
  },
  actual: {
    homepageRuntimeMediaBytes: homepageRuntimeBytes,
    heroBeforeFirstScrollBytes,
    inventoryFileCount: inventory.length,
    animationWebmCount: emittedWebm.length,
    webpCount: emittedWebp.length,
    jpgCount: emittedJpg.length,
    pngCount: emittedPng.length
  },
  canonicalVideos,
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
  webp: emittedWebp.length,
  jpg: emittedJpg.length,
  png: emittedPng.length,
  pass: true
})}\n`);
