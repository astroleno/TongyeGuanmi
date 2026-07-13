import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';

const scriptPath = fileURLToPath(
  new URL('../../scripts/create-release-manifest.mjs', import.meta.url)
);
const appPackage = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
);
const rootPackage = JSON.parse(
  readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')
);
const candidateWorkflow = readFileSync(
  new URL('../../../.github/workflows/r5-candidate.yml', import.meta.url),
  'utf8'
);
const memoryRunner = readFileSync(
  new URL('../../scripts/run-r5-process-memory.mjs', import.meta.url),
  'utf8'
);
const temporaryDirectories: string[] = [];

function runGit(repoDir: string, ...args: string[]) {
  return execFileSync('git', args, { cwd: repoDir, encoding: 'utf8' }).trim();
}

function createFixture() {
  const repoDir = mkdtempSync(path.join(tmpdir(), 'r5-release-manifest-'));
  temporaryDirectories.push(repoDir);
  const fixtureScript = path.join(repoDir, 'app/scripts/create-release-manifest.mjs');
  mkdirSync(path.dirname(fixtureScript), { recursive: true });
  mkdirSync(path.join(repoDir, 'dist'), { recursive: true });
  copyFileSync(scriptPath, fixtureScript);
  writeFileSync(path.join(repoDir, 'dist/index.html'), '<!doctype html>\n', 'utf8');
  writeFileSync(
    path.join(repoDir, '.gitignore'),
    'dist/r5-release-manifest.json\ndist/r5-process-memory.json\n',
    'utf8'
  );

  runGit(repoDir, 'init', '--quiet');
  runGit(repoDir, 'config', 'user.name', 'R5 Test');
  runGit(repoDir, 'config', 'user.email', 'r5-test@example.com');
  runGit(repoDir, 'add', '.');
  runGit(repoDir, 'commit', '--quiet', '-m', 'test fixture');
  const sourceCommit = runGit(repoDir, 'rev-parse', 'HEAD');
  runGit(
    repoDir,
    'tag',
    '-a',
    'react-refactor-r5-candidate-v3',
    '-m',
    'candidate fixture'
  );
  const candidateTagObject = runGit(
    repoDir,
    'rev-parse',
    'refs/tags/react-refactor-r5-candidate-v3'
  );

  return { candidateTagObject, fixtureScript, repoDir, sourceCommit };
}

