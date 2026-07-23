import { gzipSync } from 'node:zlib';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const KiB = 1024;
const MiB = 1024 * KiB;
// Unit7-A closes the formal phone journey over the already-lazy Group 4–5
// adapters. Keep the pre-existing desktop ceiling frozen, while giving the
// longer phone journey its own explicit ceiling instead of weakening the
// desktop regression guard.
const desktopJsHardCapBytes = 568 * KiB;
const phoneJsHardCapBytes = 648 * KiB;
const totalJsHardCapBytes = phoneJsHardCapBytes;
const requiredTotalJsHeadroomBytes = 4 * KiB;
const budgets = {
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
};

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoDir = path.dirname(appDir);
const distDir = path.join(repoDir, 'dist');
const indexHtml = await readFile(path.join(distDir, 'index.html'), 'utf8');
const manifest = JSON.parse(await readFile(path.join(distDir, '.vite', 'manifest.json'), 'utf8'));

function assertBudget(name, actual, budget) {
  if (actual > budget) {
    throw new Error(`${name} exceeded: ${actual} > ${budget}`);
  }
}

function assertHeadroom(name, actual, required) {
  if (actual < required) {
    throw new Error(`${name} below required headroom: ${actual} < ${required}`);
  }
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

const scriptMatch = indexHtml.match(/<script[^>]+src="([^"]+\.js)"/);
const styleMatch = indexHtml.match(/<link[^>]+href="([^"]+\.css)"/);
if (!scriptMatch?.[1] || !styleMatch?.[1]) {
  throw new Error('Unable to identify initial JS/CSS assets from dist/index.html');
}

const resolveDistAsset = (urlPath) => path.join(distDir, urlPath.replace(/^\//, ''));
const initialJs = await readFile(resolveDistAsset(scriptMatch[1]));
const initialCss = await readFile(resolveDistAsset(styleMatch[1]));
const files = await filesBelow(path.join(distDir, 'assets'));
const jsFiles = files.filter((file) => file.path.endsWith('.js'));
const lazyJsFiles = jsFiles.filter((file) => file.path !== resolveDistAsset(scriptMatch[1]));
const filesByRelativePath = new Map(
  files.map((file) => [path.relative(distDir, file.path).split(path.sep).join('/'), file])
);

function manifestFile(key) {
  const entry = manifest[key];
  const file = entry && filesByRelativePath.get(entry.file);
  if (!file) {
    throw new Error(`Manifest entry ${key} does not point at an emitted JS asset`);
  }
  return file;
}

function shellEntry(name) {
  const match = Object.entries(manifest).find(([, entry]) => (
    entry.isDynamicEntry && entry.name === name
  ));
  if (!match) {
    throw new Error(`Expected dynamic ${name} presentation shell in Vite manifest`);
  }
  return match[0];
}

function presentationClosure(root) {
  const entries = new Set();
  const visit = (key, followDynamicImports = true) => {
    if (entries.has(key)) return;
    const entry = manifest[key];
    if (!entry) throw new Error(`Manifest dependency ${key} is missing`);
    entries.add(key);
    for (const imported of entry.imports ?? []) {
      // The initial entry owns both mutually-exclusive shell imports. Loading
      // one selected shell must not be charged for the other shell's graph.
      visit(imported, imported !== 'index.html');
    }
    if (followDynamicImports) {
      for (const imported of entry.dynamicImports ?? []) visit(imported);
    }
  };
  visit(root);
  const files = [...entries].map(manifestFile);
  return {
    bytes: files.reduce((sum, file) => sum + file.bytes, 0),
    files
  };
}

const desktopShellKey = shellEntry('DesktopStoryShell');
const phoneShellKey = shellEntry('PhoneStoryShell');
const desktopPresentation = presentationClosure(desktopShellKey);
const phonePresentation = presentationClosure(phoneShellKey);
const presentationShellFiles = new Set([
  manifestFile(desktopShellKey).path,
  manifestFile(phoneShellKey).path
]);
const presentationLazyJsFiles = lazyJsFiles.filter((file) => !presentationShellFiles.has(file.path));
const loaderInkLazyJsFiles = lazyJsFiles.filter((file) => (
  /^loader-ink-reveal-[^.]+\.js$/.test(path.basename(file.path))
));
if (loaderInkLazyJsFiles.length !== 1) {
  throw new Error(
    `Expected exactly one lazy loader Ink chunk, found ${loaderInkLazyJsFiles.length}`
  );
}
const allJsRawBytes = jsFiles.reduce((sum, file) => sum + file.bytes, 0);
const loaderInkPaths = new Set(loaderInkLazyJsFiles.map((file) => file.path));
const shellBudgetBytes = (presentation) => presentation.files
  .filter((file) => !loaderInkPaths.has(file.path))
  .reduce((sum, file) => sum + file.bytes, 0);
const desktopShellBudgetBytes = shellBudgetBytes(desktopPresentation);
const phoneShellBudgetBytes = shellBudgetBytes(phonePresentation);
// `totalJsRawBytes` is the larger selected-shell journey. The old aggregate
// charged a desktop visitor for every phone-only chunk (and vice versa). The
// loader ink effect remains separately hard-capped below, so it is not counted
// a second time as continuously resident shell code.
const totalJsRawBytes = Math.max(desktopShellBudgetBytes, phoneShellBudgetBytes);
const totalAssetBytes = files.reduce((sum, file) => sum + file.bytes, 0);
const largestLazyJsRawBytes = Math.max(0, ...presentationLazyJsFiles.map((file) => file.bytes));
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

for (const [name, budget] of Object.entries(budgets)) {
  assertBudget(name, actual[name], budget);
}

const desktopJsHeadroomBytes = desktopJsHardCapBytes - actual.desktopJsRawBytes;
const phoneJsHeadroomBytes = phoneJsHardCapBytes - actual.phoneJsRawBytes;
const totalJsHeadroomBytes = totalJsHardCapBytes - actual.totalJsRawBytes;
assertHeadroom('desktopJsHeadroomBytes', desktopJsHeadroomBytes, requiredTotalJsHeadroomBytes);
assertHeadroom('phoneJsHeadroomBytes', phoneJsHeadroomBytes, requiredTotalJsHeadroomBytes);
assertHeadroom('totalJsHeadroomBytes', totalJsHeadroomBytes, requiredTotalJsHeadroomBytes);

const report = {
  schemaVersion: 4,
  budgets,
  headroom: {
    desktopJsHardCapBytes,
    phoneJsHardCapBytes,
    totalJsHardCapBytes,
    requiredTotalJsHeadroomBytes,
    desktopJsHeadroomBytes,
    phoneJsHeadroomBytes,
    totalJsHeadroomBytes
  },
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
    loaderInk: path.relative(distDir, loaderInkLazyJsFiles[0].path).split(path.sep).join('/'),
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
process.stdout.write(`${JSON.stringify(report)}\n`);
