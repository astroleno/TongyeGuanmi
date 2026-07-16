import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { promisify } from 'node:util';
import { canonicalVideoContracts } from './homepage-media-contract.mjs';

const execFileAsync = promisify(execFile);
const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoDir = path.dirname(appDir);
const TIMING_TOLERANCE_SECONDS = 0.001;
const FIGURE2_COMBINED_CONTRACT = {
  source: 'assets/figure2-pair-motion.webm',
  sourceBytes: 4_940_268,
  sourceSha256: 'a87db407fd39f6977aa0b663ffd16e54929259e6651728997f7c072a33ffaa80',
  frames: 156,
  seamFrames: [77, 78],
  archivedBytes: 15_926_811,
  authorities: [
    {
      source: 'archive/assets/homepage-media/2026-07-16/replaced/figure2-left-motion.webm',
      bytes: 4_063_470,
      sha256: '9e58707c959d9111af1f1ea2420855292a0449862dc68c93298efc48866597a4'
    },
    {
      source: 'archive/assets/homepage-media/2026-07-16/replaced/figure2-right-motion.webm',
      bytes: 3_578_198,
      sha256: '7dbd981ccdda04a2ca0d598fdcc878151ec0c9b6a375249f38cc0ca30d2be737'
    },
    {
      source: 'archive/assets/homepage-media/2026-07-16/replaced/figure2-left-motion-reverse.webm',
      bytes: 4_366_640,
      sha256: 'cab4465ae951700382d1930dc47ddb39d801b8f38479cf6d8a5a225b91de4f32'
    },
    {
      source: 'archive/assets/homepage-media/2026-07-16/replaced/figure2-right-motion-reverse.webm',
      bytes: 3_918_503,
      sha256: 'fd0c874c1483024c9d446d7339599bde9e0b5e63e36985b7c75240f6933e35d9'
    }
  ]
};
const AOD_ALPHA_CONTRACT = {
  source: 'assets/aod-figure-motion.webm',
  frames: 78,
  firstFullAlphaFrame: 16,
  firstFullAlphaPts: 0.533,
  averageWitnesses: new Map([
    [0, 32.5856],
    [8, 34.6674],
    [15, 36.1518],
    [16, 255],
    [77, 255]
  ])
};
const HERO_TRIMMED_CONTRACT = {
  source: 'assets/figure1.webm',
  sourceSha256: 'a472e2f9f62c9cdd447fe78664020e3dad7e0ce37900bb1c4b4e7fb1db379d70',
  sourceBytes: 2_019_536,
  authority: path.join(
    repoDir,
    'archive/assets/homepage-media/2026-07-15/replaced/figure1-1080x1920-full-5.042s.webm'
  ),
  authoritySha256: '14d881a16c0bef8f12526100aca1d014e0b8d38d8d09510e3c2aa43bb0030c35',
  authorityBytes: 10_639_235,
  frames: 49,
  colorSsimMin: 0.994,
  alphaSsimMin: 0.9935
};
const CRANE_FLOCK_VISUAL_CONTRACT = {
  source: 'assets/crane-flock-motion.webm',
  sourceSha256: '708f45223f0cea5af23449d947050a86e5ec1ac959385561fa663ff44da5c37a',
  sourceBytes: 4_429_224,
  correctedFirstFrame: 'archive/assets/homepage-media/2026-07-15/sources/crane-flock-first-frame-corrected.webp',
  authority: path.join(
    repoDir,
    'archive/assets/homepage-media/2026-07-15/sources/crane-flock-74f-authority.webm'
  ),
  authoritySha256: 'b96e13b85f85a70c0e71d2f9c11ac64aca1830fa6af3c1ee3b7272133cf09457',
  authorityBytes: 2_651_324,
  frames: 74,
  colorSsimMin: 0.9985,
  alphaSsimMin: 0.993,
  frame0ColorSsimMin: 0.9995,
  frame0AlphaSsimMin: 0.9994,
  bodyWitnesses: [
    { x: 300, y: 115, label: 'upper-left-body' },
    { x: 926, y: 343, label: 'right-body' }
  ]
};
const CRANE_FLOCK_CORRECTED_FRAME_CONTRACT = {
  source: 'archive/assets/homepage-media/2026-07-15/sources/crane-flock-first-frame-corrected.webp',
  sourceSha256: 'cc3c35d6bf53ed5155aae22c64f1cd50cfc3b8864cbf23295fc0172a2a4b3ca4',
  sourceBytes: 118_116,
  authority: path.join(
    repoDir,
    'archive/assets/homepage-media/2026-07-15/sources/crane-flock-first-frame-hires.png'
  ),
  authoritySha256: 'f0e7e56fb83b4ca19d6d8c0bc352d4786d7ab0cff58637482ac2a4c6efd0f079',
  authorityBytes: 1_928_281,
  transparentGapWitnesses: [
    { x: 1025, y: 260, label: 'upper-right-leg-gap' },
    { x: 820, y: 535, label: 'lower-leg-gap' }
  ]
};
const CRANE_SINGLE_SOURCE_CONTRACT = {
  source: 'assets/crane-figure-motion.webm',
  sourceSha256: 'a66a6778bda2a6c2e3fb5241a69ba4f1e4422a1638608f6cc5eba57e8f53c2b9',
  sourceBytes: 3_218_940,
  authority: path.resolve(repoDir, '..', 'TongyeGuanmi', 'assets/crane-figure1-transition.webm'),
  authoritySha256: '995c0737bda965643175ac4a83aa2fa92cdcffddfa7c69a0c59b884fefabbdec',
  authorityBytes: 5_637_648,
  authorityFrames: 60,
  losslessReference: path.join(
    repoDir,
    'archive/assets/homepage-media/2026-07-15/replaced/crane-figure-motion-75f-lossless-single-source.webm'
  ),
  losslessReferenceSha256: 'b96e527dd4a61fecca4ef26a5892dac76147ab38a66724cc36043ab9b8d681e4',
  losslessReferenceBytes: 13_554_565,
  outputFrames: 75,
  colorSsimMin: 0.9938,
  alphaSsimMin: 0.9955,
  contactWitnesses: new Map([
    [0, 'ba246302862e2b4839e5f6b041e32ee1'],
    [15, '1db538d981d7345250d76a8431c9320f'],
    [30, '523d591b6696a560f5e7ab4f3c39fbc1'],
    [44, '7fcee8ab9a13abbe2cf51994ebf37d4a'],
    [59, '701196fe93c328e26ad125cde075c8c9'],
    [74, 'e1055d359645ca69b4d6fe938b5bda21']
  ])
};

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function ffprobe(source, args) {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      ...args,
      '-of', 'json',
      path.join(repoDir, source)
    ], { encoding: 'utf8' });
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`ffprobe failed for ${source}`, { cause: error });
  }
}

