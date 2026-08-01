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

test('rejects test-only screenshot decoders from every emitted production chunk', () => {
  for (const moduleId of [
    'node_modules/pngjs/lib/png.js',
    'node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs/lib/png.js',
    'node_modules/@types/pngjs/index.d.ts'
  ]) {
    const report = validProvenance();
    report.chunks[2].modules.push(moduleId);
    report.chunks[2].modules.sort();
    includes(moduleProvenanceViolations(report, {
      chunkBytes: bytes()
    }), 'test-only screenshot decoder');
  }
});

test('exempts chunks already loaded by the dynamic parent from leaf transfer size', () => {
  const report = validProvenance();
  report.chunks[0].imports.push('assets/PhonePrelude.js');
  report.chunks[1].imports.push(
    'assets/PhonePrelude.js',
    'assets/PhoneRegistry.js'
  );
  report.chunks[1].dynamicImports = [];
  report.chunks.splice(
    1,
    0,
    chunk({
      fileName: 'assets/PhonePrelude.js',
      modules: ['app/src/runtime/shared.ts']
    }),
    chunk({
      fileName: 'assets/PhoneRegistry.js',
      dynamicImports: ['assets/PhoneHero.js'],
      modules: ['app/src/production/phone/module-loaders.ts']
    })
  );
  assert.deepEqual(moduleProvenanceViolations(report, {
    chunkBytes: bytes({
      'assets/PhonePrelude.js': DONOR_MAX_LAZY_LEAF_BYTES + 1000
    })
  }), []);
});

test('requires a shared chunk to be preloaded by every dynamic parent path', () => {
  const report = validProvenance();
  report.chunks[0].imports.push('assets/PhoneShared.js');
  report.chunks[1].imports.push('assets/PhoneShared.js');
  report.chunks.push(chunk({
    fileName: 'assets/PhoneAlternateParent.js',
    dynamicImports: ['assets/PhoneHero.js'],
    modules: ['app/src/production/phone/alternate-module-loader.ts']
  }));
  report.chunks.push(chunk({
    fileName: 'assets/PhoneShared.js',
    modules: ['app/src/runtime/shared.ts']
  }));
  report.chunks.sort((left, right) => (
    left.fileName < right.fileName ? -1 : left.fileName > right.fileName ? 1 : 0
  ));

  includes(moduleProvenanceViolations(report, {
    chunkBytes: bytes({
      'assets/PhoneAlternateParent.js': 1000,
      'assets/PhoneShared.js': DONOR_MAX_LAZY_LEAF_BYTES + 1
    })
  }), 'lazy phone leaf closure chunk');
});

test('stops preload ancestry at an entry instead of following a leaf cycle', () => {
  const report = validProvenance();
  report.chunks[0].imports.push(
    'assets/PhoneShared.js',
    'assets/index.js'
  );
  report.chunks[1].dynamicImports = [];
  report.chunks[2].dynamicImports = ['assets/PhoneModuleLoaders.js'];
  report.chunks.push(chunk({
    fileName: 'assets/PhoneModuleLoaders.js',
    dynamicImports: ['assets/PhoneHero.js'],
    modules: ['app/src/production/phone/module-loaders.ts']
  }));
  report.chunks.push(chunk({
    fileName: 'assets/PhoneShared.js',
    modules: ['app/src/runtime/shared.ts']
  }));
  report.chunks.sort((left, right) => (
    left.fileName < right.fileName ? -1 : left.fileName > right.fileName ? 1 : 0
  ));

  includes(moduleProvenanceViolations(report, {
    chunkBytes: bytes({
      'assets/PhoneModuleLoaders.js': 1000,
      'assets/PhoneShared.js': DONOR_MAX_LAZY_LEAF_BYTES + 1
    })
  }), 'lazy phone leaf closure chunk');
});

test('does not exempt root authority through a reverse cycle past an entry', () => {
  const report = validProvenance();
  report.chunks[0].imports.push('assets/index.js');
  report.chunks[0].modules.push('app/src/production/input-controller.ts');
  report.chunks[0].modules.sort();
  report.chunks[1].dynamicImports = [];
  report.chunks[2].dynamicImports = ['assets/PhoneModuleLoaders.js'];
  report.chunks.push(chunk({
    fileName: 'assets/PhoneModuleLoaders.js',
    dynamicImports: ['assets/PhoneHero.js'],
    modules: ['app/src/production/phone/module-loaders.ts']
  }));
  report.chunks.sort((left, right) => (
    left.fileName < right.fileName ? -1 : left.fileName > right.fileName ? 1 : 0
  ));

  includes(moduleProvenanceViolations(report, {
    chunkBytes: bytes({ 'assets/PhoneModuleLoaders.js': 1000 })
  }), 'lifecycle authority');
});

