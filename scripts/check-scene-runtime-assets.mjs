import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  homepageAssetScanConfig,
  homepageAssets,
  homepageExternalUrls
} from '../src/homepage/homepage.assets.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const includePattern = /\{\{>\s*([^}]+?)\s*\}\}/g;
const cssImportPattern = /@import\s+(?:url\()?['"]?([^'")]+)['"]?\)?/g;
const cssUrlPattern = /url\(\s*(['"]?)(.*?)\1\s*\)/g;
const htmlAssetAttrPattern = /\s(?:src|poster|href|data-alpha-src|data-fallback-src)=["']([^"']+)["']/g;
const jsImportPattern = /\bimport\s*(?:[^'"]*?\s+from\s*)?['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
const jsAssetStringPattern = /['"]((?:\/)?assets\/[^'"]+\.(?:png|jpe?g|webp|svg|webm|mp4|ttf)(?:[?#][^'"]*)?)['"]/gi;
const externalUrlPattern = /https?:\/\/[^\s'"`),}]+/g;
const dynamicSinkPatterns = [
  /\bscript\.src\s*=\s*([^;\n]+)/g,
  /\bimage\.src\s*=\s*([^;\n]+)/g,
  /\bvideo\.src\s*=\s*([^;\n]+)/g,
  /\bfigure\.src\s*=\s*([^;\n]+)/g,
  /\.setAttribute\(\s*['"]src['"]\s*,\s*([^)\n]+)\)/g
];
const localAssetExtensions = /\.(?:png|jpe?g|webp|svg|webm|mp4|ttf)(?:[?#].*)?$/i;
const ignoredSchemes = /^(?:#|mailto:|data:|tel:|javascript:)/i;

const read = (relativePath) => readFileSync(path.join(rootDir, relativePath), 'utf8');

function stripQueryAndHash(rawUrl) {
  return rawUrl.split(/[?#]/)[0];
}

function normalizeSlashes(value) {
  return value.replaceAll(path.sep, '/');
}

function normalizeLocalUrl(rawUrl, sourceFile) {
  if (!rawUrl || ignoredSchemes.test(rawUrl) || /^https?:\/\//i.test(rawUrl)) return null;
  const withoutWrapper = rawUrl.trim();
  const [cleanPath, suffix = ''] = withoutWrapper.split(/([?#].*)/);
  let normalizedPath;

  if (cleanPath.startsWith('/')) {
    normalizedPath = cleanPath.slice(1);
  } else if (cleanPath.startsWith('assets/')) {
    normalizedPath = cleanPath;
  } else {
    const baseDir = sourceFile ? path.dirname(path.join(rootDir, sourceFile)) : rootDir;
    normalizedPath = normalizeSlashes(path.relative(rootDir, path.resolve(baseDir, cleanPath)));
  }

  if (normalizedPath.startsWith('../')) return null;
  return `${normalizedPath}${suffix}`;
}

function localFilePathFor(rawUrl) {
  const normalized = normalizeLocalUrl(stripQueryAndHash(rawUrl), null) || stripQueryAndHash(rawUrl).replace(/^\//, '');
  return path.join(rootDir, normalized);
}

function addCandidate(candidates, rawUrl, sourceFile, line, reason) {
  if (!rawUrl || ignoredSchemes.test(rawUrl) || /^https?:\/\//i.test(rawUrl)) return;
  if (!localAssetExtensions.test(rawUrl)) return;
  const normalizedRawUrl = normalizeLocalUrl(rawUrl, sourceFile);
  if (!normalizedRawUrl) return;
  candidates.set(normalizedRawUrl, {
    rawUrl: normalizedRawUrl,
    sourceFile,
    line,
    reason
  });
}

function getLineNumber(source, index) {
  return source.slice(0, index).split('\n').length;
}

function collectIncludes(relativePath, visited = new Set(), files = []) {
  if (visited.has(relativePath)) return files;
  visited.add(relativePath);
  files.push(relativePath);
  const source = read(relativePath);
  for (const match of source.matchAll(includePattern)) {
    const includePath = path.posix.join('src', match[1]);
    collectIncludes(includePath, visited, files);
  }
  return files;
}

function collectCssGraph(entrypoints) {
  const files = [];
  const visited = new Set();

  function visit(relativePath) {
    if (visited.has(relativePath)) return;
    visited.add(relativePath);
    files.push(relativePath);
    const source = read(relativePath);
    for (const match of source.matchAll(cssImportPattern)) {
      const importUrl = match[1];
      if (/^https?:\/\//i.test(importUrl) || ignoredSchemes.test(importUrl)) continue;
      const imported = normalizeLocalUrl(importUrl, relativePath);
      if (imported?.endsWith('.css')) visit(imported);
    }
  }

  entrypoints.forEach(visit);
  return files;
}

function collectJsGraph(entrypoints, additionalFiles = []) {
  const files = [];
  const visited = new Set();

  function visit(relativePath) {
    if (!relativePath || visited.has(relativePath)) return;
    visited.add(relativePath);
    files.push(relativePath);
    const source = read(relativePath);
    for (const match of source.matchAll(jsImportPattern)) {
      const importUrl = match[1] || match[2];
      if (!importUrl || /^https?:\/\//i.test(importUrl) || ignoredSchemes.test(importUrl)) continue;
      const imported = normalizeLocalUrl(importUrl, relativePath);
      if (imported?.endsWith('.js') || imported?.endsWith('.mjs')) visit(imported.replace(/[?#].*$/, ''));
    }
  }

  [...entrypoints, ...additionalFiles].forEach(visit);
  return files;
}

function collectAssetCandidates(files) {
  const candidates = new Map();
  const externalUrls = new Map();
  const dynamicSinks = [];

  for (const file of files) {
    const source = read(file);

    for (const match of source.matchAll(htmlAssetAttrPattern)) {
      addCandidate(candidates, match[1], file, getLineNumber(source, match.index ?? 0), 'markup attribute');
    }

    for (const match of source.matchAll(cssUrlPattern)) {
      addCandidate(candidates, match[2], file, getLineNumber(source, match.index ?? 0), 'CSS url()');
    }

    for (const match of source.matchAll(jsAssetStringPattern)) {
      addCandidate(candidates, match[1], file, getLineNumber(source, match.index ?? 0), 'JavaScript static asset string');
    }

    for (const match of source.matchAll(externalUrlPattern)) {
      externalUrls.set(match[0], {
        rawUrl: match[0],
        sourceFile: file,
        line: getLineNumber(source, match.index ?? 0)
      });
    }

    for (const pattern of dynamicSinkPatterns) {
      for (const match of source.matchAll(pattern)) {
        dynamicSinks.push(classifyDynamicSink({
          file,
          line: getLineNumber(source, match.index ?? 0),
          expression: match[0].trim(),
          rhs: match[1]?.trim() || ''
        }));
      }
    }
  }

  return { candidates, externalUrls, dynamicSinks };
}

function classifyDynamicSink({ file, line, expression, rhs }) {
  const isScriptLoader = expression.startsWith('script.src') || expression.includes('.setAttribute') && file.includes('load-libraries');
  if (isScriptLoader) {
    return {
      file,
      line,
      expression,
      status: 'reported-allowlisted',
      candidates: [],
      allowlist: 'script-loader',
      reason: 'script loader source is handled as CDN/local script dependency, not a homepage visual asset'
    };
  }

  return {
    file,
    line,
    expression,
    status: 'warning-unresolved',
    candidates: [],
    allowlist: null,
    reason: `dynamic assignment from ${rhs}; PR1 reports unresolved dynamic sinks as warnings`
  };
}

function formatLocation(item) {
  return `${item.sourceFile || item.file}:${item.line}`;
}

function main() {
  const errors = [];
  const declaredLocal = new Map(homepageAssets.map((asset) => [asset.rawUrl, asset]));
  const declaredExternal = new Map(homepageExternalUrls.map((url) => [url.rawUrl, url]));

  for (const asset of homepageAssets) {
    if (!asset.rawUrl) {
      errors.push(`Asset ${asset.id} is missing rawUrl`);
      continue;
    }
    const filePath = localFilePathFor(asset.rawUrl);
    if (!existsSync(filePath)) {
      errors.push(`Missing declared asset ${asset.id}: ${asset.rawUrl} -> ${path.relative(rootDir, filePath)}`);
    }
  }

  const htmlFiles = collectIncludes(homepageAssetScanConfig.htmlEntrypoint);
  const cssFiles = collectCssGraph(homepageAssetScanConfig.cssEntrypoints);
  const jsFiles = collectJsGraph(homepageAssetScanConfig.jsEntrypoints, homepageAssetScanConfig.additionalSourceFiles);
  const sourceFiles = [...new Set([...htmlFiles, ...cssFiles, ...jsFiles])];
  const { candidates, externalUrls, dynamicSinks } = collectAssetCandidates(sourceFiles);

  for (const candidate of candidates.values()) {
    if (!declaredLocal.has(candidate.rawUrl)) {
      errors.push(`Undeclared local asset ${candidate.rawUrl} from ${formatLocation(candidate)} (${candidate.reason})`);
    }
    const filePath = localFilePathFor(candidate.rawUrl);
    if (!existsSync(filePath)) {
      errors.push(`Missing scanned local asset ${candidate.rawUrl} from ${formatLocation(candidate)}`);
    }
  }

  const undeclaredExternal = [...externalUrls.values()].filter((external) => !declaredExternal.has(external.rawUrl));

  console.log(`Scanned ${sourceFiles.length} source files for SceneRuntime PR1 assets.`);
  console.log(`Declared local assets: ${homepageAssets.length}`);
  console.log(`Scanned local asset candidates: ${candidates.size}`);

  if (externalUrls.size) {
    console.log('External URLs reported:');
    for (const external of externalUrls.values()) {
      const declaration = declaredExternal.get(external.rawUrl);
      const status = declaration ? `allowlist=${declaration.allowlist}` : 'unclassified';
      console.log(`- ${external.rawUrl} (${formatLocation(external)}, ${status})`);
    }
  }

  if (undeclaredExternal.length) {
    errors.push(
      `External URLs must be reported in homepageExternalUrls: ${undeclaredExternal.map((external) => external.rawUrl).join(', ')}`
    );
  }

  if (dynamicSinks.length) {
    console.warn('Dynamic sinks reported for PR1:');
    for (const sink of dynamicSinks) {
      const candidatesText = sink.candidates.length ? sink.candidates.join(', ') : 'none';
      const allowlistText = sink.allowlist || 'none';
      console.warn(`- ${sink.file}:${sink.line} [${sink.status}] ${sink.expression}`);
      console.warn(`  candidates=${candidatesText}; allowlist=${allowlistText}; reason=${sink.reason}`);
    }
  }

  if (errors.length) {
    console.error('SceneRuntime PR1 asset check failed:');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log('SceneRuntime PR1 assets look good.');
}

main();
