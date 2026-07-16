import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { promisify } from 'node:util';

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoDir = path.dirname(appDir);
const distDir = path.join(repoDir, 'dist');
const policyPath = path.join(appDir, 'build/cdn-release-policy.json');
const outputPath = path.join(distDir, 'cdn-publish-manifest.json');
const execFileAsync = promisify(execFile);

const contentTypes = new Map([
  ['.avif', 'image/avif'],
  ['.gif', 'image/gif'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.m4v', 'video/x-m4v'],
  ['.mp4', 'video/mp4'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.ttf', 'font/ttf'],
  ['.vtt', 'text/vtt'],
  ['.webm', 'video/webm'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2']
]);
const cacheControl = 'public, max-age=31536000, immutable';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function git(...args) {
  const { stdout } = await execFileAsync('git', args, {
    cwd: repoDir,
    encoding: 'utf8'
  });
  return stdout.trim();
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

function normalizedOrigin(value, label) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${label} must be an HTTPS origin without a path, query, or fragment`);
  }
  return url.origin;
}

const policy = JSON.parse(await readFile(policyPath, 'utf8'));
if (policy.schemaVersion !== 1) {
  throw new Error(`unsupported CDN release policy schema: ${policy.schemaVersion}`);
}
const assetExtensions = new Set(policy.assetExtensions);
const mediaExtensions = new Set(policy.mediaExtensions);
const releaseId = process.env.R5_RELEASE_ID?.trim() || '';
const requireCdn = process.env.R5_REQUIRE_CDN === '1';
const assetOrigin = normalizedOrigin(
  process.env.R5_ASSET_CDN_BASE?.trim() || 'https://assets.tongye.me',
  'R5_ASSET_CDN_BASE'
);
const mediaOrigin = normalizedOrigin(
  process.env.R5_MEDIA_CDN_BASE?.trim() || 'https://media.tongye.me',
  'R5_MEDIA_CDN_BASE'
);
if (requireCdn && !releaseId) {
  throw new Error('R5_REQUIRE_CDN=1 requires R5_RELEASE_ID');
}
if (releaseId && !/^[a-z0-9][a-z0-9._-]{2,79}$/.test(releaseId)) {
  throw new Error(`invalid R5_RELEASE_ID: ${releaseId}`);
}

const sourceCommit = await git('rev-parse', 'HEAD^{commit}');
let files = [];
if (releaseId) {
  const emittedFiles = await filesBelow(path.join(distDir, 'assets'));
  const textFiles = (await filesBelow(distDir))
    .filter((file) => /\.(?:css|html|js)$/.test(file))
    .sort();
  const releaseText = (await Promise.all(textFiles.map((file) => readFile(file, 'utf8')))).join('\n');

  files = await Promise.all(emittedFiles.map(async (file) => {
    const extension = path.extname(file).toLowerCase();
    const channel = mediaExtensions.has(extension)
      ? 'media'
      : assetExtensions.has(extension)
        ? 'assets'
        : null;
    if (!channel) {
      return null;
    }
    const sourcePath = path.relative(distDir, file).split(path.sep).join('/');
    const objectKey = `releases/${releaseId}/${sourcePath}`;
    const origin = channel === 'media' ? mediaOrigin : assetOrigin;
    const url = `${origin}/${objectKey}`;
    const bytes = await readFile(file);
    const contentType = contentTypes.get(extension);
    if (!contentType) {
      throw new Error(`missing content type for ${sourcePath}`);
    }
    const runtimePath = sourcePath.startsWith('assets/')
      ? sourcePath.slice('assets/'.length)
      : sourcePath;
    const runtimeReference = releaseText.includes(runtimePath)
      && releaseText.includes(`${origin}/releases/${releaseId}/`);
    if (!releaseText.includes(url) && !runtimeReference) {
      throw new Error(`emitted CDN object is not referenced by the release: ${url}`);
    }
    return {
      channel,
      sourcePath,
      objectKey,
      url,
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
      contentType,
      cacheControl
    };
  })).then((entries) => entries.filter(Boolean));
  files.sort((left, right) => left.objectKey.localeCompare(right.objectKey));
}

const manifest = {
  schemaVersion: 1,
  enabled: Boolean(releaseId),
  releaseId: releaseId || null,
  sourceCommit,
  origins: {
    assets: assetOrigin,
    media: mediaOrigin
  },
  files,
  fileCount: files.length,
  totalBytes: files.reduce((sum, file) => sum + file.bytes, 0)
};
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({
  manifest: path.relative(repoDir, outputPath),
  enabled: manifest.enabled,
  releaseId: manifest.releaseId,
  sourceCommit,
  fileCount: manifest.fileCount,
  totalBytes: manifest.totalBytes
})}\n`);
