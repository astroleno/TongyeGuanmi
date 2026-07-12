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
  sourceCommit: string
) {
  return execFileSync(process.execPath, [fixtureScript], {
    cwd: repoDir,
    encoding: 'utf8',
    stdio: 'pipe',
    env: {
      ...process.env,
      R5_CANDIDATE_TAG: candidate,
      R5_SOURCE_COMMIT: sourceCommit,
      R5_REQUIRE_RELEASE_IDENTITY: '1'
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
    schemaVersion: 2,
    candidate: 'react-refactor-r5-candidate-v3',
    candidateTagObject,
    sourceCommit,
    sourceDirty: false
  });
  expect(JSON.parse(output.trim())).toMatchObject({
    candidate: 'react-refactor-r5-candidate-v3',
    candidateTagObject,
    sourceCommit
  });
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

it('routes deploy builds through the strict release identity gate', () => {
  expect(rootPackage.scripts['deploy:build']).toBe('pnpm -C app build:release');
  expect(appPackage.scripts['build:release']).toContain('R5_REQUIRE_RELEASE_IDENTITY=1');
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
