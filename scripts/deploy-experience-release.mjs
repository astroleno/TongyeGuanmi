import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateProcessMemoryQualification } from '../app/scripts/r5-process-memory-contract.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
function argument(flag) {
  const index = process.argv.indexOf(flag);
  return index < 0 ? undefined : process.argv[index + 1];
}
function run(file, args, options = {}) {
  return execFileSync(file, args, { stdio: 'inherit', ...options });
}
function quote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}
const packageArgument = argument('--package');
const vhostSha = argument('--expected-vhost-sha');
const includeSha = argument('--expected-include-sha');
const directAuthorizationSha = argument('--user-directed-authorization-sha');
const cdnTransport = argument('--cdn-transport') ?? 'fetch';
if (!['fetch', 'curl'].includes(cdnTransport)) throw new Error('invalid CDN verification transport');
if (directAuthorizationSha !== undefined && !/^[0-9a-f]{64}$/.test(directAuthorizationSha)) throw new Error('invalid explicit user-directed authorization SHA');
const directArgs = directAuthorizationSha ? ['--user-directed-authorization-sha', directAuthorizationSha] : [];
if (!packageArgument || ![vhostSha, includeSha].every((value) => /^[0-9a-f]{64}$/.test(value ?? ''))) {
  throw new Error('usage: node scripts/deploy-experience-release.mjs --package <directory> --expected-vhost-sha <sha256> --expected-include-sha <sha256> [--check]');
}
const packageRoot = path.resolve(packageArgument);
const transaction = path.join(repo, 'scripts/publish-experience-release.py');
// No transport, upload or production write before complete local preflight.
run('python3', [transaction, 'validate', '--package', packageRoot, ...directArgs]);
const memory = JSON.parse(await readFile(path.join(packageRoot, 'site/r5-process-memory.json'), 'utf8'));
const qualification = validateProcessMemoryQualification(memory);
if (!directAuthorizationSha && !qualification.valid) throw new Error(`invalid frozen memory qualification: ${qualification.reasons.join('; ')}`);
const deploy = JSON.parse(await readFile(path.join(packageRoot, 'release-deploy-manifest.json'), 'utf8'));
if (process.argv.includes('--check')) {
  process.stdout.write(`${JSON.stringify({ status: 'validated', releaseId: deploy.releaseId, published: false,
    publicationMode: deploy.publicationAuthorization?.mode ?? 'qualified' })}\n`);
  process.exit(0);
}
const target = process.env.TONGYE_SSH_TARGET?.trim() || 'codex_audit@47.103.120.24';
const key = path.resolve((process.env.TONGYE_SSH_KEY?.trim() || '~/.ssh/codex_tongyeguanmi_audit_20260713').replace(/^~(?=\/)/, homedir()));
if (target.startsWith('-') || /[\s\x00-\x1f]/.test(target)) throw new Error('invalid SSH target');
const sshOptions = ['-i', key, '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10'];
function ssh(command, options) { return run('ssh', [...sshOptions, target, command], options); }
const temporary = ssh(`mktemp -d /tmp/tongye-experience-${deploy.releaseId}-XXXXXX`, { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' }).trim();
if (!new RegExp(`^/tmp/tongye-experience-${deploy.releaseId.replaceAll('.', '\\.')}\-[A-Za-z0-9]{6}$`).test(temporary)) {
  throw new Error('unexpected remote staging directory');
}
run('rsync', ['-az', '-e', ['ssh', ...sshOptions].map(quote).join(' '), `${packageRoot}/`, `${target}:${temporary}/`]);
run('scp', [...sshOptions, transaction, path.join(repo, 'scripts/upload-cos-release.py'), `${target}:${temporary}/`]);
const remoteScript = `${temporary}/publish-experience-release.py`;
const receipt = `${temporary}/nginx-probe.json`;
const directCommand = directAuthorizationSha ? ` --user-directed-authorization-sha ${directAuthorizationSha}` : '';
const identityArgs = `--expected-vhost-sha ${vhostSha} --expected-include-sha ${includeSha}${directCommand}`;
ssh(`sudo -n python3 ${quote(remoteScript)} probe --package ${quote(temporary)} ${identityArgs} --probe-receipt ${quote(receipt)}`);
// Credentials stay on the release host; objects are immutable and checked by hash.
const upload = `set -eu; set -a; . /etc/tongye-cdn-cert/secrets.env; . /etc/tongye-release.env; set +a; PYTHONPATH=/opt/tongye-release/python python3 ${quote(temporary + '/upload-cos-release.py')} ${quote(temporary)}`;
ssh(`sudo -n bash -c ${quote(upload)}`);
run(process.execPath, [path.join(repo, 'app/scripts/verify-cdn-release.mjs'), `--transport=${cdnTransport}`], {
  env: { ...process.env, R5_CDN_MANIFEST_PATH: path.join(packageRoot, 'site/cdn-publish-manifest.json'), R5_SITE_ORIGIN: 'https://tongye.me' }
});
const token = randomUUID().replaceAll('-', '');
try {
  // A lost SSH reply can occur after the switch. Recover this invocation only,
  // never a pre-existing successful publication with the same release id.
  ssh(`sudo -n python3 ${quote(remoteScript)} apply --package ${quote(temporary)} ${identityArgs} --probe-receipt ${quote(receipt)} --transaction-token ${token}`);
  ssh(`sudo -n python3 ${quote(remoteScript)} verify --package ${quote(temporary)}${directCommand}`);
} catch (error) {
  try {
    ssh(`sudo -n python3 ${quote(remoteScript)} rollback --release-id ${quote(deploy.releaseId)} --transaction-token ${token}`);
  } catch (rollbackError) {
    throw new AggregateError([error, rollbackError], 'publication failed and recovery could not be confirmed; staging and receipts retained');
  }
  throw error;
}
// Retain this exact staging/transaction for explicit recovery; never rm a release.
process.stdout.write(`${JSON.stringify({ releaseId: deploy.releaseId, sourceCommit: deploy.sourceCommit,
  basePath: '/experience/', httpVerified: true, remoteStaging: temporary,
  publicationMode: deploy.publicationAuthorization?.mode ?? 'qualified' })}\n`);
