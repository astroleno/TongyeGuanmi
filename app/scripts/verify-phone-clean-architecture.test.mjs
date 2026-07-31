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
  export function loadPhoneStoryShell() {
    window.addEventListener('vite:preloadError', () => undefined);
    sessionStorage.setItem(lineageStorageKey, JSON.stringify({
      lineageId: 'fixture-lineage',
      automaticReloadCount: 0
    }));
    return import('./phone-story/PhoneStoryShell');
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
