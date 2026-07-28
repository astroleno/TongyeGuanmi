import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourceDir = path.join(appDir, 'src');
const productionDir = path.join(sourceDir, 'production');
const phoneDir = path.join(productionDir, 'phone');
const phoneCrossChunkContractPolicy = JSON.parse(await readFile(
  path.join(appDir, 'build', 'phone-cross-chunk-contract.json'),
  'utf8'
));
const phoneSceneAdapterDir = path.join(phoneDir, 'scenes');
const phoneTransitionAdapterDir = path.join(phoneDir, 'transitions');
const desktopDir = path.join(productionDir, 'desktop');
const portraitSpikeDir = path.join(productionDir, 'portrait-spike');
const storyDir = path.join(sourceDir, 'story');
const sourceExtensions = new Set(['.ts', '.tsx']);
const phoneShellPath = path.join(phoneDir, 'PhoneStoryShell.tsx');
const phoneShellCssPath = path.join(phoneDir, 'PhoneStoryShell.css');
const phoneProjectorPath = path.join(phoneDir, 'phone-story-projector.ts');
const phoneRuntimePath = path.join(phoneDir, 'phone-story-runtime.ts');
const phoneBootstrapPath = path.join(phoneDir, 'PhoneStoryBootstrap.tsx');
const phoneBrandLabStoryPath = path.join(phoneDir, 'PhoneBrandLabStory.tsx');
const phoneBrandLabScopePath = path.join(
  phoneDir,
  'scenes',
  'PhoneBrandLabScope.tsx'
);
const phoneLabContactShellPath = path.join(phoneDir, 'PhoneLabContactShell.tsx');
const phoneReactRuntimeAdapterPath = path.join(
  phoneDir,
  'usePhoneStoryOrchestratorRuntime.ts'
);
const phoneDocumentScrollRuntimePath = path.join(
  phoneDir,
  'usePhoneDocumentScrollRuntime.ts'
);
const phoneIntentCoordinatorPath = path.join(
  phoneDir,
  'phone-transition-coordinator.ts'
);
const phoneRunLandingPath = path.join(phoneDir, 'phone-run-landing.ts');
const phoneRunDefinitionsPath = path.join(phoneDir, 'phone-story-runs.ts');
const phoneRouteScopePath = path.join(phoneDir, 'phone-route-scope.ts');
const phoneContextPath = path.join(phoneDir, 'PhoneStoryOrchestratorContext.tsx');
const phoneLazyExecutionPaths = [
  path.join(sourceDir, 'scenes', 'figure3-animation', 'phone', 'PhoneFigure3.tsx'),
  path.join(sourceDir, 'scenes', 'ttg-animation', 'phone', 'PhoneTtg.tsx'),
  path.join(sourceDir, 'scenes', 'ph-animation', 'phone', 'PhonePh.tsx'),
  path.join(sourceDir, 'scenes', 'crane-animation', 'phone', 'PhoneCrane.tsx')
];
const mainPath = path.join(sourceDir, 'main.tsx');
const formalPhoneOwnershipPaths = [
  phoneShellPath,
  path.join(phoneDir, 'PhoneGradeAStory.tsx'),
  path.join(phoneDir, 'PhoneBrandLabContinuation.tsx'),
  path.join(phoneDir, 'PhoneLabContactContinuation.tsx'),
  path.join(phoneDir, 'PhoneGroup67DirectEntry.tsx'),
  path.join(phoneDir, 'usePhoneStageRuntime.ts'),
  path.join(phoneDir, 'usePhoneStoryOrchestratorRuntime.ts'),
  phoneRuntimePath
];

/** Unit 3 final boundary: the shell owns geometry, never scene presentation. */
export const phoneShellDebt = Object.freeze({
  maxLines: 320,
  sceneImports: new Set(),
  transitionImports: new Set(),
  mediaImports: new Set(),
  shellZoneImports: new Set([
    'aod-autoplay.ts::../../media/packed-alpha-video',
    'aod-autoplay.ts::../../scenes/aod-animation/progress',
    'phone-ink.ts::../../transitions/shared/inkField',
    'phone-ink.ts::../../transitions/shared/inkOwnership',
    'phone-ink.ts::../../transitions/shared/phone-ink-runtime',
    'phone-ink.ts::../../transitions/shared/sceneInk',
    'phone-timeline-runtime.ts::../../media/timeline-video-driver',
    'module-loaders.ts::../../scenes/brand/phone/PhoneBrand',
    'module-loaders.ts::../../scenes/figure3-animation/phone/PhoneFigure3',
    'module-loaders.ts::../../scenes/services/phone/PhoneServices',
    'module-loaders.ts::../../scenes/ttg-animation/phone/PhoneTtg',
    'module-loaders.ts::../../scenes/lab/phone/PhoneLab',
    'module-loaders.ts::../../transitions/brand-figure3/phone',
    'module-loaders.ts::../../transitions/figure3-services/phone',
    'module-loaders.ts::../../transitions/services-ttg/phone',
    'module-loaders.ts::../../transitions/ttg-lab/phone',
    'module-loaders.ts::../../transitions/lab-ph/phone',
    'module-loaders.ts::../../transitions/ph-education/phone',
    'module-loaders.ts::../../transitions/education-crane/phone',
    'module-loaders.ts::../../transitions/crane-contact/phone'
  ]),
  sceneRoots: new Set(),
  mediaKeys: new Set(),
  progressConstants: new Set()
});

export const phoneShellCssDebt = Object.freeze({
  maxLines: 74,
  assetUrls: new Set(),
  sceneRoots: new Set(),
  ownerTokens: new Set()
});

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

async function sourceModuleFile(candidate) {
  const paths = sourceExtensions.has(path.extname(candidate))
    ? [candidate]
    : [
        ...[...sourceExtensions].map((extension) => `${candidate}${extension}`),
        ...[...sourceExtensions].map((extension) => path.join(candidate, `index${extension}`))
      ];
  for (const target of paths) {
    try {
      if ((await stat(target)).isFile()) return target;
    } catch {
      // A CSS/asset/external import intentionally does not belong to this graph.
    }
  }
  return null;
}

