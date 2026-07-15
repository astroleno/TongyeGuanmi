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
  sourceSha256: 'a3ac363cf7dd37940f3467a1c4e5b1b2df067d4fdc4966e99e17679a32498164',
  sourceBytes: 4_416_794,
  correctedFirstFrame: 'assets/crane-flock-first-frame.webp',
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
  frame0AlphaSsimMin: 0.9998,
  bodyWitnesses: [
    { x: 300, y: 115, label: 'upper-left-body' },
    { x: 926, y: 343, label: 'right-body' }
  ]
};
const CRANE_FLOCK_POSTER_CONTRACT = {
  source: 'assets/crane-flock-first-frame.webp',
  sourceSha256: '8c4d47ca59d21c14430c02b2d89605594463a018e28c25c7eeb8fd824f8910b4',
  sourceBytes: 80_116,
  authority: path.join(
    repoDir,
    'archive/assets/homepage-media/2026-07-15/sources/crane-flock-first-frame-flawed.png'
  ),
  authoritySha256: 'f4a1b1572b8743ae2c1a3a187abc7cc6b772f26ff63fbf19093bb10d8849cde3',
  authorityBytes: 354_266,
  alphaChangedPixels: 36_667,
  filledInteriorPixels: 29_775,
  clearedExteriorPixels: 6_892,
  transparentGapWitnesses: [
    { x: 1026, y: 242, label: 'upper-right-leg-gap' },
    { x: 825, y: 529, label: 'lower-leg-gap' }
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
    posterRgba,
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
  assert(posterRgba.byteLength === canonicalFrame0Rgba.byteLength, 'Crane flock frame 0 RGBA dimensions changed');
  const alphaAt = (rgba, x, y) => rgba[(y * 1280 + x) * 4 + 3];
  const bodyAlpha = contract.bodyWitnesses.map((witness) => ({
    ...witness,
    alpha: alphaAt(canonicalFrame0Rgba, witness.x, witness.y)
  }));
  for (const witness of bodyAlpha) {
    assert(witness.alpha === 255, `Crane flock frame 0 ${witness.label} alpha ${witness.alpha} != 255`);
  }
  const gapAlpha = CRANE_FLOCK_POSTER_CONTRACT.transparentGapWitnesses.map((witness) => ({
    ...witness,
    alpha: alphaAt(canonicalFrame0Rgba, witness.x, witness.y)
  }));
  for (const witness of gapAlpha) {
    assert(witness.alpha === 0, `Crane flock frame 0 ${witness.label} alpha ${witness.alpha} != 0`);
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

async function decodedStillRgba(source) {
  try {
    const { stdout } = await execFileAsync('ffmpeg', [
      '-v', 'error',
      ...(path.extname(source).toLowerCase() === '.webm' ? ['-c:v', 'libvpx-vp9'] : []),
      '-i', source,
      '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'
    ], { encoding: null, maxBuffer: 5 * 1024 * 1024 });
    return stdout;
  } catch (error) {
    throw new Error(`ffmpeg still decode failed for ${source}`, { cause: error });
  }
}

async function inspectCraneFlockPosterContract() {
  const contract = CRANE_FLOCK_POSTER_CONTRACT;
  const outputPath = path.join(repoDir, contract.source);
  const [authorityIdentity, outputIdentity, probe, authorityRgba, outputRgba] = await Promise.all([
    sha256File(contract.authority),
    sha256File(outputPath),
    ffprobe(contract.source, [
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,pix_fmt'
    ]),
    decodedStillRgba(contract.authority),
    decodedStillRgba(outputPath)
  ]);
  const stream = probe.streams?.[0];
  assert(authorityIdentity.bytes === contract.authorityBytes, 'Crane flock poster authority byte identity changed');
  assert(authorityIdentity.sha256 === contract.authoritySha256, 'Crane flock poster authority SHA-256 changed');
  assert(outputIdentity.bytes === contract.sourceBytes, 'Crane flock poster output byte identity changed');
  assert(outputIdentity.sha256 === contract.sourceSha256, 'Crane flock poster output SHA-256 changed');
  assert(stream?.width === 1280 && stream?.height === 720, 'Crane flock poster must be 1280x720');
  assert(stream?.pix_fmt === 'argb', 'Crane flock poster must retain lossless alpha');
  assert(authorityRgba.byteLength === outputRgba.byteLength, 'Crane flock poster decoded size changed');

  let alphaChangedPixels = 0;
  let filledInteriorPixels = 0;
  let clearedExteriorPixels = 0;
  let visibleRgbDifferences = 0;
  for (let index = 0; index < authorityRgba.byteLength; index += 4) {
    const sourceAlpha = authorityRgba[index + 3];
    const outputAlpha = outputRgba[index + 3];
    if (sourceAlpha !== outputAlpha) {
      alphaChangedPixels += 1;
      if (outputAlpha === 255) filledInteriorPixels += 1;
      if (outputAlpha === 0) clearedExteriorPixels += 1;
    }
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
  assert(alphaChangedPixels === contract.alphaChangedPixels, 'Crane flock poster alpha correction changed');
  assert(filledInteriorPixels === contract.filledInteriorPixels, 'Crane flock poster interior fill changed');
  assert(clearedExteriorPixels === contract.clearedExteriorPixels, 'Crane flock poster exterior clearing changed');
  assert(visibleRgbDifferences === 0, 'Crane flock poster changed visible RGB');
  const bodyWitness = (115 * 1280 + 300) * 4;
  assert(authorityRgba[bodyWitness + 3] === 157, 'Crane flock flawed body witness changed');
  assert(outputRgba[bodyWitness + 3] === 255, 'Crane flock poster body witness remains transparent');
  const formerlyLeakingBodyWitness = (343 * 1280 + 926) * 4;
  assert(authorityRgba[formerlyLeakingBodyWitness + 3] === 19, 'Crane flock leaking body witness changed');
  assert(outputRgba[formerlyLeakingBodyWitness + 3] === 255, 'Crane flock poster still leaks through a body');
  for (const witness of contract.transparentGapWitnesses) {
    const index = (witness.y * 1280 + witness.x) * 4;
    assert(authorityRgba[index + 3] <= 7, `Crane flock ${witness.label} source witness changed`);
    assert(outputRgba[index + 3] === 0, `Crane flock ${witness.label} was incorrectly filled`);
  }

  return {
    source: contract.source,
    authority: path.relative(repoDir, contract.authority),
    dimensions: '1280x720',
    correction: 'canvas-edge background flood fill',
    alphaChangedPixels,
    filledInteriorPixels,
    clearedExteriorPixels,
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
const [aodAlpha, craneSingleSource, heroTrimmed, craneFlockVisual, craneFlockPoster] = await Promise.all([
  inspectAodAlphaContract(),
  inspectCraneSingleSourceContract(),
  inspectHeroTrimmedContract(),
  inspectCraneFlockVisualContract(),
  inspectCraneFlockPosterContract()
]);

process.stdout.write(`${JSON.stringify({
  qualification: 'homepage-media-deep',
  files: canonicalVideos.length,
  canonicalVideos,
  aodAlpha,
  craneSingleSource,
  heroTrimmed,
  craneFlockVisual,
  craneFlockPoster,
  pass: true
})}\n`);
