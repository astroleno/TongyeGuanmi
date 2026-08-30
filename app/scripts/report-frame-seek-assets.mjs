import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  alphaVideoSourcePairs,
  animationHevcAlphaSources,
  animationWebmSources,
  canonicalVideoContracts,
  frozenHomepageMedia,
  packedAlphaVideoSources,
  portraitOnlyImageSources
} from './homepage-media-contract.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const appDir = path.dirname(path.dirname(SCRIPT_PATH));
const repoDir = path.dirname(appDir);
const frozenBySource = new Map(
  frozenHomepageMedia.map((entry) => [entry.source, entry])
);
const canonicalBySource = new Map(
  canonicalVideoContracts.map((entry) => [entry.source, entry])
);
const webmByHevc = new Map(
  alphaVideoSourcePairs.map(({ webm, hevc }) => [hevc, webm])
);
const packedBySource = new Map([
  ['assets/figure1-rgb-alpha.mp4', 'assets/figure1.webm'],
  ['assets/figure2-pair-motion-rgb-alpha.mp4', 'assets/figure2-pair-motion.webm'],
  ['assets/aod-figure-motion-rgb-alpha.mp4', 'assets/aod-figure-motion.webm'],
  ['assets/ph-figure-motion-rgb-alpha.mp4', 'assets/ph-figure-motion.webm'],
  ['assets/crane-figure-motion-rgb-alpha.mp4', 'assets/crane-figure-motion.webm'],
  ['assets/crane-flock-motion-rgb-alpha.mp4', 'assets/crane-flock-motion.webm']
]);
const mediaBudgetActualKeys = Object.freeze({
  homepageRuntimeMediaBytesMax: 'homepageRuntimeMediaBytes',
  heroBeforeFirstScrollTransferMax: 'heroBeforeFirstScrollBytes',
  presentationWebpBytesMax: 'presentationWebpBytes',
  allWebpBytesMax: 'webpBytes',
  desktopStaticPathBytesMax: 'desktopStaticPathBytes'
});
const categoryBySource = new Map([
  ...animationWebmSources.map((source) => [
    source,
    source === 'assets/figure1.webm' ? 'hero-animation' : 'animation-webm'
  ]),
  ...animationHevcAlphaSources.map((source) => [
    source,
    source === 'assets/figure1-hevc-alpha.mp4'
      ? 'hero-animation-hevc'
      : 'animation-hevc-alpha'
  ]),
  ...packedAlphaVideoSources.map((source) => [source, 'portrait-packed-alpha'])
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function parseRational(value, label = 'rational') {
  const match = String(value ?? '').trim().match(/^(\d+)\/(\d+)$/);
  if (!match || Number(match[2]) === 0) {
    throw new Error(`${label} must be a positive rational, received ${value}`);
  }
  const numerator = Number(match[1]);
  const denominator = Number(match[2]);
  assert(numerator > 0 && denominator > 0, `${label} must be positive`);
  return { numerator, denominator };
}

function gcd(left, right) {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a || 1;
}

function reduceRational(numerator, denominator) {
  const divisor = gcd(numerator, denominator);
  return {
    numerator: numerator / divisor,
    denominator: denominator / divisor
  };
}

function approximateFrameRate(value) {
  const commonRates = [
    [24, 1],
    [25, 1],
    [30, 1],
    [60, 1],
    [24000, 1001],
    [30000, 1001],
    [60000, 1001]
  ];
  const match = commonRates.find(([numerator, denominator]) => (
    Math.abs(value - numerator / denominator) < 1e-6
  ));
  if (match) return { numerator: match[0], denominator: match[1] };
  const denominator = 1_000_000;
  return reduceRational(Math.round(value * denominator), denominator);
}

function framePts(record, index) {
  const value = record.ptsSeconds
    ?? record.ptsTime
    ?? record.pts_time
    ?? record.bestEffortTimestampSeconds
    ?? record.best_effort_timestamp_time;
  const pts = Number(value);
  if (!Number.isFinite(pts)) {
    throw new Error(`missing frame PTS at index ${index}`);
  }
  return pts;
}

function frameDuration(record) {
  const value = record.durationSeconds
    ?? record.durationTime
    ?? record.pkt_duration_time;
  if (value === undefined || value === null || value === '') return null;
  const duration = Number(value);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('frame duration must be a positive finite number');
  }
  return duration;
}

function frameIsKey(record) {
  return Number(
    record.keyFrame
      ?? record.key_frame
      ?? record.keyframe
      ?? 0
  ) === 1;
}

function expectedNumber(expected, names) {
  for (const name of names) {
    if (expected?.[name] !== undefined) return Number(expected[name]);
  }
  return undefined;
}

function assertNear(actual, expected, label, tolerance = 1e-3) {
  if (!Number.isFinite(expected) || Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label} ${actual} != frozen ${expected}`);
  }
}

function inferFrameRate(records) {
  const declared = records[0]?.frameRate
    ?? records[0]?.rFrameRate
    ?? records[0]?.r_frame_rate;
  if (declared) return parseRational(declared, 'frame rate');
  assert(records.length > 1, 'at least two frames are required to infer frame rate');
  const firstDelta = framePts(records[1], 1) - framePts(records[0], 0);
  assert(firstDelta > 0, 'frame PTS must increase');
  return approximateFrameRate(1 / firstDelta);
}

export function summarizeFrameProbe(records, { frameRate, expected } = {}) {
  assert(Array.isArray(records) && records.length > 0, 'frame probe must contain frames');
  const rational = frameRate
    ? parseRational(frameRate, 'frame rate')
    : inferFrameRate(records);
  const frameDurationSeconds = rational.denominator / rational.numerator;
  const pts = records.map((record, index) => framePts(record, index));
  const durations = records.map(frameDuration).filter((value) => value !== null);
  const timestampTolerance = Math.max(1e-6, frameDurationSeconds * 0.03);

  for (let index = 1; index < pts.length; index += 1) {
    const delta = pts[index] - pts[index - 1];
    if (delta <= 0 || Math.abs(delta - frameDurationSeconds) > timestampTolerance) {
      throw new Error(`variable frame rate at frame ${index}: delta ${delta}`);
    }
  }
  for (const duration of durations) {
    if (Math.abs(duration - frameDurationSeconds) > timestampTolerance) {
      throw new Error(`variable frame rate: duration ${duration}`);
    }
  }

  const keyframeIndexes = records.flatMap((record, index) => (
    frameIsKey(record) ? [index] : []
  ));
  assert(keyframeIndexes.length > 0, 'frame probe contains no keyframes');
  assert(keyframeIndexes[0] === 0, 'frame probe must start with a keyframe');
  const gopLengths = keyframeIndexes.slice(1).map((index, position) => (
    index - keyframeIndexes[position]
  ));
  gopLengths.push(records.length - keyframeIndexes.at(-1));
  const summary = {
    frameCount: records.length,
    keyframeCount: keyframeIndexes.length,
    maxGopFrames: Math.max(...gopLengths),
    fpsNumerator: rational.numerator,
    fpsDenominator: rational.denominator,
    firstPtsSeconds: pts[0],
    lastPtsSeconds: pts.at(-1)
  };

  const expectedFrameCount = expectedNumber(expected, ['frameCount', 'frames']);
  if (expectedFrameCount !== undefined && summary.frameCount !== expectedFrameCount) {
    throw new Error(
      `frame count ${summary.frameCount} != frozen ${expectedFrameCount}`
    );
  }
  const expectedFirstPts = expectedNumber(
    expected,
    ['firstPtsSeconds', 'firstPts']
  );
  if (expectedFirstPts !== undefined) {
    assertNear(summary.firstPtsSeconds, expectedFirstPts, 'first PTS');
  }
  const expectedLastPts = expectedNumber(
    expected,
    ['lastPtsSeconds', 'lastPts']
  );
  if (expectedLastPts !== undefined) {
    assertNear(summary.lastPtsSeconds, expectedLastPts, 'last PTS');
  }
  const expectedNumerator = expectedNumber(expected, ['fpsNumerator']);
  const expectedDenominator = expectedNumber(expected, ['fpsDenominator']);
  if (
    expectedNumerator !== undefined
    && (summary.fpsNumerator !== expectedNumerator
      || summary.fpsDenominator !== expectedDenominator)
  ) {
    throw new Error(
      `frame rate ${summary.fpsNumerator}/${summary.fpsDenominator}`
        + ` != frozen ${expectedNumerator}/${expectedDenominator}`
    );
  }
  return summary;
}

function runResult(command, args, label) {
  const result = spawnSync(command, args, {
    cwd: repoDir,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024
  });
  if (result.error) throw new Error(`${label} failed: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(
      `${label} failed with exit ${result.status}: ${result.stderr || result.stdout}`
    );
  }
  return result.stdout;
}

