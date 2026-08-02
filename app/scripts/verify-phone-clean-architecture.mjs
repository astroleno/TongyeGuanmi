import { access, readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_APP_ROOT = path.dirname(path.dirname(SCRIPT_PATH));

export const PHONE_CORE_PRODUCTION_ALLOWLIST = Object.freeze([
  'PhoneBrandLabStory.tsx',
  'PhoneStoryShell.tsx',
  'machine.ts',
  'manifest.ts',
  'presentation.ts',
  'protocol.ts',
  'runtime.ts',
  'scenes.tsx',
  'styles.css',
  'transitions.tsx'
]);

export const PHONE_CORE_LOC_BUDGETS = Object.freeze({
  'protocol.ts': 450,
  'presentation.ts': 900,
  'manifest.ts': 550,
  'machine.ts': 1100,
  'runtime.ts': 1000,
  'PhoneStoryShell.tsx': 500,
  'scenes.tsx': 700,
  'transitions.tsx': 700,
  'PhoneBrandLabStory.tsx': 120
});

export const PHONE_CORE_TOTAL_LOC_BUDGET = 5000;
export const PHONE_JS_HARD_CAP_BYTES = 663_552;

const allowedCoreImports = new Map([
  ['protocol.ts', new Set()],
  ['manifest.ts', new Set(['protocol.ts'])],
  ['machine.ts', new Set(['manifest.ts', 'protocol.ts'])],
  ['presentation.ts', new Set(['manifest.ts', 'protocol.ts'])],
  ['runtime.ts', new Set([
    'machine.ts',
    'manifest.ts',
    'presentation.ts',
    'protocol.ts'
  ])],
  ['scenes.tsx', new Set(['manifest.ts', 'presentation.ts', 'protocol.ts'])],
  ['transitions.tsx', new Set(['manifest.ts', 'presentation.ts', 'protocol.ts'])],
  ['PhoneStoryShell.tsx', new Set([
    'manifest.ts',
    'presentation.ts',
    'protocol.ts',
    'runtime.ts',
    'scenes.tsx',
    'transitions.tsx'
  ])],
  ['PhoneBrandLabStory.tsx', new Set(['PhoneStoryShell.tsx'])]
]);

const allowedExternalCoreImports = new Map([
  ['protocol.ts', new Set()],
  ['manifest.ts', new Set([
    '../../story/canonical-spine',
    '../../story/manifest',
    '../../story/timings',
    '../../story/types'
  ])],
  ['machine.ts', new Set()],
  ['presentation.ts', new Set()],
  ['runtime.ts', new Set()],
  ['scenes.tsx', new Set(['react'])],
  ['transitions.tsx', new Set(['react'])],
  ['PhoneStoryShell.tsx', new Set([
    'react',
    './styles.css',
    '../StoryLoader',
    '../StoryNav',
    '../navigation'
  ])],
  ['PhoneBrandLabStory.tsx', new Set()]
]);

const forbiddenCoreDirectories = new Set([
  'adapters',
  'compat',
  'contracts',
  'projectors',
  'registries',
  'runtime'
]);

const browserGlobalNames = new Set([
  'AnimationFrameProvider',
  'CanvasRenderingContext2D',
  'Document',
  'Element',
  'Event',
  'EventTarget',
  'HTMLCanvasElement',
  'HTMLElement',
  'HTMLImageElement',
  'HTMLMediaElement',
  'HTMLVideoElement',
  'History',
  'Location',
  'MediaQueryList',
  'MutationObserver',
  'Navigator',
  'ResizeObserver',
  'Storage',
  'VisualViewport',
  'WebGL2RenderingContext',
  'WebGLRenderingContext',
  'Window',
  'cancelAnimationFrame',
  'document',
  'history',
  'localStorage',
  'location',
  'matchMedia',
  'navigator',
  'requestAnimationFrame',
  'screen',
  'sessionStorage',
  'visualViewport',
  'window'
]);

function slash(value) {
  return value.split(path.sep).join('/');
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function filesBelow(directory) {
  if (!await exists(directory)) return [];
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
  return files.sort();
}

function isTypeScript(file) {
  return /\.[cm]?[jt]sx?$/.test(file);
}

function isProductionSource(file) {
  const normalized = slash(file);
  return isTypeScript(file)
    && !normalized.includes('/__tests__/')
    && !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(normalized);
}

function nonBlankLineCount(source) {
  return source.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
}

function sourceFileFor(file, source) {
  const scriptKind = /\.[cm]?tsx$/i.test(file)
    ? ts.ScriptKind.TSX
    : ts.ScriptKind.TS;
  return ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind
  );
}

function moduleImports(sourceFile) {
  const imports = [];
  const add = (specifier, typeOnly, node, syntaxViolation) => {
    imports.push({
      specifier: specifier || '<computed>',
      typeOnly,
      node,
      syntaxViolation
    });
  };
  const visit = (node) => {
    if (
      ts.isImportDeclaration(node)
      && ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      const clause = node.importClause;
      const namedBindings = clause?.namedBindings;
      const namedSpecifiers = namedBindings && ts.isNamedImports(namedBindings)
        ? namedBindings.elements
        : [];
      const typeOnly = Boolean(clause?.isTypeOnly) || (
        !clause?.name
        && namedSpecifiers.length > 0
        && namedSpecifiers.every((specifier) => specifier.isTypeOnly)
      );
      add(
        node.moduleSpecifier.text,
        typeOnly,
        node
      );
    } else if (
      ts.isExportDeclaration(node)
      && node.moduleSpecifier
      && ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      const namedExports = node.exportClause && ts.isNamedExports(node.exportClause)
        ? node.exportClause.elements
        : [];
      add(
        node.moduleSpecifier.text,
        Boolean(node.isTypeOnly) || (
          namedExports.length > 0
          && namedExports.every((specifier) => specifier.isTypeOnly)
        ),
        node
      );
    } else if (
      ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const argument = node.arguments.length === 1 ? node.arguments[0] : undefined;
      if (argument && ts.isStringLiteralLike(argument)) {
        add(argument.text, false, node);
      } else {
        add(undefined, false, node, 'computed dynamic import()');
      }
    } else if (
      ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'require'
    ) {
      const argument = node.arguments.length === 1 ? node.arguments[0] : undefined;
      add(
        argument && ts.isStringLiteralLike(argument) ? argument.text : undefined,
        false,
        node,
        'CommonJS require()'
      );
    } else if (
      ts.isImportEqualsDeclaration(node)
      && ts.isExternalModuleReference(node.moduleReference)
    ) {
      const expression = node.moduleReference.expression;
      add(
        expression && ts.isStringLiteralLike(expression) ? expression.text : undefined,
        Boolean(node.isTypeOnly),
        node,
        'import = require()'
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return imports;
}

function namedDefinitions(sourceFile, prefix) {
  const found = [];
  const visit = (node) => {
    let name;
    if (
      (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node))
      && node.name
    ) {
      name = node.name.text;
    } else if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.initializer
      && (
        ts.isArrowFunction(node.initializer)
        || ts.isFunctionExpression(node.initializer)
      )
    ) {
      name = node.name.text;
    }
    if (name?.startsWith(prefix)) found.push(name);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function canonicalSymbol(checker, symbol) {
  let current = symbol;
  const seen = new Set();
  while (current && current.flags & ts.SymbolFlags.Alias && !seen.has(current)) {
    seen.add(current);
    const resolved = checker.getAliasedSymbol(current);
    if (!resolved || resolved === current) break;
    current = resolved;
  }
  return current;
}

function symbolForExpression(checker, expression) {
  if (ts.isPropertyAccessExpression(expression)) {
    return checker.getSymbolAtLocation(expression.name)
      ?? checker.getSymbolAtLocation(expression);
  }
  if (
    ts.isElementAccessExpression(expression)
    && expression.argumentExpression
    && ts.isStringLiteralLike(expression.argumentExpression)
  ) {
    return checker
      .getTypeAtLocation(expression.expression)
      .getProperty(expression.argumentExpression.text)
      ?? checker.getSymbolAtLocation(expression);
  }
  return checker.getSymbolAtLocation(expression);
}

function unwrappedExpression(expression) {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current)
    || ts.isAsExpression(current)
    || ts.isTypeAssertionExpression(current)
    || ts.isNonNullExpression(current)
    || ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function runtimeFactoryUsage(rootSourceFiles) {
  const rootNames = rootSourceFiles.map((file) => path.resolve(file));
  const rootSet = new Set(rootNames);
  const program = ts.createProgram({
    rootNames,
    options: {
      allowJs: true,
      checkJs: false,
      jsx: ts.JsxEmit.Preserve,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noLib: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.Latest
    }
  });
  const checker = program.getTypeChecker();
  const sourceFiles = program.getSourceFiles().filter(
    (sourceFile) => rootSet.has(path.resolve(sourceFile.fileName))
  );
  const factorySymbols = new Set();
  const assignedExpressions = new Map();

  for (const sourceFile of sourceFiles) {
    const visit = (node) => {
      const declarationName = (
        (ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node))
        && node.name
        && ts.isIdentifier(node.name)
      ) ? node.name : undefined;
      if (declarationName?.text === 'createPhoneStoryRuntime') {
        const symbol = checker.getSymbolAtLocation(declarationName);
        if (symbol) factorySymbols.add(canonicalSymbol(checker, symbol));
      }
      if (
        ts.isBinaryExpression(node)
        && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
        && ts.isIdentifier(node.left)
      ) {
        const symbol = checker.getSymbolAtLocation(node.left);
        const canonical = symbol && canonicalSymbol(checker, symbol);
        if (canonical) {
          const expressions = assignedExpressions.get(canonical) ?? [];
          expressions.push(node.right);
          assignedExpressions.set(canonical, expressions);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  const symbolReferencesFactory = (symbol, seen) => {
    const canonical = canonicalSymbol(checker, symbol);
    if (!canonical || seen.has(canonical)) return false;
    if (factorySymbols.has(canonical)) return true;
    seen.add(canonical);
    for (const declaration of canonical.declarations ?? []) {
      if (
        ts.isVariableDeclaration(declaration)
        && declaration.initializer
        && expressionReferencesFactory(declaration.initializer, seen)
      ) {
        return true;
      }
    }
    return (assignedExpressions.get(canonical) ?? []).some(
      (expression) => expressionReferencesFactory(expression, seen)
    );
  };
  const expressionReferencesFactory = (expression, seen = new Set()) => {
    const unwrapped = unwrappedExpression(expression);
    const symbol = symbolForExpression(checker, unwrapped);
    return Boolean(symbol && symbolReferencesFactory(symbol, seen));
  };
  const syntacticFactoryReference = (expression) => {
    const unwrapped = unwrappedExpression(expression);
    return ts.isIdentifier(unwrapped)
      && unwrapped.text === 'createPhoneStoryRuntime';
  };

  const calls = [];
  const escapes = [];
  const escapeKeys = new Set();
  const addEscape = (sourceFile, node) => {
    const key = `${sourceFile.fileName}:${node.pos}:${node.end}`;
    if (escapeKeys.has(key)) return;
    escapeKeys.add(key);
    escapes.push({ file: sourceFile.fileName, node });
  };
  const isTransportOrDefinition = (node) => {
    const parent = node.parent;
    if (
      ts.isImportSpecifier(parent)
      || ts.isImportClause(parent)
      || ts.isNamespaceImport(parent)
      || ts.isExportSpecifier(parent)
      || (
        ts.isExportAssignment(parent)
        && parent.expression === node
      )
    ) {
      return true;
    }
    return (
      (
        ts.isFunctionDeclaration(parent)
        || ts.isClassDeclaration(parent)
        || ts.isVariableDeclaration(parent)
      )
      && parent.name === node
    );
  };
  const isNestedExpressionName = (node) => {
    const parent = node.parent;
    return (
      ts.isPropertyAccessExpression(parent)
      && parent.name === node
    ) || (
      ts.isElementAccessExpression(parent)
      && parent.argumentExpression === node
    );
  };
  const isTypeOnlyReference = (node) => {
    let current = node.parent;
    while (current && !ts.isStatement(current) && !ts.isSourceFile(current)) {
      if (ts.isTypeNode(current) || ts.isTypeElement(current)) return true;
      current = current.parent;
    }
    return false;
  };
  const isDirectCallTarget = (node) => {
    let current = node;
    while (
      current.parent
      && (
        ts.isParenthesizedExpression(current.parent)
        || ts.isAsExpression(current.parent)
        || ts.isTypeAssertionExpression(current.parent)
        || ts.isNonNullExpression(current.parent)
        || ts.isSatisfiesExpression(current.parent)
      )
      && current.parent.expression === current
    ) {
      current = current.parent;
    }
    return ts.isCallExpression(current.parent)
      && current.parent.expression === current;
  };
  const bindingElementReferencesFactory = (node) => {
    if (!ts.isObjectBindingPattern(node.parent)) return false;
    const propertyNode = node.propertyName ?? node.name;
    if (
      !ts.isIdentifier(propertyNode)
      && !ts.isStringLiteralLike(propertyNode)
    ) {
      return false;
    }
    const directSymbol = checker.getSymbolAtLocation(propertyNode);
    if (
      directSymbol
      && symbolReferencesFactory(directSymbol, new Set())
    ) {
      return true;
    }
    const declaration = node.parent.parent;
    if (!ts.isVariableDeclaration(declaration) || !declaration.initializer) {
      return false;
    }
    const property = checker
      .getTypeAtLocation(declaration.initializer)
      .getProperty(propertyNode.text);
    return Boolean(
      property
      && symbolReferencesFactory(property, new Set())
    );
  };

  for (const sourceFile of sourceFiles) {
    const visit = (node) => {
      if (
        ts.isCallExpression(node)
        && (
          syntacticFactoryReference(node.expression)
          || expressionReferencesFactory(node.expression)
        )
      ) {
        calls.push({ file: sourceFile.fileName, node });
      }
      if (
        ts.isBindingElement(node)
        && bindingElementReferencesFactory(node)
      ) {
        addEscape(sourceFile, node);
      }
      if (
        (
          ts.isIdentifier(node)
          || ts.isPropertyAccessExpression(node)
          || ts.isElementAccessExpression(node)
        )
        && !isNestedExpressionName(node)
        && !isTransportOrDefinition(node)
        && !isTypeOnlyReference(node)
        && !isDirectCallTarget(node)
        && expressionReferencesFactory(node)
      ) {
        addEscape(sourceFile, node);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return { calls, escapes };
}

function identifiers(sourceFile, names) {
  const found = new Set();
  const visit = (node) => {
    if (ts.isIdentifier(node) && names.has(node.text)) {
      const parent = node.parent;
      const propertyName = (
        ts.isPropertyAccessExpression(parent)
        && parent.name === node
      ) || (
        (ts.isPropertyAssignment(parent)
          || ts.isPropertySignature(parent)
          || ts.isMethodSignature(parent)
          || ts.isMethodDeclaration(parent))
        && parent.name === node
      );
      if (!propertyName) found.add(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function allNamedIdentifiers(sourceFile, names) {
  const found = new Set();
  const visit = (node) => {
    if (ts.isIdentifier(node) && names.has(node.text)) {
      found.add(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function stringLiterals(sourceFile) {
  const values = [];
  const visit = (node) => {
    if (ts.isStringLiteralLike(node)) values.push(node.text);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return values;
}

function hasLocationSearch(sourceFile) {
  let found = false;
  const visit = (node) => {
    if (
      ts.isPropertyAccessExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'location'
      && node.name.text === 'search'
    ) {
      found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function orientationListenerCount(sourceFile) {
  let count = 0;
  const visit = (node) => {
    if (
      ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'addEventListener'
      && node.arguments[0]
      && ts.isStringLiteral(node.arguments[0])
      && (
        node.arguments[0].text === 'orientationchange'
        || node.arguments[0].text === 'change'
          && node.expression.expression.getText(sourceFile).includes('orientation')
      )
    ) {
      count += 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return count;
}

function stripTypeScriptComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function propertyMangleViolation(viteSource) {
  const source = stripTypeScriptComments(viteSource);
  return (
    /\bmangle\s*:\s*\{[\s\S]{0,1000}?\bproperties\s*:/.test(source)
    || /\b(?:mangleProperties|propertyMangle|mangleProps)\b/.test(source)
  );
}

function provenancePluginViolations(viteSource) {
  const source = stripTypeScriptComments(viteSource);
  const required = [
    ['r5-module-provenance', 'plugin name'],
    ['generateBundle', 'generateBundle hook'],
    ['audit/r5-module-provenance.json', 'audit output path'],
    ['.modules', 'Rollup OutputChunk.modules read'],
    ['emitFile', 'Rollup audit emission']
  ];
  return required
    .filter(([marker]) => !source.includes(marker))
    .map(([, label]) => (
      `vite.config.ts: r5-module-provenance plugin is missing its ${label}`
    ));
}

function coreTarget(importer, specifier, coreFilesByStem) {
  if (!specifier.startsWith('.')) return undefined;
  const resolved = path.resolve(path.dirname(importer), specifier);
  const sourceStem = /\.[cm]?[jt]sx?$/.test(path.extname(resolved))
    ? resolved.replace(/\.[^.]+$/, '')
    : resolved;
  return coreFilesByStem.get(resolved)
    ?? coreFilesByStem.get(sourceStem)
    ?? coreFilesByStem.get(path.join(resolved, 'index'));
}

function safeLeafImport(specifier, kind) {
  const prefix = `../../${kind}/`;
  if (!specifier.startsWith(prefix)) return false;
  const tail = specifier.slice(prefix.length);
  return tail.length > 0
    && !tail.split('/').some((part) => part === '.' || part === '..');
}

function externalCoreImportAllowed(name, imported) {
  if (allowedExternalCoreImports.get(name)?.has(imported.specifier)) {
    return true;
  }
  if (!ts.isCallExpression(imported.node)) return false;
  return (
    name === 'scenes.tsx'
    && safeLeafImport(imported.specifier, 'scenes')
  ) || (
    name === 'transitions.tsx'
    && safeLeafImport(imported.specifier, 'transitions')
  );
}

function detectCycles(graph) {
  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  const cycles = [];
  const visit = (node) => {
    if (visited.has(node)) return;
    if (visiting.has(node)) {
      const start = stack.indexOf(node);
      cycles.push([...stack.slice(start), node]);
      return;
    }
    visiting.add(node);
    stack.push(node);
    for (const target of graph.get(node) ?? []) visit(target);
    stack.pop();
    visiting.delete(node);
    visited.add(node);
  };
  for (const node of graph.keys()) visit(node);
  return cycles;
}

function productionQueryViolation(sourceFile) {
  const queryIdentifiers = identifiers(
    sourceFile,
    new Set(['URLSearchParams', 'validationMode'])
  );
  if (queryIdentifiers.size > 0 || hasLocationSearch(sourceFile)) return true;
  return stringLiterals(sourceFile).some((value) => (
    value.includes('portrait-spike-motion')
    || /(?:^|[?&])v=\d+(?:$|[&#])/.test(value)
  ));
}

function importLooksLikeLifecycleOwner(specifier) {
  return [
    '/phone-story/machine',
    '/phone-story/runtime',
    '/production/input-controller',
    '/phone-loader-lifecycle',
    '/phone-stage-timeline',
    '/phone-transition-coordinator',
    '/portrait-spike/',
    '/useMobileLandscapeEntry'
  ].some((marker) => slash(specifier).includes(marker));
}

function storageLineageViolations(sources) {
  const literalConstants = new Map();
  const sourceFiles = sources.map(({ file, source }) => ({
    file,
    sourceFile: sourceFileFor(file, source)
  }));
  for (const { sourceFile } of sourceFiles) {
    const visit = (node) => {
      if (
        ts.isVariableDeclaration(node)
        && ts.isIdentifier(node.name)
        && node.initializer
        && ts.isStringLiteral(node.initializer)
      ) {
        literalConstants.set(node.name.text, node.initializer.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  let foundSetItem = false;
  let stableKey = false;
  for (const { sourceFile } of sourceFiles) {
    const visit = (node) => {
      if (
        ts.isCallExpression(node)
        && ts.isPropertyAccessExpression(node.expression)
        && node.expression.name.text === 'setItem'
        && node.expression.expression.getText(sourceFile).includes('sessionStorage')
      ) {
        foundSetItem = true;
        const key = node.arguments[0];
        const literal = key && ts.isStringLiteral(key)
          ? key.text
          : key && ts.isIdentifier(key)
            ? literalConstants.get(key.text)
            : undefined;
        if (
          literal
          && /lineage/i.test(literal)
          && !/(?:build|module|url)/i.test(literal)
        ) {
          stableKey = true;
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return foundSetItem && stableKey
    ? []
    : [
        'phone-core recovery must persist one cross-reload lineage under '
          + 'a stable key, not mutable build/module URL identity'
      ];
}

function recoveryBoundaryViolations(sources, referenceSources = sources) {
  if (sources.length === 0) {
    return ['cutover is missing an eager phone-core recovery boundary'];
  }
  const rootNames = referenceSources.map(({ file }) => path.resolve(file));
  const boundaryRootSet = new Set(sources.map(({ file }) => path.resolve(file)));
  const referenceRootSet = new Set(rootNames);
  const program = ts.createProgram({
    rootNames,
    options: {
      allowJs: true,
      checkJs: false,
      jsx: ts.JsxEmit.Preserve,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noLib: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.Latest
    }
  });
  const checker = program.getTypeChecker();
  const sourceFiles = program.getSourceFiles()
    .filter((sourceFile) => boundaryRootSet.has(path.resolve(sourceFile.fileName)))
    .map((sourceFile) => ({
      file: path.resolve(sourceFile.fileName),
      sourceFile
    }));
  const programSourceFiles = program.getSourceFiles()
    .filter((sourceFile) => referenceRootSet.has(path.resolve(sourceFile.fileName)))
    .map((sourceFile) => ({
      file: path.resolve(sourceFile.fileName),
      sourceFile
    }));
  const programSourceByFile = new Map(
    programSourceFiles.map((entry) => [entry.file, entry])
  );
  const programFilesByStem = new Map();
  for (const { file } of programSourceFiles) {
    programFilesByStem.set(file, file);
    programFilesByStem.set(file.replace(/\.[^.]+$/, ''), file);
  }
  const eagerReferenceFiles = new Set();
  const visitEagerReference = (file) => {
    if (eagerReferenceFiles.has(file)) return;
    const entry = programSourceByFile.get(file);
    if (!entry) return;
    eagerReferenceFiles.add(file);
    for (const imported of moduleImports(entry.sourceFile)) {
      if (
        imported.syntaxViolation
        || imported.typeOnly
        || (
          ts.isCallExpression(imported.node)
          && imported.node.expression.kind === ts.SyntaxKind.ImportKeyword
        )
      ) {
        continue;
      }
      const target = coreTarget(file, imported.specifier, programFilesByStem);
      if (target) visitEagerReference(target);
    }
  };
  for (const { file } of sourceFiles) visitEagerReference(file);
  const referenceSourceFiles = [...eagerReferenceFiles]
    .map((file) => programSourceByFile.get(file))
    .filter(Boolean);
  const functionDefinitions = new Map();
  const addFunction = (name, node) => {
    const definitions = functionDefinitions.get(name) ?? [];
    definitions.push(node);
    functionDefinitions.set(name, definitions);
  };
  for (const { sourceFile } of sourceFiles) {
    const visit = (node) => {
      if (ts.isFunctionDeclaration(node) && node.name) {
        addFunction(node.name.text, node);
      } else if (
        ts.isVariableDeclaration(node)
        && ts.isIdentifier(node.name)
        && node.initializer
        && (
          ts.isArrowFunction(node.initializer)
          || ts.isFunctionExpression(node.initializer)
        )
      ) {
        addFunction(node.name.text, node.initializer);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  const descendants = (root, predicate) => {
    const found = [];
    const visit = (node) => {
      if (predicate(node)) found.push(node);
      ts.forEachChild(node, visit);
    };
    visit(root);
    return found;
  };
  const isFunctionLike = (node) => (
    ts.isFunctionDeclaration(node)
    || ts.isFunctionExpression(node)
    || ts.isArrowFunction(node)
    || ts.isMethodDeclaration(node)
  );
  const directDescendants = (root, predicate) => {
    const found = [];
    const visit = (node) => {
      if (node !== root && isFunctionLike(node)) return;
      if (predicate(node)) found.push(node);
      ts.forEachChild(node, visit);
    };
    visit(root);
    return found;
  };
  const propertyCall = (node, name) => (
    ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(node.expression)
    && node.expression.name.text === name
  );
  const literalArgument = (call, index, value) => {
    const argument = call.arguments[index];
    return Boolean(argument && ts.isStringLiteralLike(argument) && argument.text === value);
  };
  const uniqueFunction = (name) => {
    const definitions = functionDefinitions.get(name) ?? [];
    return definitions.length === 1 ? definitions[0] : undefined;
  };
  const containsIdentifier = (root, name) => descendants(root, (node) => (
    ts.isIdentifier(node) && node.text === name
  )).length > 0;
  const identifierOwnerCall = (node, owner, name) => (
    propertyCall(node, name)
    && ts.isIdentifier(node.expression.expression)
    && node.expression.expression.text === owner
  );
  const windowLocationReload = (node) => (
    propertyCall(node, 'reload')
    && ts.isPropertyAccessExpression(node.expression.expression)
    && node.expression.expression.name.text === 'location'
    && ts.isIdentifier(node.expression.expression.expression)
    && node.expression.expression.expression.text === 'window'
  );
  const symbolAt = (node) => {
    const symbol = node && checker.getSymbolAtLocation(node);
    return symbol ? canonicalSymbol(checker, symbol) : undefined;
  };
  const hasSameSymbol = (left, right) => {
    const leftSymbol = symbolAt(left);
    const rightSymbol = symbolAt(right);
    return Boolean(leftSymbol && rightSymbol && leftSymbol === rightSymbol);
  };
  const isExported = (node) => Boolean(node?.modifiers?.some((modifier) => (
    modifier.kind === ts.SyntaxKind.ExportKeyword
    || modifier.kind === ts.SyntaxKind.DefaultKeyword
  )));
  const symbolReferences = (symbol) => referenceSourceFiles.flatMap(({ sourceFile }) => (
    descendants(sourceFile, (node) => (
      ts.isIdentifier(node) && symbolAt(node) === symbol
    ))
  ));
  const symbolIsWritten = (symbol) => Boolean(
    symbol && symbolReferences(symbol).some((reference) => ts.isAssignmentTarget(reference))
  );
  const topLevelLiteralKeys = sourceFiles.flatMap(({ sourceFile }) => (
    sourceFile.statements.flatMap((statement) => {
      if (!ts.isVariableStatement(statement)) return [];
      return statement.declarationList.declarations.flatMap((declaration) => {
        const initializer = declaration.initializer
          ? unwrappedExpression(declaration.initializer)
          : undefined;
        if (
          !ts.isIdentifier(declaration.name)
          || !initializer
          || !ts.isStringLiteralLike(initializer)
          || !/lineage/i.test(initializer.text)
          || /(?:build|module|url)/i.test(initializer.text)
        ) {
          return [];
        }
        return [{ declaration, statement }];
      });
    })
  ));
  const canonicalKeyEntry = topLevelLiteralKeys.length === 1
    && Boolean(
      topLevelLiteralKeys[0].statement.declarationList.flags
      & ts.NodeFlags.Const
    )
    && topLevelLiteralKeys[0].statement.declarationList.declarations.length === 1
    ? topLevelLiteralKeys[0]
    : undefined;
  const canonicalKeyName = canonicalKeyEntry?.declaration.name;
  const canonicalKeySymbol = canonicalKeyName && ts.isIdentifier(canonicalKeyName)
    ? symbolAt(canonicalKeyName)
    : undefined;
  const canonicalKeyIsImmutable = Boolean(
    canonicalKeySymbol && !symbolIsWritten(canonicalKeySymbol)
  );
  const canonicalKeyIsPrivate = Boolean(
    canonicalKeyEntry && !isExported(canonicalKeyEntry.statement)
  );
  const listenerCalls = sourceFiles.flatMap(({ sourceFile }) => descendants(
    sourceFile,
    (node) => identifierOwnerCall(node, 'window', 'addEventListener')
      && literalArgument(node, 0, 'vite:preloadError')
  ));
  const listenerCandidate = listenerCalls.length === 1
    ? listenerCalls[0]
    : undefined;
  const listener = listenerCandidate
    && ts.isExpressionStatement(listenerCandidate.parent)
    && ts.isSourceFile(listenerCandidate.parent.parent)
    ? listenerCandidate
    : undefined;
  const handlerReference = listener?.arguments[1];
  const handlerName = handlerReference && ts.isIdentifier(handlerReference)
    ? handlerReference.text
    : undefined;
  const handler = handlerName ? uniqueFunction(handlerName) : undefined;
  const handlerDeclarationName = handler && ts.isFunctionDeclaration(handler)
    ? handler.name
    : undefined;
  const handlerSymbol = handlerDeclarationName
    ? symbolAt(handlerDeclarationName)
    : undefined;
  const handlerBindingIsImmutable = Boolean(
    handlerSymbol && !symbolIsWritten(handlerSymbol)
  );
  const handlerIsPrivate = Boolean(handler && !isExported(handler));
  const listenerBindsCanonicalHandler = Boolean(
    handlerReference
    && handlerDeclarationName
    && hasSameSymbol(handlerReference, handlerDeclarationName)
    && ts.isSourceFile(handler.parent)
  );
  const violations = [];
  if (!canonicalKeyEntry || !canonicalKeyIsImmutable) {
    violations.push(
      'cutover recovery must declare one immutable recovery storage key '
        + 'as a unique top-level const literal'
    );
  }
  if (canonicalKeyEntry && !canonicalKeyIsPrivate) {
    violations.push(
      'cutover recovery storage key must remain private to the eager boundary'
    );
  }
  if (!listener || !handlerName || !handler || !listenerBindsCanonicalHandler) {
    violations.push(
      'cutover recovery must register an executable vite:preloadError handler'
    );
  }
  if (handlerSymbol && !handlerBindingIsImmutable) {
    violations.push(
      'cutover registered recovery handler binding must be immutable'
    );
  }
  if (handler && !handlerIsPrivate) {
    violations.push(
      'cutover recovery handler must remain private to the eager boundary'
    );
  }

  const loadPhoneStoryShell = uniqueFunction('loadPhoneStoryShell');
  if (!loadPhoneStoryShell) {
    violations.push('cutover recovery must define one loadPhoneStoryShell boundary');
  }

  const loaderBody = loadPhoneStoryShell?.body
    && ts.isBlock(loadPhoneStoryShell.body)
    ? loadPhoneStoryShell.body
    : undefined;
  const loaderReturn = loaderBody?.statements.length === 1
    && ts.isReturnStatement(loaderBody.statements[0])
    && loaderBody.statements[0].expression
    ? loaderBody.statements[0]
    : undefined;
  const loaderDeclarationName = loadPhoneStoryShell
    && ts.isFunctionDeclaration(loadPhoneStoryShell)
    ? loadPhoneStoryShell.name
    : undefined;
  const loaderBindingIsImmutable = Boolean(
    loaderDeclarationName
    && !symbolIsWritten(symbolAt(loaderDeclarationName))
  );
  const loaderIsExported = Boolean(
    loadPhoneStoryShell && isExported(loadPhoneStoryShell)
  );

  const phoneCoreImports = sourceFiles.flatMap(({ sourceFile }) => descendants(
    sourceFile,
    (node) => (
      ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length === 1
      && ts.isStringLiteralLike(node.arguments[0])
      && /(?:^|\/)phone-story\/PhoneStoryShell$/.test(node.arguments[0].text)
    )
  ));
  if (phoneCoreImports.length > 1) {
    violations.push(
      'cutover recovery must not retry the phone core import in the same Document'
    );
  } else if (phoneCoreImports.length === 0) {
    violations.push('cutover recovery has no canonical phone-core import');
  }

  const loadImports = loadPhoneStoryShell
    ? directDescendants(loadPhoneStoryShell, (node) => phoneCoreImports.includes(node))
    : [];
  const importRecoveryCallbacks = loadImports.flatMap((phoneImport) => {
    const property = phoneImport.parent;
    const catchCall = property
      && ts.isPropertyAccessExpression(property)
      && property.expression === phoneImport
      && property.name.text === 'catch'
      && ts.isCallExpression(property.parent)
      && property.parent.expression === property
      ? property.parent
      : undefined;
    if (!catchCall) return [];
    const callback = catchCall.arguments[0];
    if (
      !handlerName
      || !callback
      || !isFunctionLike(callback)
      || callback.asteriskToken
      || !ts.isBlock(callback.body)
      || callback.parameters.length !== 1
      || !ts.isIdentifier(callback.parameters[0].name)
      || callback.body.statements.length !== 2
    ) {
      return [];
    }
    const [delegate, rethrow] = callback.body.statements;
    const delegatesDirectly = ts.isExpressionStatement(delegate)
      && ts.isCallExpression(delegate.expression)
      && ts.isIdentifier(delegate.expression.expression)
      && Boolean(handlerDeclarationName)
      && hasSameSymbol(delegate.expression.expression, handlerDeclarationName)
      && delegate.expression.arguments.length === 0;
    const rethrowsImportError = ts.isThrowStatement(rethrow)
      && Boolean(rethrow.expression)
      && ts.isIdentifier(rethrow.expression)
      && hasSameSymbol(rethrow.expression, callback.parameters[0].name);
    return delegatesDirectly && rethrowsImportError ? [callback] : [];
  });
  if (
    loadPhoneStoryShell
    && handlerName
    && (loadImports.length !== 1 || importRecoveryCallbacks.length === 0)
  ) {
    violations.push(
      'cutover phone-core import rejection must use the vite:preloadError '
        + 'recovery handler'
    );
  }
  const canonicalDelegateReferences = importRecoveryCallbacks.flatMap((callback) => {
    const statement = callback.body.statements[0];
    return ts.isExpressionStatement(statement)
      && ts.isCallExpression(statement.expression)
      && ts.isIdentifier(statement.expression.expression)
      ? [statement.expression.expression]
      : [];
  });
  const allowedHandlerReferences = new Set([
    handlerDeclarationName,
    handlerReference,
    ...canonicalDelegateReferences
  ].filter(Boolean));
  if (
    handlerSymbol
    && symbolReferences(handlerSymbol).some(
      (reference) => !allowedHandlerReferences.has(reference)
    )
  ) {
    violations.push(
      'cutover recovery handler has non-canonical references'
    );
  }
  const returnedExpression = loaderReturn?.expression
    ? unwrappedExpression(loaderReturn.expression)
    : undefined;
  const returnedCatchProperty = returnedExpression
    && ts.isCallExpression(returnedExpression)
    && ts.isPropertyAccessExpression(returnedExpression.expression)
    && returnedExpression.expression.name.text === 'catch'
    ? returnedExpression.expression
    : undefined;
  const returnedPhoneImport = returnedCatchProperty
    && ts.isCallExpression(returnedCatchProperty.expression)
    && returnedCatchProperty.expression.expression.kind === ts.SyntaxKind.ImportKeyword
    ? returnedCatchProperty.expression
    : undefined;
  if (
    loadPhoneStoryShell
    && (
      !ts.isFunctionDeclaration(loadPhoneStoryShell)
      || !ts.isSourceFile(loadPhoneStoryShell.parent)
      || !loaderBindingIsImmutable
      || !loaderIsExported
      || loadPhoneStoryShell.parameters.length !== 0
      || !loaderReturn
      || !returnedPhoneImport
      || loadImports.length !== 1
      || loadImports[0] !== returnedPhoneImport
    )
  ) {
    violations.push(
      'cutover loadPhoneStoryShell must directly return the canonical '
        + 'phone-core import catch boundary'
    );
  }
  if (loadPhoneStoryShell && !loaderIsExported) {
    violations.push(
      'cutover loadPhoneStoryShell must be exported from the eager boundary'
    );
  }

  let canonicalStoredRead;
  let canonicalPersistedReload;
  let canonicalStorageKeyReference;
  let canonicalPersistedKeyReference;
  if (handler) {
    const handlerBody = handler.body && ts.isBlock(handler.body)
      ? handler.body
      : undefined;
    const parameter = handler.parameters[0];
    const parameterName = parameter && ts.isIdentifier(parameter.name)
      ? parameter.name.text
      : undefined;
    const preventCalls = directDescendants(handler, (node) => (
      propertyCall(node, 'preventDefault')
      && parameterName
      && containsIdentifier(node.expression.expression, parameterName)
    ));
    if (preventCalls.length === 0) {
      violations.push(
        'cutover vite:preloadError handler must call preventDefault()'
      );
    }
    const firstHandlerStatement = handlerBody?.statements[0];
    const directPreventCall = firstHandlerStatement
      && ts.isExpressionStatement(firstHandlerStatement)
      && ts.isCallExpression(firstHandlerStatement.expression)
      && ts.isPropertyAccessExpression(firstHandlerStatement.expression.expression)
      && firstHandlerStatement.expression.expression.name.text === 'preventDefault'
      && firstHandlerStatement.expression.arguments.length === 0
      && parameter
      && ts.isIdentifier(parameter.name)
      && ts.isIdentifier(firstHandlerStatement.expression.expression.expression)
      && hasSameSymbol(
        firstHandlerStatement.expression.expression.expression,
        parameter.name
      )
      ? firstHandlerStatement.expression
      : undefined;
    if (!directPreventCall) {
      violations.push(
        'cutover vite:preloadError handler must directly call preventDefault()'
      );
    }

    const reloadCalls = directDescendants(handler, windowLocationReload);
    if (reloadCalls.length !== 1) {
      violations.push(
        'cutover recovery must perform exactly one window.location.reload()'
      );
    }

    const bareReturn = (statement) => {
      if (ts.isReturnStatement(statement)) {
        return statement.expression ? undefined : statement;
      }
      if (!ts.isBlock(statement) || statement.statements.length !== 1) {
        return undefined;
      }
      const only = statement.statements[0];
      return ts.isReturnStatement(only) && !only.expression ? only : undefined;
    };
    const boundedGuards = directDescendants(handler, (node) => {
      if (!ts.isIfStatement(node) || !ts.isBinaryExpression(node.expression)) {
        return false;
      }
      const { left, operatorToken, right } = node.expression;
      return operatorToken.kind === ts.SyntaxKind.GreaterThanEqualsToken
        && ts.isPropertyAccessExpression(left)
        && left.name.text === 'automaticReloadCount'
        && ts.isIdentifier(left.expression)
        && ts.isNumericLiteral(right)
        && Number(right.text) === 1
        && !node.elseStatement
        && Boolean(bareReturn(node.thenStatement));
    });
    const boundedGuard = boundedGuards.length === 1 ? boundedGuards[0] : undefined;
    if (!boundedGuard) {
      violations.push('cutover recovery must allow at most one automatic reload');
    }

    const storedReads = directDescendants(handler, (node) => (
      identifierOwnerCall(node, 'sessionStorage', 'getItem')
      && node.arguments.length === 1
    ));
    const storedRead = storedReads.length === 1 ? storedReads[0] : undefined;
    const storedBindings = storedRead ? descendants(handler, (node) => (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.initializer
      && unwrappedExpression(node.initializer) === storedRead
    )) : [];
    const storedBinding = storedBindings.length === 1
      ? storedBindings[0]
      : undefined;
    const lineageName = boundedGuard
      && ts.isBinaryExpression(boundedGuard.expression)
      && ts.isPropertyAccessExpression(boundedGuard.expression.left)
      && ts.isIdentifier(boundedGuard.expression.left.expression)
      ? boundedGuard.expression.left.expression.text
      : undefined;
    const lineageDeclarations = lineageName ? descendants(handler, (node) => (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.name.text === lineageName
      && Boolean(node.initializer)
    )) : [];
    const lineageDeclaration = lineageDeclarations.length === 1
      ? lineageDeclarations[0]
      : undefined;
    const storedBindingName = storedBinding && ts.isIdentifier(storedBinding.name)
      ? storedBinding.name.text
      : undefined;
    const bindingContainsName = (binding, name) => {
      if (ts.isIdentifier(binding)) return binding.text === name;
      return binding.elements.some((element) => (
        !ts.isOmittedExpression(element)
        && bindingContainsName(element.name, name)
      ));
    };
    const valueBindingsNamed = (name) => descendants(handler, (node) => (
      (
        (ts.isVariableDeclaration(node) || ts.isParameter(node))
        && bindingContainsName(node.name, name)
      )
      || (
        (
          ts.isFunctionDeclaration(node)
          || ts.isFunctionExpression(node)
          || ts.isClassDeclaration(node)
          || ts.isClassExpression(node)
          || ts.isEnumDeclaration(node)
        )
        && node.name?.text === name
      )
    ));
    const topLevelBindsName = (name) => handler.getSourceFile().statements.some(
      (statement) => {
        if (ts.isVariableStatement(statement)) {
          return statement.declarationList.declarations.some((declaration) => (
            bindingContainsName(declaration.name, name)
          ));
        }
        if (
          (
            ts.isFunctionDeclaration(statement)
            || ts.isClassDeclaration(statement)
            || ts.isEnumDeclaration(statement)
            || ts.isImportEqualsDeclaration(statement)
          )
          && statement.name?.text === name
        ) {
          return true;
        }
        if (!ts.isImportDeclaration(statement) || !statement.importClause) {
          return false;
        }
        const clause = statement.importClause;
        if (clause.name?.text === name) return true;
        if (!clause.namedBindings) return false;
        if (ts.isNamespaceImport(clause.namedBindings)) {
          return clause.namedBindings.name.text === name;
        }
        return clause.namedBindings.elements.some(
          (specifier) => specifier.name.text === name
        );
      }
    );
    const variableStatementFor = (declaration) => {
      const declarationList = declaration?.parent;
      const statement = declarationList?.parent;
      return declarationList
        && ts.isVariableDeclarationList(declarationList)
        && statement
        && ts.isVariableStatement(statement)
        ? statement
        : undefined;
    };
    const singleConstStatement = (declaration) => {
      const statement = variableStatementFor(declaration);
      return statement
        && statement.declarationList.declarations.length === 1
        && Boolean(statement.declarationList.flags & ts.NodeFlags.Const)
        ? statement
        : undefined;
    };
    const finalNumericProperty = (expression, name, value) => {
      const object = unwrappedExpression(expression);
      if (!ts.isObjectLiteralExpression(object)) return false;
      const last = object.properties.at(-1);
      if (!last || !ts.isPropertyAssignment(last)) return false;
      const propertyName = ts.isIdentifier(last.name) || ts.isStringLiteralLike(last.name)
        ? last.name.text
        : undefined;
      const initializer = unwrappedExpression(last.initializer);
      return propertyName === name
        && ts.isNumericLiteral(initializer)
        && Number(initializer.text) === value;
    };
    const lineageInitializer = lineageDeclaration?.initializer
      ? unwrappedExpression(lineageDeclaration.initializer)
      : undefined;
    const parsedBranch = lineageInitializer
      && ts.isConditionalExpression(lineageInitializer)
      ? unwrappedExpression(lineageInitializer.whenTrue)
      : undefined;
    const parsesExactStoredBinding = Boolean(
      parsedBranch
      && propertyCall(parsedBranch, 'parse')
      && ts.isIdentifier(parsedBranch.expression.expression)
      && parsedBranch.expression.expression.text === 'JSON'
      && parsedBranch.arguments.length === 1
      && ts.isIdentifier(parsedBranch.arguments[0])
      && parsedBranch.arguments[0].text === storedBindingName
    );
    const storedStatement = singleConstStatement(storedBinding);
    const lineageStatement = singleConstStatement(lineageDeclaration);
    const canonicalStatementSequence = Boolean(
      storedStatement
      && lineageStatement
      && boundedGuard
      && storedStatement.parent === lineageStatement.parent
      && lineageStatement.parent === boundedGuard.parent
      && ts.isBlock(storedStatement.parent)
      && storedStatement.parent.statements.indexOf(lineageStatement)
        === storedStatement.parent.statements.indexOf(storedStatement) + 1
      && storedStatement.parent.statements.indexOf(boundedGuard)
        === storedStatement.parent.statements.indexOf(lineageStatement) + 1
    );
    const parsesStoredLineage = Boolean(
      storedRead
      && storedBindingName
      && lineageName
      && lineageInitializer
      && ts.isConditionalExpression(lineageInitializer)
      && ts.isIdentifier(unwrappedExpression(lineageInitializer.condition))
      && unwrappedExpression(lineageInitializer.condition).text === storedBindingName
      && parsesExactStoredBinding
      && finalNumericProperty(
        lineageInitializer.whenFalse,
        'automaticReloadCount',
        0
      )
      && valueBindingsNamed(storedBindingName).length === 1
      && valueBindingsNamed(lineageName).length === 1
      && ['JSON', 'sessionStorage', 'window'].every((name) => (
        valueBindingsNamed(name).length === 0 && !topLevelBindsName(name)
      ))
      && canonicalStatementSequence
    );
    if (!parsesStoredLineage) {
      violations.push(
        'cutover recovery reload bound must derive from stored lineage'
      );
    }

    const sessionStorageMethod = (node) => {
      if (!ts.isCallExpression(node)) return undefined;
      const target = unwrappedExpression(node.expression);
      if (
        ts.isPropertyAccessExpression(target)
        && ts.isIdentifier(unwrappedExpression(target.expression))
        && unwrappedExpression(target.expression).text === 'sessionStorage'
      ) {
        return target.name.text;
      }
      if (
        ts.isElementAccessExpression(target)
        && ts.isIdentifier(unwrappedExpression(target.expression))
        && unwrappedExpression(target.expression).text === 'sessionStorage'
        && target.argumentExpression
        && ts.isStringLiteralLike(target.argumentExpression)
      ) {
        return target.argumentExpression.text;
      }
      return undefined;
    };
    const persistsOneReload = (node) => {
      if (sessionStorageMethod(node) !== 'setItem') return false;
      const serialized = node.arguments[1]
        ? unwrappedExpression(node.arguments[1])
        : undefined;
      if (
        !serialized
        || !propertyCall(serialized, 'stringify')
        || !ts.isIdentifier(serialized.expression.expression)
        || serialized.expression.expression.text !== 'JSON'
      ) {
        return false;
      }
      const record = serialized.arguments[0]
        ? unwrappedExpression(serialized.arguments[0])
        : undefined;
      if (!record || !ts.isObjectLiteralExpression(record)) return false;
      const last = record.properties.at(-1);
      if (!last || !ts.isPropertyAssignment(last)) return false;
      const name = ts.isIdentifier(last.name) || ts.isStringLiteralLike(last.name)
        ? last.name.text
        : undefined;
      const value = unwrappedExpression(last.initializer);
      return name === 'automaticReloadCount'
        && ts.isNumericLiteral(value)
        && Number(value.text) === 1;
    };
    const persistedReloads = directDescendants(handler, persistsOneReload);
    const persistedReload = persistedReloads.length === 1
      ? persistedReloads[0]
      : undefined;
    const storageKey = storedRead?.arguments[0];
    const persistedKey = persistedReload?.arguments[0];
    canonicalStoredRead = storedRead;
    canonicalPersistedReload = persistedReload;
    canonicalStorageKeyReference = storageKey;
    canonicalPersistedKeyReference = persistedKey;
    const usesCanonicalKey = (argument) => Boolean(
      canonicalKeySymbol
      && argument
      && ts.isIdentifier(unwrappedExpression(argument))
      && symbolAt(unwrappedExpression(argument)) === canonicalKeySymbol
    );
    const persistsReloadCount = Boolean(
      persistedReload
      && usesCanonicalKey(storageKey)
      && usesCanonicalKey(persistedKey)
    );
    if (!persistsReloadCount) {
      violations.push(
        'cutover recovery must persist automaticReloadCount: 1 before reloading'
      );
    }
    const handlerUsesCanonicalKey = usesCanonicalKey(storageKey)
      && usesCanonicalKey(persistedKey);
    if (canonicalKeySymbol && !handlerUsesCanonicalKey) {
      violations.push(
        'cutover recovery getItem/setItem must use the canonical recovery storage key symbol'
      );
    }

    const storageMutations = directDescendants(handler, (node) => (
      ['setItem', 'removeItem', 'clear'].includes(sessionStorageMethod(node))
    ));
    const allowedStorageCalls = [storedRead, persistedReload].filter(Boolean);
    const storageReferences = directDescendants(handler, (node) => (
      ts.isIdentifier(node) && node.text === 'sessionStorage'
    ));
    const referenceOwnsAllowedCall = (reference) => {
      const access = reference.parent;
      if (
        !(
          ts.isPropertyAccessExpression(access)
          || ts.isElementAccessExpression(access)
        )
        || access.expression !== reference
        || !ts.isCallExpression(access.parent)
        || access.parent.expression !== access
      ) {
        return false;
      }
      return allowedStorageCalls.includes(access.parent);
    };
    const persistedStatement = persistedReload
      && ts.isExpressionStatement(persistedReload.parent)
      && persistedReload.parent.expression === persistedReload
      ? persistedReload.parent
      : undefined;
    const reloadCall = reloadCalls.length === 1 ? reloadCalls[0] : undefined;
    const reloadStatement = reloadCall
      && ts.isExpressionStatement(reloadCall.parent)
      && reloadCall.parent.expression === reloadCall
      ? reloadCall.parent
      : undefined;
    const atomicReloadTail = Boolean(
      persistedStatement
      && reloadStatement
      && persistedStatement.parent === reloadStatement.parent
      && ts.isBlock(persistedStatement.parent)
      && persistedStatement.parent.statements.indexOf(reloadStatement)
        === persistedStatement.parent.statements.indexOf(persistedStatement) + 1
    );
    if (
      storageMutations.length !== 1
      || storageMutations[0] !== persistedReload
      || storageReferences.some((reference) => !referenceOwnsAllowedCall(reference))
      || !atomicReloadTail
    ) {
      violations.push(
        'cutover recovery must not clear or overwrite persisted recovery lineage'
      );
    }

    const canonicalHandlerShape = Boolean(
      ts.isFunctionDeclaration(handler)
      && ts.isSourceFile(handler.parent)
      && handlerBindingIsImmutable
      && handlerIsPrivate
      && handler.parameters.length === 1
      && handlerBody
      && handlerBody.statements.length === 6
      && directPreventCall
      && storedStatement === handlerBody.statements[1]
      && lineageStatement === handlerBody.statements[2]
      && boundedGuard === handlerBody.statements[3]
      && persistedStatement === handlerBody.statements[4]
      && reloadStatement === handlerBody.statements[5]
      && parsesStoredLineage
      && persistsReloadCount
      && handlerUsesCanonicalKey
      && atomicReloadTail
    );
    if (!canonicalHandlerShape) {
      violations.push(
        'cutover recovery handler must match the complete canonical executable micro-shape'
      );
    }

    const reloadPaths = [];
    const copyStates = (states) => states.map((state) => ({ ...state }));
    const eventNodes = (root) => directDescendants(root, (node) => (
      preventCalls.includes(node)
      || node === storedRead
      || node === persistedReload
      || reloadCalls.includes(node)
    )).sort((left, right) => left.getStart() - right.getStart());
    const processEvents = (root, states) => {
      for (const event of eventNodes(root)) {
        for (const state of states) {
          if (preventCalls.includes(event)) {
            if (state.read || state.guarded || state.persisted) {
              state.orderValid = false;
            }
            state.prevented = true;
          } else if (event === storedRead) {
            if (!state.prevented || state.guarded || state.persisted) {
              state.orderValid = false;
            }
            state.read = true;
          } else if (event === persistedReload) {
            if (!state.read || !state.parsed || !state.guarded) {
              state.orderValid = false;
            }
            state.persisted = true;
          } else if (reloadCalls.includes(event)) {
            reloadPaths.push({ ...state });
          }
        }
      }
      return states;
    };
    const staticTruth = (expression) => {
      const value = unwrappedExpression(expression);
      if (value.kind === ts.SyntaxKind.TrueKeyword) return true;
      if (
        value.kind === ts.SyntaxKind.FalseKeyword
        || value.kind === ts.SyntaxKind.NullKeyword
      ) {
        return false;
      }
      if (ts.isNumericLiteral(value)) return Number(value.text) !== 0;
      if (ts.isStringLiteralLike(value)) return value.text.length > 0;
      if (
        ts.isPrefixUnaryExpression(value)
        && value.operator === ts.SyntaxKind.ExclamationToken
      ) {
        const operand = staticTruth(value.operand);
        return operand === undefined ? undefined : !operand;
      }
      return undefined;
    };
    const processSequence = (statements, states) => {
      let current = states;
      for (const statement of statements) {
        if (current.length === 0) break;
        current = processStatement(statement, current);
      }
      return current;
    };
    const processStatement = (statement, states) => {
      if (ts.isBlock(statement)) {
        return processSequence(statement.statements, states);
      }
      if (ts.isVariableStatement(statement)) {
        let current = states;
        for (const declaration of statement.declarationList.declarations) {
          if (declaration.initializer) {
            current = processEvents(declaration.initializer, current);
          }
          if (declaration === lineageDeclaration) {
            for (const state of current) {
              if (!state.read || state.guarded || state.persisted) {
                state.orderValid = false;
              }
              state.parsed = true;
            }
          }
        }
        return current;
      }
      if (ts.isExpressionStatement(statement)) {
        return processEvents(statement.expression, states);
      }
      if (ts.isIfStatement(statement)) {
        const afterCondition = processEvents(statement.expression, states);
        if (statement === boundedGuard) {
          for (const state of afterCondition) {
            if (!state.read || !state.parsed || state.persisted) {
              state.orderValid = false;
            }
            state.guarded = true;
          }
        }
        const truth = staticTruth(statement.expression);
        const thenStates = truth === false
          ? []
          : processStatement(statement.thenStatement, copyStates(afterCondition));
        const elseStates = truth === true
          ? []
          : statement.elseStatement
            ? processStatement(statement.elseStatement, copyStates(afterCondition))
            : copyStates(afterCondition);
        return [...thenStates, ...elseStates];
      }
      if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement)) {
        return statement.expression
          ? (processEvents(statement.expression, states), [])
          : [];
      }
      if (ts.isTryStatement(statement)) {
        const entering = copyStates(states);
        const successful = processStatement(statement.tryBlock, copyStates(states));
        const caught = statement.catchClause
          ? processStatement(statement.catchClause.block, entering)
          : [];
        const continuing = [...successful, ...caught];
        return statement.finallyBlock
          ? processStatement(statement.finallyBlock, continuing)
          : continuing;
      }
      if (ts.isLabeledStatement(statement)) {
        return processStatement(statement.statement, states);
      }
      return processEvents(statement, states);
    };
    const unsupportedControlFlow = directDescendants(handler, (node) => (
      ts.isForStatement(node)
      || ts.isForInStatement(node)
      || ts.isForOfStatement(node)
      || ts.isWhileStatement(node)
      || ts.isDoStatement(node)
      || ts.isSwitchStatement(node)
      || ts.isBreakStatement(node)
      || ts.isContinueStatement(node)
    )).length > 0;
    if (handlerBody) {
      processSequence(handlerBody.statements, [{
        prevented: false,
        read: false,
        parsed: false,
        guarded: false,
        persisted: false,
        orderValid: true
      }]);
    }
    const validReloadFlow = reloadPaths.length > 0 && reloadPaths.every((state) => (
      state.prevented
      && state.read
      && state.parsed
      && state.guarded
      && state.persisted
      && state.orderValid
    ));
    if (!handlerBody || unsupportedControlFlow || !validReloadFlow) {
      violations.push(
        'cutover recovery control flow must reach lineage persistence and reload'
      );
    }
  }

  const markStable = uniqueFunction('markStable');
  const markStableBody = markStable?.body && ts.isBlock(markStable.body)
    ? markStable.body
    : undefined;
  const markStableStatement = markStableBody?.statements.length === 1
    ? markStableBody.statements[0]
    : undefined;
  const markStableCall = markStableStatement
    && ts.isExpressionStatement(markStableStatement)
    && ts.isCallExpression(markStableStatement.expression)
    && identifierOwnerCall(markStableStatement.expression, 'sessionStorage', 'removeItem')
    ? markStableStatement.expression
    : undefined;
  const markStableKey = markStableCall?.arguments.length === 1
    ? markStableCall.arguments[0]
    : undefined;
  const markStableName = markStable && ts.isFunctionDeclaration(markStable)
    ? markStable.name
    : undefined;
  const markStableBindingIsImmutable = Boolean(
    markStableName && !symbolIsWritten(symbolAt(markStableName))
  );
  const markStableIsExported = Boolean(markStable && isExported(markStable));
  const clearsLineage = Boolean(
    markStable
    && ts.isFunctionDeclaration(markStable)
    && ts.isSourceFile(markStable.parent)
    && markStableBindingIsImmutable
    && markStableIsExported
    && markStable.parameters.length === 0
    && canonicalKeySymbol
    && markStableKey
    && ts.isIdentifier(unwrappedExpression(markStableKey))
    && symbolAt(unwrappedExpression(markStableKey)) === canonicalKeySymbol
  );
  if (!clearsLineage) {
    violations.push('cutover markStable must clear the recovery lineage');
  }
  if (markStable && !markStableIsExported) {
    violations.push(
      'cutover markStable must be exported as the recovery cleanup port'
    );
  }

  const allowedKeyReferences = new Set([
    canonicalKeyName,
    canonicalStorageKeyReference,
    canonicalPersistedKeyReference,
    markStableKey
  ].filter(Boolean));
  if (
    canonicalKeySymbol
    && symbolReferences(canonicalKeySymbol).some(
      (reference) => !allowedKeyReferences.has(reference)
    )
  ) {
    violations.push(
      'cutover recovery storage key has non-canonical references'
    );
  }

  const sessionStorageOwner = (call) => {
    if (!call || !ts.isCallExpression(call)) return undefined;
    const target = unwrappedExpression(call.expression);
    return ts.isPropertyAccessExpression(target)
      && ts.isIdentifier(unwrappedExpression(target.expression))
      && unwrappedExpression(target.expression).text === 'sessionStorage'
      ? unwrappedExpression(target.expression)
      : undefined;
  };
  const allowedSessionStorageReferences = new Set([
    sessionStorageOwner(canonicalStoredRead),
    sessionStorageOwner(canonicalPersistedReload),
    sessionStorageOwner(markStableCall)
  ].filter(Boolean));
  const sessionStorageReferences = referenceSourceFiles.flatMap(({ sourceFile }) => (
    descendants(sourceFile, (node) => (
      (
        ts.isIdentifier(node) && node.text === 'sessionStorage'
      ) || (
        ts.isStringLiteralLike(node)
          && node.text === 'sessionStorage'
          && ts.isElementAccessExpression(node.parent)
          && node.parent.argumentExpression === node
      )
    ))
  ));
  if (
    sessionStorageReferences.some(
      (reference) => !allowedSessionStorageReferences.has(reference)
    )
  ) {
    violations.push(
      'cutover sessionStorage use outside the canonical recovery calls is forbidden'
    );
  }

  const lineageTypes = sourceFiles.flatMap(({ sourceFile }) => descendants(
    sourceFile,
    (node) => ts.isTypeAliasDeclaration(node)
      && node.name.text === 'PhoneChunkRecoveryLineage'
  ));
  const lineageType = lineageTypes.length === 1 ? lineageTypes[0] : undefined;
  if (
    !lineageType
    || !containsIdentifier(lineageType, 'lineageId')
    || !containsIdentifier(lineageType, 'automaticReloadCount')
  ) {
    violations.push(
      'cutover recovery must declare executable PhoneChunkRecoveryLineage fields'
    );
  }

  return violations;
}

function controllerRecoveryBoundaryViolations(sources, referenceSources = sources) {
  const violations = [];
  const loaderEntry = sources.find(({ file }) => (
    slash(file).endsWith('/src/production/presentation-shell-loaders.ts')
  ));
  const mainEntry = sources.find(({ file }) => slash(file).endsWith('/src/main.tsx'));
  if (!loaderEntry || !mainEntry) {
    return ['cutover is missing the executable phone-core recovery controller'];
  }
  const rootNames = referenceSources.map(({ file }) => path.resolve(file));
  const program = ts.createProgram({
    rootNames,
    options: {
      allowJs: true,
      checkJs: false,
      jsx: ts.JsxEmit.Preserve,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noLib: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.Latest
    }
  });
  const checker = program.getTypeChecker();
  const sourceByPath = new Map(program.getSourceFiles().map((sourceFile) => [
    path.resolve(sourceFile.fileName),
    sourceFile
  ]));
  const loader = sourceByPath.get(path.resolve(loaderEntry.file))
    ?? sourceFileFor(loaderEntry.file, loaderEntry.source);
  const main = sourceByPath.get(path.resolve(mainEntry.file))
    ?? sourceFileFor(mainEntry.file, mainEntry.source);
  const descendants = (root, predicate) => {
    const found = [];
    const visit = (node) => {
      if (predicate(node)) found.push(node);
      ts.forEachChild(node, visit);
    };
    visit(root);
    return found;
  };
  const symbolAt = (node) => {
    const symbol = node && checker.getSymbolAtLocation(node);
    return symbol ? canonicalSymbol(checker, symbol) : undefined;
  };
  const functionNamed = (sourceFile, name) => descendants(sourceFile, (node) => (
    ts.isFunctionDeclaration(node) && node.name?.text === name
  ));
  const propertyCall = (node, owner, method) => (
    ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(unwrappedExpression(node.expression))
    && unwrappedExpression(node.expression).name.text === method
    && ts.isIdentifier(unwrappedExpression(node.expression).expression)
    && unwrappedExpression(node.expression).expression.text === owner
  );

  const keyDeclarations = loader.statements.flatMap((statement) => {
    if (!ts.isVariableStatement(statement)) return [];
    return statement.declarationList.declarations.flatMap((declaration) => {
      const initializer = declaration.initializer
        ? unwrappedExpression(declaration.initializer)
        : undefined;
      return ts.isIdentifier(declaration.name)
        && initializer
        && ts.isStringLiteralLike(initializer)
        && /lineage/i.test(initializer.text)
        && !/(?:build|module|url)/i.test(initializer.text)
        ? [{ statement, declaration }]
        : [];
    });
  });
  const keyEntry = keyDeclarations.length === 1
    && Boolean(keyDeclarations[0].statement.declarationList.flags & ts.NodeFlags.Const)
    && keyDeclarations[0].statement.declarationList.declarations.length === 1
    ? keyDeclarations[0]
    : undefined;
  const keyName = keyEntry?.declaration.name;
  const keySymbol = keyName && ts.isIdentifier(keyName) ? symbolAt(keyName) : undefined;
  if (!keyEntry || !keySymbol) {
    violations.push(
      'cutover recovery must own one immutable storage-lineage key independent of build and URL'
    );
  }

  const lineageTypes = descendants(loader, (node) => (
    ts.isTypeAliasDeclaration(node) && node.name.text === 'PhoneChunkRecoveryLineage'
  ));
  const lineageTypeNode = lineageTypes.length === 1
    && ts.isTypeReferenceNode(lineageTypes[0].type)
    && ts.isIdentifier(lineageTypes[0].type.typeName)
    && lineageTypes[0].type.typeName.text === 'Readonly'
    && lineageTypes[0].type.typeArguments?.length === 1
    ? lineageTypes[0].type.typeArguments[0]
    : lineageTypes[0]?.type;
  const lineageFields = lineageTypeNode && ts.isTypeLiteralNode(lineageTypeNode)
    ? new Set(lineageTypeNode.members.flatMap((member) => (
        ts.isPropertySignature(member)
        && member.name
        && (ts.isIdentifier(member.name) || ts.isStringLiteralLike(member.name))
          ? [member.name.text]
          : []
      )))
    : new Set();
  const requiredLineageFields = [
    'lineageId', 'entryUrl', 'firstDocumentBuildId', 'currentDocumentBuildId',
    'deployedBuildId', 'failedModuleUrl', 'failedModuleClass',
    'automaticReloadCount', 'status'
  ];
  if (!requiredLineageFields.every((field) => lineageFields.has(field))) {
    violations.push('cutover recovery lineage is missing executable frozen fields');
  }

  const storageCalls = descendants(loader, (node) => (
    ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(unwrappedExpression(node.expression))
    && ['getItem', 'setItem', 'removeItem'].includes(
      unwrappedExpression(node.expression).name.text
    )
  ));
  const storageKeyIsCanonical = (call) => {
    const argument = call.arguments[0]
      ? unwrappedExpression(call.arguments[0])
      : undefined;
    return argument && ts.isIdentifier(argument) && symbolAt(argument) === keySymbol;
  };
  if (
    storageCalls.length < 3
    || storageCalls.some((call) => !storageKeyIsCanonical(call))
  ) {
    violations.push('cutover recovery storage calls must share the immutable lineage key binding');
  }

  const countGuards = descendants(loader, (node) => {
    if (!ts.isIfStatement(node) || !ts.isBinaryExpression(node.expression)) return false;
    const expression = node.expression;
    return expression.operatorToken.kind === ts.SyntaxKind.GreaterThanEqualsToken
      && ts.isPropertyAccessExpression(unwrappedExpression(expression.left))
      && unwrappedExpression(expression.left).name.text === 'automaticReloadCount'
      && ts.isNumericLiteral(unwrappedExpression(expression.right))
      && Number(unwrappedExpression(expression.right).text) === 1
      && descendants(node.thenStatement, (child) => (
        ts.isCallExpression(child)
        && ts.isIdentifier(unwrappedExpression(child.expression))
        && unwrappedExpression(child.expression).text === 'failClosed'
      )).length === 1;
  });
  if (countGuards.length !== 1) {
    violations.push('cutover recovery must guard the stored cross-reload allowance');
  }

  const persistedOne = descendants(loader, (node) => (
    ts.isPropertyAssignment(node)
    && (ts.isIdentifier(node.name) || ts.isStringLiteralLike(node.name))
    && node.name.text === 'automaticReloadCount'
    && ts.isAsExpression(node.initializer)
    && ts.isNumericLiteral(unwrappedExpression(node.initializer.expression))
    && Number(unwrappedExpression(node.initializer.expression).text) === 1
  ));
  const reloadCalls = descendants(loader, (node) => propertyCall(node, 'environment', 'reload'));
  if (
    persistedOne.length !== 1
    || reloadCalls.length !== 1
    || persistedOne[0].getStart() >= reloadCalls[0].getStart()
  ) {
    violations.push('cutover recovery must persist automaticReloadCount: 1 before reload');
  }

  const manifestCalls = descendants(loader, (node) => (
    propertyCall(node, 'environment', 'fetchReleaseManifest')
  ));
  const manifestCall = manifestCalls.length === 1 ? manifestCalls[0] : undefined;
  const manifestUrl = manifestCall?.arguments[0];
  const manifestInit = manifestCall?.arguments[1]
    ? unwrappedExpression(manifestCall.arguments[1])
    : undefined;
  const noStore = manifestInit && ts.isObjectLiteralExpression(manifestInit)
    && manifestInit.properties.some((property) => (
      ts.isPropertyAssignment(property)
      && (ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name))
      && property.name.text === 'cache'
      && ts.isStringLiteralLike(unwrappedExpression(property.initializer))
      && unwrappedExpression(property.initializer).text === 'no-store'
    ));
  if (
    !manifestCall
    || !manifestUrl
    || !ts.isStringLiteralLike(unwrappedExpression(manifestUrl))
    || unwrappedExpression(manifestUrl).text !== '/r5-release-manifest.json'
    || !noStore
  ) {
    violations.push('cutover recovery must fetch the release manifest with cache: no-store');
  }
  const deadline = loaderEntry.source.match(
    /\bmanifestFetchDeadlineMs\s*=\s*([0-9_]+)/
  );
  if (!deadline || Number(deadline[1].replaceAll('_', '')) !== 3000) {
    violations.push('cutover recovery manifest active deadline must remain 3000 ms');
  }
  const onlineAwaits = descendants(loader, (node) => (
    ts.isAwaitExpression(node)
    && propertyCall(unwrappedExpression(node.expression), 'environment', 'waitForOnline')
  ));
  if (onlineAwaits.length !== 1) {
    violations.push('cutover recovery must wait online before release classification');
  }
  if (!/if\s*\(\s*!storage\s*\)\s*return\s+failClosed\s*\(/.test(loaderEntry.source)) {
    violations.push('cutover recovery must disable automatic reload without sessionStorage');
  }

  const mainRecoveryDeclarations = descendants(main, (node) => (
    ts.isVariableDeclaration(node)
    && ts.isIdentifier(node.name)
    && node.name.text === 'chunkRecovery'
    && node.initializer
    && ts.isCallExpression(unwrappedExpression(node.initializer))
    && ts.isIdentifier(unwrappedExpression(node.initializer).expression)
    && unwrappedExpression(node.initializer).expression.text
      === 'createBrowserPhoneChunkRecoveryController'
  ));
  const mainRecoveryName = mainRecoveryDeclarations.length === 1
    ? mainRecoveryDeclarations[0].name
    : undefined;
  const mainRecoverySymbol = mainRecoveryName && ts.isIdentifier(mainRecoveryName)
    ? symbolAt(mainRecoveryName)
    : undefined;
  const preloadListeners = descendants(main, (node) => (
    ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(unwrappedExpression(node.expression))
    && unwrappedExpression(node.expression).name.text === 'addEventListener'
    && ts.isIdentifier(unwrappedExpression(node.expression).expression)
    && unwrappedExpression(node.expression).expression.text === 'window'
    && node.arguments[0]
    && ts.isStringLiteralLike(unwrappedExpression(node.arguments[0]))
    && unwrappedExpression(node.arguments[0]).text === 'vite:preloadError'
  ));
  const preloadHandler = preloadListeners[0]?.arguments[1]
    ? unwrappedExpression(preloadListeners[0].arguments[1])
    : undefined;
  const bindsController = preloadListeners.length === 1
    && preloadHandler
    && ts.isPropertyAccessExpression(preloadHandler)
    && preloadHandler.name.text === 'handlePreloadError'
    && ts.isIdentifier(unwrappedExpression(preloadHandler.expression))
    && symbolAt(unwrappedExpression(preloadHandler.expression)) === mainRecoverySymbol;
  if (!bindsController) {
    violations.push('cutover vite listener must bind the installed controller handler');
  }
  const renderCalls = descendants(main, (node) => (
    ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(unwrappedExpression(node.expression))
    && unwrappedExpression(node.expression).name.text === 'render'
  ));
  if (
    preloadListeners.length !== 1
    || renderCalls.length < 1
    || preloadListeners[0].getStart() >= renderCalls[0].getStart()
  ) {
    violations.push('cutover preload recovery listener must install before React render');
  }

  const shellLoaders = functionNamed(loader, 'loadPhoneStoryShell');
  const shellLoader = shellLoaders.length === 1 ? shellLoaders[0] : undefined;
  const phoneImports = shellLoader ? descendants(shellLoader, (node) => (
    ts.isCallExpression(node)
    && node.expression.kind === ts.SyntaxKind.ImportKeyword
    && node.arguments[0]
    && ts.isStringLiteralLike(unwrappedExpression(node.arguments[0]))
    && unwrappedExpression(node.arguments[0]).text === './phone-story/PhoneStoryShell'
  )) : [];
  const oneDirectReturn = shellLoader?.body
    && ts.isBlock(shellLoader.body)
    && shellLoader.body.statements.length === 1
    && ts.isReturnStatement(shellLoader.body.statements[0]);
  const reportsCoreFailure = shellLoader && descendants(shellLoader, (node) => (
    ts.isPropertyAccessExpression(node)
    && node.name.text === 'reportPhoneCoreRejection'
    && ts.isIdentifier(unwrappedExpression(node.expression))
    && node.expression.text === 'installedController'
  )).length === 1;
  const rethrows = shellLoader && descendants(shellLoader, ts.isThrowStatement).length === 1;
  if (!oneDirectReturn || phoneImports.length !== 1 || !reportsCoreFailure || !rethrows) {
    violations.push(
      'cutover loadPhoneStoryShell must directly wrap one canonical import rejection'
    );
  }

  return violations;
}

async function readSources(files) {
  return Promise.all(files.map(async (file) => ({
    file,
    source: await readFile(file, 'utf8')
  })));
}

export async function phoneCleanArchitectureViolations({
  appRoot = DEFAULT_APP_ROOT,
  phase = 'harness'
} = {}) {
  if (phase !== 'harness' && phase !== 'cutover') {
    return [`unsupported phone architecture phase: ${phase}`];
  }

  const violations = [];
  const srcRoot = path.join(appRoot, 'src');
  const productionRoot = path.join(srcRoot, 'production');
  const coreRoot = path.join(productionRoot, 'phone-story');
  const canonicalRuntimeFile = path.resolve(coreRoot, 'runtime.ts');
  const canonicalMachineFile = path.resolve(coreRoot, 'machine.ts');
  const canonicalShellFile = path.resolve(coreRoot, 'PhoneStoryShell.tsx');
  const vitePath = path.join(appRoot, 'vite.config.ts');
  const viteSource = await exists(vitePath) ? await readFile(vitePath, 'utf8') : '';
  const allSourceFiles = (await filesBelow(srcRoot)).filter(isProductionSource);
  const allSources = await readSources(allSourceFiles);
  const allSourceByFile = new Map(
    allSources.map((entry) => [path.resolve(entry.file), entry.source])
  );
  const allParsedByFile = new Map(allSources.map(({ file, source }) => [
    path.resolve(file),
    sourceFileFor(file, source)
  ]));
  const allSourceFilesByStem = new Map();
  for (const file of allSourceFiles) {
    const resolved = path.resolve(file);
    allSourceFilesByStem.set(resolved, resolved);
    allSourceFilesByStem.set(resolved.replace(/\.[^.]+$/, ''), resolved);
  }
  const allowed = new Set(PHONE_CORE_PRODUCTION_ALLOWLIST);
  const allCoreFiles = await filesBelow(coreRoot);
  const coreProductionFiles = allCoreFiles.filter((file) => {
    const relative = slash(path.relative(coreRoot, file));
    if (relative.includes('/__tests__/')) return false;
    return !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(relative);
  });

  for (const file of coreProductionFiles) {
    const relative = slash(path.relative(coreRoot, file));
    const firstDirectory = relative.includes('/') ? relative.split('/')[0] : null;
    if (firstDirectory && forbiddenCoreDirectories.has(firstDirectory)) {
      violations.push(
        `${relative}: forbidden phone-story subtree ${firstDirectory}/`
      );
    } else if (firstDirectory) {
      violations.push(`${relative}: phone-story production files must remain flat`);
    }
    if (!firstDirectory && !allowed.has(relative)) {
      violations.push(
        `${relative}: outside the flat ten-file allowlist`
      );
    }
  }

  if (phase === 'cutover') {
    const names = new Set(
      coreProductionFiles
        .map((file) => slash(path.relative(coreRoot, file)))
        .filter((relative) => !relative.includes('/'))
    );
    for (const name of PHONE_CORE_PRODUCTION_ALLOWLIST) {
      if (!names.has(name)) {
        violations.push(`cutover phone-story is missing allowlisted file ${name}`);
      }
    }
    for (const name of names) {
      if (!allowed.has(name)) {
        violations.push(`cutover phone-story has non-allowlisted file ${name}`);
      }
    }
  }

  const coreTypeScriptFiles = coreProductionFiles.filter(isTypeScript);
  const coreSources = await readSources(coreTypeScriptFiles);
  const sourceByFile = new Map(coreSources.map((entry) => [entry.file, entry.source]));
  const parsedByFile = new Map(coreSources.map(({ file, source }) => [
    file,
    sourceFileFor(file, source)
  ]));
  const coreFilesByStem = new Map();
  for (const file of coreTypeScriptFiles) {
    coreFilesByStem.set(file, file);
    coreFilesByStem.set(file.replace(/\.[^.]+$/, ''), file);
  }

  let totalCoreLines = 0;
  for (const file of coreTypeScriptFiles) {
    const name = path.basename(file);
    const lines = nonBlankLineCount(sourceByFile.get(file));
    totalCoreLines += lines;
    const budget = PHONE_CORE_LOC_BUDGETS[name];
    if (budget !== undefined && lines > budget) {
      violations.push(
        `${name} exceeds non-blank LOC budget: ${lines} > ${budget}`
      );
    }
  }
  if (totalCoreLines > PHONE_CORE_TOTAL_LOC_BUDGET) {
    violations.push(
      `total TypeScript/TSX LOC exceeds budget: `
        + `${totalCoreLines} > ${PHONE_CORE_TOTAL_LOC_BUDGET}`
    );
  }

  const graph = new Map(coreTypeScriptFiles.map((file) => [file, new Set()]));
  for (const file of coreTypeScriptFiles) {
    const name = path.basename(file);
    const sourceFile = parsedByFile.get(file);
    const allowedTargets = allowedCoreImports.get(name) ?? new Set();
    for (const imported of moduleImports(sourceFile)) {
      if (imported.syntaxViolation) {
        violations.push(
          `${name}: ${imported.syntaxViolation} is forbidden in the clean core`
        );
        continue;
      }
      const target = coreTarget(file, imported.specifier, coreFilesByStem);
      if (target) {
        graph.get(file).add(target);
        const targetName = path.basename(target);
        if (!allowedTargets.has(targetName)) {
          violations.push(
            `${name}: forbidden core dependency on ${targetName}`
          );
        }
        if (
          name === 'manifest.ts'
          && (
            targetName === 'presentation.ts'
            || targetName === 'runtime.ts'
            || targetName === 'machine.ts'
            || targetName === 'scenes.tsx'
            || targetName === 'transitions.tsx'
          )
        ) {
          violations.push(
            `manifest.ts imports a DOM-bearing or lifecycle core module `
              + `(${targetName})`
          );
        }
        if (
          (name === 'scenes.tsx' || name === 'transitions.tsx')
          && targetName === 'presentation.ts'
          && !imported.typeOnly
        ) {
          violations.push(
            `${name}: presentation leaf ports must be imported type-only`
          );
        }
      } else {
        if (!externalCoreImportAllowed(name, imported)) {
          violations.push(
            `${name}: forbidden external import dependency ${imported.specifier}`
          );
        }
        if (
          name === 'runtime.ts'
          && (
            imported.specifier.includes('/scenes/')
            || imported.specifier.includes('/transitions/')
          )
        ) {
          violations.push(
            `runtime must not import a scene or transition leaf `
              + `(${imported.specifier})`
          );
        }
        if (
          name === 'manifest.ts'
          && (
            imported.specifier === 'react'
            || imported.specifier.includes('presentation')
            || imported.specifier.includes('/scenes/')
            || imported.specifier.includes('/transitions/')
            || imported.specifier.includes('runtime')
          )
        ) {
          violations.push(
            `manifest.ts imports a React/DOM-bearing or lifecycle module `
              + `(${imported.specifier})`
          );
        }
      }
    }
  }
  for (const cycle of detectCycles(graph)) {
    violations.push(
      `phone-story dependency cycle: `
        + cycle.map((file) => path.basename(file)).join(' -> ')
    );
  }

  for (const pureName of ['protocol.ts', 'machine.ts', 'manifest.ts']) {
    const file = coreTypeScriptFiles.find((candidate) => path.basename(candidate) === pureName);
    if (!file) continue;
    const found = identifiers(parsedByFile.get(file), browserGlobalNames);
    if (found.size > 0) {
      violations.push(
        `${pureName} uses browser/DOM values or types: ${[...found].sort().join(', ')}`
      );
    }
  }

  let orientationListeners = 0;
  for (const file of coreTypeScriptFiles) {
    const sourceFile = parsedByFile.get(file);
    const name = path.basename(file);
    const importedIdentifiers = identifiers(
      sourceFile,
      new Set(['useMobileLandscapeEntry'])
    );
    if (importedIdentifiers.has('useMobileLandscapeEntry')) {
      violations.push(`${name}: useMobileLandscapeEntry is forbidden in the clean core`);
    }
    const listenerCount = orientationListenerCount(sourceFile);
    orientationListeners += listenerCount;
    if (listenerCount > 0 && name !== 'runtime.ts') {
      violations.push(`${name}: only runtime.ts may own orientation lifecycle listeners`);
    }
    if (productionQueryViolation(sourceFile)) {
      violations.push(`${name}: production validation/query composition is forbidden`);
    }
    if (
      stringLiterals(sourceFile).some((value) => (
        value.includes('r5-module-provenance')
        || value.includes('dist/audit/')
      ))
    ) {
      violations.push(`${name}: runtime code must not import build-audit provenance`);
    }
  }
  if (orientationListeners > 1) {
    violations.push(
      `clean core has ${orientationListeners} orientation lifecycle owners; maximum is 1`
    );
  }

  for (const registryName of ['scenes.tsx', 'transitions.tsx']) {
    const file = coreTypeScriptFiles.find((candidate) => path.basename(candidate) === registryName);
    if (!file) continue;
    const unsafe = allNamedIdentifiers(
      parsedByFile.get(file),
      new Set(['dispatch', 'runtime'])
    );
    if (unsafe.size > 0) {
      violations.push(
        `${registryName}: narrow leaf interfaces must not receive `
          + `${[...unsafe].sort().join(' or ')}`
      );
    }
  }

  const factoryDefinitions = [];
  const factoryUsage = runtimeFactoryUsage(allSourceFiles);
  const factoryCalls = factoryUsage.calls;
  const reducerDefinitions = [];
  const stableCommitDefinitions = [];
  for (const { file, source } of allSources) {
    const parsed = sourceFileFor(file, source);
    for (const name of namedDefinitions(parsed, 'createPhoneStoryRuntime')) {
      factoryDefinitions.push({ file, name });
    }
    for (const name of namedDefinitions(parsed, 'reducePhoneStory')) {
      reducerDefinitions.push({ file, name });
    }
    for (const name of namedDefinitions(parsed, 'commitStableCandidate')) {
      stableCommitDefinitions.push({ file, name });
    }
  }

  if (factoryDefinitions.length > 1) {
    violations.push(
      `runtime factory definitions must be unique; found ${factoryDefinitions.length}`
    );
  }
  for (const definition of factoryDefinitions) {
    if (path.resolve(definition.file) !== canonicalRuntimeFile) {
      violations.push(
        `${slash(path.relative(appRoot, definition.file))}: `
          + 'createPhoneStoryRuntime definition is allowed only in '
          + 'src/production/phone-story/runtime.ts'
      );
    }
  }
  if (factoryCalls.length > 1) {
    violations.push(`runtime factory call sites must be unique; found ${factoryCalls.length}`);
  }
  for (const call of factoryCalls) {
    const relative = slash(path.relative(appRoot, call.file));
    if (path.resolve(call.file) !== canonicalShellFile) {
      violations.push(
        `${relative}: runtime factory call is allowed only in `
          + 'src/production/phone-story/PhoneStoryShell.tsx'
      );
    }
    if (path.basename(call.file) === 'PhoneBrandLabStory.tsx') {
      violations.push(`${relative}: PhoneBrandLabStory must not call the runtime factory`);
    }
  }
  for (const escape of factoryUsage.escapes) {
    const relative = slash(path.relative(appRoot, escape.file));
    violations.push(
      `${relative}: runtime factory value escape is forbidden; `
        + `only the PhoneStoryShell direct call may consume the factory`
    );
  }
  if (reducerDefinitions.length > 1 || stableCommitDefinitions.length > 1) {
    violations.push(
      `reducer/stable-commit authority must be unique; found `
        + `${reducerDefinitions.length} reducers and `
        + `${stableCommitDefinitions.length} stable-commit branches`
    );
  }
  for (const definition of reducerDefinitions) {
    if (path.resolve(definition.file) !== canonicalMachineFile) {
      violations.push(
        `${slash(path.relative(appRoot, definition.file))}: `
          + 'reducePhoneStory definition is allowed only in '
          + 'src/production/phone-story/machine.ts'
      );
    }
  }
  for (const definition of stableCommitDefinitions) {
    if (path.resolve(definition.file) !== canonicalMachineFile) {
      violations.push(
        `${slash(path.relative(appRoot, definition.file))}: `
          + 'commitStableCandidate definition is allowed only in '
          + 'src/production/phone-story/machine.ts'
      );
    }
  }

  if (phase === 'cutover') {
    if (factoryDefinitions.length !== 1) {
      violations.push(
        `cutover requires exactly one runtime factory definition; `
          + `found ${factoryDefinitions.length}`
      );
    }
    if (factoryCalls.length !== 1) {
      violations.push(
        `cutover requires exactly one runtime factory call; found ${factoryCalls.length}`
      );
    }
  }

  const leafRoots = [
    path.join(srcRoot, 'scenes'),
    path.join(srcRoot, 'transitions')
  ];
  for (const leafRoot of leafRoots) {
    for (const file of (await filesBelow(leafRoot)).filter(isProductionSource)) {
      const source = await readFile(file, 'utf8');
      const parsed = sourceFileFor(file, source);
      for (const imported of moduleImports(parsed)) {
        if (imported.syntaxViolation) {
          violations.push(
            `${slash(path.relative(appRoot, file))}: leaf import syntax is forbidden `
              + `(${imported.syntaxViolation})`
          );
          continue;
        }
        const normalized = slash(path.resolve(path.dirname(file), imported.specifier));
        if (
          normalized.includes('/production/phone-story/runtime')
          || normalized.includes('/production/phone-story/machine')
        ) {
          violations.push(
            `${slash(path.relative(appRoot, file))}: leaf must not import clean runtime/machine`
          );
        }
        if (
          importLooksLikeLifecycleOwner(normalized)
          || importLooksLikeLifecycleOwner(imported.specifier)
        ) {
          violations.push(
            `${slash(path.relative(appRoot, file))}: dynamic leaf lifecycle owner import `
              + `is forbidden (${imported.specifier})`
          );
        }
      }
    }
  }

  const formalFiles = [
    path.join(srcRoot, 'App.tsx'),
    path.join(srcRoot, 'main.tsx'),
    path.join(productionRoot, 'presentation-shell-loaders.ts')
  ];
  const formalSources = formalFiles.flatMap((file) => {
    const resolved = path.resolve(file);
    const source = allSourceByFile.get(resolved);
    return source === undefined ? [] : [{ file: resolved, source }];
  });
  const canonicalQaFile = path.resolve(
    coreRoot,
    'PhoneBrandLabStory.tsx'
  );
  for (const { file, source } of formalSources) {
    const parsed = allParsedByFile.get(file) ?? sourceFileFor(file, source);
    if (phase === 'cutover' && productionQueryViolation(parsed)) {
      violations.push(
        `${slash(path.relative(appRoot, file))}: legacy production query composition remains`
      );
    }

    const visited = new Set();
    const visitFormalGraph = (currentFile, chain) => {
      if (visited.has(currentFile)) return;
      visited.add(currentFile);
      const currentParsed = allParsedByFile.get(currentFile);
      if (!currentParsed) return;
      for (const imported of moduleImports(currentParsed)) {
        const currentRelative = slash(path.relative(appRoot, currentFile));
        if (imported.syntaxViolation) {
          violations.push(
            `${currentRelative}: formal graph import syntax is forbidden `
              + `(${imported.syntaxViolation})`
          );
          continue;
        }
        if (imported.typeOnly) continue;
        const target = coreTarget(
          currentFile,
          imported.specifier,
          allSourceFilesByStem
        );
        if (!target) continue;
        const nextChain = [...chain, target];
        if (path.resolve(target) === canonicalQaFile) {
          let owner = imported.node.parent;
          while (owner && !ts.isSourceFile(owner) && !ts.isFunctionLike(owner)) {
            owner = owner.parent;
          }
          const routeOnlyQaLoader = owner
            && ts.isFunctionDeclaration(owner)
            && owner.name?.text === 'loadPhoneBrandLabStory';
          if (routeOnlyQaLoader) continue;
          violations.push(
            `${slash(path.relative(appRoot, file))}: formal loader closure violation; `
              + `formal graph must not import the QA shell (${nextChain.map((entry) => (
                slash(path.relative(appRoot, entry))
              )).join(' -> ')})`
          );
          continue;
        }
        visitFormalGraph(target, nextChain);
      }
    };
    visitFormalGraph(file, [file]);
  }

  if (propertyMangleViolation(viteSource)) {
    violations.push('vite.config.ts: property-name mangling is forbidden');
  }
  violations.push(...provenancePluginViolations(viteSource));

  if (phase === 'cutover') {
    for (const legacyDirectory of [
      path.join(productionRoot, 'phone'),
      path.join(productionRoot, 'portrait-spike')
    ]) {
      if (await exists(legacyDirectory)) {
        violations.push(
          `cutover retains legacy ${slash(path.relative(srcRoot, legacyDirectory))}`
        );
      }
    }

    const ownsControllerRecoveryBoundary = formalSources.some(({ source }) => (
      source.includes('createPhoneChunkRecoveryController')
    ));
    if (ownsControllerRecoveryBoundary) {
      violations.push(...controllerRecoveryBoundaryViolations(
        formalSources,
        allSources
      ));
    } else {
      violations.push(
        'cutover is missing the executable phone-core recovery controller'
      );
      violations.push(...recoveryBoundaryViolations(formalSources, allSources));
      violations.push(...storageLineageViolations(formalSources));
    }

    const performancePath = path.join(
      appRoot,
      'scripts/verify-performance-budgets.mjs'
    );
    const performanceSource = await exists(performancePath)
      ? await readFile(performancePath, 'utf8')
      : '';
    const capMatch = performanceSource.match(
      /\bphoneJsHardCapBytes\s*=\s*([0-9_]+)/
    );
    const cap = capMatch ? Number(capMatch[1].replaceAll('_', '')) : Number.NaN;
    if (cap !== PHONE_JS_HARD_CAP_BYTES) {
      violations.push(
        `phone JavaScript hard cap changed: `
          + `${Number.isFinite(cap) ? cap : 'missing'} != ${PHONE_JS_HARD_CAP_BYTES}`
      );
    }
  }

  return [...new Set(violations)].sort();
}

export async function verifyPhoneCleanArchitecture(options = {}) {
  const violations = await phoneCleanArchitectureViolations(options);
  if (violations.length > 0) {
    throw new Error(
      `Phone clean architecture violations:\n`
        + violations.map((violation) => `- ${violation}`).join('\n')
    );
  }
  return {
    phase: options.phase ?? 'harness',
    productionFiles: (
      await filesBelow(path.join(
        options.appRoot ?? DEFAULT_APP_ROOT,
        'src/production/phone-story'
      ))
    ).filter((file) => (
      !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file)
      && !slash(file).includes('/__tests__/')
    )).length
  };
}

if (path.resolve(process.argv[1] ?? '') === SCRIPT_PATH) {
  const phaseArgument = process.argv.find((argument) => argument.startsWith('--phase='));
  const phase = phaseArgument?.slice('--phase='.length) || 'harness';
  try {
    const result = await verifyPhoneCleanArchitecture({ phase });
    process.stdout.write(
      `Phone clean architecture verified (${result.phase}; `
        + `${result.productionFiles} canonical production files).\n`
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
