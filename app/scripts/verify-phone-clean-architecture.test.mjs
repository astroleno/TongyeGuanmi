import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { phoneCleanArchitectureViolations } from './verify-phone-clean-architecture.mjs';

const { afterEach, test } = process.env.VITEST
  ? await import('vitest')
  : await import('node:test');

const temporaryRoots = [];

const validViteConfig = `
  import { defineConfig } from 'vite';
  function r5ModuleProvenancePlugin() {
    return {
      name: 'r5-module-provenance',
      generateBundle(_options, bundle) {
        const chunks = Object.values(bundle)
          .filter((output) => output.type === 'chunk')
          .map((chunk) => Object.keys(chunk.modules));
        this.emitFile({
          type: 'asset',
          fileName: 'audit/r5-module-provenance.json',
          source: JSON.stringify({ schemaVersion: 1, chunks })
        });
      }
    };
  }
  export default defineConfig({
    plugins: [r5ModuleProvenancePlugin()],
    build: { minify: 'terser', terserOptions: { compress: { passes: 2 } } }
  });
`;

const validRecoveryBoundary = `
  const lineageStorageKey = 'r5-phone-chunk-recovery-lineage-v1';
  export type PhoneChunkRecoveryLineage = Readonly<{
    lineageId: string;
    automaticReloadCount: 0 | 1;
  }>;
  function recoverPhoneChunk(event?: Event) {
    event?.preventDefault();
    const stored = sessionStorage.getItem(lineageStorageKey);
    const lineage: PhoneChunkRecoveryLineage = stored
      ? JSON.parse(stored)
      : { lineageId: 'fixture-lineage', automaticReloadCount: 0 };
    if (lineage.automaticReloadCount >= 1) return;
    sessionStorage.setItem(lineageStorageKey, JSON.stringify({
      ...lineage,
      automaticReloadCount: 1
    }));
    window.location.reload();
  }
  window.addEventListener('vite:preloadError', recoverPhoneChunk);
  export function loadPhoneStoryShell() {
    return import('./phone-story/PhoneStoryShell').catch((error) => {
      recoverPhoneChunk();
      throw error;
    });
  }
  export function markStable() {
    sessionStorage.removeItem(lineageStorageKey);
  }
`;

function validFixtureFiles() {
  return {
    'vite.config.ts': validViteConfig,
    'scripts/verify-performance-budgets.mjs':
      'const phoneJsHardCapBytes = 663_552;\n',
    'src/production/presentation-shell-loaders.ts': validRecoveryBoundary,
    'src/production/phone-story/protocol.ts':
      'export type PhoneEvent = Readonly<{ type: "ready" }>;\n',
    'src/production/phone-story/manifest.ts': `
      import type { PhoneEvent } from './protocol';
      export const phoneManifest = [] as const satisfies readonly PhoneEvent[];
    `,
    'src/production/phone-story/machine.ts': `
      import type { PhoneEvent } from './protocol';
      import { phoneManifest } from './manifest';
      export function reducePhoneStory(state: unknown, _event: PhoneEvent) {
        return state ?? phoneManifest;
      }
      export function commitStableCandidate(candidate: unknown) {
        return candidate;
      }
    `,
    'src/production/phone-story/presentation.ts': `
      import type { PhoneEvent } from './protocol';
      export type PhoneLeafReportPort = (event: PhoneEvent) => void;
    `,
    'src/production/phone-story/runtime.ts': `
      import { reducePhoneStory } from './machine';
      import type { PhoneLeafReportPort } from './presentation';
      export function createPhoneStoryRuntime(report: PhoneLeafReportPort) {
        return { reducePhoneStory, report };
      }
    `,
    'src/production/phone-story/scenes.tsx': `
      import type { PhoneEvent } from './protocol';
      import type { PhoneLeafReportPort } from './presentation';
      export type PhoneSceneLeafProps = Readonly<{
        event: PhoneEvent;
        report: PhoneLeafReportPort;
      }>;
      export const loadHero = () => import('../../scenes/hero/phone/PhoneHero');
    `,
    'src/production/phone-story/transitions.tsx': `
      import type { PhoneEvent } from './protocol';
      import type { PhoneLeafReportPort } from './presentation';
      export type PhoneTransitionLeafProps = Readonly<{
        event: PhoneEvent;
        report: PhoneLeafReportPort;
      }>;
      export const loadHeroPattern = () => import('../../transitions/hero-pattern/phone');
    `,
    'src/production/phone-story/PhoneStoryShell.tsx': `
      import { createPhoneStoryRuntime } from './runtime';
      import type { PhoneLeafReportPort } from './presentation';
      import { loadHero } from './scenes';
      import { loadHeroPattern } from './transitions';
      const report = (() => undefined) as PhoneLeafReportPort;
      export function PhoneStoryShell() {
        const runtime = createPhoneStoryRuntime(report);
        void loadHero;
        void loadHeroPattern;
        return runtime;
      }
    `,
    'src/production/phone-story/PhoneBrandLabStory.tsx': `
      import { PhoneStoryShell } from './PhoneStoryShell';
      export function PhoneBrandLabStory() {
        return <PhoneStoryShell />;
      }
    `,
    'src/production/phone-story/styles.css': ':root { color: CanvasText; }\n'
  };
}

async function writeFixture(overrides = {}, omitted = []) {
  const root = await mkdtemp(path.join(tmpdir(), 'r5-phone-architecture-'));
  temporaryRoots.push(root);
  const files = { ...validFixtureFiles(), ...overrides };
  for (const omittedFile of omitted) {
    delete files[omittedFile];
  }
  for (const [relative, source] of Object.entries(files)) {
    const target = path.join(root, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, source, 'utf8');
  }
  return root;
}

