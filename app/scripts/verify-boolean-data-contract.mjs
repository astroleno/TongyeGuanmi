import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const APP_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');

export const LEGACY_PHONE_BOOLEAN_DEBT = Object.freeze([
  Object.freeze({
    file: 'src/production/phone/PhoneBrandLabContinuation.tsx',
    attribute: 'data-phone-group45-stage-active',
    count: 3
  }),
  Object.freeze({
    file: 'src/production/phone/PhoneBrandLabStory.tsx',
    attribute: 'data-phone-group45-stage-active',
    count: 1
  }),
  Object.freeze({
    file: 'src/production/phone/PhoneBrandLabStory.tsx',
    attribute: 'data-portrait-stage-active',
    count: 1
  }),
  Object.freeze({
    file: 'src/production/phone/PhoneBrandLabStory.tsx',
    attribute: 'data-story-hydrated',
    count: 1
  }),
  Object.freeze({
    file: 'src/production/phone/PhoneGradeAStory.tsx',
    attribute: 'data-phone-figure2-arch-visible',
    count: 1
  }),
  Object.freeze({
    file: 'src/production/phone/PhoneGradeAStory.tsx',
    attribute: 'data-phone-grade-a-active',
    count: 2
  }),
  Object.freeze({
    file: 'src/production/phone/PhoneGradeAStory.tsx',
    attribute: 'data-phone-method-figure2-ink-active',
    count: 1
  }),
  Object.freeze({
    file: 'src/production/phone/PhoneLabContactShell.tsx',
    attribute: 'data-phone-acceptance-stage-active',
    count: 2
  }),
  Object.freeze({
    file: 'src/production/phone/PhoneStoryShell.tsx',
    attribute: 'data-portrait-loader-ready',
    count: 1
  }),
  Object.freeze({
    file: 'src/production/phone/scenes/PhoneFigure2.tsx',
    attribute: 'data-phone-figure2-active',
    count: 1
  }),
  Object.freeze({
    file: 'src/production/phone/scenes/PhoneMethodTop.tsx',
    attribute: 'data-portrait-aod-method-visible',
    count: 1
  }),
  Object.freeze({
    file: 'src/production/phone/usePhoneStageRuntime.ts',
    attribute: 'data-portrait-stage-active',
    count: 1
  })
]);

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

