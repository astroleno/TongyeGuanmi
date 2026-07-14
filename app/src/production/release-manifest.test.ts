import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';

function executableWorkflow(source: string) {
  return source
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .map((line) => line.replace(/\s+#.*$/, ''))
    .join('\n');
}

const scriptPath = fileURLToPath(
  new URL('../../scripts/create-release-manifest.mjs', import.meta.url)
);
const memoryContractPath = fileURLToPath(
  new URL('../../scripts/r5-process-memory-contract.mjs', import.meta.url)
);
const appPackage = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
);
const rootPackage = JSON.parse(
  readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')
);
const candidateWorkflow = executableWorkflow(readFileSync(
  new URL('../../../.github/workflows/r5-candidate.yml', import.meta.url),
  'utf8'
));
const mediaAssetWorkflow = executableWorkflow(readFileSync(
  new URL('../../../.github/workflows/r5-media-assets.yml', import.meta.url),
  'utf8'
));
const staticMediaVerifier = readFileSync(
  new URL('../../scripts/verify-homepage-media-inventory.mjs', import.meta.url),
  'utf8'
);
const deepMediaVerifier = readFileSync(
  new URL('../../scripts/verify-homepage-media-deep.mjs', import.meta.url),
  'utf8'
);
const memoryRunner = readFileSync(
  new URL('../../scripts/run-r5-process-memory.mjs', import.meta.url),
  'utf8'
);
const memoryProfiler = readFileSync(
  new URL('../../scripts/profile-r5-process-memory.mjs', import.meta.url),
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
  const fixtureMemoryContract = path.join(
    repoDir,
    'app/scripts/r5-process-memory-contract.mjs'
  );
  mkdirSync(path.dirname(fixtureScript), { recursive: true });
  mkdirSync(path.join(repoDir, 'dist'), { recursive: true });
  copyFileSync(scriptPath, fixtureScript);
  copyFileSync(memoryContractPath, fixtureMemoryContract);
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

type MemoryIdentity = {
  candidate: string;
  candidateTagObject: string;
  sourceCommit: string;
  artifactTreeSha256: string;
  draftManifestSha256: string;
};

function validProcessSample() {
  return {
    browserPid: 101,
    browserRootRssBytes: 100_000_000,
    totalRssBytes: 1_000_000_000,
    gpuRssBytes: 200_000_000,
    rendererRssBytes: 700_000_000,
    gpuProcessCount: 1,
    rendererProcessCount: 1,
    processCount: 3
  };
}

function memoryEvidence(
  identity: MemoryIdentity,
  options: {
    runCount?: number;
    runPass?: boolean;
    qualificationPass?: boolean;
    processSamples?: readonly ReturnType<typeof validProcessSample>[];
  } = {}
) {
  const environment = {
    platform: 'darwin',
    arch: 'arm64',
    osRelease: '23.6.0',
    browserChannel: 'chrome',
    headless: true,
    runnerClass: 'github-hosted-macos-14'
  };
  const runCount = options.runCount ?? 2;
  const processSamples = options.processSamples ?? [validProcessSample()];
  const runPass = options.runPass ?? true;
  const runs = Array.from({ length: runCount }, (_, index) => ({
    schemaVersion: 3,
    kind: 'r5-process-memory-run',
    runId: `run-${index + 1}`,
    identity,
    environment,
    sampling: {
      valid: processSamples.length > 0,
      sampleCount: processSamples.length
    },
    budgets: { peakBrowserTreeRssBytes: 1_500_000_000 },
    actual: { peakBrowserTreeRssBytes: 1_000_000_000 },
    pass: runPass,
    processSamples
  }));
  return {
    schemaVersion: 3,
    kind: 'r5-process-memory-qualification',
    identity,
    environment,
    requiredRunCount: 2,
    completedRunCount: runs.length,
    budgets: runs[0]?.budgets,
    actual: runs[0]?.actual,
    pass: options.qualificationPass ?? runPass,
    runs
  };
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
  const evidenceOutput = `${JSON.stringify(memoryEvidence({
    candidate: draft.candidate,
    candidateTagObject: draft.candidateTagObject,
    sourceCommit: draft.sourceCommit,
    artifactTreeSha256: draft.artifactTreeSha256,
    draftManifestSha256
  }), null, 2)}\n`;
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
        schemaVersion: 3,
        pass: true,
        runCount: 2,
        environment: {
          platform: 'darwin',
          runnerClass: 'github-hosted-macos-14'
        },
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

  writeFileSync(path.join(repoDir, 'dist/r5-process-memory.json'), `${JSON.stringify(
    memoryEvidence({
      candidate: 'react-refactor-r5-candidate-v3',
      candidateTagObject: 'mismatched-tag-object',
      sourceCommit,
      artifactTreeSha256: 'mismatched-artifact-tree',
      draftManifestSha256: 'mismatched-draft'
    })
  )}\n`, 'utf8');

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
  writeFileSync(path.join(repoDir, 'dist/r5-process-memory.json'), `${JSON.stringify(
    memoryEvidence({
      candidate: draft.candidate,
      candidateTagObject: draft.candidateTagObject,
      sourceCommit: draft.sourceCommit,
      artifactTreeSha256: draft.artifactTreeSha256,
      draftManifestSha256: createHash('sha256').update(draftOutput).digest('hex')
    }, {
      runPass: false,
      qualificationPass: false
    })
  )}\n`, 'utf8');

  expect(() => runManifest(
    fixtureScript,
    repoDir,
    'react-refactor-r5-candidate-v3',
    sourceCommit,
    {
      R5_RELEASE_MANIFEST_PHASE: 'finalize',
      R5_REQUIRE_MEMORY_EVIDENCE: '1'
    }
  )).toThrow(/valid passing macOS runs/i);
  expect(JSON.parse(readFileSync(manifestPath, 'utf8')).qualification.status)
    .toBe('pending-memory');
});

it('rejects empty samples and a single claimed qualification run', () => {
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
  const identity = {
    candidate: draft.candidate,
    candidateTagObject: draft.candidateTagObject,
    sourceCommit: draft.sourceCommit,
    artifactTreeSha256: draft.artifactTreeSha256,
    draftManifestSha256: createHash('sha256').update(draftOutput).digest('hex')
  };
  const evidencePath = path.join(repoDir, 'dist/r5-process-memory.json');

  writeFileSync(evidencePath, `${JSON.stringify(memoryEvidence(identity, {
    processSamples: []
  }))}\n`, 'utf8');
  expect(() => runManifest(
    fixtureScript,
    repoDir,
    'react-refactor-r5-candidate-v3',
    sourceCommit,
    { R5_RELEASE_MANIFEST_PHASE: 'finalize' }
  )).toThrow(/no browser process samples/i);

  writeFileSync(evidencePath, `${JSON.stringify(memoryEvidence(identity, {
    runCount: 1
  }))}\n`, 'utf8');
  expect(() => runManifest(
    fixtureScript,
    repoDir,
    'react-refactor-r5-candidate-v3',
    sourceCommit,
    { R5_RELEASE_MANIFEST_PHASE: 'finalize' }
  )).toThrow(/contains 1 runs instead of 2/i);
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
  expect(memoryRunner).toContain('index < R5_REQUIRED_MEMORY_RUNS');
  expect(memoryRunner).toContain('validateProcessMemoryQualification');
  expect(memoryRunner).toContain("path.join(repoDir, 'dist/r5-process-memory.json')");
  expect(memoryRunner).toContain("R5_MEMORY_ARCHIVE_PATH: ''");
  expect(memoryRunner).not.toContain(
    'artifacts/react-refactor/r5-parity-repair-candidate/r5-process-memory.json'
  );
  expect(memoryProfiler).toContain('isBrowserRootCommand(row.command)');
  expect(memoryProfiler).toContain('const pass = samplingSummary.valid');
  expect(memoryProfiler).not.toContain('macOS / Chrome hardware process-tree sample');
});

it('rejects a failed memory profiler before reading its report', () => {
  const exitGuard = 'if (result.code !== 0)';
  const reportRead = 'runs.push(await readRunReport(runOutputPath))';

  expect(memoryRunner).toContain(exitGuard);
  expect(memoryRunner).toContain(
    'process memory profile exited with code ${result.code}'
  );
  expect(memoryRunner.indexOf(exitGuard)).toBeLessThan(memoryRunner.indexOf(reportRead));
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
  expect(candidateWorkflow).toMatch(
    /^ {6}- 'react-refactor-r5-parity-repair-candidate-v\*'$/m
  );
  expect(candidateWorkflow).not.toMatch(
    /^ {6}- 'react-refactor-r5-parity-repair-candidate-v\d+'$/m
  );
  expect(candidateWorkflow).toContain(
    "runs-on: ${{ startsWith(github.ref, 'refs/tags/react-refactor-r5-parity-repair-candidate-v') && 'macos-14' || 'ubuntu-latest' }}"
  );
  expect(
    candidateWorkflow.split(
      "startsWith(github.ref, 'refs/tags/react-refactor-r5-parity-repair-candidate-v')"
    )
  ).toHaveLength(8);
  expect(candidateWorkflow).toContain(
    'R5_MEMORY_RUNNER_CLASS: github-hosted-macos-14'
  );
  expect(candidateWorkflow).not.toMatch(/\bff(?:mpeg|probe)\b/i);
  expect(candidateWorkflow).not.toContain('verify:media:deep');
  expect(candidateWorkflow).toContain('- name: Restore immutable annotated candidate tag');
  expect(candidateWorkflow).toContain('git fetch --force --no-tags origin');
  expect(candidateWorkflow).toContain(
    '"refs/tags/${R5_CANDIDATE_TAG}:refs/tags/${R5_CANDIDATE_TAG}"'
  );
  expect(candidateWorkflow).toContain(
    'git cat-file -t "refs/tags/${R5_CANDIDATE_TAG}"'
  );
  expect(candidateWorkflow).toContain(
    'git rev-parse "refs/tags/${R5_CANDIDATE_TAG}^{commit}"'
  );
  expect(candidateWorkflow).toContain('pnpm run deploy:prepare');
  expect(candidateWorkflow).toContain('pnpm -C app run evidence:memory:release');
  expect(candidateWorkflow).toContain('pnpm run deploy:finalize');
  expect(candidateWorkflow.indexOf('pnpm run deploy:prepare')).toBeLessThan(
    candidateWorkflow.indexOf('pnpm -C app run evidence:memory:release')
  );
  expect(candidateWorkflow.indexOf('- name: Install qualification Chrome on macOS')).toBeLessThan(
    candidateWorkflow.indexOf('pnpm -C app run evidence:memory:release')
  );
  expect(
    candidateWorkflow.indexOf('- name: Restore immutable annotated candidate tag')
  ).toBeLessThan(candidateWorkflow.indexOf('pnpm run deploy:prepare'));
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

it('runs deep WebM qualification only in the path-filtered media workflow', () => {
  expect(rootPackage.scripts['verify:media']).toBe('pnpm -C app run verify:media');
  expect(rootPackage.scripts['verify:media:deep']).toBe(
    'pnpm -C app run verify:media:deep'
  );
  expect(rootPackage.scripts['verify:all']).not.toContain('verify:media:deep');
  expect(appPackage.scripts.build).toContain('pnpm run verify:media');
  expect(appPackage.scripts.build).not.toContain('verify:media:deep');
  expect(appPackage.scripts['verify:media']).toBe(
    'node scripts/verify-homepage-media-inventory.mjs'
  );
  expect(appPackage.scripts['verify:media:deep']).toBe(
    'node scripts/verify-homepage-media-deep.mjs'
  );
  expect(staticMediaVerifier).not.toContain('ffprobe');
  expect(deepMediaVerifier).toContain("execFileAsync('ffprobe'");
  expect(deepMediaVerifier).toContain("'-codec:v', 'libvpx-vp9'");
  expect(deepMediaVerifier).toContain('keyframeIndexes');
  expect(deepMediaVerifier).toContain('expectedFrameStep');

  expect(mediaAssetWorkflow).toContain('workflow_dispatch:');
  expect(mediaAssetWorkflow).toContain("branches:\n      - '**'");
  expect(mediaAssetWorkflow).not.toContain('tags:');
  expect(mediaAssetWorkflow.split("- 'assets/*.webm'")).toHaveLength(3);
  expect(mediaAssetWorkflow.split("- 'assets/**/*.webm'")).toHaveLength(3);
  expect(
    mediaAssetWorkflow.split("- 'app/scripts/homepage-media-contract.mjs'")
  ).toHaveLength(3);
  expect(
    mediaAssetWorkflow.split("- 'app/scripts/verify-homepage-media-deep.mjs'")
  ).toHaveLength(3);
  expect(mediaAssetWorkflow).toContain('asset-qualification:');
  expect(mediaAssetWorkflow).toContain('- name: Install FFmpeg');
  expect(mediaAssetWorkflow).toContain('sudo apt-get install --yes ffmpeg');
  expect(mediaAssetWorkflow).toContain('ffprobe -version');
  expect(mediaAssetWorkflow).not.toContain('pnpm install');
  expect(mediaAssetWorkflow).toContain('pnpm run verify:media:deep');
  expect(mediaAssetWorkflow.indexOf('- name: Install FFmpeg')).toBeLessThan(
    mediaAssetWorkflow.indexOf('- name: Deep media qualification')
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