function runManifest(
  fixtureScript: string,
  repoDir: string,
  candidate: string,
  sourceCommit: string,
  extraEnv: NodeJS.ProcessEnv = {}
) {
  return execFileSync(process.execPath, [fixtureScript], {
    cwd: repoDir,
    encoding: 'utf8',
    stdio: 'pipe',
    env: {
      ...process.env,
      R5_CANDIDATE_TAG: candidate,
      R5_SOURCE_COMMIT: sourceCommit,
      R5_REQUIRE_RELEASE_IDENTITY: '1',
      ...extraEnv
    }
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('binds a release manifest to the explicitly supplied annotated candidate and source commit', () => {
  const { candidateTagObject, fixtureScript, repoDir, sourceCommit } = createFixture();

  const output = runManifest(
    fixtureScript,
    repoDir,
    'react-refactor-r5-candidate-v3',
    sourceCommit
  );

  const manifest = JSON.parse(
    readFileSync(path.join(repoDir, 'dist/r5-release-manifest.json'), 'utf8')
  );
  expect(manifest).toMatchObject({
    schemaVersion: 3,
    candidate: 'react-refactor-r5-candidate-v3',
    candidateTagObject,
    sourceCommit,
    sourceDirty: false,
    artifactTreeSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    qualification: {
      status: 'pending-memory',
      memoryEvidence: null
    }
  });
  expect(JSON.parse(output.trim())).toMatchObject({
    candidate: 'react-refactor-r5-candidate-v3',
    candidateTagObject,
    sourceCommit
  });
});

it('finalizes only passing memory evidence bound to the exact draft manifest identity', () => {
  const { candidateTagObject, fixtureScript, repoDir, sourceCommit } = createFixture();
  runManifest(
    fixtureScript,
    repoDir,
    'react-refactor-r5-candidate-v3',
    sourceCommit,
    { R5_RELEASE_MANIFEST_PHASE: 'prepare' }
  );
  const manifestPath = path.join(repoDir, 'dist/r5-release-manifest.json');
  const draftOutput = readFileSync(manifestPath, 'utf8');
  const draft = JSON.parse(draftOutput);
  const draftManifestSha256 = createHash('sha256').update(draftOutput).digest('hex');
  const evidencePath = path.join(repoDir, 'dist/r5-process-memory.json');
  const evidenceOutput = `${JSON.stringify({
    schemaVersion: 2,
    identity: {
      candidate: draft.candidate,
      candidateTagObject: draft.candidateTagObject,
      sourceCommit: draft.sourceCommit,
      artifactTreeSha256: draft.artifactTreeSha256,
      draftManifestSha256
    },
    pass: true,
    budgets: { peakBrowserTreeRssBytes: 1_500_000_000 },
    actual: { peakBrowserTreeRssBytes: 1_000_000_000 }
  }, null, 2)}\n`;
  writeFileSync(evidencePath, evidenceOutput, 'utf8');

  runManifest(
    fixtureScript,
    repoDir,
    'react-refactor-r5-candidate-v3',
    sourceCommit,
    {
      R5_RELEASE_MANIFEST_PHASE: 'finalize',
      R5_REQUIRE_MEMORY_EVIDENCE: '1'
    }
  );

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  expect(manifest).toMatchObject({
    schemaVersion: 3,
    candidate: 'react-refactor-r5-candidate-v3',
    candidateTagObject,
    sourceCommit,
    artifactTreeSha256: draft.artifactTreeSha256,
    qualification: {
      status: 'qualified',
      memoryEvidence: {
        path: 'r5-process-memory.json',
        schemaVersion: 2,
        pass: true,
        sha256: createHash('sha256').update(evidenceOutput).digest('hex')
      }
    }
  });
  expect(manifest.files.map((entry: { path: string }) => entry.path)).not.toContain(
    'r5-process-memory.json'
  );
});

it('rejects finalization when memory evidence is missing or identity-mismatched', () => {
  const { fixtureScript, repoDir, sourceCommit } = createFixture();
  runManifest(
    fixtureScript,
    repoDir,
    'react-refactor-r5-candidate-v3',
    sourceCommit,
    { R5_RELEASE_MANIFEST_PHASE: 'prepare' }
  );

  expect(() => runManifest(
    fixtureScript,
    repoDir,
    'react-refactor-r5-candidate-v3',
    sourceCommit,
    {
      R5_RELEASE_MANIFEST_PHASE: 'finalize',
      R5_REQUIRE_MEMORY_EVIDENCE: '1'
    }
  )).toThrow(/memory evidence/i);

  writeFileSync(path.join(repoDir, 'dist/r5-process-memory.json'), `${JSON.stringify({
    schemaVersion: 2,
    identity: {
      candidate: 'react-refactor-r5-candidate-v3',
      candidateTagObject: 'mismatched-tag-object',
      sourceCommit,
      artifactTreeSha256: 'mismatched-artifact-tree',
      draftManifestSha256: 'mismatched-draft'
    },
    pass: true
  })}\n`, 'utf8');

  expect(() => runManifest(
    fixtureScript,
    repoDir,
    'react-refactor-r5-candidate-v3',
    sourceCommit,
    {
      R5_RELEASE_MANIFEST_PHASE: 'finalize',
      R5_REQUIRE_MEMORY_EVIDENCE: '1'
    }
  )).toThrow(/identity/i);
});

it('rejects exact-identity memory evidence when any RSS budget failed', () => {
  const { fixtureScript, repoDir, sourceCommit } = createFixture();
  runManifest(
    fixtureScript,
    repoDir,
    'react-refactor-r5-candidate-v3',
    sourceCommit,
    { R5_RELEASE_MANIFEST_PHASE: 'prepare' }
  );
  const manifestPath = path.join(repoDir, 'dist/r5-release-manifest.json');
  const draftOutput = readFileSync(manifestPath, 'utf8');
  const draft = JSON.parse(draftOutput);
  writeFileSync(path.join(repoDir, 'dist/r5-process-memory.json'), `${JSON.stringify({
    schemaVersion: 2,
    identity: {
      candidate: draft.candidate,
      candidateTagObject: draft.candidateTagObject,
      sourceCommit: draft.sourceCommit,
      artifactTreeSha256: draft.artifactTreeSha256,
      draftManifestSha256: createHash('sha256').update(draftOutput).digest('hex')
    },
    pass: false
  })}\n`, 'utf8');

  expect(() => runManifest(
    fixtureScript,
    repoDir,
    'react-refactor-r5-candidate-v3',
    sourceCommit,
    {
      R5_RELEASE_MANIFEST_PHASE: 'finalize',
      R5_REQUIRE_MEMORY_EVIDENCE: '1'
    }
  )).toThrow(/pass every budget/i);
  expect(JSON.parse(readFileSync(manifestPath, 'utf8')).qualification.status)
    .toBe('pending-memory');
});

it('rejects a candidate tag that does not peel to the supplied source commit', () => {
  const { fixtureScript, repoDir } = createFixture();
  writeFileSync(path.join(repoDir, 'source-change.txt'), 'changed\n', 'utf8');
  runGit(repoDir, 'add', 'source-change.txt');
  runGit(repoDir, 'commit', '--quiet', '-m', 'move source head');
  const sourceCommit = runGit(repoDir, 'rev-parse', 'HEAD');

  expect(() => {
    runManifest(
      fixtureScript,
      repoDir,
      'react-refactor-r5-candidate-v3',
      sourceCommit
    );
  }).toThrow(/does not resolve to source commit/);
});

it('rejects a lightweight candidate ref', () => {
  const { fixtureScript, repoDir, sourceCommit } = createFixture();
  runGit(repoDir, 'tag', '--delete', 'react-refactor-r5-candidate-v3');
  runGit(repoDir, 'tag', 'react-refactor-r5-candidate-v3');

  expect(() => {
    runManifest(
      fixtureScript,
      repoDir,
      'react-refactor-r5-candidate-v3',
      sourceCommit
    );
  }).toThrow(/must be an annotated tag/);
});

it('rejects a candidate manifest from a dirty source tree', () => {
  const { fixtureScript, repoDir, sourceCommit } = createFixture();
  writeFileSync(path.join(repoDir, 'uncommitted.txt'), 'dirty\n', 'utf8');

  expect(() => {
    runManifest(
      fixtureScript,
      repoDir,
      'react-refactor-r5-candidate-v3',
      sourceCommit
    );
  }).toThrow(/requires a clean source tree/);
});

it('requires explicit candidate and source inputs for a deployable release build', () => {
  const { fixtureScript, repoDir } = createFixture();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    R5_REQUIRE_RELEASE_IDENTITY: '1'
  };
  delete env.R5_CANDIDATE_TAG;
  delete env.R5_SOURCE_COMMIT;

  expect(() => {
    execFileSync(process.execPath, [fixtureScript], {
      cwd: repoDir,
      env,
      stdio: 'pipe'
    });
  }).toThrow(/requires explicit R5_CANDIDATE_TAG and R5_SOURCE_COMMIT/);
});

it('rejects a supplied source commit that is not the checked-out HEAD', () => {
  const { fixtureScript, repoDir } = createFixture();

  expect(() => {
    runManifest(
      fixtureScript,
      repoDir,
      'react-refactor-r5-candidate-v3',
      '0000000000000000000000000000000000000000'
    );
  }).toThrow(/does not match HEAD/);
});

it('rejects candidate names outside the immutable R5 tag namespace', () => {
  const { fixtureScript, repoDir, sourceCommit } = createFixture();

  expect(() => {
    runManifest(fixtureScript, repoDir, 'refs/heads/main', sourceCommit);
  }).toThrow(/must match react-refactor-r5-candidate/);
});

it('accepts the separately named parity repair candidate without moving an old candidate', () => {
  const { fixtureScript, repoDir, sourceCommit } = createFixture();
  runGit(
    repoDir,
    'tag',
    '-a',
    'react-refactor-r5-parity-repair-candidate',
    '-m',
    'parity repair candidate fixture'
  );

  runManifest(
    fixtureScript,
    repoDir,
    'react-refactor-r5-parity-repair-candidate',
    sourceCommit
  );
  const manifest = JSON.parse(
    readFileSync(path.join(repoDir, 'dist/r5-release-manifest.json'), 'utf8')
  );
  expect(manifest).toMatchObject({
    candidate: 'react-refactor-r5-parity-repair-candidate',
    sourceCommit,
    sourceDirty: false
  });
  expect(runGit(repoDir, 'rev-parse', 'refs/tags/react-refactor-r5-candidate-v3^{commit}'))
    .toBe(sourceCommit);
});

it('accepts a versioned parity repair candidate without moving either prior namespace', () => {
  const { fixtureScript, repoDir, sourceCommit } = createFixture();
  runGit(
    repoDir,
    'tag',
    '-a',
    'react-refactor-r5-parity-repair-candidate',
    '-m',
    'first parity repair candidate fixture'
  );
  runGit(
    repoDir,
    'tag',
    '-a',
    'react-refactor-r5-parity-repair-candidate-v2',
    '-m',
    'second parity repair candidate fixture'
  );

  runManifest(
    fixtureScript,
    repoDir,
    'react-refactor-r5-parity-repair-candidate-v2',
    sourceCommit
  );
  const manifest = JSON.parse(
    readFileSync(path.join(repoDir, 'dist/r5-release-manifest.json'), 'utf8')
  );
  expect(manifest).toMatchObject({
    candidate: 'react-refactor-r5-parity-repair-candidate-v2',
    sourceCommit,
    sourceDirty: false
  });
  expect(runGit(repoDir, 'rev-parse', 'refs/tags/react-refactor-r5-candidate-v3^{commit}'))
    .toBe(sourceCommit);
  expect(runGit(repoDir, 'rev-parse', 'refs/tags/react-refactor-r5-parity-repair-candidate^{commit}'))
    .toBe(sourceCommit);
});

it('routes deploy builds through the strict release identity gate', () => {
  expect(rootPackage.scripts['deploy:prepare']).toContain('release:prepare');
  expect(rootPackage.scripts['deploy:finalize']).toContain('release:finalize');
  expect(rootPackage.scripts['deploy:build']).toContain('deploy:prepare');
  expect(rootPackage.scripts['deploy:build']).toContain('evidence:memory:release');
  expect(rootPackage.scripts['deploy:build']).toContain('deploy:finalize');
  expect(appPackage.scripts['release:prepare']).toContain('R5_REQUIRE_RELEASE_IDENTITY=1');
  expect(appPackage.scripts['release:finalize']).toContain('R5_REQUIRE_MEMORY_EVIDENCE=1');
  expect(memoryRunner).toContain("R5_MEMORY_OUTPUT_PATH: 'dist/r5-process-memory.json'");
  expect(memoryRunner).toContain("R5_MEMORY_ARCHIVE_PATH: ''");
  expect(memoryRunner).not.toContain(
    'artifacts/react-refactor/r5-parity-repair-candidate/r5-process-memory.json'
  );
});

it('only publishes a deployable CI artifact from an identity-bound candidate tag build', () => {
  expect(candidateWorkflow).toContain("- 'react-refactor-r5-candidate-v3'");
  expect(candidateWorkflow).not.toContain("- 'react-refactor-r5-candidate*'");
  expect(candidateWorkflow).toContain('fetch-depth: 0');
  expect(candidateWorkflow).toContain('R5_CANDIDATE_TAG: ${{ github.ref_name }}');
  expect(candidateWorkflow).toContain('R5_SOURCE_COMMIT: ${{ github.sha }}');
  expect(candidateWorkflow).toContain(
    "github.ref == 'refs/tags/react-refactor-r5-candidate-v3'"
  );
  expect(candidateWorkflow).toContain("- 'react-refactor-r5-parity-repair-candidate'");
  expect(candidateWorkflow).toContain(
    "github.ref == 'refs/tags/react-refactor-r5-parity-repair-candidate'"
  );
  expect(candidateWorkflow).toContain("- 'react-refactor-r5-parity-repair-candidate-v2'");
  expect(candidateWorkflow).toContain(
    "github.ref == 'refs/tags/react-refactor-r5-parity-repair-candidate-v2'"
  );
  expect(candidateWorkflow).toContain("- 'react-refactor-r5-parity-repair-candidate-v3'");
  expect(candidateWorkflow).toContain("- 'react-refactor-r5-parity-repair-candidate-v4'");
  expect(candidateWorkflow).toContain("- 'react-refactor-r5-parity-repair-candidate-v5'");
  expect(candidateWorkflow).toContain("- 'react-refactor-r5-parity-repair-candidate-v6'");
  expect(candidateWorkflow).toContain(
    "github.ref == 'refs/tags/react-refactor-r5-parity-repair-candidate-v4'"
  );
  expect(candidateWorkflow).toContain(
    "github.ref == 'refs/tags/react-refactor-r5-parity-repair-candidate-v5'"
  );
  expect(candidateWorkflow).toContain(
    "github.ref == 'refs/tags/react-refactor-r5-parity-repair-candidate-v6'"
  );
  expect(candidateWorkflow).toContain('pnpm run deploy:prepare');
  expect(candidateWorkflow).toContain('pnpm -C app run evidence:memory:release');
  expect(candidateWorkflow).toContain('pnpm run deploy:finalize');
  expect(candidateWorkflow.indexOf('pnpm run deploy:prepare')).toBeLessThan(
    candidateWorkflow.indexOf('pnpm -C app run evidence:memory:release')
  );
  expect(candidateWorkflow.indexOf('pnpm -C app run evidence:memory:release')).toBeLessThan(
    candidateWorkflow.indexOf('pnpm run deploy:finalize')
  );
  expect(candidateWorkflow.indexOf('pnpm run deploy:finalize')).toBeLessThan(
    candidateWorkflow.indexOf('- name: Production browser matrix')
  );
  expect(candidateWorkflow.indexOf('- name: Production browser matrix')).toBeLessThan(
    candidateWorkflow.indexOf('- name: Harness contract regression')
  );
  expect(candidateWorkflow.indexOf('- name: Harness contract regression')).toBeLessThan(
    candidateWorkflow.indexOf('uses: actions/upload-artifact@v4')
  );
});

it('marks an ordinary dirty build as unbound instead of naming a release candidate', () => {
  const { fixtureScript, repoDir, sourceCommit } = createFixture();
  writeFileSync(path.join(repoDir, 'uncommitted.txt'), 'dirty\n', 'utf8');
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.R5_CANDIDATE_TAG;
  delete env.R5_SOURCE_COMMIT;
  delete env.R5_REQUIRE_RELEASE_IDENTITY;

  execFileSync(process.execPath, [fixtureScript], {
    cwd: repoDir,
    env,
    stdio: 'pipe'
  });
  const manifest = JSON.parse(
    readFileSync(path.join(repoDir, 'dist/r5-release-manifest.json'), 'utf8')
  );
  expect(manifest).toMatchObject({
    candidate: null,
    candidateTagObject: null,
    sourceCommit,
    sourceDirty: true
  });
});
