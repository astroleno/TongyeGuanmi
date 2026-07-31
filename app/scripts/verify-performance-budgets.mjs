import { gzipSync } from 'node:zlib';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_APP_ROOT = path.dirname(path.dirname(SCRIPT_PATH));
const KiB = 1024;
const MiB = 1024 * KiB;
const desktopJsHardCapBytes = 568 * KiB;
const phoneJsHardCapBytes = 663_552;
const totalJsHardCapBytes = phoneJsHardCapBytes;
const requiredDesktopJsHeadroomBytes = 4 * KiB;

export const PHONE_JS_CLEAN_BASE_TARGET_BYTES = 628_044;

export const PERFORMANCE_BUDGETS = Object.freeze({
  initialJsRawBytes: 360 * KiB,
  initialJsGzipBytes: 112 * KiB,
  initialCssRawBytes: 75 * KiB,
  desktopJsRawBytes: desktopJsHardCapBytes,
  phoneJsRawBytes: phoneJsHardCapBytes,
  totalJsRawBytes: totalJsHardCapBytes,
  largestLazyJsRawBytes: 64 * KiB,
  loaderInkLazyJsRawBytes: 16 * KiB,
  totalAssetBytes: 156 * MiB,
  largestAssetBytes: 16 * MiB
});

export function performanceHeadroom(actual) {
  return {
    desktopJsHardCapBytes,
    phoneJsHardCapBytes,
    totalJsHardCapBytes,
    requiredDesktopJsHeadroomBytes,
    desktopJsHeadroomBytes:
      desktopJsHardCapBytes - actual.desktopJsRawBytes,
    phoneJsHeadroomBytes:
      phoneJsHardCapBytes - actual.phoneJsRawBytes,
    totalJsHeadroomBytes:
      totalJsHardCapBytes - actual.totalJsRawBytes
  };
}

export function performanceBudgetViolations(actual) {
  const violations = [];
  for (const [name, budget] of Object.entries(PERFORMANCE_BUDGETS)) {
    if (actual[name] > budget) {
      violations.push(`${name} exceeded: ${actual[name]} > ${budget}`);
    }
  }
  const headroom = performanceHeadroom(actual);
  if (
    headroom.desktopJsHeadroomBytes
    < headroom.requiredDesktopJsHeadroomBytes
  ) {
    violations.push(
      `desktopJsHeadroomBytes below required headroom: `
        + `${headroom.desktopJsHeadroomBytes} `
        + `< ${headroom.requiredDesktopJsHeadroomBytes}`
    );
  }
  return violations;
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
      files.push({ path: target, bytes: info.size });
    }
  }
  return files;
}

