import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import { phoneCleanArchitectureViolations } from './verify-phone-clean-architecture.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const appDir = path.dirname(path.dirname(SCRIPT_PATH));
const sourceExtensions = new Set(['.ts', '.tsx', '.mts', '.cts']);

function isWithin(target, directory) {
  return target === directory || target.startsWith(`${directory}${path.sep}`);
}

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    const info = entry.isFile() || entry.isDirectory() ? entry : await stat(target);
    if (info.isDirectory()) {
      return filesBelow(target);
    }
    return [target];
  }));
  return files.flat().sort();
}

function sourceFileFor(file, source) {
  const kind = file.endsWith('.tsx')
    ? ts.ScriptKind.TSX
    : ts.ScriptKind.TS;
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
}

function moduleReferences(file, source, parsed) {
  const references = [];
  const sourceFile = parsed ?? sourceFileFor(file, source);
  const addSpecifier = (node, expression, kind) => {
    if (expression && ts.isStringLiteralLike(expression)) {
      references.push({ node, specifier: expression.text, kind });
    } else {
      references.push({
        node,
        syntaxViolation: `${kind} must use a static string specifier`
      });
    }
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) {
        addSpecifier(node, node.moduleSpecifier, 'ESM import/export');
      }
    } else if (ts.isImportEqualsDeclaration(node)) {
      references.push({ node, syntaxViolation: 'import-equals is forbidden' });
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        addSpecifier(node, node.arguments[0], 'dynamic import');
      } else if (
        ts.isIdentifier(node.expression)
        && node.expression.text === 'require'
      ) {
        references.push({ node, syntaxViolation: 'CommonJS require is forbidden' });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return references;
}

function display(file, root) {
  return path.relative(root, file).split(path.sep).join('/');
}

export function classifyHomepageSource(file, sourceDir) {
  const relative = display(path.resolve(file), path.resolve(sourceDir));
  if (relative.startsWith('production/desktop/')) return 'desktop';
  if (relative.startsWith('production/phone-story/')) return 'phone';
  if (/^scenes\/.+\/phone(?:\/|\.|$)/.test(relative)) return 'phone';
  if (/^transitions\/.+\/phone(?:\/|\.|$)/.test(relative)) return 'phone';
  if (relative.startsWith('story/')) return 'story';
  return 'shared';
}

export function homepageModuleBoundaryViolations(
  sources,
  { sourceDir }
) {
  const violations = [];
  const absoluteSourceDir = path.resolve(sourceDir);
  const legacyPhoneDir = path.join(absoluteSourceDir, 'production', 'phone');
  const legacySpikeDir = path.join(
    absoluteSourceDir,
    'production',
    'portrait-spike'
  );
  for (const { file, source, parsed } of sources) {
    const absoluteFile = path.resolve(file);
    const owner = classifyHomepageSource(absoluteFile, absoluteSourceDir);
    for (const reference of moduleReferences(absoluteFile, source, parsed)) {
      if (reference.syntaxViolation) {
        if (owner !== 'shared') {
          violations.push(
            `${display(absoluteFile, absoluteSourceDir)}: ${reference.syntaxViolation}`
          );
        }
        continue;
      }
      if (!reference.specifier.startsWith('.')) continue;
      const target = path.resolve(path.dirname(absoluteFile), reference.specifier);
      const targetZone = classifyHomepageSource(target, absoluteSourceDir);
      if (isWithin(target, legacyPhoneDir) || isWithin(target, legacySpikeDir)) {
        violations.push(
          `${display(absoluteFile, absoluteSourceDir)}: imports deleted phone authority `
            + `(${reference.specifier})`
        );
      }
      if (owner === 'desktop' && targetZone === 'phone') {
        violations.push(
          `${display(absoluteFile, absoluteSourceDir)}: desktop must not import phone`
        );
      }
      if (owner === 'phone' && targetZone === 'desktop') {
        violations.push(
          `${display(absoluteFile, absoluteSourceDir)}: phone must not import desktop`
        );
      }
      if (
        owner === 'story'
        && (targetZone === 'desktop' || targetZone === 'phone')
      ) {
        violations.push(
          `${display(absoluteFile, absoluteSourceDir)}: shared story contracts must not `
            + 'import a presentation shell'
        );
      }
    }
  }
  return [...new Set(violations)].sort();
}

export async function verifyHomepageModuleBoundaries(root = appDir) {
  const sourceDir = path.join(root, 'src');
  const allFiles = await filesBelow(sourceDir);
  const files = allFiles.filter((file) => sourceExtensions.has(path.extname(file)));
  const sources = await Promise.all(files.map(async (file) => ({
    file,
    source: await readFile(file, 'utf8')
  })));
  // The full inventory retains JS, CSS and unexpected core files for the phone
  // guard. Only the boundary check filters to its existing TS extensions.
  const sourceSnapshot = { sourceDir, files: allFiles,
    texts: new Map(sources.map(({ file, source }) => [file, source])),
    parsed: new Map(sources.map(({ file, source }) => [file, sourceFileFor(file, source)])) };
  const violations = homepageModuleBoundaryViolations(sources.map((entry) => ({
    ...entry, parsed: sourceSnapshot.parsed.get(entry.file)
  })), { sourceDir });
  for (const violation of await phoneCleanArchitectureViolations({
    appRoot: root,
    phase: 'cutover',
    sourceSnapshot
  })) {
    violations.push(`clean phone architecture: ${violation}`);
  }
  if (violations.length > 0) {
    throw new Error(
      `Homepage module boundary violations:\n`
        + [...new Set(violations)].sort().map((violation) => `- ${violation}`).join('\n')
    );
  }
  return { files: files.length, phase: 'cutover' };
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(SCRIPT_PATH)) {
  const result = await verifyHomepageModuleBoundaries();
  process.stdout.write(
    `Homepage module boundaries verified (${result.files} source files; cutover).\n`
  );
}