async function sha256File(source) {
  const bytes = await readFile(source);
  return {
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex')
  };
}

async function decodedSsim(reference, candidate, filterComplex) {
  let stderr;
  const decoderArgs = (source) => path.extname(source).toLowerCase() === '.webm'
    ? ['-c:v', 'libvpx-vp9']
    : [];
  try {
    ({ stderr } = await execFileAsync('ffmpeg', [
      '-v', 'info',
      ...decoderArgs(reference),
      '-i', reference,
      ...decoderArgs(candidate),
      '-i', candidate,
      '-filter_complex', filterComplex,
      '-an',
      '-f', 'null',
      '-'
    ], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }));
  } catch (error) {
    throw new Error(`ffmpeg SSIM failed for ${candidate}`, { cause: error });
  }
  const summary = stderr.split(/\r?\n/).findLast((line) => line.includes('SSIM Y:'));
  const match = summary?.match(/SSIM Y:([\d.]+).*All:([\d.]+)/);
  if (!match) {
    throw new Error(`ffmpeg SSIM summary missing for ${candidate}`);
  }
  return { y: Number(match[1]), all: Number(match[2]) };
}

async function inspectHeroTrimmedContract() {
  const contract = HERO_TRIMMED_CONTRACT;
  const outputPath = path.join(repoDir, contract.source);
  const [authorityIdentity, outputIdentity, probe, colorSsim, alphaSsim, alphaFrames] = await Promise.all([
    sha256File(contract.authority),
    sha256File(outputPath),
    ffprobe(contract.source, [
      '-count_frames',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,avg_frame_rate,r_frame_rate,nb_read_frames:stream_tags=alpha_mode:format=duration:frame=key_frame,best_effort_timestamp_time'
    ]),
    decodedSsim(
      contract.authority,
      outputPath,
      '[0:v]trim=start_frame=8:end_frame=57,setpts=PTS-STARTPTS,scale=720:1280:flags=lanczos,format=yuva420p[ref];[1:v]setpts=PTS-STARTPTS,format=yuva420p[candidate];[ref][candidate]ssim'
    ),
    decodedSsim(
      contract.authority,
      outputPath,
      '[0:v]trim=start_frame=8:end_frame=57,setpts=PTS-STARTPTS,scale=720:1280:flags=lanczos,format=yuva420p,alphaextract[ref];[1:v]setpts=PTS-STARTPTS,format=yuva420p,alphaextract[candidate];[ref][candidate]ssim'
    ),
    decodedAlphaStats(contract.source)
  ]);
  const stream = probe.streams?.[0];
  const frames = probe.frames ?? [];
  const pts = frames.map((frame) => Number(frame.best_effort_timestamp_time));
  const keyframes = frames.flatMap((frame, index) => Number(frame.key_frame) === 1 ? [index] : []);

  assert(authorityIdentity.bytes === contract.authorityBytes, 'Hero authority byte identity changed');
  assert(authorityIdentity.sha256 === contract.authoritySha256, 'Hero authority SHA-256 changed');
  assert(outputIdentity.bytes === contract.sourceBytes, 'Hero trimmed output byte identity changed');
  assert(outputIdentity.sha256 === contract.sourceSha256, 'Hero trimmed output SHA-256 changed');
  assert(stream?.width === 720 && stream?.height === 1280, 'Hero trimmed output must be 720x1280');
  assert(stream?.avg_frame_rate === '24/1' && stream?.r_frame_rate === '24/1', 'Hero trimmed output must be 24fps');
  assert(Number(stream?.nb_read_frames) === contract.frames && frames.length === contract.frames, 'Hero trimmed output must expose 49 frames');
  assertNear(Number(probe.format?.duration), 2.042, 'Hero trimmed output duration');
  assertNear(pts[0], 0, 'Hero trimmed first PTS');
  assertNear(pts.at(-1), 2, 'Hero trimmed last PTS');
  assert(streamAlphaMode(stream) === '1', 'Hero trimmed output alpha_mode tag must be 1');
  assert(keyframes.length === 7, `Hero trimmed keyframes ${keyframes.length} != 7`);
  assert(keyframes.every((frame, index) => index === 0 || frame - keyframes[index - 1] <= 8), 'Hero trimmed GOP exceeds 8 frames');
  assert(colorSsim.all >= contract.colorSsimMin, `Hero trimmed color SSIM ${colorSsim.all} < ${contract.colorSsimMin}`);
  assert(alphaSsim.all >= contract.alphaSsimMin, `Hero trimmed alpha SSIM ${alphaSsim.all} < ${contract.alphaSsimMin}`);
  assert(alphaFrames.length === contract.frames, 'Hero trimmed alpha frame count changed');
  assert(alphaFrames.every((frame) => frame.ymin === 0 && frame.ymax === 255), 'Hero trimmed alpha extrema must remain 0..255');

  return {
    source: contract.source,
    authority: path.relative(repoDir, contract.authority),
    dimensions: '720x1280',
    fps: '24/1',
    frames: contract.frames,
    duration: 2.042,
    lastPts: 2,
    keyframes: keyframes.length,
    colorSsim: colorSsim.all,
    alphaSsim: alphaSsim.all
  };
}

