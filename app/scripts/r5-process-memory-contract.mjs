export const R5_PROCESS_MEMORY_SCHEMA_VERSION = 3;
export const R5_PROCESS_MEMORY_RUN_KIND = 'r5-process-memory-run';
export const R5_PROCESS_MEMORY_QUALIFICATION_KIND = 'r5-process-memory-qualification';
export const R5_REQUIRED_MEMORY_RUNS = 2;

const APPROVED_RUNNER_CLASSES = new Set([
  'github-hosted-macos-14',
  'local-macos-hardware'
]);
const IDENTITY_FIELDS = [
  'candidate',
  'candidateTagObject',
  'sourceCommit',
  'artifactTreeSha256',
  'draftManifestSha256'
];

export function isBrowserRootCommand(command, platform = process.platform) {
  if (typeof command !== 'string' || command.includes('--type=')) {
    return false;
  }
  if (platform === 'darwin') {
    return /\/Google Chrome(?: for Testing)?(?:\s|$)/.test(command);
  }
  if (platform === 'linux') {
    return /(?:^|\/)(?:google-chrome(?:-stable)?|chrome|chromium|chromium-browser)(?:\s|$)/
      .test(command);
  }
  return false;
}

export function summarizeProcessSamples(processSamples) {
  const samples = Array.isArray(processSamples) ? processSamples : [];
  const browserSamples = samples.filter((sample) => (
    Number.isInteger(sample?.browserPid)
    && sample.browserPid > 0
    && Number.isFinite(sample.browserRootRssBytes)
    && sample.browserRootRssBytes > 0
    && Number.isFinite(sample.totalRssBytes)
    && sample.totalRssBytes >= sample.browserRootRssBytes
    && Number.isInteger(sample.processCount)
    && sample.processCount > 0
  ));
  const gpuSamples = browserSamples.filter((sample) => (
    Number.isInteger(sample.gpuProcessCount)
    && sample.gpuProcessCount > 0
    && Number.isFinite(sample.gpuRssBytes)
    && sample.gpuRssBytes > 0
  ));
  const rendererSamples = browserSamples.filter((sample) => (
    Number.isInteger(sample.rendererProcessCount)
    && sample.rendererProcessCount > 0
    && Number.isFinite(sample.rendererRssBytes)
    && sample.rendererRssBytes > 0
  ));
  const reasons = [];
  if (samples.length === 0) reasons.push('no browser process samples were captured');
  if (browserSamples.length !== samples.length) {
    reasons.push('one or more samples lack a valid browser root process');
  }
  if (gpuSamples.length === 0) reasons.push('no GPU process was observed');
  if (rendererSamples.length === 0) reasons.push('no renderer process was observed');
  return {
    valid: reasons.length === 0,
    reasons,
    sampleCount: samples.length,
    browserSampleCount: browserSamples.length,
    browserPidCount: new Set(browserSamples.map((sample) => sample.browserPid)).size,
    gpuSampleCount: gpuSamples.length,
    rendererSampleCount: rendererSamples.length,
    maxProcessCount: Math.max(0, ...browserSamples.map((sample) => sample.processCount))
  };
}

export function validateReleaseMemoryEnvironment(environment) {
  const reasons = [];
  if (environment?.platform !== 'darwin') {
    reasons.push(`qualification requires darwin, received ${environment?.platform ?? 'unknown'}`);
  }
  if (!APPROVED_RUNNER_CLASSES.has(environment?.runnerClass)) {
    reasons.push(`unapproved memory runner class ${environment?.runnerClass ?? 'missing'}`);
  }
  if (environment?.browserChannel !== 'chrome') {
    reasons.push(`qualification requires the chrome channel, received ${environment?.browserChannel ?? 'unknown'}`);
  }
  if (typeof environment?.headless !== 'boolean') {
    reasons.push('browser headless mode was not recorded');
  }
  if (typeof environment?.arch !== 'string' || environment.arch.length === 0) {
    reasons.push('runner architecture was not recorded');
  }
  if (typeof environment?.osRelease !== 'string' || environment.osRelease.length === 0) {
    reasons.push('runner OS release was not recorded');
  }
  return { valid: reasons.length === 0, reasons };
}

