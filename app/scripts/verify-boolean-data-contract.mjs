import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const APP_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');

function collectFiles(root, extensions, files = []) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      collectFiles(absolute, extensions, files);
    } else if (extensions.has(path.extname(entry.name))) {
      files.push(absolute);
    }
  }
  return files.sort();
}

function datasetProperty(attribute) {
  return attribute.replace(/-([a-z0-9])/g, (_, letter) => letter.toUpperCase());
}

function unwrapParentheses(expression) {
  let current = expression;
  while (ts.isParenthesizedExpression(current)) {
    current = current.expression;
  }
  return current;
}

function textualBooleanWriter(expression) {
  if (!expression) return false;
  const writer = unwrapParentheses(expression);
  if (ts.isStringLiteral(writer)) {
    return writer.text === 'true' || writer.text === 'false';
  }
  return ts.isCallExpression(writer)
    && ts.isIdentifier(writer.expression)
    && writer.expression.text === 'semanticBoolean'
    && writer.arguments.length === 1;
}

function datasetPropertyWriter(left, labelByProperty) {
  const target = unwrapParentheses(left);
  if (ts.isPropertyAccessExpression(target)) {
    const dataset = target.expression;
    if (
      ts.isPropertyAccessExpression(dataset)
      && dataset.name.text === 'dataset'
    ) {
      return labelByProperty.get(target.name.text);
    }
    return undefined;
  }
  if (!ts.isElementAccessExpression(target)) {
    return undefined;
  }
  const dataset = target.expression;
  const property = target.argumentExpression;
  if (
    !ts.isPropertyAccessExpression(dataset)
    || dataset.name.text !== 'dataset'
    || !property
    || !ts.isStringLiteral(property)
  ) {
    return undefined;
  }
  return labelByProperty.get(property.text);
}

function setAttributeWriter(call, labels) {
  if (
    !ts.isPropertyAccessExpression(call.expression)
    || call.expression.name.text !== 'setAttribute'
  ) {
    return undefined;
  }
  const label = call.arguments[0];
  if (!label || !ts.isStringLiteral(label) || !labels.has(label.text)) {
    return undefined;
  }
  return { label: label.text, expression: call.arguments[1] };
}

function unsafeBooleanWriters(file, source, attributes) {
  const labels = new Set([...attributes].map((attribute) => `data-${attribute}`));
  const labelByProperty = new Map(
    [...attributes].map((attribute) => [
      datasetProperty(attribute),
      `data-${attribute}`
    ])
  );
  const scriptKind = /\.[cm]?tsx$/i.test(file)
    ? ts.ScriptKind.TSX
    : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind
  );
  const unsafe = new Set();
  const visit = (node) => {
    if (ts.isJsxAttribute(node)) {
      const label = ts.isIdentifier(node.name) ? node.name.text : undefined;
      if (label && labels.has(label)) {
        const initializer = node.initializer;
        const expression = initializer && ts.isJsxExpression(initializer)
          ? initializer.expression
          : initializer;
        if (!textualBooleanWriter(expression)) {
          unsafe.add(label);
        }
      }
    } else if (
      ts.isBinaryExpression(node)
      && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ) {
      const label = datasetPropertyWriter(node.left, labelByProperty);
      if (label && !textualBooleanWriter(node.right)) {
        unsafe.add(label);
      }
    } else if (ts.isCallExpression(node)) {
      const writer = setAttributeWriter(node, labels);
      if (writer && !textualBooleanWriter(writer.expression)) {
        unsafe.add(writer.label);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...unsafe].sort();
}

export function cssBooleanDataAttributes(source) {
  const found = new Set();
  const selector = /\[data-([a-z0-9-]+)\s*=\s*(?:(['"])(?:true|false)\2|(?:true|false))\s*\]/g;
  for (const match of source.matchAll(selector)) {
    found.add(match[1]);
  }
  return new Set([...found].sort());
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
    for (const attribute of cssBooleanDataAttributes(source)) {
      attributes.add(attribute);
    }
  }

  for (const { file, source } of runtimeSources) {
    for (const label of unsafeBooleanWriters(file, source, attributes)) {
      violations.push(
        `${file}: ${label} must use semanticBoolean(...) or a textual literal`
      );
    }
  }
  return violations;
}

export function verifyBooleanDataContract(root = APP_ROOT) {
  const srcRoot = path.join(root, 'src');
  const relative = (file) => path.relative(root, file).split(path.sep).join('/');
  const cssSources = collectFiles(srcRoot, new Set(['.css']))
    .map((file) => ({ file: relative(file), source: fs.readFileSync(file, 'utf8') }));
  const runtimeSources = collectFiles(srcRoot, new Set(['.ts', '.tsx']))
    .filter((file) => {
      const name = relative(file);
      // The legacy phone authority is frozen until Task 11's atomic deletion.
      // Scan every other production source recursively, including phone-story
      // as soon as that canonical directory is introduced.
      return !name.startsWith('src/harness/')
        && !name.startsWith('src/production/phone/')
        && !name.includes('/__fixtures__/')
        && !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(name);
    })
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
    for (const violation of violations) {
      console.error(`- ${violation}`);
    }
    process.exitCode = 1;
  } else {
    console.log('CSS boolean data-attribute contract passed.');
  }
}
