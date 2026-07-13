import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { promisify } from 'node:util';
import { validateProcessMemoryQualification } from './r5-process-memory-contract.mjs';

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoDir = path.dirname(appDir);
const distDir = path.join(repoDir, 'dist');
const manifestName = 'r5-release-manifest.json';
const memoryEvidenceName = 'r5-process-memory.json';
const manifestPath = path.join(distDir, manifestName);
const memoryEvidencePath = path.join(distDir, memoryEvidenceName);
const excludedArtifactFiles = new Set([manifestName, memoryEvidenceName]);
const execFileAsync = promisify(execFile);

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
    } else if (!excludedArtifactFiles.has(path.basename(target))) {
      files.push(target);
    }
  }
  return files;
}

async function artifactEntries() {
  const files = (await filesBelow(distDir))
    .sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  return Promise.all(files.map(async (file) => {
    const bytes = await readFile(file);
    return {
      path: path.relative(distDir, file).split(path.sep).join('/'),
      bytes: bytes.byteLength,
      sha256: sha256(bytes)
    };
  }));
}

function artifactTreeSha256(entries) {
  return sha256(JSON.stringify(entries));
}

function manifestOutput(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

async function readJson(file, label) {
  let output;
  try {
    output = await readFile(file, 'utf8');
  } catch (error) {
    throw new Error(`${label} is missing at ${file}`, { cause: error });
  }
  try {
    return { output, value: JSON.parse(output) };
  } catch (error) {
    throw new Error(`${label} is not valid JSON`, { cause: error });
  }
}

const phase = process.env.R5_RELEASE_MANIFEST_PHASE?.trim() || 'prepare';
if (phase !== 'prepare' && phase !== 'finalize') {
  throw new Error(`unsupported R5_RELEASE_MANIFEST_PHASE: ${phase}`);
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
  if (!/^(?:react-refactor-r5-candidate(?:-v[1-9][0-9]*)?|react-refactor-r5-parity-repair-candidate(?:-v[1-9][0-9]*)?)$/.test(candidate)) {
    throw new Error(
      `candidate tag ${candidate} must match react-refactor-r5-candidate[-vN] or react-refactor-r5-parity-repair-candidate[-vN]`
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

const entries = await artifactEntries();
const currentArtifactTreeSha256 = artifactTreeSha256(entries);

let manifest;
if (phase === 'prepare') {
  manifest = {
    schemaVersion: 3,
    candidate,
    candidateTagObject,
    sourceCommit,
    sourceDirty,
    artifactTreeSha256: currentArtifactTreeSha256,
    files: entries,
    fileCount: entries.length,
    totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
    qualification: {
      status: 'pending-memory',
      memoryEvidence: null
    }
  };
} else {
  const draft = await readJson(manifestPath, 'draft release manifest');
  const draftManifest = draft.value;
  if (
    draftManifest.schemaVersion !== 3
    || draftManifest.qualification?.status !== 'pending-memory'
  ) {
    throw new Error('draft release manifest is not pending memory qualification');
  }
  const expectedDraftIdentity = {
    candidate,
    candidateTagObject,
    sourceCommit,
    artifactTreeSha256: currentArtifactTreeSha256
  };
  for (const [field, expected] of Object.entries(expectedDraftIdentity)) {
    if (draftManifest[field] !== expected) {
      throw new Error(
        `draft release manifest identity mismatch for ${field}: expected ${expected}, received ${draftManifest[field]}`
      );
    }
  }
  if (JSON.stringify(draftManifest.files) !== JSON.stringify(entries)) {
    throw new Error('draft release manifest artifact entries changed before finalization');
  }

  const evidence = await readJson(memoryEvidencePath, 'process memory evidence');
  const report = evidence.value;
  const memoryValidation = validateProcessMemoryQualification(report);
  if (!memoryValidation.valid) {
    throw new Error(
      `process memory evidence must contain two valid passing macOS runs: ${memoryValidation.reasons.join('; ')}`
    );
  }
  const expectedMemoryIdentity = {
    candidate,
    candidateTagObject,
    sourceCommit,
    artifactTreeSha256: currentArtifactTreeSha256,
    draftManifestSha256: sha256(draft.output)
  };
  for (const [field, expected] of Object.entries(expectedMemoryIdentity)) {
    if (report.identity?.[field] !== expected) {
      throw new Error(
        `process memory evidence identity mismatch for ${field}: expected ${expected}, received ${report.identity?.[field]}`
      );
    }
  }

  manifest = {
    ...draftManifest,
    qualification: {
      status: 'qualified',
      memoryEvidence: {
        path: memoryEvidenceName,
        schemaVersion: report.schemaVersion,
        pass: report.pass,
        runCount: report.completedRunCount,
        environment: report.environment,
        sha256: sha256(evidence.output),
        identity: report.identity
      }
    }
  };
}

const output = manifestOutput(manifest);
await writeFile(manifestPath, output, 'utf8');
process.stdout.write(`${JSON.stringify({
  manifest: manifestName,
  phase,
  qualification: manifest.qualification.status,
  candidate: manifest.candidate,
  candidateTagObject: manifest.candidateTagObject,
  sourceCommit: manifest.sourceCommit,
  artifactTreeSha256: manifest.artifactTreeSha256,
  fileCount: manifest.fileCount,
  totalBytes: manifest.totalBytes,
  sha256: sha256(output)
})}\n`);
