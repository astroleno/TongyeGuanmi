import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoDir = path.dirname(appDir);
const profileScript = path.join(appDir, 'scripts/profile-r5-process-memory.mjs');
const host = process.env.R5_PREVIEW_HOST ?? '127.0.0.1';
const port = process.env.R5_PREVIEW_PORT ?? '4173';
const baseUrl = `http://${host}:${port}`;
const detached = process.platform !== 'win32';

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
  const profile = spawn(process.execPath, [profileScript], {
    cwd: repoDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      R5_BASE_URL: baseUrl,
      R5_MEMORY_OUTPUT_PATH: 'dist/r5-process-memory.json',
      R5_MEMORY_ARCHIVE_PATH: 'artifacts/react-refactor/r5-parity-repair-candidate/r5-process-memory.json',
      R5_RELEASE_MANIFEST_PATH: 'dist/r5-release-manifest.json',
      R5_REQUIRE_MEMORY_IDENTITY: '1'
    }
  });
  const result = await waitForExit(profile);
  if (result.code !== 0) {
    throw new Error(
      `process memory profile failed with ${result.signal ?? `exit code ${result.code}`}`
    );
  }
} finally {
  await stopPreview(preview);
}
