import { describe, expect, it } from 'vitest';
import { canonicalSceneIds } from '../story/canonical-spine';
import {
  figure2ProofPanelFromHash,
  hashForScene,
  publicMenuItems,
  sceneFromHash
} from './navigation';

describe('production navigation', () => {
  it('resolves every canonical scene hash', () => {
    for (const scene of canonicalSceneIds.filter((scene) => scene !== 'method-bottom')) {
      expect(sceneFromHash(hashForScene(scene))).toBe(scene);
    }
  });

  it('redirects retired Proof scene ids to the compound hold and preserves panel anchors', () => {
    expect(sceneFromHash('#figure2-proof-opening')).toBe('figure2-proof');
    expect(sceneFromHash('#figure2-proof-cards')).toBe('figure2-proof');
    expect(sceneFromHash('#figure2-proof-closing')).toBe('figure2-proof');
    expect(figure2ProofPanelFromHash('#figure2-proof-opening')).toBe('opening');
    expect(figure2ProofPanelFromHash('#figure2-proof-cards')).toBe('cards');
    expect(figure2ProofPanelFromHash('#figure2-proof-closing')).toBe('closing');
  });

  it('keeps crawlable public anchor aliases meaningful', () => {
    expect(sceneFromHash('#home')).toBe('hero');
    expect(sceneFromHash('#method')).toBe('method-top');
    expect(sceneFromHash('#services')).toBe('services');
    expect(sceneFromHash('#education')).toBe('education');
    expect(sceneFromHash('#contact')).toBe('contact');
    expect(publicMenuItems.map(({ hash }) => hash)).toEqual([
      '#home', '#method', '#services', '#education', '#contact'
    ]);
    expect(hashForScene('hero')).toBe('#home');
    expect(hashForScene('method-top')).toBe('#method');
    expect(hashForScene('method-bottom')).toBe('#method');
  });

  it('rejects retired and malformed hashes', () => {
    expect(sceneFromHash('#philosophy')).toBeUndefined();
    expect(sceneFromHash('#method-bottom')).toBeUndefined();
    expect(sceneFromHash('#%E0%A4%A')).toBeUndefined();
  });
});