async function inspectCraneFlockVisualContract() {
  const contract = CRANE_FLOCK_VISUAL_CONTRACT;
  const outputPath = path.join(repoDir, contract.source);
  const correctedFirstFramePath = path.join(repoDir, contract.correctedFirstFrame);
  const authoritySource = path.relative(repoDir, contract.authority);
  const [
    authorityIdentity,
    outputIdentity,
    colorSsim,
    alphaSsim,
    authorityAlpha,
    outputAlpha,
    correctedFrameRgba,
    canonicalFrame0Rgba,
    frame0ColorSsim,
    frame0AlphaSsim
  ] = await Promise.all([
    sha256File(contract.authority),
    sha256File(outputPath),
    decodedSsim(
      contract.authority,
      outputPath,
      '[0:v]trim=start_frame=1:end_frame=74,setpts=PTS-STARTPTS,format=yuva420p[ref];[1:v]trim=start_frame=1:end_frame=74,setpts=PTS-STARTPTS,format=yuva420p[candidate];[ref][candidate]ssim'
    ),
    decodedSsim(
      contract.authority,
      outputPath,
      '[0:v]trim=start_frame=1:end_frame=74,setpts=PTS-STARTPTS,format=yuva420p,alphaextract[ref];[1:v]trim=start_frame=1:end_frame=74,setpts=PTS-STARTPTS,format=yuva420p,alphaextract[candidate];[ref][candidate]ssim'
    ),
    decodedAlphaStats(authoritySource),
    decodedAlphaStats(contract.source),
    decodedStillRgba(correctedFirstFramePath),
    decodedStillRgba(outputPath),
    decodedSsim(
      correctedFirstFramePath,
      outputPath,
      '[0:v]settb=1/1000,setpts=0,format=yuva420p[ref];[1:v]trim=start_frame=0:end_frame=1,settb=1/1000,setpts=0,format=yuva420p[candidate];[ref][candidate]ssim'
    ),
    decodedSsim(
      correctedFirstFramePath,
      outputPath,
      '[0:v]settb=1/1000,setpts=0,format=yuva420p,alphaextract[ref];[1:v]trim=start_frame=0:end_frame=1,settb=1/1000,setpts=0,format=yuva420p,alphaextract[candidate];[ref][candidate]ssim'
    )
  ]);

  assert(authorityIdentity.bytes === contract.authorityBytes, 'Crane flock authority byte identity changed');
  assert(authorityIdentity.sha256 === contract.authoritySha256, 'Crane flock authority SHA-256 changed');
  assert(outputIdentity.bytes === contract.sourceBytes, 'Crane flock output byte identity changed');
  assert(outputIdentity.sha256 === contract.sourceSha256, 'Crane flock output SHA-256 changed');
  assert(authorityAlpha.length === contract.frames && outputAlpha.length === contract.frames, 'Crane flock must retain all 74 authored alpha frames');
  for (let index = 1; index < contract.frames; index += 1) {
    assert(outputAlpha[index]?.ymin === authorityAlpha[index]?.ymin, `Crane flock frame ${index} alpha minimum changed`);
    assert(outputAlpha[index]?.ymax === authorityAlpha[index]?.ymax, `Crane flock frame ${index} alpha maximum changed`);
  }
  assert(colorSsim.all >= contract.colorSsimMin, `Crane flock color SSIM ${colorSsim.all} < ${contract.colorSsimMin}`);
  assert(alphaSsim.all >= contract.alphaSsimMin, `Crane flock alpha SSIM ${alphaSsim.all} < ${contract.alphaSsimMin}`);
  assert(frame0ColorSsim.all >= contract.frame0ColorSsimMin, `Crane flock corrected frame 0 color SSIM ${frame0ColorSsim.all} < ${contract.frame0ColorSsimMin}`);
  assert(frame0AlphaSsim.all >= contract.frame0AlphaSsimMin, `Crane flock corrected frame 0 alpha SSIM ${frame0AlphaSsim.all} < ${contract.frame0AlphaSsimMin}`);
  assert(correctedFrameRgba.byteLength === canonicalFrame0Rgba.byteLength, 'Crane flock frame 0 RGBA dimensions changed');
  const alphaAt = (rgba, x, y) => rgba[(y * 1280 + x) * 4 + 3];
  const bodyAlpha = contract.bodyWitnesses.map((witness) => ({
    ...witness,
    alpha: alphaAt(canonicalFrame0Rgba, witness.x, witness.y)
  }));
  for (const witness of bodyAlpha) {
    assert(witness.alpha === 255, `Crane flock frame 0 ${witness.label} alpha ${witness.alpha} != 255`);
  }
  const gapAlpha = CRANE_FLOCK_CORRECTED_FRAME_CONTRACT.transparentGapWitnesses.map((witness) => ({
    ...witness,
    alpha: alphaAt(canonicalFrame0Rgba, witness.x, witness.y)
  }));
  for (const witness of gapAlpha) {
    assert(witness.alpha <= 7, `Crane flock frame 0 ${witness.label} alpha ${witness.alpha} > 7`);
  }

  return {
    source: contract.source,
    authority: authoritySource,
    authoredFrames: contract.frames,
    terminalHold: 'runtime-held authored last frame',
    colorSsim: colorSsim.all,
    alphaSsim: alphaSsim.all,
    alphaExtremaParity: '73/73 unchanged motion frames; frame 0 intentionally corrected',
    correctedFrame0: {
      source: contract.correctedFirstFrame,
      colorSsim: frame0ColorSsim.all,
      alphaSsim: frame0AlphaSsim.all,
      bodyAlpha,
      gapAlpha
    }
  };
}

