import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { promisify } from 'node:util';

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoDir = path.dirname(appDir);
const distDir = path.join(repoDir, 'dist');
const manifestName = 'r5-release-manifest.json';
const execFileAsync = promisify(execFile);

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
    } else if (path.basename(target) !== manifestName) {
      files.push(target);
    }
  }
  return files;
}

const resolvedSourceCommit = await git('rev-parse', 'HEAD^{commit}');
const explicitCandidate = process.env.R5_CANDIDATE_TAG?.trim() || '';
const explicitSourceCommit = process.env.R5_SOURCE_COMMIT?.trim() || '';
if (
  process.env.R5_REQUIRE_RELEASE_IDENTITY === '1'
  && (!explicitCandidate || !explicitSourceCommit)
) {
  throw new Error(
    'release build requires explicit R5_CANDIDATE_TAG and R5_SOURCE_COMMIT'
  );
}
const sourceCommit = explicitSourceCommit || resolvedSourceCommit;
const sourceDirty = (await git('status', '--porcelain', '--untracked-files=all')) !== '';
const candidate = explicitCandidate || null;
let candidateTagObject = null;
if (sourceCommit !== resolvedSourceCommit) {
  throw new Error(
    `supplied source commit ${sourceCommit} does not match HEAD ${resolvedSourceCommit}`
  );
}
if (candidate) {
  if (!/^(?:react-refactor-r5-candidate(?:-v[1-9][0-9]*)?|react-refactor-r5-parity-repair-candidate)$/.test(candidate)) {
    throw new Error(
      `candidate tag ${candidate} must match react-refactor-r5-candidate[-vN] or react-refactor-r5-parity-repair-candidate`
    );
  }
  if (sourceDirty) {
    throw new Error(`candidate tag ${candidate} requires a clean source tree`);
  }
  const candidateType = await git('cat-file', '-t', `refs/tags/${candidate}`);
  if (candidateType !== 'tag') {
    throw new Error(`candidate ref ${candidate} must be an annotated tag`);
  }
  candidateTagObject = await git('rev-parse', `refs/tags/${candidate}`);
  const candidateCommit = await git('rev-parse', `refs/tags/${candidate}^{commit}`);
  if (candidateCommit !== sourceCommit) {
    throw new Error(
      `candidate tag ${candidate} does not resolve to source commit ${sourceCommit}`
    );
  }
}

const files = (await filesBelow(distDir))
  .sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
const entries = await Promise.all(files.map(async (file) => {
  const bytes = await readFile(file);
  return {
    path: path.relative(distDir, file).split(path.sep).join('/'),
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex')
  };
}));
const manifest = {
  schemaVersion: 2,
  candidate,
  candidateTagObject,
  sourceCommit,
  sourceDirty,
  files: entries,
  fileCount: entries.length,
  totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0)
};
const output = `${JSON.stringify(manifest, null, 2)}\n`;
await writeFile(path.join(distDir, manifestName), output, 'utf8');
process.stdout.write(`${JSON.stringify({
  manifest: manifestName,
  candidate: manifest.candidate,
  candidateTagObject: manifest.candidateTagObject,
  sourceCommit: manifest.sourceCommit,
  fileCount: manifest.fileCount,
  totalBytes: manifest.totalBytes,
  sha256: createHash('sha256').update(output).digest('hex')
})}\n`);