/** Recurses through both static and literal dynamic imports. */
export async function literalModuleGraph(entries) {
  const graph = new Map();
  const pending = [...entries];
  while (pending.length > 0) {
    const candidate = pending.pop();
    if (!candidate) continue;
    const file = await sourceModuleFile(candidate);
    if (!file || graph.has(file)) continue;
    const source = await readFile(file, 'utf8');
    graph.set(file, source);
    for (const specifier of importSpecifiers(source)) {
      const target = relativeTarget(file, specifier);
      if (target) pending.push(target);
    }
  }
  return graph;
}

function graphEntries(graph) {
  return graph instanceof Map ? [...graph.entries()] : graph;
}

/**
 * Compression protection is source policy, not a post-build observation.
 * Every permitted raw runtime object must name every retained property here.
 */
export function phoneCrossChunkCompressionPolicyViolations(
  policy = phoneCrossChunkContractPolicy
) {
  const found = [];
  if (policy.schemaVersion !== 2) {
    found.push(`unsupported Phone cross-chunk contract schema: ${policy.schemaVersion}`);
    return found;
  }
  const reserved = new Set(policy.reservedPropertyNames);
  for (const contract of policy.retainedObjectContracts ?? []) {
    if (!contract.name || !Array.isArray(contract.callees) || contract.callees.length === 0) {
      found.push('Phone cross-chunk retained object contract requires a name and callee');
      continue;
    }
    if (!Array.isArray(contract.sourceSuffixes) || contract.sourceSuffixes.length === 0) {
      found.push(`${contract.name}: retained object contract requires source paths`);
    }
    for (const property of contract.propertyNames ?? []) {
      if (!reserved.has(property)) {
        found.push(`${contract.name}: retained object field is missing from mangle reserve (${property})`);
      }
    }
  }
  return found;
}

/**
 * React lazy components also exchange an object-shaped props/imperative-handle
 * contract. It is valid only because every executable field is retained from
 * property mangling; adding a field without declaring that protection fails
 * before Rollup can split caller and callee into independent chunks.
 */
export function phoneLazyAdapterPropReserveViolations(
  source,
  policy = phoneCrossChunkContractPolicy
) {
  const found = [];
  const reserved = new Set(policy.reservedPropertyNames);
  const parsed = ts.createSourceFile(
    'types.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const aliases = new Map();
  for (const statement of parsed.statements) {
    if (ts.isTypeAliasDeclaration(statement)) aliases.set(statement.name.text, statement);
  }
  const adapterAlias = /^Phone[A-Za-z0-9]*Adapter(?:Props|Handle)$/;
  const fieldsFor = (type) => {
    const fields = new Set();
    const inspect = (candidate) => {
      if (ts.isIntersectionTypeNode(candidate)) {
        for (const child of candidate.types) inspect(child);
        return;
      }
      if (ts.isTypeReferenceNode(candidate)) {
        for (const argument of candidate.typeArguments ?? []) inspect(argument);
        return;
      }
      if (!ts.isTypeLiteralNode(candidate)) return;
      for (const member of candidate.members) {
        if (!ts.isPropertySignature(member) && !ts.isMethodSignature(member)) continue;
        if (!member.name) continue;
        if (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)) {
          fields.add(member.name.text);
        }
      }
    };
    inspect(type);
    return fields;
  };
  for (const [name, alias] of aliases) {
    if (!adapterAlias.test(name)) continue;
    for (const field of fieldsFor(alias.type)) {
      if (!reserved.has(field)) {
        found.push(`${name}: cross-chunk adapter field is missing from mangle reserve (${field})`);
      }
    }
  }
  return found;
}

/**
 * Finds object literals passed into a lazy execution call. Parsing TS/TSX
 * keeps JSX, CSS templates, and return literals out of this boundary check;
 * only an actual CallExpression/NewExpression can enter the policy below.
 */
function unwrappedExpression(expression) {
  let candidate = expression;
  while (
    ts.isParenthesizedExpression(candidate)
    || ts.isAsExpression(candidate)
    || ts.isTypeAssertionExpression(candidate)
    || ts.isSatisfiesExpression(candidate)
    || ts.isNonNullExpression(candidate)
  ) {
    candidate = candidate.expression;
  }
  return candidate;
}

function objectLiteralExpression(expression) {
  const candidate = unwrappedExpression(expression);
  return ts.isObjectLiteralExpression(candidate) ? candidate : null;
}

/**
 * A raw boundary object cannot evade the policy merely by being named before
 * the call (`const options = { ... }; createAdapter(options)`). Keep the
 * nearest earlier literal binding so the same contract/field checks apply to
 * direct and one-hop local-object invocations.
 */
function objectLiteralBindings(parsed) {
  const bindings = new Map();
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.initializer
    ) {
      const object = objectLiteralExpression(node.initializer);
      if (object || ts.isIdentifier(unwrappedExpression(node.initializer))) {
        const declarations = bindings.get(node.name.text) ?? [];
        declarations.push({
          start: node.getStart(parsed),
          initializer: node.initializer
        });
        bindings.set(node.name.text, declarations);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return bindings;
}

function objectLiteralForExpression(expression, bindings, parsed, before, seen = new Set()) {
  const direct = objectLiteralExpression(expression);
  if (direct) return direct;
  const candidate = unwrappedExpression(expression);
  if (!ts.isIdentifier(candidate) || seen.has(candidate.text)) return null;
  const declaration = (bindings.get(candidate.text) ?? [])
    .filter((binding) => binding.start < before)
    .at(-1);
  if (!declaration) return null;
  seen.add(candidate.text);
  return objectLiteralForExpression(
    declaration.initializer,
    bindings,
    parsed,
    declaration.start,
    seen
  );
}

function callableName(node, parsed) {
  return node.expression.getText(parsed).replaceAll('?.', '.');
}

/**
 * A local bridge function is still a cross-chunk boundary if it forwards its
 * parameter into an imported/runtime callable. Resolve those simple, named
 * forwarding paths so `bridge({ ... })` cannot hide the object contract from
 * the same gate that rejects a direct `runtime({ ... })` call.
 */
function localCallableForwardingTargets(parsed) {
  const callables = new Map();
  const collect = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name && node.body) {
      callables.set(node.name.text, {
        parameters: node.parameters,
        body: node.body
      });
    }
    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.initializer
      && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      callables.set(node.name.text, {
        parameters: node.initializer.parameters,
        body: node.initializer.body
      });
    }
    ts.forEachChild(node, collect);
  };
  collect(parsed);

  const forwarded = new Map();
  for (const [name, callable] of callables) {
    const parameterIndex = new Map();
    callable.parameters.forEach((parameter, index) => {
      if (ts.isIdentifier(parameter.name)) parameterIndex.set(parameter.name.text, index);
    });
    const edges = new Map();
    const visit = (node) => {
      if (
        node !== callable.body
        && (ts.isFunctionDeclaration(node)
          || ts.isFunctionExpression(node)
          || ts.isArrowFunction(node))
      ) {
        return;
      }
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        const callee = callableName(node, parsed);
        node.arguments.forEach((argument, argumentIndex) => {
          const candidate = unwrappedExpression(argument);
          if (!ts.isIdentifier(candidate)) return;
          const sourceIndex = parameterIndex.get(candidate.text);
          if (sourceIndex === undefined) return;
          const targets = edges.get(sourceIndex) ?? [];
          targets.push({ callee, argumentIndex });
          edges.set(sourceIndex, targets);
        });
      }
      ts.forEachChild(node, visit);
    };
    visit(callable.body);
    forwarded.set(name, edges);
  }

  const resolve = (name, parameter, seen = new Set()) => {
    const key = `${name}:${parameter}`;
    if (seen.has(key)) return new Set();
    seen.add(key);
    const targets = new Set();
    for (const edge of forwarded.get(name)?.get(parameter) ?? []) {
      if (callables.has(edge.callee)) {
        for (const nested of resolve(edge.callee, edge.argumentIndex, new Set(seen))) {
          targets.add(nested);
        }
      } else {
        targets.add(edge.callee);
      }
    }
    return targets;
  };

  return { callables, resolve };
}