async function violations(overrides = {}, {
  omitted = [],
  phase = 'harness'
} = {}) {
  const appRoot = await writeFixture(overrides, omitted);
  return phoneCleanArchitectureViolations({ appRoot, phase });
}

function includes(found, expected) {
  assert.ok(
    found.some((violation) => violation.includes(expected)),
    `Expected a violation containing ${JSON.stringify(expected)}:\n${found.join('\n')}`
  );
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => (
    rm(root, { recursive: true, force: true })
  )));
});

test('accepts one shell-owned factory, QA wrapper, pure graph, and ordinary minification', async () => {
  assert.deepEqual(await violations(), []);
  assert.deepEqual(await violations({}, { phase: 'cutover' }), []);
});

test('rejects two runtime factory call sites and a QA-owned factory call', async () => {
  const duplicate = await violations({
    'src/production/other-phone-entry.ts':
      'createPhoneStoryRuntime(() => undefined);\n'
  });
  includes(duplicate, 'runtime factory call');

  const qa = await violations({
    'src/production/phone-story/PhoneBrandLabStory.tsx': `
      import { createPhoneStoryRuntime } from './runtime';
      export function PhoneBrandLabStory() {
        return createPhoneStoryRuntime(() => undefined);
      }
    `
  });
  includes(qa, 'PhoneBrandLabStory');
});

test('tracks runtime factory calls through aliases, namespaces, and assignments', async () => {
  for (const [label, extraSource] of Object.entries({
    alias: `
      import { createPhoneStoryRuntime as bootPhone } from './phone-story/runtime';
      bootPhone(() => undefined);
    `,
    namespace: `
      import * as phoneRuntime from './phone-story/runtime';
      phoneRuntime.createPhoneStoryRuntime(() => undefined);
    `,
    assignment: `
      import { createPhoneStoryRuntime } from './phone-story/runtime';
      let bootPhone;
      bootPhone = createPhoneStoryRuntime;
      bootPhone(() => undefined);
    `
  })) {
    const found = await violations({
      [`src/production/${label}-phone-entry.ts`]: extraSource
    });
    includes(found, 'runtime factory call');
  }

  const reexported = await violations({
    'src/production/phone-runtime-bridge.ts': `
      export {
        createPhoneStoryRuntime as bootPhone
      } from './phone-story/runtime';
    `,
    'src/production/reexport-phone-entry.ts': `
      import { bootPhone } from './phone-runtime-bridge';
      bootPhone(() => undefined);
    `
  });
  includes(reexported, 'runtime factory call');
});

test('rejects runtime factory calls anywhere in non-test src', async () => {
  for (const [relative, runtimeImport] of Object.entries({
    'src/App.tsx': './production/phone-story/runtime',
    'src/main.tsx': './production/phone-story/runtime',
    'src/scenes/rogue-phone-entry.ts': '../production/phone-story/runtime',
    'src/transitions/rogue-phone-entry.ts': '../production/phone-story/runtime'
  })) {
    const found = await violations({
      [relative]: `
        import { createPhoneStoryRuntime } from ${JSON.stringify(runtimeImport)};
        createPhoneStoryRuntime(() => undefined);
      `
    });
    includes(found, 'runtime factory call');
  }
});

test('rejects a factory call from the legacy same-named shell', async () => {
  const found = await violations({
    'src/production/phone-story/PhoneStoryShell.tsx': `
      export function PhoneStoryShell() {
        return null;
      }
    `,
    'src/production/phone/PhoneStoryShell.tsx': `
      import { createPhoneStoryRuntime } from '../phone-story/runtime';
      export function PhoneStoryShell() {
        return createPhoneStoryRuntime(() => undefined);
      }
    `
  });
  includes(
    found,
    'runtime factory call is allowed only in src/production/phone-story/PhoneStoryShell.tsx'
  );
});

test('rejects a runtime factory definition outside the canonical runtime', async () => {
  const found = await violations({
    'src/production/phone-story/runtime.ts': 'export const runtimeMarker = true;\n',
    'src/production/phone-story/PhoneStoryShell.tsx': `
      export function PhoneStoryShell() {
        return null;
      }
    `,
    'src/production/phone/rogue-runtime.ts': `
      export function createPhoneStoryRuntime() {
        return {};
      }
    `
  });
  includes(
    found,
    'createPhoneStoryRuntime definition is allowed only in src/production/phone-story/runtime.ts'
  );
});

test('rejects reducer authorities outside the canonical machine', async () => {
  const found = await violations({
    'src/production/phone-story/machine.ts': 'export const machineMarker = true;\n',
    'src/production/phone/rogue-machine.ts': `
      export function reducePhoneStory(state: unknown) {
        return state;
      }
      export function commitStableCandidate(candidate: unknown) {
        return candidate;
      }
    `
  });
  includes(
    found,
    'reducePhoneStory definition is allowed only in src/production/phone-story/machine.ts'
  );
  includes(
    found,
    'commitStableCandidate definition is allowed only in src/production/phone-story/machine.ts'
  );
});

test('rejects every runtime factory value escape', async () => {
  const escapes = {
    'array-destructure': `
      import { createPhoneStoryRuntime } from './phone-story/runtime';
      const [bootPhone] = [createPhoneStoryRuntime];
      bootPhone(() => undefined);
    `,
    'object-destructure': `
      import * as phoneRuntime from './phone-story/runtime';
      const { createPhoneStoryRuntime: bootPhone } = phoneRuntime;
      bootPhone(() => undefined);
    `,
    'object-property': `
      import { createPhoneStoryRuntime } from './phone-story/runtime';
      const holder = { bootPhone: createPhoneStoryRuntime };
      holder.bootPhone(() => undefined);
    `,
    'member-assignment': `
      import { createPhoneStoryRuntime } from './phone-story/runtime';
      const holder = {};
      holder.bootPhone = createPhoneStoryRuntime;
      holder.bootPhone(() => undefined);
    `,
    call: `
      import { createPhoneStoryRuntime } from './phone-story/runtime';
      createPhoneStoryRuntime.call(null, () => undefined);
    `,
    bind: `
      import { createPhoneStoryRuntime } from './phone-story/runtime';
      const bootPhone = createPhoneStoryRuntime.bind(null);
      bootPhone(() => undefined);
    `,
    comma: `
      import { createPhoneStoryRuntime } from './phone-story/runtime';
      (0, createPhoneStoryRuntime)(() => undefined);
    `
  };

  for (const [label, source] of Object.entries(escapes)) {
    const found = await violations({
      [`src/production/${label}-phone-entry.ts`]: source
    }, { phase: 'cutover' });
    includes(found, 'runtime factory value escape');
  }
});

