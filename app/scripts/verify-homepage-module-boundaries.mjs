import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { phoneCleanArchitectureViolations } from './verify-phone-clean-architecture.mjs';

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

/** Unit 3 final boundary: the shell owns geometry, never scene presentation. */
export const phoneShellDebt = Object.freeze({
  maxLines: 322,
  sceneImports: new Set(),
  transitionImports: new Set(),
  mediaImports: new Set(),
  shellZoneImports: new Set([
    'aod-autoplay.ts::../../media/packed-alpha-video',
    'aod-autoplay.ts::../../scenes/aod-animation/progress',
    'phone-ink.ts::../../transitions/shared/inkField',
    'phone-ink.ts::../../transitions/shared/inkOwnership',
    'phone-ink.ts::../../transitions/shared/sceneInk',
    // Task 7 temporary stateless bridge; both entries are deleted at cutover.
    'hero-motion.ts::../../scenes/hero/phone/PhoneHero.motion',
    'module-loaders.ts::../../scenes/hero/phone/PhoneHero',
    'module-loaders.ts::../../scenes/pattern/phone/PhonePattern',
    'module-loaders.ts::../../scenes/star-map/phone/PhoneStarMap',
    'module-loaders.ts::../../scenes/aod-animation/phone/PhoneAod',
    'transitions/hero-pattern.tsx::../../../transitions/hero-pattern/phone',
    'transitions/pattern-star-map.tsx::../../../transitions/pattern-star-map/phone',
    'transitions/star-map-aod.tsx::../../../transitions/star-map-aod/phone',
    'module-loaders.ts::../../scenes/brand/phone/PhoneBrand',
    'module-loaders.ts::../../scenes/figure3-animation/phone/PhoneFigure3',
    'module-loaders.ts::../../scenes/services/phone/PhoneServices',
    'module-loaders.ts::../../scenes/ttg-animation/phone/PhoneTtg',
    'module-loaders.ts::../../scenes/lab/phone/PhoneLab',
    'module-loaders.ts::../../transitions/brand-figure3/phone',
    'module-loaders.ts::../../transitions/figure3-services/phone',
    'module-loaders.ts::../../transitions/services-ttg/phone',
    'module-loaders.ts::../../transitions/ttg-lab/phone'
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

for (const file of await filesBelow(path.join(phoneDir, 'scenes'))) {
  const source = await readFile(file, 'utf8');
  if (/new\s+URL\s*\(/.test(source)) {
    violations.push(`${display(file)}: scene adapters must resolve media through phone-media and product ownership contracts`);
  }
}

for (const violation of await phoneCleanArchitectureViolations({
  appRoot: appDir,
  phase: 'harness'
})) {
  violations.push(`clean phone architecture: ${violation}`);
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
