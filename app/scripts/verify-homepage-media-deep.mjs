import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  alphaVideoSourcePairs,
  canonicalVideoContracts
} from './homepage-media-contract.mjs';

const execFileAsync = promisify(execFile);
const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoDir = path.dirname(appDir);
const TIMING_TOLERANCE_SECONDS = 0.001;
const HEVC_TIMING_TOLERANCE_SECONDS = 0.002;
const HEVC_MAX_GOP_FRAMES = 8;
const SWIFT_ALPHA_CHECK = [
  'import AVFoundation',
  'import Foundation',
  'for path in CommandLine.arguments.dropFirst() {',
  '  let asset = AVURLAsset(url: URL(fileURLWithPath: path))',
  '  guard let track = asset.tracks(withMediaType: .video).first else {',
  '    print("\\(path)\\tmissing")',
  '    continue',
  '  }',
  '  print("\\(path)\\t\\(track.hasMediaCharacteristic(.containsAlphaChannel))")',
  '}'
].join('\n');
const FIGURE2_COMBINED_CONTRACT = {
  source: 'assets/figure2-pair-motion.webm',
  sourceBytes: 4_940_268,
  sourceSha256: 'a87db407fd39f6977aa0b663ffd16e54929259e6651728997f7c072a33ffaa80',
  frames: 156,
  seamFrames: [77, 78],
  archivedBytes: 15_926_811,
  authorityCanvas: {
    width: 1280,
    height: 1066,
    leftWidth: 600,
    centerGutter: 80,
    outputWidth: 792,
    outputHeight: 660,
    paperColor: '0xede4d2'
  },
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
  ],
  directions: [
    {
      label: 'forward',
      candidateStartFrame: 0,
      candidateEndFrame: 78,
      leftAuthority: 'archive/assets/homepage-media/2026-07-16/replaced/figure2-left-motion.webm',
      rightAuthority: 'archive/assets/homepage-media/2026-07-16/replaced/figure2-right-motion.webm',
      alphaSsimMin: 0.97,
      paperCompositeSsimMin: 0.97
    },
    {
      label: 'reverse',
      candidateStartFrame: 78,
      candidateEndFrame: 156,
      leftAuthority: 'archive/assets/homepage-media/2026-07-16/replaced/figure2-left-motion-reverse.webm',
      rightAuthority: 'archive/assets/homepage-media/2026-07-16/replaced/figure2-right-motion-reverse.webm',
      alphaSsimMin: 0.97,
      paperCompositeSsimMin: 0.97
    }
  ]
};
const PH_EDGE_SPILL_CONTRACT = {
  source: 'assets/ph-figure-motion.webm',
  sourceBytes: 2_824_934,
  sourceSha256: '678f76a40ccffe6cc2f337bfaa6fa66d4af4f6c70b2860695491cc5003147ab1',
  authority: 'archive/assets/homepage-media/2026-07-16/replaced/ph-figure-motion-original.webm',
  authorityBytes: 2_646_001,
  authoritySha256: '49e23297a26fa0d6cc3862d6c4123e8090c521bafb3fe718de2ca4fc130169d6',
  width: 1672,
  height: 942,
  frames: [0, 23, 45],
  paperColor: [237, 228, 210],
  paperColorHex: '0xede4d2',
  alphaSsimMin: 0.998,
  paperCompositeSsimMin: 0.997,
  bodyAlphaMin: 224,
  spillAlphaMax: 24,
  bodyCompositeMaeMax: 4,
  edgeGreenExcessReductionMin: 30,
  edgeWitnessMinPixels: 1_000
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
  authorityRef: 'd4cab484e8f2d8656cf7c7cd0e19c015c7332702',
  authoritySource: 'assets/crane-figure1-transition.webm',
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
      repoPath(source)
    ], { encoding: 'utf8' });
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`ffprobe failed for ${source}`, { cause: error });
  }
}

function repoPath(source) {
  return path.isAbsolute(source) ? source : path.join(repoDir, source);
}

async function sha256File(source) {
  const bytes = await readFile(source);
  return {
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex')
  };
}

