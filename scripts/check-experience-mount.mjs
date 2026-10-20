#!/usr/bin/env node
// Read-only HTTP checks for the routing overlay, not a new R5 qualification.
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {BASE_ENTRY, BASE_ENTRY_SHA, BASE_MANIFEST_SHA, MOUNT_ID, sha256} from './prepare-experience-mount.mjs';

const [origin, overlayDirectory, baseDirectory, reportFile] = process.argv.slice(2);
assert(origin && overlayDirectory && baseDirectory && reportFile,
  'usage: check-experience-mount.mjs <origin> <overlay-directory> <qualified-site> <report-file>');
const publicOrigin = origin === 'https://tongye.me';
const manifest = JSON.parse(await readFile(path.join(overlayDirectory, 'mount-manifest.json')));
assert.equal(manifest.mountId, MOUNT_ID, 'check the intended mount transaction');
const donor = JSON.parse(await readFile(path.join(baseDirectory, 'r5-release-manifest.json')));
const overrides = new Map(manifest.files.map(item => [item.path, item]));
const checks = [];
async function check(label, pathname, expected) {
  const response = await fetch(new URL(pathname, origin), {redirect:'manual', signal:AbortSignal.timeout(15000), ...expected.options});
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(response.status, expected.status ?? 200, `${label}: status`);
  if (expected.location) assert.equal(new URL(response.headers.get('location'), origin).href, new URL(expected.location, origin).href, `${label}: redirect`);
  if (expected.type) assert(response.headers.get('content-type')?.includes(expected.type), `${label}: MIME`);
  if (expected.hash) assert.equal(sha256(bytes), expected.hash, `${label}: frozen bytes`);
  if (expected.test) expected.test(bytes, response.headers);
  checks.push({label, url:new URL(pathname,origin).href, status:response.status, bytes:bytes.length,
    sha256:sha256(bytes), location:response.headers.get('location'), contentType:response.headers.get('content-type')});
}
await check('temporary root redirect keeps query', '/?from=route-check', {status:302,location:'/experience/?from=route-check'});
await check('legacy index redirect', '/index.html', {status:302,location:'/experience/'});
await check('canonical mount slash', '/experience?from=route-check', {status:301,location:'/experience/?from=route-check'});
await check('canonical mount index', '/experience/index.html', {status:301,location:'/experience/'});
await check('canonical Brand URL', '/experience/brand-lab/', {status:301,location:'/experience/brand-lab'});
await check('mounted HTML', '/experience/', {type:'text/html',hash:overrides.get('index.html').sha256,
  test:(bytes, headers)=>{
    const html=bytes.toString();
    assert(html.includes('src="/experience/'+BASE_ENTRY+'"'));
    assert(!html.includes('src="/assets/'));
    assert(html.includes('<noscript>') && html.includes('data-static-story-content="true"'));
    if(publicOrigin){assert.equal(headers.get('x-tongye-experience-mount'),MOUNT_ID);assert(headers.get('cache-control').includes('no-cache'));}
  }});
await check('Brand mounted HTML', '/experience/brand-lab', {type:'text/html',hash:overrides.get('index.html').sha256});
await check('pinned recovery manifest', '/experience/r5-release-manifest.json', {type:'application/json',hash:BASE_MANIFEST_SHA});
await check('mount provenance', '/experience/mount-manifest.json', {type:'application/json',hash:sha256(await readFile(path.join(overlayDirectory,'mount-manifest.json')))});
for(const filename of ['manifest.webmanifest','manifest.json','site.webmanifest']){
  await check('scoped '+filename, '/experience/'+filename, {hash:overrides.get(filename).sha256,
    test:bytes=>{const value=JSON.parse(bytes);assert.equal(value.start_url,'/experience/');assert.equal(value.scope,'/experience/');}});
}
const files=donor.files.filter(item=>/^assets\/.*\.(?:js|css)$/.test(item.path));
let next=0;
await Promise.all(Array.from({length:4},async()=>{while(next<files.length){const file=files[next++];await check('module '+file.path,'/experience/'+file.path,{type:file.path.endsWith('.js')?'javascript':'text/css',hash:(overrides.get(file.path)??file).sha256});}}));
for(const pathname of ['/services/','/faq/'])await check('preserved '+pathname,pathname,{type:'text/html',hash:sha256(await readFile(path.join(baseDirectory,pathname.slice(1),'index.html')))});
for(const pathname of ['/experience/not-a-route','/experience/assets/not-a-file.js','/harness/not-public'])await check('real 404 '+pathname,pathname,{status:404});
await check('original entry remains immutable','/'+BASE_ENTRY,{hash:BASE_ENTRY_SHA});
if(publicOrigin){
  await check('www retains mount URL','https://www.tongye.me/experience/',{status:301,location:'/experience/'});
  await check('HTTP upgrades without dropping path','http://tongye.me/experience/',{status:301,location:'/experience/'});
  await check('preview is not redirected to public archive','/',{options:{headers:{Cookie:'tongye_preview=r5-smooth-20261001-01'}},type:'text/html',test:(_bytes,headers)=>assert.equal(headers.get('x-robots-tag'),'noindex, nofollow')});
  await check('archive ignores preview cookie','/experience/',{options:{headers:{Cookie:'tongye_preview=r5-smooth-20261001-01'}},hash:overrides.get('index.html').sha256});
  const video=donor.files.find(item=>/\/figure1-[^/]+\.webm$/.test(item.path));
  assert(video,'frozen Hero video inventory');
  await check('original CDN video Range','https://media.tongye.me/releases/r5-ef69e06/'+video.path,{options:{headers:{Range:'bytes=0-1023'}},status:206,test:(bytes,headers)=>{assert.equal(bytes.length,1024);assert.match(headers.get('content-range'),/^bytes 0-1023\//);assert.equal(headers.get('access-control-allow-origin'),'*');}});
}
const report={mountId:MOUNT_ID,origin,completedAt:new Date().toISOString(),status:'passed',scope:'HTTP routing and frozen-asset checks; not a new application/performance qualification',checks};
await writeFile(reportFile,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,mountId:MOUNT_ID,checks:checks.length,modules:files.length,report:reportFile}));
