import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// RGBA framemd5 rows include every frame's DTS, PTS, duration and alpha pixels.
// Captured before the lossless container-only change with frozen FFmpeg 8.1.
export const WEBM_STREAMING_PROOFS = Object.freeze([
  ['assets/figure1.webm', 'a472e2f9f62c9cdd447fe78664020e3dad7e0ce37900bb1c4b4e7fb1db379d70', 'b20731da9c4c96b30823d946a92d69ab3f86a39080b8a3ab72e39ec2345a8a71', 'ad5df804f1e5f905f3a329a5b22a700b82ab2a6e7b0a3a4fa6fd8e108f57495d', 49],
  ['assets/figure2-pair-motion.webm', 'a87db407fd39f6977aa0b663ffd16e54929259e6651728997f7c072a33ffaa80', '4366350bbe7c6b1517fa042937bcf7f61b7b8190cece2a50ac59ba8a80511fe6', '809442870d229dee70f9389de242fee44e73ba309e84f56c121f3f1cd641b71d', 156],
  ['assets/ph-figure-motion.webm', '678f76a40ccffe6cc2f337bfaa6fa66d4af4f6c70b2860695491cc5003147ab1', 'e1ab7ce3aa0a53b520b00540877157a77e6938fcca87ce6e6cd7275ec8c7f25e', 'c43706c44f8342f2e89a8a2b42ed545718d38903c5735734e7702ba4ad409037', 46],
  ['assets/ttg-figure-motion.webm', '3b61c3cbcb88d8fa3ecb14faac694a4092676887a3b4cde90e80ec1bac4b0d79', '69ad44a8feb20594689ff95ce4acb95e1d3a8dc01f2d5ccdd59136a884e56c31', 'ccf93dcea9c67a5cfbadeab82298d25bab3590f7b29dcbafb44aabb97b4dc9f9', 75],
  ['assets/crane-figure-motion.webm', 'a66a6778bda2a6c2e3fb5241a69ba4f1e4422a1638608f6cc5eba57e8f53c2b9', 'f22be4953e06cad8c4895ea0c9ea5c8e149f48e5314f8bb82a5187844317c980', 'da2468206717ad27111a0ba6a14762c2ecf8cf9fa65a5fc9af64e436f45b1b37', 75],
  ['assets/crane-flock-motion.webm', '708f45223f0cea5af23449d947050a86e5ec1ac959385561fa663ff44da5c37a', '4d32ba4a0cda129241ab8135493932268ae9c61addc5a35ff77c33f881a8ae09', '174c75e51c1797bd3961c00d327541436105fc81c17926c480f07a2144defa7d', 74],
  ['assets/aod-figure-motion.webm', '76e7a21f941a2d40e051bd72cb92e8fb1264e21a6765fbac7f8773d2849d8c9c', '00eff9f26a39c48e04a9935ca6de177b5cc504c3659bd7ac72e0da0052956d1e', 'ac4c40cd8b5d52bec83be0bbb5d0ba92e6560c9da631f7367361f553705fad72', 78],
  ['assets/figure3-motion.webm', '610786ba0492be27e30690d321b8cf07c185413de95adccf0b64b964a0dcbaf7', '24911a28cfef2f8390e3e6da4f126afa8bc76c2c2b24d36f7d9a6a64a297cdaa', 'e7bc253e239bb012d39589919e0c6ed6e06224635f07913a49acb787e631c393', 78]
].map(([source, previousSha256, sha256, rgbaTimingSha256, frames]) => Object.freeze({ source, previousSha256, sha256, rgbaTimingSha256, frames })));

function vint(bytes, offset, id = false) {
  const first = bytes[offset];
  if (!first) throw new Error('Invalid or truncated EBML integer');
  let width = 1, marker = 0x80;
  while (!(first & marker)) { width++; marker >>= 1; }
  if (width > (id ? 4 : 8) || offset + width > bytes.length) throw new Error('Truncated EBML integer');
  let value = BigInt(id ? first : first & (marker - 1));
  for (let i = 1; i < width; i++) value = value * 256n + BigInt(bytes[offset + i]);
  return { width, value, unknown: !id && value === (1n << BigInt(width * 7)) - 1n };
}
function element(bytes, offset, limit) {
  const id = vint(bytes, offset, true), size = vint(bytes, offset + id.width);
  const data = offset + id.width + size.width;
  const end = size.unknown ? limit : data + Number(size.value);
  if (!Number.isSafeInteger(end) || end > limit || end < data || data > limit) throw new Error('Truncated EBML element');
  return { id: id.value.toString(16), offset, data, end, unknown: size.unknown };
}

