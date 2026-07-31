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
  ['scenes.tsx', new Set(['presentation.ts', 'protocol.ts'])],
  ['transitions.tsx', new Set(['presentation.ts', 'protocol.ts'])],
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
  const add = (specifier, typeOnly, node) => {
    if (specifier) imports.push({ specifier, typeOnly, node });
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
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
      && ts.isStringLiteral(node.moduleSpecifier)
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
      && node.arguments.length === 1
      && ts.isStringLiteral(node.arguments[0])
    ) {
      add(node.arguments[0].text, false, node);
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

function runtimeFactoryCallSites(productionFiles) {
  const rootNames = productionFiles.map((file) => path.resolve(file));
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
    return (
      ts.isIdentifier(unwrapped)
      && unwrapped.text === 'createPhoneStoryRuntime'
    ) || (
      ts.isPropertyAccessExpression(unwrapped)
      && unwrapped.name.text === 'createPhoneStoryRuntime'
    ) || (
      ts.isElementAccessExpression(unwrapped)
      && unwrapped.argumentExpression
      && ts.isStringLiteralLike(unwrapped.argumentExpression)
      && unwrapped.argumentExpression.text === 'createPhoneStoryRuntime'
    );
  };

  const calls = [];
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
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return calls;
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
  const vitePath = path.join(appRoot, 'vite.config.ts');
  const viteSource = await exists(vitePath) ? await readFile(vitePath, 'utf8') : '';
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
            `${name}: forbidden external dependency ${imported.specifier}`
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

  const productionFiles = (await filesBelow(productionRoot)).filter(isProductionSource);
  const productionSources = await readSources(productionFiles);
  const factoryDefinitions = [];
  const factoryCalls = runtimeFactoryCallSites(productionFiles);
  const reducerDefinitions = [];
  const stableCommitDefinitions = [];
  for (const { file, source } of productionSources) {
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
  if (factoryCalls.length > 1) {
    violations.push(`runtime factory call sites must be unique; found ${factoryCalls.length}`);
  }
  for (const call of factoryCalls) {
    const relative = slash(path.relative(appRoot, call.file));
    if (path.basename(call.file) !== 'PhoneStoryShell.tsx') {
      violations.push(
        `${relative}: runtime factory call is allowed only in PhoneStoryShell`
      );
    }
    if (path.basename(call.file) === 'PhoneBrandLabStory.tsx') {
      violations.push(`${relative}: PhoneBrandLabStory must not call the runtime factory`);
    }
  }
  if (reducerDefinitions.length > 1 || stableCommitDefinitions.length > 1) {
    violations.push(
      `reducer/stable-commit authority must be unique; found `
        + `${reducerDefinitions.length} reducers and `
        + `${stableCommitDefinitions.length} stable-commit branches`
    );
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
  const formalSources = [];
  for (const file of formalFiles) {
    if (!await exists(file)) continue;
    const source = await readFile(file, 'utf8');
    formalSources.push({ file, source });
    const parsed = sourceFileFor(file, source);
    if (
      moduleImports(parsed).some((entry) => (
        entry.specifier.includes('PhoneBrandLabStory')
      ))
    ) {
      violations.push(
        `${slash(path.relative(appRoot, file))}: formal loader must not import the QA shell`
      );
    }
    if (phase === 'cutover' && productionQueryViolation(parsed)) {
      violations.push(
        `${slash(path.relative(appRoot, file))}: legacy production query composition remains`
      );
    }
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

    const recoveryText = formalSources.map(({ source }) => source).join('\n');
    const recoveryMarkers = [
      'PhoneChunkRecoveryLineage',
      'automaticReloadCount',
      'lineageId',
      'loadPhoneStoryShell',
      'markStable',
      'sessionStorage',
      'vite:preloadError'
    ];
    const missingRecovery = recoveryMarkers.filter(
      (marker) => !recoveryText.includes(marker)
    );
    if (missingRecovery.length > 0) {
      violations.push(
        `cutover is missing an eager phone-core recovery boundary `
          + `(${missingRecovery.join(', ')})`
      );
    }
    violations.push(...storageLineageViolations(formalSources));

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
