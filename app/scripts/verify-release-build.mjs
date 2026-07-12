import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoDir = path.dirname(appDir);
const distDir = path.join(repoDir, 'dist');
const indexPath = path.join(distDir, 'index.html');
const copyPath = path.join(repoDir, 'docs/react-refactor/inventory/copy-reference.json');
const faviconSourcePath = path.join(repoDir, 'assets/favicon.svg');
const titleFontSourcePath = path.join(repoDir, 'assets/fonts/qiji-title-subset.ttf');

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

function attribute(tag, name) {
  return tag.match(new RegExp(`\\b${name}=["']([^"']+)["']`, 'i'))?.[1] ?? null;
}

function releaseLinkHref(html, predicate, label) {
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    if (predicate(tag)) {
      const href = attribute(tag, 'href');
      assert(href, `${label} link has no href`);
      return href;
    }
  }
  throw new Error(`${label} link is missing`);
}

function distPathFromHref(href, label) {
  assert(!href.startsWith('data:'), `${label} must not be an inline data URL`);
  const pathname = new URL(href, 'https://release.invalid/').pathname;
  const relativePath = decodeURIComponent(pathname).replace(/^\/+/, '');
  const target = path.resolve(distDir, relativePath);
  assert(target.startsWith(`${distDir}${path.sep}`), `${label} resolves outside dist`);
  return target;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
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
const faviconHref = releaseLinkHref(
  html,
  (tag) => attribute(tag, 'rel') === 'icon',
  'release favicon'
);
const titleFontHref = releaseLinkHref(
  html,
  (tag) => attribute(tag, 'rel') === 'preload' && attribute(tag, 'as') === 'font',
  'release title font preload'
);
const stylesheetHrefs = (html.match(/<link\b[^>]*>/gi) ?? [])
  .filter((tag) => attribute(tag, 'rel') === 'stylesheet')
  .map((tag) => attribute(tag, 'href'))
  .filter(Boolean);
assert(stylesheetHrefs.length > 0, 'release build emitted no initial stylesheet');
const initialScriptSrcs = (html.match(/<script\b[^>]*\bsrc=["'][^"']+["'][^>]*>/gi) ?? [])
  .map((tag) => attribute(tag, 'src'))
  .filter(Boolean);
assert(initialScriptSrcs.length === 1, 'release build must emit exactly one initial JavaScript entry');

const [faviconBytes, faviconSourceBytes, titleFontBytes, titleFontSourceBytes, ...stylesheets] = await Promise.all([
  readFile(distPathFromHref(faviconHref, 'release favicon')),
  readFile(faviconSourcePath),
  readFile(distPathFromHref(titleFontHref, 'release title font preload')),
  readFile(titleFontSourcePath),
  ...stylesheetHrefs.map((href) => readFile(distPathFromHref(href, 'release stylesheet'), 'utf8'))
]);
assert(faviconBytes.equals(faviconSourceBytes), 'emitted favicon bytes differ from assets/favicon.svg');
assert(titleFontBytes.equals(titleFontSourceBytes), 'emitted title font bytes differ from assets/fonts/qiji-title-subset.ttf');
const initialCss = stylesheets.join('\n');
for (const token of ['@font-face', '--font-title:', '--font-sans:', '--font-traditional:']) {
  assert(initialCss.includes(token), `initial stylesheet is missing ${token}`);
}
assert(!/font-family:\s*Inter\b/.test(initialCss), 'initial stylesheet restored Inter-first drift');
assert(
  /--r3-star-copy-opacity:\s*1(?:[;}])/.test(initialCss),
  'Star Map production copy opacity must remain fully opaque'
);
assert(
  /\.r3-star-map \.large-copy--standalone\{[^}]*color:(?:#f7edd7|rgb\(247(?:\s*,\s*|\s+)237(?:\s*,\s*|\s+)215\))/i.test(initialCss),
  'Star Map production copy must retain the canonical opaque text color'
);

assert(html.includes('<title>同野观幂｜AI 转型与能力建设</title>'), 'release title is missing');
assert(
  html.includes('同野观幂是一家面向组织与个人能力建设的 AI 转型咨询公司'),
  'release description is missing'
);
assert(html.includes('<link rel="canonical" href="/">'), 'release canonical link is missing');
assert(html.includes('<html lang="zh-CN">'), 'release language is missing');
assert(
  html.includes('data-loader-ink-fallback="true"'),
  'release HTML is missing the loader Ink CSS fallback contract'
);
assert(
  /<noscript>[\s\S]*?#story-loader-static[\s\S]*?<\/noscript>/i.test(html),
  'release HTML is missing the no-JavaScript loader escape'
);
assert((html.match(/data-site-footer="true"/g) ?? []).length === 1, 'release static footer must render exactly once');
for (const footerText of [
  '© 上海同野观幂科技有限公司',
  'AI Transformation & Capability Building',
  '服务备案号 沪ICP备2024086119号-3'
]) {
  assert(text.split(footerText).length === 2, `release static footer must contain ${footerText} exactly once`);
}
assert(html.includes('href="https://beian.miit.gov.cn/"'), 'release filing link is missing');
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
const loaderInkChunks = jsFiles.filter((file) => /^loader-ink-reveal-[^.]+\.js$/.test(path.basename(file)));
assert(loaderInkChunks.length === 1, 'release build must emit exactly one loader Ink lazy chunk');
const initialScriptPath = distPathFromHref(initialScriptSrcs[0], 'release initial script');
assert(
  initialScriptPath !== loaderInkChunks[0],
  'loader Ink renderer must not be the initial JavaScript entry'
);
const [initialJsText, loaderInkJsText, ...otherJsTexts] = await Promise.all([
  readFile(initialScriptPath, 'utf8'),
  readFile(loaderInkChunks[0], 'utf8'),
  ...jsFiles
    .filter((file) => file !== initialScriptPath && file !== loaderInkChunks[0])
    .map((file) => readFile(file, 'utf8'))
]);
for (const marker of ['uTextMask', 'poreInk', 'blobDrop']) {
  assert(loaderInkJsText.includes(marker), `loader Ink lazy chunk is missing ${marker}`);
  assert(!initialJsText.includes(marker), `initial JavaScript eagerly contains loader Ink marker ${marker}`);
}
const jsText = [initialJsText, loaderInkJsText, ...otherJsTexts].join('\n');
for (const forbidden of ['Group1Harness', '/harness/r4-g1', 'React R0 Scaffold']) {
  assert(!jsText.includes(forbidden), `production JavaScript contains harness/scaffold marker: ${forbidden}`);
}

process.stdout.write(`${JSON.stringify({
  index: path.relative(repoDir, indexPath),
  checkedCopyItems,
  jsFiles: jsFiles.length,
  loaderInkChunk: {
    path: path.relative(repoDir, loaderInkChunks[0]),
    bytes: Buffer.byteLength(loaderInkJsText)
  },
  staticSections: copy.sections.filter((section) => !section.legacyOnly).length,
  assets: {
    favicon: {
      path: path.relative(repoDir, distPathFromHref(faviconHref, 'release favicon')),
      bytes: faviconBytes.byteLength,
      sha256: sha256(faviconBytes)
    },
    titleFont: {
      path: path.relative(repoDir, distPathFromHref(titleFontHref, 'release title font preload')),
      bytes: titleFontBytes.byteLength,
      sha256: sha256(titleFontBytes)
    }
  }
})}\n`);
