import { readFile } from 'node:fs/promises';
import path from 'node:path';

const manifestPath = path.resolve(
  process.env.R5_CDN_MANIFEST_PATH?.trim()
    || path.join(process.cwd(), '..', 'dist', 'cdn-publish-manifest.json')
);
const origin = process.env.R5_SITE_ORIGIN?.trim() || 'https://tongye.me';
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (!manifest.enabled || !manifest.releaseId || manifest.files.length === 0) {
  throw new Error('CDN publish manifest is not enabled or contains no files');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function verifyHead(entry) {
  const response = await fetch(entry.url, {
    method: 'HEAD',
    headers: { Origin: origin },
    signal: AbortSignal.timeout(20_000)
  });
  assert(response.status === 200, `${entry.url} returned ${response.status} for HEAD`);
  const contentType = response.headers.get('content-type')?.split(';')[0];
  assert(contentType === entry.contentType, `${entry.url} returned Content-Type ${contentType}`);
  const contentLength = Number.parseInt(response.headers.get('content-length') || '', 10);
  assert(contentLength === entry.bytes, `${entry.url} returned Content-Length ${contentLength}`);
  const cacheControl = response.headers.get('cache-control') || '';
  assert(/max-age=31536000/.test(cacheControl), `${entry.url} is missing immutable cache lifetime`);
  const allowOrigin = response.headers.get('access-control-allow-origin');
  assert(
    allowOrigin === '*' || allowOrigin === origin,
    `${entry.url} returned invalid Access-Control-Allow-Origin ${allowOrigin}`
  );
}

const batchSize = 6;
for (let index = 0; index < manifest.files.length; index += batchSize) {
  await Promise.all(manifest.files.slice(index, index + batchSize).map(verifyHead));
}

const media = manifest.files.find((file) => file.channel === 'media');
assert(media, 'CDN manifest contains no media object');
const range = await fetch(media.url, {
  headers: {
    Origin: origin,
    Range: 'bytes=0-1023'
  },
  signal: AbortSignal.timeout(20_000)
});
assert(range.status === 206, `${media.url} returned ${range.status} for Range`);
assert(
  range.headers.get('content-range')?.startsWith('bytes 0-1023/'),
  `${media.url} returned invalid Content-Range`
);
assert((await range.arrayBuffer()).byteLength === 1024, `${media.url} returned the wrong Range size`);

process.stdout.write(`${JSON.stringify({
  releaseId: manifest.releaseId,
  fileCount: manifest.fileCount,
  totalBytes: manifest.totalBytes,
  rangeObject: media.url,
  pass: true
})}\n`);