async function decodedStillRgba(source, filter) {
  try {
    const { stdout } = await execFileAsync('ffmpeg', [
      '-v', 'error',
      ...(path.extname(source).toLowerCase() === '.webm' ? ['-c:v', 'libvpx-vp9'] : []),
      '-i', source,
      ...(filter ? ['-vf', filter] : []),
      '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'
    ], { encoding: null, maxBuffer: 5 * 1024 * 1024 });
    return stdout;
  } catch (error) {
    throw new Error(`ffmpeg still decode failed for ${source}`, { cause: error });
  }
}

async function inspectCraneFlockCorrectedFrameContract() {
  const contract = CRANE_FLOCK_CORRECTED_FRAME_CONTRACT;
  const outputPath = path.join(repoDir, contract.source);
  const [authorityIdentity, outputIdentity, probe, authorityRgba, outputRgba] = await Promise.all([
    sha256File(contract.authority),
    sha256File(outputPath),
    ffprobe(contract.source, [
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,pix_fmt'
    ]),
    decodedStillRgba(
      contract.authority,
      'scale=1280:720:flags=lanczos,colorchannelmixer=rr=0.890:gg=0.893:bb=0.913:aa=1'
    ),
    decodedStillRgba(outputPath)
  ]);
  const stream = probe.streams?.[0];
  assert(authorityIdentity.bytes === contract.authorityBytes, 'Crane flock corrected-frame authority byte identity changed');
  assert(authorityIdentity.sha256 === contract.authoritySha256, 'Crane flock corrected-frame authority SHA-256 changed');
  assert(outputIdentity.bytes === contract.sourceBytes, 'Crane flock corrected-frame output byte identity changed');
  assert(outputIdentity.sha256 === contract.sourceSha256, 'Crane flock corrected-frame output SHA-256 changed');
  assert(stream?.width === 1280 && stream?.height === 720, 'Crane flock corrected frame must be 1280x720');
  assert(stream?.pix_fmt === 'argb', 'Crane flock corrected frame must retain lossless alpha');
  assert(authorityRgba.byteLength === outputRgba.byteLength, 'Crane flock corrected-frame decoded size changed');

  let alphaDifferences = 0;
  let visibleRgbDifferences = 0;
  for (let index = 0; index < authorityRgba.byteLength; index += 4) {
    const sourceAlpha = authorityRgba[index + 3];
    const outputAlpha = outputRgba[index + 3];
    if (sourceAlpha !== outputAlpha) alphaDifferences += 1;
    if (
      outputAlpha > 0
      && (
        authorityRgba[index] !== outputRgba[index]
        || authorityRgba[index + 1] !== outputRgba[index + 1]
        || authorityRgba[index + 2] !== outputRgba[index + 2]
      )
    ) {
      visibleRgbDifferences += 1;
    }
  }
  assert(alphaDifferences === 0, 'Crane flock corrected frame changed downsampled authority alpha');
  assert(visibleRgbDifferences === 0, 'Crane flock corrected frame changed visible downsampled authority RGB');
  const bodyWitness = (115 * 1280 + 300) * 4;
  assert(authorityRgba[bodyWitness + 3] === 255, 'Crane flock high-resolution body witness changed');
  assert(outputRgba[bodyWitness + 3] === 255, 'Crane flock corrected-frame body witness is not opaque');
  const rightBodyWitness = (343 * 1280 + 926) * 4;
  assert(authorityRgba[rightBodyWitness + 3] === 255, 'Crane flock high-resolution right-body witness changed');
  assert(outputRgba[rightBodyWitness + 3] === 255, 'Crane flock corrected-frame right-body witness is not opaque');
  for (const witness of contract.transparentGapWitnesses) {
    const index = (witness.y * 1280 + witness.x) * 4;
    assert(authorityRgba[index + 3] <= 7, `Crane flock ${witness.label} source witness changed`);
    assert(outputRgba[index + 3] <= 7, `Crane flock ${witness.label} is not transparent`);
  }

  return {
    source: contract.source,
    authority: path.relative(repoDir, contract.authority),
    dimensions: '1280x720',
    correction: 'high-resolution Lanczos downsample and motion tone match',
    alphaDifferences,
    visibleRgbDifferences,
    canonicalFrame0: 'embedded and verified by craneFlockVisual'
  };
}

