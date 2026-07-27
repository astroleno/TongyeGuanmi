import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourceDir = path.join(appDir, 'src');
const productionDir = path.join(sourceDir, 'production');
const phoneDir = path.join(productionDir, 'phone');
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
    'phone-ink.ts::../../transitions/shared/sceneInk',
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

function hasFile(entries, target) {
  return entries.some(([file]) => path.normalize(file) === path.normalize(target));
}

function relativeFile(file) {
  return path.isAbsolute(file) ? display(file) : file.split(path.sep).join('/');
}

function sourceFor(entries, target) {
  return entries.find(([file]) => path.normalize(file) === path.normalize(target))?.[1];
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
