import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import migrationInventory from '../../../docs/react-refactor/inventory/migration-inventory.json';
import interruptibleCandidates from '../../../docs/react-refactor/inventory/interruptible-candidates.json';
import copyReference from '../../../docs/react-refactor/inventory/copy-reference.json';
import {
  parseFigure2ProofSequenceMarkdown,
  parseInterruptibleCandidates,
  parseInventoryManifestSeed
} from './inventory-schema';

describe('R-1 inventory schema bridge', () => {
  it('parses R-1 JSON through the schema bridge', () => {
    const seed = parseInventoryManifestSeed({
      migrationInventory,
      interruptibleCandidates,
      copyReference
    });

    expect(seed.transitions.some((transition) => transition.segmentIds.includes('figure2-distance-expand'))).toBe(true);
    expect(seed.interruptibleSegmentIds).toEqual([]);
    expect(seed.copySections.some((section) => section.canonicalScenes.includes('hero'))).toBe(true);
  });

  it('rejects interruptible ids that did not pass canonical validation', () => {
    expect(() =>
      parseInterruptibleCandidates({ interruptibleCandidates: ['belief-star'] })
    ).toThrow(/canonical SegmentId/);
  });

  it('validates the Figure2 proof markdown evidence', () => {
    const markdown = readFileSync(
      resolve(process.cwd(), '../docs/react-refactor/inventory/figure2-proof-sequence.md'),
      'utf8'
    );

    expect(parseFigure2ProofSequenceMarkdown(markdown)).toEqual({
      segmentId: 'figure2-distance-expand',
      proofScenes: ['figure2-proof-opening', 'figure2-proof-cards', 'figure2-proof-closing'],
      stageStops: [0.72],
      stagePlayMs: [2600, 1500],
      postScrollVh: 56
    });
  });

  it('rejects incomplete Figure2 proof evidence', () => {
    expect(() => parseFigure2ProofSequenceMarkdown('figure2-distance-expand only')).toThrow(/missing/);
  });
});