async function decodedRgbaFramemd5(source, filter) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync('ffmpeg', [
      '-v', 'error',
      '-c:v', 'libvpx-vp9',
      '-i', source,
      ...(filter ? ['-vf', filter] : []),
      '-map', '0:v:0',
      '-an',
      '-fps_mode', 'passthrough',
      '-pix_fmt', 'rgba',
      '-f', 'framemd5',
      '-'
    ], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }));
  } catch (error) {
    throw new Error(`ffmpeg RGBA decode failed for ${source}`, { cause: error });
  }
  return stdout.split(/\r?\n/).flatMap((line) => {
    if (!line || line.startsWith('#')) return [];
    const fields = line.split(',').map((field) => field.trim());
    return [{
      dts: Number(fields[1]),
      pts: Number(fields[2]),
      duration: Number(fields[3]),
      bytes: Number(fields[4]),
      md5: fields[5]
    }];
  });
}

async function inspectFigure2CombinedContract() {
  const contract = FIGURE2_COMBINED_CONTRACT;
  const output = path.join(repoDir, contract.source);
  const [outputIdentity, authorityIdentities, probe, outputFrames, alphaFrames, directionColorSsim, directionAlphaSsim] = await Promise.all([
    sha256File(output),
    Promise.all(contract.authorities.map(async (authority) => ({
      ...authority,
      identity: await sha256File(path.join(repoDir, authority.source))
    }))),
    ffprobe(contract.source, [
      '-count_frames',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,avg_frame_rate,nb_read_frames:stream_tags=alpha_mode:format=duration:frame=key_frame,best_effort_timestamp_time'
    ]),
    decodedRgbaFramemd5(output),
    decodedAlphaStats(contract.source),
    decodedSsim(
      output,
      output,
      '[0:v]trim=start_frame=0:end_frame=78,setpts=N/(30*TB),format=yuva420p[forward];[1:v]trim=start_frame=78:end_frame=156,reverse,setpts=N/(30*TB),format=yuva420p[reverse];[forward][reverse]ssim'
    ),
    decodedSsim(
      output,
      output,
      '[0:v]trim=start_frame=0:end_frame=78,setpts=N/(30*TB),format=yuva420p,alphaextract[forward];[1:v]trim=start_frame=78:end_frame=156,reverse,setpts=N/(30*TB),format=yuva420p,alphaextract[reverse];[forward][reverse]ssim'
    )
  ]);
  const stream = probe.streams?.[0];
  const frames = probe.frames ?? [];
  const keyframes = frames.flatMap((frame, index) => Number(frame.key_frame) === 1 ? [index] : []);

  assert(outputIdentity.bytes === contract.sourceBytes, 'Figure2 combined output bytes changed');
  assert(outputIdentity.sha256 === contract.sourceSha256, 'Figure2 combined output identity changed');
  assert(outputIdentity.bytes < 5_000_000, 'Figure2 combined output must remain below 5 MB');
  assert(stream?.width === 792 && stream?.height === 660, 'Figure2 combined output must be 792x660');
  assert(Number(stream?.nb_read_frames) === contract.frames, 'Figure2 combined output must expose 156 frames');
  assert(outputFrames.length === contract.frames && alphaFrames.length === contract.frames, 'Figure2 combined decode must expose 156 RGBA/alpha frames');
  assert(streamAlphaMode(stream) === '1', 'Figure2 combined output must retain alpha_mode=1');
  assert(keyframes.includes(contract.seamFrames[0]) && keyframes.includes(contract.seamFrames[1]), 'Figure2 combined seam frames must both be keyframes');
  assert(outputFrames[77]?.md5 === outputFrames[78]?.md5, 'Figure2 combined seam frames must be decoded RGBA-identical');
  assert(outputFrames[77]?.bytes === outputFrames[78]?.bytes, 'Figure2 combined seam frame dimensions changed');
  assert(alphaFrames.every((frame) => frame.ymin === 0 && frame.ymax === 255), 'Figure2 combined frames must retain authored 0..255 alpha');
  assert(directionColorSsim.all >= 0.98, `Figure2 combined direction color SSIM ${directionColorSsim.all} < 0.98`);
  assert(directionAlphaSsim.all >= 0.98, `Figure2 combined direction alpha SSIM ${directionAlphaSsim.all} < 0.98`);
  assert(authorityIdentities.reduce((sum, authority) => sum + authority.identity.bytes, 0) === contract.archivedBytes, 'Figure2 archived authority byte total changed');
  for (const authority of authorityIdentities) {
    assert(authority.identity.bytes === authority.bytes, `${authority.source} bytes changed`);
    assert(authority.identity.sha256 === authority.sha256, `${authority.source} identity changed`);
  }

  return {
    source: contract.source,
    sourceBytes: outputIdentity.bytes,
    sourceSha256: outputIdentity.sha256,
    dimensions: '792x660',
    frames: contract.frames,
    forwardRange: 'frames 0..77 / 0.000..2.567s',
    reverseRange: 'frames 78..155 / 2.600..5.167s',
    seamFrames: contract.seamFrames,
    seamRgbaMd5: outputFrames[77].md5,
    directionColorSsim: directionColorSsim.all,
    directionAlphaSsim: directionAlphaSsim.all,
    archivedAuthorities: authorityIdentities.map(({ source, bytes, sha256 }) => ({ source, bytes, sha256 }))
  };
}