function run(command, args, label) {
  return runResult(command, args, label);
}

function probeVideo(sourcePath) {
  const output = run('ffprobe', [
    '-v', 'error',
    '-count_frames',
    '-select_streams', 'v:0',
    '-show_entries',
    'stream=codec_name,profile,width,height,pix_fmt,r_frame_rate,avg_frame_rate,nb_read_frames:frame=key_frame,pts_time,best_effort_timestamp_time,pkt_duration_time',
    '-of', 'json',
    sourcePath
  ], 'ffprobe');
  const parsed = JSON.parse(output);
  const stream = parsed.streams?.[0];
  assert(stream, `ffprobe returned no video stream for ${sourcePath}`);
  const records = parsed.frames ?? [];
  const summary = summarizeFrameProbe(records, {
    frameRate: stream.r_frame_rate
  });
  return { stream, summary, records };
}

function expectedFor(source, referenceSummary) {
  const contract = canonicalBySource.get(source);
  if (contract) {
    const { numerator, denominator } = parseRational(contract.fps, `${source} fps`);
    return {
      frameCount: contract.frames,
      fpsNumerator: numerator,
      fpsDenominator: denominator,
      firstPtsSeconds: contract.firstPts,
      lastPtsSeconds: contract.lastPts
    };
  }
  return referenceSummary;
}

