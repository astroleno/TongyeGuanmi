import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const APP_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const PROJECTOR_FILE = 'src/production/phone/phone-story-projector.ts';
const LEGACY_ISOLATED_FILE = 'src/production/phone/PhoneLabContactShell.tsx';

export const globalPresentationDatasetKeys = Object.freeze([
  'phoneAuthorityId',
  'phoneAuthorityScope',
  'phoneCursor',
  'phoneRevision',
  'phoneSession',
  'phoneSegment',
  'phoneTransitionPhase',
  'phoneTransitionLock',
  'phoneInputState',
  'phoneScrollCorridor',
  'phoneScrollProgress',
  'phoneStageOwner',
  'phoneStageScene',
  'phoneProjectionState',
  'phoneStableScene',
  'phoneAnchorY',
  'phoneRetryableRun',
  'portraitCheckpoint',
  'portraitCheckpointTrace',
  'portraitEdgeScene',
  'portraitEdgeSurface'
]);

function dataAttributeForProperty(property) {
  return `data-${property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

function escaped(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function writesDataAttribute(source, property) {
  const attribute = dataAttributeForProperty(property);
  const propertyPattern = escaped(property);
  const attributePattern = escaped(attribute);
  return [
    new RegExp(`\\.dataset\\.${propertyPattern}\\s*=`),
    new RegExp(`\\.dataset\\[['"]${propertyPattern}['"]\\]\\s*=`),
    new RegExp(`delete\\s+[^;\\n]*\\.dataset\\.${propertyPattern}`),
    new RegExp(`delete\\s+[^;\\n]*\\.dataset\\[['"]${propertyPattern}['"]\\]`),
    new RegExp(`\\.setAttribute\\(\\s*['"]${attributePattern}['"]`),
    new RegExp(`\\.removeAttribute\\(\\s*['"]${attributePattern}['"]`),
    new RegExp(`<[^>]*\\b${attributePattern}\\s*=`),
    new RegExp(`\\bdata\\s*\\([^;\\n]*['"]${propertyPattern}['"]`),
    new RegExp(`Object\\.assign\\(\\s*[^,\\n]*\\.dataset\\s*,\\s*\\{[^}]*\\b${propertyPattern}\\s*:`),
    new RegExp(`Reflect\\.set\\(\\s*[^,\\n]*\\.dataset\\s*,\\s*['"]${propertyPattern}['"]`)
  ].some((pattern) => pattern.test(source));
}

function isProjector(file) {
  return file.endsWith(PROJECTOR_FILE);
}

function isLegacyIsolatedValidation(file) {
  return file.endsWith(LEGACY_ISOLATED_FILE);
}

function groupVisibilityAttributes(source) {
  const attributes = new Set(source.match(
    /data-phone-(?:grade-a|group45|group67)-(?:stage(?:-[a-z0-9-]+)?|snap(?:-[a-z0-9-]+)?|scene(?:-[a-z0-9-]+)?|active|layer(?:-[a-z0-9-]+)?)/g
  ) ?? []);
  const propertyPattern = '(phone(?:GradeA|Group45|Group67)(?:Stage[A-Z][A-Za-z0-9]*|Stage|Snap[A-Z][A-Za-z0-9]*|Snap|Scene[A-Z][A-Za-z0-9]*|Scene|Active|Layer[A-Z][A-Za-z0-9]*|Layer))';
  const properties = [
    ...source.matchAll(new RegExp(`\\.dataset\\.${propertyPattern}\\s*=`, 'g')),
    ...source.matchAll(new RegExp(`\\.dataset\\[['"]${propertyPattern}['"]\\]\\s*=`, 'g')),
    ...source.matchAll(new RegExp(`delete\\s+[^;\\n]*\\.dataset\\.${propertyPattern}`, 'g')),
    ...source.matchAll(new RegExp(`delete\\s+[^;\\n]*\\.dataset\\[['"]${propertyPattern}['"]\\]`, 'g')),
    ...source.matchAll(new RegExp(`\\bdata\\s*\\([^;\\n]*['"]${propertyPattern}['"]`, 'g'))
  ].map((match) => match[1]);
  for (const property of properties) {
    attributes.add(dataAttributeForProperty(property));
  }
  return attributes;
}

/**
 * Presentation diagnostics are a write-only projection of the immutable
 * snapshot. Children may read them only through selectors, never publish or
 * clear them themselves. The isolated legacy shell is explicitly excluded
 * from the formal route by the module-graph verifier.
 */
export function phonePresentationOwnershipViolations({
  cssSources,
  runtimeSources
}) {
  const violations = [];
  for (const { file, source } of cssSources) {
    if (/data-phone-authority-(?:id|scope)/.test(source)) {
      violations.push(`${file}: CSS must not read phone authority diagnostics`);
    }
  }
  for (const { file, source } of runtimeSources) {
    for (const property of globalPresentationDatasetKeys) {
      if (!writesDataAttribute(source, property)) continue;
      if (isProjector(file) || isLegacyIsolatedValidation(file)) continue;
      violations.push(
        `${file}: ${dataAttributeForProperty(property)} may only be written by phone-story-projector`
      );
    }
    if (writesDataAttribute(source, 'phoneSurfaceRole')
      && !isProjector(file)
      && !file.endsWith('src/production/phone/phone-surface-roles.ts')) {
      violations.push(
        `${file}: data-phone-surface-role may only be written by surface/projector code`
      );
    }
    for (const attribute of groupVisibilityAttributes(source)) {
      violations.push(`${file}: group-local visibility attribute is forbidden (${attribute})`);
    }
  }
  for (const { file, source } of cssSources) {
    for (const attribute of groupVisibilityAttributes(source)) {
      violations.push(`${file}: group-local visibility attribute is forbidden (${attribute})`);
    }
  }
  return violations;
}

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
  violations.push(...phonePresentationOwnershipViolations({
    cssSources,
    runtimeSources
  }));
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