async function inspectCraneSingleSourceContract() {
  const contract = CRANE_SINGLE_SOURCE_CONTRACT;
  const outputPath = path.join(repoDir, contract.source);
  const [
    authorityIdentity,
    outputIdentity,
    authorityProbe,
    authorityFrames,
    losslessReferenceIdentity,
    losslessReferenceFrames,
    outputFrames,
    colorSsim,
    alphaSsim
  ] = await Promise.all([
    sha256File(contract.authority),
    sha256File(outputPath),
    ffprobe(path.relative(repoDir, contract.authority), [
      '-count_frames',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,avg_frame_rate,r_frame_rate,nb_read_frames:stream_tags=alpha_mode:format=duration,size'
    ]),
    decodedRgbaFramemd5(contract.authority, 'fps=30,setpts=N/(30*TB)'),
    sha256File(contract.losslessReference),
    decodedRgbaFramemd5(contract.losslessReference),
    decodedRgbaFramemd5(outputPath),
    decodedSsim(
      contract.losslessReference,
      outputPath,
      '[0:v]format=yuva420p[ref];[1:v]format=yuva420p[candidate];[ref][candidate]ssim'
    ),
    decodedSsim(
      contract.losslessReference,
      outputPath,
      '[0:v]format=yuva420p,alphaextract[ref];[1:v]format=yuva420p,alphaextract[candidate];[ref][candidate]ssim'
    )
  ]);
  const authorityStream = authorityProbe.streams?.[0];
  const authorityFormat = authorityProbe.format;

  assert(authorityIdentity.bytes === contract.authorityBytes, `Crane authority bytes ${authorityIdentity.bytes} != ${contract.authorityBytes}`);
  assert(authorityIdentity.sha256 === contract.authoritySha256, `Crane authority SHA-256 ${authorityIdentity.sha256} != ${contract.authoritySha256}`);
  assert(outputIdentity.bytes === contract.sourceBytes, `Crane output bytes ${outputIdentity.bytes} != ${contract.sourceBytes}`);
  assert(outputIdentity.sha256 === contract.sourceSha256, `Crane output SHA-256 ${outputIdentity.sha256} != ${contract.sourceSha256}`);
  assert(authorityStream?.width === 1440 && authorityStream?.height === 810, 'Crane authority dimensions must be 1440x810');
  assert(authorityStream?.avg_frame_rate === '24/1' && authorityStream?.r_frame_rate === '24/1', 'Crane authority fps must be 24/1');
  assert(Number(authorityStream?.nb_read_frames) === contract.authorityFrames, `Crane authority frames ${authorityStream?.nb_read_frames} != ${contract.authorityFrames}`);
  assertNear(Number(authorityFormat?.duration), 2.5, 'Crane authority duration');
  assert(Number(authorityFormat?.size) === contract.authorityBytes, 'Crane authority probed size mismatch');
  assert(streamAlphaMode(authorityStream) === '1', 'Crane authority alpha_mode tag must be 1');
  assert(authorityFrames.length === contract.outputFrames, `Crane resampled authority frames ${authorityFrames.length} != ${contract.outputFrames}`);
  assert(losslessReferenceIdentity.bytes === contract.losslessReferenceBytes, 'Crane lossless reference bytes changed');
  assert(losslessReferenceIdentity.sha256 === contract.losslessReferenceSha256, 'Crane lossless reference SHA-256 changed');
  assert(losslessReferenceFrames.length === contract.outputFrames, `Crane lossless reference frames ${losslessReferenceFrames.length} != ${contract.outputFrames}`);
  assert(outputFrames.length === contract.outputFrames, `Crane canonical RGBA frames ${outputFrames.length} != ${contract.outputFrames}`);

  for (let index = 0; index < contract.outputFrames; index += 1) {
    const authorityFrame = authorityFrames[index];
    const losslessReferenceFrame = losslessReferenceFrames[index];
    const outputFrame = outputFrames[index];
    assert(
      JSON.stringify(losslessReferenceFrame) === JSON.stringify(authorityFrame),
      `Crane lossless reference frame ${index} diverges from the whole-frame authority resample`
    );
    assert(
      authorityFrame.dts === outputFrame.dts
      && authorityFrame.pts === outputFrame.pts
      && authorityFrame.duration === outputFrame.duration
      && authorityFrame.bytes === outputFrame.bytes,
      `Crane canonical RGBA frame ${index} timing or dimensions diverge from the whole-frame authority resample`
    );
  }
  assert(colorSsim.all >= contract.colorSsimMin, `Crane color SSIM ${colorSsim.all} < ${contract.colorSsimMin}`);
  assert(alphaSsim.all >= contract.alphaSsimMin, `Crane alpha SSIM ${alphaSsim.all} < ${contract.alphaSsimMin}`);
  for (const [index, expectedMd5] of contract.contactWitnesses) {
    assert(outputFrames[index]?.md5 === expectedMd5, `Crane contact witness frame ${index} ${outputFrames[index]?.md5} != ${expectedMd5}`);
  }

  return {
    source: contract.source,
    sourceSha256: outputIdentity.sha256,
    sourceBytes: outputIdentity.bytes,
    authority: contract.authority,
    authoritySha256: authorityIdentity.sha256,
    authorityBytes: authorityIdentity.bytes,
    authorityFrames: contract.authorityFrames,
    losslessReference: path.relative(repoDir, contract.losslessReference),
    losslessReferenceSha256: losslessReferenceIdentity.sha256,
    outputFrames: outputFrames.length,
    fps: '30/1',
    rgbaFrameParity: '75/75 timing-aligned visual equivalence',
    colorSsim: colorSsim.all,
    alphaSsim: alphaSsim.all,
    alphaMerge: false,
    contactWitnesses: [...contract.contactWitnesses].map(([index]) => ({ index, md5: outputFrames[index].md5 }))
  };
}

