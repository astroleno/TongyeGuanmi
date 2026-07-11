import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoDir = path.dirname(appDir);
const distDir = path.join(repoDir, 'dist');
const indexPath = path.join(distDir, 'index.html');
const copyPath = path.join(repoDir, 'docs/react-refactor/inventory/copy-reference.json');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function decodeHtml(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&nbsp;', ' ');
}

function visibleText(html) {
  return decodeHtml(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--([\s\S]*?)-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function filesBelow(directory) {
  const entries = await readdir(directory);
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry);
    const info = await stat(target);
    if (info.isDirectory()) {
      files.push(...await filesBelow(target));
    } else {
      files.push(target);
    }
  }
  return files;
}

const [html, copy] = await Promise.all([
  readFile(indexPath, 'utf8'),
  readFile(copyPath, 'utf8').then(JSON.parse)
]);
const text = visibleText(html);

assert(html.includes('<title>同野观幂｜AI 转型与能力建设</title>'), 'release title is missing');
assert(
  html.includes('同野观幂是一家面向组织与个人能力建设的 AI 转型咨询公司'),
  'release description is missing'
);
assert(html.includes('<link rel="canonical" href="/">'), 'release canonical link is missing');
assert(html.includes('<html lang="zh-CN">'), 'release language is missing');
for (const anchor of ['home', 'method', 'services', 'education', 'contact']) {
  assert(html.includes(`href="#${anchor}"`), `static navigation is missing #${anchor}`);
  assert(html.includes(`id="${anchor}"`), `static content is missing #${anchor}`);
}

let checkedCopyItems = 0;
for (const section of copy.sections) {
  if (section.legacyOnly) {
    continue;
  }
  for (const item of section.normalizedText) {
    assert(text.includes(item.replace(/\s+/g, ' ')), `static HTML lost copy: ${item}`);
    checkedCopyItems += 1;
  }
}

for (const forbidden of [
  'React R0 Scaffold',
  'js/main.js',
  'homepage-snap-runtime',
  'legacyRuntime',
  'snapRuntime=0'
]) {
  assert(!html.includes(forbidden), `release HTML still references legacy/scaffold marker: ${forbidden}`);
}

const distFiles = await filesBelow(distDir);
const jsFiles = distFiles.filter((file) => file.endsWith('.js'));
assert(jsFiles.length > 0, 'release build emitted no JavaScript');
const jsText = (await Promise.all(jsFiles.map((file) => readFile(file, 'utf8')))).join('\n');
for (const forbidden of ['Group1Harness', '/harness/r4-g1', 'React R0 Scaffold']) {
  assert(!jsText.includes(forbidden), `production JavaScript contains harness/scaffold marker: ${forbidden}`);
}

process.stdout.write(`${JSON.stringify({
  index: path.relative(repoDir, indexPath),
  checkedCopyItems,
  jsFiles: jsFiles.length,
  staticSections: copy.sections.filter((section) => !section.legacyOnly).length
})}\n`);