test('does not confuse an unrelated same-named member with the factory symbol', async () => {
  assert.deepEqual(await violations({
    'src/production/unrelated-phone-helper.ts': `
      type Helper = Readonly<{
        createPhoneStoryRuntime(): string;
      }>;
      const helper: Helper = {
        createPhoneStoryRuntime: () => 'not-a-runtime'
      };
      helper.createPhoneStoryRuntime();
    `
  }), []);
});

test('rejects every external dependency outside each core file allowlist', async () => {
  for (const [label, specifier] of Object.entries({
    legacyMachine: '../phone/legacy-machine',
    timeline: '../phone/phone-stage-timeline',
    coordinator: '../phone/phone-transition-coordinator',
    react: 'react',
    css: './machine.css',
    qa: './PhoneBrandLabStory',
    bootstrap: '../presentation-shell-loaders'
  })) {
    const found = await violations({
      'src/production/phone-story/machine.ts': `
        import ${JSON.stringify(specifier)};
        export function reducePhoneStory(state: unknown) { return state; }
        export function commitStableCandidate(candidate: unknown) { return candidate; }
      `
    });
    includes(found, 'machine.ts: forbidden');
  }
});

test('rejects non-literal imports and every CommonJS-style core import', async () => {
  const cases = {
    'template-import': `
      void import(\`../phone/legacy-machine\`);
    `,
    'computed-import': `
      const target = '../phone/legacy-machine';
      void import(target);
    `,
    require: `
      require('../phone/legacy-machine');
    `,
    'computed-require': `
      const target = '../phone/legacy-machine';
      require(target);
    `,
    'import-equals': `
      import legacyMachine = require('../phone/legacy-machine');
      void legacyMachine;
    `
  };

  for (const [label, source] of Object.entries(cases)) {
    const found = await violations({
      'src/production/phone-story/machine.ts': `
        ${source}
        export function reducePhoneStory(state: unknown) { return state; }
        export function commitStableCandidate(candidate: unknown) { return candidate; }
      `
    });
    includes(found, label.includes('import') ? 'import' : 'require');
  }
});

test('treats inline named type imports as type-only leaf-port imports', async () => {
  assert.deepEqual(await violations({
    'src/production/phone-story/scenes.tsx': `
      import type { PhoneEvent } from './protocol';
      import { type PhoneLeafReportPort } from './presentation';
      export type PhoneSceneLeafProps = Readonly<{
        event: PhoneEvent;
        report: PhoneLeafReportPort;
      }>;
      export const loadHero = () => import('../../scenes/hero/phone/PhoneHero');
    `
  }), []);
});

test('rejects leaves importing runtime and runtime importing a visual leaf', async () => {
  includes(await violations({
    'src/scenes/hero/phone/PhoneHero.ts':
      "import '../../../../production/phone-story/runtime';\n"
  }), 'leaf must not import');
  includes(await violations({
    'src/production/phone-story/runtime.ts': `
      import '../../scenes/hero/phone/PhoneHero';
      export function createPhoneStoryRuntime() { return {}; }
    `
  }), 'runtime must not import');
});

test('rejects React or DOM-bearing imports from the pure manifest', async () => {
  includes(await violations({
    'src/production/phone-story/manifest.ts':
      "import React from 'react'; export const phoneManifest = React;\n"
  }), 'manifest.ts');
  includes(await violations({
    'src/production/phone-story/manifest.ts': `
      import type { PhoneLeafReportPort } from './presentation';
      export const phoneManifest: PhoneLeafReportPort | null = null;
    `
  }), 'DOM-bearing');
});

test('rejects a core dependency cycle', async () => {
  includes(await violations({
    'src/production/phone-story/protocol.ts':
      "import './runtime'; export type PhoneEvent = { type: 'ready' };\n"
  }), 'dependency cycle');
});

test('rejects an eleventh runtime file and forbidden nested core subtree', async () => {
  includes(await violations({
    'src/production/phone-story/registry.ts': 'export const registry = {};\n'
  }), 'outside the flat ten-file allowlist');
  includes(await violations({
    'src/production/phone-story/runtime/clock.ts': 'export const clock = 0;\n'
  }), 'forbidden phone-story subtree');
});

test('rejects property-name mangling while accepting ordinary ESM minification', async () => {
  includes(await violations({
    'vite.config.ts': `
      export default {
        plugins: [{
          name: 'r5-module-provenance',
          generateBundle(_options, bundle) {
            Object.values(bundle).map((chunk) => chunk.modules);
            this.emitFile({ fileName: 'audit/r5-module-provenance.json' });
          }
        }],
        build: { terserOptions: { mangle: { properties: { regex: /^_/ } } } }
      };
    `
  }), 'property-name mangling');
});

test('rejects a formal loader importing the QA wrapper', async () => {
  includes(await violations({
    'src/production/presentation-shell-loaders.ts': `
      ${validRecoveryBoundary}
      export const loadQa = () => import('./phone-story/PhoneBrandLabStory');
    `
  }), 'formal loader');
});