function rawObjectInvocations(source, file = 'phone.tsx') {
  const parsed = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const bindings = objectLiteralBindings(parsed);
  const forwarding = localCallableForwardingTargets(parsed);
  const invocations = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const callee = callableName(node, parsed);
      node.arguments.forEach((argument, argumentIndex) => {
        const object = objectLiteralForExpression(
          argument,
          bindings,
          parsed,
          node.getStart(parsed)
        );
        if (!object) return;
        invocations.push({ callee, object });
        for (const target of forwarding.resolve(callee, argumentIndex)) {
          invocations.push({ callee: target, object });
        }
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return invocations;
}

function rawObjectInvocationCallees(source, file = 'phone.tsx') {
  return new Set(rawObjectInvocations(source, file).map(({ callee }) => callee));
}

function localCallableNames(source, file = 'phone.tsx') {
  const found = new Set();
  const parsed = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      found.add(node.name.text);
    }
    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.initializer
      && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      found.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return found;
}

/** Object values may be stored in a local Set/Map without crossing a chunk. */
function localCollectionMethodCallees(source, file = 'phone.tsx') {
  const found = new Set();
  const parsed = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.initializer
      && ts.isNewExpression(node.initializer)
      && ts.isIdentifier(node.initializer.expression)
      && ['Set', 'Map', 'WeakSet', 'WeakMap'].includes(node.initializer.expression.text)
    ) {
      for (const method of ['add', 'delete', 'set']) {
        found.add(`${node.name.text}.${method}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return found;
}

function rawObjectInvocationFields(source, callee, file = 'phone.tsx') {
  const fields = new Set();
  let hasSpread = false;
  const collectValue = (value) => {
    if (ts.isObjectLiteralExpression(value)) {
      collectObject(value);
    } else if (ts.isArrayLiteralExpression(value)) {
      for (const item of value.elements) collectValue(item);
    }
  };
  const collectObject = (object) => {
    for (const property of object.properties) {
      if (ts.isSpreadAssignment(property)) {
        hasSpread = true;
        continue;
      }
      if (!('name' in property) || !property.name) continue;
      const name = ts.isIdentifier(property.name)
        || ts.isStringLiteral(property.name)
        || ts.isNumericLiteral(property.name)
        ? property.name.text
        : null;
      if (!name) {
        hasSpread = true;
        continue;
      }
      fields.add(name);
      if (ts.isPropertyAssignment(property)) collectValue(property.initializer);
    }
  };
  for (const invocation of rawObjectInvocations(source, file)) {
    if (invocation.callee === callee) collectObject(invocation.object);
  }
  return { fields, hasSpread };
}

const nonContractRawObjectCallees = new Set([
  'Array.from',
  'IntersectionObserver',
  'Object.freeze',
  'canvas.getContext',
  'document.addEventListener',
  'eventTarget.addEventListener',
  'request.signal.addEventListener',
  'signal.addEventListener',
  'video.addEventListener',
  'window.addEventListener'
]);

function hasFile(entries, target) {
  return entries.some(([file]) => path.normalize(file) === path.normalize(target));
}

function relativeFile(file) {
  return path.isAbsolute(file) ? display(file) : file.split(path.sep).join('/');
}

function functionBody(source, name) {
  const declaration = source.indexOf(`function ${name}(`);
  if (declaration < 0) return '';
  const openingBrace = source.indexOf('{', declaration);
  if (openingBrace < 0) return '';
  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    const character = source[index];
    if (character === '{') depth += 1;
    if (character !== '}') continue;
    depth -= 1;
    if (depth === 0) return source.slice(openingBrace + 1, index);
  }
  return '';
}

function invocationCount(source, name) {
  const executable = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  const pattern = new RegExp(`\\b${name}\\s*\\(`, 'g');
  let count = 0;
  for (const match of executable.matchAll(pattern)) {
    const before = executable.slice(0, match.index);
    if (/\bfunction\s+$/.test(before)) continue;
    count += 1;
  }
  return count;
}

function display(file) {
  return path.relative(appDir, file).split(path.sep).join('/');
}

function capturedValues(source, expression, group = 1) {
  return [...source.matchAll(expression)].map((match) => match[group]);
}

function sourceLineCount(source) {
  const content = source.endsWith('\n') ? source.slice(0, -1) : source;
  return content.length === 0 ? 0 : content.split(/\r?\n/).length;
}

export function scanPhoneShellDebt(source) {
  const imports = importSpecifiers(source);
  const mediaKeys = capturedValues(
    source,
    /phoneMediaUrlFor\((['"])([^'"]+)\1/g,
    2
  );
  return {
    lines: sourceLineCount(source),
    sceneImports: imports.filter((specifier) => specifier.startsWith('../../scenes/')),
    transitionImports: imports.filter((specifier) => specifier.startsWith('../../transitions/')),
    mediaImports: imports.filter((specifier) => specifier.startsWith('../../media/')),
    sceneRoots: capturedValues(source, /portrait-scroll-spike__scene--([a-z0-9-]+)/g),
    methodRoots: capturedValues(source, /\bid="(method)"/g),
    mediaKeys,
    mediaCallCount: [...source.matchAll(/\bphoneMediaUrlFor\s*\(/g)].length,
    progressConstants: capturedValues(
      source,
      /const\s+([A-Z][A-Z0-9_]*(?:_START|_END|_VIEWPORTS))\s*=/g
    )
  };
}

export function phoneShellDebtViolations(snapshot, debt = phoneShellDebt) {
  const found = [];
  const rejectUnknown = (values, allowed, label) => {
    const unknown = [...new Set(values)].filter((value) => !allowed.has(value));
    for (const value of unknown) {
      found.push(`new shell-owned ${label} is forbidden (${value})`);
    }
  };

  if (snapshot.lines > debt.maxLines) {
    found.push(`Unit 3 shell debt grew to ${snapshot.lines} lines (ratchet ${debt.maxLines})`);
  }
  rejectUnknown(snapshot.sceneImports, debt.sceneImports, 'scene import');
  rejectUnknown(snapshot.transitionImports, debt.transitionImports, 'transition import');
  rejectUnknown(snapshot.mediaImports, debt.mediaImports, 'media import');
  rejectUnknown(snapshot.sceneRoots, debt.sceneRoots, 'scene root');
  rejectUnknown(snapshot.mediaKeys, debt.mediaKeys, 'media key');
  rejectUnknown(snapshot.progressConstants, debt.progressConstants, 'progress constant');

  if (snapshot.sceneRoots.length > debt.sceneRoots.size) {
    found.push(
      `shell owns ${snapshot.sceneRoots.length} scene roots (ratchet ${debt.sceneRoots.size})`
    );
  }
  if (snapshot.methodRoots.length > 1) {
    found.push('shell may not add another Method content root');
  }
  if (snapshot.mediaCallCount !== snapshot.mediaKeys.length) {
    found.push('shell media ownership calls must use literal product media IDs');
  }
  if (snapshot.mediaKeys.length > debt.mediaKeys.size) {
    found.push(
      `shell owns ${snapshot.mediaKeys.length} media keys (ratchet ${debt.mediaKeys.size})`
    );
  }
  if (snapshot.progressConstants.length > debt.progressConstants.size) {
    found.push(
      `shell owns ${snapshot.progressConstants.length} progress constants `
        + `(ratchet ${debt.progressConstants.size})`
    );
  }
  return found;
}

export function scanPhoneShellCssDebt(source) {
  return {
    lines: sourceLineCount(source),
    assetUrls: capturedValues(source, /url\((['"]?)([^)'"]+)\1\)/g, 2),
    sceneRoots: capturedValues(
      source,
      /portrait-scroll-spike__scene--([a-z0-9-]+)/g
    ),
    ownerTokens: capturedValues(
      source,
      /portrait-scroll-spike__([a-z0-9]+)(?:[-_:])/g
    )
  };
}

export function phoneShellCssDebtViolations(snapshot, debt = phoneShellCssDebt) {
  const found = [];
  const rejectUnknown = (values, allowed, label) => {
    const unknown = [...new Set(values)].filter((value) => !allowed.has(value));
    for (const value of unknown) {
      found.push(`new shell-owned CSS ${label} is forbidden (${value})`);
    }
  };
  if (snapshot.lines > debt.maxLines) {
    found.push(`Unit 3 shell CSS debt grew to ${snapshot.lines} lines (ratchet ${debt.maxLines})`);
  }
  rejectUnknown(snapshot.assetUrls, debt.assetUrls, 'asset URL');
  rejectUnknown(snapshot.sceneRoots, debt.sceneRoots, 'scene root');
  rejectUnknown(snapshot.ownerTokens, debt.ownerTokens, 'owner token');
  return found;
}

export function shellZoneRendererImportViolations(
  relativeFile,
  specifier,
  debt = phoneShellDebt
) {
  const signature = `${relativeFile.split(path.sep).join('/')}::${specifier}`;
  return debt.shellZoneImports.has(signature)
    ? []
    : [`new shell-zone renderer import is forbidden (${relativeFile} -> ${specifier})`];
}

export function formalPhoneOwnershipViolations(files) {
  const found = [];
  const forbiddenState = [
    'completedInk',
    'visualRunPhaseRef',
    'phasesRef',
    'releaseBoundaryGeometryAtEndpoints'
  ];
  for (const { file, source } of files) {
    for (const token of forbiddenState) {
      if (source.includes(token)) found.push(`${file}: ${token} is forbidden`);
    }
    const shellOwner = file.endsWith('PhoneStoryShell.tsx');
    const runtimeOwner = file.endsWith('usePhoneStoryOrchestratorRuntime.ts');
    if (
      !shellOwner
      && !runtimeOwner
      && /\bPhoneTransitionSession\b|\bwindow\.scrollTo\s*\(/.test(source)
    ) {
      found.push(`${file}: child-owned session or scroll landing is forbidden`);
    }
    if (
      !shellOwner
      && /\b(?:publishCheckpoint|publishScene|publishEdgeScene|onCheckpoint|onSceneChange|onEdgeScene|reportPresentation)\b/.test(source)
    ) {
      found.push(`${file}: child semantic publication is forbidden`);
    }
    if (/\b(?:usePhoneEdgeSurface|usePhoneCheckpointPublisher|createPhoneOrchestratorPublisher|onPresentation|onRetryable)\b/.test(source)) {
      found.push(`${file}: callback or React edge/checkpoint publisher is forbidden`);
    }
  }
  const intentCoordinators = files.reduce(
    (count, { source }) => count
      + [...source.matchAll(/\bcreatePhoneIntentCoordinator\s*\(/g)].length,
    0
  );
  if (intentCoordinators !== 1) {
    found.push(
      `formal phone route must have exactly one intent coordinator (found ${intentCoordinators})`
    );
  }
  return found;
}

/** Formal `/` may share executors, but must never load a QA or legacy shell. */
export function formalPhoneRouteGraphViolations(graph) {
  const entries = graphEntries(graph);
  const found = [];
  for (const target of [
    phoneBrandLabStoryPath,
    phoneBrandLabScopePath,
    phoneLabContactShellPath
  ]) {
    if (hasFile(entries, target)) {
      found.push(`formal phone graph must exclude ${relativeFile(target)}`);
    }
  }
  for (const target of [
    phoneRuntimePath,
    path.join(phoneDir, 'PhoneBrandLabContinuation.tsx'),
    path.join(phoneDir, 'PhoneLabContactContinuation.tsx')
  ]) {
    if (!hasFile(entries, target)) {
      found.push(`formal phone graph must retain shared executor ${relativeFile(target)}`);
    }
  }
  return found;
}

/** Only the normalized pathname may select the QA route owner. */
export function phoneRouteScopeSelectorViolations({
  mainSource,
  routeScopeSource,
  formalShellSource,
  qaShellSource
}) {
  const found = [];
  const selector = functionBody(mainSource, 'phoneBrandLabScopeRequested');
  if (!selector.includes('phoneRouteScopeForPathname(window.location.pathname)')) {
    found.push('main.tsx: QA scope must be selected only through normalized pathname');
  }
  if (/window\.location\.(?:hash|search)/.test(selector)) {
    found.push('main.tsx: formal query/hash must not select the QA authority');
  }
  if (!routeScopeSource.includes("normalized === '/brand-lab'")) {
    found.push('phone-route-scope.ts: only /brand-lab may resolve to QA scope');
  }
  if (!/usePhoneStoryOrchestratorRuntime\(\s*'formal'/.test(formalShellSource)) {
    found.push('PhoneStoryShell.tsx: formal shell must inject literal scope: formal');
  }
  if (!/usePhoneStoryOrchestratorRuntime\(\s*'brand-lab'/.test(qaShellSource)) {
    found.push('PhoneBrandLabStory.tsx: QA shell must inject literal scope: brand-lab');
  }
  if (/PhoneLabContactShell/.test(qaShellSource)) {
    found.push('PhoneBrandLabStory.tsx: QA scope must not implement legacy PhoneLabContactShell');
  }
  return found;
}

/** QA may read the shared snapshot port but must not recreate formal owners. */
export function qaPhoneOwnershipViolations(source) {
  const found = [];
  const forbidden = [
    [
      /from\s+['"][^'"]*(?:phone-story-orchestrator|phone-story-projector|phone-transition-coordinator|usePhoneDocumentScrollRuntime)['"]/,
      'import a low-level execution owner'
    ],
    [
      /\b(?:createPhoneStoryOrchestrator|createPhoneStoryProjector|createPhoneStoryRuntime(?:ForReact)?|createPhoneIntentCoordinator|createPhoneDocumentScrollRuntime)\s*\(/,
      'construct a low-level execution owner'
    ],
    [/\b(?:usePhoneEdgeSurface|usePhoneCheckpointPublisher|createPhoneOrchestratorPublisher)\b/, 'publish edge/checkpoint state'],
    [/\b(?:publishScene|publishCheckpoint|publishEdgeScene|reportPresentation)\b/, 'publish presentation state'],
    [/\b(?:onPresentation|onRetryable)\b/, 'receive presentation callbacks'],
    [/\b(?:activeRunRef|currentRunRef|runView|sessionRef|lockRef)\b/, 'retain run/session/lock presentation state'],
    [
      /\buseState\s*<[^>\n]*(?:SceneId|StageScene|CurrentScene)[^>\n]*>|\b(?:const|let|var)\s+(?:currentScene|stageScene|activeScene)Ref\b|\bset(?:Current|Stage|Active)Scene\b/,
      'own current/stage scene state'
    ],
    [/\b\w+\.scroll(?:To|By)\s*\(|\.scrollIntoView\s*\(/, 'own document scroll'],
    [/(?:\.|\?\.)addEventListener\(\s*['"](?:wheel|touchstart|touchmove|touchend|touchcancel|scroll)['"]/, 'own a document scroll listener']
  ];
  for (const [pattern, action] of forbidden) {
    if (pattern.test(source)) {
      found.push(`PhoneBrandLabStory.tsx: QA scope must not ${action}`);
    }
  }
  return found;
}

/** Context hands descendants a read/write port, never the route lifecycle. */
export function phoneRuntimePortBoundaryViolations(contextSource) {
  const found = [];
  if (!contextSource.includes('createContext<PhoneStoryRuntimePort | null>(null)')) {
    found.push('PhoneStoryOrchestratorContext.tsx: Context must be typed as PhoneStoryRuntimePort');
  }
  if (!contextSource.includes('value={authority.port}')) {
    found.push('PhoneStoryOrchestratorContext.tsx: Context must expose authority.port only');
  }
  if (contextSource.includes('value={authority}')) {
    found.push('PhoneStoryOrchestratorContext.tsx: Context must not expose route lifecycle authority');
  }
  return found;
}

/**
 * Terser applies the configured private-property mangling independently to
 * emitted chunks. The authority core may build named reducer events locally,
 * but every lazy execution boundary must use an ordered tuple or a runtime
 * bridge instead of an object whose property names can diverge per chunk.
 */
export function phoneCrossChunkExecutionContractViolations(files) {
  const entries = graphEntries(files).map((entry) => (
    Array.isArray(entry) ? entry : [entry.file, entry.source]
  ));
  const found = phoneCrossChunkCompressionPolicyViolations();
  const sourceForSuffix = (suffix) => entries.find(([file]) => (
    file.split(path.sep).join('/').endsWith(suffix)
  ))?.[1];
  const adapterTypes = sourceForSuffix('src/production/phone/types.ts');
  if (adapterTypes) {
    found.push(...phoneLazyAdapterPropReserveViolations(adapterTypes));
  }
  const tupleContracts = [
    ['src/production/phone/phone-story-state.ts', 'export type PhoneExecutionToken = readonly ['],
    ['src/production/phone/phone-transition-coordinator.ts', 'export type PhoneIntent = readonly ['],
    ['src/production/phone/phone-story-runtime.ts', 'export type PhoneCinematicSnapshot = readonly ['],
    ['src/production/phone/phone-story-runtime.ts', 'export type PhoneCompositeSession = readonly ['],
    ['src/production/phone/phone-story-runtime.ts', 'export type PhoneRuntimeScrollSample = readonly ['],
    ['src/production/phone/types.ts', 'export type PhoneCinematicRequest = PhoneExecutionToken;'],
    ['src/production/phone/usePhoneDocumentScrollRuntime.ts', 'export type PhoneDocumentScrollSample = readonly ['],
    ['src/production/phone/phone-stage-timeline.ts', 'export type PhoneStageFrame = readonly ['],
    ['src/production/phone/phone-composite-snapshot.ts', 'export type PhoneCompositeVisualProjection = readonly ['],
    ['src/production/phone/phone-boundary-geometry.ts', 'export type PhoneBoundaryGeometryOwner = readonly ['],
    ['src/production/phone/phone-lab-contact-timeline.ts', 'export type PhoneLabContactAutoplayEvent = readonly [']
  ];
  for (const [suffix, signature] of tupleContracts) {
    const source = sourceForSuffix(suffix);
    if (!source?.includes(signature)) {
      found.push(`${path.basename(suffix)}: cross-chunk transport must remain positional (${signature})`);
    }
  }

  const bridgeContracts = [
    ['src/transitions/figure2-distance-expand/index.ts', 'export type PhoneFigure2DistanceExpandBridgeRequest = readonly ['],
    ['src/transitions/shared/phone-ink-runtime.ts', 'export type PhoneInkRuntimeRequest = readonly ['],
    ['src/transitions/shared/phone-ink-runtime.ts', 'export type PhoneFigure2DepthInkRuntimeRequest = readonly ['],
    ['src/transitions/shared/phone-ink-runtime.ts', 'export type PhoneHeroRadialInkRequest = readonly ['],
    ['src/production/phone/phone-timeline-runtime.ts', 'export type PhoneTimelineVideoInput = readonly ['],
    ['src/production/phone/phone-ink.ts', 'export type PhoneInkTransitionRequest = readonly ['],
    ['src/production/phone/transitions/PhoneInkTransition.tsx', 'export type PhoneInkAdapterRequest = readonly ['],
    ['src/production/phone/scenes/usePhoneCinematicRun.ts', 'export type PhoneCinematicRunRequest = readonly ['],
    ['src/production/phone/scenes/phone-packed-alpha-surface.ts', 'export type PhonePackedAlphaSurfaceRequest = readonly ['],
    ['src/production/phone/phone-presented-reverse-playback.ts', 'export type PhonePresentedReversePlaybackRequest = readonly ['],
    ['src/production/phone/transitions/PhoneEndpointTransition.ts', 'export type PhoneEndpointAdapterRequest = readonly ['],
    ['src/scenes/figure3-animation/phone/paper-compositor.ts', 'export type PhoneFigure3PaperCompositorRequest = readonly ['],
    ['src/scenes/figure3-animation/phone/reverse-playback.ts', 'export type PhoneFigure3ReversePlaybackRequest = readonly [']
  ];
  for (const [suffix, signature] of bridgeContracts) {
    const source = sourceForSuffix(suffix);
    if (source && !source.includes(signature)) {
      found.push(`${suffix}: cross-chunk bridge must remain positional (${signature})`);
    }
  }

  const rawIdentityCore = new Set([
    'phone-story-state.ts',
    'phone-story-orchestrator.ts',
    'phone-orchestrated-session.ts'
  ]);
  const rawEventCore = new Set([
    'phone-story-runtime.ts',
    'phone-orchestrated-session.ts'
  ]);
  const phoneTimelineAdapterSuffixes = [
    '/src/production/phone/scenes/PhoneHero.motion.ts',
    '/src/production/phone/scenes/PhoneAod.tsx',
    '/src/scenes/ttg-animation/phone/PhoneTtg.tsx',
    '/src/scenes/ph-animation/phone/PhonePh.reverse.ts',
    '/src/scenes/crane-animation/phone/PhoneCrane.autoplay.ts',
    '/src/scenes/figure3-animation/phone/PhoneFigure3.tsx'
  ];
  for (const [file, source] of entries) {
    const name = path.basename(file);
    const normalized = file.split(path.sep).join('/');
    const rawObjectCallees = rawObjectInvocationCallees(source, file);
    const lazyExecutionAdapter = normalized.includes('/src/production/phone/transitions/')
      || normalized.includes('/src/production/phone/scenes/')
      || /\/src\/scenes\/[^/]+\/phone\//.test(normalized)
      || /\/src\/transitions\/[^/]+\/phone\.(?:ts|tsx)$/.test(normalized);
    if (
      normalized.endsWith('/src/production/phone/phone-transition-coordinator.ts')
      && rawObjectCallees.has('onIntent')
    ) {
      found.push(
        `${name}: input bridge must use the PhoneIntent positional tuple, not a raw object`
      );
    }
    if (!rawIdentityCore.has(name) && /\bPhoneExecutionIdentity\b/.test(source)) {
      found.push(`${name}: raw PhoneExecutionIdentity is forbidden outside authority core`);
    }
    if (
      !rawEventCore.has(name)
      && [...rawObjectCallees].some((callee) => callee.endsWith('.dispatch'))
    ) {
      found.push(`${name}: raw dispatch object is forbidden outside runtime event core`);
    }
    if (
      !rawEventCore.has(name)
      && [...rawObjectCallees].some((callee) => /\.(?:begin|enter|reverse)$/.test(callee))
    ) {
      found.push(`${name}: raw cinematic request object is forbidden at execution boundary`);
    }
    if (lazyExecutionAdapter && /\b(?:create|use)Phone[A-Za-z0-9_]*\s*\(\s*\{/.test(source)) {
      found.push(`${name}: raw create/usePhone object contract is forbidden at lazy execution boundary`);
    }
    if (lazyExecutionAdapter && /\bcreateFigure2DistanceExpandTransition\s*\(\s*\{/.test(source)) {
      found.push(`${name}: raw Figure2 transition builder object is forbidden at lazy execution boundary`);
    }
    if (lazyExecutionAdapter && /\.buildTimeline\s*\(\s*\{/.test(source)) {
      found.push(`${name}: raw timeline context object is forbidden at lazy execution boundary`);
    }
    if (
      normalized.endsWith('/src/production/phone/phone-ink.ts')
      && /\b(?:createInkFieldRenderer|mountTransitionInkCanvas|createInkFieldFrame|applyConcealBoundary|applyRevealBoundary)\s*\(/.test(source)
    ) {
      found.push(`${name}: Phone ink must delegate renderer objects through phone-ink-runtime`);
    }
    if (
      normalized.endsWith('/src/transitions/figure2-distance-expand/index.ts')
      && /\b(?:createInkFieldRenderer|mountTransitionInkCanvas|createInkFieldFrame)\s*\(/.test(source)
    ) {
      found.push(`${name}: Figure2 depth ink must delegate renderer objects through phone-ink-runtime`);
    }
    if (
      normalized.endsWith('/src/production/phone/scenes/PhoneHero.tsx')
      && /\bcreateRadialInkIntroController\s*\(\s*\{/.test(source)
    ) {
      found.push(`${name}: Hero radial ink must delegate field objects through phone-ink-runtime`);
    }
    if (
      phoneTimelineAdapterSuffixes.some((suffix) => normalized.endsWith(suffix))
      && /\b(?:driveTimelineVideo|prepareTimelineVideoFrame|disposeTimelineVideoDriver|timelineVideoDriverFor|TimelineVideoDriveInput)\b/.test(source)
    ) {
      found.push(`${name}: Timeline driver data must use phone-timeline-runtime tuples`);
    }
    if (lazyExecutionAdapter) {
      const localCallables = localCallableNames(source, file);
      const localCollectionCalls = localCollectionMethodCallees(source, file);
      for (const callee of rawObjectCallees) {
        if (
          localCallables.has(callee)
          || localCollectionCalls.has(callee)
          || nonContractRawObjectCallees.has(callee)
        ) {
          continue;
        }
        const matchingPolicies = phoneCrossChunkContractPolicy.retainedObjectContracts.filter(
          (contract) => contract.callees.includes(callee)
        );
        const allowedPolicies = matchingPolicies.filter((contract) => (
          contract.sourceSuffixes.some((suffix) => normalized.endsWith(`/${suffix}`))
        ));
        if (allowedPolicies.length === 0) {
          const policyPhrase = matchingPolicies.length > 0
            ? 'without a retained policy or tuple bridge'
            : 'without a tuple bridge or retained policy';
          found.push(
            `${name}: raw ${callee} object contract is forbidden ${policyPhrase}`
          );
          continue;
        }
        const retainedFields = new Set(allowedPolicies.flatMap(
          (contract) => contract.propertyNames
        ));
        const invocation = rawObjectInvocationFields(source, callee, file);
        if (invocation.hasSpread) {
          found.push(
            `${name}: raw ${callee} object contract must not use object spread; use explicit retained fields or a tuple bridge`
          );
        }
        for (const field of invocation.fields) {
          if (!retainedFields.has(field)) {
            found.push(
              `${name}: raw ${callee} field ${field} is missing from retained policy`
            );
          }
        }
      }
    }
  }
  return found;
}

function isFile(file, expected) {
  return path.normalize(file) === path.normalize(expected)
    || path.basename(file) === path.basename(expected);
}

const formalChildBypassAllowlist = [
  phoneRuntimePath,
  phoneReactRuntimeAdapterPath,
  path.join(phoneDir, 'usePhoneStoryEntry.ts'),
  phoneIntentCoordinatorPath,
  phoneDocumentScrollRuntimePath,
  path.join(phoneDir, 'usePhoneViewportGeometry.ts'),
  // This shared physical-gesture helper only unlocks already-mounted media;
  // it cannot create navigation, scroll, or a story transaction.
  path.join(productionDir, 'mobile-media-unlock.ts')
];

/**
 * Rejects alternate runtime factories, scroll/input owners, and durable
 * presentation state anywhere reachable from the formal route.
 */
export function phoneExecutionOwnershipViolations(files) {
  const entries = graphEntries(files);
  const found = [];
  const factories = [
    ['createPhoneStoryOrchestrator', phoneRuntimePath],
    ['createPhoneStoryRuntime', phoneRuntimePath],
    ['createPhoneStoryRuntimeForReact', phoneReactRuntimeAdapterPath],
    ['createPhoneIntentCoordinator', phoneRuntimePath],
    ['createPhoneDocumentScrollRuntime', phoneRuntimePath]
  ];
  for (const [name, owner] of factories) {
    let count = 0;
    for (const [file, source] of entries) {
      const calls = invocationCount(source, name);
      count += calls;
      if (calls > 0 && !isFile(file, owner)) {
        found.push(
          `${relativeFile(file)}: ${name} may only be assembled by ${relativeFile(owner)}`
        );
      }
    }
    if (count !== 1) {
      found.push(`formal phone graph must have exactly one ${name} invocation (found ${count})`);
    }
  }

  for (const [file, source] of entries) {
    if (/^(?:export\s+)?(?:const|let|var)\s+\w*(?:authority|store)\w*\s*=\s*createPhoneStory(?:Runtime(?:ForReact)?|Orchestrator)\s*\(/mi.test(source)) {
      found.push(`${relativeFile(file)}: module-scope authority/store singleton is forbidden`);
    }
    const allowedChildOwner = formalChildBypassAllowlist.some((owner) => (
      isFile(file, owner)
    ));
    if (!allowedChildOwner && /\bwindow\.scroll(?:To|By)\s*\(|\.scrollIntoView\s*\(/.test(source)) {
      found.push(`${relativeFile(file)}: child-owned scroll command is forbidden`);
    }
    if (!allowedChildOwner && /(?:\.|\?\.)addEventListener\(\s*['"](?:wheel|touchstart|touchmove|touchend|touchcancel|scroll)['"]/.test(source)) {
      found.push(`${relativeFile(file)}: child-owned wheel/touch/document-scroll listener is forbidden`);
    }
    if (/\buseState\s*<[^>\n]*(?:SceneId|StageScene|CurrentScene)/.test(source)) {
      found.push(`${relativeFile(file)}: component-owned SceneId presentation state is forbidden`);
    }
    if (/\b(?:activeRunRef|runView)\b/.test(source)) {
      found.push(`${relativeFile(file)}: component-owned run presentation state is forbidden`);
    }
    if (/\.cursor\s*\(/.test(source)) {
      found.push(`${relativeFile(file)}: cursor() compatibility access is forbidden`);
    }
    if (/\bPhoneStableSceneAdapter\b/.test(source)) {
      found.push(`${relativeFile(file)}: PhoneStableSceneAdapter compatibility API is forbidden`);
    }
  }
  return found;
}

/** Keeps every declared run-anchor policy on the one exhaustive resolver. */
export function phoneRunAnchorResolverViolations({
  definitionsSource,
  resolverSource
}) {
  const found = [];
  const policyBlock = definitionsSource.match(
    /export type PhoneRunAnchorPolicy\s*=([\s\S]*?);/
  )?.[1] ?? '';
  const policies = [...policyBlock.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  for (const policy of policies) {
    if (!resolverSource.includes(`case '${policy}':`)) {
      found.push(`phone-run-landing.ts: missing ${policy} anchor resolver case`);
    }
  }
  if (!/default:\s*return exhaustivePolicy\(policy\);/s.test(resolverSource)) {
    found.push('phone-run-landing.ts: anchor resolver must reject unknown policies exhaustively');
  }
  return found;
}

const violations = [];

for (const file of await filesBelow(productionDir)) {
  const source = await readFile(file, 'utf8');
  const specifiers = importSpecifiers(source);
  const imports = specifiers
    .map((specifier) => ({ specifier, target: relativeTarget(file, specifier) }))
    .filter((entry) => Boolean(entry.target));
  const targets = imports.map(({ target }) => target);
  if (isWithin(file, phoneDir)) {
    if (targets.some((target) => isWithin(target, portraitSpikeDir))) {
      violations.push(`${display(file)}: phone code must not import portrait-spike`);
    }
    if (targets.some((target) => isWithin(target, desktopDir))) {
      violations.push(`${display(file)}: phone code must not import desktop`);
    }
    const shellZone = !isWithin(file, phoneSceneAdapterDir)
      && !isWithin(file, phoneTransitionAdapterDir);
    if (shellZone) {
      for (const { specifier, target } of imports) {
        const sharedRendererImport = isWithin(target, path.join(sourceDir, 'scenes'))
          || isWithin(target, path.join(sourceDir, 'transitions'))
          || isWithin(target, path.join(sourceDir, 'media'));
        if (!sharedRendererImport) continue;
        for (const violation of shellZoneRendererImportViolations(
          path.relative(phoneDir, file),
          specifier
        )) {
          violations.push(`${display(file)}: ${violation}`);
        }
      }
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
  phoneShellPath,
  path.join(phoneDir, 'PhoneStageRail.tsx'),
  path.join(desktopDir, 'DesktopStoryShell.tsx')
]) {
  const source = await readFile(file, 'utf8');
  if (/new\s+URL\s*\(/.test(source)) {
    violations.push(`${display(file)}: shell layers must not own asset URLs`);
  }
}

const phoneShellSource = await readFile(phoneShellPath, 'utf8');
const phoneShellSnapshot = scanPhoneShellDebt(phoneShellSource);
for (const violation of phoneShellDebtViolations(phoneShellSnapshot)) {
  violations.push(`${display(phoneShellPath)}: ${violation}`);
}

const phoneShellCssSource = await readFile(phoneShellCssPath, 'utf8');
const phoneShellCssSnapshot = scanPhoneShellCssDebt(phoneShellCssSource);
for (const violation of phoneShellCssDebtViolations(phoneShellCssSnapshot)) {
  violations.push(`${display(phoneShellCssPath)}: ${violation}`);
}

const formalPhoneOwnershipSources = await Promise.all(
  formalPhoneOwnershipPaths.map(async (file) => ({
    file: display(file),
    source: await readFile(file, 'utf8')
  }))
);
violations.push(...formalPhoneOwnershipViolations(formalPhoneOwnershipSources));

const formalPhoneGraph = await literalModuleGraph([
  phoneBootstrapPath,
  phoneShellPath
]);
const formalPhoneGraphEntries = graphEntries(formalPhoneGraph);
violations.push(...formalPhoneRouteGraphViolations(formalPhoneGraph));
violations.push(...phoneExecutionOwnershipViolations(formalPhoneGraph));
violations.push(...phoneRouteScopeSelectorViolations({
  mainSource: await readFile(mainPath, 'utf8'),
  routeScopeSource: await readFile(phoneRouteScopePath, 'utf8'),
  formalShellSource: await readFile(phoneShellPath, 'utf8'),
  qaShellSource: await readFile(phoneBrandLabStoryPath, 'utf8')
}));
violations.push(...qaPhoneOwnershipViolations(
  await readFile(phoneBrandLabStoryPath, 'utf8')
));
violations.push(...phoneRuntimePortBoundaryViolations(
  await readFile(phoneContextPath, 'utf8')
));
violations.push(...phoneRunAnchorResolverViolations({
  definitionsSource: await readFile(phoneRunDefinitionsPath, 'utf8'),
  resolverSource: await readFile(phoneRunLandingPath, 'utf8')
}));

const crossChunkExecutionFiles = [
  ...(await filesBelow(phoneDir)).filter((file) => !/\.(?:test|spec)\.(?:ts|tsx)$/.test(file)),
  ...phoneLazyExecutionPaths
];
const crossChunkExecutionGraph = await literalModuleGraph(crossChunkExecutionFiles);
violations.push(...phoneCrossChunkExecutionContractViolations(
  graphEntries(crossChunkExecutionGraph).map(([file, source]) => ({ file, source }))
));

if (!formalPhoneGraphEntries.some(([file]) => isFile(file, phoneRuntimePath))) {
  violations.push(`${display(phoneRuntimePath)}: formal graph must use the route-local runtime factory`);
}

const projectorSource = await readFile(phoneProjectorPath, 'utf8');
for (const token of [
  'phoneCursor',
  'phoneRevision',
  'phoneSurfaceRole',
  'portraitCheckpointTrace',
  'phoneEdgeSurfaceForScene',
  'theme-color'
]) {
  if (!projectorSource.includes(token)) {
    violations.push(`${display(phoneProjectorPath)}: projector must own ${token}`);
  }
}
const runtimeSource = await readFile(phoneRuntimePath, 'utf8');
if (!runtimeSource.includes('createPhoneStoryRuntime')) {
  violations.push(`${display(phoneRuntimePath)}: route-local runtime factory is missing`);
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

process.stdout.write(
  `Homepage module boundaries verified; Unit 3 phone-shell debt ratchet: `
    + `${phoneShellSnapshot.sceneRoots.length} scene roots, `
    + `${phoneShellSnapshot.mediaKeys.length} media keys, `
    + `${phoneShellSnapshot.progressConstants.length} progress constants, `
    + `${phoneShellSnapshot.lines} TSX lines, `
    + `${phoneShellCssSnapshot.lines} CSS lines.\n`
);
