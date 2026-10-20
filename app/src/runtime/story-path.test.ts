import {describe, expect, it} from 'vitest';
import {storyLocalPath, storyPath} from './story-path';

describe('compiled story mount', () => {
  it('preserves root development URLs', () => {
    expect(storyPath('', '/')).toBe('/');
    expect(storyPath('brand-lab', '/')).toBe('/brand-lab');
    expect(storyLocalPath('/brand-lab', '/')).toBe('/brand-lab');
  });
  it('pins navigation and recovery resources to the independent story namespace', () => {
    expect(storyPath('', '/experience/')).toBe('/experience/');
    expect(storyPath('r5-release-manifest.json', '/experience/')).toBe('/experience/r5-release-manifest.json');
    expect(storyLocalPath('/experience/', '/experience/')).toBe('/');
    expect(storyLocalPath('/experience/index.html', '/experience/')).toBe('/index.html');
    expect(storyLocalPath('/experience/brand-lab', '/experience/')).toBe('/brand-lab');
  });
  it('does not claim the future homepage or a similarly named sibling route', () => {
    for (const pathname of ['/', '/brand-lab', '/experience', '/experience-other/', '/experiences/']) {
      expect(storyLocalPath(pathname, '/experience/')).toBeNull();
    }
  });
});
