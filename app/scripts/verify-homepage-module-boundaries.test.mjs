import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  classifyHomepageSource,
  homepageModuleBoundaryViolations,
  verifyHomepageModuleBoundaries
} from './verify-homepage-module-boundaries.mjs';

const { test } = process.env.VITEST
  ? await import('vitest')
  : await import('node:test');

const sourceDir = '/fixture/src';
const source = (file, content) => ({ file: path.join(sourceDir, file), source: content });

test('classifies the clean phone, desktop, story, and shared zones', () => {
  assert.equal(classifyHomepageSource(
    '/fixture/src/production/phone-story/runtime.ts',
    sourceDir
  ), 'phone');
  assert.equal(classifyHomepageSource(
    '/fixture/src/scenes/hero/phone/PhoneHero.tsx',
    sourceDir
  ), 'phone');
  assert.equal(classifyHomepageSource(
    '/fixture/src/production/desktop/DesktopStoryShell.tsx',
    sourceDir
  ), 'desktop');
  assert.equal(classifyHomepageSource('/fixture/src/story/manifest.ts', sourceDir), 'story');
});

test('accepts internal imports and imports from presentation zones to shared code', () => {
  assert.deepEqual(homepageModuleBoundaryViolations([
    source('production/phone-story/runtime.ts', "import './machine';\n"),
    source('production/desktop/DesktopStoryShell.tsx', "import '../../runtime/x';\n"),
    source('story/manifest.ts', "import './copy';\n")
  ], { sourceDir }), []);
});

test('rejects desktop/phone coupling and presentation imports from story contracts', () => {
  const found = homepageModuleBoundaryViolations([
    source(
      'production/desktop/DesktopStoryShell.tsx',
      "import '../../scenes/hero/phone/PhoneHero';\n"
    ),
    source(
      'production/phone-story/runtime.ts',
      "import '../desktop/DesktopStoryShell';\n"
    ),
    source(
      'story/manifest.ts',
      "import '../production/phone-story/protocol';\n"
    )
  ], { sourceDir });
  assert.ok(found.some((violation) => violation.includes(
    'desktop must not import phone'
  )));
  assert.ok(found.some((violation) => violation.includes(
    'phone must not import desktop'
  )));
  assert.ok(found.some((violation) => violation.includes(
    'shared story contracts must not import a presentation shell'
  )));
});

test('fails closed on deleted authorities and computed module syntax', () => {
  const found = homepageModuleBoundaryViolations([
    source(
      'production/phone-story/runtime.ts',
      "import '../phone/PhoneStoryShell';\nimport(runtimePath);\nrequire('./machine');\n"
    )
  ], { sourceDir });
  assert.ok(found.some((violation) => violation.includes(
    'imports deleted phone authority'
  )));
  assert.ok(found.some((violation) => violation.includes(
    'dynamic import must use a static string specifier'
  )));
  assert.ok(found.some((violation) => violation.includes(
    'CommonJS require is forbidden'
  )));
});

test('the repository passes the cutover homepage boundary', {
  timeout: 15_000
}, async () => {
  const result = await verifyHomepageModuleBoundaries();
  assert.equal(result.phase, 'cutover');
  assert.ok(result.files > 0);
  const gateSource = await readFile(new URL(
    './verify-homepage-module-boundaries.mjs',
    import.meta.url
  ), 'utf8');
  assert.ok(gateSource.includes("phase: 'cutover'"));
});
