import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoDir = path.dirname(appDir);
const distDir = path.join(repoDir, 'dist');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function readJson(file, label) {
  let output;
  try {
    output = await readFile(file, 'utf8');
  } catch (error) {
    throw new Error(`${label} is missing at ${file}`, { cause: error });
  }
  return { output, value: JSON.parse(output) };
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

async function copyRelative(sourceRoot, targetRoot, relativePath) {
  const source = path.join(sourceRoot, relativePath);
  const target = path.join(targetRoot, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target);
}

const release = await readJson(
  path.join(distDir, 'r5-release-manifest.json'),
  'R5 release manifest'
);
const cdn = await readJson(
  path.join(distDir, 'cdn-publish-manifest.json'),
  'CDN publish manifest'
);
if (release.value.qualification?.status !== 'qualified') {
  throw new Error('R5 release manifest must be qualified before packaging');
}
if (!cdn.value.enabled || !cdn.value.releaseId) {
  throw new Error('CDN publish manifest must be enabled before packaging');
}
if (release.value.sourceCommit !== cdn.value.sourceCommit) {
  throw new Error('release and CDN manifests use different source commits');
}

const packageRoot = path.resolve(
  process.env.R5_RELEASE_PACKAGE_DIR?.trim()
    || path.join(repoDir, '.release', cdn.value.releaseId)
);
const siteRoot = path.join(packageRoot, 'site');
const cdnRoot = path.join(packageRoot, 'cdn');
await rm(packageRoot, { recursive: true, force: true });
await mkdir(siteRoot, { recursive: true });
await mkdir(cdnRoot, { recursive: true });

const cdnSourcePaths = new Set(cdn.value.files.map((file) => file.sourcePath));
for (const file of await filesBelow(distDir)) {
  const relativePath = path.relative(distDir, file).split(path.sep).join('/');
  if (!cdnSourcePaths.has(relativePath)) {
    await copyRelative(distDir, siteRoot, relativePath);
  }
}
await writeFile(path.join(siteRoot, 'release-id.txt'), `${cdn.value.releaseId}\n`, 'utf8');

const packagedCdnFiles = [];
for (const entry of cdn.value.files) {
  const packagePath = path.posix.join('cdn', entry.channel, entry.sourcePath);
  const source = path.join(distDir, entry.sourcePath);
  const target = path.join(packageRoot, packagePath);
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target);
  packagedCdnFiles.push({ ...entry, packagePath });
}

const deployManifest = {
  schemaVersion: 1,
  releaseId: cdn.value.releaseId,
  sourceCommit: release.value.sourceCommit,
  candidate: release.value.candidate,
  candidateTagObject: release.value.candidateTagObject,
  releaseManifestSha256: sha256(release.output),
  cdnManifestSha256: sha256(cdn.output),
  siteDirectory: 'site',
  cdnFiles: packagedCdnFiles,
  cdnFileCount: packagedCdnFiles.length,
  cdnTotalBytes: packagedCdnFiles.reduce((sum, file) => sum + file.bytes, 0)
};
const deployManifestPath = path.join(packageRoot, 'release-deploy-manifest.json');
await writeFile(deployManifestPath, `${JSON.stringify(deployManifest, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({
  packageRoot,
  releaseId: deployManifest.releaseId,
  sourceCommit: deployManifest.sourceCommit,
  candidate: deployManifest.candidate,
  cdnFileCount: deployManifest.cdnFileCount,
  cdnTotalBytes: deployManifest.cdnTotalBytes
})}\n`);
