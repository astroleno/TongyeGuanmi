import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  phoneGroup45DocumentFlags,
  phoneGroup45EntryFromHash
} from './PhoneBrandLabStory';

const source = readFileSync(
  new URL('./PhoneBrandLabStory.tsx', import.meta.url),
  'utf8'
);

describe('PhoneBrandLabStory', () => {
  it('starts scope hashes at the requested group chapter without earlier media', () => {
    expect(phoneGroup45EntryFromHash('#services')).toBe('services');
    expect(phoneGroup45EntryFromHash('#lab')).toBe('lab');
    expect(phoneGroup45EntryFromHash('#method')).toBe('brand');
  });

  it('releases the desktop document overflow lock in both motion modes', () => {
    expect(phoneGroup45DocumentFlags(false)).toEqual({
      portraitSpike: 'b',
      portraitSpikeMotion: 'force'
    });
    expect(phoneGroup45DocumentFlags(true)).toEqual({
      portraitSpike: 'b',
      portraitSpikeMotion: 'reduce'
    });
  });

  it('[Task 2] does not retain an independent QA presentation lifecycle', () => {
    expect(source).not.toContain('const [entryScene, setEntryScene]');
    expect(source).not.toContain('const [currentScene, setCurrentScene]');
    expect(source).not.toContain('const [stageScene, setStageScene]');
    expect(source).not.toContain('usePhoneEdgeSurface');
    expect(source).not.toContain('onPresentation: publishPresentation');
    expect(source).toContain("scope: 'brand-lab'");
    expect(source).toContain('usePhoneStoryNavigationRuntime(authority.port, true)');
  });
});
