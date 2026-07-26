import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const APP_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');

function collectFiles(root, extensions, files = []) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) collectFiles(absolute, extensions, files);
    else if (extensions.has(path.extname(entry.name))) files.push(absolute);
  }
  return files;
}

function datasetProperty(attribute) {
  return attribute.replace(/-([a-z0-9])/g, (_, letter) => letter.toUpperCase());
}

function textualBooleanWriter(expression) {
  return /\bsemanticBoolean\s*\(/.test(expression)
    || /(['"])true\1/.test(expression)
    || /(['"])false\1/.test(expression);
}

export function cssBooleanDataAttributes(source) {
  const found = new Set();
  const selector = /\[data-([a-z0-9-]+)\s*=\s*(['"])(?:true|false)\2\]/g;
  for (const match of source.matchAll(selector)) found.add(match[1]);
  return found;
}

export function booleanDataContractViolations({
  viteSource,
  cssSources,
  runtimeSources
}) {
  const violations = [];
  if (/\bbooleans_as_integers\s*:\s*true\b/.test(viteSource)) {
    violations.push('vite.config.ts: booleans_as_integers must not be enabled');
  }

  const attributes = new Set();
  for (const { source } of cssSources) {
    for (const attribute of cssBooleanDataAttributes(source)) attributes.add(attribute);
  }

  for (const { file, source } of runtimeSources) {
    for (const attribute of attributes) {
      const label = `data-${attribute}`;
      const property = datasetProperty(attribute);
      const expressions = [];
      const jsx = new RegExp(`${label}\\s*=\\s*\\{([\\s\\S]*?)\\}`, 'g');
      const dataset = new RegExp(
        `\\.dataset\\.${property}\\s*=\\s*([^;\\n]+)`,
        'g'
      );
      const setter = new RegExp(
        `\\.setAttribute\\(\\s*(['"])${label}\\1\\s*,\\s*([^)]+)\\)`,
        'g'
      );
      for (const match of source.matchAll(jsx)) expressions.push(match[1]);
      for (const match of source.matchAll(dataset)) expressions.push(match[1]);
      for (const match of source.matchAll(setter)) expressions.push(match[2]);
      if (expressions.some((expression) => !textualBooleanWriter(expression))) {
        violations.push(
          `${file}: ${label} must use semanticBoolean(...) or a textual literal`
        );
      }
    }
  }
  return violations;
}

export function verifyBooleanDataContract(root = APP_ROOT) {
  const relative = (file) => path.relative(root, file).split(path.sep).join('/');
  const cssSources = collectFiles(path.join(root, 'src'), new Set(['.css']))
    .map((file) => ({ file: relative(file), source: fs.readFileSync(file, 'utf8') }));
  const runtimeSources = collectFiles(
    path.join(root, 'src'),
    new Set(['.ts', '.tsx'])
  )
    .filter((file) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx'))
    .map((file) => ({ file: relative(file), source: fs.readFileSync(file, 'utf8') }));
  return booleanDataContractViolations({
    viteSource: fs.readFileSync(path.join(root, 'vite.config.ts'), 'utf8'),
    cssSources,
    runtimeSources
  });
}

if (path.resolve(process.argv[1] ?? '') === SCRIPT_PATH) {
  const violations = verifyBooleanDataContract();
  if (violations.length > 0) {
    console.error('CSS boolean data-attribute contract failed:');
    for (const violation of violations) console.error(`- ${violation}`);
    process.exitCode = 1;
  } else {
    console.log('CSS boolean data-attribute contract passed.');
  }
}