async function decodedAlphaStats(source) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync('ffmpeg', [
      '-v', 'error',
      '-c:v', 'libvpx-vp9',
      '-i', path.join(repoDir, source),
      '-vf', 'alphaextract,signalstats,metadata=print:file=-',
      '-f', 'null',
      '-'
    ], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }));
  } catch (error) {
    throw new Error(`ffmpeg alpha decode failed for ${source}`, { cause: error });
  }

  const frames = [];
  let current;
  for (const line of stdout.split(/\r?\n/)) {
    const frame = line.match(/^frame:(\d+)\s+pts:\S+\s+pts_time:([\d.]+)/);
    if (frame) {
      current = { index: Number(frame[1]), pts: Number(frame[2]) };
      frames.push(current);
      continue;
    }
    const stat = line.match(/^lavfi\.signalstats\.(YMIN|YAVG|YMAX)=([\d.]+)/);
    if (stat && current) {
      current[stat[1].toLowerCase()] = Number(stat[2]);
    }
  }
  return frames;
}

async function inspectAodAlphaContract() {
  const contract = AOD_ALPHA_CONTRACT;
  const frames = await decodedAlphaStats(contract.source);
  assert(frames.length === contract.frames, `${contract.source} decoded alpha frames ${frames.length} != ${contract.frames}`);
  const firstFull = frames.find((frame) => frame.ymin === 255 && frame.ymax === 255);
  assert(firstFull?.index === contract.firstFullAlphaFrame, `${contract.source} first full alpha frame ${firstFull?.index} != ${contract.firstFullAlphaFrame}`);
  assertNear(firstFull?.pts, contract.firstFullAlphaPts, `${contract.source} first full alpha PTS`);
  for (const frame of frames.slice(0, contract.firstFullAlphaFrame)) {
    assert(frame.ymin === 0 && frame.ymax === 255, `${contract.source} frame ${frame.index} must retain authored partial alpha`);
  }
  for (const frame of frames.slice(contract.firstFullAlphaFrame)) {
    assert(frame.ymin === 255 && frame.ymax === 255, `${contract.source} frame ${frame.index} must remain fully opaque`);
  }
  for (const [index, expectedAverage] of contract.averageWitnesses) {
    const actual = frames[index]?.yavg;
    assert(Number.isFinite(actual) && Math.abs(actual - expectedAverage) <= 0.001, `${contract.source} frame ${index} alpha average ${actual} != ${expectedAverage}`);
  }
  return {
    source: contract.source,
    frames: frames.length,
    firstFullAlphaFrame: firstFull.index,
    firstFullAlphaPts: firstFull.pts,
    firstFullAlphaProgress: firstFull.index / (frames.length - 1),
    witnesses: [...contract.averageWitnesses].map(([index]) => frames[index])
  };
}