test('rejects numbered validation/query composition in the clean core', async () => {
  includes(await violations({
    'src/production/phone-story/PhoneStoryShell.tsx': `
      import { createPhoneStoryRuntime } from './runtime';
      export function PhoneStoryShell() {
        const mode = new URLSearchParams(window.location.search).get('v');
        return createPhoneStoryRuntime(mode);
      }
    `
  }), 'production validation/query');
});

test('rejects per-file and total core LOC overflow', async () => {
  const oversizedProtocol = Array.from(
    { length: 451 },
    (_, index) => `export type Line${index} = ${index};`
  ).join('\n');
  includes(await violations({
    'src/production/phone-story/protocol.ts': oversizedProtocol
  }), 'protocol.ts exceeds');

  const oversizedCore = {};
  for (const file of [
    'protocol.ts',
    'manifest.ts',
    'machine.ts',
    'runtime.ts',
    'presentation.ts',
    'PhoneStoryShell.tsx',
    'scenes.tsx',
    'transitions.tsx',
    'PhoneBrandLabStory.tsx'
  ]) {
    oversizedCore[`src/production/phone-story/${file}`] = Array.from(
      { length: 560 },
      (_, index) => `export type ${file.replace(/\W/g, '')}Line${index} = ${index};`
    ).join('\n');
  }
  includes(await violations(oversizedCore), 'total TypeScript/TSX LOC exceeds');
});

test('rejects old orchestration in cutover mode', async () => {
  includes(await violations({
    'src/production/phone/legacy.ts': 'export const legacy = true;\n'
  }, { phase: 'cutover' }), 'legacy production/phone');
});

test('rejects a dynamic leaf that imports a lifecycle owner', async () => {
  includes(await violations({
    'src/scenes/hero/phone/PhoneHero.ts': `
      import '../../../../production/input-controller';
      export const PhoneHero = null;
    `
  }), 'dynamic leaf lifecycle owner');
});

test('fails closed on non-literal and CommonJS imports in leaf and formal graphs', async () => {
  const cases = {
    'computed dynamic import()': `
      const target = './shared';
      void import(target);
    `,
    'CommonJS require()': "require('./shared');\n",
    'import = require()': `
      import helper = require('./shared');
      void helper;
    `
  };

  for (const [expected, source] of Object.entries(cases)) {
    includes(await violations({
      'src/scenes/hero/phone/PhoneHero.ts': source
    }), expected);
    includes(await violations({
      'src/App.tsx': source
    }), expected);
  }
});

test('rejects a transitive QA dependency in the formal graph', async () => {
  includes(await violations({
    'src/production/presentation-shell-loaders.ts': `
      ${validRecoveryBoundary}
      export { loadFormalBridge } from './formal-qa-bridge';
    `,
    'src/production/formal-qa-bridge.ts': `
      import { PhoneBrandLabStory } from './phone-story/PhoneBrandLabStory';
      export const loadFormalBridge = () => PhoneBrandLabStory;
    `
  }), 'formal graph must not import the QA shell');
});

test('rejects legacy mobile-landscape ownership and duplicate orientation listeners', async () => {
  includes(await violations({
    'src/production/phone-story/runtime.ts': `
      import { useMobileLandscapeEntry } from '../useMobileLandscapeEntry';
      export function createPhoneStoryRuntime() {
        useMobileLandscapeEntry();
        return {};
      }
    `
  }), 'useMobileLandscapeEntry');
  includes(await violations({
    'src/production/phone-story/runtime.ts': `
      export function createPhoneStoryRuntime() {
        window.addEventListener('orientationchange', () => undefined);
        window.addEventListener('orientationchange', () => undefined);
        return {};
      }
    `
  }), 'orientation lifecycle owner');
});

test('rejects browser globals in protocol/machine and DOM types in manifest', async () => {
  includes(await violations({
    'src/production/phone-story/protocol.ts':
      'export const width = window.innerWidth;\n'
  }), 'protocol.ts uses browser/DOM');
  includes(await violations({
    'src/production/phone-story/machine.ts':
      'export const target = document.body;\n'
  }), 'machine.ts uses browser/DOM');
  includes(await violations({
    'src/production/phone-story/manifest.ts':
      'export type Root = HTMLElement;\n'
  }), 'manifest.ts uses browser/DOM');
});

test('rejects multiple reducers, stable-commit branches, or runtime factories', async () => {
  includes(await violations({
    'src/production/phone-story/machine.ts': `
      export function reducePhoneStory(state: unknown) { return state; }
      export function reducePhoneStoryAgain(state: unknown) { return state; }
      export function commitStableCandidate(value: unknown) { return value; }
      export function commitStableCandidateAgain(value: unknown) { return value; }
    `
  }), 'reducer/stable-commit authority');
  includes(await violations({
    'src/production/phone-story/runtime.ts': `
      export function createPhoneStoryRuntime() { return {}; }
      export const createPhoneStoryRuntimeAgain = () => ({});
    `
  }), 'runtime factory definitions');
});

test('rejects a browser-effect God machine and an over-budget runtime', async () => {
  includes(await violations({
    'src/production/phone-story/machine.ts': `
      export function reducePhoneStory(state: unknown) {
        window.setTimeout(() => undefined, 1);
        return state;
      }
    `
  }), 'machine.ts uses browser/DOM');
  includes(await violations({
    'src/production/phone-story/runtime.ts': Array.from(
      { length: 1001 },
      (_, index) => `export const runtimeLine${index} = ${index};`
    ).join('\n')
  }), 'runtime.ts exceeds');
});

test('rejects lazy leaf interfaces receiving runtime or dispatch', async () => {
  includes(await violations({
    'src/production/phone-story/scenes.tsx': `
      export type UnsafeLeafProps = Readonly<{
        runtime: unknown;
        dispatch(event: unknown): void;
      }>;
    `
  }), 'narrow leaf interfaces');
});

