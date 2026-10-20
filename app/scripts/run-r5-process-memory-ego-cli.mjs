import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateEgoFrozenManifest, validateEgoMemoryOptions } from './run-r5-process-memory-ego.mjs';
import { validateProcessMemoryQualification } from './r5-process-memory-contract.mjs';
import { releaseBasePath } from './release-paths.mjs';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const taskSpaceId = Number(process.env.R5_EGO_TASK_SPACE_ID);
const pageLabel = process.env.R5_EGO_PAGE_LABEL;
const host = process.env.R5_PREVIEW_HOST ?? '127.0.0.1';
const port = process.env.R5_PREVIEW_PORT ?? '4173';
if (!['127.0.0.1', 'localhost'].includes(host) || !/^[1-9]\d{0,4}$/.test(port) || Number(port) > 65535) {
  throw new Error('Formal Ego preview must stay on an explicit loopback port');
}
const baseURL = `http://${host}:${port}${releaseBasePath()}`;
// Validate before creating a preview, TaskSpace or evidence directory.
validateEgoMemoryOptions({ taskSpaceId, pageLabel, baseURL, outputDirectory: '/tmp/tongye-ego-memory-preflight' });
validateEgoFrozenManifest(JSON.parse(await readFile(path.join(repo, 'dist/r5-release-manifest.json'), 'utf8')));
const directory = await mkdtemp(path.join(tmpdir(), 'tongye-ego-memory-'));
const options = { taskSpaceId, pageLabel, baseURL, outputDirectory: path.join(directory, 'evidence') };
const script = path.join(directory, 'round-qualification.mjs');
const moduleURL = new URL('./run-r5-process-memory-ego.mjs', import.meta.url).href;
await writeFile(script, `const {runEgoMemoryQualification}=await import(${JSON.stringify(moduleURL)});\nconst report=await runEgoMemoryQualification(${JSON.stringify(options)});\nconsole.log(JSON.stringify({pass:report.pass,validation:report.validation,completedRunCount:report.completedRunCount,evidenceDirectory:${JSON.stringify(options.outputDirectory)}}));\nif(!report.validation.valid)process.exitCode=1;\n`, { flag: 'wx' });
const detached = process.platform !== 'win32';
const manager = process.env.npm_execpath;
const preview = manager
  ? spawn(process.execPath, [manager, '-C', 'app', 'preview', '--host', host, '--port', port, '--strictPort'], { cwd: repo, stdio: 'inherit', detached })
  : spawn('pnpm', ['-C', 'app', 'preview', '--host', host, '--port', port, '--strictPort'], { cwd: repo, stdio: 'inherit', detached });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const exit = child => new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal })); });
let previewError;
preview.on('error', error => { previewError = error; });
try {
  const deadline = Date.now() + 30000;
  let ready = false;
  while (Date.now() < deadline) {
    if (previewError) throw previewError;
    if (preview.exitCode !== null) throw new Error('Owned preview exited before readiness');
    try { const response = await fetch(baseURL, { signal: AbortSignal.timeout(1000) }); await response.body?.cancel(); ready = response.ok; } catch { /* starting */ }
    if (ready) break;
    await sleep(250);
  }
  if (!ready) throw new Error('Owned preview did not meet the original 30-second readiness deadline');
  const child = spawn('ego-browser', ['nodejs', '-e', `await import(${JSON.stringify(pathToFileURL(script).href)})`], { stdio: 'inherit' });
  const result = await exit(child);
  if (result.signal || result.code !== 0) throw new Error(`Formal Ego memory did not pass; code=${result.code}; signal=${result.signal}; evidence=${directory}`);
  const report = JSON.parse(await readFile(path.join(repo, 'dist/r5-process-memory.json'), 'utf8'));
  const validation = validateProcessMemoryQualification(report);
  if (!validation.valid) throw new Error('Formal Ego memory evidence is invalid: ' + validation.reasons.join('; '));
} finally {
  if (preview.pid && preview.exitCode === null) {
    const stopped = exit(preview);
    try { if (detached) process.kill(-preview.pid, 'SIGTERM'); else preview.kill('SIGTERM'); } catch { preview.kill('SIGTERM'); }
    if (!await Promise.race([stopped.then(() => true), sleep(5000).then(() => false)])) {
      try { if (detached) process.kill(-preview.pid, 'SIGKILL'); else preview.kill('SIGKILL'); } catch { preview.kill('SIGKILL'); }
      await stopped;
    }
  }
  // Keep both raw runs, the generated round and any failure evidence. Never
  // remove the caller's browser, unrelated tabs or a previous qualification.
}