function semanticBooleanContractViolation(source) {
  const sourceFile = ts.createSourceFile(
    'semantic-data-attribute.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const implementations = sourceFile.statements.filter((statement) => (
    ts.isFunctionDeclaration(statement)
    && statement.name?.text === 'semanticBoolean'
  ));
  const aliases = sourceFile.statements.filter((statement) => (
    ts.isTypeAliasDeclaration(statement)
    && statement.name.text === 'SemanticBoolean'
  ));
  const implementation = implementations.length === 1
    ? implementations[0]
    : undefined;
  const alias = aliases.length === 1 ? aliases[0] : undefined;
  const parameter = implementation?.parameters[0];
  const statements = implementation?.body?.statements ?? [];
  const returned = statements.length === 1 && ts.isReturnStatement(statements[0])
    ? statements[0].expression
    : undefined;
  const aliasValues = alias && ts.isUnionTypeNode(alias.type)
    ? alias.type.types.flatMap((type) => (
        ts.isLiteralTypeNode(type) && ts.isStringLiteral(type.literal)
          ? [type.literal.text]
          : []
      )).sort()
    : [];
  const valid = Boolean(
    implementation
    && alias
    && sourceFile.statements.length === 2
    && implementation.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
    )
    && alias.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
    )
    && ts.isUnionTypeNode(alias.type)
    && alias.type.types.length === 2
    && aliasValues.join(',') === 'false,true'
    && implementation.parameters.length === 1
    && parameter
    && ts.isIdentifier(parameter.name)
    && parameter.type?.kind === ts.SyntaxKind.BooleanKeyword
    && implementation.type
    && ts.isTypeReferenceNode(implementation.type)
    && ts.isIdentifier(implementation.type.typeName)
    && implementation.type.typeName.text === 'SemanticBoolean'
    && returned
    && ts.isConditionalExpression(returned)
    && ts.isIdentifier(returned.condition)
    && returned.condition.text === parameter.name.text
    && ts.isStringLiteral(returned.whenTrue)
    && returned.whenTrue.text === 'true'
    && ts.isStringLiteral(returned.whenFalse)
    && returned.whenFalse.text === 'false'
  );
  return valid
    ? []
    : [
        'src/runtime/semantic-data-attribute.ts: semanticBoolean must use the '
          + 'frozen boolean branch implementation'
      ];
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
  const unsafe = [];
  const visit = (node) => {
    if (ts.isJsxAttribute(node)) {
      const label = ts.isIdentifier(node.name) ? node.name.text : undefined;
      if (label && labels.has(label)) {
        const initializer = node.initializer;
        const expression = initializer && ts.isJsxExpression(initializer)
          ? initializer.expression
          : initializer;
        if (!textualBooleanWriter(expression)) {
          unsafe.push(label);
        }
      }
    } else if (
      ts.isBinaryExpression(node)
      && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ) {
      const label = datasetPropertyWriter(node.left, labelByProperty);
      if (label && !textualBooleanWriter(node.right)) {
        unsafe.push(label);
      }
    } else if (ts.isCallExpression(node)) {
      const writer = setAttributeWriter(node, labels);
      if (writer && !textualBooleanWriter(writer.expression)) {
        unsafe.push(writer.label);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return unsafe.sort();
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
  runtimeSources,
  legacyDebt = []
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

  const unsafeCounts = new Map();
  for (const { file, source } of runtimeSources) {
    for (const label of unsafeBooleanWriters(file, source, attributes)) {
      const key = `${file}\0${label}`;
      unsafeCounts.set(key, (unsafeCounts.get(key) ?? 0) + 1);
    }
  }

  const debtCounts = new Map();
  for (const debt of legacyDebt) {
    const key = `${debt.file}\0${debt.attribute}`;
    debtCounts.set(key, (debtCounts.get(key) ?? 0) + debt.count);
  }

  for (const [key, count] of unsafeCounts) {
    const [file, label] = key.split('\0');
    const allowed = debtCounts.get(key) ?? 0;
    for (let index = allowed; index < count; index += 1) {
      violations.push(
        `${file}: ${label} must use semanticBoolean(...) or a textual literal`
      );
    }
  }
  for (const [key, expected] of debtCounts) {
    const found = unsafeCounts.get(key) ?? 0;
    if (found < expected) {
      const [file, label] = key.split('\0');
      violations.push(
        `${file}: ${label} legacy debt baseline is stale; `
          + `expected ${expected}, found ${found}`
      );
    }
  }
  return violations;
}

export function verifyBooleanDataContract(root = APP_ROOT, {
  legacyDebt = LEGACY_PHONE_BOOLEAN_DEBT
} = {}) {
  const srcRoot = path.join(root, 'src');
  const relative = (file) => path.relative(root, file).split(path.sep).join('/');
  const cssSources = collectFiles(srcRoot, new Set(['.css']))
    .map((file) => ({ file: relative(file), source: fs.readFileSync(file, 'utf8') }));
  const runtimeSources = collectFiles(srcRoot, new Set(['.ts', '.tsx']))
    .filter((file) => {
      const name = relative(file);
      // Tests/harness fixtures are not production writers. The legacy phone
      // tree is scanned and constrained by the exact debt ledger above.
      return !name.startsWith('src/harness/')
        && !name.includes('/__fixtures__/')
        && !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(name);
    })
    .map((file) => ({ file: relative(file), source: fs.readFileSync(file, 'utf8') }));
  const helperPath = path.join(srcRoot, 'runtime/semantic-data-attribute.ts');
  const helperViolations = semanticBooleanContractViolation(
    fs.existsSync(helperPath) ? fs.readFileSync(helperPath, 'utf8') : ''
  );
  return [
    ...helperViolations,
    ...booleanDataContractViolations({
      viteSource: fs.readFileSync(path.join(root, 'vite.config.ts'), 'utf8'),
      cssSources,
      runtimeSources,
      legacyDebt
    })
  ];
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