function streamAlphaMode(stream) {
  return stream?.tags?.ALPHA_MODE ?? stream?.tags?.alpha_mode;
}

function assertNear(actual, expected, label) {
  assert(Number.isFinite(actual), `${label} is not finite`);
  assert(
    Math.abs(actual - expected) <= TIMING_TOLERANCE_SECONDS,
    `${label} ${actual} != ${expected}`
  );
}

async function inspectCanonicalVideo(contract) {
  const containerProbe = await ffprobe(contract.source, [
    '-count_frames',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=avg_frame_rate,r_frame_rate,nb_read_frames:stream_tags=alpha_mode:format=duration:frame=key_frame,best_effort_timestamp_time'
  ]);
  const stream = containerProbe.streams?.[0];
  const frames = containerProbe.frames ?? [];
  const decodedFrames = Number(stream?.nb_read_frames);
  const duration = Number(containerProbe.format?.duration);
  const framePts = frames.map((frame) => Number(frame.best_effort_timestamp_time));
  const keyframeIndexes = frames.flatMap((frame, index) => (
    Number(frame.key_frame) === 1 ? [index] : []
  ));

  assert(stream?.avg_frame_rate === contract.fps, `${contract.source} avg fps must be ${contract.fps}`);
  assert(stream?.r_frame_rate === contract.fps, `${contract.source} real fps must be ${contract.fps}`);
  assert(decodedFrames === contract.frames, `${contract.source} frame count ${decodedFrames} != ${contract.frames}`);
  assert(frames.length === contract.frames, `${contract.source} PTS sample count ${frames.length} != ${contract.frames}`);
  assertNear(duration, contract.duration, `${contract.source} duration`);
  assertNear(framePts[0], contract.firstPts, `${contract.source} first PTS`);
  assertNear(framePts.at(-1), contract.lastPts, `${contract.source} last PTS`);

  const expectedFrameStep = 1 / 30;
  for (let index = 1; index < framePts.length; index += 1) {
    const cadence = framePts[index] - framePts[index - 1];
    assertNear(cadence, expectedFrameStep, `${contract.source} cadence at frame ${index}`);
  }

  assert(streamAlphaMode(stream) === '1', `${contract.source} alpha_mode tag must be 1`);
  assert(keyframeIndexes.length === contract.keyframes, `${contract.source} keyframe count ${keyframeIndexes.length} != ${contract.keyframes}`);
  assert(keyframeIndexes[0] === 0, `${contract.source} must start with a keyframe`);
  for (let index = 1; index < keyframeIndexes.length; index += 1) {
    const gopFrames = keyframeIndexes[index] - keyframeIndexes[index - 1];
    assert(gopFrames <= contract.maxGopFrames, `${contract.source} GOP ${gopFrames} > ${contract.maxGopFrames}`);
  }
  const trailingGopFrames = frames.length - keyframeIndexes.at(-1);
  assert(trailingGopFrames <= contract.maxGopFrames, `${contract.source} trailing GOP ${trailingGopFrames} > ${contract.maxGopFrames}`);

  return {
    source: contract.source,
    fps: stream.avg_frame_rate,
    frames: decodedFrames,
    duration,
    firstPts: framePts[0],
    lastPts: framePts.at(-1),
    alphaMode: streamAlphaMode(stream),
    keyframes: keyframeIndexes.length,
    maxGopFrames: contract.maxGopFrames
  };
}

const canonicalVideos = [];
for (const contract of canonicalVideoContracts) {
  canonicalVideos.push(await inspectCanonicalVideo(contract));
}
const [figure2Combined, aodAlpha, craneSingleSource, heroTrimmed, craneFlockVisual, craneFlockCorrectedFrame] = await Promise.all([
  inspectFigure2CombinedContract(),
  inspectAodAlphaContract(),
  inspectCraneSingleSourceContract(),
  inspectHeroTrimmedContract(),
  inspectCraneFlockVisualContract(),
  inspectCraneFlockCorrectedFrameContract()
]);
process.stdout.write(`${JSON.stringify({
  qualification: 'homepage-media-deep',
  files: canonicalVideos.length,
  canonicalVideos,
  figure2Combined,
  aodAlpha,
  craneSingleSource,
  heroTrimmed,
  craneFlockVisual,
  craneFlockCorrectedFrame,
  pass: true
})}\n`);
