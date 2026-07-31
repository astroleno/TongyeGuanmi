import assert from 'node:assert/strict';
import {
  booleanDataContractViolations,
  cssBooleanDataAttributes
} from './verify-boolean-data-contract.mjs';

const { test } = process.env.VITEST
  ? await import('vitest')
  : await import('node:test');

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
      file: 'scene.tsx',
      source: `
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
      file: 'scene.tsx',
      source: `
        <div data-ready={ready || semanticBoolean(false)} />
        <div data-visible={visible /* semanticBoolean(false) */} />
        <div data-loaded={String(semanticBoolean(loaded))} />
      `
    }]
  }), [
    'scene.tsx: data-loaded must use semanticBoolean(...) or a textual literal',
    'scene.tsx: data-ready must use semanticBoolean(...) or a textual literal',
    'scene.tsx: data-visible must use semanticBoolean(...) or a textual literal'
  ]);
});
