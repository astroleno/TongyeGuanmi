#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BASE_RELEASE = 'r5-ef69e06';
export const BASE_COMMIT = 'ef69e06a3c9f6e6624c7beb0acf903afae55e32e';
export const BASE_MANIFEST_SHA = '46609b35907e855e6be6bd8763a9a9b589be1910801e5cd106e537cd3aa67c4f';
export const BASE_ENTRY = 'assets/index-CexTKEg.js';
export const BASE_ENTRY_SHA = 'aa327b78ccacf92838f5ad53097a37cd54bf76eca164612126c91b99fab96692';
export const BASE_HTML_SHA = 'fc904f6e1f7a23f1fa1238e6049f94a032f647dad00e49dd6401697d17d97fa7';
export const MOUNT_ID = 'experience-v55-20261019-02';
export const PREFIX = '/experience/';
export const sha256 = value => createHash('sha256').update(value).digest('hex');

export function adaptEntry(source) {
  const pattern = /function ([\w$]+)\(([\w$]+)\)\{return"\/"===\2\|\|"\/index\.html"===\2\?"formal"/g;
  const matches = [...source.matchAll(pattern)];
  assert.equal(matches.length, 1, 'the pinned v55 route classifier must occur exactly once');
  const [, , parameter] = matches[0];
  const normalizer = `${parameter}=${parameter}==="/experience/"||${parameter}==="/experience/index.html"?"/":${parameter}==="/experience/brand-lab"?"/brand-lab":${parameter};`;
  return source.replace(pattern, match => match.replace('{return', `{${normalizer}return`));
}

export function adaptAsset(filename, source) {
  let next = filename === BASE_ENTRY ? adaptEntry(source) : source;
  // Retain the old React/export graph: relative module imports keep the same
  // filenames, but every module is served within the pinned archive namespace.
  if (filename !== BASE_ENTRY) next = next.replaceAll('"/brand-lab', '"/experience/brand-lab');
  next = next.replaceAll('"/r5-release-manifest.json"', '"/experience/r5-release-manifest.json"');
  next = next.replaceAll('"/assets/', '"/experience/assets/');
  next = next.replaceAll('"/#', '"/experience/#');
  return next;
}

export function adaptHtml(source) {
  assert.equal(source.split('src="/assets/index-CexTKEg.js"').length - 1, 1);
  assert.equal(source.split('location.pathname === \'/\'').length - 1, 1);
  return source
    .replaceAll('src="/assets/', 'src="/experience/assets/')
    .replaceAll('href="/assets/', 'href="/experience/assets/')
    .replaceAll('href="/#', 'href="/experience/#')
    .replace('location.pathname === \'/brand-lab\'', 'location.pathname === \'/experience/brand-lab\'')
    .replace('location.pathname === \'/\'', 'location.pathname === \'/experience/\'')
    .replace('<link rel="canonical" href="https://tongye.me/">', '<link rel="canonical" href="https://tongye.me/experience/">')
    .replace('<meta property="og:url" content="https://tongye.me/">', '<meta property="og:url" content="https://tongye.me/experience/">')
    .replace(/<script type="application\/ld\+json">(.*?)<\/script>/g, (_, content) => {
      const structured = JSON.parse(content);
      for (const entity of structured['@graph'] ?? []) if (entity['@type'] === 'WebPage') {
        entity['@id'] = 'https://tongye.me/experience/#webpage';
        entity.url = 'https://tongye.me/experience/';
      }
      return `<script type="application/ld+json">${JSON.stringify(structured)}</script>`;
    })
    .replace(/href="\/(favicon\.[^"]+|apple-touch-icon\.png|icon-\d+\.png|manifest(?:\.webmanifest|\.json)|site\.webmanifest)"/g, 'href="/experience/$1"');
}

