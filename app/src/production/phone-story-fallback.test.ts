import { afterEach, describe, expect, it, vi } from 'vitest';
import { revealStaticPhoneStoryFallback } from './phone-story-fallback';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('phone story fallback', () => {
  it('releases the preboot route and restores the static document', () => {
    const dataset: Record<string, string> = {
      portraitSpike: 'b',
      portraitSpikeMotion: 'force',
      portraitSpikePreboot: 'validation',
      portraitSpikeLoader: 'active',
      storyHydrated: 'true'
    };
    const styles = new Map([['--portrait-document-surface', '#07110e']]);
    let loaderRemoved = false;
    vi.stubGlobal('document', {
      documentElement: {
        dataset,
        style: {
          removeProperty(name: string) {
            styles.delete(name);
          }
        }
      },
      getElementById(id: string) {
        return id === 'story-loader-static'
          ? { remove: () => { loaderRemoved = true; } }
          : null;
      }
    });

    revealStaticPhoneStoryFallback('shell-error');

    expect(loaderRemoved).toBe(true);
    expect(dataset).toEqual({ phoneStoryFallback: 'shell-error' });
    expect(styles.has('--portrait-document-surface')).toBe(false);
  });
});