test('cutover requires one eager phone-core recovery boundary', async () => {
  includes(await violations({}, {
    phase: 'cutover',
    omitted: ['src/production/presentation-shell-loaders.ts']
  }), 'eager phone-core recovery boundary');
});

test('recovery lineage cannot be keyed by mutable build or module identity', async () => {
  includes(await violations({
    'src/production/presentation-shell-loaders.ts': `
      export function loadPhoneStoryShell(buildId: string, moduleUrl: string) {
        const lineageId = buildId;
        const automaticReloadCount = 0;
        window.addEventListener('vite:preloadError', () => undefined);
        sessionStorage.setItem(\`\${buildId}:\${moduleUrl}\`, JSON.stringify({
          lineageId,
          automaticReloadCount
        }));
        return import('./phone-story/PhoneStoryShell');
      }
      export function markStable() {}
    `
  }, { phase: 'cutover' }), 'cross-reload lineage');
});

test('rejects comment-only recovery markers', async () => {
  includes(await violations({
    'src/production/presentation-shell-loaders.ts': `
      /*
        PhoneChunkRecoveryLineage automaticReloadCount vite:preloadError
        markStable
      */
      const lineageStorageKey = 'r5-phone-chunk-recovery-lineage-v1';
      sessionStorage.setItem(lineageStorageKey, JSON.stringify({
        lineageId: 'fixture-lineage'
      }));
      export function loadPhoneStoryShell() {
        return import('./phone-story/PhoneStoryShell');
      }
    `
  }, { phase: 'cutover' }), 'register an executable vite:preloadError handler');
});

test('rejects a preload listener hidden in an uncalled function', async () => {
  includes(await violations({
    'src/production/presentation-shell-loaders.ts': validRecoveryBoundary
      .replace(
        "window.addEventListener('vite:preloadError', recoverPhoneChunk);",
        `function neverRegisterRecovery() {
      window.addEventListener('vite:preloadError', recoverPhoneChunk);
    }
    void neverRegisterRecovery;`
      )
  }, { phase: 'cutover' }), 'register an executable vite:preloadError handler');
});

test('rejects a no-op preload-error handler', async () => {
  includes(await violations({
    'src/production/presentation-shell-loaders.ts': `
      const lineageStorageKey = 'r5-phone-chunk-recovery-lineage-v1';
      export type PhoneChunkRecoveryLineage = Readonly<{
        lineageId: string;
        automaticReloadCount: 0 | 1;
      }>;
      function recoverPhoneChunk() {}
      window.addEventListener('vite:preloadError', recoverPhoneChunk);
      export function loadPhoneStoryShell() {
        sessionStorage.setItem(lineageStorageKey, JSON.stringify({
          lineageId: 'fixture-lineage',
          automaticReloadCount: 0
        }));
        return import('./phone-story/PhoneStoryShell').catch((error) => {
          recoverPhoneChunk();
          throw error;
        });
      }
      export function markStable() {
        sessionStorage.removeItem(lineageStorageKey);
      }
    `
  }, { phase: 'cutover' }), 'vite:preloadError handler must call preventDefault()');
});

test('rejects recovery work hidden in an uncalled nested function', async () => {
  includes(await violations({
    'src/production/presentation-shell-loaders.ts': `
      const lineageStorageKey = 'r5-phone-chunk-recovery-lineage-v1';
      export type PhoneChunkRecoveryLineage = Readonly<{
        lineageId: string;
        automaticReloadCount: 0 | 1;
      }>;
      function recoverPhoneChunk(event?: Event) {
        function neverCalled() {
          event?.preventDefault();
          const stored = sessionStorage.getItem(lineageStorageKey);
          const lineage: PhoneChunkRecoveryLineage = stored
            ? JSON.parse(stored)
            : { lineageId: 'fixture-lineage', automaticReloadCount: 0 };
          if (lineage.automaticReloadCount >= 1) return;
          sessionStorage.setItem(lineageStorageKey, JSON.stringify({
            ...lineage,
            automaticReloadCount: 1
          }));
          window.location.reload();
        }
        void neverCalled;
      }
      window.addEventListener('vite:preloadError', recoverPhoneChunk);
      export function loadPhoneStoryShell() {
        return import('./phone-story/PhoneStoryShell').catch((error) => {
          recoverPhoneChunk();
          throw error;
        });
      }
      export function markStable() {
        sessionStorage.removeItem(lineageStorageKey);
      }
    `
  }, { phase: 'cutover' }), 'vite:preloadError handler must call preventDefault()');
});

test('rejects a reload bound that ignores the stored lineage', async () => {
  includes(await violations({
    'src/production/presentation-shell-loaders.ts': `
      const lineageStorageKey = 'r5-phone-chunk-recovery-lineage-v1';
      export type PhoneChunkRecoveryLineage = Readonly<{
        lineageId: string;
        automaticReloadCount: 0 | 1;
      }>;
      function recoverPhoneChunk(event?: Event) {
        event?.preventDefault();
        const ignored = sessionStorage.getItem(lineageStorageKey);
        const lineage: PhoneChunkRecoveryLineage = {
          lineageId: ignored ?? 'fixture-lineage',
          automaticReloadCount: 0
        };
        if (lineage.automaticReloadCount >= 1) return;
        sessionStorage.setItem(lineageStorageKey, JSON.stringify({
          ...lineage,
          automaticReloadCount: 1
        }));
        window.location.reload();
      }
      window.addEventListener('vite:preloadError', recoverPhoneChunk);
      export function loadPhoneStoryShell() {
        return import('./phone-story/PhoneStoryShell').catch((error) => {
          recoverPhoneChunk();
          throw error;
        });
      }
      export function markStable() {
        sessionStorage.removeItem(lineageStorageKey);
      }
    `
  }, { phase: 'cutover' }), 'reload bound must derive from stored lineage');
});

