import { describe, expect, it } from 'vitest';
import {
  booleanDataContractViolations,
  cssBooleanDataAttributes
} from './verify-boolean-data-contract.mjs';

describe('CSS boolean data-attribute build contract', () => {
  it('discovers attributes selected through textual true/false values', () => {
    expect(cssBooleanDataAttributes(`
      [data-visible="true"] {}
      [data-stage-active='false'] {}
      [data-scene="hero"] {}
    `)).toEqual(new Set(['stage-active', 'visible']));
  });

  it('rejects integer boolean compression and unsafe CSS-contract writers', () => {
    expect(booleanDataContractViolations({
      viteSource: 'compress: { booleans_as_integers: true }',
      cssSources: [{
        file: 'scene.css',
        source: '[data-visible="true"] {}'
      }],
      runtimeSources: [{
        file: 'scene.tsx',
        source: '<div data-visible={String(active)} />'
      }]
    })).toEqual([
      'vite.config.ts: booleans_as_integers must not be enabled',
      'scene.tsx: data-visible must use semanticBoolean(...) or a textual literal'
    ]);
  });

  it('accepts the shared semantic writer and textual literals', () => {
    expect(booleanDataContractViolations({
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
    })).toEqual([]);
  });
});
