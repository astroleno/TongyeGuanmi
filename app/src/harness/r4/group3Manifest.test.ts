import { describe, expect, it } from 'vitest';
import { createR4Group3Manifest } from './group3Manifest';

describe('R4 group3 canonical Proof topology', () => {
  it('mounts one compound Proof hold with no internal transition nodes', () => {
    const manifest = createR4Group3Manifest('group3');

    expect(manifest.nodes.map((node) => (
      node.kind === 'hold' ? `hold:${node.scene}` : `segment:${node.id}`
    ))).toEqual([
      'hold:figure2-animation',
      'segment:figure2-distance-expand',
      'hold:figure2-proof',
      'segment:figure2-proof-brand',
      'hold:brand'
    ]);
    expect(manifest.nodes.some((node) => node.kind === 'hold' && [
      'figure2-proof-opening',
      'figure2-proof-cards',
      'figure2-proof-closing'
    ].includes(node.scene))).toBe(false);
    expect(manifest.nodes.some((node) => node.kind === 'segment' && [
      'figure2-proof-opening-cards',
      'figure2-proof-cards-closing'
    ].includes(node.id))).toBe(false);
  });
});