/** Read actual Segment children, not byte signatures inside compressed frames. */
export function assertStreamingWebm(bytes) {
  const header = element(bytes, 0, bytes.length);
  if (header.id !== '1a45dfa3' || header.unknown) throw new Error('WebM EBML header required');
  const segment = element(bytes, header.end, bytes.length);
  if (segment.id !== '18538067') throw new Error('WebM Segment required');
  let cues = null, firstCluster = null, tracks = null;
  for (let offset = segment.data; offset < segment.end;) {
    const entry = element(bytes, offset, segment.end);
    if (entry.unknown) throw new Error('Finite WebM Segment children required');
    if (entry.id === '1c53bb6b') { if (cues) throw new Error('Duplicate WebM Cues'); cues = entry; }
    if (entry.id === '1654ae6b') tracks ??= entry;
    if (entry.id === '1f43b675') firstCluster ??= entry;
    offset = entry.end;
  }
  if (!tracks || !cues || !firstCluster || cues.data === cues.end || cues.end > firstCluster.offset) {
    throw new Error('WebM seek index must precede the first media Cluster');
  }
  if (firstCluster.offset > 64 * 1024) throw new Error('WebM streaming metadata exceeds 64 KiB');
  return { cuesOffset: cues.offset, firstClusterOffset: firstCluster.offset, metadataBytes: firstCluster.offset };
}

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const ffmpeg = args => execFileSync('ffmpeg', args, { maxBuffer: 8 * 1024 * 1024 });
function rgbaTimingProof(file) {
  const rows = ffmpeg(['-v', 'error', '-c:v', 'libvpx-vp9', '-i', file, '-map', '0:v:0', '-pix_fmt', 'rgba',
    '-fps_mode', 'passthrough', '-f', 'framemd5', '-']).toString().split('\n').filter(line => line && !line.startsWith('#'));
  return { frames: rows.length, rgbaTimingSha256: sha(rows.join('\n')) };
}

/** Keep the existing encoded color/alpha frames, GOP and timestamps unchanged. */
export function normalizeStreamingWebm(source, input, output = input) {
  const proof = WEBM_STREAMING_PROOFS.find(entry => entry.source === source);
  if (!proof) throw new Error('Unknown frozen WebM source');
  if (!/^ffmpeg version 8\.1(?:\s|$)/.test(ffmpeg(['-version']).toString())) throw new Error('Frozen FFmpeg 8.1 required');
  const before = sha(readFileSync(input));
  if (![proof.previousSha256, proof.sha256].includes(before)) throw new Error('WebM source identity changed');
  const verifyFrames = file => {
    const actual = rgbaTimingProof(file);
    if (actual.frames !== proof.frames || actual.rgbaTimingSha256 !== proof.rgbaTimingSha256) {
      throw new Error('WebM decoded RGBA pixels or frame timestamps changed');
    }
  };
  verifyFrames(input);
  // A verified canonical output is already normalized. Remuxing it again can
  // rewrite nonvisual muxer tags; do not churn a frozen identity on repeat.
  if (before === proof.sha256) {
    const bytes = readFileSync(input), layout = assertStreamingWebm(bytes);
    if (path.resolve(input) !== path.resolve(output)) copyFileSync(input, output);
    return { ...proof, bytes: bytes.length, ...layout, exactRgbaAndTiming: true };
  }
  const work = mkdtempSync(path.join(tmpdir(), 'tongye-webm-streaming-'));
  try {
    const candidate = path.join(work, path.basename(source));
    ffmpeg(['-v', 'error', '-i', input, '-map', '0', '-c', 'copy', '-fflags', '+bitexact', '-cues_to_front', '1', candidate]);
    const bytes = readFileSync(candidate);
    if (sha(bytes) !== proof.sha256) throw new Error('Deterministic WebM streaming output identity changed');
    const layout = assertStreamingWebm(bytes); verifyFrames(candidate);
    if (path.resolve(input) !== path.resolve(output) || before !== proof.sha256) copyFileSync(candidate, output);
    return { ...proof, bytes: bytes.length, ...layout, exactRgbaAndTiming: true };
  } finally { rmSync(work, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repo = fileURLToPath(new URL('../../', import.meta.url));
  for (const proof of WEBM_STREAMING_PROOFS) console.log(JSON.stringify(normalizeStreamingWebm(proof.source, path.join(repo, proof.source))));
}