export async function verifyPerformanceBudgets({
  appRoot = DEFAULT_APP_ROOT,
  repoRoot = path.dirname(appRoot),
  output = true
} = {}) {
  const distDir = path.join(repoRoot, 'dist');
  const indexHtml = await readFile(path.join(distDir, 'index.html'), 'utf8');
  const manifest = JSON.parse(
    await readFile(path.join(distDir, '.vite', 'manifest.json'), 'utf8')
  );
  const scriptMatch = indexHtml.match(/<script[^>]+src="([^"]+\.js)"/);
  const styleMatch = indexHtml.match(/<link[^>]+href="([^"]+\.css)"/);
  if (!scriptMatch?.[1] || !styleMatch?.[1]) {
    throw new Error(
      'Unable to identify initial JS/CSS assets from dist/index.html'
    );
  }

  const resolveDistAsset = (urlPath) => (
    path.join(distDir, urlPath.replace(/^\//, ''))
  );
  const initialJs = await readFile(resolveDistAsset(scriptMatch[1]));
  const initialCss = await readFile(resolveDistAsset(styleMatch[1]));
  const files = await filesBelow(path.join(distDir, 'assets'));
  const jsFiles = files.filter((file) => file.path.endsWith('.js'));
  const lazyJsFiles = jsFiles.filter(
    (file) => file.path !== resolveDistAsset(scriptMatch[1])
  );
  const filesByRelativePath = new Map(
    files.map((file) => [
      path.relative(distDir, file.path).split(path.sep).join('/'),
      file
    ])
  );

  const manifestFile = (key) => {
    const entry = manifest[key];
    const file = entry && filesByRelativePath.get(entry.file);
    if (!file) {
      throw new Error(
        `Manifest entry ${key} does not point at an emitted JS asset`
      );
    }
    return file;
  };
  const shellEntry = (name) => {
    const match = Object.entries(manifest).find(([, entry]) => (
      entry.isDynamicEntry && entry.name === name
    ));
    if (!match) {
      throw new Error(
        `Expected dynamic ${name} presentation shell in Vite manifest`
      );
    }
    return match[0];
  };
  const presentationClosure = (root) => {
    const entries = new Set();
    const visit = (key, followDynamicImports = true) => {
      if (entries.has(key)) return;
      const entry = manifest[key];
      if (!entry) throw new Error(`Manifest dependency ${key} is missing`);
      entries.add(key);
      for (const imported of entry.imports ?? []) {
        visit(imported, imported !== 'index.html');
      }
      if (followDynamicImports) {
        for (const imported of entry.dynamicImports ?? []) visit(imported);
      }
    };
    visit(root);
    const closureFiles = [...entries].map(manifestFile);
    return {
      bytes: closureFiles.reduce((sum, file) => sum + file.bytes, 0),
      files: closureFiles
    };
  };

  const desktopShellKey = shellEntry('DesktopStoryShell');
  const phoneShellKey = shellEntry('PhoneStoryShell');
  const desktopPresentation = presentationClosure(desktopShellKey);
  const phonePresentation = presentationClosure(phoneShellKey);
  const presentationShellFiles = new Set([
    manifestFile(desktopShellKey).path,
    manifestFile(phoneShellKey).path
  ]);
  const presentationLazyJsFiles = lazyJsFiles.filter(
    (file) => !presentationShellFiles.has(file.path)
  );
  const loaderInkLazyJsFiles = lazyJsFiles.filter((file) => (
    /^loader-ink-reveal-[^.]+\.js$/.test(path.basename(file.path))
  ));
  if (loaderInkLazyJsFiles.length !== 1) {
    throw new Error(
      `Expected exactly one lazy loader Ink chunk, `
        + `found ${loaderInkLazyJsFiles.length}`
    );
  }

  const allJsRawBytes = jsFiles.reduce((sum, file) => sum + file.bytes, 0);
  const loaderInkPaths = new Set(
    loaderInkLazyJsFiles.map((file) => file.path)
  );
  const shellBudgetBytes = (presentation) => presentation.files
    .filter((file) => !loaderInkPaths.has(file.path))
    .reduce((sum, file) => sum + file.bytes, 0);
  const desktopShellBudgetBytes = shellBudgetBytes(desktopPresentation);
  const phoneShellBudgetBytes = shellBudgetBytes(phonePresentation);
  const totalJsRawBytes = Math.max(
    desktopShellBudgetBytes,
    phoneShellBudgetBytes
  );
  const totalAssetBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  const largestLazyJsRawBytes = Math.max(
    0,
    ...presentationLazyJsFiles.map((file) => file.bytes)
  );
  const loaderInkLazyJsRawBytes = loaderInkLazyJsFiles[0].bytes;
  const largestAssetBytes = Math.max(0, ...files.map((file) => file.bytes));

  const actual = {
    initialJsRawBytes: initialJs.byteLength,
    initialJsGzipBytes: gzipSync(initialJs).byteLength,
    initialCssRawBytes: initialCss.byteLength,
    desktopJsRawBytes: desktopShellBudgetBytes,
    phoneJsRawBytes: phoneShellBudgetBytes,
    totalJsRawBytes,
    largestLazyJsRawBytes,
    loaderInkLazyJsRawBytes,
    totalAssetBytes,
    largestAssetBytes
  };
  const violations = performanceBudgetViolations(actual);
  if (violations.length > 0) {
    throw new Error(violations.join('\n'));
  }

  const headroom = performanceHeadroom(actual);
  const cleanBase = {
    phoneJsCleanBaseTargetBytes: PHONE_JS_CLEAN_BASE_TARGET_BYTES,
    phoneJsDeltaFromCleanBaseBytes:
      actual.phoneJsRawBytes - PHONE_JS_CLEAN_BASE_TARGET_BYTES,
    status: actual.phoneJsRawBytes <= PHONE_JS_CLEAN_BASE_TARGET_BYTES
      ? 'at-or-below-target'
      : 'warning'
  };
  const report = {
    schemaVersion: 5,
    budgets: PERFORMANCE_BUDGETS,
    headroom: {
      ...headroom,
      // Retained as report-only compatibility metadata. Only desktop
      // headroom is asserted; phone/total fail solely above 663,552 bytes.
      requiredTotalJsHeadroomBytes: requiredDesktopJsHeadroomBytes
    },
    cleanBase,
    actual,
    presentationFamilies: {
      desktopJsRawBytes: desktopPresentation.bytes,
      phoneJsRawBytes: phonePresentation.bytes,
      desktopShellBudgetBytes,
      phoneShellBudgetBytes,
      allEmittedJsRawBytes: allJsRawBytes,
      budgetedJsRawBytes: totalJsRawBytes
    },
    chunks: {
      loaderInk: path.relative(
        distDir,
        loaderInkLazyJsFiles[0].path
      ).split(path.sep).join('/'),
      desktopShell: manifest[desktopShellKey].file,
      phoneShell: manifest[phoneShellKey].file
    },
    pass: true
  };
  await writeFile(
    path.join(distDir, 'r5-performance-budget.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
  );
  if (output) process.stdout.write(`${JSON.stringify(report)}\n`);
  return report;
}

if (path.resolve(process.argv[1] ?? '') === SCRIPT_PATH) {
  await verifyPerformanceBudgets();
}