async function materializeFrozenGitAuthority({ ref, source, bytes, sha256 }) {
  const directory = await mkdtemp(path.join(tmpdir(), 'tongye-crane-authority-'));
  const output = path.join(directory, path.basename(source));
  const label = `git:${ref}:${source}`;
  try {
    const { stdout } = await execFileAsync('git', [
      '-C', repoDir,
      'show',
      `${ref}:${source}`
    ], {
      encoding: 'buffer',
      maxBuffer: bytes + 1024 * 1024
    });
    await writeFile(output, stdout);
    const identity = await sha256File(output);
    assert(identity.bytes === bytes, `${label} bytes ${identity.bytes} != ${bytes}`);
    assert(identity.sha256 === sha256, `${label} SHA-256 changed`);
    return {
      path: output,
      label,
      dispose: () => rm(directory, { recursive: true, force: true })
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw new Error(`Unable to materialize frozen Crane authority ${label}`, { cause: error });
  }
}

function mediaDecoderArgs(source) {
  return path.extname(source).toLowerCase() === '.webm'
    ? ['-c:v', 'libvpx-vp9']
    : [];
}

async function decodedSsim(reference, candidate, filterComplex) {
  let stderr;
  try {
    ({ stderr } = await execFileAsync('ffmpeg', [
      '-v', 'info',
      ...mediaDecoderArgs(reference),
      '-i', reference,
      ...mediaDecoderArgs(candidate),
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

async function decodedSsimInputs(inputs, filterComplex, label) {
  let stderr;
  try {
    const args = ['-v', 'info'];
    for (const source of inputs) {
      const resolved = repoPath(source);
      args.push(...mediaDecoderArgs(resolved), '-i', resolved);
    }
    args.push('-filter_complex', filterComplex, '-an', '-f', 'null', '-');
    ({ stderr } = await execFileAsync('ffmpeg', args, {
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024
    }));
  } catch (error) {
    throw new Error(`ffmpeg SSIM failed for ${label}`, { cause: error });
  }
  const summary = stderr.split(/\r?\n/).findLast((line) => line.includes('SSIM '));
  const match = summary?.match(/All:([\d.]+)/);
  if (!match) {
    throw new Error(`ffmpeg SSIM summary missing for ${label}`);
  }
  return Number(match[1]);
}

async function decodedSelectedRgbaFrames(source, frames, width, height) {
  const selection = frames.map((frame) => `eq(n\\,${frame})`).join('+');
  let stdout;
  try {
    ({ stdout } = await execFileAsync('ffmpeg', [
      '-v', 'error',
      ...mediaDecoderArgs(source),
      '-i', repoPath(source),
      '-vf', `select='${selection}',setpts=N/(30*TB)`,
      '-map', '0:v:0',
      '-frames:v', String(frames.length),
      '-f', 'rawvideo',
      '-pix_fmt', 'rgba',
      'pipe:1'
    ], {
      encoding: null,
      maxBuffer: frames.length * width * height * 4 + 1024 * 1024
    }));
  } catch (error) {
    throw new Error(`ffmpeg RGBA witness decode failed for ${source}`, { cause: error });
  }
  const frameBytes = width * height * 4;
  assert(stdout.byteLength === frames.length * frameBytes, `${source} sampled RGBA frame bytes changed`);
  return frames.map((frame, index) => ({
    frame,
    rgba: stdout.subarray(index * frameBytes, (index + 1) * frameBytes)
  }));
}

function phSsimFilter(contract, kind) {
  const common = [
    '[0:v]settb=1/30,setpts=N,format=rgba[authority]',
    '[1:v]settb=1/30,setpts=N,format=rgba[candidate]'
  ];
  if (kind === 'alpha') {
    return [
      ...common,
      '[authority]alphaextract[referenceAlpha]',
      '[candidate]alphaextract[candidateAlpha]',
      '[referenceAlpha][candidateAlpha]ssim=shortest=1'
    ].join(';');
  }
  return [
    ...common,
    `color=c=${contract.paperColorHex}:s=${contract.width}x${contract.height}:r=30,format=rgba[paperAuthority]`,
    `color=c=${contract.paperColorHex}:s=${contract.width}x${contract.height}:r=30,format=rgba[paperCandidate]`,
    '[paperAuthority][authority]overlay=shortest=1:format=auto[authorityComposite]',
    '[paperCandidate][candidate]overlay=shortest=1:format=auto[candidateComposite]',
    '[authorityComposite][candidateComposite]ssim=shortest=1'
  ].join(';');
}

function compositeRgb(rgba, index, paperColor) {
  const alpha = rgba[index + 3] / 255;
  return [0, 1, 2].map((channel) => (
    rgba[index + channel] * alpha + paperColor[channel] * (1 - alpha)
  ));
}

function greenExcess(rgb) {
  return Math.max(0, rgb[1] - Math.max(rgb[0], rgb[2]));
}

function inspectPhPixelWitness(contract, authorityFrames, candidateFrames) {
  let bodyPixels = 0;
  let bodyCompositeAbsoluteError = 0;
  let edgePixels = 0;
  let edgeGreenExcessAuthority = 0;
  let edgeGreenExcessCandidate = 0;
  for (let frameIndex = 0; frameIndex < authorityFrames.length; frameIndex += 1) {
    const authority = authorityFrames[frameIndex];
    const candidate = candidateFrames[frameIndex];
    assert(authority.frame === candidate.frame, 'PH sampled witness frames diverged');
    for (let y = 0; y < contract.height; y += 1) {
      for (let x = 0; x < contract.width; x += 1) {
        const index = (y * contract.width + x) * 4;
        const authorityAlpha = authority.rgba[index + 3];
        if (authorityAlpha >= contract.bodyAlphaMin) {
          const authorityComposite = compositeRgb(authority.rgba, index, contract.paperColor);
          const candidateComposite = compositeRgb(candidate.rgba, index, contract.paperColor);
          for (let channel = 0; channel < 3; channel += 1) {
            bodyCompositeAbsoluteError += Math.abs(authorityComposite[channel] - candidateComposite[channel]);
          }
          bodyPixels += 1;
        }
        if (
          authorityAlpha <= contract.spillAlphaMax
          && x > 0
          && x < contract.width - 1
          && y > 0
          && y < contract.height - 1
        ) {
          const opaqueNeighbour = [index - 4, index + 4, index - contract.width * 4, index + contract.width * 4]
            .some((neighbour) => authority.rgba[neighbour + 3] >= contract.bodyAlphaMin);
          const authorityGreenExcess = greenExcess(authority.rgba.subarray(index, index + 3));
          if (opaqueNeighbour && authorityGreenExcess > 0) {
            edgeGreenExcessAuthority += authorityGreenExcess;
            edgeGreenExcessCandidate += greenExcess(candidate.rgba.subarray(index, index + 3));
            edgePixels += 1;
          }
        }
      }
    }
  }
  assert(bodyPixels > 0, 'PH body witness has no opaque authority pixels');
  assert(edgePixels >= contract.edgeWitnessMinPixels, `PH edge witness only found ${edgePixels} green-edge pixels`);
  const bodyCompositeMae = bodyCompositeAbsoluteError / (bodyPixels * 3);
  const averageAuthorityGreenExcess = edgeGreenExcessAuthority / edgePixels;
  const averageCandidateGreenExcess = edgeGreenExcessCandidate / edgePixels;
  return {
    sampledFrames: contract.frames,
    bodyPixels,
    bodyCompositeMae,
    edgePixels,
    edgeSpillGreenExcessAuthority: averageAuthorityGreenExcess,
    edgeSpillGreenExcessCandidate: averageCandidateGreenExcess,
    edgeGreenExcessReduction: averageAuthorityGreenExcess - averageCandidateGreenExcess
  };
}

async function inspectPhEdgeSpillContract() {
  const contract = PH_EDGE_SPILL_CONTRACT;
  const [sourceIdentity, authorityIdentity, alphaSsim, paperCompositeSsim, authorityFrames, candidateFrames] = await Promise.all([
    sha256File(repoPath(contract.source)),
    sha256File(repoPath(contract.authority)),
    decodedSsimInputs(
      [contract.authority, contract.source],
      phSsimFilter(contract, 'alpha'),
      'PH alpha authority'
    ),
    decodedSsimInputs(
      [contract.authority, contract.source],
      phSsimFilter(contract, 'paper'),
      'PH warm-paper authority'
    ),
    decodedSelectedRgbaFrames(contract.authority, contract.frames, contract.width, contract.height),
    decodedSelectedRgbaFrames(contract.source, contract.frames, contract.width, contract.height)
  ]);
  assert(sourceIdentity.bytes === contract.sourceBytes, `PH output bytes ${sourceIdentity.bytes} != ${contract.sourceBytes}`);
  assert(sourceIdentity.sha256 === contract.sourceSha256, 'PH output SHA-256 changed');
  assert(authorityIdentity.bytes === contract.authorityBytes, `PH archived authority bytes ${authorityIdentity.bytes} != ${contract.authorityBytes}`);
  assert(authorityIdentity.sha256 === contract.authoritySha256, 'PH archived authority SHA-256 changed');
  assert(alphaSsim >= contract.alphaSsimMin, `PH alpha SSIM ${alphaSsim} < ${contract.alphaSsimMin}`);
  assert(
    paperCompositeSsim >= contract.paperCompositeSsimMin,
    `PH warm-paper composite SSIM ${paperCompositeSsim} < ${contract.paperCompositeSsimMin}`
  );
  const pixelWitness = inspectPhPixelWitness(contract, authorityFrames, candidateFrames);
  assert(
    pixelWitness.bodyCompositeMae <= contract.bodyCompositeMaeMax,
    `PH warm-body composite MAE ${pixelWitness.bodyCompositeMae} > ${contract.bodyCompositeMaeMax}`
  );
  assert(
    pixelWitness.edgeGreenExcessReduction >= contract.edgeGreenExcessReductionMin,
    `PH green-edge reduction ${pixelWitness.edgeGreenExcessReduction} < ${contract.edgeGreenExcessReductionMin}`
  );
  return {
    source: contract.source,
    sourceBytes: sourceIdentity.bytes,
    sourceSha256: sourceIdentity.sha256,
    archivedAuthority: contract.authority,
    archivedAuthorityBytes: authorityIdentity.bytes,
    archivedAuthoritySha256: authorityIdentity.sha256,
    alphaSsim,
    paperCompositeSsim,
    pixelWitness
  };
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

function figure2AuthoritySsimFilter(contract, direction, kind) {
  const canvas = contract.authorityCanvas;
  const halfGutter = canvas.centerGutter / 2;
  assert(Number.isInteger(halfGutter), 'Figure2 authority center gutter must be even');
  const leftSurfaceWidth = canvas.leftWidth + halfGutter;
  const common = [
    `[1:v]trim=start_frame=0:end_frame=78,settb=1/30,setpts=N,format=yuva420p,pad=${leftSurfaceWidth}:${canvas.height}:0:0:color=black@0[left]`,
    `[2:v]trim=start_frame=0:end_frame=78,settb=1/30,setpts=N,format=yuva420p,pad=${leftSurfaceWidth}:${canvas.height}:${halfGutter}:0:color=black@0[right]`,
    `[left][right]hstack=inputs=2,trim=start_frame=0:end_frame=78,settb=1/30,setpts=N,scale=${canvas.outputWidth}:${canvas.outputHeight}:flags=lanczos,format=rgba[authority]`,
    `[0:v]trim=start_frame=${direction.candidateStartFrame}:end_frame=${direction.candidateEndFrame},settb=1/30,setpts=N,format=rgba[candidate]`
  ];
  if (kind === 'alpha') {
    return [
      ...common,
      '[authority]alphaextract[referenceAlpha]',
      '[candidate]alphaextract[candidateAlpha]',
      '[referenceAlpha][candidateAlpha]ssim=shortest=1'
    ].join(';');
  }
  return [
    ...common,
    `color=c=${canvas.paperColor}:s=${canvas.outputWidth}x${canvas.outputHeight}:r=30,format=rgba[paperReference]`,
    `color=c=${canvas.paperColor}:s=${canvas.outputWidth}x${canvas.outputHeight}:r=30,format=rgba[paperCandidate]`,
    '[paperReference][authority]overlay=shortest=1:format=auto[referenceComposite]',
    '[paperCandidate][candidate]overlay=shortest=1:format=auto[candidateComposite]',
    '[referenceComposite][candidateComposite]ssim=shortest=1'
  ].join(';');
}

async function inspectFigure2AuthorityDirection(contract, outputPath, direction) {
  const inputs = [
    outputPath,
    path.join(repoDir, direction.leftAuthority),
    path.join(repoDir, direction.rightAuthority)
  ];
  const [alphaSsim, paperCompositeSsim] = await Promise.all([
    decodedSsimInputs(inputs, figure2AuthoritySsimFilter(contract, direction, 'alpha'), `Figure2 ${direction.label} alpha authority`),
    decodedSsimInputs(inputs, figure2AuthoritySsimFilter(contract, direction, 'paper'), `Figure2 ${direction.label} paper authority`)
  ]);
  assert(alphaSsim >= direction.alphaSsimMin, `Figure2 ${direction.label} authority alpha SSIM ${alphaSsim} < ${direction.alphaSsimMin}`);
  assert(
    paperCompositeSsim >= direction.paperCompositeSsimMin,
    `Figure2 ${direction.label} authority paper SSIM ${paperCompositeSsim} < ${direction.paperCompositeSsimMin}`
  );
  return {
    direction: direction.label,
    alphaSsim,
    paperCompositeSsim,
    authorityLayout: `${contract.authorityCanvas.width}x${contract.authorityCanvas.height} with ${contract.authorityCanvas.centerGutter}px center gutter`,
    authorities: [direction.leftAuthority, direction.rightAuthority]
  };
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
  const authorityQuality = [];
  for (const direction of contract.directions) {
    authorityQuality.push(await inspectFigure2AuthorityDirection(contract, output, direction));
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
    archivedAuthorityQuality: authorityQuality,
    archivedAuthorities: authorityIdentities.map(({ source, bytes, sha256 }) => ({ source, bytes, sha256 }))
  };
}

async function inspectCraneSingleSourceContract() {
  const contract = CRANE_SINGLE_SOURCE_CONTRACT;
  const outputPath = path.join(repoDir, contract.source);
  const authority = await materializeFrozenGitAuthority({
    ref: contract.authorityRef,
    source: contract.authoritySource,
    bytes: contract.authorityBytes,
    sha256: contract.authoritySha256
  });
  try {
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
      sha256File(authority.path),
      sha256File(outputPath),
      ffprobe(authority.path, [
        '-count_frames',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height,avg_frame_rate,r_frame_rate,nb_read_frames:stream_tags=alpha_mode:format=duration,size'
      ]),
      decodedRgbaFramemd5(authority.path, 'fps=30,setpts=N/(30*TB)'),
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
      authority: authority.label,
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
  } finally {
    await authority.dispose();
  }
}

async function decodedAlphaStats(source) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync('ffmpeg', [
      '-v', 'error',
      '-c:v', 'libvpx-vp9',
      '-i', repoPath(source),
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

async function inspectHevcAlphaCharacteristics() {
  assert(process.platform === 'darwin', 'HEVC alpha qualification requires macOS AVFoundation');
  const sources = alphaVideoSourcePairs.map(({ hevc }) => repoPath(hevc));
  const { stdout } = await execFileAsync('xcrun', [
    'swift',
    '-e',
    SWIFT_ALPHA_CHECK,
    ...sources
  ], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  const results = new Map(stdout.trim().split(/\r?\n/).map((line) => {
    const [source, result] = line.split('\t');
    return [source, result];
  }));
  for (const source of sources) {
    assert(results.get(source) === 'true', `${source} lacks AVFoundation alpha metadata`);
  }
  return new Set(sources);
}

async function inspectHevcAlphaPair(pair, alphaSources) {
  const [webmProbe, hevcProbe] = await Promise.all([
    ffprobe(pair.webm, [
      '-count_frames',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,sample_aspect_ratio,r_frame_rate,nb_read_frames:format=duration'
    ]),
    ffprobe(pair.hevc, [
      '-count_frames',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name,codec_tag_string,width,height,sample_aspect_ratio,r_frame_rate,nb_read_frames:format=duration:frame=key_frame'
    ])
  ]);
  const webm = webmProbe.streams?.[0];
  const hevc = hevcProbe.streams?.[0];
  const frames = hevcProbe.frames ?? [];
  const keyframeIndexes = frames.flatMap((frame, index) => (
    Number(frame.key_frame) === 1 ? [index] : []
  ));
  const expectedWidth = Number(webm?.width) + (Number(webm?.width) % 2);
  const expectedHeight = Number(webm?.height) + (Number(webm?.height) % 2);
  const webmDuration = Number(webmProbe.format?.duration);
  const hevcDuration = Number(hevcProbe.format?.duration);

  assert(hevc?.codec_name === 'hevc', `${pair.hevc} codec must be HEVC`);
  assert(hevc?.codec_tag_string === 'hvc1', `${pair.hevc} codec tag must be hvc1`);
  assert(hevc?.width === expectedWidth, `${pair.hevc} width ${hevc?.width} != ${expectedWidth}`);
  assert(hevc?.height === expectedHeight, `${pair.hevc} height ${hevc?.height} != ${expectedHeight}`);
  assert(hevc?.sample_aspect_ratio === webm?.sample_aspect_ratio, `${pair.hevc} sample aspect ratio changed`);
  assert(hevc?.r_frame_rate === webm?.r_frame_rate, `${pair.hevc} frame rate changed`);
  assert(hevc?.nb_read_frames === webm?.nb_read_frames, `${pair.hevc} frame count changed`);
  assert(
    Math.abs(hevcDuration - webmDuration) <= HEVC_TIMING_TOLERANCE_SECONDS,
    `${pair.hevc} duration ${hevcDuration} != ${webmDuration}`
  );
  assert(frames.length === Number(hevc?.nb_read_frames), `${pair.hevc} frame samples changed`);
  assert(keyframeIndexes[0] === 0, `${pair.hevc} must start with a keyframe`);
  for (let index = 1; index < keyframeIndexes.length; index += 1) {
    assert(
      keyframeIndexes[index] - keyframeIndexes[index - 1] <= HEVC_MAX_GOP_FRAMES,
      `${pair.hevc} GOP exceeds ${HEVC_MAX_GOP_FRAMES} frames`
    );
  }
  assert(
    frames.length - keyframeIndexes.at(-1) <= HEVC_MAX_GOP_FRAMES,
    `${pair.hevc} trailing GOP exceeds ${HEVC_MAX_GOP_FRAMES} frames`
  );
  assert(alphaSources.has(repoPath(pair.hevc)), `${pair.hevc} AVFoundation alpha check missing`);

  return {
    webm: pair.webm,
    source: pair.hevc,
    codec: hevc.codec_name,
    codecTag: hevc.codec_tag_string,
    width: hevc.width,
    height: hevc.height,
    sampleAspectRatio: hevc.sample_aspect_ratio,
    fps: hevc.r_frame_rate,
    frames: Number(hevc.nb_read_frames),
    duration: hevcDuration,
    keyframes: keyframeIndexes.length,
    maxGopFrames: HEVC_MAX_GOP_FRAMES,
    avFoundationAlpha: true
  };
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
const alphaSources = await inspectHevcAlphaCharacteristics();
const hevcAlphaVideos = [];
for (const pair of alphaVideoSourcePairs) {
  hevcAlphaVideos.push(await inspectHevcAlphaPair(pair, alphaSources));
}
const [figure2Combined, phEdgeSpill, aodAlpha, craneSingleSource, heroTrimmed, craneFlockVisual, craneFlockCorrectedFrame] = await Promise.all([
  inspectFigure2CombinedContract(),
  inspectPhEdgeSpillContract(),
  inspectAodAlphaContract(),
  inspectCraneSingleSourceContract(),
  inspectHeroTrimmedContract(),
  inspectCraneFlockVisualContract(),
  inspectCraneFlockCorrectedFrameContract()
]);
process.stdout.write(`${JSON.stringify({
  qualification: 'homepage-media-deep',
  files: canonicalVideos.length + hevcAlphaVideos.length,
  canonicalVideos,
  hevcAlphaVideos,
  figure2Combined,
  phEdgeSpill,
  aodAlpha,
  craneSingleSource,
  heroTrimmed,
  craneFlockVisual,
  craneFlockCorrectedFrame,
  pass: true
})}\n`);
