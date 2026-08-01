import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  phoneShellDebt,
  phoneShellCssDebt,
  phoneShellCssDebtViolations,
  phoneShellDebtViolations,
  scanPhoneShellCssDebt,
  scanPhoneShellDebt,
  shellZoneRendererImportViolations
} from './verify-homepage-module-boundaries.mjs';

const { describe, it } = process.env.VITEST
  ? await import('vitest')
  : await import('node:test');

const shellSource = readFileSync(
  new URL('../src/production/phone/PhoneStoryShell.tsx', import.meta.url),
  'utf8'
);
const shellCssSource = readFileSync(
  new URL('../src/production/phone/PhoneStoryShell.css', import.meta.url),
  'utf8'
);
const boundaryGateSource = readFileSync(
  new URL('./verify-homepage-module-boundaries.mjs', import.meta.url),
  'utf8'
);

function violationsFor(source) {
  return phoneShellDebtViolations(scanPhoneShellDebt(source));
}

function cssViolationsFor(source) {
  return phoneShellCssDebtViolations(scanPhoneShellCssDebt(source));
}

describe('homepage phone-shell debt ratchet', () => {
  it('accepts the frozen Unit 3 baseline', () => {
    assert.deepEqual(violationsFor(shellSource), []);
  });

  it('rejects a new shell-owned product media key', () => {
    const violations = violationsFor(
      `${shellSource}\nconst NEXT_MEDIA = phoneMediaUrlFor('new-media', 'hero');`
    );
    assert.ok(violations.includes('new shell-owned media key is forbidden (new-media)'));
  });

  it('rejects media ownership hidden behind a non-literal key', () => {
    const violations = violationsFor(
      `${shellSource}\nconst NEXT_MEDIA = phoneMediaUrlFor(mediaId, 'hero');`
    );
    assert.ok(violations.includes(
      'shell media ownership calls must use literal product media IDs'
    ));
  });

  it('rejects a new scene progress threshold but permits tuning an existing value', () => {
    const added = violationsFor(`${shellSource}\nconst PATTERN_FADE_END = 0.5;`);
    assert.ok(added.includes(
      'new shell-owned progress constant is forbidden (PATTERN_FADE_END)'
    ));

    const tuned = shellSource.replace(
      'const PATTERN_MOTION_END = 0.47;',
      'const PATTERN_MOTION_END = 0.471;'
    );
    assert.deepEqual(violationsFor(tuned), []);
  });

  it('rejects another scene root and permits a migrated root to disappear', () => {
    const added = violationsFor(
      `${shellSource}\n<section className="portrait-scroll-spike__scene--figure2" />`
    );
    assert.ok(added.includes('new shell-owned scene root is forbidden (figure2)'));

    const migrated = shellSource.replace(
      'portrait-scroll-spike__scene--star',
      'phone-scene--star'
    );
    assert.deepEqual(violationsFor(migrated), []);
  });

  it('rejects shell growth even when a new line avoids the named debt patterns', () => {
    assert.ok(violationsFor(`${shellSource.trimEnd()}\nvoid 0;\n`).includes(
      `Unit 3 shell debt grew to ${phoneShellDebt.maxLines + 1} lines `
        + `(ratchet ${phoneShellDebt.maxLines})`
    ));
  });

  it('ratchets the shell CSS asset, scene, owner, and line debts', () => {
    assert.deepEqual(cssViolationsFor(shellCssSource), []);
    const sceneViolations = cssViolationsFor(
      `${shellCssSource.trimEnd()}\n.portrait-scroll-spike__scene--figure2 {}\n`
    );
    for (const expected of [
      'new shell-owned CSS scene root is forbidden (figure2)',
      `Unit 3 shell CSS debt grew to ${phoneShellCssDebt.maxLines + 1} lines `
        + `(ratchet ${phoneShellCssDebt.maxLines})`
    ]) {
      assert.ok(sceneViolations.includes(expected));
    }
    assert.ok(cssViolationsFor(
      `${shellCssSource}\n.extra { background: url("../../../../assets/new-scene.webp"); }\n`
    ).includes(
      'new shell-owned CSS asset URL is forbidden (../../../../assets/new-scene.webp)'
    ));
  });

  it('rejects moving renderer ownership into a new top-level phone helper', () => {
    assert.ok(shellZoneRendererImportViolations(
      'hero-runtime.ts',
      '../../scenes/hero/motion'
    ).includes(
      'new shell-zone renderer import is forbidden '
        + '(hero-runtime.ts -> ../../scenes/hero/motion)'
    ));
    assert.ok(shellZoneRendererImportViolations(
      'hero-motion.ts',
      '../../media/packed-alpha-video'
    ).includes(
      'new shell-zone renderer import is forbidden '
        + '(hero-motion.ts -> ../../media/packed-alpha-video)'
    ));
    assert.deepEqual(shellZoneRendererImportViolations(
      'phone-ink.ts',
      '../../transitions/shared/sceneInk'
    ), []);
    assert.deepEqual(shellZoneRendererImportViolations(
      'module-loaders.ts',
      '../../scenes/hero/phone/PhoneHero'
    ), []);
    assert.deepEqual(shellZoneRendererImportViolations(
      'hero-motion.ts',
      '../../scenes/hero/phone/PhoneHero.motion'
    ), []);
    assert.deepEqual(shellZoneRendererImportViolations(
      'module-loaders.ts',
      '../../scenes/pattern/phone/PhonePattern'
    ), []);
    assert.ok(shellZoneRendererImportViolations(
      'module-loaders.ts',
      '../../scenes/hero/phone/rogue-Hero'
    ).length > 0);
    assert.ok(shellZoneRendererImportViolations(
      'module-loaders.ts',
      '../../scenes/pattern/phone/rogue-Pattern'
    ).length > 0);
  });

  it('delegates the canonical phone graph to the clean architecture verifier', () => {
    assert.ok(boundaryGateSource.includes(
      "import { phoneCleanArchitectureViolations } "
        + "from './verify-phone-clean-architecture.mjs';"
    ));
    assert.ok(boundaryGateSource.includes(
      "phoneCleanArchitectureViolations({\n  appRoot: appDir,\n  phase: 'harness'"
    ));
  });
});
