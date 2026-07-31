import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const appDir = path.dirname(path.dirname(SCRIPT_PATH));
const repoDir = path.dirname(appDir);
const distDir = path.join(repoDir, 'dist');
const indexPath = path.join(distDir, 'index.html');
const copyPath = path.join(repoDir, 'docs/react-refactor/inventory/copy-reference.json');
const staticCopyOmissionsPath = path.join(appDir, 'build/static-copy-omissions.json');
const faviconSourcePath = path.join(repoDir, 'assets/favicon.svg');
const titleFontSourcePath = path.join(repoDir, 'assets/fonts/qiji-title-subset.ttf');
const releaseId = process.env.R5_RELEASE_ID?.trim() ?? '';
const requireCdn = process.env.R5_REQUIRE_CDN === '1';
const assetCdnOrigin = new URL(
  process.env.R5_ASSET_CDN_BASE?.trim() || 'https://assets.tongye.me'
).origin;
const mediaCdnOrigin = new URL(
  process.env.R5_MEDIA_CDN_BASE?.trim() || 'https://media.tongye.me'
).origin;

export const DONOR_MAX_LAZY_LEAF_BYTES = 55_259;

const phoneExecutionCoreNames = new Set([
  'PhoneStoryShell.tsx',
  'machine.ts',
  'manifest.ts',
  'presentation.ts',
  'protocol.ts',
  'runtime.ts'
]);

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function sameArray(left, right) {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function phoneStoryModule(moduleId) {
  return moduleId.includes('/src/production/phone-story/');
}

function phoneExecutionCoreModule(moduleId) {
  return phoneStoryModule(moduleId)
    && phoneExecutionCoreNames.has(path.posix.basename(moduleId));
}

function phoneLeafModule(moduleId) {
  return (
    moduleId.includes('/src/scenes/')
    && moduleId.includes('/phone/')
  ) || (
    moduleId.includes('/src/transitions/')
    && (
      moduleId.includes('/phone/')
      || /\/phone\.[cm]?[jt]sx?(?:\?|$)/.test(moduleId)
    )
  );
}

function lazyLifecycleOwner(moduleId) {
  return phoneExecutionCoreModule(moduleId)
    || [
      '/production/input-controller',
      '/production/phone/PhoneBrandLabStory',
      '/production/phone/PhoneLabContactShell',
      '/production/phone/PhoneStoryShell',
      '/production/phone/phone-loader-lifecycle',
      '/production/phone/phone-stage-timeline',
      '/production/phone/phone-transition-coordinator',
      '/production/portrait-spike/'
    ].some((marker) => moduleId.includes(marker));
}

export function moduleProvenanceViolations(
  provenance,
  {
    chunkBytes = new Map(),
    viteManifest
  } = {}
) {
  const violations = [];
  if (!provenance || typeof provenance !== 'object') {
    return ['r5 module provenance report is missing'];
  }
  if (provenance.schemaVersion !== 1) {
    violations.push(
      `r5 module provenance schemaVersion must be 1 `
        + `(received ${String(provenance.schemaVersion)})`
    );
  }
  if (!Array.isArray(provenance.chunks)) {
    violations.push('r5 module provenance chunks must be an array');
    return violations;
  }

  const chunks = provenance.chunks;
  const chunkByFile = new Map();
  for (const chunk of chunks) {
    if (
      !chunk
      || typeof chunk !== 'object'
      || typeof chunk.fileName !== 'string'
      || typeof chunk.isEntry !== 'boolean'
      || typeof chunk.isDynamicEntry !== 'boolean'
      || !(
        chunk.facadeModuleId === null
        || typeof chunk.facadeModuleId === 'string'
      )
      || !Array.isArray(chunk.imports)
      || !Array.isArray(chunk.dynamicImports)
      || !Array.isArray(chunk.modules)
      || ![
        ...chunk.imports,
        ...chunk.dynamicImports,
        ...chunk.modules
      ].every((value) => typeof value === 'string')
    ) {
      violations.push('r5 module provenance contains a malformed chunk');
      continue;
    }
    if (chunkByFile.has(chunk.fileName)) {
      violations.push(`duplicate provenance chunk ${chunk.fileName}`);
    }
    chunkByFile.set(chunk.fileName, chunk);
    for (const [label, values] of [
      ['imports', chunk.imports],
      ['dynamicImports', chunk.dynamicImports],
      ['modules', chunk.modules]
    ]) {
      if (!sameArray(values, sortedUnique(values))) {
        violations.push(
          `${chunk.fileName} ${label} must be sorted and unique`
        );
      }
    }
    if (
      chunk.facadeModuleId?.startsWith('/')
      || chunk.modules.some((moduleId) => moduleId.startsWith('/'))
    ) {
      violations.push(
        `${chunk.fileName} contains a non-normalized absolute module ID`
      );
    }
  }
  const fileNames = chunks
    .filter((chunk) => chunk && typeof chunk.fileName === 'string')
    .map((chunk) => chunk.fileName);
  if (!sameArray(fileNames, [...fileNames].sort())) {
    violations.push('provenance chunks must be sorted by fileName');
  }

  const ownersByModule = new Map();
  for (const chunk of chunkByFile.values()) {
    for (const moduleId of chunk.modules) {
      const owners = ownersByModule.get(moduleId) ?? [];
      owners.push(chunk.fileName);
      ownersByModule.set(moduleId, owners);
    }
  }
  for (const [moduleId, owners] of ownersByModule) {
    if (owners.length > 1 && moduleId.includes('/src/production/')) {
      violations.push(
        `${moduleId} is emitted into multiple chunks: ${owners.sort().join(', ')}`
      );
    }
  }

  if (viteManifest && typeof viteManifest === 'object') {
    const emittedManifestFiles = new Set(
      Object.values(viteManifest)
        .map((entry) => entry?.file)
        .filter((file) => typeof file === 'string' && file.endsWith('.js'))
    );
    for (const fileName of chunkByFile.keys()) {
      if (!emittedManifestFiles.has(fileName)) {
        violations.push(
          `${fileName} is absent from the Vite manifest module graph`
        );
      }
    }
  }

  const shellChunks = [...chunkByFile.values()].filter((chunk) => (
    chunk.modules.some((moduleId) => (
      moduleId.endsWith(
        '/src/production/phone-story/PhoneStoryShell.tsx'
      )
    ))
  ));
  if (shellChunks.length > 1) {
    violations.push('PhoneStoryShell execution core is duplicated across chunks');
  }
  if (shellChunks.length === 1) {
    const synchronousFiles = new Set();
    const visit = (fileName) => {
      if (synchronousFiles.has(fileName)) return;
      synchronousFiles.add(fileName);
      const chunk = chunkByFile.get(fileName);
      if (!chunk) {
        violations.push(
          `phone execution closure imports missing chunk ${fileName}`
        );
        return;
      }
      for (const imported of chunk.imports) visit(imported);
    };
    visit(shellChunks[0].fileName);
    const synchronousModules = new Set(
      [...synchronousFiles]
        .map((fileName) => chunkByFile.get(fileName))
        .filter(Boolean)
        .flatMap((chunk) => chunk.modules)
    );
    for (const coreName of phoneExecutionCoreNames) {
      const suffix = `/src/production/phone-story/${coreName}`;
      if (![...synchronousModules].some((moduleId) => moduleId.endsWith(suffix))) {
        violations.push(
          `phone execution core is missing synchronously reachable ${coreName}`
        );
      }
    }
    for (const moduleId of synchronousModules) {
      if (phoneLeafModule(moduleId)) {
        violations.push(
          `eager phone leaf entered the synchronous execution core: ${moduleId}`
        );
      }
      if (moduleId.endsWith('/phone-story/PhoneBrandLabStory.tsx')) {
        violations.push(
          'formal phone execution core eagerly contains PhoneBrandLabStory'
        );
      }
    }
  }

  for (const chunk of chunkByFile.values()) {
    const leafModules = chunk.modules.filter(phoneLeafModule);
    if (leafModules.length === 0) continue;
    const authority = chunk.modules.find(lazyLifecycleOwner);
    if (authority) {
      violations.push(
        `${chunk.fileName} lazy phone leaf contains lifecycle authority ${authority}`
      );
    }
    if (chunk.isDynamicEntry) {
      const bytes = chunkBytes instanceof Map
        ? chunkBytes.get(chunk.fileName)
        : chunkBytes[chunk.fileName];
      if (
        typeof bytes === 'number'
        && bytes > DONOR_MAX_LAZY_LEAF_BYTES
      ) {
        violations.push(
          `${chunk.fileName} lazy phone leaf chunk exceeds donor maximum: `
            + `${bytes} > ${DONOR_MAX_LAZY_LEAF_BYTES}`
        );
      }
    }
  }

  return [...new Set(violations)].sort();
}

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
  const url = new URL(href, 'https://release.invalid/');
  let pathname = url.pathname;
  if (url.origin === assetCdnOrigin || url.origin === mediaCdnOrigin) {
    assert(releaseId, `${label} uses CDN without R5_RELEASE_ID`);
    const releasePrefix = `/releases/${releaseId}/`;
    assert(pathname.startsWith(releasePrefix), `${label} uses the wrong CDN release path`);
    pathname = pathname.slice(releasePrefix.length);
  } else {
    assert(
      url.origin === 'https://release.invalid',
      `${label} uses unexpected external origin ${url.origin}`
    );
  }
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

if (path.resolve(process.argv[1] ?? '') === SCRIPT_PATH) {
const [html, copy, staticCopyOmissions] = await Promise.all([
  readFile(indexPath, 'utf8'),
  readFile(copyPath, 'utf8').then(JSON.parse),
  readFile(staticCopyOmissionsPath, 'utf8').then(JSON.parse)
]);
const text = visibleText(html);
const staticCopyOmissionSet = new Set(staticCopyOmissions);
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
if (requireCdn) {
  assert(
    new URL(faviconHref).origin === assetCdnOrigin,
    'release favicon must use the assets CDN'
  );
  assert(
    new URL(titleFontHref).origin === assetCdnOrigin,
    'release title font preload must use the assets CDN'
  );
}
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
assert(
  (html.match(/>沪公网安备 31011502406697号<\/a>/g) ?? []).length === 1,
  'release static footer must contain the visible public security filing exactly once'
);
assert(html.includes('href="https://beian.miit.gov.cn/"'), 'release filing link is missing');
assert(
  html.includes('href="https://www.beian.gov.cn/portal/registerSystemInfo?recordcode=31011502406697"'),
  'release public security filing link is missing'
);
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
    if (staticCopyOmissionSet.has(item)) {
      assert(!text.includes(item.replace(/\s+/g, ' ')), `static HTML retained omitted copy: ${item}`);
      continue;
    }
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
const provenancePath = path.join(
  distDir,
  'audit/r5-module-provenance.json'
);
const [moduleProvenance, viteManifest] = await Promise.all([
  readFile(provenancePath, 'utf8').then(JSON.parse),
  readFile(path.join(distDir, '.vite/manifest.json'), 'utf8').then(JSON.parse)
]);
const provenanceChunkBytes = new Map();
for (const chunk of Array.isArray(moduleProvenance?.chunks)
  ? moduleProvenance.chunks
  : []) {
  if (!chunk || typeof chunk.fileName !== 'string') continue;
  const target = path.resolve(distDir, chunk.fileName);
  assert(
    target.startsWith(`${distDir}${path.sep}`),
    `provenance chunk resolves outside dist: ${chunk.fileName}`
  );
  provenanceChunkBytes.set(chunk.fileName, (await stat(target)).size);
}
const provenanceViolations = moduleProvenanceViolations(moduleProvenance, {
  chunkBytes: provenanceChunkBytes,
  viteManifest
});
assert(
  provenanceViolations.length === 0,
  `release module provenance failed:\n`
    + provenanceViolations.map((violation) => `- ${violation}`).join('\n')
);
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
assert(
  !html.includes('r5-module-provenance')
    && !jsText.includes('r5-module-provenance'),
  'build-audit module provenance entered HTML or runtime JavaScript'
);
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
}
