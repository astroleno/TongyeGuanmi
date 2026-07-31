import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  booleanDataContractViolations,
  cssBooleanDataAttributes,
  verifyBooleanDataContract
} from './verify-boolean-data-contract.mjs';

const { afterEach, test } = process.env.VITEST
  ? await import('vitest')
  : await import('node:test');

const temporaryRoots = [];

async function writeFixture(files) {
  const root = await mkdtemp(path.join(tmpdir(), 'r5-boolean-contract-'));
  temporaryRoots.push(root);
  for (const [relative, source] of Object.entries({
    'vite.config.ts': 'export default {};\n',
    'src/runtime/semantic-data-attribute.ts': `
      export type SemanticBoolean = 'true' | 'false';
      export function semanticBoolean(value: boolean): SemanticBoolean {
        return value ? 'true' : 'false';
      }
    `,
    ...files
  })) {
    const target = path.join(root, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, source, 'utf8');
  }
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => (
    rm(root, { recursive: true, force: true })
  )));
});

test('discovers attributes selected through quoted and unquoted textual booleans', () => {
  assert.deepEqual(cssBooleanDataAttributes(`
    [data-visible="true"] {}
    [data-stage-active='false'] {}
    [data-ready=true] {}
    [data-loaded=false] {}
    [data-scene="hero"] {}
  `), new Set(['loaded', 'ready', 'stage-active', 'visible']));
});

test('rejects integer compression, raw JSX booleans, and String(undefined)', () => {
  assert.deepEqual(booleanDataContractViolations({
    viteSource: 'compress: { booleans_as_integers: true }',
    cssSources: [{
      file: 'scene.css',
      source: '[data-visible="true"] {} [data-ready="false"] {}'
    }],
    runtimeSources: [{
      file: 'scene.tsx',
      source: `
        <div data-ready={ready} />
        root.dataset.visible = String(maybeUndefined);
      `
    }]
  }), [
    'vite.config.ts: booleans_as_integers must not be enabled',
    'scene.tsx: data-ready must use semanticBoolean(...) or a textual literal',
    'scene.tsx: data-visible must use semanticBoolean(...) or a textual literal'
  ]);
});

test('accepts the shared semantic writer and textual literals', () => {
  assert.deepEqual(booleanDataContractViolations({
    viteSource: 'compress: { passes: 5 }',
    cssSources: [{
      file: 'scene.css',
      source: '[data-visible="true"] {} [data-ready="false"] {}'
    }],
    runtimeSources: [{
      file: 'src/scenes/scene.tsx',
      source: `
        import { semanticBoolean } from '../runtime/semantic-data-attribute';
        <div data-visible={semanticBoolean(active)} />
        root.dataset.ready = semanticBoolean(ready);
        root.dataset.visible = 'true';
      `
    }]
  }), []);
});

test('rejects mixed expressions, nested calls, and comment-only disguises', () => {
  assert.deepEqual(booleanDataContractViolations({
    viteSource: 'compress: { passes: 5 }',
    cssSources: [{
      file: 'scene.css',
      source: `
        [data-ready=true] {}
        [data-visible=false] {}
        [data-loaded=true] {}
      `
    }],
    runtimeSources: [{
      file: 'src/scenes/scene.tsx',
      source: `
        import { semanticBoolean } from '../runtime/semantic-data-attribute';
        <div data-ready={ready || semanticBoolean(false)} />
        <div data-visible={visible /* semanticBoolean(false) */} />
        <div data-loaded={String(semanticBoolean(loaded))} />
      `
    }]
  }), [
    'src/scenes/scene.tsx: data-loaded must use semanticBoolean(...) or a textual literal',
    'src/scenes/scene.tsx: data-ready must use semanticBoolean(...) or a textual literal',
    'src/scenes/scene.tsx: data-visible must use semanticBoolean(...) or a textual literal'
  ]);
});

test('rejects a semanticBoolean call without the canonical import binding', () => {
  assert.deepEqual(booleanDataContractViolations({
    viteSource: 'export default {};',
    cssSources: [{
      file: 'scene.css',
      source: '[data-ready="true"] {}'
    }],
    runtimeSources: [{
      file: 'src/scenes/scene.tsx',
      source: '<div data-ready={semanticBoolean(ready)} />'
    }]
  }), [
    'src/scenes/scene.tsx: data-ready must use semanticBoolean(...) or a textual literal'
  ]);
});

test('rejects a local semanticBoolean definition that shadows the shared helper', () => {
  assert.deepEqual(booleanDataContractViolations({
    viteSource: 'export default {};',
    cssSources: [{
      file: 'scene.css',
      source: '[data-ready="true"] {}'
    }],
    runtimeSources: [{
      file: 'src/scenes/scene.tsx',
      source: `
        function semanticBoolean(value: boolean) {
          return value ? 'yes' : 'no';
        }
        <div data-ready={semanticBoolean(ready)} />
      `
    }]
  }), [
    'src/scenes/scene.tsx: data-ready must use semanticBoolean(...) or a textual literal'
  ]);
});

