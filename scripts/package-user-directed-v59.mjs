// A single frozen artifact under a recorded user instruction. Never changes
// its pending qualification or its failing evidence; never removes a package.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { constants } from 'node:fs';
import { copyFile, mkdir, readFile, lstat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../', import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const receiptBytes = await readFile(new URL('./authorizations/v59-direct-publication-20261020.json', import.meta.url));
const receipt = JSON.parse(receiptBytes), authorizationSha = sha(receiptBytes);
if (authorizationSha !== '0721104d84e66c813e5b1a2db98796b05bdc8b776be777b2b44b3ff202c534a8') throw new Error('Exact v59 publication receipt required');
const dist = path.join(repo, 'dist'), target = path.join(repo, '.release', receipt.releaseId);
const manifestBytes = await readFile(path.join(dist, 'r5-release-manifest.json')), manifest = JSON.parse(manifestBytes);
if (sha(manifestBytes) !== receipt.identity.draftManifestSha256 || manifest.sourceDirty !== false
  || manifest.qualification.status !== 'pending-memory') throw new Error('Only the unchanged frozen v59 build can be packaged');
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
if (git('status', '--porcelain', '--untracked-files=all') || git('cat-file', '-t', 'refs/tags/' + manifest.candidate) !== 'tag'
  || git('rev-parse', 'refs/tags/' + manifest.candidate) !== manifest.candidateTagObject
  || git('rev-parse', 'refs/tags/' + manifest.candidate + '^{commit}') !== manifest.sourceCommit) throw new Error('Clean tools tree and unchanged frozen annotated tag required');
for (const [key, value] of Object.entries(receipt.identity)) if (key !== 'draftManifestSha256' && manifest[key] !== value) throw new Error('Frozen v59 identity changed');
if (sha(JSON.stringify(manifest.files)) !== manifest.artifactTreeSha256) throw new Error('Artifact inventory changed');
const checked = async (filename, item) => {
  if (!(await lstat(filename)).isFile()) throw new Error('Regular artifact file required: ' + filename);
  const bytes = await readFile(filename);
  if (bytes.length !== item.bytes || sha(bytes) !== item.sha256) throw new Error('Frozen bytes changed: ' + filename);
};
for (const item of manifest.files) {
  if (!/^[A-Za-z0-9_.\-/]+$/.test(item.path) || item.path.split('/').includes('..') || path.isAbsolute(item.path)) throw new Error('Unsafe frozen path');
  await checked(path.join(dist, item.path), item);
}
const evidenceInputs = {
  memory: path.join(dist, 'r5-process-memory.json'),
  desktopPerformance: '/tmp/tongye-native-publish-20261020-P55wTR/v59-performance-45/desktop.json',
  phonePerformance: '/tmp/tongye-native-publish-20261020-P55wTR/v59-performance-45/phone.json'
};
for (const [key, filename] of Object.entries(evidenceInputs)) await checked(filename, receipt.evidence[key]);
const cdnBytes = await readFile(path.join(dist, 'cdn-publish-manifest.json')), cdn = JSON.parse(cdnBytes);
if (cdn.releaseId !== receipt.releaseId || cdn.sourceCommit !== manifest.sourceCommit || !cdn.enabled) throw new Error('Frozen CDN identity changed');
// mkdir without recursive refuses an existing release; no rm/overwrite path.
await mkdir(target);
const copy = async (source, relative) => {
  const destination = path.join(target, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination, constants.COPYFILE_EXCL | constants.COPYFILE_FICLONE);
};
const cdnSources = new Set(cdn.files.map(item => item.sourcePath));
for (const item of manifest.files) if (!cdnSources.has(item.path)) await copy(path.join(dist, item.path), 'site/' + item.path);
await copy(path.join(dist, 'r5-release-manifest.json'), 'site/r5-release-manifest.json');
for (const [key, filename] of Object.entries(evidenceInputs)) await copy(filename, receipt.evidence[key].path);
await writeFile(path.join(target, 'site/release-id.txt'), receipt.releaseId + '\n', { flag: 'wx' });
await writeFile(path.join(target, 'user-directed-publication.json'), receiptBytes, { flag: 'wx' });
const cdnFiles = [];
for (const item of cdn.files) {
  const packagePath = `cdn/${item.channel}/${item.sourcePath}`;
  await copy(path.join(dist, item.sourcePath), packagePath); cdnFiles.push({ ...item, packagePath });
}
const deploy = { schemaVersion: 1, releaseId: cdn.releaseId, sourceCommit: manifest.sourceCommit, basePath: manifest.basePath,
  candidate: manifest.candidate, candidateTagObject: manifest.candidateTagObject,
  releaseManifestSha256: sha(manifestBytes), cdnManifestSha256: sha(cdnBytes), siteDirectory: 'site',
  cdnFiles, cdnFileCount: cdnFiles.length, cdnTotalBytes: cdnFiles.reduce((n, item) => n + item.bytes, 0),
  publicationAuthorization: { path: 'user-directed-publication.json', sha256: authorizationSha, mode: receipt.mode,
    memoryEvidenceSha256: receipt.evidence.memory.sha256 } };
await writeFile(path.join(target, 'release-deploy-manifest.json'), JSON.stringify(deploy, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ packageRoot: target, releaseId: cdn.releaseId, authorizationSha, qualificationStatusUnchanged: manifest.qualification.status }));
