// Only the explicitly approved v64 receiver repair. It grants no qualification.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { link, mkdir, readFile, lstat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../', import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const receiptBytes = await readFile(new URL('./authorizations/v64-receiver-publication-20261021.json', import.meta.url));
const authorizationSha = sha(receiptBytes), receipt = JSON.parse(receiptBytes);
if (authorizationSha !== '6ac63feb93a73f525bcd79746ae674e512ac3a38e5e6e17198e9f4e6a4190b6f') throw new Error('Exact v64 receiver-repair receipt required');
const dist = path.join(repo, 'dist'), target = path.join(repo, '.release', receipt.releaseId + '-receiver-test');
const manifestBytes = await readFile(path.join(dist, 'r5-release-manifest.json')), manifest = JSON.parse(manifestBytes);
if (sha(manifestBytes) !== receipt.identity.draftManifestSha256 || manifest.sourceDirty !== false
  || manifest.basePath !== '/experience/' || manifest.qualification.status !== 'pending-memory') throw new Error('Only the frozen v64 draft can be packaged');
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
if (git('status', '--porcelain', '--untracked-files=all') || git('cat-file', '-t', 'refs/tags/' + manifest.candidate) !== 'tag'
  || git('rev-parse', 'refs/tags/' + manifest.candidate) !== manifest.candidateTagObject
  || git('rev-parse', 'refs/tags/' + manifest.candidate + '^{commit}') !== manifest.sourceCommit) throw new Error('Clean tools tree and unchanged annotated tag required');
for (const [key, value] of Object.entries(receipt.identity)) if (key !== 'draftManifestSha256' && manifest[key] !== value) throw new Error('Frozen identity changed');
if (sha(JSON.stringify(manifest.files)) !== manifest.artifactTreeSha256) throw new Error('Artifact inventory changed');
const safe = name => {
  if (!/^[A-Za-z0-9_.\-/]+$/.test(name) || name.split('/').some(part => !part || part === '..' || part === '.') || path.isAbsolute(name)) throw new Error('Unsafe package path');
  return name;
};
const checked = async (filename, item) => {
  if (!(await lstat(filename)).isFile()) throw new Error('Regular artifact required: ' + filename);
  const bytes = await readFile(filename);
  if (bytes.length !== item.bytes || sha(bytes) !== item.sha256) throw new Error('Frozen bytes changed: ' + filename);
};
for (const item of manifest.files) await checked(path.join(dist, safe(item.path)), item);
const evidenceInputs = {
  memory: '/tmp/tongye-relative-release-20261021-7Oo0ru/unmeasured-memory-v64.json',
  coldComparison: '/tmp/tongye-relative-release-20261021-7Oo0ru/cold-comparison-v64.json',
  functional: '/tmp/tongye-relative-release-20261021-7Oo0ru/functional-visual-v64-final.json',
  initialFrozenBeforeSettledProbe: '/tmp/tongye-relative-release-20261021-7Oo0ru/functional-visual-v64.json',
  receiverRecovery: '/tmp/tongye-relative-release-20261021-7Oo0ru/receiver-recovery-v64.json',
  publicPhoneBeforeRepair: '/tmp/tongye-relative-release-20261021-7Oo0ru/public-functional-v63-phone-round3.json',
  publicDesktopBeforeRepair: '/tmp/tongye-relative-release-20261021-7Oo0ru/public-functional-v63-round2.json',
  performanceBeforeRepair: '/tmp/tongye-relative-release-20261021-7Oo0ru/targeted-performance-v63.json',
  unitRuntime: '/tmp/tongye-relative-release-20261021-7Oo0ru/unit-runtime-v64.json',
  unitArchitecture: '/tmp/tongye-relative-release-20261021-7Oo0ru/unit-architecture-v64.json',
  unitSummary: '/tmp/tongye-relative-release-20261021-7Oo0ru/unit-summary-v64.json',
  mediaRemuxProof: '/tmp/tongye-rootcause-20261021-pWt4HU/remux-proof.json'
};
for (const [key, filename] of Object.entries(evidenceInputs)) await checked(filename, receipt.evidence[key]);
const memory = JSON.parse(await readFile(evidenceInputs.memory));
if (memory.kind !== 'r5-unmeasured-process-memory' || memory.pass !== false || memory.completedRunCount !== 0
  || memory.qualificationGranted !== false || JSON.stringify(memory.identity) !== JSON.stringify(receipt.identity)) throw new Error('Missing evidence cannot be promoted to qualification');
const cdnBytes = await readFile(path.join(dist, 'cdn-publish-manifest.json')), cdn = JSON.parse(cdnBytes);
if (cdn.releaseId !== receipt.releaseId || cdn.sourceCommit !== manifest.sourceCommit || !cdn.enabled) throw new Error('CDN identity changed');
await mkdir(target); // Refuse existing immutable packages; never overwrite.
const copy = async (source, relative) => {
  const destination = path.join(target, safe(relative));
  await mkdir(path.dirname(destination), { recursive: true });
  await link(source, destination); // No duplicate media allocation; never mutate linked inputs.
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