export function adaptWebManifest(source) {
  const manifest = JSON.parse(source);
  manifest.start_url = PREFIX;
  manifest.scope = PREFIX;
  for (const icon of manifest.icons ?? []) if (icon.src?.startsWith('/')) icon.src = `/experience${icon.src}`;
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export async function prepare(sourceDirectory, outputDirectory) {
  const source = path.resolve(sourceDirectory), output = path.resolve(outputDirectory);
  assert(!output.startsWith(`${source}/`) && output !== source, 'never edit the immutable donor');
  const baseBytes = await readFile(path.join(source, 'r5-release-manifest.json'));
  assert.equal(sha256(baseBytes), BASE_MANIFEST_SHA, 'unexpected donor manifest');
  const base = JSON.parse(baseBytes);
  assert.equal(base.sourceCommit, BASE_COMMIT);
  assert.equal(base.qualification?.status, 'qualified');
  const deployment = JSON.parse(await readFile(path.join(source, '..', 'release-deploy-manifest.json')));
  assert.equal(deployment.releaseId, BASE_RELEASE);
  assert.equal(deployment.releaseManifestSha256, BASE_MANIFEST_SHA);
  for (const file of base.files) {
    assert(!path.isAbsolute(file.path) && !file.path.split('/').includes('..'));
    let bytes;
    try { bytes = await readFile(path.join(source, file.path)); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      // Qualified deploy packages deliberately keep CDN media outside site/.
      // A missing site file is valid only when its exact declared CDN donor
      // is present and still has the original frozen hash and byte count.
      const cdn = deployment.cdnFiles.find(item => item.sourcePath === file.path && item.sha256 === file.sha256);
      assert(cdn && cdn.packagePath.startsWith('cdn/') && !cdn.packagePath.split('/').includes('..'), `missing declared donor: ${file.path}`);
      bytes = await readFile(path.join(source, '..', cdn.packagePath));
    }
    assert.equal(bytes.length, file.bytes, `donor size: ${file.path}`);
    assert.equal(sha256(bytes), file.sha256, `donor identity: ${file.path}`);
  }
  assert.equal(sha256(await readFile(path.join(source, BASE_ENTRY))), BASE_ENTRY_SHA);
  const outputs = new Map();
  const overrides = [];
  for (const name of (await readdir(path.join(source, 'assets'))).filter(name => name.endsWith('.js'))) {
    const filename = `assets/${name}`, old = await readFile(path.join(source, filename), 'utf8');
    const next = adaptAsset(filename, old);
    if (next !== old) {
      outputs.set(filename, next);
      overrides.push({ path: filename, baseSha256: sha256(old), sha256: sha256(next), bytes: Buffer.byteLength(next) });
    }
  }
  assert(overrides.some(file => file.path === BASE_ENTRY));
  assert(overrides.some(file => file.path.startsWith('assets/presentation-shell-loaders-')));
  const html = await readFile(path.join(source, 'index.html'), 'utf8');
  assert.equal(sha256(html), BASE_HTML_SHA);
  outputs.set('index.html', adaptHtml(html));
  for (const name of ['manifest.webmanifest', 'manifest.json', 'site.webmanifest']) {
    outputs.set(name, adaptWebManifest(await readFile(path.join(source, name), 'utf8')));
  }
  const files = [...outputs].map(([filename, content]) => ({ path: filename, sha256: sha256(content), bytes: Buffer.byteLength(content) }));
  const manifest = {
    schemaVersion: 1, mountId: MOUNT_ID, prefix: PREFIX,
    baseRelease: BASE_RELEASE, baseSourceCommit: BASE_COMMIT, baseManifestSha256: BASE_MANIFEST_SHA,
    baseArtifactTreeSha256: base.artifactTreeSha256,
    qualificationScope: 'The original R5 qualification describes the immutable donor, not this routing adapter. This is not a new R5 candidate or a main-branch application deployment.',
    baseManifestUrl: '/experience/r5-release-manifest.json',
    adaptations: ['route classifier and phone preboot pathname', 'phone Brand entry scope', 'pinned phone recovery manifest URL', 'HTML asset, canonical and web-app manifest paths'],
    assetOverrides: overrides, files
  };
  // Create a new staging directory only; overwriting an earlier mount is forbidden.
  await mkdir(output);
  await mkdir(path.join(output, 'assets'));
  for (const [filename, content] of outputs) await writeFile(path.join(output, filename), content, { flag: 'wx' });
  await writeFile(path.join(output, 'mount-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 4, 'usage: prepare-experience-mount.mjs <qualified-v55-site> <new-output-directory>');
  const result = await prepare(process.argv[2], process.argv[3]);
  console.log(JSON.stringify({ mount: result.mountId, base: result.baseRelease, files: result.files.length, overrides: result.assetOverrides.map(file => file.path) }));
}
