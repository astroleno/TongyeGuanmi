import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { adaptAsset, adaptEntry, adaptHtml, adaptWebManifest, BASE_ENTRY } from './prepare-experience-mount.mjs';

const original = 'function A(e){return"/"===e||"/index.html"===e?"formal":"/brand-lab"===e?"brand-lab":(e.startsWith("/harness/"),"not-found")}';

test('admits only the mounted homepage and Brand routes without changing the original routes', () => {
  const old = vm.runInNewContext(`(${original})`), mounted = vm.runInNewContext(`(${adaptEntry(original)})`);
  assert.equal(old('/experience/'), 'not-found');
  for (const pathname of ['/', '/index.html', '/brand-lab', '/harness/test', '/missing']) assert.equal(mounted(pathname), old(pathname));
  for (const pathname of ['/experience/', '/experience/index.html']) assert.equal(mounted(pathname), 'formal');
  assert.equal(mounted('/experience/brand-lab'), 'brand-lab');
  for (const pathname of ['/experience/not-found', '/experienceevil/', '/experience//', '/experience/brand-lab/extra']) assert.equal(mounted(pathname), 'not-found');
});

test('rejects a missing or duplicate classifier instead of guessing at a different build', () => {
  assert.throws(() => adaptEntry('function B(){}'));
  assert.throws(() => adaptEntry(original + original));
});

test('retains the module/export graph, CDN release IDs and animation code', () => {
  const tail = ';import("./PhoneStoryShell-C8rhFtx.js");const shader="time*3.5";export{n as _,k as r};';
  const result = adaptAsset(BASE_ENTRY, original + tail);
  assert(result.endsWith(tail));
  assert.equal(adaptAsset('assets/scene.js', 'const image="https://assets.tongye.me/releases/r5-ef69e06/assets/a.webp";const p=0.5;'), 'const image="https://assets.tongye.me/releases/r5-ef69e06/assets/a.webp";const p=0.5;');
});

test('keeps phone Brand classification and recovery inside the archive after the new homepage replaces root', () => {
  assert.equal(adaptAsset('assets/PhoneStoryShell.js', 'const scope="/brand-lab"===p;'), 'const scope="/experience/brand-lab"===p;');
  assert.equal(adaptAsset('assets/recovery.js', 'fetch("/r5-release-manifest.json")'), 'fetch("/experience/r5-release-manifest.json")');
  assert.equal(adaptAsset('assets/menu.js', 'const href="/#contact",asset="/assets/a.js";'), 'const href="/experience/#contact",asset="/experience/assets/a.js";');
});

test('mounts HTML while retaining the donor CDN URLs and phone first-art preload', () => {
  const source = `<link rel="canonical" href="https://tongye.me/">
    <script type="application/ld+json">{"@graph":[{"@type":"Organization","url":"https://tongye.me/"},{"@type":"WebPage","url":"https://tongye.me/"}]}</script>
    <script src="/assets/index-CexTKEg.js"></script>
    <script>const media="https://media.tongye.me/releases/r5-ef69e06/assets/";
    const phone=location.pathname === '/brand-lab';
    if(location.pathname === '/') firstArt.media='all';</script>`;
  const result = adaptHtml(source);
  assert(result.includes('src="/experience/assets/index-CexTKEg.js"'));
  assert(result.includes('href="https://tongye.me/experience/"'));
  assert(result.includes('location.pathname === \'/experience/\''));
  assert(result.includes('location.pathname === \'/experience/brand-lab\''));
  assert(result.includes('https://media.tongye.me/releases/r5-ef69e06/assets/'));
  assert(!result.includes('src="/assets/'));
  assert(result.includes('"@type":"WebPage","url":"https://tongye.me/experience/"'));
  assert(result.includes('"@type":"Organization","url":"https://tongye.me/"'));
});

test('web-app icons, scope and launch URL remain inside the legacy route', () => {
  const result = JSON.parse(adaptWebManifest('{"start_url":"/","icons":[{"src":"/icon-512.png"}]}'));
  assert.equal(result.start_url, '/experience/');
  assert.equal(result.scope, '/experience/');
  assert.equal(result.icons[0].src, '/experience/icon-512.png');
});
