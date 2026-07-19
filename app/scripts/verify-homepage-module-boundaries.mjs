import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourceDir = path.join(appDir, 'src');
const productionDir = path.join(sourceDir, 'production');
const phoneDir = path.join(productionDir, 'phone');
const desktopDir = path.join(productionDir, 'desktop');
const portraitSpikeDir = path.join(productionDir, 'portrait-spike');
const storyDir = path.join(sourceDir, 'story');
const sourceExtensions = new Set(['.ts', '.tsx']);

function isWithin(target, directory) {
  return target === directory || target.startsWith(`${directory}${path.sep}`);
}

async function filesBelow(directory) {
  const entries = await readdir(directory);
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry);
    const info = await stat(target);
    if (info.isDirectory()) {
      files.push(...await filesBelow(target));
    } else if (sourceExtensions.has(path.extname(target))) {
      files.push(target);
    }
  }
  return files;
}

function importSpecifiers(source) {
  const specifiers = [];
  const expression = /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(expression)) {
    specifiers.push(match[1]);
  }
  for (const match of source.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    specifiers.push(match[1]);
  }
  return specifiers;
}

function relativeTarget(file, specifier) {
  if (!specifier.startsWith('.')) return null;
  return path.normalize(path.resolve(path.dirname(file), specifier));
}

function display(file) {
  return path.relative(appDir, file).split(path.sep).join('/');
}

const violations = [];

for (const file of await filesBelow(productionDir)) {
  const source = await readFile(file, 'utf8');
  const targets = importSpecifiers(source)
    .map((specifier) => relativeTarget(file, specifier))
    .filter(Boolean);
  if (isWithin(file, phoneDir)) {
    if (targets.some((target) => isWithin(target, portraitSpikeDir))) {
      violations.push(`${display(file)}: phone code must not import portrait-spike`);
    }
    if (targets.some((target) => isWithin(target, desktopDir))) {
      violations.push(`${display(file)}: phone code must not import desktop`);
    }
  }
  if (isWithin(file, desktopDir) && targets.some((target) => isWithin(target, phoneDir))) {
    violations.push(`${display(file)}: desktop code must not import phone`);
  }
}

for (const file of await filesBelow(storyDir)) {
  const source = await readFile(file, 'utf8');
  const targets = importSpecifiers(source)
    .map((specifier) => relativeTarget(file, specifier))
    .filter(Boolean);
  if (targets.some((target) => isWithin(target, phoneDir) || isWithin(target, desktopDir) || isWithin(target, portraitSpikeDir))) {
    violations.push(`${display(file)}: shared story contracts must not import a presentation shell`);
  }
}

for (const file of [
  path.join(phoneDir, 'PhoneStoryShell.tsx'),
  path.join(phoneDir, 'PhoneStageRail.tsx'),
  path.join(desktopDir, 'DesktopStoryShell.tsx')
]) {
  const source = await readFile(file, 'utf8');
  if (/new\s+URL\s*\(/.test(source)) {
    violations.push(`${display(file)}: shell layers must not own asset URLs`);
  }
}

for (const file of await filesBelow(path.join(phoneDir, 'scenes'))) {
  const source = await readFile(file, 'utf8');
  if (/new\s+URL\s*\(/.test(source)) {
    violations.push(`${display(file)}: scene adapters must resolve media through phone-media and product ownership contracts`);
  }
}

if (violations.length > 0) {
  throw new Error(`Homepage module boundary violations:\n${violations.map((violation) => `- ${violation}`).join('\n')}`);
}

process.stdout.write('Homepage module boundaries verified.\n');
