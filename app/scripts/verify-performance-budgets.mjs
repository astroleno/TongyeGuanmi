import { gzipSync } from 'node:zlib';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const KiB = 1024;
const MiB = 1024 * KiB;
const budgets = {
  initialJsRawBytes: 360 * KiB,
  initialJsGzipBytes: 112 * KiB,
  initialCssRawBytes: 75 * KiB,
  totalJsRawBytes: 520 * KiB,
  largestLazyJsRawBytes: 64 * KiB,
  totalAssetBytes: 145 * MiB,
  largestAssetBytes: 16 * MiB
};

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoDir = path.dirname(appDir);
const distDir = path.join(repoDir, 'dist');
const indexHtml = await readFile(path.join(distDir, 'index.html'), 'utf8');

function assertBudget(name, actual, budget) {
  if (actual > budget) {
    throw new Error(`${name} exceeded: ${actual} > ${budget}`);
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
const totalJsRawBytes = jsFiles.reduce((sum, file) => sum + file.bytes, 0);
const totalAssetBytes = files.reduce((sum, file) => sum + file.bytes, 0);
const largestLazyJsRawBytes = Math.max(0, ...lazyJsFiles.map((file) => file.bytes));
const largestAssetBytes = Math.max(0, ...files.map((file) => file.bytes));

const actual = {
  initialJsRawBytes: initialJs.byteLength,
  initialJsGzipBytes: gzipSync(initialJs).byteLength,
  initialCssRawBytes: initialCss.byteLength,
  totalJsRawBytes,
  largestLazyJsRawBytes,
  totalAssetBytes,
  largestAssetBytes
};

for (const [name, budget] of Object.entries(budgets)) {
  assertBudget(name, actual[name], budget);
}

const report = {
  schemaVersion: 1,
  budgets,
  actual,
  pass: true
};
await writeFile(
  path.join(distDir, 'r5-performance-budget.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8'
);
process.stdout.write(`${JSON.stringify(report)}\n`);