function measurePlaneSsim(canonicalPath, packedPath, packedStream, mode) {
  const packedWidth = Number(packedStream.width);
  const packedHeight = Number(packedStream.height);
  assert(packedWidth % 2 === 0, `${packedPath} packed width must be even`);
  const halfWidth = packedWidth / 2;
  const scale = `scale=${halfWidth}:${packedHeight}:flags=lanczos`;
  const filter = mode === 'alpha'
    ? `[0:v]format=rgba,${scale},format=rgba,alphaextract[src];`
      + `[1:v]crop=${halfWidth}:${packedHeight}:${halfWidth}:0,format=gray[packed];`
      + '[src][packed]ssim'
    : `[0:v]format=gbrp,${scale}[src];`
      + `[1:v]crop=${halfWidth}:${packedHeight}:0:0,format=gbrp[packed];`
      + '[src][packed]ssim';
  const result = spawnSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'info',
    '-c:v', 'libvpx-vp9', '-i', canonicalPath,
    '-i', packedPath,
    '-filter_complex', filter,
    '-an', '-f', 'null', '-'
  ], {
    cwd: repoDir,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024
  });
  if (result.error) {
    throw new Error(`ffmpeg ${mode} SSIM failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `ffmpeg ${mode} SSIM failed with exit ${result.status}: `
        + `${result.stderr || result.stdout}`
    );
  }
  const output = `${result.stdout}\n${result.stderr}`;
  const matches = [...output.matchAll(/All:([0-9.]+)/g)];
  const value = Number(matches.at(-1)?.[1]);
  assert(Number.isFinite(value), `could not measure ${mode} SSIM for ${packedPath}`);
  return value;
}

function parseBudgetExpression(source, name) {
  const match = source.match(new RegExp(`const ${name} = ([^;]+);`));
  assert(match, `unable to read ${name} from media inventory verifier`);
  const expression = match[1].replaceAll('_', '').trim();
  const mib = 1024 * 1024;
  const mibMatch = expression.match(/^(\d+)\s*\*\s*MiB$/);
  if (mibMatch) return Number(mibMatch[1]) * mib;
  assert(/^\d+$/.test(expression), `${name} is not a supported budget expression`);
  return Number(expression);
}

function readMediaBudgets() {
  const verifier = readFileSync(
    path.join(appDir, 'scripts/verify-homepage-media-inventory.mjs'),
    'utf8'
  );
  return {
    homepageRuntimeMediaBytesMax: parseBudgetExpression(
      verifier,
      'HOMEPAGE_RUNTIME_MEDIA_BYTES_MAX'
    ),
    heroBeforeFirstScrollTransferMax: parseBudgetExpression(
      verifier,
      'HERO_BEFORE_FIRST_SCROLL_TRANSFER_MAX'
    ),
    presentationWebpBytesMax: parseBudgetExpression(
      verifier,
      'PRESENTATION_WEBP_BYTES_MAX'
    ),
    allWebpBytesMax: parseBudgetExpression(verifier, 'ALL_WEBP_BYTES_MAX'),
    desktopStaticPathBytesMax: parseBudgetExpression(
      verifier,
      'DESKTOP_STATIC_PATH_BYTES_MAX'
    )
  };
}

function sourceBudgetReport() {
  const inventory = frozenHomepageMedia;
  const webp = inventory.filter((entry) => entry.source.endsWith('.webp'));
  const webm = inventory.filter((entry) => entry.source.endsWith('.webm'));
  const hevc = inventory.filter((entry) => (
    animationHevcAlphaSources.includes(entry.source)
  ));
  const packed = inventory.filter((entry) => entry.category === 'portrait-packed-alpha');
  const presentationWebp = inventory.filter((entry) => entry.category === 'presentation-webp');
  const heroPreScrollSources = new Set([
    'assets/hero-back.webp',
    'assets/hero-middle.webp',
    'assets/middle1_depth.webp',
    'assets/hero-figure-poster.webp'
  ]);
  const sum = (entries) => entries.reduce((total, entry) => total + entry.bytes, 0);
  const webpBytes = sum(webp);
  const webmBytes = sum(webm);
  const desktopWebpBytes = sum(
    webp.filter((entry) => !portraitOnlyImageSources.includes(entry.source))
  );
  const actual = {
    homepageRuntimeMediaBytes: sum(inventory),
    heroBeforeFirstScrollBytes: sum(
      inventory.filter((entry) => heroPreScrollSources.has(entry.source))
    ),
    presentationWebpBytes: sum(presentationWebp),
    webpBytes,
    desktopWebpBytes,
    webmBytes,
    hevcBytes: sum(hevc),
    packedAlphaVideoBytes: sum(packed),
    desktopStaticPathBytes: desktopWebpBytes + webmBytes,
    iosStaticPathBytes: webpBytes + sum(hevc),
    portraitPackedAlphaStaticPathBytes: webpBytes + sum(packed),
    largestHomepageMediaBytes: Math.max(...inventory.map((entry) => entry.bytes)),
    inventoryFileCount: inventory.length
  };
  const budgets = readMediaBudgets();
  const headroom = Object.fromEntries(
    Object.entries(budgets).map(([name, ceiling]) => {
      const actualName = mediaBudgetActualKeys[name];
      return [actualName, ceiling - (actual[actualName] ?? 0)];
    })
  );
  return {
    source: 'app/scripts/verify-homepage-media-inventory.mjs',
    budgets,
    actual,
    headroom,
    homepageMediaPerAssetAssertion: {
      enforced: false,
      value: null,
      note: 'The repository has no 16 MiB per-asset homepage-media assertion.'
    }
  };
}

function readCdnConstraint() {
  const policyPath = path.join(appDir, 'build/cdn-release-policy.json');
  const policy = JSON.parse(readFileSync(policyPath, 'utf8'));
  const hasObjectLimit = Object.keys(policy).some((key) => /bytes|size|limit/i.test(key));
  return {
    policy: 'app/build/cdn-release-policy.json',
    documentedProviderPerObjectLimit: hasObjectLimit ? 'DOCUMENTED' : 'NOT_DOCUMENTED',
    status: hasObjectLimit ? 'VERIFIED_IN_REPOSITORY' : 'UNVERIFIED_EXTERNAL_CONSTRAINT',
    mediaExtensions: policy.mediaExtensions
  };
}

function readProductMinimumIOS() {
  return {
    declaredProductMinimumIOS: 'UNDECLARED',
    source: 'No checked-in product support policy declares a minimum iOS version.'
  };
}

function formatBytes(value) {
  return `${value.toLocaleString('en-US')} B`;
}

function formatSsim(value) {
  return value === null || value === undefined ? '—' : value.toFixed(6);
}

export function renderMarkdown(report) {
  const budgetRows = Object.entries(report.budgetReport.budgets).map(([name, ceiling]) => {
    const actualName = mediaBudgetActualKeys[name];
    const actual = report.budgetReport.actual[actualName];
    const headroom = report.budgetReport.headroom[actualName];
    return `| ${name} | ${formatBytes(ceiling)} | ${formatBytes(actual)} | ${formatBytes(headroom)} |`;
  });
  const inventoryRows = report.videos.map((entry) => {
    const packed = entry.packedComparison;
    return `| ${entry.source} | ${entry.category} | ${entry.codecName} | `
      + `${entry.width}×${entry.height} | ${entry.frameCount} | `
      + `${entry.fpsNumerator}/${entry.fpsDenominator} | ${entry.firstPtsSeconds} | `
      + `${entry.lastPtsSeconds} | ${entry.keyframeCount} | ${entry.maxGopFrames} | `
      + `${formatBytes(entry.bytes)} | ${entry.sha256} | `
      + `${packed ? formatSsim(packed.colorSsim) : '—'} | `
      + `${packed ? formatSsim(packed.alphaSsim) : '—'} |`;
  });
  const riskRows = report.candidateSizeRisks
    .map((risk) => `| ${risk.source} | ${risk.reason} |`);
  return [
    '# Frame-lock Spike baseline',
    '',
    '> This is the frozen media/frame inventory before the disposable exact-frame Spike. It is not a migration decision.',
    '',
    '- Generated from commit: `' + report.sourceCommit + '`',
    '- declaredProductMinimumIOS: `' + report.support.declaredProductMinimumIOS + '`',
    '- External per-object provider limit: `' + report.cdn.status + '`',
    `- Video sources: ${report.videos.length} (8 WebM, 8 HEVC alpha, 6 packed H.264)`,
    '',
    '## Media budgets',
    '',
    '| Ceiling | Limit | Actual | Headroom |',
    '| --- | ---: | ---: | ---: |',
    ...budgetRows,
    '',
    '- `largestHomepageMediaBytes`: ' + formatBytes(report.budgetReport.actual.largestHomepageMediaBytes),
    '- The homepage-media verifier has no 16 MiB per-asset assertion; the number above is report-only.',
    '',
    '## Frozen animation inventory',
    '',
    '| Source | Category | Codec | Dimensions | Frames | FPS | First PTS | Last PTS | Keyframes | Max GOP | Bytes | SHA-256 | Color SSIM | Alpha SSIM |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: |',
    ...inventoryRows,
    '',
    '## Candidate-size risk rows',
    '',
    '| Source | Risk |',
    '| --- | --- |',
    ...riskRows,
    '',
    '## Scope and provenance',
    '',
    '- Sources are the allowlisted animation exports from `homepage-media-contract.mjs`; arbitrary directories are not scanned.',
    '- Packed color/alpha SSIM compares the packed H.264 planes with its canonical WebM source at the packed surface dimensions.',
    '- `UNVERIFIED_EXTERNAL_CONSTRAINT` means the checked-in CDN policy documents extension routing but no provider per-object size cap.',
    '- Product-minimum iOS remains `UNDECLARED`; no test device is substituted for a product requirement.',
    ''
  ].join('\n');
}

function cliOptions(argv) {
  argv = argv.filter((value) => value !== '--');
  const markdown = argv.includes('--markdown');
  const outputIndex = argv.findIndex((value) => value === '--output');
  const inlineOutput = argv.find((value) => value.startsWith('--output='));
  const output = inlineOutput
    ? inlineOutput.slice('--output='.length)
    : outputIndex >= 0
      ? argv[outputIndex + 1]
      : null;
  if (outputIndex >= 0 && (!output || output.startsWith('--'))) {
    throw new Error('--output requires a path');
  }
  return { markdown, output };
}

export function buildFrameSeekReport() {
  const sourceCommit = run('git', ['rev-parse', 'HEAD^{commit}'], 'git source commit').trim();
  const descriptors = [
    ...animationWebmSources,
    ...animationHevcAlphaSources,
    ...packedAlphaVideoSources
  ];
  const referenceSummaries = new Map();
  const videos = [];
  for (const source of descriptors) {
    const expectedSource = webmByHevc.get(source) ?? packedBySource.get(source) ?? source;
    const sourcePath = path.join(repoDir, source);
    const expectedFrozen = frozenBySource.get(source);
    assert(expectedFrozen, `${source} is missing from the frozen media contract`);
    const bytes = readFileSync(sourcePath);
    assert(bytes.byteLength === expectedFrozen.bytes, `${source} bytes changed`);
    const digest = sha256(bytes);
    assert(digest === expectedFrozen.sha256, `${source} SHA-256 changed`);
    const { stream, summary, records } = probeVideo(sourcePath);
    const expected = expectedFor(
      source,
      referenceSummaries.get(expectedSource)
    );
    let checkedSummary;
    try {
      checkedSummary = summarizeFrameProbe(records, {
        frameRate: stream.r_frame_rate,
        expected
      });
    } catch (error) {
      throw new Error(`${source}: ${error.message}`, { cause: error });
    }
    const entry = {
      source,
      category: categoryBySource.get(source),
      codecName: stream.codec_name,
      profile: stream.profile ?? null,
      width: Number(stream.width),
      height: Number(stream.height),
      pixFmt: stream.pix_fmt ?? null,
      frameCount: checkedSummary.frameCount,
      keyframeCount: checkedSummary.keyframeCount,
      maxGopFrames: checkedSummary.maxGopFrames,
      fpsNumerator: checkedSummary.fpsNumerator,
      fpsDenominator: checkedSummary.fpsDenominator,
      firstPtsSeconds: checkedSummary.firstPtsSeconds,
      lastPtsSeconds: checkedSummary.lastPtsSeconds,
      bytes: bytes.byteLength,
      sha256: digest,
      frozenBytes: expectedFrozen.bytes,
      frozenSha256: expectedFrozen.sha256
    };
    if (source.endsWith('.webm')) referenceSummaries.set(source, summary);
    videos.push(entry);
  }

  for (const entry of videos.filter((video) => packedBySource.has(video.source))) {
    const canonicalSource = packedBySource.get(entry.source);
    const canonical = videos.find((video) => video.source === canonicalSource);
    assert(canonical, `${entry.source} canonical WebM is missing`);
    const packedPath = path.join(repoDir, entry.source);
    const canonicalPath = path.join(repoDir, canonicalSource);
    entry.packedComparison = {
      canonicalSource,
      colorSsim: measurePlaneSsim(
        canonicalPath,
        packedPath,
        { width: entry.width, height: entry.height },
        'color'
      ),
      alphaSsim: measurePlaneSsim(
        canonicalPath,
        packedPath,
        { width: entry.width, height: entry.height },
        'alpha'
      )
    };
  }

  return {
    schemaVersion: 1,
    sourceCommit,
    pass: true,
    videos,
    budgetReport: sourceBudgetReport(),
    cdn: readCdnConstraint(),
    support: readProductMinimumIOS(),
    candidateSizeRisks: [
      {
        source: 'assets/aod-figure-motion-rgb-alpha.mp4',
        reason: '3344×942, 78 frames, current max GOP 8, 2,637,788 B; GOP 1 candidate size is unknown until measured.'
      },
      {
        source: 'assets/figure2-pair-motion-rgb-alpha.mp4',
        reason: '156 frames, current max GOP 30, 8,180,603 B; GOP 1 candidate size is unknown until measured.'
      }
    ]
  };
}

if (path.resolve(process.argv[1] ?? '') === SCRIPT_PATH) {
  const options = cliOptions(process.argv.slice(2));
  const report = buildFrameSeekReport();
  if (options.markdown && options.output) {
    const outputPath = path.resolve(process.cwd(), options.output);
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${renderMarkdown(report)}\n`, 'utf8');
    report.markdown = path.relative(repoDir, outputPath).split(path.sep).join('/');
  }
  process.stdout.write(`${JSON.stringify(report)}\n`);
}
