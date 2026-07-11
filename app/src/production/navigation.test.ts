import { describe, expect, it } from 'vitest';
import { canonicalSceneIds } from '../story/canonical-spine';
import { hashForScene, publicMenuItems, sceneFromHash } from './navigation';

describe('production navigation', () => {
  it('resolves every canonical scene hash', () => {
    for (const scene of canonicalSceneIds) {
      expect(sceneFromHash(hashForScene(scene))).toBe(scene);
    }
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
  });

  it('rejects retired and malformed hashes', () => {
    expect(sceneFromHash('#philosophy')).toBeUndefined();
    expect(sceneFromHash('#method-bottom')).toBeUndefined();
    expect(sceneFromHash('#%E0%A4%A')).toBeUndefined();
  });
});
