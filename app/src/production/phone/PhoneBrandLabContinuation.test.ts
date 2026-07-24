import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  phoneGroup45DirectEntryCanPosition,
  phoneGroup45EntryPresentation
} from './PhoneBrandLabContinuation';

const source = readFileSync(
  new URL('./PhoneBrandLabContinuation.tsx', import.meta.url),
  'utf8'
);

describe('PhoneBrandLabContinuation direct entry presentation', () => {
  it.each([
    ['brand', 'brand-reading', 'brand'],
    ['figure3-animation', 'figure3-stage', 'figure3'],
    ['services', 'services-reading', 'services'],
    ['ttg-animation', 'ttg-stage', 'ttg'],
    ['lab', 'lab-stable', 'lab']
  ] as const)(
    'publishes the semantic checkpoint and edge for %s',
    (scene, checkpoint, edgeScene) => {
      expect(phoneGroup45EntryPresentation(scene)).toEqual({
        checkpoint,
        edgeScene
      });
    }
  );

  it('positions only after the authored Loader has released the shell', () => {
    expect(phoneGroup45DirectEntryCanPosition(undefined)).toBe(false);
    expect(phoneGroup45DirectEntryCanPosition('active')).toBe(false);
    expect(phoneGroup45DirectEntryCanPosition('ready')).toBe(true);
  });

  it('prepares a real receiver frame and never commits media failure', () => {
    expect(source).toContain('runPhoneTargetPreparation');
    expect(source).toContain("'preparing-target'");
    expect(source).toContain("'retryable'");
    expect(source).not.toContain("'media-failure'");
    expect(source).not.toContain('failedVisualsRef');
    expect(
      source.match(/if \(!adapters\.entryReady\) return;/g)
    ).toHaveLength(1);
  });
});