test('still rejects preloaded synchronous authority reachable from a leaf', () => {
  const report = validProvenance();
  report.chunks[0].imports.push('assets/PhoneSharedAuthority.js');
  report.chunks[1].imports.push('assets/PhoneSharedAuthority.js');
  report.chunks.splice(1, 0, chunk({
    fileName: 'assets/PhoneSharedAuthority.js',
    modules: ['app/src/production/input-controller.ts']
  }));
  includes(moduleProvenanceViolations(report, {
    chunkBytes: bytes({
      'assets/PhoneSharedAuthority.js': 1000
    })
  }), 'lifecycle authority');
});

test('rejects authority that is both a dynamic parent and a leaf dependency', () => {
  const report = validProvenance();
  report.chunks[0].imports.push('assets/PhoneStoryShell.js');
  includes(moduleProvenanceViolations(report, {
    chunkBytes: bytes()
  }), 'lifecycle authority');
});

test('does not classify a co-located stylesheet as lifecycle authority', () => {
  const report = validProvenance();
  report.chunks[0].modules.push(
    'app/src/production/phone/PhoneLabContactShell.css'
  );
  report.chunks[0].modules.sort();
  assert.deepEqual(moduleProvenanceViolations(report, {
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

test('rejects an oversized synchronous shared chunk in a lazy leaf closure', () => {
  const report = validProvenance();
  report.chunks[0].imports.push('assets/PhoneShared.js');
  report.chunks.splice(1, 0, chunk({
    fileName: 'assets/PhoneShared.js',
    modules: ['app/src/scenes/hero/phone/shared.ts']
  }));
  includes(moduleProvenanceViolations(report, {
    chunkBytes: bytes({
      'assets/PhoneShared.js': DONOR_MAX_LAZY_LEAF_BYTES + 1
    })
  }), 'lazy phone leaf closure chunk');
});

test('rejects an oversized general shared chunk newly fetched by a leaf', () => {
  const report = validProvenance();
  report.chunks[0].imports.push('assets/PhoneRuntimeShared.js');
  report.chunks.splice(1, 0, chunk({
    fileName: 'assets/PhoneRuntimeShared.js',
    modules: ['app/src/runtime/shared.ts']
  }));
  includes(moduleProvenanceViolations(report, {
    chunkBytes: bytes({
      'assets/PhoneRuntimeShared.js': DONOR_MAX_LAZY_LEAF_BYTES + 1
    })
  }), 'lazy phone leaf closure chunk');
});

test('rejects lifecycle authority in a transitive lazy leaf dependency', () => {
  const report = validProvenance();
  report.chunks[0].imports.push('assets/PhoneShared.js');
  report.chunks.splice(1, 0,
    chunk({
      fileName: 'assets/PhoneAuthority.js',
      modules: ['app/src/production/input-controller.ts']
    }),
    chunk({
      fileName: 'assets/PhoneShared.js',
      imports: ['assets/PhoneAuthority.js'],
      modules: ['app/src/scenes/hero/phone/shared.ts']
    })
  );
  report.chunks.sort((left, right) => (
    left.fileName < right.fileName ? -1 : left.fileName > right.fileName ? 1 : 0
  ));
  includes(moduleProvenanceViolations(report, {
    chunkBytes: bytes({
      'assets/PhoneAuthority.js': 1000,
      'assets/PhoneShared.js': 1000
    })
  }), 'lifecycle authority');
});

test('rejects a phone leaf module emitted into two lazy chunks', () => {
  const report = validProvenance();
  report.chunks.push(chunk({
    fileName: 'assets/PhoneHeroCopy.js',
    isDynamicEntry: true,
    facadeModuleId: 'app/src/scenes/hero/phone/PhoneHero.tsx',
    modules: ['app/src/scenes/hero/phone/PhoneHero.tsx']
  }));
  report.chunks.sort((left, right) => (
    left.fileName < right.fileName ? -1 : left.fileName > right.fileName ? 1 : 0
  ));
  includes(moduleProvenanceViolations(report, {
    chunkBytes: bytes({
      'assets/PhoneHeroCopy.js': DONOR_MAX_LAZY_LEAF_BYTES
    })
  }), 'emitted into multiple chunks');
});