test('rejects overwriting the parsed stored reload count', async () => {
  includes(await violations({
    'src/production/presentation-shell-loaders.ts': validRecoveryBoundary
      .replace(
        '? JSON.parse(stored)\n      :',
        `? Object.assign(JSON.parse(stored), {
          automaticReloadCount: 0 as const
        })
      :`
      )
  }, { phase: 'cutover' }), 'reload bound must derive from stored lineage');
});

test('rejects a comma expression that discards the parsed lineage', async () => {
  includes(await violations({
    'src/production/presentation-shell-loaders.ts': validRecoveryBoundary
      .replace(
        '? JSON.parse(stored)\n      :',
        `? (JSON.parse(stored), {
          lineageId: 'discarded-parse',
          automaticReloadCount: 0 as const
        })
      :`
      )
  }, { phase: 'cutover' }), 'reload bound must derive from stored lineage');
});

test('rejects a conditional branch that only contains a fake parse', async () => {
  includes(await violations({
    'src/production/presentation-shell-loaders.ts': validRecoveryBoundary
      .replace(
        '? JSON.parse(stored)\n      :',
        `? (false ? JSON.parse(stored) : {
          lineageId: 'fake-parse',
          automaticReloadCount: 0 as const
        })
      :`
      )
  }, { phase: 'cutover' }), 'reload bound must derive from stored lineage');
});

test('rejects a same-named lineage shadow at the reload guard', async () => {
  includes(await violations({
    'src/production/presentation-shell-loaders.ts': validRecoveryBoundary
      .replace(
        'if (lineage.automaticReloadCount >= 1) return;',
        `{
      const lineage: PhoneChunkRecoveryLineage = {
        lineageId: 'shadow',
        automaticReloadCount: 0
      };
      if (lineage.automaticReloadCount >= 1) return;
    }`
      )
  }, { phase: 'cutover' }), 'reload bound must derive from stored lineage');
});

test('rejects a local JSON binding that forges the parsed reload count', async () => {
  includes(await violations({
    'src/production/presentation-shell-loaders.ts': validRecoveryBoundary
      .replace(
        "const lineageStorageKey = 'r5-phone-chunk-recovery-lineage-v1';",
        `const lineageStorageKey = 'r5-phone-chunk-recovery-lineage-v1';
  const JSON = {
    parse: () => ({ lineageId: 'forged', automaticReloadCount: 0 }),
    stringify: globalThis.JSON.stringify
  };`
      )
  }, { phase: 'cutover' }), 'reload bound must derive from stored lineage');
});

test('rejects an unrelated reload method', async () => {
  includes(await violations({
    'src/production/presentation-shell-loaders.ts': validRecoveryBoundary
      .replace('window.location.reload()', 'worker.reload()')
  }, { phase: 'cutover' }), 'must perform exactly one window.location.reload()');
});

test('binds recovery to the canonical import rejection callback', async () => {
  includes(await violations({
    'src/production/presentation-shell-loaders.ts': validRecoveryBoundary
      .replace(
        "return import('./phone-story/PhoneStoryShell').catch((error) => {\n      recoverPhoneChunk();\n      throw error;\n    });",
        "recoverPhoneChunk();\n    return import('./phone-story/PhoneStoryShell');"
      )
  }, { phase: 'cutover' }), 'phone-core import rejection must use');
});

test('rejects a handler call hidden behind if false in the import catch', async () => {
  includes(await violations({
    'src/production/presentation-shell-loaders.ts': validRecoveryBoundary
      .replace(
        'recoverPhoneChunk();\n      throw error;',
        'if (false) recoverPhoneChunk();\n      throw error;'
      )
  }, { phase: 'cutover' }), 'phone-core import rejection must use');
});

test('rejects a handler call after return in the import catch', async () => {
  includes(await violations({
    'src/production/presentation-shell-loaders.ts': validRecoveryBoundary
      .replace(
        'recoverPhoneChunk();\n      throw error;',
        'return;\n      recoverPhoneChunk();\n      throw error;'
      )
  }, { phase: 'cutover' }), 'phone-core import rejection must use');
});

test('rejects a handler call after throw in the import catch', async () => {
  includes(await violations({
    'src/production/presentation-shell-loaders.ts': validRecoveryBoundary
      .replace(
        'recoverPhoneChunk();\n      throw error;',
        'throw error;\n      recoverPhoneChunk();'
      )
  }, { phase: 'cutover' }), 'phone-core import rejection must use');
});

test('binds the import rejection delegate to the registered recovery symbol', async () => {
  includes(await violations({
    'src/production/presentation-shell-loaders.ts': validRecoveryBoundary
      .replace(
        'export function loadPhoneStoryShell() {',
        `export function loadPhoneStoryShell(
    recoverPhoneChunk = () => undefined
  ) {`
      )
  }, { phase: 'cutover' }), 'phone-core import rejection must use');
});

test('rejects a same-named local recovery delegate in the loader', async () => {
  includes(await violations({
    'src/production/presentation-shell-loaders.ts': validRecoveryBoundary
      .replace(
        'export function loadPhoneStoryShell() {',
        `export function loadPhoneStoryShell() {
    const recoverPhoneChunk = () => undefined;`
      )
  }, { phase: 'cutover' }), 'phone-core import rejection must use');
});

test('rejects reassignment of the registered recovery handler binding', async () => {
  includes(await violations({
    'src/production/presentation-shell-loaders.ts': validRecoveryBoundary
      .replace(
        "window.addEventListener('vite:preloadError', recoverPhoneChunk);",
        `recoverPhoneChunk = () => undefined;
  window.addEventListener('vite:preloadError', recoverPhoneChunk);`
      )
  }, { phase: 'cutover' }), 'registered recovery handler binding must be immutable');
});

