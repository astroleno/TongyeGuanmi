import { describe, expect, it } from 'vitest';
import {
  booleanDataContractViolations,
  cssBooleanDataAttributes,
  phonePresentationOwnershipViolations
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

  it('[Task 9] keeps presentation diagnostics in the projector and out of CSS authority rules', () => {
    const violations = phonePresentationOwnershipViolations({
      cssSources: [{
        file: 'scene.css',
        source: '[data-phone-authority-id="phone-authority-1"] {} [data-phone-group67-stage-active="true"] {}'
      }],
      runtimeSources: [{
        file: 'src/production/phone/PhoneBrandLabContinuation.tsx',
        source: [
          "root.dataset.phoneCursor = 'hold:brand';",
          "root.setAttribute('data-phone-surface-role', 'stable');",
          "root.dataset['phoneGroup45StageActive'] = true;"
        ].join('\n')
      }]
    });

    expect(violations).toEqual(expect.arrayContaining([
      'scene.css: CSS must not read phone authority diagnostics',
      'scene.css: group-local visibility attribute is forbidden (data-phone-group67-stage-active)',
      'src/production/phone/PhoneBrandLabContinuation.tsx: data-phone-cursor may only be written by phone-story-projector',
      'src/production/phone/PhoneBrandLabContinuation.tsx: data-phone-surface-role may only be written by surface/projector code',
      'src/production/phone/PhoneBrandLabContinuation.tsx: group-local visibility attribute is forbidden (data-phone-group45-stage-active)'
    ]));
  });

  it('[Task 9] permits only the projector and the isolated legacy validation shell writers', () => {
    expect(phonePresentationOwnershipViolations({
      cssSources: [],
      runtimeSources: [
        {
          file: 'src/production/phone/phone-story-projector.ts',
          source: [
            "data(root, 'phoneCursor', 'hold:brand');",
            "data(root, 'phoneSurfaceRole', 'stable');"
          ].join('\n')
        },
        {
          file: 'src/production/phone/PhoneLabContactShell.tsx',
          source: "root.dataset.portraitEdgeScene = 'lab';"
        }
      ]
    })).toEqual([]);
  });
});