export function memoryIdentitiesMatch(left, right) {
  return IDENTITY_FIELDS.every((field) => (
    typeof left?.[field] === 'string'
    && left[field].length > 0
    && left[field] === right?.[field]
  ));
}

function validateRun(run) {
  const reasons = [];
  if (run?.schemaVersion !== R5_PROCESS_MEMORY_SCHEMA_VERSION) {
    reasons.push(`run schema must be ${R5_PROCESS_MEMORY_SCHEMA_VERSION}`);
  }
  if (run?.kind !== R5_PROCESS_MEMORY_RUN_KIND) {
    reasons.push(`run kind must be ${R5_PROCESS_MEMORY_RUN_KIND}`);
  }
  if (typeof run?.runId !== 'string' || run.runId.length === 0) {
    reasons.push('runId is missing');
  }
  if (!IDENTITY_FIELDS.every((field) => typeof run?.identity?.[field] === 'string')) {
    reasons.push('run identity is incomplete');
  }
  const environment = validateReleaseMemoryEnvironment(run?.environment);
  reasons.push(...environment.reasons);
  const sampling = summarizeProcessSamples(run?.processSamples);
  reasons.push(...sampling.reasons);
  if (run?.sampling?.valid !== true) {
    reasons.push('run sampling was not marked valid');
  }
  if (run?.sampling?.sampleCount !== sampling.sampleCount) {
    reasons.push('run sampling count does not match its process samples');
  }
  if (run?.pass !== true) {
    reasons.push('run did not pass every memory budget');
  }
  return { valid: reasons.length === 0, reasons };
}

export function validateProcessMemoryQualification(report) {
  const reasons = [];
  if (report?.schemaVersion !== R5_PROCESS_MEMORY_SCHEMA_VERSION) {
    reasons.push(`qualification schema must be ${R5_PROCESS_MEMORY_SCHEMA_VERSION}`);
  }
  if (report?.kind !== R5_PROCESS_MEMORY_QUALIFICATION_KIND) {
    reasons.push(`qualification kind must be ${R5_PROCESS_MEMORY_QUALIFICATION_KIND}`);
  }
  if (report?.requiredRunCount !== R5_REQUIRED_MEMORY_RUNS) {
    reasons.push(`qualification requires ${R5_REQUIRED_MEMORY_RUNS} runs`);
  }
  const runs = Array.isArray(report?.runs) ? report.runs : [];
  if (runs.length !== R5_REQUIRED_MEMORY_RUNS) {
    reasons.push(`qualification contains ${runs.length} runs instead of ${R5_REQUIRED_MEMORY_RUNS}`);
  }
  if (report?.completedRunCount !== runs.length) {
    reasons.push('completed run count does not match the embedded runs');
  }
  const runIds = new Set();
  for (const [index, run] of runs.entries()) {
    const validation = validateRun(run);
    reasons.push(...validation.reasons.map((reason) => `run ${index + 1}: ${reason}`));
    if (!memoryIdentitiesMatch(report?.identity, run?.identity)) {
      reasons.push(`run ${index + 1}: identity does not match the qualification`);
    }
    if (JSON.stringify(report?.environment) !== JSON.stringify(run?.environment)) {
      reasons.push(`run ${index + 1}: environment does not match the qualification`);
    }
    if (typeof run?.runId === 'string') runIds.add(run.runId);
  }
  if (runIds.size !== runs.length) {
    reasons.push('qualification runs must have distinct runIds');
  }
  const environment = validateReleaseMemoryEnvironment(report?.environment);
  reasons.push(...environment.reasons);
  if (report?.pass !== true) {
    reasons.push('qualification did not pass every required run');
  }
  return { valid: reasons.length === 0, reasons };
}
