import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(rootDir, 'src');
const includePattern = /\{\{>\s*([^}]+?)\s*\}\}/g;

function resolveSourcePath(partialPath) {
  if (path.isAbsolute(partialPath) || partialPath.split(/[\\/]/).includes('..')) {
    throw new Error(`Refusing unsafe include path: ${partialPath}`);
  }
  return path.join(srcDir, partialPath);
}

async function renderFile(relativePath, stack = []) {
  if (stack.includes(relativePath)) {
    throw new Error(`Circular include detected: ${[...stack, relativePath].join(' -> ')}`);
  }

  const filePath = resolveSourcePath(relativePath);
  let source = await readFile(filePath, 'utf8');
  const includes = [...source.matchAll(includePattern)];

  for (const match of includes) {
    const rendered = await renderFile(match[1], [...stack, relativePath]);
    source = source.replace(match[0], rendered.trimEnd());
  }

  return source;
}

const html = await renderFile('index.template.html');
await writeFile(path.join(rootDir, 'index.html'), `${html.trimEnd()}\n`);
console.log('Built index.html from src/index.template.html');
