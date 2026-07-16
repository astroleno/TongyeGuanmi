#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function run(command, args, options = {}) {
  process.stdout.write(`+ ${command} ${args.join(' ')}\n`);
  execFileSync(command, args, {
    stdio: 'inherit',
    ...options
  });
}

function sshArgs(key, target, remoteCommand) {
  return [
    '-i', key,
    '-o', 'IdentitiesOnly=yes',
    target,
    remoteCommand
  ];
}

async function publicSmoke(releaseId, sourceCommit) {
  const releaseResponse = await fetch('https://tongye.me/release-id.txt', {
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000)
  });
  if (releaseResponse.status !== 200 || (await releaseResponse.text()).trim() !== releaseId) {
    throw new Error('public release-id.txt does not match the promoted release');
  }
  const manifestResponse = await fetch('https://tongye.me/r5-release-manifest.json', {
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000)
  });
  if (manifestResponse.status !== 200) {
    throw new Error(`public release manifest returned ${manifestResponse.status}`);
  }
  const manifest = await manifestResponse.json();
  if (
    manifest.sourceCommit !== sourceCommit
    || manifest.qualification?.status !== 'qualified'
  ) {
    throw new Error('public release manifest identity or qualification is invalid');
  }
  const homepage = await fetch('https://tongye.me/', {
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000)
  });
  const html = await homepage.text();
  if (homepage.status !== 200 || !html.includes('同野观幂')) {
    throw new Error(`public homepage failed with ${homepage.status}`);
  }
  const www = await fetch('https://www.tongye.me/', {
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000)
  });
  if (![301, 302, 307, 308].includes(www.status)) {
    throw new Error(`www redirect returned ${www.status}`);
  }
  if (www.headers.get('location') !== 'https://tongye.me/') {
    throw new Error(`www redirect returned ${www.headers.get('location')}`);
  }
}

const packageArgument = argument('--package');
if (!packageArgument) {
  throw new Error('usage: node scripts/deploy-r5-release.mjs --package <directory>');
}
const packageRoot = path.resolve(packageArgument);
const deployManifest = JSON.parse(
  await readFile(path.join(packageRoot, 'release-deploy-manifest.json'), 'utf8')
);
if (
  deployManifest.schemaVersion !== 1
  || !/^[a-z0-9][a-z0-9._-]{2,79}$/.test(deployManifest.releaseId)
) {
  throw new Error('release package manifest is invalid');
}

const sshTarget = process.env.TONGYE_SSH_TARGET?.trim() || 'codex_audit@47.103.120.24';
const sshKey = path.resolve(
  (process.env.TONGYE_SSH_KEY?.trim() || '~/.ssh/codex_tongyeguanmi_audit_20260713')
    .replace(/^~(?=\/)/, homedir())
);
const releaseId = deployManifest.releaseId;
const remoteTemp = `/tmp/tongye-release-${releaseId}`;
const siteRoot = '/www/wwwroot/tongye.me';
const releaseRoot = `${siteRoot}/releases/${releaseId}`;
const uploader = path.resolve('scripts/upload-cos-release.py');
const cdnVerifier = path.resolve('app/scripts/verify-cdn-release.mjs');
const sshTransport = `ssh -i ${sshKey} -o IdentitiesOnly=yes`;

run('ssh', sshArgs(
  sshKey,
  sshTarget,
  `rm -rf ${remoteTemp} && install -d -m 700 ${remoteTemp}`
));
run('rsync', [
  '-az', '--delete',
  '-e', sshTransport,
  `${packageRoot}/`,
  `${sshTarget}:${remoteTemp}/`
]);
run('scp', [
  '-i', sshKey,
  '-o', 'IdentitiesOnly=yes',
  uploader,
  `${sshTarget}:${remoteTemp}/upload-cos-release.py`
]);
run('ssh', sshArgs(
  sshKey,
  sshTarget,
  [
    'sudo bash -c',
    JSON.stringify([
      'set -a',
      '. /etc/tongye-cdn-cert/secrets.env',
      '. /etc/tongye-release.env',
      'set +a',
      `PYTHONPATH=/opt/tongye-release/python python3 ${remoteTemp}/upload-cos-release.py ${remoteTemp}`
    ].join('; '))
  ].join(' ')
));

run(process.execPath, [cdnVerifier], {
  env: {
    ...process.env,
    R5_CDN_MANIFEST_PATH: path.join(packageRoot, 'site/cdn-publish-manifest.json'),
    R5_SITE_ORIGIN: 'https://tongye.me'
  }
});

run('ssh', sshArgs(
  sshKey,
  sshTarget,
  [
    'set -eu',
    `sudo install -d -m 755 ${siteRoot}/releases`,
    `sudo test ! -e ${releaseRoot}`,
    `sudo rm -rf ${releaseRoot}.staging`,
    `sudo install -d -m 755 ${releaseRoot}.staging`,
    `sudo rsync -a --delete ${remoteTemp}/site/ ${releaseRoot}.staging/`,
    `sudo chown -R www:www ${releaseRoot}.staging`,
    `sudo mv ${releaseRoot}.staging ${releaseRoot}`,
    `readlink -f ${siteRoot}/current > ${remoteTemp}/previous-release.txt || :`,
    'sudo nginx -t',
    `sudo ln -sfn ${releaseRoot} ${siteRoot}/.current-${releaseId}`,
    `sudo mv -Tf ${siteRoot}/.current-${releaseId} ${siteRoot}/current`,
    'sudo systemctl reload nginx'
  ].join('; ')
));

try {
  await publicSmoke(releaseId, deployManifest.sourceCommit);
} catch (error) {
  run('ssh', sshArgs(
    sshKey,
    sshTarget,
    [
      'set -eu',
      `previous=$(cat ${remoteTemp}/previous-release.txt 2>/dev/null || true)`,
      `if [ -n "$previous" ] && [ -d "$previous" ]; then sudo ln -sfn "$previous" ${siteRoot}/.current-rollback; sudo mv -Tf ${siteRoot}/.current-rollback ${siteRoot}/current; else sudo rm -f ${siteRoot}/current; fi`,
      'sudo nginx -t',
      'sudo systemctl reload nginx'
    ].join('; ')
  ));
  throw error;
}

run('ssh', sshArgs(sshKey, sshTarget, `rm -rf ${remoteTemp}`));
process.stdout.write(`${JSON.stringify({
  releaseId,
  sourceCommit: deployManifest.sourceCommit,
  candidate: deployManifest.candidate,
  site: 'https://tongye.me/',
  pass: true
})}\n`);
