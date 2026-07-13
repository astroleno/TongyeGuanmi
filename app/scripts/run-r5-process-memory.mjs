import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { arch, release as osRelease, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  memoryIdentitiesMatch,
  R5_PROCESS_MEMORY_QUALIFICATION_KIND,
  R5_PROCESS_MEMORY_SCHEMA_VERSION,
  R5_REQUIRED_MEMORY_RUNS,
  validateProcessMemoryQualification,
  validateReleaseMemoryEnvironment
} from './r5-process-memory-contract.mjs';

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoDir = path.dirname(appDir);
const profileScript = path.join(appDir, 'scripts/profile-r5-process-memory.mjs');
const host = process.env.R5_PREVIEW_HOST ?? '127.0.0.1';
const port = process.env.R5_PREVIEW_PORT ?? '4173';
const baseUrl = `http://${host}:${port}`;
const detached = process.platform !== 'win32';
const outputPath = path.join(repoDir, 'dist/r5-process-memory.json');
const environment = {
  platform: process.platform,
  arch: arch(),
  osRelease: osRelease(),
  browserChannel: 'chrome',
  headless: process.env.R5_MEMORY_HEADLESS !== '0',
  runnerClass: process.env.R5_MEMORY_RUNNER_CLASS?.trim() || null
};
const environmentValidation = validateReleaseMemoryEnvironment(environment);
if (!environmentValidation.valid) {
  throw new Error(
    `process memory release qualification requires an approved environment: ${environmentValidation.reasons.join('; ')}`
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function spawnPackageManager(args) {
  const packageManagerScript = process.env.npm_execpath;
  return packageManagerScript
    ? spawn(process.execPath, [packageManagerScript, ...args], {
        cwd: repoDir,
        detached,
        stdio: 'inherit'
      })
    : spawn('pnpm', args, {
        cwd: repoDir,
        detached,
        stdio: 'inherit'
      });
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
}

async function waitForPreview(child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`preview exited before readiness with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(baseUrl);
      if (response.ok) {
        return;
      }
    } catch {
      // Vite is still starting.
    }
    await sleep(250);
  }
  throw new Error(`preview did not become ready at ${baseUrl}`);
}

async function stopPreview(child) {
  if (child.exitCode !== null || !child.pid) {
    return;
  }
  try {
    if (detached) {
      process.kill(-child.pid, 'SIGTERM');
    } else {
      child.kill('SIGTERM');
    }
  } catch {
    child.kill('SIGTERM');
  }
  const exited = await Promise.race([
    waitForExit(child).then(() => true),
    sleep(5_000).then(() => false)
  ]);
  if (exited || child.exitCode !== null) {
    return;
  }
  try {
    if (detached) {
      process.kill(-child.pid, 'SIGKILL');
    } else {
      child.kill('SIGKILL');
    }
  } catch {
    child.kill('SIGKILL');
  }
}

function maximumActuals(runs) {
  const fields = new Set(runs.flatMap((run) => Object.keys(run.actual ?? {})));
  return Object.fromEntries([...fields].flatMap((field) => {
    const values = runs.flatMap((run) => (
      Number.isFinite(run.actual?.[field]) ? [run.actual[field]] : []
    ));
    return values.length > 0 ? [[field, Math.max(...values)]] : [];
  }));
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function readRunReport(file) {
  const output = await readFile(file, 'utf8');
  return JSON.parse(output);
}

const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'r5-process-memory-'));

const preview = spawnPackageManager([
  '-C',
  'app',
  'preview',
  '--host',
  host,
  '--port',
  port,
  '--strictPort'
]);

try {
  await waitForPreview(preview);
  const runs = [];
  for (let index = 0; index < R5_REQUIRED_MEMORY_RUNS; index += 1) {
    const runOutputPath = path.join(temporaryDirectory, `run-${index + 1}.json`);
    process.stdout.write(`memory qualification run ${index + 1}/${R5_REQUIRED_MEMORY_RUNS}\n`);
    const profile = spawn(process.execPath, [profileScript], {
      cwd: repoDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        R5_BASE_URL: baseUrl,
        R5_MEMORY_OUTPUT_PATH: runOutputPath,
        // Release qualification must leave the immutable source tree clean for finalization.
        R5_MEMORY_ARCHIVE_PATH: '',
        R5_RELEASE_MANIFEST_PATH: 'dist/r5-release-manifest.json',
        R5_REQUIRE_MEMORY_IDENTITY: '1'
      }
    });
    const result = await waitForExit(profile);
    if (result.signal) {
      throw new Error(`process memory profile was terminated by ${result.signal}`);
    }
    if (result.code !== 0) {
      throw new Error(`process memory profile exited with code ${result.code}`);
    }
    runs.push(await readRunReport(runOutputPath));
  }

  const identity = runs[0]?.identity ?? null;
  const budgets = runs[0]?.budgets ?? null;
  const runIds = new Set(runs.map((run) => run.runId));
  const pass = runs.length === R5_REQUIRED_MEMORY_RUNS
    && runIds.size === R5_REQUIRED_MEMORY_RUNS
    && runs.every((run) => (
      run.pass === true
      && memoryIdentitiesMatch(identity, run.identity)
      && sameValue(environment, run.environment)
      && sameValue(budgets, run.budgets)
    ));
  const qualification = {
    schemaVersion: R5_PROCESS_MEMORY_SCHEMA_VERSION,
    kind: R5_PROCESS_MEMORY_QUALIFICATION_KIND,
    generatedAt: new Date().toISOString(),
    identity,
    environment,
    requiredRunCount: R5_REQUIRED_MEMORY_RUNS,
    completedRunCount: runs.length,
    budgets,
    actual: maximumActuals(runs),
    pass,
    runs
  };
  const validation = validateProcessMemoryQualification(qualification);
  const output = `${JSON.stringify({ ...qualification, validation }, null, 2)}\n`;
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, output, 'utf8');
  process.stdout.write(`${JSON.stringify({
    outputPath,
    identity,
    environment,
    requiredRunCount: R5_REQUIRED_MEMORY_RUNS,
    completedRunCount: runs.length,
    actual: qualification.actual,
    pass,
    validation
  })}\n`);
  if (!validation.valid) {
    throw new Error(`process memory qualification failed: ${validation.reasons.join('; ')}`);
  }
} finally {
  await stopPreview(preview);
  await rm(temporaryDirectory, { recursive: true, force: true });
}