test('rejects extra calls to the canonical recovery handler', async () => {
  includes(await violations({
    'src/production/presentation-shell-loaders.ts': validRecoveryBoundary
      .replace(
        "window.addEventListener('vite:preloadError', recoverPhoneChunk);",
        `recoverPhoneChunk();
  window.addEventListener('vite:preloadError', recoverPhoneChunk);`
      )
  }, { phase: 'cutover' }), 'recovery handler has non-canonical references');
});

test('keeps the registered recovery handler private to the eager boundary', async () => {
  includes(await violations({
    'src/production/presentation-shell-loaders.ts': validRecoveryBoundary
      .replace(
        'function recoverPhoneChunk(event?: Event) {',
        'export function recoverPhoneChunk(event?: Event) {'
      )
  }, { phase: 'cutover' }), 'recovery handler must remain private');
});

test('requires one immutable recovery storage-key binding', async () => {
  includes(await violations({
    'src/production/presentation-shell-loaders.ts': validRecoveryBoundary
      .replace(
        "const lineageStorageKey = 'r5-phone-chunk-recovery-lineage-v1';",
        "let lineageStorageKey = 'r5-phone-chunk-recovery-lineage-v1';"
      )
      .replace(
        'if (lineage.automaticReloadCount >= 1) return;',
        `if (lineage.automaticReloadCount >= 1) return;
    lineageStorageKey = 'r5-phone-chunk-recovery-lineage-v2';`
      )
  }, { phase: 'cutover' }), 'immutable recovery storage key');
});

test('keeps the recovery storage key private to the eager boundary', async () => {
  includes(await violations({
    'src/production/presentation-shell-loaders.ts': validRecoveryBoundary
      .replace(
        "const lineageStorageKey = 'r5-phone-chunk-recovery-lineage-v1';",
        "export const lineageStorageKey = 'r5-phone-chunk-recovery-lineage-v1';"
      )
  }, { phase: 'cutover' }), 'recovery storage key must remain private');
});

test('rejects recovery-key use outside read, persist, and stable cleanup', async () => {
  includes(await violations({
    'src/production/presentation-shell-loaders.ts': validRecoveryBoundary
      .replace(
        'export type PhoneChunkRecoveryLineage',
        `sessionStorage.removeItem(lineageStorageKey);
  export type PhoneChunkRecoveryLineage`
      )
  }, { phase: 'cutover' }), 'recovery storage key has non-canonical references');
});

test('rejects sessionStorage mutation outside the canonical recovery calls', async () => {
  includes(await violations({
    'src/production/presentation-shell-loaders.ts': validRecoveryBoundary
      .replace(
        'export type PhoneChunkRecoveryLineage',
        `sessionStorage.clear();
  export type PhoneChunkRecoveryLineage`
      )
  }, { phase: 'cutover' }), 'sessionStorage use outside the canonical recovery calls');
});

test('rejects sessionStorage mutation in the transitive formal graph', async () => {
  includes(await violations({
    'src/production/presentation-shell-loaders.ts': `
      import './recovery-lineage-reset';
      ${validRecoveryBoundary}
    `,
    'src/production/recovery-lineage-reset.ts': 'sessionStorage.clear();\n'
  }, { phase: 'cutover' }), 'sessionStorage use outside the canonical recovery calls');
});

test('rejects computed sessionStorage access in the eager formal graph', async () => {
  includes(await violations({
    'src/production/presentation-shell-loaders.ts': `
      import './recovery-lineage-reset';
      ${validRecoveryBoundary}
    `,
    'src/production/recovery-lineage-reset.ts':
      "window['sessionStorage'].clear();\n"
  }, { phase: 'cutover' }), 'sessionStorage use outside the canonical recovery calls');
});

test('binds handler storage access to the canonical recovery key symbol', async () => {
  includes(await violations({
    'src/production/presentation-shell-loaders.ts': validRecoveryBoundary
      .replace(
        'function recoverPhoneChunk(event?: Event) {',
        `function recoverPhoneChunk(
    event?: Event,
    lineageStorageKey = 'r5-phone-chunk-recovery-shadow'
  ) {`
      )
  }, { phase: 'cutover' }), 'canonical recovery storage key');
});

test('binds markStable removal to the canonical recovery key symbol', async () => {
  includes(await violations({
    'src/production/presentation-shell-loaders.ts': validRecoveryBoundary
      .replace(
        'export function markStable() {',
        `export function markStable(
    lineageStorageKey = 'r5-phone-chunk-recovery-shadow'
  ) {`
      )
  }, { phase: 'cutover' }), 'markStable must clear the recovery lineage');
});

test('requires preventDefault as a directly executable handler statement', async () => {
  includes(await violations({
    'src/production/presentation-shell-loaders.ts': validRecoveryBoundary
      .replace(
        'event?.preventDefault();',
        'false && event?.preventDefault();'
      )
  }, { phase: 'cutover' }), 'handler must directly call preventDefault()');
});

test('requires markStable removal as a directly executable statement', async () => {
  includes(await violations({
    'src/production/presentation-shell-loaders.ts': validRecoveryBoundary
      .replace(
        'sessionStorage.removeItem(lineageStorageKey);',
        'if (false) sessionStorage.removeItem(lineageStorageKey);'
      )
  }, { phase: 'cutover' }), 'markStable must clear the recovery lineage');
});

test('requires the loader to directly return the canonical phone-core import', async () => {
  includes(await violations({
    'src/production/presentation-shell-loaders.ts': validRecoveryBoundary
      .replace(
        'export function loadPhoneStoryShell() {',
        `export function loadPhoneStoryShell() {
    return undefined as never;`
      )
  }, { phase: 'cutover' }), 'loadPhoneStoryShell must directly return');
});

