import assert from 'node:assert/strict';
import {
  DONOR_MAX_LAZY_LEAF_BYTES,
  moduleProvenanceViolations
} from './verify-release-build.mjs';

const { test } = process.env.VITEST
  ? await import('vitest')
  : await import('node:test');

function chunk(overrides) {
  return {
    fileName: 'assets/index.js',
    isEntry: false,
    isDynamicEntry: false,
    facadeModuleId: null,
    imports: [],
    dynamicImports: [],
    modules: [],
    ...overrides
  };
}

function validProvenance() {
  return {
    schemaVersion: 1,
    chunks: [
      chunk({
        fileName: 'assets/PhoneHero.js',
        isDynamicEntry: true,
        facadeModuleId: 'app/src/scenes/hero/phone/PhoneHero.tsx',
        modules: ['app/src/scenes/hero/phone/PhoneHero.tsx']
      }),
      chunk({
        fileName: 'assets/PhoneStoryShell.js',
        isDynamicEntry: true,
        facadeModuleId:
          'app/src/production/phone-story/PhoneStoryShell.tsx',
        dynamicImports: ['assets/PhoneHero.js'],
        modules: [
          'app/src/production/phone-story/PhoneStoryShell.tsx',
          'app/src/production/phone-story/machine.ts',
          'app/src/production/phone-story/manifest.ts',
          'app/src/production/phone-story/presentation.ts',
          'app/src/production/phone-story/protocol.ts',
          'app/src/production/phone-story/runtime.ts'
        ]
      }),
      chunk({
        fileName: 'assets/index.js',
        isEntry: true,
        dynamicImports: ['assets/PhoneStoryShell.js'],
        modules: ['app/src/main.tsx']
      })
    ]
  };
}

function bytes(overrides = {}) {
  return new Map([
    ['assets/index.js', 1000],
    ['assets/PhoneHero.js', DONOR_MAX_LAZY_LEAF_BYTES],
    ['assets/PhoneStoryShell.js', 2000],
    ...Object.entries(overrides)
  ]);
}

function includes(found, expected) {
  assert.ok(
    found.some((violation) => violation.includes(expected)),
    `Expected a violation containing ${JSON.stringify(expected)}:\n${found.join('\n')}`
  );
}

test('accepts a deterministic modules report with one synchronous core and lazy leaf', () => {
  assert.deepEqual(moduleProvenanceViolations(validProvenance(), {
    chunkBytes: bytes()
  }), []);
});

test('rejects a missing or malformed provenance report', () => {
  includes(moduleProvenanceViolations(null), 'missing');
  includes(moduleProvenanceViolations({ schemaVersion: 2, chunks: [] }), 'schemaVersion');
  const malformed = validProvenance();
  malformed.chunks[1].modules.reverse();
  includes(moduleProvenanceViolations(malformed), 'sorted');
});

test('rejects a production module emitted into multiple chunks', () => {
  const report = validProvenance();
  report.chunks[0].modules.push(
    'app/src/production/phone-story/protocol.ts'
  );
  report.chunks[0].modules.sort();
  includes(moduleProvenanceViolations(report, {
    chunkBytes: bytes()
  }), 'emitted into multiple chunks');
});

test('rejects a visual leaf that becomes eager with the phone execution core', () => {
  const report = validProvenance();
  report.chunks[1].modules.push(
    'app/src/scenes/hero/phone/PhoneHero.tsx'
  );
  report.chunks[1].modules.sort();
  includes(moduleProvenanceViolations(report, {
    chunkBytes: bytes()
  }), 'eager phone leaf');
});

test('rejects lifecycle authority inside a lazy leaf chunk', () => {
  const report = validProvenance();
  report.chunks[1].modules = report.chunks[1].modules.filter(
    (moduleId) => !moduleId.endsWith('/runtime.ts')
  );
  report.chunks[0].modules.push(
    'app/src/production/phone-story/runtime.ts'
  );
  report.chunks[0].modules.sort();
  includes(moduleProvenanceViolations(report, {
    chunkBytes: bytes()
  }), 'lifecycle authority');
});

test('rejects a lazy visual leaf above the frozen donor maximum', () => {
  includes(moduleProvenanceViolations(validProvenance(), {
    chunkBytes: bytes({
      'assets/PhoneHero.js': DONOR_MAX_LAZY_LEAF_BYTES + 1
    })
  }), 'lazy phone leaf chunk');
});