test('rejects a parameter shadowing the canonical semanticBoolean import', () => {
  assert.deepEqual(booleanDataContractViolations({
    viteSource: 'export default {};',
    cssSources: [{
      file: 'scene.css',
      source: '[data-ready="true"] {}'
    }],
    runtimeSources: [{
      file: 'src/scenes/scene.tsx',
      source: `
        import { semanticBoolean } from '../runtime/semantic-data-attribute';
        function Scene(semanticBoolean: (value: boolean) => string) {
          return <div data-ready={semanticBoolean(ready)} />;
        }
      `
    }]
  }), [
    'src/scenes/scene.tsx: data-ready must use semanticBoolean(...) or a textual literal'
  ]);
});

test('ratchets exact legacy phone debt without exempting the directory', () => {
  const legacyDebt = [{
    file: 'src/production/phone/LegacyShell.tsx',
    attribute: 'data-stage-active',
    owner: 'LegacyShell',
    kind: 'jsx-attribute',
    writer: 'data-stage-active={String(active)}'
  }];
  const base = {
    viteSource: 'export default {};',
    cssSources: [{
      file: 'legacy.css',
      source: '[data-stage-active="true"] {}'
    }],
    legacyDebt
  };

  assert.deepEqual(booleanDataContractViolations({
    ...base,
    runtimeSources: [{
      file: 'src/production/phone/LegacyShell.tsx',
      source: `
        function LegacyShell() {
          return <div data-stage-active={String(active)} />;
        }
      `
    }]
  }), []);

  assert.deepEqual(booleanDataContractViolations({
    ...base,
    runtimeSources: []
  }), [
    'src/production/phone/LegacyShell.tsx: data-stage-active legacy debt '
      + 'occurrence is stale (LegacyShell; jsx-attribute; '
      + 'data-stage-active={String(active)})'
  ]);
});

test('rejects replacing a frozen legacy occurrence with a new writer', () => {
  const legacyDebt = [{
    file: 'src/production/phone/LegacyShell.tsx',
    attribute: 'data-stage-active',
    owner: 'LegacyShell',
    kind: 'jsx-attribute',
    writer: 'data-stage-active={String(active)}'
  }];
  const found = booleanDataContractViolations({
    viteSource: 'export default {};',
    cssSources: [{
      file: 'legacy.css',
      source: '[data-stage-active="true"] {}'
    }],
    runtimeSources: [{
      file: 'src/production/phone/LegacyShell.tsx',
      source: `
        function LegacyShell() {
          return <>
            <div data-stage-active="true" />
            <aside data-stage-active={String(ready)} />
          </>;
        }
      `
    }],
    legacyDebt
  });

  assert.equal(found.length, 2);
  assert.ok(found.some((violation) => violation.includes(
    'new legacy boolean writer occurrence'
  )));
  assert.ok(found.some((violation) => violation.includes(
    'legacy debt occurrence is stale'
  )));
});

test('scans new writers inside the legacy phone directory', async () => {
  const root = await writeFixture({
    'src/production/phone/rogue.tsx': '<div data-ready={ready} />',
    'src/production/phone/rogue.css': '[data-ready="true"] {}'
  });
  assert.deepEqual(verifyBooleanDataContract(root, { legacyDebt: [] }), [
    'src/production/phone/rogue.tsx: data-ready must use '
      + 'semanticBoolean(...) or a textual literal'
  ]);
});

test('rejects a semanticBoolean implementation that can stringify undefined', async () => {
  const root = await writeFixture({
    'src/runtime/semantic-data-attribute.ts': `
      export type SemanticBoolean = 'true' | 'false';
      export const semanticBoolean = String as unknown as (
        value: boolean
      ) => SemanticBoolean;
    `
  });
  assert.deepEqual(verifyBooleanDataContract(root, { legacyDebt: [] }), [
    'src/runtime/semantic-data-attribute.ts: semanticBoolean must use the '
      + 'frozen boolean branch implementation'
  ]);
});

test('requires the complete frozen semanticBoolean signature', async () => {
  const root = await writeFixture({
    'src/runtime/semantic-data-attribute.ts': `
      function semanticBoolean(value: unknown) {
        return value ? 'true' : 'false';
      }
    `
  });
  assert.deepEqual(verifyBooleanDataContract(root, { legacyDebt: [] }), [
    'src/runtime/semantic-data-attribute.ts: semanticBoolean must use the '
      + 'frozen boolean branch implementation'
  ]);
});