test('requires the canonical phone-core loader to remain exported', async () => {
  includes(await violations({
    'src/production/presentation-shell-loaders.ts': validRecoveryBoundary
      .replace(
        'export function loadPhoneStoryShell() {',
        'function loadPhoneStoryShell() {'
      )
  }, { phase: 'cutover' }), 'loadPhoneStoryShell must be exported');
});

test('requires markStable to remain an exported recovery port', async () => {
  includes(await violations({
    'src/production/presentation-shell-loaders.ts': validRecoveryBoundary
      .replace(
        'export function markStable() {',
        'function markStable() {'
      )
  }, { phase: 'cutover' }), 'markStable must be exported');
});

test('rejects recovery without a bounded page reload', async () => {
  includes(await violations({
    'src/production/presentation-shell-loaders.ts': `
      const lineageStorageKey = 'r5-phone-chunk-recovery-lineage-v1';
      export type PhoneChunkRecoveryLineage = Readonly<{
        lineageId: string;
        automaticReloadCount: 0 | 1;
      }>;
      function recoverPhoneChunk(event?: Event) {
        event?.preventDefault();
        sessionStorage.setItem(lineageStorageKey, JSON.stringify({
          lineageId: 'fixture-lineage',
          automaticReloadCount: 0
        }));
        window.location.reload();
      }
      window.addEventListener('vite:preloadError', recoverPhoneChunk);
      export function loadPhoneStoryShell() {
        return import('./phone-story/PhoneStoryShell').catch((error) => {
          recoverPhoneChunk();
          throw error;
        });
      }
      export function markStable() {
        sessionStorage.removeItem(lineageStorageKey);
      }
    `
  }, { phase: 'cutover' }), 'recovery must allow at most one automatic reload');
});

test('rejects an unconditional return before lineage persistence', async () => {
  includes(await violations({
    'src/production/presentation-shell-loaders.ts': validRecoveryBoundary
      .replace(
        'if (lineage.automaticReloadCount >= 1) return;\n    sessionStorage.setItem',
        'if (lineage.automaticReloadCount >= 1) return;\n    return;\n    sessionStorage.setItem'
      )
  }, { phase: 'cutover' }), 'recovery control flow must reach lineage persistence and reload');
});

test('rejects an unconditional throw before lineage persistence', async () => {
  includes(await violations({
    'src/production/presentation-shell-loaders.ts': validRecoveryBoundary
      .replace(
        'if (lineage.automaticReloadCount >= 1) return;\n    sessionStorage.setItem',
        "if (lineage.automaticReloadCount >= 1) return;\n    throw new Error('stop');\n    sessionStorage.setItem"
      )
  }, { phase: 'cutover' }), 'recovery control flow must reach lineage persistence and reload');
});

test('rejects clearing persisted lineage before reload', async () => {
  includes(await violations({
    'src/production/presentation-shell-loaders.ts': validRecoveryBoundary
      .replace(
        '}));\n    window.location.reload();',
        '}));\n    sessionStorage.clear();\n    window.location.reload();'
      )
  }, { phase: 'cutover' }), 'must not clear or overwrite persisted recovery lineage');
});

test('rejects overwriting the persisted reload count before reload', async () => {
  includes(await violations({
    'src/production/presentation-shell-loaders.ts': validRecoveryBoundary
      .replace(
        '}));\n    window.location.reload();',
        `}));
    sessionStorage.setItem(lineageStorageKey, JSON.stringify({
      ...lineage,
      automaticReloadCount: 0
    }));
    window.location.reload();`
      )
  }, { phase: 'cutover' }), 'must not clear or overwrite persisted recovery lineage');
});

test('rejects an indirect lineage reset between persistence and reload', async () => {
  const source = validRecoveryBoundary
    .replace(
      "export type PhoneChunkRecoveryLineage = Readonly<{",
      `function resetRecoveryLineage() {
    sessionStorage.clear();
  }
  export type PhoneChunkRecoveryLineage = Readonly<{`
    )
    .replace(
      '}));\n    window.location.reload();',
      '}));\n    resetRecoveryLineage();\n    window.location.reload();'
    );
  includes(await violations({
    'src/production/presentation-shell-loaders.ts': source
  }, { phase: 'cutover' }), 'must not clear or overwrite persisted recovery lineage');
});

test('rejects same-document retry of the rejected phone-core URL', async () => {
  includes(await violations({
    'src/production/presentation-shell-loaders.ts': `
      const lineageStorageKey = 'r5-phone-chunk-recovery-lineage-v1';
      export type PhoneChunkRecoveryLineage = Readonly<{
        lineageId: string;
        automaticReloadCount: 0 | 1;
      }>;
      function recoverPhoneChunk(event?: Event) {
        event?.preventDefault();
        const automaticReloadCount = 0;
        if (automaticReloadCount >= 1) return;
        sessionStorage.setItem(lineageStorageKey, JSON.stringify({
          lineageId: 'fixture-lineage',
          automaticReloadCount: 1
        }));
        void import('./phone-story/PhoneStoryShell');
      }
      window.addEventListener('vite:preloadError', recoverPhoneChunk);
      export function loadPhoneStoryShell() {
        return import('./phone-story/PhoneStoryShell').catch((error) => {
          recoverPhoneChunk();
          throw error;
        });
      }
      export function markStable() {
        sessionStorage.removeItem(lineageStorageKey);
      }
    `
  }, { phase: 'cutover' }), 'must not retry the phone core import in the same Document');
});

test('rejects a missing provenance plugin or runtime consumption of its audit JSON', async () => {
  includes(await violations({
    'vite.config.ts':
      "export default { build: { minify: 'terser' } };\n"
  }), 'r5-module-provenance');
  includes(await violations({
    'src/production/phone-story/runtime.ts': `
      import report from '../../../../dist/audit/r5-module-provenance.json';
      export function createPhoneStoryRuntime() { return report; }
    `
  }), 'build-audit provenance');
});
