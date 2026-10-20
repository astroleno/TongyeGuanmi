import {describe, expect, it} from 'vitest';
import {localReleaseAssetPath, releaseBasePath} from './release-paths.mjs';

describe('release mount identity and emitted paths', () => {
  it('accepts only the two approved build mounts', () => {
    expect(releaseBasePath('')).toBe('/');
    expect(releaseBasePath('/experience/')).toBe('/experience/');
    for (const value of ['/experience', '//example.com/', 'https://example.com/', '/../', '/another/']) {
      expect(() => releaseBasePath(value)).toThrow();
    }
  });
  it('maps mount URLs to real emitted files without changing asset budgets', () => {
    expect(localReleaseAssetPath('/assets/entry.js', '/')).toBe('assets/entry.js');
    expect(localReleaseAssetPath('/experience/assets/entry.js', '/experience/')).toBe('assets/entry.js');
    expect(localReleaseAssetPath('/experience/assets/entry.css', '/experience/')).toBe('assets/entry.css');
  });
  it('does not silently accept a future homepage, sibling mount or external resource', () => {
    for (const href of ['/assets/entry.js', '/experience-other/assets/a.js', '//other.example/a.js', '/experience/%2e%2e%2fsecret']) {
      expect(() => localReleaseAssetPath(href, '/experience/')).toThrow();
    }
  });
});
