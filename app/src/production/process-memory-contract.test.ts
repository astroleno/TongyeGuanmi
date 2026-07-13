import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

type MemoryContract = {
  isBrowserRootCommand(command: string, platform: string): boolean;
  summarizeProcessSamples(samples: readonly Record<string, unknown>[]): {
    valid: boolean;
    reasons: string[];
    sampleCount: number;
  };
  validateProcessMemoryQualification(report: Record<string, unknown>): {
    valid: boolean;
    reasons: string[];
  };
};

const contractPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../scripts/r5-process-memory-contract.mjs'
);

async function loadContract(): Promise<MemoryContract> {
  return import(pathToFileURL(contractPath).href) as Promise<MemoryContract>;
}

function validSample() {
  return {
    browserPid: 101,
    browserRootRssBytes: 100,
    totalRssBytes: 600,
    gpuRssBytes: 200,
    rendererRssBytes: 300,
    gpuProcessCount: 1,
    rendererProcessCount: 1,
    processCount: 3
  };
}

function validIdentity() {
  return {
    candidate: 'react-refactor-r5-parity-repair-candidate-v8',
    candidateTagObject: 'tag-object',
    sourceCommit: 'source-commit',
    artifactTreeSha256: 'artifact-tree',
    draftManifestSha256: 'draft-manifest'
  };
}

function validEnvironment() {
  return {
    platform: 'darwin',
    arch: 'arm64',
    osRelease: '23.6.0',
    browserChannel: 'chrome',
    headless: true,
    runnerClass: 'github-hosted-macos-14'
  };
}

function validRun(runId: string) {
  return {
    schemaVersion: 3,
    kind: 'r5-process-memory-run',
    runId,
    identity: validIdentity(),
    environment: validEnvironment(),
    sampling: { valid: true, sampleCount: 1 },
    budgets: { peakBrowserTreeRssBytes: 1_500_000_000 },
    actual: { peakBrowserTreeRssBytes: 1_000_000_000 },
    pass: true,
    processSamples: [validSample()]
  };
}

describe('R5 process memory qualification contract', () => {
  it('finds platform-specific Chrome roots without treating child processes as roots', async () => {
    const contract = await loadContract();

    expect(contract.isBrowserRootCommand(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --remote-debugging-pipe',
      'darwin'
    )).toBe(true);
    expect(contract.isBrowserRootCommand(
      '/opt/google/chrome/chrome --remote-debugging-pipe',
      'linux'
    )).toBe(true);
    expect(contract.isBrowserRootCommand(
      '/opt/google/chrome/chrome --type=renderer',
      'linux'
    )).toBe(false);
  });

  it('fails closed for empty samples or a process tree without GPU and renderer processes', async () => {
    const contract = await loadContract();

    expect(contract.summarizeProcessSamples([])).toMatchObject({
      valid: false,
      sampleCount: 0
    });
    expect(contract.summarizeProcessSamples([{
      ...validSample(),
      gpuRssBytes: 0,
      rendererRssBytes: 0,
      gpuProcessCount: 0,
      rendererProcessCount: 0,
      processCount: 1
    }])).toMatchObject({ valid: false, sampleCount: 1 });
    expect(contract.summarizeProcessSamples([validSample()])).toMatchObject({
      valid: true,
      sampleCount: 1
    });
  });

  it('requires two distinct passing runs from the same exact identity and macOS environment', async () => {
    const contract = await loadContract();
    const runs = [validRun('run-1'), validRun('run-2')];
    const report = {
      schemaVersion: 3,
      kind: 'r5-process-memory-qualification',
      identity: validIdentity(),
      environment: validEnvironment(),
      requiredRunCount: 2,
      completedRunCount: 2,
      pass: true,
      runs
    };

    expect(contract.validateProcessMemoryQualification(report)).toEqual({
      valid: true,
      reasons: []
    });
    expect(contract.validateProcessMemoryQualification({
      ...report,
      completedRunCount: 1,
      runs: runs.slice(0, 1)
    }).valid).toBe(false);
    expect(contract.validateProcessMemoryQualification({
      ...report,
      runs: [runs[0], { ...runs[1], runId: 'run-1' }]
    }).reasons).toContain('qualification runs must have distinct runIds');
  });
});
