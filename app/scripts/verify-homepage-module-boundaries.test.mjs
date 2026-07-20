import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  phoneShellDebt,
  phoneShellCssDebt,
  phoneShellCssDebtViolations,
  phoneShellDebtViolations,
  scanPhoneShellCssDebt,
  scanPhoneShellDebt,
  shellZoneRendererImportViolations
} from './verify-homepage-module-boundaries.mjs';

const shellSource = readFileSync(
  new URL('../src/production/phone/PhoneStoryShell.tsx', import.meta.url),
  'utf8'
);
const shellCssSource = readFileSync(
  new URL('../src/production/phone/PhoneStoryShell.css', import.meta.url),
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
    expect(violationsFor(shellSource)).toEqual([]);
  });

  it('rejects a new shell-owned product media key', () => {
    const violations = violationsFor(
      `${shellSource}\nconst NEXT_MEDIA = phoneMediaUrlFor('new-media', 'hero');`
    );
    expect(violations).toContain('new shell-owned media key is forbidden (new-media)');
  });

  it('rejects media ownership hidden behind a non-literal key', () => {
    const violations = violationsFor(
      `${shellSource}\nconst NEXT_MEDIA = phoneMediaUrlFor(mediaId, 'hero');`
    );
    expect(violations).toContain(
      'shell media ownership calls must use literal product media IDs'
    );
  });

  it('rejects a new scene progress threshold but permits tuning an existing value', () => {
    const added = violationsFor(`${shellSource}\nconst PATTERN_FADE_END = 0.5;`);
    expect(added).toContain(
      'new shell-owned progress constant is forbidden (PATTERN_FADE_END)'
    );

    const tuned = shellSource.replace(
      'const PATTERN_MOTION_END = 0.47;',
      'const PATTERN_MOTION_END = 0.471;'
    );
    expect(violationsFor(tuned)).toEqual([]);
  });

  it('rejects another scene root and permits a migrated root to disappear', () => {
    const added = violationsFor(
      `${shellSource}\n<section className="portrait-scroll-spike__scene--figure2" />`
    );
    expect(added).toContain('new shell-owned scene root is forbidden (figure2)');

    const migrated = shellSource.replace(
      'portrait-scroll-spike__scene--pattern',
      'phone-scene--pattern'
    );
    expect(violationsFor(migrated)).toEqual([]);
  });

  it('rejects shell growth even when a new line avoids the named debt patterns', () => {
    expect(violationsFor(`${shellSource.trimEnd()}\nvoid 0;\n`)).toContain(
      `Unit 3 shell debt grew to ${phoneShellDebt.maxLines + 1} lines `
        + `(ratchet ${phoneShellDebt.maxLines})`
    );
  });

  it('ratchets the shell CSS asset, scene, owner, and line debts', () => {
    expect(cssViolationsFor(shellCssSource)).toEqual([]);
    expect(cssViolationsFor(
      `${shellCssSource.trimEnd()}\n.portrait-scroll-spike__scene--figure2 {}\n`
    )).toEqual(expect.arrayContaining([
      'new shell-owned CSS scene root is forbidden (figure2)',
      `Unit 3 shell CSS debt grew to ${phoneShellCssDebt.maxLines + 1} lines `
        + `(ratchet ${phoneShellCssDebt.maxLines})`
    ]));
    expect(cssViolationsFor(
      shellCssSource.replace(
        'url("../../../../assets/pattern-background.webp")',
        'url("../../../../assets/new-scene.webp")'
      )
    )).toContain(
      'new shell-owned CSS asset URL is forbidden (../../../../assets/new-scene.webp)'
    );
  });

  it('rejects moving renderer ownership into a new top-level phone helper', () => {
    expect(shellZoneRendererImportViolations(
      'hero-runtime.ts',
      '../../scenes/hero/motion'
    )).toContain(
      'new shell-zone renderer import is forbidden '
        + '(hero-runtime.ts -> ../../scenes/hero/motion)'
    );
    expect(shellZoneRendererImportViolations(
      'hero-motion.ts',
      '../../media/packed-alpha-video'
    )).toContain(
      'new shell-zone renderer import is forbidden '
        + '(hero-motion.ts -> ../../media/packed-alpha-video)'
    );
    expect(shellZoneRendererImportViolations(
      'phone-ink.ts',
      '../../transitions/shared/sceneInk'
    )).toEqual([]);
  });
});
